import type { RequestHandler, Router } from 'express';
import { z } from 'zod';
import { EVENT_ROUTES } from '../../src/app/routes.js';
import { validationSchemasOf } from '../../src/platform/http/validate.js';

interface Layer { route?: { path: string; methods: Record<string, boolean>; stack: Array<{ handle: RequestHandler }> } }
interface JsonSchema { properties?: Record<string, JsonSchema>; items?: JsonSchema;
  anyOf?: JsonSchema[]; oneOf?: JsonSchema[]; allOf?: JsonSchema[]; enum?: unknown[] }
const targetName = (key: string) => /(?:Id|Ids)$/.test(key) ||
  ['id', 'ids', 'cursor', 'shortCode', 'shortCodes', 'replacementShortCode', 'qrPayload', 'payload', 'v', 'mediaKey'].includes(key);

function identifierPaths(schema: JsonSchema, path: string[] = []): string[] {
  const paths: string[] = [];
  for (const [key, field] of Object.entries(schema.properties ?? {})) {
    const next = [...path, key];
    if (targetName(key) && !field.enum) paths.push([...next, ...(field.items ? ['*'] : [])].join('.'));
    else paths.push(...identifierPaths(field, next));
  }
  if (schema.items) paths.push(...identifierPaths(schema.items, [...path, '*']));
  for (const branch of [...schema.anyOf ?? [], ...schema.oneOf ?? [], ...schema.allOf ?? []])
    paths.push(...identifierPaths(branch, path));
  return paths;
}

/** Real mounted validators define each request's ID inputs, including optional nested fields. */
export function eventIdInputInventory() {
  const rows: Array<{ route: string; field: string }> = [];
  for (const { path, router } of EVENT_ROUTES) {
    for (const layer of (router as Router & { stack: Layer[] }).stack) {
      if (!layer.route) continue;
      const sub = layer.route.path === '/' ? '' : layer.route.path;
      for (const { handle } of layer.route.stack) {
        const schemas = validationSchemasOf(handle);
        for (const [location, schema] of Object.entries(schemas ?? {})) {
          const fields = identifierPaths(z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' }) as JsonSchema);
          for (const method of Object.keys(layer.route.methods)) {
            for (const field of fields) rows.push({ route: `${method.toUpperCase()} ${path}${sub}`, field: `${location}.${field}` });
          }
        }
      }
    }
  }
  return [...new Map(rows.map((row) => [`${row.route} ${row.field}`, row])).values()];
}
