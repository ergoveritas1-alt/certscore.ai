import { createHash } from "node:crypto";
import {
  GPC_RESPONSE_ASSESSMENT_CONTRACT_VERSION, gpcResponseAssessmentV2Schema, gpcSignalObservationSchema,
  type CanonicalEvidenceBundle, type GpcCompleteComparisonDelta, type GpcResponseAssessmentV2,
  type GpcSignalObservation,
} from "@certscore/contracts";
import { gpcDocumentHash } from "./gpc-signal-capture.js";

export type GpcVerifiedArtifactPointer = { sha256: string; sizeBytes: number; uri: string };

function identity(value: string) {
  const clean = value.trim();
  return clean.length <= 500 ? clean : `${clean.slice(0, 420)}#${createHash("sha256").update(clean).digest("hex")}`;
}
function uniqueSorted(values: Iterable<string>) {
  return [...new Set([...values].map(identity).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

/** Compare full retained sets. Sampling is ONLY a serialization/display bound. */
export function compareGpcSets(baselineValues: Iterable<string>, gpcValues: Iterable<string>): GpcCompleteComparisonDelta {
  const baseline = new Set(uniqueSorted(baselineValues)), gpc = new Set(uniqueSorted(gpcValues));
  const baselineOnly = [...baseline].filter((value) => !gpc.has(value));
  const gpcOnly = [...gpc].filter((value) => !baseline.has(value));
  const shared = [...baseline].filter((value) => gpc.has(value));
  return { baselineCount: baseline.size, gpcCount: gpc.size, countDelta: gpc.size - baseline.size,
    baselineOnly: baselineOnly.slice(0, 100), gpcOnly: gpcOnly.slice(0, 100), shared: shared.slice(0, 100),
    baselineOnlyCount: baselineOnly.length, gpcOnlyCount: gpcOnly.length, sharedCount: shared.length,
    samplesTruncated: [baselineOnly, gpcOnly, shared].some((rows) => rows.length > 100) };
}

function safeHash(url: string | undefined) {
  try { return url ? gpcDocumentHash(url) : null; } catch { return null; }
}
function retainedSignal(bundle: CanonicalEvidenceBundle | undefined) {
  const parsed = gpcSignalObservationSchema.safeParse(bundle?.gpcSignalObservation);
  return parsed.success ? parsed.data : null;
}
function validReadback(proof: GpcSignalObservation | null, expected: boolean) {
  return proof !== null && proof.expectedEnabled === expected && proof.workerCount === 0 &&
    proof.limitationKeys.length === 0 && proof.frames.length === proof.frameCount && proof.frameCount > 0 &&
    proof.frames.filter((frame) => frame.mainFrame).length === 1 &&
    proof.frames.filter((frame) => frame.mainFrame && frame.documentUrlSha256 === proof.documentUrlSha256).length === 1 &&
    proof.frames.every((frame) => frame.navigatorValue === expected);
}

function comparableInventory(bundle: CanonicalEvidenceBundle | undefined, proof: GpcSignalObservation | null, throughMs: number | null) {
  const inWindow = (timestampMs: number) => proof !== null && throughMs !== null &&
    timestampMs >= proof.documentStartedAtMs && timestampMs <= proof.documentStartedAtMs + throughMs;
  const network = (bundle?.networkEvents ?? []).filter((event) => inWindow(event.timestampMs));
  const cookies = (bundle?.cookieEvents ?? []).filter((event) => inWindow(event.timestampMs));
  const scripts = (bundle?.scriptEvents ?? []).filter((event) => inWindow(event.timestampMs));
  const evidenceIds = new Set([...network, ...cookies, ...scripts].map((event) => event.eventId));
  const observedVendors = (bundle?.normalizedVendorObservations ?? []).filter((observation) =>
    observation.matchedEvidenceIds.some((id) => evidenceIds.has(id)));
  const observedJourneys = (bundle?.observedJourneys ?? []).filter((journey) =>
    inWindow(journey.firstObservedAtMs) && journey.eventRefs.some((ref) => evidenceIds.has(ref.eventId)));
  const classified = (purposes: Set<string>) => uniqueSorted([
    ...observedVendors.filter((v) => purposes.has(v.purpose)).map((v) => `${v.vendor}|${v.product ?? "unspecified"}|${v.purpose}`),
    ...observedJourneys.filter((j) => j.purpose && purposes.has(j.purpose))
      .map((j) => `${j.vendor ?? j.entity ?? "unknown"}|${j.product ?? j.displayName}|${j.purpose}`),
  ]);
  // Storage snapshots are descriptive retained facts; their presence/absence
  // alone never establishes a privacy response or a California score effect.
  const storage = (bundle?.storageSnapshots ?? []).flatMap((snapshot) => {
    const origin = (() => { try { return new URL(snapshot.url).origin; } catch { return "unknown"; } })();
    return [...snapshot.localStorageKeys.map((key) => `${origin}|localStorage|${key}`),
      ...snapshot.sessionStorageKeys.map((key) => `${origin}|sessionStorage|${key}`)];
  });
  return {
    cookies: uniqueSorted([...cookies.map((event) => JSON.stringify([event.cookieName, event.cookieDomain ?? event.hostname, event.cookiePath ?? "/"])),
      ...(bundle?.cookieSnapshots ?? []).flatMap((snapshot) => snapshot.cookies.map((cookie) => JSON.stringify([cookie.name, cookie.domain, cookie.path ?? "/"])))]),
    webStorage: uniqueSorted(storage),
    trackers: classified(new Set(["advertising", "marketing", "analytics", "session_replay"])),
    advertisingOrMeasurementActivity: classified(new Set(["advertising", "marketing", "analytics", "session_replay", "performance_monitoring"])),
    advertisingOrMarketingActivity: classified(new Set(["advertising", "marketing"])),
    consentOrCmpBehavior: classified(new Set(["consent_management"])),
  };
}

/** Versioned assessment; missing/failed worker evidence is explicitly unknown. */
export function buildGpcResponseAssessment(input: {
  baseline: CanonicalEvidenceBundle;
  baselineArtifact: GpcVerifiedArtifactPointer;
  generatedAt?: string;
  gpc?: CanonicalEvidenceBundle;
  gpcArtifact?: GpcVerifiedArtifactPointer;
  failureReason?: "gpc_worker_failed" | "gpc_artifact_unverifiable";
}): GpcResponseAssessmentV2 {
  const baselineProof = retainedSignal(input.baseline), gpcProof = retainedSignal(input.gpc);
  const deliveryLimits = new Set<string>(), coverageLimits = new Set<string>();
  const baselineLane = input.baseline.scanLaneRuns.find((run) => run.laneId === "runtime_evidence");
  const gpcLane = input.gpc?.scanLaneRuns.find((run) => run.laneId === "gpc_observation");
  const headerEvents = (input.gpc?.networkEvents ?? []).filter((event) => event.requestHeaders?.secGpc === "1");
  const headerEventIds = [...new Set(headerEvents.map((event) => event.eventId))].filter((id) => id.length > 0 && id.length <= 160).sort();
  if (headerEvents.some((event) => event.eventId.length === 0 || event.eventId.length > 160)) deliveryLimits.add("request_proof_identity_unverifiable");
  const mainRequest = (bundle: CanonicalEvidenceBundle | undefined, proof: GpcSignalObservation | null) =>
    bundle?.networkEvents.find((event) => event.isMainFrame === true && event.resourceType === "document" &&
      proof && safeHash(event.requestUrl) === proof.documentUrlSha256);
  if (!validReadback(baselineProof, false)) deliveryLimits.add("baseline_signal_readback_unverified");
  if (!validReadback(gpcProof, true)) deliveryLimits.add("gpc_signal_readback_unverified");
  if (!mainRequest(input.baseline, baselineProof) || input.baseline.networkEvents.some((event) => event.requestHeaders?.secGpc !== undefined)) {
    deliveryLimits.add("baseline_gpc_off_not_verified");
  }
  if (mainRequest(input.gpc, gpcProof)?.requestHeaders?.secGpc !== "1") deliveryLimits.add("main_document_sec_gpc_not_retained");
  if (input.gpc?.networkEvents.some((event) => event.requestHeaders?.secGpc !== "1")) deliveryLimits.add("gpc_request_signal_incomplete");
  if (input.failureReason) coverageLimits.add(input.failureReason);
  if (!input.gpc || !input.gpcArtifact) coverageLimits.add("gpc_evidence_unavailable");
  if (!input.baseline.scanId || input.baseline.scanId !== input.gpc?.scanId || input.baseline.region !== input.gpc?.region) {
    coverageLimits.add("paired_scan_context_mismatch");
  }
  if (!baselineProof || !gpcProof || baselineProof.contextConfigSha256 !== gpcProof.contextConfigSha256) coverageLimits.add("browser_protocol_mismatch");
  if (!baselineProof || !gpcProof || baselineProof.documentUrlSha256 !== gpcProof.documentUrlSha256 ||
    safeHash(baselineLane?.firstEffectiveUrl ?? input.baseline.normalizedUrl) !== baselineProof.documentUrlSha256 ||
    safeHash(gpcLane?.firstEffectiveUrl ?? input.gpc?.normalizedUrl) !== gpcProof.documentUrlSha256) {
    coverageLimits.add("baseline_gpc_document_mismatch");
  }
  for (const [label, bundle, lane] of [["baseline", input.baseline, baselineLane], ["gpc", input.gpc, gpcLane]] as const) {
    if (lane?.accessOutcome !== "representative_page") coverageLimits.add(`${label}_not_representative`);
    if (bundle?.runtimeCoverage?.coverageStatus !== "usable") coverageLimits.add(`${label}_runtime_coverage_insufficient`);
    const runtime = bundle?.modulesRun.find((module) => module.moduleName === "preConsentRuntimeScanner");
    if (runtime?.status !== "completed" || !runtime.timingBreakdown?.some((timing) =>
      timing.label === "passive evidence quiet wait" && timing.outcome === "completed")) coverageLimits.add(`${label}_settle_not_completed`);
  }
  const throughMs = baselineProof && gpcProof ? Math.min(
    baselineProof.capturedAtMs - baselineProof.documentStartedAtMs, gpcProof.capturedAtMs - gpcProof.documentStartedAtMs) : null;
  if (throughMs === null || throughMs < 250) coverageLimits.add("paired_observation_window_insufficient");
  const b = comparableInventory(input.baseline, baselineProof, throughMs), g = comparableInventory(input.gpc, gpcProof, throughMs);
  const deltas = {
    cookies: compareGpcSets(b.cookies, g.cookies), webStorage: compareGpcSets(b.webStorage, g.webStorage),
    trackers: compareGpcSets(b.trackers, g.trackers),
    advertisingOrMeasurementActivity: compareGpcSets(b.advertisingOrMeasurementActivity, g.advertisingOrMeasurementActivity),
    advertisingOrMarketingActivity: compareGpcSets(b.advertisingOrMarketingActivity, g.advertisingOrMarketingActivity),
    consentOrCmpBehavior: compareGpcSets(b.consentOrCmpBehavior, g.consentOrCmpBehavior),
  };
  const limitationKeys = [...deliveryLimits, ...coverageLimits];
  const comparable = limitationKeys.length === 0;
  const reduced = deltas.trackers.baselineOnlyCount > 0 && deltas.trackers.gpcOnlyCount === 0;
  const status = !comparable ? "indeterminate" : reduced ? "responsive" : "no_observable_response";
  return gpcResponseAssessmentV2Schema.parse({
    contractVersion: GPC_RESPONSE_ASSESSMENT_CONTRACT_VERSION, generatedAt: input.generatedAt ?? new Date().toISOString(),
    status, findingTitle: status === "no_observable_response" ? "No observable GPC response" : "GPC response",
    scoreEffect: "none", legalInterpretation: "not_assessed",
    comparison: {
      comparable, protocol: "passive_baseline_with_sec_gpc",
      baselineArtifact: { lane: "runtime_evidence", ...input.baselineArtifact },
      gpcArtifact: input.gpcArtifact ? { lane: "gpc_observation", ...input.gpcArtifact } : null,
      enabledProof: { secGpcHeaderValue: headerEvents.length ? "1" : null, requestsWithSecGpc: headerEvents.length,
        requestEventIds: headerEventIds.slice(0, 100),
        navigatorGlobalPrivacyControl: gpcProof?.frames.find((frame) => frame.mainFrame)?.navigatorValue ?? null },
      delivery: { status: deliveryLimits.size === 0 ? "verified" : gpcProof ? "limited" : "unavailable", baseline: baselineProof, gpc: gpcProof },
      coverage: { status: coverageLimits.size === 0 ? "complete" : input.gpc ? "limited" : "unavailable", comparedThroughMs: throughMs === null ? null : Math.max(0, throughMs) },
      responseBasis: !comparable ? "insufficient_evidence" : reduced ? "qualified_activity_reduction" : "no_qualified_reduction",
      deltas, limitationKeys: limitationKeys.slice(0, 24),
      evidenceRefs: uniqueSorted([input.baselineArtifact.uri, ...(input.gpcArtifact ? [input.gpcArtifact.uri] : []),
        ...headerEvents.slice(0, 30).map((event) => event.eventId)]).slice(0, 32),
    },
  });
}
