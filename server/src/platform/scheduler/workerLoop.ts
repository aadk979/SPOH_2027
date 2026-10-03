import type { ClaimedAction } from './claimRepo.js';

export interface WorkerPorts {
  claim(): Promise<readonly ClaimedAction[]>;
  execute(action: ClaimedAction): Promise<unknown>;
  recordMetrics(): Promise<void>;
  afterActions?(): Promise<void>;
  /** The composition root logs a fixed operational code, never a raw handler exception. */
  pollFailed(): void;
}

export interface SchedulerWorker {
  tick(): Promise<void>;
  stop(): Promise<void>;
}

/** One instance never overlaps its own ticks; other instances contend through the queue. */
export function startWorkerLoop(ports: WorkerPorts): SchedulerWorker {
  let stopped = false;
  let running: Promise<void> | null = null;
  const runBatch = async () => {
    const actions = await ports.claim();
    for (const action of actions) {
      if (stopped) break;
      await ports.execute(action);
    }
    if (!stopped) await ports.afterActions?.();
    if (!stopped) await ports.recordMetrics();
  };
  const tick = () => {
    if (stopped) return Promise.resolve();
    if (running) return running;
    running = runBatch().finally(() => {
      running = null;
    });
    return running;
  };
  const poll = () => {
    if (running || stopped) return;
    void tick().catch(() => ports.pollFailed());
  };
  const timer = setInterval(poll, 5_000);
  timer.unref();
  poll();
  return {
    tick,
    async stop() {
      stopped = true;
      clearInterval(timer);
      await running;
    },
  };
}
