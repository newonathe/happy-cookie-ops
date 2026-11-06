/** Keeps unsaved recipe values and their original concurrency stamps by verified identity. */
export class ScopedRecipeEdits<T> {
  private readonly byScope = new Map<string, Map<string, T>>();

  bind(
    key: string | null,
    current: ReadonlyMap<string, T>,
    dirty: ReadonlySet<string>
  ): Map<string, T> {
    const previous = this.activeKey;
    if (previous !== null) {
      const saved = this.byScope.get(previous) ?? new Map<string, T>();
      for (const [id, value] of current) {
        if (dirty.has(id)) saved.set(id, structuredClone(value));
        else saved.delete(id);
      }
      this.byScope.set(previous, saved);
    }
    this.activeKey = key;
    return key === null
      ? new Map()
      : new Map(
          [...(this.byScope.get(key) ?? [])].map(([id, value]) => [id, structuredClone(value)])
        );
  }

  private activeKey: string | null = null;
}
