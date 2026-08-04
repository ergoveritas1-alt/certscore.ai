import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyPolicyDocumentOwnership,
  policyDocumentMatchesExpectedSurface
} from "./scanners/policy-surface-scanner.js";

test("attributes same-site policies to the scanned target", () => {
  const result = classifyPolicyDocumentOwnership({
    documentTitle: "Example Privacy Policy",
    documentUrl: "https://privacy.example.org/policy",
    targetUrl: "https://www.example.org/",
    text: "Example is the controller of your personal data."
  });
  assert.equal(result.targetRelationship, "target_controller");
  assert.equal(result.ownershipConfidence, 0.98);
});

test("does not treat a cross-site provider policy as the target policy", () => {
  const result = classifyPolicyDocumentOwnership({
    documentTitle: "Cloudflare Privacy Policy",
    documentUrl: "https://www.cloudflare.com/privacypolicy/",
    targetUrl: "https://www.lufthansa.com/",
    text: "Cloudflare is the data controller responsible for this privacy policy."
  });
  assert.equal(result.targetRelationship, "service_provider");
  assert.ok((result.ownershipConfidence ?? 0) >= 0.9);
  assert.equal(result.documentOwnerEntity, "Cloudflare");
});

test("retains a cross-site first-party notice only when the target brand is named in controller context", () => {
  const result = classifyPolicyDocumentOwnership({
    documentTitle: "Group Privacy Notice",
    documentUrl: "https://group-notices.example/privacy",
    targetUrl: "https://www.lufthansa.com/",
    text: "Lufthansa is the data controller responsible for processing described in this notice."
  });
  assert.equal(result.targetRelationship, "first_party_brand");
  assert.ok((result.ownershipConfidence ?? 0) >= 0.75);
});

test("attributes a corporate policy when the target is an enumerated subsidiary in the policy scope", () => {
  const result = classifyPolicyDocumentOwnership({
    documentTitle: "Privacy Policy - PAR Technology",
    documentUrl: "https://partech.com/privacy-policy/",
    targetUrl: "https://punchh.com/",
    text: [
      "ParTech, Inc. and its subsidiaries PAR Payment Services, LLC, AccSys, LLC, and Punchh, Inc. are collectively referred to as PAR, us, we, or our.",
      "The websites and mobile applications covered by this notice are operated by us."
    ].join(" ")
  });

  assert.equal(result.targetRelationship, "first_party_brand");
  assert.equal(result.ownershipConfidence, 0.86);
  assert.deepEqual(result.ownershipReasonCodes, [
    "cross_site_document",
    "target_brand_named_in_corporate_family",
    "corporate_policy_scope_applies_to_operated_sites"
  ]);
});

test("does not attribute a cross-site policy from a bare target-brand mention", () => {
  const result = classifyPolicyDocumentOwnership({
    documentTitle: "Example Vendor Privacy Policy",
    documentUrl: "https://vendor.example/privacy/",
    targetUrl: "https://punchh.com/",
    text: "Our customers include Punchh. This policy describes Example Vendor services."
  });

  assert.notEqual(result.targetRelationship, "first_party_brand");
});

test("attributes a corporate privacy center explicitly routed to the target brand", () => {
  const result = classifyPolicyDocumentOwnership({
    documentTitle: "Privacy Policy | NBCUniversal Media",
    documentUrl: "https://www.nbcuniversalprivacy.com/privacy?intake=NBC_News",
    targetUrl: "https://www.nbcnews.com/",
    text: [
      "This Privacy Policy applies to NBCUniversal Services throughout the world.",
      "The data controller of your personal information will be the NBCUniversal company which provides services to you."
    ].join(" ")
  });

  assert.equal(result.targetRelationship, "first_party_brand");
  assert.equal(result.ownershipConfidence, 0.86);
  assert.deepEqual(result.ownershipReasonCodes, [
    "cross_site_document",
    "target_brand_exact_policy_route_binding",
    "corporate_policy_controller_language"
  ]);
});

test("does not treat an arbitrary customer query parameter as policy ownership", () => {
  const result = classifyPolicyDocumentOwnership({
    documentTitle: "Example Vendor Privacy Policy",
    documentUrl: "https://vendor.example/privacy?customer=punchh",
    targetUrl: "https://punchh.com/",
    text: "Example Vendor is the data controller responsible for this privacy policy."
  });

  assert.notEqual(result.targetRelationship, "first_party_brand");
});

test("rejects marketing/navigation copy misrouted as a privacy policy", () => {
  assert.equal(policyDocumentMatchesExpectedSurface({
    surfaceType: "privacy_policy",
    title: "Volkswagen Home",
    text: "Explore our latest vehicles. Build your model. Find a retailer. Offers and finance. Contact us. Privacy."
  }), false);
});

test("accepts substantive privacy-policy content", () => {
  assert.equal(policyDocumentMatchesExpectedSurface({
    surfaceType: "privacy_policy",
    title: "Privacy Notice",
    text: "We collect and process personal data to provide our services. You have the right to access and delete your personal information."
  }), true);
});

test("keeps bounded multilingual policy text reviewable without an English-only gate", () => {
  assert.equal(policyDocumentMatchesExpectedSurface({
    surfaceType: "privacy_policy",
    title: "Privacybeleid",
    text: "Wij leggen uit welke persoonsgegevens wij verwerken, waarom wij dit doen en hoe lang wij deze bewaren."
  }), true);
});
