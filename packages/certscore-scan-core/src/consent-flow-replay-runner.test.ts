import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createArtifactWriter } from "./artifact-writer.js";
import { consentFlowRuntimeScanner } from "./scanners/consent-flow-runtime-scanner.js";
import { startStaticFixtureServer } from "./test-fixtures/static-server.js";
import {
  replayConsentFlowEvidenceCorpus,
  validateConsentFlowReplayCorpus,
} from "./consent-flow-replay-runner.js";
import { writeReplayCaptureHealthReport } from "./replay-capture-health.js";

const gaRoute = {
  urlPattern: /https:\/\/www\.google-analytics\.com\/g\/collect/i,
  status: 204,
  contentType: "text/plain",
  body: "",
};

test("validateConsentFlowReplayCorpus replays captured consent-flow HAR manifests", async () => {
  const server = await startStaticFixtureServer();
  const tempRoot = await mkdtemp(path.join(tmpdir(), "certscore-consent-flow-replay-"));
  try {
    const targetUrl = server.urlFor("consent-simple-accept-reject");
    const artifactWriter = await createArtifactWriter(tempRoot);
    const scan = await consentFlowRuntimeScanner({
      url: targetUrl,
      normalizedUrl: targetUrl,
      scanStartedAtMs: Date.now(),
      internalBudgetMs: 10_000,
      artifactWriter,
      captureReplay: true,
      routeFulfillers: [gaRoute],
      stubHeavyResources: true,
    });

    const manifestPaths = scan.artifactRefs
      .filter((ref) => ref.label === "Consent-flow replay manifest")
      .map((ref) => ref.path)
      .filter((ref): ref is string => Boolean(ref));
    assert.equal(manifestPaths.length, 6);

    const result = await validateConsentFlowReplayCorpus({
      manifestPaths,
      outDir: path.join(tempRoot, "replay-validation"),
    });

    assert.equal(result.summary.evaluatedManifests, 6);
    assert.equal(result.summary.replayable, 6);
    assert.equal(result.summary.failed, 0);
    assert.equal(result.summary.missingHar, 0);
    assert.equal(result.results.every((entry) => (entry.bodyTextLength ?? 0) > 0), true);
  } finally {
    await server.close();
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("replayConsentFlowEvidenceCorpus loads captured fixture evidence bundles", async () => {
  const server = await startStaticFixtureServer();
  const tempRoot = await mkdtemp(path.join(tmpdir(), "certscore-consent-flow-evidence-"));
  try {
    const targetUrl = server.urlFor("consent-simple-accept-reject");
    const artifactWriter = await createArtifactWriter(tempRoot);
    const scan = await consentFlowRuntimeScanner({
      url: targetUrl,
      normalizedUrl: targetUrl,
      scanStartedAtMs: Date.now(),
      internalBudgetMs: 10_000,
      artifactWriter,
      captureReplay: true,
      routeFulfillers: [gaRoute],
      stubHeavyResources: true,
    });
    const manifestPaths = scan.artifactRefs
      .filter((ref) => ref.label === "Consent-flow replay manifest")
      .map((ref) => ref.path)
      .filter((ref): ref is string => Boolean(ref));

    const outDir = path.join(tempRoot, "evidence-report");
    const report = await replayConsentFlowEvidenceCorpus({ manifestPaths, outDir });
    const site = report.sites[0];

    assert.equal(report.summary.evaluatedManifests, 6);
    assert.equal(report.summary.evaluatedSites, 1);
    assert.equal(site?.detectedProvider, "OneTrust");
    assert.equal(site?.classificationDelta.originalRejectCandidateObserved, true);
    assert.equal(site?.classificationDelta.replayRejectCandidateObserved, true);
    assert.equal(site?.actionCandidates.some((candidate) => candidate.action === "reject"), true);
    assert.equal(site?.scenarios.every((scenario) => scenario.artifactStatus.controlsLoaded), true);
    assert.equal(site?.coverageAssessment.corpusScenarios.gpcEnabled, true);
    assert.equal(site?.coverageAssessment.corpusScenarios.formCollectionProbe, true);
    assert.equal(site?.coverageAssessment.corpusScenarios.accessibilityProbe, true);
    assert.equal(existsSync(path.join(outDir, "ReplayEvidenceReport.json")), true);
    assert.equal(existsSync(path.join(outDir, "ReplayEvidenceReport.md")), true);
    assert.ok(await readFile(path.join(outDir, site?.siteId ?? "", "replay-evidence.json"), "utf8"));
  } finally {
    await server.close();
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("replay capture health report is written for captured fixture bundles", async () => {
  const server = await startStaticFixtureServer();
  const tempRoot = await mkdtemp(path.join(tmpdir(), "certscore-capture-health-"));
  try {
    const targetUrl = server.urlFor("consent-simple-accept-reject");
    const artifactWriter = await createArtifactWriter(tempRoot);
    await consentFlowRuntimeScanner({
      url: targetUrl,
      normalizedUrl: targetUrl,
      scanStartedAtMs: Date.now(),
      internalBudgetMs: 10_000,
      artifactWriter,
      captureReplay: true,
      routeFulfillers: [gaRoute],
      stubHeavyResources: true,
    });

    const report = await writeReplayCaptureHealthReport({
      outDir: tempRoot,
      summary: {
        completed: 1,
        failed: 0,
        results: [{ status: "completed", url: targetUrl }],
        totalUrls: 1,
      },
      timestamp: new Date("2026-06-11T12:00:00.000Z"),
    });
    const markdown = await readFile(path.join(tempRoot, "ReplayCaptureHealthReport.md"), "utf8");

    assert.equal(existsSync(path.join(tempRoot, "ReplayCaptureHealthReport.json")), true);
    assert.equal(report.sitesWithAtLeastOneReplayBundle, 1);
    assert.equal(report.totals.replayManifests, 6);
    assert.equal(report.totals.harFiles, 6);
    assert.equal(report.totals.traceFiles, 0);
    assert.equal(report.totals.controlSnapshotFiles, 6);
    assert.equal(report.totals.originalConsentEvidenceFiles, 6);
    assert.equal(report.totals.scanCorePhaseFiles, 0);
    assert.equal(report.totals.scanLabStepDiagnosticsFiles, 0);
    assert.equal(report.totals.actionCandidateCollectionsObserved > 0, true);
    assert.match(markdown, /Replay Capture Health Report/);
    assert.match(markdown, /Largest HAR Files/);
    assert.match(markdown, /Original consent evidence files/);
  } finally {
    await server.close();
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("evidence replay detects providers from iframe DOM, storage, and HAR signals", async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), "certscore-provider-replay-"));
  try {
    const sourcepointManifest = await writeSyntheticReplayBundle(tempRoot, "sourcepoint.test", "baseline_pre_consent", {
      frames: [{
        frameIndex: 0,
        frameKind: "main_frame",
        frameUrl: "https://sourcepoint.test/",
        htmlExcerpt: "<iframe src=\"https://cmp.sourcepoint.test/message\"></iframe>",
        textExcerpt: "Home",
      }, {
        frameIndex: 1,
        frameKind: "sub_frame",
        frameName: "sp_message",
        frameUrl: "https://cmp.privacy-manager.io/sp_message",
        htmlExcerpt: "<div id=\"sp_message\"><button>Reject All</button><button>Accept All</button></div>",
        textExcerpt: "Sourcepoint privacy manager Reject All Accept All",
      }],
      harUrls: ["https://cdn.sourcepoint.com/privacy-manager.js"],
    });
    const usercentricsManifest = await writeSyntheticReplayBundle(tempRoot, "usercentrics.test", "baseline_pre_consent", {
      frames: [{
        frameIndex: 0,
        frameKind: "main_frame",
        frameUrl: "https://usercentrics.test/",
        htmlExcerpt: "<button>Manage Preferences</button>",
        textExcerpt: "Cookie settings",
      }],
      storage: { origins: [{ localStorage: [{ name: "uc_settings", value: "Usercentrics" }] }] },
    });
    const trustArcManifest = await writeSyntheticReplayBundle(tempRoot, "trustarc.test", "baseline_pre_consent", {
      frames: [{
        frameIndex: 0,
        frameKind: "main_frame",
        frameUrl: "https://trustarc.test/",
        htmlExcerpt: "<a>Privacy Policy</a>",
        textExcerpt: "TRUSTe consent manager privacy policy",
      }],
      harUrls: ["https://consent.trustarc.com/notice"],
    });

    const report = await replayConsentFlowEvidenceCorpus({
      manifestPaths: [sourcepointManifest, usercentricsManifest, trustArcManifest],
    });

    assert.equal(report.sites.find((site) => site.siteId === "sourcepoint.test")?.detectedProvider, "Sourcepoint");
    assert.equal(report.sites.find((site) => site.siteId === "sourcepoint.test")?.consentSurfaceType, "iframe_banner");
    assert.equal(report.sites.find((site) => site.siteId === "usercentrics.test")?.detectedProvider, "Usercentrics");
    assert.equal(report.sites.find((site) => site.siteId === "trustarc.test")?.detectedProvider, "TrustArc");
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("evidence replay classifies reject settings save and privacy-policy-only controls", async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), "certscore-action-replay-"));
  try {
    const manifestPath = await writeSyntheticReplayBundle(tempRoot, "actions.test", "baseline_pre_consent", {
      frames: [{
        frameIndex: 0,
        frameKind: "main_frame",
        frameUrl: "https://actions.test/",
        htmlExcerpt: [
          "<button>Reject All</button>",
          "<button>Cookie Settings</button>",
          "<button>Save Choices</button>",
          "<a href=\"/privacy\">Privacy Policy</a>",
          "<a>Your Privacy Choices</a>",
        ].join(""),
        textExcerpt: "We use cookies. Reject All Cookie Settings Save Choices Privacy Policy Your Privacy Choices",
      }],
    });
    const report = await replayConsentFlowEvidenceCorpus({ manifestPaths: [manifestPath] });
    const actions = report.sites[0]?.actionCandidates.map((candidate) => candidate.action) ?? [];

    assert.equal(actions.includes("reject"), true);
    assert.equal(actions.includes("settings/manage"), true);
    assert.equal(actions.includes("save/confirm"), true);
    assert.equal(actions.includes("privacy_policy_or_notice_only"), true);
    assert.equal(actions.includes("do_not_sell_share"), true);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("evidence replay recovers captured action candidates from action type and legacy labels", async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), "certscore-captured-action-replay-"));
  try {
    const manifestPath = await writeSyntheticReplayBundle(tempRoot, "captured-actions.test", "reject_all_flow", {
      controls: [
        {
          actionType: "accept_all",
          controlIndex: 0,
          labelText: "Accept",
          normalizedLabel: "accept",
          role: "nano_assisted_ui_classification",
          tagName: "candidate",
        },
        {
          actionType: "reject_all",
          controlIndex: 1,
          labelText: "Decline",
          normalizedLabel: "decline",
          role: "nano_assisted_ui_classification",
          tagName: "candidate",
        },
        {
          controlIndex: 2,
          labelText: "Decline",
          normalizedLabel: "decline",
          role: "nano_assisted_ui_classification",
          tagName: "candidate",
        },
        {
          controlIndex: 3,
          labelText: "Accept",
          normalizedLabel: "accept",
          role: "nano_assisted_ui_classification",
          tagName: "candidate",
        },
      ],
      frames: [{
        frameIndex: 0,
        frameKind: "main_frame",
        frameUrl: "https://captured-actions.test/",
        htmlExcerpt: "<main>Homepage after consent action</main>",
        textExcerpt: "Homepage after consent action",
      }],
      originalEvidence: {
        actionCandidates: [{
          actionType: "reject_all",
          labelText: "Decline",
          confidence: 0.9,
        }],
      },
    });

    const report = await replayConsentFlowEvidenceCorpus({ manifestPaths: [manifestPath] });
    const site = report.sites.find((entry) => entry.siteId === "captured-actions.test");
    const rejectCandidates = site?.actionCandidates.filter((candidate) => candidate.action === "reject") ?? [];
    const acceptCandidates = site?.actionCandidates.filter((candidate) => candidate.action === "accept") ?? [];

    assert.equal(acceptCandidates.length >= 1, true);
    assert.equal(rejectCandidates.length >= 1, true);
    assert.equal(site?.classificationDelta.originalScanDetectedCandidateNowMissing, false);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("evidence replay summarizes privacy opt-out separately from CMP reject", async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), "certscore-privacy-outcome-"));
  try {
    const rejectManifest = await writeSyntheticReplayBundle(tempRoot, "privacy-outcome.test", "privacy_opt_out_flow", {
      frames: [{
        frameIndex: 0,
        frameKind: "main_frame",
        frameUrl: "https://privacy-outcome.test/privacy/your-privacy-choices",
        htmlExcerpt: "<main><h1>Your Privacy Choices</h1><button>Opt out</button></main>",
        textExcerpt: "Your Privacy Choices Opt out",
      }],
      harUrls: ["https://privacy-outcome.test/privacy/your-privacy-choices", "https://privacy-outcome.test/consent-state"],
      originalEvidence: {
        actionAttempts: [{
          actionType: "do_not_sell_share",
          attempted: true,
          succeeded: true,
          actionProof: {
            candidateObserved: true,
            candidateLabelText: "Opt out",
            candidateNormalizedActionType: "do_not_sell_share",
            actionPath: "preference_center_unresolved",
            frameContext: { frameUrl: "https://privacy-outcome.test/privacy/your-privacy-choices" },
          },
        }],
      },
    });
    const acceptManifest = await writeSyntheticReplayBundle(tempRoot, "privacy-outcome.test", "accept_all_flow", {
      frames: [{
        frameIndex: 0,
        frameKind: "main_frame",
        frameUrl: "https://privacy-outcome.test/privacy/your-privacy-choices",
        htmlExcerpt: "<main><h1>Your Privacy Choices</h1><button>Opt out</button></main>",
        textExcerpt: "Your Privacy Choices Opt out",
      }],
      harUrls: ["https://privacy-outcome.test/privacy/your-privacy-choices"],
      originalEvidence: {
        actionAttempts: [{
          actionType: "accept_all",
          attempted: false,
          succeeded: false,
          failureReason: "preference_center_accept_not_observed",
        }],
      },
    });

    const report = await replayConsentFlowEvidenceCorpus({ manifestPaths: [rejectManifest, acceptManifest] });
    const outcome = report.sites.find((site) => site.siteId === "privacy-outcome.test")?.consentBehaviorOutcome;

    assert.equal(outcome?.cmpBanner, "not_observed");
    assert.equal(outcome?.privacyChoicesSurface, "observed");
    assert.equal(outcome?.optOutAction, "observed_and_testable");
    assert.equal(outcome?.acceptAllAction, "not_observed_not_testable");
    assert.equal(outcome?.postRejectCookieBehavior, "not_established");
    assert.equal(outcome?.postOptOutPrivacyBehavior, "testable");
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("evidence replay uses original direct accept reject proof to establish CMP behavior", async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), "certscore-cmp-proof-outcome-"));
  try {
    const rejectManifest = await writeSyntheticReplayBundle(tempRoot, "cmp-proof.test", "reject_all_flow", {
      frames: [{
        frameIndex: 0,
        frameKind: "main_frame",
        frameUrl: "https://cmp-proof.test/",
        htmlExcerpt: "<main>Homepage after consent action</main>",
        textExcerpt: "Homepage after consent action",
      }],
      harUrls: ["https://cmp-proof.test/", "https://www.googletagmanager.com/gtm.js"],
      originalEvidence: {
        actionAttempts: [{
          actionType: "reject_all",
          attempted: true,
          succeeded: true,
          actionProof: {
            candidateObserved: true,
            candidateLabelText: "Decline",
            candidateNormalizedActionType: "reject_all",
            actionPath: "direct_action",
            frameContext: { frameUrl: "https://cmp-proof.test/" },
          },
        }],
      },
    });
    const acceptManifest = await writeSyntheticReplayBundle(tempRoot, "cmp-proof.test", "accept_all_flow", {
      frames: [{
        frameIndex: 0,
        frameKind: "main_frame",
        frameUrl: "https://cmp-proof.test/",
        htmlExcerpt: "<main>Homepage after consent action</main>",
        textExcerpt: "Homepage after consent action",
      }],
      harUrls: ["https://cmp-proof.test/", "https://www.googletagmanager.com/gtm.js"],
      originalEvidence: {
        actionAttempts: [{
          actionType: "accept_all",
          attempted: true,
          succeeded: true,
          actionProof: {
            candidateObserved: true,
            candidateLabelText: "Accept",
            candidateNormalizedActionType: "accept_all",
            actionPath: "direct_action",
            frameContext: { frameUrl: "https://cmp-proof.test/" },
          },
        }],
      },
    });

    const report = await replayConsentFlowEvidenceCorpus({ manifestPaths: [rejectManifest, acceptManifest] });
    const outcome = report.sites.find((site) => site.siteId === "cmp-proof.test")?.consentBehaviorOutcome;

    assert.equal(outcome?.cmpBanner, "observed");
    assert.equal(outcome?.acceptAllAction, "observed_and_testable");
    assert.equal(outcome?.optOutAction, "not_observed");
    assert.equal(outcome?.postRejectCookieBehavior, "established");
    assert.equal(outcome?.postOptOutPrivacyBehavior, "not_testable");
    assert.match(outcome?.notes.join("\n") ?? "", /inferred from original captured accept\/reject action proof/);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("evidence replay includes policy-scan surfaces for local coverage analysis", async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), "certscore-policy-corpus-"));
  try {
    const manifestPath = await writeSyntheticReplayBundle(tempRoot, "policy-corpus.test", "baseline_pre_consent", {
      frames: [{
        frameIndex: 0,
        frameKind: "main_frame",
        frameUrl: "https://policy-corpus.test/",
        htmlExcerpt: "<footer><a href=\"/privacy\">Privacy Policy</a><a href=\"/privacy-choices\">Your Privacy Choices</a></footer>",
        textExcerpt: "Privacy Policy Your Privacy Choices",
      }],
      harUrls: ["https://policy-corpus.test/", "https://www.google-analytics.com/g/collect"],
      originalEvidence: {
        actionCandidates: [{ actionType: "manage_preferences", labelText: "Your Privacy Choices", confidence: 0.8 }],
      },
      policySurfaceObservations: [{
        surfaceType: "privacy_policy",
        normalizedUrl: "https://policy-corpus.test/privacy",
        linkText: "Privacy Policy",
        status: "fetched",
        fetchable: true,
        observedTopics: [
          "cookies",
          "targeted_advertising",
          "sale_or_share",
          "global_privacy_control",
          "california_privacy_rights",
          "notice_at_collection",
          "sensitive_personal_information",
          "third_party_disclosures",
          "vendor_list",
          "consent_withdrawal",
        ],
        mentionedVendors: ["Google Analytics"],
        mentionedPurposes: ["analytics", "advertising"],
        mentionedRights: ["do_not_sell_or_share", "california_privacy_rights"],
        mentionedControls: ["global_privacy_control", "consent_withdrawal"],
        boundedTextExcerptIds: ["policy_excerpt_policy_corpus"],
        confidence: 0.9,
      }, {
        surfaceType: "your_privacy_choices",
        normalizedUrl: "https://policy-corpus.test/privacy-choices",
        linkText: "Your Privacy Choices",
        status: "fetched",
        fetchable: true,
        observedTopics: ["do_not_sell_or_share"],
        mentionedRights: ["do_not_sell_or_share"],
        boundedTextExcerptIds: ["policy_excerpt_choices"],
        confidence: 0.88,
      }],
    });

    const report = await replayConsentFlowEvidenceCorpus({ manifestPaths: [manifestPath] });
    const site = report.sites.find((entry) => entry.siteId === "policy-corpus.test");

    assert.equal(site?.policySurfaces.length, 2);
    assert.equal(site?.policyEvidenceOutcome.policyArtifactStatus, "present");
    assert.equal(site?.policyEvidenceOutcome.privacyNoticeAvailability, "observed");
    assert.equal(site?.policyEvidenceOutcome.noticeAtCollectionAvailability, "observed");
    assert.equal(site?.policyEvidenceOutcome.doNotSellShareAvailability, "observed");
    assert.equal(site?.policyEvidenceOutcome.privacyChoicesAvailability, "observed");
    assert.equal(site?.policyEvidenceOutcome.saleShareDisclosureSignals, "observed");
    assert.equal(site?.policyEvidenceOutcome.targetedAdvertisingDisclosureSignals, "observed");
    assert.equal(site?.policyEvidenceOutcome.gpcDisclosureSignals, "observed");
    assert.equal(site?.policyEvidenceOutcome.sensitivePersonalInformationDisclosureSignals, "observed");
    assert.equal(site?.policyEvidenceOutcome.consumerRightsSignals, "observed");
    assert.equal(site?.policyEvidenceOutcome.vendorDisclosureSignals, "observed");
    assert.equal(site?.policyEvidenceOutcome.consentWithdrawalSignals, "observed");
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("evidence replay uses retained target URL hints for privacy choice availability", async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), "certscore-policy-url-hints-"));
  try {
    const manifestPath = await writeSyntheticReplayBundle(tempRoot, "privacy-hints.test", "privacy_opt_out_flow", {
      urlPath: "/privacy/your-privacy-choices",
      frames: [{
        frameIndex: 0,
        frameKind: "main_frame",
        frameUrl: "https://privacy-hints.test/privacy/your-privacy-choices",
        htmlExcerpt: "<main>Your Privacy Choices</main>",
        textExcerpt: "Your Privacy Choices",
      }],
      originalEvidence: {
        actionAttempts: [{
          actionType: "do_not_sell_share",
          attempted: true,
          succeeded: false,
          actionProof: {
            candidateObserved: true,
            candidateLabelText: "Your Privacy Choices",
            candidateNormalizedActionType: "do_not_sell_share",
            frameContext: { frameUrl: "https://privacy-hints.test/privacy/your-privacy-choices" },
          },
        }],
      },
    });

    const report = await replayConsentFlowEvidenceCorpus({ manifestPaths: [manifestPath] });
    const site = report.sites.find((entry) => entry.siteId === "privacy-hints.test");

    assert.equal(site?.policyEvidenceOutcome.policyArtifactStatus, "present");
    assert.equal(site?.policyEvidenceOutcome.privacyNoticeAvailability, "observed");
    assert.equal(site?.policyEvidenceOutcome.doNotSellShareAvailability, "observed");
    assert.equal(site?.policyEvidenceOutcome.privacyChoicesAvailability, "observed");
    assert.equal(site?.coverageAssessment.ccpaCpra.privacyOptOutBehavior, "not_testable");
    assert.match(site?.policyEvidenceOutcome.notes.join("\n") ?? "", /target URL hints/);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("evidence replay treats missing notice at collection as bounded absence after policy and form coverage", async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), "certscore-notice-bounded-"));
  try {
    const baselineManifest = await writeSyntheticReplayBundle(tempRoot, "notice-bounded.test", "baseline_pre_consent", {
      frames: [{
        frameIndex: 0,
        frameKind: "main_frame",
        frameUrl: "https://notice-bounded.test/",
        htmlExcerpt: "<footer><a href=\"/privacy\">Privacy Policy</a></footer>",
        textExcerpt: "Privacy Policy",
      }],
      policySurfaceObservations: [{
        surfaceType: "privacy_policy",
        normalizedUrl: "https://notice-bounded.test/privacy",
        linkText: "Privacy Policy",
        status: "fetched",
        fetchable: true,
        observedTopics: ["cookies"],
        mentionedVendors: [],
        mentionedPurposes: [],
        mentionedRights: [],
        mentionedControls: [],
        boundedTextExcerptIds: ["policy_excerpt_notice_bounded"],
        confidence: 0.9,
      }],
    });
    const formManifest = await writeSyntheticReplayBundle(tempRoot, "notice-bounded.test", "form_collection_probe", {
      frames: [{
        frameIndex: 0,
        frameKind: "main_frame",
        frameUrl: "https://notice-bounded.test/contact",
        htmlExcerpt: "<form><input type=\"email\" /></form>",
        textExcerpt: "Contact us",
      }],
    });

    const report = await replayConsentFlowEvidenceCorpus({ manifestPaths: [baselineManifest, formManifest] });
    const site = report.sites.find((entry) => entry.siteId === "notice-bounded.test");

    assert.equal(site?.policyEvidenceOutcome.noticeAtCollectionAvailability, "not_observed");
    assert.equal(site?.coverageAssessment.corpusScenarios.formCollectionProbe, true);
    assert.equal(site?.coverageAssessment.ccpaCpra.noticeAtCollection, "not_observed");
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("evidence replay recognizes notice-at-collection URL and link hints", async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), "certscore-notice-hints-"));
  try {
    const manifestPath = await writeSyntheticReplayBundle(tempRoot, "notice-hints.test", "baseline_pre_consent", {
      frames: [{
        frameIndex: 0,
        frameKind: "main_frame",
        frameUrl: "https://notice-hints.test/",
        htmlExcerpt: "<footer><a href=\"/privacy/california-notice\">California Notice</a></footer>",
        textExcerpt: "California Notice",
      }],
      policySurfaceObservations: [{
        surfaceType: "privacy_policy",
        normalizedUrl: "https://notice-hints.test/privacy/california-notice-at-collection",
        linkText: "California Notice at Collection",
        status: "fetched",
        fetchable: true,
        observedTopics: ["cookies"],
        mentionedVendors: [],
        mentionedPurposes: [],
        mentionedRights: [],
        mentionedControls: [],
        boundedTextExcerptIds: [],
        confidence: 0.9,
      }],
    });

    const report = await replayConsentFlowEvidenceCorpus({ manifestPaths: [manifestPath] });
    const site = report.sites.find((entry) => entry.siteId === "notice-hints.test");

    assert.equal(site?.policyEvidenceOutcome.noticeAtCollectionAvailability, "observed");
    assert.equal(site?.coverageAssessment.ccpaCpra.noticeAtCollection, "observed");
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("evidence replay treats retained policy plus third-party runtime vendors as vendor-disclosure testable", async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), "certscore-runtime-vendor-context-"));
  try {
    const manifestPath = await writeSyntheticReplayBundle(tempRoot, "runtime-vendor.test", "baseline_pre_consent", {
      frames: [{
        frameIndex: 0,
        frameKind: "main_frame",
        frameUrl: "https://runtime-vendor.test/",
        htmlExcerpt: "<footer><a href=\"/privacy\">Privacy Policy</a></footer>",
        textExcerpt: "Privacy Policy",
      }],
      harUrls: ["https://www.google-analytics.com/g/collect"],
      policySurfaceObservations: [{
        surfaceType: "privacy_policy",
        normalizedUrl: "https://runtime-vendor.test/privacy",
        linkText: "Privacy Policy",
        status: "fetched",
        fetchable: true,
        observedTopics: ["cookies"],
        mentionedVendors: [],
        mentionedPurposes: [],
        mentionedRights: [],
        mentionedControls: [],
        boundedTextExcerptIds: ["policy_excerpt_runtime_vendor_context"],
        confidence: 0.9,
      }],
    });

    const report = await replayConsentFlowEvidenceCorpus({ manifestPaths: [manifestPath] });
    const site = report.sites.find((entry) => entry.siteId === "runtime-vendor.test");

    assert.equal(site?.policyEvidenceOutcome.vendorDisclosureSignals, "not_observed");
    assert.equal(site?.coverageAssessment.gdprEprivacy.runtimeVendorDisclosureContext, "testable");
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("evidence replay emits classification deltas and tolerates missing optional artifacts", async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), "certscore-delta-replay-"));
  try {
    const deltaManifest = await writeSyntheticReplayBundle(tempRoot, "delta.test", "baseline_pre_consent", {
      frames: [{
        frameIndex: 0,
        frameKind: "main_frame",
        frameUrl: "https://delta.test/",
        htmlExcerpt: "<button>Reject All</button>",
        textExcerpt: "We use cookies. Reject All.",
      }],
      originalEvidence: {
        actionCandidates: [{ actionType: "manage_preferences", labelText: "Cookie Settings", confidence: 0.8 }],
      },
    });
    const missingManifestPath = path.join(tempRoot, "missing", "replay_baseline_pre_consent.manifest.json");
    await mkdir(path.dirname(missingManifestPath), { recursive: true });
    await writeFile(missingManifestPath, JSON.stringify({
      replayArtifactVersion: "consent_flow_replay_manifest.v1",
      scenario: "baseline_pre_consent",
      url: "https://missing.test/",
      artifactPaths: {},
    }, null, 2));

    const report = await replayConsentFlowEvidenceCorpus({ manifestPaths: [deltaManifest, missingManifestPath] });
    const deltaSite = report.sites.find((site) => site.siteId === "delta.test");
    const missingSite = report.sites.find((site) => site.siteId === "missing.test");

    assert.equal(deltaSite?.classificationDelta.originalScanMissingCandidateNowDetected, true);
    assert.equal(deltaSite?.failureReasons.includes("original_scan_missing_candidate_now_detected"), true);
    assert.equal(missingSite?.failureReasons.includes("insufficient_artifacts"), true);
    assert.equal(missingSite?.failureReasons.includes("frame_dom_unavailable"), true);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("health report counts missing optional artifacts without crashing", async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), "certscore-health-missing-"));
  try {
    const manifestPath = path.join(tempRoot, "old.test", "replay_baseline_pre_consent.manifest.json");
    await mkdir(path.dirname(manifestPath), { recursive: true });
    await writeFile(path.join(tempRoot, "V2ScanCorePhases.json"), JSON.stringify({ checkpoints: [] }, null, 2));
    await writeFile(path.join(tempRoot, "V2ScanLabStepDiagnostics.json"), JSON.stringify({ status: "timed_out" }, null, 2));
    await writeFile(manifestPath, JSON.stringify({
      replayArtifactVersion: "consent_flow_replay_manifest.v1",
      scenario: "baseline_pre_consent",
      url: "https://old.test/",
      artifactPaths: {
        frameSnapshots: path.join(path.dirname(manifestPath), "missing.frames.json"),
        har: path.join(path.dirname(manifestPath), "missing.har"),
      },
    }, null, 2));

    const report = await writeReplayCaptureHealthReport({ outDir: tempRoot });

    assert.equal(report.totals.replayManifests, 1);
    assert.equal(report.totals.scanCorePhaseFiles, 1);
    assert.equal(report.totals.scanLabStepDiagnosticsFiles, 1);
    assert.equal(report.artifactStatusByType.har, "missing");
    assert.equal(report.artifactStatusByType.frameSnapshots, "missing");
    assert.equal(report.artifactStatusByType.originalConsentEvidence, "unavailable");
    assert.equal(report.missingArtifactCountsByType["har:missing"], 1);
    assert.equal(report.missingArtifactCountsByType["frameSnapshots:missing"], 1);
    assert.equal(report.missingArtifactCountsByType["originalConsentEvidence:unavailable"], 1);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("readiness summary returns NOT_READY when old captures lack original consent evidence", async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), "certscore-readiness-old-"));
  try {
    const manifestPath = await writeSyntheticReplayBundle(tempRoot, "old-capture.test", "baseline_pre_consent", {
      frames: [{
        frameIndex: 0,
        frameKind: "main_frame",
        frameUrl: "https://old-capture.test/",
        htmlExcerpt: "<button>Reject All</button>",
        textExcerpt: "Cookie banner Reject All",
      }],
      harUrls: ["https://old-capture.test/cmp.js"],
      omitOriginalEvidence: true,
    });

    const report = await replayConsentFlowEvidenceCorpus({ manifestPaths: [manifestPath] });

    assert.equal(report.readiness.recommendation, "NOT_READY_FOR_100_SITE_CAPTURE");
    assert.equal(report.readiness.manifestsWithOriginalConsentEvidence, 0);
    assert.match(report.readiness.reasons.join("\n"), /Original consent evidence coverage is below 90%/);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("readiness summary can return READY on a complete synthetic replay fixture", async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), "certscore-readiness-ready-"));
  try {
    const manifestPath = await writeSyntheticReplayBundle(tempRoot, "ready.test", "baseline_pre_consent", {
      frames: [{
        frameIndex: 0,
        frameKind: "main_frame",
        frameUrl: "https://ready.test/",
        htmlExcerpt: "<div class=\"ot-sdk\"><button>Reject All</button><button>Accept All</button></div>",
        textExcerpt: "OneTrust Cookie banner Reject All Accept All",
      }],
      harUrls: ["https://cdn.cookielaw.org/scripttemplates/otSDKStub.js"],
      originalEvidence: {
        actionCandidates: [{ actionType: "reject_all", labelText: "Reject All", confidence: 0.9 }],
        actionAttempts: [{ actionType: "reject_all", actionProof: { candidateObserved: true, candidateNormalizedActionType: "reject_all" } }],
      },
      storage: { origins: [{ localStorage: [{ name: "OptanonConsentState", value: "visible" }] }] },
    });

    const outDir = path.join(tempRoot, "out");
    const report = await replayConsentFlowEvidenceCorpus({ manifestPaths: [manifestPath], outDir });
    const readinessMarkdown = await readFile(path.join(outDir, "ReplayReadinessReport.md"), "utf8");

    assert.equal(report.readiness.recommendation, "READY_FOR_100_SITE_CAPTURE");
    assert.equal(report.readiness.manifestsWithOriginalConsentEvidence, 1);
    assert.equal(report.readiness.manifestsWithHarMetadata, 1);
    assert.equal(report.readiness.manifestsWithFrameSnapshots, 1);
    assert.equal(report.readiness.manifestsWithStorageMetadata, 1);
    assert.match(readinessMarkdown, /READY_FOR_100_SITE_CAPTURE/);
    assert.match(readinessMarkdown, /Provider Detection Counts/);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

async function writeSyntheticReplayBundle(
  root: string,
  host: string,
  scenario: string,
  input: {
    controls?: Array<{
      actionType?: string;
      controlIndex: number;
      labelText?: string;
      normalizedLabel?: string;
      role?: string;
      tagName?: string;
    }>;
    frames?: Array<{
      frameIndex: number;
      frameKind: "main_frame" | "sub_frame";
      frameName?: string;
      frameUrl?: string;
      htmlExcerpt?: string;
      textExcerpt?: string;
      title?: string;
    }>;
    harUrls?: string[];
    originalEvidence?: unknown;
    omitOriginalEvidence?: boolean;
    policySurfaceObservations?: unknown[];
    storage?: unknown;
    urlPath?: string;
  },
): Promise<string> {
  const dir = path.join(root, host);
  await mkdir(dir, { recursive: true });
  const framesPath = path.join(dir, `replay_${scenario}.frames.json`);
  const controlsPath = path.join(dir, `replay_${scenario}.controls.json`);
  const harPath = path.join(dir, `replay_${scenario}.har`);
  const storagePath = path.join(dir, `replay_${scenario}.storage-state.json`);
  const originalEvidencePath = path.join(dir, `replay_${scenario}.original-consent-evidence.json`);
  const manifestPath = path.join(dir, `replay_${scenario}.manifest.json`);
  await writeFile(framesPath, JSON.stringify({
    replayArtifactVersion: "consent_flow_replay_frames.v1",
    scenario,
    frameSnapshots: input.frames ?? [],
  }, null, 2));
  if (input.controls) {
    await writeFile(controlsPath, JSON.stringify({
      replayArtifactVersion: "consent_flow_replay_controls.v1",
      scenario,
      controls: input.controls,
    }, null, 2));
  }
  await writeFile(harPath, JSON.stringify({
    log: {
      entries: (input.harUrls ?? []).map((url) => ({ request: { url }, response: { status: 200, headers: [] } })),
    },
  }, null, 2));
  await writeFile(storagePath, JSON.stringify(input.storage ?? {}, null, 2));
  if (!input.omitOriginalEvidence) {
    await writeFile(originalEvidencePath, JSON.stringify(input.originalEvidence ?? {}, null, 2));
  }
  if (input.policySurfaceObservations) {
    await writeFile(path.join(dir, "CanonicalEvidenceBundle.json"), JSON.stringify({
      policySurfaceObservations: input.policySurfaceObservations,
    }, null, 2));
  }
  await writeFile(manifestPath, JSON.stringify({
    replayArtifactVersion: "consent_flow_replay_manifest.v1",
    scenario,
    url: `https://${host}${input.urlPath ?? "/"}`,
    normalizedUrl: `https://${host}${input.urlPath ?? "/"}`,
    artifactPaths: {
      ...(input.controls ? { controls: controlsPath } : {}),
      frameSnapshots: framesPath,
      har: harPath,
      ...(input.omitOriginalEvidence ? {} : { originalConsentEvidence: originalEvidencePath }),
      storageState: storagePath,
      trace: path.join(dir, `replay_${scenario}.trace.zip`),
    },
  }, null, 2));
  return manifestPath;
}
