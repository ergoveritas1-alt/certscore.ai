import assert from "node:assert/strict";
import test from "node:test";
import { parseReviewEvidenceJsonl, validateTrancoReviewExport } from "./validate-tranco-review-export";

function indexRow(overrides: Record<string, unknown> = {}) {
  return {
    accessPostureClass: "reachable_public",
    domain: "example.com",
    evidenceDetailBlockCount: 1,
    normalizedUrl: "https://example.com/",
    pagesScanned: 2,
    projectedTopFindingCount: 1,
    publicUrls: {
      scanReport: "https://certscore.ai/scan/scan-1",
      scanStatusApi: "https://certscore.ai/api/scan-status/scan-1?includeFindings=1"
    },
    scanId: "scan-1",
    scanOutcome: "completed",
    scanStatus: "completed",
    ...overrides
  };
}

function evidenceRow(overrides: Record<string, unknown> = {}) {
  return {
    accessPostureClass: "reachable_public",
    domain: "example.com",
    normalizedUrl: "https://example.com/",
    pagesScanned: 2,
    projectedTopFindingCount: 1,
    projectedTopFindings: [
      {
        id: "pre_consent_tracking_detected",
        label: "Tracking before consent"
      }
    ],
    publicUrls: {
      scanReport: "https://certscore.ai/scan/scan-1",
      scanStatusApi: "https://certscore.ai/api/scan-status/scan-1?includeFindings=1"
    },
    reportFacingEvidence: {
      detailedReviewJsonBlocks: [
        {
          ok: true,
          json: {
            evidenceDetails: {
              timing: {
                firstThirdPartyTrackingRequestMs: 120
              }
            },
            id: "pre_consent_tracking_detected",
            topFindingEligibility: {
              eligibility: "projected"
            }
          }
        }
      ],
      evidenceDetails: [
        {
          ok: true,
          json: {
            evidenceDetails: {
              timing: {
                firstThirdPartyTrackingRequestMs: 120
              }
            },
            id: "pre_consent_tracking_detected",
            topFindingEligibility: {
              eligibility: "projected"
            }
          }
        }
      ],
      projectedTopFindingEvidenceBlocks: [
        {
          id: "pre_consent_tracking_detected",
          topFindingEligibility: {
            eligibility: "projected"
          }
        }
      ],
      scanCalibrationSummary: {
        domain: "example.com"
      },
      scanSurfacingTrace: {
        topFindings: ["pre_consent_tracking_detected"]
      },
      topFindingUniverseReferencedBlocks: [
        {
          id: "pre_consent_tracking_detected"
        }
      ]
    },
    scanId: "scan-1",
    scanOutcome: "completed",
    scanStatus: "completed",
    ...overrides
  };
}

function indexPayload(rows: Record<string, unknown>[]) {
  return {
    rows,
    summary: {
      selectedCount: rows.length,
      targetsWithLatestScan: rows.filter((row) => row.scanId).length
    }
  };
}

test("tranco review export validator accepts aligned populated index and JSONL rows", () => {
  const result = validateTrancoReviewExport({
    evidenceRows: [evidenceRow()],
    index: indexPayload([indexRow()])
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
  assert.equal(result.reviewerAuditSummary.completedScansWithJsonlLine, 1);
  assert.equal(result.reviewerAuditSummary.projectedScansWithFullFindingIds, 1);
});

test("tranco review export validator rejects placeholder-only JSONL when scans exist", () => {
  const result = validateTrancoReviewExport({
    evidenceRows: [
      {
        domain: null,
        normalizedUrl: null,
        projectedTopFindingCount: 0,
        projectedTopFindings: [],
        reportFacingEvidence: {
          evidenceDetails: [],
          projectedTopFindingEvidenceBlocks: []
        },
        scanId: null
      }
    ],
    index: indexPayload([indexRow()])
  });

  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => /placeholder-only/i.test(error)));
});

test("tranco review export validator rejects projected scans without full finding IDs", () => {
  const result = validateTrancoReviewExport({
    evidenceRows: [
      evidenceRow({
        projectedTopFindings: []
      })
    ],
    index: indexPayload([indexRow()])
  });

  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => /missing projectedTopFindings IDs/i.test(error)));
  assert.ok(result.errors.some((error) => /Projected finding count mismatch/i.test(error)));
});

test("tranco review export validator rejects sensitive-surface packets without structured reviewer fields", () => {
  const result = validateTrancoReviewExport({
    evidenceRows: [
      evidenceRow({
        projectedTopFindings: [{ id: "sensitive_data_collection_with_third_party_tracking_present" }],
        reportFacingEvidence: {
          evidenceDetails: [
            {
              ok: true,
              json: {
                evidenceDetails: {
                  sensitiveDataEvidence: {
                    fieldTypes: ["email"]
                  }
                },
                id: "sensitive_data_collection_with_third_party_tracking_present"
              }
            }
          ],
          projectedTopFindingEvidenceBlocks: [
            {
              evidenceDetails: {
                sensitiveDataEvidence: {
                  fieldTypes: ["email"]
                }
              },
              id: "sensitive_data_collection_with_third_party_tracking_present"
            }
          ]
        }
      })
    ],
    index: indexPayload([indexRow({
      projectedTopFindingCount: 1
    })])
  });

  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => /Sensitive-surface packet is missing structured/i.test(error)));
});

test("tranco review export validator parses JSONL rows", () => {
  const rows = parseReviewEvidenceJsonl(`${JSON.stringify(evidenceRow())}\n`);

  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.scanId, "scan-1");
});
