import assert from "node:assert/strict";
import test from "node:test";
import {
  assessPolicyDocumentSubstance,
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

test("attributes TensorFlow's canonical Google-hosted privacy policy as a first-party brand document", () => {
  const result = classifyPolicyDocumentOwnership({
    documentTitle: "Privacy Policy – Privacy & Terms – Google",
    documentUrl: "https://policies.google.com/privacy",
    targetUrl: "https://www.tensorflow.org/",
    text: "Google explains the information it collects and why it collects it.",
  });

  assert.equal(result.targetRelationship, "first_party_brand");
  assert.equal(result.documentOwnerEntity, "Google");
  assert.equal(result.ownershipConfidence, 0.98);
  assert.deepEqual(result.ownershipReasonCodes, [
    "canonical_first_party_brand_relationship",
    "canonical_relationship_tensorflow_google",
  ]);
});

test("does not generalize the TensorFlow relationship to unrelated Google policy links", () => {
  const result = classifyPolicyDocumentOwnership({
    documentTitle: "Privacy Policy – Privacy & Terms – Google",
    documentUrl: "https://policies.google.com/privacy",
    targetUrl: "https://statefarm.com/",
    text: "Google explains the information it collects and why it collects it.",
  });

  assert.equal(result.targetRelationship, "service_provider");
});

test("attributes FortiGuard's canonical Fortinet-hosted notice as a first-party brand document", () => {
  const result = classifyPolicyDocumentOwnership({
    documentTitle: "Fortinet Privacy Policy",
    documentUrl: "https://www.fortinet.com/corporate/about-us/privacy",
    targetUrl: "https://www.fortiguard.com/",
    text: "Fortinet explains how it processes personal data and protects privacy.",
  });

  assert.equal(result.targetRelationship, "first_party_brand");
  assert.equal(result.documentOwnerEntity, "Fortinet");
  assert.equal(result.ownershipConfidence, 0.98);
  assert.deepEqual(result.ownershipReasonCodes, [
    "canonical_first_party_brand_relationship",
    "canonical_relationship_fortiguard_fortinet",
  ]);
});

test("does not generalize the FortiGuard relationship to unrelated Fortinet policy links", () => {
  const result = classifyPolicyDocumentOwnership({
    documentTitle: "Fortinet Privacy Policy",
    documentUrl: "https://www.fortinet.com/corporate/about-us/privacy",
    targetUrl: "https://statefarm.com/",
    text: "Fortinet explains how it processes personal data and protects privacy.",
  });

  assert.notEqual(result.targetRelationship, "first_party_brand");
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

test("attributes a parent-company policy when the target brand and operated services are explicitly in scope", () => {
  const result = classifyPolicyDocumentOwnership({
    documentTitle: "Warner Bros. Discovery Privacy Policy",
    documentUrl: "https://www.wbdprivacy.com/policycenter/b2c/en-emea/",
    targetUrl: "https://cnn.com/",
    text: [
      "Warner Bros. Discovery is a global media and entertainment family of companies.",
      "We offer products and services including HBO Max, CNN, WB Games, and Bleacher Report.",
      "When you use our websites or apps, or otherwise interact with our businesses, we may collect information about you.",
    ].join(" "),
  });

  assert.equal(result.targetRelationship, "first_party_brand");
  assert.equal(result.ownershipConfidence, 0.86);
  assert.deepEqual(result.ownershipReasonCodes, [
    "cross_site_document",
    "target_brand_named_in_corporate_family",
    "corporate_policy_scope_applies_to_operated_sites",
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

test("attributes exact hosted privacy-center brand routes only when directly linked by the target", () => {
  const result = classifyPolicyDocumentOwnership({
    directlyLinkedFromScannedPage: true,
    documentTitle: "Privacy Center",
    documentUrl: "https://bn.clarip.com/privacycenter/?brand=barnesandnoble",
    targetUrl: "https://www.barnesandnoble.com/",
    text: "This privacy center describes collection, use, disclosure, retention, and privacy rights for customers.",
  });
  assert.equal(result.targetRelationship, "first_party_brand");
  assert.deepEqual(result.ownershipReasonCodes, [
    "cross_site_document",
    "target_brand_exact_policy_route_binding",
    "direct_target_link_to_brand_bound_policy_route",
  ]);

  const unlinked = classifyPolicyDocumentOwnership({
    directlyLinkedFromScannedPage: false,
    documentTitle: "Privacy Center",
    documentUrl: "https://bn.clarip.com/privacycenter/?brand=barnesandnoble",
    targetUrl: "https://www.barnesandnoble.com/",
    text: "This privacy center describes collection and use.",
  });
  assert.notEqual(unlinked.targetRelationship, "first_party_brand");
});

test("attributes directly linked cross-domain policies when the target brand is bound in title and body", () => {
  const result = classifyPolicyDocumentOwnership({
    directlyLinkedFromScannedPage: true,
    documentTitle: "Honey Privacy Policy",
    documentUrl: "https://www.joinhoney.com/privacy/eu",
    targetUrl: "https://honey.io/",
    text: "Honey explains in this privacy policy how it processes personal data and how members exercise their rights.",
  });
  assert.equal(result.targetRelationship, "first_party_brand");
  assert.deepEqual(result.ownershipReasonCodes, [
    "cross_site_document",
    "direct_target_link",
    "target_brand_named_in_policy_title_and_body",
  ]);
});

test("applies time-bound canonical ownership for the MSNBC to MS NOW transition", () => {
  const afterTransition = classifyPolicyDocumentOwnership({
    documentTitle: "Privacy Policy | VERSANT MEDIA",
    documentUrl: "https://www.versantprivacy.com/privacy?intake=MSNOW",
    observedAt: "2026-08-31T00:00:00.000Z",
    targetUrl: "https://www.msnbc.com/",
    text: "This privacy policy explains how Versant Media processes personal information.",
  });
  assert.equal(afterTransition.targetRelationship, "first_party_brand");
  assert.equal(afterTransition.ownershipReasonCodes?.includes(
    "canonical_relationship_msnbc_ms_now_versant",
  ), true);

  const beforeTransition = classifyPolicyDocumentOwnership({
    documentTitle: "Privacy Policy | VERSANT MEDIA",
    documentUrl: "https://www.versantprivacy.com/privacy?intake=MSNOW",
    observedAt: "2025-11-14T23:59:59.999Z",
    targetUrl: "https://www.msnbc.com/",
    text: "This privacy policy explains how Versant Media processes personal information.",
  });
  assert.notEqual(beforeTransition.targetRelationship, "first_party_brand");
});

test("attributes retained India Today Group and WP Guardian cross-domain policies", () => {
  const cases = [
    {
      targetUrl: "https://aajtak.in/",
      documentUrl: "https://www.indiatodaygroup.com/privacy-policy.html",
      reasonCode: "canonical_relationship_aajtak_india_today_group",
    },
    {
      targetUrl: "https://indiatoday.in/",
      documentUrl: "https://www.indiatodaygroup.com/privacy-policy.html",
      reasonCode: "canonical_relationship_india_today_group",
    },
    {
      targetUrl: "https://wpguardian.com/",
      documentUrl: "https://app.wpguardian.io/legal/privacy-policy",
      reasonCode: "canonical_relationship_wpguardian_cross_tld",
    },
  ];
  for (const entry of cases) {
    const result = classifyPolicyDocumentOwnership({
      documentTitle: "Privacy Policy",
      documentUrl: entry.documentUrl,
      observedAt: "2026-08-31T00:00:00.000Z",
      targetUrl: entry.targetUrl,
      text: "This privacy policy describes how the controller processes personal data.",
    });
    assert.equal(result.targetRelationship, "first_party_brand", entry.targetUrl);
    assert.equal(result.ownershipReasonCodes?.includes(entry.reasonCode), true, entry.targetUrl);
  }
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

test("rejects localized soft-404 policy documents before ownership and topic extraction", () => {
  for (const input of [
    {
      finalUrl: "https://example.test/PageNotFoundError.aspx?requestUrl=/privacy",
      title: "Página no encontrada 404",
      text: "La página solicitada no existe. Volver al inicio.",
    },
    {
      finalUrl: "https://example.test/privacy",
      title: "Page non trouvée",
      text: "404 - Page non trouvée. Retour à l'accueil.",
    },
    {
      finalUrl: "https://example.test/privacy",
      title: "ページが見つかりません",
      text: "お探しのページが見つかりません。",
    },
  ]) {
    const assessment = assessPolicyDocumentSubstance({
      surfaceType: "privacy_policy",
      ...input,
    });
    assert.equal(assessment.matchesExpectedSurface, false, input.title);
    assert.equal(assessment.reasonCode, "soft_404", input.title);
  }
});
