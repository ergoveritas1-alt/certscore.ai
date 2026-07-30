import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateRecentScanReuseCandidates,
  getRecentScanReuseEligibility,
  isScanWithinReuseWindow,
  resolveRecentScanReuseDecision,
  type RecentScanReuseCandidate,
  type RecentScanReuseInput
} from "./recent-scan-reuse";

const NOW = new Date("2026-07-11T12:00:00.000Z");
const OWN_ORG = "11111111-1111-4111-8111-111111111111";
const OTHER_ORG = "22222222-2222-4222-8222-222222222222";

const baseInput: RecentScanReuseInput = {
  minPagesRequested: 4,
  normalizedDomain: "example.com",
  normalizedUrl: "https://example.com/",
  now: NOW,
  organizationId: null,
  scanFrom: "eu_ie"
};

function candidate(overrides: Partial<RecentScanReuseCandidate> = {}): RecentScanReuseCandidate {
  return {
    accessPostureClass: "tolerant",
    completedAt: "2026-07-11T11:00:00.000Z",
    coverageLevel: "full",
    hostname: "example.com",
    id: "scan-default",
    normalizedUrl: "https://example.com/",
    organizationId: null,
    pagesRequested: 4,
    pagesScanned: 4,
    scanFrom: "eu_ie",
    scanOutcome: "completed_successfully",
    scanType: "full",
    status: "completed",
    ...overrides
  };
}

function verifiedV2LambdaResult(overrides: Record<string, unknown> = {}) {
  return {
    artifactAccess: {
      checksumSource: "lambda_result_artifact_metadata",
      localMirrorRequired: false,
      productionReadMode: "verified_s3"
    },
    artifactMetadata: {
      scanArtifactUri: {
        sha256: "a".repeat(64),
        sizeBytes: 42_000
      }
    },
    artifactOnly: true,
    artifactPointers: {
      scanArtifactUri: "s3://ws01-scan-artifacts-199536052647-eu-west-1/v2-dag-lambda/prod/scan-123/CanonicalEvidenceBundle.json"
    },
    processor: "local-certscore-v2-dag-parallel-v1",
    productionFindingIntegration: false,
    resultStatus: "completed",
    scannerRuntimeProvenance: {
      awsRegion: "eu-west-1"
    },
    targetEnvironment: "production",
    ...overrides
  };
}

function v2Candidate(overrides: Partial<RecentScanReuseCandidate> = {}) {
  return candidate({
    pagesScanned: 0,
    v2LambdaResultEvents: [verifiedV2LambdaResult()],
    v2ParallelArtifactOnly: true,
    v2ParallelLocalOnly: true,
    v2ReportProcessor: "local-certscore-v2-dag-parallel-v1",
    ...overrides
  });
}

function eligibility(input: Partial<RecentScanReuseInput>, candidates: RecentScanReuseCandidate[]) {
  return evaluateRecentScanReuseCandidates({ ...baseInput, ...input }, candidates);
}

test("24-hour reuse window uses UTC instants and rejects future or invalid timestamps", () => {
  assert.equal(isScanWithinReuseWindow({ completedAt: "2026-07-10T12:00:00.000Z", now: NOW }), true);
  assert.equal(isScanWithinReuseWindow({ completedAt: "2026-07-10T11:59:59.999Z", now: NOW }), false);
  assert.equal(isScanWithinReuseWindow({ completedAt: "2026-07-11T12:00:00.001Z", now: NOW }), false);
  assert.equal(isScanWithinReuseWindow({ completedAt: "invalid", now: NOW }), false);
  assert.equal(isScanWithinReuseWindow({ completedAt: null, now: NOW }), false);
});

test("anonymous callers reuse anonymous scans but never organization scans", () => {
  assert.equal(eligibility({}, [candidate({ organizationId: null })]).eligible, true);
  assert.equal(eligibility({}, [candidate({ organizationId: OWN_ORG })]).eligible, false);
});

test("signed-in callers reuse anonymous and own-organization scans", () => {
  assert.equal(eligibility({ organizationId: OWN_ORG }, [candidate({ organizationId: null })]).eligible, true);
  assert.equal(eligibility({ organizationId: OWN_ORG }, [candidate({ organizationId: OWN_ORG })]).eligible, true);
});

test("signed-in callers never reuse another customer organization scan", () => {
  assert.equal(eligibility({ organizationId: OWN_ORG }, [candidate({ organizationId: OTHER_ORG })]).eligible, false);
});

test("canonical target matching tolerates scheme, case, www, and root-slash differences", () => {
  const result = eligibility(
    { normalizedDomain: "Example.COM", normalizedUrl: "http://www.example.com" },
    [candidate({ hostname: "www.example.com", normalizedUrl: "https://example.com/" })]
  );
  assert.equal(result.eligible, true);
});

test("different domains never reuse", () => {
  assert.equal(eligibility({}, [candidate({ hostname: "other.example", normalizedUrl: "https://other.example/" })]).eligible, false);
});

test("effective scan locations must match after canonical alias normalization", () => {
  assert.equal(eligibility({ scanFrom: "eu_ie" }, [candidate({ scanFrom: "eu_de" })]).eligible, false);
  assert.equal(eligibility({ scanFrom: "eu_de" }, [candidate({ scanFrom: "eu" })]).eligible, true);
});

test("only completed full scans are reusable", () => {
  assert.equal(eligibility({}, [candidate({ status: "running" })]).eligible, false);
  assert.equal(eligibility({}, [candidate({ status: "failed" })]).eligible, false);
  assert.equal(eligibility({}, [candidate({ scanType: "preview" })]).eligible, false);
  assert.equal(eligibility({}, [candidate({ scanType: "scheduled" })]).eligible, false);
  assert.equal(eligibility({}, [candidate({ scanType: null })]).eligible, true);
});

test("coverage must equal or exceed the new request", () => {
  assert.equal(eligibility({ minPagesRequested: 5 }, [candidate({ pagesRequested: 4 })]).eligible, false);
  assert.equal(eligibility({ minPagesRequested: 4 }, [candidate({ pagesRequested: 4 })]).eligible, true);
  assert.equal(eligibility({ minPagesRequested: 4 }, [candidate({ pagesRequested: 10 })]).eligible, true);
});

test("completed scans without usable coverage are excluded unless an explicit no-go result is cooling down", () => {
  assert.equal(eligibility({}, [candidate({ pagesScanned: 0 })]).eligible, false);
  assert.equal(eligibility({}, [candidate({ coverageLevel: "limited_none" })]).eligible, false);
  assert.equal(eligibility({}, [candidate({ accessPostureClass: "early_loss" })]).eligible, false);
  assert.equal(eligibility({}, [candidate({ scanOutcome: "navigation_transport_failure" })]).eligible, false);
  assert.equal(eligibility({}, [candidate({
    accessPostureClass: "early_loss",
    coverageLevel: "limited_none",
    noGoDecision: "no_go",
    pagesScanned: 0,
    scanOutcome: "homepage_security_challenge",
  })]).eligible, true);
});

test("a completed v2 Lambda scan reuses its verified canonical evidence bundle even when legacy pages scanned is zero", () => {
  const result = eligibility({}, [v2Candidate({ id: "verified-v2-result" })]);

  assert.equal(result.eligible, true);
  assert.equal(result.candidate?.id, "verified-v2-result");
});

test("v2 Lambda reuse rejects missing, failed, malformed, or unverified canonical evidence", () => {
  assert.equal(eligibility({}, [v2Candidate({ v2LambdaResultEvents: [] })]).eligible, false);
  assert.equal(eligibility({}, [v2Candidate({
    v2LambdaResultEvents: [verifiedV2LambdaResult({ resultStatus: "failed" })]
  })]).eligible, false);
  assert.equal(eligibility({}, [v2Candidate({
    v2LambdaResultEvents: [verifiedV2LambdaResult({
      artifactAccess: { productionReadMode: "unverified_s3" }
    })]
  })]).eligible, false);
  assert.equal(eligibility({}, [v2Candidate({
    v2LambdaResultEvents: [verifiedV2LambdaResult({
      artifactMetadata: { scanArtifactUri: { sha256: "invalid", sizeBytes: 42_000 } }
    })]
  })]).eligible, false);
  assert.equal(eligibility({}, [v2Candidate({
    v2LambdaResultEvents: [verifiedV2LambdaResult({
      artifactPointers: {
        scanArtifactUri: "s3://ws01-scan-artifacts-199536052647-eu-west-1/v2-dag-lambda/prod/scan-123/not-canonical.json"
      }
    })]
  })]).eligible, false);
});

test("v2 Lambda canonical evidence must match the requested scan region and report contract", () => {
  assert.equal(eligibility({}, [v2Candidate({
    v2LambdaResultEvents: [verifiedV2LambdaResult({
      scannerRuntimeProvenance: { awsRegion: "eu-central-1" }
    })]
  })]).eligible, false);
  assert.equal(eligibility({}, [v2Candidate({
    v2LambdaResultEvents: [verifiedV2LambdaResult({
      artifactPointers: {
        scanArtifactUri: "s3://ws01-scan-artifacts-199536052647-eu-central-1/v2-dag-lambda/prod/scan-123/CanonicalEvidenceBundle.json"
      }
    })]
  })]).eligible, false);
  assert.equal(eligibility({}, [v2Candidate({ v2ReportProcessor: "other-processor" })]).eligible, false);
  assert.equal(eligibility({}, [v2Candidate({ v2ParallelArtifactOnly: false })]).eligible, false);
});

test("verified v2 evidence does not bypass time, scope, target, coverage, or scan-type constraints", () => {
  assert.equal(eligibility({}, [v2Candidate({ completedAt: "2026-07-10T11:59:59.999Z" })]).eligible, false);
  assert.equal(eligibility({}, [v2Candidate({ organizationId: OTHER_ORG })]).eligible, false);
  assert.equal(eligibility({}, [v2Candidate({
    hostname: "other.example",
    normalizedUrl: "https://other.example/"
  })]).eligible, false);
  assert.equal(eligibility({ minPagesRequested: 5 }, [v2Candidate({ pagesRequested: 4 })]).eligible, false);
  assert.equal(eligibility({}, [v2Candidate({ scanType: "preview" })]).eligible, false);
});

test("newest eligible scan wins when several candidates qualify", () => {
  const result = eligibility({}, [
    candidate({ completedAt: "2026-07-11T10:00:00.000Z", id: "older" }),
    candidate({ completedAt: "2026-07-11T11:30:00.000Z", id: "newer" }),
    candidate({ completedAt: "2026-07-11T11:45:00.000Z", id: "newest-but-wrong-location", scanFrom: "eu_de" })
  ]);
  assert.equal(result.eligible, true);
  assert.equal(result.candidate?.id, "newer");
});

test("default decision reuses while explicit Fresh re-scan queues without an eligibility lookup", async () => {
  let lookupCount = 0;
  const getEligibility = async () => {
    lookupCount += 1;
    return eligibility({}, [candidate()]);
  };

  const reused = await resolveRecentScanReuseDecision(baseInput, { getEligibility });
  const refreshed = await resolveRecentScanReuseDecision({ ...baseInput, forceNewScan: true }, { getEligibility });

  assert.equal(reused.action, "reuse");
  assert.equal(refreshed.action, "queue_fresh");
  assert.equal(refreshed.reason, "fresh_rescan_requested");
  assert.equal(lookupCount, 1);
});

test("omitted or false Fresh re-scan value does not bypass reuse", async () => {
  const getEligibility = async () => eligibility({}, [candidate()]);
  assert.equal((await resolveRecentScanReuseDecision(baseInput, { getEligibility })).action, "reuse");
  assert.equal((await resolveRecentScanReuseDecision({ ...baseInput, forceNewScan: false }, { getEligibility })).action, "reuse");
});

test("creation and availability can execute the identical shared eligibility contract", async () => {
  const candidates = [candidate({ id: "shared-result" })];
  const loadCandidates = async () => candidates;
  const availability = await getRecentScanReuseEligibility(baseInput, { loadCandidates });
  const creation = await resolveRecentScanReuseDecision(baseInput, {
    getEligibility: (input) => getRecentScanReuseEligibility(input, { loadCandidates })
  });

  assert.equal(availability.eligible, true);
  assert.equal(availability.candidate?.id, "shared-result");
  assert.equal(creation.action, "reuse");
  assert.equal(creation.action === "reuse" ? creation.eligibility.candidate.id : null, "shared-result");
});

test("a second default request suppresses fresh work while Fresh re-scan permits it", async () => {
  let dispatchCount = 1;
  const getEligibility = async () => eligibility({}, [candidate({ id: "first-scan" })]);

  const defaultDecision = await resolveRecentScanReuseDecision(baseInput, { getEligibility });
  if (defaultDecision.action === "queue_fresh") dispatchCount += 1;
  assert.equal(defaultDecision.action, "reuse");
  assert.equal(dispatchCount, 1);

  const freshDecision = await resolveRecentScanReuseDecision({ ...baseInput, forceNewScan: true }, { getEligibility });
  if (freshDecision.action === "queue_fresh") dispatchCount += 1;
  assert.equal(freshDecision.action, "queue_fresh");
  assert.equal(dispatchCount, 2);
});
