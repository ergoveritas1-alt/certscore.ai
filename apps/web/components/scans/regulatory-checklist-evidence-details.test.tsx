import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RegulatoryChecklistEvidenceDetails } from "./regulatory-checklist-evidence-details";

test("RegulatoryChecklistEvidenceDetails renders compact retained evidence ahead of audit JSON", () => {
  const html = renderToStaticMarkup(
    createElement(RegulatoryChecklistEvidenceDetails, {
      evidenceRefs: [
        "Third-party tracking observed before recorded consent",
        "Signal Pre-consent tracking detected"
      ],
      jsonPayload: JSON.stringify({
        coverageArea: "Pre-consent third-party tracking",
        status: "Gap observed",
        retainedEvidence: {
          evidenceHighlights: [
            "\"Cloudflare Web Analytics\", \"preConsent\": true, \"firstSeenMs\": 482",
            "\"Cloudflare Web Analytics\", \"preConsent\": true, \"firstSeenMs\": 482"
          ],
          evidenceRefs: [
            "Third-party tracking observed before recorded consent",
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
  assert.match(html, /Pre-consent third-party tracking/);
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
