import assert from "node:assert/strict";
import test from "node:test";
import { buildRegulatoryChecklistEvidenceHighlights } from "./regulatory-checklist-evidence-highlights";

test("pre-consent storage highlights include fallback request timing when cookie write timing is absent", () => {
  const highlights = buildRegulatoryChecklistEvidenceHighlights({
    evidenceDetails: {
      cookieEvidence: {
        cookieWriteEvidence: [
          {
            category: "analytics",
            cookieName: "_ga",
            domain: ".caltech.edu",
            preConsent: true,
            vendor: "Google Analytics"
          }
        ]
      },
      timing: {
        firstNonEssentialRequestMs: 1164
      }
    } as never,
    id: "analytics_cookie_pre_consent",
    label: "Analytics cookies before consent"
  });

  assert.equal(
    highlights[0],
    "Storage observed before consent: Google Analytics on .caltech.edu. First non-essential request at ~1164ms."
  );
  assert.equal(
    highlights[1],
    "\"Google Analytics\", \"preConsent\": true, \"category\": \"analytics\", \"domain\": \".caltech.edu\""
  );
});

