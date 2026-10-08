import { createHash } from "node:crypto";

type BundleIdentity = { uri: string; expectedSha256: string; expectedSizeBytes: number };

export function createVerifiedCanonicalBundleByteCache(options: {
  maxBytes?: number;
  maxEntries?: number;
  ttlMs?: number;
  now?: () => number;
} = {}) {
  const maxBytes = options.maxBytes ?? 8 * 1024 * 1024;
  const maxEntries = options.maxEntries ?? 32;
  const ttlMs = options.ttlMs ?? 5 * 60_000;
  const now = options.now ?? Date.now;
  const entries = new Map<string, { body: Buffer; expiresAt: number }>();
  let bytes = 0;
  const key = (identity: BundleIdentity) => JSON.stringify([
    identity.uri, identity.expectedSha256.toLowerCase(), identity.expectedSizeBytes,
  ]);
  const remove = (id: string) => {
    const entry = entries.get(id);
    if (entry) bytes -= entry.body.byteLength;
    entries.delete(id);
  };
  return {
    get(identity: BundleIdentity): Buffer | undefined {
      const id = key(identity);
      const entry = entries.get(id);
      if (!entry) return undefined;
      if (entry.expiresAt <= now()) { remove(id); return undefined; }
      entries.delete(id);
      entries.set(id, entry);
      // Callers cannot mutate a retained entry or a later review's source bytes.
      return Buffer.from(entry.body);
    },
    retain(identity: BundleIdentity, body: Buffer): boolean {
      if (!/^[a-f0-9]{64}$/i.test(identity.expectedSha256) ||
          !Number.isSafeInteger(identity.expectedSizeBytes) || identity.expectedSizeBytes <= 0 ||
          body.byteLength !== identity.expectedSizeBytes ||
          createHash("sha256").update(body).digest("hex") !== identity.expectedSha256.toLowerCase()) {
        throw new Error("Canonical bundle cache requires checksum-bound original bytes.");
      }
      if (body.byteLength > maxBytes || maxEntries < 1) return false;
      const id = key(identity);
      remove(id);
      for (const [candidate, entry] of entries) if (entry.expiresAt <= now()) remove(candidate);
      while (entries.size >= maxEntries || bytes + body.byteLength > maxBytes) {
        remove(entries.keys().next().value!);
      }
      entries.set(id, { body: Buffer.from(body), expiresAt: now() + ttlMs });
      bytes += body.byteLength;
      return true;
    },
  };
}

export const verifiedCanonicalBundleBytes = createVerifiedCanonicalBundleByteCache();
