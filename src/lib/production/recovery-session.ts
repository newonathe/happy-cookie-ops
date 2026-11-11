import {
  emptyProductionRecovery,
  holdProductionLock,
  parseProductionScope,
  readProductionRecovery,
  setAsideProductionRecovery,
  writeProductionRecovery,
  type ProductionRecovery,
  type ProductionRecoveryScope
} from './recovery';

export type ProductionRecoveryStatus =
  'closed' | 'loading' | 'ready' | 'locked' | 'unsupported' | 'invalid' | 'unavailable';
interface Ports {
  clear: () => Promise<void>;
  restore: (value: ProductionRecovery) => Promise<void>;
  capture: (scope: ProductionRecoveryScope) => ProductionRecovery;
  changed: () => void;
  resolutions?: () => readonly string[];
}

/** Device persistence is never authority to post: binding comes from the verified live gate. */
export class ProductionRecoverySession {
  scope: ProductionRecoveryScope | null = null;
  phase: ProductionRecoveryStatus = 'closed';
  generation = 0;
  loaded = false;
  private release: (() => void) | null = null;
  private written = '';

  constructor(private readonly ports: Ports) {}
  sameScope(scope: ProductionRecoveryScope | null): boolean {
    return this.scope?.userId === scope?.userId && this.scope?.business === scope?.business;
  }
  get writable(): boolean {
    return this.loaded && this.phase === 'ready' && this.release !== null;
  }
  get editable(): boolean {
    return this.loaded && this.release !== null;
  }

  async bind(input: ProductionRecoveryScope | null, retry = false): Promise<void> {
    const scope = input === null ? null : parseProductionScope(input);
    if (this.sameScope(scope) && !retry) return;
    this.persist();
    this.release?.();
    this.release = null;
    const generation = ++this.generation;
    this.scope = scope;
    this.loaded = false;
    this.written = '';
    this.phase = scope ? 'loading' : 'closed';
    await this.ports.clear();
    if (generation !== this.generation || !scope) return;
    const release = await holdProductionLock(scope);
    if (generation !== this.generation) {
      release?.();
      return;
    }
    this.release = release;
    const read = readProductionRecovery(scope);
    if (read.status === 'invalid' || read.status === 'unavailable') {
      this.phase = read.status;
      this.ports.changed();
      return;
    }
    const value = read.value ?? emptyProductionRecovery(scope);
    await this.ports.restore(value);
    if (generation !== this.generation) return;
    this.loaded = true;
    this.written = read.value ? JSON.stringify(read.value) : '';
    this.phase = release
      ? 'ready'
      : typeof navigator === 'undefined' || !navigator.locks
        ? 'unsupported'
        : 'locked';
    this.ports.changed();
  }

  /** Synchronous and checked before a request; unknown requests cannot be dropped implicitly. */
  persist(resolvedRequests: readonly string[] = []): boolean {
    if (!this.scope || !this.loaded || !this.release) return false;
    const value = this.ports.capture(this.scope),
      signature = JSON.stringify(value);
    if (signature === this.written && this.phase === 'ready') return true;
    const ok = writeProductionRecovery(this.scope, value, {
      resolvedRequests: [...resolvedRequests, ...(this.ports.resolutions?.() ?? [])]
    });
    this.phase = ok ? 'ready' : 'unavailable';
    if (ok) this.written = signature;
    return ok;
  }

  /** Only the tab holding the write lock may move an unreadable copy aside; then this device starts clean. */
  async setAside(): Promise<boolean> {
    if (!this.scope || this.phase !== 'invalid' || !this.release) return false;
    if (!setAsideProductionRecovery(this.scope)) return false;
    await this.bind(this.scope, true);
    return true;
  }

  async retry(): Promise<void> {
    if (this.loaded && this.release) {
      this.persist();
      this.ports.changed();
    } else await this.bind(this.scope, true);
  }

  dispose(): void {
    this.persist();
    ++this.generation;
    this.release?.();
    this.release = null;
    this.loaded = false;
    this.phase = 'closed';
    this.scope = null;
  }
}
