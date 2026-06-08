import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CERT_SCORE_FINDING_REGISTRY, type CertScoreFinding } from "../../lib/scans/finding-registry";
import { FindingCard } from "./finding-card";

function makeFinding(id: string, overrides: Partial<CertScoreFinding> = {}): CertScoreFinding {
  const definition = CERT_SCORE_FINDING_REGISTRY[id];
  assert.ok(definition, `Missing finding definition for ${id}`);

  return {
    ...definition,
    confidence: "good",
    directVsInferred: "mixed",
    evidencePreview: ["Observed public-web evidence retained for review."],
    evidenceRefs: [],
    severity: "medium",
    shortSummary: definition.whyItMatters,
    ...overrides
  };
}

test("FindingCard renders display-only privacy applicability chips from projected finding metadata", () => {
  const html = renderToStaticMarkup(
    createElement(FindingCard, {
      finding: makeFinding("cpra_cba_opt_out_missing", {
        evidenceDetails: {
          legalRelevance: {
            cipaPenRegisterTheorySupport: "not_evaluated",
            cpraSharingSupport: "possible",
            ftcDarkPatternOrDeceptionSupport: "not_evaluated",
            gdprEprivacyConsentSupport: "possible"
          }
        }
      })
    })
  );

  assert.match(html, /aria-label="Applicability unverified"/);
  assert.match(html, /aria-label="Jurisdiction unverified"/);
  assert.match(html, /CCPA\/CPRA can depend on revenue, California volume, or selling\/sharing activity/);
  assert.match(html, /GDPR\/ePrivacy can depend on EU\/EEA presence, targeting, or monitoring/);
});
