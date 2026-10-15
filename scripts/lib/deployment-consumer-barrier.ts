/** New evidence may use vocabulary older readers cannot parse. Finish all reader
 * promotions before starting the producer, and fail closed on either failure. */
export async function deployConsumersBeforeProducer<T extends { status: string }>(input: {
  consumers: Array<() => Promise<T>>;
  producer: () => Promise<T>;
  skippedProducer: () => T;
}): Promise<T[]> {
  if (!input.consumers.length) throw new Error("At least one consumer deployment is required.");
  const settled = await Promise.allSettled(input.consumers.map(run => Promise.resolve().then(run)));
  const rejected = settled.filter((result): result is PromiseRejectedResult => result.status === "rejected");
  if (rejected.length) throw new AggregateError(rejected.map(result => result.reason), "Consumer deployment did not complete.");
  const results = settled.map(result => (result as PromiseFulfilledResult<T>).value);
  const producer = !results.every(result => result.status === "succeeded" || result.status === "skipped") ? input.skippedProducer() : await input.producer();
  return [...results, producer];
}
