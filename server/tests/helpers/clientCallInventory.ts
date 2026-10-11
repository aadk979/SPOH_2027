import ts from 'typescript';
import path from 'node:path';

export interface ClientCall {
  method: string;
  path: string;
  source: string;
  line: number;
}
type Bindings = Map<ts.Symbol, ts.Expression>;
const UNKNOWN = ':dynamic';

/** Read source syntax, never execute client code or admit transport-wide wildcard paths. */
export function clientCallInventory(repositoryRoot: string): ClientCall[] {
  const configFile = ts.readConfigFile(
    path.join(repositoryRoot, 'client/tsconfig.json'),
    ts.sys.readFile,
  );
  if (configFile.error) throw new Error('Could not read client TypeScript configuration');
  const config = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    path.join(repositoryRoot, 'client'),
  );
  const program = ts.createProgram(config.fileNames, config.options);
  const checker = program.getTypeChecker();
  const root = path.join(repositoryRoot, 'client/src').replaceAll('\\', '/');
  const files = program
    .getSourceFiles()
    .filter((file) => file.fileName.replaceAll('\\', '/').startsWith(root + '/'));
  const calls: ClientCall[] = [];
  const wrappers = new Set<ts.FunctionLikeDeclaration>();
  const terminals = new Set([
    'eventApi',
    'api',
    'apiBlob',
    'fetch',
    'capture',
    'enqueue',
    'sendOrQueue',
  ]);
  const symbolOf = (node: ts.Node) => {
    let symbol = checker.getSymbolAtLocation(node);
    if (symbol && symbol.flags & ts.SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol);
    return symbol;
  };
  const initializerOf = (node: ts.Node, bindings: Bindings): ts.Expression | undefined => {
    const symbol = symbolOf(node);
    if (symbol && bindings.has(symbol)) return bindings.get(symbol);
    const declaration = symbol?.valueDeclaration;
    return declaration &&
      (ts.isVariableDeclaration(declaration) || ts.isPropertyAssignment(declaration))
      ? declaration.initializer
      : undefined;
  };
  const functionOf = (node: ts.Node): ts.FunctionLikeDeclaration | undefined => {
    const declaration = symbolOf(node)?.valueDeclaration;
    if (declaration && ts.isFunctionDeclaration(declaration)) return declaration;
    const value = initializerOf(node, new Map());
    return value && (ts.isArrowFunction(value) || ts.isFunctionExpression(value))
      ? value
      : undefined;
  };
  const returnsOf = (fn: ts.FunctionLikeDeclaration): ts.Expression[] => {
    if (!fn.body) return [];
    if (!ts.isBlock(fn.body)) return [fn.body];
    const found: ts.Expression[] = [];
    const visit = (node: ts.Node) => {
      if (ts.isReturnStatement(node) && node.expression) found.push(node.expression);
      else if (!ts.isFunctionLike(node)) ts.forEachChild(node, visit);
    };
    ts.forEachChild(fn.body, visit);
    return found;
  };
  const bind = (fn: ts.FunctionLikeDeclaration, call: ts.CallExpression, bindings: Bindings) => {
    const next = new Map(bindings);
    fn.parameters.forEach((parameter, index) => {
      const symbol = symbolOf(parameter.name);
      const argument = call.arguments[index];
      if (symbol && argument) next.set(symbol, argument);
    });
    return next;
  };
  const literalType = (node: ts.Node): string[] => {
    const type = checker.getTypeAtLocation(node);
    const types = type.isUnion() ? type.types : [type];
    const literals = types
      .filter((item): item is ts.StringLiteralType => item.isStringLiteral())
      .map((item) => item.value);
    return literals.length === types.length ? literals : [UNKNOWN];
  };
  const property = (
    node: ts.Expression,
    name: string,
    bindings: Bindings,
    depth: number,
  ): string[] => {
    if (depth > 15) return [UNKNOWN];
    if (ts.isAsExpression(node) || ts.isParenthesizedExpression(node))
      return property(node.expression, name, bindings, depth + 1);
    if (ts.isObjectLiteralExpression(node)) {
      // A later spread can replace an earlier literal property.
      for (const entry of [...node.properties].reverse()) {
        if (ts.isSpreadAssignment(entry)) {
          const values = property(entry.expression, name, bindings, depth + 1);
          if (values.length) return values;
        } else if (entry.name?.getText().replaceAll("'", '').replaceAll('"', '') === name) {
          if (ts.isPropertyAssignment(entry))
            return evaluate(entry.initializer, bindings, depth + 1);
          return ts.isShorthandPropertyAssignment(entry)
            ? evaluate(entry.name, bindings, depth + 1)
            : [UNKNOWN];
        }
      }
      return [];
    }
    if (ts.isConditionalExpression(node))
      return [
        ...property(node.whenTrue, name, bindings, depth + 1),
        ...property(node.whenFalse, name, bindings, depth + 1),
      ];
    if (ts.isElementAccessExpression(node)) {
      return evaluate(node.argumentExpression, bindings, depth + 1).flatMap((key) => {
        const object = initializerOf(node.expression, bindings);
        if (!object || !ts.isObjectLiteralExpression(object)) return [UNKNOWN];
        return object.properties.flatMap((entry) =>
          entry.name?.getText().replaceAll("'", '').replaceAll('"', '') === key &&
          ts.isPropertyAssignment(entry)
            ? property(entry.initializer, name, bindings, depth + 1)
            : [],
        );
      });
    }
    if (ts.isCallExpression(node)) {
      const fn = functionOf(node.expression);
      return fn
        ? returnsOf(fn).flatMap((returned) =>
            property(returned, name, bind(fn, node, bindings), depth + 1),
          )
        : [UNKNOWN];
    }
    const initializer = initializerOf(node, bindings);
    return initializer ? property(initializer, name, bindings, depth + 1) : [UNKNOWN];
  };
  const join = (left: string[], right: string[]) => left.flatMap((a) => right.map((b) => a + b));
  function evaluate(node: ts.Expression | undefined, bindings: Bindings, depth = 0): string[] {
    if (!node || depth > 15) return [UNKNOWN];
    if (ts.isStringLiteralLike(node)) return [node.text];
    if (ts.isAsExpression(node) || ts.isParenthesizedExpression(node) || ts.isAwaitExpression(node))
      return evaluate(node.expression, bindings, depth + 1);
    if (ts.isTemplateExpression(node))
      return node.templateSpans.reduce(
        (values, span) =>
          join(values, evaluate(span.expression, bindings, depth + 1)).map(
            (value) => value + span.literal.text,
          ),
        [node.head.text],
      );
    if (ts.isConditionalExpression(node))
      return [
        ...evaluate(node.whenTrue, bindings, depth + 1),
        ...evaluate(node.whenFalse, bindings, depth + 1),
      ];
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken)
      return join(
        evaluate(node.left, bindings, depth + 1),
        evaluate(node.right, bindings, depth + 1),
      );
    if (ts.isPropertyAccessExpression(node)) {
      const direct = initializerOf(node, bindings);
      const result = direct
        ? evaluate(direct, bindings, depth + 1)
        : property(node.expression, node.name.text, bindings, depth + 1);
      return result.every((value) => value === UNKNOWN) ? literalType(node) : result;
    }
    if (ts.isCallExpression(node)) {
      if (node.expression.getText() === 'encodeURIComponent')
        return evaluate(node.arguments[0], bindings, depth + 1);
      if (node.expression.getText() === 'eventApiPath')
        return evaluate(node.arguments[1], bindings, depth + 1);
      const fn = functionOf(node.expression);
      return fn
        ? returnsOf(fn).flatMap((returned) =>
            evaluate(returned, bind(fn, node, bindings), depth + 1),
          )
        : literalType(node);
    }
    const initializer = initializerOf(node, bindings);
    return initializer ? evaluate(initializer, bindings, depth + 1) : literalType(node);
  }
  const requestMethods = (
    options: ts.Expression | undefined,
    bindings: Bindings,
    depth = 0,
  ): string[] => {
    if (depth > 15) return [UNKNOWN];
    if (!options || checker.getTypeAtLocation(options).flags & ts.TypeFlags.Undefined)
      return ['GET'];
    if (ts.isAsExpression(options) || ts.isParenthesizedExpression(options))
      return requestMethods(options.expression, bindings, depth + 1);
    if (ts.isConditionalExpression(options))
      return [
        ...requestMethods(options.whenTrue, bindings, depth + 1),
        ...requestMethods(options.whenFalse, bindings, depth + 1),
      ];
    const initializer = initializerOf(options, bindings);
    if (initializer) return requestMethods(initializer, bindings, depth + 1);
    const methods = property(options, 'method', bindings, 0);
    return methods.length ? methods : ['GET'];
  };
  const record = (node: ts.Node, method: string, raw: string) => {
    let route = raw.includes('/api/v1')
      ? raw.slice(raw.indexOf('/api/v1') + '/api/v1'.length)
      : raw;
    route = route
      .replace(/^\/events\/:dynamic\//, '/')
      .split('?')[0]!
      .replace(/\/:dynamic$/, '/:dynamic');
    if (
      !route.startsWith('/') ||
      route === '/' ||
      !['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method)
    )
      return;
    const file = node.getSourceFile();
    calls.push({
      method,
      path: route,
      source: path.relative(repositoryRoot, file.fileName).replaceAll('\\', '/'),
      line: file.getLineAndCharacterOfPosition(node.getStart()).line + 1,
    });
  };
  const transport = (call: ts.CallExpression, bindings: Bindings, evidence: ts.Node) => {
    const name = call.expression.getText();
    let paths: string[];
    let methods: string[];
    if (['capture', 'enqueue', 'sendOrQueue'].includes(name)) {
      const input = call.arguments[0];
      if (!input) return;
      paths = property(input, name === 'capture' ? 'endpoint' : 'path', bindings, 0);
      methods = ['POST'];
    } else {
      paths = evaluate(call.arguments[name === 'eventApi' ? 1 : 0], bindings);
      methods = requestMethods(call.arguments[name === 'eventApi' ? 2 : 1], bindings);
    }
    for (const method of methods) for (const endpoint of paths) record(evidence, method, endpoint);
  };
  // Only expand local wrappers containing an actual transport call, never arbitrary React helpers.
  for (const file of files) {
    const visit = (node: ts.Node) => {
      if (ts.isCallExpression(node) && terminals.has(node.expression.getText())) {
        let parent: ts.Node | undefined = node.parent;
        while (parent && !ts.isFunctionLike(parent)) parent = parent.parent;
        if (parent && ts.isFunctionLike(parent)) wrappers.add(parent as ts.FunctionLikeDeclaration);
      }
      ts.forEachChild(node, visit);
    };
    visit(file);
  }
  for (const file of files) {
    const visit = (node: ts.Node) => {
      if (ts.isCallExpression(node)) {
        if (terminals.has(node.expression.getText())) transport(node, new Map(), node);
        else {
          const wrapper = functionOf(node.expression);
          if (wrapper && wrappers.has(wrapper) && wrapper.body) {
            const bindings = bind(wrapper, node, new Map());
            const read = (inner: ts.Node) => {
              if (ts.isCallExpression(inner) && terminals.has(inner.expression.getText()))
                transport(inner, bindings, node);
              else ts.forEachChild(inner, read);
            };
            read(wrapper.body);
          }
        }
      }
      if (ts.isNewExpression(node) && node.expression.getText() === 'URL')
        for (const value of evaluate(node.arguments?.[0], new Map())) record(node, 'GET', value);
      if (
        ts.isJsxAttribute(node) &&
        node.name.getText() === 'href' &&
        node.initializer &&
        ts.isJsxExpression(node.initializer)
      )
        for (const value of evaluate(node.initializer.expression, new Map()))
          if (value.includes('/api/v1/')) record(node, 'GET', value);
      ts.forEachChild(node, visit);
    };
    visit(file);
  }
  return calls;
}

export function callCoversRoute(call: ClientCall, route: string): boolean {
  const [method, routePath] = route.split(' ');
  if (method !== call.method || !routePath) return false;
  const actual = call.path.split('/');
  const expected = routePath.split('/');
  return (
    expected.length === actual.length &&
    expected.every((segment, index) =>
      segment.startsWith(':')
        ? actual[index] === ':dynamic' || !!actual[index]
        : segment === actual[index],
    )
  );
}
