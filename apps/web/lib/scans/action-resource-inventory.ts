import { classifyChoiceCookie } from "./choice-cookie-classification";
import { classifyCrawlInventoryResource } from "./full-site-inventory-classification";
import { cookieInventoryClassification } from "./runtime-inventory-projection";
import { createHash } from "node:crypto";
import { choiceRequestRole, postAcceptReportProjectionSchema, postRefusalReportProjectionSchema, sanitizeRuntimeGraphUrl } from "@certscore/contracts";
import { crawlDisplayUrl, type CrawlOccurrence } from "@website-signal-risk-scanner/shared";
import { isAfterActionReportEligible } from "./after-action-report-eligibility";
import { readChoicePathExecution } from "./choice-path-execution";
import type { ChoicePathExecution } from "@certscore/contracts";
import { buildSinglePageResourceInventory, type SinglePageResourceInventory } from "./single-page-resource-inventory";
import type { ReviewedPolicy } from "./full-site-resource-context";

export type ActionResourceInventory = {
  inventory: SinglePageResourceInventory;
  scope: "retained_capture" | "activity_sample";
  note: string;
  clockLabel: string;
  captureCoverage?: {status: "complete" | "limited"; omittedNodes: number; omittedEdges: number};
  measurement?: {
    execution: ChoicePathExecution;
    requestCoverage: "complete" | "limited";
    storageSnapshotRetained: boolean;
    elapsedMs?: number;
    elapsedAfterConfirmationMs?: number;
    stopReason?: "evidence_satisfied" | "aborted" | "target_changed" | "click_uncertain";
    documentChanged?: boolean;
  };
};

// The display identity omits the query. Check any retained parameter names
// before that redaction, accepting only ordinary image transformation options.
const imageTransformParameters = new Set(["auto", "w", "h", "width", "height", "fit", "crop", "rect", "q", "quality", "fm", "format", "dpr"]);
function hasOtherImageParameters(url: string) {
  if (!url.includes("?")) return false;
  if (!URL.canParse(url)) return true;
  return Array.from(new URL(url).searchParams.keys()).some(key => !imageTransformParameters.has(key.toLowerCase()));
}

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
  const execution = readChoicePathExecution(p, input.action);
  if (!execution?.clickCompleted) return null;
  const documentChanged = p.receiptAvailability?.documentStable === false ||
    p.interactionDiagnostics?.postClickNavigation?.elapsedAfterClickMs !== undefined;
  const capture = p.afterActionCapture;
  const scoring = "scoringEvidence" in p ? p.scoringEvidence : undefined;
  const start = capture?.actionDispatchedAtMs ?? scoring?.actionDispatchedAtMs ?? p.retainedActionTiming?.actionDispatchedAtMs;
  const registeredAt = "acceptanceRegisteredAtMs" in p ? p.acceptanceRegisteredAtMs
    : "refusalRegisteredAtMs" in p ? p.refusalRegisteredAtMs : undefined;
  const clockStart = start ?? registeredAt;
  if (clockStart === undefined) return null;
  const entries: Array<{ occurrence: CrawlOccurrence; evidence: string }> = [];
  const add = (kind: CrawlOccurrence["kind"], name: string, storageIdentity: unknown, domain: string | undefined,
    vendor: string | undefined, purpose: string | undefined, atMs: number | null, ref: string,
    nonEssential: boolean, resourceType: string, details: Record<string, string | number | boolean | null> = {},
    essentiality?: "essential" | "non_essential" | "unknown") => {
    const endpoint = kind === "request" ? sanitizeRuntimeGraphUrl(name) : undefined;
    const resourceIdentity = kind === "request" ? [details.method ?? null, endpoint ?? ref] : storageIdentity;
    const key = createHash("sha256").update(JSON.stringify([kind, resourceIdentity])).digest("hex");
    const occurrence: CrawlOccurrence = {
      id: ref, identity: key, kind, label: endpoint ?? name, domain: domain ?? null, vendor: vendor ?? null,
      serviceId: null, purpose: purpose ?? "unknown", resourceType, relationship: "unknown",
      confidence: "unknown", assessment: "Not assessed", eventCount: 1, firstSeenMs: atMs,
      evidenceRefs: [`post-${input.action}:${p.packetSha256}:${ref}`], details,
      ...(kind === "request" ? { networkDestinationMissingCount: 1 } : {}),
    };
    // A historical write activity does not prove that the browser stored a cookie.
    const snapshot = details.observation === "post_action_snapshot";
    let evidence = "Unclassified";
    if (kind === "cookie" && snapshot) {
      const cookie = classifyChoiceCookie(name, domain, { purpose, essentiality, nonEssential });
      occurrence.purpose = cookie.category;
      evidence = cookieInventoryClassification(new Set([cookie.essentiality]));
    } else if (kind === "request") {
      evidence = !details.choiceRequestRole && nonEssential ? "Non-essential" : classifyCrawlInventoryResource(occurrence);
    } else if (snapshot) {
      if (nonEssential) evidence = "Non-essential";
      else if (essentiality === "essential") evidence = "Essential";
    }
    entries.push({ evidence, occurrence });
  };
  const requests = capture ? p.afterActionRequests : scoring?.requests;
  const completion = p.registeredObservationCompletion;
  const end = capture?.captureEndedAtMs ?? p.retainedActionTiming?.observationEndedAtMs ?? completion?.completedAtMs;
  if (requests) {
    for (const row of requests) {
      if (start === undefined || row.startedAtMs < start || (end !== undefined && row.startedAtMs > end)) continue;
      const role = row.choiceRequestRole ?? choiceRequestRole(row.sanitizedUrl, row.method, row.resourceType);
      add("request", crawlDisplayUrl(row.sanitizedUrl), null,
        row.hostname, row.vendor, row.purpose, row.startedAtMs - clockStart, row.requestId,
        row.nonEssential, row.resourceType, { method: row.method ?? null,
          ...(role ? {choiceRequestRole: role, measurementResponseVerified: row.httpStatus !== undefined && row.httpStatus >= 200 && row.httpStatus < 300} : {}),
          ...(row.resourceType.toLowerCase() === "image" ? {
            httpStatus: row.httpStatus ?? null,
            hasOtherImageParameters: hasOtherImageParameters(row.sanitizedUrl),
            hasCookieOrTrackingEvidence: Boolean(row.responseCookieNamesSet?.length || row.responseCookieWrites?.length ||
              row.measurementEvidence || row.californiaCollection || row.googleConsentMode),
          } : {}),
        });
    }
    const storage = capture ? p.afterActionStorage : scoring?.postActionStorage;
    for (const [index, row] of (storage ?? []).entries()) {
      // Snapshot presence has no first-write time. Distinct identities stay separate.
      add(row.storageType === "cookie" ? "cookie" : "storage", row.name,
        row.identityHash ?? [row.storageType, row.hostname, row.name, index], row.hostname,
        row.vendor, row.purpose, null, `storage:${index}`, row.nonEssential, row.storageType,
        { observation: "post_action_snapshot", valuesRedacted: true }, row.purposeAssessment?.essentiality);
    }
  } else {
    const activities = "postAcceptActivity" in p ? p.postAcceptActivity.map(row => ({ ...row, offset: row.msAfterAccept }))
      : p.postRefusalActivity.map(row => ({ ...row, offset: row.msAfterReject }));
    if (!activities.length || registeredAt === undefined) return null;
    for (const [index, row] of activities.entries()) {
      const request = row.activityType === "network_request";
      const name = request ? crawlDisplayUrl(row.url ?? row.hostname ?? "Retained request") : row.storageName ?? "Retained storage write";
      add(request ? "request" : row.storageType === "cookie" ? "cookie" : "storage", name,
        request ? null : [row.storageType, row.hostname, row.storageName],
        row.hostname, row.vendor, row.category, registeredAt + row.offset - clockStart,
        row.requestId ?? `activity:${index}`, row.nonEssential, request ? "request" : row.storageType ?? "storage",
        { observation: request ? "request" : "storage_write", valuesRedacted: true,
          ...(request && row.choiceRequestRole ? {choiceRequestRole:row.choiceRequestRole, method:row.method ?? null, measurementResponseVerified:true} : {}) });
    }
  }
  const scope = requests ? "retained_capture" : "activity_sample";
  return {
    inventory: buildSinglePageResourceInventory(input.pageId, [], null, input.reviewedPolicies, entries, "choice"), scope,
    clockLabel: start !== undefined ? `Times from the ${input.action === "accept" ? "Accept" : "Reject"} click` : `Times from confirmed ${input.action === "accept" ? "Accept" : "Reject"}`,
    measurement: {
      execution,
      requestCoverage: requests && execution.observationCompleted && !documentChanged ? "complete" : "limited",
      storageSnapshotRetained: capture ? capture.storageSnapshotRetained && !!p.afterActionStorage : scoring?.postActionCapturedAtMs !== undefined,
      ...(documentChanged ? { documentChanged: true } : {}),
      ...(end !== undefined && end >= clockStart ? { elapsedMs: end - clockStart } : {}),
      ...(completion && start !== undefined ? { elapsedAfterConfirmationMs: completion.completedAtMs - completion.startedAtMs } : {}),
      ...(capture && capture.stopReason !== "window_elapsed" ? { stopReason: capture.stopReason }
        : completion?.termination === "evidence_satisfied" ? { stopReason: completion.termination } : {}),
    },
    note: scope === "activity_sample"
      ? "Retained non-essential activity sample only; full request and storage inventories were not retained in this report. Counts are sample counts."
      : "Retained requests starting after the click and the post-action storage snapshot. Counts cover this bounded capture; storage presence does not establish a new write. Embedded-frame inventory was not retained for this phase.",
  };
}
