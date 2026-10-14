import { createHash } from "node:crypto";
import { projectPostAcceptEvidenceForReport, projectPostRefusalEvidenceForReport, cmpAuditAssessmentSchema, cmpAuditCriterionSchema, cmpPreferencesEvidenceSchema, type CanonicalEvidenceBundle, type CmpAuditAssessment, type ExtendedCmpCriterion } from "@certscore/contracts";
import { isKnownCmpCookieName } from "@website-signal-risk-scanner/shared";

/** Materialize only from the coordinator's verified canonical bundle. Browser
 * observations stay distinct from product capability and legal adequacy. */
export function deriveCmpAuditAssessment(bundle: CanonicalEvidenceBundle): CmpAuditAssessment | undefined {
  const parsed = cmpPreferencesEvidenceSchema.safeParse(bundle.cmpPreferencesEvidence);
  if (!parsed.success) {
    const outcome = bundle.cmpPreferenceLaneOutcome;
    if (!outcome || outcome.status !== "limited" || !outcome.limitationCode) return undefined;
    // Coordinator outcomes are coverage telemetry, never substituted browser evidence.
    const fallback = cmpAuditAssessmentSchema.parse({ version: "cmp_audit_assessment.v4", scanId: bundle.scanId,
      sourceSha256: createHash("sha256").update(JSON.stringify({ version: "cmp_audit_assessment.v4", scanId: bundle.scanId, url: bundle.url, outcome, accept: bundle.postAcceptEvidence, reject: bundle.postRefusalEvidence })).digest("hex"),
      support: { state: "unknown", provider: null, recipeVersion: null, reason: outcome.limitationCode },
      rows: ([...cmpAuditCriterionSchema.options, "implementation"] as const).map(id => ({ id, status: "not_assessed", detail: independentAuditDetails(bundle)[id] ?? "Preference evidence was not retained; this criterion could not be assessed.", evidenceRefs: [] })) });
    applyClientFacts(bundle, (id, status, detail, refs = []) => Object.assign(fallback.rows.find(row => row.id === id)!, { status, detail: detail.slice(0, 500), evidenceRefs: refs }));
    applyChoiceActivity(bundle, (id, status, detail, refs = []) => Object.assign(fallback.rows.find(row => row.id === id)!, { status, detail, evidenceRefs: refs }));
    return cmpAuditAssessmentSchema.parse(fallback);
  }
  if (parsed.data.scanId !== bundle.scanId || parsed.data.targetUrl !== bundle.url) return undefined;
  const evidence = parsed.data;
  const rows: CmpAuditAssessment["rows"] = ([...cmpAuditCriterionSchema.options, "implementation"] as const).map(id => ({ id, status: "not_assessed", detail: "", evidenceRefs: [] }));
  const set = (id: ExtendedCmpCriterion, status: CmpAuditAssessment["rows"][number]["status"], detail: string, refs: string[] = ["CmpPreferencesEvidencePacket.json"]) => Object.assign(rows.find(row => row.id === id)!, { status, detail: detail.slice(0, 500), evidenceRefs: refs });
  const bound = Boolean(evidence.documentToken && evidence.finalUrl === evidence.targetUrl && !evidence.limitations.includes("preference_document_changed"));
  const usable = bound && evidence.status === "completed";
  const checkpoint = evidence.checkpoints;
  const partial = bound && evidence.status === "limited" && checkpoint?.version === "cmp_partial_capture.v1" && checkpoint.documentToken === evidence.documentToken;
  const controlsUsable = usable || (partial && checkpoint?.controls);
  const declarationsUsable = usable || (partial && checkpoint?.declarations);
  const privacyUsable = usable || (partial && checkpoint?.privacyLinks);
  const timeout = evidence.limitations.includes("preference_budget_exhausted");
  set("categories", "not_assessed", timeout ? "Inspection timed out before selectable category controls could be verified." : "Selectable category controls were not verified in the inspected surface.", []);
  set("services", "not_assessed", timeout && !declarationsUsable && !controlsUsable ? "Preference inspection timed out before individual-service information could be retained." : "Individual-service identities were not verified in the retained CMP evidence.", []);
  set("privacy_access", "not_assessed", timeout && !privacyUsable ? "Preference inspection timed out before pre-choice privacy-link reachability could be verified." : "A privacy-policy link was not verified as reachable before consent interaction.", []);
  set("consent_record", "not_assessed", "A timestamped, verified client-side consent decision was not retained. A click alone is insufficient.", []);
  set("duration", "not_assessed", "A bound consent-cookie expiry was not captured.", []);
  set("declared_not_found", "not_assessed", "Comparison requires retained declarations and a usable pre-consent cookie capture.", []);
  set("found_not_declared", "not_assessed", "The configured CMP cookie inventory could not be verified as complete; missing declarations cannot be inferred from a partial list.", []);
  set("cookie_information", "not_assessed", timeout ? "Inspection timed out before cookie purpose and duration information could be verified." : "Cookie purpose and duration information was not retained.", []);
  if (declarationsUsable && !evidence.declarationInventoryComplete) set("found_not_declared", "not_assessed", "Visible CMP declarations were captured, but the complete inventory could not be verified. Missing declarations cannot be established from a partial list.");
  if (controlsUsable) {
    const categories = evidence.controls.filter(control => control.kind === "category" && control.enabled);
    const services = new Set(evidence.controls.filter(control => control.kind === "service" && control.label.trim()).map(control => control.label.trim()));
    if (categories.length) set("categories", "observed", `${categories.length} selectable categories observed in the inspected consent surface: ${categories.map(control => control.label).join("; ")}.`);
    else if (usable && evidence.controlInventoryComplete) set("categories", "not_observed", "No selectable category controls were observed in the inspected preference panel.");
    if (services.size) set("services", "observed", `${services.size} individual ${services.size === 1 ? "service was" : "services were"} identified by labelled controls in the inspected CMP view. Control functionality was not tested.`);
  }
  // v3 describes identified services, not separate choice controls. Use the
  // retained, document-bound API source accounting; cookie counts, category
  // names and CMP recognition alone cannot establish service identities.
  const serviceCoverage = evidence.declarationCoverage;
  if (declarationsUsable && checkpoint?.declarations && serviceCoverage?.scope === "configured_services" &&
    serviceCoverage.resolved > 0 && serviceCoverage.configured === serviceCoverage.resolved &&
    serviceCoverage.unresolved === 0 && !serviceCoverage.truncated) {
    set("services", "observed", `The CMP configuration identifies ${serviceCoverage.resolved} individual ${serviceCoverage.resolved === 1 ? "service" : "services"}. Separate service controls were not assessed.`);
  }
  if (privacyUsable) {
    const reachable = evidence.privacyLinks.some(link => link.hitTargetBeforeAction);
    set("privacy_access", reachable ? "observed" : "not_assessed", reachable
      ? "A privacy-policy link had an unobstructed click target before consent interaction. Retrieval of the linked document is outside this criterion."
      : "No privacy-policy link was verified as reachable before consent interaction.", ["CmpPreferencesEvidencePacket.json"]);
  }
  if (declarationsUsable) {
    if (evidence.declarations.some(row => row.purpose && row.duration)) set("cookie_information", "observed", `Cookie names, purposes and duration text were retained for ${evidence.declarations.filter(row => row.purpose && row.duration).length} CMP inventory entries.`, ["CmpPreferencesEvidencePacket.json"]);
  }
  const accept = bundle.postAcceptEvidence;
  const reject = bundle.postRefusalEvidence;
  const accepted = accept?.parentScanId === bundle.scanId && accept.normalizedUrl === evidence.targetUrl && accept.productionProjectable && accept.acceptanceRegistration.status === "confirmed";
  for (const [id, detail] of Object.entries(independentAuditDetails(bundle))) set(id as ExtendedCmpCriterion, "not_assessed", detail, ["CanonicalEvidenceBundle.json"]);
  applyClientFacts(bundle, set);
  applyChoiceActivity(bundle, set);
  if (declarationsUsable && evidence.declarations.length) {
    const captured = new Set([...(bundle.cookieEvents ?? []).map(cookie => cookie.cookieName), ...(accepted && accept ? accept.storage.postAction : []).filter(item => item.storageType === "cookie").map(item => item.name)]);
    // This v2 row describes bounded pre-consent overlap, never obsolete
    // declarations or a missing post-Accept service. Wildcards remain patterns.
    const comparable = evidence.declarations.every(row => comparableCookiePattern(row.name));
    const snapshots = bundle.cookieSnapshots?.filter(snapshot => snapshot.consentStateAtTime === "pre_consent");
    if (comparable && snapshots?.length && bundle.runtimeCoverage?.coverageStatus === "usable") {
      const before = new Set(snapshots.flatMap(snapshot => snapshot.cookies.map(cookie => cookie.name)));
      const patterns = [...new Set(evidence.declarations.map(row => row.name))];
      const matched = patterns.filter(pattern => [...before].some(name => matchesCookieDeclaration(pattern, name)));
      set("declared_not_found", "observed", `${matched.length} of ${patterns.length} retained CMP cookie declaration patterns matched the pre-consent cookie capture; ${patterns.length - matched.length} were not observed in that window. Unobserved cookies may require consent or another page; this is not a declaration defect.`, ["CmpPreferencesEvidencePacket.json", "CanonicalEvidenceBundle.json"]);
    }
    const missing = [...captured].filter(name => !evidence.declarations.some(row => matchesCookieDeclaration(row.name, name)));
    if (evidence.declarationInventoryComplete && comparable && captured.size > 0) {
      set("found_not_declared", missing.length ? "review" : "not_observed", missing.length ? `${missing.length} observed cookie names did not match the retained CMP declaration patterns.` : "No unmatched cookie names in the complete configured-service declarations and bounded runtime capture. Service/network coverage is not implied.", ["CmpPreferencesEvidencePacket.json", "CanonicalEvidenceBundle.json"]);
      if (missing.length) {
        const row = rows.find(row => row.id === "found_not_declared")!;
        const baseline = new Set((bundle.cookieEvents ?? []).map(cookie => cookie.cookieName));
        const afterAccept = new Set((accepted && accept ? accept.storage.postAction : []).filter(item => item.storageType === "cookie").map(item => item.name));
        row.cookieComparison = { declarationPatternCount: new Set(evidence.declarations.map(row => row.name)).size,
          observedCookieNameCount: captured.size, unmatchedNameCount: missing.length, unmatchedNames: boundedCookieNames(missing),
          allUnmatchedOnlyAfterAccept: missing.every(name => afterAccept.has(name) && !baseline.has(name)) };
        row.detail = `${missing.length} observed cookie names did not match ${row.cookieComparison.declarationPatternCount} retained CMP declaration patterns.`;
      }
    }
  }
  return cmpAuditAssessmentSchema.parse({ version: "cmp_audit_assessment.v4", scanId: bundle.scanId,
    sourceSha256: createHash("sha256").update(JSON.stringify({ version: "cmp_audit_assessment.v4", cookieComparisonPolicy: "cookie_name_comparison_details.v1", evidence, accept, reject, cookies: bundle.cookieEvents, snapshots: bundle.cookieSnapshots, coverage: bundle.runtimeCoverage, policies: bundle.policySurfaceObservations })).digest("hex"), support: evidence.limitations.includes("preference_budget_exhausted")
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
  if (actions.length) details.consent_record = `${actions.map(a => `${a.label} registration: ${a.registration}`).join("; ")}. Server-side consent audit history and traceability remain unverified.`;
  const lifetimes = actions.flatMap(({ label, packet }) => packet!.storage.postAction
    .filter(item => item.storageType === "cookie" && isKnownCmpCookieName(item.name) && item.expiresAtEpochSeconds !== undefined && item.expiresAtEpochSeconds > 0 && item.capturedAtEpochSeconds !== undefined)
    .slice(0, 2).map(item => `${label} visit: ${item.name}, approximately ${Math.max(0, Math.round((item.expiresAtEpochSeconds! - item.capturedAtEpochSeconds!) / 86400))} days`));
  if (lifetimes.length) details.duration = `${lifetimes.join("; ")}. These are captured cookie expiries; confirmed choice lifetimes and appropriateness are not established.`.slice(0, 500);
  return details;
}

/** Verified browser facts only. These observed rows make no audit-adequacy,
 * enforcement, future persistence or duration-appropriateness claim. */
function applyClientFacts(bundle: CanonicalEvidenceBundle, set: (id: ExtendedCmpCriterion, status: CmpAuditAssessment["rows"][number]["status"], detail: string, refs?: string[]) => void) {
  const actions = [
    { label: "Accept", expected: "granted", packet: bundle.postAcceptEvidence, confirmed: bundle.postAcceptEvidence?.acceptanceRegistration.status === "confirmed" },
    { label: "Reject", expected: "denied", packet: bundle.postRefusalEvidence, confirmed: bundle.postRefusalEvidence?.refusalRegistration.status === "confirmed" },
  ].filter(item => item.packet?.parentScanId === bundle.scanId && item.packet.normalizedUrl === bundle.url && item.packet.productionProjectable);
  const confirmed = actions.filter(item => item.confirmed && item.packet?.decisionEvidence?.decision === item.expected &&
    item.packet.decisionEvidence.basis === "verified_state" && Number.isFinite(item.packet.decisionEvidence.observedAtMs) && item.packet.decisionEvidence.observedStateSha256);
  if (confirmed.length) set("consent_record", "observed", `${confirmed.map(item => item.label).join(" and ")} client-side decision confirmed with a timestamp and hashed state evidence. Server-side audit history is outside this assessment.`, ["CanonicalEvidenceBundle.json"]);
  const lifetimes = actions.flatMap(({ label, packet }) => packet!.storage.postAction.filter(item => item.storageType === "cookie" &&
    isKnownCmpCookieName(item.name) && item.identityHash && item.valueHash && Number.isFinite(item.expiresAtEpochSeconds) && item.expiresAtEpochSeconds! > 0 && Number.isFinite(item.capturedAtEpochSeconds))
    .slice(0, 2).map(item => `${label} visit: ${item.name}, approximately ${Math.max(0, Math.round((item.expiresAtEpochSeconds! - item.capturedAtEpochSeconds!) / 86400))} days`));
  if (lifetimes.length) set("duration", "observed", `${lifetimes.join("; ")}. Captured cookie expiry only; future choice persistence and appropriateness are not assessed.`, ["CanonicalEvidenceBundle.json"]);
}

/** Reuse canonical action eligibility and completion rules. A partial capture
 * describes coverage, never correct enforcement or an absence of activity. */
function applyChoiceActivity(bundle: CanonicalEvidenceBundle, set: (id: ExtendedCmpCriterion, status: CmpAuditAssessment["rows"][number]["status"], detail: string, refs?: string[]) => void) {
  const capture = (action: "accept" | "reject") => {
    const packet = action === "accept" ? bundle.postAcceptEvidence : bundle.postRefusalEvidence;
    if (!packet || packet.parentScanId !== bundle.scanId || packet.normalizedUrl !== bundle.url) return false;
    try {
      const projection = action === "accept"
        ? projectPostAcceptEvidenceForReport({ packet: bundle.postAcceptEvidence! })
        : projectPostRefusalEvidenceForReport({ packet: bundle.postRefusalEvidence! });
      const activity = "postAcceptActivity" in projection ? projection.postAcceptActivity : projection.postRefusalActivity;
      return projection.productionProjectable && projection.registrationStatus === "confirmed" &&
        projection.evidenceDisposition === "confirmed" && Boolean(projection.registeredObservationCompletion || activity.length);
    } catch { return false; }
  };
  const accepted = capture("accept"), rejected = capture("reject");
  const count = Number(accepted) + Number(rejected);
  set("implementation", count === 2 ? "observed" : count === 1 ? "partially_assessed" : "not_assessed",
    count === 2 ? "Confirmed Accept and Reject choices have retained post-choice activity observations. This does not establish correct enforcement or equivalent outcomes."
      : count === 1 ? `${accepted ? "Accept" : "Reject"} was confirmed and its post-choice observation retained. ${accepted ? "Reject" : "Accept"} activity could not be assessed from verified evidence. Correct enforcement is not established.`
      : "No verified post-choice activity observation was retained. Correct enforcement is not established.",
    count ? ["CanonicalEvidenceBundle.json"] : []);
}
