import { createHash } from "node:crypto";
import type { MeasurementStoredIdentifier, PostRefusalStorageItem } from "@certscore/contracts";
import type { NormalizedActionCookie } from "./action-storage-snapshot.js";

export type MeasurementCookieCandidate = Omit<MeasurementStoredIdentifier, "capturedAtMs">;
const sha = (value: string) => createHash("sha256").update(value).digest("hex");

/** Reuses the existing cookie snapshot. No browser/API call and no raw value retained.
 * This closed GA1 cookie layout supports an exact cid-component match only;
 * unknown layouts, scopes, session cookies and unretained identities stay unknown.
 */
export function measurementCookieCandidates(input: {
  cookies: readonly NormalizedActionCookie[];
  retainedStorage: readonly PostRefusalStorageItem[];
  normalizedDocumentUrl: string;
  nowEpochSeconds: number;
  identityHash: (cookie: NormalizedActionCookie) => string;
}): MeasurementCookieCandidate[] {
  const document = new URL(input.normalizedDocumentUrl);
  return input.cookies.slice(0, 384).flatMap(cookie => {
    const hostname = cookie.domain.toLowerCase().replace(/^\./, "");
    const path = cookie.path || "/";
    if (cookie.name !== "_ga" || cookie.partitionKey || cookie.expires === undefined || cookie.expires <= input.nowEpochSeconds ||
      !(document.hostname === hostname || cookie.domain.startsWith(".") && document.hostname.endsWith(`.${hostname}`)) ||
      !(document.pathname === path || document.pathname.startsWith(path.endsWith("/") ? path : `${path}/`))) return [];
    const match = /^GA1\.[1-9][0-9]{0,2}\.([0-9]{1,20}\.[0-9]{1,20})$/.exec(cookie.value);
    if (!match) return [];
    const identityHash = input.identityHash(cookie), valueHash = sha(cookie.value);
    if (!input.retainedStorage.some(row => row.storageType === "cookie" && row.name === "_ga" && row.hostname === hostname &&
      row.identityHash === identityHash && row.valueHash === valueHash && row.nonEssential)) return [];
    return [{ policyVersion: "measurement_cookie_identifier.v1" as const, parameter: "cid" as const,
      source: "pre_action_cookie_snapshot" as const, targetSha256: sha(input.normalizedDocumentUrl),
      cookieName: "_ga" as const, hostname, identityHash, valueHash, identifierSha256: sha(match[1]!) }];
  });
}

/** Preserve the existing total of 48 inspections, reserving 32 for after click. */
export function measurementInspectionBudget() {
  let total = 0, beforeAction = 0;
  return { available: (afterAction: boolean) => total < 48 && (afterAction || beforeAction < 16),
    retained: (afterAction: boolean) => { total += 1; if (!afterAction) beforeAction += 1; } };
}
