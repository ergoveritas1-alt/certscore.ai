import { classifyGdprTransparencyTopics } from "./gdpr-transparency-topic-classifier";

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
  if (/skip to main content|privacy policy\s+[-–]\s+privacy\s*&\s*terms|overview privacy policy terms of service technologies faq/i.test(text)) {
    return true;
  }
  const mode = options.mode ?? "scan_core";
  const navTokens = mode === "multilingual_classifier"
    ? (text.match(/\b(?:overview|privacy policy|terms of service|technologies|faq|introduction|privacy|terms|skip to main content|navigation|menu|search)\b/gi) ?? []).length
    : (text.match(/\b(?:overview|privacy policy|terms of service|technologies|faq|introduction|privacy|terms|skip to main content)\b/gi) ?? []).length;
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
    ? (text.match(/\b(?:introduction|information (?:we|google) collects?|why (?:we|google) collects?|your privacy controls|sharing your information|keeping your information|exporting|deleting|retaining|terms|faq|controller|legal basis|recipients|retention|rights|transfers|complaints|inhaltsverzeichnis|table des matières|sommaire|navigation de la politique|índice|indice|inhoudsopgave|spis treści|artykuł pomocy|szablon formularza|zwecke der verarbeitung|rechtsgrundlage|kategorien von empfängern|speicherdauer|recht auf auskunft|übermittlung personenbezogener daten|beschwerde bei einer aufsichtsbehörde|finalités du traitement|base juridique|catégories de destinataires|durée de conservation|droit d'accès|transferts internationaux|autorité de contrôle|finalidades del tratamiento|base jurídica|categorías de destinatarios|plazo de conservación|derecho de acceso|transferencias internacionales|autoridad de control|finalità del trattamento|base giuridica|categorie di destinatari|periodo di conservazione|diritto di accesso|trasferimenti internazionali|autorità di controllo|doeleinden van de verwerking|rechtsgrondslag|categorieën van ontvangers|bewaartermijn|recht op inzage|internationale doorgiften|toezichthoudende autoriteit|cele przetwarzania|podstawa prawna|kategorie odbiorców|okres przechowywania|prawo dostępu|transfery międzynarodowe|organ(?:u)? nadzorcz)/gi) ?? []).length
    : (text.match(/\b(?:introduction|information (?:we|google) collects?|why (?:we|google) collects?|your privacy controls|sharing your information|keeping your information|exporting|deleting|retaining|terms|faq)\b/gi) ?? []).length;
  const hasDisclosureVerb = mode === "multilingual_classifier"
    ? /\b(?:we|you|our)\s+(?:use|process|collect|retain|keep|store|share|transfer|disclose|provide|may|can|have|request|exercise)\b/i.test(text) ||
      /\b(?:wir|sie|ihre|unsere)\s+(?:nutzen|verwenden|verarbeiten|speichern|teilen|übermitteln|erklären|beschreiben)\b/i.test(text) ||
      /\b(?:nous|vous|notre|nos)\s+(?:utilisons|traitons|collectons|conservons|partageons|transférons|expliquons)\b/i.test(text) ||
      /\b(?:nosotros|usted|sus|nuestro)\s+(?:usamos|tratamos|recogemos|conservamos|compartimos|transferimos|explicamos)\b/i.test(text) ||
      /\b(?:noi|tu|suoi|nostri)\s+(?:utilizziamo|trattiamo|raccogliamo|conserviamo|condividiamo|trasferiamo|spieghiamo)\b/i.test(text) ||
      /\b(?:wij|u|uw|onze)\s+(?:gebruiken|verwerken|bewaren|delen|verstrekken|beschrijven)\b/i.test(text) ||
      /\b(?:my|użytkownik|twoje|nasze)\s+(?:używamy|przetwarzamy|przechowujemy|udostępniamy|opisujemy)\b/i.test(text) ||
      /\b(?:erklären|beschreiben|expliquons|explicamos|spieghiamo|beschrijven|opisujemy)\b/i.test(text)
    : /\b(?:we|you|our)\s+(?:use|process|collect|retain|keep|store|share|transfer|disclose|provide|may|can|have|request|exercise)\b/i.test(text);
  return tocTokens >= 4 && !hasDisclosureVerb;
}

export function isGenericArticle13StorageNotRetentionEvidence(value: string) {
  const text = normalizeArticle13Whitespace(value);
  const hasStorageMechanics =
    /\b(?:collect|store|storage|cookies?|local storage|databases?|server logs?)\b/i.test(text) ||
    /(?:collect(?:é|e|és|ées)|recogid[ao]s?|raccolt[oi]|verzameld|zbierane)/i.test(text);
  const hasRetentionLifecycle =
    /\b(?:retain|retention|how long|kept for|stored for|delete|deletion|anonymi[sz]e|remove|expires?|as long as necessary|no longer needed|required by law|legal purposes|fraud|abuse)\b/i.test(text) ||
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

  const lower = normalized.toLowerCase();
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
  const alphabeticWords = mode === "scan_core"
    ? (normalized.match(/\b[\p{L}][\p{L}'-]{2,}\b/gu) ?? [])
    : (normalized.match(/\b[A-Za-z][A-Za-z'-]{2,}\b/g) ?? []);
  const alphabeticWordRatio = alphabeticWords.length / Math.max(totalTokens, 1);
  const naturalLanguageSentenceCount = (normalized.match(/\b(?:we|you|your|our|users?|individuals?|customers?|visitors?|people)\b[^.!?]{20,}[.!?]/gi) ?? []).length;
  const policyTermCount = uniqueStrings((lower.match(/\b(?:privacy|collect|use|information|personal data|personal information|data|retain|delete|share|rights|contact|transfer|consent|controller|processor|legal basis|lawful basis)\b/g) ?? [])).length;
  const escapedUrlCount = (normalized.match(/\\x2f|\\u003c|\\u003e|https?:\\\/\\\//gi) ?? []).length;
  const minifiedTokenCount = (normalized.match(/[A-Za-z_$][\w$]{0,8}\s*[=:]\s*\S{40,}/g) ?? []).length;
  const gdprTransparencyTopicMatchCount = mode === "scan_core"
    ? classifyGdprTransparencyTopics({ text: normalized.slice(0, 40_000) }).matches.length
    : 0;

  let reason: string | undefined;
  if (/\bthis\.gbar_|\bCONFIG:\s*\[\[\[|Copyright The Closure Library|SPDX-License-Identifier/i.test(normalized)) {
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
  } else if (
    normalized.length >= 500 &&
    policyTermCount < 2 &&
    (mode === "retained_report" || gdprTransparencyTopicMatchCount < 1) &&
    naturalLanguageSentenceCount < 2
  ) {
    reason = "low_quality_non_policy_text";
  }

  return {
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
      return /\b(?:data controller|controller|google llc|google ireland limited|contact (?:us|our privacy team|google)|questions about (?:this )?(?:policy|privacy)|privacy office|privacy questions?|privacy@|data protection office|data protection officer|\bdpo\b)\b/i.test(text) &&
        !looksLikeArticle13PageChrome(text, { mode: "scan_core" });
    case "processing_purposes":
      return /\b(?:purpose(?:s)?|why we (?:process|collect|use)|we (?:use|process|collect) (?:your )?(?:personal )?(?:data|information) (?:to|for)|provide (?:our )?services|personalize)\b/i.test(text);
    case "legal_basis":
      return /\b(?:legal basis|lawful basis|legitimate interests?|performance of (?:a )?contract|contractual necessity|legal obligation|public task|public interest|vital interests?|with your consent|consent to)\b/i.test(text);
    case "recipients_or_vendor_categories":
      return /\b(?:recipients|service providers|processors|vendors?|partners|affiliates|third parties|third-party|advertising partners?|analytics providers?)\b/i.test(text);
    case "data_retention":
      return /\b(?:retaining your information|retention period|retention criteria|storage period|retain|retention|kept for|stored for|as long as necessary|deleted or anonymi[sz]ed|expires?|no longer needed|required by law|legal purposes|fraud|abuse)\b/i.test(text) &&
        !isGenericArticle13StorageNotRetentionEvidence(text);
    case "data_subject_rights":
      return hasSubstantiveRightsDisclosure(text);
    case "international_transfers":
      return /\b(?:data transfers?|international transfer|cross-border transfer|standard contractual clauses|adequacy decision|servers around the world|processed? (?:on servers )?outside (?:your )?country|outside (?:of )?the country where you live|legal frameworks? relating to the transfer of data|data protection laws vary|outside (?:the )?(?:eea|european economic area|uk|united kingdom|eu|european union)|third countr(?:y|ies)|data privacy framework|\bdpf\b|privacy shield|transfer (?:your )?(?:personal )?(?:data|information).{0,80}outside (?:your )?country|(?:third parties|service providers?|business partners?|processors?|vendors?|recipients?).{0,220}outside (?:the )?(?:eea|european economic area|uk|united kingdom|eu|european union)|agreements?.{0,220}(?:personal information|personal data|data|information).{0,220}(?:protect|protected|safeguard|outside (?:the )?(?:eea|european economic area|uk|united kingdom|eu|european union)))\b/i.test(text);
    case "dpo_contact":
      return /\b(?:data protection officer|\bdpo\b|data protection contact)\b/i.test(text);
    case "supervisory_authority":
      return /\b(?:supervisory authority|data protection authority|local data protection authorit(?:y|ies)|lodge a complaint|complain to (?:a )?(?:regulator|authority)|compliance (?:and|&) cooperation with regulators.{0,320}(?:complaints?|regulatory authorities|local data protection authorities|resolve)|formal written complaints?|regulatory authorities|unresolved complaints?|regulators?.{0,120}(?:complaints?|authorities|resolve)|\bico\b|\bcnil\b|\bdpc\b)\b/i.test(text);
    case "automated_decision_making_or_profiling":
      return /\b(?:automated decision|solely automated|profiling|meaningful information about the logic|automated systems?|algorithms?|recognize patterns|personalized ads|personalized advertising|customi[sz]ed search results|tailored search results|tailored|personalization)\b/i.test(text);
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
      return /\b(?:data controller|controller|google llc|google ireland limited|contact (?:us|our privacy team|google)|questions about (?:this )?(?:policy|privacy)|privacy office|privacy questions?|privacy@|data protection office|data protection officer|\bdpo\b)\b/i.test(text) &&
        !looksLikeArticle13PageChrome(text, { mode: "retained_report" });
    case "processing_purposes":
      return /\b(?:purpose(?:s)?|why we (?:process|collect|use)|we (?:use|process|collect) (?:your )?(?:personal )?(?:data|information) (?:to|for)|provide (?:our )?services|personalize)\b/i.test(text);
    case "legal_basis":
      return /\b(?:legal basis|lawful basis|legitimate interests?|performance of (?:a )?contract|contractual necessity|legal obligation|public task|public interest|vital interests?|with your consent|consent to)\b/i.test(text);
    case "recipients_or_vendor_categories":
      return /\b(?:recipients|service providers|processors|vendors?|partners|affiliates|third parties|third-party|advertising partners?|analytics providers?)\b/i.test(text);
    case "data_retention":
      return /\b(?:retaining your information|retention period|retention criteria|storage period|retain|retention|kept for|stored for|as long as necessary|deleted or anonymi[sz]ed|expires?|no longer needed|required by law|legal purposes|fraud|abuse)\b/i.test(text) &&
        !isGenericArticle13StorageNotRetentionEvidence(text);
    case "data_subject_rights":
      return hasSubstantiveRightsDisclosure(text);
    case "international_transfers":
      return /\b(?:data transfers?.{0,320}(?:servers around the world|outside (?:of )?the country|legal frameworks?|data privacy frameworks?|safeguards)|international transfer|cross-border transfer|standard contractual clauses|adequacy decision|servers around the world|processed? (?:on servers )?outside (?:your )?country|outside (?:of )?the country where you live|legal frameworks? relating to the transfer of data|data protection laws vary|outside (?:the )?(?:eea|european economic area|uk|united kingdom|eu|european union)|third countr(?:y|ies)|data privacy framework|\bdpf\b|privacy shield|transfer (?:your )?(?:personal )?(?:data|information).{0,80}outside (?:your )?country|(?:third parties|third-party|service providers?|business partners?|partners?|vendors?|processors?|subprocessors?|affiliates?|recipients?).{0,260}(?:outside (?:the )?(?:eea|european economic area|uk|united kingdom|eu|european union)|third countr(?:y|ies)|foreign countr(?:y|ies)|other countries|countries outside)|agreements?.{0,260}(?:personal information|personal data|data|information).{0,260}(?:protect|protected|safeguard|outside (?:the )?(?:eea|european economic area|uk|united kingdom|eu|european union)))\b/i.test(text);
    case "dpo_contact":
      return /\b(?:data protection officer|\bdpo\b|data protection contact)\b/i.test(text);
    case "supervisory_authority":
      return /\b(?:supervisory authority|data protection authority|local data protection authorit(?:y|ies)|lodge a complaint|complain to (?:a )?(?:regulator|authority)|compliance (?:and|&) cooperation with regulators.{0,320}(?:complaints?|regulatory authorities|local data protection authorities|resolve)|formal written complaints?|regulatory authorities|unresolved complaints?|regulators?.{0,120}(?:complaints?|authorities|resolve)|\bico\b|\bcnil\b|\bdpc\b)\b/i.test(text);
    case "automated_decision_making_or_profiling":
      return /\b(?:automated decision|solely automated|profiling|meaningful information about the logic|automated systems?|algorithms?|recognize patterns|personalized ads|personalized advertising|customi[sz]ed search results|tailored search results|tailored|personalization)\b/i.test(text);
    default:
      return false;
  }
}

function hasLocalizedArticle13EvidenceContext(
  value: string,
  disclosureType: Article13DisclosureType | string | undefined,
) {
  const normalized = normalizeArticle13Whitespace(value);
  const hasPrivacyDataContext =
    /(?:privacy|personal data|personal information|data protection|processing|controller|policy|notice|rights|privacy policy|privacy controls|your data|your information|process data|process information|data transfers?|retaining your information|retention)/i.test(normalized) ||
    /(?:datenschutz|datenverarbeitung|dsgvo|personenbezogene daten|traitement|données personnelles|protección de datos|datos personales|protezione dei dati|dati personali|trattamento dei dati|tuoi dati|suoi dati|persoonsgegevens|gegevensbescherming|dane osobowe|danych osobowych|przetwarzanie danych|ochrona danych|ochrony danych|rodo)/i.test(normalized);
  if (!hasPrivacyDataContext) {
    return false;
  }

  switch (disclosureType) {
    case "controller_contact":
      return /(?:controller|privacy contact|data protection contact|verantwortlicher|verantwortlich für die datenverarbeitung|responsable du traitement|responsable del tratamiento|titolare del trattamento|titolari del trattamento|verwerkingsverantwoordelijke|verantwoordelijk voor (?:deze website|de verwerking)|is verantwoordelijk voor de verwerking|administrator danych|administratorem danych osobowych)/i.test(normalized);
    case "dpo_contact":
      return /(?:data protection officer|dpo|datenschutzbeauftrag|délégué à la protection|delegado de protección|responsabile della protezione|functionaris voor gegevensbescherming|inspektor ochrony danych|inspektorem ochrony danych osobowych|iod)/i.test(normalized) &&
        /(?:reach|reached|available|contact|email|mail|address|postal|@\w|erreichen|kontakt|unter|postadresse|joignable|répond|repond|adresse|atiende|correo|contattar|contatto|risponde|indirizzo|bereikbaar|helpt|odpowiada|pytania)/i.test(normalized);
    case "processing_purposes":
      return /(?:purpose|purposes|why we process|we process|we use|zweck|zwecke|verarbeiten|verarbeitet|finalité|finalités|tratamos|trataremos|finalidad|finalidades|finalità|trattiamo|trattati per le seguenti finalità|doeleinden|verwerken|waarvoor gebruiken wij|hoe we jouw persoonsgegevens gebruiken|waarom en hoe (?:wij )?(?:deze )?gegevens opsla(?:an|at)|cele|przetwarzamy|w jakim celu|następujących celach)/i.test(normalized);
    case "legal_basis":
      return /(?:legal basis|lawful basis|legitimate interest|article 6|rechtsgrundlage|base légale|base jurídica|base legal|legitimación|base giuridica|basi giuridiche|grondslag|podstawa prawna|podstawą prawną|podstawą przetwarzania|art\.?\s*6)/i.test(normalized);
    case "recipients_or_vendor_categories":
      return /(?:recipients?|categories of recipients|service providers?|processors?|third parties|empfänger|dienstleister|drittanbieter|destinataires|prestataires|destinatarios|proveedores|encargados del tratamiento|comunicaremos sus datos personales|destinatari|fornitori|responsabili del trattamento|soggetti autorizzati al trattamento|ontvangers|dienstverleners|aan wie geven wij uw gegevens door|met wie delen wij uw persoonsgegevens|odbiorcy|dostawcy|podmiot(?:y|om)|partnerzy|grupy kapitałowej)/i.test(normalized);
    case "data_retention":
      return /(?:retention|retain|kept|storage period|how long|aufbewahrung|speichern|gespeichert|speicherdauer|solange|erforderlich|conservation|conservons|conserv(?:é|e|és|ées)|durée nécessaire|conservación|conservamos|conservaremos|serán conservados|conservazione|conserviamo|saranno conservati|tempo necessario al perseguimento|bewaren|bewaartermijn|przechowywania|przechowujemy|okres przechowywania|nie dłużej niż|cofnięcia zgody|przedawnienia roszczeń)/i.test(normalized);
    case "data_subject_rights":
      return /(?:rights?|right to access|right to erasure|data subject|download a copy|export (?:your )?(?:data|information)|privacy controls|betroffenenrechte|recht auf|droits?|personnes concernées|derechos?|acceso|rectificación|supresión|oposición|limitación|portabilidad|interesados|diritti?|accesso|rettifica|cancellazione|limitazione|opposizione|portabilità|interessati|rechten|betrokkenen|recht om bezwaar te maken|prawa|osób których dane dotyczą|przysługuje ci prawo|prawo do (?:dostępu|usunięcia|sprostowania|ograniczenia|sprzeciwu|przenoszenia))/i.test(normalized);
    case "international_transfers":
      return /(?:international transfer|outside (?:the )?(?:eea|eu|european union)|third countr|standard contractual|übermittlung|drittland|außerhalb des europäischen wirtschaftsraumes|standardvertragsklauseln|transfert|hors de|transferencia|fuera del|terceros países|cláusulas contractuales tipo|trasferiment|paesi terzi|clausole contrattuali standard|doorgifte|buiten|transfer|poza|standardowe klauzule|europejskim obszarem gospodarczym|eog)/i.test(normalized);
    case "supervisory_authority":
      return /(?:supervisory authority|data protection authority|lodge a complaint|aufsichtsbehörde|zuständigen aufsichtsbehörde|beschwerderecht|beschwerde|autorité de contrôle|plainte|autoridad de control|reclamación|agencia española de protección de datos|autorità di controllo|reclamo|garante per la protezione dei dati personali|toezichthoudende autoriteit|autoriteit persoonsgegevens|klacht|organ nadzorczy|skarga|prezes(?:a)? urzędu ochrony danych osobowych)/i.test(normalized);
    case "automated_decision_making_or_profiling":
      return /(?:automated decision|automated processing|profiling|solely automated|automatisierte entscheid|automatische entscheid|profiling|décision automatisée|profilage|decisiones automatizadas|elaboración de perfiles|decisioni automatizzate|profilazione|geautomatiseerde besluitvorming|profilering|zautomatyzowane podejmowanie decyzji|profilowanie|wykorzystujemy profilowanie|profilowania dla celów marketingowych)/i.test(normalized);
    default:
      return false;
  }
}

function hasSubstantiveRightsDisclosure(value: string) {
  return /\b(?:your rights|data subject rights|right to (?:access|delete|erasure|rectification|object|restrict|portability)|rights? to (?:access|delete|erasure|rectification|object|restrict|portability)|exercise (?:your )?rights|privacy controls|download a copy|export (?:your )?(?:data|information)|request to (?:remove|delete|access|correct))\b/i.test(value);
}

function hasMinimumPolicyProseQuality(value: string) {
  const text = normalizeArticle13Whitespace(value);
  if (text.length < 500) {
    return true;
  }
  const totalTokens = text.split(/\s+/).filter(Boolean).length;
  const alphabeticWordRatio = (text.match(/\b[\p{L}][\p{L}'-]{2,}\b/gu) ?? []).length / Math.max(totalTokens, 1);
  const sentenceCount = (text.match(/[.!?](?:\s|$)/g) ?? []).length;
  return alphabeticWordRatio >= 0.42 && sentenceCount >= 2;
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => typeof value === "string" && value.trim().length > 0)));
}
