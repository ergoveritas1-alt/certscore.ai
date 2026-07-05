import assert from "node:assert/strict";
import test from "node:test";

import type { PolicySurfaceObservation } from "@certscore/contracts";

import {
  GDPR_TRANSPARENCY_MULTILINGUAL_ARTICLE13_PROFILE,
  getGdprTransparencyProductionEvidenceProfileFromEnv,
  normalizeGdprTransparencyProductionEvidenceProfile,
} from "./gdpr-transparency-production-profile";
import {
  adaptGdprTransparencyTopicCandidatesForProduction,
} from "./gdpr-transparency-topic-evidence-adapter";

type Candidate = PolicySurfaceObservation["gdprTransparencyTopicCandidates"][number];
type Topic = Candidate["topic"];
type Locale = Candidate["matchedLocale"];

function candidate(input: Partial<Candidate> & Pick<Candidate, "topic" | "evidenceText" | "matchedLocale" | "matchedTerm">): Candidate {
  return {
    classifierProvenance: "gdpr_transparency_topic_classifier.v1",
    classifierReasonCodes: [`matched_${input.topic}`],
    confidence: 0.91,
    matchStrength: "direct",
    productionCredit: false,
    status: "diagnostic_only",
    ...input,
  };
}

function surface(candidates: Candidate[], input: Partial<Pick<
  PolicySurfaceObservation,
  "normalizedUrl" | "status" | "surfaceType" | "textExcerpt" | "url"
>> = {}) {
  return {
    gdprTransparencyTopicCandidates: candidates,
    normalizedUrl: "https://example.test/privacy",
    status: "fetched" as const,
    surfaceType: "privacy_policy" as const,
    textExcerpt:
      "This privacy policy explains how we process personal data, the legal basis for processing, retention, rights, transfers, and contact details.",
    url: "https://example.test/privacy",
    ...input,
  };
}

test("GDPR Transparency production evidence profile uses multilingual Article 13 evidence by default", () => {
  assert.equal(
    normalizeGdprTransparencyProductionEvidenceProfile(undefined),
    GDPR_TRANSPARENCY_MULTILINGUAL_ARTICLE13_PROFILE,
  );
  assert.equal(
    normalizeGdprTransparencyProductionEvidenceProfile(""),
    GDPR_TRANSPARENCY_MULTILINGUAL_ARTICLE13_PROFILE,
  );
  assert.equal(
    normalizeGdprTransparencyProductionEvidenceProfile("multilingual_v1"),
    GDPR_TRANSPARENCY_MULTILINGUAL_ARTICLE13_PROFILE,
  );
  assert.equal(normalizeGdprTransparencyProductionEvidenceProfile("legacy_only"), "legacy_only");
  assert.equal(
    normalizeGdprTransparencyProductionEvidenceProfile(GDPR_TRANSPARENCY_MULTILINGUAL_ARTICLE13_PROFILE),
    GDPR_TRANSPARENCY_MULTILINGUAL_ARTICLE13_PROFILE,
  );
  assert.equal(
    getGdprTransparencyProductionEvidenceProfileFromEnv({}),
    GDPR_TRANSPARENCY_MULTILINGUAL_ARTICLE13_PROFILE,
  );
  assert.equal(
    getGdprTransparencyProductionEvidenceProfileFromEnv({
      CERTSCORE_GDPR_TRANSPARENCY_EVIDENCE_PROFILE: "legacy_only",
    }),
    "legacy_only",
  );
  assert.equal(
    getGdprTransparencyProductionEvidenceProfileFromEnv({
      CERTSCORE_GDPR_TRANSPARENCY_EVIDENCE_PROFILE: GDPR_TRANSPARENCY_MULTILINGUAL_ARTICLE13_PROFILE,
    }),
    GDPR_TRANSPARENCY_MULTILINGUAL_ARTICLE13_PROFILE,
  );
});

test("legacy_only accepts no production signals from GDPR Transparency topic candidates", () => {
  const diagnosticCandidate = candidate({
    evidenceText:
      "The legal basis for processing your personal data includes consent, contractual necessity, and legitimate interests.",
    matchedLocale: "en",
    matchedTerm: "legal basis",
    topic: "legal_basis",
  });

  const result = adaptGdprTransparencyTopicCandidatesForProduction({
    profile: "legacy_only",
    surface: surface([diagnosticCandidate]),
  });

  assert.equal(result.productionEvidenceEnabled, false);
  assert.deepEqual(result.acceptedProductionSignals, []);
  assert.deepEqual(result.discardedArticle13DisclosureSignals, []);
  assert.equal(result.dispositions.length, 1);
  assert.equal(result.dispositions[0]?.disposition, "diagnostic_only");
  assert.equal(result.dispositions[0]?.productionCredit, false);
  assert.equal(diagnosticCandidate.productionCredit, false);
});

test("explicit GDPR Transparency profile accepts strong direct multilingual candidates from usable privacy-policy surfaces", () => {
  const examples: Array<{ locale: Locale; matchedTerm: string; text: string }> = [
    {
      locale: "en",
      matchedTerm: "legal basis",
      text: "The legal basis for processing your personal data includes consent, contractual necessity, and legitimate interests.",
    },
    {
      locale: "de",
      matchedTerm: "Rechtsgrundlage",
      text: "Die Rechtsgrundlage für die Verarbeitung personenbezogene Daten umfasst Einwilligung, Vertrag und berechtigte Interessen.",
    },
    {
      locale: "fr",
      matchedTerm: "base légale",
      text: "La base légale du traitement des données personnelles comprend le consentement, le contrat et nos intérêts légitimes.",
    },
    {
      locale: "es",
      matchedTerm: "base jurídica",
      text: "La base jurídica del tratamiento de datos personales incluye el consentimiento, el contrato y los intereses legítimos.",
    },
    {
      locale: "it",
      matchedTerm: "base giuridica",
      text: "La base giuridica del trattamento dei dati personali include consenso, contratto e interessi legittimi.",
    },
    {
      locale: "nl",
      matchedTerm: "grondslag",
      text: "De grondslag voor de verwerking van persoonsgegevens omvat toestemming, overeenkomst en gerechtvaardigde belangen.",
    },
    {
      locale: "pl",
      matchedTerm: "podstawa prawna",
      text: "Podstawa prawna przetwarzania dane osobowe obejmuje zgodę, umowę oraz uzasadniony interes.",
    },
  ];
  const candidates = examples.map((example) =>
    candidate({
      evidenceText: example.text,
      matchedLocale: example.locale,
      matchedTerm: example.matchedTerm,
      topic: "legal_basis",
    })
  );

  const result = adaptGdprTransparencyTopicCandidatesForProduction({
    policyTextQuality: { usable: true },
    profile: GDPR_TRANSPARENCY_MULTILINGUAL_ARTICLE13_PROFILE,
    surface: surface(candidates),
  });

  assert.equal(result.productionEvidenceEnabled, true);
  assert.equal(result.acceptedProductionSignals.length, examples.length);
  assert.deepEqual(result.discardedArticle13DisclosureSignals, []);
  assert.deepEqual(
    result.acceptedProductionSignals.map((signal) => signal.matchedLocale),
    examples.map((example) => example.locale),
  );
  for (const signal of result.acceptedProductionSignals) {
    assert.equal(signal.productionCredit, true);
    assert.equal(signal.productionCreditProfile, GDPR_TRANSPARENCY_MULTILINGUAL_ARTICLE13_PROFILE);
    assert.equal(signal.sourceCandidateProductionCredit, false);
    assert.equal(signal.classifierProvenance, "gdpr_transparency_topic_classifier.v1");
    assert.equal(signal.selectedEvidenceStrength, "strong");
    assert.equal(signal.source, "deterministic");
    assert.equal(signal.evidenceText.length <= 640, true);
  }
  assert.equal(candidates.every((item) => item.productionCredit === false), true);
});

test("adapter accepts Dutch healthcare Article 13 wording when classifier gates pass", () => {
  const candidates = [
    candidate({
      confidence: 0.82,
      evidenceText:
        "Privacybeleid. Hieronder lees je welke persoonsgegevens we van je verwerken, wat we hiermee doen en hoe lang we die bewaren.",
      matchStrength: "equivalent",
      matchedLocale: "nl",
      matchedTerm: "welke persoonsgegevens we van je verwerken wat we hiermee doen",
      topic: "processing_purposes",
    }),
    candidate({
      confidence: 0.82,
      evidenceText:
        "Privacybeleid. Hieronder lees je welke persoonsgegevens we verwerken, wat we hiermee doen en hoe lang we die bewaren.",
      matchStrength: "equivalent",
      matchedLocale: "nl",
      matchedTerm: "hoe lang we die bewaren",
      topic: "data_retention",
    }),
    candidate({
      confidence: 0.82,
      evidenceText:
        "Privacybeleid. De Autoriteit Persoonsgegevens ziet erop toe dat organisaties persoonsgegevens volgens de privacywet verwerken.",
      matchStrength: "equivalent",
      matchedLocale: "nl",
      matchedTerm: "autoriteit persoonsgegevens ziet erop toe",
      topic: "supervisory_authority",
    }),
  ];

  const result = adaptGdprTransparencyTopicCandidatesForProduction({
    policyTextQuality: { usable: true },
    profile: GDPR_TRANSPARENCY_MULTILINGUAL_ARTICLE13_PROFILE,
    surface: surface(candidates, {
      textExcerpt:
        "Privacybeleid. Hieronder lees je welke persoonsgegevens we van je verwerken, wat we hiermee doen en hoe lang we die bewaren. De Autoriteit Persoonsgegevens ziet erop toe dat organisaties persoonsgegevens volgens de privacywet verwerken.",
    }),
  });

  assert.equal(result.acceptedProductionSignals.length, 3);
  assert.deepEqual(
    result.acceptedProductionSignals.map((signal) => signal.disclosureType).sort(),
    ["data_retention", "processing_purposes", "supervisory_authority"],
  );
  assert.equal(result.acceptedProductionSignals.every((signal) =>
    signal.matchedLocale === "nl" &&
    signal.matchStrength === "equivalent" &&
    signal.productionCredit === true &&
    signal.productionCreditProfile === GDPR_TRANSPARENCY_MULTILINGUAL_ARTICLE13_PROFILE
  ), true);
  assert.deepEqual(result.discardedArticle13DisclosureSignals, []);
  assert.equal(candidates.every((item) => item.productionCredit === false), true);
});

test("weak and contextual GDPR Transparency candidates are not production-credit evidence", () => {
  const weak = candidate({
    confidence: 0.93,
    evidenceText:
      "The legal basis for processing your personal data includes consent, contractual necessity, and legitimate interests.",
    matchStrength: "weak",
    matchedLocale: "en",
    matchedTerm: "legal basis",
    topic: "legal_basis",
  });
  const contextual = candidate({
    confidence: 0.92,
    evidenceText:
      "The legal basis for processing your personal data includes consent, contractual necessity, and legitimate interests.",
    matchStrength: "contextual",
    matchedLocale: "en",
    matchedTerm: "legal basis",
    topic: "legal_basis",
  });
  const lowConfidence = candidate({
    confidence: 0.79,
    evidenceText:
      "The legal basis for processing your personal data includes consent, contractual necessity, and legitimate interests.",
    matchedLocale: "en",
    matchedTerm: "legal basis",
    topic: "legal_basis",
  });

  const result = adaptGdprTransparencyTopicCandidatesForProduction({
    policyTextQuality: { usable: true },
    profile: GDPR_TRANSPARENCY_MULTILINGUAL_ARTICLE13_PROFILE,
    surface: surface([weak, contextual, lowConfidence]),
  });

  assert.deepEqual(result.acceptedProductionSignals, []);
  assert.equal(result.dispositions.every((item) => item.productionCredit === false), true);
  assert.deepEqual(
    result.dispositions.map((item) => item.rejectReason),
    [
      "candidate_strength_not_creditworthy",
      "candidate_strength_not_creditworthy",
      "candidate_strength_not_creditworthy",
    ],
  );
});

test("TOC, navigation, and non-policy candidates are rejected or diagnostic, not creditworthy", () => {
  const toc = candidate({
    evidenceText:
      "Privacy Policy Introduction Controller contact Legal basis Recipients Retention Rights International transfers DPO Complaints",
    matchedLocale: "en",
    matchedTerm: "legal basis",
    topic: "legal_basis",
  });
  const navigation = candidate({
    evidenceText:
      "Skip to main content Privacy Policy Overview Terms of Service Technologies FAQ Privacy Terms Search Menu",
    matchedLocale: "en",
    matchedTerm: "controller",
    topic: "controller_contact",
  });
  const nonPolicy = candidate({
    evidenceText:
      "The legal basis for processing your personal data includes consent, contractual necessity, and legitimate interests.",
    matchedLocale: "en",
    matchedTerm: "legal basis",
    topic: "legal_basis",
  });

  const tocResult = adaptGdprTransparencyTopicCandidatesForProduction({
    policyTextQuality: { usable: true },
    profile: GDPR_TRANSPARENCY_MULTILINGUAL_ARTICLE13_PROFILE,
    surface: surface([toc]),
  });
  const navigationResult = adaptGdprTransparencyTopicCandidatesForProduction({
    policyTextQuality: { usable: true },
    profile: GDPR_TRANSPARENCY_MULTILINGUAL_ARTICLE13_PROFILE,
    surface: surface([navigation]),
  });
  const nonPolicyResult = adaptGdprTransparencyTopicCandidatesForProduction({
    policyTextQuality: { usable: true },
    profile: GDPR_TRANSPARENCY_MULTILINGUAL_ARTICLE13_PROFILE,
    surface: surface([nonPolicy], { surfaceType: "terms" }),
  });

  assert.deepEqual(tocResult.acceptedProductionSignals, []);
  assert.deepEqual(navigationResult.acceptedProductionSignals, []);
  assert.deepEqual(nonPolicyResult.acceptedProductionSignals, []);
  assert.equal(tocResult.dispositions[0]?.rejectReason, "table_of_contents_only");
  assert.equal(navigationResult.dispositions[0]?.rejectReason, "page_chrome_or_navigation");
  assert.equal(nonPolicyResult.dispositions[0]?.rejectReason, "non_privacy_policy_surface");
  assert.equal(tocResult.discardedArticle13DisclosureSignals[0]?.productionCredit, false);
  assert.equal(navigationResult.discardedArticle13DisclosureSignals[0]?.productionCredit, false);
});

test("adapter credits target-relevant supplemental policy surfaces while generic terms stay diagnostic", () => {
  const termsLegalBasis = candidate({
    evidenceText:
      "Privacy terms. The legal basis for processing your personal data includes consent, contractual necessity, and legitimate interests.",
    matchedLocale: "en",
    matchedTerm: "legal basis",
    topic: "legal_basis",
  });
  const cookieRetention = candidate({
    evidenceText:
      "Cookie privacy policy. We retain personal data stored through cookies only as long as necessary for the purposes described.",
    matchedLocale: "en",
    matchedTerm: "retain personal data",
    topic: "data_retention",
  });

  const termsResult = adaptGdprTransparencyTopicCandidatesForProduction({
    isTargetRelevantPrivacyPolicy: true,
    policyTextQuality: { usable: true },
    profile: GDPR_TRANSPARENCY_MULTILINGUAL_ARTICLE13_PROFILE,
    surface: surface([termsLegalBasis], {
      surfaceType: "terms",
      textExcerpt: "Privacy terms explain legal basis for processing personal data.",
    }),
  });
  const cookieResult = adaptGdprTransparencyTopicCandidatesForProduction({
    isTargetRelevantPrivacyPolicy: true,
    policyTextQuality: { usable: true },
    profile: GDPR_TRANSPARENCY_MULTILINGUAL_ARTICLE13_PROFILE,
    surface: surface([cookieRetention], {
      surfaceType: "cookie_policy",
      textExcerpt: "Cookie privacy policy explains retention of personal data.",
    }),
  });
  const genericTermsResult = adaptGdprTransparencyTopicCandidatesForProduction({
    policyTextQuality: { usable: true },
    profile: GDPR_TRANSPARENCY_MULTILINGUAL_ARTICLE13_PROFILE,
    surface: surface([termsLegalBasis], {
      surfaceType: "terms",
      textExcerpt: "Generic website terms.",
    }),
  });

  assert.deepEqual(
    termsResult.acceptedProductionSignals.map((signal) => signal.disclosureType),
    ["legal_basis"],
  );
  assert.deepEqual(
    cookieResult.acceptedProductionSignals.map((signal) => signal.disclosureType),
    ["data_retention"],
  );
  assert.deepEqual(genericTermsResult.acceptedProductionSignals, []);
  assert.equal(genericTermsResult.dispositions[0]?.rejectReason, "non_privacy_policy_surface");
});

test("candidate-only diagnostic evidence creates production credit by default when adapter gates pass", () => {
  const diagnosticOnly = candidate({
    evidenceText:
      "The legal basis for processing your personal data includes consent, contractual necessity, and legitimate interests.",
    matchedLocale: "en",
    matchedTerm: "legal basis",
    topic: "legal_basis",
  });

  const result = adaptGdprTransparencyTopicCandidatesForProduction({
    surface: surface([diagnosticOnly]),
  });

  assert.equal(result.profile, GDPR_TRANSPARENCY_MULTILINGUAL_ARTICLE13_PROFILE);
  assert.equal(result.productionEvidenceEnabled, true);
  assert.equal(result.acceptedProductionSignals.length, 1);
  assert.equal(result.discardedArticle13DisclosureSignals.length, 0);
  assert.equal(result.dispositions[0]?.disposition, "accepted");
  assert.equal(result.dispositions[0]?.productionCredit, false);
  assert.equal(diagnosticOnly.productionCredit, false);
});

test("productionCredit true appears only on adapter-accepted evidence and never mutates source candidates", () => {
  const sourceCandidate = candidate({
    evidenceText:
      "The controller and privacy contact for personal data processing is Example Ltd, reachable at privacy@example.test.",
    matchedLocale: "en",
    matchedTerm: "controller",
    topic: "controller_contact",
  });

  const result = adaptGdprTransparencyTopicCandidatesForProduction({
    policyTextQuality: { usable: true },
    profile: GDPR_TRANSPARENCY_MULTILINGUAL_ARTICLE13_PROFILE,
    surface: surface([sourceCandidate]),
  });

  assert.equal(result.acceptedProductionSignals.length, 1);
  assert.equal(result.acceptedProductionSignals[0]?.productionCredit, true);
  assert.equal(result.acceptedProductionSignals[0]?.sourceCandidateProductionCredit, false);
  assert.equal(sourceCandidate.productionCredit, false);
  assert.equal(result.dispositions[0]?.candidate.productionCredit, false);
  assert.equal(result.dispositions[0]?.productionCredit, false);
});
