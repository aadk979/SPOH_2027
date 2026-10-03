/** An unchanged in-memory request reuses its UUID; no intent is persisted on this device. */
export function createRetryIntent() {
  let previous: { fingerprint: string; key: string } | undefined;
  return {
    keyFor(input: unknown) {
      const fingerprint = JSON.stringify(input);
      if (!previous || previous.fingerprint !== fingerprint)
        previous = { fingerprint, key: crypto.randomUUID() };
      return previous.key;
    },
    clear() {
      previous = undefined;
    },
  };
}
