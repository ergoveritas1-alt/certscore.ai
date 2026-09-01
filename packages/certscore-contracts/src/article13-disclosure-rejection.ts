import {
  classifyGdprTransparencyTopics,
  normalizeGdprTransparencyText,
} from "./gdpr-transparency-topic-classifier";
import { PRIVACY_EVIDENCE_LOCALE_REGISTRY } from "./privacy-evidence-locale-registry";

export const ARTICLE13_DISCLOSURE_TYPES = [
  "controller_contact",
  "processing_purposes",
  "legal_basis",
  "recipients_or_vendor_categories",
  "data_retention",
  "data_subject_rights",
  "international_transfers",
  "dpo_contact",
  "supervisory_authority",
  "automated_decision_making_or_profiling",
] as const;

export type Article13DisclosureType = (typeof ARTICLE13_DISCLOSURE_TYPES)[number];

export const ARTICLE13_DISCLOSURE_REJECT_REASONS = [
  "page_chrome_or_navigation",
  "table_of_contents_only",
  "insufficient_row_specific_terms",
  "generic_storage_not_retention",
  "code_or_non_policy_excerpt",
  "low_confidence_or_ambiguous",
] as const;

export type Article13DisclosureRejectReason = (typeof ARTICLE13_DISCLOSURE_REJECT_REASONS)[number];

export type Article13DisclosureRejectionMode =
  | "scan_core"
  | "retained_report"
  | "multilingual_classifier";

export type Article13DisclosureRejectReasonOptions = {
  mode?: Article13DisclosureRejectionMode;
};

export function isArticle13DisclosureEvidenceUsable(
  value: string,
  disclosureType: Article13DisclosureType,
  options: Article13DisclosureRejectReasonOptions = {},
) {
  return article13DisclosureRejectReason(value, disclosureType, options) === null;
}

export function hasSubstantiveProcessingPurposesEvidence(value: string) {
  const text = normalizeArticle13Whitespace(value);
  const purposeOutcomePattern =
    /\b(?:provide|deliver|operate|maintain|improve|develop|personalize|communicate|respond|answer|process|fulfil|fulfill|protect|secure|prevent|detect|measure|analy[sz]e|understand|verify|diagnose|comply|send|administer|manage|support|facilitate|handle|perform|conduct|ensure|keep records?|follow[- ]?up|authenticate|optimise|optimize)\b/i;
  if (
    /\b(?:privacy shield|data privacy framework|\bdpf\b|standard contractual clauses?|\bsccs?\b|adequacy decision|international data transfer|cross-border transfer)\b/i.test(text) &&
    !/\b(?:purpose(?:s)? of (?:the )?(?:processing|collection|use)|why we (?:process|collect|use)|we (?:use|process|collect) (?:your )?(?:personal )?(?:data|information) (?:to|for))\b/i.test(text)
  ) {
    return false;
  }

  return (
    /\b(?:purpose(?:s)? of (?:the )?(?:processing|collection|use)(?: of (?:your )?(?:personal )?(?:data|information))?|(?:how|why) we (?:process|collect|use) (?:your |the )?(?:personal )?(?:data|information)|what do we use (?:your )?(?:personal )?(?:data|information) for|purposes? for which (?:we )?(?:process|collect|use))\b/i.test(text) ||
    (
      /\bwe use (?:this|your|the) (?:personal )?(?:data|information) to\b/i.test(text) &&
      purposeOutcomePattern.test(text)
    ) ||
    (
      /\b(?:we|[a-z][a-z0-9&.'’-]*(?:\s+[a-z][a-z0-9&.'’-]*){0,5})\s+(?:(?:use|uses|process|processes|collect|collects|store|stores)\s+(?:and\s+use\s+)?|describes?\s+processing\s+)(?:(?:your|this) )?(?:(?:personal )?(?:data|information)|details|email address|contact details|name|payment information|donation information)\b.{0,100}\b(?:to|for(?: the purpose of)?)\b.{1,160}/i.test(text) &&
      purposeOutcomePattern.test(text)
    ) ||
    (
      /\b(?:personal data|personal information|your data|your information|your details|contact details|application data|application documents|(?:the )?data)\b.{0,100}\b(?:is|are|may be|will be)?\s*(?:used|processed|collected|stored)\b.{0,100}\b(?:to|for(?: the purpose of)?)\b.{1,160}/i.test(text) &&
      purposeOutcomePattern.test(text)
    ) ||
    (
      /\b(?:personal data|personal information|technical data|information we collect|data we collect)\b.{0,140}\b(?:used solely for|necessary for the purposes? of|collected for)\b/i.test(text) &&
      purposeOutcomePattern.test(text)
    )
  );
}

export function hasSubstantiveLegalBasisEvidence(value: string) {
  const text = normalizeArticle13Whitespace(value);
  const explicitBasisFraming =
    /\b(?:legal bas(?:is|es)|lawful bas(?:is|es)|basis for processing|art(?:icle)?\.?\s*6|pursuant to art(?:icle)?\.?\s*6)\b/i.test(text);
  if (explicitBasisFraming) {
    return true;
  }

  const segments = text
    .split(/(?<=[.!?;])\s+|\s+[|•]\s+/)
    .map((segment) => segment.trim())
    .filter(Boolean);
  const boundedSegments = segments.flatMap((segment, index) => [
    segment,
    segments[index + 1] ? `${segment} ${segments[index + 1]}` : null,
  ]).filter((segment): segment is string => Boolean(segment));
  return boundedSegments.some((segment) => {
    const processingContext =
      /\b(?:process|processing|use|using|collect|collecting|hold|holding)\b.{0,100}\b(?:personal data|personal information|your data|your information|data|information)\b/i.test(segment) ||
      /\b(?:personal data|personal information|your data|your information)\b.{0,100}\b(?:process|processing|processed|use|used|collect|collected|hold|held)\b/i.test(segment);
    if (!processingContext) {
      return false;
    }

    return (
      /\b(?:rely|relies|based|basis|necessary|needed|required)\b.{0,100}\b(?:consent|contract|legal obligation|legitimate interests?|public task|public interest|vital interests?)\b/i.test(segment) ||
      /\b(?:performance of (?:a )?contract|contractual necessity|legal obligation|legitimate interests?|public task|public interest|vital interests?)\b.{0,100}\b(?:basis|process|processing|use|collect|hold|necessary|required)\b/i.test(segment) ||
      /\b(?:we|the controller)\s+(?:process|use|collect|hold)\b.{0,160}\b(?:with your consent|to (?:perform|fulfil|fulfill) (?:a|our) contract|to comply with (?:a|our) legal obligation|for our legitimate interests?|in the public interest|to protect vital interests?)\b/i.test(segment) ||
      /\bwith your consent\b.{0,100}\b(?:we|the controller)\s+(?:process|use|collect|hold)\b/i.test(segment) ||
      /\b(?:obtain|obtains|obtained|rely|relies|relied)\b.{0,80}\bconsent\b.{0,80}\b(?:before|prior to|for)\b/i.test(segment)
    );
  });
}

export function hasSubstantiveAutomatedDecisionOrProfilingEvidence(value: string) {
  const text = normalizeArticle13Whitespace(value);
  const topic = /\b(?:profiling|profiled|automated decision(?:-making| making|s)?|solely automated (?:processing|decision))\b/i;
  if (!topic.test(text)) return false;
  const dataOrEffectContext = /\b(?:personal data|personal information|user data|data about you|your data|your information|legal effects?|significantly affects?|similarly significant effects?|eligibility|credit|insurance|employment|access to (?:a )?service)\b/i;
  const explicitServiceNegative = /\b(?:this (?:site|website|service|platform|application|app|fixture)|the (?:site|website|service|platform|application|app))\b.{0,100}\b(?:do(?:es)? not|will not)\b.{0,100}\b(?:use|conduct|perform|carry out|engage in)\b.{0,180}\b(?:profiling|automated decision(?:-making| making|s)?|solely automated (?:processing|decision))\b/i;
  const passiveProfilingDisclosure = /\b(?:personal data|personal information|user data|your data|your information)\b.{0,140}\b(?:is|are) subject to\b.{0,100}\b(?:automatic|automated) processing\b.{0,100}\bprofiling\b/i;
  const referentialNegativeDisclosure = /\b(?:personal data|personal information|your data|your information)\b.{0,220}\bprofiling\b.{0,220}\bdecisions?\b.{0,140}\b(?:legal effects?|significantly affects?|similarly significant effects?)\b.{0,220}\bwe\b.{0,60}\b(?:do not|will not)\b.{0,80}\b(?:conduct|perform|carry out|engage in) such processing\b/i;
  if (
    (explicitServiceNegative.test(text) && dataOrEffectContext.test(text)) ||
    passiveProfilingDisclosure.test(text) ||
    referentialNegativeDisclosure.test(text)
  ) {
    return true;
  }

  const affirmativeOrNegativeDisclosure = /\b(?:do(?:es)? not|will not|not (?:be )?used|use|uses|used|perform|performs|conduct|conducts|carry out|carried out|engage in|based on|constitutes?)\b/i;
  const firstPartyDisclosure = /\b(?:we|the company|the controller|personal data|personal information|user data)\b/i;
  return dataOrEffectContext.test(text) &&
    affirmativeOrNegativeDisclosure.test(text) &&
    firstPartyDisclosure.test(text);
}

export function hasSubstantiveRecipientsEvidence(value: string) {
  const text = normalizeArticle13Whitespace(value);
  if (
    /\b(?:generic|aggregate(?:d)?)\b.{0,120}\b(?:not linked|not associated|de-identified|anonymous)\b.{0,120}\bpersonal (?:data|information)\b/i.test(text)
  ) {
    return false;
  }
  const meaningfulCategory = /\b(?:service providers?|processors?|subprocessors?|suppliers?|payment processors?|payment (?:and )?delivery service providers?|hosting providers?|cloud providers?|analytics providers?|analytics partners?|advertising partners?|advertising networks?|social media providers?|delivery providers?|professional advisers?|affiliates?|group companies|law enforcement|regulators?|authorities)\b/i;
  const disclosureAction = /\b(?:share|disclose|provide|transfer|send|make available|receive|access|process|handle)\b/i;
  const dataContext = /\b(?:personal data|personal information|your data|your information|information|data)\b/i;
  const namedRecipient = /\b(?:google|microsoft|amazon|aws|stripe|salesforce|meta|facebook|oracle|adobe|hubspot|mailchimp|[A-Z][A-Za-z0-9&.'’-]+\s+(?:Ltd|Limited|LLC|Inc|GmbH|AG|S\.A\.|SAS|BV))\b/;
  return dataContext.test(text) && disclosureAction.test(text) && (meaningfulCategory.test(text) || namedRecipient.test(text));
}

export function hasSubstantiveRetentionEvidence(value: string) {
  const text = normalizeArticle13Whitespace(value);
  if (
    /\bright to retain and reuse\b/i.test(text) ||
    /\bchild under the age of \d+\b.{0,180}\bdelete\b.{0,120}\bpersonal (?:data|information)\b/i.test(text)
  ) {
    return false;
  }
  const dataContext = /\b(?:personal data|personal information|your data|your information|account (?:data|information)|profile information|technical data|transaction data|records?|recordings?|comments?|metadata|server logs?|ip addresses?|cookies?)\b/i;
  const lifecycleAction = /\b(?:retain(?:ed|ing)?|keep|kept|store(?:d)?|delete(?:d)?|erase(?:d)?|anonymi[sz](?:e|ed|ation))\b/i;
  const periodOrCriterion = /\b(?:for \d+\s*(?:days?|weeks?|months?|years?)|for (?:one|two|three|four|five|six|seven|eight|nine|ten) (?:days?|weeks?|months?|years?)|indefinitely|as long as (?:necessary|required|you (?:use|maintain)|the account)|until (?:the account|you|closure|termination)|account (?:lifetime|closure|termination)|no longer (?:than )?(?:necessary|required)|purposes? for which (?:it|they|the data|the information) (?:was|were) (?:collected|processed)|legal obligations?|resolve disputes?|enforce (?:our )?agreements?)\b/i;
  return (
    dataContext.test(text) && lifecycleAction.test(text) && periodOrCriterion.test(text)
  ) ||
    /\b(?:do not|does not|don['’]t|will not|won['’]t) keep (?:your )?(?:personal )?(?:data|information) (?:any )?longer than (?:is )?(?:necessary|required)\b/i.test(text) ||
    /\bkeep information for as long as we need (?:it )?to (?:fulfil|fulfill) the purpose\b/i.test(text);
}

function hasExplicitlyNegatedDpoDesignation(value: string) {
  const text = normalizeArticle13Whitespace(value);
  const rolePattern = "(?:data protection officer|dpo)";
  return [
    new RegExp(`\\b(?:do|does|did) not(?: currently)? (?:have|appoint|designate|name|publish|employ)\\b.{0,80}\\b${rolePattern}\\b`, "i"),
    new RegExp(`\\b(?:have|has|had) not(?: currently)? (?:appointed|designated|named|published|employed)\\b.{0,80}\\b${rolePattern}\\b`, "i"),
    new RegExp(`\\bno(?: separate| formal| appointed| designated| named){0,4} ${rolePattern}\\b`, "i"),
    new RegExp(`\\b${rolePattern}\\b.{0,80}\\b(?:has|have|is|was) not (?:been )?(?:appointed|designated|named|assigned)\\b`, "i"),
  ].some((pattern) => pattern.test(text));
}

function hasSubstantivePrivacyContactPoint(value: string) {
  const text = normalizeArticle13Whitespace(value);
  return (
    /\bprivacy contact point\b.{0,220}(?:@|email|e-mail|mail|address|phone|telephone|contact|request form)/i.test(text) ||
    /(?:@|email|e-mail|mail|address|phone|telephone|contact|request form).{0,220}\bprivacy contact point\b/i.test(text)
  );
}

export function article13DisclosureRejectReason(
  value: string,
  disclosureType: Article13DisclosureType | string | undefined,
  options: Article13DisclosureRejectReasonOptions = {},
): Article13DisclosureRejectReason | null {
  const mode = options.mode ?? "scan_core";
  const text = normalizeArticle13Whitespace(value);
  if (text.length < 35) {
    return "low_confidence_or_ambiguous";
  }
  if (
    disclosureType === "dpo_contact" &&
    hasExplicitlyNegatedDpoDesignation(text) &&
    !hasSubstantivePrivacyContactPoint(text)
  ) {
    return "insufficient_row_specific_terms";
  }
  if (
    disclosureType === "international_transfers" &&
    /\boutside (?:of )?our team\b/i.test(text) &&
    !/\b(?:international|cross-border|third countr|outside (?:the )?(?:eea|uk|eu|european)|standard contractual clauses|adequacy|transfer safeguard)\b/i.test(text)
  ) {
    return "insufficient_row_specific_terms";
  }
  if (
    disclosureType === "recipients_or_vendor_categories" &&
    /\b(?:we|[a-z]+) do(?:es)? not sell\b/i.test(text) &&
    !/\b(?:share|disclose|provide|give|send|transfer)\b.{0,120}\b(?:personal data|personal information|data|information)\b.{0,180}\b(?:service providers?|processors?|recipients?|partners?|affiliates?|third parties)\b|\b(?:service providers?|processors?|recipients?|partners?|affiliates?)\b.{0,180}\b(?:receive|access|process|handle|share|disclose)\b/i.test(text)
  ) {
    return "insufficient_row_specific_terms";
  }

  if (mode === "multilingual_classifier") {
    return multilingualClassifierArticle13RejectReason(text, disclosureType);
  }

  if (mode === "retained_report") {
    return retainedReportArticle13RejectReason(text, disclosureType);
  }

  return scanCoreArticle13RejectReason(text, disclosureType);
}

export function assessArticle13PolicyTextQuality(
  value: string,
  options: { mode?: Exclude<Article13DisclosureRejectionMode, "multilingual_classifier"> } = {},
) {
  return assessPolicyTextQuality(value, options.mode ?? "scan_core");
}

export function looksLikeArticle13PageChrome(
  value: string,
  options: Article13DisclosureRejectReasonOptions = {},
) {
  const text = normalizeArticle13Whitespace(value);
  if (/\b(?:404|page not found)\b[\s\S]{0,180}\b(?:back home|page address|not found|slips away)\b/i.test(text)) {
    return true;
  }
  const productNavigationTokens = (text.match(/\b(?:products?|product categories|support|faq|downloads?|videos?|developers?|warranty policy|contact us|sign up|cookie preferences|all rights reserved|back home)\b/gi) ?? []).length;
  const substantivePrivacyVerbs = (text.match(/\b(?:we|controller|you)\s+(?:collect|process|retain|share|transfer|disclose|provide|may|can|have|request|exercise)\b/gi) ?? []).length;
  if (productNavigationTokens >= 6 && substantivePrivacyVerbs < 2) {
    return true;
  }
  if (/skip to main content|privacy policy\s+[-–]\s+privacy\s*&\s*terms|overview privacy policy terms of service technologies faq/i.test(text)) {
    return true;
  }
  const mode = options.mode ?? "scan_core";
  const navTokens = mode === "multilingual_classifier"
    ? (text.match(/\b(?:overview|privacy policy|terms of service|technologies|faq|introduction|privacy|terms|skip to main content|navigation|menu|search)\b/gi) ?? []).length
    : (text.match(/\b(?:home|overview|privacy policy|terms of service|technologies|faq|introduction|privacy|terms|contact us|accessibility|foia|no fear act|skip to main content)\b/gi) ?? []).length;
  const sentenceCount = (text.match(/[.!?]/g) ?? []).length;
  if (mode !== "multilingual_classifier") {
    return navTokens >= 5 && sentenceCount < 2;
  }
  const substantiveVerbCount = (text.match(/\b(?:collect|use|process|retain|share|transfer|contact|complain|access|delete|store|object)\b/gi) ?? []).length;
  return navTokens >= 5 && sentenceCount < 2 && substantiveVerbCount < 3;
}

export function looksLikeArticle13TableOfContents(
  value: string,
  options: Article13DisclosureRejectReasonOptions = {},
) {
  const text = normalizeArticle13Whitespace(value);
  const mode = options.mode ?? "scan_core";
  const tocTokens = mode === "multilingual_classifier"
    ? (text.match(/\b(?:introduction|information (?:we|google) collects?|why (?:we|google) collects?|your privacy controls|sharing your information|keeping your information|exporting|deleting|retaining|terms|faq|controller|legal basis|recipients|retention|rights|transfers|complaints)\b/gi) ?? []).length
    : (text.match(/\b(?:introduction|information (?:we|google) collects?|why (?:we|google) collects?|your privacy controls|sharing your information|keeping your information|exporting|deleting|retaining|terms|faq)\b/gi) ?? []).length;
  const hasDisclosureVerb = /\b(?:we|you|our)\s+(?:use|process|collect|retain|keep|store|share|transfer|disclose|provide|may|can|have|request|exercise)\b/i.test(text);
  const hasFactualDisclosureProse =
    /\b(?:personal data|personal information|account data|account records?|security logs?|individuals?|data subjects?)\b.{0,100}\b(?:collect(?:ed|s|ing)?|process(?:ed|es|ing)?|use(?:d|s|ing)?|retain(?:ed|s|ing)?|keep|kept|stor(?:e|ed|es|ing)|share(?:d|s|ing)?|transfer(?:red|s|ring)?|disclos(?:e|ed|es|ing)|delet(?:e|ed|es|ing)|request(?:ed|s|ing)?)\b/i.test(text) ||
    /\b(?:collect(?:ed|s|ing)?|process(?:ed|es|ing)?|use(?:d|s|ing)?|retain(?:ed|s|ing)?|keep|kept|stor(?:e|ed|es|ing)|share(?:d|s|ing)?|transfer(?:red|s|ring)?|disclos(?:e|ed|es|ing))\b.{0,100}\b(?:personal data|personal information|account data|account records?|security logs?)\b/i.test(text);
  if (mode === "multilingual_classifier" && looksLikeCanonicalTopicInventory(text)) {
    return true;
  }
  return tocTokens >= 4 && !hasDisclosureVerb && !hasFactualDisclosureProse;
}

function looksLikeCanonicalTopicInventory(value: string): boolean {
  const normalized = normalizeGdprTransparencyText(value);
  const matches = classifyGdprTransparencyTopics({ text: normalized }).matches;
  if (matches.length === 0) return false;

  let remainder = normalized;
  const removableTerms = [
    ...matches.map((match) => normalizeGdprTransparencyText(match.matchedTerm)),
    ...PRIVACY_EVIDENCE_LOCALE_REGISTRY.flatMap((entry) => entry.privacyPolicyLabels)
      .map((term) => normalizeGdprTransparencyText(term)),
  ].filter(Boolean).sort((left, right) => right.length - left.length);
  for (const term of removableTerms) {
    remainder = remainder.split(term).join(" ");
  }

  const remainderLetterCount = (remainder.match(/\p{L}/gu) ?? []).length;
  return matches.length === 1 && remainderLetterCount < 12;
}

export function isGenericArticle13StorageNotRetentionEvidence(value: string) {
  const text = normalizeArticle13Whitespace(value);
  const hasStorageMechanics =
    /\b(?:collect|store|storage|cookies?|local storage|databases?|server logs?)\b/i.test(text) ||
    /(?:collect(?:é|e|és|ées)|recogid[ao]s?|raccolt[oi]|verzameld|zbierane)/i.test(text);
  const hasRetentionLifecycle =
    /\b(?:retain|retention|how long|kept for|stored for|delete|deletion|anonymi[sz]e|remove|expires?|as long as necessary|no longer needed|required by law|legal purposes|fraud|abuse)\b/i.test(text) ||
    /\bkeep (?:your )?(?:personal )?(?:data|information) for as long as (?:we )?(?:need|require)/i.test(text) ||
    /(?:aufbewahrung|speichern|gespeichert|solange|erforderlich|gesetzlich|conservation|conservons|conserv(?:é|e|és|ées)|durée|dispositions légales|finalités|conservación|conservamos|plazo|conservazione|conserviamo|periodo|bewaren|bewaartermijn|noodzakelijk|przechowywania|przechowujemy|okres)/i.test(text);
  return hasStorageMechanics && !hasRetentionLifecycle;
}

export function looksLikeArticle13CodeOrConfigText(value: string) {
  const text = normalizeArticle13Whitespace(value);
  const codeSignalCount = [
    /this\.gbar_/i,
    /\bCONFIG:\s*\[\[\[/,
    /Copyright The Closure Library/i,
    /SPDX-License-Identifier/i,
    /\b(?:var|const|let)\s+[A-Za-z_$][\w$]*\s*=/,
    /function\s*\(/,
    /=>/,
    /Object\.definePropert(?:y|ies)/,
  ].reduce((count, pattern) => count + (pattern.test(text) ? 1 : 0), 0);
  const sentenceCount = (text.match(/[.!?](?:\s|$)/g) ?? []).length;
  const symbolRatio = (text.match(/[{}[\];=<>]/g) ?? []).length / Math.max(text.length, 1);
  return codeSignalCount >= 2 || (symbolRatio > 0.12 && sentenceCount < 4);
}

export function normalizeArticle13Whitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function scanCoreArticle13RejectReason(
  text: string,
  disclosureType: Article13DisclosureType | string | undefined,
): Article13DisclosureRejectReason | null {
  if (!assessPolicyTextQuality(text, "scan_core").usable) {
    return "code_or_non_policy_excerpt";
  }
  if (looksLikeArticle13PageChrome(text, { mode: "scan_core" })) {
    return "page_chrome_or_navigation";
  }
  if (looksLikeArticle13TableOfContents(text, { mode: "scan_core" })) {
    return "table_of_contents_only";
  }
  if (disclosureType === "data_retention" && isGenericArticle13StorageNotRetentionEvidence(text)) {
    return "generic_storage_not_retention";
  }
  if (disclosureType === "data_subject_rights" && !hasSubstantiveRightsDisclosure(text)) {
    return "insufficient_row_specific_terms";
  }
  if (!hasScanCoreRowSpecificArticle13Terms(text, disclosureType)) {
    return "insufficient_row_specific_terms";
  }
  return null;
}

function retainedReportArticle13RejectReason(
  text: string,
  disclosureType: Article13DisclosureType | string | undefined,
): Article13DisclosureRejectReason | null {
  if (!assessPolicyTextQuality(text, "retained_report").usable) {
    return "code_or_non_policy_excerpt";
  }
  if (looksLikeArticle13PageChrome(text, { mode: "retained_report" })) {
    return "page_chrome_or_navigation";
  }
  if (looksLikeArticle13TableOfContents(text, { mode: "retained_report" })) {
    return "table_of_contents_only";
  }
  if (disclosureType === "data_retention" && isGenericArticle13StorageNotRetentionEvidence(text)) {
    return "generic_storage_not_retention";
  }
  if (!hasRetainedReportRowSpecificArticle13Terms(text, disclosureType)) {
    return "insufficient_row_specific_terms";
  }
  return null;
}

function multilingualClassifierArticle13RejectReason(
  text: string,
  disclosureType: Article13DisclosureType | string | undefined,
): Article13DisclosureRejectReason | null {
  if (looksLikeArticle13CodeOrConfigText(text) || !hasMinimumPolicyProseQuality(text)) {
    return "code_or_non_policy_excerpt";
  }
  if (looksLikeArticle13PageChrome(text, { mode: "multilingual_classifier" })) {
    return "page_chrome_or_navigation";
  }
  if (looksLikeArticle13TableOfContents(text, { mode: "multilingual_classifier" })) {
    return "table_of_contents_only";
  }
  if (disclosureType === "data_retention" && isGenericArticle13StorageNotRetentionEvidence(text)) {
    return "generic_storage_not_retention";
  }
  if (!hasLocalizedArticle13EvidenceContext(text, disclosureType)) {
    return "insufficient_row_specific_terms";
  }
  return null;
}

function assessPolicyTextQuality(
  value: string,
  mode: Exclude<Article13DisclosureRejectionMode, "multilingual_classifier">,
) {
  const normalized = normalizeArticle13Whitespace(value);
  if (!normalized) {
    return {
      alphabeticWordRatio: 0,
      codeSignalCount: 0,
      codeSymbolRatio: 0,
      naturalLanguageSentenceCount: 0,
      policyTermCount: 0,
      reason: "empty_policy_text",
      usable: false,
    };
  }

  const lower = normalized.normalize("NFKC").toLowerCase();
  const codeSignalPatterns = [
    /this\.gbar_/i,
    /\bCONFIG:\s*\[\[\[/,
    /Copyright The Closure Library/i,
    /SPDX-License-Identifier/i,
    /\b(?:var|const|let)\s+[A-Za-z_$][\w$]*\s*=/,
    /function\s*\(/,
    /=>/,
    /Object\.definePropert(?:y|ies)/,
  ];
  if (mode === "retained_report") {
    codeSignalPatterns.splice(7, 0, /_\.[A-Za-z_$][\w$]*\s*=/);
  }
  const codeSignalCount = codeSignalPatterns.reduce((count, pattern) => count + (pattern.test(normalized) ? 1 : 0), 0);
  const codeSymbolRatio = (normalized.match(/[{}[\];=<>]/g) ?? []).length / Math.max(normalized.length, 1);
  const totalTokens = normalized.split(/\s+/).filter(Boolean).length;
  const alphabeticWords = normalized.match(/[\p{L}][\p{L}'-]{2,}/gu) ?? [];
  const cjkCharacters = normalized.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/gu) ?? [];
  const alphabeticWordRatio = Math.max(
    alphabeticWords.length / Math.max(totalTokens, 1),
    cjkCharacters.length / Math.max(normalized.replace(/\s/g, "").length, 1)
  );
  const cjkNaturalLanguageSentenceCount = cjkCharacters.length > 0
    ? normalized
      .split(/[。！？]/u)
      .slice(0, -1)
      .filter((sentence) => sentence.trim().length >= 20)
      .length
    : 0;
  const englishNaturalLanguageSentenceCount =
    (normalized.match(/\b(?:we|you|your|our|users?|individuals?|customers?|visitors?|people)\b[^.!?]{20,}[.!?]/gi) ?? []).length +
    cjkNaturalLanguageSentenceCount;
  const unicodeNaturalLanguageSentenceCount = normalized
    .split(/[.!?。！？؟]+/u)
    .filter((sentence) =>
      sentence.trim().length >= 40 &&
      (sentence.match(/\p{L}+/gu) ?? []).length >= 6
    ).length;
  const naturalLanguageSentenceCount = Math.max(
    englishNaturalLanguageSentenceCount,
    unicodeNaturalLanguageSentenceCount,
  );
  const legacyPolicyTermCount = uniqueStrings((lower.match(/\b(?:privacy|collect|use|information|personal data|personal information|data|retain|delete|share|rights|contact|transfer|consent|controller|processor|legal basis|lawful basis)\b/g) ?? [])).length;
  const opening = lower.slice(0, 800);
  const canonicalPolicyTermCount = PRIVACY_EVIDENCE_LOCALE_REGISTRY.reduce((best, entry) => {
    const labels = entry.privacyPolicyLabels.map((term) => term.normalize("NFKC").toLowerCase());
    if (!labels.some((term) => opening.includes(term))) return best;
    const terms = uniqueStrings([...labels, ...entry.contextHints]
      .map((term) => term.normalize("NFKC").toLowerCase()));
    return Math.max(best, terms.filter((term) => lower.includes(term)).length);
  }, 0);
  const policyTermCount = Math.max(legacyPolicyTermCount, canonicalPolicyTermCount);
  const hasDelayedCanonicalPolicyLabel = canonicalPolicyTermCount === 0 && PRIVACY_EVIDENCE_LOCALE_REGISTRY.some((entry) =>
    entry.privacyPolicyLabels.some((term) => {
      const normalizedTerm = term.normalize("NFKC").toLowerCase();
      const index = lower.indexOf(normalizedTerm);
      return index >= 800;
    })
  );
  const escapedUrlCount = (normalized.match(/\\x2f|\\u003c|\\u003e|https?:\\\/\\\//gi) ?? []).length;
  const minifiedTokenCount = (normalized.match(/[A-Za-z_$][\w$]{0,8}\s*[=:]\s*\S{40,}/g) ?? []).length;
  const gdprTransparencyTopicMatchCount = classifyGdprTransparencyTopics({ text: normalized.slice(0, 40_000) }).matches.length;
  const accessChallengeSignalCount = [
    /\bclient challenge\b/i,
    /\ba required part of this site couldn[’']t load\b/i,
    /\bdisable any ad blockers\b/i,
    /\bplease check your connection\b/i,
    /\bentrez les caract[èe]res affich[ée]s\b/i,
    /\bt[ée]l[ée]charger le captcha audio\b/i,
    /\bcaptcha\b/i,
  ].filter((pattern) => pattern.test(normalized)).length;

  let reason: string | undefined;
  if (accessChallengeSignalCount >= 2) {
    reason = "low_quality_access_challenge";
  } else if (/\bthis\.gbar_|\bCONFIG:\s*\[\[\[|Copyright The Closure Library|SPDX-License-Identifier/i.test(normalized)) {
    reason = "low_quality_extracted_code_or_config";
  } else if (codeSignalCount >= 2 && naturalLanguageSentenceCount < 3) {
    reason = "low_quality_extracted_code_or_config";
  } else if (codeSymbolRatio > 0.12 && naturalLanguageSentenceCount < 4) {
    reason = "low_quality_extracted_code_or_config";
  } else if (escapedUrlCount >= 8 && naturalLanguageSentenceCount < 3) {
    reason = "low_quality_extracted_code_or_config";
  } else if (minifiedTokenCount >= 2 && naturalLanguageSentenceCount < 4) {
    reason = "low_quality_extracted_code_or_config";
  } else if (normalized.length >= 500 && alphabeticWordRatio < 0.42) {
    reason = "low_quality_extracted_code_or_config";
  } else if (normalized.length >= 500 && hasDelayedCanonicalPolicyLabel) {
    reason = "low_quality_non_policy_text";
  } else if (
    normalized.length >= 500 &&
    policyTermCount < 2 &&
    gdprTransparencyTopicMatchCount < 1 &&
    naturalLanguageSentenceCount < 2
  ) {
    reason = "low_quality_non_policy_text";
  }

  return {
    accessChallengeSignalCount,
    alphabeticWordRatio,
    codeSignalCount,
    codeSymbolRatio,
    naturalLanguageSentenceCount,
    policyTermCount,
    reason,
    usable: !reason,
  };
}

function hasScanCoreRowSpecificArticle13Terms(
  value: string,
  disclosureType: Article13DisclosureType | string | undefined,
) {
  const text = normalizeArticle13Whitespace(value);
  switch (disclosureType) {
    case "controller_contact":
      return /\b(?:data controller|controller|google llc|google ireland limited|contact (?:our privacy team|google)|questions about (?:this )?(?:privacy )?(?:policy|notice)|privacy officer|privacy office|privacy questions?|privacy@|data protection office|data protection officer|\bdpo\b)\b/i.test(text) &&
        !looksLikeArticle13PageChrome(text, { mode: "scan_core" });
    case "processing_purposes":
      return hasSubstantiveProcessingPurposesEvidence(text);
    case "legal_basis":
      return hasSubstantiveLegalBasisEvidence(text);
    case "recipients_or_vendor_categories":
      return hasSubstantiveRecipientsEvidence(text);
    case "data_retention":
      return hasSubstantiveRetentionEvidence(text) && !isGenericArticle13StorageNotRetentionEvidence(text);
    case "data_subject_rights":
      return hasSubstantiveRightsDisclosure(text);
    case "international_transfers":
      return /\b(?:data transfers?|international transfer|cross-border transfer|standard contractual clauses|adequacy decision|servers around the world|processed? (?:on servers )?outside (?:your )?country|outside (?:of )?the country where you live|legal frameworks? relating to the transfer of data|data protection laws vary|outside (?:the )?(?:eea|european economic area|uk|united kingdom|eu|european union)|third countr(?:y|ies)|data privacy framework|\bdpf\b|privacy shield|(?:personal data|personal information|information|data).{0,160}(?:transferred|processed|stored|accessed).{0,180}(?:united states|other jurisdictions|other countries|outside)|transfer (?:your )?(?:personal )?(?:data|information).{0,220}(?:located )?outside (?:of )?(?:your )?country|(?:third parties|service providers?|business partners?|processors?|vendors?|recipients?).{0,220}outside (?:the )?(?:eea|european economic area|uk|united kingdom|eu|european union)|agreements?.{0,220}(?:personal information|personal data|data|information).{0,220}(?:protect|protected|safeguard|outside (?:the )?(?:eea|european economic area|uk|united kingdom|eu|european union)))\b/i.test(text);
    case "dpo_contact":
      return /\b(?:data protection officer|data privacy officer|office of the data privacy officer|\bdpo\b|data protection contact|privacy contact point|privacy counsel.{0,180}(?:contact|email|mail|address|@)|(?:contact|email|mail|address|@).{0,180}privacy counsel)\b/i.test(text);
    case "supervisory_authority":
      return /\b(?:(?:lodge|file|submit|make)\s+a\s+complaint.{0,160}(?:supervisory|data protection|regulator|authority|information commissioner)|complaints?.{0,200}(?:data protection authorit(?:y|ies)|supervisory authorit(?:y|ies)|regulator|information commissioner)|complain to (?:(?:a|your|the|our|local)\s+)?(?:(?:data protection|supervisory)\s+)?(?:regulator|authority|information commissioner)|(?:supervisory authority|data protection authority|local data protection authorit(?:y|ies)|information commissioner['’]s office).{0,160}complaint|compliance (?:and|&) cooperation with regulators.{0,320}(?:complaints?|regulatory authorities|local data protection authorities|resolve)|formal written complaints?.{0,180}(?:regulatory authorities|local data protection authorities|regulators?)|unresolved complaints?.{0,180}(?:regulatory authorities|local data protection authorities|regulators?)|regulators?.{0,120}(?:complaints?|authorities|resolve))\b/i.test(text);
    case "automated_decision_making_or_profiling":
      return hasSubstantiveAutomatedDecisionOrProfilingEvidence(text);
    default:
      return false;
  }
}

function hasRetainedReportRowSpecificArticle13Terms(
  value: string,
  disclosureType: Article13DisclosureType | string | undefined,
) {
  const text = normalizeArticle13Whitespace(value);
  switch (disclosureType) {
    case "controller_contact":
      return /\b(?:data controller|controller|google llc|google ireland limited|contact (?:our privacy team|google)|questions about (?:this )?(?:privacy )?(?:policy|notice)|privacy officer|privacy office|privacy questions?|privacy@|data protection office|data protection officer|\bdpo\b)\b/i.test(text) &&
        !looksLikeArticle13PageChrome(text, { mode: "retained_report" });
    case "processing_purposes":
      return hasSubstantiveProcessingPurposesEvidence(text);
    case "legal_basis":
      return hasSubstantiveLegalBasisEvidence(text);
    case "recipients_or_vendor_categories":
      return hasSubstantiveRecipientsEvidence(text);
    case "data_retention":
      return hasSubstantiveRetentionEvidence(text) && !isGenericArticle13StorageNotRetentionEvidence(text);
    case "data_subject_rights":
      return hasSubstantiveRightsDisclosure(text);
    case "international_transfers":
      return /\b(?:data transfers?.{0,320}(?:servers around the world|outside (?:of )?the country|legal frameworks?|data privacy frameworks?|safeguards)|international transfer|cross-border transfer|standard contractual clauses|adequacy decision|servers around the world|processed? (?:on servers )?outside (?:your )?country|outside (?:of )?the country where you live|legal frameworks? relating to the transfer of data|data protection laws vary|outside (?:the )?(?:eea|european economic area|uk|united kingdom|eu|european union)|third countr(?:y|ies)|data privacy framework|\bdpf\b|privacy shield|(?:personal data|personal information|information|data).{0,160}(?:transferred|processed|stored|accessed).{0,180}(?:united states|other jurisdictions|other countries|outside)|transfer (?:your )?(?:personal )?(?:data|information).{0,220}(?:located )?outside (?:of )?(?:your )?country|(?:third parties|third-party|service providers?|business partners?|partners?|vendors?|processors?|subprocessors?|affiliates?|recipients?).{0,260}(?:outside (?:the )?(?:eea|european economic area|uk|united kingdom|eu|european union)|third countr(?:y|ies)|foreign countr(?:y|ies)|other countries|countries outside)|agreements?.{0,260}(?:personal information|personal data|data|information).{0,260}(?:protect|protected|safeguard|outside (?:the )?(?:eea|european economic area|uk|united kingdom|eu|european union)))\b/i.test(text);
    case "dpo_contact":
      return /\b(?:data protection officer|data privacy officer|office of the data privacy officer|\bdpo\b|data protection contact|privacy contact point|privacy counsel.{0,180}(?:contact|email|mail|address|@)|(?:contact|email|mail|address|@).{0,180}privacy counsel)\b/i.test(text);
    case "supervisory_authority":
      return /\b(?:(?:lodge|file|submit|make)\s+a\s+complaint.{0,160}(?:supervisory|data protection|regulator|authority|information commissioner)|complaints?.{0,200}(?:data protection authorit(?:y|ies)|supervisory authorit(?:y|ies)|regulator|information commissioner)|complain to (?:(?:a|your|the|our|local)\s+)?(?:(?:data protection|supervisory)\s+)?(?:regulator|authority|information commissioner)|(?:supervisory authority|data protection authority|local data protection authorit(?:y|ies)|information commissioner['’]s office).{0,160}complaint|compliance (?:and|&) cooperation with regulators.{0,320}(?:complaints?|regulatory authorities|local data protection authorities|resolve)|formal written complaints?.{0,180}(?:regulatory authorities|local data protection authorities|regulators?)|unresolved complaints?.{0,180}(?:regulatory authorities|local data protection authorities|regulators?)|regulators?.{0,120}(?:complaints?|authorities|resolve))\b/i.test(text);
    case "automated_decision_making_or_profiling":
      return hasSubstantiveAutomatedDecisionOrProfilingEvidence(text);
    default:
      return false;
  }
}

function hasLocalizedArticle13EvidenceContext(
  value: string,
  disclosureType: Article13DisclosureType | string | undefined,
) {
  const normalized = normalizeArticle13Whitespace(value);
  const canonicalMatch = classifyGdprTransparencyTopics({ text: normalized }).matches
    .find((match) => match.topic === disclosureType);
  if (
    canonicalMatch?.matchedLocale === "en" &&
    disclosureType === "legal_basis" &&
    !hasSubstantiveLegalBasisEvidence(normalized)
  ) {
    return false;
  }
  if (canonicalMatch && disclosureType !== "dpo_contact") {
    return true;
  }
  if (
    canonicalMatch &&
    /(?:reach|reached|available|contact|email|mail|address|postal|@\w|erreichen|kontakt|unter|postadresse|joignable|répond|repond|adresse|atiende|correo|contattar|contatto|risponde|indirizzo|bereikbaar|helpt|odpowiada|pytania|contato|endereço|correio eletrônico|контакт|связаться|連絡|お問い合わせ|联系|联系方式|聯絡|聯繫|聯絡方式|التواصل|الاتصال|kontaktuppgifter|kontakta|datele de contact|contacta|adresă|kontaktní údaje|kontaktovat|στοιχεία επικοινωνίας|επικοινωνήσετε|elérhetőségei|kapcsolatba léphet|kontaktoplysninger|kontakte|yhteystiedot|ottaa yhteyttä|kontaktné údaje|kontaktovať|данни за контакт|свържете|kontaktni podaci|kontaktirati|kontaktopplysninger|kontaktni podatki|stopite v stik|kontaktiniai duomenys|susisiekti|kontaktinformācija|sazināties|kontaktandmed|võtta ühendust|контактні дані|зв'язатися|iletişim bilgileri|iletişime geçin)/iu.test(normalized)
  ) {
    return true;
  }
  if (disclosureType === "data_subject_rights" && hasSubstantiveRightsDisclosure(normalized)) {
    return true;
  }
  const hasPrivacyDataContext =
    /(?:privacy|personal data|personal information|data protection|processing|controller|policy|notice|rights|privacy policy)/i.test(normalized) ||
    /(?:datenschutz|personenbezogene daten|traitement|données personnelles|protección de datos|datos personales|protezione dei dati|dati personali|trattamento dei dati|tuoi dati|suoi dati|persoonsgegevens|gegevensbescherming|dane osobowe|ochrona danych|proteção de dados|dados pessoais|tratamento de dados|política de privacidade)/i.test(normalized);
  if (!hasPrivacyDataContext) {
    return false;
  }

  switch (disclosureType) {
    case "controller_contact":
      return /(?:controller|privacy contact|data protection contact|verantwortlicher|verantwortlich für die datenverarbeitung|responsable du traitement|responsable del tratamiento|titolare del trattamento|titolari del trattamento|verwerkingsverantwoordelijke|administrator danych|controlador dos dados|responsável pelo tratamento|contato do controlador)/i.test(normalized);
    case "dpo_contact":
      return /(?:data protection officer|dpo|privacy contact point|privacy counsel|datenschutzbeauftrag|délégué à la protection|delegado de protección|responsabile della protezione|functionaris voor gegevensbescherming|inspektor ochrony danych|iod|encarregado de proteção de dados|responsabilul cu protecția datelor|pověřenec pro ochranu osobních údajů|υπεύθυνος προστασίας δεδομένων|adatvédelmi tisztviselő|databeskyttelsesrådgiver|tietosuojavastaava|zodpovedná osoba pre ochranu osobných údajov|длъжностно лице по защита на данните|službenik za zaštitu podataka|personvernombud|pooblaščena oseba za varstvo podatkov|duomenų apsaugos pareigūnas|datu aizsardzības speciālists|andmekaitsespetsialist|відповідальна особа із захисту даних|уповноважений із захисту даних|veri koruma görevlisi|資料保護長)/i.test(normalized) &&
        /(?:reach|reached|available|contact|email|mail|address|postal|@\w|erreichen|kontakt|unter|postadresse|joignable|répond|repond|adresse|atiende|correo|contattar|contatto|risponde|indirizzo|bereikbaar|helpt|odpowiada|pytania|contato|endereço|correio eletrônico|聯絡|聯繫|聯絡方式|datele de contact|contacta|adresă|kontaktní údaje|kontaktovat|στοιχεία επικοινωνίας|επικοινωνήσετε|elérhetőségei|kapcsolatba léphet|kontaktoplysninger|kontakte|yhteystiedot|ottaa yhteyttä|kontaktné údaje|kontaktovať|данни за контакт|свържете|kontaktni podaci|kontaktirati|kontaktopplysninger|kontaktni podatki|stopite v stik|kontaktiniai duomenys|susisiekti|kontaktinformācija|sazināties|kontaktandmed|võtta ühendust|контактні дані|зв'язатися|iletişim bilgileri|iletişime geçin)/i.test(normalized);
    case "processing_purposes":
      return /(?:purpose|purposes|why we process|we process|we use|zweck|zwecke|verarbeiten|verarbeitet|finalité|finalités|tratamos|finalidad|finalità|trattiamo|doeleinden|verwerken|cele|przetwarzamy|finalidade|finalidades|utilizamos|usamos)/i.test(normalized);
    case "legal_basis":
      return /(?:legal basis|lawful basis|legitimate interest|article 6|rechtsgrundlage|base légale|base jurídica|base legal|base giuridica|basi giuridiche|grondslag|podstawa prawna|bases legais|legítimo interesse)/i.test(normalized);
    case "recipients_or_vendor_categories":
      return /(?:recipients?|categories of recipients|service providers?|processors?|third parties|empfänger|dienstleister|destinataires|prestataires|destinatarios|proveedores|destinatari|fornitori|ontvangers|dienstverleners|odbiorcy|dostawcy|destinatários|prestadores de serviços|terceiros)/i.test(normalized);
    case "data_retention":
      return /(?:retention|retain|kept|storage period|how long|aufbewahrung|speichern|gespeichert|conservation|conservons|conserv(?:é|e|és|ées)|durée nécessaire|conservación|conservamos|conservazione|conserviamo|bewaren|bewaartermijn|przechowywania|przechowujemy|retenção|prazo de conservação|tempo necessário)/i.test(normalized);
    case "data_subject_rights":
      return hasSubstantiveRightsDisclosure(normalized) ||
        /(?:rights?|right to access|right to erasure|data subject|betroffenenrechte|recht auf|droits?|personnes concernées|derechos?|interesados|diritti?|interessati|rechten|betrokkenen|recht om bezwaar te maken|prawa|osób których dane dotyczą|direitos? do titular|direito de acesso|direito à eliminação)/i.test(normalized);
    case "international_transfers":
      return /(?:international transfer|outside (?:the )?(?:eea|eu|european union)|third countr|standard contractual|übermittlung|drittland|transfert|hors de|transferencia|fuera del|trasferiment|paesi terzi|doorgifte|buiten|transfer|poza|standardowe klauzule|transferências internacionais|fora do espaço econômico europeu|cláusulas contratuais padrão)/i.test(normalized);
    case "supervisory_authority":
      return /(?:supervisory authority|data protection authority|information commissioner['’]s office|lodge a complaint|aufsichtsbehörde|beschwerde|autorité de contrôle|plainte|autoridad de control|reclamación|autorità di controllo|reclamo|toezichthoudende autoriteit|klacht|organ nadzorczy|skarga|autoridade nacional de proteção de dados|reclamação|\banpd\b)/i.test(normalized);
    case "automated_decision_making_or_profiling":
      return /(?:automated decision|automated processing|profiling|solely automated|automatisierte entscheid|profiling|décision automatisée|profilage|decisiones automatizadas|elaboración de perfiles|decisioni automatizzate|profilazione|geautomatiseerde besluitvorming|profilering|zautomatyzowane podejmowanie decyzji|profilowanie|decisões automatizadas|tratamento automatizado|elaboração de perfis)/i.test(normalized);
    default:
      return false;
  }
}

export function hasSubstantiveRightsDisclosure(value: string) {
  const text = normalizeArticle13Whitespace(value);
  if (
    /\b(?:your rights|data subject rights|right to (?:access|delete|erasure|rectification|object|restrict|portability)|rights? to (?:access|delete|erasure|rectification|object|restrict|portability)|exercise (?:your )?rights|privacy controls|download a copy|export (?:your )?(?:data|information)|request to (?:remove|delete|access|correct))\b/i.test(text)
  ) {
    return true;
  }
  const exercisedRightCount = [
    /\b(?:access|review|obtain) (?:a copy of )?(?:your )?(?:personal )?(?:data|information|content)\b/i,
    /\b(?:download|export) (?:a copy of )?(?:your )?(?:personal )?(?:data|information|content)\b/i,
    /\b(?:delete|erase|remove) (?:your )?(?:personal )?(?:data|information|content)\b/i,
    /\b(?:correct|rectify|update) (?:your )?(?:personal )?(?:data|information)\b/i,
    /\b(?:restrict|object to) (?:the )?(?:processing|use)\b/i,
    /\bdata portability\b/i,
  ].filter((pattern) => pattern.test(text)).length;
  return exercisedRightCount >= 2 &&
    /\b(?:privacy|personal data|personal information|your data|your information|your account|content in your account|data subject)\b/i.test(text);
}

function hasMinimumPolicyProseQuality(value: string) {
  const text = normalizeArticle13Whitespace(value);
  if (text.length < 500) {
    return true;
  }
  const totalTokens = text.split(/\s+/).filter(Boolean).length;
  const alphabeticWordRatio = text.split(/\s+/).filter((token) => /^[\p{L}][\p{L}'-]{2,}$/u.test(token)).length / Math.max(totalTokens, 1);
  const sentenceCount = (text.match(/[.!?。！？](?:\s|$)?/g) ?? []).length;
  return alphabeticWordRatio >= 0.42 && sentenceCount >= 2;
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => typeof value === "string" && value.trim().length > 0)));
}
