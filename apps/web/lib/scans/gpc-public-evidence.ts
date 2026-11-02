export function isPrivateGpcProducerField(value: {contractVersion?: unknown}, key: string): boolean {
  return value.contractVersion === "certscore.gpc-signal-observation.v1" && key === "prototypeCaptureBinding";
}

/** Remove optional GPC producer identities only at customer-output boundaries.
 * Original canonical assessments, receipts and policy inputs stay untouched. */
export function redactGpcProducerBindings<T>(value: T): T {
  if (Array.isArray(value)) return value.map(redactGpcProducerBindings) as T;
  if (!value || typeof value !== "object") return value;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return value;
  const record = value as Record<string, unknown>;
  return Object.fromEntries(Object.entries(record)
    .filter(([key]) => !isPrivateGpcProducerField(record, key))
    .map(([key, child]) => [key, redactGpcProducerBindings(child)])) as T;
}
