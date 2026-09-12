import { createHash } from "node:crypto";

/** No default scope: incomplete retained identities must not match by name alone. */
export function assessedStorageInventoryKey(record: Record<string, unknown>): string | null {
  const identity = record.exactStorageIdentity;
  if (typeof identity !== "string") return null;
  let parts: unknown;
  try { parts = JSON.parse(identity); } catch { return null; }
  if (!Array.isArray(parts)) return null;
  if (record.storageType === "cookie") {
    if (parts.length !== 4 || typeof parts[0] !== "string" || typeof parts[1] !== "string" || !parts[1] ||
        typeof parts[2] !== "string" || !parts[2].startsWith("/") || !(parts[3] === null || typeof parts[3] === "string")) return null;
  } else if (record.storageType === "localStorage" || record.storageType === "sessionStorage") {
    if (parts.length !== 3 || typeof parts[0] !== "string" || parts[1] !== record.storageType || typeof parts[2] !== "string") return null;
    try { if (new URL(parts[0]).origin !== parts[0]) return null; } catch { return null; }
  } else return null;
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex");
}

export function reconcileStorageInventory(
  records: Record<string, unknown>[],
  inventory: Array<{occurrence: {kind: string; identity: string}}>,
) {
  const available = new Set(inventory.filter(row => ["cookie","storage"].includes(row.occurrence.kind)).map(row => row.occurrence.identity));
  const matched = new Set<string>();
  let unmatched = 0;
  for (const record of records) {
    const key = assessedStorageInventoryKey(record);
    if (key && available.has(key)) matched.add(key);
    else unmatched++;
  }
  return { matched, unmatched };
}
