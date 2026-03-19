import { extractSentenceSnippet, hashNormalizedPolicyText, normalizePolicyText } from "./normalize";
import type {
  PolicyCookieDisclosureItem,
  PolicyPageType,
  PolicyRulePreprocessResult,
  PolicyTopicKey,
  PolicyTransferMechanismItem
} from "./types";

const DATA_CATEGORY_PATTERNS = [
  { category: "email", pattern: /\bemail address(?:es)?\b/i },
  { category: "ip", pattern: /\bip address(?:es)?\b/i },
  { category: "payment", pattern: /\b(payment|credit card|billing information)\b/i },
  { category: "health", pattern: /\b(health data|medical information|health information)\b/i },
  { category: "biometric", pattern: /\bbiometric\b/i },
  { category: "location", pattern: /\b(location data|geolocation)\b/i }
] as const;

const TOPIC_PATTERNS: Array<{ topic: PolicyTopicKey; pattern: RegExp }> = [
  { topic: "gdpr", pattern: /\bgdpr\b|general data protection regulation/i },
  { topic: "ccpa_or_cpra", pattern: /\bccpa\b|\bcpra\b|california consumer privacy/i },
  { topic: "cross_border_transfer", pattern: /\bcross-border\b|international transfer|transfer.*outside/i },
  { topic: "data_retention", pattern: /\bretain|retention|keep your data|store.*for\b/i },
  { topic: "sensitive_data", pattern: /\bsensitive data\b|health data|biometric|financial information/i },
  { topic: "children", pattern: /\bunder 13\b|\bunder 16\b|children under/i },
  { topic: "session_replay_disclosure", pattern: /\bsession replay\b|record your interactions|replay your session/i }
];

function getSnippetForPattern(source: string, pattern: RegExp) {
  const match = pattern.exec(source);
  if (!match || typeof match.index !== "number") {
    return null;
  }

  return extractSentenceSnippet({
    matchIndex: match.index,
    source
  });
}

function firstSentence(text: string) {
  return text.split(/(?<=[.!?])\s+/).find((sentence) => sentence.trim().length > 0)?.trim() ?? null;
}

function clampSummary(text: string | null, maxLength = 280) {
  if (!text) {
    return null;
  }

  return text.length <= maxLength ? text : text.slice(0, maxLength).trim();
}

function toIsoDate(value: string | null) {
  if (!value) {
    return null;
  }

  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return null;
  }

  return new Date(parsed).toISOString().slice(0, 10);
}

function extractPolicyUpdateDate(value: string) {
  const match =
    value.match(/\b(?:jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december)\s+\d{1,2},\s+\d{4}\b/i) ??
    value.match(/\b\d{4}-\d{2}-\d{2}\b/) ??
    value.match(/\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/);

  return toIsoDate(match?.[0] ?? null);
}

function extractGoverningLaw(text: string) {
  const match =
    text.match(/\bgoverned by (?:the )?laws of ([A-Za-z .-]{2,80})(?:,|\.)/i) ??
    text.match(/\bthe laws of ([A-Za-z .-]{2,80}) shall govern\b/i) ??
    text.match(/\bgoverning law[:\s]+([A-Za-z .-]{2,80})(?:,|\.)/i);

  return match?.[1]?.replace(/\s+/g, " ").trim() ?? null;
}

function extractArbitrationPresent(text: string) {
  if (!text) {
    return null;
  }

  return /\barbitration\b|\bbinding arbitration\b|\bdispute resolution\b|\bclass action waiver\b/i.test(text);
}

function extractNoticeContactPresent(text: string) {
  if (!text) {
    return null;
  }

  return /\bcontact us\b|\bemail us at\b|\bnotices? to\b|\bsend notices? to\b|\bwritten notice\b/i.test(text);
}

function extractTerminationOrSuspensionPresent(text: string) {
  if (!text) {
    return null;
  }

  return /\bterminate\b|\btermination\b|\bsuspend\b|\bsuspension\b|\bwe may suspend\b|\bwe may terminate\b/i.test(text);
}

function extractCancellationOrRefundPresent(text: string) {
  if (!text) {
    return null;
  }

  return /\bcancel(?:lation)?\b|\brefunds?\b|\bbilling\b|\bsubscription\b|\brenewal\b|\bchargebacks?\b/i.test(text);
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function stripHtml(value: string) {
  return decodeHtmlEntities(value.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function normalizeCookieToken(value: string | null) {
  if (!value) {
    return null;
  }

  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function looksLikeCookieName(value: string) {
  return /^[_a-z0-9.-]{2,}$/i.test(value) || /^ajs_[a-z0-9._-]+$/i.test(value);
}

function extractCookieDisclosures(input: { html?: string; text: string }) {
  const html = input.html ?? "";
  const disclosures: PolicyCookieDisclosureItem[] = [];

  const pushDisclosure = (disclosure: PolicyCookieDisclosureItem) => {
    const normalizedName = normalizeCookieToken(disclosure.cookieName);
    const normalizedProvider = normalizeCookieToken(disclosure.provider);
    const normalizedPurpose = normalizeCookieToken(disclosure.purpose);
    const normalizedDuration = normalizeCookieToken(disclosure.duration);

    const existing = disclosures.find((item) => {
      return (
        normalizeCookieToken(item.cookieName) === normalizedName &&
        normalizeCookieToken(item.provider) === normalizedProvider &&
        normalizeCookieToken(item.purpose) === normalizedPurpose &&
        normalizeCookieToken(item.duration) === normalizedDuration
      );
    });

    if (existing) {
      existing.confidence = Math.max(existing.confidence, disclosure.confidence);
      existing.snippet = existing.snippet ?? disclosure.snippet;
      existing.cookieName = existing.cookieName ?? disclosure.cookieName;
      existing.provider = existing.provider ?? disclosure.provider;
      existing.purpose = existing.purpose ?? disclosure.purpose;
      existing.duration = existing.duration ?? disclosure.duration;
      return;
    }

    disclosures.push(disclosure);
  };

  const tableMatches = html.match(/<table[\s\S]*?<\/table>/gi) ?? [];

  for (const table of tableMatches) {
    const rowMatches = table.match(/<tr[\s\S]*?<\/tr>/gi) ?? [];
    if (rowMatches.length < 2) {
      continue;
    }

    const headerCells = rowMatches[0]?.match(/<(?:th|td)[^>]*>[\s\S]*?<\/(?:th|td)>/gi)?.map(stripHtml) ?? [];
    const headerIndex = {
      cookieName: headerCells.findIndex((cell) => /\bcookie\b|\bname\b/i.test(cell)),
      provider: headerCells.findIndex((cell) => /\bprovider\b|\bvendor\b/i.test(cell)),
      purpose: headerCells.findIndex((cell) => /\bpurpose\b|\bcategory\b|\btype\b/i.test(cell)),
      duration: headerCells.findIndex((cell) => /\bduration\b|\bexpiry\b|\bexpiration\b|\bretention\b/i.test(cell))
    };

    if (headerIndex.cookieName < 0 && headerIndex.provider < 0 && headerIndex.purpose < 0 && headerIndex.duration < 0) {
      continue;
    }

    for (const row of rowMatches.slice(1)) {
      const cells = row.match(/<(?:th|td)[^>]*>[\s\S]*?<\/(?:th|td)>/gi)?.map(stripHtml) ?? [];
      if (cells.length === 0) {
        continue;
      }

      const cookieName = headerIndex.cookieName >= 0 ? cells[headerIndex.cookieName] ?? null : null;
      if (cookieName && !looksLikeCookieName(cookieName) && headerIndex.provider < 0) {
        continue;
      }

      const provider = headerIndex.provider >= 0 ? cells[headerIndex.provider] ?? null : null;
      const purpose = headerIndex.purpose >= 0 ? cells[headerIndex.purpose] ?? null : null;
      const duration = headerIndex.duration >= 0 ? cells[headerIndex.duration] ?? null : null;

      if (!cookieName && !provider && !purpose && !duration) {
        continue;
      }

      pushDisclosure({
        confidence: 0.9,
        cookieName,
        provider,
        purpose,
        duration,
        snippet: [cookieName, provider, purpose, duration].filter(Boolean).join(" | ") || null
      });
    }
  }

  const blockPattern =
    /(?:cookie name|name)\s*[:\-]\s*([^\n|;]+)[\s\S]{0,180}?(?:provider|vendor)\s*[:\-]\s*([^\n|;]+)?[\s\S]{0,180}?(?:purpose|category|type)\s*[:\-]\s*([^\n|;]+)?[\s\S]{0,180}?(?:duration|expiry|expiration|retention)\s*[:\-]\s*([^\n|;]+)/gi;

  for (const match of input.text.matchAll(blockPattern)) {
    const cookieName = match[1]?.trim() ?? null;
    const provider = match[2]?.trim() ?? null;
    const purpose = match[3]?.trim() ?? null;
    const duration = match[4]?.trim() ?? null;

    if (!cookieName && !provider && !purpose && !duration) {
      continue;
    }

    pushDisclosure({
      confidence: 0.72,
      cookieName,
      provider,
      purpose,
      duration,
      snippet: match[0]?.replace(/\s+/g, " ").trim() ?? null
    });
  }

  return disclosures.slice(0, 64);
}

export function ruleBasedPolicyPreprocess(input: { html?: string; pageType?: PolicyPageType; text: string }) {
  const normalizedText = normalizePolicyText(input.text);
  const lowerText = normalizedText.toLowerCase();
  const pageType = input.pageType ?? "privacy_policy";
  const isTermsPage = pageType === "terms_of_service";
  const evidenceSnippets: Record<string, string> = {};
  const actionableFlags: string[] = [];

  const addEvidence = (key: string, snippet: string | null) => {
    if (snippet) {
      evidenceSnippets[key] = snippet;
    }
  };

  const policyMentions = TOPIC_PATTERNS.flatMap((entry) => {
    const snippet = getSnippetForPattern(normalizedText, entry.pattern);
    if (!snippet) {
      return [];
    }

    addEvidence(`topic:${entry.topic}`, snippet);
    return [{ topic: entry.topic, confidence: 0.82 }];
  });

  const dsarPresent = /request access|request deletion|delete your data|access your data|data subject request|submit a privacy request/i.test(
    normalizedText
  );
  const dataAccessRequestPresent = /request access|access your data|copy of your data|right to access/i.test(normalizedText);
  const dataDeletionRequestPresent = /request deletion|delete your data|right to delete|erasure request/i.test(normalizedText);
  const privacyContactOnly = /privacy@|dpo@|contact us about privacy|contact our privacy team/i.test(normalizedText);
  const dsarMechanism = dsarPresent ? "present" : privacyContactOnly ? "partial" : normalizedText.length > 0 ? "absent" : "unknown";
  addEvidence("dsar", dsarPresent ? getSnippetForPattern(normalizedText, /request access|request deletion|delete your data|access your data|data subject request/i) : privacyContactOnly ? getSnippetForPattern(normalizedText, /privacy@|dpo@|contact us about privacy|contact our privacy team/i) : null);

  const doNotSellLink = /do not sell(?: or share)? (?:my|your) personal information/i.test(normalizedText);
  const doNotSellText = /we do not sell your personal information|we do not sell personal data/i.test(normalizedText);
  const doNotSell = doNotSellLink ? "present_link" : doNotSellText ? "present_text" : normalizedText.length > 0 ? "absent" : "unknown";
  addEvidence(
    "do_not_sell",
    doNotSellLink
      ? getSnippetForPattern(normalizedText, /do not sell(?: or share)? (?:my|your) personal information/i)
      : doNotSellText
        ? getSnippetForPattern(normalizedText, /we do not sell your personal information|we do not sell personal data/i)
        : null
  );

  const policyClaimNoTracking = /\bwe do not track\b|no tracking technologies|we do not use tracking/i.test(normalizedText);
  const policyClaimPrivacyProtective =
    /\bwe are committed to protecting your privacy\b|privacy by design|protect your privacy|we safeguard your data/i.test(normalizedText);
  addEvidence(
    "claim_no_tracking",
    policyClaimNoTracking ? getSnippetForPattern(normalizedText, /\bwe do not track\b|no tracking technologies|we do not use tracking/i) : null
  );
  addEvidence(
    "claim_privacy_protective",
    policyClaimPrivacyProtective
      ? getSnippetForPattern(normalizedText, /\bwe are committed to protecting your privacy\b|privacy by design|protect your privacy|we safeguard your data/i)
      : null
  );

  const transferMechanisms: PolicyTransferMechanismItem[] = [
    { mechanism: "SCC" as const, pattern: /\bsccs?\b|standard contractual clauses/i },
    { mechanism: "adequacy" as const, pattern: /adequacy decision/i },
    { mechanism: "contract" as const, pattern: /contractual protections|model contract/i }
  ]
    .flatMap((entry) => {
      const snippet = getSnippetForPattern(normalizedText, entry.pattern);
      if (!snippet) {
        return [];
      }

      addEvidence(`transfer:${entry.mechanism}`, snippet);
      return [{ mechanism: entry.mechanism, confidence: 0.8, snippet }];
    });

  const childrenReference = /under 13|children under the age of 13/i.test(normalizedText)
    ? "under_13"
    : /under 16|children under the age of 16/i.test(normalizedText)
      ? "under_16"
      : normalizedText.length > 0
        ? "none"
        : "unknown";
  addEvidence("children", childrenReference === "under_13"
    ? getSnippetForPattern(normalizedText, /under 13|children under the age of 13/i)
    : childrenReference === "under_16"
      ? getSnippetForPattern(normalizedText, /under 16|children under the age of 16/i)
      : null);

  const retentionStatements = Array.from(
    normalizedText.matchAll(/((retain|retention|keep|store).{0,80}?\b(\d+\s+(day|days|month|months|year|years)|indefinitely|as long as necessary|as needed)\b.{0,40})/gi)
  ).slice(0, 8)
    .map((match) => {
      const snippet = match[1]?.trim() ?? null;
      if (snippet) {
        addEvidence(`retention:${snippet.slice(0, 24)}`, snippet);
      }
      return {
        category: /log|logs/i.test(snippet ?? "") ? "logs" : /transaction|order|billing/i.test(snippet ?? "") ? "transaction data" : "other",
        confidence: /\d+\s+(day|days|month|months|year|years)/i.test(snippet ?? "") ? 0.88 : 0.65,
        periodText: snippet ?? "",
        snippet
      } as const;
    });

  const retentionDisclosure =
    retentionStatements.some((item) => /\d+\s+(day|days|month|months|year|years)/i.test(item.periodText)) || /\bindefinitely\b/i.test(normalizedText)
      ? "specific"
      : TOPIC_PATTERNS.some((entry) => entry.topic === "data_retention" && entry.pattern.test(normalizedText))
        ? "vague"
        : "none";

  const privacyContactChannelType = /privacy request form|submit.*privacy request|request form/i.test(normalizedText)
    ? "form"
    : /privacy portal|request portal|consumer privacy portal/i.test(normalizedText)
      ? "portal"
      : /privacy@|dpo@|contact our privacy team|email us at/i.test(normalizedText)
        ? "email"
        : normalizedText.length > 0
          ? "none"
          : null;

  const dataCategories = DATA_CATEGORY_PATTERNS.flatMap((entry) => {
    const snippet = getSnippetForPattern(normalizedText, entry.pattern);
    if (!snippet) {
      return [];
    }

    addEvidence(`data_category:${entry.category}`, snippet);
    return [entry.category];
  });
  const cookieDisclosures = pageType === "cookie_policy" ? extractCookieDisclosures({ html: input.html, text: input.text }) : [];

  for (const disclosure of cookieDisclosures) {
    const evidenceKey =
      disclosure.cookieName && disclosure.cookieName.length > 0
        ? `cookie:${disclosure.cookieName.toLowerCase()}`
        : disclosure.provider
          ? `cookie-provider:${disclosure.provider.toLowerCase()}`
          : null;
    addEvidence(evidenceKey ?? `cookie:${cookieDisclosures.indexOf(disclosure)}`, disclosure.snippet);
  }

  const privacyPolicyDateMatch = normalizedText.match(/(last updated|effective date)[:\s]+([a-z0-9,\-/ ]{4,80})/i)?.[2]?.trim() ?? null;
  const privacyPolicyDate = extractPolicyUpdateDate(privacyPolicyDateMatch ?? "");
  const governingLaw = extractGoverningLaw(normalizedText);
  const arbitrationPresent = extractArbitrationPresent(normalizedText);
  const noticeContactPresent = extractNoticeContactPresent(normalizedText);
  const terminationOrSuspensionPresent = extractTerminationOrSuspensionPresent(normalizedText);
  const cancellationOrRefundPresent = extractCancellationOrRefundPresent(normalizedText);
  addEvidence("effective_date", privacyPolicyDate ? getSnippetForPattern(normalizedText, /(last updated|effective date)[:\s]+([a-z0-9,\-/ ]{4,80})/i) : null);
  addEvidence("governing_law", governingLaw ? getSnippetForPattern(normalizedText, /\bgoverned by (?:the )?laws of [A-Za-z .-]{2,80}(?:,|\.)|\bthe laws of [A-Za-z .-]{2,80} shall govern\b|\bgoverning law[:\s]+[A-Za-z .-]{2,80}(?:,|\.)/i) : null);
  addEvidence("arbitration", arbitrationPresent ? getSnippetForPattern(normalizedText, /\barbitration\b|\bbinding arbitration\b|\bdispute resolution\b|\bclass action waiver\b/i) : null);
  addEvidence("notice_contact", noticeContactPresent ? getSnippetForPattern(normalizedText, /\bcontact us\b|\bemail us at\b|\bnotices? to\b|\bsend notices? to\b|\bwritten notice\b/i) : null);
  addEvidence("termination", terminationOrSuspensionPresent ? getSnippetForPattern(normalizedText, /\bterminate\b|\btermination\b|\bsuspend\b|\bsuspension\b|\bwe may suspend\b|\bwe may terminate\b/i) : null);
  addEvidence("cancellation_refund", cancellationOrRefundPresent ? getSnippetForPattern(normalizedText, /\bcancel(?:lation)?\b|\brefunds?\b|\bbilling\b|\bsubscription\b|\brenewal\b|\bchargebacks?\b/i) : null);
  if (!isTermsPage && dsarMechanism !== "present") {
    actionableFlags.push("missing_dsar");
  }
  if (!isTermsPage && policyMentions.some((mention) => mention.topic === "data_retention") && retentionStatements.length === 0) {
    actionableFlags.push("vague_retention");
  }
  if (!isTermsPage && /may |could |as necessary|from time to time|where appropriate/gi.test(lowerText)) {
    actionableFlags.push("vague_policy_language");
  }
  if (arbitrationPresent) {
    actionableFlags.push("arbitration_clause_present");
  }

  const ambiguousSignals =
    (lowerText.match(/\bmay\b|\bcould\b|as necessary|where appropriate|from time to time/gi) ?? []).length +
    (dsarMechanism === "partial" ? 2 : 0) +
    (retentionStatements.length === 0 && policyMentions.some((mention) => mention.topic === "data_retention") ? 2 : 0);

  const semanticConfidence = isTermsPage
    ? normalizedText.length === 0
      ? 0
      : Math.max(
          0.45,
          Math.min(
            0.82,
            0.52 +
              (privacyPolicyDate ? 0.1 : 0) +
              (governingLaw ? 0.12 : 0) +
              (arbitrationPresent ? 0.12 : 0) +
              (noticeContactPresent ? 0.08 : 0) +
              (terminationOrSuspensionPresent ? 0.08 : 0) +
              (cancellationOrRefundPresent ? 0.08 : 0)
          )
        )
    : normalizedText.length === 0
      ? 0
      : Math.max(0.35, Math.min(0.78, 0.5 + (policyMentions.length + retentionStatements.length) * 0.04));

  return {
    actionableFlags: Array.from(new Set(actionableFlags)),
    arbitrationPresent,
    cancellationOrRefundPresent,
    childrenReference,
    cookieDisclosures,
    dataCategories: Array.from(new Set(dataCategories)),
    dataAccessRequestPresent,
    dataDeletionRequestPresent,
    doNotSell,
    dsarMechanism,
    evidenceSnippets,
    governingLaw,
    mentions: policyMentions,
    needLlm:
      normalizedText.length > 3500 ||
      ambiguousSignals >= 3 ||
      (policyMentions.some((mention) => mention.topic === "sensitive_data") && dsarMechanism !== "present"),
    normalizedPolicyHash: hashNormalizedPolicyText(normalizedText),
    normalizedText,
    noticeContactPresent,
    policyClaimNoSale: doNotSellLink || doNotSellText,
    policyClaimNoTracking,
    policyClaimPrivacyProtective,
    privacyContactChannelType,
    retentionStatements,
    retentionDisclosure,
    semanticConfidence,
    summary: clampSummary(firstSentence(normalizedText)),
    terminationOrSuspensionPresent,
    transferMechanisms,
    updateDate: privacyPolicyDate
  } satisfies PolicyRulePreprocessResult;
}
