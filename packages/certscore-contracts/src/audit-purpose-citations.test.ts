import assert from "node:assert/strict";
import test from "node:test";
import { article13DisclosureRejectReason, hasSubstantiveProcessingPurposesEvidence } from "./article13-disclosure-rejection";
const roleOnly = "Our customer decides how that data is used, and our Data Processing Addendum governs how we handle it. If you subscribed to a company's status page, or you're on a customer's team, that company's privacy policy applies, and you should contact them first to exercise your rights.";
test("retained Instatus role and rights wording does not establish a processing purpose", () => {
  for (const text of [roleOnly, roleOnly.replace("that data", "your personal data"), roleOnly.replace("that data", "the data")]) {
    assert.equal(hasSubstantiveProcessingPurposesEvidence(text), false);
    for (const mode of ["scan_core", "retained_report", "multilingual_classifier"] as const)
      assert.notEqual(article13DisclosureRejectReason(text, "processing_purposes", { mode }), null, mode);
  }
  for (const text of ["We use your personal data to handle your payment and orders.", "We use your name to personalize requested services.", "Technical data is processed to ensure the security of this website."]) {
    assert.equal(hasSubstantiveProcessingPurposesEvidence(text), true, text);
  }
  for (const mode of ["scan_core", "retained_report", "multilingual_classifier"] as const) {
    assert.notEqual(article13DisclosureRejectReason(roleOnly, "processing_purposes", { mode }), null, mode);
  }
});
