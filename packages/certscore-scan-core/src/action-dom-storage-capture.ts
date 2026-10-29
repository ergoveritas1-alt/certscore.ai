import { createHash } from "node:crypto";
import type { CDPSession, Page } from "playwright";

const methods = ["DOMStorage.domStorageItemAdded", "DOMStorage.domStorageItemUpdated", "DOMStorage.domStorageItemRemoved", "DOMStorage.domStorageItemsCleared"] as const;
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
export const ACTION_DOM_STORAGE_ROW_LIMIT = 64;
export type ActionDomStorageObservation = import("@certscore/contracts").ActionOriginDomStorageObservation;

/** Actual browser event observation only. Never installs or replaces page APIs,
 * claims renderer-write timing, or supplies canonical action/write eligibility.
 * Event receipt processing is synchronous, bounded, and has no drain task/wait.
 */
export async function installActionDomStorageCapture(page: Page, targetUrl: string,
  openSession: () => Promise<CDPSession> = () => page.context().newCDPSession(page)) {
  const startedAtEpochMs = Date.now();
  let targetOrigin = new URL(targetUrl).origin;
  const rows: ActionDomStorageObservation["rows"] = [];
  let session: CDPSession | undefined, enabled = false, frozen: ActionDomStorageObservation | undefined;
  let observedEvents = 0, invalidEvents = 0, overflowEvents = 0, foreignOriginEvents = 0;
  let additionalPageObserved = page.context().pages().some(candidate => candidate !== page);
  const pageAdded = () => { if (!frozen) additionalPageObserved = true; };
  page.context().on("page", pageAdded);
  const listeners = methods.map((method, index) => {
    const listener = (payload: any) => {
      if (frozen) return;
      observedEvents++;
      const id = payload?.storageId;
      // Reject malformed origins rather than hashing a guessed owner. Hashing
      // retains exact observed origin/partition identities without serving URLs.
      let origin: string;
      try {
        if (typeof id?.securityOrigin !== "string" || id.securityOrigin.length > 8192 || typeof id.isLocalStorage !== "boolean") throw new Error();
        const parsed = new URL(id.securityOrigin);
        if (!["https:", "http:"].includes(parsed.protocol) || parsed.origin !== id.securityOrigin) throw new Error();
        origin = parsed.origin;
        if (index !== 3 && typeof payload.key !== "string") throw new Error();
        if (index < 2 && (typeof payload.newValue !== "string" || payload.newValue.length > 8192)) throw new Error();
        if (index !== 3 && payload.key.length > 1024) throw new Error();
        if (id.storageKey !== undefined && (typeof id.storageKey !== "string" || id.storageKey.length > 8192)) throw new Error();
      } catch { invalidEvents++; return; }
      const targetOriginMatch = origin === targetOrigin;
      if (!targetOriginMatch) foreignOriginEvents++;
      if (rows.length >= ACTION_DOM_STORAGE_ROW_LIMIT) { overflowEvents++; return; }
      rows.push({ event: ["added", "updated", "removed", "cleared"][index] as "added" | "updated" | "removed" | "cleared",
        receivedAtEpochMs: Date.now(), originSha256: hash(origin), targetOriginMatch,
        ...(id.storageKey === undefined ? {} : { storagePartitionSha256: hash(id.storageKey) }),
        storageType: id.isLocalStorage ? "local_storage" : "session_storage",
        ...(index === 3 ? {} : { keySha256: hash(payload.key) }),
        ...(index < 2 ? { valueSha256: hash(payload.newValue) } : {}) });
    };
    return { method, listener };
  });
  try {
    session = await openSession();
    for (const { method, listener } of listeners) session.on(method, listener);
    await session.send("DOMStorage.enable");
    enabled = true;
  } catch { /* Additive diagnostics must not invalidate an existing action. */ }
  const finish = (frozenAtEpochMs = Date.now()): ActionDomStorageObservation => {
    if (frozen) return frozen;
    frozen = { contractVersion: "action_origin_dom_storage_observation.v1", scope: "origin_storage_partition_event_receipts",
      diagnosticOnly: true, timingBasis: "observer_event_receipt_clock", targetOriginSha256: hash(targetOrigin), setup: enabled ? "enabled" : "unavailable",
      startedAtEpochMs, frozenAtEpochMs, observedEvents, invalidEvents, overflowEvents, foreignOriginEvents,
      additionalPageObserved, rows: rows.map(row => ({ ...row })),
      limitations: ["receipt_clock_not_write_time", "no_document_or_frame_attribution", "source_delivery_not_verified", "cookies_and_other_storage_not_covered",
        ...(!enabled ? ["setup_unavailable" as const] : []), ...(invalidEvents ? ["invalid_event" as const] : []),
        ...(overflowEvents ? ["retention_overflow" as const] : []), ...(foreignOriginEvents ? ["foreign_origin_observed" as const] : []),
        ...(additionalPageObserved ? ["additional_page_observed" as const] : [])] };
    page.context().off("page", pageAdded);
    for (const { method, listener } of listeners) session?.off(method, listener);
    // No new finalization wait. Event callbacks have no pending asynchronous
    // work; context cleanup owns ultimate session teardown if detach fails.
    void session?.detach().catch(() => undefined);
    return frozen;
  };
  return { finish,
    /** Only the caller's resolved, authorized action target may rebind this
     * diagnostic. Recompute bounded retained receipts; never guess omitted origins. */
    bindAuthorizedTarget(url: string): boolean {
      if (frozen) return false;
      let origin: string;
      try { const u = new URL(url); if (!["http:","https:"].includes(u.protocol)) return false; origin = u.origin; }
      catch { return false; }
      if (origin === targetOrigin) return true;
      if (overflowEvents !== 0) return false;
      targetOrigin = origin;
      const digest = hash(origin);
      foreignOriginEvents = 0;
      for (const row of rows) {
        row.targetOriginMatch = row.originSha256 === digest;
        if (!row.targetOriginMatch) foreignOriginEvents++;
      }
      return true;
    },
  };
}
