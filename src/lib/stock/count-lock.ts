/**
 * One count writer per backend in this browser profile. A crashed/closed document
 * releases its Web Lock automatically; the next owner can restore the durable IDs.
 * No localStorage lease or check-then-write race, and no fallback to unsafe writes.
 */
export async function holdCountLock(scope: string): Promise<(() => void) | null> {
  return new Promise((resolve) => {
    try {
      if (typeof navigator === 'undefined' || !navigator.locks) return resolve(null);
      void navigator.locks
        .request('hc-count-writer:' + scope, { ifAvailable: true }, async (lock) => {
          if (!lock) return resolve(null);
          await new Promise<void>((release) => {
            let released = false;
            resolve(() => {
              if (!released) {
                released = true;
                release();
              }
            });
          });
        })
        .catch(() => resolve(null));
    } catch {
      resolve(null);
    }
  });
}
