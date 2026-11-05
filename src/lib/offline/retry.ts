/** How often an open app tries again while something is waiting. */
export const QUEUE_RETRY_MS = 30_000;

/**
 * Keeps trying while a sale is waiting. The browser's "online" event only fires after a real disconnect, so a send that
 * failed on a phone that still shows as connected (weak signal, a server hiccup) would otherwise wait for the next sale, a
 * reopen or Sync now. Tries on a timer and when the app comes back to the front, only while the app is visible and online.
 * `hasRetryable` leaves out what the server has refused: sending the same body again cannot help.
 */
export function startQueueRetry(deps: {
  hasRetryable: () => Promise<boolean>;
  flush: () => Promise<unknown> | unknown;
}): () => void {
  const attempt = () => {
    if (document.visibilityState !== 'visible' || !navigator.onLine) return;
    void deps
      .hasRetryable()
      .then((waiting) => (waiting ? deps.flush() : undefined))
      .catch(() => undefined);
  };
  const timer = setInterval(attempt, QUEUE_RETRY_MS);
  document.addEventListener('visibilitychange', attempt);
  return () => {
    clearInterval(timer);
    document.removeEventListener('visibilitychange', attempt);
  };
}
