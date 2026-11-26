import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { createServer } from "node:http";
import type { CanonicalEvidenceBundle } from "@certscore/contracts";
import { deriveAcceptFirstLayerProof } from "./accept-first-layer-gate.js";
import { evaluateRejectGate, readRejectFirstLayerProof } from "./reject-gate-shadow-receipt.js";
import { runPostAcceptObserver } from "./post-accept-observer.js";
import { runPostRefusalObserver } from "./post-refusal-observer.js";
import { buildCanonicalPostAcceptActionRecipes } from "./post-accept-cmp-recipes.js";
import { buildCanonicalPostRefusalActionRecipes } from "./post-refusal-cmp-recipes.js";
import { access, mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createArtifactWriter } from "./artifact-writer.js";
import {
  boundedPreConsentVisualFallbackDeadlineMs,
  capturePreConsentScreenshotOnlyFallback,
  consentInspectionNeedsRecovery,
  hasVerifiedRetainedStructuredConsentEvidence,
} from "./index.js";
import { classifyVisualCaptureFailureReason } from "./scanners/pre-consent-runtime-scanner.js";
import { startStaticFixtureServer } from "./test-fixtures/static-server.js";

test("visual fallback starts only when the scanner has a meaningful deadline budget", () => {
  assert.equal(boundedPreConsentVisualFallbackDeadlineMs({ configuredDeadlineMs: 6_000 }), 6_000);
  assert.equal(boundedPreConsentVisualFallbackDeadlineMs({
    absoluteDeadlineAtMs: 20_000,
    configuredDeadlineMs: 6_000,
    nowMs: 15_000,
  }), 5_000);
  assert.equal(boundedPreConsentVisualFallbackDeadlineMs({
    absoluteDeadlineAtMs: 20_000,
    configuredDeadlineMs: 6_000,
    nowMs: 19_001,
  }), null);
});

test("visual capture distinguishes renderer crashes from browser and page closure", () => {
  assert.equal(
    classifyVisualCaptureFailureReason("page.screenshot: Target crashed while capturing"),
    "renderer_crash",
  );
  assert.equal(
    classifyVisualCaptureFailureReason("browser has disconnected"),
    "browser_crash",
  );
  assert.equal(
    classifyVisualCaptureFailureReason("Target page, context or browser has been closed"),
    "page_closed",
  );
  assert.equal(
    classifyVisualCaptureFailureReason("Supplemental full-page screenshot timed out"),
    "screenshot_timeout",
  );
});

test("typed partial consent diagnostics trigger recovery without relying on error wording", () => {
  assert.equal(consentInspectionNeedsRecovery({
    moduleStatus: "partial",
    observations: [{
      observationId: "consent_ui_pre_consent",
      observedAtMs: 1,
      captureStatus: "incomplete",
      captureDiagnostics: {
        completedChannels: ["screenshot"],
        timedOutChannels: ["dom_inventory"],
        failedChannels: [],
      },
      likelyPresent: false,
      basis: ["bounded module deadline reached"],
      visibleChoiceLabels: [],
      defaultTogglePurposeLabels: [],
      precheckedOptionalPurposeCount: 0,
      precheckedOptionalPurposeLabels: [],
      acceptControlObserved: false,
      rejectControlObserved: false,
      managePreferencesControlObserved: false,
      controls: [],
      impliedConsentLanguageObserved: false,
      impliedConsentLanguageEvidence: [],
      evidenceRefs: [],
      confidence: 0.4,
    }],
  }), true);
});

test("missing consent evidence after a module deadline triggers typed visual recovery", () => {
  assert.equal(consentInspectionNeedsRecovery({
    moduleStatus: "skipped_budget",
    observations: [],
  }), true);
});

test("typed consent recovery covers partial modules and missing geometry channels", () => {
  const observedControls = {
    observationId: "consent_ui_pre_consent",
    observedAtMs: 1,
    captureStatus: "observed" as const,
    likelyPresent: true,
    basis: ["settled_control_inventory_completed"],
    visibleChoiceLabels: ["Accept All"],
    defaultTogglePurposeLabels: [],
    precheckedOptionalPurposeCount: 0,
    precheckedOptionalPurposeLabels: [],
    acceptControlObserved: true,
    rejectControlObserved: false,
    managePreferencesControlObserved: false,
    controls: [],
    impliedConsentLanguageObserved: false,
    impliedConsentLanguageEvidence: [],
    evidenceRefs: [],
    confidence: 0.8,
  };
  assert.equal(consentInspectionNeedsRecovery({
    moduleStatus: "partial",
    observations: [observedControls],
  }), true);
  assert.equal(consentInspectionNeedsRecovery({
    moduleStatus: "completed",
    observations: [{
      ...observedControls,
      captureStatus: "no_evidence",
      likelyPresent: false,
      basis: ["settled_control_inventory_completed", "geometry_capture_unavailable"],
    }],
  }), true);
  assert.equal(consentInspectionNeedsRecovery({
    moduleStatus: "partial",
    observations: [{
      ...observedControls,
      inventoryOutcome: "complete_with_controls",
      layerInspected: "first_layer",
      controls: [{}],
      captureDiagnostics: {
        completedChannels: ["dom_inventory", "geometry"],
        timedOutChannels: [],
        failedChannels: [],
      },
      basis: [
        "settled_control_inventory_completed",
        "geometry:captured",
        "recovery:independent_consent_capture_completed",
      ],
    }],
  }), false);
});

test("visual fallback retains bounded consent-surface evidence with the screenshot", async () => {
  const server = await startStaticFixtureServer();
  const tempRoot = await mkdtemp(path.join(tmpdir(), "certscore-v2-visual-fallback-"));
  try {
    const artifactWriter = await createArtifactWriter(tempRoot);
    const result = await capturePreConsentScreenshotOnlyFallback({
      artifactWriter,
      normalizedUrl: server.urlFor("consent-simple-accept-reject"),
      scanStartedAtMs: Date.now(),
      screenshotTimeoutMs: 5_000,
    });

    assert.equal(result.visualCapture.status, "available");
    assert.equal(result.visualCapture.captureMethod, "independent_visual_fallback_viewport");
    assert.equal(result.screenshot.artifactId, "screenshot_pre_consent");
    assert.equal(result.screenshot.captureMethod, "independent_visual_fallback_viewport");
    assert.equal(result.domSnapshot?.artifactId, "dom_text_pre_consent");
    assert.equal(result.consentUiObservation?.likelyPresent, true);
    assert.equal(result.consentUiObservation?.acceptControlObserved, true);
    assert.equal(result.consentUiObservation?.rejectControlObserved, true);
    assert.equal(
      result.consentUiObservation?.visibleChoiceLabels.some((label) => /\breject all\b/i.test(label)),
      true,
    );
    assert.equal(
      result.visualCapture.notes.some((note) => /consent-surface evidence/.test(note)),
      true,
    );
  } finally {
    await server.close();
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("full-page visual fallback preserves late consent surfaces after incomplete inspection", async () => {
  const server = await startStaticFixtureServer();
  const tempRoot = await mkdtemp(path.join(tmpdir(), "certscore-v2-visual-fallback-full-page-"));
  try {
    const artifactWriter = await createArtifactWriter(tempRoot);
    const result = await capturePreConsentScreenshotOnlyFallback({
      artifactWriter,
      normalizedUrl: server.urlFor("consent-simple-accept-reject"),
      scanStartedAtMs: Date.now(),
      screenshotTimeoutMs: 5_000,
      captureMode: "full_page",
    });

    assert.equal(result.visualCapture.status, "available");
    assert.equal(result.visualCapture.captureMethod, "fresh_context_full_page");
    assert.equal(result.screenshot.artifactId, "screenshot_pre_consent_full_page");
    assert.equal(result.screenshot.captureMethod, "fresh_context_full_page");
    assert.equal(result.screenshot.pagePhase, "network_idle");
    assert.equal(result.consentUiObservation?.likelyPresent, true);
    assert.equal(result.consentUiObservation?.acceptControlObserved, true);
    assert.equal(result.consentUiObservation?.rejectControlObserved, true);
  } finally {
    await server.close();
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("bounded consent recovery retains canonical DOM inventory and geometry evidence", async () => {
  const server = await startStaticFixtureServer();
  const tempRoot = await mkdtemp(path.join(tmpdir(), "certscore-v2-consent-recovery-"));
  try {
    const artifactWriter = await createArtifactWriter(tempRoot);
    const result = await capturePreConsentScreenshotOnlyFallback({
      artifactWriter,
      normalizedUrl: server.urlFor("consent-simple-accept-reject"),
      scanStartedAtMs: Date.now(),
      screenshotTimeoutMs: 5_000,
      captureMode: "full_page",
      recoverConsentEvidence: true,
      fallbackDeadlineMs: 6_000,
    });

    assert.equal(result.consentRecoveryCompleted, true);
    assert.equal(result.screenshot, undefined);
    assert.equal(result.consentUiObservation?.captureStatus, "observed");
    assert.ok(result.consentUiObservation?.captureDiagnostics?.completedChannels.includes("dom_inventory"));
    assert.ok(result.consentUiObservation?.captureDiagnostics?.completedChannels.includes("geometry"));
    assert.ok(result.consentUiObservation?.basis.includes("recovery:independent_consent_capture_completed"));
    assert.equal(result.consentUiObservation?.rejectControlObserved, true);
    await access(path.join(tempRoot, "ConsentControlGeometryEvidence.json"));
    const geometryPath = path.join(tempRoot, "ConsentControlGeometryEvidence.json");
    const geometry = JSON.parse(await readFile(geometryPath, "utf8"));
    assert.ok(result.consentUiObservation?.documentIdentity?.token);
    assert.deepEqual(geometry.documentIdentity, result.consentUiObservation?.documentIdentity);
    assert.equal(geometry.screenshotArtifactRef, undefined, 'fresh recovery must not borrow an earlier-session screenshot');
    assert.deepEqual(result.domSnapshot?.documentIdentity, geometry.documentIdentity,
      "Recovery DOM, inventory and geometry must retain the same verified loader");
    assert.deepEqual(result.consentUiObservation?.documentIdentity, geometry.documentIdentity);
    const retained = { consentUiObservations: [result.consentUiObservation!] };
    assert.equal(await hasVerifiedRetainedStructuredConsentEvidence(retained, geometryPath), true,
      'verified structured evidence remains authoritative without an available screenshot');
    await writeFile(geometryPath, JSON.stringify({ ...geometry, documentIdentity: { ...geometry.documentIdentity, token: 'another-document' } }));
    assert.equal(await hasVerifiedRetainedStructuredConsentEvidence(retained, geometryPath), false);
    await writeFile(geometryPath, JSON.stringify({ ...geometry, controlInspection: { ...geometry.controlInspection,
      structuralCoverage: 'limited', captureCoverage: { ...geometry.controlInspection.captureCoverage, documentReadyState: 'interactive' } } }));
    assert.equal(await hasVerifiedRetainedStructuredConsentEvidence(retained, geometryPath), false,
      'the production interactive-document geometry must not count as complete');

  } finally {
    await server.close();
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("bounded consent recovery can retain complete no-surface evidence", async () => {
  const server = await startStaticFixtureServer();
  const tempRoot = await mkdtemp(path.join(tmpdir(), "certscore-v2-consent-recovery-negative-"));
  try {
    const artifactWriter = await createArtifactWriter(tempRoot);
    const result = await capturePreConsentScreenshotOnlyFallback({
      artifactWriter,
      normalizedUrl: server.urlFor("policy-footer-privacy"),
      scanStartedAtMs: Date.now(),
      screenshotTimeoutMs: 5_000,
      captureMode: "full_page",
      recoverConsentEvidence: true,
      fallbackDeadlineMs: 6_000,
    });

    assert.equal(result.consentRecoveryCompleted, true);
    assert.equal(result.consentUiObservation?.captureStatus, "no_evidence");
    assert.equal(result.consentUiObservation?.likelyPresent, false);
    assert.equal(result.consentUiObservation?.controls.length, 0);
    assert.ok(result.consentUiObservation?.basis.includes("settled_control_inventory_completed"));
    assert.ok(result.consentUiObservation?.basis.includes("geometry:captured"));
  } finally {
    await server.close();
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("independent recovery binds observed native and HubSpot controls to exact passive geometry", async t => {
  for (const name of ["CERTSCORE_ACCEPT_GATE_PRODUCTION_ENFORCE", "CERTSCORE_REJECT_GATE_PRODUCTION_ENFORCE"]) {
    const previous = process.env[name];
    process.env[name] = "1";
    t.after(() => {
      if (previous === undefined) delete process.env[name];
      else process.env[name] = previous;
    });
  }

  const cases = [
    { path: "/native", markup: `<section aria-label="Cookie consent">
      <p>We use optional cookies for analytics. See our cookie policy.</p>
      <div class="CookiesConsent__Container-sc-18be04b-0">
        <div class="CookiesConsent__FormButtons-sc-18be04b-9"><button class="jvSrRs">Accept</button></div>
      </div></section>`, acceptSelector: "button.jvSrRs" },
    { path: "/hubspot", markup: `<section id="hs-eu-cookie-confirmation" aria-label="Cookie preferences">
      <p>We use optional cookies for analytics. See our cookie policy.</p>
      <div id="hs-eu-cookie-confirmation-button-group">
        <a id="hs-eu-confirmation-button" role="button" tabindex="0">Accept all</a>
        <a id="hs-eu-decline-button" role="button" tabindex="0">Decline all</a>
      </div></section>`, acceptSelector: "#hs-eu-cookie-confirmation a#hs-eu-confirmation-button[role=\"button\"]:not([href], [target], [download])",
      rejectSelector: "#hs-eu-cookie-confirmation a#hs-eu-decline-button[role=\"button\"]:not([href], [target], [download])" },
  ];
  const clicks: string[] = [];
  const server = createServer((req, res) => {
    if (req.method === "POST" && cases.some(row => req.url === row.path + "/accept" ||
        row.rejectSelector && req.url === row.path + "/reject")) {
      clicks.push(req.url!);
      res.writeHead(204).end();
      return;
    }
    const fixture = cases.find(row => req.url === row.path);
    if (!fixture) { res.writeHead(404).end(); return; }
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(`<!doctype html><title>Catalog fixture</title>
      <main><h1>Catalog</h1><p>Read about delivery and browse our product catalog.</p></main>
      <style>section{position:fixed;inset:auto 1rem 1rem;background:white;border:1px solid;padding:1rem} a{display:inline-block;cursor:pointer;padding:.5rem}</style>
      ${fixture.markup}
      <script>
        for (const [selector, action] of ${JSON.stringify([[fixture.acceptSelector, "accept"], [fixture.rejectSelector, "reject"]])}) {
          if (!selector) continue;
          document.querySelector(selector).addEventListener("click", event => {
            if (!event.isTrusted) return;
            fetch(location.pathname + "/" + action, {method:"POST"});
            document.querySelector("section").hidden = true;
          });
        }
      </script>`);
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise<void>((resolve, reject) =>
    server.close(error => error ? reject(error) : resolve())));
  const address = server.address();
  assert.ok(address && typeof address !== "string");

  const digest = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex");
  for (const fixture of cases) {
    const targetUrl = `http://127.0.0.1:${address.port}${fixture.path}`;
    const startedAtMs = Date.now();
    const out = await mkdtemp(path.join(tmpdir(), "certscore-recovery-binding-"));
    t.after(() => rm(out, { recursive: true, force: true }));
    const recovered = await capturePreConsentScreenshotOnlyFallback({
      artifactWriter: await createArtifactWriter(out), normalizedUrl: targetUrl, scanStartedAtMs: startedAtMs,
      captureMode: "full_page", recoverConsentEvidence: true, fallbackDeadlineMs: 6_000,
    });
    assert.ok(recovered.consentRecoveryCompleted && recovered.domSnapshot && recovered.consentUiObservation, fixture.path);
    const bytes = await readFile(path.join(out, "ConsentControlGeometryEvidence.json"));
    const scanId = "independent-recovery" + fixture.path;
    const bundle = {
      url: targetUrl, scanId, startedAt: new Date(startedAtMs).toISOString(),
      domSnapshots: [recovered.domSnapshot], consentUiObservations: [recovered.consentUiObservation],
      consentSurfaceInspection: { inspectedPreInteraction: true, inspectionCompleted: true, actionableControlObserved: true },
    } as CanonicalEvidenceBundle;
    const input = {
      bundle, scanId, targetUrl, sourceSha256: digest(JSON.stringify(bundle)), parentDispatchSha256: digest(scanId),
      geometry: { bytes, sizeBytes: bytes.length, sha256: digest(bytes) }, nowMs: Date.now(),
    };
    const acceptProof = deriveAcceptFirstLayerProof({ ...input, requireExactSelector:true, deadlineAtMs:input.nowMs + 6000 });
    assert.equal(acceptProof?.exactSelector, fixture.acceptSelector, fixture.path);
    assert.ok(acceptProof);
    const common = { url:targetUrl, scanId, actionSearchTimeoutMs:5500, confirmationTimeoutMs:300,
      observationWindowMs:250, resultBudgetMs:7000,
      interactionAuthorization:{ kind:"loopback" as const, authorizationId:"loopback_local_lab" as const } };
    const acceptCompleted: number[] = [];
    const accept = await runPostAcceptObserver({
      ...common, firstLayerProof:acceptProof, allowCanonicalAcceptDiscovery:true,
      recipe:buildCanonicalPostAcceptActionRecipes().find(recipe => recipe.cmpId === "HubSpot Consent Banner")!,
      onExactAcceptClickCompleted:event => acceptCompleted.push(event.completedAtMs),
    });
    assert.equal(accept.interactionDiagnostics?.click.outcome, "completed", JSON.stringify({
      reason:accept.resolver.reason, limitations:accept.limitations, interaction:accept.interactionDiagnostics,
    }));
    assert.equal(acceptCompleted.length, 1);
    assert.ok(acceptProof.expiresAtMs - acceptCompleted[0]! >= 200);
    t.diagnostic(`${fixture.path} Accept proof reserve ${acceptProof.expiresAtMs - acceptCompleted[0]!} ms`);
    const reject = evaluateRejectGate({...input, nowMs:Date.now()});
    if (fixture.rejectSelector) {
      assert.equal(reject.outcome, "qualified", JSON.stringify(reject));
      assert.equal(reject.exactSelector, fixture.rejectSelector);
      const firstLayerProof = readRejectFirstLayerProof({...reject, scanId});
      assert.ok(firstLayerProof);
      const rejectCompleted: number[] = [];
      const packet = await runPostRefusalObserver({
        ...common, firstLayerProof, parentDispatchSha256:input.parentDispatchSha256, allowCanonicalRejectDiscovery:true,
        recipe:buildCanonicalPostRefusalActionRecipes().find(recipe => recipe.cmpId === "HubSpot Consent Banner")!,
        onExactRejectClickCompleted:event => rejectCompleted.push(event.completedAtMs),
      });
      assert.equal(packet.interactionDiagnostics?.click.outcome, "completed", JSON.stringify({
        reason:packet.resolver.reason, limitations:packet.limitations, interaction:packet.interactionDiagnostics,
      }));
      assert.equal(rejectCompleted.length, 1);
      assert.ok(firstLayerProof.expiresAtMs - rejectCompleted[0]! >= 200);
      t.diagnostic(`${fixture.path} Reject proof reserve ${firstLayerProof.expiresAtMs - rejectCompleted[0]!} ms`);
    } else {
      assert.equal(reject.outcome, "blocked");
    }
  }
  assert.deepEqual(clicks, ["/native/accept", "/hubspot/accept", "/hubspot/reject"]);
});
