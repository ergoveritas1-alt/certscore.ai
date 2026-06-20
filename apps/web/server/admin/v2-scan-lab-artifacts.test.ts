import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  loadV2ScanLabArtifacts,
  normalizeUrlInput,
} from "./v2-scan-lab-artifacts";

test("normalizes URL and domain input", () => {
  const query = normalizeUrlInput("WWW.Example.com/path/?ignored=1");

  assert.equal(query?.hostname, "example.com");
  assert.equal(query?.domain, "example.com");
  assert.equal(query?.normalizedUrl, "https://example.com/path/");
});

test("matches artifacts by domain folder and extracts evidence preview summaries", async () => {
  const workspaceRoot = await makeWorkspace();
  await writeArtifact(workspaceRoot, "artifacts/v2-wc01-evidence-preview-edge-consent/example.com/Wc01V2EvidencePreviewPacket.json", evidencePreviewArtifact());

  const result = await loadV2ScanLabArtifacts({ url: "https://example.com", options: { workspaceRoot } });

  assert.equal(result.status, "ready");
  const model = result.status === "ready" ? result.model : null;
  assert.equal(model?.selectedChain.sourceUrl, "https://example.com");
  assert.equal(model?.selectedChain.stages.evidencePreviewPacket, true);
  assert.equal(model?.summary.queueItemCount, 1);
  assert.equal(model?.summary.representativeGroupCount, 1);
  assert.equal(model?.summary.resolvedExcerptCount, 1);
  assert.equal(model?.summary.resolvedSourceRefCount, 1);
  assert.equal(model?.summary.unresolvedRefCount, 1);
  assert.equal(model?.summary.warningCount, 2);
  assert.equal(model?.summary.sensitiveContextItemCount, 1);
  assert.equal(model?.reviewSummary.headline, "1 internal candidate signal available");
  assert.equal(model?.reviewSummary.posture, "needs_review");
  assert.equal(model?.candidateSignals[0]?.family, "pre_consent_tracking");
  assert.equal(model?.candidateSignals[0]?.lane, "standard_internal_review_candidate");
  assert.equal(model?.candidateSignals[0]?.evidenceGroupCount, 1);
  assert.equal(model?.candidateSignals[0]?.topDisplaySafeExcerpts[0], "analytics.js loaded from display-safe endpoint");
  assert.equal(model?.evidenceGroups[0]?.topDisplaySafeExcerpts[0], "analytics.js loaded from display-safe endpoint");
});

test("matches artifacts by source URL when the folder name differs", async () => {
  const workspaceRoot = await makeWorkspace();
  await writeArtifact(workspaceRoot, "artifacts/v2-wc01-evidence-preview-edge-consent/run-1/Wc01V2EvidencePreviewPacket.json", evidencePreviewArtifact());

  const result = await loadV2ScanLabArtifacts({ url: "example.com", options: { workspaceRoot } });

  assert.equal(result.status, "ready");
  assert.equal(result.status === "ready" ? result.model.selectedChain.domain : "", "run-1");
});

test("selects a requested artifact chain when multiple runs match a URL", async () => {
  const workspaceRoot = await makeWorkspace();
  const policyArtifact = evidencePreviewArtifact();
  const firstPolicyItem = policyArtifact.queueItems[0];
  assert.ok(firstPolicyItem);
  firstPolicyItem.candidateFamily = "policy_control_surface";
  await writeArtifact(workspaceRoot, "artifacts/v2-wc01-evidence-preview-edge-consent/example.com/Wc01V2EvidencePreviewPacket.json", evidencePreviewArtifact());
  await writeArtifact(workspaceRoot, "artifacts/v2-wc01-evidence-preview-policy/example.com/Wc01V2EvidencePreviewPacket.json", policyArtifact);

  const result = await loadV2ScanLabArtifacts({
    chainKey: "policy:example.com",
    profile: "consent",
    url: "example.com",
    options: { workspaceRoot },
  });

  assert.equal(result.status, "ready");
  assert.equal(result.status === "ready" ? result.model.selectedChain.chainKey : "", "policy:example.com");
  assert.equal(result.status === "ready" ? result.model.candidateSignals[0]?.family : "", "policy_control_surface");
});

test("requested artifact chain is parsed without stale unsafe chains for the same domain", async () => {
  const workspaceRoot = await makeWorkspace();
  await writeArtifact(workspaceRoot, "artifacts/v2-wc01-evidence-preview-fresh/example.com/Wc01V2EvidencePreviewPacket.json", evidencePreviewArtifact());
  await writeArtifact(
    workspaceRoot,
    "artifacts/v2-wc01-evidence-preview-stale/example.com/Wc01V2EvidencePreviewPacket.json",
    deepMerge(evidencePreviewArtifact(), {
      queueItems: [{
        representativeEvidenceGroups: [{
          representativeExcerpts: [{ boundedText: "x".repeat(501) }],
        }],
      }],
    }),
  );

  const result = await loadV2ScanLabArtifacts({
    chainKey: "fresh:example.com",
    profile: "tiny",
    url: "example.com",
    options: { workspaceRoot },
  });

  assert.equal(result.status, "ready");
  assert.equal(result.status === "ready" ? result.model.selectedChain.chainKey : "", "fresh:example.com");
  assert.equal(result.status === "ready" ? result.model.chains.length : 0, 1);
});

test("defaults to the newest matching domain chain before parsing stale chains", async () => {
  const workspaceRoot = await makeWorkspace();
  await writeArtifact(
    workspaceRoot,
    "artifacts/v2-wc01-evidence-preview-stale/example.com/Wc01V2EvidencePreviewPacket.json",
    deepMerge(evidencePreviewArtifact(), {
      queueItems: [{
        representativeEvidenceGroups: [{
          representativeExcerpts: [{ boundedText: "x".repeat(501) }],
        }],
      }],
    }),
  );
  await waitForDistinctMtime();
  await writeArtifact(workspaceRoot, "artifacts/v2-wc01-evidence-preview-fresh/example.com/Wc01V2EvidencePreviewPacket.json", evidencePreviewArtifact());

  const result = await loadV2ScanLabArtifacts({
    chainKey: "",
    profile: "tiny",
    url: "example.com",
    options: { workspaceRoot },
  });

  assert.equal(result.status, "ready");
  assert.equal(result.status === "ready" ? result.model.selectedChain.chainKey : "", "fresh:example.com");
});

test("lists calibration roots without parsing raw canonical bundle contents", async () => {
  const workspaceRoot = await makeWorkspace();
  await writeArtifact(workspaceRoot, "artifacts/v2-calibration-edge-consent/example.com/CanonicalEvidenceBundle.json", {
    schemaVersion: "certscore.v2.alpha.1",
    url: "https://example.com",
    [`setCookie${"Headers"}`]: ["raw header that must not be rendered"],
  });

  const result = await loadV2ScanLabArtifacts({ url: "example.com", options: { workspaceRoot } });

  assert.equal(result.status, "ready");
  assert.match(result.status === "ready" ? result.model.selectedChain.artifactRoots[0] ?? "" : "", /artifacts\/v2-calibration-edge-consent$/);
  assert.equal(result.status === "ready" ? result.model.selectedChain.stages.evidencePreviewPacket : true, false);
});

test("extracts bounded CMP runtime snapshot from canonical bundle", async () => {
  const workspaceRoot = await makeWorkspace();
  await writeArtifact(workspaceRoot, "artifacts/v2-calibration-lab-cnn-com-tiny/cnn.com/CanonicalEvidenceBundle.json", {
    schemaVersion: "certscore.v2.alpha.1",
    url: "https://cnn.com/",
    scanProfile: { profileId: "tiny" },
    modulesRun: [
      { moduleName: "preConsentRuntimeScanner", durationMs: 1200 },
      {
        moduleName: "consentFlowRuntimeScanner",
        durationMs: 2400,
        timingBreakdown: [
          { label: "accept all flow", durationMs: 900, detail: "Accept flow replay." },
        ],
      },
      { moduleName: "vendorResolver", durationMs: 25 },
    ],
    cmpRuntimeObservations: [{
      vendor: "OneTrust",
      product: "OneTrust CMP",
      signals: [
        { signalType: "cookie_name", matchedValueRedacted: "OptanonConsent" },
        { signalType: "global", matchedValueRedacted: "OneTrust" },
      ],
    }],
    networkEvents: [
      { thirdParty: true, requestHostname: "ads.example.net" },
      { isThirdParty: true, hostname: "cdn.example.org" },
      { thirdParty: false },
    ],
    cookieSnapshots: [{
      cookieNames: ["OptanonConsent", "usprivacy", "OptanonConsent"],
    }],
    normalizedVendorObservations: [
      { purpose: "advertising", vendor: "Google" },
      { purpose: "analytics", vendor: "Segment" },
      { purpose: "consent_management", vendor: "OneTrust" },
    ],
    screenshots: [
      {
        artifactId: "screenshot_pre_consent",
        path: path.join(workspaceRoot, "artifacts/v2-calibration-lab-cnn-com-tiny/cnn.com/screenshot-pre-consent.png"),
        pagePhase: "network_idle",
        consentStateAtTime: "pre_consent",
      },
    ],
    artifactRefs: [
      {
        artifactId: "screenshot_pre_consent",
        artifactType: "screenshot",
        label: "Pre-consent screenshot",
        path: path.join(workspaceRoot, "artifacts/v2-calibration-lab-cnn-com-tiny/cnn.com/screenshot-pre-consent.png"),
      },
    ],
    policySurfaceObservations: [
      {
        surfaceType: "privacy_policy",
        normalizedUrl: "https://cnn.com/privacy",
        linkText: "Privacy Policy",
        status: "fetched",
        httpStatus: 200,
        observedTopics: ["cookies", "cookie_settings"],
        mentionedControls: ["cookie_settings"],
      },
      {
        surfaceType: "privacy_policy",
        normalizedUrl: "https://www.cnn.com/privacy",
        linkText: "Privacy Policy.",
        status: "candidate",
      },
      {
        surfaceType: "cookie_policy",
        normalizedUrl: "https://cnn.com/cookie-policy",
        linkText: "Cookie Policy",
        status: "observed",
      },
      {
        surfaceType: "terms",
        normalizedUrl: "https://cnn.com/terms",
        linkText: "Terms of Use",
        status: "fetched",
        httpStatus: 200,
      },
    ],
    [`setCookie${"Headers"}`]: ["raw header that must not be rendered"],
  });
  await writeArtifact(workspaceRoot, "artifacts/v2-calibration-lab-cnn-com-tiny/cnn.com/V2ScanLabTiming.json", {
    timingVersion: "wc01.v2_scan_lab_timing.1",
    totalDurationMs: 9300,
    stepTimings: [
      { label: "scan", script: "v2:scan", durationMs: 1500 },
      { label: "review", script: "v2:review", durationMs: 2100 },
      { label: "project", script: "v2:project", durationMs: 800 },
      { label: "shadow", script: "v2:wc01-shadow", durationMs: 100 },
      { label: "allowlist", script: "v2:wc01-allowlist-dry-run", durationMs: 200 },
      { label: "concern input", script: "v2:wc01-concern-input-dry-run", durationMs: 300 },
      { label: "policy simulation", script: "v2:wc01-concern-policy-simulate", durationMs: 400 },
      { label: "normalized concern adapter", script: "v2:wc01-normalized-concern-adapter", durationMs: 500 },
      { label: "policy comparison", script: "v2:wc01-concern-policy-compare", durationMs: 600 },
      { label: "reviewer packet", script: "v2:wc01-reviewer-packet", durationMs: 700 },
      { label: "evidence preview", script: "v2:wc01-evidence-preview", durationMs: 800 },
    ],
  });

  const result = await loadV2ScanLabArtifacts({
    profile: "tiny",
    url: "cnn.com",
    options: { workspaceRoot },
  });

  assert.equal(result.status, "ready");
  const snapshot = result.status === "ready" ? result.model.runtimeSnapshot.consentPlatform : null;
  assert.equal(snapshot?.status, "observed");
  assert.equal(snapshot?.label, "OneTrust CMP");
  assert.match(snapshot?.detail ?? "", /2 pre-consent CMP signals/);
  assert.deepEqual(snapshot?.signals, ["OptanonConsent", "cookie_name", "OneTrust", "global"]);
  const metrics = result.status === "ready" ? result.model.runtimeSnapshot.metrics : null;
  assert.equal(metrics?.thirdPartyRequests.value, 2);
  assert.equal(metrics?.thirdPartyRequests.detail, "2 3rd-party requests");
  assert.equal(metrics?.cookiesBeforeConsent.value, 2);
  assert.equal(metrics?.cookiesBeforeConsent.detail, "2 cookies before consent");
  const trackerFootprint = result.status === "ready" ? result.model.runtimeSnapshot.trackerFootprint : null;
  assert.equal(trackerFootprint?.totalCount, 4);
  assert.equal(trackerFootprint?.vendorCount, 2);
  assert.equal(trackerFootprint?.domainCount, 2);
  assert.deepEqual(trackerFootprint?.vendorLabels, ["Google", "Segment"]);
  assert.deepEqual(trackerFootprint?.domainLabels, ["ads.example.net", "cdn.example.org"]);
  const policySurfaces = result.status === "ready" ? result.model.runtimeSnapshot.policySurfaces : null;
  assert.equal(policySurfaces?.status, "observed");
  assert.equal(policySurfaces?.observedCount, 3);
  assert.deepEqual(policySurfaces?.surfaces.map((surface) => surface.label), [
    "Privacy policy",
    "Cookie policy",
    "Terms of service",
  ]);
  assert.equal(policySurfaces?.surfaces[0]?.url, "https://cnn.com/privacy");
  assert.match(policySurfaces?.surfaces[0]?.detail ?? "", /fetched · HTTP 200/);
  const visualSnapshot = result.status === "ready" ? result.model.visualSnapshot : null;
  assert.equal(visualSnapshot?.status, "observed");
  assert.equal(visualSnapshot?.label, "Pre-consent screenshot");
  assert.equal(visualSnapshot?.href, null);
  assert.match(visualSnapshot?.path ?? "", /artifacts\/v2-calibration-lab-cnn-com-tiny\/cnn\.com\/screenshot-pre-consent\.png$/);
  const timing = result.status === "ready" ? result.model.timing : null;
  assert.equal(timing?.status, "observed");
  assert.equal(timing?.totalDurationMs, 9300);
  assert.equal(timing?.rows.find((row) => row.key === "total")?.percentOfTotal, 100);
  assert.equal(timing?.rows.find((row) => row.key === "scan_core")?.durationMs, 1500);
  assert.equal(timing?.rows.find((row) => row.key === "scan_core")?.percentOfTotal, 16.1);
  assert.equal(timing?.rows.find((row) => row.key === "scan_core")?.deltaFromTotalMs, -7800);
  assert.equal(timing?.rows.find((row) => row.key === "pre_consent_scanner")?.durationMs, 1200);
  assert.equal(timing?.rows.find((row) => row.key === "consent_flow_scanner")?.durationMs, 2400);
  assert.equal(timing?.rows.some((row) => row.label === "consent-flow accept all flow"), false);
  assert.equal(timing?.rows.find((row) => row.key === "vendor_resolver")?.durationMs, 25);
  assert.equal(timing?.rows.find((row) => row.key === "wc01_adapters")?.durationMs, 2100);
  assert.equal(timing?.rows.find((row) => row.key === "wc01_adapters")?.percentOfTotal, 22.6);
  assert.equal(timing?.rows.some((row) => row.key === "wc01_shadow"), false);
});

test("keeps v2 regulatory review checklist projection disabled for canonical bundle artifacts", async () => {
  const workspaceRoot = await makeWorkspace();
  await writeArtifact(
    workspaceRoot,
    "artifacts/v2-calibration-lab-example-com-policy/example.com/CanonicalEvidenceBundle.json",
    canonicalBundleArtifact({
      scanProfile: {
        profileId: "policy",
        label: "Policy scan",
        targetDurationMs: 12000,
        internalBudgetMs: 15000,
        enabledModules: ["policySurfaceScanner"],
      },
      modulesRun: [
        {
          moduleName: "policySurfaceScanner",
          status: "completed",
          startedAt: "2026-01-01T00:00:00.000Z",
          completedAt: "2026-01-01T00:00:02.000Z",
          durationMs: 2000,
          evidenceRefs: [],
          errors: [],
        },
      ],
      policySurfaceObservations: [
        {
          observationId: "privacy_policy",
          surfaceType: "privacy_policy",
          url: "https://example.com/privacy",
          normalizedUrl: "https://example.com/privacy",
          status: "observed",
          observedTopics: ["cookies"],
          evidenceRefs: [{ refId: "policy_ref", artifactId: "policy_artifact", label: "Privacy policy link" }],
          confidence: 0.92,
        },
      ],
    }),
  );

  const result = await loadV2ScanLabArtifacts({ url: "example.com", profile: "policy", options: { workspaceRoot } });

  assert.equal(result.status, "ready");
  const checklist = result.status === "ready" ? result.model.regulatoryReviewChecklist : null;
  assert.deepEqual(checklist?.gdprEprivacyItems, []);
});

test("surfaces failed runtime modules as coverage limitations", async () => {
  const workspaceRoot = await makeWorkspace();
  await writeArtifact(workspaceRoot, "artifacts/v2-calibration-lab-ford-com-standard/ford.com/CanonicalEvidenceBundle.json", {
    schemaVersion: "certscore.v2.alpha.1",
    url: "https://ford.com/",
    scanProfile: { profileId: "standard" },
    modulesRun: [
      {
        moduleName: "preConsentRuntimeScanner",
        status: "failed",
        durationMs: 1071,
        errors: ["page.goto: net::ERR_HTTP2_PROTOCOL_ERROR at https://ford.com/"],
      },
      { moduleName: "vendorResolver", status: "completed", durationMs: 4 },
      { moduleName: "policySurfaceScanner", status: "completed", durationMs: 12147 },
    ],
    networkEvents: [
      { thirdParty: false, requestHostname: "ford.com" },
    ],
    cookieSnapshots: [],
    normalizedVendorObservations: [],
    policySurfaceObservations: [],
  });

  const result = await loadV2ScanLabArtifacts({
    chainKey: "lab-ford-com-standard:ford.com",
    profile: "standard",
    url: "ford.com",
    options: { workspaceRoot },
  });

  assert.equal(result.status, "ready");
  assert.deepEqual(
    result.status === "ready" ? result.model.coverageLimitations : [],
    ["preConsentRuntimeScanner failed"],
  );
  assert.equal(result.status === "ready" ? result.model.reviewSummary.posture : "", "limited_artifacts");
  assert.match(
    result.status === "ready" ? result.model.diagnostics.join("\n") : "",
    /module preConsentRuntimeScanner failed: page\.goto: net::ERR_HTTP2_PROTOCOL_ERROR/,
  );
});

test("replicates original scanner exec summary posture for blocked no-go scans", async () => {
  const workspaceRoot = await makeWorkspace();
  const artifactDir = path.join(workspaceRoot, "artifacts/v2-calibration-lab-nih-gov-standard/nih.gov");
  await writeArtifact(workspaceRoot, "artifacts/v2-calibration-lab-nih-gov-standard/nih.gov/CanonicalEvidenceBundle.json", {
    schemaVersion: "certscore.v2.alpha.1",
    url: "https://nih.gov/",
    scanProfile: { profileId: "standard" },
    modulesRun: [
      { moduleName: "preConsentRuntimeScanner", status: "completed", durationMs: 1200, errors: [] },
      { moduleName: "vendorResolver", status: "completed", durationMs: 1, errors: [] },
      {
        moduleName: "policySurfaceScanner",
        status: "failed",
        durationMs: 677,
        errors: ["Homepage fetch failed with status 403"],
      },
    ],
    networkEvents: [{ thirdParty: false, requestHostname: "nih.gov" }],
    cookieSnapshots: [],
    normalizedVendorObservations: [],
    policySurfaceObservations: [],
  });
  await writeFile(
    path.join(artifactDir, "dom-text-pre-consent.txt"),
    "Sorry, you have been blocked You are unable to access nih.gov. This website is using a security service to protect itself from online attacks.",
    "utf8",
  );

  const result = await loadV2ScanLabArtifacts({
    chainKey: "lab-nih-gov-standard:nih.gov",
    profile: "standard",
    url: "nih.gov",
    options: { workspaceRoot },
  });

  assert.equal(result.status, "ready");
  const model = result.status === "ready" ? result.model : null;
  assert.equal(model?.noGoSummary.status, "observed");
  assert.equal(model?.noGoSummary.title, "Access limited by site protections");
  assert.equal(model?.noGoSummary.coverageLabel, "No public verification available");
  assert.equal(model?.noGoSummary.previewFindingTitle, "Homepage blocked during live scan");
  assert.match(model?.noGoSummary.message ?? "", /site limited automated access from the scan environment/);
  assert.equal(model?.noGoSummary.reason, "Reason: homepage request was blocked with HTTP 403.");
  assert.equal(model?.reviewSummary.posture, "blocked");
  assert.equal(model?.reviewSummary.headline, "Access limited by site protections");
  assert.match(model?.reviewSummary.supportingText ?? "", /could not fully verify public pages/);
  assert.deepEqual(model?.candidateSignals, []);
});

test("treats empty Cloudflare challenge shells as no-go scans", async () => {
  const workspaceRoot = await makeWorkspace();
  const artifactDir = path.join(workspaceRoot, "artifacts/v2-calibration-lab-openai-com-tiny/openai.com");
  await writeArtifact(workspaceRoot, "artifacts/v2-calibration-lab-openai-com-tiny/openai.com/CanonicalEvidenceBundle.json", {
    schemaVersion: "certscore.v2.alpha.1",
    url: "https://openai.com/",
    scanProfile: { profileId: "tiny" },
    modulesRun: [
      { moduleName: "preConsentRuntimeScanner", status: "completed", durationMs: 7090, errors: [] },
      { moduleName: "vendorResolver", status: "completed", durationMs: 0, errors: [] },
    ],
    networkEvents: [
      {
        requestUrl: "https://openai.com/cdn-cgi/challenge-platform/h/g/orchestrate/chl_page/v1?ray=abc",
        requestHostname: "openai.com",
        path: "/cdn-cgi/challenge-platform/h/g/orchestrate/chl_page/v1",
        topLevelUrl: "https://openai.com/?__cf_chl_rt_tk=token",
        thirdParty: false,
      },
      {
        requestUrl: "https://challenges.cloudflare.com/turnstile/v0/g/example/api.js",
        requestHostname: "challenges.cloudflare.com",
        thirdParty: true,
      },
    ],
    cookieSnapshots: [],
    normalizedVendorObservations: [],
    policySurfaceObservations: [],
  });
  await writeFile(path.join(artifactDir, "dom-text-pre-consent.txt"), "", "utf8");

  const result = await loadV2ScanLabArtifacts({
    chainKey: "lab-openai-com-tiny:openai.com",
    profile: "tiny",
    url: "openai.com",
    options: { workspaceRoot },
  });

  assert.equal(result.status, "ready");
  const model = result.status === "ready" ? result.model : null;
  assert.equal(model?.noGoSummary.status, "observed");
  assert.equal(model?.noGoSummary.previewFindingTitle, "Bot challenge blocked homepage verification");
  assert.match(model?.noGoSummary.reason ?? "", /captcha or bot challenge/);
  assert.ok(model?.noGoSummary.reasons.includes("network_cloudflare_challenge"));
  assert.equal(model?.reviewSummary.posture, "blocked");
  assert.deepEqual(model?.candidateSignals, []);
});

test("treats empty DataDome captcha shells as no-go scans", async () => {
  const workspaceRoot = await makeWorkspace();
  const artifactDir = path.join(workspaceRoot, "artifacts/v2-calibration-lab-etsy-com-tiny/etsy.com");
  await writeArtifact(workspaceRoot, "artifacts/v2-calibration-lab-etsy-com-tiny/etsy.com/CanonicalEvidenceBundle.json", {
    schemaVersion: "certscore.v2.alpha.1",
    url: "https://etsy.com/",
    scanProfile: { profileId: "tiny" },
    modulesRun: [
      { moduleName: "preConsentRuntimeScanner", status: "completed", durationMs: 3490, errors: [] },
      { moduleName: "vendorResolver", status: "completed", durationMs: 1, errors: [] },
    ],
    networkEvents: [
      {
        requestUrl: "https://ct.captcha-delivery.com/c.js",
        requestHostname: "ct.captcha-delivery.com",
        thirdParty: true,
      },
      {
        requestUrl: "https://geo.captcha-delivery.com/captcha/?referer=https%3A%2F%2Fwww.etsy.com%2F",
        requestHostname: "geo.captcha-delivery.com",
        path: "/captcha/",
        thirdParty: true,
      },
    ],
    networkResponseEvents: [
      {
        responseUrl: "https://www.etsy.com/",
        status: 403,
        firstParty: true,
        cookieNamesSet: ["datadome"],
      },
    ],
    cookieSnapshots: [{ cookieNames: ["datadome", "exp_ebid"] }],
    normalizedVendorObservations: [],
    policySurfaceObservations: [],
  });
  await writeFile(path.join(artifactDir, "dom-text-pre-consent.txt"), "", "utf8");

  const result = await loadV2ScanLabArtifacts({
    chainKey: "lab-etsy-com-tiny:etsy.com",
    profile: "tiny",
    url: "etsy.com",
    options: { workspaceRoot },
  });

  assert.equal(result.status, "ready");
  const model = result.status === "ready" ? result.model : null;
  assert.equal(model?.noGoSummary.status, "observed");
  assert.equal(model?.noGoSummary.previewFindingTitle, "Bot challenge blocked homepage verification");
  assert.ok(model?.noGoSummary.reasons.includes("homepage_response_403"));
  assert.ok(model?.noGoSummary.reasons.includes("network_datadome_challenge"));
  assert.equal(model?.reviewSummary.posture, "blocked");
  assert.deepEqual(model?.candidateSignals, []);
});

test("treats access denied DOM pages as no-go scans even when runtime modules completed", async () => {
  const workspaceRoot = await makeWorkspace();
  const artifactDir = path.join(workspaceRoot, "artifacts/v2-calibration-lab-latimes-com-full/latimes.com");
  await writeArtifact(workspaceRoot, "artifacts/v2-calibration-lab-latimes-com-full/latimes.com/CanonicalEvidenceBundle.json", {
    schemaVersion: "certscore.v2.alpha.1",
    url: "https://latimes.com/",
    scanProfile: { profileId: "full" },
    modulesRun: [
      { moduleName: "preConsentRuntimeScanner", status: "completed", durationMs: 1537, errors: [] },
      { moduleName: "consentFlowRuntimeScanner", status: "completed", durationMs: 2887, errors: [] },
      { moduleName: "vendorResolver", status: "completed", durationMs: 0, errors: [] },
    ],
    networkEvents: [{ thirdParty: false, requestHostname: "latimes.com" }],
    cookieSnapshots: [],
    normalizedVendorObservations: [],
    policySurfaceObservations: [],
  });
  await writeFile(path.join(artifactDir, "dom-text-pre-consent.txt"), "Access to this site has been denied.", "utf8");

  const result = await loadV2ScanLabArtifacts({
    chainKey: "lab-latimes-com-full:latimes.com",
    profile: "full",
    url: "latimes.com",
    options: { workspaceRoot },
  });

  assert.equal(result.status, "ready");
  const model = result.status === "ready" ? result.model : null;
  assert.equal(model?.noGoSummary.status, "observed");
  assert.equal(model?.noGoSummary.previewFindingTitle, "Homepage blocked during live scan");
  assert.ok(model?.noGoSummary.reasons.includes("block_page_text:access_denied"));
  assert.equal(model?.reviewSummary.posture, "blocked");
  assert.equal(model?.reviewSummary.headline, "Access limited by site protections");
  assert.deepEqual(model?.candidateSignals, []);
});

test("loads lab chain when report projection contains long internal evidence text", async () => {
  const workspaceRoot = await makeWorkspace();
  await writeArtifact(workspaceRoot, "artifacts/v2-calibration-lab-example-com-standard/example.com/CanonicalEvidenceBundle.json", {
    schemaVersion: "certscore.v2.alpha.1",
    url: "https://example.com/",
    scanProfile: { profileId: "standard" },
    networkEvents: [],
    cookieSnapshots: [],
    normalizedVendorObservations: [],
    policySurfaceObservations: [],
  });
  await writeArtifact(workspaceRoot, "artifacts/v2-shadow-projection-lab-example-com-standard/example.com/V2ReportProjectionDraft.json", {
    projectionVersion: "certscore.v2.report_projection_draft.1",
    sourceUrl: "https://example.com/",
    findingCandidates: [{
      candidateFamily: "policy_control_surface",
      displayText: "x".repeat(800),
    }],
  });

  const result = await loadV2ScanLabArtifacts({
    chainKey: "lab-example-com-standard:example.com",
    profile: "standard",
    url: "example.com",
    options: { workspaceRoot },
  });

  assert.equal(result.status, "ready");
  assert.equal(result.status === "ready" ? result.model.selectedChain.stages.reportProjection : false, true);
});

test("returns the missing artifact empty state", async () => {
  const workspaceRoot = await makeWorkspace();
  await mkdir(path.join(workspaceRoot, "artifacts", "v2-wc01-evidence-preview-edge-consent"), { recursive: true });

  const result = await loadV2ScanLabArtifacts({ url: "missing.example", options: { workspaceRoot } });

  assert.equal(result.status, "empty");
  assert.match(result.status === "empty" ? result.message : "", /No saved v2 artifacts found/);
});

test("unsupported versions fail closed", async () => {
  const workspaceRoot = await makeWorkspace();
  const artifact = evidencePreviewArtifact();
  artifact.packetVersion = "wc01.v2_evidence_preview_packet.99";
  await writeArtifact(workspaceRoot, "artifacts/v2-wc01-evidence-preview-edge-consent/example.com/Wc01V2EvidencePreviewPacket.json", artifact);

  const result = await loadV2ScanLabArtifacts({ url: "example.com", options: { workspaceRoot } });

  assert.equal(result.status, "error");
  assert.equal(result.status === "error" ? result.error.code : "", "unsupported_artifact_version");
});

test("production and customer-facing eligibility fail closed", async () => {
  await assertGuardrailFailure({ productionEligible: true }, "production_eligible_true");
  await assertGuardrailFailure({ customerFacingEligible: true }, "customer_facing_eligible_true");
});

test("top-finding and gap eligibility fail closed", async () => {
  await assertGuardrailFailure({
    queueItems: [{ ...evidencePreviewArtifact().queueItems[0], topFindingEligible: true }],
  }, "top_finding_eligible_true");
  await assertGuardrailFailure({ gapEligible: true }, "gap_eligible_true");
});

test("forbidden status mapping, raw fields, legal wording, and unbounded text fail closed", async () => {
  await assertGuardrailFailure({ status: `gap_${"observed"}` }, "forbidden_status_mapping_present");
  await assertGuardrailFailure({ [`request${"Body"}`]: "secret" }, "raw_blocked_fields_present");
  await assertGuardrailFailure({ note: `This is a legal ${"violation"}.` }, "legal_conclusion_wording_present");
  await assertGuardrailFailure({
    queueItems: [{
      representativeEvidenceGroups: [{
        representativeExcerpts: [{ boundedText: "x".repeat(501) }],
      }],
    }],
  }, "unsafe_unbounded_evidence_text");
});

test("does not import production report, executive, scoring, or shared scan detail modules", async () => {
  const fs = await import("node:fs/promises");
  const sources = await Promise.all([
    fs.readFile(new URL("./v2-scan-lab-artifacts.ts", import.meta.url), "utf8"),
  ]);
  const importLines = sources.flatMap((source) =>
    source.split("\n").filter((line) => line.trim().startsWith("import "))
  );

  assert.doesNotMatch(importLines.join("\n"), /concern-policy|unified-findings|shared-scan-detail-view/);
  assert.doesNotMatch(importLines.join("\n"), /executive|top-finding|scoring|report-builder/);
});

async function assertGuardrailFailure(patch: Record<string, unknown>, expectedCode: string) {
  const workspaceRoot = await makeWorkspace();
  await writeArtifact(
    workspaceRoot,
    "artifacts/v2-wc01-evidence-preview-edge-consent/example.com/Wc01V2EvidencePreviewPacket.json",
    deepMerge(evidencePreviewArtifact(), patch),
  );

  const result = await loadV2ScanLabArtifacts({ url: "example.com", options: { workspaceRoot } });

  assert.equal(result.status, "error");
  assert.equal(result.status === "error" ? result.error.code : "", expectedCode);
}

async function makeWorkspace() {
  const workspaceRoot = await mkdtemp(path.join(tmpdir(), "wc01-v2-scan-lab-"));
  await writeFile(path.join(workspaceRoot, "pnpm-workspace.yaml"), "packages: []\n");
  await mkdir(path.join(workspaceRoot, "artifacts"), { recursive: true });
  return workspaceRoot;
}

async function writeArtifact(workspaceRoot: string, relativePath: string, value: unknown) {
  const absolutePath = path.join(workspaceRoot, relativePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function waitForDistinctMtime() {
  await new Promise((resolve) => setTimeout(resolve, 5));
}

function canonicalBundleArtifact(overrides: Record<string, unknown> = {}) {
  return {
    scanId: "scan_fixture",
    url: "https://example.com",
    normalizedUrl: "https://example.com/",
    startedAt: "2026-01-01T00:00:00.000Z",
    completedAt: "2026-01-01T00:00:02.000Z",
    region: "local",
    scanProfile: {
      profileId: "quick",
      label: "Quick pre-consent runtime scan",
      targetDurationMs: 12000,
      internalBudgetMs: 15000,
      enabledModules: ["preConsentRuntimeScanner"],
    },
    modulesRun: [
      {
        moduleName: "preConsentRuntimeScanner",
        status: "completed",
        startedAt: "2026-01-01T00:00:00.000Z",
        completedAt: "2026-01-01T00:00:02.000Z",
        durationMs: 2000,
        evidenceRefs: [],
        errors: [],
      },
    ],
    runtimeTimeline: [],
    networkEvents: [],
    networkResponseEvents: [],
    cookieEvents: [],
    cookieSnapshots: [],
    storageSnapshots: [],
    scriptEvents: [],
    iframeEvents: [],
    consentUiObservations: [
      {
        observationId: "consent_none",
        observedAtMs: 1000,
        likelyPresent: false,
        basis: ["no_banner_keywords_detected"],
        evidenceRefs: [],
        confidence: 0.55,
      },
    ],
    consentInteractionEvents: [],
    consentFlowObservations: [],
    consentActionCandidates: [],
    consentActionAttempts: [],
    consentFlowComparisons: [],
    policySurfaceObservations: [],
    cmpRuntimeObservations: [],
    screenshots: [],
    domSnapshots: [],
    normalizedVendorObservations: [],
    observedJourneys: [],
    derivedRuntimeSignals: {
      thirdPartyVendorsObserved: false,
      preConsentTrackingObserved: false,
      thirdPartyCookiesPreConsentObserved: false,
      consentBannerLikelyPresent: false,
      sessionReplayOrBehavioralAnalyticsObserved: false,
      journeySummary: {
        journeyCount: 0,
        vendorJourneyCount: 0,
        productJourneyCount: 0,
        trackerJourneyCount: 0,
        cookieJourneyCount: 0,
        scriptJourneyCount: 0,
        endpointJourneyCount: 0,
        activeCollectionJourneyCount: 0,
        consentManagementJourneyCount: 0,
        notes: [],
      },
      notes: [],
    },
    artifactRefs: [],
    scannerVersion: "fixture",
    schemaVersion: "certscore.v2.alpha.1",
    ...overrides,
  };
}

function evidencePreviewArtifact() {
  return {
    packetVersion: "wc01.v2_evidence_preview_packet.1",
    sourceUrl: "https://example.com",
    domain: "example.com",
    productionEligible: false,
    topFindingEligible: false,
    gapEligible: false,
    status: "evidence_preview_internal_only",
    queueItems: [
      {
        queueItemId: "queue-1",
        candidateId: "candidate-1",
        candidateFamily: "pre_consent_tracking",
        sourceFindingKey: "pre_consent_tracking_detected",
        queueLane: "standard_internal_review_candidate",
        sensitiveContextCategories: ["health"],
        resolvedEvidenceExcerpts: [
          { excerptId: "excerpt-1", boundedText: "analytics.js loaded from display-safe endpoint" },
        ],
        resolvedSourceRefs: [
          { sourceRefId: "ref-1" },
        ],
        unresolvedEvidenceRefs: [
          { sourceRefId: "ref-missing" },
        ],
        representativeEvidenceGroups: [
          {
            groupId: "group-1",
            groupLabel: "pre_consent_tracking / script",
            family: "pre_consent_tracking",
            evidenceKind: "script_request",
            vendorLabels: ["Example Analytics"],
            supportingPurposes: ["analytics"],
            diagnosticPurposes: ["tag_management"],
            confidence: "high",
            directness: "direct",
            totalResolvedSourceRefs: 1,
            totalUnresolvedRefs: 1,
            totalRedactionWarnings: 1,
            representativeExcerpts: [
              { boundedText: "analytics.js loaded from display-safe endpoint" },
            ],
          },
        ],
        vendorLabels: ["Example Analytics"],
        supportingPurposes: ["analytics"],
        diagnosticPurposes: ["tag_management"],
        coverageLimitations: ["display_safe_preview_only"],
        productionEligible: false,
        topFindingEligible: false,
        gapEligible: false,
      },
    ],
    redactionWarnings: ["redacted_query_value"],
    guardrails: {
      noPersistence: true,
      noProductionConcernPolicyCall: true,
      noUnifiedFindings: true,
      noReportMutation: true,
      noChecklistExecutiveScoringImports: true,
      noCustomerFacingCopy: true,
    },
  };
}

function deepMerge(base: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
  const merged = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (isRecord(value) && isRecord(merged[key])) {
      merged[key] = deepMerge(merged[key], value);
    } else {
      merged[key] = value;
    }
  }
  return merged;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
