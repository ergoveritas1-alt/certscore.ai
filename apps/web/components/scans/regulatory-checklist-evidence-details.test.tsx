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
