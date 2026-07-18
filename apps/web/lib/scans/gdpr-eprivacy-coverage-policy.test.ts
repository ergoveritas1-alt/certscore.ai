import assert from "node:assert/strict";
import test from "node:test";
import { deriveGdprEprivacyCoveragePolicyOutcomes } from "./gdpr-eprivacy-coverage-policy";
import { buildNormalizedConcerns } from "./normalized-concerns";

const completedInputBase = {
  coverageLimited: true,
  scanCompleted: true
};

function retainedArticle13Signal(outcome: NonNullable<ReturnType<typeof deriveGdprEprivacyCoveragePolicyOutcomes>[string]>) {
  return outcome.criticalEvidence.retainedEvidence.article13Signal as
    | { evidenceText?: string; selectedPolicySectionExcerpt?: string; source?: string; supportingContactContext?: string; supportingTransferSafeguardsContext?: string }
    | null
    | undefined;
}

const GDPR_TRANSPARENCY_TOPIC_TO_ROW_ID = {
  controller_contact: "controller_contact_disclosure",
  data_retention: "retention_disclosure_observed",
  data_subject_rights: "data_subject_rights_disclosure",
  dpo_contact: "dpo_contact_point_disclosure",
  international_transfers: "international_transfers_disclosure",
  legal_basis: "legal_basis_disclosure_observed",
  processing_purposes: "processing_purposes_disclosure",
  recipients_or_vendor_categories: "recipients_vendor_categories_disclosure",
  supervisory_authority: "supervisory_authority_complaint_disclosure"
} as const;

function makeGdprTransparencyArticle13Signal(input: {
  disclosureType: string;
  evidenceText?: string;
  matchedLocale?: string;
  matchedTerm?: string;
  productionCredit?: boolean;
  productionCreditProfile?: string;
  selectedEvidenceStrength?: string;
  status?: string;
}) {
  const evidenceText = input.evidenceText ?? "Localized bounded Article 13 evidence about personal data processing.";
  return {
    classifierProvenance: "gdpr_transparency_topic_classifier.v1",
    classifierReasonCodes: [`matched_${input.disclosureType}`],
    confidence: 0.93,
    disclosureType: input.disclosureType,
    evidenceSource: "gdpr_transparency_topic_candidate",
    evidenceText,
    matchStrength: "direct",
    matchedLocale: input.matchedLocale ?? "de",
    matchedTerm: input.matchedTerm ?? "personenbezogene daten",
    productionCredit: input.productionCredit ?? true,
    productionCreditProfile: input.productionCreditProfile ?? "gdpr_transparency_multilingual_article13_v1",
    selectedEvidenceStrength: input.selectedEvidenceStrength ?? "strong",
    selectedPolicySectionExcerpt: evidenceText,
    selectedPolicySectionUrl: "https://example.test/privacy",
    source: "deterministic",
    status: input.status ?? "observed"
  };
}

function makeGdprTransparencyConcerns(signals: Array<Record<string, unknown>>, profile = "gdpr_transparency_multilingual_article13_v1") {
  return buildNormalizedConcerns({
    reviewFindingCandidates: [],
    runtimeArtifacts: {
      policyDisclosureSummary: {
        article13DisclosureSignals: signals,
        gdprTransparencyEvidenceProfile: profile,
        gdprTransparencyProductionEvidenceEnabled: profile === "gdpr_transparency_multilingual_article13_v1"
      }
    },
    validationFindings: []
  });
}

test("deriveGdprEprivacyCoveragePolicyOutcomes marks policy-dependent rows not testable when policy evidence is missing under limited coverage", () => {
  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    events: [
      {
        eventType: "signals.nano_doc_enrichment_completed",
        metadataJson: {
          documentSourceCount: 0,
          freshExtractionCharacterCount: 0,
          policyDocumentCount: 0,
          policyEnrichmentCount: 0
        }
      }
    ],
    runtimeArtifacts: {
      hybridRuntimeEvidence: {
        networkSummary: {
          thirdPartyDomainCount: 12
        }
      }
    },
    snapshot: {
      third_party_script_domain_count: 12
    }
  });

  assert.equal(outcomes.runtime_vendor_disclosure_alignment, undefined);
  assert.equal(outcomes.cross_border_endpoint_review?.status, "Not testable");
  assert.match(
    outcomes.cross_border_endpoint_review?.criticalEvidence.statusBasis ?? "",
    /No usable privacy, cookie, or legal policy document/
  );
});

test("deriveGdprEprivacyCoveragePolicyOutcomes reports discovered budget-skipped privacy policy truthfully", () => {
  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {
      policyDisclosureSummary: {
        discoveredPrivacyPolicyStatuses: ["skipped_budget"],
        discoveredPrivacyPolicyUrls: ["https://example.test/privacy"],
        privacyPolicyDiscovered: true,
        privacyPolicyEvaluationState: "discovered_skipped_budget",
        privacyPolicyPresent: false,
      },
    },
    snapshot: {
      privacy_policy_present: false,
    },
  });

  assert.equal(outcomes.controller_contact_disclosure?.status, "Not testable");
  assert.match(
    outcomes.controller_contact_disclosure?.criticalEvidence.statusBasis ?? "",
    /discovered, but it was not fetched before the scan budget ended/i,
  );
  assert.doesNotMatch(
    outcomes.controller_contact_disclosure?.criticalEvidence.statusBasis ?? "",
    /No privacy-policy surface was retained/i,
  );
  assert.equal(outcomes.policy_text_extraction?.status, "Not testable");
  assert.match(
    outcomes.policy_text_extraction?.criticalEvidence.statusBasis ?? "",
    /discovered, but it was not fetched before the scan budget ended/i,
  );
});

test("deriveGdprEprivacyCoveragePolicyOutcomes keeps legacy_only GDPR Transparency concerns silent", () => {
  const baseline = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {},
    snapshot: {}
  });
  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    normalizedConcerns: makeGdprTransparencyConcerns([
      makeGdprTransparencyArticle13Signal({ disclosureType: "legal_basis" })
    ], "legacy_only"),
    runtimeArtifacts: {},
    snapshot: {}
  });

  assert.equal(outcomes.legal_basis_disclosure_observed?.status, baseline.legal_basis_disclosure_observed?.status);
});

test("deriveGdprEprivacyCoveragePolicyOutcomes gives checklist Observed credit to approved multilingual Article 13 topics", () => {
  const signals = Object.keys(GDPR_TRANSPARENCY_TOPIC_TO_ROW_ID).map((disclosureType) =>
    makeGdprTransparencyArticle13Signal({ disclosureType })
  );
  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    normalizedConcerns: makeGdprTransparencyConcerns(signals),
    runtimeArtifacts: {},
    snapshot: {}
  });

  for (const rowId of Object.values(GDPR_TRANSPARENCY_TOPIC_TO_ROW_ID)) {
    assert.equal(outcomes[rowId]?.status, "Observed", `${rowId} should receive checklist Observed credit`);
    assert.equal(
      outcomes[rowId]?.criticalEvidence.retainedEvidence.gdprTransparencyArticle13Concern !== undefined,
      true,
      `${rowId} should retain normalized concern provenance`
    );
  }
});

test("deriveGdprEprivacyCoveragePolicyOutcomes credits French retention and recipient Article 13 evidence", () => {
  const retentionEvidence =
    "COMBIEN DE TEMPS CES INFORMATIONS SONT-ELLES CONSERVÉES ? D'une manière générale, vos données personnelles sont conservées en base active pour une durée conforme aux dispositions légales et proportionnelles aux finalités pour lesquelles elles ont été collectées.";
  const recipientsEvidence =
    "AVEC QUI PARTAGEONS-NOUS CES INFORMATIONS ? Vos données personnelles sont communiquées à nos prestataires et sous-traitants dans la mesure nécessaire à la gestion du Site, de l'Application et des Services souscrits.";
  const signals = [
    makeGdprTransparencyArticle13Signal({
      disclosureType: "data_retention",
      evidenceText: retentionEvidence,
      matchedLocale: "fr",
      matchedTerm: "données personnelles sont conservées"
    }),
    makeGdprTransparencyArticle13Signal({
      disclosureType: "recipients_or_vendor_categories",
      evidenceText: recipientsEvidence,
      matchedLocale: "fr",
      matchedTerm: "prestataires et sous-traitants"
    })
  ];

  const summaryOutcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {
      policyDisclosureSummary: {
        article13DisclosureSignals: signals,
        gdprTransparencyEvidenceProfile: "gdpr_transparency_multilingual_article13_v1",
        gdprTransparencyProductionEvidenceEnabled: true,
        policyTextCoverageMode: "section_targeted",
        privacyPolicyPresent: true,
        privacyPolicyTextCharacterCount: 4200,
        privacyPolicyUrls: ["https://mentions-legales.example.test/page/politique-de-confidentialite"],
        retainedPrivacyPolicyTextExcerpt: [retentionEvidence, recipientsEvidence].join(" ")
      }
    },
    snapshot: {
      privacy_policy_present: true
    }
  });

  assert.equal(summaryOutcomes.retention_disclosure_observed?.status, "Observed");
  assert.equal(summaryOutcomes.recipients_vendor_categories_disclosure?.status, "Observed");
  assert.match(
    retainedArticle13Signal(summaryOutcomes.retention_disclosure_observed!)?.evidenceText ?? "",
    /conservées en base active/i
  );
  assert.match(
    retainedArticle13Signal(summaryOutcomes.recipients_vendor_categories_disclosure!)?.evidenceText ?? "",
    /prestataires et sous-traitants/i
  );

  const concernOutcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    normalizedConcerns: makeGdprTransparencyConcerns(signals),
    runtimeArtifacts: {},
    snapshot: {}
  });

  assert.equal(concernOutcomes.retention_disclosure_observed?.status, "Observed");
  assert.equal(concernOutcomes.recipients_vendor_categories_disclosure?.status, "Observed");
});

test("deriveGdprEprivacyCoveragePolicyOutcomes keeps automated profiling Article 13 evidence in review", () => {
  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    normalizedConcerns: makeGdprTransparencyConcerns([
      makeGdprTransparencyArticle13Signal({ disclosureType: "automated_decision_making_or_profiling" })
    ]),
    runtimeArtifacts: {},
    snapshot: {}
  });

  assert.notEqual(outcomes.automated_decision_making_profiling_disclosure?.status, "Observed");
  assert.equal(outcomes.automated_decision_making_profiling_disclosure?.status, "Review signal");
});

test("deriveGdprEprivacyCoveragePolicyOutcomes maps partial and ambiguous multilingual Article 13 evidence safely", () => {
  const partial = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    normalizedConcerns: makeGdprTransparencyConcerns([
      makeGdprTransparencyArticle13Signal({ disclosureType: "legal_basis", status: "partial" })
    ]),
    runtimeArtifacts: {},
    snapshot: {}
  });
  const ambiguous = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    normalizedConcerns: makeGdprTransparencyConcerns([
      makeGdprTransparencyArticle13Signal({
        disclosureType: "legal_basis",
        selectedEvidenceStrength: "limited"
      })
    ]),
    runtimeArtifacts: {},
    snapshot: {}
  });

  assert.equal(partial.legal_basis_disclosure_observed?.status, "Review signal");
  assert.notEqual(ambiguous.legal_basis_disclosure_observed?.status, "Observed");
  assert.equal(
    ambiguous.legal_basis_disclosure_observed?.criticalEvidence.retainedEvidence.gdprTransparencyArticle13Concern,
    undefined
  );
});

test("deriveGdprEprivacyCoveragePolicyOutcomes ignores rejected non-credit multilingual Article 13 evidence", () => {
  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    normalizedConcerns: makeGdprTransparencyConcerns([
      makeGdprTransparencyArticle13Signal({
        disclosureType: "legal_basis",
        productionCredit: false
      }),
      makeGdprTransparencyArticle13Signal({
        disclosureType: "data_retention",
        productionCreditProfile: "legacy_only"
      })
    ]),
    runtimeArtifacts: {},
    snapshot: {}
  });

  assert.notEqual(outcomes.legal_basis_disclosure_observed?.status, "Observed");
  assert.notEqual(outcomes.retention_disclosure_observed?.status, "Observed");
});

test("deriveGdprEprivacyCoveragePolicyOutcomes consumes structured Article 13 disclosure signals", () => {
  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {
      policyDisclosureSummary: {
        article13DisclosureSignals: [
          {
            confidence: 0.82,
            disclosureType: "controller_contact",
            evidenceText: "The controller can be contacted at privacy@example.test.",
            source: "deterministic",
            status: "observed"
          },
          {
            confidence: 0.62,
            disclosureType: "international_transfers",
            evidenceText: "We may transfer personal data outside the EEA, but retained evidence did not specify safeguards or legal frameworks.",
            source: "deterministic",
            status: "partial"
          }
        ],
        privacyPolicyPresent: true,
        privacyPolicyTextCharacterCount: 2500,
        privacyPolicyUrls: ["https://example.test/privacy"],
        retainedPrivacyPolicyTextExcerpt: "Privacy notice text."
      }
    },
    snapshot: {
      privacy_policy_present: true
    }
  });

  assert.equal(outcomes.controller_contact_disclosure?.status, "Observed");
  assert.equal(
    retainedArticle13Signal(outcomes.controller_contact_disclosure!)!.evidenceText,
    "The controller can be contacted at privacy@example.test."
  );
  assert.equal(outcomes.international_transfers_disclosure?.status, "Review signal");
});

test("deriveGdprEprivacyCoveragePolicyOutcomes credits high-confidence direct Article 13 signals when section extraction is limited", () => {
  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {
      policyDisclosureSummary: {
        article13DisclosureSignals: [
          {
            confidence: 0.88,
            disclosureType: "processing_purposes",
            evidenceText:
              "We use personal information to provide products and services, support customer service efforts, communicate with you about your requests, and keep records.",
            source: "deterministic",
            status: "observed"
          },
          {
            confidence: 0.86,
            disclosureType: "recipients_or_vendor_categories",
            evidenceText:
              "These vendors will process your personal information as a data processor, and under our instructions. We use email interaction data to improve how we communicate with you and others.",
            source: "deterministic",
            status: "observed"
          },
          {
            confidence: 0.9,
            disclosureType: "data_subject_rights",
            evidenceText:
              "You have the right to see the data we have collected, take it with you, make corrections, withdraw consent, opt out, or erase your data.",
            source: "deterministic",
            status: "observed"
          }
        ],
        policySectionCount: 1,
        policyTextCoverageMode: "section_targeted",
        policyTextExtractionHealth: {
          extractedTextLength: 0,
          extractionFailureReason: "privacy_policy_text_processing_error",
          minimumTextLengthRequired: 2500,
          policySurfaceObserved: true,
          policyTextExtractionStatus: "errored",
          policyTextQuality: {
            codeSignalCount: 0,
            naturalLanguageSentenceCount: 12,
            usable: true
          },
          policyUrlRetained: true
        },
        privacyPolicyPresent: true,
        privacyPolicyTextCharacterCount: 0,
        privacyPolicyUrls: ["https://www.nvidia.com/en-gb/about-nvidia/privacy-policy/"],
        processingErrorObserved: true,
        retainedArticle13SectionEvidence: [
          {
            coverageArea: "data_subject_rights",
            extractionLimitation: "section_retained_without_row_specific_disclosure",
            selectedEvidenceStrength: "limited",
            selectedPolicySectionExcerpt:
              "NVIDIA Privacy Policy. Control your personal data. You have the right to see the data we have collected, take it with you, make corrections, withdraw consent for future uses, opt out of sales and sharing, or erase your data.",
            selectedPolicySectionHeading: "NVIDIA Privacy Policy",
            selectedPolicySectionUrl: "https://www.nvidia.com/en-gb/about-nvidia/privacy-policy/",
            signalObserved: "not_confirmed"
          }
        ],
        retainedPrivacyPolicyTextExcerpt: ""
      }
    },
    snapshot: {
      privacy_policy_present: true
    }
  });

  assert.equal(outcomes.processing_purposes_disclosure?.status, "Observed");
  assert.equal(outcomes.recipients_vendor_categories_disclosure?.status, "Observed");
  assert.equal(outcomes.data_subject_rights_disclosure?.status, "Observed");
  assert.match(
    retainedArticle13Signal(outcomes.data_subject_rights_disclosure!)?.evidenceText ?? "",
    /right to see the data/i
  );
});

test("deriveGdprEprivacyCoveragePolicyOutcomes treats supervisory contact email as supporting context only", () => {
  const supervisoryExcerpt = [
    "If you are still not happy, you have the right to contact your data protection authority.",
    "Further details can be found by contacting us by email at wbdprivacy@wbd.com."
  ].join(" ");
  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {
      policyDisclosureSummary: {
        article13DisclosureSignals: [
          {
            confidence: 0.91,
            disclosureType: "supervisory_authority",
            evidenceText: "you have the right to contact your data protection authority",
            selectedEvidenceStrength: "strong",
            selectedPolicySectionExcerpt: supervisoryExcerpt,
            source: "deterministic",
            status: "observed",
            supportingContactContext: "wbdprivacy@wbd.com"
          }
        ],
        policyTextCoverageMode: "section_targeted",
        privacyPolicyPresent: true,
        privacyPolicyTextCharacterCount: 3000,
        privacyPolicyUrls: ["https://example.test/privacy"],
        retainedPrivacyPolicyTextExcerpt: supervisoryExcerpt
      }
    },
    snapshot: {
      privacy_policy_present: true
    }
  });

  const outcome = outcomes.supervisory_authority_complaint_disclosure;
  assert.equal(outcome?.status, "Observed");
  assert.match(outcome?.criticalEvidence.statusBasis ?? "", /authority\/regulator complaint language confirms/i);
  assert.match(outcome?.criticalEvidence.statusBasis ?? "", /supporting context/i);
  assert.equal(retainedArticle13Signal(outcome!)?.supportingContactContext, "wbdprivacy@wbd.com");
  assert.equal(
    outcome?.evidenceRefs.includes("Supporting contact context: wbdprivacy@wbd.com"),
    true
  );

  const emailOnlyOutcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {
      policyDisclosureSummary: {
        article13DisclosureSignals: [
          {
            confidence: 0.7,
            disclosureType: "supervisory_authority",
            evidenceText: "Further details can be found by contacting us by email at wbdprivacy@wbd.com.",
            source: "deterministic",
            status: "observed"
          }
        ],
        policyTextCoverageMode: "section_targeted",
        privacyPolicyPresent: true,
        privacyPolicyTextCharacterCount: 3000,
        privacyPolicyUrls: ["https://example.test/privacy"],
        retainedPrivacyPolicyTextExcerpt: "Further details can be found by contacting us by email at wbdprivacy@wbd.com."
      }
    },
    snapshot: {
      privacy_policy_present: true
    }
  });

  assert.notEqual(emailOnlyOutcomes.supervisory_authority_complaint_disclosure?.status, "Observed");
});

test("deriveGdprEprivacyCoveragePolicyOutcomes sanitizes and prefers Ireland-relevant policy disclosure snippets", () => {
  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {
      policyDisclosureSummary: {
        article13DisclosureSignals: [
          {
            disclosureType: "controller_contact",
            evidenceText:
              "\\r\\n</td><td><p>United States</p></td></tr></tbody></table><p><b>II. Your Privacy Globally</b></p><p>The data controller of your personal information is the McDonald's entity in the jurisdiction where your personal information is collected.</p>",
            source: "deterministic",
            status: "observed"
          },
          {
            disclosureType: "controller_contact",
            evidenceText:
              "<p>McDonald’s Restaurants of Ireland Limited is the data controller for Ireland users. You may contact the Local Data Protection Office or McDonald’s Global Data Protection Officer.</p>",
            source: "deterministic",
            status: "observed"
          },
          {
            disclosureType: "data_retention",
            evidenceText:
              "<p><a href=\"#top\"><span>Back to Top</span></a></p><h3>9. Retention</h3><p>McDonald’s will only retain personal information for the duration of time needed for the purposes described in this notice.</p>",
            source: "deterministic",
            status: "observed"
          }
        ],
        privacyPolicyPresent: true,
        privacyPolicyTextCharacterCount: 3200,
        privacyPolicyUrls: ["https://mcdonalds.com/ie/en-ie/privacy-policy/full.html"],
        retainedPrivacyPolicyTextExcerpt: "Privacy notice text."
      }
    },
    snapshot: {
      privacy_policy_present: true
    }
  });

  const controllerText = retainedArticle13Signal(outcomes.controller_contact_disclosure!)?.evidenceText ?? "";
  const retentionText = retainedArticle13Signal(outcomes.retention_disclosure_observed!)?.evidenceText ?? "";
  assert.match(controllerText, /McDonald’s Restaurants of Ireland Limited/);
  assert.doesNotMatch(controllerText, /^United States/i);
  assert.doesNotMatch(controllerText, /<[^>]+>|\\r|\\n/i);
  assert.match(retentionText, /^9\. Retention/i);
  assert.doesNotMatch(retentionText, /Back to Top|<[^>]+>/i);
});

test("deriveGdprEprivacyCoveragePolicyOutcomes prefers observed controller evidence over a richer partial marketing candidate", () => {
  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {
      policyDisclosureSummary: {
        article13DisclosureSignals: [
          {
            disclosureType: "controller_contact",
            evidenceText: "Our DPO and data protection services provide a seamless approach to managing customer data, ensuring compliance with GDPR and supporting privacy programs.",
            confidence: 0.95,
            selectedEvidenceStrength: "strong",
            source: "deterministic",
            status: "partial"
          },
          {
            disclosureType: "controller_contact",
            evidenceText: "Information on the controller pursuant to Art. 4 No. 7 GDPR: SITS Group AG, Etzelmatt 1, CH-5430 Wettingen. E-Mail: INFO@SITS.COM.",
            confidence: 0.9,
            selectedEvidenceStrength: "strong",
            source: "deterministic",
            status: "observed"
          }
        ],
        privacyPolicyPresent: true,
        privacyPolicyTextCharacterCount: 3200,
        privacyPolicyUrls: ["https://sits.com/en/privacy-policy/"],
        retainedPrivacyPolicyTextExcerpt: "Information on the controller pursuant to Art. 4 No. 7 GDPR: SITS Group AG, Etzelmatt 1, CH-5430 Wettingen. E-Mail: INFO@SITS.COM."
      }
    },
    snapshot: {
      privacy_policy_present: true
    }
  });

  assert.equal(outcomes.controller_contact_disclosure?.status, "Observed");
  const controllerText = retainedArticle13Signal(outcomes.controller_contact_disclosure!)?.evidenceText ?? "";
  assert.match(controllerText, /SITS Group AG/i);
  assert.doesNotMatch(controllerText, /DPO and data protection services/i);
});

test("deriveGdprEprivacyCoveragePolicyOutcomes keeps generic contact excerpts out of controller observed", () => {
  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {
      policyDisclosureSummary: {
        article13DisclosureSignals: [
          {
            disclosureType: "controller_contact",
            evidenceText: "Contact us through the website form for questions about our services.",
            source: "deterministic",
            status: "observed"
          }
        ],
        privacyPolicyPresent: true,
        privacyPolicyTextCharacterCount: 3200,
        privacyPolicyUrls: ["https://example.test/privacy"],
        retainedPrivacyPolicyTextExcerpt: "Contact us through the website form for questions about our services."
      }
    },
    snapshot: {
      privacy_policy_present: true
    }
  });

  assert.equal(outcomes.controller_contact_disclosure?.status, "Not confirmed");
  assert.equal(
    outcomes.controller_contact_disclosure?.criticalEvidence.retainedEvidence.signalObserved,
    "not_confirmed_row_specific_extraction"
  );
});

test("deriveGdprEprivacyCoveragePolicyOutcomes detects common international transfer disclosure wording from retained policy text", () => {
  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {
      policyDisclosureSummary: {
        privacyPolicyPresent: true,
        privacyPolicyTextCharacterCount: 3200,
        privacyPolicyUrls: ["https://www.cnn.com/privacy"],
        retainedPrivacyPolicyTextExcerpt:
          "We may transfer personal information to third countries outside the EEA, UK, and Switzerland. Where required, we rely on Standard Contractual Clauses and the Data Privacy Framework."
      }
    },
    snapshot: {
      privacy_policy_present: true
    }
  });

  assert.equal(outcomes.international_transfers_disclosure?.status, "Observed");
  assert.match(
    retainedArticle13Signal(outcomes.international_transfers_disclosure!)!.evidenceText ?? "",
    /third countries outside the EEA/i
  );
  assert.equal(
    retainedArticle13Signal(outcomes.international_transfers_disclosure!)!.source,
    "wc01_retained_policy_text_match"
  );
});

test("deriveGdprEprivacyCoveragePolicyOutcomes confirms outside-region recipient disclosure with agreement safeguards", () => {
  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {
      policyDisclosureSummary: {
        privacyPolicyPresent: true,
        privacyPolicyTextCharacterCount: 3200,
        privacyPolicyUrls: ["https://example.test/privacy"],
        retainedPrivacyPolicyTextExcerpt:
          "We share personal information with third parties, service providers, and business partners for the purposes described in this notice. These third parties may be in the Netherlands as well as within other countries in the European Economic Area (EEA). Sometimes they may also be outside the EEA. We have concluded agreements with our service providers and business partners, to ensure that your personal information is protected, both within and outside the EEA."
      }
    },
    snapshot: {
      privacy_policy_present: true
    }
  });

  assert.equal(outcomes.international_transfers_disclosure?.status, "Observed");
  const signal = retainedArticle13Signal(outcomes.international_transfers_disclosure!);
  assert.match(signal?.evidenceText ?? "", /Sometimes they may also be outside the EEA/i);
  assert.match(
    signal?.supportingTransferSafeguardsContext ?? "",
    /agreements with our service providers and business partners, to ensure that your personal information is protected, both within and outside the EEA/i
  );
  assert.equal(signal?.source, "wc01_retained_policy_text_match");
});

test("deriveGdprEprivacyCoveragePolicyOutcomes does not confirm international transfers from geography-only consent law language", () => {
  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {
      policyDisclosureSummary: {
        privacyPolicyPresent: true,
        privacyPolicyTextCharacterCount: 3200,
        privacyPolicyUrls: ["https://www.cnn.com/privacy"],
        retainedPrivacyPolicyTextExcerpt:
          "Under the laws of some countries outside of the European Economic Area and the United Kingdom we may need your or your adult's consent before you can use some of our services."
      }
    },
    snapshot: {
      privacy_policy_present: true
    }
  });

  assert.notEqual(outcomes.international_transfers_disclosure?.status, "Observed");
  assert.equal(outcomes.international_transfers_disclosure?.status, "Not confirmed");
  assert.equal(
    outcomes.international_transfers_disclosure?.criticalEvidence.retainedEvidence.signalObserved,
    "not_confirmed_row_specific_extraction"
  );
  assert.match(
    outcomes.international_transfers_disclosure?.criticalEvidence.statusBasis ?? "",
    /international-transfer disclosure text was not confidently extracted/i
  );
});

test("deriveGdprEprivacyCoveragePolicyOutcomes confirms explicit international transfer disclosure examples", () => {
  const examples = [
    "We may transfer your personal data outside the EEA/UK.",
    "Where we transfer personal data internationally, we rely on Standard Contractual Clauses.",
    "Your information may be stored or processed in the United States and other countries."
  ];

  for (const excerpt of examples) {
    const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
      ...completedInputBase,
      runtimeArtifacts: {
        policyDisclosureSummary: {
          privacyPolicyPresent: true,
          privacyPolicyTextCharacterCount: 3200,
          privacyPolicyUrls: ["https://example.test/privacy"],
          retainedPrivacyPolicyTextExcerpt: excerpt
        }
      },
      snapshot: {
        privacy_policy_present: true
      }
    });

    assert.equal(outcomes.international_transfers_disclosure?.status, "Observed", excerpt);
    assert.match(
      retainedArticle13Signal(outcomes.international_transfers_disclosure!)?.evidenceText ?? "",
      /transfer|stored|processed|standard contractual clauses/i
    );
  }
});

test("deriveGdprEprivacyCoveragePolicyOutcomes does not promote topic-only Article 13 hints to observed", () => {
  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {
      policyDisclosureSummary: {
        observedTopics: ["legal_basis"],
        privacyPolicyPresent: true,
        privacyPolicyTextCharacterCount: 3200,
        privacyPolicyUrls: ["https://example.test/privacy"],
        retainedPrivacyPolicyTextExcerpt: "Privacy Policy. We describe how personal information is handled."
      }
    },
    snapshot: {
      privacy_policy_present: true
    }
  });

  assert.equal(outcomes.legal_basis_disclosure_observed?.status, "Not confirmed");
  assert.equal(
    outcomes.legal_basis_disclosure_observed?.criticalEvidence.retainedEvidence.signalObserved,
    "not_confirmed_row_specific_extraction"
  );
});

test("deriveGdprEprivacyCoveragePolicyOutcomes keeps weak legal basis Article 13 excerpts in review", () => {
  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {
      policyDisclosureSummary: {
        article13DisclosureSignals: [
          {
            disclosureType: "legal_basis",
            evidenceText: "We use cookies on this website to improve your experience. You may manage your consent choices.",
            source: "deterministic",
            status: "observed"
          }
        ],
        privacyPolicyPresent: true,
        privacyPolicyTextCharacterCount: 3200,
        privacyPolicyUrls: ["https://example.test/privacy"],
        retainedPrivacyPolicyTextExcerpt: "We use cookies on this website to improve your experience. You may manage your consent choices."
      }
    },
    snapshot: {
      privacy_policy_present: true
    }
  });

  assert.equal(outcomes.legal_basis_disclosure_observed?.status, "Not confirmed");
  assert.equal(
    outcomes.legal_basis_disclosure_observed?.criticalEvidence.retainedEvidence.signalObserved,
    "not_confirmed_row_specific_extraction"
  );
});

test("deriveGdprEprivacyCoveragePolicyOutcomes requires row-specific recipient/vendor category evidence", () => {
  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {
      policyDisclosureSummary: {
        article13DisclosureSignals: [
          {
            disclosureType: "recipients_or_vendor_categories",
            evidenceText: "We may use information to understand and improve how visitors use our website.",
            source: "deterministic",
            status: "observed"
          }
        ],
        privacyPolicyPresent: true,
        privacyPolicyTextCharacterCount: 3200,
        privacyPolicyUrls: ["https://example.test/privacy"],
        retainedPrivacyPolicyTextExcerpt: "We may use information to understand and improve how visitors use our website."
      }
    },
    snapshot: {
      privacy_policy_present: true
    }
  });

  assert.equal(outcomes.recipients_vendor_categories_disclosure?.status, "Not confirmed");
  assert.equal(
    outcomes.recipients_vendor_categories_disclosure?.criticalEvidence.retainedEvidence.signalObserved,
    "not_confirmed_row_specific_extraction"
  );
});

test("deriveGdprEprivacyCoveragePolicyOutcomes does not promote session-replay service-provider text as recipient disclosure", () => {
  const sessionReplayExcerpt =
    "In collecting Information about your use of a Digital Service, we may use service providers or other solutions to record users' interactions with our Sites, which may include mouse clicks, mouse movements, page scrolling, and keystrokes/key touches during those sessions.";

  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {
      policyDisclosureSummary: {
        article13DisclosureSignals: [
          {
            disclosureType: "recipients_or_vendor_categories",
            evidenceText: sessionReplayExcerpt,
            source: "deterministic",
            status: "observed"
          }
        ],
        privacyPolicyPresent: true,
        privacyPolicyTextCharacterCount: 3200,
        privacyPolicyUrls: ["https://example.test/privacy"],
        retainedPrivacyPolicyTextExcerpt: sessionReplayExcerpt
      }
    },
    snapshot: {
      privacy_policy_present: true
    }
  });

  assert.equal(outcomes.recipients_vendor_categories_disclosure?.status, "Not confirmed");
  assert.match(
    outcomes.recipients_vendor_categories_disclosure?.limitation ?? "",
    /session-replay|Collected-data|recipient\/vendor-category/i
  );
  assert.equal(
    outcomes.recipients_vendor_categories_disclosure?.criticalEvidence.retainedEvidence.signalObserved,
    "not_confirmed_row_specific_extraction"
  );
});

test("deriveGdprEprivacyCoveragePolicyOutcomes confirms explicit recipient/vendor category sharing disclosure", () => {
  const recipientDisclosure =
    "We share personal information with service providers, processors, vendors, affiliates, advertising partners, analytics providers, payment processors, business partners, social networks, and regulators where required.";

  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {
      policyDisclosureSummary: {
        article13DisclosureSignals: [
          {
            disclosureType: "recipients_or_vendor_categories",
            evidenceText: recipientDisclosure,
            source: "deterministic",
            status: "observed"
          }
        ],
        privacyPolicyPresent: true,
        privacyPolicyTextCharacterCount: 3200,
        privacyPolicyUrls: ["https://example.test/privacy"],
        retainedPrivacyPolicyTextExcerpt: recipientDisclosure
      }
    },
    snapshot: {
      privacy_policy_present: true
    }
  });

  assert.equal(outcomes.recipients_vendor_categories_disclosure?.status, "Observed");
  assert.match(
    retainedArticle13Signal(outcomes.recipients_vendor_categories_disclosure!)?.evidenceText ?? "",
    /share personal information with service providers/i
  );
});

test("deriveGdprEprivacyCoveragePolicyOutcomes treats DPO contact as review when a privacy contact exists", () => {
  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {
      policyDisclosureSummary: {
        article13DisclosureSignals: [
          {
            disclosureType: "controller_contact",
            evidenceText: "The data controller is Example Inc. You can contact us through the website contact form.",
            source: "deterministic",
            status: "observed"
          }
        ],
        privacyPolicyPresent: true,
        privacyPolicyTextCharacterCount: 3200,
        privacyPolicyUrls: ["https://example.test/privacy"],
        retainedPrivacyPolicyTextExcerpt: "The data controller is Example Inc. You can contact us through the website contact form."
      }
    },
    snapshot: {
      privacy_policy_present: true
    }
  });

  assert.equal(outcomes.dpo_contact_point_disclosure?.status, "Not confirmed");
  assert.equal(
    outcomes.dpo_contact_point_disclosure?.criticalEvidence.retainedEvidence.signalObserved,
    "not_confirmed_row_specific_extraction"
  );
  assert.match(outcomes.dpo_contact_point_disclosure?.limitation ?? "", /controller\/contact surface was retained/i);
});

test("deriveGdprEprivacyCoveragePolicyOutcomes keeps financial-incentive text out of automated decision observed", () => {
  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {
      policyDisclosureSummary: {
        article13DisclosureSignals: [
          {
            disclosureType: "automated_decision_making_or_profiling",
            evidenceText:
              "Receive information about the financial incentives that we offer to you. You may opt out of processing for targeted advertising.",
            source: "deterministic",
            status: "observed"
          }
        ],
        privacyPolicyPresent: true,
        privacyPolicyTextCharacterCount: 3200,
        privacyPolicyUrls: ["https://example.test/privacy"],
        retainedPrivacyPolicyTextExcerpt:
          "Receive information about the financial incentives that we offer to you. You may opt out of processing for targeted advertising."
      }
    },
    snapshot: {
      privacy_policy_present: true
    }
  });

  assert.equal(outcomes.automated_decision_making_profiling_disclosure?.status, "Review signal");
  assert.equal(
    outcomes.automated_decision_making_profiling_disclosure?.criticalEvidence.retainedEvidence.signalObserved,
    "partial_automated_processing_without_article22_disclosure"
  );
});

test("deriveGdprEprivacyCoveragePolicyOutcomes observes explicit automated decision disclosure text", () => {
  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {
      policyDisclosureSummary: {
        privacyPolicyPresent: true,
        privacyPolicyTextCharacterCount: 3200,
        privacyPolicyUrls: ["https://example.test/privacy"],
        retainedPrivacyPolicyTextExcerpt:
          "We do not make decisions based solely on automated processing, including profiling, that produce legal or similarly significant effects. You may request meaningful information about the logic involved."
      }
    },
    snapshot: {
      privacy_policy_present: true
    }
  });

  assert.equal(outcomes.automated_decision_making_profiling_disclosure?.status, "Observed");
  assert.match(
    retainedArticle13Signal(outcomes.automated_decision_making_profiling_disclosure!)?.evidenceText ?? "",
    /solely on automated processing/i
  );
});

test("deriveGdprEprivacyCoveragePolicyOutcomes does not treat deletion rights as retention disclosure", () => {
  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {
      policyDisclosureSummary: {
        privacyPolicyPresent: true,
        privacyPolicyTextCharacterCount: 3200,
        privacyPolicyUrls: ["https://example.test/privacy"],
        retainedPrivacyPolicyTextExcerpt:
          "Privacy Policy. You have the right to access, delete, erase, rectify, restrict, port, or object to certain processing of your personal data."
      }
    },
    snapshot: {
      privacy_policy_present: true
    }
  });

  assert.equal(outcomes.data_subject_rights_disclosure?.status, "Observed");
  assert.notEqual(outcomes.retention_disclosure_observed?.status, "Observed");
});

test("deriveGdprEprivacyCoveragePolicyOutcomes keeps weak retention wording in review", () => {
  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {
      policyDisclosureSummary: {
        article13DisclosureSignals: [
          {
            confidence: 0.62,
            disclosureType: "data_retention",
            evidenceText: "Some information may be retained even after withdrawal.",
            source: "deterministic",
            status: "partial"
          }
        ],
        privacyPolicyPresent: true,
        privacyPolicyTextCharacterCount: 3200,
        privacyPolicyUrls: ["https://example.test/privacy"],
        retainedPrivacyPolicyTextExcerpt: "Some information may be retained even after withdrawal."
      }
    },
    snapshot: {
      privacy_policy_present: true
    }
  });

  assert.equal(outcomes.retention_disclosure_observed?.status, "Review signal");
});

test("deriveGdprEprivacyCoveragePolicyOutcomes does not observe retention from generic storage mechanics", () => {
  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {
      policyDisclosureSummary: {
        privacyPolicyPresent: true,
        privacyPolicyTextCharacterCount: 3200,
        privacyPolicyUrls: ["https://example.test/privacy"],
        retainedPrivacyPolicyTextExcerpt:
          "We use various technologies to collect and store information, including cookies, local storage, databases, and server logs."
      }
    },
    snapshot: {
      privacy_policy_present: true
    }
  });

  assert.notEqual(outcomes.retention_disclosure_observed?.status, "Observed");
  assert.equal(outcomes.retention_disclosure_observed?.status, "Not confirmed");
  assert.equal(
    outcomes.retention_disclosure_observed?.criticalEvidence.retainedEvidence.signalObserved,
    "not_confirmed_row_specific_extraction"
  );
});

test("deriveGdprEprivacyCoveragePolicyOutcomes prefers retention-specific retained sections over security sections", () => {
  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {
      policyDisclosureSummary: {
        observedTopics: ["data_retention"],
        policyTextCoverageMode: "section_targeted",
        privacyPolicyPresent: true,
        privacyPolicyTextCharacterCount: 4600,
        privacyPolicyUrls: ["https://example.test/privacy"],
        retainedPolicySections: [
          {
            charEnd: 360,
            charStart: 0,
            heading: "How we keep your personal information safe",
            quality: "strong",
            sourceUrl: "https://example.test/privacy",
            textExcerpt:
              "How we keep your personal information safe. We protect your personal information using security safeguards, encryption, confidentiality controls, and procedures intended to prevent unauthorised access, loss, destruction, or damage."
          },
          {
            charEnd: 780,
            charStart: 361,
            heading: "How long we keep your personal information",
            quality: "strong",
            sourceUrl: "https://example.test/privacy",
            textExcerpt:
              "How long we keep your personal information. Newsletter preferences are kept until you unsubscribe, booking information is retained for one year, CCTV recordings are kept for a maximum of four weeks, and some records may be retained longer for legal obligations or legal disputes."
          },
          {
            charEnd: 1120,
            charStart: 781,
            heading: "How long we keep your personal information collected through cookies",
            quality: "strong",
            sourceUrl: "https://example.test/cookie-policy",
            textExcerpt:
              "How long we keep your personal information collected through cookies. Cookie identifiers are stored for the retention period shown in the cookie list and are deleted when they expire or are no longer necessary."
          }
        ],
        retainedPrivacyPolicyTextExcerpt: ""
      }
    },
    snapshot: {
      privacy_policy_present: true
    }
  });

  const retentionText = retainedArticle13Signal(outcomes.retention_disclosure_observed!)?.evidenceText ?? "";
  assert.equal(outcomes.retention_disclosure_observed?.status, "Observed");
  assert.match(retentionText, /How long we keep your personal information/i);
  assert.match(retentionText, /until you unsubscribe|retained for one year|CCTV recordings are kept/i);
  assert.doesNotMatch(retentionText, /How we keep your personal information safe/i);
  assert.equal(
    outcomes.retention_disclosure_observed?.criticalEvidence.retainedEvidence.selectedPolicySectionHeading,
    "How long we keep your personal information"
  );
});

test("deriveGdprEprivacyCoveragePolicyOutcomes treats guessed-only privacy notice as review", () => {
  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {
      policyDisclosureSummary: {
        keyPageGuessedOnly: true,
        presentationDecision: {
          status: "guessed_only"
        },
        privacyPolicyPresent: true,
        privacyPolicyTextCharacterCount: 3200,
        privacyPolicyUrls: ["https://example.test/privacy"],
        retainedPrivacyPolicyTextExcerpt: "Privacy Policy. We explain how personal information is handled."
      }
    },
    snapshot: {
      privacy_policy_present: true
    }
  });

  assert.equal(outcomes.privacy_notice_availability?.status, "Review signal");
  assert.equal(outcomes.privacy_notice_availability?.criticalEvidence.retainedEvidence.signalObserved, "partial");
});

test("deriveGdprEprivacyCoveragePolicyOutcomes keeps missing international transfer disclosure as review", () => {
  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {
      policyDisclosureSummary: {
        privacyPolicyPresent: true,
        privacyPolicyTextCharacterCount: 3200,
        privacyPolicyUrls: ["https://example.test/privacy"],
        retainedPrivacyPolicyTextExcerpt: "Privacy Policy. We describe controller contact, purposes, lawful basis, recipients, retention, and rights."
      }
    },
    snapshot: {
      privacy_policy_present: true
    }
  });

  assert.equal(outcomes.international_transfers_disclosure?.status, "Not confirmed");
  assert.equal(
    outcomes.international_transfers_disclosure?.criticalEvidence.retainedEvidence.signalObserved,
    "not_confirmed_row_specific_extraction"
  );
});

test("deriveGdprEprivacyCoveragePolicyOutcomes treats essential-only first-layer control as reject option observed", () => {
  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {
      consentSurfaceObserved: true,
      rejectPathDepthAndAvailability: {
        completeRejectPathAvailable: true,
        firstLayerConsentChoices: {
          acceptControlObserved: true,
          capturedBeforeInteraction: true,
          layerInspected: "first_layer",
          rejectControlObserved: true,
          visibleChoiceLabels: ["Accept All", "Essential Cookies Only", "Show Purposes"]
        },
        layerInspected: "first_layer",
        rejectAvailableOnFirstLayer: true
      }
    },
    snapshot: {
      cookie_banner_present: true
    }
  });

  assert.equal(outcomes.reject_all_path_availability?.status, "Observed");
  assert.match(outcomes.reject_all_path_availability?.evidenceRefs.join(" "), /Essential Cookies Only/);
});

test("deriveGdprEprivacyCoveragePolicyOutcomes treats canonical multilingual options controls as observed", () => {
  const labels = [
    ["Cookie settings", "cookie settings", "en"],
    ["Manage preferences", "manage preferences", "en"],
    ["Cookie-Einstellungen", "cookie-einstellungen", "de"],
    ["Einstellungen", "einstellungen", "de"],
    ["Paramètres", "paramètres", "fr"],
    ["Gérer mes choix", "gérer mes choix", "fr"]
  ] as const;

  for (const [label, matchedTerm, matchedLocale] of labels) {
    const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
      ...completedInputBase,
      runtimeArtifacts: {
        consentSurfaceObserved: true,
        rejectPathDepthAndAvailability: {
          firstLayerCookieConsentBannerObserved: true,
          firstLayerConsentChoices: {
            acceptControlObserved: true,
            capturedBeforeInteraction: true,
            controls: [{
              actionType: "manage_preferences",
              classifierReasonCodes: ["matched_options", "match_strength_direct", "context_satisfied"],
              label,
              matchedLocale,
              matchedTerm,
              matchStrength: "direct",
              visible: true
            }],
            layerInspected: "first_layer",
            managePreferencesControlObserved: true,
            visibleChoiceLabels: ["Accept All", label]
          },
          gdprEprivacyConsentSurfaceObserved: true,
          layerInspected: "first_layer"
        }
      },
      snapshot: {
        cookie_banner_present: true
      }
    });

    assert.equal(outcomes.options_settings_preferences_control?.status, "Observed", label);
    assert.equal(
      outcomes.options_settings_preferences_control?.criticalEvidence.retainedEvidence.optionsControlObserved,
      true,
      label
    );
    assert.match(outcomes.options_settings_preferences_control?.evidenceRefs.join(" ") ?? "", new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), label);
  }
});

test("deriveGdprEprivacyCoveragePolicyOutcomes does not infer options control from text-only labels", () => {
  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {
      consentSurfaceObserved: true,
      rejectPathDepthAndAvailability: {
        firstLayerCookieConsentBannerObserved: true,
        firstLayerConsentChoices: {
          capturedBeforeInteraction: true,
          layerInspected: "first_layer",
          visibleChoiceLabels: ["Accept All", "Cookie settings"]
        },
        gdprEprivacyConsentSurfaceObserved: true,
        layerInspected: "first_layer"
      }
    },
    snapshot: {
      cookie_banner_present: true
    }
  });

  assert.equal(outcomes.options_settings_preferences_control?.status, "Not observed");
  assert.equal(
    outcomes.options_settings_preferences_control?.criticalEvidence.retainedEvidence.optionsControlObserved,
    false
  );
});

test("deriveGdprEprivacyCoveragePolicyOutcomes treats canonical multilingual accept controls as observed", () => {
  const labels = [
    ["Accept", "accept", "en"],
    ["Accept all", "accept all", "en"],
    ["Allow all", "allow all", "en"],
    ["I agree", "i agree", "en"],
    ["Akzeptieren", "akzeptieren", "de"],
    ["Alle akzeptieren", "alle akzeptieren", "de"],
    ["Zustimmen", "zustimmen", "de"],
    ["Ich stimme zu", "ich stimme zu", "de"],
    ["Accepter", "accepter", "fr"],
    ["Tout accepter", "tout accepter", "fr"],
    ["J’accepte", "j’accepte", "fr"],
    ["Autoriser", "autoriser", "fr"]
  ] as const;

  for (const [label, matchedTerm, matchedLocale] of labels) {
    const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
      ...completedInputBase,
      runtimeArtifacts: {
        consentSurfaceObserved: true,
        rejectPathDepthAndAvailability: {
          firstLayerCookieConsentBannerObserved: true,
          firstLayerConsentChoices: {
            capturedBeforeInteraction: true,
            controls: [{
              actionType: "accept_all",
              classifierReasonCodes: ["matched_accept", "match_strength_direct", "context_satisfied"],
              label,
              matchedLocale,
              matchedTerm,
              matchStrength: "direct",
              visible: true
            }],
            layerInspected: "first_layer",
            visibleChoiceLabels: [label, "Cookie settings"]
          },
          gdprEprivacyConsentSurfaceObserved: true,
          layerInspected: "first_layer"
        }
      },
      snapshot: {
        cookie_banner_present: true
      }
    });

    assert.equal(outcomes.accept_consent_control?.status, "Observed", label);
    assert.equal(
      outcomes.accept_consent_control?.criticalEvidence.retainedEvidence.acceptControlObserved,
      true,
      label
    );
    assert.match(outcomes.accept_consent_control?.evidenceRefs.join(" ") ?? "", new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), label);
  }
});

test("deriveGdprEprivacyCoveragePolicyOutcomes does not infer accept control from text-only labels", () => {
  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {
      consentSurfaceObserved: true,
      rejectPathDepthAndAvailability: {
        firstLayerCookieConsentBannerObserved: true,
        firstLayerConsentChoices: {
          capturedBeforeInteraction: true,
          layerInspected: "first_layer",
          visibleChoiceLabels: ["Accept", "Cookie settings"]
        },
        gdprEprivacyConsentSurfaceObserved: true,
        layerInspected: "first_layer"
      }
    },
    snapshot: {
      cookie_banner_present: true
    }
  });

  assert.equal(outcomes.accept_consent_control?.status, "Not observed");
  assert.equal(
    outcomes.accept_consent_control?.criticalEvidence.retainedEvidence.acceptControlObserved,
    false
  );
});

test("deriveGdprEprivacyCoveragePolicyOutcomes does not infer accept control from unrelated structured text", () => {
  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {
      consentSurfaceObserved: true,
      rejectPathDepthAndAvailability: {
        firstLayerCookieConsentBannerObserved: true,
        firstLayerConsentChoices: {
          capturedBeforeInteraction: true,
          controls: [{
            actionType: "other",
            label: "Accept",
            visible: true
          }],
          layerInspected: "first_layer",
          visibleChoiceLabels: ["Accept"]
        },
        gdprEprivacyConsentSurfaceObserved: true,
        layerInspected: "first_layer"
      }
    },
    snapshot: {
      cookie_banner_present: true
    }
  });

  assert.notEqual(outcomes.accept_consent_control?.status, "Observed");
  assert.equal(
    outcomes.accept_consent_control?.criticalEvidence.retainedEvidence.acceptControlObserved,
    false
  );
});

test("deriveGdprEprivacyCoveragePolicyOutcomes treats thin policy extraction as coverage limited", () => {
  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {
      policyDisclosureSummary: {
        privacyPolicyPresent: true,
        privacyPolicyTextCharacterCount: 120,
        privacyPolicyUrls: ["https://example.test/privacy"],
        processingErrorObserved: true,
        retainedPrivacyPolicyTextExcerpt: "Privacy center processing error."
      }
    },
    snapshot: {
      privacy_policy_present: true
    }
  });

  assert.equal(outcomes.privacy_notice_availability?.status, "Observed");
  assert.equal(outcomes.policy_text_extraction?.status, "Not testable");
  assert.equal(outcomes.legal_basis_disclosure_observed?.status, "Not confirmed");
  assert.equal(outcomes.retention_disclosure_observed?.status, "Not confirmed");
  assert.equal(outcomes.legal_basis_disclosure_observed?.criticalEvidence.retainedEvidence.signalObserved, "not_confirmed_extraction_limited");
  assert.equal(
    (outcomes.policy_text_extraction?.criticalEvidence.retainedEvidence.policyTextExtractionHealth as Record<string, unknown>)?.policyTextExtractionStatus,
    "errored"
  );
  assert.match(outcomes.legal_basis_disclosure_observed?.limitation ?? "", /did not extract enough usable policy text/i);
});

test("deriveGdprEprivacyCoveragePolicyOutcomes lets strong section-targeted evidence override global extraction errors", () => {
  const sectionEvidence = [
    {
      coverageArea: "controller_contact",
      evidenceSource: "deterministic",
      selectedEvidenceStrength: "strong",
      selectedPolicySectionExcerpt: "Controller/contact. NVIDIA Corporation is the data controller for this privacy notice. You can contact our privacy team at privacy@nvidia.com with questions about this policy.",
      selectedPolicySectionHeading: "Controller/contact",
      selectedPolicySectionUrl: "https://www.nvidia.com/privacy",
      signalObserved: "observed"
    },
    {
      coverageArea: "processing_purposes",
      evidenceSource: "deterministic",
      selectedEvidenceStrength: "strong",
      selectedPolicySectionExcerpt: "How we use personal data. We use personal information to provide our services, process orders, maintain account security, personalize experiences, measure performance, and prevent fraud.",
      selectedPolicySectionHeading: "How we use personal data",
      selectedPolicySectionUrl: "https://www.nvidia.com/privacy",
      signalObserved: "observed"
    },
    {
      coverageArea: "legal_basis",
      evidenceSource: "deterministic",
      selectedEvidenceStrength: "moderate",
      selectedPolicySectionExcerpt: "Legal basis. We process personal data with your consent, when necessary to perform a contract, for our legitimate interests, and when required to comply with legal obligations.",
      selectedPolicySectionHeading: "Legal basis",
      selectedPolicySectionUrl: "https://www.nvidia.com/privacy",
      signalObserved: "observed"
    },
    {
      coverageArea: "recipients_or_vendor_categories",
      evidenceSource: "deterministic",
      selectedEvidenceStrength: "strong",
      selectedPolicySectionExcerpt: "How we share information. We share personal data with service providers, processors, vendors, affiliates, business partners, and other third parties that help deliver our services.",
      selectedPolicySectionHeading: "How we share information",
      selectedPolicySectionUrl: "https://www.nvidia.com/privacy",
      signalObserved: "observed"
    },
    {
      coverageArea: "data_retention",
      evidenceSource: "deterministic",
      selectedEvidenceStrength: "strong",
      selectedPolicySectionExcerpt: "Data Retention. We retain personal data for as long as necessary to provide services and meet legal requirements. We erase or delete data when it is no longer needed or after there is no engagement period.",
      selectedPolicySectionHeading: "Data Retention",
      selectedPolicySectionUrl: "https://www.nvidia.com/privacy",
      signalObserved: "observed"
    },
    {
      coverageArea: "data_subject_rights",
      evidenceSource: "deterministic",
      selectedEvidenceStrength: "strong",
      selectedPolicySectionExcerpt: "Your privacy rights. Depending on where you live, you may see personal data we hold, take it with you, request corrections, withdraw consent, opt out of certain processing, erase information, and exercise privacy rights.",
      selectedPolicySectionHeading: "Your privacy rights",
      selectedPolicySectionUrl: "https://www.nvidia.com/privacy",
      signalObserved: "observed"
    },
    {
      coverageArea: "international_transfers",
      evidenceSource: "deterministic",
      selectedEvidenceStrength: "strong",
      selectedPolicySectionExcerpt: "International transfers. We may transfer personal data outside your country, including outside the EEA, and rely on standard contractual clauses, adequacy decisions, and other transfer safeguards.",
      selectedPolicySectionHeading: "International transfers",
      selectedPolicySectionUrl: "https://www.nvidia.com/privacy",
      signalObserved: "observed"
    },
    {
      coverageArea: "dpo_contact",
      evidenceSource: "deterministic",
      selectedEvidenceStrength: "moderate",
      selectedPolicySectionExcerpt: "Data protection contact. You may contact our data protection officer or privacy office for questions about privacy or data protection requests.",
      selectedPolicySectionHeading: "Data protection contact",
      selectedPolicySectionUrl: "https://www.nvidia.com/privacy",
      signalObserved: "observed"
    },
    {
      coverageArea: "supervisory_authority",
      evidenceSource: "deterministic",
      selectedEvidenceStrength: "moderate",
      selectedPolicySectionExcerpt: "Complaints. You may lodge a complaint with your local data protection authority or supervisory authority if you have unresolved privacy concerns.",
      selectedPolicySectionHeading: "Complaints",
      selectedPolicySectionUrl: "https://www.nvidia.com/privacy",
      signalObserved: "observed"
    }
  ];

  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {
      policyDisclosureSummary: {
        policySectionCount: sectionEvidence.length,
        policyTextCoverageMode: "section_targeted",
        policyTextExtractionHealth: {
          extractedTextLength: 0,
          extractionFailureReason: "privacy_policy_text_processing_error",
          minimumTextLengthRequired: 2500,
          policySurfaceObserved: true,
          policyTextExtractionStatus: "errored",
          policyTextQuality: {
            codeSignalCount: 0,
            naturalLanguageSentenceCount: 24,
            usable: true
          },
          policyUrlRetained: true
        },
        privacyPolicyPresent: true,
        privacyPolicyTextCharacterCount: 0,
        privacyPolicyUrls: ["https://www.nvidia.com/privacy"],
        processingErrorObserved: true,
        retainedArticle13SectionEvidence: sectionEvidence,
        retainedPolicySections: sectionEvidence.map((evidence, index) => ({
          charEnd: (index + 1) * 500,
          charStart: index * 500,
          heading: evidence.selectedPolicySectionHeading,
          quality: "strong",
          sourceUrl: evidence.selectedPolicySectionUrl,
          textExcerpt: evidence.selectedPolicySectionExcerpt
        })),
        retainedPrivacyPolicyTextExcerpt: ""
      }
    },
    snapshot: {
      privacy_policy_present: true
    }
  });

  for (const rowId of [
    "controller_contact_disclosure",
    "processing_purposes_disclosure",
    "legal_basis_disclosure_observed",
    "recipients_vendor_categories_disclosure",
    "retention_disclosure_observed",
    "data_subject_rights_disclosure",
    "international_transfers_disclosure",
    "dpo_contact_point_disclosure",
    "supervisory_authority_complaint_disclosure"
  ]) {
    assert.equal(outcomes[rowId]?.status, "Observed", `${rowId} should be observed from strong section evidence`);
  }

  assert.equal(outcomes.policy_text_extraction?.status, "Review signal");
  assert.equal(
    outcomes.retention_disclosure_observed?.criticalEvidence.retainedEvidence.selectedPolicySectionHeading,
    "Data Retention"
  );
  assert.match(
    retainedArticle13Signal(outcomes.data_subject_rights_disclosure!)?.evidenceText ?? "",
    /take it with you/i
  );
});

test("deriveGdprEprivacyCoveragePolicyOutcomes rejects code/config excerpts as GDPR Transparency evidence", () => {
  const codePolicyText = ";this.gbar_={CONFIG:[[[0,\"www.gstatic.com\",null,\"0\"]]]};_.z=function(a,b){Object.defineProperties(a,b)};var rights=function(){return Object.keys({access:1,delete:1})}; Copyright The Closure Library; ".repeat(40);
  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {
      policyDisclosureSummary: {
        article13DisclosureSignals: [
          {
            confidence: 0.92,
            disclosureType: "data_subject_rights",
            evidenceText: ":!!b};_.z=function(a,b){Object.defineProperties(a,b)}; rights Object access delete export",
            source: "deterministic",
            status: "observed"
          }
        ],
        policyTextExtractionHealth: {
          extractedTextLength: codePolicyText.length,
          minimumTextLengthRequired: 2500,
          policySurfaceObserved: true,
          policyTextExtractionStatus: "ok",
          policyUrlRetained: true
        },
        privacyPolicyPresent: true,
        privacyPolicyTextCharacterCount: codePolicyText.length,
        privacyPolicyUrls: ["https://policies.example.test/privacy"],
        retainedPrivacyPolicyTextExcerpt: codePolicyText
      }
    },
    snapshot: {
      privacy_policy_present: true
    }
  });

  assert.equal(outcomes.privacy_notice_availability?.status, "Observed");
  assert.equal(outcomes.data_subject_rights_disclosure?.status, "Not confirmed");
  assert.equal(
    outcomes.data_subject_rights_disclosure?.criticalEvidence.retainedEvidence.signalObserved,
    "not_confirmed_extraction_limited"
  );
  assert.match(outcomes.data_subject_rights_disclosure?.limitation ?? "", /low-quality or non-policy content/i);
});

test("deriveGdprEprivacyCoveragePolicyOutcomes credits Google-like mature policy disclosures without domain-specific rules", () => {
  const policyText = [
    "Privacy Policy Privacy & Terms Overview Terms of Service Technologies FAQ Introduction Privacy & Terms Overview FAQ",
    "We use personal information to provide our services, maintain and improve them, develop new services, and personalize content, ads, and tailored search results.",
    "Legal basis. We process information with your consent, when necessary for performance of a contract, for legitimate interests, and when required by law.",
    "Retaining your information. We retain the data we collect for different periods depending on what it is, how we use it, and how you configure your settings. Some data is deleted or anonymized automatically. Server logs and cookie information may have retention periods.",
    "Your privacy controls let you review and update information, export data with Google Takeout, delete your information, use My Activity, and request to remove content.",
    "Data transfers. We maintain servers around the world, and your information may be processed on servers located outside your country. We rely on legal frameworks relating to the transfer of data and work with local data protection authorities.",
    "You can contact Google about privacy questions, contact our data protection office, or contact a data protection officer where applicable. You may also contact your local data protection authority or supervisory authority to make a complaint.",
    "Automated systems and algorithms help recognize patterns, detect abuse, personalize ads, and provide tailored search results."
  ].join(" ");

  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {
      policyDisclosureSummary: {
        privacyPolicyPresent: true,
        privacyPolicyTextCharacterCount: 7139,
        privacyPolicyUrls: ["https://policies.google.com/privacy?hl=en-IE&fg=1"],
        retainedPrivacyPolicyTextExcerpt: policyText
      }
    },
    snapshot: {
      privacy_policy_present: true
    }
  });

  assert.equal(outcomes.processing_purposes_disclosure?.status, "Observed");
  assert.equal(outcomes.legal_basis_disclosure_observed?.status, "Observed");
  assert.equal(outcomes.retention_disclosure_observed?.status, "Observed");
  assert.equal(outcomes.data_subject_rights_disclosure?.status, "Observed");
  assert.equal(outcomes.international_transfers_disclosure?.status, "Observed");
  assert.equal(outcomes.dpo_contact_point_disclosure?.status, "Observed");
  assert.equal(outcomes.supervisory_authority_complaint_disclosure?.status, "Observed");
  assert.equal(outcomes.automated_decision_making_profiling_disclosure?.status, "Review signal");

  const controllerText = retainedArticle13Signal(outcomes.controller_contact_disclosure!)?.evidenceText ?? "";
  const retentionText = retainedArticle13Signal(outcomes.retention_disclosure_observed!)?.evidenceText ?? "";
  const transferText = retainedArticle13Signal(outcomes.international_transfers_disclosure!)?.evidenceText ?? "";
  const automatedText = retainedArticle13Signal(outcomes.automated_decision_making_profiling_disclosure!)?.evidenceText ?? "";
  assert.match(controllerText, /contact Google about privacy questions/i);
  assert.doesNotMatch(controllerText, /^Privacy Policy Privacy & Terms/i);
  assert.match(retentionText, /Retaining your information/i);
  assert.doesNotMatch(retentionText, /^Privacy Policy Privacy & Terms/i);
  assert.match(transferText, /Data transfers/i);
  assert.doesNotMatch(transferText, /^Privacy Policy Privacy & Terms/i);
  assert.match(automatedText, /Automated systems and algorithms/i);
  assert.equal(
    outcomes.automated_decision_making_profiling_disclosure?.criticalEvidence.retainedEvidence.signalObserved,
    "partial_automated_processing_without_article22_disclosure"
  );
});

test("deriveGdprEprivacyCoveragePolicyOutcomes treats substantial retained policy matcher misses as not confirmed", () => {
  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {
      policyDisclosureSummary: {
        privacyPolicyPresent: true,
        privacyPolicyTextCharacterCount: 4200,
        privacyPolicyUrls: ["https://example.test/privacy"],
        retainedPrivacyPolicyTextExcerpt:
          "Privacy notice. We explain how users can contact us and how our service works. ".repeat(60)
      }
    },
    snapshot: {
      privacy_policy_present: true
    }
  });

  assert.equal(outcomes.legal_basis_disclosure_observed?.status, "Not confirmed");
  assert.equal(outcomes.retention_disclosure_observed?.status, "Not confirmed");
  assert.equal(
    outcomes.legal_basis_disclosure_observed?.criticalEvidence.retainedEvidence.signalObserved,
    "not_confirmed_row_specific_extraction"
  );
  assert.match(
    outcomes.legal_basis_disclosure_observed?.limitation ?? "",
    /row-specific disclosure was not confidently extracted/i
  );
});

test("deriveGdprEprivacyCoveragePolicyOutcomes rejects controller/contact page chrome excerpts", () => {
  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {
      policyDisclosureSummary: {
        article13DisclosureSignals: [
          {
            disclosureType: "controller_contact",
            evidenceText:
              "Privacy Policy Privacy & Terms Google Privacy & Terms Overview Terms of Service Technologies FAQ Contact Google Privacy Policy",
            source: "deterministic",
            status: "observed"
          }
        ],
        privacyPolicyPresent: true,
        privacyPolicyTextCharacterCount: 4200,
        privacyPolicyUrls: ["https://policies.example.test/privacy"],
        retainedPrivacyPolicyTextExcerpt:
          "Privacy Policy Privacy & Terms Overview Terms of Service Technologies FAQ Introduction Google Account Help. ".repeat(50)
      }
    },
    snapshot: {
      privacy_policy_present: true
    }
  });

  assert.equal(outcomes.controller_contact_disclosure?.status, "Not confirmed");
  assert.equal(
    outcomes.controller_contact_disclosure?.criticalEvidence.retainedEvidence.signalObserved,
    "not_confirmed_row_specific_extraction"
  );
  assert.notEqual(
    retainedArticle13Signal(outcomes.controller_contact_disclosure!)?.evidenceText,
    "Privacy Policy Privacy & Terms Google Privacy & Terms Overview Terms of Service Technologies FAQ Contact Google Privacy Policy"
  );
});

test("deriveGdprEprivacyCoveragePolicyOutcomes does not treat a retention TOC heading as observed", () => {
  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {
      policyDisclosureSummary: {
        privacyPolicyPresent: true,
        privacyPolicyTextCharacterCount: 4200,
        privacyPolicyUrls: ["https://policies.example.test/privacy"],
        retainedPrivacyPolicyTextExcerpt: [
          "Privacy Policy Privacy & Terms Overview Terms of Service Technologies FAQ.",
          "Retaining your information Information Google collects Why Google collects data Your privacy controls Sharing your information Keeping your information secure."
        ].join(" ")
      }
    },
    snapshot: {
      privacy_policy_present: true
    }
  });

  assert.equal(outcomes.retention_disclosure_observed?.status, "Not confirmed");
  assert.equal(
    outcomes.retention_disclosure_observed?.criticalEvidence.retainedEvidence.signalObserved,
    "not_confirmed_row_specific_extraction"
  );
});

test("deriveGdprEprivacyCoveragePolicyOutcomes prefers substantive policy excerpts over boilerplate", () => {
  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {
      policyDisclosureSummary: {
        privacyPolicyPresent: true,
        privacyPolicyTextCharacterCount: 3800,
        privacyPolicyUrls: ["https://example.test/privacy"],
        retainedPrivacyPolicyTextExcerpt: [
          "Privacy & Terms Privacy Policy Overview Technologies FAQ Terms of Service Retention Privacy & Terms Overview FAQ.",
          "Retaining your information. We retain the data we collect only for as long as necessary for the purposes described in this notice, unless a longer retention period is required by law."
        ].join(" ")
      }
    },
    snapshot: {
      privacy_policy_present: true
    }
  });

  const retentionText = retainedArticle13Signal(outcomes.retention_disclosure_observed!)?.evidenceText ?? "";
  assert.equal(outcomes.retention_disclosure_observed?.status, "Observed");
  assert.match(retentionText, /Retaining your information/i);
  assert.doesNotMatch(retentionText, /^Privacy & Terms Privacy Policy Overview/i);
});

test("deriveGdprEprivacyCoveragePolicyOutcomes does not emit runtime vendor disclosure alignment for thin policy evidence", () => {
  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {
      policyDisclosureSummary: {
        privacyPolicyPresent: true,
        privacyPolicyTextCharacterCount: 120,
        privacyPolicyUrls: ["https://example.test/privacy"],
        processingErrorObserved: true,
        retainedPrivacyPolicyTextExcerpt: "Privacy center processing error."
      }
    },
    snapshot: {
      privacy_policy_present: true,
      tracker_vendor_count: 3
    }
  });

  assert.equal(outcomes.runtime_vendor_disclosure_alignment, undefined);
});

test("deriveGdprEprivacyCoveragePolicyOutcomes does not let stale no-document events override retained policy summary", () => {
  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    events: [
      {
        eventType: "signals.nano_doc_enrichment_completed",
        metadataJson: {
          documentSourceCount: 0,
          freshExtractionCharacterCount: 0,
          policyDocumentCount: 0,
          policyEnrichmentCount: 0
        }
      }
    ],
    runtimeArtifacts: {
      policyDisclosureSummary: {
        privacyPolicyPresent: true,
        privacyPolicyTextCharacterCount: 4200,
        privacyPolicyUrls: ["https://example.test/privacy"],
        retainedPrivacyPolicyTextExcerpt: "Privacy Policy. We disclose vendors and service providers."
      }
    },
    snapshot: {
      tracker_vendor_count: 3
    }
  });

  assert.equal(outcomes.runtime_vendor_disclosure_alignment, undefined);
});

test("deriveGdprEprivacyCoveragePolicyOutcomes treats retained consent and runtime observations as row-specific coverage", () => {
  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    events: [
      {
        eventType: "runtime.build_phase_diagnostic",
        metadataJson: {
          phase: "hybrid_auto_local_evidence",
          status: "ok"
        }
      },
      {
        eventType: "runtime.build_phase_diagnostic",
        metadataJson: {
          consentInteractionSkipNegativeReasonCodes: ["complete_reject_choice_controls_not_detected"],
          phase: "consent_audit_entry",
          shouldAttemptConsentAudit: true,
          shouldSkipConsentInteractionAudit: false,
          status: "ok"
        }
      },
      {
        eventType: "runtime.build_phase_diagnostic",
        metadataJson: {
          negativeReasonCodes: ["reject_interaction_not_confirmed", "post_reject_timing_window_missing"],
          phase: "reject_persistence_diagnostic",
          rejectInteractionSucceeded: false,
          shouldAttemptConsentAudit: true,
          status: "ok"
        }
      },
      {
        eventType: "runtime.build_phase_diagnostic",
        metadataJson: {
          eligibleSensitiveFieldCount: 0,
          phase: "sensitive_third_party_tracking_correlation",
          status: "ok"
        }
      }
    ],
    runtimeArtifacts: {
      hybridRuntimeEvidence: {
        networkSummary: {
          thirdPartyDomainCount: 7
        },
        storageSummary: {
          cookiesBeforeConsentCount: 4,
          cookiesSeenCount: 6
        }
      }
    },
    snapshot: {
      consent_interaction_model: "preferences_only",
      consent_preferences_button_count: 5,
      consent_reject_button_count: 0,
      cookie_count_total: 4,
      first_party_cookie_set_before_consent: true,
      form_count_total: 2,
      privacy_policy_present: false,
      session_replay_tool_detected: false,
      session_replay_tracker_count: 0,
      third_party_script_domain_count: 6,
      tracker_vendor_count: 3
    }
  });

  assert.equal(outcomes.pre_consent_cookies_storage?.status, "Observed");
  assert.match(outcomes.pre_consent_cookies_storage?.limitation ?? "", /observed runtime signal/i);
  assert.equal(outcomes.reject_all_path_availability?.status, "Insufficient evidence");
  assert.match(outcomes.reject_all_path_availability?.limitation ?? "", /complete reject-all control/i);
  assert.equal(outcomes.post_reject_tracking_reduction?.status, "Not testable");
  assert.match(outcomes.post_reject_tracking_reduction?.limitation ?? "", /deferred from the current production core scanner/i);
  assert.equal(outcomes.runtime_vendor_disclosure_alignment, undefined);
  assert.equal(outcomes.sensitive_surfaces_third_party_tracking?.status, "Not observed");
  assert.equal(outcomes.session_replay_fingerprinting_review?.status, "Not observed");
  assert.equal(outcomes.cross_border_endpoint_review?.status, "Not testable");
  assert.match(outcomes.cross_border_endpoint_review?.limitation ?? "", /jurisdiction or transfer-region evidence/i);
});

test("deriveGdprEprivacyCoveragePolicyOutcomes keeps concrete pre-consent tracker evidence at review when no finding projects", () => {
  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {
      consent_baseline_tracker_evidence_urls: ["https://www.googletagmanager.com/gtm.js?id=GTM-123"],
      consent_baseline_tracker_vendor_names: ["Google Tag Manager"]
    },
    snapshot: {
      preconsent_tracking_detected: true,
      tracker_vendor_count: 1
    }
  });

  assert.equal(outcomes.pre_consent_third_party_tracking?.status, "Review signal");
  assert.equal(
    outcomes.pre_consent_third_party_tracking?.criticalEvidence.retainedEvidence.concreteTrackerEvidenceRetained,
    true
  );
  assert.deepEqual(outcomes.pre_consent_third_party_tracking?.criticalEvidence.missingOrIncompleteSourceSignals, []);
});

test("deriveGdprEprivacyCoveragePolicyOutcomes retains elapsed ms for pre-consent cookie and tracking observations", () => {
  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {
      consent_baseline_tracker_evidence_urls: ["https://analytics.example.test/collect"],
      consent_baseline_tracker_vendor_names: ["Example Analytics"],
      hybridRuntimeEvidence: {
        cookieWriteObservations: [
          {
            beforeConsent: true,
            cookieName: "_ga",
            domain: ".example.test",
            setAtMs: -1,
            timingEvidence: "before_consent_cookie_write"
          }
        ],
        networkSummary: {
          preConsentThirdPartyRequestCount: 1
        },
        requestObservations: [
          {
            domain: "analytics.example.test",
            thirdParty: true,
            tsMs: 1_000_478
          }
        ],
        storageSummary: {
          cookiesBeforeConsentCount: 1,
          cookiesSeenCount: 1
        },
        timelineMarkers: {
          firstCookieSeenMs: 1_000_006,
          firstThirdPartyRequestMs: 1_000_478,
          navigationStartMs: 1_000_000
        }
      }
    },
    snapshot: {
      preconsent_tracking_detected: true
    }
  });

  assert.equal(
    outcomes.pre_consent_cookies_storage?.criticalEvidence.retainedEvidence.firstPreconsentCookieOrStorageObservedMs,
    6
  );
  assert.equal(
    outcomes.pre_consent_cookies_storage?.criticalEvidence.retainedEvidence.preconsentCookieOrStorageExactTimingRetained,
    true
  );
  assert.match(
    outcomes.pre_consent_cookies_storage?.evidenceRefs.join(" ") ?? "",
    /0.00600s after scan start/
  );
  assert.equal(
    outcomes.pre_consent_third_party_tracking?.criticalEvidence.retainedEvidence.firstPreconsentThirdPartyTrackingObservedMs,
    478
  );
  assert.match(
    outcomes.pre_consent_third_party_tracking?.evidenceRefs.join(" ") ?? "",
    /0.478s after scan start/
  );
});

test("deriveGdprEprivacyCoveragePolicyOutcomes keeps weak pre-consent tracking signals as insufficient evidence", () => {
  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    snapshot: {
      preconsent_tracking_detected: true
    }
  });

  assert.equal(outcomes.pre_consent_third_party_tracking?.status, "Insufficient evidence");
  assert.equal(
    outcomes.pre_consent_third_party_tracking?.criticalEvidence.retainedEvidence.concreteTrackerEvidenceRetained,
    false
  );
  assert.match(
    outcomes.pre_consent_third_party_tracking?.criticalEvidence.missingOrIncompleteSourceSignals[0]?.field ?? "",
    /preConsentTrackingFinding/
  );
});

test("deriveGdprEprivacyCoveragePolicyOutcomes marks retained consent surfaces as observed", () => {
  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {
      hybridRuntimeEvidence: {
        firstLayerConsentChoices: {
          capturedBeforeInteraction: true,
          visibleChoiceLabels: ["Accept", "Decline"]
        },
        consentUiPathEvidence: {
          layerInspected: "first_layer"
        }
      },
      rejectPathDepthAndAvailability: {
        firstLayerCookieConsentBannerObserved: true,
        firstLayerConsentChoices: {
          visibleChoiceLabels: ["Accept", "Decline"]
        },
        gdprEprivacyConsentSurfaceObserved: true,
        layerInspected: "first_layer",
        rejectAvailableOnFirstLayer: true
      }
    },
    snapshot: {
      cookie_banner_present: true
    }
  });

  assert.equal(outcomes.consent_surface_observed?.status, "Observed");
  assert.deepEqual(outcomes.consent_surface_observed?.evidenceRefs, [
    "Evidence: retained consent surface observation",
    "Visible choice: Accept",
    "Visible choice: Decline",
    "Layer inspected: first_layer"
  ]);
  assert.equal(outcomes.reject_all_path_availability?.status, "Observed");
  assert.equal(outcomes.consent_choice_quality?.status, "Review signal");
  assert.equal(outcomes.consent_choice_quality?.criticalEvidence.retainedEvidence.firstLayerCookieConsentBannerObserved, true);
  assert.deepEqual(outcomes.consent_choice_quality?.criticalEvidence.retainedEvidence.visibleChoiceLabels, ["Accept", "Decline"]);
  assert.match(outcomes.consent_choice_quality?.limitation ?? "", /Basic same-layer Accept and Decline controls were observed/i);
  assert.deepEqual(
    outcomes.consent_choice_quality?.criticalEvidence.retainedEvidence.missingEvidenceNeeded,
    [
      "cookie preference center or manage/preferences/settings control",
      "purpose or cookie-category choices",
      "vendor-level choices when applicable",
      "default toggle state evidence",
      "non-essential defaults observed off",
      "save or confirm choices control",
      "accept/reject visual parity evidence"
    ]
  );
});

test("deriveGdprEprivacyCoveragePolicyOutcomes treats complete no-surface inspection as authoritative", () => {
  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {
      consentSurfaceInspection: {
        coverageStatus: "complete",
        inspectedPreInteraction: true,
        inspectionCompleted: true,
        outcome: "no_surface_observed_complete_coverage",
        observedAtMs: 6400
      },
      consentSurfaceObserved: true
    },
    snapshot: {
      cookie_banner_present: true
    }
  });

  assert.equal(outcomes.consent_surface_observed?.status, "Not observed");
  assert.equal(
    outcomes.consent_surface_observed?.criticalEvidence.retainedEvidence.consentSurfaceObserved,
    false
  );
});

test("deriveGdprEprivacyCoveragePolicyOutcomes does not turn an incomplete consent inventory into missing-control findings", () => {
  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {
      cmpFrameworkSignalObserved: true,
      consentSurfaceInspection: {
        coverageStatus: "partial",
        inspectedPreInteraction: true,
        inspectionCompleted: false,
        outcome: "inspection_incomplete",
        limitationKeys: ["consent_ui_capture_timeout"]
      },
      consentSurfaceObserved: true,
      hybridRuntimeEvidence: {
        firstLayerConsentChoices: {
          acceptControlObserved: false,
          actionableControlInventoryRetained: false,
          controls: [],
          managePreferencesControlObserved: false,
          rejectControlObserved: false,
          visibleChoiceLabels: []
        },
        networkSummary: {
          preConsentThirdPartyRequestCount: 12
        }
      }
    },
    snapshot: {
      cmp_vendor_name: "OneTrust",
      third_party_request_count: 12
    }
  });

  for (const rowId of [
    "accept_consent_control",
    "options_settings_preferences_control",
    "reject_all_path_availability"
  ]) {
    assert.equal(outcomes[rowId]?.status, "Not testable", rowId);
    assert.match(outcomes[rowId]?.limitation ?? "", /inspection did not complete/i, rowId);
    assert.equal(
      outcomes[rowId]?.criticalEvidence.missingOrIncompleteSourceSignals[0]?.field,
      "runtimeArtifacts.consentSurfaceInspection.inspectionCompleted",
      rowId
    );
  }
});

test("deriveGdprEprivacyCoveragePolicyOutcomes preserves positive controls despite partial consent coverage", () => {
  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {
      consentSurfaceInspection: {
        coverageStatus: "partial",
        inspectedPreInteraction: true,
        inspectionCompleted: false,
        outcome: "inspection_incomplete"
      },
      hybridRuntimeEvidence: {
        firstLayerConsentChoices: {
          acceptControlObserved: true,
          actionableControlInventoryRetained: true,
          controls: [
            { actionType: "accept_all", label: "Accept All", matchedTerm: "accept all" },
            { actionType: "manage_preferences", label: "Show Purposes", matchedTerm: "show purposes" }
          ],
          layerInspected: "first_layer",
          managePreferencesControlObserved: true,
          rejectControlObserved: false,
          visibleChoiceLabels: ["Accept All", "Show Purposes"]
        }
      },
      rejectPathDepthAndAvailability: {
        firstLayerCookieConsentBannerObserved: true,
        firstLayerConsentChoices: {
          controls: [
            { actionType: "accept_all", label: "Accept All", matchedTerm: "accept all" },
            { actionType: "manage_preferences", label: "Show Purposes", matchedTerm: "show purposes" }
          ],
          layerInspected: "first_layer",
          visibleChoiceLabels: ["Accept All", "Show Purposes"]
        }
      }
    },
    snapshot: {
      cookie_banner_present: true
    }
  });

  assert.equal(outcomes.accept_consent_control?.status, "Observed");
  assert.equal(outcomes.options_settings_preferences_control?.status, "Observed");
  assert.equal(outcomes.reject_all_path_availability?.status, "Not testable");
});

test("deriveGdprEprivacyCoveragePolicyOutcomes confirms simple cookie notices despite stale unknown-purpose demotion", () => {
  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {
      hybridRuntimeEvidence: {
        consentSummary: {
          bannerPresent: true,
          bannerTextSnippet: "This website uses cookies. For more information, review our Privacy & Legal Notice."
        },
        consentUiPathEvidence: {
          consentSurfaceContaminationDetected: true,
          consentSurfaceDemotionReasons: ["surface_purpose_unknown"],
          firstLayerCookieConsentBannerObserved: false,
          gdprEprivacyConsentSurfaceObserved: "unconfirmed",
          layerInspected: "first_layer"
        },
        consentControlLifecycleEvidence: {
          coverageStatus: "usable",
          footerLinksInspected: [
            "This website uses cookies. For more information, review our Privacy & Legal Notice. Questions? Please email privacy@example.edu. More info Accept Decline Cookie"
          ],
          initialConsentLayerObserved: true
        },
        firstLayerConsentChoices: {
          capturedBeforeInteraction: true,
          visibleChoiceLabels: ["accept", "decline"]
        }
      },
      rejectPathDepthAndAvailability: {
        consentSurfaceContaminationDetected: true,
        consentSurfaceDemotionReasons: ["surface_purpose_unknown"],
        firstLayerCookieConsentBannerObserved: false,
        firstLayerConsentChoices: {
          visibleChoiceLabels: ["accept", "decline"]
        },
        gdprEprivacyConsentSurfaceObserved: "unconfirmed",
        layerInspected: "first_layer"
      }
    },
    snapshot: {
      cookie_banner_present: true
    }
  });

  assert.equal(outcomes.consent_surface_observed?.status, "Observed");
  assert.equal(
    outcomes.consent_surface_observed?.limitation,
    "A first-layer cookie notice was observed with actionable Accept and Decline controls."
  );
  assert.equal(outcomes.consent_surface_observed?.criticalEvidence.retainedEvidence.firstLayerCookieConsentBannerObserved, true);
  assert.equal(outcomes.consent_surface_observed?.criticalEvidence.retainedEvidence.gdprEprivacyConsentSurfaceObserved, true);
  assert.equal(outcomes.consent_surface_observed?.criticalEvidence.retainedEvidence.consentSurfaceContaminationDetected, false);
  assert.deepEqual(outcomes.consent_surface_observed?.criticalEvidence.retainedEvidence.consentSurfaceDecisionStates, [
    "first_layer_cookie_notice_observed"
  ]);
  assert.equal(outcomes.consent_surface_observed?.criticalEvidence.retainedEvidence.surfacePurpose, "cookie_consent");
  assert.deepEqual(outcomes.consent_surface_observed?.criticalEvidence.retainedEvidence.visibleChoiceLabels, ["accept", "decline"]);
  assert.equal(outcomes.reject_all_path_availability?.status, "Observed");
  assert.equal(
    outcomes.reject_all_path_availability?.limitation,
    "A Decline control was observed on the same first-layer cookie notice as Accept."
  );
  assert.equal(outcomes.consent_choice_quality?.status, "Review signal");
  assert.match(outcomes.consent_choice_quality?.limitation ?? "", /Basic same-layer Accept and Decline controls were observed/i);
});

test("deriveGdprEprivacyCoveragePolicyOutcomes reconciles retained first-layer consent path labels with stale demotion fields", () => {
  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {
      consent_actionable_choice_observed: true,
      consent_reject_interaction_succeeded: true,
      consent_surface_observed: true,
      hybridRuntimeEvidence: {
        consentSurfaceObserved: true,
        consentUiPathEvidence: {
          acceptClickDepth: 1,
          acceptLabels: ["Accept Optional Cookies"],
          consentSurfaceContaminationDetected: true,
          consentSurfaceDemotionReasons: [
            "no_confirmed_actionable_cookie_consent_surface",
            "deeper_layer_not_first_layer"
          ],
          firstLayerCookieConsentBannerObserved: false,
          gdprEprivacyConsentSurfaceObserved: "unconfirmed",
          layerInspected: "first_layer",
          preferenceLabels: ["Customize Cookies"],
          rejectAvailableOnFirstLayer: true,
          rejectClickDepth: 1,
          rejectLabels: ["Reject Optional Cookies"]
        },
        firstLayerConsentChoices: {
          acceptVisibleOnFirstLayer: false,
          capturedBeforeInteraction: true,
          rejectVisibleOnFirstLayer: false,
          settingsVisibleOnFirstLayer: true,
          visibleChoiceLabels: ["Customize Cookies"]
        }
      },
      rejectPathDepthAndAvailability: {
        availability: "available",
        bannerLayerInspected: true,
        completeRejectPathAvailable: true,
        completeRejectPathDetected: true,
        consentSurfaceContaminationDetected: true,
        consentSurfaceDemotionReasons: [
          "no_confirmed_actionable_cookie_consent_surface",
          "deeper_layer_not_first_layer"
        ],
        evidenceRefs: ["Accept Optional Cookies", "Customize Cookies", "Reject Optional Cookies"],
        firstLayerCookieConsentBannerObserved: false,
        firstLayerConsentChoices: {
          acceptVisibleOnFirstLayer: false,
          capturedBeforeInteraction: true,
          rejectVisibleOnFirstLayer: false,
          settingsVisibleOnFirstLayer: true,
          visibleChoiceLabels: ["Customize Cookies"]
        },
        gdprEprivacyConsentSurfaceObserved: "unconfirmed",
        layerInspected: "first_layer",
        rejectAvailableOnFirstLayer: true,
        rejectClickDepth: 1,
        rejectEquivalentFound: true,
        rejectInteractionSucceeded: true,
        rejectPathAvailabilityClassification: "reject_available_first_layer"
      }
    },
    snapshot: {
      accept_all_present: true,
      consent_mechanism_type: "cmp",
      cookie_banner_present: true,
      granular_preferences_present: true,
      reject_all_present: true
    }
  });

  assert.equal(outcomes.consent_surface_observed?.status, "Observed");
  assert.equal(outcomes.consent_surface_observed?.criticalEvidence.retainedEvidence.firstLayerCookieConsentBannerObserved, true);
  assert.equal(outcomes.reject_all_path_availability?.status, "Observed");
  assert.equal(outcomes.reject_all_path_availability?.criticalEvidence.retainedEvidence.rejectInteractionSucceeded, true);
  assert.equal(outcomes.consent_choice_quality?.status, "Not observed");
  assert.match(outcomes.consent_choice_quality?.limitation ?? "", /No obvious cookie-banner dark-pattern signal/i);
  assert.equal(outcomes.consent_choice_quality?.criticalEvidence.retainedEvidence.firstLayerCookieConsentBannerObserved, true);
  assert.equal(outcomes.consent_choice_quality?.criticalEvidence.retainedEvidence.acceptControlObserved, true);
  assert.equal(outcomes.consent_choice_quality?.criticalEvidence.retainedEvidence.rejectControlObserved, true);
  assert.equal(outcomes.consent_choice_quality?.criticalEvidence.retainedEvidence.sameLayerRejectObserved, true);
  assert.equal(outcomes.consent_choice_quality?.criticalEvidence.retainedEvidence.darkPatternSignalObserved, false);
  assert.deepEqual(outcomes.consent_choice_quality?.criticalEvidence.retainedEvidence.visibleChoiceLabels, [
    "Customize Cookies",
    "Accept Optional Cookies",
    "Reject Optional Cookies"
  ]);
});

test("deriveGdprEprivacyCoveragePolicyOutcomes preserves retained first-layer cookie consent despite later privacy-choice contamination", () => {
  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    events: [
      {
        eventType: "runtime.build_phase_diagnostic",
        metadataJson: {
          phase: "browser_runtime_capture",
          status: "ok"
        }
      }
    ],
    runtimeArtifacts: {
      hybridRuntimeEvidence: {
        consentControlLifecycleEvidence: {
          cmpReopenControlObserved: true,
          consentSurfaceContaminationDetected: true,
          consentSurfaceDemotionReasons: ["surface_purpose_sale_share_opt_out"],
          footerLinksInspected: [
            "Cookie Settings We and our third-party partners use cookies. NVIDIA Preference Center Cookie Policy Cookies Details Required Cookies Performance Cookies Personalization Cookies Advertising Cookies Powered by OneTrust."
          ],
          initialConsentLayerObserved: true,
          layerInspected: "footer_link",
          preferenceCenterReachableAfterInitialLayer: true,
          privacyControlPlacement: "footer",
          surfacePurpose: "sale_share_opt_out"
        }
      },
      rejectPathDepthAndAvailability: {
        consentSurfaceContaminationDetected: true,
        consentSurfaceDemotionReasons: ["surface_purpose_sale_share_opt_out"],
        firstLayerCookieConsentBannerObserved: false,
        firstLayerConsentChoices: {
          managePreferencesObserved: true,
          rejectControlObserved: true,
          rejectVisibleOnFirstLayer: true,
          visibleChoiceLabels: ["Manage Settings", "Reject Optional"]
        },
        gdprEprivacyConsentSurfaceObserved: "unconfirmed",
        layerInspected: "first_layer",
        rejectAvailableOnFirstLayer: true,
        rejectClickDepth: 1
      }
    },
    snapshot: {
      cookie_banner_present: false
    }
  });

  assert.equal(outcomes.consent_surface_observed?.status, "Observed");
  assert.equal(
    outcomes.consent_surface_observed?.limitation,
    "A first-layer cookie consent surface was retained with actionable choice or preference controls."
  );
  assert.equal(outcomes.consent_surface_observed?.criticalEvidence.retainedEvidence.firstLayerCookieConsentBannerObserved, true);
  assert.equal(outcomes.consent_surface_observed?.criticalEvidence.retainedEvidence.gdprEprivacyConsentSurfaceObserved, true);
  assert.equal(outcomes.consent_surface_observed?.criticalEvidence.retainedEvidence.consentSurfaceContaminationDetected, false);
  assert.equal(outcomes.consent_surface_observed?.criticalEvidence.retainedEvidence.surfacePurpose, "cookie_consent");
  assert.deepEqual(outcomes.consent_surface_observed?.criticalEvidence.retainedEvidence.visibleChoiceLabels, [
    "Manage Settings",
    "Reject Optional"
  ]);
  assert.equal(outcomes.reject_all_path_availability?.status, "Observed");
  assert.equal(outcomes.consent_choice_quality?.status, "Review signal");
  assert.equal(outcomes.consent_choice_quality?.criticalEvidence.retainedEvidence.firstLayerCookieConsentBannerObserved, true);
  assert.equal(outcomes.consent_choice_quality?.criticalEvidence.retainedEvidence.acceptControlObserved, false);
  assert.equal(outcomes.consent_choice_quality?.criticalEvidence.retainedEvidence.rejectControlObserved, true);
  assert.equal(outcomes.consent_choice_quality?.criticalEvidence.retainedEvidence.managePreferencesObserved, true);
  assert.match(outcomes.consent_choice_quality?.limitation ?? "", /did not confirm most choice-quality criteria/i);
});

test("deriveGdprEprivacyCoveragePolicyOutcomes classifies first-layer legal/privacy continue gates separately from consent banners", () => {
  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    events: [
      {
        eventType: "runtime.build_phase_diagnostic",
        metadataJson: {
          phase: "browser_runtime_capture",
          status: "ok"
        }
      }
    ],
    runtimeArtifacts: {
      hybridRuntimeEvidence: {
        consentControlLifecycleEvidence: {
          coverageStatus: "usable",
          footerLinksInspected: [
            "Legal Terms and Privacy By continuing, you agree to our Terms of Service and Privacy Policy. You agree that we and our third-party vendors may collect and use your information, including through cookies, pixels and similar technologies."
          ],
          initialConsentLayerObserved: true,
          layerInspected: "first_layer"
        },
        firstLayerConsentChoices: {
          capturedBeforeInteraction: true,
          visibleChoiceLabels: ["CONTINUE"]
        }
      },
      postRejectTrackingReductionEvidence: {
        reductionEvaluationStatus: "not_testable",
        rejectInteractionConfirmed: false,
        rejectInteractionFailureClass: "reject_control_not_found"
      },
      rejectPathDepthAndAvailability: {
        firstLayerConsentChoices: {
          visibleChoiceLabels: ["CONTINUE"]
        },
        layerInspected: "first_layer",
        rejectAvailableOnFirstLayer: false,
        rejectClickDepth: null
      }
    },
    snapshot: {
      cookie_banner_present: true
    }
  });

  assert.equal(outcomes.consent_surface_observed?.status, "Not confirmed");
  assert.match(outcomes.consent_surface_observed?.limitation ?? "", /Legal\/privacy notice gate observed/i);
  assert.deepEqual(outcomes.consent_surface_observed?.criticalEvidence.retainedEvidence.consentSurfaceDecisionStates, [
    "legal_privacy_notice_gate",
    "notice_only_privacy_interstitial",
    "forced_continue_notice"
  ]);
  assert.equal(outcomes.consent_choice_quality?.status, "Gap observed");
  assert.match(outcomes.consent_choice_quality?.limitation ?? "", /single Continue action/i);
  assert.equal(outcomes.consent_choice_quality?.criticalEvidence.retainedEvidence.legalPrivacyNoticeGateObserved, true);
  assert.equal(outcomes.reject_all_path_availability?.status, "Gap observed");
  assert.match(outcomes.reject_all_path_availability?.limitation ?? "", /only visible action was Continue/i);
  assert.equal(outcomes.post_reject_tracking_reduction?.status, "Not testable");
  assert.match(outcomes.post_reject_tracking_reduction?.limitation ?? "", /deferred from the current production core scanner/i);
});

test("deriveGdprEprivacyCoveragePolicyOutcomes classifies first-layer privacy notice gates with privacy choices", () => {
  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    events: [
      {
        eventType: "runtime.build_phase_diagnostic",
        metadataJson: {
          phase: "browser_runtime_capture",
          status: "ok"
        }
      }
    ],
    runtimeArtifacts: {
      hybridRuntimeEvidence: {
        consentControlLifecycleEvidence: {
          coverageStatus: "usable",
          footerLinksInspected: [
            "This site is now part of Versant. By continuing, you agree to our Terms and acknowledge that our updated Privacy Policy applies. We and our partners also use tools on this site to provide the services, personalize your experience, and for analytics, marketing, and advertising."
          ],
          initialConsentLayerObserved: true,
          layerInspected: "first_layer"
        },
        firstLayerConsentChoices: {
          capturedBeforeInteraction: true,
          visibleChoiceLabels: ["Your Privacy Choices", "Continue"]
        }
      },
      postRejectTrackingReductionEvidence: {
        reductionEvaluationStatus: "not_testable",
        rejectInteractionConfirmed: false,
        rejectInteractionFailureClass: "reject_control_not_found"
      },
      rejectPathDepthAndAvailability: {
        firstLayerConsentChoices: {
          visibleChoiceLabels: ["Your Privacy Choices", "Continue"]
        },
        layerInspected: "first_layer",
        rejectAvailableOnFirstLayer: false
      }
    },
    snapshot: {
      cookie_banner_present: true
    }
  });

  assert.equal(outcomes.consent_surface_observed?.status, "Not confirmed");
  assert.match(outcomes.consent_surface_observed?.limitation ?? "", /Privacy notice gate with privacy-choice link observed/i);
  assert.deepEqual(outcomes.consent_surface_observed?.criticalEvidence.retainedEvidence.consentSurfaceDecisionStates, [
    "legal_privacy_notice_gate",
    "privacy_notice_gate_with_privacy_choices",
    "forced_continue_notice_with_privacy_choices"
  ]);
  assert.equal(outcomes.consent_surface_observed?.criticalEvidence.retainedEvidence.privacyNoticeGateWithPrivacyChoicesObserved, true);
  assert.deepEqual(outcomes.consent_surface_observed?.criticalEvidence.retainedEvidence.privacyChoiceLabels, [
    "Your Privacy Choices"
  ]);
  assert.equal(outcomes.consent_choice_quality?.status, "Gap observed");
  assert.match(outcomes.consent_choice_quality?.limitation ?? "", /privacy notice gate with visible actions for privacy choices and Continue/i);
  assert.equal(outcomes.reject_all_path_availability?.status, "Gap observed");
  assert.match(outcomes.reject_all_path_availability?.limitation ?? "", /privacy choices and Continue/i);
  assert.equal(outcomes.post_reject_tracking_reduction?.status, "Not testable");
});

test("deriveGdprEprivacyCoveragePolicyOutcomes marks consent choice quality not testable for footer privacy choices only", () => {
  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    events: [
      {
        eventType: "runtime.build_phase_diagnostic",
        metadataJson: {
          phase: "browser_runtime_capture",
          status: "ok"
        }
      }
    ],
    runtimeArtifacts: {
      hybridRuntimeEvidence: {
        consentControlLifecycleEvidence: {
          adChoicesLinkObserved: true,
          consentSurfaceContaminationDetected: true,
          consentSurfaceDemotionReasons: ["footer_privacy_control_without_initial_consent_layer"],
          footerPrivacyChoiceLinkObserved: true,
          initialConsentLayerObserved: false,
          layerInspected: "footer_link",
          observedControls: [
            {
              href: "https://example.com/privacy/choices",
              pageUrl: "https://example.com/",
              source: "footer_link",
              text: "Your Privacy Choices"
            },
            {
              href: "https://example.com/ad-choices",
              pageUrl: "https://example.com/",
              source: "footer_link",
              text: "Ad Choices"
            }
          ],
          privacyControlPlacement: "footer",
          surfacePurpose: "ad_choices"
        }
      },
      rejectPathDepthAndAvailability: {
        adChoicesLinkObserved: true,
        firstLayerCookieConsentBannerObserved: false,
        gdprEprivacyConsentSurfaceObserved: "unconfirmed",
        layerInspected: "footer_link"
      }
    },
    snapshot: {
      cookie_banner_present: false
    }
  });

  assert.equal(outcomes.consent_surface_observed?.status, "Not confirmed");
  assert.equal(outcomes.consent_choice_quality?.status, "Not confirmed");
  assert.match(outcomes.consent_choice_quality?.limitation ?? "", /no first-layer GDPR\/ePrivacy cookie consent surface was confirmed/i);
  assert.equal(outcomes.consent_choice_quality?.criticalEvidence.retainedEvidence.firstLayerCookieConsentBannerObserved, false);
});

test("deriveGdprEprivacyCoveragePolicyOutcomes checks consent choice quality with retained granular evidence", () => {
  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {
      hybridRuntimeEvidence: {
        firstLayerConsentChoices: {
          acceptControlObserved: true,
          defaultToggleStatesObserved: true,
          managePreferencesObserved: true,
          nonEssentialDefaultsOff: true,
          purposeCategoryControlsObserved: true,
          rejectControlObserved: true,
          sameLayerRejectObserved: true,
          saveChoicesObserved: true,
          vendorControlsObserved: true,
          visibleChoiceLabels: ["Reject all", "Manage choices", "Accept all"],
          visualParityEvidenceObserved: true
        }
      },
      rejectPathDepthAndAvailability: {
        firstLayerCookieConsentBannerObserved: true,
        gdprEprivacyConsentSurfaceObserved: true,
        rejectAvailableOnFirstLayer: true
      }
    }
  });

  assert.equal(outcomes.consent_choice_quality?.status, "Not observed");
  assert.match(outcomes.consent_choice_quality?.limitation ?? "", /No obvious cookie-banner dark-pattern signal/i);
  assert.equal(outcomes.consent_choice_quality?.criticalEvidence.retainedEvidence.selectedEvidenceStrength, "strong");
  assert.equal(outcomes.consent_choice_quality?.criticalEvidence.retainedEvidence.darkPatternSignalObserved, false);
  assert.equal(outcomes.cookie_banner_preticked_or_implied_consent, undefined);
});

test("deriveGdprEprivacyCoveragePolicyOutcomes marks direct poor consent choice quality as a gap", () => {
  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {
      hybridRuntimeEvidence: {
        firstLayerConsentChoices: {
          acceptControlObserved: true,
          defaultToggleStatesObserved: true,
          nonEssentialDefaultsOff: false,
          rejectControlObserved: false,
          visibleChoiceLabels: ["Accept all"]
        }
      },
      rejectPathDepthAndAvailability: {
        firstLayerCookieConsentBannerObserved: true,
        gdprEprivacyConsentSurfaceObserved: true,
        rejectAvailableOnFirstLayer: false
      }
    }
  });

  assert.equal(outcomes.consent_choice_quality?.status, "Gap observed");
  assert.match(
    outcomes.consent_choice_quality?.limitation ?? "",
    /an accept\/accept-all control was retained, but no same-layer reject, decline, reject-all, or essential-only control was retained/i
  );
  assert.match(outcomes.consent_choice_quality?.limitation ?? "", /Accept all/i);
  assert.deepEqual(outcomes.consent_choice_quality?.criticalEvidence.retainedEvidence.directGapReasons, [
    "accept_without_same_layer_reject",
    "non_essential_toggles_default_on"
  ]);
  assert.equal(outcomes.cookie_banner_preticked_or_implied_consent, undefined);
});

test("deriveGdprEprivacyCoveragePolicyOutcomes demotes footer privacy choices from GDPR consent surface observation", () => {
  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    events: [
      {
        eventType: "runtime.build_phase_diagnostic",
        metadataJson: {
          phase: "browser_runtime_capture",
          status: "ok"
        }
      }
    ],
    runtimeArtifacts: {
      consent_surface_observed: true,
      hybridRuntimeEvidence: {
        consentControlLifecycleEvidence: {
          consentSurfaceContaminationDetected: true,
          consentSurfaceDemotionReasons: [
            "footer_privacy_control_without_initial_consent_layer",
            "surface_purpose_sale_share_opt_out"
          ],
          footerPrivacyChoiceLinkObserved: true,
          initialConsentLayerObserved: false,
          layerInspected: "footer_link",
          observedControls: [
            {
              href: "https://www.example.com/privacy/choices",
              pageUrl: "https://www.example.com/",
              source: "footer_link",
              text: "Your Privacy Choices"
            }
          ],
          privacyControlPlacement: "footer",
          saleShareOptOutSurfaceObserved: true,
          surfacePurpose: "sale_share_opt_out"
        }
      }
    },
    snapshot: {
      cookie_banner_present: true
    }
  });

	  assert.equal(outcomes.consent_surface_observed?.status, "Not confirmed");
	  assert.match(outcomes.consent_surface_observed?.limitation ?? "", /GDPR consent banner not confirmed/i);
  assert.deepEqual(
    outcomes.consent_surface_observed?.criticalEvidence.retainedEvidence.consentSurfaceDecisionStates,
    ["privacy_choice_surface_only"]
  );
});

test("deriveGdprEprivacyCoveragePolicyOutcomes consumes WS01 contaminated deeper-layer ad-choice demotion evidence", () => {
  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    events: [
      {
        eventType: "runtime.build_phase_diagnostic",
        metadataJson: {
          phase: "browser_runtime_capture",
          status: "ok"
        }
      }
    ],
    runtimeArtifacts: {
      consent_surface_observed: true,
      hybridRuntimeEvidence: {
        consentUiPathEvidence: {
          layerInspected: "deeper_layer"
        },
        firstLayerConsentChoices: {
          capturedBeforeInteraction: true,
          visibleChoiceLabels: [
            "preferences",
            "shopping guide",
            "settings",
            "how a public figure uses a hobby routine to manage stress during travel",
            "ad choices"
          ]
        }
      },
      rejectPathDepthAndAvailability: {
        adChoicesLinkObserved: true,
        consentSurfaceContaminationDetected: true,
        consentSurfaceDemotionReasons: [
          "unrelated_page_text_in_retained_choice_labels",
          "footer_link_not_first_layer_banner",
          "no_confirmed_actionable_cookie_consent_surface",
          "deeper_layer_not_first_layer"
        ],
        firstLayerCookieConsentBannerObserved: false,
        gdprEprivacyConsentSurfaceObserved: "unconfirmed",
        layerInspected: "deeper_layer",
        privacyControlPlacement: "deeper_layer"
      }
    },
    snapshot: {
      cookie_banner_present: true
    }
  });

	  assert.equal(outcomes.consent_surface_observed?.status, "Not confirmed");
	  assert.match(outcomes.consent_surface_observed?.limitation ?? "", /GDPR consent banner not confirmed/i);
  assert.equal(outcomes.consent_surface_observed?.criticalEvidence.retainedEvidence.firstLayerCookieConsentBannerObserved, false);
  assert.equal(outcomes.consent_surface_observed?.criticalEvidence.retainedEvidence.gdprEprivacyConsentSurfaceObserved, "unconfirmed");
  assert.equal(outcomes.consent_surface_observed?.criticalEvidence.retainedEvidence.adChoicesLinkObserved, true);
  assert.equal(outcomes.consent_surface_observed?.criticalEvidence.retainedEvidence.privacyControlPlacement, "deeper_layer");
  assert.equal(outcomes.consent_surface_observed?.criticalEvidence.retainedEvidence.consentSurfaceContaminationDetected, true);
  assert.deepEqual(outcomes.consent_surface_observed?.criticalEvidence.retainedEvidence.consentSurfaceDemotionReasons, [
    "unrelated_page_text_in_retained_choice_labels",
    "footer_link_not_first_layer_banner",
    "no_confirmed_actionable_cookie_consent_surface",
    "deeper_layer_not_first_layer"
  ]);
});

test("deriveGdprEprivacyCoveragePolicyOutcomes makes reject path not testable without confirmed first-layer GDPR banner", () => {
  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    events: [
      {
        eventType: "runtime.build_phase_diagnostic",
        metadataJson: {
          consentInteractionSkipNegativeReasonCodes: ["complete_reject_choice_controls_not_detected"],
          phase: "consent_audit_entry",
          shouldAttemptConsentAudit: true,
          status: "ok"
        }
      }
    ],
    runtimeArtifacts: {
      rejectPathDepthAndAvailability: {
        firstLayerCookieConsentBannerObserved: false,
        gdprEprivacyConsentSurfaceObserved: "unconfirmed",
        layerInspected: "deeper_layer",
        privacyControlPlacement: "footer",
        rejectAvailableOnFirstLayer: false
      }
    },
    snapshot: {
      consent_reject_button_count: 0,
      cookie_banner_present: true
    }
  });

  assert.equal(outcomes.reject_all_path_availability?.status, "Not confirmed");
  assert.match(outcomes.reject_all_path_availability?.limitation ?? "", /cookie consent banner was not confirmed/i);
  assert.deepEqual(outcomes.reject_all_path_availability?.criticalEvidence.projectedFindings, []);
  assert.equal(
    outcomes.reject_all_path_availability?.criticalEvidence.retainedEvidence.reason,
    "no_confirmed_first_layer_cookie_consent_banner"
  );
});

test("deriveGdprEprivacyCoveragePolicyOutcomes does not infer missing reject from tracking without a confirmed banner", () => {
  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {
      hybridRuntimeEvidence: {
        networkSummary: {
          preConsentThirdPartyRequestCount: 19
        },
        storageSummary: {
          cookiesBeforeConsentCount: 11
        }
      },
      rejectPathDepthAndAvailability: {
        firstLayerCookieConsentBannerObserved: false,
        gdprEprivacyConsentSurfaceObserved: "unconfirmed",
        rejectAvailableOnFirstLayer: false
      }
    },
    snapshot: {
      cookie_banner_present: false,
      third_party_request_count: 19
    }
  });

  const rejectPath = outcomes.reject_all_path_availability;
  assert.equal(rejectPath?.status, "Not confirmed");
  assert.match(rejectPath?.limitation ?? "", /cannot be assessed from tracking activity alone/i);
  assert.equal(rejectPath?.criticalEvidence.retainedEvidence.preconsentCookieOrTrackingActivityObserved, true);
  assert.equal(rejectPath?.criticalEvidence.retainedEvidence.rejectControlObserved, false);
  assert.equal(rejectPath?.criticalEvidence.retainedEvidence.rejectPathAvailabilityEvidenceRetained, false);
  assert.equal(
    rejectPath?.criticalEvidence.retainedEvidence.reason,
    "no_reject_option_retained_with_preconsent_activity"
  );
});

test("deriveGdprEprivacyCoveragePolicyOutcomes treats retained before-consent storage inventory as observed runtime evidence", () => {
  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {
      hybridRuntimeEvidence: {
        storageSummary: {
          cookiesBeforeConsentCount: 3,
          cookiesSeenCount: 5
        }
      }
    }
  });

  const outcome = outcomes.pre_consent_cookies_storage;
  assert.equal(outcome?.status, "Observed");
  assert.deepEqual(outcome?.evidenceRefs, [
    "Pre-consent cookie/storage observed in initial inventory; exact observation/write time not retained",
    "Observed before-consent cookie/storage count: 3",
    "Evidence: hybrid runtime storage summary"
  ]);
  assert.deepEqual(outcome?.criticalEvidence.missingOrIncompleteSourceSignals, []);
  assert.equal(outcome?.criticalEvidence.pipeline.projectionStage, "coverage_policy");
  assert.equal(
    outcome?.criticalEvidence.retainedEvidence.eligibleNonEssentialCookieStorageFindingProjected,
    false
  );
  assert.equal(outcome?.criticalEvidence.retainedEvidence.observedRuntimeSignalOnly, true);
  assert.match(outcome?.criticalEvidence.statusBasis ?? "", /observed runtime signal/i);
});

test("deriveGdprEprivacyCoveragePolicyOutcomes treats banner-only cookie notice evidence as partial review", () => {
  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {
      cmp_framework_signal_observed: true,
      cmp_runtime_signal_labels: ["cdn.cookielaw.org", "OptanonConsent"],
      consent_surface_observed: true,
      cookie_notice_observed: true,
      hybridRuntimeEvidence: {
        consentSummary: {
          bannerPresent: true,
          cmpFrameworkSignalObserved: true,
          cookieNoticeObserved: true
        }
      }
    },
    snapshot: {
      cmp_vendor_name: "OneTrust CMP",
      cookie_banner_present: true
    }
  });

  assert.equal(outcomes.cmp_framework_signal_observed?.status, "Observed");
  assert.match(outcomes.cmp_framework_signal_observed?.limitation ?? "", /OneTrust CMP/i);
  assert.equal(
    outcomes.cmp_framework_signal_observed?.criticalEvidence.retainedEvidence.cmpFrameworkSignalObserved,
    true
  );
  assert.equal(outcomes.cookie_notice_policy_availability?.status, "Review signal");
  assert.equal(
    outcomes.cookie_notice_policy_availability?.criticalEvidence.retainedEvidence.cookieNoticeObserved,
    true
  );
  assert.equal(
    outcomes.cookie_notice_policy_availability?.criticalEvidence.retainedEvidence.cookiePolicyPresent,
    false
  );
  assert.equal(outcomes.reject_all_path_availability?.status, "Not observed");
  assert.match(outcomes.reject_all_path_availability?.limitation ?? "", /did not include a structured first-layer reject/i);
});

test("deriveGdprEprivacyCoveragePolicyOutcomes does not infer missing reject when first-layer controls are incomplete", () => {
  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {
      cmp_framework_signal_observed: true,
      cmp_runtime_signal_labels: ["cdn.cookielaw.org", "OptanonConsent"],
      consent_surface_observed: true,
      cookie_notice_observed: true,
      hybridRuntimeEvidence: {
        consentSummary: {
          bannerPresent: true,
          cmpFrameworkSignalObserved: true,
          cookieNoticeObserved: true
        },
        networkSummary: {
          preConsentThirdPartyRequestCount: 178
        },
        storageSummary: {
          cookiesBeforeConsentCount: 38
        }
      },
      rejectPathDepthAndAvailability: {
        firstLayerConsentChoices: {
          visibleChoiceLabels: []
        },
        rejectAvailableOnFirstLayer: false,
        rejectControlObserved: false
      }
    },
    snapshot: {
      cmp_vendor_name: "OneTrust CMP",
      cookie_banner_present: true,
      third_party_request_count: 178
    }
  });

  const outcome = outcomes.reject_all_path_availability;
  assert.equal(outcome?.status, "Not confirmed");
  assert.match(outcome?.limitation ?? "", /cannot be assessed from CMP presence or tracking activity alone/i);
  assert.equal(outcome?.criticalEvidence.retainedEvidence.consentSurfaceObserved, true);
  assert.equal(outcome?.criticalEvidence.retainedEvidence.preconsentCookieOrTrackingActivityObserved, true);
  assert.equal(outcome?.criticalEvidence.retainedEvidence.rejectControlObserved, false);
  assert.equal(outcome?.criticalEvidence.retainedEvidence.rejectPathAvailabilityEvidenceRetained, false);
  assert.equal(
    outcome?.criticalEvidence.retainedEvidence.reason,
    "no_reject_option_retained_with_preconsent_activity"
  );
});

test("deriveGdprEprivacyCoveragePolicyOutcomes carries CMP expectation for missing first-layer consent controls", () => {
  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {
      cmpFrameworkSignalObserved: true,
      cmpRuntimeSignalLabels: ["script_url"],
      cmp_vendor_name: "Consentmanager CMP",
      consentSurfaceObserved: true,
      hybridRuntimeEvidence: {
        consentSummary: {
          bannerPresent: true,
          cmpFrameworkSignalObserved: true,
          cookieNoticeObserved: true
        },
        firstLayerConsentChoices: {
          acceptControlObserved: false,
          actionableControlInventoryRetained: false,
          capturedBeforeInteraction: true,
          controls: [],
          layerInspected: "unknown",
          managePreferencesControlObserved: false,
          rejectControlObserved: false,
          visibleChoiceLabels: []
        },
        networkSummary: {
          preConsentThirdPartyRequestCount: 12
        }
      },
      rejectPathDepthAndAvailability: {
        firstLayerCookieConsentBannerObserved: false,
        firstLayerConsentChoices: {
          controls: [],
          layerInspected: "unknown",
          visibleChoiceLabels: []
        },
        gdprEprivacyConsentSurfaceObserved: "unconfirmed"
      }
    },
    snapshot: {
      cmp_vendor_name: "Consentmanager CMP",
      third_party_request_count: 12
    }
  });

  const rejectOutcome = outcomes.reject_all_path_availability;
  assert.equal(rejectOutcome?.status, "Not confirmed");
  assert.equal(rejectOutcome?.criticalEvidence.retainedEvidence.consentSurfaceObserved, false);
  assert.equal(rejectOutcome?.criticalEvidence.retainedEvidence.cmpSignalObserved, true);
  assert.equal(rejectOutcome?.criticalEvidence.retainedEvidence.rejectControlObserved, false);

  const acceptOutcome = outcomes.accept_consent_control;
  assert.equal(acceptOutcome?.status, "Not confirmed");
  assert.equal(acceptOutcome?.criticalEvidence.retainedEvidence.consentSurfaceObserved, false);
  assert.equal(acceptOutcome?.criticalEvidence.retainedEvidence.cmpSignalObserved, true);
  assert.equal(acceptOutcome?.criticalEvidence.retainedEvidence.acceptControlObserved, false);
  assert.equal(acceptOutcome?.criticalEvidence.retainedEvidence.acceptControlEvidenceRetained, false);

  const optionsOutcome = outcomes.options_settings_preferences_control;
  assert.equal(optionsOutcome?.status, "Not confirmed");
  assert.equal(optionsOutcome?.criticalEvidence.retainedEvidence.consentSurfaceObserved, false);
  assert.equal(optionsOutcome?.criticalEvidence.retainedEvidence.cmpSignalObserved, true);
  assert.equal(optionsOutcome?.criticalEvidence.retainedEvidence.optionsControlObserved, false);
  assert.equal(optionsOutcome?.criticalEvidence.retainedEvidence.optionsControlEvidenceRetained, false);
});

test("deriveGdprEprivacyCoveragePolicyOutcomes flags first-layer accept-only cookie consent as a reject-option gap", () => {
  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {
      hybridRuntimeEvidence: {
        consentSummary: {
          bannerPresent: true,
          textSnippet:
            "Our use of cookies and other technologies. We and our partners process data to store and/or access information on a device, select advertising, and measure content performance."
        }
      },
      rejectPathDepthAndAvailability: {
        firstLayerConsentChoices: {
          acceptVisibleOnFirstLayer: true,
          capturedBeforeInteraction: true,
          rejectVisibleOnFirstLayer: false,
          visibleChoiceLabels: ["Accept All", "Show Purposes"]
        },
        layerInspected: "first_layer",
        rejectAvailableOnFirstLayer: false
      }
    },
    snapshot: {
      cookie_banner_present: true
    }
  });

  const outcome = outcomes.reject_all_path_availability;
  assert.equal(outcome?.status, "Gap observed");
  assert.match(outcome?.limitation ?? "", /no same-layer reject, decline, refuse, or continue-without-accepting option/i);
  assert.match(outcome?.limitation ?? "", /first-layer availability signal only/i);
  assert.equal(outcome?.criticalEvidence.retainedEvidence.acceptControlObserved, true);
  assert.equal(outcome?.criticalEvidence.retainedEvidence.rejectControlObserved, false);
  assert.deepEqual(outcome?.criticalEvidence.retainedEvidence.visibleChoiceLabels, ["Accept All", "Show Purposes"]);
});

test("deriveGdprEprivacyCoveragePolicyOutcomes treats no banner and no non-essential activity as neutral for reject option", () => {
  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    events: [
      {
        eventType: "runtime.build_phase_diagnostic",
        metadataJson: {
          phase: "browser_runtime_capture",
          status: "ok"
        }
      }
    ],
    runtimeArtifacts: {
      hybridRuntimeEvidence: {
        networkSummary: {
          preConsentThirdPartyRequestCount: 0
        },
        storageSummary: {
          cookiesBeforeConsentCount: 0,
          cookiesSeenCount: 0
        }
      },
      rejectPathDepthAndAvailability: {
        firstLayerCookieConsentBannerObserved: false,
        gdprEprivacyConsentSurfaceObserved: "unconfirmed"
      }
    },
    snapshot: {
      cookie_banner_present: false,
      preconsent_tracking_detected: false
    }
  });

  const outcome = outcomes.reject_all_path_availability;
  assert.equal(outcome?.status, "Not observed");
  assert.match(outcome?.limitation ?? "", /no non-essential cookie\/tracking activity was observed/i);
  assert.equal(outcome?.criticalEvidence.retainedEvidence.preconsentCookieOrTrackingActivityObserved, false);
});

test("deriveGdprEprivacyCoveragePolicyOutcomes observes durable cookie policy surfaces and flags missing surfaces with pre-consent runtime evidence", () => {
  const observed = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {
      policyDisclosureSummary: {
        cookiePolicyUrls: ["https://example.test/cookie-policy"],
        privacyPolicyPresent: true,
        privacyPolicyTextCharacterCount: 2000,
        retainedPrivacyPolicyTextExcerpt: "Our cookie policy explains cookie settings and cookie preference controls."
      }
    },
    snapshot: {
      cookie_policy_present: true
    }
  });

  assert.equal(observed.cookie_notice_policy_availability?.status, "Observed");
  assert.equal(
    observed.cookie_notice_policy_availability?.criticalEvidence.retainedEvidence.cookiePolicyPresent,
    true
  );

  const gap = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {
      hybridRuntimeEvidence: {
        storageSummary: {
          cookiesBeforeConsentCount: 3
        }
      }
    }
  });

  assert.equal(gap.cookie_notice_policy_availability?.status, "Gap observed");
});

test("deriveGdprEprivacyCoveragePolicyOutcomes treats retained cookie topics in privacy policy as durable cookie disclosure", () => {
  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {
      policyDisclosureSummary: {
        observedTopics: ["cookies", "advertising"],
        privacyPolicyPresent: true,
        privacyPolicyTextCharacterCount: 2200,
        privacyPolicyUrls: ["https://example.test/privacy"],
        retainedPrivacyPolicyTextExcerpt: "We use identifiers and similar technologies to remember choices and measure services."
      }
    },
    snapshot: {
      privacy_policy_present: true
    }
  });

  assert.equal(outcomes.cookie_notice_policy_availability?.status, "Observed");
  assert.equal(
    outcomes.cookie_notice_policy_availability?.criticalEvidence.retainedEvidence.cookiePolicyPresent,
    true
  );
  assert.deepEqual(
    outcomes.cookie_notice_policy_availability?.criticalEvidence.retainedEvidence.observedPolicyTopics,
    ["cookies", "advertising"]
  );
});

test("deriveGdprEprivacyCoveragePolicyOutcomes marks analytics and device fingerprinting absent after runtime capture", () => {
  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {
      hybridRuntimeEvidence: {
        fingerprintingEvidenceSummary: {
          apiProbeRetained: true,
          artifactCount: 0,
          coverageRetained: true
        },
        requestPurposeClassificationConfidence: [
          {
            category: "advertising",
            runtimePhase: "pre_consent",
            vendorName: "Google Ads / DoubleClick"
          }
        ],
        vendorSummary: {
          vendorCategoryCounts: {
            advertising: 1
          }
        }
      }
    },
    snapshot: {
      session_replay_tool_detected: false,
      session_replay_tracker_count: 0
    }
  });

  assert.equal(outcomes.advertising_retargeting_vendor_signal_observed?.status, "Review signal");
  assert.equal(
    outcomes.advertising_retargeting_vendor_signal_observed?.criticalEvidence.retainedEvidence.advertisingRetargetingVendorCount,
    1
  );
  assert.deepEqual(
    outcomes.advertising_retargeting_vendor_signal_observed?.criticalEvidence.retainedEvidence.advertisingRetargetingEvidenceCauses,
    [
      {
        bucket: "advertising",
        category: "advertising",
        vendor: "Google Ads / DoubleClick"
      }
    ]
  );
  assert.equal(outcomes.retargeting_behavioral_advertising_signal_observed?.status, "Not observed");
  assert.equal(
    outcomes.retargeting_behavioral_advertising_signal_observed?.criticalEvidence.retainedEvidence
      .retargetingBehavioralAdvertisingVendorCount,
    0
  );
  assert.equal(outcomes.analytics_vendor_observed?.status, "Not observed");
  assert.equal(outcomes.analytics_vendor_observed?.criticalEvidence.retainedEvidence.analyticsVendorCount, 0);
  assert.equal(outcomes.device_identification_fingerprinting_signal_observed?.status, "Not observed");
  assert.equal(
    outcomes.device_identification_fingerprinting_signal_observed?.criticalEvidence.retainedEvidence.fingerprintingObserved,
    false
  );
});

test("deriveGdprEprivacyCoveragePolicyOutcomes separates behavioral retargeting from generic advertising", () => {
  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {
      hybridRuntimeEvidence: {
        requestPurposeClassificationConfidence: [
          {
            category: "advertising",
            regulatoryRelevance: ["advertising", "cross_site_tracking", "identity_resolution"],
            runtimePhase: "pre_consent",
            vendorName: "Meta Pixel"
          }
        ],
        vendorSummary: {
          vendorCategoryCounts: {
            advertising: 1
          }
        }
      }
    },
    snapshot: {
      session_replay_tool_detected: false,
      session_replay_tracker_count: 0
    }
  });

  assert.equal(outcomes.advertising_retargeting_vendor_signal_observed?.status, "Not observed");
  assert.equal(outcomes.retargeting_behavioral_advertising_signal_observed?.status, "Review signal");
  assert.deepEqual(
    outcomes.retargeting_behavioral_advertising_signal_observed?.criticalEvidence.retainedEvidence
      .retargetingBehavioralAdvertisingEvidenceCauses,
    [
      {
        bucket: "retargeting",
        category: "advertising",
        vendor: "Meta Pixel"
      }
    ]
  );
});

test("deriveGdprEprivacyCoveragePolicyOutcomes does not treat Akamai security or RUM evidence as adtech", () => {
  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {
      advertisingRetargetingVendorNames: ["Akamai Bot Manager / Edge"],
      advertising_retargeting_vendor_count: 1,
      analyticsVendorNames: ["Akamai mPulse"],
      consent_baseline_tracker_vendor_names: ["Akamai Bot Manager / Edge", "Akamai mPulse"],
      fingerprintingEvidenceSummary: {
        coverageRetained: true,
        hosts: ["Akamai Bot Manager / Edge"]
      },
      hybridRuntimeEvidence: {
        fingerprintingEvidenceSummary: {
          coverageRetained: true,
          hosts: ["Akamai Bot Manager / Edge"]
        },
        requestPurposeClassificationConfidence: [
          {
            category: "advertising",
            runtimePhase: "pre_consent",
            representativeUrl: "https://www.mcdonalds.com/_abck",
            vendorName: "Akamai Bot Manager / Edge"
          },
          {
            category: "analytics",
            runtimePhase: "pre_consent",
            representativeUrl: "https://c.go-mpulse.net/boomerang/config.js",
            vendorName: "Akamai mPulse"
          }
        ],
        vendorSummary: {
          vendorCategoryCounts: {
            advertising: 1,
            analytics: 1
          }
        }
      }
    },
    snapshot: {
      fingerprinting_detected: true,
      preconsent_tracking_detected: true,
      tracker_vendor_count: 2
    }
  });

  assert.equal(outcomes.pre_consent_third_party_tracking?.status, "Review signal");
  assert.equal(outcomes.advertising_retargeting_vendor_signal_observed?.status, "Not observed");
  assert.equal(
    outcomes.advertising_retargeting_vendor_signal_observed?.criticalEvidence.retainedEvidence.advertisingRetargetingVendorCount,
    0
  );
  assert.deepEqual(
    outcomes.advertising_retargeting_vendor_signal_observed?.criticalEvidence.retainedEvidence.advertisingRetargetingEvidenceCauses,
    []
  );
  assert.deepEqual(
    outcomes.advertising_retargeting_vendor_signal_observed?.criticalEvidence.retainedEvidence.preconsentPurposeRiskMix,
    {
      advertising: [],
      retargeting: [],
      marketingAnalytics: [],
      performanceRum: ["Akamai mPulse"],
      securityBotMitigation: ["Akamai Bot Manager / Edge"],
      cdnEdgeDelivery: [],
      functional: [],
      sessionReplay: [],
      tagManagement: [],
      unknown: []
    }
  );
  assert.equal(outcomes.analytics_vendor_observed?.status, "Review signal");
  assert.deepEqual(
    outcomes.analytics_vendor_observed?.criticalEvidence.retainedEvidence.performanceRumVendors,
    ["Akamai mPulse"]
  );
  assert.match(outcomes.analytics_vendor_observed?.limitation ?? "", /Performance\/RUM analytics evidence/i);
  assert.equal(outcomes.device_identification_fingerprinting_signal_observed?.status, "Insufficient evidence");
  assert.match(
    outcomes.device_identification_fingerprinting_signal_observed?.limitation ?? "",
    /contextual evidence/i
  );
});

test("deriveGdprEprivacyCoveragePolicyOutcomes retains concrete browser API names and timing for device-identification review", () => {
  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {
      hybridRuntimeEvidence: {
        fingerprintingRuntimeEvidence: [
          {
            consentStateAtTime: "pre_consent",
            fingerprintAttributeCategories: ["canvas"],
            highEntropySignals: ["HTMLCanvasElement.toDataURL"],
            host: "nvidia.com",
            timestampMs: 6570
          },
          {
            consentStateAtTime: "pre_consent",
            fingerprintAttributeCategories: ["canvas"],
            highEntropySignals: ["CanvasRenderingContext2D.getImageData"],
            host: "nvidia.com",
            timestampMs: 6571
          }
        ],
        fingerprintingEvidenceSummary: {
          coverageRetained: true,
          fingerprintingObserved: true,
          highEntropySignals: ["HTMLCanvasElement.toDataURL", "CanvasRenderingContext2D.getImageData"],
          hosts: ["nvidia.com"],
          knownFingerprintLibraryMatch: "fixture-fingerprint-library",
          preConsentObserved: true,
          strongCorroboratorObserved: true
        }
      }
    },
    snapshot: {
      fingerprinting_detected: true
    }
  });

  const outcome = outcomes.device_identification_fingerprinting_signal_observed;
  assert.equal(outcome?.status, "Review signal");
  assert.match(outcome?.limitation ?? "", /HTMLCanvasElement\.toDataURL/);
  assert.match(outcome?.limitation ?? "", /CanvasRenderingContext2D\.getImageData/);
  assert.match(outcome?.limitation ?? "", /6.57s/);
  const entropyEvidence = outcome?.criticalEvidence.retainedEvidence.browserDeviceEntropyEvidence as
    | {
        browserApiSignals?: string[];
        firstObservedMs?: number;
        highEntropySignals?: string[];
        observedMs?: number[];
      }
    | undefined;
  assert.deepEqual(
    entropyEvidence?.browserApiSignals,
    ["HTMLCanvasElement.toDataURL", "CanvasRenderingContext2D.getImageData"]
  );
  assert.deepEqual(
    entropyEvidence?.highEntropySignals,
    ["HTMLCanvasElement.toDataURL", "CanvasRenderingContext2D.getImageData", "canvas"]
  );
  assert.deepEqual(
    entropyEvidence?.observedMs,
    [6570, 6571]
  );
  assert.equal(
    entropyEvidence?.firstObservedMs,
    6570
  );
  assert.deepEqual(
    outcome?.evidenceRefs.filter((ref) => /Browser API access/i.test(ref)),
    [
      "Browser API access: HTMLCanvasElement.toDataURL; first observed around 6.57s after scan start",
      "Browser API access: CanvasRenderingContext2D.getImageData; first observed around 6.57s after scan start"
    ]
  );
});

test("deriveGdprEprivacyCoveragePolicyOutcomes marks row-specific runtime lanes not testable when coverage summaries are missing", () => {
  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    events: [
      {
        eventType: "runtime.build_phase_diagnostic",
        metadataJson: {
          phase: "browser_runtime_capture",
          status: "ok"
        }
      }
    ],
    runtimeArtifacts: {
      hybridRuntimeEvidence: {
        networkSummary: {
          totalRequestCount: 4
        }
      }
    },
    snapshot: {
      pages_scanned: 1
    }
  });

  assert.equal(outcomes.embedded_content_pre_consent?.status, "Not testable");
  assert.equal(outcomes.session_replay_fingerprinting_review?.status, "Not testable");
  assert.equal(outcomes.device_identification_fingerprinting_signal_observed?.status, "Not testable");
  assert.match(
    outcomes.device_identification_fingerprinting_signal_observed?.limitation ?? "",
    /row-specific browser API or fingerprinting coverage/i
  );
});

test("deriveGdprEprivacyCoveragePolicyOutcomes detects concrete embedded content but ignores CMP locator iframes", () => {
  const embeddedOutcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {
      hybridRuntimeEvidence: {
        iframeSummary: {
          iframeEvents: [
            {
              firstSeenMs: 928,
              frameUrl: "https://www.youtube.com/embed/abc123",
              hostname: "www.youtube.com",
              preConsent: true,
              thirdParty: true
            }
          ],
          preConsentIframeCount: 1
        }
      }
    }
  });

  assert.equal(embeddedOutcomes.embedded_content_pre_consent?.status, "Observed");
  assert.equal(embeddedOutcomes.third_party_service_connection_pre_consent?.status, "Gap observed");
  assert.equal(embeddedOutcomes.third_party_iframe_pre_consent?.status, "Gap observed");
  assert.deepEqual(
    embeddedOutcomes.embedded_content_pre_consent?.criticalEvidence.retainedEvidence.embeddedContentHosts,
    ["youtube.com"]
  );
  assert.equal(
    embeddedOutcomes.embedded_content_pre_consent?.criticalEvidence.retainedEvidence.firstEmbeddedContentObservedMs,
    928
  );

  const mixedPurposeEmbeddedOutcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {
      hybridRuntimeEvidence: {
        embeddedContentSummary: {
          embeddedContentObserved: true,
          observations: [
            {
              hostname: "imasdk.googleapis.com",
              requestUrl: "https://imasdk.googleapis.com/js/sdkloader/ima3.js",
              timestampMs: 412
            },
            {
              hostname: "fonts.googleapis.com",
              requestUrl: "https://fonts.googleapis.com/css2?family=Inter",
              timestampMs: 430
            }
          ]
        }
      }
    }
  });

  assert.equal(mixedPurposeEmbeddedOutcomes.embedded_content_pre_consent?.status, "Observed");
  assert.equal(mixedPurposeEmbeddedOutcomes.third_party_service_connection_pre_consent?.status, "Gap observed");
  assert.deepEqual(
    mixedPurposeEmbeddedOutcomes.third_party_service_connection_pre_consent?.criticalEvidence.retainedEvidence.embeddedContentHosts,
    ["imasdk.googleapis.com"]
  );
  assert.deepEqual(
    mixedPurposeEmbeddedOutcomes.embedded_content_pre_consent?.criticalEvidence.retainedEvidence.embeddedContentPurposeBuckets,
    {
      fontStaticResource: ["fonts.googleapis.com"],
      formOrChatWidget: [],
      mapEmbed: [],
      mediaEmbed: [],
      otherEmbeddedContent: [],
      socialEmbed: [],
      videoAdSdk: ["imasdk.googleapis.com"]
    }
  );

  const cmpLocatorOutcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {
      hybridRuntimeEvidence: {
        iframeSummary: {
          iframeEvents: [
            {
              frameName: "__tcfapiLocator",
              frameUrl: "about:blank",
              hostname: "about:blank",
              preConsent: true,
              thirdParty: false
            }
          ],
          preConsentIframeCount: 1
        }
      }
    }
  });

  assert.equal(cmpLocatorOutcomes.embedded_content_pre_consent?.status, "Not observed");
  assert.equal(cmpLocatorOutcomes.third_party_service_connection_pre_consent?.status, "Not observed");
  assert.equal(cmpLocatorOutcomes.third_party_iframe_pre_consent?.status, "Not observed");
  assert.equal(
    cmpLocatorOutcomes.embedded_content_pre_consent?.criticalEvidence.retainedEvidence.preConsentIframeCount,
    1
  );

  const highConfidenceEmbeddedOutcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {
      hybridRuntimeEvidence: {
        iframeSummary: {
          iframeEvents: [
            {
              firstSeenMs: 210,
              frameUrl: "https://www.google.com/maps/embed?pb=fixture",
              hostname: "www.google.com",
              preConsent: true,
              thirdParty: true
            },
            {
              firstSeenMs: 230,
              frameUrl: "https://www.facebook.com/plugins/page.php?href=fixture",
              hostname: "www.facebook.com",
              preConsent: true,
              thirdParty: true
            },
            {
              firstSeenMs: 250,
              frameUrl: "https://calendly.com/example/demo?embed_domain=fixture",
              hostname: "calendly.com",
              preConsent: true,
              thirdParty: true
            }
          ],
          preConsentIframeCount: 3
        }
      }
    }
  });

  assert.equal(highConfidenceEmbeddedOutcomes.embedded_content_pre_consent?.status, "Observed");
  assert.equal(highConfidenceEmbeddedOutcomes.third_party_service_connection_pre_consent?.status, "Gap observed");
  assert.equal(highConfidenceEmbeddedOutcomes.third_party_iframe_pre_consent?.status, "Gap observed");
  assert.deepEqual(
    highConfidenceEmbeddedOutcomes.embedded_content_pre_consent?.criticalEvidence.retainedEvidence.embeddedContentPurposeBuckets,
    {
      fontStaticResource: [],
      formOrChatWidget: ["calendly.com"],
      mapEmbed: ["google.com"],
      mediaEmbed: [],
      otherEmbeddedContent: [],
      socialEmbed: ["facebook.com"],
      videoAdSdk: []
    }
  );

  const nonEligibleIframeOutcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {
      hybridRuntimeEvidence: {
        iframeSummary: {
          iframeEvents: [
            {
              frameUrl: "https://www.example.com/account-frame",
              hostname: "www.example.com",
              preConsent: true,
              thirdParty: false
            },
            {
              frameUrl: "https://widgets.example-cdn.test/frame",
              hostname: "widgets.example-cdn.test",
              preConsent: true,
              thirdParty: true
            }
          ],
          preConsentIframeCount: 2
        }
      }
    }
  });

  assert.equal(nonEligibleIframeOutcomes.embedded_content_pre_consent?.status, "Not observed");
  assert.equal(nonEligibleIframeOutcomes.third_party_service_connection_pre_consent?.status, "Not observed");
  assert.equal(nonEligibleIframeOutcomes.third_party_iframe_pre_consent?.status, "Not observed");
  assert.equal(
    nonEligibleIframeOutcomes.embedded_content_pre_consent?.criticalEvidence.retainedEvidence.preConsentIframeCount,
    2
  );

  const fontOnlyOutcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {
      hybridRuntimeEvidence: {
        embeddedContentSummary: {
          coverageRetained: true,
          embeddedContentObserved: true,
          observations: [
            {
              hostname: "fonts.googleapis.com",
              requestUrl: "https://fonts.googleapis.com/css2?family=Inter",
              timestampMs: 430
            }
          ]
        }
      }
    }
  });

  assert.equal(fontOnlyOutcomes.embedded_content_pre_consent?.status, "Not observed");
  assert.equal(fontOnlyOutcomes.third_party_service_connection_pre_consent?.status, "Not observed");
  assert.equal(fontOnlyOutcomes.third_party_iframe_pre_consent?.status, "Not observed");
});

test("deriveGdprEprivacyCoveragePolicyOutcomes classifies social and media embeds before consent from runtime evidence only", () => {
  const linkOnlyOutcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {
      hybridRuntimeEvidence: {
        embeddedContentSummary: {
          coverageRetained: true,
          embeddedContentObserved: false,
          outboundSocialLinks: ["https://www.linkedin.com/company/example"]
        }
      }
    }
  });
  assert.equal(linkOnlyOutcomes.social_media_embed_pre_consent?.status, "Not observed");
  assert.match(linkOnlyOutcomes.social_media_embed_pre_consent?.limitation ?? "", /Plain outbound links/i);

  const firstPartyIconOutcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {
      hybridRuntimeEvidence: {
        embeddedContentSummary: {
          coverageRetained: true,
          embeddedContentObserved: false,
          observations: [
            {
              hostname: "www.example.com",
              initiatorType: "image",
              requestUrl: "https://www.example.com/icons/linkedin.svg",
              thirdParty: false,
              timestampMs: 120
            }
          ]
        }
      }
    }
  });
  assert.equal(firstPartyIconOutcomes.social_media_embed_pre_consent?.status, "Not observed");

  const requestObservationOutcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {
      hybridRuntimeEvidence: {
        requestObservations: [
          {
            hostname: "connect.facebook.net",
            initiatorType: "script",
            preConsent: true,
            requestUrl: "https://connect.facebook.net/en_US/fbevents.js",
            resourceType: "script",
            thirdParty: true,
            timestampMs: 260
          }
        ]
      }
    }
  });
  assert.equal(requestObservationOutcomes.social_media_embed_pre_consent?.status, "Gap observed");
  assert.match(
    requestObservationOutcomes.social_media_embed_pre_consent?.criticalEvidence.statusBasis ?? "",
    /Meta\/Facebook.*first seen 0.260s/i
  );

  const postConsentRequestObservationOutcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {
      hybridRuntimeEvidence: {
        embeddedContentSummary: {
          coverageRetained: true,
          observations: []
        },
        requestObservations: [
          {
            hostname: "connect.facebook.net",
            initiatorType: "script",
            preConsent: false,
            requestUrl: "https://connect.facebook.net/en_US/fbevents.js",
            resourceType: "script",
            thirdParty: true,
            timestampMs: 260
          }
        ]
      }
    }
  });
  assert.equal(postConsentRequestObservationOutcomes.social_media_embed_pre_consent?.status, "Not observed");

  const youtubeOutcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {
      hybridRuntimeEvidence: {
        iframeSummary: {
          iframeEvents: [
            {
              consentStateAtTime: "pre_consent",
              firstSeenMs: 842,
              frameUrl: "https://www.youtube.com/embed/abc123",
              hostname: "www.youtube.com",
              initiatorType: "iframe",
              preConsent: true,
              thirdParty: true
            }
          ],
          preConsentIframeCount: 1
        }
      }
    }
  });
  assert.equal(youtubeOutcomes.social_media_embed_pre_consent?.status, "Gap observed");
  assert.match(
    youtubeOutcomes.social_media_embed_pre_consent?.criticalEvidence.statusBasis ?? "",
    /YouTube.*first seen 0.842s/i
  );
  assert.equal(
    youtubeOutcomes.social_media_embed_pre_consent?.criticalEvidence.retainedEvidence.firstSocialMediaEmbedObservedMs,
    842
  );
  assert.deepEqual(
    youtubeOutcomes.social_media_embed_pre_consent?.criticalEvidence.retainedEvidence.providerCategories,
    ["mediaEmbed"]
  );

  const socialEmbedOutcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {
      hybridRuntimeEvidence: {
        embeddedContentSummary: {
          coverageRetained: true,
          observations: [
            {
              hostname: "platform.twitter.com",
              initiatorType: "script",
              requestUrl: "https://platform.twitter.com/widgets.js",
              timestampMs: 300
            },
            {
              hostname: "www.tiktok.com",
              initiatorType: "iframe",
              requestUrl: "https://www.tiktok.com/embed/v2/123",
              timestampMs: 340
            },
            {
              hostname: "www.instagram.com",
              initiatorType: "iframe",
              requestUrl: "https://www.instagram.com/p/example/embed",
              timestampMs: 380
            }
          ]
        }
      }
    }
  });
  assert.equal(socialEmbedOutcomes.social_media_embed_pre_consent?.status, "Gap observed");
  assert.match(
    socialEmbedOutcomes.social_media_embed_pre_consent?.criticalEvidence.statusBasis ?? "",
    /X\/Twitter.*TikTok.*Instagram.*first seen 0.300s/i
  );
  assert.deepEqual(
    socialEmbedOutcomes.social_media_embed_pre_consent?.criticalEvidence.retainedEvidence.socialMediaEmbedDomains,
    ["platform.twitter.com", "tiktok.com", "instagram.com"]
  );

  const pixelOutcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {
      hybridRuntimeEvidence: {
        requestPurposeClassificationConfidence: [
          {
            category: "social_pixel",
            confidence: 0.9,
            initiatorType: "script",
            requestUrl: "https://px.ads.linkedin.com/collect/?pid=123",
            tsMs: 250,
            vendor: "LinkedIn Insight"
          },
          {
            category: "marketing_pixel",
            confidence: 0.9,
            initiatorType: "beacon",
            requestUrl: "https://analytics.tiktok.com/i18n/pixel/events.js",
            tsMs: 260,
            vendor: "TikTok Pixel"
          },
          {
            category: "social_pixel",
            confidence: 0.9,
            initiatorType: "script",
            requestUrl: "https://connect.facebook.net/en_US/fbevents.js",
            tsMs: 270,
            vendor: "Meta Pixel"
          }
        ]
      }
    }
  });
  assert.equal(pixelOutcomes.social_media_embed_pre_consent?.status, "Gap observed");
  assert.deepEqual(
    pixelOutcomes.social_media_embed_pre_consent?.criticalEvidence.retainedEvidence.providerCategories,
    ["social_pixel"]
  );

  const condeAdtechAndChatOutcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {
      hybridRuntimeEvidence: {
        requestPurposeClassificationConfidence: [
          {
            category: "social_pixel",
            initiatorType: "script",
            requestUrl: "https://privacy.condenastdigital.com/fides.js?property_id=FDS-NCFH3W",
            tsMs: 934,
            vendor: "privacy.condenastdigital.com"
          },
          {
            category: "advertising",
            initiatorType: "script",
            requestUrl: "https://securepubads.g.doubleclick.net/tag/js/gpt.js",
            tsMs: 941,
            vendor: "Google Publisher Tag"
          },
          {
            category: "marketing_pixel",
            initiatorType: "script",
            requestUrl: "https://ads-static.conde.digital/production/cns/builds/vogue/v6.js",
            tsMs: 942,
            vendor: "ads-static.conde.digital"
          },
          {
            category: "marketing_pixel",
            initiatorType: "script",
            requestUrl: "https://martech.condenastdigital.com/lib/martech.js",
            tsMs: 942,
            vendor: "martech.condenastdigital.com"
          },
          {
            category: "chat",
            initiatorType: "script",
            requestUrl: "https://cdn.gladly.com/chat-sdk/widget.js",
            tsMs: 1170,
            vendor: "Gladly"
          }
        ],
        embeddedContentSummary: {
          coverageRetained: true,
          observations: []
        }
      }
    }
  });
  assert.equal(condeAdtechAndChatOutcomes.social_media_embed_pre_consent?.status, "Not observed");

  const staticAssetOutcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {
      hybridRuntimeEvidence: {
        embeddedContentSummary: {
          coverageRetained: true,
          observations: [
            {
              hostname: "assets.pinterest.com",
              initiatorType: "image",
              requestUrl: "https://assets.pinterest.com/images/pidgets/pinit_fg_en_round_red_32.png",
              timestampMs: 430
            }
          ]
        }
      }
    }
  });
  assert.equal(staticAssetOutcomes.social_media_embed_pre_consent?.status, "Review signal");

  const placeholderBlockedOutcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {
      hybridRuntimeEvidence: {
        embeddedContentSummary: {
          coverageRetained: true,
          placeholderDetected: true,
          observations: []
        }
      }
    }
  });
  assert.equal(placeholderBlockedOutcomes.social_media_embed_pre_consent?.status, "Not observed");
  assert.equal(
    placeholderBlockedOutcomes.social_media_embed_pre_consent?.criticalEvidence.retainedEvidence.placeholderDetected,
    true
  );

  const ineffectivePlaceholderOutcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {
      hybridRuntimeEvidence: {
        embeddedContentSummary: {
          coverageRetained: true,
          observations: [
            {
              hostname: "player.vimeo.com",
              initiatorType: "iframe",
              placeholderDetected: true,
              requestUrl: "https://player.vimeo.com/video/123",
              timestampMs: 510
            }
          ]
        }
      }
    }
  });
  assert.equal(ineffectivePlaceholderOutcomes.social_media_embed_pre_consent?.status, "Gap observed");
  assert.equal(
    ineffectivePlaceholderOutcomes.social_media_embed_pre_consent?.criticalEvidence.retainedEvidence.placeholderIneffective,
    true
  );

  const notTestableOutcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {
      hybridRuntimeEvidence: {
        networkSummary: {
          totalRequestCount: 2
        }
      }
    },
    snapshot: {
      pages_scanned: 1
    }
  });
  assert.equal(notTestableOutcomes.social_media_embed_pre_consent?.status, "Not testable");
});

test("deriveGdprEprivacyCoveragePolicyOutcomes treats direct same-context sensitive tracking correlation as a gap", () => {
  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    events: [
      {
        eventType: "runtime.build_phase_diagnostic",
        metadataJson: {
          coverageStatus: "usable",
          directVsInferred: "direct",
          evidenceConfidence: "moderate",
          highSensitivityDataCollectionDetected: true,
          phase: "sensitive_third_party_tracking_correlation",
          samePageTrackingObserved: true,
          sensitiveFieldLabels: ["Medical condition"],
          sensitiveFormUrls: ["https://example.com/appointment"],
          status: "ok",
          thirdPartyTrackingCategories: ["analytics"],
          thirdPartyTrackingVendors: ["Google Analytics"]
        }
      }
    ]
  });

  assert.equal(outcomes.sensitive_surfaces_third_party_tracking?.status, "Gap observed");
  assert.deepEqual(
    outcomes.sensitive_surfaces_third_party_tracking?.criticalEvidence.missingOrIncompleteSourceSignals,
    []
  );
  assert.match(
    outcomes.sensitive_surfaces_third_party_tracking?.limitation ?? "",
    /sensitive or high-risk collection surface/i
  );
});

test("deriveGdprEprivacyCoveragePolicyOutcomes keeps footer ad-choice controls as post-choice review signals", () => {
  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {
      hybridRuntimeEvidence: {
        consentControlLifecycleEvidence: {
          coverageStatus: "usable",
          cookiePreferencesLinkObserved: false,
          footerPreferenceLinkObserved: true,
          initialConsentLayerObserved: false,
          observedControls: [
            {
              href: "https://example.com/privacy#ads",
              text: "Ad Choices"
            },
            {
              text: "Close preference center"
            },
            {
              href: "https://tools.google.com/dlpage/gaoptout",
              text: "Google Analytics Opt-Out"
            }
          ],
          postChoicePreferenceControlClickOutcome: {
            outcome: "opened_preference_center"
          },
          privacyControlPlacement: "footer",
          surfacePurpose: "targeted_ads_opt_out"
        }
      }
    }
  });

  assert.equal(outcomes.preference_withdrawal_control?.status, "Review signal");
  assert.match(
    outcomes.preference_withdrawal_control?.limitation ?? "",
    /did not confirm a GDPR\/ePrivacy cookie preference center or consent-withdrawal control/i
  );
  assert.equal(
    outcomes.preference_withdrawal_control?.criticalEvidence.retainedEvidence.cookiePreferencesLinkObserved,
    false
  );
  assert.equal(
    outcomes.preference_withdrawal_control?.criticalEvidence.retainedEvidence.openedCookieConsentPreferenceCenter,
    false
  );
  assert.equal(
    outcomes.preference_withdrawal_control?.criticalEvidence.retainedEvidence.privacyAdChoiceOnlyControlObserved,
    true
  );
  assert.deepEqual(outcomes.preference_withdrawal_control?.criticalEvidence.projectedFindings, []);
});

test("deriveGdprEprivacyCoveragePolicyOutcomes treats cookie preference withdrawal controls as observed", () => {
  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {
      hybridRuntimeEvidence: {
        consentControlLifecycleEvidence: {
          cmpReopenControlObserved: true,
          coverageStatus: "usable",
          cookiePreferencesLinkObserved: true,
          initialConsentLayerObserved: true,
          observedControls: [
            {
              href: "https://example.com/#cookie-preferences",
              text: "Cookie Preferences"
            }
          ],
          postChoicePreferenceControlClickOutcome: {
            outcome: "opened_preference_center"
          },
          withdrawalTextObserved: true
        }
      }
    }
  });

  assert.equal(outcomes.preference_withdrawal_control?.status, "Observed");
  assert.match(outcomes.preference_withdrawal_control?.limitation ?? "", /post-choice consent or preference control/i);
  assert.equal(
    outcomes.preference_withdrawal_control?.criticalEvidence.retainedEvidence.openedCookieConsentPreferenceCenter,
    true
  );
  assert.deepEqual(
    outcomes.preference_withdrawal_control?.criticalEvidence.retainedEvidence.cookieConsentControlLabels,
    ["Cookie Preferences"]
  );
});

test("deriveGdprEprivacyCoveragePolicyOutcomes keeps disconnected sensitive tracking correlation as review", () => {
  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    events: [
      {
        eventType: "runtime.build_phase_diagnostic",
        metadataJson: {
          coverageStatus: "usable",
          directVsInferred: "direct",
          evidenceConfidence: "moderate",
          highSensitivityDataCollectionDetected: true,
          phase: "sensitive_third_party_tracking_correlation",
          samePageTrackingObserved: false,
          sameFlowTrackingObserved: false,
          sensitiveFieldLabels: ["Medical condition"],
          status: "ok",
          thirdPartyTrackingCategories: ["analytics"],
          thirdPartyTrackingVendors: ["Google Analytics"]
        }
      }
    ]
  });

  assert.equal(outcomes.sensitive_surfaces_third_party_tracking?.status, "Review signal");
  assert.match(
    outcomes.sensitive_surfaces_third_party_tracking?.limitation ?? "",
    /does not conclusively establish same-context sensitive payload exposure/i
  );
});

test("deriveGdprEprivacyCoveragePolicyOutcomes demotes fallback-only sensitive tracking correlation to review", () => {
  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    events: [
      {
        eventType: "runtime.build_phase_diagnostic",
        metadataJson: {
          coverageStatus: "usable",
          directVsInferred: "direct",
          evidenceConfidence: "moderate",
          evidenceStrengthFlags: ["fallback_only", "policy_text"],
          highSensitivityDataCollectionDetected: true,
          phase: "sensitive_third_party_tracking_correlation",
          samePageTrackingObserved: true,
          sensitiveFieldLabels: ["Medical condition"],
          status: "ok",
          thirdPartyTrackingVendors: ["Google Analytics"]
        }
      }
    ]
  });

  assert.equal(outcomes.sensitive_surfaces_third_party_tracking?.status, "Review signal");
  assert.match(
    outcomes.sensitive_surfaces_third_party_tracking?.limitation ?? "",
    /does not conclusively establish same-context sensitive payload exposure/i
  );
});

test("deriveGdprEprivacyCoveragePolicyOutcomes marks retained sensitive 3rd party payload exposure as a gap", () => {
  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    events: [
      {
        eventType: "runtime.build_phase_diagnostic",
        metadataJson: {
          coverageStatus: "usable",
          evidenceConfidence: "moderate",
          phase: "sensitive_third_party_tracking_correlation",
          sensitivePayloadViolations: [
            {
              detectedType: "email",
              evidenceStrength: "concrete_payload",
              payloadExposureObserved: true,
              requestUrl: "https://tracker.example.test/collect",
              vendorHost: "tracker.example.test"
            }
          ],
          status: "ok"
        }
      }
    ]
  });

  assert.equal(outcomes.sensitive_surfaces_third_party_tracking?.status, "Gap observed");
  assert.match(
    outcomes.sensitive_surfaces_third_party_tracking?.limitation ?? "",
    /sensitive or personal-data value associated with a 3rd party request/i
  );
  assert.equal(
    outcomes.sensitive_surfaces_third_party_tracking?.criticalEvidence.retainedEvidence.payloadExposureObserved,
    true
  );
});

test("deriveGdprEprivacyCoveragePolicyOutcomes keeps generic concrete-payload provenance without exposure or same-flow linkage as review", () => {
  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    events: [
      {
        eventType: "runtime.build_phase_diagnostic",
        metadataJson: {
          coverageStatus: "usable",
          directVsInferred: "inferred",
          evidenceConfidence: "moderate",
          highSensitivityDataCollectionDetected: true,
          phase: "sensitive_third_party_tracking_correlation",
          samePageTrackingObserved: false,
          sameFlowTrackingObserved: false,
          sensitivePayloadViolations: [
            {
              evidenceStrength: "concrete_payload",
              payloadExposureObserved: false,
              requestUrl: "https://tracker.example.test/collect",
              sameFlowLinkage: {
                samePageOrFlow: false,
                userValueObserved: false
              },
              vendorHost: "tracker.example.test"
            }
          ],
          status: "ok",
          thirdPartyTrackingVendors: ["Example Analytics"]
        }
      }
    ]
  });

  assert.equal(outcomes.sensitive_surfaces_third_party_tracking?.status, "Review signal");
  assert.match(
    outcomes.sensitive_surfaces_third_party_tracking?.limitation ?? "",
    /does not conclusively establish same-context sensitive payload exposure/i
  );
  assert.equal(
    outcomes.sensitive_surfaces_third_party_tracking?.criticalEvidence.retainedEvidence.payloadExposureObserved,
    false
  );
});

test("deriveGdprEprivacyCoveragePolicyOutcomes marks completed consent surface checks without a surface as not observed", () => {
  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    events: [
      {
        eventType: "runtime.build_phase_diagnostic",
        metadataJson: {
          phase: "browser_runtime_capture",
          status: "ok"
        }
      }
    ],
    snapshot: {
      cookie_banner_present: false
    }
  });

  assert.equal(outcomes.consent_surface_observed?.status, "Not observed");
  assert.match(outcomes.consent_surface_observed?.limitation ?? "", /did not retain an actionable consent surface/i);
});

test("deriveGdprEprivacyCoveragePolicyOutcomes projects preview consent lifecycle limitations into row outcomes", () => {
  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {
      consent_audit_completed: false,
      consent_actionable_choice_observed: false,
      consent_blocker_text_snippet:
        "Stopped before homepage setup because preflight already verified the core legal docs and urlscan provided enough runtime evidence for the lean scan path.",
      consent_surface_observed: false,
      hybridRuntimeEvidence: {
        consentLifecycleAudit: {
          actionableChoiceObserved: false,
          attempted: false,
          blockerTextSnippet:
            "Stopped before homepage setup because preflight already verified the core legal docs and urlscan provided enough runtime evidence for the lean scan path.",
          consentSurfaceObserved: false,
          reason: "preview_preflight_short_circuit",
          requiredFullRuntimeAudit: true
        }
      }
    }
  });

  assert.equal(outcomes.reject_all_path_availability?.status, "Not testable");
  assert.equal(outcomes.reject_all_path_availability?.criticalEvidence.pipeline.projectionStage, "coverage_policy");
  assert.match(outcomes.reject_all_path_availability?.limitation ?? "", /did not run consent lifecycle/i);
  assert.equal(outcomes.post_reject_tracking_reduction?.status, "Not testable");
  assert.equal(outcomes.preference_withdrawal_control?.status, "Not testable");
  assert.deepEqual(outcomes.reject_all_path_availability?.evidenceRefs, [
    "Evidence: consent lifecycle audit limitation",
    "Limitation reason: preview_preflight_short_circuit"
  ]);
});

test("deriveGdprEprivacyCoveragePolicyOutcomes keeps completed consent audits with missing lifecycle as not confirmed for withdrawal controls", () => {
  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {
      consent_audit_completed: true,
      consent_actionable_choice_observed: true,
      consent_surface_observed: true
    }
  });

  assert.equal(outcomes.preference_withdrawal_control?.status, "Not confirmed");
  assert.match(outcomes.preference_withdrawal_control?.limitation ?? "", /consent interaction audit completed/i);
  assert.equal(
    outcomes.preference_withdrawal_control?.criticalEvidence.retainedEvidence.consentAuditCompleted,
    true
  );
  assert.equal(
    outcomes.preference_withdrawal_control?.criticalEvidence.retainedEvidence.consentSurfaceObserved,
    true
  );
  assert.equal(
    outcomes.preference_withdrawal_control?.criticalEvidence.missingOrIncompleteSourceSignals?.[0]?.field,
    "scan_runtime_artifacts.hybrid_runtime_evidence.consentControlLifecycleEvidence"
  );
});

test("deriveGdprEprivacyCoveragePolicyOutcomes does not emit policy/vendor alignment when comparison artifact is missing", () => {
  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    snapshot: {
      privacy_policy_present: true,
      tracker_vendor_count: 2
    }
  });

  assert.equal(outcomes.runtime_vendor_disclosure_alignment, undefined);
});

test("deriveGdprEprivacyCoveragePolicyOutcomes does not gap vendor alignment when no runtime vendors were retained", () => {
  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    snapshot: {
      privacy_policy_present: true,
      tracker_vendor_count: 0
    }
  });

  assert.equal(outcomes.runtime_vendor_disclosure_alignment, undefined);
});

test("deriveGdprEprivacyCoveragePolicyOutcomes does not emit vendor alignment for retained runtime vendors without policy surface", () => {
  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    snapshot: {
      privacy_policy_present: false,
      tracker_vendor_count: 2
    }
  });

  assert.equal(outcomes.runtime_vendor_disclosure_alignment, undefined);
});

test("deriveGdprEprivacyCoveragePolicyOutcomes ignores retained vendor-disclosure comparison evidence for broad alignment row", () => {
  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {
      runtimeVendorDisclosureEvidence: [
        {
          coverageStatus: "usable",
          directVsInferred: "direct",
          evidenceConfidence: "moderate",
          matchedVendorDisclosureCount: 0,
          mismatchRationale: "Observed runtime vendor was not clearly matched in retained disclosure evidence.",
          observedRuntimeDomains: ["k.clarity.ms"],
          observedRuntimeVendors: ["Microsoft Clarity"],
          policySurfacesSearched: [
            {
              reached: true,
              searchedTerms: ["Microsoft Clarity", "clarity.ms"],
              snippet: "Our website uses persistent cookies with a third party technology partner.",
              type: "privacy_policy",
              unmatchedVendorNames: ["Microsoft Clarity"],
              url: "https://example.test/privacy"
            }
          ],
          subtype: "runtime_vendor_not_disclosed",
          unmatchedRuntimeDomains: ["k.clarity.ms"],
          unmatchedRuntimeVendors: ["Microsoft Clarity"],
          unmatchedVendorDisclosureCount: 1
        }
      ]
    },
    snapshot: {
      privacy_policy_present: true,
      tracker_vendor_count: 1
    }
  });

  assert.equal(outcomes.runtime_vendor_disclosure_alignment, undefined);
});

test("deriveGdprEprivacyCoveragePolicyOutcomes does not emit broad alignment for usable matched vendor-disclosure comparison", () => {
  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {
      runtimeVendorDisclosureEvidence: [
        {
          coverageStatus: "usable",
          directVsInferred: "direct",
          evidenceConfidence: "moderate",
          matchedVendorDisclosureCount: 2,
          mismatchRationale: "Observed runtime vendors were matched by name or known domain alias in retained policy disclosure surfaces.",
          observedRuntimeDomains: ["www.googletagmanager.com", "www.google-analytics.com"],
          observedRuntimeVendors: ["Google Tag Manager", "Google Analytics"],
          policySurfacesSearched: [
            {
              matchedVendorNames: ["Google Tag Manager", "Google Analytics"],
              reached: true,
              searchedTerms: ["Google Tag Manager", "Google Analytics"],
              snippet: "We use Google Tag Manager and Google Analytics.",
              type: "privacy_policy",
              unmatchedVendorNames: [],
              url: "https://example.test/privacy"
            }
          ],
          subtype: "runtime_vendor_not_disclosed",
          unmatchedRuntimeDomains: [],
          unmatchedRuntimeVendors: [],
          unmatchedVendorDisclosureCount: 0
        }
      ]
    },
    snapshot: {
      privacy_policy_present: true,
      tracker_vendor_count: 2
    }
  });

  assert.equal(outcomes.runtime_vendor_disclosure_alignment, undefined);
});

test("deriveGdprEprivacyCoveragePolicyOutcomes does not emit broad alignment for partial runtime vendor disclosure mismatch", () => {
  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {
      runtimeVendorDisclosureEvidence: [
        {
          coverageStatus: "usable",
          directVsInferred: "direct",
          evidenceConfidence: "moderate",
          matchedVendorDisclosureCount: 1,
          mismatchRationale:
            "Observed runtime vendors (Cloudflare Web Analytics, Google Tag Manager) were not clearly matched by name or known domain alias in retained policy disclosure surfaces.",
          observedRuntimeDomains: [
            "www.googletagmanager.com",
            "static.cloudflareinsights.com",
            "www.google-analytics.com"
          ],
          observedRuntimeVendors: [
            "Cloudflare Web Analytics",
            "Google Analytics",
            "Google Tag Manager"
          ],
          policySurfacesSearched: [
            {
              matchedVendorNames: ["Google Analytics"],
              reached: true,
              searchedTerms: ["Cloudflare Web Analytics", "Google Analytics", "Google Tag Manager"],
              snippet: "The trusted third parties with whom we directly work include Google Analytics.",
              type: "privacy_policy",
              unmatchedVendorNames: ["Cloudflare Web Analytics", "Google Tag Manager"],
              url: "https://www.caltech.edu/privacy-notice"
            }
          ],
          subtype: "runtime_vendor_not_disclosed",
          unmatchedRuntimeDomains: ["www.googletagmanager.com"],
          unmatchedRuntimeVendors: ["Cloudflare Web Analytics", "Google Tag Manager"],
          unmatchedVendorDisclosureCount: 2
        }
      ]
    },
    snapshot: {
      privacy_policy_present: true,
      tracker_vendor_count: 3
    }
  });

  assert.equal(outcomes.runtime_vendor_disclosure_alignment, undefined);
});

test("deriveGdprEprivacyCoveragePolicyOutcomes surfaces post-accept session replay as observed evidence", () => {
  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {
      consentAcceptInteractionSucceeded: true,
      consentAcceptNewTrackerVendorNames: ["Microsoft Clarity"],
      consentPostAcceptTrackerEvidenceUrls: [
        "https://www.clarity.ms/tag/example",
        "https://c.clarity.ms/collect"
      ],
      consentPostAcceptTrackerVendorNames: ["Microsoft Clarity"],
      hybridRuntimeEvidence: {
        sessionReplayEvidenceSummary: {
          collectionEndpointObserved: true,
          libraryOnly: false,
          maskingOrExclusionObserved: false,
          sensitiveSurfaceOverlap: false,
          vendors: ["Microsoft Clarity"]
        }
      },
      requestPurposeClassificationConfidence: [
        {
          category: "session_replay",
          confidence: 0.9,
          essentiality: "non_essential",
          firstObservedMs: 2410,
          requestUrl: "https://www.clarity.ms/tag/example",
          runtimePhase: "post_accept",
          timingStatus: "post_consent",
          vendor: "Microsoft Clarity"
        },
        {
          category: "session_replay",
          confidence: 0.9,
          essentiality: "non_essential",
          firstObservedMs: 2680,
          requestUrl: "https://c.clarity.ms/collect",
          runtimePhase: "post_accept",
          timingStatus: "post_consent",
          vendor: "Microsoft Clarity"
        }
      ],
      runtimeVendorDisclosureEvidence: [
        {
          coverageStatus: "usable",
          directVsInferred: "direct",
          evidenceConfidence: "moderate",
          matchedVendorDisclosureCount: 0,
          mismatchRationale: "Microsoft Clarity was not clearly matched in retained policy text.",
          observedRuntimeDomains: ["clarity.ms"],
          observedRuntimeVendors: ["Microsoft Clarity"],
          policySurfacesSearched: [],
          subtype: "runtime_vendor_not_disclosed",
          unmatchedRuntimeDomains: ["clarity.ms"],
          unmatchedRuntimeVendors: ["Microsoft Clarity"],
          unmatchedVendorDisclosureCount: 1
        }
      ]
    },
    snapshot: {
      session_replay_tool_detected: false,
      session_replay_tracker_count: 0
    }
  });

  const outcome = outcomes.session_replay_fingerprinting_review;
  assert.equal(outcome?.status, "Observed");
  assert.match(outcome?.limitation ?? "", /no pre-consent replay evidence was retained/i);
  assert.deepEqual(outcome?.evidenceRefs, [
    "Session replay signal observed after consent",
    "First session replay signal: 2.41s after scan start",
    "Runtime vendor: Microsoft Clarity",
    "Consent state: post_accept"
  ]);
  assert.deepEqual(
    outcome?.criticalEvidence.retainedEvidence.sessionReplayEvidence,
    {
      acceptInteractionConfirmed: true,
      collectionEndpointObserved: true,
      consentStates: ["post_accept"],
      firstSeenMs: 2410,
      libraryLoadObserved: true,
      maskingOrExclusionObserved: false,
      postAcceptObserved: true,
      postChoiceConsentControlsObserved: false,
      preConsentObserved: false,
      requestUrls: [
        "https://www.clarity.ms/tag/example",
        "https://c.clarity.ms/collect"
      ],
      sensitiveSurfaceOverlap: false,
      vendorDisclosed: false,
      vendorDisclosureComparisonObserved: true,
      vendorDisclosureGap: true,
      vendorDisclosureMatchedCount: 0,
      vendorDisclosureUnmatchedCount: 1,
      vendors: ["Microsoft Clarity"]
    }
  );
  assert.equal(outcomes.session_replay_disclosure_alignment?.status, "Gap observed");
  assert.match(outcomes.session_replay_disclosure_alignment?.limitation ?? "", /did not clearly disclose/i);
});

test("deriveGdprEprivacyCoveragePolicyOutcomes declares retained session replay vendor without pre-consent replay as observed", () => {
  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {
      sessionReplayEvidenceSummary: {
        collectionEndpointObserved: true,
        libraryOnly: false,
        vendors: ["Microsoft Clarity"]
      }
    },
    snapshot: {
      session_replay_runtime_artifacts: [
        "vendor:Microsoft Clarity|signature:clarity|host:www.clarity.ms|source:script_signature"
      ],
      session_replay_tracker_count: 0,
      session_replay_vendor_names: ["Microsoft Clarity"]
    }
  });

  const outcome = outcomes.session_replay_fingerprinting_review;
  assert.equal(outcome?.status, "Observed");
  assert.match(outcome?.limitation ?? "", /does not confirm the signal fired before consent/i);
  assert.deepEqual(outcome?.evidenceRefs, [
    "Session replay signal observed; pre-consent timing not confirmed",
    "Runtime vendor: Microsoft Clarity",
    "Consent timing: not confirmed as pre-consent"
  ]);
  assert.deepEqual(
    outcome?.criticalEvidence.retainedEvidence.sessionReplayEvidence,
    {
      collectionEndpointObserved: true,
      libraryLoadObserved: false,
      postAcceptObserved: false,
      postChoiceConsentControlsObserved: false,
      preConsentObserved: false,
      runtimeArtifacts: [
        "vendor:Microsoft Clarity|signature:clarity|host:www.clarity.ms|source:script_signature"
      ],
      vendorDisclosed: false,
      vendorDisclosureComparisonObserved: false,
      vendorDisclosureGap: false,
      vendorDisclosureMatchedCount: 0,
      vendorDisclosureUnmatchedCount: 0,
      vendors: ["Microsoft Clarity"]
    }
  );
});

test("deriveGdprEprivacyCoveragePolicyOutcomes separates weak browser entropy from session replay", () => {
  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    events: [
      {
        eventType: "runtime.build_phase_diagnostic",
        metadataJson: {
          phase: "browser_runtime_capture",
          status: "ok"
        }
      }
    ],
    runtimeArtifacts: {
      hybridRuntimeEvidence: {
        fingerprintingRuntimeEvidence: [
          {
            entropyLinkedToIdentifier: false,
            entropyTransmissionObserved: false,
            fingerprintAttributeCategories: ["screen", "userAgent", "platform", "canvas", "webgl"],
            host: "ca-times.brightspotcdn.com",
            knownFingerprintLibraryMatch: null
          }
        ]
      }
    },
    snapshot: {
      fingerprinting_detected: true,
      session_replay_tool_detected: false,
      session_replay_tracker_count: 0
    }
  });

  const outcome = outcomes.session_replay_fingerprinting_review;
  assert.equal(outcome?.status, "Insufficient evidence");
  assert.match(outcome?.limitation ?? "", /context/i);
  assert.doesNotMatch(outcome?.limitation ?? "", /Session replay \/ behavioral analytics/i);
  assert.equal(outcome?.criticalEvidence.retainedEvidence.sessionReplayObserved, false);
  assert.deepEqual(outcome?.criticalEvidence.retainedEvidence.browserDeviceEntropyEvidence, {
    entropyLinkedToIdentifier: false,
    entropyTransmissionObserved: false,
    fingerprintingRuntimeEvidenceCount: 1,
    highEntropySignals: ["screen", "userAgent", "platform", "canvas", "webgl"],
    hosts: ["ca-times.brightspotcdn.com"],
    strongCorroboratorObserved: false
  });
});

test("deriveGdprEprivacyCoveragePolicyOutcomes consumes WS01 session replay summary request and timing evidence", () => {
  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {
      hybridRuntimeEvidence: {
        sessionReplayEvidenceSummary: {
          artifactCount: 1,
          collectionEndpointObserved: true,
          consentStates: ["pre_consent"],
          firstSeenMs: 250,
          libraryOnly: false,
          maskingOrExclusionBasis: [],
          maskingOrExclusionObserved: false,
          preConsentObserved: true,
          requestUrls: ["https://static.hotjar.com/c/hotjar-123.js"],
          sensitiveSurfaceOverlap: false,
          scriptHosts: ["static.hotjar.com"],
          vendors: ["Hotjar"]
        }
      }
    },
    snapshot: {
      session_replay_tracker_count: 1,
      session_replay_tool_detected: true
    }
  });

  const outcome = outcomes.session_replay_fingerprinting_review;
  const beforeConsentOutcome = outcomes.session_replay_before_consent;
  assert.equal(outcome?.status, "Review signal");
  assert.equal(beforeConsentOutcome?.status, "Gap observed");
  assert.match(beforeConsentOutcome?.limitation ?? "", /before a recorded consent action/i);
  assert.deepEqual(beforeConsentOutcome?.evidenceRefs, [
    "Session replay signal observed before consent",
    "First session replay signal: 0.250s after scan start",
    "Runtime vendor: Hotjar",
    "Runtime endpoint: https://static.hotjar.com/c/hotjar-123.js",
    "Consent state: pre_consent"
  ]);
  assert.deepEqual(
    beforeConsentOutcome?.criticalEvidence.retainedEvidence.sessionReplayEvidence,
    {
      collectionEndpointObserved: true,
      consentStates: ["pre_consent"],
      firstSeenMs: 250,
      libraryLoadObserved: true,
      maskingOrExclusionObserved: false,
      postAcceptObserved: false,
      postChoiceConsentControlsObserved: false,
      preConsentObserved: true,
      requestUrls: ["https://static.hotjar.com/c/hotjar-123.js"],
      sensitiveSurfaceOverlap: false,
      vendorDisclosed: false,
      vendorDisclosureComparisonObserved: false,
      vendorDisclosureGap: false,
      vendorDisclosureMatchedCount: 0,
      vendorDisclosureUnmatchedCount: 0,
      vendors: ["Hotjar"]
    }
  );
});

test("deriveGdprEprivacyCoveragePolicyOutcomes gaps session replay on sensitive surfaces", () => {
  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {
      hybridRuntimeEvidence: {
        sessionReplayEvidenceSummary: {
          collectionEndpointObserved: true,
          consentStates: ["pre_consent"],
          firstSeenMs: 400,
          libraryOnly: false,
          preConsentObserved: true,
          requestUrls: ["https://c.clarity.ms/collect"],
          sensitiveSurfaceOverlap: true,
          vendors: ["Microsoft Clarity"]
        }
      }
    }
  });

  assert.equal(outcomes.session_replay_fingerprinting_review?.status, "Review signal");
  assert.equal(outcomes.session_replay_sensitive_surface?.status, "Gap observed");
  assert.match(outcomes.session_replay_sensitive_surface?.limitation ?? "", /sensitive collection surface/i);
});

test("deriveGdprEprivacyCoveragePolicyOutcomes does not treat mislabeled Google Analytics as session replay", () => {
  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {
      requestPurposeClassificationConfidence: [
        {
          category: "session_replay",
          requestUrl: "https://www.google-analytics.com/g/collect?v=2",
          runtimePhase: "pre_consent",
          vendor: "Google Analytics"
        },
        {
          category: "session_replay",
          requestUrl: "https://www.googletagmanager.com/gtm.js?id=GTM-TEST",
          runtimePhase: "pre_consent",
          vendor: "Google Tag Manager"
        }
      ]
    },
    snapshot: {
      session_replay_tool_detected: false,
      session_replay_tracker_count: 0
    }
  });

  assert.equal(outcomes.session_replay_fingerprinting_review?.status, "Not observed");
  assert.equal(
    outcomes.session_replay_fingerprinting_review?.criticalEvidence.retainedEvidence.sessionReplayObserved,
    false
  );
});

test("deriveGdprEprivacyCoveragePolicyOutcomes still treats Microsoft Clarity as pre-consent session replay", () => {
  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {
      requestPurposeClassificationConfidence: [
        {
          category: "session_replay",
          requestUrl: "https://c.clarity.ms/collect",
          runtimePhase: "pre_consent",
          vendor: "Microsoft Clarity"
        }
      ]
    },
    snapshot: {
      session_replay_tool_detected: false,
      session_replay_tracker_count: 0
    }
  });

  assert.equal(outcomes.session_replay_fingerprinting_review?.status, "Review signal");
  assert.equal(outcomes.session_replay_before_consent?.status, "Gap observed");
  assert.match(outcomes.session_replay_before_consent?.limitation ?? "", /before a recorded consent action/i);
});

test("deriveGdprEprivacyCoveragePolicyOutcomes consumes nested reject interaction evidence", () => {
  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {
      hybridRuntimeEvidence: {
        consentOutcomeSummary: {
          rejectInteractionSucceeded: true
        }
      }
    }
  });

  assert.equal(outcomes.post_reject_tracking_reduction?.status, "Not testable");
  assert.equal(
    outcomes.post_reject_tracking_reduction?.criticalEvidence.retainedEvidence.productionPosture,
    "post_choice_flow_deferred_from_core"
  );
});

test("deriveGdprEprivacyCoveragePolicyOutcomes marks retained first-layer decline path as observed", () => {
  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {
      consent_reject_interaction_succeeded: true,
      rejectPathDepthAndAvailability: {
        availability: "available",
        completeRejectPathAvailable: true,
        firstLayerConsentChoices: {
          rejectVisibleOnFirstLayer: true,
          visibleChoiceLabels: ["accept", "decline"]
        },
        layerInspected: "first_layer",
        rejectClickDepth: 1,
        rejectInteractionSucceeded: true
      }
    }
  });

  assert.equal(outcomes.reject_all_path_availability?.status, "Observed");
  assert.deepEqual(outcomes.reject_all_path_availability?.evidenceRefs, [
    "Evidence: reject path depth and availability",
    "Layer inspected: first_layer",
    "Reject click depth: 1",
    "Visible choice: decline"
  ]);
});

test("deriveGdprEprivacyCoveragePolicyOutcomes consumes WS01 post-reject reduction artifact statuses", () => {
  const notTestable = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {
      postRejectTrackingReductionEvidence: {
        evidenceSource: "consent_interaction_audit",
        reductionEvaluationStatus: "not_testable",
        rejectInteractionConfirmed: false,
        rejectInteractionFailureClass: "reject_control_not_found",
        rejectInteractionFailureReason:
          "Scanner observed a consent surface but did not retain a reject, essential-only, or opt-out control to click.",
        negativeReasonCodes: ["reject_interaction_not_confirmed", "reject_control_not_found"]
      }
    }
  });
  assert.equal(notTestable.post_reject_tracking_reduction?.status, "Not testable");
  assert.match(notTestable.post_reject_tracking_reduction?.limitation ?? "", /deferred from the current production core scanner/i);
  assert.equal(
    notTestable.post_reject_tracking_reduction?.criticalEvidence.retainedEvidence.rejectInteractionFailureClass,
    "reject_control_not_found"
  );

  const retainedLifecycleSurface = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {
      hybridRuntimeEvidence: {
        consentControlLifecycleEvidence: {
          cmpReopenControlObserved: false,
          trackingRequiringConsentReviewObserved: true,
          controlsSearched: ["cookie settings"],
          cookiePreferencesLinkObserved: false,
          coverageStatus: "usable",
          footerLinksInspected: ["Privacy Notice -> https://www.example.test/privacy"],
          footerPreferenceLinkObserved: false,
          firstLayerCookieConsentBannerObserved: false,
          gdprEprivacyConsentSurfaceObserved: "unconfirmed",
          initialConsentLayerObserved: false,
          observedControls: [],
          pagesChecked: ["https://www.example.test/"],
          policyLinksInspected: ["https://www.example.test/privacy"],
          preferenceCenterReachableAfterInitialLayer: null,
          privacySettingsControlObserved: false,
          withdrawalTextObserved: false
        }
      },
      postRejectTrackingReductionEvidence: {
        evidenceSource: "consent_interaction_audit",
        negativeReasonCodes: ["reject_interaction_not_confirmed", "consent_surface_not_observed"],
        postRejectRequestRecordsObserved: false,
        postRejectWindowAvailable: false,
        reductionEvaluationStatus: "not_testable",
        rejectInteractionConfirmed: false,
        rejectInteractionFailureClass: "consent_surface_not_observed",
        rejectInteractionFailureReason: "Scanner did not retain an observed consent surface during the reject-path audit."
      }
    }
  });
  assert.equal(retainedLifecycleSurface.post_reject_tracking_reduction?.status, "Not testable");
  assert.equal(
    retainedLifecycleSurface.post_reject_tracking_reduction?.criticalEvidence.retainedEvidence.rejectInteractionFailureClass,
    "consent_surface_not_observed"
  );
  assert.match(
    retainedLifecycleSurface.post_reject_tracking_reduction?.limitation ?? "",
    /deferred from the current production core scanner/i
  );
  assert.doesNotMatch(
    retainedLifecycleSurface.post_reject_tracking_reduction?.limitation ?? "",
    /Scanner observed a consent surface/i
  );
  assert.doesNotMatch(JSON.stringify(retainedLifecycleSurface), /consentDependentTrackingObserved/);
  assert.match(JSON.stringify(retainedLifecycleSurface), /trackingRequiringConsentReviewObserved/);

  const insufficient = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {
      postRejectTrackingReductionEvidence: {
        evidenceSource: "consent_interaction_audit",
        reductionEvaluationStatus: "insufficient_evidence",
        rejectInteractionConfirmed: true,
        negativeReasonCodes: ["post_reject_timing_window_missing"]
      }
    }
  });
  assert.equal(insufficient.post_reject_tracking_reduction?.status, "Not testable");

  const rejectNotConfirmed = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {
      postRejectTrackingReductionEvidence: {
        postRejectRequestRecordsObserved: true,
        postRejectWindowAvailable: true,
        reductionEvaluationStatus: "not_testable",
        rejectInteractionConfirmed: false
      }
    }
  });
  assert.equal(rejectNotConfirmed.post_reject_tracking_reduction?.status, "Not testable");

  const postRejectWindowMissing = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {
      postRejectTrackingReductionEvidence: {
        postRejectRequestRecordsObserved: true,
        postRejectWindowAvailable: false,
        reductionEvaluationStatus: "not_testable",
        rejectInteractionConfirmed: true
      }
    }
  });
  assert.equal(postRejectWindowMissing.post_reject_tracking_reduction?.status, "Not testable");

  const reduced = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {
      postRejectTrackingReductionEvidence: {
        evidenceSource: "consent_interaction_audit",
        reasonCodes: ["reject_interaction_succeeded", "post_reject_timing_window_available"],
        postRejectRequestRecordsObserved: true,
        postRejectWindowAvailable: true,
        reductionEvaluationStatus: "reduced",
        rejectInteractionConfirmed: true
      }
    }
  });
  assert.equal(reduced.post_reject_tracking_reduction?.status, "Not testable");
  assert.deepEqual(reduced.post_reject_tracking_reduction?.evidenceRefs, [
    "Evidence: post-reject tracking reduction evidence",
    "reject_interaction_succeeded",
    "post_reject_timing_window_available"
  ]);

  const retainedPersistenceWithoutProjection = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {
      postRejectTrackingReductionEvidence: {
        evidenceSource: "consent_interaction_audit",
        postRejectNonEssentialRequestsRetained: true,
        postRejectRequestRecordsObserved: true,
        postRejectWindowAvailable: true,
        reasonCodes: [
          "reject_interaction_succeeded",
          "post_reject_timing_window_available",
          "post_reject_request_records_observed",
          "post_reject_non_essential_requests_retained"
        ],
        reductionEvaluationStatus: "not_reduced",
        rejectInteractionConfirmed: true
      }
    }
  });
  assert.equal(retainedPersistenceWithoutProjection.post_reject_tracking_reduction?.status, "Not testable");
  assert.equal(
    retainedPersistenceWithoutProjection.post_reject_tracking_reduction?.criticalEvidence.retainedEvidence.productionPosture,
    "post_choice_flow_deferred_from_core"
  );
  assert.deepEqual(retainedPersistenceWithoutProjection.post_reject_tracking_reduction?.criticalEvidence.projectedFindings, []);

  const retainedConcretePersistence = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {
      postRejectTrackingReductionEvidence: {
        evidenceSource: "consent_interaction_audit",
        postRejectNonEssentialRequests: [
          {
            category: "analytics",
            consentState: "after_reject",
            domain: "www.google-analytics.com",
            msAfterReject: 842,
            nonEssential: true,
            reason: "classified analytics request after reject",
            requestUrl: "https://www.google-analytics.com/g/collect",
            vendor: "Google Analytics"
          }
        ],
        postRejectNonEssentialRequestsRetained: true,
        postRejectRequestRecordsObserved: true,
        postRejectWindowAvailable: true,
        reasonCodes: [
          "reject_interaction_succeeded",
          "post_reject_timing_window_available",
          "post_reject_request_records_observed",
          "post_reject_non_essential_requests_retained"
        ],
        reductionEvaluationStatus: "not_reduced",
        rejectInteractionConfirmed: true
      }
    }
  });
  assert.equal(retainedConcretePersistence.post_reject_tracking_reduction?.status, "Not testable");
  assert.equal(
    retainedConcretePersistence.post_reject_tracking_reduction?.criticalEvidence.retainedEvidence.concretePostRejectNonEssentialDetailsRetained,
    true
  );

  const retainedSessionReplayPersistence = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {
      postRejectTrackingReductionEvidence: {
        evidenceSource: "consent_interaction_audit",
        postRejectNonEssentialRequests: [
          {
            category: "session_replay",
            consentState: "after_reject",
            domain: "c.clarity.ms",
            msAfterReject: 842,
            nonEssential: true,
            reason: "classified session replay request after reject",
            requestUrl: "https://c.clarity.ms/collect",
            vendor: "Microsoft Clarity"
          }
        ],
        postRejectNonEssentialRequestsRetained: true,
        postRejectRequestRecordsObserved: true,
        postRejectWindowAvailable: true,
        reasonCodes: [
          "reject_interaction_succeeded",
          "post_reject_timing_window_available",
          "post_reject_request_records_observed",
          "post_reject_non_essential_requests_retained"
        ],
        reductionEvaluationStatus: "not_reduced",
        rejectInteractionConfirmed: true
      }
    }
  });
  assert.equal(retainedSessionReplayPersistence.session_replay_after_refusal?.status, "Not testable");
  assert.match(retainedSessionReplayPersistence.session_replay_after_refusal?.limitation ?? "", /deferred from the current production core scanner/i);
});

test("deriveGdprEprivacyCoveragePolicyOutcomes keeps general page accessibility issues as consent-control review", () => {
  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {
      accessibilityAxeEvidence: [
        {
          help: "ARIA input fields must have an accessible name",
          impact: "serious",
          pageUrl: "https://www.caltech.edu/",
          representativeSelectors: [".grid-carousel__carousel-inner"],
          ruleId: "aria-input-field-name"
        },
        {
          help: "Certain ARIA roles must contain particular children",
          impact: "critical",
          pageUrl: "https://www.caltech.edu/",
          representativeSelectors: [".grid-carousel__carousel-inner"],
          ruleId: "aria-required-children"
        }
      ],
      californiaPrivacyEvidence: {
        examplesAreGeneralPageOnly: true,
        privacyControlAccessibilityIssueObserved: false,
        privacyControlAccessibilitySignals: []
      },
      visualAccessReview: {
        retained: true
      }
    },
    snapshot: {
      wcag_aria_error_count: 4,
      wcag_focus_indicator_issue_count: 0,
      wcag_form_label_error_count: 0,
      wcag_keyboard_navigation_issue_count: 0
    }
  });

  assert.equal(outcomes.accessibility_consent_controls?.status, "Not observed");
  assert.match(
    outcomes.accessibility_consent_controls?.limitation ?? "",
    /general page or navigation control/i
  );
  assert.match(
    outcomes.accessibility_consent_controls?.limitation ?? "",
    /did not tie the retained examples to the observed consent banner/i
  );
  assert.equal(
    outcomes.accessibility_consent_controls?.criticalEvidence.retainedEvidence.controlAccessibilityIssueObserved,
    false
  );
  assert.equal(
    outcomes.accessibility_consent_controls?.criticalEvidence.retainedEvidence.examplesAreGeneralPageOnly,
    true
  );
});

test("deriveGdprEprivacyCoveragePolicyOutcomes keeps legacy ambiguous page accessibility evidence in review", () => {
  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {
      accessibilityAxeEvidence: [
        {
          help: "ARIA input fields must have an accessible name",
          impact: "serious",
          pageUrl: "https://www.caltech.edu/",
          representativeSelectors: [".grid-carousel__carousel-inner"],
          ruleId: "aria-input-field-name"
        }
      ],
      californiaPrivacyEvidence: {
        privacyControlAccessibilityIssueObserved: false,
        privacyControlAccessibilitySignals: []
      },
      visualAccessReview: {
        retained: true
      }
    },
    snapshot: {
      wcag_aria_error_count: 1,
      wcag_focus_indicator_issue_count: 0,
      wcag_form_label_error_count: 0,
      wcag_keyboard_navigation_issue_count: 0
    }
  });

  assert.equal(outcomes.accessibility_consent_controls?.status, "Review signal");
  assert.match(
    outcomes.accessibility_consent_controls?.limitation ?? "",
    /not clearly tied to consent or privacy-choice controls/i
  );
});

test("deriveGdprEprivacyCoveragePolicyOutcomes marks clean consent-control accessibility checks as not observed", () => {
  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {
      californiaPrivacyEvidence: {
        privacyControlAccessibilityIssueObserved: false,
        privacyControlAccessibilitySignals: []
      },
      visualAccessReview: {
        retained: true
      }
    },
    snapshot: {
      cookie_banner_present: true,
      wcag_aria_error_count: 0,
      wcag_focus_indicator_issue_count: 0,
      wcag_form_label_error_count: 0,
      wcag_keyboard_navigation_issue_count: 0
    }
  });

  assert.equal(outcomes.accessibility_consent_controls?.status, "Not observed");
  assert.match(
    outcomes.accessibility_consent_controls?.limitation ?? "",
    /No basic automated accessibility issue was retained/i
  );
});

test("deriveGdprEprivacyCoveragePolicyOutcomes keeps privacy-choice-only accessibility surfaces out of generic consent surface evidence", () => {
  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {
      californiaPrivacyEvidence: {
        cookieConsentAccessibilityIssueObserved: false,
        gdprCookieConsentSurfaceObserved: false,
        privacyAdChoiceSurfaceObserved: true,
        privacyChoiceAccessibilityIssueObserved: false,
        privacyChoiceSurfaceObserved: true,
        privacyControlAccessibilityIssueObserved: false,
        privacyControlAccessibilitySignals: []
      },
      consentSurfaceObserved: true,
      visualAccessReview: {
        retained: true
      }
    },
    snapshot: {
      cookie_banner_present: true,
      wcag_aria_error_count: 0,
      wcag_focus_indicator_issue_count: 0,
      wcag_form_label_error_count: 0,
      wcag_keyboard_navigation_issue_count: 0
    }
  });

  assert.equal(outcomes.accessibility_consent_controls?.status, "Not observed");
  assert.equal(
    outcomes.accessibility_consent_controls?.criticalEvidence.retainedEvidence.consentSurfaceObserved,
    false
  );
  assert.equal(
    outcomes.accessibility_consent_controls?.criticalEvidence.retainedEvidence.privacyChoiceSurfaceObserved,
    true
  );
  assert.equal(
    outcomes.accessibility_consent_controls?.criticalEvidence.retainedEvidence.gdprCookieConsentSurfaceObserved,
    false
  );
});

test("deriveGdprEprivacyCoveragePolicyOutcomes flags retained consent-control accessibility evidence as a gap", () => {
  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {
      accessibilityAxeEvidence: [
        {
          help: "Buttons must have discernible text",
          impact: "serious",
          pageUrl: "https://example.com/",
          representativeSelectors: ["button.cookie-settings"],
          ruleId: "button-name"
        }
      ],
      californiaPrivacyEvidence: {
        privacyControlAccessibilityIssueObserved: true,
        privacyControlAccessibilitySignals: ["button-name"]
      }
    },
    snapshot: {
      wcag_aria_error_count: 1
    }
  });

  assert.equal(outcomes.accessibility_consent_controls?.status, "Gap observed");
  assert.deepEqual(
    outcomes.accessibility_consent_controls?.criticalEvidence.missingOrIncompleteSourceSignals,
    []
  );
  assert.deepEqual(
    outcomes.accessibility_consent_controls?.criticalEvidence.retainedEvidence.controlAccessibilitySignals,
    ["button-name"]
  );
});

test("deriveGdprEprivacyCoveragePolicyOutcomes flags retained privacy-choice accessibility evidence as a gap", () => {
  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {
      accessibilityAxeEvidence: [
        {
          help: "Buttons must have discernible text",
          impact: "serious",
          pageUrl: "https://example.com/",
          representativeSelectors: ["button.privacy-settings"],
          ruleId: "button-name"
        }
      ],
      californiaPrivacyEvidence: {
        cookieConsentAccessibilityIssueObserved: false,
        gdprCookieConsentSurfaceObserved: false,
        privacyAdChoiceSurfaceObserved: true,
        privacyChoiceAccessibilityIssueObserved: true,
        privacyChoiceSurfaceObserved: true,
        privacyControlAccessibilityIssueObserved: true,
        privacyControlAccessibilitySignals: ["button-name"]
      }
    },
    snapshot: {
      wcag_aria_error_count: 1
    }
  });

  assert.equal(outcomes.accessibility_consent_controls?.status, "Gap observed");
  assert.equal(
    outcomes.accessibility_consent_controls?.criticalEvidence.retainedEvidence.gdprCookieConsentSurfaceObserved,
    false
  );
  assert.equal(
    outcomes.accessibility_consent_controls?.criticalEvidence.retainedEvidence.privacyChoiceAccessibilityIssueObserved,
    true
  );
});

test("deriveGdprEprivacyCoveragePolicyOutcomes does not promote collapsed accessibility evidence when explicit split says no control issue", () => {
  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {
      accessibilityAxeEvidence: [
        {
          help: "Buttons must have discernible text",
          impact: "serious",
          pageUrl: "https://example.com/",
          representativeSelectors: ["button.site-nav"],
          ruleId: "button-name"
        }
      ],
      californiaPrivacyEvidence: {
        cookieConsentAccessibilityIssueObserved: false,
        examplesAreGeneralPageOnly: true,
        gdprCookieConsentSurfaceObserved: false,
        privacyChoiceAccessibilityIssueObserved: false,
        privacyChoiceSurfaceObserved: true,
        privacyControlAccessibilityIssueObserved: true,
        privacyControlAccessibilitySignals: ["button-name"]
      }
    },
    snapshot: {
      wcag_aria_error_count: 1
    }
  });

  assert.equal(outcomes.accessibility_consent_controls?.status, "Review signal");
  assert.notEqual(outcomes.accessibility_consent_controls?.status, "Gap observed");
});

test("deriveGdprEprivacyCoveragePolicyOutcomes consumes consent control lifecycle evidence", () => {
  const observed = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {
      hybridRuntimeEvidence: {
        consentControlLifecycleEvidence: {
          controlsSearched: ["cookie preferences"],
          cookiePreferencesLinkObserved: true,
          coverageStatus: "usable",
          evidenceRefs: ["post_reject_consent_control_lifecycle"],
          footerLinksInspected: ["Cookie Preferences -> https://example.test/cookies"],
          initialConsentLayerObserved: true,
	          observedControls: [
	            {
	              pageUrl: "https://example.test/",
	              source: "footer_link",
	              text: "Cookie Preferences"
	            }
	          ],
	          pagesChecked: ["https://example.test/"],
	          postChoicePreferenceControlClickOutcome: {
	            attempted: true,
	            controlText: "Cookie Preferences",
	            finalUrl: "https://example.test/cookies",
	            href: "https://example.test/cookies",
	            outcome: "navigated_to_policy_or_notice",
	            pageUrl: "https://example.test/",
	            source: "footer_link"
	          },
	          preferenceCenterReachableAfterInitialLayer: true
	        }
	      }
    }
  });

  assert.equal(observed.preference_withdrawal_control?.status, "Observed");
	  assert.deepEqual(observed.preference_withdrawal_control?.evidenceRefs, [
	    "Evidence: consent control lifecycle",
	    "post_reject_consent_control_lifecycle",
	    "Observed control: Cookie Preferences",
	    "Post-choice control outcome: navigated_to_policy_or_notice"
	  ]);

  const notObserved = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {
      hybridRuntimeEvidence: {
        consentControlLifecycleEvidence: {
          controlsSearched: ["cookie preferences"],
          cmpReopenControlObserved: false,
          coverageStatus: "usable",
          evidenceRefs: ["post_reject_consent_control_lifecycle"],
          footerLinksInspected: ["Privacy Notice -> https://example.test/privacy"],
          initialConsentLayerObserved: true,
          observedControls: [],
          pagesChecked: ["https://example.test/"],
          preferenceCenterReachableAfterInitialLayer: false
        }
      }
    }
  });

  assert.equal(notObserved.preference_withdrawal_control?.status, "Gap observed");
  assert.match(notObserved.preference_withdrawal_control?.limitation ?? "", /did not observe an obvious cookie preferences/i);

  const postChoiceCleanAbsence = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {
      hybridRuntimeEvidence: {
        consentControlLifecycleEvidence: {
          controlsSearched: ["cookie preferences"],
          cmpReopenControlObserved: true,
          coverageStatus: "usable",
          evidenceRefs: ["browser_runtime_consent_control_lifecycle", "post_reject_consent_control_lifecycle"],
          footerLinksInspected: ["Privacy Notice -> https://example.test/privacy"],
          initialConsentLayerObserved: true,
          observedControls: [
            {
              pageUrl: "https://example.test/",
              source: "cmp_reopen",
              text: "This website uses cookies. Accept Decline Cookie"
            }
          ],
          pagesChecked: ["https://example.test/"],
          postChoicePreferenceControlClickOutcome: {
            attempted: false,
            controlText: null,
            href: null,
            outcome: "no_qualifying_control_observed",
            pageUrl: "https://example.test/",
            source: "none"
          },
          preferenceCenterReachableAfterInitialLayer: true
        }
      }
    }
  });

  assert.equal(postChoiceCleanAbsence.preference_withdrawal_control?.status, "Not observed");
  assert.equal(
    postChoiceCleanAbsence.preference_withdrawal_control?.limitation,
    "CertScore.ai did not retain a qualifying post-choice cookie preference or withdrawal control after the initial consent action."
  );
  assert.ok(
    postChoiceCleanAbsence.preference_withdrawal_control?.evidenceRefs.includes(
      "Post-choice control outcome: no_qualifying_control_observed"
    )
  );

  const ambiguousCmpReopenOnly = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {
      hybridRuntimeEvidence: {
        consentControlLifecycleEvidence: {
          controlsSearched: ["cookie preferences"],
          cmpReopenControlObserved: true,
          coverageStatus: "usable",
          evidenceRefs: ["post_reject_consent_control_lifecycle"],
          footerLinksInspected: ["Privacy Notice -> https://example.test/privacy"],
          initialConsentLayerObserved: true,
          observedControls: [],
          pagesChecked: ["https://example.test/"],
          preferenceCenterReachableAfterInitialLayer: false
        }
      }
    }
  });

  assert.equal(ambiguousCmpReopenOnly.preference_withdrawal_control?.status, "Review signal");
  assert.ok(
    ambiguousCmpReopenOnly.preference_withdrawal_control?.evidenceRefs.includes(
      "Ambiguous control evidence retained"
    )
  );

  const genericCookieNoticeOnly = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {
      hybridRuntimeEvidence: {
        consentControlLifecycleEvidence: {
          controlsSearched: ["cookie preferences"],
          coverageStatus: "usable",
          evidenceRefs: ["post_reject_consent_control_lifecycle"],
          footerLinksInspected: ["Privacy Notice -> https://example.test/privacy"],
          initialConsentLayerObserved: true,
          observedControls: [
            {
              pageUrl: "https://example.test/",
              source: "cmp_reopen",
              text: "This website uses cookies. For more information, review our Privacy & Legal Notice. Accept Decline Cookie"
            }
          ],
          pagesChecked: ["https://example.test/"],
          preferenceCenterReachableAfterInitialLayer: true
        }
      }
    }
  });

	  assert.equal(genericCookieNoticeOnly.preference_withdrawal_control?.status, "Review signal");
  assert.match(
    genericCookieNoticeOnly.preference_withdrawal_control?.limitation ?? "",
    /incomplete or ambiguous/i
  );
	  assert.ok(
	    genericCookieNoticeOnly.preference_withdrawal_control?.evidenceRefs.includes(
	      "Ambiguous control evidence retained"
	    )
	  );

	  const retainedButClickDidNotOpen = deriveGdprEprivacyCoveragePolicyOutcomes({
	    ...completedInputBase,
	    runtimeArtifacts: {
	      hybridRuntimeEvidence: {
	        consentControlLifecycleEvidence: {
	          controlsSearched: ["cookie preferences"],
	          cookiePreferencesLinkObserved: true,
	          coverageStatus: "usable",
	          evidenceRefs: ["post_reject_consent_control_lifecycle"],
	          footerLinksInspected: ["Cookie Preferences -> https://example.test/cookies"],
	          initialConsentLayerObserved: true,
	          observedControls: [
	            {
	              pageUrl: "https://example.test/",
	              source: "footer_link",
	              text: "Cookie Preferences"
	            }
	          ],
	          pagesChecked: ["https://example.test/"],
	          postChoicePreferenceControlClickOutcome: {
	            attempted: true,
	            controlText: "Cookie Preferences",
	            href: "https://example.test/cookies",
	            outcome: "no_ui_change",
	            pageUrl: "https://example.test/",
	            source: "footer_link"
	          },
	          preferenceCenterReachableAfterInitialLayer: true
	        }
	      }
	    }
	  });

	  assert.equal(retainedButClickDidNotOpen.preference_withdrawal_control?.status, "Review signal");
	  assert.ok(
	    retainedButClickDidNotOpen.preference_withdrawal_control?.evidenceRefs.includes(
	      "Post-choice control outcome: no_ui_change"
	    )
	  );
});

test("deriveGdprEprivacyCoveragePolicyOutcomes keeps cross-border review untestable without jurisdiction evidence", () => {
  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {
      hybridRuntimeEvidence: {
        networkSummary: {
          thirdPartyDomainCount: 3
        }
      }
    },
    snapshot: {
      third_party_script_domain_count: 3
    }
  });

  assert.equal(outcomes.cross_border_endpoint_review?.status, "Not testable");
});

test("deriveGdprEprivacyCoveragePolicyOutcomes consumes nested hybrid endpoint jurisdiction evidence", () => {
  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {
      hybridRuntimeEvidence: {
        endpointJurisdictionEvidence: [
          {
            confidence: "high",
            etldPlusOne: "adsrvr.org",
            firstPartyStatus: "third_party",
            host: "match.adsrvr.org",
            inferenceBasis: "known_runtime_service_domain",
            inferredCountryCode: "US",
            inferredRegion: "US_OR_GLOBAL",
            transferReviewSignal: true
          }
        ],
        networkSummary: {
          thirdPartyDomainCount: 1
        }
      }
    },
    snapshot: {
      third_party_script_domain_count: 1
    }
  });

  assert.equal(outcomes.cross_border_endpoint_review?.status, "Review signal");
  assert.match(
    outcomes.cross_border_endpoint_review?.limitation ?? "",
    /Endpoint geography creates a transfer-review signal/i
  );
  assert.match(
    outcomes.cross_border_endpoint_review?.limitation ?? "",
    /disclosure mismatch for transfer-relevant advertising, analytics, or tag-management vendors/i
  );
  assert.deepEqual(outcomes.cross_border_endpoint_review?.evidenceRefs, [
    "Endpoint jurisdiction rows: 1",
    "Transfer review signal rows: 1"
  ]);
});

test("deriveGdprEprivacyCoveragePolicyOutcomes emits transport-security observed rows from retained typed summary", () => {
  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {
      transportSecuritySummary: {
        evidenceRetained: true,
        evidenceRefs: ["ref_transport_security"],
        pageHttpsObserved: true,
        validTlsCertificate: true,
        httpRedirectsToHttps: true,
        mixedContentObserved: false,
        insecureFormTransportObserved: false,
        sampledPageUrls: ["https://example.com/"]
      }
    }
  });

  assert.equal(outcomes.transport_security_https_delivery?.status, "Observed");
  assert.equal(outcomes.transport_security_tls_certificate?.status, "Observed");
  assert.equal(outcomes.transport_security_http_redirect?.status, "Observed");
  assert.equal(outcomes.transport_security_mixed_content?.status, "Observed");
  assert.equal(outcomes.transport_security_form_transport?.status, "Observed");
  assert.deepEqual(outcomes.transport_security_https_delivery?.evidenceRefs, ["ref_transport_security"]);
});

test("deriveGdprEprivacyCoveragePolicyOutcomes marks transport-security gaps from retained typed summary", () => {
  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {
      transport_security_summary: {
        evidenceRetained: true,
        evidenceRefs: ["ref_transport_security"],
        pageHttpsObserved: false,
        validTlsCertificate: false,
        httpRedirectsToHttps: false,
        mixedContentObserved: true,
        mixedContentSamples: [{ url: "http://cdn.example.test/app.js", pageUrl: "https://example.test/" }],
        insecureFormTransportObserved: true,
        insecureFormTransports: [{ actionUrl: "http://example.test/submit", pageUrl: "https://example.test/contact" }]
      }
    }
  });

  assert.equal(outcomes.transport_security_https_delivery?.status, "Gap observed");
  assert.equal(outcomes.transport_security_tls_certificate?.status, "Gap observed");
  assert.equal(outcomes.transport_security_http_redirect?.status, "Gap observed");
  assert.equal(outcomes.transport_security_mixed_content?.status, "Gap observed");
  assert.equal(outcomes.transport_security_form_transport?.status, "Gap observed");
});

test("deriveGdprEprivacyCoveragePolicyOutcomes marks transport-security rows not testable without typed evidence", () => {
  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {}
  });

  assert.equal(outcomes.transport_security_https_delivery?.status, "Not testable");
  assert.equal(outcomes.transport_security_tls_certificate?.status, "Not testable");
  assert.equal(
    outcomes.transport_security_tls_certificate?.criticalEvidence.missingOrIncompleteSourceSignals[0]?.field,
    "runtimeArtifacts.transportSecuritySummary.transport_security_tls_certificate"
  );
});

test("deriveGdprEprivacyCoveragePolicyOutcomes does not project fallback-only transport summary", () => {
  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    ...completedInputBase,
    runtimeArtifacts: {
      transportSecuritySummary: {
        evidenceRetained: false,
        evidenceRefs: [],
        pageHttpsObserved: false,
        validTlsCertificate: null,
        httpRedirectsToHttps: null,
        mixedContentObserved: false,
        insecureFormTransportObserved: false,
        sampledPageUrls: []
      }
    }
  });

  assert.equal(outcomes.transport_security_https_delivery?.status, "Not testable");
  assert.equal(outcomes.transport_security_tls_certificate?.status, "Not testable");
  assert.equal(outcomes.transport_security_http_redirect?.status, "Not testable");
  assert.equal(outcomes.transport_security_mixed_content?.status, "Not testable");
  assert.equal(outcomes.transport_security_form_transport?.status, "Not testable");
});
