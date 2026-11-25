import assert from "node:assert/strict";
import test from "node:test";
import { consentActionControlProofSchema, CONSENT_ACTION_CONTROL_PROOF_VERSION,
  DRUPAL_NO_THANKS_REJECT_CONTROL, isRegisteredContextualAcceptLabel, ONETRUST_ITALIAN_ACCEPT_CONTROL } from "./consent-action-control-proof.js";
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

test("custom Accept proof requires complete typed binding and preserves historical proof", () => {
  const proof = { ...contextualProof, contextualApproval: undefined, cmpId: undefined,
    actionSemantics: "direct_label", accessibleLabel: "Accept all", classifierConfidence: 1, matchStrength: "direct",
    recipeId: "canonical-control:accept:custom-v1:fixture",
    customControlBinding: { policyVersion: "custom_accept_control.v1", kind: "direct_onclick",
      tagName: "span", bannerSelector: "#consent", handlerSha256: "c".repeat(64), nonTransactional: true },
  };
  assert.equal(consentActionControlProofSchema.safeParse(proof).success, true);
  for (const change of [
    { customControlBinding: undefined }, { action: "reject" }, { cmpId: "Known CMP" },
    { authorizedTargetSha256: undefined }, { frameIdentitySha256: undefined },
    { recipeId: "unregistered" }, { contractVersion: "certscore.consent_action_control_proof.v1" },
    { customControlBinding: { ...proof.customControlBinding, handlerSha256: "invalid" } },
    { customControlBinding: { ...proof.customControlBinding, tagName: "input" } },
  ]) assert.equal(consentActionControlProofSchema.safeParse({ ...proof, ...change }).success, false, JSON.stringify(change));
  const legacy = { ...proof, customControlBinding: undefined, recipeId: "canonical-control:accept:v1:fixture",
    contractVersion: "certscore.consent_action_control_proof.v1" };
  assert.equal(consentActionControlProofSchema.safeParse(legacy).success, true);
});

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

test("Italian OneTrust Accept proof binds the registered control and authorized main document", () => {
  const scope = ONETRUST_ITALIAN_ACCEPT_CONTROL;
  const label = { label: scope.label, hasConsentContext: true, classifierProfile: "multilingual_v1" } as const;
  const observed = classifyConsentControlLabel(label);
  assert.equal(observed.intent, "accept");
  assert.equal(classifyConsentControlLabel({ ...label, usage: "action" }).intent, "unknown");

  const proof = { ...contextualProof, contextualApproval: undefined, accessibleLabel: scope.label,
    actionSemantics: "direct_label", classifierConfidence: observed.confidence, matchedLocale: "it", matchStrength: "direct",
    recipeId: scope.recipeId, cmpId: scope.cmpId, selectorHint: scope.controlSelector,
    frameIdentitySha256: contextualProof.authorizedTargetSha256, classifierReasonCodes: [scope.proofReason] };
  assert.equal(consentActionControlProofSchema.safeParse(proof).success, true);
  for (const change of [
    { classifierReasonCodes: [] }, { accessibleLabel: "Accept all" }, { cmpId: undefined },
    { recipeId: "canonical-control:accept:fixture" }, { selectorHint: "#different-button" },
    { frameIdentitySha256: "a".repeat(64) }, { authorizedTargetSha256: undefined }, { labelSource: "title" },
  ]) assert.equal(consentActionControlProofSchema.safeParse({ ...proof, ...change }).success, false, JSON.stringify(change));
});

test("Drupal weak refusal proof can certify only the registered decline button", () => {
  const scope = DRUPAL_NO_THANKS_REJECT_CONTROL;
  const classification = classifyConsentControlLabel({label:scope.label, usage:"action", classifierProfile:"multilingual_v1", hasConsentContext:true});
  assert.equal(classification.matchStrength,"weak");
  assert.ok(classification.confidence < 0.8);
  const proof = {...contextualProof, contextualApproval:undefined, action:"reject", actionSemantics:"direct_label",
    accessibleLabel:scope.label, classifierIntent:"reject", classifierConfidence:classification.confidence, matchStrength:"weak", matchedLocale:"en",
    cmpId:scope.cmpId, recipeId:scope.recipeId, selectorHint:scope.controlSelector,
    frameIdentitySha256:contextualProof.authorizedTargetSha256, classifierReasonCodes:[scope.proofReason]};
  assert.equal(consentActionControlProofSchema.safeParse(proof).success,true);
  for (const change of [
    {classifierReasonCodes:[]}, {accessibleLabel:"No thanks"}, {labelSource:"aria_label"}, {action:"accept"},
    {selectorHint:"#generic-decline"}, {cmpId:"Generic"}, {recipeId:"unregistered"}, {classifierConfidence:0.9},
    {authorizedTargetSha256:undefined}, {frameIdentitySha256:"a".repeat(64)},
  ]) assert.equal(consentActionControlProofSchema.safeParse({...proof,...change}).success,false,JSON.stringify(change));
});
