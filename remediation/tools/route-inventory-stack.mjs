export function nameOf(fn) {
  return fn?.name && fn.name !== 'anonymous' ? fn.name : '<anonymous>';
}

export function isRouter(layer) {
  return Array.isArray(layer.handle?.stack);
}

function joinPath(prefix, path) {
  const joined = `${prefix}/${path}`.replace(/\/+/g, '/');
  return joined.length > 1 ? joined.replace(/\/$/, '') : joined;
}

function applies(scope, route) {
  const wanted = scope.split('/').filter(Boolean);
  const actual = route.split('/').filter(Boolean);
  return wanted.length <= actual.length && wanted.every((part, index) => part.startsWith(':') || part === actual[index]);
}

function routeRows(layer, prefix, chain, routes, options) {
  const path = joinPath(prefix, layer.route.path);
  const handlers = layer.route.stack.map((entry) => nameOf(entry.handle));
  const middleware = [...chain.filter((entry) => applies(entry.scope, path)).map((entry) => entry.name), ...handlers.slice(0, -1)];
  const authorization = middleware.map((name) => /^authorize\((.+)\)$/.exec(name)?.[1]).filter(Boolean);
  const capability = middleware.map((name) => /^requireCapability\((.+)\)$/.exec(name)?.[1]).find(Boolean) ?? null;
  const requestSchemas = Object.assign({}, ...layer.route.stack.map((entry) => options.validation?.(entry.handle) ?? {}));
  for (const method of Object.keys(layer.route.methods).filter((key) => layer.route.methods[key]))
    routes.push({ method: method.toUpperCase(), path, middleware, capability, authorization, requestSchemas });
}

/** A preceding router's use layers still run when no route in that router matches. */
function passthrough(stack, prefix) {
  return stack.flatMap((layer) => {
    if (layer.route) return [];
    const scope = joinPath(prefix, layer.mountPath ?? '/');
    return isRouter(layer) ? passthrough(layer.handle.stack, scope) : [{ scope, name: nameOf(layer.handle) }];
  });
}

/** Mount-specific middleware affects matching subsequent routes only, including inherited scopes. */
export function walk(stack, prefix, inherited, routes, options = {}) {
  const chain = [...inherited];
  for (const layer of stack) {
    const scope = joinPath(prefix, layer.mountPath ?? '/');
    if (layer.route) routeRows(layer, prefix, chain, routes, options);
    else if (isRouter(layer)) {
      walk(layer.handle.stack, scope, chain, routes, options);
      chain.push(...passthrough(layer.handle.stack, scope));
    }
    else chain.push({ scope, name: nameOf(layer.handle) });
  }
}
