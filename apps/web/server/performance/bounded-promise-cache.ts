export class BoundedPromiseCache<Key, Value> {
  private readonly entries = new Map<Key, {
    expiresAt: number;
    value: Promise<Value>;
  }>();

  constructor(
    private readonly options: {
      maxEntries: number;
      onEvent?: (event: {
        key: Key;
        outcome: "evicted" | "expired" | "hit" | "miss" | "rejected";
        size: number;
      }) => void;
      ttlMs: number;
    }
  ) {}

  getOrCreate(key: Key, factory: () => Promise<Value>) {
    const now = Date.now();
    const cached = this.entries.get(key);
    if (cached && cached.expiresAt > now) {
      this.options.onEvent?.({ key, outcome: "hit", size: this.entries.size });
      return cached.value;
    }
    if (cached) {
      this.entries.delete(key);
      this.options.onEvent?.({ key, outcome: "expired", size: this.entries.size });
    }

    const value = factory();
    this.entries.set(key, {
      expiresAt: now + this.options.ttlMs,
      value
    });
    this.options.onEvent?.({ key, outcome: "miss", size: this.entries.size });
    void value.catch(() => {
      if (this.entries.get(key)?.value === value) {
        this.entries.delete(key);
        this.options.onEvent?.({ key, outcome: "rejected", size: this.entries.size });
      }
    });

    while (this.entries.size > this.options.maxEntries) {
      const oldestKey = this.entries.keys().next().value;
      if (oldestKey === undefined) break;
      this.entries.delete(oldestKey);
      this.options.onEvent?.({ key: oldestKey, outcome: "evicted", size: this.entries.size });
    }

    return value;
  }
}
