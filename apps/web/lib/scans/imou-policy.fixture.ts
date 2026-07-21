export const IMOU_PRIVACY_POLICY_URL = "https://www.imou.com/policy#privacy-policy";
export const IMOU_POLICY_LAST_MODIFIED = "Last modified: 2022-01-19";

export const IMOU_ARTICLE_13_SECTION_EVIDENCE = [
  ["controller_contact", "Controller and contact", "Hangzhou Huacheng Network Technology Co., Ltd. and its affiliated companies are identified as responsible for the personal-data processing described by the IMOU privacy policy, with privacy@imoulife.com provided as a contact route."],
  ["processing_purposes", "Purposes of processing", "IMOU describes processing personal data to provide products and services, maintain accounts, respond to requests, improve services, protect security, and communicate with users."],
  ["legal_basis", "Legal bases", "The legal bases for processing personal data include performance of a contract, consent, compliance with legal obligations, and legitimate interests that are not overridden by individual rights."],
  ["recipients_or_vendor_categories", "Recipients", "IMOU may disclose personal data to affiliates and categories of service providers that support hosting, customer service, analytics, security, delivery, and professional advice."],
  ["data_retention", "Retention", "IMOU retains personal data only for as long as necessary for the purposes described and applicable legal, dispute, accounting, and security requirements, after which it is deleted or anonymized."],
  ["data_subject_rights", "Your rights", "You may request access, correction, deletion, restriction, or portability of personal data, object to processing, and withdraw consent where processing relies on consent."],
  ["international_transfers", "International transfers", "Personal data may be transferred internationally, including outside the EEA, using approved safeguards such as adequacy decisions and standard contractual clauses."],
  ["dpo_contact", "Privacy contact", "IMOU provides privacy@imoulife.com as a contact for its data protection officer and privacy-related requests."],
  ["supervisory_authority", "Complaints", "If you believe IMOU's processing does not comply with applicable data-protection law, the policy says you may contact the relevant competent data protection authority."]
].map(([coverageArea, selectedPolicySectionHeading, selectedPolicySectionExcerpt]) => ({
  coverageArea,
  evidenceSource: "deterministic",
  selectedEvidenceStrength: "strong",
  selectedPolicySectionExcerpt,
  selectedPolicySectionHeading,
  selectedPolicySectionUrl: IMOU_PRIVACY_POLICY_URL,
  signalObserved: "observed"
})) as Array<{
  coverageArea: string;
  evidenceSource: "deterministic";
  selectedEvidenceStrength: "strong";
  selectedPolicySectionExcerpt: string;
  selectedPolicySectionHeading: string;
  selectedPolicySectionUrl: string;
  signalObserved: "observed";
}>;
