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
    assert.deepEqual(embeddedSummary.embeddedContentHosts, ["youtube.com"]);
    assert.equal(sessionReplaySummary.preConsentObserved, true);
    assert.deepEqual(sessionReplaySummary.vendors, ["Microsoft Clarity"]);
    assert.equal(fingerprintingSummary.coverageRetained, true);
    assert.equal(fingerprintingSummary.fingerprintingObserved, true);
    assert.deepEqual(fingerprintingSummary.highEntropySignals, ["HTMLCanvasElement.toDataURL"]);
    assert.equal(firstLayerConsentChoices.rejectControlObserved, false);
    assert.equal(rejectPath.rejectControlObserved, false);
    assert.equal(rejectPath.rejectAvailableOnFirstLayer, false);
    assert.equal(rejectPath.gdprEprivacyConsentSurfaceObserved, "unconfirmed");
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
            "control:accept_all:Accept All",
            "control:reject_all:Reject Optional"
          ],
          confidence: 0.86,
          controls: [
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
          managePreferencesControlObserved: false,
          observationId: "consent_ui_pre_consent",
          rejectControlObserved: true,
          textExcerpt: "NVIDIA and our third-party partners use cookies. Reject Optional Accept All",
          visibleChoiceLabels: ["Reject Optional", "Accept All"]
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

    assert.equal(detail.runtimeArtifacts?.scan_no_go_assessment, undefined);
    assert.equal(detail.snapshot?.homepage_fetch_status, "success");
    assert.equal(detail.snapshot?.cookie_banner_present, true);
    assert.equal(detail.runtimeArtifacts?.consent_surface_observed, true);
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
