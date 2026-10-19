/**
 * Which till this phone draws while a bazaar day is selling (Ethan, 19 October 2026): the consolidated till, or the
 * ported "classic" one as a way back. A choice for this phone only, and only a look: both call the same sale handlers.
 * On iOS the Home Screen app and Safari keep separate storage, so each keeps its own choice.
 *
 * Read in `OpsRuntime.componentDidMount`, never in a field initialiser (that breaks hydration). Storage that throws
 * (private mode, a full disk) means the new till.
 */
const KEY = 'hc-live-classic-till';

export function readClassicTill(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function rememberClassicTill(on: boolean): void {
  try {
    if (on) localStorage.setItem(KEY, '1');
    else localStorage.removeItem(KEY);
  } catch {
    /* the choice holds until the page is reloaded */
  }
}
