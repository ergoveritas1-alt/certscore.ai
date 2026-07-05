import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import { deriveGdprEprivacyCoverageChecklist } from "../../lib/scans/gdpr-eprivacy-coverage-checklist";
import { deriveGdprEprivacyCoveragePolicyOutcomes } from "../../lib/scans/gdpr-eprivacy-coverage-policy";
import { buildScanReportUnifiedFindingsForScan } from "../../lib/scans/scan-report-unified-findings";
import { LOCAL_V2_DAG_SCAN_PROCESSOR } from "./local-v2-dag-scan-config";
import type { ScanDetailResponse } from "./get-scan-by-id";

const require = createRequire(import.meta.url);
const serverOnlyPath = require.resolve("server-only");
(require.cache as Record<string, unknown>)[serverOnlyPath] = {
  exports: {},
  filename: serverOnlyPath,
  id: serverOnlyPath,
  isPreloading: false,
  loaded: true,
  path: serverOnlyPath,
  paths: []
};

async function loadLocalV2DagReport() {
  return import("./local-v2-dag-report");
}

function syntheticPngHeader(width: number, height: number, byteSize = 1024) {
  const buffer = Buffer.alloc(byteSize);
  Buffer.from("89504e470d0a1a0a", "hex").copy(buffer, 0);
  buffer.writeUInt32BE(13, 8);
  buffer.write("IHDR", 12, "ascii");
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  return buffer;
}

function makeScanRecord(overrides: Partial<ScanDetailResponse> = {}): ScanDetailResponse {
  return {
    events: [],
    pageEvidence: [],
    policyEnrichment: [],
    policyReviewQueue: [],
    preconsentViolations: [],
    primaryPolicyEnrichment: null,
    runtimeArtifacts: {},
    scan: {
      completedAt: "2026-06-17T13:14:02.000Z",
      createdAt: "2026-06-17T13:13:50.000Z",
      displayCreatedAt: "2026-06-17T13:13:50.000Z",
      displayStatus: "completed",
      domainHostname: "caltech.edu",
      domainId: null,
      errorMessage: null,
      executionSummary: null,
      id: "94d8855d-0347-4d5d-9bb1-b60f1cccc8fd",
      pagesRequested: 1,
      pagesScanned: 0,
      scanConfigJson: {
        hostname: "caltech.edu",
        normalizedUrl: "https://caltech.edu/",
        processor: LOCAL_V2_DAG_SCAN_PROCESSOR,
        execution: {
          v2DagParallel: {
            artifactOnly: true,
            localOnly: true,
            profile: "standard",
            productionFindingIntegration: false
          }
        }
      },
      scanFromLabel: "Cloud",
      scanFromValue: "cloud",
      scanType: "full",
      startedAt: "2026-06-17T13:13:50.000Z",
      status: "completed"
    },
    signals: [],
    snapshot: {},
    trackerVendors: [],
    validationFindings: [],
    ...overrides
  } as ScanDetailResponse;
}

test("getLocalV2DagReportInput reads Lambda scan artifact URI from retained result event", async () => {
  const { getLocalV2DagReportInput } = await loadLocalV2DagReport();
  const input = getLocalV2DagReportInput(makeScanRecord({
    events: [
      {
        createdAt: "2026-06-17T13:14:02.000Z",
        eventType: "v2_lambda_result.received",
        id: "event-1",
        message: "Local v2 DAG Lambda returned a completed artifact-only result.",
        metadataJson: {
          artifactOnly: true,
          artifactPointers: {
            scanArtifactUri: "s3://certscore-v2-dag-local-artifacts-199536052647-eu-central-1/v2-dag-lambda/local/scan.json"
          },
          processor: LOCAL_V2_DAG_SCAN_PROCESSOR,
          productionFindingIntegration: false
        }
      }
    ],
    scan: {
      ...makeScanRecord().scan,
      scanConfigJson: {
        hostname: "caltech.edu",
        normalizedUrl: "https://caltech.edu/",
        processor: LOCAL_V2_DAG_SCAN_PROCESSOR,
        execution: {
          v2DagLambda: {
            resultQueueUrl: "https://sqs.eu-west-1.amazonaws.com/123/ie-results"
          },
          v2DagParallel: {
            artifactOnly: true,
            localOnly: true,
            profile: "standard",
            productionFindingIntegration: false
          }
        }
      }
    }
  }));

  assert.equal(
    input?.scanArtifactUri,
    "s3://certscore-v2-dag-local-artifacts-199536052647-eu-central-1/v2-dag-lambda/local/scan.json"
  );
  assert.equal(input?.outDir, null);
  assert.equal(input?.profile, "standard");
  assert.equal(input?.lambdaResultQueueUrl, "https://sqs.eu-west-1.amazonaws.com/123/ie-results");
});

test("getLocalV2DagReportInput ignores Lambda events that would enable production finding integration", async () => {
  const { getLocalV2DagReportInput } = await loadLocalV2DagReport();
  const input = getLocalV2DagReportInput(makeScanRecord({
    events: [
      {
        createdAt: "2026-06-17T13:14:02.000Z",
        eventType: "v2_lambda_result.received",
        id: "event-1",
        message: "Unexpected result.",
        metadataJson: {
          artifactOnly: true,
          artifactPointers: {
            scanArtifactUri: "s3://bucket/key.json"
          },
          processor: LOCAL_V2_DAG_SCAN_PROCESSOR,
          productionFindingIntegration: true
        }
      }
    ]
  }));

  assert.equal(input?.scanArtifactUri, null);
});

test("inferS3ArtifactRegion follows the regional Lambda artifact bucket", async () => {
  const { inferS3ArtifactRegion } = await loadLocalV2DagReport();

  assert.equal(
    inferS3ArtifactRegion("certscore-v2-dag-local-artifacts-eu-central-1-199536052647"),
    "eu-central-1"
  );
  assert.equal(
    inferS3ArtifactRegion("certscore-v2-dag-local-artifacts-eu-west-1-199536052647"),
    "eu-west-1"
  );
  assert.equal(
    inferS3ArtifactRegion("certscore-v2-dag-local-artifacts-us-west-2-199536052647"),
    "us-west-2"
  );
  assert.equal(inferS3ArtifactRegion("certscore-v2-dag-local-artifacts"), "eu-central-1");
});

test("shouldAttemptLocalV2DagLambdaResultRefresh keeps web pages out of SQS result ingestion", async () => {
  const { shouldAttemptLocalV2DagLambdaResultRefresh } = await loadLocalV2DagReport();
  const nowMs = Date.parse("2026-06-17T13:14:20.000Z");
  const baseScan = makeScanRecord().scan;

  assert.equal(
    shouldAttemptLocalV2DagLambdaResultRefresh(makeScanRecord({
      scan: {
        ...baseScan,
        completedAt: null,
        startedAt: "2026-06-17T13:13:50.000Z",
        status: "running"
      }
    }), nowMs),
    false
  );

  assert.equal(
    shouldAttemptLocalV2DagLambdaResultRefresh(makeScanRecord({
	    scan: {
	      ...baseScan,
	      completedAt: null,
	      startedAt: "2026-06-17T13:14:16.000Z",
	      status: "running"
	    }
	  }), nowMs),
    false
  );

  assert.equal(shouldAttemptLocalV2DagLambdaResultRefresh(makeScanRecord(), nowMs), false);
  assert.equal(
    shouldAttemptLocalV2DagLambdaResultRefresh(makeScanRecord({
      events: [
        {
          createdAt: "2026-06-17T13:14:02.000Z",
          eventType: "v2_lambda_result.received",
          id: "event-1",
          message: "Local v2 DAG Lambda returned a completed artifact-only result.",
          metadataJson: {
            artifactOnly: true,
            artifactPointers: {
              scanArtifactUri: "s3://bucket/key.json"
            },
            processor: LOCAL_V2_DAG_SCAN_PROCESSOR,
            productionFindingIntegration: false
          }
        }
      ],
      scan: {
        ...baseScan,
        completedAt: null,
        status: "running"
      }
    }), nowMs),
    false
  );
});

test("tryRefreshLocalV2DagLambdaResult does not poll SQS from report pages", async () => {
  const {
    resetLocalV2DagLambdaResultRefreshStateForTest,
    tryRefreshLocalV2DagLambdaResult
  } = await loadLocalV2DagReport();
  resetLocalV2DagLambdaResultRefreshStateForTest();

  const nowMs = Date.parse("2026-06-17T13:14:20.000Z");
  const baseScan = makeScanRecord().scan;
  const scanRecord = makeScanRecord({
    scan: {
      ...baseScan,
      completedAt: null,
      startedAt: "2026-06-17T13:13:50.000Z",
      status: "running"
    }
  });
  let pollCount = 0;
  const pollResultQueue = async () => {
    pollCount += 1;
    return { handled: 0 };
  };

  assert.equal(await tryRefreshLocalV2DagLambdaResult(scanRecord, { nowMs, pollResultQueue }), false);
  assert.equal(await tryRefreshLocalV2DagLambdaResult(scanRecord, { nowMs: nowMs + 4_000, pollResultQueue }), false);
  assert.equal(await tryRefreshLocalV2DagLambdaResult(scanRecord, { nowMs: nowMs + 6_000, pollResultQueue }), false);
  assert.equal(pollCount, 0);

  resetLocalV2DagLambdaResultRefreshStateForTest();
});

test("dedupePolicySurfaces collapses equivalent privacy URLs before report projection", async () => {
  const { dedupePolicySurfaces } = await loadLocalV2DagReport();
  const surfaces = dedupePolicySurfaces([
    {
      observationId: "privacy-relative",
      surfaceType: "privacy_policy",
      url: "/privacy",
      title: "Privacy center",
      confidence: 0.76,
      textExcerpt: "Privacy policy text"
    },
    {
      observationId: "privacy-www",
      surfaceType: "privacy_policy",
      url: "https://www.cnn.com/privacy",
      title: "Privacy center",
      confidence: 0.76,
      textExcerpt: "Privacy policy text"
    },
    {
      observationId: "terms",
      surfaceType: "terms",
      url: "/terms",
      confidence: 0.45,
      status: "fetched",
      textExcerpt: "Terms of service text"
    }
  ] as never, "https://cnn.com/");

  assert.deepEqual(
    surfaces.map((row) => ({ pageUrl: row.pageUrl, type: row.surface.surfaceType })),
    [
      { pageUrl: "https://cnn.com/privacy", type: "privacy_policy" },
      { pageUrl: "https://cnn.com/terms", type: "terms" }
    ]
  );
});

test("dedupePolicySurfaces suppresses failed common-path privacy guesses", async () => {
  const { dedupePolicySurfaces, summarizePolicySurfaces } = await loadLocalV2DagReport();
  const surfaces = dedupePolicySurfaces([
    {
      observationId: "caltech-privacy",
      surfaceType: "privacy_policy",
      url: "/privacy",
      normalizedUrl: "https://caltech.edu/privacy",
      discoveryMethod: "guessed_common_path",
      status: "failed",
      fetchable: true,
      confidence: 0.58
    },
    {
      observationId: "caltech-privacy-policy",
      surfaceType: "privacy_policy",
      url: "/privacy-policy",
      normalizedUrl: "https://caltech.edu/privacy-policy",
      discoveryMethod: "guessed_common_path",
      status: "failed",
      fetchable: true,
      confidence: 0.58
    },
    {
      observationId: "caltech-privacy-notice",
      surfaceType: "privacy_policy",
      url: "/privacy-notice",
      normalizedUrl: "https://caltech.edu/privacy-notice",
      discoveryMethod: "guessed_common_path",
      status: "failed",
      fetchable: true,
      confidence: 0.58
    }
  ] as never, "https://caltech.edu/");

  assert.deepEqual(surfaces, []);
  const summary = summarizePolicySurfaces(surfaces, "caltech.edu");
  assert.equal(summary.policySurfaceCount, 0);
  assert.equal(summary.privacyPolicyPresent, false);
  assert.deepEqual(summary.privacyPolicyUrls, []);
});

test("dedupePolicySurfaces keeps the strongest fetched privacy document over weaker candidates", async () => {
  const { dedupePolicySurfaces, summarizePolicySurfaces } = await loadLocalV2DagReport();
  const surfaces = dedupePolicySurfaces([
    {
      observationId: "weak-candidate",
      surfaceType: "privacy_policy",
      url: "/privacy",
      normalizedUrl: "https://example.edu/privacy",
      discoveryMethod: "guessed_common_path",
      status: "candidate",
      fetchable: true,
      confidence: 0.9
    },
    {
      observationId: "fetched-notice",
      surfaceType: "privacy_policy",
      url: "https://www.example.edu/privacy-notice",
      normalizedUrl: "https://www.example.edu/privacy-notice",
      discoveryMethod: "footer_link",
      status: "fetched",
      fetchable: true,
      confidence: 0.7,
      textExcerpt: "Privacy Notice. We explain controller contact, processing purposes, legal basis, retention, rights, and international transfers.",
      observedTopics: ["controller_contact", "processing_purposes", "legal_basis", "data_retention", "data_subject_rights", "international_transfers"]
    }
  ] as never, "https://example.edu/");

  assert.deepEqual(
    surfaces.map((row) => ({ pageUrl: row.pageUrl, status: row.surface.status, type: row.surface.surfaceType })),
    [{ pageUrl: "https://example.edu/privacy-notice", status: "fetched", type: "privacy_policy" }]
  );
  const summary = summarizePolicySurfaces(surfaces, "example.edu");
  assert.equal(summary.policySurfaceCount, 1);
  assert.equal(summary.privacyPolicyPresent, true);
  assert.deepEqual(summary.privacyPolicyUrls, ["https://example.edu/privacy-notice"]);
});

test("summarizePolicySurfaces limits Article 13 aggregation to target-relevant privacy notices", async () => {
  const { dedupePolicySurfaces, summarizePolicySurfaces } = await loadLocalV2DagReport();
  const surfaces = dedupePolicySurfaces([
    {
      observationId: "google-policy",
      surfaceType: "privacy_policy",
      url: "https://policies.google.com/privacy",
      confidence: 0.95,
      textExcerpt: "Google Privacy Policy. We retain data and explain legal basis.",
      observedTopics: ["legal_basis", "data_retention"],
      article13DisclosureSignals: [
        {
          disclosureType: "legal_basis",
          status: "observed",
          evidenceText: "Google legal basis",
          confidence: 0.9,
          source: "deterministic"
        }
      ]
    },
    {
      observationId: "trustarc-seal",
      surfaceType: "privacy_policy",
      url: "https://privacy.truste.com/privacy-seal/example",
      confidence: 0.8,
      textExcerpt: "TrustArc certification program.",
      observedTopics: ["controller_contact"]
    },
    {
      observationId: "target-privacy",
      surfaceType: "privacy_policy",
      url: "https://www.webmd.com/about-webmd-policies/about-privacy-policy",
      confidence: 0.9,
      textExcerpt: "WebMD Privacy Policy. You may exercise your rights to access and erasure.",
      observedTopics: ["data_subject_rights"],
      article13DisclosureSignals: [
        {
          disclosureType: "data_subject_rights",
          status: "observed",
          evidenceText: "You may exercise your rights to access and erasure.",
          confidence: 0.88,
          source: "deterministic"
        }
      ]
    },
    {
      observationId: "target-cookie",
      surfaceType: "cookie_policy",
      url: "https://www.webmd.com/cookie-policy",
      confidence: 0.9,
      textExcerpt: "Cookie Policy. Analytics partners.",
      observedTopics: ["analytics", "recipients_or_vendor_categories"],
      article13DisclosureSignals: [
        {
          disclosureType: "recipients_or_vendor_categories",
          status: "observed",
          evidenceText: "Analytics partners.",
          confidence: 0.8,
          source: "deterministic"
        }
      ]
    }
  ] as never, "https://www.webmd.com/");

  const summary = summarizePolicySurfaces(surfaces, "webmd.com");

  assert.deepEqual(summary.privacyPolicyUrls, ["https://webmd.com/about-webmd-policies/about-privacy-policy"]);
  assert.deepEqual(summary.observedTopics, ["data_subject_rights"]);
  assert.deepEqual(summary.article13DisclosureTypesObserved, ["data_subject_rights"]);
  assert.equal(summary.privacyPolicyPresent, true);
  assert.equal(summary.policyTextExtractionHealth.policyTextExtractionStatus, "thin");
  assert.equal(summary.policyTextExtractionHealth.minimumTextLengthRequired, 2500);
  assert.equal(summary.policyTextExtractionHealth.policySurfaceObserved, true);
  assert.equal(summary.policyTextExtractionHealth.policyUrlRetained, true);
  assert.equal(summary.policy_text_extraction_health.policyTextExtractionStatus, "thin");
  assert.doesNotMatch(summary.retainedPrivacyPolicyTextExcerpt, /Google Privacy Policy|Cookie Policy|TrustArc/i);
});

test("summarizePolicySurfaces retains substantive policy text beyond navigation chrome", async () => {
  const { dedupePolicySurfaces, summarizePolicySurfaces } = await loadLocalV2DagReport();
  const navigationChrome = "Privacy Policy Privacy & Terms Overview Technologies FAQ Terms of Service Introduction ".repeat(18);
  const substantivePolicyText = [
    "Information we collect. We collect information you provide and information created when you use our services.",
    "Why we use information. We use personal information to provide services, maintain and improve them, personalize content, measure performance, and prevent abuse.",
    "Legal basis. We process information with consent, when needed to perform a contract, for legitimate interests, and when required by law.",
    "Retaining your information. We retain the data we collect for different periods depending on what it is, how we use it, and your settings.",
    "Data transfers. We maintain servers around the world and information may be processed outside the country where you live."
  ].join(" ");
  const surfaces = dedupePolicySurfaces([
    {
      observationId: "target-privacy",
      surfaceType: "privacy_policy",
      url: "https://example.test/privacy",
      confidence: 0.95,
      status: "fetched",
      textExcerpt: `${navigationChrome}${substantivePolicyText}`,
      observedTopics: ["processing_purposes", "legal_basis", "data_retention", "international_transfers"]
    }
  ] as never, "https://example.test/");

  const summary = summarizePolicySurfaces(surfaces, "example.test");

  assert.equal(summary.privacyPolicyPresent, true);
  assert.ok(summary.retainedPrivacyPolicyTextExcerpt.length > 1_000);
  assert.match(summary.retainedPrivacyPolicyTextExcerpt, /Retaining your information/i);
  assert.match(summary.retainedPrivacyPolicyTextExcerpt, /Data transfers/i);
});

test("summarizePolicySurfaces surrounds Article 13 snippets with full retained policy artifact context", async () => {
  const { dedupePolicySurfaces, summarizePolicySurfaces } = await loadLocalV2DagReport();
  const artifactRoot = path.join(process.cwd(), "artifacts/local-v2-dag-lambda-simulated");
  await mkdir(artifactRoot, { recursive: true });
  const outDir = await mkdtemp(path.join(artifactRoot, "policy-context-"));
  const artifactPath = path.join(outDir, "policy_surface_text_context.txt");
  const evidenceText = "If you have a complaint, it is best to contact us first so that we can try to make things right. If you are still not happy, you have the right to contact your data protection authority.";
  const supportingContactText = "Further details can be found by contacting us by email at wbdprivacy@wbd.com.";
  const fullPolicyText = [
    "Privacy Policy introduction. We explain how this policy works.",
    "Controller information. We describe the company responsible for processing.",
    "Information we collect. We collect account and usage information.",
    "How we use information. We use information to provide and improve services.",
    "Sharing information. We share information with vendors where needed.",
    "Your choices. You can adjust some preferences in account settings.",
    evidenceText,
    supportingContactText,
    "Retention. We retain information for different periods depending on the context.",
    "Security. We use safeguards designed to protect information.",
    "International transfers. Information may be processed outside your country.",
    "Policy changes. We may update this policy from time to time.",
    "Contact. You can contact us if you have questions."
  ].join(" ");

  try {
    await writeFile(artifactPath, fullPolicyText, "utf8");
    const surfaces = dedupePolicySurfaces([
      {
        observationId: "target-privacy",
        surfaceType: "privacy_policy",
        url: "https://example.test/privacy",
        normalizedUrl: "https://example.test/privacy",
        confidence: 0.95,
        status: "fetched",
        textExcerpt: "Privacy Policy introduction. We explain how this policy works.",
        observedTopics: ["supervisory_authority"],
        artifactRefs: [
          {
            artifactId: "policy_surface_text_context",
            label: "privacy_policy normalized text",
            path: artifactPath
          }
        ],
        article13DisclosureSignals: [
          {
            disclosureType: "supervisory_authority",
            status: "observed",
            evidenceText,
            confidence: 0.9,
            source: "deterministic"
          }
        ]
      }
    ] as never, "https://example.test/");

    const summary = summarizePolicySurfaces(surfaces, "example.test");
    const retainedContext = summary.article13DisclosureSignals[0]?.selectedPolicySectionExcerpt ?? "";

    assert.match(retainedContext, /collect account and usage information/i);
    assert.match(retainedContext, /If you have a complaint/i);
    assert.match(retainedContext, /wbdprivacy@wbd\.com/i);
    assert.match(retainedContext, /International transfers/i);
    assert.match(retainedContext, /Policy changes/i);
    assert.doesNotMatch(retainedContext, /Cookies What are cookies/i);
    assert.ok(retainedContext.length > evidenceText.length);
    assert.equal(summary.article13DisclosureSignals[0]?.selectedPolicySectionHeading, "Policy text context");
    assert.equal(summary.article13DisclosureSignals[0]?.supportingContactContext, "wbdprivacy@wbd.com");
  } finally {
    await rm(outDir, { recursive: true, force: true });
  }
});

test("summarizePolicySurfaces retains outside-region service-provider transfer safeguards signals", async () => {
  const { dedupePolicySurfaces, summarizePolicySurfaces } = await loadLocalV2DagReport();
  const evidenceText = "We share personal information with third parties, service providers, and business partners for the purposes described in this notice. These third parties may be in the Netherlands as well as within other countries in the European Economic Area (EEA). Sometimes they may also be outside the EEA. We have concluded agreements with our service providers and business partners, to ensure that your personal information is protected, both within and outside the EEA.";

  const surfaces = dedupePolicySurfaces([
    {
      observationId: "target-privacy",
      surfaceType: "privacy_policy",
      url: "https://example.test/privacy",
      normalizedUrl: "https://example.test/privacy",
      confidence: 0.95,
      status: "fetched",
      textExcerpt: [
        "Privacy Policy introduction. We explain how this policy works.",
        "Information we collect. We collect account and usage information.",
        evidenceText,
        "Your privacy rights. You can exercise your rights by contacting us."
      ].join(" "),
      observedTopics: ["international_transfers"],
      article13DisclosureSignals: [
        {
          disclosureType: "international_transfers",
          status: "observed",
          evidenceText,
          confidence: 0.9,
          source: "deterministic"
        }
      ]
    }
  ] as never, "https://example.test/");

  const summary = summarizePolicySurfaces(surfaces, "example.test");
  const transferSignal = summary.article13DisclosureSignals.find((signal) =>
    signal.disclosureType === "international_transfers"
  );
  const discardedTransferSignals = summary.discardedArticle13DisclosureSignals.filter((signal) =>
    signal.disclosureType === "international_transfers"
  );

  assert.equal(transferSignal?.status, "observed");
  assert.match(transferSignal?.evidenceText ?? "", /Sometimes they may also be outside the EEA/i);
  assert.match(
    transferSignal?.evidenceText ?? "",
    /personal information is protected, both within and outside the EEA/i
  );
  assert.equal(discardedTransferSignals.length, 0);
});

test("summarizePolicySurfaces dedupes overlapping Article 13 evidence candidates", async () => {
  const { dedupePolicySurfaces, summarizePolicySurfaces } = await loadLocalV2DagReport();
  const shorterRightsText = "You have the right to access and correct your personal data.";
  const mediumRightsText = "You have the right to access, correct, delete, and erase your personal data.";
  const completeRightsText = "You have the right to access, correct, delete, erase, object to, restrict processing of, and port your personal data.";
  const distinctRightsText = "You may download a copy of your data through privacy controls.";
  const surfaces = dedupePolicySurfaces([
    {
      observationId: "target-privacy",
      surfaceType: "privacy_policy",
      url: "https://example.test/privacy",
      normalizedUrl: "https://example.test/privacy",
      confidence: 0.95,
      status: "fetched",
      textExcerpt: [
        "Privacy Policy. We explain how information is handled.",
        "We collect account information, device information, usage information, and contact information to provide services, maintain security, improve product features, personalize experiences, respond to requests, and measure performance. ".repeat(18),
        completeRightsText,
        distinctRightsText,
        "Retention. We retain information for different periods depending on the context and legal requirements. ".repeat(12)
      ].join(" "),
      observedTopics: ["data_subject_rights"],
      article13DisclosureSignals: [
        {
          disclosureType: "data_subject_rights",
          status: "observed",
          evidenceText: shorterRightsText,
          confidence: 0.8,
          source: "deterministic",
          selectedEvidenceStrength: "moderate",
          selectedPolicySectionExcerpt: shorterRightsText
        },
        {
          disclosureType: "data_subject_rights",
          status: "observed",
          evidenceText: completeRightsText,
          confidence: 0.9,
          source: "deterministic",
          selectedEvidenceStrength: "strong",
          selectedPolicySectionExcerpt: completeRightsText
        },
        {
          disclosureType: "data_subject_rights",
          status: "observed",
          evidenceText: mediumRightsText,
          confidence: 0.85,
          source: "deterministic",
          selectedEvidenceStrength: "moderate",
          selectedPolicySectionExcerpt: mediumRightsText
        },
        {
          disclosureType: "data_subject_rights",
          status: "observed",
          evidenceText: distinctRightsText,
          confidence: 0.86,
          source: "deterministic",
          selectedEvidenceStrength: "strong",
          selectedPolicySectionExcerpt: distinctRightsText
        }
      ],
      retainedArticle13SectionEvidence: [
        {
          coverageArea: "data_subject_rights",
          selectedPolicySectionExcerpt: shorterRightsText,
          selectedPolicySectionUrl: "https://example.test/privacy",
          evidenceSource: "deterministic",
          selectedEvidenceStrength: "moderate",
          signalObserved: "observed"
        },
        {
          coverageArea: "data_subject_rights",
          selectedPolicySectionExcerpt: completeRightsText,
          selectedPolicySectionUrl: "https://example.test/privacy",
          evidenceSource: "deterministic",
          selectedEvidenceStrength: "strong",
          signalObserved: "observed"
        },
        {
          coverageArea: "data_subject_rights",
          selectedPolicySectionExcerpt: distinctRightsText,
          selectedPolicySectionUrl: "https://example.test/privacy",
          evidenceSource: "deterministic",
          selectedEvidenceStrength: "strong",
          signalObserved: "observed"
        }
      ]
    }
  ] as never, "https://example.test/");

  const summary = summarizePolicySurfaces(surfaces, "example.test");

  assert.deepEqual(
    summary.article13DisclosureSignals.map((signal) => signal.evidenceText),
    [completeRightsText, distinctRightsText]
  );
  assert.deepEqual(
    summary.retainedArticle13SectionEvidence.map((evidence) => evidence.selectedPolicySectionExcerpt),
    [completeRightsText, distinctRightsText]
  );
});

test("summarizePolicySurfaces carries row-targeted retained policy section evidence", async () => {
  const { dedupePolicySurfaces, summarizePolicySurfaces } = await loadLocalV2DagReport();
  const surfaces = dedupePolicySurfaces([
    {
      observationId: "target-privacy",
      surfaceType: "privacy_policy",
      url: "https://example.test/privacy",
      confidence: 0.95,
      status: "fetched",
      textExcerpt: [
        "Privacy Policy. Overview Privacy Policy Terms of Service Introduction Information Google collects Why Google collects data.",
        "Your privacy controls. You can review and update privacy controls, activity controls, ad settings, and personalization settings.",
        "Exporting and deleting your information. You can export a copy using Google Takeout, delete your information, and request correction.",
        "Retaining your information. Some data is deleted or anonymized automatically and some records are retained as long as necessary for legal purposes.",
        "Data transfers. We process information on servers outside the country where you live using data transfer safeguards.",
        "Compliance and cooperation with regulators. We work with regulatory authorities, including local data protection authorities, to resolve complaints."
      ].join(" "),
      observedTopics: ["data_retention", "data_subject_rights", "international_transfers", "supervisory_authority"],
      retainedPolicySections: [
        {
          sourceUrl: "https://example.test/privacy",
          heading: "Your privacy controls",
          textExcerpt: "Your privacy controls. You can review and update privacy controls, activity controls, ad settings, and personalization settings.",
          charStart: 120,
          charEnd: 255,
          quality: "partial"
        },
        {
          sourceUrl: "https://example.test/privacy",
          heading: "Exporting and deleting your information",
          textExcerpt: "Exporting and deleting your information. You can export a copy using Google Takeout, delete your information, and request correction.",
          charStart: 256,
          charEnd: 410,
          quality: "partial"
        },
        {
          sourceUrl: "https://example.test/privacy",
          heading: "Retaining your information",
          textExcerpt: "Retaining your information. Some data is deleted or anonymized automatically and some records are retained as long as necessary for legal purposes.",
          charStart: 411,
          charEnd: 570,
          quality: "partial"
        },
        {
          sourceUrl: "https://example.test/privacy",
          heading: "Data transfers",
          textExcerpt: "Data transfers. We process information on servers outside the country where you live using data transfer safeguards.",
          charStart: 571,
          charEnd: 690,
          quality: "partial"
        },
        {
          sourceUrl: "https://example.test/privacy",
          heading: "Compliance and cooperation with regulators",
          textExcerpt: "Compliance and cooperation with regulators. We work with regulatory authorities, including local data protection authorities, to resolve complaints.",
          charStart: 691,
          charEnd: 840,
          quality: "partial"
        }
      ],
      retainedArticle13SectionEvidence: [
        {
          coverageArea: "data_retention",
          selectedPolicySectionHeading: "Retaining your information",
          selectedPolicySectionExcerpt: "Retaining your information. Some data is deleted or anonymized automatically and some records are retained as long as necessary for legal purposes.",
          selectedPolicySectionUrl: "https://example.test/privacy",
          evidenceSource: "deterministic",
          selectedEvidenceStrength: "strong",
          signalObserved: "observed"
        },
        {
          coverageArea: "data_subject_rights",
          selectedPolicySectionHeading: "Exporting and deleting your information",
          selectedPolicySectionExcerpt: "Exporting and deleting your information. You can export a copy using Google Takeout, delete your information, and request correction.",
          selectedPolicySectionUrl: "https://example.test/privacy",
          evidenceSource: "deterministic",
          selectedEvidenceStrength: "strong",
          signalObserved: "observed"
        },
        {
          coverageArea: "international_transfers",
          selectedPolicySectionHeading: "Data transfers",
          selectedPolicySectionExcerpt: "Data transfers. We process information on servers outside the country where you live using data transfer safeguards.",
          selectedPolicySectionUrl: "https://example.test/privacy",
          evidenceSource: "deterministic",
          selectedEvidenceStrength: "strong",
          signalObserved: "observed"
        },
        {
          coverageArea: "legal_basis",
          selectedPolicySectionHeading: "Policy body",
          selectedPolicySectionExcerpt: "Privacy Policy. Overview Privacy Policy Terms of Service.",
          selectedPolicySectionUrl: "https://example.test/privacy",
          evidenceSource: "deterministic",
          selectedEvidenceStrength: "limited",
          signalObserved: "not_confirmed",
          extractionLimitation: "section_retained_without_row_specific_disclosure"
        }
      ],
      article13DisclosureSignals: [
        {
          disclosureType: "data_retention",
          status: "observed",
          evidenceText: "Retaining your information. Some data is deleted or anonymized automatically and some records are retained as long as necessary for legal purposes.",
          confidence: 0.82,
          source: "deterministic",
          selectedPolicySectionHeading: "Retaining your information",
          selectedPolicySectionExcerpt: "Retaining your information. Some data is deleted or anonymized automatically and some records are retained as long as necessary for legal purposes.",
          selectedPolicySectionUrl: "https://example.test/privacy",
          evidenceSource: "deterministic",
          selectedEvidenceStrength: "strong"
        }
      ]
    }
  ] as never, "https://example.test/");

  const summary = summarizePolicySurfaces(surfaces, "example.test");

  assert.equal(summary.policyTextCoverageMode, "section_targeted");
  assert.deepEqual(summary.missingExpectedPolicySections, ["European requirements"]);
  assert.equal(summary.policySectionCount, 5);
  assert.equal(summary.retainedPolicySectionHeadings.includes("Retaining your information"), true);
  assert.equal(summary.retainedPolicySectionHeadings.includes("Data transfers"), true);
  assert.equal(summary.retainedArticle13SectionEvidence.some((evidence) =>
    evidence.coverageArea === "legal_basis" &&
    evidence.signalObserved === "not_confirmed" &&
    evidence.extractionLimitation === "section_retained_without_row_specific_disclosure"
  ), true);
  assert.equal(summary.article13DisclosureSignals[0]?.selectedPolicySectionHeading, "Retaining your information");
  assert.match(summary.article13DisclosureSignals[0]?.selectedPolicySectionExcerpt ?? "", /retained as long as necessary/i);
});

test("summarizePolicySurfaces rejects script/config text as Article 13 policy evidence", async () => {
  const { dedupePolicySurfaces, summarizePolicySurfaces } = await loadLocalV2DagReport();
  const codePolicyText = ";this.gbar_={CONFIG:[[[0,\"www.gstatic.com\",null,\"0\"]]]};_.z=function(a,b){Object.defineProperties(a,b)};var rights=function(){return Object.keys({access:1,delete:1})}; Copyright The Closure Library; ".repeat(40);
  const surfaces = dedupePolicySurfaces([
    {
      observationId: "target-privacy",
      surfaceType: "privacy_policy",
      url: "https://example.test/privacy",
      confidence: 0.95,
      status: "fetched",
      textExcerpt: codePolicyText,
      observedTopics: ["data_subject_rights"],
      article13DisclosureSignals: [
        {
          disclosureType: "data_subject_rights",
          status: "observed",
          evidenceText: ":!!b};_.z=function(a,b){Object.defineProperties(a,b)}; rights Object access delete export",
          confidence: 0.9,
          source: "deterministic"
        }
      ]
    }
  ] as never, "https://example.test/");

  const summary = summarizePolicySurfaces(surfaces, "example.test");

  assert.equal(summary.privacyPolicyPresent, true);
  assert.equal(summary.policyTextExtractionHealth.policyTextExtractionStatus, "low_quality_extracted_code_or_config");
  assert.equal(summary.policyTextExtractionHealth.extractionFailureReason, "privacy_policy_text_low_quality_or_non_policy_content");
  assert.deepEqual(summary.article13DisclosureSignals, []);
  assert.deepEqual(summary.article13DisclosureTypesObserved, []);
  assert.equal(summary.discardedArticle13DisclosureSignals.some((signal) =>
    signal.disclosureType === "data_subject_rights" &&
    signal.rejectReason === "code_or_non_policy_excerpt"
  ), true);
});

test("summarizePolicySurfaces treats commerce app-shell captures as low-quality policy text", async () => {
  const { dedupePolicySurfaces, summarizePolicySurfaces } = await loadLocalV2DagReport();
  const commerceShellText = [
    "GA NAAR HOOFDINHOUD Voor 23:55 besteld, morgen in huis.",
    "Producten Aanbiedingen Recepten Goed eten Inspiratie Folder Klantenservice Inloggen Winkelwagen.",
    "Boodschappenlijstjes Kies jouw winkel Producten niet beschikbaar Andere winkel kiezen Bevestigen.",
    "Nieuwsbrief De beste aanbiedingen, acties, inspiratie en persoonlijke aanbevelingen in je inbox.",
    "Algemene voorwaarden Privacy statement Actievoorwaarden Cookie informatie Belangrijke veiligheidswaarschuwing."
  ].join(" ").repeat(3);
  const surfaces = dedupePolicySurfaces([
    {
      observationId: "target-privacy",
      surfaceType: "privacy_policy",
      url: "https://example.test/voorwaarden/privacy-statement",
      confidence: 0.88,
      status: "fetched",
      textExcerpt: commerceShellText,
      observedTopics: ["cookies"]
    }
  ] as never, "https://example.test/");

  const summary = summarizePolicySurfaces(surfaces, "example.test");

  assert.equal(summary.privacyPolicyPresent, true);
  assert.equal(summary.policyTextExtractionHealth.policyTextExtractionStatus, "low_quality_extracted_code_or_config");
  assert.equal(summary.policyTextExtractionHealth.extractionFailureReason, "privacy_policy_text_low_quality_or_non_policy_content");
  assert.equal(summary.policyTextExtractionHealth.policyTextQuality.reason, "low_quality_app_shell_text");
  assert.deepEqual(summary.article13DisclosureSignals, []);
  assert.deepEqual(summary.article13DisclosureTypesObserved, []);

  const spanishShellText = [
    "Supermercado online Pide hoy, recibe hoy Entrega rápida en la franja horaria que mejor te venga.",
    "Productos Ofertas Recetas Iniciar sesión Pedidos y listas Carrito Atención al cliente.",
    "Folletos y Tiendas Descubre las mejores ofertas y busca tu tienda más cercana.",
    "Política de privacidad Política de cookies Aviso legal Condiciones de compra."
  ].join(" ").repeat(3);
  const spanishSurfaces = dedupePolicySurfaces([
    {
      observationId: "target-privacy-es",
      surfaceType: "privacy_policy",
      url: "https://example.test/politica-de-privacidad",
      confidence: 0.88,
      status: "fetched",
      textExcerpt: spanishShellText,
      observedTopics: ["cookies"]
    }
  ] as never, "https://example.test/");
  const spanishSummary = summarizePolicySurfaces(spanishSurfaces, "example.test");

  assert.equal(spanishSummary.policyTextExtractionHealth.policyTextQuality.reason, "low_quality_app_shell_text");
  assert.deepEqual(spanishSummary.article13DisclosureSignals, []);
});

test("summarizePolicySurfaces separates weak Article 13 candidates from validated disclosure signals", async () => {
  const { dedupePolicySurfaces, summarizePolicySurfaces } = await loadLocalV2DagReport();
  const surfaces = dedupePolicySurfaces([
    {
      observationId: "google-like-privacy",
      surfaceType: "privacy_policy",
      url: "https://example.test/privacy",
      confidence: 0.95,
      status: "fetched",
      textExcerpt: [
        "We use personal information to provide our services, maintain and improve them, personalize content, and measure performance.",
        "We share information with service providers and partners that process data on our behalf.",
        "Privacy Policy - Privacy & Terms - Google Skip to main content Privacy & Terms Overview Privacy Policy Terms of Service Technologies FAQ.",
        "Introduction Information Google collects Why Google collects data Your privacy controls Sharing your information Keeping your information.",
        "We use various technologies to collect and store information, including cookies, local storage, databases, and server logs.",
        "Data transfers. We may process information on servers outside the European Economic Area using standard contractual clauses."
      ].join(" "),
      observedTopics: ["controller_contact", "processing_purposes", "recipients_or_vendor_categories", "data_retention", "international_transfers"],
      article13DisclosureSignals: [
        {
          disclosureType: "controller_contact",
          status: "observed",
          evidenceText: "Privacy Policy - Privacy & Terms - Google Skip to main content Privacy & Terms Overview Privacy Policy Terms of Service Technologies FAQ.",
          confidence: 0.82,
          source: "deterministic"
        },
        {
          disclosureType: "data_retention",
          status: "partial",
          evidenceText: "Introduction Information Google collects Why Google collects data Your privacy controls Sharing your information Keeping your information.",
          confidence: 0.62,
          source: "deterministic"
        },
        {
          disclosureType: "data_retention",
          status: "partial",
          evidenceText: "We use various technologies to collect and store information, including cookies, local storage, databases, and server logs.",
          confidence: 0.62,
          source: "deterministic"
        },
        {
          disclosureType: "processing_purposes",
          status: "observed",
          evidenceText: "We use personal information to provide our services, maintain and improve them, personalize content, and measure performance.",
          confidence: 0.78,
          source: "deterministic"
        },
        {
          disclosureType: "recipients_or_vendor_categories",
          status: "observed",
          evidenceText: "We share information with service providers and partners that process data on our behalf.",
          confidence: 0.78,
          source: "deterministic"
        },
        {
          disclosureType: "international_transfers",
          status: "observed",
          evidenceText: "Data transfers. We may process information on servers outside the European Economic Area using standard contractual clauses.",
          confidence: 0.78,
          source: "deterministic"
        }
      ]
    }
  ] as never, "https://example.test/");

  const summary = summarizePolicySurfaces(surfaces, "example.test");

  assert.deepEqual(
    summary.article13DisclosureSignals.map((signal) => signal.disclosureType),
    ["processing_purposes", "recipients_or_vendor_categories", "international_transfers"]
  );
  assert.equal(summary.article13DisclosureTypesObserved.includes("controller_contact"), false);
  assert.equal(summary.article13DisclosureTypesPartial.includes("data_retention"), false);
  assert.equal(summary.observedPolicyTopicHints.includes("controller_contact"), true);
  assert.equal(summary.observedPolicyTopicHints.includes("data_retention"), true);
  assert.equal(summary.discardedArticle13DisclosureSignals.some((signal) =>
    signal.disclosureType === "controller_contact" &&
    signal.rejectReason === "page_chrome_or_navigation"
  ), true);
  assert.equal(summary.discardedArticle13DisclosureSignals.some((signal) =>
    signal.disclosureType === "data_retention" &&
    signal.rejectReason === "table_of_contents_only"
  ), true);
  assert.equal(summary.discardedArticle13DisclosureSignals.some((signal) =>
    signal.disclosureType === "data_retention" &&
    signal.rejectReason === "generic_storage_not_retention"
  ), true);
});

test("summarizePolicySurfaces accepts GDPR Transparency candidates by default", async () => {
  const { dedupePolicySurfaces, summarizePolicySurfaces } = await loadLocalV2DagReport();
  const legacySignalText = "The legal basis for processing your personal data includes consent, contract, and legitimate interests.";
  const candidateText = "La base jurídica del tratamiento de datos personales incluye el consentimiento, contrato e intereses legítimos.";
  const surfaces = dedupePolicySurfaces([
    {
      observationId: "target-privacy",
      surfaceType: "privacy_policy",
      url: "https://example.test/privacy",
      normalizedUrl: "https://example.test/privacy",
      confidence: 0.95,
      status: "fetched",
      textExcerpt: [
        "Privacy Policy. We explain how we process personal data.",
        legacySignalText,
        candidateText
      ].join(" "),
      observedTopics: ["legal_basis"],
      article13DisclosureSignals: [
        {
          disclosureType: "legal_basis",
          status: "observed",
          evidenceText: legacySignalText,
          confidence: 0.9,
          source: "deterministic"
        }
      ],
      gdprTransparencyTopicCandidates: [
        {
          topic: "legal_basis",
          status: "diagnostic_only",
          evidenceText: candidateText,
          confidence: 0.93,
          classifierProvenance: "gdpr_transparency_topic_classifier.v1",
          matchedLocale: "es",
          matchedTerm: "base jurídica",
          matchStrength: "direct",
          classifierReasonCodes: ["matched_legal_basis"],
          productionCredit: false
        }
      ]
    }
  ] as never, "https://example.test/");

  const summary = summarizePolicySurfaces(surfaces, "example.test");

  assert.equal(summary.gdprTransparencyEvidenceProfile, "gdpr_transparency_multilingual_article13_v1");
  assert.equal(summary.gdprTransparencyProductionEvidenceEnabled, true);
  assert.deepEqual(summary.observedTopics, ["legal_basis"]);
  assert.deepEqual(
    summary.article13DisclosureSignals.map((signal) => signal.evidenceText),
    [legacySignalText, candidateText]
  );
  assert.deepEqual(summary.article13DisclosureTypesObserved, ["legal_basis"]);
  assert.deepEqual(summary.gdprTransparencyProductionEvidenceDiagnostics, {
    acceptedCandidateCount: 1,
    diagnosticCandidateCount: 0,
    discardedCandidateCount: 0,
    productionCreditSignalCount: 1,
    rejectedCandidateCount: 0,
    sourceCandidateCount: 1
  });
});

test("summarizePolicySurfaces supplements Article 13 signals only from opt-in accepted GDPR Transparency candidates", async () => {
  const { dedupePolicySurfaces, summarizePolicySurfaces } = await loadLocalV2DagReport();
  const acceptedSpanish = "La base jurídica del tratamiento de datos personales incluye el consentimiento, contrato e intereses legítimos.";
  const rejectedToc = "Privacy Policy Introduction Controller contact Legal basis Recipients Retention Rights International transfers DPO Complaints";
  const weakRights = "You have the right to access privacy information, but this weak candidate is diagnostic only.";
  const termsCandidate = "La base jurídica del tratamiento de datos personales incluye consentimiento y contrato.";
  const surfaces = dedupePolicySurfaces([
    {
      observationId: "target-privacy",
      surfaceType: "privacy_policy",
      url: "https://example.test/privacy",
      normalizedUrl: "https://example.test/privacy",
      confidence: 0.95,
      status: "fetched",
      textExcerpt: [
        "Privacy Policy. We explain how we process personal data.",
        acceptedSpanish,
        "Your privacy rights and transfers are described in this notice."
      ].join(" "),
      observedTopics: [],
      gdprTransparencyTopicCandidates: [
        {
          topic: "legal_basis",
          status: "diagnostic_only",
          evidenceText: acceptedSpanish,
          confidence: 0.93,
          classifierProvenance: "gdpr_transparency_topic_classifier.v1",
          matchedLocale: "es",
          matchedTerm: "base jurídica",
          matchStrength: "direct",
          classifierReasonCodes: ["matched_legal_basis"],
          productionCredit: false
        },
        {
          topic: "legal_basis",
          status: "diagnostic_only",
          evidenceText: rejectedToc,
          confidence: 0.94,
          classifierProvenance: "gdpr_transparency_topic_classifier.v1",
          matchedLocale: "en",
          matchedTerm: "legal basis",
          matchStrength: "direct",
          classifierReasonCodes: ["matched_legal_basis"],
          productionCredit: false
        },
        {
          topic: "data_subject_rights",
          status: "diagnostic_only",
          evidenceText: weakRights,
          confidence: 0.91,
          classifierProvenance: "gdpr_transparency_topic_classifier.v1",
          matchedLocale: "en",
          matchedTerm: "right to access",
          matchStrength: "weak",
          classifierReasonCodes: ["matched_data_subject_rights"],
          productionCredit: false
        }
      ]
    },
    {
      observationId: "terms",
      surfaceType: "terms",
      url: "https://example.test/terms",
      normalizedUrl: "https://example.test/terms",
      confidence: 0.9,
      status: "fetched",
      textExcerpt: termsCandidate,
      gdprTransparencyTopicCandidates: [
        {
          topic: "legal_basis",
          status: "diagnostic_only",
          evidenceText: termsCandidate,
          confidence: 0.94,
          classifierProvenance: "gdpr_transparency_topic_classifier.v1",
          matchedLocale: "es",
          matchedTerm: "base jurídica",
          matchStrength: "direct",
          classifierReasonCodes: ["matched_legal_basis"],
          productionCredit: false
        }
      ]
    }
  ] as never, "https://example.test/");

  const summary = summarizePolicySurfaces(surfaces, "example.test", {
    gdprTransparencyEvidenceProfile: "gdpr_transparency_multilingual_article13_v1"
  });

  assert.equal(summary.gdprTransparencyEvidenceProfile, "gdpr_transparency_multilingual_article13_v1");
  assert.equal(summary.gdprTransparencyProductionEvidenceEnabled, true);
  assert.deepEqual(summary.observedTopics, []);
  assert.deepEqual(summary.article13DisclosureTypesObserved, ["legal_basis"]);
  assert.equal(summary.article13DisclosureSignals.length, 1);
  const acceptedSignal = summary.article13DisclosureSignals[0] as Record<string, unknown> | undefined;
  assert.equal(acceptedSignal?.disclosureType, "legal_basis");
  assert.equal(acceptedSignal?.productionCredit, true);
  assert.equal(acceptedSignal?.matchedLocale, "es");
  assert.equal(acceptedSignal?.evidenceText, acceptedSpanish);
  assert.deepEqual(summary.gdprTransparencyProductionEvidenceDiagnostics, {
    acceptedCandidateCount: 1,
    diagnosticCandidateCount: 1,
    discardedCandidateCount: 1,
    productionCreditSignalCount: 1,
    rejectedCandidateCount: 2,
    sourceCandidateCount: 3
  });
});

test("summarizePolicySurfaces uses row-specific supplemental cookie and terms Article 13 evidence", async () => {
  const { dedupePolicySurfaces, summarizePolicySurfaces } = await loadLocalV2DagReport();
  const termsPurpose =
    "Privacy terms. We process personal data to manage bookings, provide hospitality services, and operate customer support.";
  const cookieRetention =
    "Cookie policy. We retain personal data stored through cookies only as long as necessary for the purposes described.";
  const genericTermsCandidate =
    "The legal basis for processing your personal data includes consent and legitimate interests.";
  const surfaces = dedupePolicySurfaces([
    {
      observationId: "target-privacy",
      surfaceType: "privacy_policy",
      url: "https://example.test/privacy",
      normalizedUrl: "https://example.test/privacy",
      confidence: 0.95,
      status: "fetched",
      textExcerpt: "Privacy Policy. We explain how we process personal data.",
      observedTopics: []
    },
    {
      observationId: "target-terms",
      surfaceType: "terms",
      url: "https://example.test/terms",
      normalizedUrl: "https://example.test/terms",
      confidence: 0.9,
      status: "fetched",
      textExcerpt: termsPurpose,
      observedTopics: ["processing_purposes"],
      article13DisclosureSignals: [
        {
          disclosureType: "processing_purposes",
          status: "observed",
          evidenceText: termsPurpose,
          confidence: 0.9,
          source: "deterministic"
        }
      ]
    },
    {
      observationId: "target-cookie",
      surfaceType: "cookie_policy",
      url: "https://example.test/cookies",
      normalizedUrl: "https://example.test/cookies",
      confidence: 0.9,
      status: "fetched",
      textExcerpt: cookieRetention,
      gdprTransparencyTopicCandidates: [
        {
          topic: "data_retention",
          status: "diagnostic_only",
          evidenceText: cookieRetention,
          confidence: 0.9,
          classifierProvenance: "gdpr_transparency_topic_classifier.v1",
          matchedLocale: "en",
          matchedTerm: "retain personal data",
          matchStrength: "direct",
          classifierReasonCodes: ["matched_data_retention"],
          productionCredit: false
        }
      ]
    },
    {
      observationId: "generic-terms",
      surfaceType: "terms",
      url: "https://example.test/site-terms",
      normalizedUrl: "https://example.test/site-terms",
      confidence: 0.9,
      status: "fetched",
      textExcerpt: genericTermsCandidate,
      gdprTransparencyTopicCandidates: [
        {
          topic: "legal_basis",
          status: "diagnostic_only",
          evidenceText: genericTermsCandidate,
          confidence: 0.93,
          classifierProvenance: "gdpr_transparency_topic_classifier.v1",
          matchedLocale: "en",
          matchedTerm: "legal basis",
          matchStrength: "direct",
          classifierReasonCodes: ["matched_legal_basis"],
          productionCredit: false
        }
      ]
    }
  ] as never, "https://example.test/");

  const summary = summarizePolicySurfaces(surfaces, "example.test");

  assert.deepEqual(
    summary.article13DisclosureTypesObserved.sort(),
    ["data_retention", "processing_purposes"],
  );
  assert.equal(
    summary.article13DisclosureSignals.some((signal) =>
      signal.disclosureType === "legal_basis" &&
      signal.evidenceText === genericTermsCandidate
    ),
    false,
  );
  assert.deepEqual(summary.gdprTransparencyProductionEvidenceDiagnostics, {
    acceptedCandidateCount: 1,
    diagnosticCandidateCount: 0,
    discardedCandidateCount: 0,
    productionCreditSignalCount: 1,
    rejectedCandidateCount: 0,
    sourceCandidateCount: 1,
  });
});

test("summarizePolicySurfaces credits French Article 13 candidates through the production profile by default", async () => {
  const { dedupePolicySurfaces, summarizePolicySurfaces } = await loadLocalV2DagReport();
  const purposesText =
    "Les finalités du traitement comprennent la gestion de votre compte et la fourniture des services demandés.";
  const legalBasisText =
    "La base légale du traitement des données personnelles comprend le consentement, le contrat et l'intérêt légitime.";
  const retentionText =
    "Les données personnelles sont conservées pendant la durée nécessaire aux finalités du traitement.";
  const recipientsText =
    "Nous pouvons communiquer vos données personnelles à nos prestataires et sous-traitants qui agissent pour notre compte.";
  const candidates = [
    {
      topic: "processing_purposes",
      evidenceText: purposesText,
      matchedTerm: "finalités du traitement"
    },
    {
      topic: "legal_basis",
      evidenceText: legalBasisText,
      matchedTerm: "base légale du traitement"
    },
    {
      topic: "data_retention",
      evidenceText: retentionText,
      matchedTerm: "conservées pendant la durée nécessaire"
    },
    {
      topic: "recipients_or_vendor_categories",
      evidenceText: recipientsText,
      matchedTerm: "prestataires et sous-traitants"
    }
  ].map((candidate) => ({
    ...candidate,
    classifierProvenance: "gdpr_transparency_topic_classifier.v1",
    classifierReasonCodes: [`matched_${candidate.topic}`, "match_strength_equivalent"],
    confidence: 0.82,
    matchStrength: "equivalent",
    matchedLocale: "fr",
    productionCredit: false,
    status: "diagnostic_only"
  }));
  const surfaces = dedupePolicySurfaces([
    {
      observationId: "lefigaro-style-privacy",
      surfaceType: "privacy_policy",
      url: "https://mentions-legales.example.test/page/politique-de-confidentialite",
      normalizedUrl: "https://mentions-legales.example.test/page/politique-de-confidentialite",
      confidence: 0.96,
      status: "fetched",
      textExcerpt: [
        "Politique de confidentialité. Cette politique explique le traitement des données personnelles.",
        purposesText,
        legalBasisText,
        retentionText,
        recipientsText,
      ].join(" "),
      observedTopics: [],
      gdprTransparencyTopicCandidates: candidates
    }
  ] as never, "https://lefigaro.fr/");

  const summary = summarizePolicySurfaces(surfaces, "lefigaro.fr");

  assert.equal(summary.gdprTransparencyEvidenceProfile, "gdpr_transparency_multilingual_article13_v1");
  assert.equal(summary.gdprTransparencyProductionEvidenceEnabled, true);
  assert.deepEqual(
    summary.article13DisclosureTypesObserved.sort(),
    [
      "data_retention",
      "legal_basis",
      "processing_purposes",
      "recipients_or_vendor_categories"
    ]
  );
  const acceptedSignals = summary.article13DisclosureSignals as Array<Record<string, unknown>>;
  assert.equal(
    acceptedSignals.every((signal) =>
      signal.productionCredit === true &&
      signal.productionCreditProfile === "gdpr_transparency_multilingual_article13_v1" &&
      signal.matchedLocale === "fr"
    ),
    true
  );
  assert.deepEqual(summary.gdprTransparencyProductionEvidenceDiagnostics, {
    acceptedCandidateCount: 4,
    diagnosticCandidateCount: 0,
    discardedCandidateCount: 0,
    productionCreditSignalCount: 4,
    rejectedCandidateCount: 0,
    sourceCandidateCount: 4
  });
});

test("summarizePolicySurfaces credits Spanish real-style Article 13 candidates through the production profile by default", async () => {
  const { dedupePolicySurfaces, summarizePolicySurfaces } = await loadLocalV2DagReport();
  const candidateInputs = [
    {
      topic: "processing_purposes",
      evidenceText: "Tratamos sus datos personales para gestionar su cuenta y prestarle los servicios solicitados.",
      matchedTerm: "tratamos sus datos personales para",
    },
    {
      topic: "legal_basis",
      evidenceText: "La legitimación para el tratamiento de sus datos personales incluye el consentimiento, la ejecución del contrato y nuestro interés legítimo.",
      matchedTerm: "legitimación para el tratamiento de sus datos personales",
    },
    {
      topic: "recipients_or_vendor_categories",
      evidenceText: "Podemos comunicar sus datos personales a encargados del tratamiento, proveedores de servicios y otros destinatarios.",
      matchedTerm: "encargados del tratamiento",
    },
    {
      topic: "data_retention",
      evidenceText: "Sus datos personales serán conservados durante el plazo necesario para las finalidades descritas.",
      matchedTerm: "datos personales serán conservados",
    },
    {
      topic: "data_subject_rights",
      evidenceText: "Puede ejercer sus derechos de acceso, rectificación, supresión, oposición, limitación y portabilidad sobre sus datos personales.",
      matchedTerm: "derechos de acceso rectificación supresión oposición limitación y portabilidad",
    },
    {
      topic: "international_transfers",
      evidenceText: "Podemos transferir sus datos personales a terceros países usando cláusulas contractuales tipo.",
      matchedTerm: "cláusulas contractuales tipo",
    },
    {
      topic: "supervisory_authority",
      evidenceText: "Puede presentar una reclamación ante la Agencia Española de Protección de Datos.",
      matchedTerm: "presentar una reclamación ante la agencia española de protección de datos",
    },
  ];
  const candidates = candidateInputs.map((candidate) => ({
    ...candidate,
    classifierProvenance: "gdpr_transparency_topic_classifier.v1",
    classifierReasonCodes: [`matched_${candidate.topic}`, "match_strength_equivalent"],
    confidence: 0.86,
    matchStrength: "equivalent",
    matchedLocale: "es",
    productionCredit: false,
    status: "diagnostic_only",
  }));
  const surfaces = dedupePolicySurfaces([
    {
      observationId: "spanish-real-style-privacy",
      surfaceType: "privacy_policy",
      url: "https://example.test/politica-de-privacidad",
      normalizedUrl: "https://example.test/politica-de-privacidad",
      confidence: 0.96,
      status: "fetched",
      textExcerpt: [
        "Política de privacidad. Esta política describe el tratamiento de datos personales de los usuarios.",
        ...candidateInputs.map((candidate) => candidate.evidenceText),
      ].join(" "),
      observedTopics: [],
      gdprTransparencyTopicCandidates: candidates,
    },
  ] as never, "https://example.test/");

  const summary = summarizePolicySurfaces(surfaces, "example.test");

  assert.equal(summary.gdprTransparencyEvidenceProfile, "gdpr_transparency_multilingual_article13_v1");
  assert.equal(summary.gdprTransparencyProductionEvidenceEnabled, true);
  assert.deepEqual(
    summary.article13DisclosureTypesObserved.sort(),
    [
      "data_retention",
      "data_subject_rights",
      "international_transfers",
      "legal_basis",
      "processing_purposes",
      "recipients_or_vendor_categories",
      "supervisory_authority",
    ],
  );
  const acceptedSignals = summary.article13DisclosureSignals as Array<Record<string, unknown>>;
  assert.equal(acceptedSignals.length, 7);
  assert.equal(
    acceptedSignals.every((signal) =>
      signal.productionCredit === true &&
      signal.productionCreditProfile === "gdpr_transparency_multilingual_article13_v1" &&
      signal.matchedLocale === "es"
    ),
    true,
  );
  assert.deepEqual(summary.gdprTransparencyProductionEvidenceDiagnostics, {
    acceptedCandidateCount: 7,
    diagnosticCandidateCount: 0,
    discardedCandidateCount: 0,
    productionCreditSignalCount: 7,
    rejectedCandidateCount: 0,
    sourceCandidateCount: 7,
  });
});

test("summarizePolicySurfaces credits Wyborcza-style Polish Article 13 candidates through the production profile by default", async () => {
  const { dedupePolicySurfaces, summarizePolicySurfaces } = await loadLocalV2DagReport();
  const candidateInputs = [
    {
      topic: "controller_contact",
      evidenceText: "Administratorem danych osobowych przetwarzanych w związku z korzystaniem z Serwisów jest Wyborcza sp. z o.o.",
      matchedTerm: "administratorem danych osobowych",
    },
    {
      topic: "dpo_contact",
      evidenceText: "W każdej sprawie dotyczącej danych osobowych można się skontaktować z naszym Inspektorem Ochrony Danych Osobowych na adres e-mail iod@example.test.",
      matchedTerm: "inspektorem ochrony danych osobowych",
    },
    {
      topic: "processing_purposes",
      evidenceText: "W jakim celu i na jakiej podstawie prawnej przetwarzamy Twoje dane? Dane osobowe przetwarzamy w następujących celach.",
      matchedTerm: "w jakim celu i na jakiej podstawie prawnej przetwarzamy twoje dane",
    },
    {
      topic: "legal_basis",
      evidenceText: "Podstawą prawną przetwarzania danych osobowych jest uzasadniony interes Administratora oraz art. 6 ust. 1 lit. f RODO.",
      matchedTerm: "podstawą prawną przetwarzania jest",
    },
    {
      topic: "recipients_or_vendor_categories",
      evidenceText: "Dane osobowe możemy przekazywać podmiotom przetwarzającym dane osobowe, partnerom biznesowym i dostawcom usług.",
      matchedTerm: "podmiotom przetwarzającym dane osobowe",
    },
    {
      topic: "data_retention",
      evidenceText: "Dane osobowe przechowujemy nie dłużej niż jest to niezbędne, do czasu cofnięcia zgody albo do czasu przedawnienia roszczeń.",
      matchedTerm: "do czasu cofnięcia zgody",
    },
    {
      topic: "data_subject_rights",
      evidenceText: "Przysługuje Ci prawo dostępu do danych osobowych, sprostowania, usunięcia, ograniczenia, wniesienia sprzeciwu oraz przenoszenia danych.",
      matchedTerm: "prawo do przenoszenia danych",
    },
    {
      topic: "international_transfers",
      evidenceText: "Dane osobowe mogą być przekazywane poza Europejskim Obszarem Gospodarczym na podstawie standardowych klauzul umownych.",
      matchedTerm: "standardowe klauzule umowne",
    },
    {
      topic: "supervisory_authority",
      evidenceText: "Masz prawo wniesienia skargi do organu nadzorczego zajmującego się ochroną danych osobowych, tj. Prezesa Urzędu Ochrony Danych Osobowych.",
      matchedTerm: "prawo wniesienia skargi do organu nadzorczego",
    },
    {
      topic: "automated_decision_making_or_profiling",
      evidenceText: "W niektórych przypadkach wykorzystujemy profilowanie dla celów marketingowych w ramach przetwarzania danych osobowych.",
      matchedTerm: "profilowania dla celów marketingowych",
    },
  ];
  const candidates = candidateInputs.map((candidate) => ({
    ...candidate,
    classifierProvenance: "gdpr_transparency_topic_classifier.v1",
    classifierReasonCodes: [`matched_${candidate.topic}`, "match_strength_equivalent"],
    confidence: 0.88,
    matchStrength: "equivalent",
    matchedLocale: "pl",
    productionCredit: false,
    status: "diagnostic_only",
  }));
  const surfaces = dedupePolicySurfaces([
    {
      observationId: "wyborcza-style-privacy",
      surfaceType: "privacy_policy",
      url: "https://wyborcza.pl/privacy",
      normalizedUrl: "https://wyborcza.pl/privacy",
      confidence: 0.96,
      status: "fetched",
      textExcerpt: [
        "Polityka prywatności. Dokument opisuje przetwarzanie danych osobowych użytkowników.",
        ...candidateInputs.map((candidate) => candidate.evidenceText),
      ].join(" "),
      observedTopics: [],
      gdprTransparencyTopicCandidates: candidates,
    },
  ] as never, "https://wyborcza.pl/");

  const summary = summarizePolicySurfaces(surfaces, "wyborcza.pl");

  assert.equal(summary.gdprTransparencyEvidenceProfile, "gdpr_transparency_multilingual_article13_v1");
  assert.equal(summary.gdprTransparencyProductionEvidenceEnabled, true);
  assert.deepEqual(
    summary.article13DisclosureTypesObserved.sort(),
    [
      "automated_decision_making_or_profiling",
      "controller_contact",
      "data_retention",
      "data_subject_rights",
      "dpo_contact",
      "international_transfers",
      "legal_basis",
      "processing_purposes",
      "recipients_or_vendor_categories",
      "supervisory_authority",
    ],
  );
  const acceptedSignals = summary.article13DisclosureSignals as Array<Record<string, unknown>>;
  assert.equal(acceptedSignals.length, 10);
  assert.equal(
    acceptedSignals.every((signal) =>
      signal.productionCredit === true &&
      signal.productionCreditProfile === "gdpr_transparency_multilingual_article13_v1" &&
      signal.matchedLocale === "pl"
    ),
    true,
  );
  assert.deepEqual(summary.gdprTransparencyProductionEvidenceDiagnostics, {
    acceptedCandidateCount: 10,
    diagnosticCandidateCount: 0,
    discardedCandidateCount: 0,
    productionCreditSignalCount: 10,
    rejectedCandidateCount: 0,
    sourceCandidateCount: 10,
  });
});

test("summarizePolicySurfaces uses multilingual policy quality by default for GDPR Transparency candidates", async () => {
  const { dedupePolicySurfaces, summarizePolicySurfaces } = await loadLocalV2DagReport();
  const dpoEvidence = "satisfacción en el ejercicio de sus derechos ante los responsables de los Datos Personales, puede contactar con nuestro Delegado de Protección de datos a través del mail dpo@example.test";
  const authorityEvidence = "los Datos Personales, puede contactar con nuestro Delegado de Protección de datos y/o presentar una reclamación ante la Agencia Española de Protección de Datos a través de su página web";
  const spanishPolicyText = [
    "Navidad Niños Recetas de cocina Información General Política de cookies Configuración de cookies.",
    "Esta política de privacidad describe el tratamiento de datos personales de los usuarios.",
    "El responsable explica los derechos de acceso, rectificación, supresión y oposición sobre sus datos personales.",
    "Si no obtiene satisfacción en el ejercicio de sus derechos ante los responsables de los Datos Personales,",
    dpoEvidence,
    "y/o",
    authorityEvidence,
    "También se informa sobre la protección de datos, la base jurídica del tratamiento y otros derechos de privacidad."
  ].join(" ");
  const surfaces = dedupePolicySurfaces([
    {
      observationId: "spanish-privacy",
      surfaceType: "privacy_policy",
      url: "https://example.test/privacidad/",
      normalizedUrl: "https://example.test/privacidad/",
      confidence: 0.95,
      status: "fetched",
      textExcerpt: spanishPolicyText,
      observedTopics: [],
      gdprTransparencyTopicCandidates: [
        {
          topic: "dpo_contact",
          status: "diagnostic_only",
          evidenceText: dpoEvidence,
          confidence: 0.9,
          classifierProvenance: "gdpr_transparency_topic_classifier.v1",
          matchedLocale: "es",
          matchedTerm: "delegado de protección de datos",
          matchStrength: "direct",
          classifierReasonCodes: ["matched_dpo_contact"],
          productionCredit: false
        },
        {
          topic: "supervisory_authority",
          status: "diagnostic_only",
          evidenceText: authorityEvidence,
          confidence: 0.9,
          classifierProvenance: "gdpr_transparency_topic_classifier.v1",
          matchedLocale: "es",
          matchedTerm: "presentar una reclamación ante la agencia española de protección de datos",
          matchStrength: "direct",
          classifierReasonCodes: ["matched_supervisory_authority"],
          productionCredit: false
        }
      ]
    }
  ] as never, "https://example.test/");

  const legacySummary = summarizePolicySurfaces(surfaces, "example.test", {
    gdprTransparencyEvidenceProfile: "legacy_only"
  });
  assert.equal(legacySummary.gdprTransparencyEvidenceProfile, "legacy_only");
  assert.equal(legacySummary.gdprTransparencyProductionEvidenceEnabled, false);
  assert.deepEqual(legacySummary.article13DisclosureSignals, []);

  const optInSummary = summarizePolicySurfaces(surfaces, "example.test");

  assert.equal(optInSummary.gdprTransparencyEvidenceProfile, "gdpr_transparency_multilingual_article13_v1");
  assert.equal(optInSummary.gdprTransparencyProductionEvidenceEnabled, true);
  assert.deepEqual(optInSummary.article13DisclosureTypesObserved, ["dpo_contact", "supervisory_authority"]);
  assert.equal(optInSummary.article13DisclosureSignals.length, 2);
  const optInSignals = optInSummary.article13DisclosureSignals as Array<Record<string, unknown>>;
  assert.equal(optInSignals.every((signal) =>
    signal.productionCredit === true &&
    signal.productionCreditProfile === "gdpr_transparency_multilingual_article13_v1" &&
    signal.matchedLocale === "es"
  ), true);
});

test("materializeLocalV2DagScanDetail records stable GDPR Transparency profile metadata from scan config", async () => {
  const { materializeLocalV2DagScanDetail } = await loadLocalV2DagReport();
  const previousAppUrl = process.env.NEXT_PUBLIC_APP_URL;
  const outDir = await mkdtemp(path.join(process.cwd(), "artifacts/local-v2-dag-scans/gdpr-profile-"));
  const acceptedSpanish = "La base jurídica del tratamiento de datos personales incluye el consentimiento, contrato e intereses legítimos.";
  try {
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
    await mkdir(outDir, { recursive: true });
    await writeFile(path.join(outDir, "CanonicalEvidenceBundle.json"), `${JSON.stringify({
      completedAt: "2026-06-25T02:16:00.000Z",
      consentUiObservations: [],
      cookieEvents: [],
      modulesRun: [],
      networkEvents: [],
      normalizedUrl: "https://example.test/",
      normalizedVendorObservations: [],
      policySurfaceObservations: [
        {
          observationId: "target-privacy",
          surfaceType: "privacy_policy",
          url: "https://example.test/privacy",
          normalizedUrl: "https://example.test/privacy",
          confidence: 0.95,
          status: "fetched",
          textExcerpt: [
            "Privacy Policy. We explain how we process personal data.",
            acceptedSpanish
          ].join(" "),
          observedTopics: [],
          gdprTransparencyTopicCandidates: [
            {
              topic: "legal_basis",
              status: "diagnostic_only",
              evidenceText: acceptedSpanish,
              confidence: 0.93,
              classifierProvenance: "gdpr_transparency_topic_classifier.v1",
              matchedLocale: "es",
              matchedTerm: "base jurídica",
              matchStrength: "direct",
              classifierReasonCodes: ["matched_legal_basis"],
              productionCredit: false
            }
          ]
        }
      ],
      runtimeCoverage: {
        coverageStatus: "usable",
        fallbackModesUsed: [],
        limitationKeys: [],
        notes: [],
        observationCounts: {
          cookieEvents: 0,
          cookiesBeforeConsent: 0,
          networkEvents: 0,
          normalizedVendors: 0,
          observedJourneys: 0,
          thirdPartyRequests: 0
        },
        silentEmpty: false
      },
      runtimeTimeline: [],
      scanId: "gdpr-profile-fixture",
      schemaVersion: "certscore.v2.canonical-evidence-bundle.v1",
      screenshots: [],
      startedAt: "2026-06-25T02:15:50.000Z",
      url: "https://example.test/"
    }, null, 2)}\n`, "utf8");

    const baseScanConfig = {
      hostname: "example.test",
      normalizedUrl: "https://example.test/",
      processor: LOCAL_V2_DAG_SCAN_PROCESSOR,
      execution: {
        localV2Dag: { outDir },
        v2DagParallel: {
          artifactOnly: true,
          localOnly: true,
          profile: "standard",
          productionFindingIntegration: false
        }
      }
    };
    const defaultDetail = await materializeLocalV2DagScanDetail(makeScanRecord({
      scan: {
        ...makeScanRecord().scan,
        domainHostname: "example.test",
        scanConfigJson: baseScanConfig
      }
    }));
    const defaultSummary = defaultDetail.runtimeArtifacts?.policyDisclosureSummary as Record<string, unknown> | undefined;
    const defaultSignals = defaultSummary?.article13DisclosureSignals as Array<Record<string, unknown>> | undefined;
    assert.equal(defaultSummary?.gdprTransparencyEvidenceProfile, "gdpr_transparency_multilingual_article13_v1");
    assert.equal(defaultSummary?.gdprTransparencyProductionEvidenceEnabled, true);
    assert.equal(defaultDetail.runtimeArtifacts?.gdprTransparencyEvidenceProfile, "gdpr_transparency_multilingual_article13_v1");
    assert.equal(defaultDetail.runtimeArtifacts?.gdprTransparencyProductionEvidenceEnabled, true);
    assert.equal(defaultSignals?.length, 1);
    assert.equal(defaultSignals?.[0]?.productionCredit, true);
    assert.equal(defaultSignals?.[0]?.matchedLocale, "es");

    const legacyDetail = await materializeLocalV2DagScanDetail(makeScanRecord({
      scan: {
        ...makeScanRecord().scan,
        domainHostname: "example.test",
        scanConfigJson: {
          ...baseScanConfig,
          execution: {
            ...baseScanConfig.execution,
            v2DagParallel: {
              ...baseScanConfig.execution.v2DagParallel,
              gdprTransparencyEvidenceProfile: "legacy_only"
            }
          }
        }
      }
    }));
    const legacySummary = legacyDetail.runtimeArtifacts?.policyDisclosureSummary as Record<string, unknown> | undefined;
    assert.equal(legacySummary?.gdprTransparencyEvidenceProfile, "legacy_only");
    assert.equal(legacySummary?.gdprTransparencyProductionEvidenceEnabled, false);
    assert.deepEqual(legacySummary?.article13DisclosureSignals, []);
    assert.equal(legacyDetail.runtimeArtifacts?.gdprTransparencyEvidenceProfile, "legacy_only");

    const optInDetail = await materializeLocalV2DagScanDetail(makeScanRecord({
      scan: {
        ...makeScanRecord().scan,
        domainHostname: "example.test",
        scanConfigJson: {
          ...baseScanConfig,
          execution: {
            ...baseScanConfig.execution,
            v2DagParallel: {
              ...baseScanConfig.execution.v2DagParallel,
              gdprTransparencyEvidenceProfile: "gdpr_transparency_multilingual_article13_v1"
            }
          }
        }
      }
    }));
    const optInSummary = optInDetail.runtimeArtifacts?.policyDisclosureSummary as Record<string, unknown> | undefined;
    const optInSignals = optInSummary?.article13DisclosureSignals as Array<Record<string, unknown>> | undefined;
    assert.equal(optInSummary?.gdprTransparencyEvidenceProfile, "gdpr_transparency_multilingual_article13_v1");
    assert.equal(optInSummary?.gdprTransparencyProductionEvidenceEnabled, true);
    assert.equal(optInDetail.runtimeArtifacts?.gdprTransparencyEvidenceProfile, "gdpr_transparency_multilingual_article13_v1");
    assert.equal(optInDetail.runtimeArtifacts?.gdprTransparencyProductionEvidenceEnabled, true);
    assert.equal(optInSignals?.length, 1);
    assert.equal(optInSignals?.[0]?.productionCredit, true);
    assert.equal(optInSignals?.[0]?.matchedLocale, "es");
  } finally {
    if (previousAppUrl === undefined) {
      delete process.env.NEXT_PUBLIC_APP_URL;
    } else {
      process.env.NEXT_PUBLIC_APP_URL = previousAppUrl;
    }
    await rm(outDir, { recursive: true, force: true });
  }
});

test("materializeLocalV2DagScanDetail projects row-specific runtime signal summaries", async () => {
  const { materializeLocalV2DagScanDetail } = await loadLocalV2DagReport();
  const previousAppUrl = process.env.NEXT_PUBLIC_APP_URL;
  const outDir = await mkdtemp(path.join(process.cwd(), "artifacts/local-v2-dag-scans/runtime-summaries-"));
  try {
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
    await mkdir(outDir, { recursive: true });
    await writeFile(path.join(outDir, "CanonicalEvidenceBundle.json"), `${JSON.stringify({
      completedAt: "2026-06-17T13:14:02.000Z",
      cookieEvents: [],
      derivedRuntimeSignals: {
        consentBannerLikelyPresent: false,
        preConsentTrackingObserved: true
      },
      iframeEvents: [
        {
          consentStateAtTime: "pre_consent",
          eventId: "frame_1",
          eventType: "iframe",
          frameUrl: "https://www.youtube.com/embed/example",
          sourceScanner: "pre_consent_runtime",
          timestampMs: 1250,
          url: "https://example.test/"
        },
        {
          consentStateAtTime: "pre_consent",
          eventId: "frame_2",
          eventType: "iframe",
          frameUrl: "https://www.google.com/maps/embed?pb=fixture",
          sourceScanner: "pre_consent_runtime",
          timestampMs: 1350,
          url: "https://example.test/"
        }
      ],
      modulesRun: [
        {
          moduleName: "preConsentRuntimeScanner",
          status: "completed",
          startedAt: "2026-06-17T13:13:50.000Z",
          completedAt: "2026-06-17T13:14:02.000Z",
          durationMs: 12000,
          timingBreakdown: [
            { label: "browser api probe install", durationMs: 1 }
          ],
          evidenceRefs: [],
          errors: []
        }
      ],
      networkEvents: [
        {
          consentStateAtTime: "pre_consent",
          eventId: "net_1",
          eventType: "network_request",
          evidenceRefs: [],
          hostname: "c.clarity.ms",
          requestUrl: "https://c.clarity.ms/collect",
          sourceScanner: "pre_consent_runtime",
          thirdParty: true,
          timestampMs: 800,
          url: "https://c.clarity.ms/collect"
        },
        {
          consentStateAtTime: "pre_consent",
          eventId: "net_social_1",
          eventType: "network_request",
          evidenceRefs: [],
          hostname: "connect.facebook.net",
          initiatorType: "script",
          requestHeaders: {
            referer: "https://example.test/"
          },
          requestUrl: "https://connect.facebook.net/en_US/fbevents.js",
          resourceType: "script",
          sourceScanner: "pre_consent_runtime",
          thirdParty: true,
          timestampMs: 980,
          topLevelUrl: "https://example.test/",
          url: "https://connect.facebook.net/en_US/fbevents.js"
        }
      ],
      normalizedUrl: "https://example.test/",
      normalizedVendorObservations: [
        {
          confidence: 0.92,
          entity: "Microsoft",
          matchedEvidenceRefs: [
            { refId: "net_1", url: "https://c.clarity.ms/collect" }
          ],
          observationId: "vendor_1",
          product: "Microsoft Clarity",
          purpose: "session_replay",
          vendor: "Microsoft"
        }
      ],
      policySurfaceObservations: [],
      runtimeTimeline: [
        {
          consentStateAtTime: "pre_consent",
          eventId: "browser_api_1",
          eventType: "browser_api_access",
          evidenceRefs: [
            {
              eventType: "browser_api_access",
              excerpt: "canvas",
              label: "Browser API access: HTMLCanvasElement.toDataURL",
              refId: "browser_api_1"
            }
          ],
          hostname: "example.test",
          sourceScanner: "pre_consent_runtime",
          timestampMs: 900,
          url: "https://example.test/"
        }
      ],
      scanId: "runtime-summary-fixture",
      schemaVersion: "certscore.v2.canonical-evidence-bundle.v1",
      startedAt: "2026-06-17T13:13:50.000Z",
      url: "https://example.test/"
    }, null, 2)}\n`, "utf8");

    const detail = await materializeLocalV2DagScanDetail(makeScanRecord({
      scan: {
        ...makeScanRecord().scan,
        domainHostname: "example.test",
        scanConfigJson: {
          hostname: "example.test",
          normalizedUrl: "https://example.test/",
          processor: LOCAL_V2_DAG_SCAN_PROCESSOR,
          execution: {
            localV2Dag: { outDir },
            v2DagParallel: {
              artifactOnly: true,
              localOnly: true,
              profile: "standard",
              productionFindingIntegration: false
            }
          }
        }
      }
    }));
    assert.ok(detail.runtimeArtifacts);
    const hybrid = detail.runtimeArtifacts.hybridRuntimeEvidence as Record<string, Record<string, unknown>>;
    const embeddedSummary = hybrid.embeddedContentSummary;
    const sessionReplaySummary = hybrid.sessionReplayEvidenceSummary;
    const fingerprintingSummary = hybrid.fingerprintingEvidenceSummary;
    const firstLayerConsentChoices = hybrid.firstLayerConsentChoices as Record<string, unknown>;
    const rejectPath = detail.runtimeArtifacts.rejectPathDepthAndAvailability as Record<string, unknown>;
    assert.ok(embeddedSummary);
    assert.ok(sessionReplaySummary);
    assert.ok(fingerprintingSummary);
    assert.ok(firstLayerConsentChoices);
    assert.ok(rejectPath);

    assert.equal(embeddedSummary.embeddedContentObserved, true);
    assert.deepEqual(embeddedSummary.embeddedContentHosts, ["youtube.com", "google.com", "connect.facebook.net"]);
    assert.deepEqual(embeddedSummary.embeddedContentPurposeBuckets, {
      fontStaticResource: [],
      formOrChatWidget: [],
      mapEmbed: ["google.com"],
      mediaEmbed: ["youtube.com"],
      otherEmbeddedContent: [],
      socialEmbed: ["connect.facebook.net"],
      videoAdSdk: []
    });
    const embeddedObservations = embeddedSummary.observations as Array<Record<string, unknown>>;
    const facebookObservation = embeddedObservations.find((row) => row.hostname === "connect.facebook.net");
    assert.equal(facebookObservation?.initiatorType, "script");
    assert.equal(facebookObservation?.resourceType, "script");
    assert.equal(facebookObservation?.referrerSent, true);
    assert.equal(facebookObservation?.pageUrlSharedViaReferrer, true);
    assert.equal(sessionReplaySummary.preConsentObserved, true);
    assert.deepEqual(sessionReplaySummary.vendors, ["Microsoft Clarity"]);
    assert.equal(fingerprintingSummary.coverageRetained, true);
    assert.equal(fingerprintingSummary.fingerprintingObserved, true);
    assert.deepEqual(fingerprintingSummary.highEntropySignals, ["HTMLCanvasElement.toDataURL"]);
    assert.equal(firstLayerConsentChoices.rejectControlObserved, false);
    assert.equal(rejectPath.rejectControlObserved, false);
    assert.equal(rejectPath.rejectAvailableOnFirstLayer, false);
    assert.equal(rejectPath.gdprEprivacyConsentSurfaceObserved, "unconfirmed");

    const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
      coverageLimited: false,
      events: detail.events,
      runtimeArtifacts: detail.runtimeArtifacts,
      scanCompleted: true,
      snapshot: detail.snapshot
    });
    const socialMediaEmbed = outcomes.social_media_embed_pre_consent;
    assert.equal(socialMediaEmbed?.status, "Gap observed");
    assert.deepEqual(socialMediaEmbed?.criticalEvidence.retainedEvidence.providers, ["YouTube", "Meta/Facebook"]);
    assert.equal(socialMediaEmbed?.criticalEvidence.retainedEvidence.firstSocialMediaEmbedObservedMs, 980);
  } finally {
    if (previousAppUrl === undefined) {
      delete process.env.NEXT_PUBLIC_APP_URL;
    } else {
      process.env.NEXT_PUBLIC_APP_URL = previousAppUrl;
    }
    await rm(outDir, { recursive: true, force: true });
  }
});

test("materializeLocalV2DagScanDetail projects retained first-layer optional toggle defaults", async () => {
  const { materializeLocalV2DagScanDetail } = await loadLocalV2DagReport();
  const previousAppUrl = process.env.NEXT_PUBLIC_APP_URL;
  const outDir = await mkdtemp(path.join(process.cwd(), "artifacts/local-v2-dag-scans/consent-toggle-defaults-"));
  try {
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
    await mkdir(outDir, { recursive: true });
    await writeFile(path.join(outDir, "CanonicalEvidenceBundle.json"), `${JSON.stringify({
      completedAt: "2026-06-17T13:14:02.000Z",
      consentUiObservations: [
        {
          observationId: "consent_ui_pre_consent",
          observedAtMs: 900,
          likelyPresent: true,
          basis: ["keyword:cookie", "control:accept_all:Accept All", "control:reject_all:Reject All"],
          textExcerpt: "We use cookies for analytics and advertising. Manage optional cookie purposes below.",
          layerInspected: "first_layer",
          visibleChoiceLabels: ["Reject All", "Accept All"],
          defaultToggleStatesObserved: true,
          nonEssentialDefaultsOff: false,
          defaultTogglePurposeLabels: ["Analytics cookies"],
          precheckedOptionalPurposeCount: 1,
          precheckedOptionalPurposeLabels: ["Analytics cookies"],
          acceptControlObserved: true,
          rejectControlObserved: true,
          managePreferencesControlObserved: false,
          controls: [
            {
              actionType: "reject_all",
              classifierReasonCodes: ["canonical_match"],
              label: "Reject All",
              visible: true
            },
            {
              actionType: "accept_all",
              classifierReasonCodes: ["canonical_match"],
              label: "Accept All",
              visible: true
            }
          ],
          confidence: 0.86,
          evidenceRefs: []
        }
      ],
      cookieEvents: [],
      derivedRuntimeSignals: {
        consentBannerLikelyPresent: true,
        preConsentTrackingObserved: false
      },
      iframeEvents: [],
      modulesRun: [],
      networkEvents: [],
      normalizedUrl: "https://example.test/",
      normalizedVendorObservations: [],
      policySurfaceObservations: [],
      runtimeTimeline: [],
      scanId: "consent-toggle-defaults-fixture",
      schemaVersion: "certscore.v2.canonical-evidence-bundle.v1",
      startedAt: "2026-06-17T13:13:50.000Z",
      url: "https://example.test/"
    }, null, 2)}\n`, "utf8");

    const detail = await materializeLocalV2DagScanDetail(makeScanRecord({
      scan: {
        ...makeScanRecord().scan,
        domainHostname: "example.test",
        scanConfigJson: {
          hostname: "example.test",
          normalizedUrl: "https://example.test/",
          processor: LOCAL_V2_DAG_SCAN_PROCESSOR,
          execution: {
            localV2Dag: { outDir },
            v2DagParallel: {
              artifactOnly: true,
              localOnly: true,
              profile: "standard",
              productionFindingIntegration: false
            }
          }
        }
      }
    }));
    const firstLayerChoices = detail.runtimeArtifacts?.firstLayerConsentChoices as Record<string, unknown> | undefined;
    assert.equal(firstLayerChoices?.defaultToggleStatesObserved, true);
    assert.equal(firstLayerChoices?.nonEssentialDefaultsOff, false);
    assert.deepEqual(firstLayerChoices?.precheckedOptionalPurposeLabels, ["Analytics cookies"]);

    const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
      coverageLimited: false,
      events: detail.events,
      runtimeArtifacts: detail.runtimeArtifacts,
      scanCompleted: true,
      snapshot: detail.snapshot
    });
    assert.equal(outcomes.cookie_banner_preticked_or_implied_consent, undefined);
  } finally {
    if (previousAppUrl === undefined) {
      delete process.env.NEXT_PUBLIC_APP_URL;
    } else {
      process.env.NEXT_PUBLIC_APP_URL = previousAppUrl;
    }
    await rm(outDir, { recursive: true, force: true });
  }
});

test("materializeLocalV2DagScanDetail carries all gstatic matched hosts for inventory grouping", async () => {
  const { materializeLocalV2DagScanDetail } = await loadLocalV2DagReport();
  const previousAppUrl = process.env.NEXT_PUBLIC_APP_URL;
  const outDir = await mkdtemp(path.join(process.cwd(), "artifacts/local-v2-dag-scans/gstatic-hosts-"));
  try {
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
    await mkdir(outDir, { recursive: true });
    await writeFile(path.join(outDir, "CanonicalEvidenceBundle.json"), `${JSON.stringify({
      completedAt: "2026-06-17T13:14:02.000Z",
      cookieEvents: [],
      derivedRuntimeSignals: {
        consentBannerLikelyPresent: false,
        preConsentTrackingObserved: true
      },
      iframeEvents: [],
      modulesRun: [
        {
          completedAt: "2026-06-17T13:14:02.000Z",
          durationMs: 12000,
          errors: [],
          evidenceRefs: [],
          moduleName: "preConsentRuntimeScanner",
          startedAt: "2026-06-17T13:13:50.000Z",
          status: "completed",
          timingBreakdown: []
        }
      ],
      networkEvents: [
        {
          consentStateAtTime: "pre_consent",
          eventId: "net_t0",
          eventType: "network_request",
          evidenceRefs: [],
          hostname: "t0.gstatic.com",
          requestUrl: "https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&url=http://caltech.edu&size=64",
          sourceScanner: "pre_consent_runtime",
          thirdParty: true,
          timestampMs: 1184,
          url: "https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&url=http://caltech.edu&size=64"
        },
        {
          consentStateAtTime: "pre_consent",
          eventId: "net_t1",
          eventType: "network_request",
          evidenceRefs: [],
          hostname: "t1.gstatic.com",
          requestUrl: "https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&url=http://nbcnews.com&size=64",
          sourceScanner: "pre_consent_runtime",
          thirdParty: true,
          timestampMs: 1220,
          url: "https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&url=http://nbcnews.com&size=64"
        }
      ],
      normalizedUrl: "https://example.test/",
      normalizedVendorObservations: [
        {
          confidence: 0.9,
          entity: "Google LLC",
          matchedEvidenceRefs: [
            { eventId: "net_t0", eventType: "network_request", label: "t0.gstatic.com", refId: "ref_net_t0" },
            { eventId: "net_t1", eventType: "network_request", label: "t1.gstatic.com", refId: "ref_net_t1" }
          ],
          matchedHostnames: ["t0.gstatic.com", "t1.gstatic.com"],
          observationId: "vendor_google_static",
          product: "Google Static Assets",
          purpose: "infrastructure",
          regulatoryRelevance: ["cdn", "embedded_content", "static_assets", "third_party_runtime"],
          vendor: "Google"
        }
      ],
      observedJourneys: [
        {
          confidence: 0.52,
          displayName: "t0.gstatic.com",
          entryPoint: "https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&url=http://caltech.edu&size=64",
          evidenceRefs: [
            {
              eventId: "net_t0",
              eventType: "network_request",
              label: "https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&url=http://caltech.edu&size=64",
              refId: "ref_net_t0",
              url: "https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&url=http://caltech.edu&size=64"
            }
          ],
          firstObservedAtMs: 1184,
          journeyType: "endpoint",
          key: "endpoint:t0.gstatic.com"
        },
        {
          confidence: 0.52,
          displayName: "t1.gstatic.com",
          entryPoint: "https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&url=http://nbcnews.com&size=64",
          evidenceRefs: [
            {
              eventId: "net_t1",
              eventType: "network_request",
              label: "https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&url=http://nbcnews.com&size=64",
              refId: "ref_net_t1",
              url: "https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&url=http://nbcnews.com&size=64"
            }
          ],
          firstObservedAtMs: 1220,
          journeyType: "endpoint",
          key: "endpoint:t1.gstatic.com"
        }
      ],
      policySurfaceObservations: [],
      runtimeTimeline: [],
      scanId: "gstatic-hosts-fixture",
      schemaVersion: "certscore.v2.canonical-evidence-bundle.v1",
      startedAt: "2026-06-17T13:13:50.000Z",
      url: "https://example.test/"
    }, null, 2)}\n`, "utf8");

    const detail = await materializeLocalV2DagScanDetail(makeScanRecord({
      scan: {
        ...makeScanRecord().scan,
        domainHostname: "example.test",
        scanConfigJson: {
          hostname: "example.test",
          normalizedUrl: "https://example.test/",
          processor: LOCAL_V2_DAG_SCAN_PROCESSOR,
          execution: {
            localV2Dag: { outDir },
            v2DagParallel: {
              artifactOnly: true,
              localOnly: true,
              profile: "standard",
              productionFindingIntegration: false
            }
          }
        }
      }
    }));

    const googleStatic = detail.trackerVendors.find((vendor) => vendor.vendorName === "Google Static Assets");
    assert.ok(googleStatic);
    assert.equal(googleStatic.vendorCategory, "infrastructure");
    assert.equal(
      (googleStatic as unknown as Record<string, unknown>).vendorDisplayCategory,
      "CDN"
    );
    assert.deepEqual(
      ((googleStatic as unknown as Record<string, unknown>).matchedHostnames as string[]).sort(),
      ["t0.gstatic.com", "t1.gstatic.com"]
    );
  } finally {
    if (previousAppUrl === undefined) {
      delete process.env.NEXT_PUBLIC_APP_URL;
    } else {
      process.env.NEXT_PUBLIC_APP_URL = previousAppUrl;
    }
    await rm(outDir, { recursive: true, force: true });
  }
});

test("materializeLocalV2DagScanDetail derives visual evidence key from Lambda artifact URI", async () => {
  const { materializeLocalV2DagScanDetail } = await loadLocalV2DagReport();
  const previousAppUrl = process.env.NEXT_PUBLIC_APP_URL;
  const outDir = await mkdtemp(path.join(process.cwd(), "artifacts/local-v2-dag-scans/visual-evidence-"));
  try {
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
    await mkdir(outDir, { recursive: true });
    await writeFile(path.join(outDir, "CanonicalEvidenceBundle.json"), `${JSON.stringify({
      completedAt: "2026-06-17T13:14:02.000Z",
      cookieEvents: [],
      modulesRun: [],
      networkEvents: [],
      normalizedUrl: "https://example.test/",
      policySurfaceObservations: [],
      runtimeTimeline: [],
      scanId: "visual-evidence-fixture",
      schemaVersion: "certscore.v2.canonical-evidence-bundle.v1",
      screenshots: [
        {
          artifactId: "screenshot_pre_consent_full_page",
          capturedAtMs: 1400,
          captureMethod: "primary_full_page",
          consentStateAtTime: "pre_consent",
          pagePhase: "network_idle",
          path: "/tmp/certscore-v2/visual-evidence-fixture/screenshot-pre-consent-full-page.jpg",
          url: "https://example.test/"
        },
        {
          artifactId: "screenshot_pre_consent",
          capturedAtMs: 1200,
          captureMethod: "primary_viewport_fallback",
          consentStateAtTime: "pre_consent",
          pagePhase: "network_idle",
          path: "/tmp/certscore-v2/visual-evidence-fixture/screenshot-pre-consent.png",
          url: "https://example.test/"
        }
      ],
      startedAt: "2026-06-17T13:13:50.000Z",
      url: "https://example.test/"
    }, null, 2)}\n`, "utf8");

    const detail = await materializeLocalV2DagScanDetail(makeScanRecord({
      events: [
        {
          createdAt: "2026-06-17T13:14:02.000Z",
          eventType: "v2_lambda_result.received",
          id: "event-visual-1",
          message: "Local v2 DAG Lambda returned a completed artifact-only result.",
          metadataJson: {
            artifactOnly: true,
            artifactPointers: {
              scanArtifactUri: "s3://ws01-scan-artifacts-199536052647-us-west-1/v2-dag-lambda/local/visual-evidence-fixture/CanonicalEvidenceBundle.json"
            },
            processor: LOCAL_V2_DAG_SCAN_PROCESSOR,
            productionFindingIntegration: false
          }
        }
      ],
      scan: {
        ...makeScanRecord().scan,
        id: "5e7bcbc6-aa9f-41de-80da-a04335cc2b6a",
        scanConfigJson: {
          hostname: "example.test",
          normalizedUrl: "https://example.test/",
          processor: LOCAL_V2_DAG_SCAN_PROCESSOR,
          execution: {
            localV2Dag: { outDir },
            v2DagParallel: {
              artifactOnly: true,
              localOnly: true,
              profile: "standard",
              productionFindingIntegration: false
            }
          }
        }
      }
    }));

    const visualArtifacts = detail.runtimeArtifacts?.visual_evidence_artifacts as Array<Record<string, unknown>> | undefined;
    assert.equal(visualArtifacts?.[0]?.bucket, "ws01-scan-artifacts-199536052647-us-west-1");
    assert.equal(visualArtifacts?.[0]?.id, "local_v2:screenshot_pre_consent_full_page");
    assert.equal(visualArtifacts?.[0]?.capture_method, "primary_full_page");
    assert.equal(
      visualArtifacts?.[0]?.key,
      "v2-dag-lambda/local/visual-evidence-fixture/auxiliary/screenshot-pre-consent-full-page.jpg"
    );
    assert.equal(
      visualArtifacts?.[1]?.key,
      "v2-dag-lambda/local/visual-evidence-fixture/auxiliary/screenshot-pre-consent.png"
    );
  } finally {
    if (previousAppUrl === undefined) {
      delete process.env.NEXT_PUBLIC_APP_URL;
    } else {
      process.env.NEXT_PUBLIC_APP_URL = previousAppUrl;
    }
    await rm(outDir, { recursive: true, force: true });
  }
});

test("materializeLocalV2DagScanDetail prefers pre-consent geometry proof screenshots for visual evidence", async () => {
  const { materializeLocalV2DagScanDetail } = await loadLocalV2DagReport();
  const previousAppUrl = process.env.NEXT_PUBLIC_APP_URL;
  const outDir = await mkdtemp(path.join(process.cwd(), "artifacts/local-v2-dag-scans/visual-geometry-proof-"));
  try {
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
    await mkdir(outDir, { recursive: true });
    await writeFile(path.join(outDir, "CanonicalEvidenceBundle.json"), `${JSON.stringify({
      completedAt: "2026-06-29T13:43:12.000Z",
      consentUiObservations: [
        {
          observationId: "consent_ui_pre_consent",
          likelyPresent: false,
          basis: ["bounded_capture_timeout_or_failure"],
          inventoryDiagnostics: {
            rejectionReasons: ["timing_expired_before_controls_surfaced"]
          }
        }
      ],
      cookieEvents: [],
      modulesRun: [],
      networkEvents: [],
      normalizedUrl: "https://example.test/",
      policySurfaceObservations: [],
      runtimeTimeline: [],
      scanId: "visual-geometry-proof-fixture",
      schemaVersion: "certscore.v2.canonical-evidence-bundle.v1",
      screenshots: [
        {
          artifactId: "screenshot_pre_consent",
          capturedAtMs: 8402,
          captureMethod: "primary_viewport_fallback",
          consentStateAtTime: "pre_consent",
          pagePhase: "dom_content_loaded",
          path: "/tmp/certscore-v2/visual-geometry-proof-fixture/screenshot-pre-consent.png",
          url: "https://example.test/"
        },
        {
          artifactId: "screenshot_pre_consent_geometry_proof",
          capturedAtMs: 32005,
          captureMethod: "primary_viewport_fallback",
          consentStateAtTime: "pre_consent",
          pagePhase: "network_idle",
          path: "/tmp/certscore-v2/visual-geometry-proof-fixture/screenshot-pre-consent-geometry-proof.png",
          url: "https://example.test/"
        }
      ],
      startedAt: "2026-06-29T13:42:39.000Z",
      url: "https://example.test/"
    }, null, 2)}\n`, "utf8");
    await writeFile(path.join(outDir, "ConsentControlGeometryEvidence.json"), `${JSON.stringify({
      artifactVersion: "consent_control_geometry.v1",
      candidates: [
        {
          actionType: "reject_all",
          boundingBox: { x: 780, y: 201, width: 166, height: 22, top: 201, right: 946, bottom: 223, left: 780 },
          decisionStatus: "confirmed_visible",
          enabled: true,
          intersectsViewport: true,
          label: "Continue without accepting",
          layer: "first_layer",
          selectorHint: "button.continue-without-accepting",
          tagName: "button"
        },
        {
          actionType: "other",
          boundingBox: { x: 419, y: 631, width: 256, height: 44, top: 631, right: 675, bottom: 675, left: 419 },
          decisionStatus: "ambiguous",
          enabled: true,
          intersectsViewport: true,
          label: "Set up the collection of your data",
          layer: "first_layer",
          selectorHint: "button.setup",
          tagName: "button"
        },
        {
          actionType: "accept_all",
          boundingBox: { x: 691, y: 631, width: 256, height: 44, top: 631, right: 947, bottom: 675, left: 691 },
          decisionStatus: "confirmed_visible",
          enabled: true,
          intersectsViewport: true,
          label: "Accept all the collection of your data",
          layer: "first_layer",
          selectorHint: "button.accept-all",
          tagName: "button"
        },
        {
          actionType: "reject_all",
          boundingBox: { x: 419, y: 691, width: 528, height: 16, top: 691, right: 947, bottom: 707, left: 419 },
          decisionStatus: "confirmed_visible",
          enabled: true,
          intersectsViewport: true,
          label: "Refuse all the collection of your data",
          layer: "first_layer",
          selectorHint: "button.refuse-all",
          tagName: "button"
        }
      ],
      cmp: { detected: true, name: "Consentmanager", confidence: 0.89, reasonCodes: [], matchedSignals: [], detections: [] },
      containers: [
        {
          layer: "first_layer",
          textExcerpt: "We and our partners use cookies and process personal data for advertising purposes. Set up. Accept all. Refuse all."
        }
      ],
      pageUrl: "https://example.test/",
      sourceScanner: "consent_control_geometry_diagnostic",
      summary: {
        cmpDetected: true,
        cmpName: "Consentmanager",
        confidence: 0.89,
        firstLayerAccept: true,
        firstLayerOptions: false,
        firstLayerReject: true,
        limitations: []
      }
    }, null, 2)}\n`, "utf8");

    const detail = await materializeLocalV2DagScanDetail(makeScanRecord({
      events: [
        {
          createdAt: "2026-06-29T13:43:12.000Z",
          eventType: "v2_lambda_result.received",
          id: "event-visual-proof-1",
          message: "Local v2 DAG Lambda returned a completed artifact-only result.",
          metadataJson: {
            artifactOnly: true,
            artifactPointers: {
              scanArtifactUri: "s3://certscore-v2-dag-local-artifacts-eu-west-1-199536052647/v2-dag-lambda/local/visual-geometry-proof-fixture/CanonicalEvidenceBundle.json"
            },
            processor: LOCAL_V2_DAG_SCAN_PROCESSOR,
            productionFindingIntegration: false
          }
        }
      ],
      scan: {
        ...makeScanRecord().scan,
        id: "39567926-04da-4596-a44e-a48d9a8091a3",
        scanConfigJson: {
          hostname: "example.test",
          normalizedUrl: "https://example.test/",
          processor: LOCAL_V2_DAG_SCAN_PROCESSOR,
          execution: {
            localV2Dag: { outDir },
            v2DagParallel: {
              artifactOnly: true,
              localOnly: true,
              profile: "standard",
              productionFindingIntegration: false
            }
          }
        }
      }
    }));

    const visualArtifacts = detail.runtimeArtifacts?.visual_evidence_artifacts as Array<Record<string, unknown>> | undefined;
    assert.equal(visualArtifacts?.[0]?.id, "local_v2:screenshot_pre_consent_geometry_proof");
    assert.equal(visualArtifacts?.[0]?.capture_method, "primary_viewport_fallback");
    assert.equal(
      visualArtifacts?.[0]?.key,
      "v2-dag-lambda/local/visual-geometry-proof-fixture/auxiliary/screenshot-pre-consent-geometry-proof.png"
    );
    assert.equal(visualArtifacts?.[1]?.id, "local_v2:screenshot_pre_consent");
    const firstLayerChoices = detail.runtimeArtifacts?.firstLayerConsentChoices as Record<string, unknown> | undefined;
    assert.equal(detail.runtimeArtifacts?.cmpFrameworkSignalObserved, true);
    assert.equal(detail.runtimeArtifacts?.cmp_vendor_name, "Consentmanager");
    assert.equal(firstLayerChoices?.acceptControlObserved, true);
    assert.equal(firstLayerChoices?.rejectControlObserved, true);
    assert.equal(firstLayerChoices?.managePreferencesControlObserved, true);
    assert.deepEqual(firstLayerChoices?.preferenceLabels, ["Set up the collection of your data"]);
  } finally {
    if (previousAppUrl === undefined) {
      delete process.env.NEXT_PUBLIC_APP_URL;
    } else {
      process.env.NEXT_PUBLIC_APP_URL = previousAppUrl;
    }
    await rm(outDir, { recursive: true, force: true });
  }
});

test("materializeLocalV2DagScanDetail reclassifies retained Polish consent geometry controls", async () => {
  const { materializeLocalV2DagScanDetail } = await loadLocalV2DagReport();
  const previousAppUrl = process.env.NEXT_PUBLIC_APP_URL;
  const outDir = await mkdtemp(path.join(process.cwd(), "artifacts/local-v2-dag-scans/polish-geometry-controls-"));
  try {
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
    await mkdir(outDir, { recursive: true });
    await writeFile(path.join(outDir, "CanonicalEvidenceBundle.json"), `${JSON.stringify({
      completedAt: "2026-07-04T15:27:12.000Z",
      consentUiObservations: [
        {
          acceptControlObserved: false,
          basis: ["insufficient_banner_keywords", "recapture:post_cmp_no_first_layer_choice_controls"],
          confidence: 0.5,
          controls: [],
          inventoryDiagnostics: {
            candidateContainerCount: 1,
            candidateControlCount: 2,
            candidateLabels: [
              "USTAWIENIA ZAAWANSOWANE, otwiera okno dialogowe centrum preferencji",
              "AKCEPTUJĘ"
            ],
            rejectionReasons: ["classifier_other_unknown"],
            retainedControlCount: 0,
            timingMarkers: ["post_wait_inventory"]
          },
          layerInspected: "unknown",
          likelyPresent: false,
          managePreferencesControlObserved: false,
          observationId: "consent_ui_pre_consent",
          rejectControlObserved: false,
          textExcerpt: "Dbamy o Twoją prywatność. Jeśli wyrazisz zgodę klikając Akceptuję, będziemy przetwarzać dane osobowe i pliki cookie. Jeśli nie chcesz wyrazić zgody, przejdź do Ustawień Zaawansowanych.",
          visibleChoiceLabels: []
        }
      ],
      cookieEvents: [],
      derivedRuntimeSignals: {
        consentBannerLikelyPresent: true,
        journeySummary: { journeyCount: 0 },
        preConsentTrackingObserved: false,
        sessionReplayOrBehavioralAnalyticsObserved: false,
        thirdPartyCookiesPreConsentObserved: false,
        thirdPartyVendorsObserved: false
      },
      modulesRun: [],
      networkEvents: [],
      normalizedUrl: "https://wyborcza.pl/",
      policySurfaceObservations: [],
      runtimeTimeline: [],
      scanId: "polish-geometry-controls-fixture",
      schemaVersion: "certscore.v2.canonical-evidence-bundle.v1",
      screenshots: [],
      startedAt: "2026-07-04T15:26:23.000Z",
      url: "https://wyborcza.pl/"
    }, null, 2)}\n`, "utf8");
    await writeFile(path.join(outDir, "ConsentControlGeometryEvidence.json"), `${JSON.stringify({
      artifactVersion: "consent_control_geometry.v1",
      candidates: [
        {
          actionType: "other",
          boundingBox: { x: 303, y: 520, width: 262, height: 40, top: 520, right: 565, bottom: 560, left: 303 },
          classifierReasonCodes: ["no_term_match"],
          decisionStatus: "clipped",
          enabled: true,
          intersectsViewport: true,
          label: "USTAWIENIA ZAAWANSOWANE, otwiera okno dialogowe centrum preferencji",
          reasons: ["clipped_by_scrollable_ancestor"],
          layer: "first_layer",
          role: null,
          tagName: "button"
        },
        {
          actionType: "other",
          boundingBox: { x: 928, y: 520, width: 135, height: 40, top: 520, right: 1063, bottom: 560, left: 928 },
          classifierReasonCodes: ["no_term_match"],
          decisionStatus: "clipped",
          enabled: true,
          intersectsViewport: true,
          label: "AKCEPTUJĘ",
          reasons: ["clipped_by_scrollable_ancestor"],
          layer: "first_layer",
          role: null,
          tagName: "button"
        },
        {
          actionType: "other",
          boundingBox: { x: 303, y: 520, width: 760, height: 56, top: 520, right: 1063, bottom: 576, left: 303 },
          classifierReasonCodes: ["no_term_match"],
          decisionStatus: "ambiguous",
          enabled: true,
          intersectsViewport: true,
          label: "USTAWIENIA ZAAWANSOWANEAKCEPTUJĘ",
          layer: "first_layer",
          role: null,
          tagName: "div"
        }
      ],
      containers: [
        {
          boundingBox: { x: 283, y: 90, width: 800, height: 486, top: 90, right: 1083, bottom: 576, left: 283 },
          layer: "first_layer",
          textExcerpt: "Dbamy o Twoją prywatność. Jeśli wyrazisz zgodę klikając Akceptuję, będziemy przetwarzać dane osobowe i pliki cookie. Ustawienia Zaawansowane."
        }
      ],
      pageUrl: "https://wyborcza.pl/",
      sourceScanner: "consent_control_geometry_diagnostic",
      summary: {
        cmpDetected: true,
        cmpName: "Consentmanager",
        confidence: 0.65,
        firstLayerAccept: false,
        firstLayerOptions: false,
        firstLayerReject: false,
        limitations: []
      }
    }, null, 2)}\n`, "utf8");

    const detail = await materializeLocalV2DagScanDetail(makeScanRecord({
      scan: {
        ...makeScanRecord().scan,
        id: "47a164c3-957b-4e91-9153-ff63822f35be",
        domainHostname: "wyborcza.pl",
        scanConfigJson: {
          hostname: "wyborcza.pl",
          normalizedUrl: "https://wyborcza.pl/",
          processor: LOCAL_V2_DAG_SCAN_PROCESSOR,
          execution: {
            localV2Dag: { outDir },
            v2DagParallel: {
              artifactOnly: true,
              localOnly: true,
              profile: "standard",
              productionFindingIntegration: false
            }
          }
        }
      }
    }));

    const firstLayerChoices = detail.runtimeArtifacts?.firstLayerConsentChoices as Record<string, unknown> | undefined;
    assert.equal(firstLayerChoices?.acceptControlObserved, true);
    assert.equal(firstLayerChoices?.managePreferencesControlObserved, true);
    assert.equal(firstLayerChoices?.rejectControlObserved, false);
    assert.deepEqual(firstLayerChoices?.visibleChoiceLabels, [
      "USTAWIENIA ZAAWANSOWANE, otwiera okno dialogowe centrum preferencji",
      "AKCEPTUJĘ"
    ]);
    assert.deepEqual(firstLayerChoices?.acceptLabels, ["AKCEPTUJĘ"]);
    assert.deepEqual(firstLayerChoices?.preferenceLabels, [
      "USTAWIENIA ZAAWANSOWANE, otwiera okno dialogowe centrum preferencji"
    ]);
  } finally {
    if (previousAppUrl === undefined) {
      delete process.env.NEXT_PUBLIC_APP_URL;
    } else {
      process.env.NEXT_PUBLIC_APP_URL = previousAppUrl;
    }
    await rm(outDir, { recursive: true, force: true });
  }
});

test("materializeLocalV2DagScanDetail does not recover clipped controls when confirmed geometry controls exist", async () => {
  const { materializeLocalV2DagScanDetail } = await loadLocalV2DagReport();
  const previousAppUrl = process.env.NEXT_PUBLIC_APP_URL;
  const outDir = await mkdtemp(path.join(process.cwd(), "artifacts/local-v2-dag-scans/clipped-geometry-guard-"));
  try {
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
    await mkdir(outDir, { recursive: true });
    await writeFile(path.join(outDir, "CanonicalEvidenceBundle.json"), `${JSON.stringify({
      completedAt: "2026-07-04T15:27:12.000Z",
      consentUiObservations: [],
      cookieEvents: [],
      derivedRuntimeSignals: {
        consentBannerLikelyPresent: true,
        journeySummary: { journeyCount: 0 },
        preConsentTrackingObserved: false,
        sessionReplayOrBehavioralAnalyticsObserved: false,
        thirdPartyCookiesPreConsentObserved: false,
        thirdPartyVendorsObserved: false
      },
      modulesRun: [],
      networkEvents: [],
      normalizedUrl: "https://example.test/",
      policySurfaceObservations: [],
      runtimeTimeline: [],
      scanId: "clipped-geometry-guard-fixture",
      schemaVersion: "certscore.v2.canonical-evidence-bundle.v1",
      screenshots: [],
      startedAt: "2026-07-04T15:26:23.000Z",
      url: "https://example.test/"
    }, null, 2)}\n`, "utf8");
    await writeFile(path.join(outDir, "ConsentControlGeometryEvidence.json"), `${JSON.stringify({
      artifactVersion: "consent_control_geometry.v1",
      candidates: [
        {
          actionType: "manage_preferences",
          boundingBox: { x: 120, y: 560, width: 240, height: 38, top: 560, right: 360, bottom: 598, left: 120 },
          decisionStatus: "clipped",
          enabled: true,
          intersectsViewport: true,
          label: "Cookie settings",
          layer: "first_layer",
          reasons: ["clipped_by_scrollable_ancestor"],
          role: null,
          tagName: "button"
        },
        {
          actionType: "reject_all",
          boundingBox: { x: 380, y: 620, width: 160, height: 40, top: 620, right: 540, bottom: 660, left: 380 },
          decisionStatus: "confirmed_visible",
          enabled: true,
          intersectsViewport: true,
          label: "Reject all",
          layer: "first_layer",
          role: null,
          tagName: "button"
        },
        {
          actionType: "accept_all",
          boundingBox: { x: 560, y: 620, width: 160, height: 40, top: 620, right: 720, bottom: 660, left: 560 },
          decisionStatus: "confirmed_visible",
          enabled: true,
          intersectsViewport: true,
          label: "Accept all",
          layer: "first_layer",
          role: null,
          tagName: "button"
        }
      ],
      containers: [
        {
          boundingBox: { x: 80, y: 80, width: 720, height: 640, top: 80, right: 800, bottom: 720, left: 80 },
          layer: "first_layer",
          textExcerpt: "We use cookies for analytics and advertising. Cookie settings."
        }
      ],
      pageUrl: "https://example.test/",
      sourceScanner: "consent_control_geometry_diagnostic",
      summary: {
        cmpDetected: true,
        cmpName: "Example CMP",
        confidence: 0.65,
        firstLayerAccept: true,
        firstLayerOptions: false,
        firstLayerReject: true,
        limitations: ["manage_preferences:Cookie settings:clipped"]
      }
    }, null, 2)}\n`, "utf8");

    const detail = await materializeLocalV2DagScanDetail(makeScanRecord({
      scan: {
        ...makeScanRecord().scan,
        id: "clipped-geometry-guard-fixture",
        domainHostname: "example.test",
        scanConfigJson: {
          hostname: "example.test",
          normalizedUrl: "https://example.test/",
          processor: LOCAL_V2_DAG_SCAN_PROCESSOR,
          execution: {
            localV2Dag: { outDir },
            v2DagParallel: {
              artifactOnly: true,
              localOnly: true,
              profile: "standard",
              productionFindingIntegration: false
            }
          }
        }
      }
    }));

    const firstLayerChoices = detail.runtimeArtifacts?.firstLayerConsentChoices as Record<string, unknown> | undefined;
    assert.equal(firstLayerChoices?.acceptControlObserved, true);
    assert.equal(firstLayerChoices?.rejectControlObserved, true);
    assert.equal(firstLayerChoices?.managePreferencesControlObserved, false);
    assert.deepEqual(firstLayerChoices?.visibleChoiceLabels, ["Reject all", "Accept all"]);
  } finally {
    if (previousAppUrl === undefined) {
      delete process.env.NEXT_PUBLIC_APP_URL;
    } else {
      process.env.NEXT_PUBLIC_APP_URL = previousAppUrl;
    }
    await rm(outDir, { recursive: true, force: true });
  }
});

test("materializeLocalV2DagScanDetail does not count reject-and-subscribe geometry labels as reject availability", async () => {
  const { materializeLocalV2DagScanDetail } = await loadLocalV2DagReport();
  const previousAppUrl = process.env.NEXT_PUBLIC_APP_URL;
  const outDir = await mkdtemp(path.join(process.cwd(), "artifacts/local-v2-dag-scans/consent-reject-subscribe-"));
  try {
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
    await mkdir(outDir, { recursive: true });
    await writeFile(path.join(outDir, "CanonicalEvidenceBundle.json"), `${JSON.stringify({
      completedAt: "2026-06-29T13:42:59.000Z",
      consentUiObservations: [],
      cookieEvents: [],
      derivedRuntimeSignals: {
        consentBannerLikelyPresent: true,
        journeySummary: { journeyCount: 0 },
        preConsentTrackingObserved: false,
        sessionReplayOrBehavioralAnalyticsObserved: false,
        thirdPartyCookiesPreConsentObserved: false,
        thirdPartyVendorsObserved: false
      },
      modulesRun: [],
      networkEvents: [],
      normalizedUrl: "https://example.test/",
      policySurfaceObservations: [],
      runtimeTimeline: [],
      scanId: "consent-reject-subscribe-fixture",
      schemaVersion: "certscore.v2.canonical-evidence-bundle.v1",
      screenshots: [],
      startedAt: "2026-06-29T13:42:39.000Z",
      url: "https://example.test/"
    }, null, 2)}\n`, "utf8");
    await writeFile(path.join(outDir, "ConsentControlGeometryEvidence.json"), `${JSON.stringify({
      artifactVersion: "consent_control_geometry.v1",
      candidates: [
        {
          actionType: "accept_all",
          boundingBox: { x: 691, y: 631, width: 256, height: 44, top: 631, right: 947, bottom: 675, left: 691 },
          decisionStatus: "confirmed_visible",
          enabled: true,
          intersectsViewport: true,
          label: "Accept all",
          layer: "first_layer",
          selectorHint: "button.accept-all",
          tagName: "button"
        },
        {
          actionType: "manage_preferences",
          boundingBox: { x: 419, y: 631, width: 256, height: 44, top: 631, right: 675, bottom: 675, left: 419 },
          decisionStatus: "confirmed_visible",
          enabled: true,
          intersectsViewport: true,
          label: "Cookie settings",
          layer: "first_layer",
          selectorHint: "button.settings",
          tagName: "button"
        },
        {
          actionType: "reject_all",
          boundingBox: { x: 419, y: 691, width: 528, height: 44, top: 691, right: 947, bottom: 735, left: 419 },
          decisionStatus: "confirmed_visible",
          enabled: true,
          intersectsViewport: true,
          label: "Reject all and subscribe",
          layer: "first_layer",
          selectorHint: "button.reject-subscribe",
          tagName: "button"
        }
      ],
      cmp: { detected: true, name: "Consentmanager", confidence: 0.89, reasonCodes: [], matchedSignals: [], detections: [] },
      containers: [
        {
          layer: "first_layer",
          textExcerpt: "We use cookies and process personal data for advertising purposes. Cookie settings. Accept all. Reject all and subscribe."
        }
      ],
      pageUrl: "https://example.test/",
      sourceScanner: "consent_control_geometry_diagnostic",
      summary: {
        cmpDetected: true,
        cmpName: "Consentmanager",
        confidence: 0.89,
        firstLayerAccept: true,
        firstLayerOptions: true,
        firstLayerReject: false,
        limitations: []
      }
    }, null, 2)}\n`, "utf8");

    const detail = await materializeLocalV2DagScanDetail(makeScanRecord({
      scan: {
        ...makeScanRecord().scan,
        id: "2b56a6bc-ef9a-4b42-98af-56f1a395b612",
        scanConfigJson: {
          hostname: "example.test",
          normalizedUrl: "https://example.test/",
          processor: LOCAL_V2_DAG_SCAN_PROCESSOR,
          execution: {
            localV2Dag: { outDir },
            v2DagParallel: {
              artifactOnly: true,
              localOnly: true,
              profile: "standard",
              productionFindingIntegration: false
            }
          }
        }
      }
    }));

    const firstLayerChoices = detail.runtimeArtifacts?.firstLayerConsentChoices as Record<string, unknown> | undefined;
    const rejectPath = detail.runtimeArtifacts?.rejectPathDepthAndAvailability as Record<string, unknown> | undefined;
    assert.equal(firstLayerChoices?.acceptControlObserved, true);
    assert.equal(firstLayerChoices?.managePreferencesControlObserved, true);
    assert.equal(firstLayerChoices?.rejectControlObserved, false);
    assert.deepEqual(firstLayerChoices?.rejectLabels, []);
    assert.equal(
      (firstLayerChoices?.visibleChoiceLabels as string[] | undefined)?.some((label) => /subscribe/i.test(label)),
      false,
    );
    assert.equal(rejectPath?.rejectControlObserved, false);
    assert.equal(rejectPath?.rejectAvailableOnFirstLayer, false);
  } finally {
    if (previousAppUrl === undefined) {
      delete process.env.NEXT_PUBLIC_APP_URL;
    } else {
      process.env.NEXT_PUBLIC_APP_URL = previousAppUrl;
    }
    await rm(outDir, { recursive: true, force: true });
  }
});

test("materializeLocalV2DagScanDetail retains BILD-style German consent controls without treating paid no-tracking CTA as reject", async () => {
  const { materializeLocalV2DagScanDetail } = await loadLocalV2DagReport();
  const previousAppUrl = process.env.NEXT_PUBLIC_APP_URL;
  const outDir = await mkdtemp(path.join(process.cwd(), "artifacts/local-v2-dag-scans/consent-bild-geometry-"));
  try {
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
    await mkdir(outDir, { recursive: true });
    await writeFile(path.join(outDir, "CanonicalEvidenceBundle.json"), `${JSON.stringify({
      completedAt: "2026-07-04T13:42:59.000Z",
      cmpRuntimeObservations: [],
      consentUiObservations: [],
      cookieEvents: [],
      derivedRuntimeSignals: {
        consentBannerLikelyPresent: true,
        journeySummary: { journeyCount: 0 },
        preConsentTrackingObserved: false,
        sessionReplayOrBehavioralAnalyticsObserved: false,
        thirdPartyCookiesPreConsentObserved: false,
        thirdPartyVendorsObserved: false
      },
      modulesRun: [],
      networkEvents: [],
      normalizedUrl: "https://www.bild.de/",
      policySurfaceObservations: [],
      runtimeTimeline: [],
      scanId: "consent-bild-geometry-fixture",
      schemaVersion: "certscore.v2.canonical-evidence-bundle.v1",
      screenshots: [],
      startedAt: "2026-07-04T13:42:39.000Z",
      url: "https://www.bild.de/"
    }, null, 2)}\n`, "utf8");
    await writeFile(path.join(outDir, "ConsentControlGeometryEvidence.json"), `${JSON.stringify({
      artifactVersion: "consent_control_geometry.v1",
      candidates: [
        {
          actionType: "accept_all",
          ariaLabel: "Alle akzeptieren",
          boundingBox: { x: 322.5, y: 267.45, width: 347.5, height: 40, top: 267.45, right: 670, bottom: 307.45, left: 322.5 },
          decisionStatus: "confirmed_visible",
          enabled: true,
          intersectsViewport: true,
          label: "Alle akzeptieren",
          layer: "first_layer",
          selectorHint: "button[aria-label=\"Alle akzeptieren\"]",
          tagName: "button",
          title: "Alle akzeptieren"
        },
        {
          actionType: "manage_preferences",
          ariaLabel: "Einstellungen",
          boundingBox: { x: 322.5, y: 323.45, width: 347.5, height: 40, top: 323.45, right: 670, bottom: 363.45, left: 322.5 },
          decisionStatus: "confirmed_visible",
          enabled: true,
          intersectsViewport: true,
          label: "Einstellungen",
          layer: "first_layer",
          selectorHint: "button[aria-label=\"Einstellungen\"]",
          tagName: "button",
          title: "Einstellungen"
        },
        {
          actionType: "other",
          ariaLabel: "Jetzt BILD PUR abonnieren",
          boundingBox: { x: 690, y: 280, width: 347.5, height: 40, top: 280, right: 1037.5, bottom: 320, left: 690 },
          decisionStatus: "ambiguous",
          enabled: true,
          intersectsViewport: true,
          label: "Jetzt BILD PUR abonnieren",
          layer: "first_layer",
          selectorHint: "button.pur-subscribe-cta",
          tagName: "button",
          title: "Jetzt BILD PUR abonnieren"
        }
      ],
      cmp: { detected: true, name: "Consentmanager", confidence: 0.95, reasonCodes: [], matchedSignals: [], detections: [] },
      containers: [
        {
          layer: "first_layer",
          textExcerpt: "Datenschutz und Nutzungserlebnis auf BILD.de. Mit Tracking und Cookies nutzen. Alle akzeptieren. Einstellungen. Ohne Tracking und Cookies nutzen für 3,99 EUR/Monat. Jetzt BILD PUR abonnieren."
        }
      ],
      pageUrl: "https://www.bild.de/",
      sourceScanner: "consent_control_geometry_diagnostic",
      summary: {
        cmpDetected: true,
        cmpName: "Consentmanager",
        confidence: 0.95,
        firstLayerAccept: true,
        firstLayerOptions: true,
        firstLayerReject: false,
        limitations: []
      }
    }, null, 2)}\n`, "utf8");

    const detail = await materializeLocalV2DagScanDetail(makeScanRecord({
      scan: {
        ...makeScanRecord().scan,
        id: "65420177-3b30-4456-96d0-360d4a2f9a1f",
        domainHostname: "bild.de",
        scanConfigJson: {
          hostname: "bild.de",
          normalizedUrl: "https://www.bild.de/",
          processor: LOCAL_V2_DAG_SCAN_PROCESSOR,
          execution: {
            localV2Dag: { outDir },
            v2DagParallel: {
              artifactOnly: true,
              localOnly: true,
              profile: "standard",
              productionFindingIntegration: false
            }
          }
        }
      }
    }));

    const firstLayerChoices = detail.runtimeArtifacts?.firstLayerConsentChoices as Record<string, unknown> | undefined;
    assert.equal(detail.runtimeArtifacts?.cmpFrameworkSignalObserved, true);
    assert.equal(detail.runtimeArtifacts?.cmp_vendor_name, "Consentmanager");
    assert.equal(firstLayerChoices?.acceptControlObserved, true);
    assert.deepEqual(firstLayerChoices?.acceptLabels, ["Alle akzeptieren"]);
    assert.equal(firstLayerChoices?.managePreferencesControlObserved, true);
    assert.deepEqual(firstLayerChoices?.preferenceLabels, ["Einstellungen"]);
    assert.equal(firstLayerChoices?.rejectControlObserved, false);
    assert.deepEqual(firstLayerChoices?.rejectLabels, []);
    assert.equal(
      (firstLayerChoices?.visibleChoiceLabels as string[] | undefined)?.some((label) => /BILD PUR|abonnieren/i.test(label)),
      false,
    );
  } finally {
    if (previousAppUrl === undefined) {
      delete process.env.NEXT_PUBLIC_APP_URL;
    } else {
      process.env.NEXT_PUBLIC_APP_URL = previousAppUrl;
    }
    await rm(outDir, { recursive: true, force: true });
  }
});

test("materializeLocalV2DagScanDetail promotes retained access-denied pages to scan no-go", async () => {
  const { materializeLocalV2DagScanDetail } = await loadLocalV2DagReport();
  const previousAppUrl = process.env.NEXT_PUBLIC_APP_URL;
  const outDir = await mkdtemp(path.join(process.cwd(), "artifacts/local-v2-dag-scans/no-go-access-denied-"));
  try {
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
    await mkdir(outDir, { recursive: true });
    await writeFile(path.join(outDir, "CanonicalEvidenceBundle.json"), `${JSON.stringify({
      completedAt: "2026-06-17T13:14:02.000Z",
      consentUiObservations: [
        {
          basis: ["dom_text_fallback_after_consent_ui_timeout"],
          confidence: 0.9,
          likelyPresent: false,
          observationId: "consent_ui_pre_consent",
          textExcerpt: "Access to this site has been denied.",
          visibleChoiceLabels: []
        }
      ],
      cookieEvents: [
        {
          consentStateAtTime: "pre_consent",
          domain: ".latimes.com",
          firstParty: true,
          httpOnly: true,
          name: "_abck",
          sameSite: "Lax",
          secure: true,
          timestampMs: 700,
          valueHash: "blocked-page-cookie"
        }
      ],
      modulesRun: [],
      networkEvents: [
        {
          consentStateAtTime: "pre_consent",
          hostname: "static.latimes.com",
          isThirdParty: false,
          thirdParty: false,
          timestampMs: 650,
          url: "https://static.latimes.com/error.css"
        },
        {
          consentStateAtTime: "pre_consent",
          hostname: "bot-manager.example",
          isThirdParty: true,
          thirdParty: true,
          timestampMs: 790,
          url: "https://bot-manager.example/fingerprint.js"
        },
        {
          consentStateAtTime: "pre_consent",
          hostname: "bot-manager.example",
          isThirdParty: true,
          thirdParty: true,
          timestampMs: 820,
          url: "https://bot-manager.example/collect"
        },
        {
          consentStateAtTime: "pre_consent",
          hostname: "static.latimes.com",
          isThirdParty: false,
          thirdParty: false,
          timestampMs: 940,
          url: "https://static.latimes.com/error.js"
        }
      ],
      normalizedVendorObservations: [
        {
          confidence: 0.92,
          evidenceRefs: [],
          observedEventIds: [],
          product: "Bot Manager",
          purposes: ["security"],
          vendor: "Example Bot Manager"
        }
      ],
      normalizedUrl: "https://www.latimes.com/",
      policySurfaceObservations: [],
      runtimeCoverage: {
        coverageStatus: "limited_none",
        fallbackModesUsed: ["dom_text_fallback_after_consent_ui_timeout"],
        limitationKeys: ["access_denied_page"],
        notes: ["Access denied page captured before consent/runtime evidence was retained."],
        observationCounts: {
          cookiesBeforeConsent: 1,
          normalizedVendors: 1,
          thirdPartyRequests: 2
        }
      },
      runtimeTimeline: [],
      scanId: "latimes-no-go-fixture",
      schemaVersion: "certscore.v2.canonical-evidence-bundle.v1",
      screenshots: [
        {
          artifactId: "screenshot_pre_consent",
          capturedAtMs: 1200,
          consentStateAtTime: "pre_consent",
          pagePhase: "network_idle",
          path: "/tmp/certscore-v2/latimes-no-go-fixture/screenshot-pre-consent.png",
          url: "https://www.latimes.com/"
        }
      ],
      startedAt: "2026-06-17T13:13:50.000Z",
      url: "https://latimes.com/"
    }, null, 2)}\n`, "utf8");

    const detail = await materializeLocalV2DagScanDetail(makeScanRecord({
      scan: {
        ...makeScanRecord().scan,
        domainHostname: "latimes.com",
        scanConfigJson: {
          hostname: "latimes.com",
          normalizedUrl: "https://latimes.com/",
          processor: LOCAL_V2_DAG_SCAN_PROCESSOR,
          execution: {
            localV2Dag: { outDir },
            v2DagParallel: {
              artifactOnly: true,
              localOnly: true,
              profile: "standard",
              productionFindingIntegration: false
            }
          }
        }
      }
    }));

    const scanNoGoAssessment = detail.runtimeArtifacts?.scan_no_go_assessment as Record<string, unknown> | undefined;
    const visualAccessReview = detail.runtimeArtifacts?.visual_access_review as Record<string, unknown> | undefined;

    assert.equal(scanNoGoAssessment?.decision, "no_go");
    assert.equal(scanNoGoAssessment?.scanNoGoConfidence, 0.95);
    assert.deepEqual(scanNoGoAssessment?.reasonCodes, ["access_denied_or_forbidden_page", "scan_no_go_corroborated"]);
    assert.equal(visualAccessReview?.go_no_go, "NO_GO");
    assert.equal(visualAccessReview?.page_state, "access_blocked");
    assert.equal(detail.snapshot?.homepage_fetch_status, "blocked");
    assert.equal(detail.snapshot?.blocked_flag, true);
    assert.equal(detail.snapshot?.coverage_level, "limited_none");
    assert.equal(detail.snapshot?.pages_scanned, 0);
    assert.equal(detail.snapshot?.runtime_counts_retained, false);
    assert.equal(detail.snapshot?.third_party_request_count, 0);
    assert.equal(detail.snapshot?.tracking_before_consent_detected, false);
    assert.equal(detail.runtimeArtifacts?.runtime_coverage_status, "limited_none");
    assert.equal(detail.runtimeArtifacts?.runtime_counts_retained, false);
    assert.equal(detail.scan.pagesScanned, 0);
    assert.equal(detail.signals.some((signal) => signal.key === "tracking_before_consent_detected"), false);
  } finally {
    if (previousAppUrl === undefined) {
      delete process.env.NEXT_PUBLIC_APP_URL;
    } else {
      process.env.NEXT_PUBLIC_APP_URL = previousAppUrl;
    }
    await rm(outDir, { recursive: true, force: true });
  }
});

test("materializeLocalV2DagScanDetail treats Vercel security checkpoint as scan-level no-go", async () => {
  const { materializeLocalV2DagScanDetail } = await loadLocalV2DagReport();
  const previousAppUrl = process.env.NEXT_PUBLIC_APP_URL;
  const outDir = await mkdtemp(path.join(process.cwd(), "artifacts/local-v2-dag-scans/vercel-checkpoint-no-go-"));
  try {
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
    await mkdir(outDir, { recursive: true });
    await writeFile(path.join(outDir, "screenshot-pre-consent.png"), syntheticPngHeader(1366, 900, 16_672));
    await writeFile(path.join(outDir, "CanonicalEvidenceBundle.json"), `${JSON.stringify({
      completedAt: "2026-06-23T14:59:04.472Z",
      consentUiObservations: [
        {
          acceptControlObserved: false,
          basis: [
            "bounded_capture_timeout_or_failure",
            "dom_text_fallback_after_consent_ui_timeout",
            "insufficient_banner_keywords"
          ],
          confidence: 0.5,
          controls: [],
          layerInspected: "unknown",
          likelyPresent: false,
          managePreferencesControlObserved: false,
          observationId: "consent_ui_pre_consent",
          observedAtMs: 44746,
          rejectControlObserved: false,
          textExcerpt:
            "Wir überprüfen Ihren Browser\n\nVercel Sicherheitskontrollpunkt\n\n|\n\nfra1::1782226738-6uaer6kpJr2r8BVOQq1yMdHRP0Z12W8K",
          visibleChoiceLabels: []
        }
      ],
      cookieEvents: [],
      modulesRun: [
        {
          completedAt: "2026-06-23T14:59:04.052Z",
          durationMs: 45809,
          errors: [],
          evidenceRefs: [],
          moduleName: "preConsentRuntimeScanner",
          startedAt: "2026-06-23T14:58:18.243Z",
          status: "completed"
        }
      ],
      networkEvents: [
        {
          consentStateAtTime: "pre_consent",
          eventId: "net_2",
          firstParty: true,
          hostname: "numastays.com",
          isThirdParty: false,
          requestUrl: "https://numastays.com/",
          resourceType: "document",
          thirdParty: false,
          timestampMs: 40569,
          url: "https://numastays.com/"
        },
        {
          consentStateAtTime: "pre_consent",
          eventId: "net_5",
          firstParty: true,
          hostname: "numastays.com",
          isThirdParty: false,
          requestUrl: "https://numastays.com/.well-known/vercel/security/static/challenge.v2.min.js",
          resourceType: "script",
          thirdParty: false,
          timestampMs: 40926,
          url: "https://numastays.com/.well-known/vercel/security/static/challenge.v2.min.js"
        },
        {
          consentStateAtTime: "pre_consent",
          eventId: "net_8",
          firstParty: true,
          hostname: "numastays.com",
          isThirdParty: false,
          requestUrl: "https://numastays.com/.well-known/vercel/security/static/challenge.v2.wasm",
          resourceType: "fetch",
          thirdParty: false,
          timestampMs: 41334,
          url: "https://numastays.com/.well-known/vercel/security/static/challenge.v2.wasm"
        },
        {
          consentStateAtTime: "pre_consent",
          eventId: "net_12",
          firstParty: true,
          hostname: "numastays.com",
          isThirdParty: false,
          requestUrl: "https://numastays.com/.well-known/vercel/security/request-challenge",
          resourceType: "fetch",
          thirdParty: false,
          timestampMs: 45097,
          url: "https://numastays.com/.well-known/vercel/security/request-challenge"
        }
      ],
      normalizedUrl: "https://numastays.com/",
      policySurfaceObservations: [],
      runtimeCoverage: {
        coverageStatus: "usable",
        fallbackModesUsed: [],
        limitationKeys: [],
        notes: [],
        observationCounts: {
          cookieEvents: 0,
          cookiesBeforeConsent: 0,
          networkEvents: 4,
          normalizedVendors: 0,
          observedJourneys: 0,
          thirdPartyRequests: 0
        },
        silentEmpty: false
      },
      runtimeTimeline: [],
      scanId: "numastays-vercel-checkpoint-fixture",
      schemaVersion: "certscore.v2.canonical-evidence-bundle.v1",
      screenshots: [
        {
          artifactId: "screenshot_pre_consent",
          capturedAtMs: 41243,
          captureMethod: "primary_viewport_fallback",
          consentStateAtTime: "pre_consent",
          pagePhase: "dom_content_loaded",
          path: path.join(outDir, "screenshot-pre-consent.png"),
          url: "https://numastays.com/"
        }
      ],
      startedAt: "2026-06-23T14:58:18.234Z",
      url: "https://numastays.com/"
    }, null, 2)}\n`, "utf8");

    const detail = await materializeLocalV2DagScanDetail(makeScanRecord({
      scan: {
        ...makeScanRecord().scan,
        domainHostname: "numastays.com",
        scanConfigJson: {
          hostname: "numastays.com",
          normalizedUrl: "https://numastays.com/",
          processor: LOCAL_V2_DAG_SCAN_PROCESSOR,
          execution: {
            localV2Dag: { outDir },
            v2DagParallel: {
              artifactOnly: true,
              localOnly: true,
              profile: "standard",
              productionFindingIntegration: false
            }
          }
        }
      }
    }));

    const scanNoGoAssessment = detail.runtimeArtifacts?.scan_no_go_assessment as Record<string, unknown> | undefined;
    const visualAccessReview = detail.runtimeArtifacts?.visual_access_review as Record<string, unknown> | undefined;

    assert.equal(scanNoGoAssessment?.decision, "no_go");
    assert.deepEqual(scanNoGoAssessment?.reasonCodes, ["access_denied_or_forbidden_page", "scan_no_go_corroborated"]);
    assert.ok((scanNoGoAssessment?.corroboratorCodes as string[] | undefined)?.includes("low_runtime_activity"));
    assert.equal(visualAccessReview?.go_no_go, "NO_GO");
    assert.equal(visualAccessReview?.page_state, "access_blocked");
    assert.equal(detail.snapshot?.homepage_fetch_status, "blocked");
    assert.equal(detail.snapshot?.blocked_flag, true);
    assert.equal(detail.snapshot?.coverage_level, "limited_none");
    assert.equal(detail.snapshot?.pages_scanned, 0);
    assert.equal(detail.snapshot?.runtime_counts_retained, false);
    assert.equal(detail.runtimeArtifacts?.runtime_coverage_status, "limited_none");
    assert.equal(detail.runtimeArtifacts?.runtime_counts_retained, false);
    assert.equal(detail.scan.pagesScanned, 0);
    assert.equal(detail.signals.length, 0);
  } finally {
    if (previousAppUrl === undefined) {
      delete process.env.NEXT_PUBLIC_APP_URL;
    } else {
      process.env.NEXT_PUBLIC_APP_URL = previousAppUrl;
    }
    await rm(outDir, { recursive: true, force: true });
  }
});

test("materializeLocalV2DagScanDetail promotes security block pages even when cookie text resembles consent copy", async () => {
  const { materializeLocalV2DagScanDetail } = await loadLocalV2DagReport();
  const previousAppUrl = process.env.NEXT_PUBLIC_APP_URL;
  const outDir = await mkdtemp(path.join(process.cwd(), "artifacts/local-v2-dag-scans/no-go-security-block-"));
  try {
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
    await mkdir(outDir, { recursive: true });
    await writeFile(path.join(outDir, "CanonicalEvidenceBundle.json"), `${JSON.stringify({
      completedAt: "2026-06-23T04:37:16.000Z",
      consentUiObservations: [
        {
          basis: ["keyword:cookie", "keyword:cookies"],
          confidence: 0.62,
          likelyPresent: true,
          observationId: "consent_ui_pre_consent",
          textExcerpt: "Please enable cookies. Sorry, you have been blocked You are unable to access www.ikea.com Why have I been blocked? This website is using a security service to protect itself from online attacks. Cloudflare Ray ID: a100cba4df09f3ce",
          visibleChoiceLabels: []
        }
      ],
      cookieEvents: [
        {
          consentStateAtTime: "pre_consent",
          domain: ".ikea.com",
          firstParty: true,
          name: "cf_clearance",
          sameSite: "Lax",
          timestampMs: 900,
          valueHash: "blocked-page-cookie"
        }
      ],
      derivedRuntimeSignals: {
        consentBannerLikelyPresent: true
      },
      modulesRun: [],
      networkEvents: [
        {
          consentStateAtTime: "pre_consent",
          hostname: "www.ikea.com",
          isThirdParty: false,
          thirdParty: false,
          timestampMs: 120,
          url: "https://www.ikea.com/"
        },
        {
          consentStateAtTime: "pre_consent",
          hostname: "www.ikea.com",
          isThirdParty: false,
          thirdParty: false,
          timestampMs: 500,
          url: "https://www.ikea.com/favicon.ico"
        },
        {
          consentStateAtTime: "pre_consent",
          hostname: "www.ikea.com",
          isThirdParty: false,
          thirdParty: false,
          timestampMs: 700,
          url: "https://www.ikea.com/cdn-cgi/challenge-platform/h/b/orchestrate/chl_page/v1"
        },
        {
          consentStateAtTime: "pre_consent",
          hostname: "www.ikea.com",
          isThirdParty: false,
          thirdParty: false,
          timestampMs: 760,
          url: "https://www.ikea.com/cdn-cgi/styles/challenges.css"
        },
        {
          consentStateAtTime: "pre_consent",
          hostname: "www.ikea.com",
          isThirdParty: false,
          thirdParty: false,
          timestampMs: 820,
          url: "https://www.ikea.com/cdn-cgi/scripts/5c5dd728/cloudflare-static/email-decode.min.js"
        }
      ],
      normalizedVendorObservations: [],
      normalizedUrl: "https://www.ikea.com/",
      policySurfaceObservations: [
        {
          normalizedUrl: "https://ikea.com/privacy-policy",
          status: "failed",
          surfaceType: "privacy_policy",
          url: "/privacy-policy"
        }
      ],
      runtimeCoverage: {
        coverageStatus: "usable",
        fallbackModesUsed: [],
        limitationKeys: [],
        notes: [],
        observationCounts: {
          cookieEvents: 1,
          cookiesBeforeConsent: 1,
          networkEvents: 5,
          normalizedVendors: 0,
          observedJourneys: 0,
          thirdPartyRequests: 0
        },
        silentEmpty: false
      },
      runtimeTimeline: [],
      scanId: "ikea-security-block-fixture",
      schemaVersion: "certscore.v2.canonical-evidence-bundle.v1",
      screenshots: [
        {
          artifactId: "screenshot_pre_consent",
          capturedAtMs: 1986,
          consentStateAtTime: "pre_consent",
          pagePhase: "dom_content_loaded",
          path: "/tmp/certscore-v2/ikea-security-block-fixture/screenshot-pre-consent.png",
          url: "https://www.ikea.com/"
        }
      ],
      startedAt: "2026-06-23T04:37:03.000Z",
      url: "https://ikea.com/"
    }, null, 2)}\n`, "utf8");

    const detail = await materializeLocalV2DagScanDetail(makeScanRecord({
      scan: {
        ...makeScanRecord().scan,
        domainHostname: "ikea.com",
        scanConfigJson: {
          hostname: "ikea.com",
          normalizedUrl: "https://ikea.com/",
          processor: LOCAL_V2_DAG_SCAN_PROCESSOR,
          execution: {
            localV2Dag: { outDir },
            v2DagParallel: {
              artifactOnly: true,
              localOnly: true,
              profile: "standard",
              productionFindingIntegration: false
            }
          }
        }
      }
    }));

    const scanNoGoAssessment = detail.runtimeArtifacts?.scan_no_go_assessment as Record<string, unknown> | undefined;
    const visualAccessReview = detail.runtimeArtifacts?.visual_access_review as Record<string, unknown> | undefined;

    assert.equal(scanNoGoAssessment?.decision, "no_go");
    assert.deepEqual(scanNoGoAssessment?.reasonCodes, ["access_denied_or_forbidden_page", "scan_no_go_corroborated"]);
    assert.equal(visualAccessReview?.go_no_go, "NO_GO");
    assert.equal(visualAccessReview?.page_state, "access_blocked");
    assert.equal(detail.snapshot?.homepage_fetch_status, "blocked");
    assert.equal(detail.snapshot?.blocked_flag, true);
    assert.equal(detail.snapshot?.coverage_level, "limited_none");
    assert.equal(detail.snapshot?.pages_scanned, 0);
    assert.equal(detail.runtimeArtifacts?.runtime_counts_retained, false);
    assert.equal(detail.scan.pagesScanned, 0);
    assert.equal(detail.signals.length, 0);
  } finally {
    if (previousAppUrl === undefined) {
      delete process.env.NEXT_PUBLIC_APP_URL;
    } else {
      process.env.NEXT_PUBLIC_APP_URL = previousAppUrl;
    }
    await rm(outDir, { recursive: true, force: true });
  }
});

test("materializeLocalV2DagScanDetail treats retained bot verification DOM as scan-level no-go", async () => {
  const { materializeLocalV2DagScanDetail } = await loadLocalV2DagReport();
  const previousAppUrl = process.env.NEXT_PUBLIC_APP_URL;
  const outDir = await mkdtemp(path.join(process.cwd(), "artifacts/local-v2-dag-scans/no-go-bot-verification-"));
  try {
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
    await mkdir(outDir, { recursive: true });
    await writeFile(path.join(outDir, "CanonicalEvidenceBundle.json"), `${JSON.stringify({
      completedAt: "2026-06-25T02:16:00.000Z",
      consentUiObservations: [],
      cookieEvents: [],
      derivedRuntimeSignals: {
        consentBannerLikelyPresent: false
      },
      domSnapshots: [
        {
          artifactId: "dom_text_pre_consent",
          capturedAtMs: 1400,
          consentStateAtTime: "pre_consent",
          path: "/tmp/certscore-v2/lufthansa-security-check/dom-text-pre-consent.txt",
          textExcerpt: "Security check We apologise for the interruption. We detected unusual behaviour from your browser, which resembles that of a bot. The reasons could be the following: you are using a VPN or privacy software often used by bots."
        }
      ],
      modulesRun: [],
      networkEvents: [
        {
          consentStateAtTime: "pre_consent",
          hostname: "www.lufthansa.com",
          isThirdParty: false,
          thirdParty: false,
          timestampMs: 120,
          url: "https://www.lufthansa.com/"
        },
        {
          consentStateAtTime: "pre_consent",
          hostname: "www.lufthansa.com",
          isThirdParty: false,
          thirdParty: false,
          timestampMs: 620,
          url: "https://www.lufthansa.com/cdn-cgi/challenge-platform/scripts/jsd/main.js"
        }
      ],
      normalizedVendorObservations: [],
      normalizedUrl: "https://www.lufthansa.com/",
      policySurfaceObservations: [],
      runtimeCoverage: {
        coverageStatus: "usable",
        fallbackModesUsed: [],
        limitationKeys: [],
        notes: [],
        observationCounts: {
          cookieEvents: 0,
          cookiesBeforeConsent: 0,
          networkEvents: 2,
          normalizedVendors: 0,
          observedJourneys: 0,
          thirdPartyRequests: 0
        },
        silentEmpty: false
      },
      runtimeTimeline: [],
      scanId: "lufthansa-security-check-fixture",
      schemaVersion: "certscore.v2.canonical-evidence-bundle.v1",
      screenshots: [
        {
          artifactId: "screenshot_pre_consent",
          capturedAtMs: 1600,
          consentStateAtTime: "pre_consent",
          pagePhase: "dom_content_loaded",
          path: "/tmp/certscore-v2/lufthansa-security-check/screenshot-pre-consent.png",
          url: "https://www.lufthansa.com/"
        }
      ],
      startedAt: "2026-06-25T02:15:48.000Z",
      url: "https://lufthansa.com/"
    }, null, 2)}\n`, "utf8");

    const detail = await materializeLocalV2DagScanDetail(makeScanRecord({
      scan: {
        ...makeScanRecord().scan,
        domainHostname: "lufthansa.com",
        scanConfigJson: {
          hostname: "lufthansa.com",
          normalizedUrl: "https://lufthansa.com/",
          processor: LOCAL_V2_DAG_SCAN_PROCESSOR,
          execution: {
            localV2Dag: { outDir },
            v2DagParallel: {
              artifactOnly: true,
              localOnly: true,
              profile: "standard",
              productionFindingIntegration: false
            }
          }
        }
      }
    }));

    const scanNoGoAssessment = detail.runtimeArtifacts?.scan_no_go_assessment as Record<string, unknown> | undefined;
    const visualAccessReview = detail.runtimeArtifacts?.visual_access_review as Record<string, unknown> | undefined;

    assert.equal(scanNoGoAssessment?.decision, "no_go");
    assert.equal(visualAccessReview?.go_no_go, "NO_GO");
    assert.equal(detail.snapshot?.homepage_fetch_status, "blocked");
    assert.equal(detail.snapshot?.blocked_flag, true);
    assert.equal(detail.snapshot?.coverage_level, "limited_none");
    assert.equal(detail.snapshot?.pages_scanned, 0);
    assert.equal(detail.runtimeArtifacts?.runtime_counts_retained, false);
    assert.equal(detail.scan.pagesScanned, 0);
    assert.equal(detail.signals.length, 0);
  } finally {
    if (previousAppUrl === undefined) {
      delete process.env.NEXT_PUBLIC_APP_URL;
    } else {
      process.env.NEXT_PUBLIC_APP_URL = previousAppUrl;
    }
    await rm(outDir, { recursive: true, force: true });
  }
});

test("materializeLocalV2DagScanDetail keeps missing reject actionable when runtime activity was retained", async () => {
  const { materializeLocalV2DagScanDetail } = await loadLocalV2DagReport();
  const previousAppUrl = process.env.NEXT_PUBLIC_APP_URL;
  const outDir = await mkdtemp(path.join(process.cwd(), "artifacts/local-v2-dag-scans/missing-reject-"));
  try {
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
    await mkdir(outDir, { recursive: true });
    await writeFile(path.join(outDir, "CanonicalEvidenceBundle.json"), `${JSON.stringify({
      cmpRuntimeObservations: [
        {
          entity: "OneTrust",
          observedAtMs: 1200,
          product: "OneTrust",
          signals: [
            {
              matchedField: "script_host",
              matchedValueRedacted: "cdn.cookielaw.org",
              signalType: "script"
            },
            {
              matchedField: "cookie_name",
              matchedValueRedacted: "OptanonConsent",
              signalType: "cookie"
            }
          ],
          vendor: "OneTrust"
        }
      ],
      completedAt: "2026-06-21T21:53:14.000Z",
      consentUiObservations: [
        {
          acceptControlObserved: false,
          basis: [
            "bounded_capture_timeout_or_failure",
            "dom_text_fallback_after_consent_ui_timeout",
            "keyword:cookie",
            "keyword:consent"
          ],
          confidence: 0.72,
          likelyPresent: true,
          managePreferencesControlObserved: false,
          observationId: "consent_ui_pre_consent",
          rejectControlObserved: false,
          textExcerpt: "We and our partners use cookies on this site to improve our service. Continue",
          visibleChoiceLabels: []
        }
      ],
      cookieEvents: [
        {
          consentStateAtTime: "pre_consent",
          cookieDomain: ".nbcnews.com",
          cookieName: "OptanonConsent",
          cookieParty: "first_party",
          cookiePurpose: "consent_management",
          operation: "set",
          thirdParty: false,
          timestampMs: 1400,
          url: "https://www.nbcnews.com/"
        }
      ],
      derivedRuntimeSignals: {
        consentBannerLikelyPresent: true
      },
      networkEvents: [
        {
          consentStateAtTime: "pre_consent",
          hostname: "tags.example.test",
          isThirdParty: true,
          thirdParty: true,
          timestampMs: 1300,
          url: "https://tags.example.test/pixel.js"
        }
      ],
      normalizedUrl: "https://www.nbcnews.com/",
      runtimeCoverage: {
        coverageStatus: "limited_partial",
        fallbackModesUsed: [],
        limitationKeys: ["cmp_runtime_without_actionable_surface"],
        notes: [
          "CMP runtime evidence was observed, but no actionable consent surface or first-layer controls were retained in bounded capture."
        ],
        observationCounts: {
          cookieEvents: 1,
          cookiesBeforeConsent: 1,
          networkEvents: 1,
          normalizedVendors: 1,
          observedJourneys: 1,
          thirdPartyRequests: 1
        },
        silentEmpty: false
      },
      scanId: "missing-reject-fixture",
      schemaVersion: "certscore.v2.canonical-evidence-bundle.v1",
      screenshots: [
        {
          artifactId: "screenshot_pre_consent",
          capturedAtMs: 900,
          consentStateAtTime: "pre_consent",
          pagePhase: "domcontentloaded",
          path: "/tmp/certscore-v2/missing-reject-fixture/screenshot-pre-consent.png",
          url: "https://www.nbcnews.com/"
        }
      ],
      startedAt: "2026-06-21T21:53:00.000Z",
      url: "https://www.nbcnews.com/"
    }, null, 2)}\n`, "utf8");

    const detail = await materializeLocalV2DagScanDetail(makeScanRecord({
      scan: {
        ...makeScanRecord().scan,
        domainHostname: "nbcnews.com",
        scanConfigJson: {
          hostname: "nbcnews.com",
          normalizedUrl: "https://www.nbcnews.com/",
          processor: LOCAL_V2_DAG_SCAN_PROCESSOR,
          execution: {
            localV2Dag: { outDir },
            v2DagParallel: {
              artifactOnly: true,
              localOnly: true,
              profile: "standard",
              productionFindingIntegration: false
            }
          }
        }
      }
    }));

    assert.equal(detail.runtimeArtifacts?.runtime_counts_retained, true);
    assert.equal(detail.runtimeArtifacts?.consent_surface_observed, true);
    assert.equal(detail.runtimeArtifacts?.consent_preconsent_violation_count, 1);

    const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
      coverageLimited: false,
      events: detail.events,
      runtimeArtifacts: detail.runtimeArtifacts,
      scanCompleted: true,
      snapshot: detail.snapshot
    });
    const checklist = deriveGdprEprivacyCoverageChecklist({
      coverageLimited: false,
      coverageOutcomes: outcomes,
      scanCompleted: true,
      unifiedFindings: buildScanReportUnifiedFindingsForScan(detail)
    });
    const rejectPath = checklist.find((item) => item.id === "reject_all_path_availability");
    const rejectPathArtifact = detail.runtimeArtifacts?.rejectPathDepthAndAvailability as Record<string, unknown> | undefined;

    assert.equal(rejectPathArtifact?.firstLayerCookieConsentBannerObserved, false);
    assert.equal(rejectPathArtifact?.gdprEprivacyConsentSurfaceObserved, "unconfirmed");
    assert.equal(rejectPath?.status, "Review signal");
    assert.equal(rejectPath?.assessmentStatus, "review_signal");
    assert.notEqual(rejectPath?.evidenceState, "not_testable");
    assert.match(rejectPath?.limitation ?? "", /partial concern/i);
  } finally {
    if (previousAppUrl === undefined) {
      delete process.env.NEXT_PUBLIC_APP_URL;
    } else {
      process.env.NEXT_PUBLIC_APP_URL = previousAppUrl;
    }
    await rm(outDir, { recursive: true, force: true });
  }
});

test("materializeLocalV2DagScanDetail promotes 1x1 screenshot placeholders to scan no-go", async () => {
  const { materializeLocalV2DagScanDetail } = await loadLocalV2DagReport();
  const previousAppUrl = process.env.NEXT_PUBLIC_APP_URL;
  const outDir = await mkdtemp(path.join(process.cwd(), "artifacts/local-v2-dag-scans/no-go-placeholder-"));
  try {
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
    await mkdir(outDir, { recursive: true });
    await writeFile(path.join(outDir, "CanonicalEvidenceBundle.json"), `${JSON.stringify({
      completedAt: "2026-06-19T23:05:28.000Z",
      consentUiObservations: [
        {
          basis: ["insufficient_banner_keywords"],
          confidence: 0.5,
          likelyPresent: false,
          observationId: "consent_ui_pre_consent",
          textExcerpt: "",
          visibleChoiceLabels: []
        }
      ],
      cookieEvents: [],
      modulesRun: [
        {
          moduleName: "preConsentRuntimeScanner",
          status: "partial",
          errors: [
            "Observation settle ended early because the page/context closed: page.waitForTimeout: Target page, context or browser has been closed",
            "Full-page screenshot failed: page.screenshot: Target page, context or browser has been closed",
            "Viewport screenshot fallback failed: page.screenshot: Target page, context or browser has been closed",
            "1x1 screenshot placeholder used after screenshot capture failures."
          ]
        }
      ],
      networkEvents: [
        {
          consentStateAtTime: "pre_consent",
          hostname: "www.latimes.com",
          isThirdParty: false,
          thirdParty: false,
          timestampMs: 700,
          url: "https://www.latimes.com/"
        },
        {
          consentStateAtTime: "pre_consent",
          hostname: "www.latimes.com",
          isThirdParty: false,
          thirdParty: false,
          timestampMs: 780,
          url: "https://www.latimes.com/favicon.ico"
        }
      ],
      normalizedUrl: "https://www.latimes.com/",
      policySurfaceObservations: [],
      runtimeCoverage: {
        coverageStatus: "limited_partial",
        fallbackModesUsed: [],
        limitationKeys: ["pre_consent_runtime_partial"],
        notes: [],
        observationCounts: {
          cookiesBeforeConsent: 0,
          normalizedVendors: 0,
          thirdPartyRequests: 0
        }
      },
      runtimeTimeline: [],
      scanId: "latimes-placeholder-fixture",
      schemaVersion: "certscore.v2.canonical-evidence-bundle.v1",
      screenshots: [
        {
          artifactId: "screenshot_pre_consent",
          capturedAtMs: 3273,
          consentStateAtTime: "pre_consent",
          pagePhase: "network_idle",
          path: "/tmp/certscore-v2/latimes-placeholder-fixture/screenshot-pre-consent.png",
          url: "https://www.latimes.com/"
        }
      ],
      startedAt: "2026-06-19T23:05:21.000Z",
      url: "https://latimes.com/"
    }, null, 2)}\n`, "utf8");

    const detail = await materializeLocalV2DagScanDetail(makeScanRecord({
      scan: {
        ...makeScanRecord().scan,
        domainHostname: "latimes.com",
        scanConfigJson: {
          hostname: "latimes.com",
          normalizedUrl: "https://latimes.com/",
          processor: LOCAL_V2_DAG_SCAN_PROCESSOR,
          execution: {
            localV2Dag: { outDir },
            v2DagParallel: {
              artifactOnly: true,
              localOnly: true,
              profile: "standard",
              productionFindingIntegration: false
            }
          }
        }
      }
    }));

    const scanNoGoAssessment = detail.runtimeArtifacts?.scan_no_go_assessment as Record<string, unknown> | undefined;
    const visualAccessReview = detail.runtimeArtifacts?.visual_access_review as Record<string, unknown> | undefined;

    assert.equal(scanNoGoAssessment?.decision, "no_go");
    assert.deepEqual(scanNoGoAssessment?.reasonCodes, ["visual_capture_failed_or_placeholder", "scan_no_go_corroborated"]);
    assert.equal(visualAccessReview?.go_no_go, "NO_GO");
    assert.equal(visualAccessReview?.page_state, "capture_failed");
    assert.equal(detail.snapshot?.homepage_fetch_status, "blocked");
    assert.equal(detail.snapshot?.block_page_classification, "capture_failed");
    assert.equal(detail.snapshot?.stop_reason_code, "homepage_visual_capture_failed");
    assert.equal(detail.snapshot?.stop_reason_label, "Homepage capture failed");
    assert.equal(detail.snapshot?.coverage_level, "limited_none");
    assert.equal(detail.snapshot?.pages_scanned, 0);
    assert.equal(detail.runtimeArtifacts?.runtime_coverage_status, "limited_none");
    assert.equal(detail.scan.pagesScanned, 0);
    assert.equal(detail.signals.length, 0);
  } finally {
    if (previousAppUrl === undefined) {
      delete process.env.NEXT_PUBLIC_APP_URL;
    } else {
      process.env.NEXT_PUBLIC_APP_URL = previousAppUrl;
    }
    await rm(outDir, { recursive: true, force: true });
  }
});

test("materializeLocalV2DagScanDetail promotes retained full-viewport visual error shells to scan no-go", async () => {
  const { materializeLocalV2DagScanDetail } = await loadLocalV2DagReport();
  const previousAppUrl = process.env.NEXT_PUBLIC_APP_URL;
  const outDir = await mkdtemp(path.join(process.cwd(), "artifacts/local-v2-dag-scans/no-go-visual-error-shell-"));
  const screenshotPath = path.join(outDir, "screenshot-pre-consent.png");
  try {
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
    await mkdir(outDir, { recursive: true });
    await writeFile(screenshotPath, syntheticPngHeader(1366, 900, 9_000));
    await writeFile(path.join(outDir, "CanonicalEvidenceBundle.json"), `${JSON.stringify({
      completedAt: "2026-06-20T00:11:28.000Z",
      consentUiObservations: [
        {
          basis: ["insufficient_banner_keywords"],
          confidence: 0.5,
          likelyPresent: false,
          observationId: "consent_ui_pre_consent",
          textExcerpt: "",
          visibleChoiceLabels: []
        }
      ],
      cookieEvents: [
        {
          consentStateAtTime: "pre_consent",
          domain: ".latimes.com",
          firstParty: true,
          name: "_abck",
          sameSite: "Lax",
          timestampMs: 700,
          valueHash: "blocked-page-cookie"
        },
        {
          consentStateAtTime: "pre_consent",
          domain: ".latimes.com",
          firstParty: true,
          name: "bm_sz",
          sameSite: "Lax",
          timestampMs: 760,
          valueHash: "blocked-page-cookie-2"
        }
      ],
      modulesRun: [
        {
          moduleName: "preConsentRuntimeScanner",
          status: "partial",
          errors: [
            "Cookie capture unavailable because the page/context closed: browserContext.cookies: Target page, context or browser has been closed"
          ]
        }
      ],
      networkEvents: [
        {
          consentStateAtTime: "pre_consent",
          hostname: "www.latimes.com",
          isThirdParty: false,
          thirdParty: false,
          timestampMs: 100,
          url: "https://www.latimes.com/"
        },
        {
          consentStateAtTime: "pre_consent",
          hostname: "www.latimes.com",
          isThirdParty: false,
          thirdParty: false,
          timestampMs: 600,
          url: "https://www.latimes.com/favicon.ico"
        }
      ],
      normalizedUrl: "https://www.latimes.com/",
      policySurfaceObservations: [],
      runtimeCoverage: {
        coverageStatus: "limited_partial",
        fallbackModesUsed: [],
        limitationKeys: ["pre_consent_runtime_partial"],
        notes: [],
        observationCounts: {
          cookieEvents: 2,
          cookiesBeforeConsent: 2,
          networkEvents: 2,
          normalizedVendors: 0,
          observedJourneys: 0,
          thirdPartyRequests: 0
        },
        silentEmpty: false
      },
      runtimeTimeline: [],
      scanId: "latimes-visual-error-shell-fixture",
      schemaVersion: "certscore.v2.canonical-evidence-bundle.v1",
      screenshots: [
        {
          artifactId: "screenshot_pre_consent",
          capturedAtMs: 2565,
          consentStateAtTime: "pre_consent",
          pagePhase: "dom_content_loaded",
          path: screenshotPath,
          url: "https://www.latimes.com/"
        }
      ],
      startedAt: "2026-06-20T00:11:21.000Z",
      url: "https://latimes.com/"
    }, null, 2)}\n`, "utf8");

    const detail = await materializeLocalV2DagScanDetail(makeScanRecord({
      scan: {
        ...makeScanRecord().scan,
        domainHostname: "latimes.com",
        scanConfigJson: {
          hostname: "latimes.com",
          normalizedUrl: "https://latimes.com/",
          processor: LOCAL_V2_DAG_SCAN_PROCESSOR,
          execution: {
            localV2Dag: { outDir },
            v2DagParallel: {
              artifactOnly: true,
              localOnly: true,
              profile: "standard",
              productionFindingIntegration: false
            }
          }
        }
      }
    }));

    const scanNoGoAssessment = detail.runtimeArtifacts?.scan_no_go_assessment as Record<string, unknown> | undefined;
    const visualAccessReview = detail.runtimeArtifacts?.visual_access_review as Record<string, unknown> | undefined;

    assert.equal(scanNoGoAssessment?.decision, "no_go");
    assert.deepEqual(scanNoGoAssessment?.reasonCodes, ["retained_visual_error_shell", "scan_no_go_corroborated"]);
    assert.equal(visualAccessReview?.go_no_go, "NO_GO");
    assert.equal(visualAccessReview?.page_state, "visual_error_shell");
    assert.equal(detail.snapshot?.homepage_fetch_status, "blocked");
    assert.equal(detail.snapshot?.coverage_level, "limited_none");
    assert.equal(detail.snapshot?.pages_scanned, 0);
    assert.equal(detail.runtimeArtifacts?.runtime_coverage_status, "limited_none");
    assert.equal(detail.scan.pagesScanned, 0);
    assert.equal(detail.signals.length, 0);
  } finally {
    if (previousAppUrl === undefined) {
      delete process.env.NEXT_PUBLIC_APP_URL;
    } else {
      process.env.NEXT_PUBLIC_APP_URL = previousAppUrl;
    }
    await rm(outDir, { recursive: true, force: true });
  }
});

test("materializeLocalV2DagScanDetail resolves mirrored Lambda screenshot paths for visual error shells", async () => {
  const { materializeLocalV2DagScanDetail } = await loadLocalV2DagReport();
  const previousAppUrl = process.env.NEXT_PUBLIC_APP_URL;
  const scanId = "cnn-lambda-visual-error-shell-fixture";
  const outDir = await mkdtemp(path.join(process.cwd(), "artifacts/local-v2-dag-scans/lambda-visual-error-shell-"));
  try {
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
    await mkdir(outDir, { recursive: true });
    await writeFile(path.join(outDir, "screenshot-pre-consent.png"), syntheticPngHeader(1366, 900, 6_925));
    await writeFile(path.join(outDir, "CanonicalEvidenceBundle.json"), `${JSON.stringify({
      completedAt: "2026-06-20T16:45:20.000Z",
      consentUiObservations: [
        {
          basis: ["bounded_capture_timeout_or_failure", "dom_text_fallback_after_consent_ui_timeout"],
          confidence: 0.5,
          likelyPresent: false,
          observationId: "consent_ui_pre_consent",
          textExcerpt: "Unknown Error",
          visibleChoiceLabels: []
        }
      ],
      cookieEvents: [
        {
          consentStateAtTime: "pre_consent",
          domain: ".cnn.com",
          firstParty: true,
          name: "OptanonConsent",
          timestampMs: 1200,
          valueHash: "first-party-cookie"
        }
      ],
      modulesRun: [],
      networkEvents: [
        {
          consentStateAtTime: "pre_consent",
          hostname: "cnn.com",
          isThirdParty: false,
          thirdParty: false,
          timestampMs: 100,
          url: "https://cnn.com/"
        },
        {
          consentStateAtTime: "pre_consent",
          hostname: "www.cnn.com",
          isThirdParty: false,
          thirdParty: false,
          timestampMs: 400,
          url: "https://www.cnn.com/"
        },
        {
          consentStateAtTime: "pre_consent",
          hostname: "edition.cnn.com",
          isThirdParty: false,
          thirdParty: false,
          timestampMs: 900,
          url: "https://edition.cnn.com/"
        }
      ],
      normalizedUrl: "https://cnn.com/",
      policySurfaceObservations: [],
      runtimeCoverage: {
        coverageStatus: "limited_partial",
        fallbackModesUsed: [],
        limitationKeys: ["pre_consent_runtime_partial"],
        notes: [],
        observationCounts: {
          cookieEvents: 14,
          cookiesBeforeConsent: 4,
          networkEvents: 3,
          normalizedVendors: 0,
          observedJourneys: 0,
          thirdPartyRequests: 0
        },
        silentEmpty: false
      },
      runtimeTimeline: [],
      scanId,
      schemaVersion: "certscore.v2.canonical-evidence-bundle.v1",
      screenshots: [
        {
          artifactId: "screenshot_pre_consent",
          capturedAtMs: 4827,
          consentStateAtTime: "pre_consent",
          pagePhase: "network_idle",
          path: `/tmp/certscore-v2-dag-lambda/${scanId}/screenshot-pre-consent.png`,
          url: "https://edition.cnn.com/"
        }
      ],
      startedAt: "2026-06-20T16:44:35.000Z",
      url: "https://cnn.com/"
    }, null, 2)}\n`, "utf8");

    const detail = await materializeLocalV2DagScanDetail(makeScanRecord({
      scan: {
        ...makeScanRecord().scan,
        domainHostname: "cnn.com",
        scanConfigJson: {
          hostname: "cnn.com",
          normalizedUrl: "https://cnn.com/",
          processor: LOCAL_V2_DAG_SCAN_PROCESSOR,
          execution: {
            localV2Dag: { outDir },
            v2DagParallel: {
              artifactOnly: true,
              localOnly: true,
              profile: "standard",
              productionFindingIntegration: false
            }
          }
        }
      }
    }));

    const scanNoGoAssessment = detail.runtimeArtifacts?.scan_no_go_assessment as Record<string, unknown> | undefined;
    const visualArtifacts = detail.runtimeArtifacts?.visual_evidence_artifacts as Array<Record<string, unknown>> | undefined;

    assert.equal(scanNoGoAssessment?.decision, "no_go");
    assert.deepEqual(scanNoGoAssessment?.reasonCodes, ["retained_visual_error_shell", "scan_no_go_corroborated"]);
    assert.equal(visualArtifacts?.[0]?.status, "capture_failed");
    assert.equal(visualArtifacts?.[0]?.status_reason, "pre_consent_error_shell_captured");
    assert.equal(detail.snapshot?.homepage_fetch_status, "blocked");
    assert.equal(detail.snapshot?.coverage_level, "limited_none");
    assert.equal(detail.scan.pagesScanned, 0);
    assert.equal(detail.signals.length, 0);
  } finally {
    if (previousAppUrl === undefined) {
      delete process.env.NEXT_PUBLIC_APP_URL;
    } else {
      process.env.NEXT_PUBLIC_APP_URL = previousAppUrl;
    }
    await rm(outDir, { recursive: true, force: true });
  }
});

test("materializeLocalV2DagScanDetail marks failed pre-consent runtime without screenshots as unreliable", async () => {
  const { materializeLocalV2DagScanDetail } = await loadLocalV2DagReport();
  const previousAppUrl = process.env.NEXT_PUBLIC_APP_URL;
  const outDir = await mkdtemp(path.join(process.cwd(), "artifacts/local-v2-dag-scans/missing-screenshot-retained-runtime-"));
  try {
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
    await mkdir(outDir, { recursive: true });
    await writeFile(path.join(outDir, "CanonicalEvidenceBundle.json"), `${JSON.stringify({
      completedAt: "2026-06-19T23:06:52.000Z",
      consentUiObservations: [],
      cookieEvents: [
        {
          consentStateAtTime: "pre_consent",
          domain: ".nvidia.com",
          firstParty: true,
          name: "visitor_id",
          sameSite: "Lax",
          timestampMs: 1800,
          valueHash: "cookie-hash"
        }
      ],
      modulesRun: [
        {
          moduleName: "preConsentRuntimeScanner",
          status: "failed",
          errors: [
            "page.goto: Target page, context or browser has been closed during navigation to https://nvidia.com/"
          ]
        },
        {
          moduleName: "policySurfaceScanner",
          status: "completed",
          errors: []
        }
      ],
      networkEvents: [
        {
          consentStateAtTime: "pre_consent",
          hostname: "nvidia.com",
          isThirdParty: false,
          thirdParty: false,
          timestampMs: 100,
          url: "https://nvidia.com/"
        },
        {
          consentStateAtTime: "pre_consent",
          hostname: "assets.adobedtm.com",
          isThirdParty: true,
          thirdParty: true,
          timestampMs: 900,
          url: "https://assets.adobedtm.com/launch.js"
        }
      ],
      normalizedUrl: "https://nvidia.com/",
      normalizedVendorObservations: [
        {
          confidence: 0.91,
          evidenceRefs: [],
          observedEventIds: [],
          product: "Adobe Experience Platform Launch",
          purposes: ["analytics"],
          vendor: "Adobe"
        }
      ],
      observedJourneys: [
        {
          journeyId: "journey_1",
          journeyType: "homepage_load",
          status: "observed",
          evidenceRefs: []
        }
      ],
      policySurfaceObservations: [
        {
          confidence: 0.8,
          discoveryMethod: "homepage_link",
          observationId: "privacy",
          status: "fetched",
          surfaceType: "privacy_policy",
          textExcerpt: "Privacy Policy",
          url: "https://www.nvidia.com/privacy-policy"
        }
      ],
      runtimeCoverage: {
        coverageStatus: "limited_partial",
        fallbackModesUsed: [],
        limitationKeys: ["pre_consent_runtime_failed"],
        notes: [],
        observationCounts: {
          cookiesBeforeConsent: 1,
          normalizedVendors: 1,
          thirdPartyRequests: 1
        }
      },
      runtimeTimeline: [],
      scanId: "nvidia-missing-screenshot-fixture",
      schemaVersion: "certscore.v2.canonical-evidence-bundle.v1",
      screenshots: [],
      startedAt: "2026-06-19T23:06:49.000Z",
      url: "https://nvidia.com/"
    }, null, 2)}\n`, "utf8");

    const detail = await materializeLocalV2DagScanDetail(makeScanRecord({
      scan: {
        ...makeScanRecord().scan,
        domainHostname: "nvidia.com",
        scanConfigJson: {
          hostname: "nvidia.com",
          normalizedUrl: "https://nvidia.com/",
          processor: LOCAL_V2_DAG_SCAN_PROCESSOR,
          execution: {
            localV2Dag: { outDir },
            v2DagParallel: {
              artifactOnly: true,
              localOnly: true,
              profile: "standard",
              productionFindingIntegration: false
            }
          }
        }
      }
    }));

    const scanNoGoAssessment = detail.runtimeArtifacts?.scan_no_go_assessment as Record<string, unknown> | undefined;

    assert.equal(scanNoGoAssessment, undefined);
    assert.equal(detail.runtimeArtifacts?.visual_access_review, undefined);
    assert.equal(detail.snapshot?.homepage_fetch_status, "success");
    assert.equal(detail.snapshot?.blocked_flag, undefined);
    assert.equal(detail.snapshot?.preconsent_tracking_detected, false);
    assert.equal(detail.snapshot?.tracking_before_consent_detected, false);
    assert.equal(detail.snapshot?.third_party_cookie_set_before_consent, false);
    assert.equal(detail.snapshot?.third_party_request_count, 0);
    assert.equal(detail.snapshot?.cookies_before_consent_count, 0);
    assert.equal(detail.snapshot?.tracker_vendor_count, 0);
    assert.equal(detail.runtimeArtifacts?.runtime_coverage_status, "limited_partial");
    assert.equal(detail.runtimeArtifacts?.runtime_counts_retained, false);
    assert.deepEqual(detail.runtimeArtifacts?.consent_baseline_tracker_evidence_urls, []);
    assert.deepEqual(detail.runtimeArtifacts?.consent_baseline_tracker_vendor_names, []);
    assert.equal(detail.runtimeArtifacts?.consent_preconsent_violation_count, 0);
    assert.deepEqual(detail.runtimeArtifacts?.runtime_limitation_keys, [
      "pre_consent_runtime_failed",
      "visual_capture_unavailable"
    ]);
    assert.equal(detail.snapshot?.runtime_counts_retained, false);
    assert.deepEqual(detail.snapshot?.runtime_limitation_keys, [
      "pre_consent_runtime_failed",
      "visual_capture_unavailable"
    ]);
    assert.equal(detail.scan.pagesScanned, 1);
    assert.equal(detail.preconsentViolations.length, 0);
    assert.equal(detail.signals.some((signal) => signal.key === "privacy.preconsent_tracking_detected"), false);
    assert.equal(detail.signals.some((signal) => signal.key === "tracking_before_consent_detected"), false);
    assert.equal(detail.trackerVendors.length, 0);
    const projectedFindings = buildScanReportUnifiedFindingsForScan(detail);
    assert.equal(projectedFindings.some((finding) => finding.unifiedFindingId === "preconsent_tracking"), false);
  } finally {
    if (previousAppUrl === undefined) {
      delete process.env.NEXT_PUBLIC_APP_URL;
    } else {
      process.env.NEXT_PUBLIC_APP_URL = previousAppUrl;
    }
    await rm(outDir, { recursive: true, force: true });
  }
});

test("materializeLocalV2DagScanDetail keeps fallback consent controls scoreable when runtime counts are limited", async () => {
  const { materializeLocalV2DagScanDetail } = await loadLocalV2DagReport();
  const previousAppUrl = process.env.NEXT_PUBLIC_APP_URL;
  const outDir = await mkdtemp(path.join(process.cwd(), "artifacts/local-v2-dag-scans/fallback-consent-controls-"));
  try {
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
    await mkdir(outDir, { recursive: true });
    await writeFile(path.join(outDir, "CanonicalEvidenceBundle.json"), `${JSON.stringify({
      completedAt: "2026-06-20T19:14:52.000Z",
      consentUiObservations: [
        {
          acceptControlObserved: true,
          basis: [
            "keyword:cookie",
            "keyword:accept all",
            "control:manage_preferences:Manage Settings, Opens the preference center dialog",
            "control:accept_all:Accept All",
            "control:reject_all:Reject Optional"
          ],
          confidence: 0.86,
          controls: [
            {
              actionType: "manage_preferences",
              label: "Manage Settings, Opens the preference center dialog",
              role: "button",
              selectorHint: "#onetrust-pc-btn-handler",
              tagName: "button",
              visible: true
            },
            {
              actionType: "reject_all",
              label: "Reject Optional",
              role: "button",
              selectorHint: "button",
              tagName: "button",
              visible: true
            },
            {
              actionType: "accept_all",
              label: "Accept All",
              role: "button",
              selectorHint: "button",
              tagName: "button",
              visible: true
            }
          ],
          layerInspected: "first_layer",
          likelyPresent: true,
          managePreferencesControlObserved: true,
          observationId: "consent_ui_pre_consent",
          rejectControlObserved: true,
          textExcerpt: "NVIDIA and our third-party partners use cookies. Manage Settings Reject Optional Accept All",
          visibleChoiceLabels: ["Manage Settings, Opens the preference center dialog", "Reject Optional", "Accept All"]
        }
      ],
      cookieEvents: [],
      derivedRuntimeSignals: {
        consentBannerLikelyPresent: true,
        journeySummary: { journeyCount: 0 },
        preConsentTrackingObserved: false,
        sessionReplayOrBehavioralAnalyticsObserved: false,
        thirdPartyCookiesPreConsentObserved: false,
        thirdPartyVendorsObserved: false
      },
      modulesRun: [
        {
          errors: [
            "page.goto: Target page, context or browser has been closed",
            "Visual fallback retained a pre-consent screenshot and bounded consent-surface evidence after the primary runtime page/context closed."
          ],
          moduleName: "preConsentRuntimeScanner",
          status: "failed"
        }
      ],
      networkEvents: [
        {
          consentStateAtTime: "pre_consent",
          hostname: "nvidia.com",
          isThirdParty: false,
          thirdParty: false,
          timestampMs: 100,
          url: "https://nvidia.com/"
        },
        {
          consentStateAtTime: "pre_consent",
          hostname: "cdn.optimizely.com",
          isThirdParty: true,
          thirdParty: true,
          timestampMs: 200,
          url: "https://cdn.optimizely.com/public/example.js"
        }
      ],
      normalizedUrl: "https://nvidia.com/",
      normalizedVendorObservations: [
        {
          confidence: 0.86,
          evidenceHostnames: ["cdn.optimizely.com"],
          evidenceUrls: ["https://cdn.optimizely.com/public/example.js"],
          matchedDomain: "optimizely.com",
          observationId: "vendor_optimizely",
          product: "Optimizely",
          purposes: ["analytics"],
          vendor: "Optimizely"
        }
      ],
      observedJourneys: [],
      policySurfaceObservations: [
        {
          confidence: 0.8,
          discoveryMethod: "homepage_link",
          observationId: "privacy",
          status: "fetched",
          surfaceType: "privacy_policy",
          textExcerpt: "Privacy Policy",
          url: "https://www.nvidia.com/privacy-policy"
        }
      ],
      runtimeCoverage: {
        coverageStatus: "limited_partial",
        fallbackModesUsed: [],
        limitationKeys: ["pre_consent_runtime_failed"],
        notes: [],
        observationCounts: {
          cookiesBeforeConsent: 0,
          normalizedVendors: 1,
          thirdPartyRequests: 1
        }
      },
      runtimeTimeline: [],
      scanId: "nvidia-fallback-consent-fixture",
      schemaVersion: "certscore.v2.canonical-evidence-bundle.v1",
      screenshots: [
        {
          artifactId: "screenshot_pre_consent",
          capturedAtMs: 5343,
          captureMethod: "independent_visual_fallback_viewport",
          consentStateAtTime: "pre_consent",
          pagePhase: "dom_content_loaded",
          path: "/tmp/certscore-v2/nvidia-fallback/screenshot-pre-consent.png",
          url: "https://www.nvidia.com/en-gb/"
        }
      ],
      startedAt: "2026-06-20T19:14:43.000Z",
      url: "https://nvidia.com/",
      visualCapture: {
        artifactRefs: [],
        captureMethod: "independent_visual_fallback_viewport",
        notes: ["Screenshot and bounded consent-surface evidence retained by an independent visual fallback after the primary runtime page/context closed."],
        status: "available"
      }
    }, null, 2)}\n`, "utf8");

    const detail = await materializeLocalV2DagScanDetail(makeScanRecord({
      scan: {
        ...makeScanRecord().scan,
        domainHostname: "nvidia.com",
        scanConfigJson: {
          hostname: "nvidia.com",
          normalizedUrl: "https://nvidia.com/",
          processor: LOCAL_V2_DAG_SCAN_PROCESSOR,
          execution: {
            localV2Dag: { outDir },
            v2DagParallel: {
              artifactOnly: true,
              localOnly: true,
              profile: "standard",
              productionFindingIntegration: false
            }
          }
        }
      }
    }));

    const firstLayerChoices = detail.runtimeArtifacts?.first_layer_consent_choices as Record<string, unknown> | undefined;
    const rejectPath = detail.runtimeArtifacts?.rejectPathDepthAndAvailability as Record<string, unknown> | undefined;

    assert.equal(detail.runtimeArtifacts?.scan_no_go_assessment, undefined);
    assert.equal(detail.snapshot?.homepage_fetch_status, "success");
    assert.equal(detail.snapshot?.cookie_banner_present, true);
    assert.equal(detail.runtimeArtifacts?.consent_surface_observed, true);
    assert.equal(rejectPath?.firstLayerCookieConsentBannerObserved, true);
    assert.equal(rejectPath?.gdprEprivacyConsentSurfaceObserved, "confirmed");
    assert.equal(firstLayerChoices?.rejectControlObserved, true);
    assert.deepEqual(firstLayerChoices?.rejectLabels, ["Reject Optional"]);
    assert.equal(detail.runtimeArtifacts?.runtime_coverage_status, "limited_partial");
    assert.equal(detail.runtimeArtifacts?.runtime_counts_retained, false);
    assert.equal(detail.snapshot?.preconsent_tracking_detected, false);
    assert.equal(detail.snapshot?.third_party_request_count, 0);
    assert.equal(detail.runtimeArtifacts?.consent_preconsent_violation_count, 0);
    assert.deepEqual(detail.runtimeArtifacts?.consent_baseline_tracker_vendor_names, []);
    assert.equal(detail.runtimeArtifacts?.visual_capture_method, "independent_visual_fallback_viewport");
    assert.equal(
      (detail.runtimeArtifacts?.visual_evidence_artifacts as Array<Record<string, unknown>> | undefined)?.[0]?.capture_method,
      "independent_visual_fallback_viewport",
    );
    assert.equal(detail.scan.pagesScanned, 1);
    const projectedFindings = buildScanReportUnifiedFindingsForScan(detail);
    assert.equal(projectedFindings.some((finding) => finding.unifiedFindingId === "preconsent_tracking"), false);
    const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
      coverageLimited: false,
      events: detail.events,
      runtimeArtifacts: detail.runtimeArtifacts,
      scanCompleted: true,
      snapshot: detail.snapshot
    });
    const checklist = deriveGdprEprivacyCoverageChecklist({
      coverageLimited: false,
      coverageOutcomes: outcomes,
      scanCompleted: true,
      unifiedFindings: projectedFindings
    });
    const choiceQuality = checklist.find((item) => item.id === "consent_choice_quality");
    assert.equal(choiceQuality?.status, "Not observed");
    assert.equal(choiceQuality?.evidenceState, "not_observed");
    assert.match(choiceQuality?.limitation ?? "", /No obvious cookie-banner dark-pattern signal/i);
  } finally {
    if (previousAppUrl === undefined) {
      delete process.env.NEXT_PUBLIC_APP_URL;
    } else {
      process.env.NEXT_PUBLIC_APP_URL = previousAppUrl;
    }
    await rm(outDir, { recursive: true, force: true });
  }
});

test("materializeLocalV2DagScanDetail does not surface pre-consent error-shell screenshots", async () => {
  const { materializeLocalV2DagScanDetail } = await loadLocalV2DagReport();
  const previousAppUrl = process.env.NEXT_PUBLIC_APP_URL;
  const outDir = await mkdtemp(path.join(process.cwd(), "artifacts/local-v2-dag-scans/visual-error-"));
  try {
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
    await mkdir(outDir, { recursive: true });
    await writeFile(path.join(outDir, "CanonicalEvidenceBundle.json"), `${JSON.stringify({
      completedAt: "2026-06-17T13:14:02.000Z",
      consentUiObservations: [
        {
          basis: ["bounded_capture_timeout_or_failure", "dom_text_fallback_after_consent_ui_timeout"],
          confidence: 0.5,
          likelyPresent: false,
          observationId: "consent_ui_pre_consent",
          textExcerpt: "Unknown Error",
          visibleChoiceLabels: []
        }
      ],
      cookieEvents: [],
      modulesRun: [],
      networkEvents: [],
      normalizedUrl: "https://cnn.com/",
      policySurfaceObservations: [],
      runtimeTimeline: [],
      scanId: "visual-error-fixture",
      schemaVersion: "certscore.v2.canonical-evidence-bundle.v1",
      screenshots: [
        {
          artifactId: "screenshot_pre_consent",
          capturedAtMs: 4827,
          consentStateAtTime: "pre_consent",
          pagePhase: "network_idle",
          path: "/tmp/certscore-v2/visual-error-fixture/screenshot-pre-consent.png",
          url: "https://edition.cnn.com/"
        }
      ],
      startedAt: "2026-06-17T13:13:50.000Z",
      url: "https://cnn.com/"
    }, null, 2)}\n`, "utf8");

    const detail = await materializeLocalV2DagScanDetail(makeScanRecord({
      events: [
        {
          createdAt: "2026-06-17T13:14:02.000Z",
          eventType: "v2_lambda_result.received",
          id: "event-visual-error-1",
          message: "Local v2 DAG Lambda returned a completed artifact-only result.",
          metadataJson: {
            artifactOnly: true,
            artifactPointers: {
              scanArtifactUri: "s3://certscore-v2-dag-local-artifacts-eu-west-1-199536052647/v2-dag-lambda/local/visual-error-fixture/CanonicalEvidenceBundle.json"
            },
            processor: LOCAL_V2_DAG_SCAN_PROCESSOR,
            productionFindingIntegration: false
          }
        }
      ],
      scan: {
        ...makeScanRecord().scan,
        id: "bc290424-9974-414e-ad48-558e1a2b469e",
        scanConfigJson: {
          hostname: "cnn.com",
          normalizedUrl: "https://cnn.com/",
          processor: LOCAL_V2_DAG_SCAN_PROCESSOR,
          execution: {
            localV2Dag: { outDir },
            v2DagParallel: {
              artifactOnly: true,
              localOnly: true,
              profile: "standard",
              productionFindingIntegration: false
            }
          }
        }
      }
    }));

    const visualArtifacts = detail.runtimeArtifacts?.visual_evidence_artifacts as Array<Record<string, unknown>> | undefined;
    assert.equal(visualArtifacts?.[0]?.status, "capture_failed");
    assert.equal(visualArtifacts?.[0]?.key, null);
    assert.equal(visualArtifacts?.[0]?.status_reason, "pre_consent_error_shell_captured");
  } finally {
    if (previousAppUrl === undefined) {
      delete process.env.NEXT_PUBLIC_APP_URL;
    } else {
      process.env.NEXT_PUBLIC_APP_URL = previousAppUrl;
    }
    await rm(outDir, { recursive: true, force: true });
  }
});

test("materializeLocalV2DagScanDetail marks failed pre-consent runtime counts as not retained", async () => {
  const { materializeLocalV2DagScanDetail } = await loadLocalV2DagReport();
  const previousAppUrl = process.env.NEXT_PUBLIC_APP_URL;
  const outDir = await mkdtemp(path.join(process.cwd(), "artifacts/local-v2-dag-scans/runtime-failed-"));
  try {
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
    await mkdir(outDir, { recursive: true });
    await writeFile(path.join(outDir, "CanonicalEvidenceBundle.json"), `${JSON.stringify({
      completedAt: "2026-06-18T18:50:42.000Z",
      cookieEvents: [],
      modulesRun: [
        {
          moduleName: "preConsentRuntimeScanner",
          status: "failed",
          startedAt: "2026-06-18T18:50:33.000Z",
          completedAt: "2026-06-18T18:50:34.000Z",
          durationMs: 1000,
          evidenceRefs: [],
          errors: ["page.goto: net::ERR_HTTP2_PROTOCOL_ERROR"]
        }
      ],
      networkEvents: [
        {
          consentStateAtTime: "pre_consent",
          eventId: "net_1",
          eventType: "network_request",
          hostname: "ford.com",
          sourceScanner: "pre_consent_runtime",
          thirdParty: false,
          url: "https://ford.com/"
        }
      ],
      normalizedUrl: "https://ford.com/",
      policySurfaceObservations: [
        {
          confidence: 0.8,
          discoveryMethod: "guessed_common_path",
          observationId: "privacy",
          status: "fetched",
          surfaceType: "privacy_policy",
          textExcerpt: "Ford privacy policy.",
          url: "https://ford.com/privacy"
        }
      ],
      runtimeCoverage: {
        coverageStatus: "limited_partial",
        fallbackModesUsed: [],
        limitationKeys: ["pre_consent_runtime_failed"],
        notes: [],
        observationCounts: {
          cookieEvents: 0,
          cookiesBeforeConsent: 0,
          networkEvents: 1,
          normalizedVendors: 0,
          observedJourneys: 0,
          thirdPartyRequests: 0
        },
        silentEmpty: false
      },
      scanId: "runtime-failed-fixture",
      schemaVersion: "certscore.v2.canonical-evidence-bundle.v1",
      startedAt: "2026-06-18T18:50:33.000Z",
      url: "https://ford.com/"
    }, null, 2)}\n`, "utf8");

    const detail = await materializeLocalV2DagScanDetail(makeScanRecord({
      scan: {
        ...makeScanRecord().scan,
        domainHostname: "ford.com",
        scanConfigJson: {
          hostname: "ford.com",
          normalizedUrl: "https://ford.com/",
          processor: LOCAL_V2_DAG_SCAN_PROCESSOR,
          execution: {
            localV2Dag: { outDir },
            v2DagParallel: {
              artifactOnly: true,
              localOnly: true,
              profile: "standard",
              productionFindingIntegration: false
            }
          }
        }
      }
    }));

    assert.ok(detail.snapshot);
    assert.ok(detail.runtimeArtifacts);
    assert.equal(detail.snapshot.runtime_counts_retained, false);
    assert.equal(detail.runtimeArtifacts.runtime_counts_retained, false);
    assert.deepEqual(detail.snapshot.runtime_limitation_keys, [
      "pre_consent_runtime_failed",
      "visual_capture_unavailable"
    ]);
    assert.equal(detail.snapshot.third_party_request_count, 0);
    assert.equal(detail.snapshot.cookies_before_consent_count, 0);
  } finally {
    if (previousAppUrl === undefined) {
      delete process.env.NEXT_PUBLIC_APP_URL;
    } else {
      process.env.NEXT_PUBLIC_APP_URL = previousAppUrl;
    }
    await rm(outDir, { recursive: true, force: true });
  }
});
