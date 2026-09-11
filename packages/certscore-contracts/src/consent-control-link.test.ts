import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyConsentControlLabel,
  classifyConsentControlLinkDestination,
  consentControlLinkDestinationSchema,
  consentUiObservationSchema,
} from "./index.js";

test("classifies same-document fragments while preserving query identity", () => {
  const documentUrl = "https://example.test/page?locale=en";
  assert.equal(
    classifyConsentControlLinkDestination("#preferences", documentUrl),
    "same_document",
  );
  assert.equal(
    classifyConsentControlLinkDestination("#", documentUrl),
    "same_document",
  );
  assert.equal(
    classifyConsentControlLinkDestination("#", `${documentUrl}#current`),
    "same_document",
  );
  assert.equal(
    classifyConsentControlLinkDestination("/page?locale=en#preferences", documentUrl),
    "same_document",
  );
  assert.equal(
    classifyConsentControlLinkDestination("/page?locale=fr#preferences", documentUrl),
    "other_document",
  );
  assert.equal(
    classifyConsentControlLinkDestination("/privacy-center", documentUrl),
    "other_document",
  );
  assert.equal(
    classifyConsentControlLinkDestination(documentUrl, documentUrl),
    "other_document",
  );
});

test("rejects unsafe or missing link metadata as unverified", () => {
  for (const href of [undefined, "", "javascript:void(0)", "mailto:privacy@example.test", "http://["]) {
    assert.equal(classifyConsentControlLinkDestination(href, "https://example.test/"), "unverified", href);
  }
  assert.equal(
    classifyConsentControlLinkDestination("#preferences", "chrome-error://chromewebdata/"),
    "unverified",
  );
  assert.equal(consentControlLinkDestinationSchema.parse("same_document"), "same_document");
  assert.equal(
    consentUiObservationSchema.parse({
      observationId: "obs-1",
      observedAtMs: 1,
      likelyPresent: true,
      confidence: 0.5,
      basis: [],
      controls: [{
        label: "Privacy Center",
        actionType: "manage_preferences",
        confidence: 0.5,
        linkDestination: "other_document",
      }],
    }).controls[0]?.linkDestination,
    "other_document",
  );
});

test("downgrades explicitly navigational or unverified Options links", () => {
  const contextText = "This site uses cookies and lets you manage your privacy preferences.";
  assert.equal(
    classifyConsentControlLabel({ label: "Cookie settings", contextText }).intent,
    "options",
  );
  assert.equal(
    classifyConsentControlLabel({ label: "Cookie settings", contextText, linkDestination: "same_document" }).intent,
    "options",
  );
  const external = classifyConsentControlLabel({
    label: "Cookie settings",
    contextText,
    linkDestination: "other_document",
  });
  assert.equal(external.intent, "unknown");
  assert.deepEqual(external.reasonCodes, ["unverified_preferences_navigation"]);
  assert.equal(external.linkDestination, "other_document");
  assert.equal(
    classifyConsentControlLabel({ label: "Cookie settings", contextText, linkDestination: "unverified" }).intent,
    "unknown",
  );
});
