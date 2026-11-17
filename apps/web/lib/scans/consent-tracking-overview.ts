import type { ReportReviewFocus } from "@certscore/api-contracts";
import type { ShadowReportData } from "../../components/scans/report-lab/shadow-report-data";
import type { InventoryAssessmentCounts, ReportInventoryMetric } from "../../components/scans/report-inventory-summary";
import { isAfterAcceptForm } from "./collection-surface-table-row";
import { GPC_CUSTOMER_RESULTS_ENABLED } from "./gpc-customer-policy";
import { INVENTORY_METRIC_LABELS, inventoryMetricLabel } from "./inventory-resource-semantics";
import { buildNetworkInventoryOverview } from "./network-inventory-overview";

type TileId = "before" | "accept" | "reject" | "services" | "storage" | "forms" | "opt-out" | "gpc";
type Totals = Pick<ReportInventoryMetric, "label" | "value"> & { counts?: Partial<InventoryAssessmentCounts> };
export type ConsentTrackingTile = {
  id: TileId;
  label: string;
  count: number | null;
  unit: string;
  state: "recorded" | "partial" | "not_tested" | "unavailable";
  choiceUnconfirmed?: boolean;
  storageReviewCount?: number;
  breakdown?: { nonEssential: number; review?: number };
  metrics?: Totals[];
  notes?: string[];
  services?: string[];
  sharedServices?: string[];
  facts?: { label: string; value: string }[];
  evidence?: "pre-consent" | "accept" | "reject" | "gpc" | "forms" | "privacy";
};

const format = (value: number) => value.toLocaleString("en-US");
const formatCount = (value: number | null) => value === null ? "NA" : format(value);
const duration = (ms: number) => ms < 1000 ? `${format(ms)} ms` : `${format(Math.round(ms / 10) / 100)} s`;
const { requests, storage, frames } = INVENTORY_METRIC_LABELS;

type OverviewInput = Pick<ShadowReportData, "inventorySummary" | "resourceInventory" | "actionInventories" | "actionTimelines" |
  "acceptPath" | "rejectPath" | "formsSummary" | "collectionTableRows" | "afterAcceptFormsLimited" |
  "gpcResponse" | "gpcLaneStatus" | "gpcTimeline" | "californiaPrivacyReview" | "scan">;

function observationCount(count: number | undefined, state: ConsentTrackingTile["state"]) {
  return count !== undefined && (state === "recorded" || count > 0) ? count : null;
}

// Sum resource classifications, not services, events, findings or score effects.
// Omitted review counts remain unavailable rather than becoming a verified zero.
function flaggedItems(groups: Array<Partial<InventoryAssessmentCounts> | undefined>) {
  const retained = groups.filter(group => group?.nonEssential !== undefined || group?.review !== undefined);
  if (!retained.length) return undefined;
  const nonEssential = retained.reduce((sum, group) => sum + (group?.nonEssential ?? 0), 0);
  const review = retained.some(group => group?.review !== undefined)
    ? retained.reduce((sum, group) => sum + (group?.review ?? 0), 0) : undefined;
  return { count: nonEssential + (review ?? 0), breakdown: { nonEssential, ...(review !== undefined ? { review } : {}) } };
}

export function buildConsentTrackingOverview(report: OverviewInput, focus: ReportReviewFocus): ConsentTrackingTile[] {
  const california = focus === "ccpa_cpra";
  const baselineMetric = report.inventorySummary?.find(metric => inventoryMetricLabel(metric.label) === requests);
  const overview = report.resourceInventory?.requestMetric?.overview ?? baselineMetric?.overview;
  const fallback = (label: string) => report.inventorySummary?.find(metric => inventoryMetricLabel(metric.label) === label);
  const storageCount = overview?.distinctStorage ?? fallback(storage)?.value ?? 0;
  const frameCount = overview?.distinctEmbeds ?? fallback(frames)?.value ?? 0;
  const baselineTotals: Totals[] = [
    { label: overview ? "Distinct requests" : requests, value: overview?.distinctResources ?? fallback(requests)?.value,
      counts: overview?.distinctClassifications?.requests ?? fallback(requests)?.counts },
    { label: storage, value: storageCount || null,
      counts: storageCount ? overview?.distinctClassifications?.storage ?? fallback(storage)?.counts : undefined },
    { label: frames, value: frameCount || null,
      counts: frameCount ? overview?.distinctClassifications?.embeds ?? fallback(frames)?.counts : undefined },
  ];
  const inventoryNames = overview?.identifiedServiceNames ?? [];
  const hasBaselineInventory = Boolean(overview || baselineTotals.some(metric => metric.value != null || metric.counts));
  const baselineCounts = overview?.distinctClassifications?.requests;
  const baselineFlags = overview?.distinctClassifications ? flaggedItems(Object.values(overview.distinctClassifications)) : undefined;
  const baselineState = baselineCounts ? "recorded" : "unavailable";
  const before: ConsentTrackingTile = {
    id: "before", label: california ? "Before choice" : "Before consent",
    count: baselineFlags?.count ?? null,
    unit: "flagged items", state: baselineState, breakdown: baselineFlags?.breakdown,
    metrics: baselineTotals, services: inventoryNames, evidence: hasBaselineInventory ? "pre-consent" : undefined,
    notes: hasBaselineInventory ? [overview ? "Counts represent distinct retained resources. Services group requests, cookies and storage, and frames."
      : "The full request classification was not captured. Other retained inventory counts are shown below.",
      "Timing and capture scope can differ across consent states."] : undefined,
  };
  const baselineServices = new Set(report.resourceInventory?.services.filter(service => service.context.identity).map(service => service.key));
  const actions = (["accept", "reject"] as const).map((id): ConsentTrackingTile => {
    const label = id === "accept" ? "After Accept click" : "After Reject click";
    const path = id === "accept" ? report.acceptPath : report.rejectPath;
    const capture = report.actionInventories?.[id];
    if (!capture) return { id, label, count: null, unit: "flagged items", state: "unavailable",
      notes: path?.note ? [path.note] : undefined, evidence: report.actionTimelines?.[id] ? id : undefined };
    const action = buildNetworkInventoryOverview(capture.inventory.services);
    const proof = capture.measurement;
    const states: ConsentTrackingTile["state"] = proof?.requestCoverage === "complete" ? "recorded" : "partial";
    const req = action.distinctClassifications?.requests;
    const facts: NonNullable<ConsentTrackingTile["facts"]> = [];
    if (proof) facts.push({ label: "Choice", value: proof.execution.consentConfirmed ? "Confirmed" : "Click recorded, choice unconfirmed" });
    if (proof?.elapsedMs !== undefined) facts.push({ label: "Observed duration", value: duration(proof.elapsedMs) });
    if (proof?.elapsedAfterConfirmationMs !== undefined) facts.push({ label: "After confirmation", value: duration(proof.elapsedAfterConfirmationMs) });
    const stop = proof?.stopReason && ({
      evidence_satisfied: "Observation ended when qualifying activity was recorded.",
      aborted: "Capture stopped before the window elapsed.",
      target_changed: "Capture stopped when the target changed.",
      click_uncertain: "Capture stopped because click completion was uncertain.",
    })[proof.stopReason];
    const samplesStorage = action.distinctStorage > 0 || proof?.storageSnapshotRetained;
    const metrics: Totals[] = [
      { label: "Distinct requests", value: action.distinctResources, counts: req ? { nonEssential: req.nonEssential, unclassified: req.unclassified } : undefined },
      { label: storage, value: samplesStorage ? action.distinctStorage : null,
        counts: samplesStorage && action.distinctClassifications ? {
          nonEssential: action.distinctClassifications.storage.nonEssential,
          unclassified: action.distinctClassifications.storage.unclassified,
        } : undefined },
      { label: frames, value: null },
    ];
    const flags = flaggedItems(metrics.map(metric => metric.counts));
    return {
      id, label, count: observationCount(flags?.count, states), unit: "flagged items", state: states,
      choiceUnconfirmed: proof?.execution.clickCompleted && !proof.execution.consentConfirmed,
      breakdown: flags?.breakdown,
      metrics,
      notes: [`${capture.note} ${capture.clockLabel}.`, ...(stop ? [stop] : []),
        ...(proof?.documentChanged ? ["The page or control frame changed during the capture. Treat the counts as a partial view of this choice."] : []),
        ...(path?.note && states === "partial" ? [path.note] : []),
        "Classification-review counts were not retained for this path."],
      facts, services: action.identifiedServiceNames,
      sharedServices: capture.inventory.services.filter(service => baselineServices.has(service.key)).map(service => service.name),
      evidence: report.actionTimelines?.[id] ? id : undefined,
    };
  });

  const forms = report.collectionTableRows ?? [];
  const formSummary = report.formsSummary;
  const formsComplete = formSummary?.countStatus === "captured" || (formSummary?.countStatus === undefined &&
    formSummary?.preConsentCapture === "complete" && formSummary.afterAcceptCapture !== "limited");
  const formState = formsComplete ? "recorded" : formSummary?.countStatus === "limited" || forms.length > 0 ? "partial" : "unavailable";
  const formTile: ConsentTrackingTile = { id: "forms", label: "Forms",
    count: observationCount(formSummary?.totalObserved ?? (forms.length ? forms.length : undefined), formState), unit: "observed forms",
    state: formState, evidence: forms.length ? "forms" : undefined,
    facts: formSummary && formSummary.countStatus !== "not_captured" ? [{ label: "Forms retained before Accept", value: formatCount(formSummary.preConsentObserved) },
      { label: "Forms retained after Accept", value: formatCount(formSummary.afterAcceptObserved) }] : undefined,
    notes: [...(report.afterAcceptFormsLimited ? ["After Accept form capture was limited."] : []),
      ...forms.map(row => `${row.form.title || row.form.surfaceType.replaceAll("_", " ")} · ${row.form.retainedFieldCount} fields${isAfterAcceptForm(row) ? " · After Accept" : ""}`)],
  };
  if (!california) return [before, ...actions,
    { id: "services", label: "Services before consent", count: overview?.identifiedServices ?? null, unit: "identified services",
      state: overview ? "recorded" : "unavailable", services: inventoryNames, evidence: overview?.identifiedServices ? "pre-consent" : undefined },
    { id: "storage", label: storage, count: storageCount || null,
      unit: overview ? "distinct items" : "retained items", state: storageCount ? overview ? "recorded" : "partial" : "unavailable",
      storageReviewCount: baselineTotals[1]?.counts?.review,
      metrics: baselineTotals.slice(1), evidence: storageCount ? "pre-consent" : undefined }, formTile];

  const privacy = report.californiaPrivacyReview;
  const optOut = privacy?.scanId === report.scan.id ? privacy.optOutObservation?.evidence : undefined;
  const optOutState = !optOut ? "unavailable" : optOut.status === "complete" ? "recorded"
    : optOut.requests.length || optOut.submitted ? "partial" : "not_tested";
  const optOutTile: ConsentTrackingTile = {
    id: "opt-out", label: "After Opt-out", count: observationCount(optOut?.requests.length, optOutState),
    state: optOutState, unit: "ad or marketing responses", evidence: optOut ? "privacy" : undefined,
    notes: optOut ? ["The site’s sale/sharing control has its own observation. Its count covers advertising or marketing responses in the retained window.",
      ...(optOut.redHatChoice ? ["CMP choice readback is separate from a verified sale/sharing decision."] : [])] : undefined,
    facts: optOut ? [
      { label: "Submission", value: optOut.submitted ? "Recorded" : "Not recorded" },
      { label: "Sale/sharing decision", value: optOut.registration === "confirmed" ? "Confirmed" : "Unconfirmed" },
      ...(optOut.observationWindowMs > 0 ? [{ label: "Post-confirmation observation", value: duration(optOut.observationWindowMs) }] : []),
      ...(optOut.requests.some(request => request.collectionEvidence) ? [{ label: "Responses with retained collection evidence", value: format(optOut.requests.filter(request => request.collectionEvidence).length) }] : []),
    ] : undefined,
    services: optOut ? [...new Set(optOut.requests.map(request => request.vendor))] : undefined,
  };
  const response = GPC_CUSTOMER_RESULTS_ENABLED ? report.gpcResponse : null;
  const gpc = response?.assessment.contractVersion === "certscore.gpc-response-assessment.v3" ? response.assessment.observation : null;
  const delivered = gpc && gpc.status !== "unavailable" && gpc.delivery.httpHeaderRetained && gpc.delivery.mainNavigatorReadbackRetained;
  const paired = delivered ? response?.activityComparison : undefined;
  const gpcState = delivered ? gpc.status === "complete" && gpc.requests.complete ? "recorded" : "partial"
    : report.gpcLaneStatus === "not_requested" ? "not_tested" : "unavailable";
  const gpcTile: ConsentTrackingTile = {
    id: "gpc", label: "GPC enabled", count: observationCount(delivered ? gpc.requests.classifiedCount : undefined, gpcState),
    unit: "classified tracking requests", state: gpcState, evidence: report.gpcTimeline ? "gpc" : undefined,
    notes: [...(delivered ? ["GPC used a separate visit. The classified count covers tracking categories in that visit’s retained request sample."] : []),
      ...(response?.coverageSummary ? [response.coverageSummary] : [])],
    facts: delivered ? [
      { label: "Signal delivery", value: "Verified in the request and browser" },
      { label: "Requests in retained GPC sample", value: format(gpc.requests.count) },
      ...(gpc.requests.throughMs != null ? [{ label: "Visit measured through", value: duration(gpc.requests.throughMs) }] : []),
      ...(gpc.requests.advertisingCollectionCount != null ? [{ label: "Advertising collection requests", value: format(gpc.requests.advertisingCollectionCount) }] : []),
      ...(paired ? [{ label: `Advertising/marketing in matched ${duration(paired.durationMs)} windows`, value: `${format(paired.activity.advertisingMarketing.baselineRequests)} before choice · ${format(paired.activity.advertisingMarketing.gpcRequests)} with GPC` }] : []),
    ] : undefined,
    services: delivered ? [...new Set(gpc.requests.advertisingCollectionRecipients?.rows.map(row => row.label) ?? [])] : undefined,
  };
  return [before, ...actions, optOutTile, gpcTile, formTile];
}
