import assert from "node:assert/strict";
import test from "node:test";
import {createHash} from "node:crypto";
import {mkdirSync, writeFileSync} from "node:fs";
import {join} from "node:path";
import {createRequire} from "node:module";
import {chromium, type Browser} from "playwright";
import {z} from "zod";
import {
  canonicalEvidenceBundleSchema, consentControlAssessmentSchema,
  classifyConsentControlLabel, verifyConsentControlInspection,
} from "@certscore/contracts";
import {captureConsentControlGeometry, type ConsentControlGeometryArtifact} from "../../../../packages/certscore-scan-core/src/consent-control-geometry";
import {readRapidFirstLayerConsentUiObservation} from "../../../../packages/certscore-scan-core/src/scanners/pre-consent-runtime-scanner";
import {projectPublicFirstLayerConsentEvidence} from "../../lib/scans/public-first-layer-consent-evidence";
import {deriveMaterializedConsentControlAssessment} from "./consent-control-assessment-projector";
import {buildNormalizedConcerns} from "../../lib/scans/normalized-concerns";
import {deriveGdprEprivacyCoveragePolicyOutcomes} from "../../lib/scans/gdpr-eprivacy-coverage-policy";
import {deriveGdprEprivacyCoverageChecklist} from "../../lib/scans/gdpr-eprivacy-coverage-checklist";
import fixtures from "./test-fixtures/retained-first-layer-label-contexts.json";
import churchOptions from "./test-fixtures/retained-church-options.json";
import {pulseResponseSchema} from "@certscore/api-contracts";

const require = createRequire(import.meta.url);
const serverOnlyPath = require.resolve("server-only");
require.cache[serverOnlyPath] = {exports: {}, filename: serverOnlyPath, id: serverOnlyPath,
  isPreloading: false, loaded: true, path: serverOnlyPath} as NodeModule;
const {buildPulseProjection} = require("../../lib/pulse/projection") as typeof import("../../lib/pulse/projection");
const firstLayerFields = z.object({rejectControlObserved: z.boolean().nullable().optional(),
  managePreferencesControlObserved: z.boolean().nullable().optional()}).passthrough();

let browser: Browser;
const results: unknown[] = [];
const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
test.before(async () => {browser = await chromium.launch({headless: true});});
test.after(async () => {
  await browser?.close();
  if (process.env.CERTSCORE_FIRST_LAYER_PIPELINE_OUT) {
    mkdirSync(process.env.CERTSCORE_FIRST_LAYER_PIPELINE_OUT, {recursive: true});
    writeFileSync(join(process.env.CERTSCORE_FIRST_LAYER_PIPELINE_OUT, "browser-pipeline-results.json"),
      JSON.stringify({scope: "Controlled local browser fixtures; not public site rescans or original-layout replay", results}, null, 2) + "\n", {flag: "wx"});
  }
});

type CaptureFixture = {site: string; context: string;
  controls: readonly {label: string; ariaLabel: string | null; expectedIntent: string}[]};
async function capture(f: CaptureFixture, mode: "visible" | "hidden" | "no_context", intent: "reject" | "options" = "reject", bodyOverride?: string, inspectRapid = false) {
  const context = await browser.newContext({viewport: {width: 1366, height: 900}, serviceWorkers: "block"});
  const page = await context.newPage();
  const url = `https://retained-consent.test/${f.site}/${mode}`;
  const rejectedRequests: string[] = [];
  try {
    const controls = mode === "no_context" ? f.controls.filter(c => c.expectedIntent === intent) : f.controls;
    const region = mode === "no_context" && intent === "options"
      ? 'id="account-options"' : 'id="fixture-dialog" role="dialog"';
    const html = `<!doctype html><meta charset="utf-8"><style>body{margin:0;font:16px Arial}section{position:fixed;bottom:0;left:0;right:0;padding:20px;background:#fff}p{max-height:160px;overflow:hidden}button{padding:12px;margin:4px}</style>
      ${bodyOverride ?? `<section ${region}><p>${escape(mode === "no_context" ? "Choose an account option." : f.context)}</p>
      ${controls.map(c => `<button ${c.expectedIntent === intent && mode === "hidden" ? 'style="display:none"' : ""} ${c.ariaLabel ? `aria-label="${escape(c.ariaLabel)}"` : ""}>${escape(c.label)}</button>`).join("")}</section>`}
      <script>window.fixtureClicks=0;document.addEventListener('click',()=>window.fixtureClicks++)</script>`;
    await page.route("**/*", route => route.request().url() === url
      ? route.fulfill({contentType: "text/html", body: html})
      : (rejectedRequests.push(route.request().url()), route.abort()));
    const startedAt = Date.now();
    await page.goto(url);
    const cdp = await context.newCDPSession(page);
    const tree = await cdp.send("Page.getFrameTree");
    const identity = {source: "cdp_loader_id" as const, token: tree.frameTree.frame.loaderId};
    const geometry = await captureConsentControlGeometry(page, {documentIdentity: identity, timeoutMs: 900});
    const rapid = inspectRapid ? await readRapidFirstLayerConsentUiObservation(page, startedAt, 1500) : undefined;
    const dom = await page.content();
    const domCapturedAtMs = Date.now() - startedAt;
    const bundle = canonicalEvidenceBundleSchema.parse({
      scanId: `fixture-${f.site}-${mode}`, url, normalizedUrl: url,
      startedAt: new Date(startedAt).toISOString(), completedAt: new Date().toISOString(),
      scanProfile: {profileId: "consent", label: "CertScore.ai retained-label browser fixture", targetDurationMs: 1000,
        internalBudgetMs: 1000, enabledModules: ["consent_geometry_fixture"]},
      modulesRun: [], runtimeTimeline: [], networkEvents: [], cookieEvents: [], cookieSnapshots: [], storageSnapshots: [],
      scriptEvents: [], iframeEvents: [], consentUiObservations: [], screenshots: [], normalizedVendorObservations: [],
      derivedRuntimeSignals: {}, artifactRefs: [], scannerVersion: "local-fixture", schemaVersion: "2.0",
      domSnapshots: [{artifactId: "fixture-dom", capturedAtMs: domCapturedAtMs, documentIdentity: identity,
        consentStateAtTime: "pre_consent", pagePhase: "dom_content_loaded", path: "fixture-dom.html", url,
        textExcerpt: await page.locator("body").innerText()}],
    });
    assert.equal(await page.evaluate(() => (window as unknown as {fixtureClicks: number}).fixtureClicks), 0);
    assert.deepEqual(rejectedRequests, []);
    return {geometry, bundle, rapid, domSha256: createHash("sha256").update(dom).digest("hex")};
  } finally {await context.close();}
}
function project(bundle: Awaited<ReturnType<typeof capture>>["bundle"], geometry: ConsentControlGeometryArtifact) {
  const assessment = deriveMaterializedConsentControlAssessment({bundle,
    consentControlGeometryEvidence: geometry as unknown as Record<string, unknown>, finalUrl: bundle.url, noGo: false});
  const validated = consentControlAssessmentSchema.parse(JSON.parse(JSON.stringify(assessment)));
  const runtimeArtifacts = {consentControlAssessment: validated};
  const normalizedConcerns = buildNormalizedConcerns({runtimeArtifacts, reviewFindingCandidates: [], validationFindings: []});
  const coverageLimited = validated.coverage.status !== "complete";
  const coverageOutcomes = deriveGdprEprivacyCoveragePolicyOutcomes({coverageLimited, events: [], normalizedConcerns,
    runtimeArtifacts, scanCompleted: true, snapshot: {}});
  const rows = deriveGdprEprivacyCoverageChecklist({coverageLimited, coverageOutcomes,
    projectedFindings: [], unifiedFindings: [], scanCompleted: true});
  const checklistRejectEvidenceState = rows.find(row => row.id === "reject_all_path_availability")?.evidenceState;
  const checklistOptionsEvidenceState = rows.find(row => row.id === "options_settings_preferences_control")?.evidenceState;
  const pulse = buildPulseProjection({detail: "evidence", format: "json", freshnessMode: "latest",
    pulseRequestId: "retained-label-local-fixture", requestedUrl: bundle.url, resolutionMode: "test", waitSeconds: 0,
    scanRecord: {
      accessPostureSummary: {homepageFetchStatus: null, interruptionLabel: null, interruptionReason: null,
        stopOutcomeTitle: null, stopReason: null, stopReviewTitle: null},
      domainBenchmark: null, events: [], policyEnrichment: [], policyReviewQueue: [], preconsentViolations: [],
      regulatoryRisk: null, signals: [], snapshot: {}, trackerVendors: [], validationFindings: [],
      scan: {id: bundle.scanId, domainHostname: "retained-consent.test", pagesRequested: 1, pagesScanned: 1,
        status: "completed", createdAt: bundle.startedAt}, runtimeArtifacts: {consentControlAssessment: validated},
    } as never});
  const serialized = pulseResponseSchema.parse(JSON.parse(JSON.stringify(pulse)));
  const publicEvidence = projectPublicFirstLayerConsentEvidence(validated, bundle.scanId);
  const surface = serialized.consentSurfaceEvidence as Record<string, unknown> | undefined;
  const first = firstLayerFields.parse(surface?.firstLayerConsentChoices ?? {});
  assert.equal(first?.rejectControlObserved ?? null, publicEvidence?.rejectControlObserved ?? null);
  return {assessment: validated, publicEvidence, serializedFirstLayer: first, checklistRejectEvidenceState, checklistOptionsEvidenceState};
}

test("audience Accept is not projected as consent while local cookie agreement remains supported", async () => {
  for (const cookieConsent of [false, true]) {
    const body = `<section role="dialog" aria-label="Regional information">
      <h2>Change Your Location</h2><p>Tell us a little about you to help us personalize the site to your needs.</p>
      <div>Financial Advisor</div><div>Institutional Investor</div><div>Individual Investor</div>
      <p>Terms and Conditions and Privacy Policies</p>
      ${cookieConsent ? '<p>We use cookies for analytics.</p><button>Reject All</button><button>Manage Preferences</button>' : ''}<button>Accept</button></section>
      <aside id="hidden-template" hidden>We use cookies for advertising. Manage consent preferences.</aside>`;
    const {geometry, bundle, rapid} = await capture({site: cookieConsent ? "audience-cookie-consent" : "audience-selection", context: "", controls: []}, "visible", "options", body, true);
    assert.equal(geometry.summary.firstLayerAccept, cookieConsent);
    assert.ok(rapid);
    if (cookieConsent) assert.equal(rapid.acceptControlObserved, true, JSON.stringify({basis: rapid.basis, controls: rapid.controls}));
    else assert.notEqual(rapid.acceptControlObserved, true, "Rapid inventory must use the same local-purpose guard.");
    const result = project(bundle, geometry);
    assert.equal(result.assessment.controls.accept.state, cookieConsent ? "observed" : "unknown",
      "Removing a non-consent candidate must not manufacture complete negative coverage.");
    assert.equal(result.publicEvidence?.acceptControlObserved, cookieConsent ? true : null);
    assert.equal(result.serializedFirstLayer.acceptControlObserved, cookieConsent ? true : null);
  }
});

test("focusable banner prose cannot produce public Options while its sale/share control remains observed", async () => {
  const {geometry, bundle} = await capture({site: "focusable-banner", context: "", controls: []}, "visible", "options", `
    <section id="onetrust-banner-sdk" role="region" aria-label="Cookie banner" tabindex="0">
      <div role="dialog" aria-label="Privacy">
        <p>We use cookies to personalise content and ads and analyse our traffic. This notice explains advertising and analytics technologies and describes how information may be shared with service partners.</p>
        <button aria-label="Do Not Sell or Share My Personal Information, Opens the preference center dialog">Do Not Sell or Share My Personal Information</button>
      </div>
    </section>`);
  assert.ok(verifyConsentControlInspection(geometry.controlInspection, geometry.candidates));
  const projected = project(bundle, geometry);
  assert.equal(projected.assessment.controls.options.state, "not_observed");
  assert.equal(projected.assessment.controls.privacyOptOut.state, "observed");
  assert.equal(projected.publicEvidence?.managePreferencesControlObserved, false);
  assert.equal(projected.serializedFirstLayer.managePreferencesControlObserved, false);
  const wrongDocument = project(bundle, {...geometry, documentIdentity: {source: "cdp_loader_id", token: "different-loader"}});
  assert.equal(wrongDocument.assessment.controls.options.state, "unknown");
});

test("localized controls beside footer-reference prose reach canonical and public presence without a dialog role", async () => {
  const {geometry, bundle} = await capture({site: "localized-sibling-controls", context: "", controls: []}, "visible", "options", `
    <div id="notice"><div class="consent-content"><p>Wir verwenden Cookies für Werbung. Sie können Ihre Präferenzen über die Privatsphäre-Einstellungen im Footer anpassen.</p></div>
      <div class="actions"><button>Annehmen</button><button>Einstellungen</button></div>
    </div>`);
  assert.ok(verifyConsentControlInspection(geometry.controlInspection, geometry.candidates));
  const projected = project(bundle, geometry);
  assert.equal(projected.assessment.controls.accept.state, "observed");
  assert.equal(projected.assessment.controls.options.state, "observed");
  assert.equal(projected.publicEvidence?.acceptControlObserved, true);
  assert.equal(projected.publicEvidence?.managePreferencesControlObserved, true);
  assert.equal(projected.serializedFirstLayer.acceptControlObserved, true);
  assert.equal(projected.serializedFirstLayer.managePreferencesControlObserved, true);
});

test("Church of England: retained Set cookie preferences label reaches canonical and serialized Options without inventing Accept or Reject", async () => {
  const {geometry, bundle, domSha256} = await capture(churchOptions, "visible", "options");
  const projected = project(bundle, geometry);
  results.push({site: churchOptions.site, mode: "visible-options", sourceGeometrySha256: churchOptions.source.sha256,
    domSha256, geometry, ...projected});
  const candidate = geometry.candidates.find(c => c.label === churchOptions.candidate.label);
  assert.equal(candidate?.actionType, "manage_preferences");
  assert.equal(candidate?.decisionStatus, "confirmed_visible");
  assert.ok(candidate?.classifierReasonCodes?.includes("observation_only_label"));
  assert.equal(projected.assessment.controls.options.state, "observed");
  assert.equal(projected.publicEvidence?.managePreferencesControlObserved, true);
  assert.equal(projected.serializedFirstLayer.managePreferencesControlObserved, true);
  assert.equal(projected.checklistOptionsEvidenceState, "observed");
  assert.equal(projected.assessment.controls.accept.state, "unknown", "Recommended settings cannot establish Accept all.");
  assert.equal(projected.assessment.controls.reject.state, "unknown");
  assert.equal(projected.publicEvidence?.rejectControlObserved, null);
  assert.equal(classifyConsentControlLabel({label: churchOptions.candidate.label, usage: "action", hasConsentContext: true}).intent, "unknown");
  const wrongDocument = project(bundle, {...geometry, documentIdentity: {source: "cdp_loader_id", token: "different-loader"}});
  assert.notEqual(wrongDocument.assessment.controls.options.state, "observed");
  assert.notEqual(wrongDocument.publicEvidence?.managePreferencesControlObserved, true);
});

test("Church of England: hidden or context-free preference text cannot establish an observed Options control", async () => {
  for (const mode of ["hidden", "no_context"] as const) {
    const {geometry, bundle} = await capture(churchOptions, mode, "options");
    const projected = project(bundle, geometry);
    assert.notEqual(projected.assessment.controls.options.state, "observed");
    assert.notEqual(projected.publicEvidence?.managePreferencesControlObserved, true);
    results.push({site: churchOptions.site, mode: `${mode}-options`, geometry, ...projected});
  }
});

for (const f of fixtures) {
  test(`${f.site}: real passive capture carries retained Reject labels through canonical assessment and public projection`, async () => {
    const {geometry, bundle, domSha256} = await capture(f, "visible");
    assert.ok(verifyConsentControlInspection(geometry.controlInspection, geometry.candidates));
    const {assessment, publicEvidence, serializedFirstLayer, checklistRejectEvidenceState} = project(bundle, geometry);
    for (const c of f.controls.filter(c => c.expectedIntent !== "accept")) {
      const expectedAction = c.expectedIntent === "reject" ? "reject_all" : "manage_preferences";
      const observed = geometry.candidates.find(candidate => candidate.label === c.label && candidate.actionType === expectedAction);
      assert.equal(observed?.decisionStatus, "confirmed_visible", JSON.stringify(geometry.candidates));
      assert.ok(observed?.classifierReasonCodes?.includes("observation_only_label"));
      assert.equal(classifyConsentControlLabel({label: c.label, ariaLabel: c.ariaLabel, usage: "action", hasConsentContext: true}).intent, "unknown");
    }
    assert.equal(assessment.controls.reject.state, "observed");
    assert.equal(publicEvidence?.rejectControlObserved, true);
    assert.equal(serializedFirstLayer?.rejectControlObserved, true);
    assert.equal(checklistRejectEvidenceState, "observed");
    assert.equal(publicEvidence?.assessmentSourceHash, assessment.provenance.sourceHash);
    assert.ok(publicEvidence?.rejectLabels.includes(f.controls.find(c => c.expectedIntent === "reject")!.label));
    if (f.controls.some(c => c.expectedIntent === "options")) assert.equal(publicEvidence?.managePreferencesControlObserved, true);
    const wrongDocument = project(bundle, {...geometry, documentIdentity: {source: "cdp_loader_id", token: "different-loader"}});
    assert.notEqual(wrongDocument.assessment.controls.reject.state, "observed");
    assert.notEqual(wrongDocument.publicEvidence?.rejectControlObserved, true);
    results.push({site: f.site, mode: "visible", sourceGeometrySha256: f.source.sha256, geometry,
      domSha256, assessment, publicEvidence, serializedFirstLayer, checklistRejectEvidenceState,
      wrongDocumentReject: wrongDocument.assessment.controls.reject.state});
  });
  test(`${f.site}: hidden controls and labels without consent context never become public Reject observations`, async () => {
    for (const mode of ["hidden", "no_context"] as const) {
      const {geometry, bundle} = await capture(f, mode);
      const {assessment, publicEvidence} = project(bundle, geometry);
      assert.notEqual(assessment.controls.reject.state, "observed");
      assert.notEqual(publicEvidence?.rejectControlObserved, true);
      results.push({site: f.site, mode, geometry, assessment, publicEvidence});
    }
  });
}
