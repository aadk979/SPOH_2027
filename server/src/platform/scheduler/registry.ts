import type { ScheduledHandler } from './handler.js';

/** The composition root supplies module-owned handlers; platform never imports their internals. */
export class HandlerRegistry {
  readonly #handlers = new Map<string, ScheduledHandler>();

  constructor(handlers: readonly ScheduledHandler[]) {
    for (const handler of handlers) {
      if (this.#handlers.has(handler.type)) throw new Error('Duplicate scheduled handler type');
      this.#handlers.set(handler.type, handler);
    }
  }

  types(): readonly string[] {
    return [...this.#handlers.keys()];
  }

  get(type: string): ScheduledHandler | undefined {
    return this.#handlers.get(type);
  }
}
