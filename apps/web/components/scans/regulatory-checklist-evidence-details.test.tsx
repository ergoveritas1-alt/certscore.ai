import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RegulatoryChecklistActiveTrace, RegulatoryChecklistCorrectionSteps, RegulatoryChecklistEvidenceDetails } from "./regulatory-checklist-evidence-details";

test("RegulatoryChecklistActiveTrace renders a concise end-user result explanation", () => {
  const html = renderToStaticMarkup(
    createElement(RegulatoryChecklistActiveTrace, {
      evidenceRefs: ["Cookie consent state: pre-consent"],
      jsonPayload: JSON.stringify({
        assessmentStatus: "gap_observed",
        coverageArea: "Cookies or storage before consent",
        evidenceFamily: "cookie_storage",
        evidenceState: "observed",
        pipeline: {
          projectionStage: "coverage_policy",
          sourceModule: "preConsentRuntimeScanner"
        },
        retainedEvidence: {
          evidenceHighlights: [
            "\"x_vendor\", \"preConsent\": true, \"firstSeenMs\": 482"
          ],
          smokingGunEvidence: [{
            consentState: "pre_consent",
            cookieDomain: ".vendor.example",
            cookieName: "x_vendor",
            cookieParty: "third_party",
            cookiePurpose: "advertising",
            eventId: "cookie_1",
            eventType: "cookie",
            host: "ads.vendor.example",
            kind: "cookie",
            timestampMs: 482
          }],
          preConsentCookieNames: ["x_vendor"]
        },
        status: "Gap observed",
        statusBasis: "Cookie storage was observed before any retained consent action."
      })
    })
  );

  assert.match(html, /Why this result/);
  assert.match(html, /max-h-\[50vh\]/);
  assert.doesNotMatch(html, /Gap Observed/);
  assert.doesNotMatch(html, /CertScore rated this as Gap Observed/);
  assert.doesNotMatch(html, /after evaluating the retained gate values and evidence/);
  assert.match(html, /Basis/);
  assert.match(html, /Evidence used/);
  assert.match(html, /x_vendor was observed before consent/);
  assert.match(html, /advertising/);
  assert.match(html, /3rd party/);
  assert.match(html, /x_vendor/);
  assert.doesNotMatch(html, /Scan started/);
  assert.doesNotMatch(html, /Gate decision/);
  assert.doesNotMatch(html, /preConsentRuntimeScanner/);
  assert.doesNotMatch(html, /coverage_policy/);
  assert.doesNotMatch(html, /eventId=cookie_1/);
  assert.doesNotMatch(html, /Raw trace details/);
});

test("RegulatoryChecklistActiveTrace keeps checked explanations short", () => {
  const html = renderToStaticMarkup(
    createElement(RegulatoryChecklistActiveTrace, {
      evidenceRefs: ["ref_one", "ref_two", "ref_three", "ref_four", "ref_five", "ref_six"],
      jsonPayload: JSON.stringify({
        assessmentStatus: "checked",
        coverageArea: "Privacy notice availability",
        evidenceState: "observed",
        retainedEvidence: {},
        status: "Observed",
        statusBasis: "Privacy notice evidence was retained."
      })
    })
  );

  assert.match(html, /Why this result/);
  assert.doesNotMatch(html, /Checked/);
  assert.match(html, /max-h-\[50vh\]/);
  assert.match(html, /overflow-y-auto/);
  assert.match(html, /Privacy notice evidence was retained/);
  assert.match(html, /ref one/);
  assert.doesNotMatch(html, /Why this result\?\s*<span[^>]*>Checked/);
  assert.doesNotMatch(html, /<dt[^>]*>Result<\/dt>/);
  assert.doesNotMatch(html, /Checked: evidence was observed/);
  assert.doesNotMatch(html, /ref_four/);
  assert.doesNotMatch(html, /ref_six/);
  assert.doesNotMatch(html, /More trace events/);
  assert.doesNotMatch(html, /Raw trace details/);
  assert.doesNotMatch(html, /more retained refs/);
});

test("RegulatoryChecklistActiveTrace shows first-observed timing for embedded vendor evidence", () => {
  const html = renderToStaticMarkup(
    createElement(RegulatoryChecklistActiveTrace, {
      evidenceRefs: ["Embedded host: youtube.com"],
      jsonPayload: JSON.stringify({
        assessmentStatus: "checked",
        coverageArea: "Embedded 3rd party content loaded before consent",
        evidenceState: "observed",
        retainedEvidence: {
          embeddedContentHosts: ["youtube.com"],
          embeddedContentObservationCount: 1,
          firstEmbeddedContentObservedMs: 928
        },
        status: "Observed",
        statusBasis: "Concrete 3rd party embedded content was retained before consent in iframe/runtime evidence."
      })
    })
  );

  assert.match(html, /Why this result/);
  assert.match(html, /Embedded 3rd party content observed: youtube\.com; first observed 0.928s after scan start/);
  assert.match(html, /Concrete 3rd party embedded content was retained before consent/);
});

test("RegulatoryChecklistActiveTrace shows Article 13 row-specific retained snippets", () => {
  const html = renderToStaticMarkup(
    createElement(RegulatoryChecklistActiveTrace, {
      evidenceRefs: ["Evidence: Retention disclosure"],
      jsonPayload: JSON.stringify({
        assessmentStatus: "checked",
        coverageArea: "Retention disclosure",
        evidenceState: "observed",
        retainedEvidence: {
          article13Signal: {
            disclosureType: "data_retention",
            evidenceText: "We retain personal data only as long as necessary for the purposes described in this notice.",
            source: "deterministic",
            status: "observed"
          },
          policySurfaceSummary: {
            privacyPolicyUrls: ["https://example.test/privacy"]
          }
        },
        status: "Observed",
        statusBasis: "Retention disclosure evidence was retained in public policy-surface evidence."
      })
    })
  );

  assert.match(html, /Matched disclosure snippet/);
  assert.match(html, /retain personal data only as long as necessary/);
  assert.match(html, /https:\/\/example\.test\/privacy/);
});

test("RegulatoryChecklistEvidenceDetails renders compact retained evidence ahead of audit JSON", () => {
  const html = renderToStaticMarkup(
    createElement(RegulatoryChecklistEvidenceDetails, {
      evidenceRefs: [
        "3rd party tracking observed before recorded consent",
        "Signal Pre-consent tracking detected"
      ],
      jsonPayload: JSON.stringify({
        coverageArea: "Pre-consent 3rd party tracking",
        status: "Gap observed",
        retainedEvidence: {
          evidenceHighlights: [
            "\"Cloudflare Web Analytics\", \"preConsent\": true, \"firstSeenMs\": 482",
            "\"Cloudflare Web Analytics\", \"preConsent\": true, \"firstSeenMs\": 482"
          ],
          evidenceRefs: [
            "3rd party tracking observed before recorded consent",
            "Signal Pre-consent tracking detected"
          ]
        }
      })
    })
  );

  assert.match(html, /Cloudflare Web Analytics/);
  assert.equal((html.match(/<p class="font-mono">/g) ?? []).length, 1);
  assert.match(html, /preConsent/);
  assert.match(html, /firstSeenMs/);
  assert.doesNotMatch(html, /Evidence references:/);
  assert.match(html, /Pre-consent 3rd party tracking/);
});

test("RegulatoryChecklistCorrectionSteps gives friendly cookie consent remediation", () => {
  const html = renderToStaticMarkup(
    createElement(RegulatoryChecklistCorrectionSteps, {
      jsonPayload: JSON.stringify({
        assessmentStatus: "gap_observed",
        coverageArea: "Cookies or storage before consent",
        evidenceState: "observed",
        retainedEvidence: {
          smokingGunEvidence: [{
            cookieName: "TapAd_TS",
            cookiePurpose: "advertising",
            timestampMs: 2716
          }]
        },
        status: "Gap observed"
      })
    })
  );

  assert.match(html, /Correction steps/);
  assert.match(html, /max-h-\[50vh\]/);
  assert.match(html, /Inventory TapAd_TS/);
  assert.match(html, /not written until the user has made the appropriate consent choice/);
  assert.match(html, /Rerun the v2 scan/);
});

test("RegulatoryChecklistCorrectionSteps gives reviewer guidance for not-confirmed policy extraction rows", () => {
  const html = renderToStaticMarkup(
    createElement(RegulatoryChecklistCorrectionSteps, {
      jsonPayload: JSON.stringify({
        assessmentStatus: "review_signal",
        coverageArea: "Legal basis disclosure",
        evidenceState: "observed",
        pipeline: {
          concernPolicyKey: "gdpr_eprivacy_coverage.legal_basis_disclosure_observed.not_confirmed"
        },
        retainedEvidence: {
          signalObserved: "not_confirmed_row_specific_extraction"
        },
        status: "Not confirmed"
      })
    })
  );

  assert.match(html, /Review the retained privacy-policy surface for the row-specific disclosure/);
  assert.match(html, /improve scanner extraction or matcher coverage/);
  assert.match(html, /update the privacy notice or internal review record/);
  assert.doesNotMatch(html, /Update the affected consent, policy, tag-manager/);
});

test("RegulatoryChecklistCorrectionSteps gives privacy choices remediation", () => {
  const html = renderToStaticMarkup(
    createElement(RegulatoryChecklistCorrectionSteps, {
      jsonPayload: JSON.stringify({
        assessmentStatus: "gap_observed",
        coverageArea: "Do Not Sell or Share availability",
        evidenceFamily: "sale_share_control",
        evidenceState: "observed",
        retainedEvidence: {},
        status: "potential_gap"
      })
    })
  );

  assert.match(html, /Do Not Sell or Share/);
  assert.match(html, /homepage footer/);
  assert.match(html, /advertising or sharing-related tags/);
});

test("RegulatoryChecklistCorrectionSteps does not provide remediation for checked rows", () => {
  const html = renderToStaticMarkup(
    createElement(RegulatoryChecklistCorrectionSteps, {
      jsonPayload: JSON.stringify({
        assessmentStatus: "checked",
        coverageArea: "Privacy notice availability",
        evidenceState: "observed",
        retainedEvidence: {},
        status: "Observed"
      })
    })
  );

  assert.match(html, /No site remediation is indicated from this row alone/);
  assert.match(html, /Privacy notice availability is currently rated Observed/);
  assert.doesNotMatch(html, /<ol/);
  assert.doesNotMatch(html, /Add or repair/);
});

test("RegulatoryChecklistEvidenceDetails prefers smoking-gun event timing over generic refs", () => {
  const html = renderToStaticMarkup(
    createElement(RegulatoryChecklistEvidenceDetails, {
      evidenceRefs: ["TapAd_TS", "TapAd_DID"],
      jsonPayload: JSON.stringify({
        coverageArea: "Cookies or storage before consent",
        status: "Gap observed",
        retainedEvidence: {
          smokingGunEvidence: [{
            consentState: "pre_consent",
            cookieDomain: ".tapad.com",
            cookieName: "TapAd_TS",
            cookieParty: "third_party",
            cookiePurpose: "advertising",
            eventId: "cookie_316",
            eventType: "cookie",
            kind: "cookie",
            scenario: "fresh_pre_consent",
            sourceModule: "pre_consent_runtime",
            timestampMs: 2716
          }]
        }
      })
    })
  );

  const summaryHtml = html.split("<pre")[0] ?? html;
  assert.match(summaryHtml, /TapAd_TS/);
  assert.match(summaryHtml, /timestampMs/);
  assert.match(summaryHtml, /2.72s/);
  assert.match(summaryHtml, /cookiePurpose/);
  assert.match(summaryHtml, /advertising/);
  assert.match(summaryHtml, /pre_consent/);
  assert.doesNotMatch(summaryHtml, /TapAd_DID/);
});

test("RegulatoryChecklistEvidenceDetails renders compact session replay retained evidence", () => {
  const html = renderToStaticMarkup(
    createElement(RegulatoryChecklistEvidenceDetails, {
      evidenceRefs: ["Session replay signal observed after accept"],
      jsonPayload: JSON.stringify({
        coverageArea: "Session replay / fingerprinting review",
        status: "Review signal",
        retainedEvidence: {
          sessionReplayEvidence: {
            collectionEndpointObserved: true,
            consentStates: ["post_accept"],
            firstSeenMs: 2410,
            vendors: ["Microsoft Clarity"]
          }
        }
      })
    })
  );

  assert.match(html, /Microsoft Clarity/);
  assert.match(html, /consentState/);
  assert.match(html, /post_accept/);
  assert.match(html, /firstSeenMs/);
  assert.match(html, /collectionEndpointObserved/);
  assert.doesNotMatch(html, /Session replay signal observed after accept/);
});

test("RegulatoryChecklistEvidenceDetails prefers row-specific retained evidence over generic scan refs", () => {
  const html = renderToStaticMarkup(
    createElement(RegulatoryChecklistEvidenceDetails, {
      evidenceRefs: [
        "Privacy notice URLs: 1",
        "Advertising/sharing vendors: 1",
        "CPRA opt-out path not observed"
      ],
      jsonPayload: JSON.stringify({
        coverageArea: "Do Not Sell or Share availability",
        evidenceFamily: "sale_share_control",
        status: "Review signal",
        retainedEvidence: {
          advertisingSharingVendors: [],
          doNotSellSharePathObserved: false,
          runtimeVendorRequestUrlCoherence: "mismatch",
          saleShareRequestUrls: [
            "https://tv.apple.com/assets/translation/en-US.json"
          ],
          unmatchedAdvertisingSharingVendorLabels: ["Meta Pixel"]
        }
      })
    })
  );

  assert.match(html, /runtimeVendorRequestUrlCoherence/);
  assert.match(html, /mismatch/);
  assert.match(html, /unmatchedAdvertisingSharingVendorLabels/);
  assert.match(html, /Meta Pixel/);
  assert.doesNotMatch(html, /Privacy notice URLs: 1/);
  assert.doesNotMatch(html, /Advertising\/sharing vendors: 1/);
  assert.doesNotMatch(html, /CPRA opt-out path not observed/);
});

test("RegulatoryChecklistEvidenceDetails renders concise runtime vendor disclosure limitation evidence", () => {
  const html = renderToStaticMarkup(
    createElement(RegulatoryChecklistEvidenceDetails, {
      evidenceRefs: ["Cookie disclosure gap"],
      jsonPayload: JSON.stringify({
        assessmentStatus: "coverage_limitation",
        coverageArea: "Runtime vendor disclosure mismatch",
        evidenceState: "observed",
        missingOrIncompleteSourceSignals: [
          {
            actual: ["audit_only"],
            expected: "surface",
            field: "CertScore.unifiedFinding.presentationDecision.status",
            source: "CertScore",
            whyNeeded: "Required to treat a matched canonical finding as fully surfaced evidence for this checklist row."
          }
        ],
        retainedEvidence: {
          findingEntities: [
            {
              entities: {
                unmatched_cookie_names: ["_cs_c", "_cs_id", "_cs_s"]
              },
              id: "cookie_disclosure_gap"
            }
          ],
          selectedEvidenceStrength: "limited"
        },
        status: "Insufficient evidence",
        statusBasis: "Runtime vendor disclosure evidence was retained, but no usable direct vendor comparison row was retained."
      })
    })
  );

  const summaryHtml = html.split("<pre")[0] ?? html;
  assert.equal((html.match(/<p class="font-mono">/g) ?? []).length, 4);
  assert.match(summaryHtml, /&quot;basis&quot;/);
  assert.match(summaryHtml, /direct vendor comparison row/);
  assert.match(summaryHtml, /&quot;selectedEvidenceStrength&quot;: &quot;limited&quot;/);
  assert.match(summaryHtml, /_cs_c/);
  assert.match(summaryHtml, /CertScore\.unifiedFinding\.presentationDecision\.status/);
  assert.doesNotMatch(summaryHtml, /Required to treat a matched canonical finding/);
});
