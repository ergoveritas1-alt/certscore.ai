/** Overlap bounded I/O while preserving projection order and limiting retained packets. */
export async function* orderedEvidencePrefetch<T, R>(
  items: readonly T[],
  read: (item: T) => Promise<R>,
  concurrency = 3,
): AsyncGenerator<{ item: T; result: { ok: true; value: R } | { ok: false; error: unknown } }> {
  if (!Number.isInteger(concurrency) || concurrency < 1) throw new Error("Invalid prefetch concurrency");
  const pending = new Map<number, Promise<{ ok: true; value: R } | { ok: false; error: unknown }>>();
  const start = (index: number) => {
    if (index >= items.length) return;
    // Attach rejection handling immediately, including packets awaiting their turn.
    pending.set(index, Promise.resolve().then(() => read(items[index]!)).then(
      value => ({ ok: true as const, value }), error => ({ ok: false as const, error }),
    ));
  };
  for (let index = 0; index < Math.min(concurrency, items.length); index++) start(index);
  for (let index = 0; index < items.length; index++) {
    const result = await pending.get(index)!;
    pending.delete(index);
    yield { item: items[index]!, result };
    start(index + concurrency);
  }
}
