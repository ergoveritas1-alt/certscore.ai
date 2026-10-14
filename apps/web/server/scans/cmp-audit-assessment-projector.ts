import { createHash } from "node:crypto";
import { possibleCmpCookieTemplate, cmpBasicEvidenceSchema, type CmpPreferencesEvidence, verifyConsentControlInspection, projectPostAcceptEvidenceForReport, projectPostRefusalEvidenceForReport, cmpAuditAssessmentSchema, cmpCookieExpiryEvidenceSchema, cmpAuditCriterionSchema, cmpPreferencesEvidenceSchema, type CanonicalEvidenceBundle, type CmpAuditAssessment, type ExtendedCmpCriterion } from "@certscore/contracts";
import { resolveCanonicalCookieKnowledge } from "@certscore/vendor-resolver";
import { KNOWN_CMP_REGISTRY, isKnownCmpCookieName } from "@website-signal-risk-scanner/shared";

/** Materialize only from the coordinator's verified canonical bundle. Browser
 * observations stay distinct from product capability and legal adequacy. */
function derivePreferenceAuditAssessment(bundle: CanonicalEvidenceBundle, geometry: Record<string, unknown> | null | undefined, observations: ReturnType<typeof retainedChoiceCaptures>): CmpAuditAssessment | undefined {
  const parsed = cmpPreferencesEvidenceSchema.safeParse(bundle.cmpPreferencesEvidence);
  if (!parsed.success) {
    const outcome = bundle.cmpPreferenceLaneOutcome;
    if (!outcome || outcome.status !== "limited" || !outcome.limitationCode) return undefined;
    // Coordinator outcomes are coverage telemetry, never substituted browser evidence.
    const fallback = cmpAuditAssessmentSchema.parse({ version: "cmp_audit_assessment.v6", scanId: bundle.scanId,
      sourceSha256: createHash("sha256").update(JSON.stringify({ version: "cmp_audit_assessment.v6", inventoryEvidencePolicy: "cmp_inventory_tables.v8", scanId: bundle.scanId, url: bundle.url, outcome, accept: bundle.postAcceptEvidence, reject: bundle.postRefusalEvidence })).digest("hex"),
      support: { state: "unknown", provider: null, recipeVersion: null, reason: outcome.limitationCode },
      rows: ([...cmpAuditCriterionSchema.options, "implementation", "prominence"] as const).map(id => ({ id, status: "not_assessed", detail: independentAuditDetails(bundle)[id] ?? "Preference evidence was not retained; this criterion could not be assessed.", evidenceRefs: [] })) });
    const expiries = applyClientFacts(bundle, (id, status, detail, refs = []) => Object.assign(fallback.rows.find(row => row.id === id)!, { status, detail: detail.slice(0, 500), evidenceRefs: refs }), fallback.rows, observations);
    if (expiries.length) fallback.rows.find(row => row.id === "duration")!.inventory = { expiries };
    applyChoiceActivity(bundle, (id, status, detail, refs = []) => Object.assign(fallback.rows.find(row => row.id === id)!, { status, detail, evidenceRefs: refs }), fallback.rows, observations.filter(capture => capture.networkCompleted));
    for (const row of fallback.rows) if (["categories", "services", "privacy_access", "declared_not_found", "found_not_declared", "cookie_information"].includes(row.id) && row.status === "not_assessed")
      Object.assign(row, { status: "incomplete", detail: "This check depends on the incomplete preference inspection.", evidenceRefs: ["CanonicalEvidenceBundle.json"], limitation: { group: "preferences", code: outcome.limitationCode } });
    applyActionLimitations(bundle, fallback.rows);
    applyVisualLimitations(bundle, fallback.rows, geometry);
    fallback.sourceSha256 = createHash("sha256").update(JSON.stringify({ version: fallback.version, targetUrl: bundle.url, startedAt: bundle.startedAt,
      outcome, cookies: bundle.cookieEvents, snapshots: bundle.cookieSnapshots, coverage: bundle.runtimeCoverage,
      accept: bundle.postAcceptEvidence, reject: bundle.postRefusalEvidence, actionOutcomes: [bundle.postAcceptLaneOutcome, bundle.postRefusalLaneOutcome], rows: fallback.rows })).digest("hex");
    return cmpAuditAssessmentSchema.parse(fallback);
  }
  if (parsed.data.scanId !== bundle.scanId || parsed.data.targetUrl !== bundle.url) return undefined;
  const evidence = parsed.data;
  const rows: CmpAuditAssessment["rows"] = ([...cmpAuditCriterionSchema.options, "implementation", "prominence"] as const).map(id => ({ id, status: "not_assessed", detail: "", evidenceRefs: [] }));
  const set = (id: ExtendedCmpCriterion, status: CmpAuditAssessment["rows"][number]["status"], detail: string, refs: string[] = ["CmpPreferencesEvidencePacket.json"]) => Object.assign(rows.find(row => row.id === id)!, { status, detail: detail.slice(0, 500), evidenceRefs: refs });
  const bound = Boolean(evidence.documentToken && evidence.finalUrl === evidence.targetUrl && !evidence.limitations.includes("preference_document_changed"));
  const usable = bound && evidence.status === "completed";
  const checkpoint = evidence.checkpoints;
  const partial = bound && evidence.status === "limited" && checkpoint?.version === "cmp_partial_capture.v1" && checkpoint.documentToken === evidence.documentToken;
  const controlsUsable = usable || (partial && checkpoint?.controls);
  const declarationsUsable = usable || (partial && checkpoint?.declarations);
  const privacyUsable = usable || (partial && checkpoint?.privacyLinks);
  const timeout = evidence.limitations.some(reason => reason === "preference_budget_exhausted" || reason === "preference_operation_timed_out");
  set("categories", "not_assessed", timeout ? "Inspection timed out before selectable category controls could be verified." : "Selectable category controls were not verified in the inspected surface.", []);
  set("services", "not_assessed", timeout && !declarationsUsable && !controlsUsable ? "Preference inspection timed out before individual-service information could be retained." : evidence.limitations.includes("deeper_preference_sections_not_opened") ? "Service names were not captured. Cookie names were retained, but deeper service sections were not inspected." : "No individual service names were retained by this CMP inspection.", []);
  set("privacy_access", "not_assessed", timeout && !privacyUsable ? "Preference inspection timed out before pre-choice privacy-link reachability could be verified." : "A privacy-policy link was not verified as reachable before consent interaction.", []);
  set("consent_record", "not_assessed", "No browser consent record was retained after a completed choice check.", []);
  set("duration", "not_assessed", "A bound consent-cookie expiry was not captured.", []);
  set("declared_not_found", "not_assessed", "Comparison requires retained declarations and a usable pre-consent cookie capture.", []);
  set("found_not_declared", "not_assessed", "The configured CMP cookie inventory could not be verified as complete; missing declarations cannot be inferred from a partial list.", []);
  set("cookie_information", "not_assessed", timeout ? "Inspection timed out before cookie purpose and duration information could be verified." : "Cookie purpose and duration information was not retained.", []);

  const accept = bundle.postAcceptEvidence;
  const reject = bundle.postRefusalEvidence;
  const accepted = accept?.parentScanId === bundle.scanId && accept.normalizedUrl === evidence.targetUrl && accept.productionProjectable && accept.acceptanceRegistration.status === "confirmed";
  for (const [id, detail] of Object.entries(independentAuditDetails(bundle))) set(id as ExtendedCmpCriterion, "not_assessed", detail, ["CanonicalEvidenceBundle.json"]);
  const expiries = applyClientFacts(bundle, set, rows, observations, bound ? configuredCookieNames(evidence.support.provider, evidence.configuredConsentCookies) : []);
  if (expiries.length) rows.find(row => row.id === "duration")!.inventory = { expiries };
  applyChoiceActivity(bundle, set, rows, observations.filter(capture => capture.networkCompleted));
  applyInventoryFacts(bundle, evidence, { controlsUsable, declarationsUsable, privacyUsable, usable }, rows, set, observations);
  applyActionLimitations(bundle, rows);
  applyVisualLimitations(bundle, rows, geometry);
  const failedPreference = evidence.status !== "completed" && evidence.support.state !== "unsupported" && evidence.support.reason !== "bounded_visible_preference_inspection";
  if (failedPreference) for (const row of rows) {
    const checkpointMissing = row.id === "categories" ? !controlsUsable : row.id === "privacy_access" ? !privacyUsable
      : ["services", "declared_not_found", "found_not_declared", "cookie_information"].includes(row.id) ? !declarationsUsable && !controlsUsable : false;
    if (row.status === "not_assessed" && checkpointMissing) Object.assign(row, { status: "incomplete",
      detail: "This check depends on the incomplete preference inspection.", evidenceRefs: ["CmpPreferencesEvidencePacket.json"],
      limitation: { group: "preferences", code: evidence.support.reason } });
  }
  return cmpAuditAssessmentSchema.parse({ version: "cmp_audit_assessment.v6", scanId: bundle.scanId,
    sourceSha256: createHash("sha256").update(JSON.stringify({ version: "cmp_audit_assessment.v6", cookieComparisonPolicy: "cookie_name_comparison_details.v3", inventoryEvidencePolicy: "cmp_inventory_tables.v8", targetUrl: bundle.url, startedAt: bundle.startedAt, actionOutcomes: [bundle.postAcceptLaneOutcome, bundle.postRefusalLaneOutcome], rows, evidence, accept, reject, cookies: bundle.cookieEvents, snapshots: bundle.cookieSnapshots, coverage: bundle.runtimeCoverage, policies: bundle.policySurfaceObservations })).digest("hex"), support: evidence.limitations.includes("preference_budget_exhausted")
      ? { ...evidence.support, reason: "preference_budget_exhausted" } : evidence.support, rows });
}

function boundedCookieNames(names: string[]): string[] {
  const retained: string[] = [];
  let length = 0;
  for (const name of names.slice(0, 100)) {
    if (length + name.length > 500) break;
    retained.push(name); length += name.length;
  }
  return retained;
}

function comparableCookiePattern(pattern: string): boolean {
  return pattern.length > 0 && pattern.length <= 160 && !/[\[\]]/.test(pattern) && pattern !== "*";
}
function matchesCookieDeclaration(pattern: string, name: string): boolean {
  if (!comparableCookiePattern(pattern) || name.length > 160) return false;
  // Linear glob matching; no regex interpretation or unbounded backtracking.
  let p = 0, n = 0, star = -1, retry = 0;
  while (n < name.length) {
    if (pattern[p] === name[n]) { p++; n++; }
    else if (pattern[p] === "*") { star = p++; retry = n; }
    else if (star >= 0) { p = star + 1; n = ++retry; }
    else return false;
  }
  while (pattern[p] === "*") p++;
  return p === pattern.length;
}

/** These are bounded client observations, never an upgrade to audit adequacy or
 * semantic registration. They remain useful when the preference worker fails. */
function independentAuditDetails(bundle: CanonicalEvidenceBundle): Partial<Record<ExtendedCmpCriterion, string>> {
  const details: Partial<Record<ExtendedCmpCriterion, string>> = {};
  const actions = [
    { label: "Accept", packet: bundle.postAcceptEvidence, registration: bundle.postAcceptEvidence?.acceptanceRegistration.status },
    { label: "Reject", packet: bundle.postRefusalEvidence, registration: bundle.postRefusalEvidence?.refusalRegistration.status },
  ].filter(({ packet }) => packet?.parentScanId === bundle.scanId && packet.normalizedUrl === bundle.url);
  if (actions.length) details.consent_record = "No browser consent record was retained after a completed choice check.";
  const lifetimes = actions.flatMap(({ label, packet }) => packet!.storage.postAction
    .filter(item => item.storageType === "cookie" && isKnownCmpCookieName(item.name) && item.expiresAtEpochSeconds !== undefined && item.expiresAtEpochSeconds > 0 && item.capturedAtEpochSeconds !== undefined)
    .slice(0, 2).map(item => `${label} visit: ${item.name}, approximately ${Math.max(0, Math.round((item.expiresAtEpochSeconds! - item.capturedAtEpochSeconds!) / 86400))} days`));
  if (lifetimes.length) details.duration = `${lifetimes.join("; ")}. These are captured cookie expiries; confirmed choice lifetimes and appropriateness are not established.`.slice(0, 500);
  return details;
}

/** Verified browser facts only. These observed rows make no audit-adequacy,
 * enforcement, future persistence or duration-appropriateness claim. */
function configuredCookieNames(provider: string | null, cookies?: CmpPreferencesEvidence["configuredConsentCookies"]): string[] {
  const definition = KNOWN_CMP_REGISTRY.find(entry => entry.canonicalName === provider);
  return (cookies ?? []).filter(cookie => cookie.version === "cmp_configured_cookie_identity.v1" &&
    definition?.configuredConsentCookiePath === cookie.configurationPath).map(cookie => cookie.name);
}

function applyClientFacts(bundle: CanonicalEvidenceBundle, set: AuditSet, rows: CmpAuditAssessment["rows"], observations: ReturnType<typeof retainedChoiceCaptures>, configuredNames: string[] = []) {
  const knownCookie = (name: string) => isKnownCmpCookieName(name) || configuredNames.includes(name);
  const records = observations.flatMap(({ action, packet }) => packet.storage.postAction.filter(item => item.storageType === "cookie" &&
    knownCookie(item.name) && item.identityHash && item.valueHash).slice(0, 4).map(item => ({
      visit: action === "accept" ? "Accept" as const : "Reject" as const, name: item.name,
      change: packet.storage.preAction.some(before => before.storageType === item.storageType && before.identityHash === item.identityHash && before.name === item.name && before.valueHash && before.valueHash !== item.valueHash) ? "updated" as const : "stored" as const,
    })));
  if (records.length) {
    const visits = [...new Set(records.map(item => item.visit))];
    set("consent_record", "observed", `Browser consent records were stored or updated after ${visits.join(" and ")}.`, ["CanonicalEvidenceBundle.json"]);
    rows.find(row => row.id === "consent_record")!.inventory = { consentStorage: records };
  }
  const expiryCookies = observations.flatMap(({ action, packet }) => packet.storage.postAction.filter(item => item.storageType === "cookie" &&
    knownCookie(item.name) && item.identityHash && item.valueHash && Number.isFinite(item.expiresAtEpochSeconds) && item.expiresAtEpochSeconds! > 0 && Number.isFinite(item.capturedAtEpochSeconds))
    .slice(0, 2).map(item => ({ visit: action === "accept" ? "Accept" as const : "Reject" as const, item })));
  const baseline = bundle.runtimeCoverage?.coverageStatus === "usable" && Number.isFinite(Date.parse(bundle.startedAt))
    ? bundle.cookieSnapshots?.filter(snapshot => snapshot.consentStateAtTime === "pre_consent" && Number.isFinite(snapshot.capturedAtMs) && snapshot.capturedAtMs >= 0)
      .reduce<NonNullable<CanonicalEvidenceBundle["cookieSnapshots"]>[number] | undefined>((latest, snapshot) => !latest || snapshot.capturedAtMs > latest.capturedAtMs ? snapshot : latest, undefined) : undefined;
  const host = (() => { try { return new URL(bundle.url).hostname.toLowerCase(); } catch { return ""; } })();
  const baselineExpiries = (baseline?.cookies ?? []).flatMap(cookie => {
    if (!knownCookie(cookie.name) || typeof cookie.domain !== "string" || typeof cookie.path !== "string" || typeof cookie.expires !== "number" || !Number.isFinite(cookie.expires)) return [];
    const domain = cookie.domain.replace(/^\./, "").toLowerCase();
    if (!domain || !host || !(host === domain || host.endsWith(`.${domain}`)) || !cookie.path.startsWith("/")) return [];
    const capturedAtEpochSeconds = (Date.parse(bundle.startedAt) + baseline!.capturedAtMs) / 1000;
    const parsed = cmpCookieExpiryEvidenceSchema.safeParse({ visit: "Before choice", name: cookie.name, domain: cookie.domain, path: cookie.path,
      capturedAtEpochSeconds, expiresAtEpochSeconds: cookie.expires, remainingSeconds: cookie.expires - capturedAtEpochSeconds });
    return parsed.success ? [parsed.data] : [];
  }).slice(0, 2);
  // Exact table evidence requires valid timestamp arithmetic and never asserts
  // the original configured life. Historical materializations are not rewritten.
  const afterChoiceExpiries = expiryCookies.flatMap(({ visit, item }) => {
    const parsed = cmpCookieExpiryEvidenceSchema.safeParse({ visit, name: item.name,
      capturedAtEpochSeconds: item.capturedAtEpochSeconds, expiresAtEpochSeconds: item.expiresAtEpochSeconds,
      remainingSeconds: item.expiresAtEpochSeconds! - item.capturedAtEpochSeconds! });
    return parsed.success ? [parsed.data] : [];
  });
  const expiries = [...baselineExpiries, ...afterChoiceExpiries].slice(0, 4);
  if (expiries.length) set("duration", "observed", "CMP cookie expiry was captured. This describes the stored cookie, not how long a consent choice remains effective.", ["CanonicalEvidenceBundle.json"]);
  return expiries;
}

/** Validated, source-bound path completion is independent of registration.
 * Legacy v1 after-click capture supports facts, never v2 Reject scoring. */
function retainedChoiceCaptures(bundle: CanonicalEvidenceBundle) {
  return (["accept", "reject"] as const).flatMap(action => {
    const packet = action === "accept" ? bundle.postAcceptEvidence : bundle.postRefusalEvidence;
    if (!packet || packet.parentScanId !== bundle.scanId || packet.normalizedUrl !== bundle.url || packet.cancellation?.requested) return [];
    try {
      const packetSha256 = createHash("sha256").update(JSON.stringify(packet)).digest("hex");
      const projection = action === "accept" ? projectPostAcceptEvidenceForReport({ packet: bundle.postAcceptEvidence!, packetSha256 })
        : projectPostRefusalEvidenceForReport({ packet: bundle.postRefusalEvidence!, packetSha256 });
      if (!projection.execution?.clickCompleted) return [];
      const after = projection.afterActionCapture, registered = projection.registeredObservationCompletion;
      const start = after?.actionDispatchedAtMs ?? registered?.startedAtMs;
      const end = after?.captureEndedAtMs ?? registered?.completedAtMs;
      const windowMs = after?.requestedWindowMs ?? (registered ? Math.min(registered.requiredWindowMs, registered.completedAtMs - registered.startedAtMs) : undefined);
      if (start === undefined || end === undefined || windowMs === undefined) return [];
      const requests = after ? projection.afterActionRequests ?? [] : packet.network.requests.filter(row => row.startedAtMs >= start && row.startedAtMs <= end);
      // A verified terminal snapshot is independent of network retention loss.
      // The validated projection binds dispatch, document, snapshot and end time.
      const storageCompleted = after ? after.activationStatus === "completed" && after.stopReason === "window_elapsed" && after.storageSnapshotRetained
        : projection.execution.observationCompleted;
      return [{ action, packet, windowMs, requests, start, storageCompleted, networkCompleted: projection.execution.observationCompleted }];
    } catch { return []; }
  });
}

/** These rows describe capture and classified requests within its window;
 * they do not assert effective refusal or complete storage instrumentation. */
function applyChoiceActivity(bundle: CanonicalEvidenceBundle, set: AuditSet, rows: CmpAuditAssessment["rows"], observations: ReturnType<typeof retainedChoiceCaptures>) {
  const count = observations.length;
  const reject = observations.find(item => item.action === "reject");
  const rejectRequests = reject?.requests.filter(item => item.nonEssential).length ?? 0;
  const description = reject ? rejectRequests
    ? `${rejectRequests} requests classified as non-essential were captured during the ${reject.windowMs / 1000}-second check after Reject.`
    : `No requests classified as non-essential were observed during the ${reject.windowMs / 1000}-second check after Reject.` : "";
  set("implementation", count === 2 ? "observed" : count === 1 ? "partially_assessed" : "not_assessed",
    count ? `${observations.map(item => `${item.action === "accept" ? "Accept" : "Reject"}: ${item.windowMs / 1000}-second activity check completed`).join(". ")}. ${description}`.trim()
      : "No completed activity check was retained after Accept or Reject.", count ? ["CanonicalEvidenceBundle.json"] : []);
  if (count) rows.find(row => row.id === "implementation")!.inventory = { choiceActivity: observations.map(({ action, requests, windowMs, start }) => ({
    action, windowMs, requestCount: requests.length, nonEssentialRequestCount: requests.filter(item => item.nonEssential).length,
    requests: requests.slice(0, 100).map(request => ({ hostname: request.hostname ?? new URL(request.sanitizedUrl).hostname, path: new URL(request.sanitizedUrl).pathname.slice(0, 2048),
      vendor: request.vendor ?? "Unidentified", purpose: request.purpose ?? "unknown", nonEssential: request.nonEssential, msAfterClick: request.startedAtMs - start })),
  })) };
}

function applyActionLimitations(bundle: CanonicalEvidenceBundle, rows: CmpAuditAssessment["rows"]) {
  const implementation = rows.find(row => row.id === "implementation");
  const failed = [bundle.postRefusalLaneOutcome, bundle.postAcceptLaneOutcome].find(outcome => outcome && ["timed_out", "failed", "unverifiable"].includes(outcome.status));
  if (implementation?.status === "not_assessed" && failed) Object.assign(implementation, { status: "incomplete",
    detail: "The action observation could not complete; post-action behavior remains unverified.", evidenceRefs: ["CanonicalEvidenceBundle.json"],
    limitation: { group: "actions", code: failed.limitationCode ?? "action_observation_incomplete" } });
}

/** Coverage of the already-retained paired image, independent of global image
 * availability. Called only during canonical materialization, never by UI. */
function applyVisualLimitations(bundle: CanonicalEvidenceBundle, rows: CmpAuditAssessment["rows"], geometry?: Record<string, unknown> | null) {
  const row = rows.find(row => row.id === "prominence");
  if (!row || !geometry || geometry.artifactVersion !== "consent_control_geometry.v1" || geometry.sourceScanner !== "consent_control_geometry_diagnostic" || geometry.pageUrl !== bundle.url) return;
  if (verifyConsentControlInspection(geometry.controlInspection, geometry.candidates)?.structuralCoverage !== "complete") return;
  const identity = geometry.documentIdentity as { source?: string; token?: string } | undefined;
  // The coordinator mirrors lane files into the parent artifact prefix. Match
  // the unique retained file identity together with loader and capture time;
  // a basename alone is never sufficient proof of the paired image.
  const fileName = (value: unknown) => typeof value === "string" ? value.replace(/\\/g, "/").split("/").pop() : undefined;
  const observedAtMs = typeof geometry.capturedAt === "string" ? Date.parse(geometry.capturedAt) - Date.parse(bundle.startedAt) : NaN;
  const images = bundle.screenshots?.filter(image => fileName(image.path) === fileName(geometry.screenshotArtifactRef) && image.url === bundle.url &&
    Number.isFinite(observedAtMs) && Math.abs(image.capturedAtMs - observedAtMs) <= 500 &&
    image.documentIdentity?.token === identity?.token && image.documentIdentity?.source === identity?.source && image.consentStateAtTime === "pre_consent");
  const image = images?.length === 1 ? images[0] : undefined;
  if (identity?.source !== "cdp_loader_id" || !identity.token || !image || !bundle.consentUiObservations?.some(observation => observation.documentUrl === bundle.url && observation.documentIdentity?.source === identity.source && observation.documentIdentity?.token === identity.token)) return;
  const candidates = Array.isArray(geometry.candidates) ? geometry.candidates as Record<string, unknown>[] : [];
  if (!["accept_all", "reject_all"].every(action => candidates.some(candidate => {
    const frame = candidate.frameContext as Record<string, unknown> | undefined;
    const bounds = candidate.boundingBox as Record<string, unknown> | undefined;
    return candidate.actionType === action && candidate.layer === "first_layer" && candidate.decisionStatus === "confirmed_visible" &&
      candidate.enabled === true && candidate.screenshotArtifactRef === geometry.screenshotArtifactRef && frame?.frameKind === "main_frame" && frame.frameUrl === bundle.url &&
      typeof bounds?.width === "number" && Number.isFinite(bounds.width) && bounds.width > 0 && typeof bounds.height === "number" && Number.isFinite(bounds.height) && bounds.height > 0;
  }))) return;
  const withheld = image.retentionStatus === "withheld" || image.displayStatus === "withheld";
  if (withheld || geometry.visualComparison === undefined) Object.assign(row, { status: "incomplete",
    detail: withheld ? "The paired screenshot did not complete safety review." : "Pixel-comparison measurements were not retained for the paired screenshot.",
    evidenceRefs: ["ConsentControlGeometryEvidence.json", "CanonicalEvidenceBundle.json"],
    limitation: { group: "visual", code: withheld ? image.safetyFailureCode ?? "visual_evidence_withheld" : "visual_measurement_unavailable" } });
}

type AuditSet = (id: ExtendedCmpCriterion, status: CmpAuditAssessment["rows"][number]["status"], detail: string, refs?: string[]) => void;
type InventoryFacts = Pick<CmpPreferencesEvidence, "controls" | "controlInventoryComplete" | "privacyLinks" | "declarations" | "declarationInventoryComplete" | "serviceNames" | "serviceDisclosures" | "declarationCoverage" | "checkpoints">;
function applyInventoryFacts(bundle: CanonicalEvidenceBundle, evidence: InventoryFacts,
  { controlsUsable, declarationsUsable, privacyUsable, usable }: { controlsUsable: boolean; declarationsUsable: boolean; privacyUsable: boolean; usable: boolean },
  rows: CmpAuditAssessment["rows"], set: AuditSet, observations: ReturnType<typeof retainedChoiceCaptures>) {
  const accept = bundle.postAcceptEvidence;
  const accepted = accept?.parentScanId === bundle.scanId && accept.normalizedUrl === bundle.url && accept.productionProjectable && accept.acceptanceRegistration.status === "confirmed";
  const acceptCapture = observations.find(observation => observation.action === "accept");
  const observedCookies = acceptCapture?.packet.storage.postAction.filter(item => item.storageType === "cookie") ?? [];
  // A name-only table cannot choose between multiple cookie identities. Use an
  // expiry only when the completed retained snapshot contains one exact name.
  const observedExpiry = (name: string) => {
    const candidates = observedCookies.filter(item => item.name === name);
    if (candidates.length !== 1 || !candidates[0]!.identityHash || !candidates[0]!.valueHash) return undefined;
    const item = candidates[0]!;
    const parsed = cmpCookieExpiryEvidenceSchema.safeParse({ visit: "Accept", name,
      capturedAtEpochSeconds: item.capturedAtEpochSeconds, expiresAtEpochSeconds: item.expiresAtEpochSeconds,
      remainingSeconds: item.expiresAtEpochSeconds! - item.capturedAtEpochSeconds! });
    return parsed.success ? parsed.data : undefined;
  };
  if (controlsUsable) {
    const categories = evidence.controls.filter(control => control.kind === "category" && control.enabled);
    const services = new Set(evidence.controls.filter(control => control.kind === "service" && control.label.trim()).map(control => control.label.trim()));
    if (categories.length) set("categories", "observed", `${categories.length} selectable categories observed in the inspected consent surface: ${categories.map(control => control.label).join("; ")}.`);
    if (categories.length) rows.find(row => row.id === "categories")!.inventory = { categories: categories.filter(control => control.label.trim()).map(control => ({ name: control.label.trim(), checked: control.checked })) };
    if (!categories.length && usable && evidence.controlInventoryComplete) set("categories", "not_observed", "No selectable category controls were observed in the inspected preference panel.");
    if (services.size) set("services", "observed", `${services.size} individual ${services.size === 1 ? "service was" : "services were"} identified by labelled controls in the inspected CMP view. Control functionality was not tested.`);
  }
  // v3 describes identified services, not separate choice controls. Use the
  // retained, document-bound API source accounting; cookie counts, category
  // names and CMP recognition alone cannot establish service identities.
  const serviceCoverage = evidence.declarationCoverage;
  const retainedNames = declarationsUsable && evidence.checkpoints?.declarations && serviceCoverage?.scope === "configured_services" &&
    serviceCoverage.resolved > 0 && serviceCoverage.resolved + serviceCoverage.unresolved === serviceCoverage.configured && evidence.serviceNames?.length && evidence.serviceNames.length <= serviceCoverage.resolved
    ? [...new Set(evidence.serviceNames.map(name => name.trim()).filter(Boolean))] : [];
  if (retainedNames.length) {
    const complete = serviceCoverage!.configured === serviceCoverage!.resolved && retainedNames.length === serviceCoverage!.resolved && !serviceCoverage!.unresolved && !serviceCoverage!.truncated;
    set("services", "observed", `${retainedNames.length} services identified in the CMP.${complete ? "" : " Additional services may be outside the captured inventory."} Individual service controls were not tested.`);
  }
  // Supplemental evidence follows the same document/checkpoint eligibility as
  // the assessment. Historical counts never manufacture missing service names.
  if (rows.find(row => row.id === "services")!.status === "observed") {
    const names = retainedNames;
    const labelled = controlsUsable ? [...new Set(evidence.controls.filter(control => control.kind === "service" && control.label.trim()).map(control => control.label.trim()))] : [];
    const services = names?.length ? names.map(name => ({ name, source: "cmp_api_inventory" as const }))
      : labelled.map(name => ({ name, source: "labelled_control" as const }));
    if (services.length) rows.find(row => row.id === "services")!.inventory = { services };
  }
  const disclosed = declarationsUsable ? [...new Set(evidence.serviceDisclosures?.flatMap(disclosure => disclosure.names) ?? [])] : [];
  if (disclosed.length) {
    const row = rows.find(row => row.id === "services")!;
    const services = [...(row.inventory?.services ?? [])];
    for (const name of disclosed) if (!services.some(service => service.name === name) && services.length < 100)
      services.push({ name, source: "cmp_named_disclosure" });
    set("services", "observed", `${services.length} services named in the inspected CMP. This includes its explicit partner disclosure; it is not a complete service inventory. Individual service controls were not tested.`);
    row.inventory = { services, serviceDisclosures: evidence.serviceDisclosures };
  }
  if (privacyUsable) {
    const reachable = evidence.privacyLinks.some(link => link.hitTargetBeforeAction);
    set("privacy_access", reachable ? "observed" : "not_assessed", reachable
      ? "A privacy-policy link had an unobstructed click target before consent interaction. Retrieval of the linked document is outside this criterion."
      : "No privacy-policy link was verified as reachable before consent interaction.", ["CmpPreferencesEvidencePacket.json"]);
  }
  if (declarationsUsable) {
    const entries = evidence.declarations.length;
    const detailed = evidence.declarations.filter(row => row.purpose.trim() && row.duration.trim()).length;
    if (entries) set("cookie_information", detailed === entries ? "observed" : "partially_assessed",
      detailed === entries ? `${entries} captured cookie entries included names, purposes and storage durations.`
        : `${entries} cookie names captured; ${evidence.declarations.filter(row => row.purpose.trim()).length} purposes and ${evidence.declarations.filter(row => row.duration.trim()).length} storage ${evidence.declarations.filter(row => row.duration.trim()).length === 1 ? "duration" : "durations"} retained. Inferred purposes are shown separately.`);
  }
  if (declarationsUsable && evidence.declarations.length) {
    rows.find(row => row.id === "cookie_information")!.inventory = { declarations: evidence.declarations.map(declaration => {
      const knowledge = resolveCanonicalCookieKnowledge(declaration.name);
      const expiry = observedExpiry(declaration.name);
      return { ...declaration, ...(knowledge.category !== "unknown" ? { inferredPurpose: { category: knowledge.category, basis: "canonical_cookie_registry.v1" as const } } : {}), ...(expiry ? { observedExpiry: expiry } : {}) };
    }) };
  }
  if (declarationsUsable && evidence.declarations.length) {
    // This v2 row describes bounded pre-consent overlap, never obsolete
    // declarations or a missing post-Accept service. Wildcards remain patterns.
    const comparablePatterns = evidence.declarations.filter(row => comparableCookiePattern(row.name));
    const complete = evidence.declarationInventoryComplete && comparablePatterns.length === evidence.declarations.length;
    // Partial-list comparisons may include completed after-click facts without
    // registration. Complete-inventory Review eligibility remains unchanged.
    const acceptedCookies = !complete ? observedCookies.filter(cookie => cookie.name.length > 0 && cookie.name.length <= 160) : (accepted && accept ? accept.storage.postAction.filter(item => item.storageType === "cookie") : []);
    const omittedAfterAcceptCookieCount = !complete ? observedCookies.length - acceptedCookies.length : 0;
    const captured = new Set([...(bundle.cookieEvents ?? []).map(cookie => cookie.cookieName), ...acceptedCookies.map(item => item.name)]);
    const comparable = comparablePatterns.length > 0;
    const snapshots = bundle.cookieSnapshots?.filter(snapshot => snapshot.consentStateAtTime === "pre_consent");
    if (comparable && snapshots?.length && bundle.runtimeCoverage?.coverageStatus === "usable") {
      const before = new Set(snapshots.flatMap(snapshot => snapshot.cookies.map(cookie => cookie.name)));
      const patterns = [...new Set(comparablePatterns.map(row => row.name))];
      const matched = patterns.filter(pattern => [...before].some(name => matchesCookieDeclaration(pattern, name)));
      set("declared_not_found", "observed", `${matched.length} of ${patterns.length} retained CMP cookie declaration patterns matched the pre-consent cookie capture; ${patterns.length - matched.length} were not observed in that window. Unobserved cookies may require consent or another page; this is not a declaration defect.`, ["CmpPreferencesEvidencePacket.json", "CanonicalEvidenceBundle.json"]);
    }
    // Reuse the existing comparison work for table evidence; do not run a
    // second matcher just to decorate the report.
    const cookieMatches = [...captured].map(name => {
      const matchedPattern = comparablePatterns.find(row => matchesCookieDeclaration(row.name, name))?.name ?? null;
      const template = matchedPattern === null ? comparablePatterns.find(row => possibleCmpCookieTemplate(row.name, name))?.name : undefined;
      const expiry = acceptedCookies.some(cookie => cookie.name === name) ? observedExpiry(name) : undefined;
      return { name, matchedPattern, ...(template ? { possibleTemplateMatch: { pattern: template, basis: "ga4_placeholder.v1" as const } } : {}), ...(expiry ? { observedExpiry: expiry } : {}) };
    });
    const missing = cookieMatches.filter(row => row.matchedPattern === null).map(row => row.name);
    if (comparable && captured.size > 0 && bundle.runtimeCoverage?.coverageStatus === "usable") {
      const possible = cookieMatches.filter(row => row.possibleTemplateMatch).length;
      set("found_not_declared", !complete ? "partially_assessed" : missing.length ? "review" : "not_observed",
        !complete ? `${cookieMatches.length - missing.length} of ${captured.size} cookie names matched captured declarations; ${possible ? `${possible} possible template match${possible === 1 ? "" : "es"}; ` : ""}${missing.length - possible} had no match in this partial list.${omittedAfterAcceptCookieCount ? ` ${omittedAfterAcceptCookieCount} after-click cookie entries had no comparable saved name.` : ""}`
          : missing.length ? `${missing.length} observed cookie names did not match ${new Set(evidence.declarations.map(row => row.name)).size} retained CMP declaration patterns.`
          : "All captured cookie names matched the complete configured CMP declarations.", ["CmpPreferencesEvidencePacket.json", "CanonicalEvidenceBundle.json"]);
      const baselineNames = new Set((bundle.cookieEvents ?? []).map(cookie => cookie.cookieName));
      const acceptedNames = new Set(acceptedCookies.map(item => item.name));
      const row = rows.find(row => row.id === "found_not_declared")!;
      row.inventory = { cookies: cookieMatches.slice(0, 100).map(item => ({ ...item,
        observedIn: [...(baselineNames.has(item.name) ? ["before_choice" as const] : []), ...(acceptedNames.has(item.name) ? ["after_accept" as const] : [])] })) };
      row.cookieComparison = { declarationPatternCount: new Set(comparablePatterns.map(row => row.name)).size,
        observedCookieNameCount: captured.size, unmatchedNameCount: missing.length, ...(possible ? { possibleTemplateNameCount: possible } : {}), ...(omittedAfterAcceptCookieCount ? { omittedAfterAcceptCookieCount } : {}), unmatchedNames: boundedCookieNames(missing),
        allUnmatchedOnlyAfterAccept: missing.length > 0 && missing.every(name => acceptedNames.has(name) && !baselineNames.has(name)),
        declarationInventoryComplete: complete };
    }
  }

}

/** Basic first-layer facts have their own typed producer contract and loader
 * binding. They may fill missing checks, never overwrite a deeper assessment or
 * manufacture completeness from an optional worker outcome. */
export function deriveCmpAuditAssessment(bundle: CanonicalEvidenceBundle, geometry?: Record<string, unknown> | null): CmpAuditAssessment | undefined {
  // Validate action completion once and reuse it across both retained CMP sources.
  const captures = retainedChoiceCaptures(bundle);
  const observations = captures.filter(capture => capture.storageCompleted);
  const original = derivePreferenceAuditAssessment(bundle, geometry, observations);
  const parsed = cmpBasicEvidenceSchema.safeParse(bundle.cmpBasicEvidence);
  if (!parsed.success || parsed.data.scanId !== bundle.scanId || parsed.data.targetUrl !== bundle.url) return original;
  const basic = parsed.data;
  const duration = Date.parse(bundle.completedAt) - Date.parse(bundle.startedAt);
  const snapshots = (bundle.domSnapshots ?? []).filter(snapshot => snapshot.consentStateAtTime === "pre_consent" && Number.isFinite(snapshot.capturedAtMs))
    .sort((left, right) => right.capturedAtMs - left.capturedAtMs);
  const latest = snapshots[0];
  if (!Number.isFinite(duration) || basic.capturedAtMs > duration || !latest || latest.capturedAtMs < 0 || latest.capturedAtMs > duration ||
    latest.url !== basic.documentUrl || latest.documentIdentity?.token !== basic.documentToken ||
    snapshots.some(snapshot => snapshot.capturedAtMs === latest.capturedAtMs && (snapshot.url !== latest.url || snapshot.documentIdentity?.token !== latest.documentIdentity?.token))) return original;
  const assessment: CmpAuditAssessment = original ?? {
    version: "cmp_audit_assessment.v6" as const, scanId: bundle.scanId, sourceSha256: "0".repeat(64),
    support: { state: "partial" as const, provider: basic.provider, recipeVersion: basic.contractVersion, reason: "passive_first_layer_only" },
    rows: ([...cmpAuditCriterionSchema.options, "implementation", "prominence"] as const).map(id => ({ id, status: "not_assessed" as const, detail: "Evidence was not retained for this check.", evidenceRefs: [] as string[] })),
  };
  if (!assessment.support.provider) assessment.support = { ...assessment.support, state: "partial", provider: basic.provider, recipeVersion: basic.contractVersion };
  const candidates: CmpAuditAssessment["rows"] = assessment.rows.map(row => ({ id: row.id, status: "not_assessed", detail: "", evidenceRefs: [] }));
  const set: AuditSet = (id, status, detail, refs = ["CanonicalEvidenceBundle.json#cmpBasicEvidence"]) => Object.assign(candidates.find(row => row.id === id)!, {
    status, detail: detail.slice(0, 500), evidenceRefs: refs.map(ref => ref === "CmpPreferencesEvidencePacket.json" ? "CanonicalEvidenceBundle.json#cmpBasicEvidence" : ref),
  });
  applyInventoryFacts(bundle, { ...basic, controlInventoryComplete: false, declarationInventoryComplete: false }, { controlsUsable: true, declarationsUsable: true, privacyUsable: true, usable: false }, candidates, set, observations);
  const basicExpiries = applyClientFacts(bundle, set, candidates, observations, configuredCookieNames(basic.provider, basic.configuredConsentCookies));
  if (basicExpiries.length) candidates.find(row => row.id === "duration")!.inventory = { expiries: basicExpiries };
  if (basic.serviceNames.length) {
    const services = [...new Set(basic.serviceNames)].map(name => ({ name, source: "cmp_api_inventory" as const })) as NonNullable<NonNullable<CmpAuditAssessment["rows"][number]["inventory"]>["services"]>;
    for (const service of candidates.find(row => row.id === "services")!.inventory?.services ?? [])
      if (!services.some(row => row.name === service.name) && services.length < 100) services.push(service);
    set("services", "observed", `${services.length} services identified in the inspected CMP.${basic.serviceDisclosures?.length ? " Includes its explicit partner disclosure; the full inventory was not inspected." : ""} Individual service controls were not tested.`);
    const row = candidates.find(row => row.id === "services")!;
    row.inventory = { ...row.inventory, services };
  }
  for (const row of candidates) if (!["not_assessed", "incomplete"].includes(row.status)) {
    const previous = assessment.rows.find(item => item.id === row.id)!;
    if (["not_assessed", "incomplete"].includes(previous.status)) Object.assign(previous, row, { limitation: undefined });
  }
  if (!original) {
    const assign: AuditSet = (id, status, detail, evidenceRefs = []) => Object.assign(assessment.rows.find(row => row.id === id)!, { status, detail, evidenceRefs });
    const expiries = applyClientFacts(bundle, assign, assessment.rows, observations, configuredCookieNames(basic.provider, basic.configuredConsentCookies));
    if (expiries.length) assessment.rows.find(row => row.id === "duration")!.inventory = { expiries };
    applyChoiceActivity(bundle, assign, assessment.rows, observations.filter(capture => capture.networkCompleted)); applyActionLimitations(bundle, assessment.rows); applyVisualLimitations(bundle, assessment.rows, geometry);
  }
  assessment.sourceSha256 = createHash("sha256").update(JSON.stringify({ policy: "independent_cmp_basic_facts.v4", originalSourceSha256: original?.sourceSha256, basic, rows: assessment.rows })).digest("hex");
  return cmpAuditAssessmentSchema.parse(assessment);
}
