import assert from "node:assert/strict";
import test from "node:test";
import { consentActionControlProofSchema, CONSENT_ACTION_CONTROL_PROOF_VERSION,
  isRegisteredContextualAcceptLabel } from "./consent-action-control-proof.js";
import { classifyConsentControlLabel } from "./consent-control-label-classifier.js";

const contextualProof = {
  contractVersion: CONSENT_ACTION_CONTROL_PROOF_VERSION, action: "accept", observedAtMs: 100,
  accessibleLabel: "VERSTANDEN", labelSource: "visible_text", actionSemantics: "registered_contextual_accept",
  classifierIntent: "accept", classifierConfidence: classifyConsentControlLabel({ label: "VERSTANDEN", hasConsentContext: true }).confidence,
  matchStrength: "contextual", cmpId: "BST DSGVO Cookie notice plugin, non-TCF", recipeId: "canonical-cmp:bst:accept:v2",
  selectorHint: ".bst-panel .bst-accept", frameIdentitySha256: "a".repeat(64), authorizedTargetSha256: "b".repeat(64),
  visible: true, enabled: true, uniquelyActionable: true,
  contextualApproval: { policyVersion: "registered_contextual_accept.v1", bannerSelector: ".bst-panel", expectedNormalizedLabel: "verstanden" },
};

test("v2 contextual action proof retains named scope without raising label confidence", () => {
  assert.equal(consentActionControlProofSchema.safeParse(contextualProof).success, true);
  assert.equal(contextualProof.classifierConfidence, 0.78);
  assert.equal(isRegisteredContextualAcceptLabel("VERSTANDEN", "verstanden"), true);
  for (const label of ["OK", "Close", "Reject all", "Save", "Continue", "Accept all"]) {
    assert.equal(isRegisteredContextualAcceptLabel(label, label.toLowerCase()), false, label);
  }
});

test("contextual proof cannot use legacy version, lose provenance or relax ordinary action proof", () => {
  for (const change of [
    { contractVersion: "certscore.consent_action_control_proof.v1" }, { action: "reject" },
    { contextualApproval: undefined }, { cmpId: undefined }, { frameIdentitySha256: undefined },
    { authorizedTargetSha256: undefined }, { classifierConfidence: 1 }, { accessibleLabel: "OK" },
    { actionSemantics: "direct_label", contextualApproval: undefined },
  ]) assert.equal(consentActionControlProofSchema.safeParse({ ...contextualProof, ...change }).success, false, JSON.stringify(change));
  const legacy = { ...contextualProof, contractVersion: "certscore.consent_action_control_proof.v1",
    actionSemantics: "direct_label", accessibleLabel: "Accept all", classifierConfidence: 1, matchStrength: "direct", contextualApproval: undefined };
  assert.equal(consentActionControlProofSchema.safeParse(legacy).success, true);
});
