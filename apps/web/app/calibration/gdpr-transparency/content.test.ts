import assert from "node:assert/strict";
import test from "node:test";
import { classifyGdprTransparencyTopics, type GdprTransparencyTopic } from "@certscore/contracts";
import { GDPR_TRANSPARENCY_CANARY_COPY, GDPR_TRANSPARENCY_CANARY_LOCALES } from "./content";

const EXPECTED_TOPICS = new Set<GdprTransparencyTopic>([
  "controller_contact",
  "dpo_contact",
  "processing_purposes",
  "legal_basis",
  "recipients_or_vendor_categories",
  "data_retention",
  "data_subject_rights",
  "international_transfers",
  "supervisory_authority",
  "automated_decision_making_or_profiling",
]);

test("owned GDPR Transparency canaries retain all canonical topics in their declared locale", () => {
  for (const locale of GDPR_TRANSPARENCY_CANARY_LOCALES) {
    const result = classifyGdprTransparencyTopics({ text: GDPR_TRANSPARENCY_CANARY_COPY[locale].paragraphs.join(" ") });
    assert.deepEqual(new Set(result.matches.map((match) => match.topic)), EXPECTED_TOPICS, locale);
    assert.equal(result.matches.every((match) => match.matchedLocale === locale), true, locale);
  }
});
