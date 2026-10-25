/** CertScore.ai audit diagnostics only. Never creates product findings or scores. */
export const RELIABILITY_VERSION = "certscore.daily-reliability.v1";
export type Obj = Record<string, unknown>;
export const obj = (v: unknown): Obj => v !== null && typeof v === "object" && !Array.isArray(v) ? v as Obj : {};
export const arr = (v: unknown): unknown[] => Array.isArray(v) ? v : [];
export const label = (v: unknown): string => typeof v === "string" && /^[a-zA-Z0-9_.: -]{1,160}$/.test(v) ? v : "unknown";
export const reasons = (v: unknown): string[] => [...new Set(arr(v).map(label))].sort().slice(0, 64);
export const tally = (values: string[]) => Object.fromEntries([...new Set(values)].sort().map(k => [k, values.filter(v => v === k).length]));
export const CONTROLS = ["accept", "reject", "options", "privacyOptOut"] as const;
export const AREAS = ["control_identification", "accept_execution", "reject_execution", "post_choice_activity", "gpc", "explicit_opt_out", "privacy_links", "cmp_recognition", "cmp_details", "policy", "vendor_coverage", "runtime", "publication"] as const;
export type Facet = { state: string; reasons: string[]; counts: Record<string, number> };
export const facet = (state: unknown, why: unknown = [], counts: Record<string, number> = {}): Facet => ({ state: label(state), reasons: reasons(why), counts });
export type Action = { packet: string; click: string; registration: string; observation: string; reasons: string[] };
export type Row = {
  scanId: string; site: string; createdAt: string; completedAt?: string; source: string; region: string; status: string;
  cohort: "ordinary" | "routine_canary" | "excluded_test" | "classification_unknown";
  producer: string; profile: string; provider: string; assessmentVersion: string; projectionVersion: string;
  reportability: "reportable" | "no_go" | "failed" | "unknown";
  bundleVerification: string; projectionVerification: string;
  controls: Record<string, { state: string; reasons: string[] }>;
  facets: Record<string, Facet>; actions: Record<string, Action>;
  cmpRows: { id: string; state: string }[]; sourceRefs: { file: string; sha256: string; bytes: number }[];
};
export function classifyTraffic(inventory: Obj, bundle?: Obj): Row["cohort"] {
  const traffic = String(inventory.traffic_class ?? ""), config = obj(inventory.lambda_config);
  if (/^(?:routine_canary|canary)$/.test(traffic)) return "routine_canary";
  if (/^(?:test|synthetic|fixture|diagnostic|internal)$/.test(traffic) || config.localOnly === true || config.simulatedLocalLambda === true ||
      (typeof config.targetEnvironment === "string" && config.targetEnvironment !== "production")) return "excluded_test";
  try {
    const url = new URL(String(bundle?.url ?? inventory.url ?? inventory.target_url));
    if (url.pathname.startsWith("/.well-known/certscore-canary/")) return "routine_canary";
    if (url.protocol !== "https:" && url.protocol !== "http:") return "classification_unknown";
  } catch { return "classification_unknown"; }
  return config.targetEnvironment === "production" && ["sdk", "mcp", "other_api", "marketing-full-scan"].includes(String(inventory.source))
    ? "ordinary" : "classification_unknown";
}
function counts(value: Obj, keys: string[]): Record<string, number> {
  return Object.fromEntries(keys.flatMap(k => Number.isSafeInteger(value[k]) && Number(value[k]) >= 0 ? [[k, Number(value[k])]] : []));
}
export function sourceFacets(bundle: Obj, manifest: Obj, support: Obj): Record<string, Facet> {
  const gpc = obj(bundle.gpcResponseAssessment), observation = obj(gpc.observation), requests = obj(observation.requests);
  const comparison = obj(gpc.comparison), delivery = obj(observation.delivery), registration = obj(observation.registration);
  const inspection = obj(bundle.policySurfaceInspection), choices = obj(inspection.privacyChoiceInspection);
  const runtime = obj(bundle.runtimeCoverage), cmp = obj(bundle.cmpPreferencesEvidence), timing = obj(support.laneTimingSummary);
  const profile = manifest.privacyCaptureProfile;
  const lanes = arr(support.workerLanes), cmpDeclared = typeof support.cmpPreferenceInspection === "object" && support.cmpPreferenceInspection !== null;
  const dispatchRecorded = lanes.includes("cmp_preferences") || cmpDeclared;
  const cmpState = profile === "presence_only_six_workers.v1" ? dispatchRecorded ? "profile_dispatch_conflict" : "intentionally_omitted"
    : dispatchRecorded ? "dispatch_recorded" : "dispatch_unknown";
  const proof = obj(requests.captureDiagnostics ?? requests.diagnostics);
  const vendors = arr(bundle.normalizedVendorObservations).map(obj);
  return {
    gpc_observation: facet(observation.status, observation.limitationKeys),
    gpc_header: facet(delivery.httpHeaderRetained === true ? "retained" : delivery.httpHeaderRetained === false ? "not_retained" : "not_checked"),
    gpc_navigator: facet(delivery.mainNavigatorReadbackRetained === true ? "retained" : delivery.mainNavigatorReadbackRetained === false ? "not_retained" : "not_checked"),
    gpc_delivery: facet(obj(comparison.delivery).status),
    gpc_comparison: facet(typeof comparison.comparable === "boolean" ? comparison.comparable ? "comparable" : "not_comparable" : "not_checked", obj(comparison.coverage).limitationKeys),
    gpc_semantic: facet(observation.semanticProbe),
    gpc_sale: facet(registration.sale), gpc_sharing: facet(registration.sharing),
    gpc_request_inventory: facet(typeof requests.complete === "boolean" ? requests.complete ? "complete" : "limited" : "not_checked", [], counts(requests, ["count", "classifiedCount", "collectionCount", "advertisingCollectionCount"])),
    gpc_proof_diagnostics: facet(Object.keys(proof).length ? "retained" : "not_checked", [], counts(proof, ["obsoleteDocumentDropped", "capEvicted", "inspectionFailures"])),
    cmp_dispatch: facet(cmpState), cmp_capture: facet(cmp.status, cmp.limitations),
    cmp_runtime_recognition: facet(Array.isArray(bundle.cmpRuntimeObservations) ? bundle.cmpRuntimeObservations.length ? "recognition_retained" : "no_recognition_retained" : "not_checked"),
    privacy_links: facet(choices.coverage, obj(choices.diagnostics).limitations, counts(choices, ["namedChoiceCandidateCount", "unnamedControlCount", "hiddenUnnamedControlCount", "uninspectedFrameCount", "uninspectedShadowRootCount"])),
    policy_capture: facet(inspection.coverageStatus, inspection.limitationKeys),
    runtime: facet(runtime.coverageStatus, runtime.limitationKeys),
    lane_terminal: facet(Array.isArray(timing.lanes) ? arr(timing.lanes).length > 0 && arr(timing.lanes).every(v => !!obj(v).terminalOutcomeObservedAt) ? "all_recorded_terminal" : "incomplete" : "not_checked"),
    explicit_opt_out: facet("not_checked", ["no_verified_packet_adapter"]),
    vendor_coverage: facet(Array.isArray(bundle.normalizedVendorObservations) ? "retained_observations_only" : "not_checked", ["recognition_is_not_finding_recall"], {
      retainedObservations: vendors.length, unresolvedPurpose: vendors.filter(v => v.purpose === "unknown" || v.purpose === undefined).length,
    }),
    collection_surfaces: facet(Array.isArray(bundle.collectionSurfaceObservations) ? "retained_observations_only" : "not_checked", [], {
      retainedObservations: arr(bundle.collectionSurfaceObservations).length,
    }),
    ...Object.fromEntries(arr(timing.lanes).map(obj).filter(v => /^[a-z_]{1,64}$/.test(String(v.lane))).map(v => [`lane_${v.lane}`, facet(v.outcome, [], {
      ...counts(v, ["coordinatorElapsedMs", "workerReportedHandlerDurationMs"]),
      ...(Number.isSafeInteger(v.coordinatorElapsedMs) && Number(v.coordinatorElapsedMs) >= 0 ? { durationMs: Number(v.coordinatorElapsedMs) } : {}),
    })])),
  };
}
export function actionFacts(packet?: Obj): Action {
  if (!packet) return { packet: "unavailable", click: "not_checked", registration: "not_checked", observation: "not_checked", reasons: [] };
  const capture = obj(packet.afterActionCapture), registration = obj(packet.acceptanceRegistration ?? packet.refusalRegistration ?? packet.registration);
  const click = obj(obj(packet.interactionDiagnostics).click).outcome;
  const activation = capture.activationStatus;
  const clickState = typeof click === "string" && typeof activation === "string" && click !== activation ? "conflicting_click_diagnostics"
    : click ?? activation ?? "not_checked";
  // A terminal capture is not evidence that a choice registered or was honored.
  return { packet: "verified", click: label(clickState),
    registration: label(registration.status), observation: label(capture.stopReason ?? obj(packet.timing).observationExitReason ?? "not_checked"), reasons: reasons(packet.limitations) };
}
export function applyAssessment(row: Row, assessment: Obj, projection: Obj): Row {
  const scan = obj(assessment.scan);
  if (scan.scanId !== row.scanId || typeof scan.noGo !== "boolean") throw Error("Assessment identity/disposition unavailable");
  const result = structuredClone(row);
  result.reportability = row.status !== "completed" ? "failed" : scan.noGo ? "no_go" : "reportable";
  result.assessmentVersion = label(obj(assessment.provenance).projectorVersion ?? assessment.artifactVersion);
  result.projectionVerification = "canonical_persisted_reader";
  result.projectionVersion = label(projection.version);
  result.controls = Object.fromEntries(CONTROLS.map(k => {
    const control = obj(obj(assessment.controls)[k]);
    return [k, { state: ["observed", "not_observed", "unknown"].includes(String(control.state)) ? String(control.state) : "not_checked", reasons: reasons(control.reasonCodes) }];
  }));
  const cmp = obj(assessment.cmpAudit);
  result.provider = label(obj(cmp.support).provider);
  result.facets.cmp_recognition = facet(obj(cmp.support).state, [obj(cmp.support).reason]);
  result.cmpRows = arr(cmp.rows).map(v => ({ id: label(obj(v).id), state: label(obj(v).status) }));
  return result;
}
export function stratum(row: Row): string {
  return JSON.stringify([row.producer, row.region, row.profile, row.provider, row.source, row.assessmentVersion, row.projectionVersion]);
}
export type Rate = { numerator: number; denominator: number; rate: number | null; definition: string };
export const rate = (numerator: number, denominator: number, definition: string): Rate => ({ numerator, denominator, rate: denominator ? numerator / denominator : null, definition });
function distribution(values: number[]) {
  const sorted = values.filter(v => Number.isFinite(v) && v >= 0).sort((a,b) => a-b);
  return { samples: sorted.length, p50Ms: sorted.length ? sorted[Math.ceil(sorted.length * .5) - 1]! : null,
    p95Ms: sorted.length ? sorted[Math.ceil(sorted.length * .95) - 1]! : null };
}
export function summarizeRows(rows: Row[]) {
  const ordinary = rows.filter(r => r.cohort === "ordinary"), completed = ordinary.filter(r => r.status === "completed");
  const gpcEligible = completed.filter(r => r.facets.gpc_dispatch?.state === "enabled");
  const reportable = ordinary.filter(r => r.reportability === "reportable");
  const controls = Object.fromEntries(CONTROLS.map(c => [c, {
    states: tally(reportable.map(r => r.controls[c]?.state ?? "not_checked")),
    unknown: rate(reportable.filter(r => r.controls[c]?.state === "unknown").length, reportable.length, "unknown internal control states / ordinary reportable scans with canonical readable disposition"),
    reasons: tally(reportable.flatMap(r => r.controls[c]?.state === "unknown" ? [...new Set(r.controls[c]!.reasons)] : [])),
  }]));
  const facetCounts = Object.fromEntries([...new Set(ordinary.flatMap(r => Object.keys(r.facets)))].sort().map(k => [k, {
    states: tally(ordinary.map(r => r.facets[k]?.state ?? "not_checked")),
    reasons: tally(ordinary.flatMap(r => [...new Set(r.facets[k]?.reasons ?? [])])),
    retainedCounters: Object.fromEntries([...new Set(ordinary.flatMap(r => Object.keys(r.facets[k]?.counts ?? {})))].sort().map(counter => [counter, {
      scansWithCounter: ordinary.filter(r => typeof r.facets[k]?.counts[counter] === "number").length,
      total: ordinary.reduce((n, r) => n + (r.facets[k]?.counts[counter] ?? 0), 0),
    }])),
  }]));
  const actions = Object.fromEntries(["accept", "reject"].map(k => {
    const packets = ordinary.filter(r => r.actions[k]?.packet === "verified"), clicks = packets.filter(r => r.actions[k]?.click === "completed");
    return [k, { packetStates: tally(ordinary.map(r => r.actions[k]?.packet ?? "not_checked")), clickStates: tally(packets.map(r => r.actions[k]!.click)), completedClicks: clicks.length,
      registrationAcrossVerifiedPackets: tally(packets.map(r => r.actions[k]!.registration)),
      registrationAmongCompletedClicks: tally(clicks.map(r => r.actions[k]!.registration)),
      confirmedRegistration: rate(clicks.filter(r => r.actions[k]?.registration === "confirmed").length, clicks.length, "confirmed registration / retained completed clicks; not website effectiveness or action accuracy"),
      observationStops: tally(packets.map(r => r.actions[k]!.observation)), reasons: tally(packets.flatMap(r => [...new Set(r.actions[k]!.reasons)])) }];
  }));
  const cmpRows = ordinary.flatMap(r => r.cmpRows);
  const gaps = gpcEligible.filter(r => ["limited", "unavailable"].includes(r.facets.gpc_observation?.state ?? ""));
  return { population: { inventory: rows.length, cohorts: tally(rows.map(r => r.cohort)), ordinaryAttempts: ordinary.length,
    uniqueOrdinarySites: new Set(ordinary.map(r => r.site)).size,
    ordinaryCompleted: completed.length, ordinaryReportable: reportable.length, reportability: tally(ordinary.map(r => r.reportability)),
    bundleVerification: tally(ordinary.map(r => r.bundleVerification)), projectionVerification: tally(ordinary.map(r => r.projectionVerification)) },
    priorities: { arUnknowns: controls, gpcGaps: { dispatch: tally(completed.map(r => r.facets.gpc_dispatch?.state ?? "unknown")), eligibleCompleted: gpcEligible.length,
      states: tally(gpcEligible.map(r => r.facets.gpc_observation?.state ?? "not_checked")),
      limitedOrUnavailable: rate(gaps.length, gpcEligible.length, "limited/unavailable GPC observation / ordinary completed attempts explicitly enabled for GPC; not signal honoring"),
      gapsByReportability: tally(gaps.map(r => r.reportability)),
      gapsByRuntimeCoverage: tally(gaps.map(r => r.facets.runtime?.state ?? "not_checked")),
      measurementUnavailable: gpcEligible.filter(r => !r.facets.gpc_observation || ["unknown", "not_checked"].includes(r.facets.gpc_observation.state)).length,
      reasons: tally(gaps.flatMap(r => [...new Set(r.facets.gpc_observation?.reasons ?? [])])) },
      cmpCoverage: { dispatch: tally(completed.map(r => r.facets.cmp_dispatch?.state ?? "not_checked")),
        rowStates: tally(cmpRows.map(r => r.state)), rowStatesByCheck: Object.fromEntries([...new Set(cmpRows.map(r => r.id))].sort().map(id => [id, tally(cmpRows.filter(r => r.id === id).map(r => r.state))])),
        dispatchedRows: tally(completed.filter(r => r.facets.cmp_dispatch?.state === "dispatch_recorded").flatMap(r => r.cmpRows.map(c => c.state))) } },
    actions, facets: facetCounts,
    timings: Object.fromEntries([...new Set(ordinary.flatMap(r => Object.keys(r.facets).filter(k => k.startsWith("lane_") || k === "publication_latency")))].sort().map(k => [k,
      distribution(ordinary.flatMap(r => { const value = r.facets[k]?.counts.durationMs; return typeof value === "number" ? [value] : []; }))])),
    precision: null, recall: null, websiteHonoringRate: null,
    interpretation: "Coverage and retained assessment counts only; not human-adjudicated accuracy. Independent sessions are not a strict funnel. Unconfirmed registration does not veto independently supported findings." };
}
export type Summary = ReturnType<typeof summarizeRows>;
export function compareRows(current: Row[], previous: Row[]) {
  // Same scan IDs are overlap/replays, never independent new exposure.
  const priorIds = new Set(previous.map(r => r.scanId));
  const fresh = current.filter(r => !priorIds.has(r.scanId) && r.cohort === "ordinary");
  const keys = [...new Set(fresh.map(stratum))].filter(k => previous.some(r => r.cohort === "ordinary" && stratum(r) === k));
  const comparable = keys.filter(k => !JSON.parse(k).includes("unknown"));
  return { overlappingScanIds: current.filter(r => priorIds.has(r.scanId)).length,
    matchedStrata: comparable.map(key => {
      const now = summarizeRows(fresh.filter(r => stratum(r) === key)), before = summarizeRows(previous.filter(r => r.cohort === "ordinary" && stratum(r) === key));
      return { key: JSON.parse(key), current: now, previous: before,
        controlUnknownRateChanges: Object.fromEntries(CONTROLS.map(c => {
          const a = now.priorities.arUnknowns[c]!.unknown, b = before.priorities.arUnknowns[c]!.unknown;
          const completeMeasurement = !now.priorities.arUnknowns[c]!.states.not_checked && !before.priorities.arUnknowns[c]!.states.not_checked;
          return [c, { current: a, previous: b, percentagePointChange: !completeMeasurement || a.rate === null || b.rate === null ? null : 100 * (a.rate - b.rate),
            status: completeMeasurement ? "descriptive_only_no_accuracy_claim" : "not_comparable_missing_control_measurement" }];
        })) };
    }),
    status: comparable.length ? "descriptive_matched_strata_only" : "not_comparable",
    causalImprovementClaim: false, note: "No aggregate improvement claim across versions or traffic mix. Unknown version/profile/provider strata are not comparable; disclose small denominators and unique-site concentration." };
}
export function prioritize(rows: Row[]) {
  const ordinary = rows.filter(r => r.cohort === "ordinary"), candidates: { scanId: string; priority: number; area: string; reason: string }[] = [];
  for (const row of ordinary) {
    for (const c of ["reject", "accept", "options"]) if (row.reportability === "reportable" && row.controls[c]?.state === "unknown")
      candidates.push({ scanId: row.scanId, priority: c === "options" ? 2 : 1, area: "control_identification", reason: `${c}_unknown` });
    for (const lane of ["accept", "reject"]) if (row.actions[lane]?.click === "completed" && row.actions[lane]?.registration === "unconfirmed")
      candidates.push({ scanId: row.scanId, priority: 1, area: `${lane}_execution`, reason: "registration_unconfirmed_after_completed_click" });
    if (row.status === "completed" && row.facets.gpc_dispatch?.state === "enabled" && ["limited", "unavailable", "not_checked", "unknown"].includes(row.facets.gpc_observation?.state ?? "not_checked"))
      candidates.push({ scanId: row.scanId, priority: 2, area: "gpc", reason: `observation_${row.facets.gpc_observation?.state ?? "not_checked"}` });
    if ((row.facets.gpc_body_outcomes?.counts.unsupported ?? 0) > 0)
      candidates.push({ scanId: row.scanId, priority: 2, area: "gpc", reason: "unsupported_retained_body_format" });
    if (row.facets.cmp_dispatch?.state === "profile_dispatch_conflict" || row.facets.cmp_dispatch?.state === "dispatch_recorded" && row.cmpRows.some(r => ["not_assessed", "incomplete"].includes(r.state)))
      candidates.push({ scanId: row.scanId, priority: 3, area: "cmp_details", reason: "dispatched_but_limited" });
  }
  return candidates.sort((a, b) => a.priority - b.priority || a.scanId.localeCompare(b.scanId) || a.reason.localeCompare(b.reason));
}
