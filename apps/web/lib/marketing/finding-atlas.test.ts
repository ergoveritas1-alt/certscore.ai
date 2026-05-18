import assert from "node:assert/strict";
import test from "node:test";

import { getFindingReferenceItems } from "./finding-atlas";

test("homepage finding examples align with each finding subtype", () => {
  const findings = new Map(getFindingReferenceItems().map((finding) => [finding.id, finding]));

  assert.match(findings.get("visual_contrast_accessibility_issue")?.exampleEvidence[0]?.code ?? "", /rule=color-contrast/);
  assert.match(findings.get("semantic_labeling_accessibility_issue")?.exampleEvidence[0]?.code ?? "", /rule=label/);
  assert.match(findings.get("text_alternative_accessibility_issue")?.exampleEvidence[0]?.code ?? "", /rule=image-alt/);
  assert.match(findings.get("keyboard_navigation_accessibility_issue")?.exampleEvidence[0]?.code ?? "", /rule=keyboard/);
  assert.match(findings.get("cross_domain_identifier_sharing_observed")?.exampleEvidence[0]?.code ?? "", /identifier_like_value_present=true/);
  assert.match(findings.get("sensitive_data_collection_with_third_party_tracking_present")?.exampleEvidence[0]?.code ?? "", /field_contexts:/);
  assert.match(findings.get("forced_consent_interaction")?.exampleEvidence[0]?.code ?? "", /banner_blocks_content=true/);
  assert.match(findings.get("asymmetric_consent_ui")?.exampleEvidence[0]?.code ?? "", /interaction_cost_imbalanced=true/);
});

test("homepage finding samples use the active finding id and label", () => {
  for (const finding of getFindingReferenceItems()) {
    const payload = finding.sample.payload;
    const payloadFindingId = payload.finding_id ?? payload.findingId ?? payload.id;
    const payloadLabel = payload.finding_label ?? payload.label ?? payload.title;

    assert.equal(finding.sample.findingId, finding.id, `${finding.id} sample id should match finding id`);
    assert.equal(payloadFindingId, finding.id, `${finding.id} payload id should match finding id`);
    assert.equal(finding.sample.label, finding.title, `${finding.id} sample label should match finding title`);
    assert.equal(payloadLabel, finding.title, `${finding.id} payload label should match finding title`);
  }
});
