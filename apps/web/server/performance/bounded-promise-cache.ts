export class BoundedPromiseCache<Key, Value> {
  private readonly entries = new Map<Key, {
    expiresAt: number;
    value: Promise<Value>;
  }>();

  constructor(
    private readonly options: {
      maxEntries: number;
      ttlMs: number;
    }
  ) {}

  getOrCreate(key: Key, factory: () => Promise<Value>) {
    const now = Date.now();
    const cached = this.entries.get(key);
    if (cached && cached.expiresAt > now) {
      return cached.value;
    }
    if (cached) {
      this.entries.delete(key);
    }

    const value = factory();
    this.entries.set(key, {
      expiresAt: now + this.options.ttlMs,
      value
    });
    void value.catch(() => {
      if (this.entries.get(key)?.value === value) {
        this.entries.delete(key);
      }
    });

    while (this.entries.size > this.options.maxEntries) {
      const oldestKey = this.entries.keys().next().value;
      if (oldestKey === undefined) break;
      this.entries.delete(oldestKey);
    }

    return value;
  }
}
