type PolicyText = { text: string; sha256: string; sizeBytes: number };
type Pointer = { uri: string; sha256: string | null; sizeBytes: number | null };

/** Cache only immutable, verified server-side text. Failed reads remain retryable. */
export function createVerifiedPolicyTextCache(maxBytes = 8 * 1024 * 1024, maxEntries = 32) {
  const entries = new Map<string, { promise: Promise<PolicyText>; bytes: number }>();
  let retainedBytes = 0;
  function remove(key: string) {
    const entry = entries.get(key);
    if (entry) retainedBytes -= entry.bytes;
    entries.delete(key);
  }
  return function read(pointer: Pointer, loadAndVerify: () => Promise<PolicyText>): Promise<PolicyText> {
    const key = JSON.stringify([pointer.uri, pointer.sha256, pointer.sizeBytes]);
    const existing = entries.get(key);
    if (existing) {
      entries.delete(key);
      entries.set(key, existing);
      return existing.promise;
    }
    const entry = { bytes: 0, promise: Promise.resolve().then(loadAndVerify).then(value => {
      if (value.sha256 !== pointer.sha256 || value.sizeBytes !== pointer.sizeBytes) {
        throw new Error("Verified policy text cache metadata mismatch.");
      }
      if (entries.get(key) === entry) {
        entry.bytes = Buffer.byteLength(value.text, "utf8");
        retainedBytes += entry.bytes;
        while (retainedBytes > maxBytes && entries.size) remove(entries.keys().next().value!);
      }
      return value;
    }).catch(error => {
      if (entries.get(key) === entry) remove(key);
      throw error;
    }) };
    entries.set(key, entry);
    while (entries.size > maxEntries) remove(entries.keys().next().value!);
    return entry.promise;
  };
}
