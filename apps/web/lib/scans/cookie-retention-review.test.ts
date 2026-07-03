import assert from "node:assert/strict";
import test from "node:test";

import { buildRegulatoryLenses } from "../../components/scans/executive-summary-card";
import { evaluateCookieRetentionReview } from "./cookie-retention-review";
import { projectExecutiveFindingsFromUnifiedPackets } from "./executive-findings-projection";
import { buildUnifiedFindingPackets, type UnifiedFindingDisplayPacket } from "./unified-findings";
import { selectTopFindings } from "./rank-findings";

function runtimeCookie(overrides: Record<string, unknown> = {}) {
  return {
    classification: "advertising/marketing",
    cookieName: "_fbp",
    domain: ".example.com",
    durationDays: 540,
    pageUrl: "https://example.com/",
    party: "third_party",
    sourceRequestUrl: "https://connect.facebook.net/en_US/fbevents.js",
    thresholdBasis: "540 days observed against CertScore's 365-day cookie retention review threshold.",
    vendor: "Meta",
    ...overrides
  };
}

function buildRetentionPackets(cookieRows: Array<Record<string, unknown>>, fallbackOverrides: Record<string, unknown> = {}) {
  return buildUnifiedFindingPackets({
    reviewFindingCandidates: [
      {
        description: "Long-lived cookie retention review",
        evidence: ["https://example.com/"],
        fallbackEvidence: {
          signalKey: "privacy.cookie_retention_lifetime_review_signal",
          signalValue: cookieRows.map((row) => JSON.stringify(row)),
          unifiedFindingId: "cookie_retention_lifetime_review_signal",
          ...fallbackOverrides
        },
        observedValue: null,
        severity: "medium",
        signalKey: "privacy.cookie_retention_lifetime_review_signal",
        signalLabel: "Long-lived cookie retention review",
        signalSource: "runtime_artifact_signal",
        sourceType: "signal",
        title: "Long-lived cookie retention review"
      }
    ],
    validationFindings: []
  });
}

function displayPacketFromUnified(packet: ReturnType<typeof buildUnifiedFindingPackets>[number]): UnifiedFindingDisplayPacket {
  return {
    ...packet,
    linkedValidationFinding: null,
    observedValue: null,
    presentation: {
      findingName: packet.title,
      suggestedFix: "Review cookie purposes and vendors.",
      whyThisMatters: packet.summary
    },
    presentationDecision: {
      confidenceRationale: "Concrete runtime cookie evidence retained.",
      downgradeReasons: [],
      rationale: "Runtime cookie retention evidence retained.",
      status: "surface",
      verificationLabel: "Runtime",
      verificationState: "runtime"
    },
    referenceLabel: undefined,
    referenceUrl: undefined,
    sourceLabel: undefined,
    sourceUrl: undefined,
    surfacingDecision: {
      appliedRules: [],
      decisionReasons: [],
      decisionState: "confirmed",
      family: "consent_tracking",
      policyVersion: "test",
      reportLane: "main",
      reportable: true,
      surfaceTier: "headline",
      supports: [],
      unifiedFindingId: packet.unifiedFindingId,
      usedFamilyDefault: false,
      usedFindingOverride: true
    }
  };
}

test("promotes known advertising cookie retention evidence into a medium strong direct top finding", () => {
  const packets = buildRetentionPackets([runtimeCookie()]);
  const packet = packets.find((entry) => entry.unifiedFindingId === "cookie_retention_lifetime_review_signal");
  assert.ok(packet);
  assert.equal(packet.concernContext?.externalSurfacingEligibilities.includes("eligible"), true);

  const projection = projectExecutiveFindingsFromUnifiedPackets([displayPacketFromUnified(packet)]);
  const finding = projection.findings.find((entry) => entry.id === "long_lived_cookie_retention_review");
  assert.equal(finding?.severity, "medium");
  assert.equal(finding?.confidence, "strong");
  assert.equal(finding?.directVsInferred, "direct");
  assert.ok(projection.topFindings.some((entry) => entry.id === "long_lived_cookie_retention_review"));

  const lenses = buildRegulatoryLenses(projection.findings, {
    beforeConsentCookieCount: 0,
    thirdPartyRequestCount: 0
  });
  assert.ok(lenses.find((lens) => lens.acronym === "GDPR / ePrivacy")?.findings.some((entry) => entry.id === "long_lived_cookie_retention_review"));
  assert.deepEqual(lenses.map((lens) => lens.acronym), ["GDPR / ePrivacy"]);
});

test("keeps unknown long-lived cookie evidence audit-only medium review signal", () => {
  const review = evaluateCookieRetentionReview({
    cookieRetentionEvidence: [
      runtimeCookie({
        classification: "unknown",
        cookieName: "xbc",
        durationDays: 399,
        sourceRequestUrl: null,
        vendor: null
      })
    ]
  });

  assert.equal(review.disposition, "audit_only");
  assert.equal(review.severity, "medium");
  assert.ok(review.confidence === "moderate" || review.confidence === "good");
});

test("promotes unknown very-long-lived cookie evidence when severe threshold is reached", () => {
  const review = evaluateCookieRetentionReview({
    cookieRetentionEvidence: [
      runtimeCookie({
        classification: "unknown",
        cookieName: "xbc",
        durationDays: 800,
        sourceRequestUrl: null,
        vendor: null
      })
    ]
  });

  assert.equal(review.disposition, "eligible");
  assert.equal(review.severity, "high");
  assert.equal(review.confidence, "moderate");
});

test("keeps unknown first-party 180-364 day cookie retention evidence audit-only", () => {
  const review = evaluateCookieRetentionReview({
    cookieRetentionEvidence: [
      runtimeCookie({
        classification: "unknown",
        cookieName: "xbc",
        durationDays: 240,
        party: "first_party",
        sourceRequestUrl: null,
        vendor: null
      })
    ]
  });

  assert.equal(review.disposition, "audit_only");
  assert.equal(review.severity, "low");
});

test("suppresses cookie retention review when duration evidence is missing", () => {
  const review = evaluateCookieRetentionReview({
    cookieRetentionEvidence: [
      runtimeCookie({
        durationDays: undefined
      })
    ]
  });

  assert.equal(review.disposition, "suppress");
  assert.ok(review.negativeEvidenceFlags.includes("missing_cookie_duration"));
});

test("does not create cookie retention finding from policy-only evidence", () => {
  const packets = buildRetentionPackets([], {
    policySnippets: ["Analytics cookies may be used for marketing and measurement."]
  });

  assert.equal(packets.some((entry) => entry.unifiedFindingId === "cookie_retention_lifetime_review_signal"), false);
});

test("does not externally promote cookie-count-only retention context", () => {
  const packets = buildRetentionPackets([], {
    counts: { cookieCount: 75 }
  });

  assert.equal(packets.some((entry) => entry.unifiedFindingId === "cookie_retention_lifetime_review_signal"), false);
});

test("suppresses essential and session-only cookie retention observations", () => {
  const review = evaluateCookieRetentionReview({
    cookieRetentionEvidence: [
      runtimeCookie({
        classification: "essential",
        cookieName: "session_id",
        durationDays: 800
      }),
      runtimeCookie({
        classification: "session",
        cookieName: "session_id_2",
        durationDays: 800
      })
    ]
  });

  assert.equal(review.disposition, "suppress");
});

test("demotes duplicate long-lived cookie top finding when stronger cookie timing evidence uses the same cookie", () => {
  const retentionPackets = buildRetentionPackets([runtimeCookie({ cookieName: "_ga", classification: "analytics" })]);
  const retentionFinding = projectExecutiveFindingsFromUnifiedPackets([
    displayPacketFromUnified(retentionPackets[0]!)
  ]).findings.find((entry) => entry.id === "long_lived_cookie_retention_review");

  assert.ok(retentionFinding);

  const selected = selectTopFindings([
    retentionFinding,
    {
      ...retentionFinding,
      id: "third_party_cookie_pre_consent",
      label: "Third-party cookie or storage observed before consent",
      evidenceDetails: {
        cookieEvidence: {
          cookieWriteEvidence: [{ cookieName: "_ga", domain: ".example.com" }]
        }
      }
    }
  ]);

  assert.ok(selected.some((entry) => entry.id === "third_party_cookie_pre_consent"));
  assert.equal(selected.some((entry) => entry.id === "long_lived_cookie_retention_review"), false);
});
