import { cookieSnapshotSchema, type CookieEvent } from "@certscore/contracts";

const domainKey = (domain: string) => domain.replace(/^\./, "").toLowerCase();

/** Bind an event to browser-supplied scope in the same verified evidence packet. */
export function retainedCookieInventoryIdentity(event: CookieEvent, snapshots: unknown): string | undefined {
  const eventDomain = event.cookieDomain;
  const parsed = cookieSnapshotSchema.array().safeParse(snapshots);
  if (!parsed.success || !eventDomain || !event.cookiePath || event.consentStateAtTime !== "pre_consent" ||
      (event.scenario && event.scenario !== "fresh_pre_consent")) return undefined;
  const matches = new Set(parsed.data.filter(snapshot => snapshot.consentStateAtTime === "pre_consent")
    .flatMap(snapshot => snapshot.cookies)
    .filter(cookie => cookie.name === event.cookieName && domainKey(cookie.domain) === domainKey(eventDomain) &&
      cookie.path === event.cookiePath && (event.partitionKey === undefined || cookie.partitionKey === event.partitionKey))
    // Optional partition in this browser snapshot contract means unpartitioned,
    // exactly as in the canonical inventory producer. Preserve the original domain.
    .map(cookie => JSON.stringify([cookie.name, cookie.domain, cookie.path, cookie.partitionKey ?? null])));
  const identity = matches.size === 1 ? [...matches][0] : undefined;
  return identity && JSON.parse(identity)[3] === (event.partitionKey ?? null) ? identity : undefined;
}

export function verifiedCookieInventoryIdentity(row: Record<string, unknown>): string | undefined {
  if (typeof row.exactStorageIdentity !== "string") return undefined;
  try {
    const parts = JSON.parse(row.exactStorageIdentity);
    if (Array.isArray(parts) && parts.length === 4 && parts[0] === row.cookieName &&
        typeof parts[1] === "string" && typeof row.domain === "string" && domainKey(parts[1]) === domainKey(row.domain) &&
        typeof parts[2] === "string" && parts[2].startsWith("/") && parts[2] === row.cookiePath &&
        parts[3] === (row.partitionKey ?? null)) return row.exactStorageIdentity;
  } catch { /* Malformed identity is not projectable. */ }
  return undefined;
}
