import assert from "node:assert/strict";
import test from "node:test";
import { chromium, type Browser } from "playwright";
import type { CanonicalEvidenceBundle } from "@certscore/contracts";
import { captureConsentControlGeometry } from "../../../../packages/certscore-scan-core/src/consent-control-geometry";
import { deriveMaterializedConsentControlAssessment } from "./consent-control-assessment-projector";
import { withPersistedFirstLayerConsentEvidence } from "./scan-report-consent-projection";
import { buildNormalizedConcerns, buildUnifiedFindingCandidatesFromConcerns } from "../../lib/scans/normalized-concerns";
import { deriveGdprEprivacyCoveragePolicyOutcomes } from "../../lib/scans/gdpr-eprivacy-coverage-policy";
import { deriveGdprEprivacyCoverageChecklist } from "../../lib/scans/gdpr-eprivacy-coverage-checklist";
import { getGdprEprivacyRowDeduction } from "../../lib/scans/regulatory-coverage-score";

const url = "https://consent-inspection.test/";
const identity = { source: "cdp_loader_id" as const, token: "fixture-loader" };
let browser: Browser;
test.before(async () => { browser = await chromium.launch(); });
test.after(async () => { await browser?.close(); });
async function capture(markup: string, candidateLimit?: number) {
  const page = await browser.newPage();
  try {
    await page.route("**/*", route => route.fulfill({ contentType: "text/html", body: `<!doctype html><meta charset="utf-8"><style>button,a { margin: 8px; } section { position:fixed; bottom:0; padding:20px; background:white; }</style>${markup}` }));
    await page.goto(url);
    return await captureConsentControlGeometry(page, { documentIdentity: identity, candidateLimit });
  } finally { await page.close(); }
}
function materialize(geometry: any, noGo = false, complete = false) {
  const bundle = { scanId: "inspection-fixture", schemaVersion: "2.0", url, normalizedUrl: url, completedAt: "2026-09-15T01:00:00Z",
    screenshots: [], domSnapshots: [{ artifactId: "dom", capturedAtMs: 1000, consentStateAtTime: "pre_consent", pagePhase: "settled", path: "dom.json", url, documentIdentity: identity }],
    consentUiObservations: [{ observationId: "inventory", observedAtMs: 1000, documentIdentity: identity, documentUrl: url,
      likelyPresent: !complete, layerInspected: "first_layer", captureStatus: complete ? "no_evidence" : "incomplete", inventoryOutcome: complete ? "complete_empty" : "partial", controls: [], evidenceRefs: [{ kind: "artifact", refId: "dom.json" }],
      captureDiagnostics: { completedChannels: ["dom_inventory"], failedChannels: [], timedOutChannels: [] } }],
  } as unknown as CanonicalEvidenceBundle;
  return deriveMaterializedConsentControlAssessment({ bundle, consentControlGeometryEvidence: { ...geometry, observedAtMs: geometry.observedAtMs ?? 1000 }, finalUrl: url, requestedUrl: url, noGo,
    consentSurfaceInspection: { inspectionCompleted: complete, coverageStatus: complete ? "complete" : "limited", limitationKeys: complete ? [] : ["unresolved_visible_consent_decision"], outcome: complete ? "no_surface_observed_complete_coverage" : "actionable_surface_observed" } });
}
function project(assessment: ReturnType<typeof materialize>) {
  const runtimeArtifacts = withPersistedFirstLayerConsentEvidence({ consentControlAssessment: assessment }, { consent_control_assessment: assessment })!;
  assert.deepEqual(runtimeArtifacts.consent_control_assessment, assessment);
  const normalizedConcerns = buildNormalizedConcerns({ runtimeArtifacts, reviewFindingCandidates: [], validationFindings: [] });
  const findings = buildUnifiedFindingCandidatesFromConcerns(normalizedConcerns);
  const coverageOutcomes = deriveGdprEprivacyCoveragePolicyOutcomes({ runtimeArtifacts, normalizedConcerns, scanCompleted: true, coverageLimited: true,
    snapshot: { consent_control_assessment: assessment, cookie_banner_present: true } });
  const checklist = deriveGdprEprivacyCoverageChecklist({ coverageOutcomes, scanCompleted: true, coverageLimited: true, projectedFindings: [], unifiedFindings: [] });
  return { findings, checklist, normalizedConcerns, runtimeArtifacts };
}
const banner = (controls: string) => `<section id="cookie-banner" role="dialog"><p>We use optional cookies for analytics and advertising. Choose your consent preferences.</p>${controls}</section>`;

test("Axeptio initial panel and incomplete categories preserve canonical refusal scoring", async () => {
  const markup = `<div><template shadowrootmode="open"><style>section{position:fixed;bottom:20px;left:20px;background:white;padding:24px;width:420px}label{display:block}input{width:20px;height:20px}button{padding:12px;margin:4px}</style>
    <section data-testid="widget-container" role="dialog"><p>We use cookies for analytics. Choose your cookie preferences.</p>
    <input type="hidden" name="axeptio_cookies_fixture_value">
    <label>Toggle all<input type="checkbox"></label><label>Google Analytics 4<input type="checkbox"></label><label>Hubspot<input type="checkbox"></label>
    <button id="axeptio_btn_close" aria-label="Close cookie settings">Close</button>
    <button id="axeptio_btn_acceptAllAndNext">Accept all</button><button id="axeptio_btn_next">Next</button></section>
    <label style="display:none">Axeptio consent<input type="checkbox" checked disabled></label>
    <button id="axeptio_main_button" aria-label="Close the widget without accepting cookie settings">Cookies</button>
    </template></div>`;
  for (const incomplete of [false, true]) {
    const geometry = await capture(incomplete ? markup.replace('<label>Google', '<label style="display:none">Google') : markup);
    const assessment = materialize(geometry);
    assert.equal(assessment.controls.accept.state, "observed");
    assert.equal(assessment.controls.reject.state, incomplete ? "unknown" : "observed");
    const result = project(assessment);
    assert.equal(getGdprEprivacyRowDeduction(result.checklist.find(row => row.id === "reject_all_path_availability")!), 0);
    assert.equal(result.findings.some(finding => finding.normalizedConcern.suggestedUnifiedFindingId === "reject_button_missing"), false);
  }
});

test("browser -> assessment -> persistence -> concern policy -> checklist/score preserves Reject-specific absence", async () => {
  const geometry = await capture(banner('<button>Accept all</button><button>More information</button>'));
  assert.equal(geometry.controlInspection?.structuralCoverage, "complete");
  const a = materialize(geometry);
  assert.equal(a.controls.accept.state, "observed");
  assert.equal(a.controls.reject.state, "not_observed");
  assert.equal(a.controls.options.state, "unknown");
  assert.equal(a.assessmentStatus, "limited");
  const result = project(a);
  const row = result.checklist.find(r => r.id === "reject_all_path_availability")!;
  assert.equal(row.status, "Review signal", JSON.stringify(row));
  assert.ok(getGdprEprivacyRowDeduction(row) > 0, "existing first-layer availability review deduction applies");
  assert.equal(row.criticalEvidence?.retainedEvidence?.rejectControlObserved, false);
  assert.notEqual(result.checklist.find(r => r.id === "options_settings_preferences_control")?.status, "Gap observed");
});
test("registered vendor-information links allow a definitive first-layer Reject inventory", async () => {
  for (const markup of [
    '<section id="didomi-notice" role="dialog"><p class="didomi-popup-notice-text">We use cookies for analytics. <a href="#vendors">nasi partnerzy (1100)</a></p><button>Accept all</button><button>Cookie settings</button></section>',
    '<section class="qc-cmp2-container" role="dialog"><div class="qc-cmp2-summary-info">We use cookies for analytics. <button>partners</button></div><button>AGREE</button><button>MORE OPTIONS</button></section>',
  ]) {
    const geometry = await capture(markup);
    assert.ok(geometry.controlInspection?.candidates.some(c => c.role === "vendor_list"));
    assert.equal(materialize(geometry).controls.reject.state, "not_observed", JSON.stringify({ proof: geometry.controlInspection, candidates: geometry.candidates.map(c => ({ label: c.label, actionType: c.actionType, selector: c.selectorHint, context: c.consentContextConfirmed, reason: c.classifierReasonCodes })) }));
  }
});
test("unlabeled choices, candidate overflow, missing rows, page mismatch and no-go never become absence", async () => {
  const unknown = await capture(banner('<button>Accept all</button><button style="width:100px;height:30px"></button>'));
  const limited = await capture(banner('<button>Accept all</button><button>Undecided action</button>'), 1);
  const known = await capture(banner('<button>Accept all</button><button>More information</button>'));
  const omitted = structuredClone(known); omitted.controlInspection!.candidates = [];
  const stale = { ...known, observedAtMs: 500 };
  const mismatched = structuredClone(known); mismatched.documentIdentity = { ...identity, token: "stale-loader" };
  for (const geometry of [unknown, limited, omitted, mismatched, stale]) {
    const a = materialize(geometry);
    assert.equal(a.controls.reject.state, "unknown");
    const row = project(a).checklist.find(r => r.id === "reject_all_path_availability")!;
    assert.notEqual(row.status, "Gap observed");
    assert.equal(getGdprEprivacyRowDeduction(row), 0);
  }
  assert.equal(materialize(known, true).controls.reject.state, "unknown");
});
test("recovered refusal controls reach the persisted assessment without claiming action registration", async () => {
  for (const label of ["Accept only essential", "NUR ESSENTIELLE COOKIES AKZEPTIEREN", "Nein Danke.", "Alles afwijzen", "Отказаться"]) {
    const a = materialize(await capture(banner(`<button>Accept all</button><button>${label}</button>`)));
    assert.equal(a.controls.reject.state, "observed", label);
    const result = project(a);
    assert.equal((result.runtimeArtifacts.consent_control_assessment as typeof a).controls.reject.state, "observed");
    assert.notEqual(result.checklist.find(r => r.id === "reject_all_path_availability")?.status, "Gap observed");
    assert.equal(result.findings.some(f => f.normalizedConcern.suggestedUnifiedFindingId === "reject_button_missing"), false);
    assert.equal(result.runtimeArtifacts.postRefusalObservation, undefined);
  }
});

test("initial selected-only refusal retains category proof and never claims a completed action", async () => {
  let priorHash: string | undefined;
  for (const optionalOn of [false, true]) {
    const geometry = await capture(`<div id="sliding-popup"><section class="eu-cookie-compliance-banner" role="dialog"><p>We use cookies for analytics. Choose your preferences.</p>
      <div id="eu-cookie-compliance-categories"><input type="checkbox" id="cookie-category-mandatory" checked disabled><input type="checkbox" id="cookie-category-statistics" ${optionalOn ? "checked" : ""}></div>
      <div class="eu-cookie-compliance-categories-buttons"><button class="eu-cookie-compliance-save-preferences-button">ACCETTA SOLO I SELEZIONATI</button></div><button>Accept all</button>
    </section></div>`);
    const a = materialize(geometry);
    assert.equal(a.controls.reject.state, optionalOn ? "unknown" : "observed");
    if (!optionalOn) assert.ok(a.evidence.find(e => e.intent === "reject")?.initialSelection?.categories.some(c => c.id === "statistics" && !c.checked));
    else assert.notEqual(a.provenance.sourceHash, priorHash);
    priorHash = a.provenance.sourceHash;
    assert.equal(project(a).runtimeArtifacts.postRefusalObservation, undefined);
  }
});

test("Axeptio Close carries optional-off proof through persistence, concerns and scoring", async () => {
  const page = await browser.newPage();
  try {
    await page.route("**/*", route => route.fulfill({ contentType: "text/html", body: "<!doctype html><div id='host'></div>" }));
    await page.goto(url);
    await page.evaluate(() => {
      document.querySelector("#host")!.attachShadow({ mode: "open" }).innerHTML = `<section data-testid="widget-container" role="dialog" style="position:fixed;bottom:20px;background:white;padding:20px"><p>We use cookies for analytics. Choose your cookie preferences.</p>
        <label>Toggle all<input type="checkbox"></label><label>Google Analytics 4<input type="checkbox"></label><label>Hubspot<input type="checkbox"></label>
        <input id="axeptio_consent_checkbox" type="checkbox" hidden>
        <button id="axeptio_btn_close" aria-label="Close cookie settings">Close</button><button id="axeptio_btn_acceptAllAndNext">OK, accept all</button>
        <button id="axeptio_btn_next">Next</button><button id="axeptio_main_button" aria-label="Close the widget without accepting cookie settings">Cookies</button></section>`;
    });
    const geometry = await captureConsentControlGeometry(page, { documentIdentity: identity });
    const assessment = materialize(geometry);
    assert.equal(assessment.controls.reject.state, "observed");
    assert.equal(assessment.evidence.find(e => e.intent === "reject")?.initialSelection?.recipe, "axeptio.initial_optional_off_close.v1");
    const result = project(assessment);
    const row = result.checklist.find(r => r.id === "reject_all_path_availability")!;
    assert.equal(getGdprEprivacyRowDeduction(row), 0);
    assert.equal(result.findings.some(f => f.normalizedConcern.suggestedUnifiedFindingId === "reject_button_missing"), false);
    assert.equal(result.runtimeArtifacts.postRefusalObservation, undefined);
    const altered = structuredClone(geometry);
    altered.candidates.find(c => c.label === "Close")!.initialSelection!.categories[1]!.checked = true;
    assert.equal(materialize(altered).controls.reject.state, "unknown", "changed retained selection cannot be promoted");
    const stale = structuredClone(geometry);
    stale.documentIdentity = { ...identity, token: "another-loader" };
    assert.equal(materialize(stale).controls.reject.state, "unknown");
  } finally { await page.close(); }
});

test("a fully inspected empty first layer reports no controls without inventing a refusal finding", async () => {
  const geometry = await capture('<main><h1>Public page</h1></main>');
  assert.equal(materialize(geometry).controls.reject.state, "unknown", "early empty geometry cannot replace a completed surface inspection");
  const a = materialize(geometry, false, true);
  assert.equal(a.controls.reject.state, "not_observed");
  assert.equal(a.controls.accept.state, "not_observed");
  const result = project(a);
  assert.equal(result.findings.some(f => f.normalizedConcern.suggestedUnifiedFindingId === "reject_button_missing"), false);
  assert.equal(getGdprEprivacyRowDeduction(result.checklist.find(r => r.id === "reject_all_path_availability")!), 0);
});

test("known Options stays observed while an independent decision is unresolved", async () => {
  const a = materialize(await capture(banner('<button>Cookie settings</button><button>Undecided action</button>')));
  assert.equal(a.controls.options.state, "observed");
  assert.equal(a.controls.reject.state, "unknown");
  assert.equal(project(a).checklist.find(r => r.id === "options_settings_preferences_control")?.status, "Observed");
});

test("paid decline remains a separate score-neutral review when Reject-specific absence is complete", async () => {
  const a = materialize(await capture(banner('<button>Accept all</button><button>Reject and Pay</button><button>More information</button>')));
  assert.equal(a.controls.reject.state, "not_observed");
  assert.equal(a.controls.options.state, "unknown");
  const row = project(a).checklist.find(r => r.id === "reject_all_path_availability")!;
  assert.equal(row.status, "Review signal");
  assert.equal(row.criticalEvidence?.retainedEvidence?.paymentRequiredDeclinePathObserved, true);
  assert.equal(getGdprEprivacyRowDeduction(row), 0);
});

test("browser geometry and the same viewport pixels retain fill and focus-outline prominence", async () => {
  const { measureConsentControlVisualComparison } = await import("../../../../packages/certscore-scan-core/src/consent-control-visual-comparison");
  const { hasMaterialAcceptVisualProminence } = await import("@certscore/contracts");
  for (const style of ["filled", "outline", "equal"] as const) {
    const page = await browser.newPage({ viewport: { width: 640, height: 300 } });
    try {
      await page.route("**/*", route => route.fulfill({ contentType: "text/html", body: `<!doctype html><style>
        body {margin:0;background:#eee} section {position:fixed;inset:30px;background:#172b4d;padding:28px;color:white}
        button {width:140px;height:48px;margin:0 20px 0 0;background:#172b4d;color:white;border:1px solid white}
        #accept {${style === "filled" ? "background:#00e5ff;color:#172b4d" : style === "outline" ? "outline:4px solid #00e5ff;outline-offset:2px" : ""}}
        </style><section id="cookie-banner" role="dialog"><p>We use optional cookies for analytics. Choose your consent preferences.</p>
        <button id="reject">Reject all</button><button id="accept">Accept all</button></section>` }));
      await page.goto(url);
      const geometry = await captureConsentControlGeometry(page, { documentIdentity: identity, screenshotArtifactRef: "proof.png" });
      const screenshotBytes = await page.screenshot();
      const measurement = await measureConsentControlVisualComparison({ geometry, screenshotBytes, screenshotCapturedAtMs: Date.now() });
      assert.ok(measurement, `${style}: ${JSON.stringify(geometry.controlInspection)}`);
      assert.equal(hasMaterialAcceptVisualProminence(measurement), style !== "equal", style);
    } finally { await page.close(); }
  }
});
