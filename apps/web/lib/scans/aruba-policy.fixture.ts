export const ARUBA_PRIVACY_POLICY_URL = "https://www.aruba.it/informativa_arubaspa.pdf";

export const ARUBA_ARTICLE_13_SECTION_EVIDENCE = [
  ["controller_contact", "Who we are", "Aruba S.p.A. is the data controller, with registered office at Via San Clemente 53, Ponte San Pietro, and provides privacy@staff.aruba.it for privacy contacts."],
  ["processing_purposes", "Why personal data is required", "Aruba processes personal data to handle contact requests, provide and administer contracted services, protect network security, prevent fraud, conduct consent-based marketing, and perform profiling where consent is given."],
  ["legal_basis", "Purposes and legal bases", "The stated legal bases include performance of a contract, compliance with legal obligations, legitimate interests, Article 130 of the Italian Privacy Code, and consent for specified marketing, survey, and profiling activities."],
  ["recipients_or_vendor_categories", "Who receives personal data", "Aruba may disclose or provide personal data to recipient categories including Aruba group companies, third-party suppliers processing data on its behalf, payment and banking institutions, external professionals and advisers, public authorities, and legally authorized representatives."],
  ["data_retention", "How long personal data is retained", "Aruba states purpose-based retention criteria and specific periods including ten years for tax and accounting data, three months for unpaid or cancelled orders, and defined periods for traffic, marketing, and profiling data, followed by deletion or anonymization."],
  ["data_subject_rights", "Data-subject rights", "Data subjects may request access, erasure, correction, completion, restriction, portability, and objection by contacting privacy@staff.aruba.it."],
  ["international_transfers", "Where personal data is processed", "Transfers outside the European Union rely on an adequacy decision or appropriate safeguards such as the European Commission's Standard Contractual Clauses, and data subjects may request a copy of those safeguards."],
  ["dpo_contact", "Data protection officer", "Aruba identifies its data protection officer and provides dpo@staff.aruba.it as the contact address."],
  ["supervisory_authority", "Complaint to a supervisory authority", "Data subjects have the right under Article 77 GDPR to lodge a complaint with the competent supervisory authority, including the Italian Garante per la protezione dei dati personali."]
].map(([coverageArea, selectedPolicySectionHeading, selectedPolicySectionExcerpt]) => ({
  coverageArea,
  evidenceSource: "deterministic",
  selectedEvidenceStrength: "strong",
  selectedPolicySectionExcerpt,
  selectedPolicySectionHeading,
  selectedPolicySectionUrl: ARUBA_PRIVACY_POLICY_URL,
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
