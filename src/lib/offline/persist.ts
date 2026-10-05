/**
 * Asks the browser to keep this site's storage (the sale queue, the running event) when the
 * phone runs low on space. Asked when the selling phone starts an event (slice A2). The browser
 * may say no, and Safari decides by itself for a Home Screen app: nothing depends on the answer.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    const storage = typeof navigator === 'undefined' ? undefined : navigator.storage;
    if (!storage?.persist) return false;
    if (storage.persisted && (await storage.persisted())) return true;
    return await storage.persist();
  } catch {
    return false;
  }
}
