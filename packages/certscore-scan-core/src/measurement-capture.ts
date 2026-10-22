import { createHash } from "node:crypto";
import type { MeasurementStoredIdentifier, PostRefusalStorageItem } from "@certscore/contracts";
import type { NormalizedActionCookie } from "./action-storage-snapshot.js";

export type MeasurementCookieCandidate = Omit<MeasurementStoredIdentifier, "capturedAtMs">;
const sha = (value: string) => createHash("sha256").update(value).digest("hex");

/** Reuses the existing cookie snapshot. No browser/API call and no raw value retained.
 * Closed GA1, numeric app-scoped Heap JSON and HubSpot GUID layouts support
 * exact protocol-component matches; other layouts and unretained scopes stay unknown.
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
    if (cookie.partitionKey || cookie.expires === undefined || cookie.expires <= input.nowEpochSeconds ||
      !(document.hostname === hostname || cookie.domain.startsWith(".") && document.hostname.endsWith(`.${hostname}`)) ||
      !(document.pathname === path || document.pathname.startsWith(path.endsWith("/") ? path : `${path}/`))) return [];
    let identifier: string | undefined, parameter: MeasurementStoredIdentifier["parameter"] = "cid";
    if (cookie.name === "_ga") identifier = /^GA1\.[1-9][0-9]{0,2}\.([0-9]{1,20}\.[0-9]{1,20})$/.exec(cookie.value)?.[1];
    else if (cookie.name === "hubspotutk" && /^[a-f0-9]{32}$/.test(cookie.value)) { identifier = cookie.value; parameter = "vi"; }
    else if (/^_hp2_id\.[0-9]{1,20}$/.test(cookie.name) && cookie.value.length <= 2048) {
      try {
        const value = JSON.parse(decodeURIComponent(cookie.value));
        if (typeof value?.userId === "string" && /^[0-9]{1,20}$/.test(value.userId)) { identifier = value.userId; parameter = "u"; }
      } catch { /* Unknown or legacy layouts stay unknown. */ }
    }
    if (!identifier) return [];
    const identityHash = input.identityHash(cookie), valueHash = sha(cookie.value);
    if (!input.retainedStorage.some(row => row.storageType === "cookie" && row.name === cookie.name && row.hostname === hostname &&
      row.identityHash === identityHash && row.valueHash === valueHash && row.nonEssential)) return [];
    return [{ policyVersion: "measurement_cookie_identifier.v1" as const, parameter,
      source: "pre_action_cookie_snapshot" as const, targetSha256: sha(input.normalizedDocumentUrl),
      cookieName: cookie.name, hostname, identityHash, valueHash, identifierSha256: sha(identifier) }];
  });
}

/** Preserve the existing total of 48 inspections, reserving 32 for after click. */
export function measurementInspectionBudget(options:{distinctRecipients?:boolean}={}) {
  let total = 0, beforeAction = 0;
  const recipients=new Set<string>();
  return { available: (afterAction: boolean, recipient?:string) => total < 48 && (afterAction || beforeAction < 16) &&
    !(afterAction && (options.distinctRecipients || recipient!==undefined) && (!recipient || recipients.has(recipient)) && recipients.size<8 && total>=40),
    retained: (afterAction: boolean, recipient?:string) => { total += 1; if (!afterAction) beforeAction += 1; else if(recipient)recipients.add(recipient); } };
}
