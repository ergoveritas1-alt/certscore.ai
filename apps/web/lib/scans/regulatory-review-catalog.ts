import type { ReportReviewFocus } from "@certscore/api-contracts";

/** Editorial context over already-projected identities. Never establishes evidence or eligibility. */
export const REGULATORY_REVIEW_CATALOG_VERSION = "regulatory-review-context.v1";
export const ENFORCEMENT_REVIEWED_AT = "2026-10-16";
export type EnforcementExample = {
  id: string; mode: ReportReviewFocus; name: string; authority: string; date: string;
  outcome: string; conduct: string; relevance: string; url: string;
};
export const ENFORCEMENT_EXAMPLES: Record<string, EnforcementExample> = {
  shein: { id: "shein", mode: "gdpr_eprivacy", name: "SHEIN", authority: "CNIL · France · ePrivacy", date: "2025-09-01",
    outcome: "€150 million fine covering several cookie-related breaches.",
    conduct: "CNIL found cookies placed before consent and continued cookie placement or reading after refusal or withdrawal. It also found incomplete cookie information.",
    relevance: "The related issue is whether consent choices control optional tracking. The decision established cookie operations through a broader investigation; a retained request alone does not establish the same conduct.",
    url: "https://www.cnil.fr/en/cookies-placed-without-consent-shein-fined-150-million-euros-cnil" },
  googleCookies: { id: "googleCookies", mode: "gdpr_eprivacy", name: "Google", authority: "CNIL · France · ePrivacy", date: "2020-12-07",
    outcome: "€100 million in fines; upheld by France’s Conseil d’État in 2022.",
    conduct: "The decision concerned advertising cookies without prior consent, inadequate information and a defective refusal procedure.",
    relevance: "The related issue is meaningful control over cookies. The outcome covered multiple breaches and the scale of Google’s activity.",
    url: "https://www.conseil-etat.fr/en/news/advertising-cookies-google-fined-100-million" },
  googleTransparency: { id: "googleTransparency", mode: "gdpr_eprivacy", name: "Google", authority: "CNIL · France · GDPR", date: "2019-01-21",
    outcome: "€50 million fine for transparency, information and consent shortcomings; upheld in 2020.",
    conduct: "The case concerned how Android users were informed about personal-data processing and consent for advertising personalization.",
    relevance: "The related issue is whether people can understand how their information is used. This broader case does not establish that a single missing disclosure warrants the same outcome.",
    url: "https://conseil-etat.fr/actualites/rgpd-le-conseil-detat-rejette-le-recours-dirige-contre-la-sanction-de-50-millions-deuros-infligee-a-google-par-la-cnil" },
  orange: { id: "orange", mode: "gdpr_eprivacy", name: "Orange", authority: "CNIL · France · ePrivacy", date: "2024-11-14",
    outcome: "€50 million fine covering two breaches, plus an order to stop cookie reading after withdrawal.",
    conduct: "Previously placed cookies continued to be read after consent was withdrawn. The decision also covered advertisements inserted among emails without consent.",
    relevance: "The related issue is making withdrawal effective for the site and its partners. The total fine was not solely for the cookie issue.",
    url: "https://www.cnil.fr/en/advertisements-inserted-among-emails-orange-fined-eu50-million" },
  sephora: { id: "sephora", mode: "ccpa_cpra", name: "Sephora", authority: "California Attorney General · CCPA", date: "2022-08-24",
    outcome: "$1.2 million settlement resolving multiple allegations, with disclosure and opt-out remedies.",
    conduct: "The Attorney General alleged failure to disclose personal-information sales and process sale opt-outs sent through Global Privacy Control.",
    relevance: "The related issue is whether sale/sharing opt-outs reach the relevant services. Vendor activity alone does not establish a legally defined sale or sharing arrangement.",
    url: "https://oag.ca.gov/node/556528" },
  tractorSupply: { id: "tractorSupply", mode: "ccpa_cpra", name: "Tractor Supply", authority: "CPPA · California · CCPA", date: "2025-09-30",
    outcome: "$1.35 million fine resolving multiple claims, with changes to notices, opt-outs and privacy protections.",
    conduct: "The case included inadequate privacy-rights notices, ineffective sale/sharing opt-outs including GPC, and missing contractual privacy protections.",
    relevance: "The related issue is making privacy information and opt-out rights usable. The total penalty covered several practices, including job-applicant notices.",
    url: "https://cppa.ca.gov/announcements/2025/20250930.html" },
  honda: { id: "honda", mode: "ccpa_cpra", name: "Honda", authority: "CPPA · California · CCPA", date: "2025-03-12",
    outcome: "$632,500 fine resolving several claims, with changes to privacy-request methods.",
    conduct: "The CPPA alleged excessive verification, unequal privacy choices and obstacles for authorized agents.",
    relevance: "The related issue is whether people can use applicable rights methods. This case did not turn on a broken link alone.",
    url: "https://cppa.ca.gov/announcements/2025/20250312.html" },
};

export type RegulatoryReviewTopic = {
  id: string; title: string; findingIds: string[];
  contexts: Partial<Record<ReportReviewFocus, { why: string; rule: string; ruleUrl: string; cases: string[]; priority: number }>>;
};
const gdpr = "https://eur-lex.europa.eu/eli/reg/2016/679/oj/eng";
const eprivacy = "https://eur-lex.europa.eu/eli/dir/2002/58/2009-12-19/eng";
const california = "https://www.cppa.ca.gov/faq.html";
const rowIds = (...ids: string[]) => ids.map(id => `regulatory_gap__gdpr_eprivacy__${id}`);
function eu(id: string, title: string, rows: string[], why: string, rule: string, cases: string[] = [], priority = 50): RegulatoryReviewTopic {
  return { id, title, findingIds: rowIds(...rows), contexts: { gdpr_eprivacy: { why, rule, ruleUrl: rule.startsWith("ePrivacy") ? eprivacy : gdpr, cases, priority } } };
}
export const REGULATORY_REVIEW_TOPICS: RegulatoryReviewTopic[] = [
  { id: "california-collection-notice-link", title: "Notice-at-collection link unavailable", findingIds: ["california_notice_at_collection_destination_error"], contexts: { ccpa_cpra: {
    why: "People should be able to read the applicable notice when information is collected. A confirmed missing named destination calls for repair and a check of the actual collection point.",
    rule: "CCPA §1798.100; regulations §7012", ruleUrl: "https://cppa.ca.gov/regulations/pdf/ccpa_statute_eff_20260101.pdf", cases: ["tractorSupply"], priority: 98 } } },
  { id: "california-rights-information-link", title: "California rights-information link unavailable", findingIds: ["california_rights_information_destination_error"], contexts: { ccpa_cpra: {
    why: "People need accessible information about their California rights and how to use them. A confirmed missing named destination deserves review alongside any other available request methods.",
    rule: "CCPA §1798.130; regulations §§7011, 7020", ruleUrl: "https://cppa.ca.gov/regulations/pdf/ccpa_statute_eff_20260101.pdf", cases: ["tractorSupply", "honda"], priority: 97 } } },
  { id: "california-opt-out-activity", title: "Activity after a sale/sharing opt-out", findingIds: ["california_sale_sharing_opt_out_activity"], contexts: { ccpa_cpra: {
    why: "An applicable sale/sharing opt-out must take effect for relevant data flows. Review whether the observed requests actually involve sale or sharing and whether the visitor’s recorded choice is applied by those services.",
    rule: "CCPA §1798.120; regulations §7026", ruleUrl: "https://cppa.ca.gov/regulations/pdf/ccpa_statute_eff_20260101.pdf", cases: ["tractorSupply"], priority: 100 } } },
  { id: "california-choice", title: "Sale/sharing choice not identified", findingIds: ["california_privacy_choice_not_observed"], contexts: { ccpa_cpra: {
    why: "Covered businesses that sell or share personal information generally must offer a usable opt-out method. Review the business’s activities and permitted alternatives before treating the missing named control as a gap.",
    rule: "CCPA §1798.135; regulations §§7013, 7015, 7026", ruleUrl: "https://cppa.ca.gov/regulations/pdf/ccpa_statute_eff_20260101.pdf", cases: [], priority: 85 } } },
  { id: "california-destination", title: "Broken privacy-choice destination", findingIds: ["california_privacy_choice_destination_error"], contexts: { ccpa_cpra: {
    why: "People need a working route to exercise applicable sale/sharing opt-out rights. A confirmed missing destination warrants repairing the route and checking available alternative methods.",
    rule: "CCPA §1798.135; regulations §§7013, 7026", ruleUrl: "https://cppa.ca.gov/regulations/pdf/ccpa_statute_eff_20260101.pdf", cases: [], priority: 95 } } },
  eu("post-refusal", "Activity after Reject", ["post_reject_tracking_reduction"], "A refusal needs to take effect for tracking that requires consent. Review the retained activity and decision confirmation to check whether optional services respect the visitor’s choice.", "ePrivacy Art. 5(3); GDPR Arts. 6–7", ["shein"], 100),
  eu("preconsent-storage", "Cookies or storage before consent", ["pre_consent_cookies_storage"], "Storing or reading information on a device generally needs prior consent unless an exemption applies. Review the purpose of the retained non-essential items.", "ePrivacy Art. 5(3)", ["shein"], 95),
  eu("preconsent-tracking", "Tracking before consent", ["pre_consent_third_party_tracking", "advertising_retargeting_vendor_signal_observed", "retargeting_behavioral_advertising_signal_observed", "analytics_vendor_observed"], "Optional tracking can begin sharing information before a visitor has chosen. Check which operations require consent and whether they wait for that choice.", "ePrivacy Art. 5(3); GDPR Arts. 6–7", ["shein"], 94),
  eu("refusal-control", "Ability to refuse", ["reject_all_path_availability"], "Visitors need a meaningful way to refuse tracking that requires consent. Check that refusal is available and effective wherever acceptance is offered.", "ePrivacy Art. 5(3); GDPR Arts. 4(11), 7", ["googleCookies"], 90),
  eu("consent-choice", "Consent choice quality", ["consent_choice_quality"], "A choice should be clear and freely made. A misleading or unbalanced interface can undermine the consent on which optional processing relies.", "GDPR Arts. 4(11), 7", ["googleCookies"], 85),
  eu("withdrawal", "Changing or withdrawing consent", ["preference_withdrawal_control"], "People must be able to withdraw consent as easily as they gave it. Review both the route to change a choice and whether dependent services respond.", "GDPR Art. 7(3)", ["orange"], 85),
  eu("consent-mechanism", "Consent mechanism", ["consent_surface_observed"], "When observed operations require consent, visitors need a way to make that choice before those operations begin.", "ePrivacy Art. 5(3); GDPR Art. 7", [], 80),
  eu("accept-control", "Accept control", ["accept_consent_control"], "Consent needs a clear affirmative choice. Review the assessed control issue alongside the activities for which consent is requested.", "GDPR Arts. 4(11), 7", [], 65),
  eu("options-control", "Granular consent choices", ["options_settings_preferences_control"], "People should understand and choose between distinct processing purposes. Review whether the assessed settings issue prevents a meaningful choice.", "GDPR Art. 7", [], 65),
  eu("cookie-notice", "Cookie information", ["cookie_notice_policy_availability"], "Visitors need understandable information about cookie purposes before deciding. Check that the relevant information is available where the choice is made.", "ePrivacy Art. 5(3)", ["shein"], 70),
  { id: "privacy-notice", title: "Privacy policy availability", findingIds: rowIds("privacy_notice_availability"), contexts: {
    gdpr_eprivacy: { why: "People need accessible information about who uses their data, why and how to exercise their rights. A supported missing-policy finding warrants reviewing how that information is provided.", rule: "GDPR Arts. 12–14", ruleUrl: gdpr, cases: [], priority: 98 },
    ccpa_cpra: { why: "Businesses covered by California’s privacy law must explain their data practices and privacy rights. A missing privacy policy can leave visitors without that information or a route to exercise their rights.", rule: "CCPA privacy-policy and notice obligations", ruleUrl: california, cases: ["tractorSupply"], priority: 90 },
  } },
  eu("embeds", "Third-party content before consent", ["third_party_iframe_pre_consent", "social_media_embed_pre_consent", "embedded_content_pre_consent"], "Embedded services can contact another provider as soon as a page loads. Review their actual data access and purposes to determine whether consent is needed.", "ePrivacy Art. 5(3); GDPR Arts. 6, 13", [], 65),
  eu("replay", "Session replay", ["session_replay_fingerprinting_review"], "Recording interactions can reveal what a person reads or enters. Review masking, collection scope, disclosure and any required consent.", "GDPR Arts. 5, 6, 13, 25", [], 75),
  eu("fingerprinting", "Device fingerprinting", ["device_identification_fingerprinting_signal_observed"], "Device characteristics may be used to recognize a visitor without cookies. Review the assessed identification behavior and whether device access needs consent.", "ePrivacy Art. 5(3); GDPR Arts. 5–6", [], 75),
  eu("sensitive-tracking", "Tracking around sensitive information", ["sensitive_surfaces_third_party_tracking"], "Collection around sensitive interactions deserves close review of data minimization, recipients and the applicable legal basis. Review the retained evidence of what was actually transmitted.", "GDPR Arts. 5, 6, 9, 25", [], 90),
  eu("collection", "Data collection surfaces", ["public_collection_surfaces"], "People should know why their information is collected and who receives it. Review the assessed collection issue against the notice and the data needed for the service.", "GDPR Arts. 5, 13", [], 55),
  eu("transport", "Protection of data in transit", ["transport_security_https_delivery", "transport_security_tls_certificate", "transport_security_http_redirect", "transport_security_mixed_content", "transport_security_form_transport"], "Weak transport protection can expose personal information in transit. Review the affected connection or form in the context of the data it carries.", "GDPR Art. 32", [], 75),
  eu("privacy-accessibility", "Usability of privacy controls", ["accessibility_consent_controls"], "A privacy choice must be usable by the people asked to make it. Review the specific barrier in the consent or privacy control.", "GDPR Arts. 7, 12", [], 70),
  eu("controller", "Controller and contact information", ["controller_contact_disclosure"], "Visitors need to know who is responsible for their information and how to contact them about it.", "GDPR Arts. 13(1)(a), 14(1)(a)", [], 60),
  eu("purposes", "Processing-purpose disclosure", ["processing_purposes_disclosure"], "People need a clear explanation of why their information is used so they can make an informed choice and exercise their rights.", "GDPR Arts. 12–14", ["googleTransparency"], 60),
  eu("legal-basis", "Processing legal-basis language", ["legal_basis_disclosure_observed"], "The notice should explain the legal basis for each relevant use of personal data. Review the assessed wording against the processing it describes.", "GDPR Arts. 6, 13–14", ["googleTransparency"], 60),
  eu("retention", "Retention information", ["retention_disclosure_observed"], "People should be told how long their information is kept, or the criteria used to decide. Review whether the retained wording answers that question.", "GDPR Arts. 5(1)(e), 13(2)(a)", [], 55),
  eu("recipients", "Recipients and vendor disclosure", ["recipients_vendor_categories_disclosure"], "Visitors should understand who receives their information. Review the assessed disclosure issue against the relevant recipients or recipient categories.", "GDPR Arts. 13(1)(e), 14(1)(e)", [], 60),
  eu("rights", "Privacy-rights information", ["data_subject_rights_disclosure"], "People need to understand their rights and how to exercise them, including access, correction and deletion where applicable.", "GDPR Arts. 12–22", [], 60),
  eu("transfers", "International-transfer information", ["international_transfers_disclosure"], "Transfers outside the EEA may need additional safeguards. Review whether the notice explains relevant transfers and how to obtain information about those safeguards.", "GDPR Arts. 13(1)(f), 44–49", [], 60),
  eu("obsolete-transfer", "Outdated transfer framework", ["outdated_transfer_framework_reference"], "An obsolete framework presented as current guidance can mislead readers about transfer safeguards. Correct the disclosure and verify the mechanism actually relied on.", "GDPR Arts. 12–14, 44–49", [], 65),
  eu("cross-border", "Cross-border endpoint review", ["cross_border_endpoint_review"], "Review the retained destination and recipient evidence to establish whether an international transfer occurs and which safeguards apply. Server location alone does not answer those questions.", "GDPR Arts. 44–49", [], 50),
  eu("dpo", "Data protection contact", ["dpo_contact_point_disclosure"], "Where a data protection officer is required, people should be able to contact that officer about the use of their information.", "GDPR Arts. 13(1)(b), 37–39", [], 50),
  eu("complaints", "Right to complain", ["supervisory_authority_complaint_disclosure"], "Privacy information should tell people that they can complain to a supervisory authority about the use of their data.", "GDPR Arts. 13(2)(d), 14(2)(e)", [], 50),
  eu("profiling", "Automated decisions and profiling", ["automated_decision_making_profiling_disclosure"], "Where relevant automated decisions fall within GDPR’s rules, people need meaningful information about the logic, significance and expected consequences.", "GDPR Arts. 13–14, 22", [], 60),
  { id: "consent-record", title: "Consent record contradicts the choice", findingIds: ["acceptance_signal_contradicts_action"], contexts: { gdpr_eprivacy: { why: "Services rely on the recorded decision to apply a visitor’s choice. A contradictory record warrants checking how that choice is saved and communicated.", rule: "GDPR Arts. 5(2), 7", ruleUrl: gdpr, cases: [], priority: 80 } } },
];

export function regulatoryReviewContext(id: string, focus: ReportReviewFocus) {
  const topic = REGULATORY_REVIEW_TOPICS.find(topic => topic.findingIds.includes(id));
  const context = topic?.contexts[focus];
  return topic && context ? { ...context, topicId: topic.id, examples: context.cases.map(id => ENFORCEMENT_EXAMPLES[id]!).filter(example => example?.mode === focus) } : null;
}

/** Split and rank existing report entries only. Unmapped entries remain visible as other issues. */
export function selectRegulatoryReview<T extends { id: string; status: string; rank: number }>(findings: readonly T[], focus: ReportReviewFocus) {
  const relevant = findings.filter(finding => regulatoryReviewContext(finding.id, focus));
  const regulatory = [...relevant].sort((a, b) =>
    Number(b.status === "Potential gap") - Number(a.status === "Potential gap") ||
    regulatoryReviewContext(b.id, focus)!.priority - regulatoryReviewContext(a.id, focus)!.priority
  ).map((finding, index) => ({ ...finding, rank: index + 1 }));
  const other = findings.filter(finding => finding.id !== "gpc_response" && !REGULATORY_REVIEW_TOPICS.some(topic => topic.findingIds.includes(finding.id)))
    .map((finding, index) => ({ ...finding, rank: index + 1 }));
  // A finding tied solely to the other privacy framework stays in Detailed evidence.
  return { regulatory, other };
}
