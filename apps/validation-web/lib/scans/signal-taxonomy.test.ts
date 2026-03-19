import assert from "node:assert/strict";
import test from "node:test";
import {
  getPrimaryCategoryLabel,
  getSnapshotFieldTaxonomy,
  groupSnapshotFieldsByPrimaryCategory,
  mapSignalKeyToTaxonomy
} from "./signal-taxonomy";

test("maps consent dark-pattern fields into privacy, consent, and user choice", () => {
  const entry = getSnapshotFieldTaxonomy("dark_pattern_reject_button_missing");

  assert.equal(entry?.primaryCategory, "privacy_consent_user_choice");
  assert.equal(entry?.subcategory, "Consent Manipulation Signals");
});

test("maps sensitive collection fields into sensitive data and identity signals", () => {
  const entry = getSnapshotFieldTaxonomy("form_collects_health_information");

  assert.equal(entry?.primaryCategory, "sensitive_data_identity_signals");
  assert.equal(entry?.subcategory, "Health Inputs");
});

test("maps AI compatibility signals into the AI taxonomy", () => {
  const entry = mapSignalKeyToTaxonomy({
    category: "commerce",
    key: "commerce.ai_help_center_ai_reference",
    label: "AI help-center reference detected"
  });

  assert.equal(entry.primaryCategory, "ai_automation_emerging_practices");
  assert.equal(entry.subcategory, "AI Documentation & Disclosures");
});

test("maps ad and replay compatibility signals into the data ecosystem taxonomy", () => {
  const replayEntry = mapSignalKeyToTaxonomy({
    category: "commerce",
    key: "commerce.session_replay_tool_detected",
    label: "Session replay tool detected"
  });
  const adsEntry = mapSignalKeyToTaxonomy({
    category: "commerce",
    key: "commerce.ad_network_google_ads",
    label: "Google Ads detected"
  });

  assert.equal(replayEntry.primaryCategory, "data_collection_third_party_ecosystem");
  assert.equal(replayEntry.subcategory, "Session Replay / Behavioral Tools");
  assert.equal(adsEntry.primaryCategory, "data_collection_third_party_ecosystem");
  assert.equal(adsEntry.subcategory, "Advertising & Retargeting");
});

test("groups snapshot fields into the new primary category order", () => {
  const groups = groupSnapshotFieldsByPrimaryCategory([
    "ai_chatbot_present",
    "dark_pattern_reject_button_missing",
    "form_collects_ssn",
    "security_txt_present"
  ]);

  assert.deepEqual(groups.map((group) => getPrimaryCategoryLabel(group.categoryId)), [
    "Privacy, Consent & User Choice",
    "Sensitive Data & Identity Signals",
    "Security, Trust & Governance",
    "AI, Automation & Emerging Practices"
  ]);
});

test("falls back from legacy disclosure signals into consumer transparency", () => {
  const entry = mapSignalKeyToTaxonomy({
    category: "disclosure",
    key: "disclosure.refund_policy_present",
    label: "Refund policy detected"
  });

  assert.equal(entry.primaryCategory, "consumer_transparency_disclosures");
});
