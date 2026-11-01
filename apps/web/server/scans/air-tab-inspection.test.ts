import assert from "node:assert/strict";
import test from "node:test";
import {mkdirSync, writeFileSync} from "node:fs";
import {join} from "node:path";
import {createRequire} from "node:module";
import {chromium, type Browser} from "playwright";
import {canonicalEvidenceBundleSchema, consentControlAssessmentSchema, CONTROL_INSPECTION_POLICY, verifyConsentControlInspection} from "@certscore/contracts";
import {captureConsentControlGeometry} from "../../../../packages/certscore-scan-core/src/consent-control-geometry";
import {deriveMaterializedConsentControlAssessment} from "./consent-control-assessment-projector";
import {projectPublicFirstLayerConsentEvidence} from "../../lib/scans/public-first-layer-consent-evidence";
import {buildNormalizedConcerns} from "../../lib/scans/normalized-concerns";
import {deriveGdprEprivacyCoveragePolicyOutcomes} from "../../lib/scans/gdpr-eprivacy-coverage-policy";
import {deriveGdprEprivacyCoverageChecklist} from "../../lib/scans/gdpr-eprivacy-coverage-checklist";
import retained from "../../../../packages/certscore-contracts/src/test-fixtures/retained-air-tab-inspection.json";
import {pulseResponseSchema} from "@certscore/api-contracts";

const require = createRequire(import.meta.url), serverOnlyPath = require.resolve("server-only");
require.cache[serverOnlyPath] = {exports: {}, filename: serverOnlyPath, id: serverOnlyPath,
  isPreloading: false, loaded: true, path: serverOnlyPath} as NodeModule;
const {buildPulseProjection} = require("../../lib/pulse/projection") as typeof import("../../lib/pulse/projection");

let browser: Browser;
test.before(async () => {browser = await chromium.launch({headless: true});});
test.after(async () => {await browser?.close();});
const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");

test("Air retained tab identities flow through native v4 capture without resolving OK or Reject", async () => {
  const source = retained[1]!, context = await browser.newContext({viewport: {width: 1366, height: 900}, serviceWorkers: "block"});
  const page = await context.newPage(), url = "https://air-tabs-fixture.test/", rejectedRequests: string[] = [];
  try {
    const controls = source.geometry.candidates.filter(c => c.decisionStatus === "ambiguous").map(c => {
      const id = c.selectorHint?.startsWith("#") ? c.selectorHint.slice(1) : undefined;
      const attributes = `${id ? `id="${escape(id)}"` : ""} ${c.tagName === "a" ? 'href="#fixture-pane"' : ""} ${c.role ? `role="${escape(c.role)}"` : ""} ${c.ariaLabel ? `aria-label="${escape(c.ariaLabel)}"` : ""}`;
      return `<${c.tagName} ${attributes}>${escape(c.label)}</${c.tagName}>`;
    }).join("");
    await page.route("**/*", route => route.request().url() === url ? route.fulfill({contentType: "text/html", body:
      `<!doctype html><meta charset="utf-8"><style>body{margin:0}#cookie-banner{position:fixed;bottom:0;left:0;right:0;padding:24px;background:white}button,a{display:inline-block;padding:12px}</style><section id="cookie-banner" role="dialog"><p>${escape(source.context)}</p>${controls}</section><script>window.fixtureClicks=0;document.addEventListener('click',()=>window.fixtureClicks++)</script>`})
      : (rejectedRequests.push(route.request().url()), route.abort()));
    const started = Date.now(); await page.goto(url);
    const client = await context.newCDPSession(page), tree = await client.send("Page.getFrameTree");
    const identity = {source: "cdp_loader_id" as const, token: tree.frameTree.frame.loaderId};
    const geometry = await captureConsentControlGeometry(page, {documentIdentity: identity, timeoutMs: 900});
    const inspection = verifyConsentControlInspection(geometry.controlInspection, geometry.candidates);
    assert.ok(inspection); assert.equal(inspection.version, CONTROL_INSPECTION_POLICY);
    assert.equal(inspection.structuralCoverage, "complete");
    assert.equal(inspection.candidates.filter(c => c.role === "information").length, 3);
    assert.equal(inspection.candidates.filter(c => c.role === "unknown").length, 2);
    assert.equal(geometry.candidates.find(c => c.label === "OK")?.actionType, "other");
    assert.ok(geometry.candidates.length <= 48); assert.ok(geometry.containers.length <= 12);
    const bundle = canonicalEvidenceBundleSchema.parse({scanId: "owned-air-tab-inspection", url, normalizedUrl: url,
      startedAt: new Date(started).toISOString(), completedAt: new Date().toISOString(),
      scanProfile: {profileId: "consent", label: "CertScore.ai owned retained-tab fixture", targetDurationMs: 1000, internalBudgetMs: 1000, enabledModules: []},
      modulesRun: [], runtimeTimeline: [], networkEvents: [], cookieEvents: [], cookieSnapshots: [], storageSnapshots: [], scriptEvents: [], iframeEvents: [],
      consentUiObservations: [], screenshots: [], normalizedVendorObservations: [], derivedRuntimeSignals: {}, artifactRefs: [], scannerVersion: "owned-fixture", schemaVersion: "2.0",
      domSnapshots: [{artifactId: "owned-dom", path: "owned-dom.txt", url, documentIdentity: identity, capturedAtMs: Date.now() - started, textExcerpt: await page.locator("body").innerText(), consentStateAtTime: "pre_consent", pagePhase: "dom_content_loaded"}]});
    const assessment = consentControlAssessmentSchema.parse(deriveMaterializedConsentControlAssessment({bundle, consentControlGeometryEvidence: geometry as unknown as Record<string, unknown>, finalUrl: url, noGo: false}));
    for (const control of Object.values(assessment.controls)) assert.equal(control.state, "unknown");
    const publicEvidence = projectPublicFirstLayerConsentEvidence(assessment, bundle.scanId);
    assert.equal(publicEvidence?.rejectControlObserved, null); assert.equal(publicEvidence?.acceptControlObserved, null);
    assert.equal(publicEvidence?.managePreferencesControlObserved, null);
    const runtimeArtifacts = {consentControlAssessment: assessment};
    const normalizedConcerns = buildNormalizedConcerns({runtimeArtifacts, reviewFindingCandidates: [], validationFindings: []});
    const coverageOutcomes = deriveGdprEprivacyCoveragePolicyOutcomes({coverageLimited: true, events: [], normalizedConcerns, runtimeArtifacts, scanCompleted: true, snapshot: {}});
    const checklist = deriveGdprEprivacyCoverageChecklist({coverageLimited: true, coverageOutcomes, projectedFindings: [], unifiedFindings: [], scanCompleted: true});
    assert.equal(checklist.find(row => row.id === "reject_all_path_availability")?.evidenceState, "not_testable");
    const pulse = pulseResponseSchema.parse(JSON.parse(JSON.stringify(buildPulseProjection({detail: "evidence", format: "json", freshnessMode: "latest",
      pulseRequestId: "owned-air-tabs", requestedUrl: url, resolutionMode: "test", waitSeconds: 0,
      scanRecord: {accessPostureSummary: {homepageFetchStatus: null, interruptionLabel: null, interruptionReason: null,
        stopOutcomeTitle: null, stopReason: null, stopReviewTitle: null}, domainBenchmark: null, events: [], policyEnrichment: [], policyReviewQueue: [],
        preconsentViolations: [], regulatoryRisk: null, signals: [], snapshot: {}, trackerVendors: [], validationFindings: [],
        scan: {id: bundle.scanId, domainHostname: "air-tabs-fixture.test", pagesRequested: 1, pagesScanned: 1, status: "completed", createdAt: bundle.startedAt},
        runtimeArtifacts} as never}))));
    const serializedChoices = (pulse.consentSurfaceEvidence as Record<string, any>).firstLayerConsentChoices;
    assert.equal(serializedChoices.rejectControlObserved, null);
    assert.equal(serializedChoices.acceptControlObserved, null);
    assert.equal(serializedChoices.managePreferencesControlObserved, null);
    assert.equal(await page.evaluate(() => (window as unknown as {fixtureClicks: number}).fixtureClicks), 0);
    assert.deepEqual(rejectedRequests, []);
    if (process.env.CERTSCORE_AIR_TAB_OUT) {
      mkdirSync(process.env.CERTSCORE_AIR_TAB_OUT, {recursive: true});
      writeFileSync(join(process.env.CERTSCORE_AIR_TAB_OUT, "native-air-tab-result.json"), JSON.stringify({scope: "Owned locally fulfilled fixture using retained identities/context; not original layout or public rescan", geometry, assessment, publicEvidence, checklist, serializedChoices, operatorClicks: 0}, null, 2) + "\n", {flag: "wx"});
    }
  } finally {await context.close();}
});
