/**
 * Makes this phone able to reload with no signal.
 *
 * The service worker caches the page at install, but the hashed scripts and styles
 * (`/_next/static/…`) are requested BEFORE the worker controls the page, so it never sees
 * them. Once the worker is ready the page hands it the URLs it actually loaded; the worker
 * stores them and answers on the port. Resolves true when the worker confirms.
 */
export function shellUrls(): string[] {
  const found = new Set<string>();
  const add = (raw: string) => {
    try {
      const url = new URL(raw, location.href);
      if (
        url.origin === location.origin &&
        (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/assets/'))
      ) {
        found.add(url.pathname + url.search);
      }
    } catch {
      /* not a URL */
    }
  };
  for (const entry of performance.getEntriesByType('resource')) add(entry.name);
  document.querySelectorAll('script[src], link[href]').forEach((el) => {
    add(el.getAttribute('src') ?? el.getAttribute('href') ?? '');
  });
  return [...found].slice(0, 400);
}

export async function warmOfflineShell(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return false;
  try {
    const registration = await navigator.serviceWorker.ready;
    const worker = registration.active;
    if (!worker) return false;
    return await new Promise<boolean>((resolve) => {
      const channel = new MessageChannel();
      const timer = setTimeout(() => resolve(false), 20_000);
      channel.port1.onmessage = (event: MessageEvent<{ ok?: boolean }>) => {
        clearTimeout(timer);
        resolve(event.data?.ok === true);
      };
      worker.postMessage({ type: 'hc-precache', urls: shellUrls() }, [channel.port2]);
    });
  } catch {
    return false;
  }
}
