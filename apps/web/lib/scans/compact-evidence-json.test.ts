import assert from "node:assert/strict";
import test from "node:test";
import {
  compactEvidenceJsonForDisplay,
  sanitizePublicReportEvidenceText
} from "./compact-evidence-json";

test("compacts long evidence arrays into a sampled summary", () => {
  const compacted = compactEvidenceJsonForDisplay({
    supportingSignals: [
      {
        key: "privacy.preconsent_tracker_evidence_urls",
        value: [
          "https://a.example/1",
          "https://a.example/2",
          "https://a.example/3",
          "https://a.example/4",
          "https://a.example/5",
          "https://a.example/6"
        ]
      }
    ]
  }) as {
    supportingSignals: Array<{ value: { sample: string[]; totalCount: number; truncated: boolean } }>;
  };

  assert.equal(compacted.supportingSignals[0]?.value.totalCount, 6);
  assert.equal(compacted.supportingSignals[0]?.value.truncated, true);
  assert.deepEqual(compacted.supportingSignals[0]?.value.sample, [
    "https://a.example/1",
    "https://a.example/2",
    "https://a.example/3",
    "https://a.example/4",
    "https://a.example/5"
  ]);
});

test("keeps report-facing demotion reasons complete", () => {
  const compacted = compactEvidenceJsonForDisplay({
    topFindingEligibility: {
      demotionReasons: [
        "no_consent_surface_observed",
        "no_consent_actionable_choice_observed",
        "missing_concrete_preconsent_artifact",
        "missing_preconsent_sequence_evidence",
        "Concrete request or vendor artifacts were not retained for the pre-consent tracking claim.",
        "The retained evidence does not yet fully support the request sequence before a clear consent choice."
      ]
    }
  }) as {
    topFindingEligibility: {
      demotionReasons: string[];
    };
  };

  assert.deepEqual(compacted.topFindingEligibility.demotionReasons, [
    "no_consent_surface_observed",
    "no_consent_actionable_choice_observed",
    "missing_concrete_preconsent_artifact",
    "missing_preconsent_sequence_evidence",
    "Concrete request or vendor artifacts were not retained for the pre-consent tracking claim.",
    "The retained evidence does not yet fully support the request sequence before a clear consent choice."
  ]);
});

test("compacts long strings for readability", () => {
  const compacted = compactEvidenceJsonForDisplay({
    runtimeEvidence: ["x".repeat(260)]
  }) as { runtimeEvidence: string[] };

  assert.match(compacted.runtimeEvidence[0] ?? "", /\[truncated 20 chars\]$/);
});

test("collapses repeated URL aliases into one display list", () => {
  const compacted = compactEvidenceJsonForDisplay({
    evidence: {
      pageUrls: ["https://example.test/"],
      sourceUrls: ["https://tracker.test/pixel.js", "https://tracker.test/pixel.js"],
      entities: {
        runtimeRequestUrls: ["https://tracker.test/pixel.js"],
        preconsent_cookie_initiator_urls: ["https://tracker.test/pixel.js", "https://cdn.test/tag.js"]
      },
      runtimeRequestUrls: ["https://tracker.test/pixel.js", "https://cdn.test/tag.js"]
    },
    sourceUrl: "https://tracker.test/pixel.js"
  }) as {
    evidence: {
      urls: string[];
      pageUrls?: string[];
      sourceUrls?: string[];
      runtimeRequestUrls?: string[];
      entities: {
        runtimeRequestUrls?: string[];
        preconsent_cookie_initiator_urls?: string[];
      };
    };
    sourceUrl?: string;
  };

  assert.deepEqual(compacted.evidence.urls, [
    "https://example.test/",
    "https://tracker.test/pixel.js",
    "https://cdn.test/tag.js"
  ]);
  assert.equal(compacted.evidence.pageUrls, undefined);
  assert.equal(compacted.evidence.sourceUrls, undefined);
  assert.equal(compacted.evidence.runtimeRequestUrls, undefined);
  assert.equal(compacted.evidence.entities.runtimeRequestUrls, undefined);
  assert.equal(compacted.evidence.entities.preconsent_cookie_initiator_urls, undefined);
  assert.equal(compacted.sourceUrl, undefined);
});

test("redacts public report URL query values while preserving origin, path, and keys", () => {
  const compacted = compactEvidenceJsonForDisplay({
    requestSamples: [
      "https://gum.criteo.com/sid/json?origin=prebid&topUrl=https%3A%2F%2Fexample.com&gpp_sid=7",
      "https://securepubads.g.doubleclick.net/pagead/managed/js/gpt/pubads_impl.js?cb=12345",
      "https://www.googletagmanager.com/gtm.js?id=GTM-ABC&gtm_auth=secret&gtm_preview=env-1",
      "https://edge.platform.latimes.com/v1/personalize?meterKey=raw-meter&pxlId=raw-pxl&exp=1",
      "https://warp.media.net/js/tags/clientag.js?cid=abc&dn=example.com&ysection=hero&version=2",
      "https://sb.scorecardresearch.com/b?c1=2&cs_fpid=raw-fpid",
      "https://example.test/extra?uid=raw"
    ],
    relatedUrl: "https://sync.example/id?CtsSyncId=raw&MUID=raw&MXFR=raw"
  }) as { requestSamples: string[]; relatedUrl: string };
  const serialized = JSON.stringify(compacted);

  assert.match(serialized, /https:\/\/gum\.criteo\.com\/sid\/json \[query_redacted=true/);
  assert.match(serialized, /query_keys=origin,topUrl,gpp_sid/);
  assert.match(serialized, /https:\/\/www\.googletagmanager\.com\/gtm\.js \[query_redacted=true/);
  assert.match(serialized, /query_keys=id,gtm_auth,gtm_preview/);
  assert.match(serialized, /https:\/\/edge\.platform\.latimes\.com\/v1\/personalize \[query_redacted=true/);
  assert.doesNotMatch(serialized, /GTM-ABC|secret|env-1|raw-fpid|raw-meter|raw-pxl|CtsSyncId=raw|MUID=raw|MXFR=raw|gpp_sid=7/);
  assert.equal(compacted.relatedUrl.includes("[query_redacted=true"), true);
});

test("strips internal projection and policy fields from public report JSON", () => {
  const compacted = compactEvidenceJsonForDisplay({
    defaultSurfacePriority: 100,
    legalRelevance: {
      gdprEprivacyConsentSupport: "internal"
    },
    cipaPenRegisterTheorySupport: "internal",
    gdprEprivacyConsentSupport: "internal",
    cpraSharingSupport: "internal",
    ftcDarkPatternOrDeceptionSupport: "internal",
    family: {
      consent_tracking: {
        default: true
      }
    },
    normalizedConcernIds: ["concern-1"],
    concernPolicyRuleIds: ["policy-1"],
    evidence: {
      preconsent: {
        confirmed_when_validation_and_runtime_artifacts: true
      },
      consent_behavior: {
        review_runtime_without_effect_evidence: true
      }
    },
    publicAnchor: "retained runtime evidence"
  });
  const serialized = JSON.stringify(compacted);

  assert.doesNotMatch(serialized, /defaultSurfacePriority|legalRelevance|PenRegisterTheorySupport|EprivacyConsentSupport|cpraSharingSupport|DarkPatternOrDeceptionSupport/i);
  assert.doesNotMatch(serialized, /normalizedConcernIds|concernPolicyRuleIds/i);
  assert.match(serialized, /retained runtime evidence/);
});

test("sanitizes visible evidence text overclaims and embedded URLs", () => {
  const sanitized = sanitizePublicReportEvidenceText(
    "The retained evidence does not yet prove the request https://example.test/collect?client_id=raw&sid=secret is a WCAG rule violations example."
  );

  assert.match(sanitized, /does not yet fully support/);
  assert.match(sanitized, /https:\/\/example\.test\/collect \[query_redacted=true query_keys=client_id,sid\]/);
  assert.match(sanitized, /automated accessibility rule examples for review/);
  assert.doesNotMatch(sanitized, /client_id=raw|sid=secret|WCAG rule violations/);
});

test("labels cookie timing artifacts separately from related request context", () => {
  const compacted = compactEvidenceJsonForDisplay({
    evidenceDetails: {
      cookieEvidence: {
        cookieWriteEvidence: [{ cookieName: "example_id", url: "https://ads.example/pixel?uid=raw" }],
        storageEvidence: [{ key: "example_storage", valueRedacted: true }],
        relatedRuntimeRequests: [{ url: "https://ads.example/context?sid=raw", preConsent: false }]
      }
    }
  }) as {
    evidenceDetails: {
      cookieEvidence: {
        cookieWriteEvidence: Array<{ evidenceRole: string; url: string }>;
        relatedRuntimeRequests: Array<{ evidenceRole: string; url: string }>;
        storageEvidence: Array<{ evidenceRole: string }>;
      };
    };
  };

  assert.equal(compacted.evidenceDetails.cookieEvidence.cookieWriteEvidence[0]?.evidenceRole, "finding_supporting_artifact");
  assert.equal(compacted.evidenceDetails.cookieEvidence.storageEvidence[0]?.evidenceRole, "finding_supporting_artifact");
  assert.equal(compacted.evidenceDetails.cookieEvidence.relatedRuntimeRequests[0]?.evidenceRole, "related_context_only");
  assert.match(compacted.evidenceDetails.cookieEvidence.relatedRuntimeRequests[0]?.url ?? "", /\[query_redacted=true/);
  assert.doesNotMatch(JSON.stringify(compacted), /uid=raw|sid=raw/);
});
