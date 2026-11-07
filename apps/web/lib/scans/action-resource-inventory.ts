import { createHash } from "node:crypto";
import { postAcceptReportProjectionSchema, postRefusalReportProjectionSchema } from "@certscore/contracts";
import { crawlDisplayUrl, type CrawlOccurrence } from "@website-signal-risk-scanner/shared";
import { isAfterActionReportEligible } from "./after-action-report-eligibility";
import { readChoicePathExecution } from "./choice-path-execution";
import { buildSinglePageResourceInventory, type SinglePageResourceInventory } from "./single-page-resource-inventory";
import type { ReviewedPolicy } from "./full-site-resource-context";

export type ActionResourceInventory = {
  inventory: SinglePageResourceInventory;
  scope: "retained_capture" | "activity_sample";
  note: string;
  clockLabel: string;
  captureCoverage?: {status: "complete" | "limited"; omittedNodes: number; omittedEdges: number};
};

/** Descriptive inventory from validated persisted action evidence. Never recalculate
 * historical purpose, findings or scores, or substitute the initial-visit graph. */
export function projectActionResourceInventory(input: {
  pageId: string; action: "accept" | "reject";
  projection: unknown; assessment: unknown; reviewedPolicies?: ReviewedPolicy[];
}): ActionResourceInventory | null {
  if (!isAfterActionReportEligible(input.assessment, input.action)) return null;
  const parsed = input.action === "accept" ? postAcceptReportProjectionSchema.safeParse(input.projection)
    : postRefusalReportProjectionSchema.safeParse(input.projection);
  if (!parsed.success || !parsed.data.packetSha256) return null;
  const p = parsed.data;
  if (!readChoicePathExecution(p, input.action)?.clickCompleted) return null;
  const capture = p.afterActionCapture;
  const scoring = "scoringEvidence" in p ? p.scoringEvidence : undefined;
  const start = capture?.actionDispatchedAtMs ?? scoring?.actionDispatchedAtMs ?? p.retainedActionTiming?.actionDispatchedAtMs;
  const registeredAt = "acceptanceRegisteredAtMs" in p ? p.acceptanceRegisteredAtMs
    : "refusalRegisteredAtMs" in p ? p.refusalRegisteredAtMs : undefined;
  const clockStart = start ?? registeredAt;
  if (clockStart === undefined) return null;
  const entries: Array<{ occurrence: CrawlOccurrence; evidence: string }> = [];
  const add = (kind: CrawlOccurrence["kind"], name: string, identity: unknown, domain: string | undefined,
    vendor: string | undefined, purpose: string | undefined, atMs: number | null, ref: string,
    nonEssential: boolean, resourceType: string, details: Record<string, string | number | boolean | null> = {}) => {
    const key = createHash("sha256").update(JSON.stringify([kind, identity])).digest("hex");
    entries.push({ evidence: nonEssential ? "Non-essential" : "Unclassified", occurrence: {
      id: ref, identity: key, kind, label: name, domain: domain ?? null, vendor: vendor ?? null,
      serviceId: null, purpose: purpose ?? "unknown", resourceType, relationship: "unknown",
      confidence: "unknown", assessment: "Not assessed", eventCount: 1, firstSeenMs: atMs,
      evidenceRefs: [`post-${input.action}:${p.packetSha256}:${ref}`], details,
      ...(kind === "request" ? { networkDestinationMissingCount: 1 } : {}),
    } });
  };
  const requests = capture ? p.afterActionRequests : scoring?.requests;
  const end = capture?.captureEndedAtMs ?? p.retainedActionTiming?.observationEndedAtMs;
  if (requests) {
    for (const row of requests) {
      if (start === undefined || row.startedAtMs < start || (end !== undefined && row.startedAtMs > end)) continue;
      add("request", crawlDisplayUrl(row.sanitizedUrl), [row.method, row.sanitizedUrl, row.method ? null : row.requestId],
        row.hostname, row.vendor, row.purpose, row.startedAtMs - clockStart, row.requestId,
        row.nonEssential, row.resourceType, { method: row.method ?? null });
    }
    const storage = capture ? p.afterActionStorage : scoring?.postActionStorage;
    for (const [index, row] of (storage ?? []).entries()) {
      // Snapshot presence has no first-write time. Distinct identities stay separate.
      add(row.storageType === "cookie" ? "cookie" : "storage", row.name,
        row.identityHash ?? [row.storageType, row.hostname, row.name, index], row.hostname,
        row.vendor, row.purpose, null, `storage:${index}`, row.nonEssential, row.storageType,
        { observation: "post_action_snapshot", valuesRedacted: true });
    }
  } else {
    const activities = "postAcceptActivity" in p ? p.postAcceptActivity.map(row => ({ ...row, offset: row.msAfterAccept }))
      : p.postRefusalActivity.map(row => ({ ...row, offset: row.msAfterReject }));
    if (!activities.length || registeredAt === undefined) return null;
    for (const [index, row] of activities.entries()) {
      const request = row.activityType === "network_request";
      const name = request ? crawlDisplayUrl(row.url ?? row.hostname ?? "Retained request") : row.storageName ?? "Retained storage write";
      add(request ? "request" : row.storageType === "cookie" ? "cookie" : "storage", name,
        request ? [row.url, row.requestId] : [row.storageType, row.hostname, row.storageName],
        row.hostname, row.vendor, row.category, registeredAt + row.offset - clockStart,
        row.requestId ?? `activity:${index}`, row.nonEssential, request ? "request" : row.storageType ?? "storage",
        { observation: request ? "request" : "storage_write", valuesRedacted: true });
    }
  }
  const scope = requests ? "retained_capture" : "activity_sample";
  return {
    inventory: buildSinglePageResourceInventory(input.pageId, [], null, input.reviewedPolicies, entries), scope,
    clockLabel: start !== undefined ? `Times from the ${input.action === "accept" ? "Accept" : "Reject"} click` : `Times from confirmed ${input.action === "accept" ? "Accept" : "Reject"}`,
    note: scope === "activity_sample"
      ? "Retained non-essential activity sample only; full request and storage inventories were not retained in this report. Counts are sample counts."
      : "Retained requests starting after the click and the post-action storage snapshot. Counts cover this bounded capture; storage presence does not establish a new write. Embedded-frame inventory was not retained for this phase.",
  };
}
