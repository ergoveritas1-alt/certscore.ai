import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import {
  SCAN_NO_GO_REASON_CODES,
  SCAN_NO_GO_REASON_PRESENTATIONS
} from "@website-signal-risk-scanner/shared";
import type { GdprEprivacyCoverageChecklistItem } from "../../lib/scans/gdpr-eprivacy-coverage-checklist";

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

test("pre-consent inventory keeps retained counts visible in the widened purpose column", () => {
  const source = readFileSync("apps/web/components/scans/shared-scan-detail-view.tsx", "utf8");

  assert.match(source, /\{presentationState\.message\}/);
  assert.match(source, /data-runtime-inventory-state=\{presentationState\.status\}/);
  assert.match(source, /presentationState=\{scanReportRenderProjection\.runtimeInventoryPresentation\}/);
  assert.match(source, /projection=\{scanReportRenderProjection\.runtimeInventory\}/);
  assert.doesNotMatch(source, /<td[^>]*>No retained cookies or trackers were detected for this scan\.<\/td>/);
  assert.doesNotMatch(source, /No retained cookie or tracker rows for this scan\./);
  assert.match(source, /\["Type", "Vendor", "Purpose", "Evidence", "First seen", "Cookie name\(s\)", "Domain", "Destination", "Confidence", "Relationship", "Category", "Priority"\]/);
  assert.match(source, /label="Vendor"[\s\S]*label="Purpose"[\s\S]*>Evidence<\/[a-z]+>[\s\S]*>Relationship<\/[a-z]+>[\s\S]*>Category<\/[a-z]+>/);
  assert.doesNotMatch(source, /label="Count"/);
  assert.match(source, /w-\[165px\]/);
  assert.match(source, /<span className="shrink-0">\(\{row\.observedRecordCount\}\)<\/span>/);
  assert.match(source, /formatInventoryPurposeWithCount\(row\)/);
  assert.match(source, /`\$\{getInventoryPurposeLabel\(row\)\}\(\$\{row\.observedRecordCount\}\)`/);
  assert.doesNotMatch(source, />Req\.<\/[a-z]+>/);
  assert.doesNotMatch(source, /"Requests"/);
});

test("site relationship doughnut is derived directly from canonical site relationships", async () => {
  const { buildInventoryPartyAttributionSegments } = await import("./shared-scan-detail-view");
  const segments = buildInventoryPartyAttributionSegments([
    { siteRelationship: "same_site" },
    { siteRelationship: "cross_site" },
    { siteRelationship: "cross_site" },
    { siteRelationship: "mixed" },
    { siteRelationship: "unknown" }
  ]);

  assert.deepEqual(
    segments.map(({ count, filter, label }) => ({ count, filter, label })),
    [
      { count: 1, filter: "same_site", label: "Same-site" },
      { count: 2, filter: "cross_site", label: "Cross-site" },
      { count: 1, filter: "mixed", label: "Mixed" },
      { count: 1, filter: "unknown", label: "Unknown" }
    ]
  );

  const rawSegments = buildInventoryPartyAttributionSegments([
    { observedRecordCount: 5, siteRelationship: "same_site" },
    { observedRecordCount: 3, siteRelationship: "cross_site" },
    { observedRecordCount: 1, siteRelationship: "mixed" }
  ]);
  assert.deepEqual(rawSegments.map(({ count }) => count), [5, 3, 1, 0]);

  const source = readFileSync("apps/web/components/scans/shared-scan-detail-view.tsx", "utf8");
  assert.match(source, />Site relationship</);
  assert.match(source, /aria-label="Site relationship distribution"/);
  assert.match(source, /<div className="grid min-w-0 flex-1 gap-2">/);
  assert.doesNotMatch(source, />Priority mix</);
});

test("customer-facing scan detail prefers the persisted canonical projection score", () => {
  const source = readFileSync("apps/web/components/scans/shared-scan-detail-view.tsx", "utf8");

  assert.match(source, /deriveCanonicalOverallScoreForReport/);
  assert.doesNotMatch(source, /buildCanonicalShadowScoreInput|deriveCanonicalShadowScore|getCustomerFacingGdprEprivacyPostureAssessment/);
  assert.match(source, /scoreLabel="Overall score"/);
  assert.match(source, /persistedCanonicalOverallScore = getFiniteNumber\(snapshot\?\.certscore_overall\)/);
  assert.match(source, /persistedCanonicalOverallScore \?\? canonicalOverallScore/);
});

test("pre-consent inventory exposes retained cookie metadata and all three data-flow layers", () => {
  const source = readFileSync("apps/web/components/scans/shared-scan-detail-view.tsx", "utf8");
  const tableEnd = source.indexOf("</table>");
  const dataFlowSummary = source.indexOf("<PreConsentDataFlowSummary");

  assert.match(source, /Show retained vendor evidence/);
  assert.match(source, /<InventoryTypeIcon emphasized type=/);
  assert.match(source, /<InventoryTypeIcon emphasized type=\{row\.type\} \/>/);
  assert.doesNotMatch(source, /row\.cookieDetails\.length > 0 \? "cookie" : row\.type/);
  assert.match(source, /getInventoryTypeDisclosureClasses\(row\)/);
  assert.match(source, /border-sky-300/);
  assert.match(source, /to-red-50\/70/);
  assert.match(source, /to-amber-50\/70/);
  assert.match(source, /to-blue-50\/70/);
  assert.match(source, /bg-slate-100/);
  assert.match(source, /ring-slate-200/);
  assert.match(source, />&gt;12 months</);
  assert.match(source, />Lifespan</);
  assert.match(source, />Data types</);
  assert.match(source, />Initiator chain</);
  assert.match(source, /Server locations are CDN-edge observations/);
  assert.match(source, /Controlling HQ not identified/);
  assert.match(source, /Controlling entity:/);
  assert.match(source, /Transfer mechanism:/);
  assert.match(source, /Cookie values are redacted/);
  assert.ok(tableEnd >= 0 && dataFlowSummary > tableEnd, "data-flow summary should render below the inventory table");
});

test("getRecordOptionalBoolean preserves explicit incomplete coverage without penalizing legacy snapshots", async () => {
  const sharedScanDetailViewModule = await import("./shared-scan-detail-view");
  const getRecordOptionalBoolean = (
    sharedScanDetailViewModule as unknown as {
      getRecordOptionalBoolean: (record: unknown, key: string) => boolean | null;
    }
  ).getRecordOptionalBoolean;

  assert.equal(getRecordOptionalBoolean({ critical_coverage_complete: false }, "critical_coverage_complete"), false);
  assert.equal(getRecordOptionalBoolean({ critical_coverage_complete: true }, "critical_coverage_complete"), true);
  assert.equal(getRecordOptionalBoolean({}, "critical_coverage_complete"), null);
});

test("buildExecutiveTimelineEvents never labels a generic first-party request as a 3P request", async () => {
  const { buildExecutiveTimelineEvents } = await import("./shared-scan-detail-view");
  const firstPartyOnly = buildExecutiveTimelineEvents({
    hybridRuntimeEvidence: {
      timelineMarkers: { firstRequestMs: 530 },
      requestObservations: [{
        domain: "worldnic.example",
        thirdParty: false,
        timestampMs: 530,
      }],
    },
  });
  assert.equal(firstPartyOnly.some((event) => event.label === "3P request"), false);

  const withThirdParty = buildExecutiveTimelineEvents({
    hybridRuntimeEvidence: {
      timelineMarkers: { firstThirdPartyRequestMs: 820 },
      requestObservations: [{
        domain: "analytics.vendor.test",
        thirdParty: true,
        timestampMs: 820,
      }],
    },
  });
  assert.equal(withThirdParty.find((event) => event.label === "3P request")?.atMs, 820);
});

test("buildExecutiveTimelineEvents does not infer fingerprinting from raw browser API access", async () => {
  const { buildExecutiveTimelineEvents } = await import("./shared-scan-detail-view");
  const events = buildExecutiveTimelineEvents({
    hybridRuntimeEvidence: {
      fingerprintingRuntimeEvidence: [
        { timestampMs: 21300, fingerprintingSignals: ["canvas"] },
        { timestampMs: 21400, host: "nvidia.com", fingerprintingSignals: ["webgl"] }
      ],
      fingerprintingEvidenceSummary: { strongCorroboratorObserved: false }
    }
  });
  assert.equal(events.some((event) => /fingerprint|device-signal/i.test(event.label)), false);
});

test("buildExecutiveTimelineEvents requires concrete corroboration for fingerprinting and retained embedded inventory", async () => {
  const { buildExecutiveTimelineEvents } = await import("./shared-scan-detail-view");
  const unsupported = buildExecutiveTimelineEvents({
    hybridRuntimeEvidence: {
      embeddedContentSummary: { embeddedContentObserved: false, observations: [] },
      iframeSummary: { iframeEvents: [] },
      fingerprintingRuntimeEvidence: [{ timestampMs: 24200, host: "example.test" }],
      fingerprintingEvidenceSummary: { strongCorroboratorObserved: false }
    }
  });
  assert.equal(unsupported.some((event) => event.label === "Embedded content"), false);
  assert.equal(unsupported.some((event) => event.label === "Fingerprinting"), false);

  const corroborated = buildExecutiveTimelineEvents(
    {
      hybridRuntimeEvidence: {
        embeddedContentSummary: {
          embeddedContentObserved: true,
          observations: [{ requestUrl: "https://player.example/media", timestampMs: 4100, preConsent: true }]
        },
        fingerprintingRuntimeEvidence: [{ requestUrl: "https://scripts.example/fp.js", timestampMs: 3200 }],
        fingerprintingEvidenceSummary: { strongCorroboratorObserved: true }
      }
    },
    [{
      criticalEvidence: {
        retainedEvidence: {
          browserDeviceEntropyEvidence: {
            assessmentStrength: "corroborated_collection",
            firstObservedMs: 3200
          }
        }
      },
      id: "device_identification_fingerprinting_signal_observed",
      status: "Review signal"
    }]
  );
  assert.equal(corroborated.find((event) => event.label === "Fingerprinting review signal")?.atMs, 3200);
  assert.equal(corroborated.find((event) => event.label === "Embedded content")?.atMs, 4100);
});

test("buildExecutiveTimelineEvents retains a structured custom consent-surface milestone", async () => {
  const { buildExecutiveTimelineEvents } = await import("./shared-scan-detail-view");
  const events = buildExecutiveTimelineEvents({
    hybridRuntimeEvidence: {
      timelineMarkers: { firstConsentSurfaceVisibleMs: 1_420 },
      consentSummary: {
        bannerPresent: true,
        controls: ["Manage", "Reject", "Accept"],
        firstLayer: true,
        observedAtMs: 1_420
      },
      embeddedContentSummary: { embeddedContentObserved: false, observations: [] },
      fingerprintingRuntimeEvidence: [{ timestampMs: 19_100, fingerprintingSignals: ["Navigator.plugins", "Navigator.mimeTypes"] }],
      fingerprintingEvidenceSummary: { strongCorroboratorObserved: false }
    }
  });

  assert.equal(events.find((event) => event.label === "Consent banner")?.atMs, 1_420);
  assert.equal(events.some((event) => event.label === "Embedded content"), false);
  assert.equal(events.some((event) => /fingerprint|device-signal/i.test(event.label)), false);
});

async function loadBuildScanReportUnifiedFindings() {
  const sharedScanDetailViewImport = await import("./shared-scan-detail-view");
  const sharedScanDetailViewModule = (
    sharedScanDetailViewImport as unknown as {
      default?: Record<string, unknown>;
      "module.exports"?: Record<string, unknown>;
      buildScanReportUnifiedFindings?: unknown;
    }
  ).buildScanReportUnifiedFindings
    ? (sharedScanDetailViewImport as unknown as Record<string, unknown>)
    : (
        sharedScanDetailViewImport as unknown as {
          default?: Record<string, unknown>;
          "module.exports"?: Record<string, unknown>;
        }
      ).default ??
      (
        sharedScanDetailViewImport as unknown as {
          default?: Record<string, unknown>;
          "module.exports"?: Record<string, unknown>;
        }
      )["module.exports"] ??
      (sharedScanDetailViewImport as unknown as Record<string, unknown>);

  return (sharedScanDetailViewModule as unknown as {
    buildScanReportUnifiedFindings: (scanRecord: Record<string, unknown>) => Array<Record<string, unknown>>;
  }).buildScanReportUnifiedFindings;
}

async function loadFilterContradictoryPositiveSurfaceFindings() {
  const sharedScanDetailViewImport = await import("./shared-scan-detail-view");
  const sharedScanDetailViewModule = (
    sharedScanDetailViewImport as unknown as {
      default?: Record<string, unknown>;
      "module.exports"?: Record<string, unknown>;
      filterContradictoryPositiveSurfaceFindings?: unknown;
    }
  ).filterContradictoryPositiveSurfaceFindings
    ? (sharedScanDetailViewImport as unknown as Record<string, unknown>)
    : (
        sharedScanDetailViewImport as unknown as {
          default?: Record<string, unknown>;
          "module.exports"?: Record<string, unknown>;
        }
      ).default ??
      (
        sharedScanDetailViewImport as unknown as {
          default?: Record<string, unknown>;
          "module.exports"?: Record<string, unknown>;
        }
      )["module.exports"] ??
      (sharedScanDetailViewImport as unknown as Record<string, unknown>);

  return (sharedScanDetailViewModule as unknown as {
    filterContradictoryPositiveSurfaceFindings: (findings: Array<Record<string, unknown>>) => Array<Record<string, unknown>>;
  }).filterContradictoryPositiveSurfaceFindings;
}

async function loadHasIncompleteScanCoverage() {
  const sharedScanDetailViewImport = await import("./shared-scan-detail-view");
  const sharedScanDetailViewModule = (
    sharedScanDetailViewImport as unknown as {
      default?: Record<string, unknown>;
      "module.exports"?: Record<string, unknown>;
      hasIncompleteScanCoverage?: unknown;
    }
  ).hasIncompleteScanCoverage
    ? (sharedScanDetailViewImport as unknown as Record<string, unknown>)
    : (
        sharedScanDetailViewImport as unknown as {
          default?: Record<string, unknown>;
          "module.exports"?: Record<string, unknown>;
        }
      ).default ??
      (
        sharedScanDetailViewImport as unknown as {
          default?: Record<string, unknown>;
          "module.exports"?: Record<string, unknown>;
        }
      )["module.exports"] ??
      (sharedScanDetailViewImport as unknown as Record<string, unknown>);

  return (sharedScanDetailViewModule as unknown as {
    hasIncompleteScanCoverage: (scanRecord: Record<string, unknown>) => boolean;
  }).hasIncompleteScanCoverage;
}

async function loadShouldShowRegulatoryChecklistSection() {
  const sharedScanDetailViewImport = await import("./shared-scan-detail-view");
  const sharedScanDetailViewModule = (
    sharedScanDetailViewImport as unknown as {
      default?: Record<string, unknown>;
      "module.exports"?: Record<string, unknown>;
      shouldShowRegulatoryChecklistSection?: unknown;
    }
  ).shouldShowRegulatoryChecklistSection
    ? (sharedScanDetailViewImport as unknown as Record<string, unknown>)
    : (
        sharedScanDetailViewImport as unknown as {
          default?: Record<string, unknown>;
          "module.exports"?: Record<string, unknown>;
        }
      ).default ??
      (
        sharedScanDetailViewImport as unknown as {
          default?: Record<string, unknown>;
          "module.exports"?: Record<string, unknown>;
        }
      )["module.exports"] ??
      (sharedScanDetailViewImport as unknown as Record<string, unknown>);

  return (sharedScanDetailViewModule as unknown as {
    shouldShowRegulatoryChecklistSection: (input: {
      executiveAccessLimitationNotice: { finding: { id: string } } | null;
    }) => boolean;
  }).shouldShowRegulatoryChecklistSection;
}

async function loadTrackerConsentReviewPriority() {
  const sharedScanDetailViewImport = await import("./shared-scan-detail-view");
  const sharedScanDetailViewModule = (
    sharedScanDetailViewImport as unknown as {
      default?: Record<string, unknown>;
      "module.exports"?: Record<string, unknown>;
      getTrackerConsentReviewPriority?: unknown;
    }
  ).getTrackerConsentReviewPriority
    ? (sharedScanDetailViewImport as unknown as Record<string, unknown>)
    : (
        sharedScanDetailViewImport as unknown as {
          default?: Record<string, unknown>;
          "module.exports"?: Record<string, unknown>;
        }
      ).default ??
      (
        sharedScanDetailViewImport as unknown as {
          default?: Record<string, unknown>;
          "module.exports"?: Record<string, unknown>;
        }
      )["module.exports"] ??
      (sharedScanDetailViewImport as unknown as Record<string, unknown>);

  return (sharedScanDetailViewModule as unknown as {
    getTrackerConsentReviewPriority: (row: Record<string, unknown>) => string;
  }).getTrackerConsentReviewPriority;
}

async function loadHomepagePreviewGateIdleLabel() {
  const sharedScanDetailViewImport = await import("./shared-scan-detail-view");
  const sharedScanDetailViewModule = (
    sharedScanDetailViewImport as unknown as {
      default?: Record<string, unknown>;
      "module.exports"?: Record<string, unknown>;
      getHomepagePreviewGateIdleLabel?: unknown;
    }
  ).getHomepagePreviewGateIdleLabel
    ? (sharedScanDetailViewImport as unknown as Record<string, unknown>)
    : (
        sharedScanDetailViewImport as unknown as {
          default?: Record<string, unknown>;
          "module.exports"?: Record<string, unknown>;
        }
      ).default ??
      (
        sharedScanDetailViewImport as unknown as {
          default?: Record<string, unknown>;
          "module.exports"?: Record<string, unknown>;
        }
      )["module.exports"] ??
      (sharedScanDetailViewImport as unknown as Record<string, unknown>);

  return (sharedScanDetailViewModule as unknown as {
    getHomepagePreviewGateIdleLabel: (href: string) => string;
  }).getHomepagePreviewGateIdleLabel;
}

async function loadExecutiveSummaryScanCondition() {
  const sharedScanDetailViewImport = await import("./shared-scan-detail-view");
  const sharedScanDetailViewModule =
    (sharedScanDetailViewImport as unknown as { deriveExecutiveSummaryScanCondition?: unknown; deriveUnverifiedHomepageReview?: unknown })
      .deriveExecutiveSummaryScanCondition
      ? (sharedScanDetailViewImport as unknown as Record<string, unknown>)
      : (
          sharedScanDetailViewImport as unknown as {
            default?: Record<string, unknown>;
            "module.exports"?: Record<string, unknown>;
          }
        ).default ??
        (
          sharedScanDetailViewImport as unknown as {
            default?: Record<string, unknown>;
            "module.exports"?: Record<string, unknown>;
          }
        )["module.exports"] ??
        (sharedScanDetailViewImport as unknown as Record<string, unknown>);

  return (sharedScanDetailViewModule as unknown as {
    deriveExecutiveSummaryScanCondition: (snapshot: Record<string, unknown>) => string | null;
  }).deriveExecutiveSummaryScanCondition;
}

async function loadExecutiveSummaryBadgeCounts() {
  const sharedScanDetailViewImport = await import("./shared-scan-detail-view");
  const sharedScanDetailViewModule =
    (sharedScanDetailViewImport as unknown as { deriveExecutiveSummaryBadgeCounts?: unknown })
      .deriveExecutiveSummaryBadgeCounts
      ? (sharedScanDetailViewImport as unknown as Record<string, unknown>)
      : (
          sharedScanDetailViewImport as unknown as {
            default?: Record<string, unknown>;
            "module.exports"?: Record<string, unknown>;
          }
        ).default ??
        (
          sharedScanDetailViewImport as unknown as {
            default?: Record<string, unknown>;
            "module.exports"?: Record<string, unknown>;
          }
        )["module.exports"] ??
        (sharedScanDetailViewImport as unknown as Record<string, unknown>);

  return (sharedScanDetailViewModule as unknown as {
    deriveExecutiveSummaryBadgeCounts: (
      findings: Array<{
        details?: { family?: string };
        presentationDecision: { status: string };
        surfacingDecision?: { decisionState?: string; reportLane?: string };
        unifiedFindingId: string;
      }>
    ) => {
      contradictionCount: number;
      preconsentConflictCount: number;
    };
  }).deriveExecutiveSummaryBadgeCounts;
}

async function loadExecutiveSummaryThemeHelpers() {
  const sharedScanDetailViewImport = await import("./shared-scan-detail-view");
  const sharedScanDetailViewModule =
    (
      sharedScanDetailViewImport as unknown as {
        deriveAgencyAdvisoryThemes?: unknown;
        deriveExecutiveSummaryThemeNarrative?: unknown;
      }
    ).deriveAgencyAdvisoryThemes
      ? (sharedScanDetailViewImport as unknown as Record<string, unknown>)
      : (
          sharedScanDetailViewImport as unknown as {
            default?: Record<string, unknown>;
            "module.exports"?: Record<string, unknown>;
          }
        ).default ??
        (
          sharedScanDetailViewImport as unknown as {
            default?: Record<string, unknown>;
            "module.exports"?: Record<string, unknown>;
          }
        )["module.exports"] ??
        (sharedScanDetailViewImport as unknown as Record<string, unknown>);

  return sharedScanDetailViewModule as unknown as {
    deriveAgencyAdvisoryThemes: (findings: Array<{ details?: { family?: string } }>) => string[];
    deriveExecutiveSummaryThemeNarrative: (themes: string[]) => string;
  };
}

async function loadSharedScanDetailGdprEprivacyCoverageChecklist() {
  const sharedScanDetailViewImport = await import("./shared-scan-detail-view");
  const sharedScanDetailViewModule =
    (sharedScanDetailViewImport as unknown as { deriveSharedScanDetailGdprEprivacyCoverageChecklist?: unknown })
      .deriveSharedScanDetailGdprEprivacyCoverageChecklist
      ? (sharedScanDetailViewImport as unknown as Record<string, unknown>)
      : (
          sharedScanDetailViewImport as unknown as {
            default?: Record<string, unknown>;
            "module.exports"?: Record<string, unknown>;
          }
        ).default ??
        (
          sharedScanDetailViewImport as unknown as {
            default?: Record<string, unknown>;
            "module.exports"?: Record<string, unknown>;
          }
        )["module.exports"] ??
        (sharedScanDetailViewImport as unknown as Record<string, unknown>);

  return (sharedScanDetailViewModule as unknown as {
    deriveSharedScanDetailGdprEprivacyCoverageChecklist: (input: {
      coverageLimited: boolean;
      events?: unknown[];
      policyEnrichmentCount: number;
      projectedFindings?: unknown[];
      runtimeArtifacts: Record<string, unknown> | null;
      runtimeCookieRows?: unknown[];
      runtimeTrackerPriorityRows?: unknown[];
      scanCompleted: boolean;
      snapshot: Record<string, unknown> | null;
      unifiedFindings: unknown[];
    }) => Array<{
      criticalEvidence: { retainedEvidence: Record<string, unknown> };
      id: string;
      status: string;
    }>;
  }).deriveSharedScanDetailGdprEprivacyCoverageChecklist;
}

async function loadFindingEvidenceQualitySummary() {
  const sharedScanDetailViewImport = await import("./shared-scan-detail-view");
  const sharedScanDetailViewModule =
    (sharedScanDetailViewImport as unknown as { deriveFindingEvidenceQualitySummary?: unknown })
      .deriveFindingEvidenceQualitySummary
      ? (sharedScanDetailViewImport as unknown as Record<string, unknown>)
      : (
          sharedScanDetailViewImport as unknown as {
            default?: Record<string, unknown>;
            "module.exports"?: Record<string, unknown>;
          }
        ).default ??
        (
          sharedScanDetailViewImport as unknown as {
            default?: Record<string, unknown>;
            "module.exports"?: Record<string, unknown>;
          }
        )["module.exports"] ??
        (sharedScanDetailViewImport as unknown as Record<string, unknown>);

  return (sharedScanDetailViewModule as unknown as {
    deriveFindingEvidenceQualitySummary: (
      findings: Array<{
        presentationDecision: {
          status: string;
          verificationState: string;
        };
      }>
    ) => {
      auditOnlyCount: number;
      blockedCount: number;
      discoveredCount: number;
      runtimeCount: number;
      triageCount: number;
      verifiedCount: number;
    };
  }).deriveFindingEvidenceQualitySummary;
}

async function loadFindingEvidenceDiagnosticRows() {
  const sharedScanDetailViewImport = await import("./shared-scan-detail-view");
  const sharedScanDetailViewModule =
    (sharedScanDetailViewImport as unknown as { deriveFindingEvidenceDiagnosticRows?: unknown })
      .deriveFindingEvidenceDiagnosticRows
      ? (sharedScanDetailViewImport as unknown as Record<string, unknown>)
      : (
          sharedScanDetailViewImport as unknown as {
            default?: Record<string, unknown>;
            "module.exports"?: Record<string, unknown>;
          }
        ).default ??
        (
          sharedScanDetailViewImport as unknown as {
            default?: Record<string, unknown>;
            "module.exports"?: Record<string, unknown>;
          }
        )["module.exports"] ??
        (sharedScanDetailViewImport as unknown as Record<string, unknown>);

  return (sharedScanDetailViewModule as unknown as {
    deriveFindingEvidenceDiagnosticRows: (
      findings: Array<{
        concernContext?: { negativeEvidenceFlags?: string[] };
        evidence?: { fetchQuality?: string | null };
        presentation: { findingName: string };
        presentationDecision: {
          status: string;
          verificationLabel: string;
        };
        surfacingDecision: {
          decisionState: string;
          reportLane: string;
        };
      }>
    ) => Array<{
      decisionState: string;
      fetchQuality: string | null;
      findingName: string;
      negativeEvidenceFlags: string[];
      reportLane: string;
      status: string;
      verificationLabel: string;
    }>;
  }).deriveFindingEvidenceDiagnosticRows;
}

async function loadUnverifiedHomepageReview() {
  const sharedScanDetailViewImport = await import("./shared-scan-detail-view");
  const sharedScanDetailViewModule =
    (sharedScanDetailViewImport as unknown as { deriveUnverifiedHomepageReview?: unknown })
      .deriveUnverifiedHomepageReview
      ? (sharedScanDetailViewImport as unknown as Record<string, unknown>)
      : (
          sharedScanDetailViewImport as unknown as {
            default?: Record<string, unknown>;
            "module.exports"?: Record<string, unknown>;
          }
        ).default ??
        (
          sharedScanDetailViewImport as unknown as {
            default?: Record<string, unknown>;
            "module.exports"?: Record<string, unknown>;
          }
        )["module.exports"] ??
        (sharedScanDetailViewImport as unknown as Record<string, unknown>);

  return (sharedScanDetailViewModule as unknown as {
    deriveUnverifiedHomepageReview: (
      snapshot: Record<string, unknown>,
      scanEvents?: Array<{ eventType: string; message: string; metadataJson: unknown }>,
      policyEnrichments?: Array<Record<string, unknown>>
    ) =>
      | {
          coverageLabel: string;
          guidance: string[];
          message: string;
          outcomeTitle: string;
          recommendationTitle: string;
          reason: string;
          title: string;
          verifiedPolicyInsights: Array<{
            flags: string[];
            pageLabel: string;
            pageUrl: string | null;
            summary: string | null;
            topics: string[];
          }>;
          verifiedSurfaces: string[];
          whatThisMeans: string[];
        }
      | null;
  }).deriveUnverifiedHomepageReview;
}

async function loadDeriveExecutivePolicySurfaces() {
  const sharedScanDetailViewImport = await import("./shared-scan-detail-view");
  const sharedScanDetailViewModule =
    (sharedScanDetailViewImport as unknown as { deriveExecutivePolicySurfaces?: unknown })
      .deriveExecutivePolicySurfaces
      ? (sharedScanDetailViewImport as unknown as Record<string, unknown>)
      : (
          sharedScanDetailViewImport as unknown as {
            default?: Record<string, unknown>;
            "module.exports"?: Record<string, unknown>;
          }
        ).default ??
        (
          sharedScanDetailViewImport as unknown as {
            default?: Record<string, unknown>;
            "module.exports"?: Record<string, unknown>;
          }
        )["module.exports"] ??
        (sharedScanDetailViewImport as unknown as Record<string, unknown>);

  return (sharedScanDetailViewModule as unknown as {
    deriveExecutivePolicySurfaces: (
      policyEnrichments: Array<Record<string, unknown>>,
      snapshot?: Record<string, unknown> | null,
      runtimeArtifacts?: Record<string, unknown> | null,
      checklistRows?: GdprEprivacyCoverageChecklistItem[] | null,
      requestedDomain?: string | null
    ) => Array<{ details: string[]; pageLabel: string; pageUrl: string | null }>;
  }).deriveExecutivePolicySurfaces;
}

async function loadExecutiveAccessLimitationNotice() {
  const sharedScanDetailViewImport = await import("./shared-scan-detail-view");
  const sharedScanDetailViewModule =
    (sharedScanDetailViewImport as unknown as { deriveExecutiveAccessLimitationNotice?: unknown })
      .deriveExecutiveAccessLimitationNotice
      ? (sharedScanDetailViewImport as unknown as Record<string, unknown>)
      : (
          sharedScanDetailViewImport as unknown as {
            default?: Record<string, unknown>;
            "module.exports"?: Record<string, unknown>;
          }
        ).default ??
        (
          sharedScanDetailViewImport as unknown as {
            default?: Record<string, unknown>;
            "module.exports"?: Record<string, unknown>;
          }
        )["module.exports"] ??
        (sharedScanDetailViewImport as unknown as Record<string, unknown>);

  return (sharedScanDetailViewModule as unknown as {
    deriveExecutiveAccessLimitationNotice: (
      snapshot: Record<string, unknown>,
      scanEvents?: Array<{ eventType: string; message: string; metadataJson: unknown }>,
      policyEnrichments?: Array<Record<string, unknown>>
    ) =>
      | {
          summary: string;
          finding: { label: string; shortSummary: string };
          review: { coverageLabel: string; outcomeTitle: string; reason: string; title: string };
        }
      | null;
  }).deriveExecutiveAccessLimitationNotice;
}

async function loadVisualAccessLimitationNotice() {
  const sharedScanDetailViewImport = await import("./shared-scan-detail-view");
  const sharedScanDetailViewModule =
    (sharedScanDetailViewImport as unknown as { deriveVisualAccessLimitationNotice?: unknown })
      .deriveVisualAccessLimitationNotice
      ? (sharedScanDetailViewImport as unknown as Record<string, unknown>)
      : (
          sharedScanDetailViewImport as unknown as {
            default?: Record<string, unknown>;
            "module.exports"?: Record<string, unknown>;
          }
        ).default ??
        (
          sharedScanDetailViewImport as unknown as {
            default?: Record<string, unknown>;
            "module.exports"?: Record<string, unknown>;
          }
        )["module.exports"] ??
        (sharedScanDetailViewImport as unknown as Record<string, unknown>);

  return (sharedScanDetailViewModule as unknown as {
    deriveVisualAccessLimitationNotice: (
      runtimeArtifacts: Record<string, unknown> | null | undefined
    ) =>
      | {
          summary: string;
          finding: {
            evidencePreview?: string[];
            evidenceRefs?: string[];
            id: string;
            label: string;
            remediation: string;
            shortSummary: string;
          };
          review: {
            blockerLabel?: string | null;
            coverageLabel: string;
            guidance: string[];
            message: string;
            outcomeTitle: string;
            reason: string;
            title: string;
          };
        }
      | null;
  }).deriveVisualAccessLimitationNotice;
}

async function loadSelectExecutiveAccessLimitationNotice() {
  const sharedScanDetailViewImport = await import("./shared-scan-detail-view");
  const sharedScanDetailViewModule =
    (sharedScanDetailViewImport as unknown as { selectExecutiveAccessLimitationNotice?: unknown })
      .selectExecutiveAccessLimitationNotice
      ? (sharedScanDetailViewImport as unknown as Record<string, unknown>)
      : (
          sharedScanDetailViewImport as unknown as {
            default?: Record<string, unknown>;
            "module.exports"?: Record<string, unknown>;
          }
        ).default ??
        (
          sharedScanDetailViewImport as unknown as {
            default?: Record<string, unknown>;
            "module.exports"?: Record<string, unknown>;
          }
        )["module.exports"] ??
        (sharedScanDetailViewImport as unknown as Record<string, unknown>);

  return (sharedScanDetailViewModule as unknown as {
    selectExecutiveAccessLimitationNotice: (input: {
      allExecutiveFindings: unknown[];
      notice: unknown;
      topExecutiveFindings: unknown[];
    }) => unknown;
  }).selectExecutiveAccessLimitationNotice;
}

async function loadBuildReviewFindingSummaryJson() {
  const sharedScanDetailViewImport = await import("./shared-scan-detail-view");
  const sharedScanDetailViewModule =
    (sharedScanDetailViewImport as unknown as { buildReviewFindingSummaryJson?: unknown }).buildReviewFindingSummaryJson
      ? (sharedScanDetailViewImport as unknown as Record<string, unknown>)
      : (
          sharedScanDetailViewImport as unknown as {
            default?: Record<string, unknown>;
            "module.exports"?: Record<string, unknown>;
          }
        ).default ??
        (
          sharedScanDetailViewImport as unknown as {
            default?: Record<string, unknown>;
            "module.exports"?: Record<string, unknown>;
          }
        )["module.exports"] ??
        (sharedScanDetailViewImport as unknown as Record<string, unknown>);

  return (sharedScanDetailViewModule as unknown as {
    buildReviewFindingSummaryJson: (finding: Record<string, unknown>) => Record<string, unknown>;
  }).buildReviewFindingSummaryJson;
}

async function loadPreviewExecutiveAccessLimitationNotice() {
  const sharedScanDetailViewImport = await import("./shared-scan-detail-view");
  const sharedScanDetailViewModule =
    (sharedScanDetailViewImport as unknown as { buildPreviewExecutiveAccessLimitationNotice?: unknown })
      .buildPreviewExecutiveAccessLimitationNotice
      ? (sharedScanDetailViewImport as unknown as Record<string, unknown>)
      : (
          sharedScanDetailViewImport as unknown as {
            default?: Record<string, unknown>;
            "module.exports"?: Record<string, unknown>;
          }
        ).default ??
        (
          sharedScanDetailViewImport as unknown as {
            default?: Record<string, unknown>;
            "module.exports"?: Record<string, unknown>;
          }
        )["module.exports"] ??
        (sharedScanDetailViewImport as unknown as Record<string, unknown>);

  return (sharedScanDetailViewModule as unknown as {
    buildPreviewExecutiveAccessLimitationNotice: (input: {
      resultState: {
        code?: string;
        coverageLevel?: string;
        message: string;
        title: string;
      };
      review: Record<string, unknown> | null;
    }) => {
      finding: { shortSummary: string };
      review: { coverageLabel: string; verifiedSurfaces: string[] };
      summary: string;
    };
  }).buildPreviewExecutiveAccessLimitationNotice;
}

function makeReviewPacket(overrides: Record<string, unknown>) {
  return {
    affectedPageCount: 1,
    confidenceBand: "strong",
    confidenceInputs: {
      isFallbackOnly: false,
      issueCount: 1,
      signalCount: 1,
      sourceCount: 1,
      validationCount: 0
    },
    concernContext: {
      evidenceStrengthFlags: [],
      negativeEvidenceFlags: [],
      originTypes: []
    },
    evidence: {
      counts: {},
      entities: {},
      flags: [],
      pageUrls: [],
      snippets: [],
      sourceUrls: []
    },
    observedValue: null,
    presentation: {
      findingName: "Review finding",
      suggestedFix: "Review retained evidence.",
      whyThisMatters: "Retained evidence may warrant review."
    },
    presentationDecision: {
      confidenceRationale: "Direct runtime evidence was retained.",
      downgradeReasons: []
    },
    primaryPageUrl: "https://example.com/",
    severity: "high",
    sourceRefs: [],
    summary: "Review finding summary.",
    surfacingDecision: {
      appliedRules: [],
      decisionReasons: [],
      decisionState: "confirmed",
      reportLane: "main"
    },
    title: "Review finding",
    topFindingEligibility: {
      candidateTopFindingIds: [],
      demotionReasons: [],
      eligibility: "projected",
      matchedCriteria: [],
      missingCorroborators: [],
      suppressionReason: null
    },
    unifiedFindingId: "review_finding",
    ...overrides
  };
}

function makeSharedScanDetailGdprTransparencyRuntimeArtifacts(input: {
  enabled?: boolean;
  profile?: string;
  selectedEvidenceStrength?: string;
  status?: string;
} = {}) {
  return {
    policyDisclosureSummary: {
      article13DisclosureSignals: [
        {
          classifierProvenance: "gdpr_transparency_topic_classifier.v1",
          classifierReasonCodes: ["matched_legal_basis"],
          confidence: 0.94,
          disclosureType: "legal_basis",
          evidenceText: "Die Rechtsgrundlage fur die Verarbeitung personenbezogener Daten ist Vertrag und Einwilligung.",
          matchStrength: "direct",
          matchedLocale: "de",
          matchedTerm: "Rechtsgrundlage",
          productionCredit: true,
          productionCreditProfile: "gdpr_transparency_multilingual_article13_v1",
          selectedEvidenceStrength: input.selectedEvidenceStrength ?? "strong",
          selectedPolicySectionExcerpt:
            "Die Rechtsgrundlage fur die Verarbeitung personenbezogener Daten ist Vertrag und Einwilligung.",
          selectedPolicySectionUrl: "https://example.test/datenschutz",
          source: "deterministic",
          status: input.status ?? "observed"
        }
      ],
      gdprTransparencyEvidenceProfile: input.profile ?? "gdpr_transparency_multilingual_article13_v1",
      gdprTransparencyProductionEvidenceEnabled: input.enabled ?? true
    }
  };
}

test("scan-detail GDPR/ePrivacy checklist consumes opt-in multilingual Article 13 normalized concerns", async () => {
  const deriveChecklist = await loadSharedScanDetailGdprEprivacyCoverageChecklist();
  const checklist = deriveChecklist({
    coverageLimited: false,
    events: [],
    policyEnrichmentCount: 0,
    projectedFindings: [],
    runtimeArtifacts: makeSharedScanDetailGdprTransparencyRuntimeArtifacts(),
    runtimeCookieRows: [],
    runtimeTrackerPriorityRows: [],
    scanCompleted: true,
    snapshot: {},
    unifiedFindings: []
  });
  const legalBasis = checklist.find((item) => item.id === "legal_basis_disclosure_observed");

  assert.equal(legalBasis?.status, "Observed");
  assert.equal(
    legalBasis?.criticalEvidence.retainedEvidence.gdprTransparencyArticle13Concern !== undefined,
    true
  );
});

test("scan-detail GDPR/ePrivacy checklist keeps legacy_only Article 13 behavior unchanged", async () => {
  const deriveChecklist = await loadSharedScanDetailGdprEprivacyCoverageChecklist();
  const baseline = deriveChecklist({
    coverageLimited: false,
    events: [],
    policyEnrichmentCount: 0,
    projectedFindings: [],
    runtimeArtifacts: null,
    runtimeCookieRows: [],
    runtimeTrackerPriorityRows: [],
    scanCompleted: true,
    snapshot: {},
    unifiedFindings: []
  });
  const legacyOnly = deriveChecklist({
    coverageLimited: false,
    events: [],
    policyEnrichmentCount: 0,
    projectedFindings: [],
    runtimeArtifacts: makeSharedScanDetailGdprTransparencyRuntimeArtifacts({
      enabled: false,
      profile: "legacy_only"
    }),
    runtimeCookieRows: [],
    runtimeTrackerPriorityRows: [],
    scanCompleted: true,
    snapshot: {},
    unifiedFindings: []
  });

  assert.equal(
    legacyOnly.find((item) => item.id === "legal_basis_disclosure_observed")?.status,
    baseline.find((item) => item.id === "legal_basis_disclosure_observed")?.status
  );
  assert.equal(
    legacyOnly.find((item) => item.id === "legal_basis_disclosure_observed")
      ?.criticalEvidence.retainedEvidence.gdprTransparencyArticle13Concern,
    undefined
  );
});

test("review evidence export uses canonical projected status for reject persistence packets and removes stale no-request observed values", async () => {
  const buildReviewFindingSummaryJson = await loadBuildReviewFindingSummaryJson();
  const summary = buildReviewFindingSummaryJson(makeReviewPacket({
    evidence: {
      counts: {},
      entities: {
        postRejectNonEssentialRequests: [
          JSON.stringify({
            category: "analytics",
            ms_after_reject: 842,
            ts_ms: 1842,
            url: "https://analytics.example/collect",
            vendor: "Example Analytics"
          })
        ],
        promotionDecision: [
          JSON.stringify({
            promoted: true,
            reason: "Reject click, post-reject timing, vendor classification, and retained request URL satisfied promotion requirements."
          })
        ],
        suppressionChecks: [
          JSON.stringify({
            non_essential_vendor_after_reject: true,
            post_reject_window_available: true,
            reject_click_confirmed: true
          })
        ]
      },
      flags: ["reject_evidence_confirmed"],
      pageUrls: [],
      snippets: [],
      sourceUrls: []
    },
    observedValue: "No classified non-essential request fired at least 250ms after reject.",
    sourceRefs: [{ kind: "signal", key: "consent_reject_reduced_tracking", source: "runtime_artifact_signal" }],
    summary: "The consent audit completed a reject interaction, but tracker vendors still remained after rejection.",
    title: "Reject interaction did not reduce tracking",
    topFindingEligibility: {
      candidateTopFindingIds: ["reject_tracking_persists_after_reject"],
      demotionReasons: [],
      eligibility: "projected",
      matchedCriteria: ["postRejectTimestampedRuntimeEvidence"],
      missingCorroborators: [],
      suppressionReason: null
    },
    unifiedFindingId: "reject_did_not_reduce_tracking"
  }));

  assert.equal((summary.topFindingEligibility as { eligibility: string }).eligibility, "projected");
  assert.equal((summary.reviewContext as { projection: { canonicalTopFinding: boolean } }).projection.canonicalTopFinding, true);
  assert.equal(summary.observedValue, "Non-essential tracking requests fired after the reject interaction for Example Analytics.");
  assert.doesNotMatch(JSON.stringify(summary), /No classified non-essential request fired at least/i);
  assert.doesNotMatch(JSON.stringify(summary), /Not projected as a canonical top finding/i);
});

test("review evidence export does not use runtime request URLs as scanned page URLs", async () => {
  const buildReviewFindingSummaryJson = await loadBuildReviewFindingSummaryJson();
  const summary = buildReviewFindingSummaryJson(makeReviewPacket({
    evidence: {
      counts: {},
      entities: {
        consentTimeline: [
          JSON.stringify({
            firstConsentActionMs: 6141,
            firstCmpVisibleMs: 902
          })
        ],
        requestPurposeClassificationConfidence: [
          JSON.stringify({
            classification: "non_essential",
            collectionEndpointObserved: true,
            confidence: 0.92,
            firstSeenMs: 2936,
            hostname: "dpm.demdex.net",
            requestUrl: "https://dpm.demdex.net/id?d_orgid=abc&ts=123",
            runtimePhase: "pre_consent",
            vendorAttributionBasis: "consent_audit_tracker_evidence_url",
            vendorCategory: "analytics",
            vendorName: "Adobe Analytics"
          })
        ]
      },
      flags: ["privacy.preconsent_tracking_detected"],
      pageUrls: [
        "https://www.fandango.com/",
        "https://cms.quantserve.com/pixel/p-vj4AYjBqd6VJ2.gif [query_redacted=true query_keys=idmatch,gdpr,gdpr_consent]"
      ],
      snippets: [],
      sourceUrls: ["https://dpm.demdex.net/id [query_redacted=true query_keys=d_orgid,ts]"]
    },
    primaryPageUrl: "https://cms.quantserve.com/pixel/p-vj4AYjBqd6VJ2.gif [query_redacted=true query_keys=idmatch,gdpr,gdpr_consent]",
    sourceRefs: [{ kind: "signal", key: "privacy.preconsent_tracking_detected", source: "runtime_artifact_signal" }],
    summary: "Pre-consent tracking review candidate.",
    title: "Third-party tracking observed before recorded consent",
    topFindingEligibility: {
      candidateTopFindingIds: ["pre_consent_tracking_detected"],
      demotionReasons: ["no_consent_surface_observed"],
      eligibility: "not_projected",
      matchedCriteria: [],
      missingCorroborators: ["runtime_request_anchor"],
      suppressionReason: "no_consent_surface_observed"
    },
    unifiedFindingId: "preconsent_tracking"
  }));

  assert.equal(summary.primaryPageUrl, "https://www.fandango.com/");
  assert.deepEqual((summary.evidence as { pageUrls: string[] }).pageUrls, ["https://www.fandango.com/"]);
  assert.equal(
    ((summary.evidence as { tracking: { representativePreConsentRequests: Array<{ scannedPageUrl: string | null }> } })
      .tracking.representativePreConsentRequests[0]?.scannedPageUrl),
    "https://www.fandango.com/"
  );
  assert.doesNotMatch(JSON.stringify(summary), /cms\.quantserve\.com\/pixel\/p-vj4AYjBqd6VJ2\.gif.*primaryPageUrl/);
});

test("review evidence export exposes sensitive-surface packet fields without implying payload exposure", async () => {
  const buildReviewFindingSummaryJson = await loadBuildReviewFindingSummaryJson();
  const summary = buildReviewFindingSummaryJson(makeReviewPacket({
    evidence: {
      counts: {},
      entities: {
        sensitivePayloadViolations: [
          JSON.stringify({
            detectedType: "email_detected",
            sameFlowLinkage: { samePageOrFlow: true, userValueObserved: false },
            vendorHost: "analytics.example"
          })
        ],
        third_party_domains: ["analytics.example"]
      },
      flags: ["commerce.high_sensitivity_data_collection_detected"],
      pageUrls: [],
      snippets: ["email input surface"],
      sourceUrls: []
    },
    title: "Sensitive input surfaces detected alongside third-party tracking",
    topFindingEligibility: {
      candidateTopFindingIds: ["sensitive_data_collection_with_third_party_tracking_present"],
      demotionReasons: [],
      eligibility: "projected",
      matchedCriteria: ["sensitiveThirdPartyTrackingEvidence"],
      missingCorroborators: [],
      suppressionReason: null
    },
    unifiedFindingId: "sensitive_data_collection_with_third_party_tracking_present"
  }));
  const sensitiveSurface = (summary.evidence as { sensitiveSurface: Record<string, unknown> }).sensitiveSurface;

  assert.equal(sensitiveSurface.samePageOrFlowLinked, true);
  assert.deepEqual(sensitiveSurface.evidenceBasisType, ["form_field_metadata", "same_page_runtime_link"]);
  assert.deepEqual(sensitiveSurface.fieldTypes, ["email_detected"]);
  assert.deepEqual(sensitiveSurface.thirdPartyDomains, ["analytics.example"]);
  assert.equal(sensitiveSurface.rawValuesRetained, false);
  assert.equal(sensitiveSurface.payloadExposureObserved, false);
});

test("deriveExecutivePolicySurfaces disambiguates multiple privacy policy URLs", async () => {
  const deriveExecutivePolicySurfaces = await loadDeriveExecutivePolicySurfaces();

  const surfaces = deriveExecutivePolicySurfaces([
    {
      id: "consumer-health-policy",
      page_type: "privacy_policy",
      page_url: "https://mcdonalds.com/us/en-us/consumer-health-data-privacy-policy.html",
      policy_summary_short: "Consumer health data privacy policy retained.",
      policy_mentions: [{ topic: "data_subject_rights" }]
    },
    {
      id: "privacy-overview",
      page_type: "privacy_policy",
      page_url: "https://mcdonalds.com/us/en-us/privacy-overview.html",
      policy_summary_short: "Privacy overview retained.",
      policy_mentions: [{ topic: "international_transfers" }]
    }
  ]);

  assert.deepEqual(
    surfaces.map((surface) => surface.pageLabel),
    ["Consumer Health Data Privacy Policy", "Privacy Overview"]
  );
  assert.equal(surfaces.every((surface) => surface.pageUrl), true);
});

test("deriveExecutivePolicySurfaces keeps generic label when there is only one privacy policy URL", async () => {
  const deriveExecutivePolicySurfaces = await loadDeriveExecutivePolicySurfaces();

  const surfaces = deriveExecutivePolicySurfaces([
    {
      id: "privacy-policy",
      page_type: "privacy_policy",
      page_url: "https://example.com/privacy-policy",
      policy_summary_short: "Privacy policy retained."
    }
  ]);

  assert.deepEqual(
    surfaces.map((surface) => surface.pageLabel),
    ["Privacy policy"]
  );
});

test("deriveExecutivePolicySurfaces dedupes Amazon locale cookie aliases and labels preferences separately", async () => {
  const deriveExecutivePolicySurfaces = await loadDeriveExecutivePolicySurfaces();

  const surfaces = deriveExecutivePolicySurfaces([
    {
      id: "cookie-direct",
      page_type: "cookie_policy",
      page_url: "https://www.amazon.de/gp/help/customer/display.html?nodeId=201890250",
      policy_summary_short: "Cookie policy retained."
    },
    {
      id: "cookie-locale-alias",
      page_type: "cookie_policy",
      page_url: "https://www.amazon.de/-/en/gp/help/customer/display.html?nodeId=201890250",
      policy_summary_short: "Cookie policy retained."
    },
    {
      id: "privacy-preferences",
      page_type: "cookie_policy",
      page_url: "https://www.amazon.de/privacyprefs/customize?language=en&oCT=ads",
      policy_summary_short: "Cookie preferences retained."
    }
  ]);

  assert.deepEqual(
    surfaces.map((surface) => ({ label: surface.pageLabel, url: surface.pageUrl })),
    [
      {
        label: "Cookie policy",
        url: "https://www.amazon.de/gp/help/customer/display.html?nodeId=201890250"
      },
      {
        label: "Cookie preferences",
        url: "https://www.amazon.de/privacyprefs/customize?language=en&oCT=ads"
      }
    ]
  );
});

test("deriveExecutivePolicySurfaces shows discovered privacy links without claiming document evaluation", async () => {
  const deriveExecutivePolicySurfaces = await loadDeriveExecutivePolicySurfaces();
  const surfaces = deriveExecutivePolicySurfaces([], {}, {
    policyDisclosureSummary: {
      discoveredPrivacyPolicyUrls: ["https://example.test/privacy"],
      privacyPolicyDiscovered: true,
      privacyPolicyEvaluationState: "discovered_fetch_failed"
    }
  });

  assert.deepEqual(surfaces, [{
    details: ["Privacy-policy link observed; document retrieval failed, so its contents were not evaluated."],
    pageLabel: "Privacy policy link",
    pageUrl: "https://example.test/privacy"
  }]);
});

test("deriveExecutivePolicySurfaces retains cookie and privacy surfaces from the canonical policy summary", async () => {
  const deriveExecutivePolicySurfaces = await loadDeriveExecutivePolicySurfaces();
  const surfaces = deriveExecutivePolicySurfaces([
    {
      id: "terms",
      page_type: "terms_of_service",
      page_url: "https://www.oxfam.org/en/terms-and-conditions",
      policy_summary_short: "Terms retained."
    }
  ], {
    domain: "oxfam.org"
  }, {
    policyDisclosureSummary: {
      cookiePolicyPresent: true,
      cookiePolicyUrls: ["https://www.oxfam.org/en/cookies"],
      disclosedCookieNames: ["__stripe_mid", "_gid", "fundraiseup_cid"],
      privacyPolicyPresent: true,
      privacyPolicyUrls: ["https://www.oxfam.org/en/privacy-policy"]
    }
  });

  assert.deepEqual(
    surfaces.map((surface) => surface.pageLabel),
    ["Privacy policy", "Cookie policy", "Terms of service"]
  );
  assert.deepEqual(
    surfaces.map((surface) => surface.pageUrl),
    [
      "https://www.oxfam.org/en/privacy-policy",
      "https://www.oxfam.org/en/cookies",
      "https://www.oxfam.org/en/terms-and-conditions"
    ]
  );
  assert.match(
    surfaces.find((surface) => surface.pageLabel === "Cookie policy")?.details.join(" ") ?? "",
    /Named-cookie inventory retained \(3 cookies\)/i
  );
});

test("deriveExecutivePolicySurfaces skips a cookie fallback when its URL is already retained", async () => {
  const deriveExecutivePolicySurfaces = await loadDeriveExecutivePolicySurfaces();
  const sharedUrl = "https://caltech.edu/privacy-notice";
  const surfaces = deriveExecutivePolicySurfaces([
    {
      id: "privacy-notice",
      page_type: "privacy_policy",
      page_url: sharedUrl,
      policy_summary_short: "Privacy notice retained."
    }
  ], {}, {}, [{
    assessmentStatus: "checked",
    criticalEvidence: {
      missingOrIncompleteSourceSignals: [],
      pipeline: {
        concernPolicyKey: "cookie_notice_policy_availability",
        projectionStage: "coverage_policy",
        wc01NormalizedConcernKey: "cookie_notice_policy_availability",
        ws01EvidenceRole: "policy_surface_observation"
      },
      projectedFindings: [],
      retainedEvidence: {
        cookiePolicyPresent: true,
        cookiePolicyUrls: [sharedUrl]
      },
      statusBasis: "A durable cookie disclosure surface was retained."
    },
    evidenceRefs: [],
    evidenceState: "observed",
    explanation: "Cookie policy availability",
    id: "cookie_notice_policy_availability",
    label: "Cookie notice / cookie policy availability",
    limitation: "",
    note: "Observed",
    status: "Observed",
    tone: "neutral"
  } as GdprEprivacyCoverageChecklistItem]);

  assert.equal(surfaces.length, 1);
  assert.equal(surfaces[0]?.pageUrl, sharedUrl);
  assert.equal(surfaces[0]?.pageLabel, "Privacy policy");
  assert.doesNotMatch(surfaces[0]?.details.join(" ") ?? "", /Cookie-policy surface was retained/i);
});

test("deriveExecutivePolicySurfaces uses the projected cookie-policy checklist evidence when overview inputs are thin", async () => {
  const deriveExecutivePolicySurfaces = await loadDeriveExecutivePolicySurfaces();
  const surfaces = deriveExecutivePolicySurfaces([
    {
      id: "terms",
      page_type: "terms_of_service",
      page_url: "https://www.oxfamamerica.org/privacy-legal/",
      policy_summary_short: "Terms retained."
    }
  ], {
    domain: "oxfamamerica.org"
  }, {}, [
    {
      assessmentStatus: "checked",
      criticalEvidence: {
        missingOrIncompleteSourceSignals: [],
        pipeline: {
          concernPolicyKey: "cookie_notice_policy_availability",
          projectionStage: "coverage_policy",
          wc01NormalizedConcernKey: "cookie_notice_policy_availability",
          ws01EvidenceRole: "policy_surface_observation"
        },
        projectedFindings: [],
        retainedEvidence: {
          cookiePolicyPresent: true,
          cookiePolicyUrls: ["https://www.oxfam.org/en/cookies"],
          disclosedCookieNames: ["__stripe_mid", "_gid", "fundraiseup_cid"]
        },
        statusBasis: "A named-cookie inventory was retained."
      },
      evidenceRefs: [],
      evidenceState: "observed",
      explanation: "Cookie policy availability",
      id: "cookie_notice_policy_availability",
      label: "Cookie notice / cookie policy availability",
      limitation: "A named-cookie inventory was retained.",
      note: "Observed",
      status: "Observed",
      tone: "neutral"
    }
  ], "www.oxfam.org");

  assert.deepEqual(
    surfaces.map((surface) => surface.pageLabel),
    ["Cookie policy"]
  );
  assert.equal(
    surfaces.find((surface) => surface.pageLabel === "Cookie policy")?.pageUrl,
    "https://www.oxfam.org/en/cookies"
  );
  assert.match(
    surfaces.find((surface) => surface.pageLabel === "Cookie policy")?.details.join(" ") ?? "",
    /Named-cookie inventory retained \(3 cookies\)/i
  );
});

test("deriveExecutivePolicySurfaces preserves observed privacy and cookie surfaces when retained URLs are unavailable", async () => {
  const deriveExecutivePolicySurfaces = await loadDeriveExecutivePolicySurfaces();
  const makeObservedPolicyRow = (
    id: "privacy_notice_availability" | "cookie_notice_policy_availability",
    label: string
  ): GdprEprivacyCoverageChecklistItem => ({
    assessmentStatus: "checked",
    criticalEvidence: {
      missingOrIncompleteSourceSignals: [],
      pipeline: {
        concernPolicyKey: `gdpr_eprivacy_coverage.${id}.observed`,
        projectionStage: "unified_finding",
        wc01NormalizedConcernKey: `gdpr_eprivacy.coverage.${id}`,
        ws01EvidenceRole: "policy_surface_observation"
      },
      projectedFindings: [],
      retainedEvidence: {
        status: "Observed"
      },
      statusBasis: "Canonical unified finding projected for this row."
    },
    evidenceRefs: [],
    evidenceState: "observed",
    explanation: label,
    id,
    label,
    limitation: "Canonical unified finding projected for this row.",
    note: "Observed",
    status: "Observed",
    tone: "neutral"
  });

  const surfaces = deriveExecutivePolicySurfaces([
    {
      id: "terms",
      page_type: "terms_of_service",
      page_url: "https://www.oxfam.org/en/terms-and-conditions",
      policy_summary_short: "Terms retained."
    }
  ], {
    domain: "oxfam.org"
  }, {}, [
    makeObservedPolicyRow("privacy_notice_availability", "Privacy notice link/surface discovered"),
    makeObservedPolicyRow("cookie_notice_policy_availability", "Cookie notice / cookie policy availability")
  ], "www.oxfam.org");

  assert.deepEqual(
    surfaces.map((surface) => surface.pageLabel),
    ["Terms of service", "Privacy policy", "Cookie policy"]
  );
  assert.equal(
    surfaces.find((surface) => surface.pageLabel === "Privacy policy")?.pageUrl,
    null
  );
  assert.equal(
    surfaces.find((surface) => surface.pageLabel === "Cookie policy")?.pageUrl,
    null
  );
});

test("deriveExecutivePolicySurfaces prefers retention sections over security-only policy excerpts", async () => {
  const deriveExecutivePolicySurfaces = await loadDeriveExecutivePolicySurfaces();
  const sharedUrl = "https://ikea.example/global/en/legal/privacy-cookie-statement";

  const surfaces = deriveExecutivePolicySurfaces([
    {
      id: "privacy-policy",
      page_type: "privacy_policy",
      page_url: sharedUrl,
      policy_summary_short:
        "How we keep your personal information safe. We protect your personal information using security safeguards, encryption, confidentiality controls, and procedures intended to prevent unauthorised access, loss, destruction, or damage."
    },
    {
      id: "cookie-policy",
      page_type: "cookie_policy",
      page_url: sharedUrl,
      policy_summary_short:
        "How we keep your personal information safe. We protect your personal information using security safeguards, encryption, confidentiality controls, and procedures intended to prevent unauthorised access, loss, destruction, or damage."
    }
  ], null, {
    policyDisclosureSummary: {
      retainedPolicySections: [
        {
          heading: "How we keep your personal information safe",
          sourceUrl: sharedUrl,
          textExcerpt:
            "How we keep your personal information safe. We protect your personal information using security safeguards, encryption, confidentiality controls, and procedures intended to prevent unauthorised access, loss, destruction, or damage."
        },
        {
          heading: "How long we keep your personal information",
          sourceUrl: sharedUrl,
          textExcerpt:
            "How long we keep your personal information. Newsletter preferences are kept until you unsubscribe, booking information is retained for one year, CCTV recordings are kept for a maximum of four weeks, and some records may be retained longer for legal obligations or legal disputes."
        },
        {
          heading: "How long we keep your personal information collected through cookies",
          sourceUrl: sharedUrl,
          textExcerpt:
            "How long we keep your personal information collected through cookies. Cookie identifiers are stored for the retention period shown in the cookie list and are deleted when they expire or are no longer necessary."
        }
      ]
    }
  });

  const privacySurface = surfaces.find((surface) => surface.pageLabel === "Privacy policy");
  const cookieSurface = surfaces.find((surface) => surface.pageLabel === "Cookie policy");

  assert.match(privacySurface?.details[0] ?? "", /How long we keep your personal information/i);
  assert.match(privacySurface?.details[0] ?? "", /retained for one year|CCTV recordings are kept/i);
  assert.doesNotMatch(privacySurface?.details[0] ?? "", /How we keep your personal information safe/i);
  assert.match(cookieSurface?.details[0] ?? "", /How long we keep your personal information collected through cookies/i);
  assert.match(cookieSurface?.details[0] ?? "", /retention period|deleted when they expire/i);
  assert.doesNotMatch(cookieSurface?.details[0] ?? "", /How we keep your personal information safe/i);
});

test("deriveExecutivePolicySurfaces disambiguates terms policy subpages", async () => {
  const deriveExecutivePolicySurfaces = await loadDeriveExecutivePolicySurfaces();

  const surfaces = deriveExecutivePolicySurfaces([
    {
      id: "terms",
      page_type: "terms_of_service",
      page_url: "https://mcdonalds.com/ie/en-ie/terms-and-conditions.html",
      policy_summary_short: "Terms and conditions retained."
    },
    {
      id: "modern-slavery",
      page_type: "terms_of_service",
      page_url: "https://mcdonalds.com/ie/en-ie/terms-and-conditions/modern-slavery-act.html",
      policy_summary_short: "Modern slavery statement retained."
    }
  ]);

  assert.deepEqual(
    surfaces.map((surface) => surface.pageLabel),
    ["Terms And Conditions", "Modern Slavery Statement"]
  );
});

test("deriveExecutivePolicySurfaces numbers duplicate generic policy labels", async () => {
  const deriveExecutivePolicySurfaces = await loadDeriveExecutivePolicySurfaces();

  const surfaces = deriveExecutivePolicySurfaces([
    {
      id: "privacy-one",
      page_type: "privacy_policy",
      page_url: "https://example.com/privacy",
      policy_summary_short: "Privacy surface retained."
    },
    {
      id: "privacy-two",
      page_type: "privacy_policy",
      page_url: "https://example.com/intl/en/privacy",
      policy_summary_short: "Secondary privacy surface retained."
    },
    {
      id: "terms-one",
      page_type: "terms_of_service",
      page_url: "https://example.com/terms",
      policy_summary_short: "Terms surface retained."
    },
    {
      id: "terms-two",
      page_type: "terms_of_service",
      page_url: "https://example.com/legal/terms",
      policy_summary_short: "Secondary terms surface retained."
    }
  ]);

  assert.deepEqual(
    surfaces.map((surface) => surface.pageLabel),
    ["Privacy 1", "Privacy 2", "Terms 1", "Terms 2"]
  );
});

test("deriveExecutivePolicySurfaces suppresses privacy-adjacent resource links", async () => {
  const deriveExecutivePolicySurfaces = await loadDeriveExecutivePolicySurfaces();

  const surfaces = deriveExecutivePolicySurfaces([
    {
      id: "privacy",
      page_type: "privacy_policy",
      page_url: "https://certscore.ai/privacy",
      policy_summary_short: "Privacy policy retained."
    },
    {
      id: "privacy-request",
      page_type: "privacy_policy",
      page_url: "https://certscore.ai/privacy-request",
      policy_summary_short: "Privacy request form retained."
    },
    {
      id: "gdpr-resource",
      page_type: "privacy_policy",
      page_url: "https://certscore.ai/gdpr",
      policy_summary_short: "GDPR privacy scanner marketing page retained."
    },
    {
      id: "external-gpt",
      page_type: "privacy_policy",
      page_url: "https://chatgpt.com/gpts?search=GDPR%20ePrivacy%20Cookie%20Consent%20Privacy%20Scanner",
      policy_summary_short: "External GPT resource retained."
    },
    {
      id: "privacy-email",
      page_type: "privacy_policy",
      page_url: "mailto:privacy@certscore.ai",
      policy_summary_short: "Privacy contact email retained."
    }
  ]);

  assert.deepEqual(
    surfaces.map((surface) => surface.pageLabel),
    ["Privacy", "Privacy Request"]
  );
  assert.deepEqual(
    surfaces.map((surface) => surface.pageUrl),
    ["https://certscore.ai/privacy", "https://certscore.ai/privacy-request"]
  );
});

test("buildScanReportUnifiedFindings surfaces page-attributed privacy-rights paths as review evidence", async () => {
  const buildScanReportUnifiedFindings = await loadBuildScanReportUnifiedFindings();

  const findings = buildScanReportUnifiedFindings({
    accessibilityRuleCounts: [],
    accessibilityRuleExamples: [],
    policyEnrichment: [
      {
        id: "terms-row",
        page_type: "terms_of_service",
        page_url: "https://example.com/terms",
        policy_rights_signals: [],
        policy_evidence_snippets: {}
      },
      {
        id: "privacy-row",
        page_type: "privacy_policy",
        page_url: "https://example.com/privacy",
        policy_summary_short: "Example privacy policy",
        policy_evidence_snippets: {
          policy_rights_signals: ["access", "delete", "authorized_agent"],
          "rights_signal:access": "Use our Privacy Rights Center to request access.",
          "rights_signal:delete": "Use our Privacy Rights Center to request deletion."
        }
      }
    ],
    policyReviewQueue: [],
    preconsentViolations: [],
    runtimeArtifacts: null,
    scan: {
      completedAt: "",
      createdAt: "",
      domainHostname: "example.com",
      domainId: "domain-1",
      id: "scan-1",
      startedAt: "",
      status: "completed"
    },
    signals: [],
    snapshot: {
      domain: "example.com"
    },
    trackerVendors: [],
    validationFindings: []
  });

  const rightsFinding = findings.find((finding) => finding.unifiedFindingId === "privacy_rights_path_present");
  const surfacingDecision = rightsFinding?.surfacingDecision as
    | {
        appliedRules: string[];
        decisionState: string;
        reportLane: string;
      }
    | undefined;
  const presentationDecision = rightsFinding?.presentationDecision as
    | {
        status: string;
      }
    | undefined;

  assert.equal(surfacingDecision?.decisionState, "review");
  assert.equal(surfacingDecision?.reportLane, "main");
  assert.equal(presentationDecision?.status, "surface");
  assert.ok(surfacingDecision?.appliedRules.includes("evidence.positive_surface.review_high_value_policy_path"));
});

test("buildScanReportUnifiedFindings suppresses standalone positive surfaces and thin affiliate evidence", async () => {
  const buildScanReportUnifiedFindings = await loadBuildScanReportUnifiedFindings();

  const findings = buildScanReportUnifiedFindings({
    accessibilityRuleCounts: [],
    accessibilityRuleExamples: [],
    policyEnrichment: [],
    policyReviewQueue: [],
    preconsentViolations: [],
    runtimeArtifacts: {
      key_page_discovery_summary: {
        pageSummaries: [
          {
            attemptCount: 1,
            attemptedUrls: ["https://www.cnn.com/affiliates"],
            bestDiscoverySource: "rendered_link",
            guessedOnly: false,
            pageType: "affiliate_disclosure",
            stopReason: "covered"
          },
          {
            attemptCount: 1,
            attemptedUrls: ["https://www.cnn.com/terms"],
            bestDiscoverySource: "rendered_link",
            guessedOnly: false,
            pageType: "terms_of_service",
            stopReason: "covered"
          },
          {
            attemptCount: 1,
            attemptedUrls: ["https://www.cnn.com/privacy"],
            bestDiscoverySource: "rendered_link",
            guessedOnly: false,
            pageType: "privacy_policy",
            stopReason: "covered"
          }
        ]
      }
    },
    scan: {
      completedAt: "",
      createdAt: "",
      domainHostname: "cnn.com",
      domainId: "domain-1",
      id: "scan-1",
      startedAt: "",
      status: "completed"
    },
    signals: [
      {
        category: "commerce",
        key: "commerce.affiliate_disclosure_present",
        label: "Affiliate disclosure present",
        primaryCategory: "consumer_protection_commercial_practices",
        primaryCategoryDescription: "",
        primaryCategoryLabel: "",
        subcategory: null,
        value: true,
        valueType: "boolean"
      },
      {
        category: "privacy",
        key: "privacy.do_not_sell_link_present",
        label: "Do-not-sell link present",
        primaryCategory: "policies_rights_disclosures",
        primaryCategoryDescription: "",
        primaryCategoryLabel: "",
        subcategory: null,
        value: true,
        valueType: "boolean"
      },
      {
        category: "disclosure",
        key: "disclosure.terms_of_service_extraction_limited",
        label: "Terms page linked but automated extraction was limited",
        primaryCategory: "policies_rights_disclosures",
        primaryCategoryDescription: "",
        primaryCategoryLabel: "",
        subcategory: null,
        value: "https://www.cnn.com/terms",
        valueType: "text"
      },
      {
        category: "disclosure",
        key: "disclosure.terms_of_service_present",
        label: "Terms page fetched",
        primaryCategory: "policies_rights_disclosures",
        primaryCategoryDescription: "",
        primaryCategoryLabel: "",
        subcategory: null,
        value: true,
        valueType: "boolean"
      }
    ],
    snapshot: {
      affiliate_disclosure_present: true,
      contact_page_present: true,
      do_not_sell_link_present: true,
      domain: "cnn.com",
      privacy_policy_present: true,
      terms_of_service_present: true
    },
    trackerVendors: [],
    validationFindings: []
  });

  const termsFinding = findings.find((finding) => finding.unifiedFindingId === "terms_of_service_present");
  const choicesFinding = findings.find((finding) => finding.unifiedFindingId === "targeted_advertising_choices_present");
  const affiliateFinding = findings.find((finding) => finding.unifiedFindingId === "affiliate_disclosure_present");

  assert.equal(termsFinding, undefined);
  assert.equal(choicesFinding, undefined);
  assert.equal(affiliateFinding, undefined);
});

test("buildScanReportUnifiedFindings suppresses contradictory missing-surface review findings when matching positive signals exist", async () => {
  const buildScanReportUnifiedFindings = await loadBuildScanReportUnifiedFindings();

  const findings = buildScanReportUnifiedFindings({
    accessibilityRuleCounts: [],
    accessibilityRuleExamples: [],
    policyEnrichment: [],
    policyReviewQueue: [],
    preconsentViolations: [],
    runtimeArtifacts: null,
    scan: {
      completedAt: "",
      createdAt: "",
      domainHostname: "example.com",
      domainId: "domain-1",
      id: "scan-1",
      startedAt: "",
      status: "completed"
    },
    signals: [
      {
        category: "privacy",
        key: "privacy.privacy_contact_channel_missing",
        label: "Privacy contact path missing",
        primaryCategory: "policies_rights_disclosures",
        primaryCategoryDescription: "",
        primaryCategoryLabel: "",
        subcategory: null,
        value: true,
        valueType: "boolean"
      },
      {
        category: "privacy",
        key: "privacy.privacy_contact_path_present",
        label: "Privacy contact path present",
        primaryCategory: "policies_rights_disclosures",
        primaryCategoryDescription: "",
        primaryCategoryLabel: "",
        subcategory: null,
        value: true,
        valueType: "boolean"
      },
      {
        category: "accessibility",
        key: "accessibility.accessibility_support_path_missing",
        label: "Accessibility support path missing",
        primaryCategory: "access_barriers_task_completion",
        primaryCategoryDescription: "",
        primaryCategoryLabel: "",
        subcategory: null,
        value: true,
        valueType: "boolean"
      },
      {
        category: "accessibility",
        key: "accessibility.accessibility_contact_method_present",
        label: "Accessibility support path present",
        primaryCategory: "accessibility_commitments_conformance_support",
        primaryCategoryDescription: "",
        primaryCategoryLabel: "",
        subcategory: null,
        value: true,
        valueType: "boolean"
      }
    ],
    snapshot: {
      accessibility_contact_method_present: true,
      domain: "example.com",
      privacy_contact_channel_type: "email"
    },
    trackerVendors: [],
    validationFindings: []
  });

  assert.equal(findings.some((finding) => finding.unifiedFindingId === "privacy_contact_channel_missing"), false);
  assert.equal(findings.some((finding) => finding.unifiedFindingId === "accessibility_support_path_missing"), false);
  assert.equal(findings.some((finding) => finding.unifiedFindingId === "privacy_contact_path_present"), true);
  assert.equal(findings.some((finding) => finding.unifiedFindingId === "accessibility_support_path_present"), true);
});

test("filterContradictoryPositiveSurfaceFindings removes contradictory missing-surface packets from analyst detail", async () => {
  const filterContradictoryPositiveSurfaceFindings = await loadFilterContradictoryPositiveSurfaceFindings();

  const findings = filterContradictoryPositiveSurfaceFindings([
    {
      unifiedFindingId: "privacy_contact_channel_missing"
    },
    {
      unifiedFindingId: "privacy_contact_path_present"
    },
    {
      unifiedFindingId: "accessibility_support_path_missing"
    },
    {
      unifiedFindingId: "accessibility_support_path_present"
    },
    {
      unifiedFindingId: "forced_consent_wall"
    }
  ]);

  assert.equal(findings.some((finding) => finding.unifiedFindingId === "privacy_contact_channel_missing"), false);
  assert.equal(findings.some((finding) => finding.unifiedFindingId === "accessibility_support_path_missing"), false);
  assert.equal(findings.some((finding) => finding.unifiedFindingId === "privacy_contact_path_present"), true);
  assert.equal(findings.some((finding) => finding.unifiedFindingId === "accessibility_support_path_present"), true);
  assert.equal(findings.some((finding) => finding.unifiedFindingId === "forced_consent_wall"), true);
});

test("filterContradictoryPositiveSurfaceFindings removes contradictory title-matched packets when positive topics are present", async () => {
  const filterContradictoryPositiveSurfaceFindings = await loadFilterContradictoryPositiveSurfaceFindings();

  const findings = filterContradictoryPositiveSurfaceFindings([
    {
      title: "Privacy contact path missing",
      unifiedFindingId: "privacy_contact_channel_missing_variant"
    },
    {
      title: "Privacy contact path present",
      unifiedFindingId: "privacy_contact_path_present"
    },
    {
      title: "Accessibility support path missing",
      unifiedFindingId: "accessibility_support_path_missing_variant"
    },
    {
      title: "Accessibility support path present",
      unifiedFindingId: "accessibility_support_path_present"
    },
    {
      title: "Forced consent wall",
      unifiedFindingId: "forced_consent_wall"
    }
  ]);

  assert.equal(findings.some((finding) => finding.unifiedFindingId === "privacy_contact_channel_missing_variant"), false);
  assert.equal(findings.some((finding) => finding.unifiedFindingId === "accessibility_support_path_missing_variant"), false);
  assert.equal(findings.some((finding) => finding.unifiedFindingId === "privacy_contact_path_present"), true);
  assert.equal(findings.some((finding) => finding.unifiedFindingId === "accessibility_support_path_present"), true);
  assert.equal(findings.some((finding) => finding.unifiedFindingId === "forced_consent_wall"), true);
});

test("deriveExecutiveSummaryBadgeCounts only counts surfaced contradiction and pre-consent findings", async () => {
  const deriveExecutiveSummaryBadgeCounts = await loadExecutiveSummaryBadgeCounts();

  const counts = deriveExecutiveSummaryBadgeCounts([
    {
      details: { family: "contradiction" },
      presentationDecision: { status: "audit_only" },
      surfacingDecision: { decisionState: "review", reportLane: "confidence_and_coverage" },
      unifiedFindingId: "policy_behavior_conflict"
    },
    {
      details: { family: "consent_tracking" },
      presentationDecision: { status: "audit_only" },
      surfacingDecision: { decisionState: "review", reportLane: "confidence_and_coverage" },
      unifiedFindingId: "preconsent_tracking"
    },
    {
      details: { family: "contradiction" },
      presentationDecision: { status: "surface" },
      surfacingDecision: { decisionState: "confirmed", reportLane: "main" },
      unifiedFindingId: "policy_behavior_conflict"
    },
    {
      details: { family: "contradiction" },
      presentationDecision: { status: "surface" },
      surfacingDecision: { decisionState: "review", reportLane: "confidence_and_coverage" },
      unifiedFindingId: "privacy_policy_missing_surface"
    },
    {
      details: { family: "consent_tracking" },
      presentationDecision: { status: "surface" },
      surfacingDecision: { decisionState: "confirmed", reportLane: "main" },
      unifiedFindingId: "preconsent_tracking"
    }
  ]);

  assert.deepEqual(counts, {
    contradictionCount: 1,
    preconsentConflictCount: 1
  });
});

test("executive summary themes recognize financial-promotion findings", async () => {
  const { deriveAgencyAdvisoryThemes, deriveExecutiveSummaryThemeNarrative } = await loadExecutiveSummaryThemeHelpers();

  const themes = deriveAgencyAdvisoryThemes([
    { details: { family: "financial_promotion" } },
    { details: { family: "sensitive_data" } }
  ]);

  assert.deepEqual(themes, ["financial promotions and disclosure risk", "sensitive-data handling"]);
  assert.equal(
    deriveExecutiveSummaryThemeNarrative(themes),
    "The strongest patterns in this scan involve financial promotions and disclosure risk and sensitive-data handling."
  );
});

test("deriveFindingEvidenceQualitySummary counts verification states and audit-only findings", async () => {
  const deriveFindingEvidenceQualitySummary = await loadFindingEvidenceQualitySummary();

  const summary = deriveFindingEvidenceQualitySummary([
    { presentationDecision: { status: "surface", verificationState: "verified" } },
    { presentationDecision: { status: "audit_only", verificationState: "discovered" } },
    { presentationDecision: { status: "audit_only", verificationState: "blocked" } },
    { presentationDecision: { status: "surface", verificationState: "runtime" } },
    { presentationDecision: { status: "audit_only", verificationState: "triage" } }
  ]);

  assert.deepEqual(summary, {
    auditOnlyCount: 3,
    blockedCount: 1,
    discoveredCount: 1,
    runtimeCount: 1,
    triageCount: 1,
    verifiedCount: 1
  });
});

test("deriveFindingEvidenceDiagnosticRows keeps fetch quality and downgrade flags", async () => {
  const deriveFindingEvidenceDiagnosticRows = await loadFindingEvidenceDiagnosticRows();

  const rows = deriveFindingEvidenceDiagnosticRows([
    {
      concernContext: {
        negativeEvidenceFlags: ["blocked_or_interstitial_evidence_observed", "positive_surface_content_unverified"]
      },
      evidence: {
        fetchQuality: "blocked_interstitial"
      },
      presentation: {
        findingName: "Contact or feedback path present"
      },
      presentationDecision: {
        status: "audit_only",
        verificationLabel: "Blocked or interstitial"
      },
      surfacingDecision: {
        decisionState: "support_only",
        reportLane: "confidence_and_coverage"
      }
    }
  ]);

  assert.deepEqual(rows, [
    {
      decisionState: "support_only",
      fetchQuality: "blocked_interstitial",
      findingName: "Contact or feedback path present",
      negativeEvidenceFlags: ["blocked_or_interstitial_evidence_observed", "positive_surface_content_unverified"],
      reportLane: "confidence_and_coverage",
      status: "audit_only",
      verificationLabel: "Blocked or interstitial"
    }
  ]);
});

test("deriveExecutiveSummaryScanCondition flags blocked homepage scans", async () => {
  const deriveExecutiveSummaryScanCondition = await loadExecutiveSummaryScanCondition();

  const summary = deriveExecutiveSummaryScanCondition({
    homepage_fetch_status: "forbidden",
    pages_scanned: 0
  });

  assert.match(summary ?? "", /site limited automated access/i);
  assert.match(summary ?? "", /Reason:/i);
});

test("deriveExecutiveSummaryScanCondition flags unreachable homepage scans", async () => {
  const deriveExecutiveSummaryScanCondition = await loadExecutiveSummaryScanCondition();

  const summary = deriveExecutiveSummaryScanCondition({
    homepage_fetch_status: "error",
    pages_scanned: 0
  });

  assert.match(summary ?? "", /could not be reached reliably over the network/i);
  assert.match(summary ?? "", /Reason:/i);
});

test("deriveExecutiveSummaryScanCondition flags auth-wall scans", async () => {
  const deriveExecutiveSummaryScanCondition = await loadExecutiveSummaryScanCondition();

  const summary = deriveExecutiveSummaryScanCondition({
    auth_wall_detected: true,
    pages_scanned: 0
  });

  assert.match(summary ?? "", /authentication wall/i);
});

test("deriveUnverifiedHomepageReview returns a one-off blocked-homepage explanation", async () => {
  const deriveUnverifiedHomepageReview = await loadUnverifiedHomepageReview();

  const review = deriveUnverifiedHomepageReview({
    homepage_fetch_status: "blocked",
    homepage_fetch_http_status: 403,
    pages_scanned: 0
  });

  assert.equal(review?.title, "Access limited by site protections");
  assert.equal(review?.coverageLabel, "No public verification available");
  assert.equal(review?.outcomeTitle, "Access limited by site protections");
  assert.equal(review?.reason, "Reason: homepage request was blocked with HTTP 403.");
  assert.equal(review?.recommendationTitle, "Protected-Site Workflow Recommended");
  assert.deepEqual(review?.verifiedSurfaces ?? [], []);
  assert.ok(review?.guidance.some((item) => /protected-domain result/i.test(item)));
  assert.match(review?.message ?? "", /site limited automated access from the scan environment/i);
});

test("deriveUnverifiedHomepageReview returns a robots-disallowed explanation", async () => {
  const deriveUnverifiedHomepageReview = await loadUnverifiedHomepageReview();

  const review = deriveUnverifiedHomepageReview({
    homepage_fetch_status: "blocked",
    pages_scanned: 0,
    robots_allowed: false
  });

  assert.equal(review?.title, "Access limited by site protections");
  assert.match(review?.reason ?? "", /robots/i);
  assert.match(review?.message ?? "", /public crawler access was restricted/i);
});

test("deriveExecutiveAccessLimitationNotice suppresses normal findings on blocked scans with no verified public surfaces", async () => {
  const deriveExecutiveAccessLimitationNotice = await loadExecutiveAccessLimitationNotice();

  const notice = deriveExecutiveAccessLimitationNotice(
    {
      blocked_flag: false,
      coverage_level: "limited_partial",
      homepage_fetch_http_status: 200,
      homepage_fetch_status: "ok",
      pages_scanned: 1,
      verified_public_surfaces_count: 0
    },
    [
      {
        eventType: "runtime.build_phase_diagnostic",
        message: "Build phase hybrid_auto_decision ok.",
        metadataJson: {
          phase: "hybrid_auto_decision",
          reason: "http_block_status",
          reasonDetail: "Local main document returned 403.",
          finalDocumentStatus: 403
        }
      }
    ]
  );

  assert.equal(notice?.finding.label, "Public site access was limited");
  assert.match(notice?.summary ?? "", /No reliable privacy or consent findings were retained/i);
  assert.equal(notice?.review.coverageLabel, "No public verification available");
  assert.match(notice?.finding.shortSummary ?? "", /No reliable privacy or consent findings were retained/i);
});

test("deriveExecutiveAccessLimitationNotice stays off when blocked scans still verified public policy surfaces", async () => {
  const deriveExecutiveAccessLimitationNotice = await loadExecutiveAccessLimitationNotice();

  const notice = deriveExecutiveAccessLimitationNotice({
    blocked_flag: true,
    homepage_fetch_http_status: 403,
    homepage_fetch_status: "forbidden",
    pages_scanned: 0,
    privacy_policy_present: true,
    verified_public_surfaces_count: 1
  });

  assert.equal(notice, null);
});

test("deriveExecutiveAccessLimitationNotice suppresses healthy-looking summaries for unreachable homepages", async () => {
  const deriveExecutiveAccessLimitationNotice = await loadExecutiveAccessLimitationNotice();

  const notice = deriveExecutiveAccessLimitationNotice({
    certscore_overall: 81,
    coverage_level: "limited_none",
    homepage_fetch_status: "error",
    pages_scanned: 0,
    scan_outcome: "transport_failure",
    total_signals: 0,
    verified_public_surfaces_count: 0
  });

  assert.equal(notice?.review.title, "Transport failure");
  assert.equal(notice?.review.coverageLabel, "No public verification available");
  assert.match(notice?.summary ?? "", /No reliable privacy or consent findings were retained/i);
  assert.match(notice?.finding.shortSummary ?? "", /No reliable privacy or consent findings were retained/i);
});

test("deriveExecutiveAccessLimitationNotice suppresses healthy-looking summaries for not-found homepages", async () => {
  const deriveExecutiveAccessLimitationNotice = await loadExecutiveAccessLimitationNotice();

  const notice = deriveExecutiveAccessLimitationNotice({
    certscore_overall: 81,
    homepage_fetch_http_status: 404,
    homepage_fetch_status: "not_found",
    pages_scanned: 0,
    scan_outcome: "domain_inactive_or_unstable",
    total_signals: 0,
    verified_public_surfaces_count: 0
  });

  assert.equal(notice?.review.title, "Domain inactive or unstable");
  assert.equal(notice?.review.outcomeTitle, "Domain inactive or unstable");
  assert.match(notice?.review.reason ?? "", /HTTP 404 Not Found/i);
  assert.match(notice?.summary ?? "", /No reliable privacy or consent findings were retained/i);
});

test("deriveVisualAccessLimitationNotice does not treat screenshot upload failure as site no-go", async () => {
  const deriveVisualAccessLimitationNotice = await loadVisualAccessLimitationNotice();

  const notice = deriveVisualAccessLimitationNotice({
    visual_access_review: {
      artifactRef: "initial_load:3aa98210d0f5",
      goNoGo: "NO_GO",
      pageState: "missing_visual_artifact",
      reasonCode: "visual_evidence_upload_failed",
      shortExplanation: "Initial-load visual evidence was not retained as an available screenshot artifact.",
      status: "missing_visual_artifact"
    }
  });

  assert.equal(notice, null);
});

test("deriveVisualAccessLimitationNotice retains a corroborated transport no-go when the screenshot is missing", async () => {
  const deriveVisualAccessLimitationNotice = await loadVisualAccessLimitationNotice();

  const notice = deriveVisualAccessLimitationNotice({
    scan_no_go_assessment: {
      decision: "no_go",
      scanNoGoConfidence: 0.92,
      reasonCodes: ["navigation_transport_failure", "scan_no_go_corroborated"],
      corroboratorCodes: ["pre_consent_navigation_failed", "no_visual_artifact_retained"],
      status: "available"
    },
    visual_access_review: {
      goNoGo: "NO_GO",
      pageState: "missing_visual_artifact",
      reasonCode: "navigation_transport_failure",
      shortExplanation: "Navigation failed before a visual artifact could be retained.",
      status: "missing_visual_artifact"
    }
  });

  assert.equal(notice?.finding.id, "scan_quality_visual_no_go");
  assert.equal(notice?.review.title, "The scanner could not open the site");
  assert.match(notice?.review.reason ?? "", /navigation failed/i);
});

test("deriveVisualAccessLimitationNotice does not treat degraded but usable visual GO as site no-go", async () => {
  const deriveVisualAccessLimitationNotice = await loadVisualAccessLimitationNotice();

  const notice = deriveVisualAccessLimitationNotice({
    visual_access_review: {
      artifactRef: "initial_load:f50e875c64e64921",
      goNoGo: "GO",
      pageState: "degraded_but_useful",
      reasonCode: "branding_visible_with_empty_body",
      shortExplanation:
        "The Georgia Tech header and navigation are visible, indicating a real public page, despite the page body appearing largely blank.",
      status: "available"
    }
  });

  assert.equal(notice, null);
});

test("deriveVisualAccessLimitationNotice does not treat visual-only no-go as site no-go", async () => {
  const deriveVisualAccessLimitationNotice = await loadVisualAccessLimitationNotice();

  const notice = deriveVisualAccessLimitationNotice({
    visual_access_review: {
      artifactRef: "initial_load:3aa98210d0f5",
      confidence: 0.94,
      goNoGo: "NO_GO",
      pageState: "challenge_or_robot_page",
      reasonCode: "bot_challenge_visible",
      shortExplanation: "The retained visual evidence showed a bot challenge instead of the normal public page.",
      status: "available"
    }
  });

  assert.equal(notice, null);
});

test("deriveVisualAccessLimitationNotice uses scan-level no-go assessment when present", async () => {
  const deriveVisualAccessLimitationNotice = await loadVisualAccessLimitationNotice();

  const notice = deriveVisualAccessLimitationNotice({
    scan_no_go_assessment: {
      decision: "no_go",
      scanNoGoConfidence: 0.93,
      visualScreenshotNoGoConfidence: 0.94,
      reasonCodes: ["maintenance_recharging_page", "scan_no_go_corroborated"],
      corroboratorCodes: ["document_status_blocked", "origin_not_reached"],
      contradictorCodes: [],
      status: "available",
      supportingSignals: {
        visualPageState: "maintenance_or_unavailable"
      }
    },
    visual_access_review: {
      artifactRef: "initial_load:3aa98210d0f5",
      confidence: 0.94,
      goNoGo: "NO_GO",
      pageState: "maintenance_or_unavailable",
      reasonCode: "maintenance_recharging_page",
      shortExplanation: "The retained visual evidence showed a maintenance page instead of the normal public page.",
      status: "available"
    }
  });

  assert.equal(notice?.finding.id, "scan_quality_visual_no_go");
  const finding = notice?.finding as { evidencePreview?: string[]; evidenceRefs?: string[] } | undefined;
  assert.ok(finding?.evidenceRefs?.includes("scan_runtime_artifacts.scan_no_go_assessment"));
  assert.ok(finding?.evidencePreview?.some((line) => /Scan no-go confidence: 0\.93/.test(line)));
});

test("deriveVisualAccessLimitationNotice presents every canonical no-go reason without exposing raw codes", async () => {
  const deriveVisualAccessLimitationNotice = await loadVisualAccessLimitationNotice();

  for (const reasonCode of SCAN_NO_GO_REASON_CODES) {
    const presentation = SCAN_NO_GO_REASON_PRESENTATIONS[reasonCode];
    const runtimeArtifacts = {
      scan_no_go_assessment: {
        decision: "no_go",
        scanNoGoConfidence: 0.95,
        reasonCodes: [reasonCode, "scan_no_go_corroborated"],
        status: "available"
      },
      visual_access_review: {
        goNoGo: "NO_GO",
        keyVisualEvidence: ["The retained screenshot showed the classified page state."],
        pageState: presentation.pageState,
        reasonCode,
        shortExplanation: presentation.explanation,
        status: "available"
      }
    };

    const notice = deriveVisualAccessLimitationNotice(runtimeArtifacts);
    assert.equal(notice?.review.title, presentation.customerTitle, reasonCode);
    assert.equal(
      notice?.review.blockerLabel,
      presentation.snapshotStopReasonLabel.replace(/^Homepage\s+/i, ""),
      reasonCode
    );
    assert.equal(notice?.review.reason, presentation.explanation, reasonCode);
    assert.deepEqual(notice?.review.guidance, [presentation.recommendedNextAction], reasonCode);
    assert.equal(notice?.finding.label, presentation.customerTitle, reasonCode);
    assert.equal(notice?.finding.remediation, presentation.recommendedNextAction, reasonCode);
    assert.doesNotMatch(JSON.stringify(notice), new RegExp(reasonCode.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), reasonCode);
    assert.equal(runtimeArtifacts.scan_no_go_assessment.reasonCodes[0], reasonCode, reasonCode);
  }
});

test("deriveVisualAccessLimitationNotice uses a safe fallback for unknown reasons while diagnostics retain the code", async () => {
  const deriveVisualAccessLimitationNotice = await loadVisualAccessLimitationNotice();
  const runtimeArtifacts = {
    scan_no_go_assessment: {
      decision: "no_go",
      scanNoGoConfidence: 0.95,
      reasonCodes: ["legacy_internal_reason_xyz", "scan_no_go_corroborated"],
      status: "available"
    },
    visual_access_review: {
      goNoGo: "NO_GO",
      pageState: "legacy_unknown_state",
      reasonCode: "legacy_internal_reason_xyz",
      shortExplanation: "A legacy diagnostic reason was retained.",
      status: "available"
    }
  };

  const notice = deriveVisualAccessLimitationNotice(runtimeArtifacts);
  assert.equal(notice?.review.title, "The public site could not be verified");
  assert.doesNotMatch(JSON.stringify(notice), /legacy_internal_reason_xyz/);
  assert.equal(runtimeArtifacts.scan_no_go_assessment.reasonCodes[0], "legacy_internal_reason_xyz");
});

test("deriveVisualAccessLimitationNotice identifies the Cerebras prelaunch page without capture-failure copy", async () => {
  const deriveVisualAccessLimitationNotice = await loadVisualAccessLimitationNotice();
  const observedText = "Your browser can’t render the visitor. It’s probably for the best. Check back at launch.";

  const notice = deriveVisualAccessLimitationNotice({
    scan_no_go_assessment: {
      decision: "no_go",
      scanNoGoConfidence: 0.98,
      reasonCodes: ["site_not_ready", "scan_no_go_corroborated"],
      status: "available"
    },
    visual_access_review: {
      goNoGo: "NO_GO",
      key_visual_evidence: [observedText],
      page_state: "site_not_ready",
      reason_code: "site_not_ready",
      short_explanation: "The target displayed a prelaunch page.",
      status: "available"
    }
  });

  assert.equal(notice?.review.title, "The site is not ready for scanning");
  assert.match(notice?.review.reason ?? "", /prelaunch/i);
  assert.match(notice?.review.message ?? "", /Check back at launch/i);
  assert.match(notice?.review.guidance[0] ?? "", /public website launches/i);
  assert.doesNotMatch(JSON.stringify(notice), /Homepage capture failed/i);
});

test("deriveVisualAccessLimitationNotice does not suppress review for diagnostic scan-level no-go assessment", async () => {
  const deriveVisualAccessLimitationNotice = await loadVisualAccessLimitationNotice();

  const notice = deriveVisualAccessLimitationNotice({
    scan_no_go_assessment: {
      decision: "continue_with_diagnostics",
      scanNoGoConfidence: 0.46,
      visualScreenshotNoGoConfidence: 0.94,
      reasonCodes: ["visual_no_go_not_corroborated", "contradicts_no_go:expected_origin_reached"],
      corroboratorCodes: ["challenge_or_block_signals"],
      contradictorCodes: ["expected_origin_reached", "runtime_activity_observed"],
      status: "available",
      supportingSignals: {
        visualPageState: "captcha_or_challenge"
      }
    },
    visual_access_review: {
      artifactRef: "initial_load:3aa98210d0f5",
      confidence: 0.94,
      goNoGo: "NO_GO",
      pageState: "captcha_or_challenge",
      reasonCode: "captcha_or_challenge",
      shortExplanation: "The retained visual evidence showed a challenge page.",
      status: "available"
    }
  });

  assert.equal(notice, null);
});

test("deriveVisualAccessLimitationNotice does not treat lower-confidence visual no-go as site no-go", async () => {
  const deriveVisualAccessLimitationNotice = await loadVisualAccessLimitationNotice();

  const notice = deriveVisualAccessLimitationNotice({
    visual_access_review: {
      artifactRef: "initial_load:c79b32e6a551",
      confidence: 0.86,
      goNoGo: "NO_GO",
      pageState: "blank_or_unusable",
      reasonCode: "blank_page_no_visible_content",
      shortExplanation: "The screenshot is essentially blank with no visible page elements.",
      status: "available"
    }
  });

  assert.equal(notice, null);
});

test("deriveVisualAccessLimitationNotice uses corroborated scan no-go even when screenshot-only confidence is lower", async () => {
  const deriveVisualAccessLimitationNotice = await loadVisualAccessLimitationNotice();

  const notice = deriveVisualAccessLimitationNotice({
    scan_no_go_assessment: {
      decision: "no_go",
      scanNoGoConfidence: 0.92,
      visualScreenshotNoGoConfidence: 0.86,
      reasonCodes: ["blank_page_no_visible_content", "scan_no_go_corroborated", "access_block_text_observed"],
      corroboratorCodes: ["access_block_text_observed", "first_party_identity_missing"],
      contradictorCodes: [],
      status: "available",
      supportingSignals: {
        accessBlockTextObserved: true,
        visualNoGo: true,
        visualPageState: "blank_or_unusable"
      }
    },
    visual_access_review: {
      artifactRef: "initial_load:c79b32e6a551",
      confidence: 0.86,
      goNoGo: "NO_GO",
      pageState: "blank_or_unusable",
      reasonCode: "blank_page_no_visible_content",
      shortExplanation: "The screenshot is essentially blank with no visible page elements.",
      status: "available"
    }
  });

  assert.equal(notice?.finding.id, "scan_quality_visual_no_go");
  const finding = notice?.finding as { evidencePreview?: string[] } | undefined;
  assert.ok(finding?.evidencePreview?.some((line) => /Scan no-go confidence: 0\.92/.test(line)));
});

test("hasIncompleteScanCoverage suppresses partial flag when retained coverage is substantial", async () => {
  const hasIncompleteScanCoverage = await loadHasIncompleteScanCoverage();

  assert.equal(
    hasIncompleteScanCoverage({
      events: [],
      scan: {
        pagesRequested: 3,
        pagesScanned: 3,
        status: "completed"
      },
      snapshot: {
        coverage_level: "limited_partial",
        incomplete_pages: true,
        pages_scanned: 3,
        partial_scan: true,
        report_finding_count: 16,
        total_signals: 37,
        verified_public_surfaces_count: 2
      }
    }),
    false
  );
});

test("hasIncompleteScanCoverage accepts verified public surfaces as retained coverage", async () => {
  const hasIncompleteScanCoverage = await loadHasIncompleteScanCoverage();

  assert.equal(
    hasIncompleteScanCoverage({
      events: [],
      scan: {
        pagesRequested: 3,
        pagesScanned: 1,
        status: "completed"
      },
      snapshot: {
        coverage_level: "limited_partial",
        incomplete_pages: true,
        pages_scanned: 1,
        partial_scan: true,
        report_finding_count: 16,
        total_signals: 37,
        verified_public_surfaces_count: 3
      }
    }),
    false
  );
});

test("hasIncompleteScanCoverage suppresses protected-route-only partial coverage when homepage evidence is usable", async () => {
  const hasIncompleteScanCoverage = await loadHasIncompleteScanCoverage();

  assert.equal(
    hasIncompleteScanCoverage({
      events: [],
      scan: {
        pagesRequested: 3,
        pagesScanned: 2,
        status: "completed"
      },
      snapshot: {
        auth_wall_suspected: true,
        block_page_classification: "login_wall_probable",
        challenge_suspected: true,
        coverage_level: "limited_partial",
        homepage_fetch_http_status: 200,
        homepage_fetch_status: "ok",
        normalized_body_hash: "homepage-hash",
        pages_scanned: 2,
        partial_scan: true,
        total_signals: 24,
        verified_public_surfaces_count: 1
      }
    }),
    false
  );
});

test("hasIncompleteScanCoverage suppresses protected-route-only badge for thin but usable homepage scans", async () => {
  const hasIncompleteScanCoverage = await loadHasIncompleteScanCoverage();

  assert.equal(
    hasIncompleteScanCoverage({
      events: [],
      scan: {
        pagesRequested: 1,
        pagesScanned: 2,
        status: "completed"
      },
      snapshot: {
        auth_wall_suspected: true,
        coverage_level: "limited_partial",
        homepage_fetch_http_status: 200,
        homepage_fetch_status: "ok",
        normalized_body_hash: "homepage-hash",
        pages_scanned: 2,
        partial_scan: true,
        report_finding_count: 1,
        scan_outcome: "protected_route_encountered",
        total_signals: 12,
        verified_public_surfaces_count: 1
      }
    }),
    false
  );
});

test("hasIncompleteScanCoverage keeps warning for thin or hard-limited coverage", async () => {
  const hasIncompleteScanCoverage = await loadHasIncompleteScanCoverage();

  assert.equal(
    hasIncompleteScanCoverage({
      events: [],
      scan: {
        pagesRequested: 3,
        pagesScanned: 1,
        status: "completed"
      },
      snapshot: {
        blocked_flag: true,
        coverage_level: "limited_partial",
        pages_scanned: 1,
        partial_scan: true,
        report_finding_count: 0,
        total_signals: 4,
        verified_public_surfaces_count: 0
      }
    }),
    true
  );
});

test("hasIncompleteScanCoverage keeps warning for partial scans with few retained findings", async () => {
  const hasIncompleteScanCoverage = await loadHasIncompleteScanCoverage();

  assert.equal(
    hasIncompleteScanCoverage({
      events: [],
      scan: {
        pagesRequested: 3,
        pagesScanned: 3,
        status: "completed"
      },
      snapshot: {
        coverage_level: "limited_partial",
        incomplete_pages: true,
        pages_scanned: 3,
        partial_scan: true,
        report_finding_count: 0,
        total_signals: 81,
        verified_public_surfaces_count: 2
      }
    }),
    true
  );
});

test("hasIncompleteScanCoverage keeps warning when pre-consent runtime failed without visual evidence", async () => {
  const hasIncompleteScanCoverage = await loadHasIncompleteScanCoverage();

  assert.equal(
    hasIncompleteScanCoverage({
      events: [],
      scan: {
        pagesRequested: 1,
        pagesScanned: 1,
        status: "completed"
      },
      snapshot: {
        coverage_level: "limited_partial",
        pages_scanned: 1,
        partial_scan: true,
        report_finding_count: 4,
        runtime_counts_retained: false,
        runtime_limitation_keys: [
          "pre_consent_runtime_failed",
          "visual_capture_unavailable"
        ],
        total_signals: 42,
        verified_public_surfaces_count: 2
      }
    }),
    true
  );
});

test("selectExecutiveAccessLimitationNotice does not replace retained unified findings", async () => {
  const selectExecutiveAccessLimitationNotice = await loadSelectExecutiveAccessLimitationNotice();
  const notice = {
    finding: { label: "Public site access was limited" },
    review: { coverageLabel: "No public verification available" },
    summary: "No reliable findings were retained."
  };

  assert.equal(
    selectExecutiveAccessLimitationNotice({
      allExecutiveFindings: [{ id: "guaranteed_outcome_claim_detected" }],
      notice,
      topExecutiveFindings: [{ id: "guaranteed_outcome_claim_detected" }]
    }),
    null
  );
  assert.equal(
    selectExecutiveAccessLimitationNotice({
      allExecutiveFindings: [],
      notice,
      topExecutiveFindings: []
    }),
    notice
  );
});

test("selectExecutiveAccessLimitationNotice lets retained visual no-go limit substantive findings", async () => {
  const selectExecutiveAccessLimitationNotice = await loadSelectExecutiveAccessLimitationNotice();
  const notice = {
    finding: { id: "scan_quality_visual_no_go", label: "Normal public site was not reached" },
    review: { coverageLabel: "Visual verification unavailable" },
    summary: "No reliable findings were retained."
  };
  const visualNoGoFinding = { id: "scan_quality_visual_no_go" };

  assert.equal(
    selectExecutiveAccessLimitationNotice({
      allExecutiveFindings: [visualNoGoFinding],
      notice,
      topExecutiveFindings: [visualNoGoFinding]
    }),
    notice
  );
  assert.equal(
    selectExecutiveAccessLimitationNotice({
      allExecutiveFindings: [visualNoGoFinding, { id: "tracking_before_consent" }],
      notice,
      topExecutiveFindings: [visualNoGoFinding]
    }),
    notice
  );
});

test("shouldShowRegulatoryChecklistSection hides regulatory review for report-withheld access limitations", async () => {
  const shouldShowRegulatoryChecklistSection = await loadShouldShowRegulatoryChecklistSection();

  assert.equal(
    shouldShowRegulatoryChecklistSection({
      executiveAccessLimitationNotice: {
        finding: { id: "scan_quality_visual_no_go" }
      }
    }),
    false
  );
  assert.equal(
    shouldShowRegulatoryChecklistSection({
      executiveAccessLimitationNotice: {
        finding: { id: "access_limited_no_reliable_findings" }
      }
    }),
    false
  );
  assert.equal(
    shouldShowRegulatoryChecklistSection({
      executiveAccessLimitationNotice: null
    }),
    true
  );
});

test("buildPreviewExecutiveAccessLimitationNotice preserves limited homepage preview withholding", async () => {
  const buildPreviewExecutiveAccessLimitationNotice = await loadPreviewExecutiveAccessLimitationNotice();

  const notice = buildPreviewExecutiveAccessLimitationNotice({
    resultState: {
      code: "unknown_access_limitation",
      coverageLevel: "limited_partial",
      message:
        "This run could not fully verify public pages because the site limited automated access from the scan environment. This does not by itself mean expected disclosures are absent.",
      title: "Access limited by site protections"
    },
    review: {
      coverageLabel: "Partial public verification available",
      guidance: ["Retry from a normal browsing session."],
      message: "Verified public surfaces detected: Privacy policy, Terms of service.",
      outcomeTitle: "Access limited during live browser verification",
      recommendationTitle: "Protected-Site Workflow Recommended",
      reason: "Reason: no specific reachability blocker was retained for this run.",
      title: "Access limited by site protections",
      verifiedPolicyInsights: [],
      verifiedSurfaces: ["Privacy policy", "Terms of service"],
      whatThisMeans: ["This run does not support trustworthy privacy conclusions."]
    }
  });

  assert.match(notice.summary, /Preview scores were withheld/i);
  assert.equal(notice.review.coverageLabel, "Partial public verification available");
  assert.deepEqual(notice.review.verifiedSurfaces, ["Privacy policy", "Terms of service"]);
  assert.match(notice.finding.shortSummary, /site limited automated access/i);
});

test("getHomepagePreviewGateIdleLabel distinguishes create-account and sign-in links", async () => {
  const getHomepagePreviewGateIdleLabel = await loadHomepagePreviewGateIdleLabel();

  assert.equal(
    getHomepagePreviewGateIdleLabel("/login?mode=create_account&next=%2Fscan%2Fscan-1"),
    "Create account to view"
  );
  assert.equal(
    getHomepagePreviewGateIdleLabel("/login?next=%2Fscan%2Fscan-1"),
    "Sign in to view"
  );
});

test("deriveUnverifiedHomepageReview carries verified privacy and terms surfaces on blocked runs", async () => {
  const deriveUnverifiedHomepageReview = await loadUnverifiedHomepageReview();

  const review = deriveUnverifiedHomepageReview({
    homepage_fetch_http_status: 403,
    homepage_fetch_status: "forbidden",
    pages_scanned: 0,
    privacy_policy_present: true,
    terms_of_service_present: true
  });

  assert.deepEqual(review?.verifiedSurfaces ?? [], ["Privacy policy", "Terms of service"]);
  assert.equal(review?.coverageLabel, "Partial public verification available");
  assert.match(review?.message ?? "", /Verified public surfaces detected: Privacy policy, Terms of service\./i);
});

test("deriveUnverifiedHomepageReview carries verified cookie policy and contact surfaces on blocked runs", async () => {
  const deriveUnverifiedHomepageReview = await loadUnverifiedHomepageReview();

  const review = deriveUnverifiedHomepageReview({
    contact_page_present: true,
    cookie_policy_present: true,
    homepage_fetch_http_status: 403,
    homepage_fetch_status: "forbidden",
    pages_scanned: 0
  });

  assert.deepEqual(review?.verifiedSurfaces ?? [], ["Cookie policy", "Contact page"]);
  assert.equal(review?.coverageLabel, "Partial public verification available");
  assert.match(review?.message ?? "", /Verified public surfaces detected: Cookie policy, Contact page\./i);
});

test("deriveUnverifiedHomepageReview carries verified policy insights on blocked runs", async () => {
  const deriveUnverifiedHomepageReview = await loadUnverifiedHomepageReview();

  const review = deriveUnverifiedHomepageReview(
    {
      homepage_fetch_http_status: 403,
      homepage_fetch_status: "forbidden",
      pages_scanned: 0,
      privacy_policy_present: true
    },
    [],
    [
      {
        page_type: "privacy_policy",
        page_url: "https://www.coinbase.com/legal/privacy",
        policy_summary_short: "Coinbase explains how it uses personal data and advertising-related disclosures.",
        policy_mentions: [{ topic: "data_retention" }, { topic: "cross_border_transfer" }],
        policy_actionable_flags: ["blocked_homepage_direct_policy_page", "vague_policy_language"]
      }
    ]
  );

  assert.equal(review?.verifiedPolicyInsights.length, 1);
  assert.equal(review?.verifiedPolicyInsights[0]?.pageLabel, "Privacy policy");
  assert.deepEqual(review?.verifiedPolicyInsights[0]?.topics, ["Data Retention", "Cross Border Transfer"]);
  assert.deepEqual(review?.verifiedPolicyInsights[0]?.flags, ["Vague Policy Language"]);
});

test("deriveUnverifiedHomepageReview returns an explicit rate-limited explanation", async () => {
  const deriveUnverifiedHomepageReview = await loadUnverifiedHomepageReview();

  const review = deriveUnverifiedHomepageReview({
    homepage_fetch_http_status: 429,
    homepage_fetch_status: "ok",
    pages_scanned: 0
  });

  assert.equal(review?.title, "Access limited by site protections");
  assert.equal(
    review?.reason,
    "Reason: homepage request was rate-limited with HTTP 429 before the scanner could verify a usable page surface."
  );
});

test("deriveUnverifiedHomepageReview skips blocked-access framing for evidence-rich zero-page previews with successful homepage fetches", async () => {
  const deriveUnverifiedHomepageReview = await loadUnverifiedHomepageReview();

  const review = deriveUnverifiedHomepageReview({
    cookie_policy_present: true,
    homepage_fetch_http_status: 200,
    homepage_fetch_status: "ok",
    pages_scanned: 0,
    preconsent_tracking_detected: true,
    privacy_policy_present: true,
    terms_of_service_present: true,
    total_signals: 9,
    tracking_before_consent_detected: true
  });

  assert.equal(review, null);
});

test("deriveUnverifiedHomepageReview returns a generic zero-pages explanation when no stronger blocker is retained", async () => {
  const deriveUnverifiedHomepageReview = await loadUnverifiedHomepageReview();

  const review = deriveUnverifiedHomepageReview({
    pages_scanned: 0
  });

  assert.equal(review?.title, "Access limited by site protections");
  assert.equal(review?.reason, "Reason: no specific reachability blocker was retained for this run.");
});

test("deriveUnverifiedHomepageReview returns an explicit unreachable-homepage reason", async () => {
  const deriveUnverifiedHomepageReview = await loadUnverifiedHomepageReview();

  const review = deriveUnverifiedHomepageReview({
    homepage_fetch_status: "error",
    pages_scanned: 0
  });

  assert.equal(review?.title, "Transport failure");
  assert.match(review?.reason ?? "", /connection, DNS, TLS, or other transport failure/i);
});

test("deriveUnverifiedHomepageReview classifies not-found homepages as inactive or unstable", async () => {
  const deriveUnverifiedHomepageReview = await loadUnverifiedHomepageReview();

  const review = deriveUnverifiedHomepageReview({
    homepage_fetch_http_status: 404,
    homepage_fetch_status: "not_found",
    pages_scanned: 0
  });

  assert.equal(review?.title, "Domain inactive or unstable");
  assert.equal(review?.outcomeTitle, "Domain inactive or unstable");
  assert.equal(review?.reason, "Reason: homepage returned HTTP 404 Not Found.");
});

test("getTrackerConsentReviewPriority treats plain Sentry telemetry as contextual", async () => {
  const getTrackerConsentReviewPriority = await loadTrackerConsentReviewPriority();

  assert.equal(
    getTrackerConsentReviewPriority({
      category: "Performance monitoring",
      confidence: 0.92,
      domains: ["o514642.ingest.us.sentry.io"],
      firstSeenMs: 420,
      label: "Sentry",
      observedVia: ["request"],
      preConsent: true,
      regulatoryRelevance: ["performance_monitoring", "telemetry", "diagnostics"],
      requestCount: 1,
      source: "runtime",
      vendorDisplayCategory: "Performance monitoring",
    }),
    "contextual",
  );
});

test("getTrackerConsentReviewPriority rates tag management and marketing automation as medium", async () => {
  const getTrackerConsentReviewPriority = await loadTrackerConsentReviewPriority();

  assert.equal(
    getTrackerConsentReviewPriority({
      category: "analytics",
      confidence: 0.94,
      domains: ["static.klaviyo.com"],
      firstSeenMs: 1422,
      label: "Klaviyo",
      observedVia: ["script"],
      preConsent: true,
      regulatoryRelevance: ["marketing_automation", "email_personalization"],
      requestCount: 1,
      source: "runtime",
      vendorDisplayCategory: "Marketing automation",
    }),
    "medium",
  );
  assert.equal(
    getTrackerConsentReviewPriority({
      category: "tag_manager",
      confidence: 0.96,
      domains: ["www.googletagmanager.com"],
      firstSeenMs: 1630,
      label: "Google Tag Manager",
      observedVia: ["script"],
      preConsent: true,
      regulatoryRelevance: ["tag_management", "third_party_runtime"],
      requestCount: 1,
      source: "runtime",
      vendorDisplayCategory: "Tag management",
    }),
    "medium",
  );
});

test("getTrackerConsentReviewPriority rates LinkedIn Ads Pixel as high only when pre-consent", async () => {
  const getTrackerConsentReviewPriority = await loadTrackerConsentReviewPriority();
  const row = {
    category: "advertising",
    confidence: 0.95,
    domains: ["px.ads.linkedin.com"],
    firstSeenMs: 1422,
    label: "LinkedIn Ads Pixel",
    observedVia: ["request"],
    regulatoryRelevance: ["consent", "advertising", "cross_site_tracking", "ad_measurement"],
    requestCount: 1,
    source: "runtime",
    vendorDisplayCategory: "Advertising",
  };

  assert.equal(
    getTrackerConsentReviewPriority({
      ...row,
      preConsent: true,
    }),
    "high",
  );
  assert.equal(
    getTrackerConsentReviewPriority({
      ...row,
      preConsent: false,
    }),
    "review_needed",
  );
});

test("deriveUnverifiedHomepageReview prefers logged DNS failure reason when available", async () => {
  const deriveUnverifiedHomepageReview = await loadUnverifiedHomepageReview();

  const review = deriveUnverifiedHomepageReview(
    {
      homepage_fetch_status: "error",
      pages_scanned: 0
    },
    [
      {
        eventType: "runtime.browser_pass_diagnostic",
        message: "Browser pass navigation error.",
        metadataJson: {
          error: "page.goto: net::ERR_NAME_NOT_RESOLVED at https://example.com/"
        }
      }
    ]
  );

  assert.equal(review?.title, "Transport failure");
  assert.equal(review?.reason, "Reason: homepage could not be reached because the domain failed DNS resolution.");
});

test("deriveUnverifiedHomepageReview recommends protected-site workflow for cloudflare challenge evidence", async () => {
  const deriveUnverifiedHomepageReview = await loadUnverifiedHomepageReview();

  const review = deriveUnverifiedHomepageReview(
    {
      homepage_fetch_status: "forbidden",
      homepage_fetch_http_status: 403,
      pages_scanned: 0,
      robots_allowed: true
    },
    [
      {
        eventType: "access.limitations_detected",
        message: "Access limitations detected.",
        metadataJson: {
          botChallengeDetected: true,
          challengeHeaders: {
            server: "cloudflare",
            cfMitigated: "challenge"
          }
        }
      }
    ]
  );

  assert.equal(review?.recommendationTitle, "Protected-Site Workflow Recommended");
  assert.ok(review?.guidance.some((item) => /allowlisting or a supported review path/i.test(item)));
});

test("deriveUnverifiedHomepageReview returns null when the homepage was actually scanned", async () => {
  const deriveUnverifiedHomepageReview = await loadUnverifiedHomepageReview();

  const review = deriveUnverifiedHomepageReview({
    homepage_fetch_status: "ok",
    normalized_body_hash: "homepage-content",
    pages_scanned: 1
  });

  assert.equal(review, null);
});
