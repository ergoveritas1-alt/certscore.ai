"use client";

import React from "react";
import { cn } from "@website-signal-risk-scanner/ui";
import { CollapsibleSectionCard } from "./collapsible-section-card";
import { InfoTip } from "./info-tip";
import { useRegulatoryChecklistAdvancedEvidence } from "./regulatory-checklist-advanced-evidence-context";
import { RegulatoryChecklistCorrectionSteps, RegulatoryChecklistEvidenceDetails } from "./regulatory-checklist-evidence-details";
import { ScanReportDisclosureIcon } from "./scan-report-disclosure-icon";
import type {
  GdprEprivacyCoverageChecklistItem
} from "../../lib/scans/gdpr-eprivacy-coverage-checklist";
import {
  deriveGdprEprivacyReviewSummary,
} from "../../lib/scans/gdpr-eprivacy-review-summary";
import {
  getAssessmentDirection,
  getEvidenceLabel,
  type AssessmentDirection,
  type EvidenceLabel
} from "../../lib/scans/gdpr-eprivacy-assessment-direction";
import { deriveGdprEprivacyCoverageChecklistRowRationale } from "../../lib/scans/gdpr-eprivacy-checklist-rationale";
import { getReportableGdprEprivacyCoverageItems } from "../../lib/scans/gdpr-eprivacy-reportable-rows";
import { deriveRegulatoryCoverageScore } from "../../lib/scans/regulatory-coverage-score";

type GdprEprivacyCoverageChecklistCardProps = {
  defaultOpen?: boolean;
  gdprEprivacyLens?: {
    ratingLabel: string;
    score: number | null;
    summary?: string;
  } | null;
  items: GdprEprivacyCoverageChecklistItem[];
  showDebugConfidenceImprovements?: boolean;
  showSummaryStrip?: boolean;
};

type RowToolState = Partial<Record<"correction" | "evidence", boolean>>;
type CoverageIcon = "alert" | "check" | "circle-alert" | "equal" | "flag" | "info" | "slash";
type PolicyHighlightSnippet = {
  label: string;
  text: string;
  tone: "primary" | "supporting" | "fallback";
};
type PolicyHighlightRange = {
  end: number;
  label: string;
  marker: number;
  start: number;
  tone: PolicyHighlightSnippet["tone"];
};
type Article13DisclosureType =
  | "controller_contact"
  | "processing_purposes"
  | "legal_basis"
  | "recipients_or_vendor_categories"
  | "data_retention"
  | "data_subject_rights"
  | "international_transfers"
  | "dpo_contact"
  | "supervisory_authority"
  | "automated_decision_making_or_profiling";
type PolicyReviewPayload = {
  capturedText: string;
  evidenceLabel: EvidenceLabel;
  findingLabel: string;
  snippets: PolicyHighlightSnippet[];
  sourceUrl: string | null;
};

const DIRECTION_UI: Record<AssessmentDirection, {
  icon: CoverageIcon;
  label: "Positive signal" | "Neutral signal" | "Review signal" | "Potential concern" | "Coverage limited";
}> = {
  positive_signal: {
    icon: "check",
    label: "Positive signal"
  },
  neutral_signal: {
    icon: "equal",
    label: "Neutral signal"
  },
  review_signal: {
    icon: "flag",
    label: "Review signal"
  },
  potential_concern: {
    icon: "alert",
    label: "Potential concern"
  },
  technical_limitation: {
    icon: "slash",
    label: "Coverage limited"
  }
};

const REPORT_ROW_GROUPS = [
  {
    title: "Consent Surface",
    rowIds: [
      "consent_surface_observed",
      "cmp_framework_signal_observed",
      "reject_all_path_availability",
      "accept_consent_control",
      "options_settings_preferences_control",
      "consent_choice_quality",
      "cookie_notice_policy_availability"
    ]
  },
  {
    title: "Pre-Consent Runtime",
    rowIds: [
      "pre_consent_cookies_storage",
      "session_replay_fingerprinting_review",
      "device_identification_fingerprinting_signal_observed"
    ]
  },
  {
    title: "3rd Party Services",
    rowIds: [
      "pre_consent_third_party_tracking",
      "advertising_retargeting_vendor_signal_observed",
      "retargeting_behavioral_advertising_signal_observed",
      "analytics_vendor_observed",
      "third_party_service_connection_pre_consent",
      "third_party_iframe_pre_consent",
      "social_media_embed_pre_consent",
      "embedded_content_pre_consent"
    ]
  },
  {
    title: "GDPR Transparency",
    rowIds: [
      "privacy_notice_availability",
      "controller_contact_disclosure",
      "processing_purposes_disclosure",
      "legal_basis_disclosure_observed",
      "recipients_vendor_categories_disclosure",
      "retention_disclosure",
      "retention_disclosure_observed",
      "retention_disclosure_present",
      "data_subject_rights_disclosure",
      "international_transfers_disclosure",
      "dpo_contact_point_disclosure",
      "supervisory_authority_complaint_disclosure",
      "automated_decision_making_profiling_disclosure"
    ]
  },
  {
    title: "Transport Security",
    rowIds: [
      "transport_security_https_delivery",
      "transport_security_tls_certificate",
      "transport_security_http_redirect",
      "transport_security_mixed_content",
      "transport_security_form_transport"
    ]
  }
] as const;

function getEvidenceLabelBadgeClasses(label: EvidenceLabel) {
  switch (label) {
    case "Observed":
      return "border-slate-200 bg-white text-slate-700";
    case "Potential gap":
      return "border-slate-200 bg-white text-slate-700";
    case "Partial concern":
      return "border-slate-200 bg-white text-slate-700";
    case "Not confirmed":
      return "border-slate-200 bg-white text-slate-700";
    case "Not testable":
      return "border-slate-300 bg-slate-100 text-slate-700";
    case "Not observed":
    default:
      return "border-slate-200 bg-white text-slate-600";
  }
}

function retainedNumber(item: GdprEprivacyCoverageChecklistItem, keys: string[]) {
  for (const key of keys) {
    const value = item.criticalEvidence.retainedEvidence[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }
  return null;
}

function getGdprTransparencyPolicyReviewPayload(item: GdprEprivacyCoverageChecklistItem): PolicyReviewPayload | null {
  const evidence = getRetainedEvidenceRecord(item);
  const article13Signal = getRecord(evidence.article13Signal) ?? getRecord(evidence.article_13_signal);
  const rowSpecificSectionEvidence =
    getRecord(evidence.rowSpecificSectionEvidence) ??
    getRecord(evidence.row_specific_section_evidence);
  const summary = getRecord(evidence.policySurfaceSummary) ?? getRecord(evidence.policy_surface_summary);
  if (!summary) {
    return null;
  }
  const fullRetainedPolicyText =
    getString(summary.retainedPrivacyPolicyTextExcerpt) ??
    getString(summary.retained_privacy_policy_text_excerpt) ??
    "";
  const retainedPolicySurfaceSnippetText = uniqueStrings([
    fullRetainedPolicyText,
    getString(summary.selectedPolicySectionExcerpt),
    getString(summary.selected_policy_section_excerpt),
    ...getPolicySummaryArticle13Signals(summary).flatMap((signal) => [
      getString(signal.evidenceText),
      getString(signal.evidence_text),
      getString(signal.selectedPolicySectionExcerpt),
      getString(signal.selected_policy_section_excerpt),
      getString(signal.supportingContactContext),
      getString(signal.supporting_contact_context)
    ])
  ].filter((value): value is string => Boolean(value))).join("\n\n");
  const snippets = dedupePolicyHighlightSnippets([
    ...getGdprTransparencyPolicySnippets(item),
    ...getFallbackPolicyDisclosureHighlightSnippets(
      retainedPolicySurfaceSnippetText,
      item
    )
  ]);
  const retainedContextExcerpt = fullRetainedPolicyText
    ? getPolicyContextExcerptForSnippets(fullRetainedPolicyText, snippets)
    : null;
  const capturedTextCandidates = uniqueStrings([
    retainedContextExcerpt,
    getString(rowSpecificSectionEvidence?.selectedPolicySectionExcerpt),
    getString(rowSpecificSectionEvidence?.selected_policy_section_excerpt),
    getString(article13Signal?.selectedPolicySectionExcerpt),
    getString(article13Signal?.selected_policy_section_excerpt),
    getString(article13Signal?.evidenceText),
    getString(article13Signal?.evidence_text),
    ...getPolicySummaryArticle13SignalsForRow(summary, item).flatMap((signal) => [
      getString(signal.selectedPolicySectionExcerpt),
      getString(signal.selected_policy_section_excerpt),
      getString(signal.evidenceText),
      getString(signal.evidence_text)
    ]),
    getString(summary.selectedPolicySectionExcerpt),
    getString(summary.selected_policy_section_excerpt),
    ...getPolicySummaryArticle13Signals(summary).flatMap((signal) => [
      getString(signal.evidenceText),
      getString(signal.evidence_text),
      getString(signal.selectedPolicySectionExcerpt),
      getString(signal.selected_policy_section_excerpt),
      getString(signal.supportingContactContext),
      getString(signal.supporting_contact_context)
    ]),
    fullRetainedPolicyText,
    retainedPolicySurfaceSnippetText
  ].filter((value): value is string => Boolean(value)));
  const capturedText = capturedTextCandidates
    .map((candidate) => ({
      candidate,
      matchingSnippets: getMatchingPolicyHighlightSnippets(candidate, snippets)
    }))
    .sort((left, right) => right.matchingSnippets.length - left.matchingSnippets.length)[0]?.candidate;
  if (!capturedText) {
    return null;
  }
  const visibleSnippets = getDistinctMatchingPolicyHighlightSnippets(capturedText, snippets);
  if (visibleSnippets.length === 0) {
    return null;
  }
  const sourceUrl = [
    ...getStringArray(summary.privacyPolicyUrls),
    ...getStringArray(summary.privacy_policy_urls),
    getString(summary.selectedPolicySectionUrl),
    getString(summary.selected_policy_section_url)
  ].find(Boolean) ?? null;
  return {
    capturedText,
    evidenceLabel: getEvidenceLabel(item),
    findingLabel: item.label,
    snippets: visibleSnippets,
    sourceUrl
  };
}

function getPolicyContextExcerptForSnippets(source: string, snippets: PolicyHighlightSnippet[]) {
  const ranges = getPolicyHighlightRanges(source, snippets).sort((left, right) => left.start - right.start);
  if (ranges.length === 0) {
    return null;
  }
  const contextCharacters = 900;
  const windows: Array<{ end: number; start: number }> = [];
  for (const range of ranges) {
    const start = Math.max(0, range.start - contextCharacters);
    const end = Math.min(source.length, range.end + contextCharacters);
    const previous = windows.at(-1);
    if (previous && start <= previous.end) {
      previous.end = Math.max(previous.end, end);
      continue;
    }
    windows.push({ end, start });
  }
  return windows
    .map((window) => {
      const prefix = window.start > 0 ? "... " : "";
      const suffix = window.end < source.length ? " ..." : "";
      return `${prefix}${source.slice(window.start, window.end).trim()}${suffix}`;
    })
    .join("\n\n...\n\n");
}

function getGdprTransparencyPolicySnippets(item: GdprEprivacyCoverageChecklistItem) {
  const evidence = getRetainedEvidenceRecord(item);
  const article13Signal = getRecord(evidence.article13Signal) ?? getRecord(evidence.article_13_signal);
  const rowSpecificSectionEvidence =
    getRecord(evidence.rowSpecificSectionEvidence) ??
    getRecord(evidence.row_specific_section_evidence);
  const summary = getRecord(evidence.policySurfaceSummary) ?? getRecord(evidence.policy_surface_summary);
  const primarySnippets = dedupePolicyHighlightSnippets([
    ...[
      getString(article13Signal?.evidenceText),
      getString(article13Signal?.evidence_text)
    ].filter((value): value is string => Boolean(value))
      .map((value) => makePolicyHighlightSnippet(
        alignPolicyEvidenceSnippetToCompleteSentence(cleanEvidenceText(value)),
        "Primary confirming text",
        "primary"
      )),
    ...[
      getString(article13Signal?.supportingContactContext),
      getString(article13Signal?.supporting_contact_context)
    ].filter((value): value is string => Boolean(value))
      .map((value) => makePolicyHighlightSnippet(
        cleanEvidenceText(value),
        "Supporting contact context",
        "supporting"
      )),
    ...item.evidenceRefs.flatMap((ref) => {
      const match = ref.match(/^(Excerpt|Supporting contact context):\s*(.+)$/i);
      if (!match?.[2]) {
        return [];
      }
      const isSupporting = /^Supporting contact context$/i.test(match[1] ?? "");
      return [makePolicyHighlightSnippet(
        isSupporting
          ? cleanEvidenceText(match[2])
          : alignPolicyEvidenceSnippetToCompleteSentence(cleanEvidenceText(match[2])),
        isSupporting ? "Supporting contact context" : "Primary confirming text",
        isSupporting ? "supporting" : "primary"
      )];
    })
  ].filter((snippet) => snippet.text.length >= (snippet.tone === "supporting" ? 6 : 24)));
  if (primarySnippets.length > 0) {
    return primarySnippets;
  }

  return dedupePolicyHighlightSnippets([
    getString(article13Signal?.selectedPolicySectionExcerpt),
    getString(article13Signal?.selected_policy_section_excerpt),
    getString(rowSpecificSectionEvidence?.selectedPolicySectionExcerpt),
    getString(rowSpecificSectionEvidence?.selected_policy_section_excerpt),
    ...getPolicySummaryArticle13SignalsForRow(summary, item).flatMap((signal) => [
      getString(signal.evidenceText),
      getString(signal.evidence_text),
      getString(signal.selectedPolicySectionExcerpt),
      getString(signal.selected_policy_section_excerpt)
    ]),
    getString(summary?.selectedPolicySectionExcerpt),
    getString(summary?.selected_policy_section_excerpt)
  ].filter((value): value is string => Boolean(value))
    .map((value) => makePolicyHighlightSnippet(cleanEvidenceText(value), "Matched policy text", "fallback"))
    .filter((snippet) => snippet.text.length >= 24));
}

function getPolicySummaryArticle13SignalsForRow(
  summary: Record<string, unknown> | null,
  item: GdprEprivacyCoverageChecklistItem
) {
  const disclosureType = getArticle13DisclosureTypeForChecklistRow(item);
  if (!summary || !disclosureType) {
    return [];
  }
  return [
    ...getRecordArray(summary.article13DisclosureSignals),
    ...getRecordArray(summary.article_13_disclosure_signals)
  ].filter((signal) =>
    getString(signal.disclosureType) === disclosureType ||
    getString(signal.disclosure_type) === disclosureType
  );
}

function getPolicySummaryArticle13Signals(summary: Record<string, unknown> | null) {
  if (!summary) {
    return [];
  }
  return [
    ...getRecordArray(summary.article13DisclosureSignals),
    ...getRecordArray(summary.article_13_disclosure_signals)
  ];
}

function getArticle13DisclosureTypeForChecklistRow(itemOrRowId: GdprEprivacyCoverageChecklistItem | string): Article13DisclosureType | null {
  const rowId = typeof itemOrRowId === "string" ? itemOrRowId : itemOrRowId.id;
  switch (rowId) {
    case "controller_contact_disclosure":
      return "controller_contact";
    case "processing_purposes_disclosure":
      return "processing_purposes";
    case "legal_basis_disclosure_observed":
      return "legal_basis";
    case "recipients_vendor_categories_disclosure":
      return "recipients_or_vendor_categories";
    case "retention_disclosure":
    case "retention_disclosure_observed":
    case "retention_disclosure_present":
      return "data_retention";
    case "data_subject_rights_disclosure":
      return "data_subject_rights";
    case "international_transfers_disclosure":
      return "international_transfers";
    case "dpo_contact_point_disclosure":
      return "dpo_contact";
    case "supervisory_authority_complaint_disclosure":
      return "supervisory_authority";
    default:
      break;
  }
  if (typeof itemOrRowId !== "string") {
    return getArticle13DisclosureTypeForChecklistLabel(itemOrRowId.label);
  }
  return null;
}

function makePolicyHighlightSnippet(text: string, label: string, tone: PolicyHighlightSnippet["tone"]): PolicyHighlightSnippet {
  return { label, text, tone };
}

function dedupePolicyHighlightSnippets(snippets: PolicyHighlightSnippet[]) {
  const retained: PolicyHighlightSnippet[] = [];
  for (const snippet of snippets) {
    const cleanedText = cleanEvidenceText(snippet.text);
    if (!cleanedText) {
      continue;
    }
    const normalized = normalizePolicyHighlightText(cleanedText).normalized;
    if (!normalized) {
      continue;
    }
    const duplicate = retained.some((candidate) => {
      const candidateNormalized = normalizePolicyHighlightText(candidate.text).normalized;
      return candidateNormalized === normalized ||
        (normalized.length > 80 && candidateNormalized.includes(normalized)) ||
        (candidateNormalized.length > 80 && normalized.includes(candidateNormalized));
    });
    if (!duplicate) {
      retained.push({ ...snippet, text: cleanedText });
    }
  }
  return retained.slice(0, 6);
}

function alignPolicyEvidenceSnippetToCompleteSentence(value: string) {
  const normalized = cleanEvidenceText(value);
  const sentenceStart = normalized.search(/[.!?]\s+(?=[A-Z0-9"“])/);
  if (
    sentenceStart >= 0 &&
    sentenceStart < 120 &&
    /^[a-z][a-z\s-]{0,80}$/i.test(normalized.slice(0, sentenceStart).replace(/[^a-z\s-]/gi, "")) &&
    normalized.slice(sentenceStart + 2).trim().length >= 48
  ) {
    return normalized.slice(sentenceStart + 2).trim();
  }
  return normalized;
}

const DATA_SUBJECT_RIGHTS_HIGHLIGHT_PATTERN =
  /your rights|data subject rights|right to (?:access|delete|erase|erasure|rectif|object|restrict|port)|rights? to (?:access|delete|erase|erasure|rectif|object|restrict|port)|access.{0,80}(?:your )?(?:personal )?(?:data|information)|delete your information|delete.{0,80}(?:your )?(?:personal )?(?:data|information)|erase your information|erase.{0,80}(?:your )?(?:personal )?(?:data|information)|erasure|correct (?:your )?(?:personal )?(?:data|information)|rectif|portability|object to|restrict (?:the )?processing|export.{0,80}(?:your )?(?:data|information)|review and update|my activity|google takeout|request to remove content|privacy controls|download a copy|stop collecting your information/i;

function getArticle13DisclosureTypeForChecklistLabel(label: string): Article13DisclosureType | null {
  switch (label.trim().toLocaleLowerCase()) {
    case "controller/contact disclosure":
      return "controller_contact";
    case "processing purposes disclosure":
      return "processing_purposes";
    case "legal basis disclosure":
      return "legal_basis";
    case "recipients/vendor categories disclosed":
      return "recipients_or_vendor_categories";
    case "retention disclosure":
      return "data_retention";
    case "data subject rights disclosure":
      return "data_subject_rights";
    case "international transfer disclosure":
      return "international_transfers";
    case "dpo / privacy contact point":
      return "dpo_contact";
    case "supervisory authority complaint":
      return "supervisory_authority";
    default:
      return null;
  }
}

function getPolicyDisclosureHighlightPattern(item: GdprEprivacyCoverageChecklistItem) {
  switch (getArticle13DisclosureTypeForChecklistRow(item)) {
    case "controller_contact":
      return /controller|contact (?:us|our privacy team)|privacy@|privacy office|data protection office|questions about (?:this )?(?:policy|privacy)/i;
    case "processing_purposes":
      return /purpose|why we (?:process|collect|use)|we (?:use|process|collect) (?:your )?(?:personal )?(?:data|information) (?:to|for)|provide (?:our )?services|personalize|improve (?:our )?(?:services|products)|protect (?:our )?(?:users|services)/i;
    case "legal_basis":
      return /legal basis|lawful basis|lawful bases|legitimate interests?|performance of (?:a )?contract|contractual necessity|legal obligation|public task|public interest|vital interests?|consent/i;
    case "recipients_or_vendor_categories":
      return /recipients|service providers|processors|vendors?|partners|affiliates|third parties|third-party|advertising partners?|analytics providers?|share (?:your )?(?:personal )?(?:data|information)|disclose (?:your )?(?:personal )?(?:data|information)|process (?:information|personal information) on (?:our|the company's) behalf/i;
    case "data_retention":
      return /retention period|retention criteria|storage period|retain|retained|retaining|keep (?:your )?(?:personal )?(?:data|information)|kept for|stored for|as long as necessary|deleted? or anonymi[sz]ed?|delete (?:it|them|the data|personal data|personal information|your information) after|expires?|no longer needed|required by law|legal purposes|fraud|abuse/i;
    case "data_subject_rights":
      return DATA_SUBJECT_RIGHTS_HIGHLIGHT_PATTERN;
    case "international_transfers":
      return /international transfer|cross-border transfer|standard contractual clauses|adequacy decision|servers around the world|processed? (?:on servers )?outside (?:your )?country|outside (?:of )?the country where you live|outside (?:the )?(?:eea|european economic area|uk|united kingdom|eu|european union)|third countr(?:y|ies)|data privacy framework|\bdpf\b|EU-U\.S\.|UK Extension|Swiss-U\.S\.|privacy shield|transfer (?:your )?(?:personal )?(?:data|information)/i;
    case "dpo_contact":
      return /data protection officer|\bdpo\b|data protection contact|data protection office|privacy office|privacy contact|privacy team/i;
    case "supervisory_authority":
      return /supervisory authority|data protection authority|local data protection authorit(?:y|ies)|lodge a complaint|complain to (?:a )?(?:regulator|authority)|formal written complaints?|regulatory authorities|unresolved complaints?|regulators?.{0,120}(?:complaints?|authorities|resolve)|\bico\b|\bcnil\b|\bdpc\b/i;
    default:
      return null;
  }
}

function getFallbackPolicyDisclosureHighlightSnippets(
  source: string,
  item: GdprEprivacyCoverageChecklistItem
): PolicyHighlightSnippet[] {
  const pattern = getPolicyDisclosureHighlightPattern(item);
  if (!pattern) {
    return [];
  }
  return uniqueStrings(splitPolicyExcerptIntoHighlightCandidates(source)
    .filter((candidate) => pattern.test(candidate))
    .slice(0, 3))
    .map((snippet) => makePolicyHighlightSnippet(snippet, "Matched policy text", "fallback"));
}

function splitPolicyExcerptIntoHighlightCandidates(source: string) {
  const normalized = cleanEvidenceText(source);
  const sentenceCandidates = normalized
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"“])/)
    .map((candidate) => candidate.trim())
    .filter((candidate) => candidate.length >= 24 && candidate.length <= 900);
  const clauseCandidates = normalized
    .split(/(?<=[.;])\s+|,\s+(?=(?:to|or|and|you|we|also|however|including|such as)\b)/i)
    .map((candidate) => candidate.trim())
    .filter((candidate) => candidate.length >= 24 && candidate.length <= 420);
  return [...sentenceCandidates, ...clauseCandidates];
}

function findCaseInsensitiveIndex(source: string, needle: string, fromIndex: number) {
  return source.toLocaleLowerCase().indexOf(needle.toLocaleLowerCase(), fromIndex);
}

function normalizePolicyHighlightText(value: string) {
  let normalized = "";
  const indexMap: number[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index] ?? "";
    const folded = character.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase();
    if (/[\p{L}\p{N}]/u.test(folded)) {
      normalized += folded;
      indexMap.push(index);
    }
  }
  return { indexMap, normalized };
}

function getHighlightNeedles(snippet: string) {
  const cleaned = cleanEvidenceText(snippet);
  const pieces = cleaned
    .split(/(?<=[.!?;:])\s+|,\s+(?=(?:to|or|and|you|we|including|such as)\b)/i)
    .map((piece) => cleanEvidenceText(piece).replace(/^[.;:,]+|[.;:,]+$/g, "").trim())
    .filter((piece) => piece.length >= 32);
  return uniqueStrings([cleaned, ...pieces]);
}

function getPolicyHighlightRanges(source: string, snippets: PolicyHighlightSnippet[]) {
  const normalizedSource = normalizePolicyHighlightText(source);
  return snippets.flatMap((snippet, snippetIndex) =>
    getNormalizedPolicyHighlightRangesForSnippet(snippet, snippetIndex, normalizedSource)
  );
}

function getMatchingPolicyHighlightSnippets(source: string, snippets: PolicyHighlightSnippet[]) {
  const normalizedSource = normalizePolicyHighlightText(source);
  return snippets.filter((snippet, snippetIndex) =>
    getExactPolicyHighlightRangesForSnippet(source, snippet, snippetIndex).length > 0 ||
    getNormalizedPolicyHighlightRangesForSnippet(snippet, snippetIndex, normalizedSource).length > 0
  );
}

function getDistinctMatchingPolicyHighlightSnippets(source: string, snippets: PolicyHighlightSnippet[]) {
  const normalizedSource = normalizePolicyHighlightText(source);
  const retained: Array<{ range: PolicyHighlightRange; snippet: PolicyHighlightSnippet }> = [];
  snippets.forEach((snippet, snippetIndex) => {
    const range = getFirstPolicyHighlightRangeForSnippet(source, snippet, snippetIndex, normalizedSource);
    if (!range) {
      return;
    }
    const overlapsRetainedRange = retained.some((candidate) => rangesOverlap(candidate.range, range));
    if (!overlapsRetainedRange) {
      retained.push({ range, snippet });
    }
  });
  return retained.map((entry) => entry.snippet);
}

function rangesOverlap(left: PolicyHighlightRange, right: PolicyHighlightRange) {
  return Math.min(left.end, right.end) > Math.max(left.start, right.start);
}

function getFirstPolicyHighlightRangeForSnippet(
  source: string,
  snippet: PolicyHighlightSnippet,
  snippetIndex: number,
  normalizedSource: ReturnType<typeof normalizePolicyHighlightText>
) {
  return [
    ...getExactPolicyHighlightRangesForSnippet(source, snippet, snippetIndex),
    ...getNormalizedPolicyHighlightRangesForSnippet(snippet, snippetIndex, normalizedSource)
  ].sort((left, right) => left.start - right.start || right.end - left.end)[0] ?? null;
}

function getNormalizedPolicyHighlightRangesForSnippet(
  snippet: PolicyHighlightSnippet,
  snippetIndex: number,
  normalizedSource: ReturnType<typeof normalizePolicyHighlightText>
) {
  const rangesForSnippet: PolicyHighlightRange[] = [];
  for (const needle of getHighlightNeedles(snippet.text)) {
    const normalizedNeedle = normalizePolicyHighlightText(needle).normalized;
    if (normalizedNeedle.length < 20) {
      continue;
    }
    let cursor = 0;
    while (cursor < normalizedSource.normalized.length) {
      const normalizedIndex = normalizedSource.normalized.indexOf(normalizedNeedle, cursor);
      if (normalizedIndex < 0) {
        break;
      }
      const sourceStart = normalizedSource.indexMap[normalizedIndex];
      const sourceEndIndex = normalizedSource.indexMap[normalizedIndex + normalizedNeedle.length - 1];
      if (sourceStart !== undefined && sourceEndIndex !== undefined) {
        rangesForSnippet.push({
          end: sourceEndIndex + 1,
          label: snippet.label,
          marker: snippetIndex + 1,
          start: sourceStart,
          tone: snippet.tone
        });
      }
      cursor = normalizedIndex + Math.max(1, normalizedNeedle.length);
    }
    if (rangesForSnippet.length > 0) {
      break;
    }
  }
  return rangesForSnippet;
}

function getExactPolicyHighlightRangesForSnippet(source: string, snippet: PolicyHighlightSnippet, snippetIndex: number) {
  const rangesForSnippet: PolicyHighlightRange[] = [];
  let cursor = 0;
  while (cursor < source.length) {
    const index = findCaseInsensitiveIndex(source, snippet.text, cursor);
    if (index < 0) {
      break;
    }
    rangesForSnippet.push({
      end: index + snippet.text.length,
      label: snippet.label,
      marker: snippetIndex + 1,
      start: index,
      tone: snippet.tone
    });
    cursor = index + Math.max(1, snippet.text.length);
  }
  return rangesForSnippet;
}

function renderHighlightedPolicyHtml(source: string, snippets: PolicyHighlightSnippet[]) {
  const normalizedSource = normalizePolicyHighlightText(source);
  const ranges = snippets.flatMap((snippet, snippetIndex) => {
    const exactRanges = getExactPolicyHighlightRangesForSnippet(source, snippet, snippetIndex);
    if (exactRanges.length > 0) {
      return exactRanges;
    }
    return getNormalizedPolicyHighlightRangesForSnippet(snippet, snippetIndex, normalizedSource);
  }).sort((left, right) => left.start - right.start || right.end - left.end);

  const mergedRanges = mergePolicyHighlightRanges(ranges);

  if (mergedRanges.length === 0) {
    return escapeHtml(source);
  }

  let html = "";
  let cursor = 0;
  for (const range of mergedRanges) {
    const colorClass = `policy-highlight-color-${((range.marker - 1) % 6) + 1}`;
    html += escapeHtml(source.slice(cursor, range.start));
    html += `<mark class="policy-highlight ${colorClass}" title="${escapeHtml(range.label)}"><span class="policy-highlight-marker ${colorClass}">${range.marker}</span>${escapeHtml(source.slice(range.start, range.end))}</mark>`;
    cursor = range.end;
  }
  html += escapeHtml(source.slice(cursor));
  return html;
}

function renderSinglePolicySnippetHighlightHtml(
  source: string,
  snippet: PolicyHighlightSnippet,
  snippetIndex: number,
  options?: { includeMarker?: boolean }
) {
  const normalizedSource = normalizePolicyHighlightText(source);
  const ranges = mergePolicyHighlightRanges([
    ...getExactPolicyHighlightRangesForSnippet(source, snippet, snippetIndex),
    ...getNormalizedPolicyHighlightRangesForSnippet(snippet, snippetIndex, normalizedSource)
  ].sort((left, right) => left.start - right.start || right.end - left.end));
  if (ranges.length === 0) {
    return escapeHtml(source);
  }

  let html = "";
  let cursor = 0;
  for (const range of ranges) {
    const colorClass = `policy-highlight-color-${((range.marker - 1) % 6) + 1}`;
    html += escapeHtml(source.slice(cursor, range.start));
    const marker = options?.includeMarker === false
      ? ""
      : `<span class="policy-highlight-marker ${colorClass}">${range.marker}</span>`;
    html += `<mark class="policy-highlight ${colorClass}" title="${escapeHtml(range.label)}">${marker}${escapeHtml(source.slice(range.start, range.end))}</mark>`;
    cursor = range.end;
  }
  html += escapeHtml(source.slice(cursor));
  return html;
}

function mergePolicyHighlightRanges(ranges: PolicyHighlightRange[]) {
  const mergedRanges: PolicyHighlightRange[] = [];
  for (const range of ranges) {
    const previous = mergedRanges.at(-1);
    if (!previous || range.start > previous.end) {
      mergedRanges.push({ ...range });
      continue;
    }
    previous.end = Math.max(previous.end, range.end);
  }
  return mergedRanges;
}

export const gdprPolicyExcerptPageTestHelpers = {
  getDistinctMatchingPolicyHighlightSnippets,
  getPolicyContextExcerptForSnippets,
  getMatchingPolicyHighlightSnippets,
  renderSinglePolicySnippetHighlightHtml,
  renderHighlightedPolicyHtml
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function retainedText(item: GdprEprivacyCoverageChecklistItem) {
  return JSON.stringify(
    item.criticalEvidence.retainedEvidence,
    (_key, value) => typeof value === "bigint" ? value.toString() : value
  ).toLowerCase();
}

function DebugConfidenceSummary({
  item,
  showImprovements,
}: {
  item: GdprEprivacyCoverageChecklistItem;
  showImprovements: boolean;
}) {
  if (!item.debugConfidence) {
    return null;
  }
  const improvements = item.debugConfidence.improveConfidence.slice(0, 3);
  const coverageMissing = hasScannerCoverageGap(item);
  const pillLabel = coverageMissing ? "Coverage missing" : `Confidence: ${item.debugConfidence.score}`;
  const actionLabel = coverageMissing ? "Next coverage step" : "Improve confidence";
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs leading-5 text-slate-500">
      <span
        className={cn(
          "inline-flex shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em]",
          coverageMissing
            ? "border-violet-200 bg-violet-50 text-violet-700"
            : "border-slate-300 bg-white text-slate-700"
        )}
      >
        {pillLabel}
      </span>
      {showImprovements && improvements.length > 0 ? (
        <span className="min-w-0">
          {actionLabel}: {improvements.join(" · ")}
        </span>
      ) : null}
    </div>
  );
}

function hasScannerCoverageGap(item: GdprEprivacyCoverageChecklistItem) {
  if (item.evidenceState !== "not_testable" && item.assessmentStatus !== "coverage_limitation") {
    return false;
  }
  return item.criticalEvidence.missingOrIncompleteSourceSignals.some((gap) =>
    /policysurfacescanner|consentflowruntimescanner|preconsentruntimescanner|scanner did not run|required_source_module_not_run/i.test(String(gap.whyNeeded))
  );
}

function getChecklistRowSummary(items: GdprEprivacyCoverageChecklistItem[]) {
  const coverageMissing = items.filter(hasScannerCoverageGap).length;
  return {
    coverageMissing,
    evaluated: items.filter((item) =>
      item.evidenceState !== "not_testable" &&
      item.evidenceState !== "not_applicable" &&
      !hasScannerCoverageGap(item)
    ).length,
    gaps: items.filter((item) => item.assessmentStatus === "gap_observed").length,
    reviewSignals: items.filter((item) => item.assessmentStatus === "review_signal").length,
  };
}

function ChecklistRowSummaryStrip({ items }: { items: GdprEprivacyCoverageChecklistItem[] }) {
  const summary = getChecklistRowSummary(items);
  const entries = [
    {
      className: "border-slate-200 bg-white text-slate-700",
      count: items.filter((item) => getEvidenceLabel(item) === "Observed").length,
      label: "Observed",
    },
    {
      className: "border-slate-200 bg-white text-slate-700",
      count: items.filter((item) => getEvidenceLabel(item) === "Not observed").length,
      label: "Not observed",
    },
    {
      className: "border-slate-200 bg-white text-slate-700",
      count: items.filter((item) => getEvidenceLabel(item) === "Partial concern").length,
      label: "Partial concern",
    },
    {
      className: "border-slate-200 bg-white text-slate-700",
      count: items.filter((item) => getEvidenceLabel(item) === "Not confirmed").length,
      label: "Not confirmed",
    },
    {
      className: "border-slate-200 bg-white text-slate-700",
      count: items.filter((item) => getEvidenceLabel(item) === "Potential gap").length + summary.coverageMissing,
      label: "Gaps / limits",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 md:grid-cols-5">
      {entries.map((entry) => (
        <div key={entry.label} className={cn("rounded-md border px-3 py-2", entry.className)}>
          <div className="text-lg font-semibold leading-none text-slate-950">{entry.count}</div>
          <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.12em]">{entry.label}</div>
        </div>
      ))}
    </div>
  );
}

function getCoverageIconMeta(direction: AssessmentDirection, evidenceLabel?: EvidenceLabel) {
  switch (direction) {
    case "positive_signal":
      return {
        className: "border-emerald-200 bg-emerald-50 text-emerald-700",
        icon: "check" as const,
        label: "Positive signal",
        tooltip: "Retained evidence is a positive signal for this row. This is not a compliance determination."
      };
    case "neutral_signal":
      return {
        className: "border-sky-200 bg-sky-50/70 text-sky-600",
        icon: "equal" as const,
        label: "Neutral signal",
        tooltip: "Retained evidence is useful context for this row, but is not inherently positive or concerning."
      };
    case "potential_concern":
      if (evidenceLabel !== "Potential gap") {
        return {
          className: "border-amber-200 bg-amber-50 text-amber-700",
          icon: "circle-alert" as const,
          label: "Potential concern",
          tooltip: "Retained evidence increases review priority for this row. Review the evidence before drawing conclusions."
        };
      }
      return {
        className: "border-rose-200 bg-rose-50 text-rose-700",
        icon: "alert" as const,
        label: "Potential gap",
        tooltip: "Retained evidence suggests an expected control, disclosure, or runtime behavior may be missing. Review the evidence before drawing conclusions."
      };
    case "review_signal":
      return {
        className: "border-amber-200 bg-amber-50 text-amber-700",
        icon: "flag" as const,
        label: "Review signal",
        tooltip: "Retained evidence is context-dependent and needs human review, not automatic pass/fail treatment."
      };
    case "technical_limitation":
      return {
        className: "border-slate-300 bg-slate-100 text-slate-600",
        icon: "slash" as const,
        label: "Coverage limited",
        tooltip: "The retained public-web scan context did not support testing this coverage area."
      };
    default:
      return {
        className: "border-slate-200 bg-white text-slate-600",
        icon: "info" as const,
        label: "Review",
        tooltip: "Review the retained evidence for this coverage area."
      };
  }
}

function CoverageStatusGlyph({
  direction,
  evidenceLabel
}: {
  direction: AssessmentDirection;
  evidenceLabel: EvidenceLabel;
}) {
  const meta = getCoverageIconMeta(direction, evidenceLabel);
  return (
    <span className="group/coverage-icon relative inline-flex">
      <span
        aria-label={meta.label}
        title={meta.tooltip}
        className={cn(
          "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border",
          meta.className
        )}
      >
        <CoverageStatusIcon icon={meta.icon} />
      </span>
      <span className="pointer-events-none absolute left-0 top-full z-20 mt-2 hidden w-56 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] font-normal leading-4 text-slate-600 shadow-lg group-hover/coverage-icon:block">
        {meta.tooltip}
      </span>
    </span>
  );
}

function CoverageStatusIcon({ icon }: { icon: CoverageIcon }) {
  if (icon === "check") {
    return (
      <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 20 20">
        <path d="M5 10.4 8.3 13.7 15 6.8" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" />
      </svg>
    );
  }

  if (icon === "alert") {
    return (
      <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 20 20">
        <path d="M10 4.2 17 16H3L10 4.2Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.8" />
        <path d="M10 8.2v3.8M10 14.8h.01" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
      </svg>
    );
  }

  if (icon === "circle-alert") {
    return (
      <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 20 20">
        <circle cx="10" cy="10" r="6.8" stroke="currentColor" strokeWidth="1.8" />
        <path d="M10 6.8v4.4" stroke="currentColor" strokeLinecap="round" strokeWidth="1.9" />
        <path d="M10 14.2h.01" stroke="currentColor" strokeLinecap="round" strokeWidth="2.2" />
      </svg>
    );
  }

  if (icon === "flag") {
    return (
      <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 20 20">
        <path d="M6 16V4.8M6 5.2h8.5l-1.4 3 1.4 3H6" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
      </svg>
    );
  }

  if (icon === "slash") {
    return (
      <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 20 20">
        <circle cx="10" cy="10" r="6.8" stroke="currentColor" strokeWidth="1.8" />
        <path d="m5.2 14.8 9.6-9.6" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
      </svg>
    );
  }

  if (icon === "equal") {
    return (
      <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 20 20">
        <path d="M6.4 8.2h7.2M6.4 11.8h7.2" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
      </svg>
    );
  }

  if (icon === "info") {
    return (
      <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 20 20">
        <circle cx="10" cy="10" r="6.8" stroke="currentColor" strokeWidth="1.8" />
        <path d="M10 9.2v4.2" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
        <path d="M10 6.5h.01" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 20 20">
      <path d="M7.7 7.4a2.5 2.5 0 1 1 3.8 2.2c-.9.5-1.5 1.1-1.5 2.1v.3" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
      <path d="M10 15h.01" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
    </svg>
  );
}

function getEvidenceJson(item: GdprEprivacyCoverageChecklistItem) {
  return {
    assessmentStatus: item.assessmentStatus,
    coverageArea: item.label,
    evidenceState: item.evidenceState,
    status: item.status,
    subchecks: item.subchecks,
    ...item.criticalEvidence
  };
}

function stringifyEvidenceJson(item: GdprEprivacyCoverageChecklistItem) {
  return JSON.stringify(
    getEvidenceJson(item),
    (_key, value) => typeof value === "bigint" ? value.toString() : value,
    2
  );
}

function humanizeEvidenceToken(value: string) {
  return value
    .replace(/^Evidence flag:\s*/i, "Evidence: ")
    .replace(/^Evidence strength:\s*/i, "Confidence: ")
    .replace(/[_:]+/g, " ")
    .replace(/\bprivacy\b/gi, "privacy")
    .replace(/\s+/g, " ")
    .trim();
}

function getDisplayEvidenceRefs(item: GdprEprivacyCoverageChecklistItem) {
  return item.evidenceRefs.map(humanizeEvidenceToken).slice(0, 6);
}

export function GdprEprivacyCoverageSummaryPills({ items }: { items: GdprEprivacyCoverageChecklistItem[] }) {
  const summaryCounts = items.reduce<Record<AssessmentDirection | "gap_observed", number>>((counts, item) => {
    const direction = getAssessmentDirection(item);
    if (direction === "technical_limitation") {
      counts.technical_limitation += 1;
      return counts;
    }
    if (direction === "positive_signal") {
      counts.positive_signal += 1;
      return counts;
    }
    if (direction === "neutral_signal") {
      counts.neutral_signal += 1;
      return counts;
    }
    if (item.assessmentStatus === "gap_observed" || item.status === "Gap observed") {
      counts.gap_observed += 1;
      return counts;
    }
    if (direction === "potential_concern") {
      counts.potential_concern += 1;
      return counts;
    }
    counts.review_signal += 1;
    return counts;
  }, {
    gap_observed: 0,
    neutral_signal: 0,
    positive_signal: 0,
    potential_concern: 0,
    review_signal: 0,
    technical_limitation: 0
  });
  type DecisionMixSegment = {
    color: string;
    count: number;
    direction: AssessmentDirection | "gap_observed";
    label: string;
    tooltip: string;
  };
  const statusSummary = ([
    {
      color: "#e11d48",
      count: summaryCounts.gap_observed,
      direction: "gap_observed",
      label: "concern",
      tooltip: "Rows where retained evidence indicates a material GDPR/ePrivacy review concern, such as consent timing, tracking, storage, disclosure, or choice issues."
    },
    {
      color: "#d97706",
      count: summaryCounts.potential_concern,
      direction: "potential_concern",
      label: "partial",
      tooltip: "Rows with review-relevant evidence that may indicate a concern, but where context, scope, or evidence strength makes the signal less direct."
    },
    {
      color: "#f59e0b",
      count: summaryCounts.review_signal,
      direction: "review_signal",
      label: "review",
      tooltip: "Rows with unknown, ambiguous, limited, or insufficiently classified evidence that should be manually reviewed."
    },
    {
      color: "#10b981",
      count: summaryCounts.positive_signal,
      direction: "positive_signal",
      label: "positive",
      tooltip: "Rows where retained evidence is favorable for this review area. This is a positive signal, not a legal compliance determination."
    },
    {
      color: "#0ea5e9",
      count: summaryCounts.neutral_signal,
      direction: "neutral_signal",
      label: "contextual",
      tooltip: "Rows with useful context or operational evidence that is not inherently positive or concerning on its own."
    },
    {
      color: "#94a3b8",
      count: summaryCounts.technical_limitation,
      direction: "technical_limitation",
      label: "limited",
      tooltip: "Rows where retained coverage did not support testing this area."
    }
  ] satisfies DecisionMixSegment[]).filter((item) => item.count > 0);
  const total = statusSummary.reduce((sum, item) => sum + item.count, 0);
  const summaryLabel = statusSummary.map((item) => `${item.count} ${item.label}`).join(", ") || "No reportable checklist ratings";

  return (
    <div
      aria-label={`GDPR/ePrivacy checklist rating mix: ${summaryLabel}`}
      className="ml-auto flex min-w-[18rem] max-w-3xl shrink-0 flex-col items-stretch justify-start rounded-2xl border border-slate-200 bg-white/85 px-3 py-2 shadow-sm"
    >
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">Rating mix</span>
        <span className="text-xs font-semibold tabular-nums text-slate-800">{total} rows</span>
      </div>
      <div className="flex h-2 overflow-hidden rounded-full bg-slate-100" role="img">
        {statusSummary.map((item) => (
          <span
            key={item.direction}
            aria-label={`${item.count} ${item.label}`}
            className="min-w-1"
            style={{
              backgroundColor: item.color,
              width: `${(item.count / Math.max(total, 1)) * 100}%`
            }}
          />
        ))}
      </div>
      <div className="mt-2 flex flex-nowrap items-center justify-end gap-x-4 overflow-x-auto">
        {statusSummary.map((item) => (
          <span key={item.direction} className="inline-flex items-center gap-1.5 whitespace-nowrap text-[11px] text-slate-600">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
            <span className="font-semibold tabular-nums text-slate-950">{item.count}</span>
            <span>{item.label}</span>
            <InfoTip align="end" placement="bottom" text={item.tooltip} />
          </span>
        ))}
      </div>
    </div>
  );
}

function getGdprSummaryTitle(input: {
  items: GdprEprivacyCoverageChecklistItem[];
  summary: string;
}) {
  return (
    <div className="w-full space-y-2">
      <details className="group rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2">
        <summary className="flex cursor-pointer list-none items-center gap-2 marker:hidden [&::-webkit-details-marker]:hidden">
          <ScanReportDisclosureIcon className="h-4 w-4 rounded-[0.375rem] [&_svg]:h-2.5 [&_svg]:w-2.5" />
          <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
            Review summary
          </span>
          <span className="min-w-0 flex-1 truncate text-xs font-normal leading-5 text-slate-600 group-open:hidden">
            {input.summary}
          </span>
        </summary>
        <p className="mt-2 pl-6 text-xs font-normal leading-5 text-slate-600">{input.summary}</p>
      </details>
    </div>
  );
}

function getScanContextNote(item: GdprEprivacyCoverageChecklistItem) {
    if (item.id === "consent_surface_observed") {
      return item.status === "Observed"
        ? "An actionable cookie/consent banner or preference surface was observed in the tested context."
        : item.status === "Not confirmed"
          ? "Privacy/ad-choice controls were observed, but a first-layer GDPR/ePrivacy cookie consent banner was not confirmed."
        : "No actionable cookie/consent banner or preference surface was observed in the tested context.";
    }

  if (item.id === "pre_consent_cookies_storage") {
    return item.status === "Observed" || item.status === "Gap observed"
      ? "Cookies or browser storage were observed before a recorded consent action. Purpose and essentiality remain review context unless high-confidence non-essential evidence is retained."
      : "No eligible pre-consent cookies or browser storage were observed before a recorded consent action.";
  }

  if (item.id === "pre_consent_third_party_tracking") {
    return item.status === "Observed" || item.status === "Review signal" || item.status === "Gap observed"
      ? "3rd party runtime activity was retained before recorded consent; purpose classification determines whether it is a review signal or a stronger concern."
      : "No eligible 3rd party tracking requests were observed before recorded consent.";
  }

  if (item.id === "advertising_retargeting_vendor_signal_observed") {
    return item.status === "Observed"
      ? "Advertising infrastructure vendor evidence was observed in the retained pre-consent runtime context."
      : item.status === "Review signal"
        ? "Advertising-infrastructure evidence was partially retained before a recorded consent choice. Review retained vendors/domains before treating this as confirmed advertising activity."
      : "No advertising infrastructure vendor signal was observed in the retained runtime context.";
  }

  if (item.id === "retargeting_behavioral_advertising_signal_observed") {
    return item.status === "Observed" || item.status === "Review signal"
      ? "Retargeting or behavioral-advertising evidence was partially retained before a recorded consent choice. Review retained vendors/domains before treating this as confirmed behavioral advertising or audience activation."
      : "No retargeting or behavioral advertising vendor signal was observed in the retained runtime context.";
  }

  if (item.id === "analytics_vendor_observed") {
    return item.status === "Observed" || item.status === "Review signal"
      ? "Analytics or measurement vendor evidence was observed in the retained runtime context."
      : "No analytics or measurement vendor signal was observed in the retained runtime context.";
  }

  if (item.id === "third_party_service_connection_pre_consent") {
    return item.status === "Gap observed" || item.status === "Observed" || item.status === "Review signal"
      ? "Known 3rd party embed or service connections were retained before a recorded consent action."
      : "No known 3rd party embed or service connection was observed before a recorded consent action.";
  }

  if (item.id === "third_party_iframe_pre_consent") {
    return item.status === "Gap observed" || item.status === "Observed" || item.status === "Review signal"
      ? "Known 3rd party iframe embeds were retained before a recorded consent action."
      : "No known 3rd party iframe embed was observed before a recorded consent action.";
  }

  if (item.id === "social_media_embed_pre_consent") {
    const evidence = getRetainedEvidenceRecord(item);
    const providers = uniqueStrings([
      ...getStringArrayFromEvidenceKeys(evidence, ["providers"]),
      ...getNestedRecordStrings(evidence.socialMediaEmbedObservations, ["provider"])
    ]).slice(0, 4);
    const domains = uniqueStrings([
      ...getStringArrayFromEvidenceKeys(evidence, ["socialMediaEmbedDomains", "social_media_embed_domains"]),
      ...getNestedRecordStrings(evidence.socialMediaEmbedObservations, ["domain", "host", "hostname"])
    ]).slice(0, 4);
    const providerPhrase = formatList(providers.length > 0 ? providers : domains);
    const firstSeenPhrase = formatFirstSeenPhrase(getFirstEvidenceMs(item));
    return item.status === "Gap observed" || item.status === "Observed"
      ? joinRationaleParts([
          providerPhrase
            ? `Social/media provider request observed before a recorded consent action: ${providerPhrase}`
            : "A social/media 3rd party service loaded before a recorded consent action",
          firstSeenPhrase
        ])
      : item.status === "Review signal"
        ? joinRationaleParts([
            providerPhrase
              ? `Social/media 3rd party asset observed before consent: ${providerPhrase}`
              : "A social/media 3rd party asset loaded before consent, but stronger embed or tracking behavior was not confirmed",
            firstSeenPhrase
          ])
        : "No social/media embed, plugin, widget, or pixel request was observed before a recorded consent action.";
  }

  if (item.id === "embedded_content_pre_consent") {
    return item.status === "Observed" || item.status === "Review signal"
      ? "Concrete 3rd party embedded content was observed before a recorded consent action."
      : "No concrete 3rd party embedded content was observed before a recorded consent action.";
  }

  if (item.id === "reject_all_path_availability") {
    return item.status === "Observed"
      ? "A reject-all or equivalent refusal path was observed from structured consent-surface evidence."
      : item.status === "Gap observed"
        ? "A reject-all or equivalent refusal path was not observed as equally available from the consent surface."
        : "Reject-path availability was not resolved from the retained consent-surface evidence.";
  }

  if (item.id === "accept_consent_control") {
    return item.status === "Observed"
      ? "An accept consent control was observed from structured consent-surface evidence."
      : item.status === "Gap observed"
        ? "An accept consent control was not observed on the retained first-layer consent surface."
        : "Accept consent control availability was not resolved from retained structured consent-surface evidence.";
  }

  if (item.id === "options_settings_preferences_control") {
    return item.status === "Observed"
      ? "An options/settings/preferences control was observed from structured consent-surface evidence."
      : item.status === "Gap observed"
        ? "An options/settings/preferences control was not observed on the retained first-layer consent surface."
        : "Options/settings/preferences control availability was not resolved from retained structured consent-surface evidence.";
  }

  if (item.id === "post_reject_tracking_reduction") {
    return item.status === "Gap observed"
      ? hasQuantitativePostRejectReductionEvidence(item)
        ? "Non-essential tracking did not materially decrease after the recorded reject action."
        : "Non-essential tracking was still observed after the recorded reject action."
      : item.status === "Not testable"
        ? "The retained scan context did not include a confirmed reject action, so post-reject tracking reduction could not be tested."
        : "Post-reject tracking reduction evidence did not produce an eligible gap signal.";
  }

  if (item.id === "preference_withdrawal_control") {
    return item.status === "Observed"
      ? "A way to reopen or change consent preferences after the initial choice was observed."
      : item.status === "Not observed"
        ? "No way to reopen or change consent preferences after the initial choice was observed."
        : "Post-choice consent preference controls require review from the retained lifecycle evidence.";
  }

  if (item.id === "sensitive_surfaces_third_party_tracking") {
    return item.status === "Not observed"
      ? "No eligible sensitive forms or flows were observed alongside 3rd party tracking in the tested context."
      : "Sensitive forms or flows appeared alongside 3rd party tracking or measurement scripts in the tested context.";
  }

  if (item.id === "session_replay_fingerprinting_review") {
    return item.explanation || (
      item.status === "Not observed"
        ? "No eligible session replay, behavioral recording, or fingerprinting-like signal was observed in the tested context."
        : "Session replay, behavioral recording, or fingerprinting-like signals require review from the retained runtime evidence."
    );
  }

  if (item.id === "session_replay_before_consent") {
    return item.status === "Gap observed"
      ? "Session replay or behavioral analytics was observed before a recorded consent action."
      : item.status === "Not testable"
        ? "Pre-consent session replay timing could not be evaluated from the retained runtime evidence."
        : "No pre-consent session replay collection signal was retained in the tested context.";
  }

  if (item.id === "session_replay_disclosure_alignment") {
    return item.status === "Gap observed"
      ? "Session replay or behavioral analytics was observed, but the reviewed disclosures did not clearly match the replay vendor or domain."
      : item.status === "Observed"
        ? "Observed session replay or behavioral analytics was matched to retained disclosure evidence."
        : item.status === "Not testable"
          ? "Session replay was observed, but disclosure-comparison evidence was not available for this scan context."
          : "No session replay disclosure mismatch was observed in the tested context.";
  }

  if (item.id === "session_replay_sensitive_surface") {
    return item.status === "Gap observed"
      ? "Session replay or behavioral analytics was observed on the same retained page or flow as a sensitive collection surface."
      : "No same-context sensitive-surface session replay signal was retained in the tested context.";
  }

  if (item.id === "session_replay_after_refusal") {
    return item.status === "Gap observed"
      ? "Session replay or behavioral analytics persisted after a confirmed reject or opt-out action."
      : item.status === "Not testable"
        ? "Post-refusal session replay behavior could not be compared because reject/opt-out action proof was not retained."
        : "No post-refusal session replay persistence signal was retained after a confirmed reject or opt-out action.";
  }

  if (item.id === "cross_border_endpoint_review") {
    if (item.status === "Gap observed") {
      return getStringArrayFromRetainedEvidence(item, "evidenceHighlights")[0] ??
        "Transfer-relevant analytics / behavioral tracking endpoints were observed. Additional 3rd party asset endpoints were retained as supporting runtime context.";
    }

    return item.status === "Review signal"
      ? "Observed 3rd party endpoints created a public-web international transfer review signal."
      : "No public-web international transfer review signal was projected from observed 3rd party endpoints.";
  }

  if (item.id === "accessibility_consent_controls") {
    return item.status === "Review signal"
      ? "Consent controls produced a basic automated accessibility review signal."
      : "No consent/privacy-control accessibility issue was retained in the tested context.";
  }

  const subject = getChecklistSentenceSubject(item.label);
  switch (item.status) {
    case "Observed":
      return `${item.label} was observed in the tested context.`;
    case "Gap observed":
      return `${item.label} produced a gap signal in the tested context.`;
    case "Review signal":
      return `${item.label} produced a review signal in the tested context.`;
    case "Not observed":
      return `No eligible evidence for ${subject} was observed in the tested context.`;
    case "Insufficient evidence":
      return `The scan retained partial evidence for ${subject}, but not enough canonical evidence to resolve the row.`;
    case "Not testable":
      return `The retained scan context did not support testing ${subject}.`;
    case "Out of scope":
      return `${item.label} is outside this public-web scan context.`;
    default:
      return item.explanation;
  }
}

function getChecklistRowRationale(item: GdprEprivacyCoverageChecklistItem) {
  const derived = deriveGdprEprivacyCoverageChecklistRowRationale(item);
  if (typeof derived === "string" && derived.trim().length > 0) {
    return derived;
  }

  return [
    item.criticalEvidence.statusBasis,
    item.note,
    item.explanation
  ].find((value) => typeof value === "string" && value.trim().length > 0)
    ?? `${item.label} evidence was evaluated from retained scanner evidence.`;
}

export function getGdprEprivacyCoverageChecklistRowRationaleForAudit(item: GdprEprivacyCoverageChecklistItem) {
  return getChecklistRowRationale(item);
}

function getSpecificChecklistRowRationale(item: GdprEprivacyCoverageChecklistItem) {
  const evidence = getRetainedEvidenceRecord(item);
  const vendorPhrase = formatList(getEvidenceVendorNames(item).slice(0, 4));
  const firstSeenMs = getFirstEvidenceMs(item);
  const evidenceLabel = getEvidenceLabel(item);

  if (evidenceLabel === "Not testable") {
    return null;
  }

  if (item.id === "pre_consent_third_party_tracking") {
    if (evidenceLabel === "Not observed") {
      return "No tracking-classified 3rd party request was observed before a recorded consent action.";
    }
    const canonicalSummary = getCanonicalRuntimeEvidenceSummary({
      fallbackFirstSeenMs: firstSeenMs,
      item,
      lead: "Pre-consent 3rd party tracking evidence was retained",
      maxEntries: 2,
      rowKind: "tracking"
    });
    if (canonicalSummary) {
      return canonicalSummary;
    }
    return joinRationaleParts([
      vendorPhrase
        ? `Tracking-classified 3rd party requests fired before any recorded consent action: ${vendorPhrase}`
        : "Tracking-classified 3rd party requests fired before any recorded consent action",
      formatFirstSeenPhrase(firstSeenMs)
    ]);
  }

  if (item.id === "pre_consent_cookies_storage") {
    const canonicalSummary = getCanonicalRuntimeEvidenceSummary({
      fallbackFirstSeenMs: firstSeenMs,
      item,
      lead: "Pre-consent cookie/storage evidence was retained",
      rowKind: "storage"
    });
    if (canonicalSummary) {
      return canonicalSummary;
    }
    const storageNames = uniqueStrings([
      ...getStringArrayFromEvidenceKeys(evidence, [
        "preConsentCookieExamples",
        "pre_consent_cookie_examples",
        "cookieNames",
        "cookie_names",
        "storageKeys",
        "storage_keys"
      ]),
      ...getNestedRecordStrings(evidence.preConsentCookieExamples, ["name", "cookieName", "cookie_name", "key"]),
      ...getNestedRecordStrings(evidence.concreteStorageArtifacts, ["name", "cookieName", "cookie_name", "key"])
    ]).slice(0, 4);
    const storagePhrase = formatList(storageNames);
    if (evidenceLabel === "Not observed") {
      return "No eligible cookie or browser-storage write was observed before a recorded consent action.";
    }
    return joinRationaleParts([
      storagePhrase
        ? `Cookie/storage writes were observed before any recorded consent action: ${storagePhrase}`
        : "Cookie/storage writes were observed before any recorded consent action",
      vendorPhrase ? `associated vendors include ${vendorPhrase}` : null,
      formatFirstSeenPhrase(firstSeenMs)
    ]);
  }

  if (item.id === "advertising_retargeting_vendor_signal_observed") {
    if (evidenceLabel === "Not observed") {
      return "No advertising infrastructure vendor signal was observed in retained runtime evidence.";
    }
    if (item.status === "Review signal" && retainedNumber(item, ["advertisingVendorCount", "advertising_vendor_count", "advertisingRetargetingVendorCount", "advertising_retargeting_vendor_count", "adtechVendorCount", "adtech_vendor_count"]) === 0) {
      return "No advertising infrastructure classification was retained; security, CDN, bot, and performance/RUM evidence remains review context only.";
    }
    const canonicalSummary = getCanonicalRuntimeEvidenceSummary({
      fallbackFirstSeenMs: firstSeenMs,
      item,
      lead: evidenceLabel === "Partial concern"
        ? "Advertising-infrastructure evidence was partially retained"
        : "Advertising infrastructure evidence was retained",
      rowKind: "advertising"
    });
    if (canonicalSummary) {
      return canonicalSummary;
    }
    return joinRationaleParts([
      vendorPhrase
        ? evidenceLabel === "Partial concern"
          ? `Advertising-infrastructure evidence was partially retained: ${vendorPhrase}`
          : `Advertising infrastructure vendor signals were observed: ${vendorPhrase}`
        : evidenceLabel === "Partial concern"
          ? "Advertising-infrastructure evidence was partially retained before a recorded consent choice"
          : "Advertising infrastructure vendor signals were observed",
      formatFirstSeenPhrase(firstSeenMs),
      evidenceLabel === "Partial concern"
        ? "review retained vendors/domains before treating this as confirmed advertising activity"
        : getPreConsentQualifier(item)
    ]);
  }

  if (item.id === "retargeting_behavioral_advertising_signal_observed") {
    if (evidenceLabel === "Not observed") {
      return "No retargeting or behavioral advertising vendor signal was observed in retained runtime evidence.";
    }
    const canonicalSummary = getCanonicalRuntimeEvidenceSummary({
      fallbackFirstSeenMs: firstSeenMs,
      item,
      lead: evidenceLabel === "Partial concern"
        ? "Retargeting or behavioral-advertising evidence was partially retained"
        : "Retargeting/behavioral advertising evidence was retained",
      rowKind: "retargeting"
    });
    if (canonicalSummary) {
      return canonicalSummary;
    }
    return joinRationaleParts([
      vendorPhrase
        ? evidenceLabel === "Partial concern"
          ? `Retargeting or behavioral-advertising evidence was partially retained: ${vendorPhrase}`
          : `Retargeting or behavioral advertising vendor signals were observed: ${vendorPhrase}`
        : evidenceLabel === "Partial concern"
          ? "Retargeting or behavioral-advertising evidence was partially retained before a recorded consent choice"
          : "Retargeting or behavioral advertising vendor signals were observed",
      formatFirstSeenPhrase(firstSeenMs),
      evidenceLabel === "Partial concern"
        ? "review retained vendors/domains before treating this as confirmed behavioral advertising or audience activation"
        : getPreConsentQualifier(item)
    ]);
  }

  if (item.id === "analytics_vendor_observed") {
    if (evidenceLabel === "Not observed") {
      return "No analytics or measurement vendor signal was observed in retained runtime evidence.";
    }
    const canonicalSummary = getCanonicalRuntimeEvidenceSummary({
      fallbackFirstSeenMs: firstSeenMs,
      item,
      lead: "Analytics/measurement evidence was retained",
      rowKind: "analytics"
    });
    if (canonicalSummary) {
      return canonicalSummary;
    }
    return joinRationaleParts([
      vendorPhrase
        ? `Analytics or measurement vendor signals were observed: ${vendorPhrase}`
        : "Analytics or measurement vendor signals were observed",
      formatFirstSeenPhrase(firstSeenMs),
      getPreConsentQualifier(item)
    ]);
  }

  if (item.id === "session_replay_fingerprinting_review") {
    const replayEvidence = getRecord(evidence.sessionReplayEvidence);
    const replayVendors = formatList(getStringArray(replayEvidence?.vendors).slice(0, 4));
    const replayFirstSeenMs = getFirstNumberFromRecord(replayEvidence, ["firstSeenMs", "first_seen_ms", "firstObservedMs", "first_observed_ms"]);
    if (evidenceLabel === "Not observed") {
      return "No eligible session replay or behavioral-recording vendor was observed in retained runtime evidence.";
    }
    return joinRationaleParts([
      replayVendors
        ? `Session replay or behavioral analytics signals were observed: ${replayVendors}`
        : "Session replay or behavioral analytics signals were observed",
      formatFirstSeenPhrase(replayFirstSeenMs ?? firstSeenMs),
      replayEvidence?.preConsentObserved === true ? "before any recorded consent action" : null
    ]);
  }

  if (item.id === "device_identification_fingerprinting_signal_observed") {
    const entropyEvidence = getRecord(evidence.browserDeviceEntropyEvidence) ?? {};
    const fingerprintReasons = uniqueStrings([
      ...getStringArrayFromEvidenceKeys(evidence, ["fingerprintingReasons", "fingerprinting_reasons", "reasons"]),
      ...getStringArrayFromEvidenceKeys(entropyEvidence, [
        "reasons",
        "signals",
        "vendors",
        "browserApiSignals",
        "browser_api_signals",
        "highEntropySignals",
        "high_entropy_signals"
      ])
    ]).slice(0, 4);
    const entropyFirstSeenMs = getFirstNumberFromRecord(entropyEvidence, ["firstObservedMs", "first_observed_ms", "firstSeenMs", "first_seen_ms"]);
    const reasonPhrase = formatList(fingerprintReasons);
    if (evidenceLabel === "Not observed") {
      return "No eligible device-identification or fingerprinting signal was observed in retained runtime evidence.";
    }
    return joinRationaleParts([
      reasonPhrase
        ? `Device-identification or fingerprinting-like browser API signals were observed: ${reasonPhrase}`
        : "Device-identification or fingerprinting-like signals were observed",
      formatFirstSeenPhrase(entropyFirstSeenMs ?? firstSeenMs)
    ]);
  }

  if (item.id === "social_media_embed_pre_consent") {
    const hosts = uniqueStrings([
      ...getStringArrayFromEvidenceKeys(evidence, ["socialMediaEmbedDomains", "social_media_embed_domains"]),
      ...getNestedRecordStrings(evidence.socialMediaEmbedObservations, ["domain", "host", "hostname"])
    ]).slice(0, 4);
    const providers = uniqueStrings([
      ...getStringArrayFromEvidenceKeys(evidence, ["providers"]),
      ...getNestedRecordStrings(evidence.socialMediaEmbedObservations, ["provider"])
    ]).slice(0, 4);
    const providerPhrase = formatList(providers.length > 0 ? providers : hosts);
    if (evidenceLabel === "Not observed") {
      return "No eligible social/media provider request was observed before a recorded consent action; plain outbound social links are not counted for this row.";
    }
    if (evidenceLabel === "Partial concern") {
      return joinRationaleParts([
        providerPhrase
          ? `A social/media 3rd party asset loaded before consent: ${providerPhrase}. Stronger embed, plugin, pixel, cookie, or storage behavior was not confirmed`
          : "A social/media 3rd party asset loaded before consent, but stronger embed, plugin, pixel, cookie, or storage behavior was not confirmed",
        formatFirstSeenPhrase(firstSeenMs)
      ]);
    }
    return joinRationaleParts([
      providerPhrase
        ? `A social/media embed, plugin, widget, or pixel loaded before any recorded consent action: ${providerPhrase}`
        : "A social/media embed, plugin, widget, or pixel loaded before any recorded consent action",
      evidence.placeholderIneffective === true
        ? "Placeholder-style blocking was retained, but the provider request had already fired"
        : null,
      formatFirstSeenPhrase(firstSeenMs)
    ]);
  }

  if (item.id === "embedded_content_pre_consent") {
    const hosts = uniqueStrings([
      ...getStringArrayFromEvidenceKeys(evidence, ["embeddedContentHosts", "embedded_content_hosts", "embeddedHosts", "embedded_hosts"]),
      ...getNestedRecordStrings(evidence.embeddedContentObservations, ["host", "hostname", "domain"])
    ]).slice(0, 4);
    const hostPhrase = formatList(hosts);
    const purposeParts = getEmbeddedContentPurposeParts(evidence);
    if (evidenceLabel === "Not observed") {
      return "No eligible 3rd party embedded content was observed before a recorded consent action.";
    }
    if (purposeParts.length > 0) {
      return joinRationaleParts([
        `3rd party embedded content loaded before any recorded consent action, including ${formatEmbeddedPurposeParts(purposeParts)}. Review retained domains by purpose`,
        formatFirstSeenPhrase(firstSeenMs)
      ]);
    }
    return joinRationaleParts([
      hostPhrase
        ? `3rd party embedded content loaded before any recorded consent action: ${hostPhrase}`
        : "3rd party embedded content loaded before any recorded consent action",
      formatFirstSeenPhrase(firstSeenMs)
    ]);
  }

  if (item.id === "third_party_service_connection_pre_consent" || item.id === "third_party_iframe_pre_consent") {
    const hosts = uniqueStrings([
      ...getStringArrayFromEvidenceKeys(evidence, ["embeddedContentHosts", "embedded_content_hosts", "embeddedHosts", "embedded_hosts"]),
      ...getNestedRecordStrings(evidence.embeddedContentObservations, ["host", "hostname", "domain"])
    ]).slice(0, 4);
    const purposeParts = getEmbeddedContentPurposeParts(evidence);
    if (evidenceLabel === "Not observed") {
      return item.id === "third_party_iframe_pre_consent"
        ? "No eligible 3rd party iframe embed was observed before a recorded consent action."
        : "No eligible 3rd party embed or service connection was observed before a recorded consent action.";
    }
    if (purposeParts.length > 0) {
      return joinRationaleParts([
        item.id === "third_party_iframe_pre_consent"
          ? `3rd party iframe embeds loaded before any recorded consent action, including ${formatEmbeddedPurposeParts(purposeParts)}`
          : `3rd party embed or service connections occurred before any recorded consent action, including ${formatEmbeddedPurposeParts(purposeParts)}`,
        formatFirstSeenPhrase(firstSeenMs)
      ]);
    }
    return joinRationaleParts([
      hosts.length > 0
        ? item.id === "third_party_iframe_pre_consent"
          ? `3rd party iframe embeds loaded before any recorded consent action: ${formatList(hosts)}`
          : `3rd party embed or service connections occurred before any recorded consent action: ${formatList(hosts)}`
        : item.id === "third_party_iframe_pre_consent"
          ? "3rd party iframe embeds loaded before any recorded consent action"
          : "3rd party embed or service connections occurred before any recorded consent action",
      formatFirstSeenPhrase(firstSeenMs)
    ]);
  }

  if (item.id === "reject_all_path_availability") {
    const labels = uniqueStrings([
      ...getStringArrayFromEvidenceKeys(evidence, ["rejectButtonLabels", "reject_button_labels", "refusalControlLabels", "refusal_control_labels", "buttonLabels", "button_labels"]),
      ...extractQuotedButtonLabels(item.criticalEvidence.statusBasis)
    ]).slice(0, 3);
    if (evidenceLabel === "Observed") {
      return labels.length > 0
        ? `A refusal path was observed from structured consent-control evidence: ${formatList(labels)}. This confirms availability, not post-click behavior.`
        : "A refusal path was observed from structured consent-control evidence. This confirms availability, not post-click behavior.";
    }
    if (evidenceLabel === "Potential gap") {
      return "A first-layer reject-all or equivalent refusal path was expected from the observed consent surface but was not retained.";
    }
  }

  if (item.id === "accept_consent_control") {
    const labels = uniqueStrings([
      ...getStringArrayFromEvidenceKeys(evidence, ["visibleAcceptLabels", "visible_accept_labels", "acceptButtonLabels", "accept_button_labels", "acceptLabels", "accept_labels", "buttonLabels", "button_labels"]),
      ...extractQuotedButtonLabels(item.criticalEvidence.statusBasis)
    ]).slice(0, 3);
    if (evidenceLabel === "Observed") {
      return labels.length > 0
        ? `An accept consent control was observed from structured consent-control evidence: ${formatList(labels)}. This confirms availability, not post-click behavior.`
        : "An accept consent control was observed from structured consent-control evidence. This confirms availability, not post-click behavior.";
    }
    if (evidenceLabel === "Potential gap") {
      return "A first-layer accept consent control was expected from the observed consent surface but was not retained as structured control evidence.";
    }
  }

  if (item.id === "options_settings_preferences_control") {
    const labels = uniqueStrings([
      ...getStringArrayFromEvidenceKeys(evidence, ["visibleOptionsLabels", "visible_options_labels", "preferenceLabels", "preference_labels", "buttonLabels", "button_labels"]),
      ...extractQuotedButtonLabels(item.criticalEvidence.statusBasis)
    ]).slice(0, 3);
    if (evidenceLabel === "Observed") {
      return labels.length > 0
        ? `An options/settings/preferences control was observed from structured consent-control evidence: ${formatList(labels)}. This confirms availability, not post-click behavior.`
        : "An options/settings/preferences control was observed from structured consent-control evidence. This confirms availability, not post-click behavior.";
    }
    if (evidenceLabel === "Potential gap") {
      return "A first-layer options/settings/preferences control was expected from the observed consent surface but was not retained as structured control evidence.";
    }
  }

  const article13Snippet = getArticle13Snippet(evidence);
  if (article13Snippet) {
    return `${getArticle13RationalePrefix(item)}: ${article13Snippet}`;
  }

  return null;
}

function getArticle13RationalePrefix(item: GdprEprivacyCoverageChecklistItem) {
  if (
    item.id === "supervisory_authority_complaint_disclosure" &&
    getEvidenceLabel(item) === "Partial concern"
  ) {
    return "Policy text referenced complaints, regulators, or data protection authorities, but a complete supervisory-authority complaint-right disclosure was not confirmed";
  }
  if (item.id === "international_transfers_disclosure") {
    return "Policy text included matching international-transfer disclosure evidence";
  }
  if (getEvidenceLabel(item) === "Partial concern") {
    return "Policy evidence was retained, but the matched disclosure text was incomplete or ambiguous";
  }
  if (getEvidenceLabel(item) === "Not confirmed") {
    return "Policy evidence was retained, but row-specific disclosure was not confirmed from the retained extraction";
  }
  if (getEvidenceLabel(item) === "Potential gap") {
    return "Scanner expected this transparency disclosure but did not retain a clear match";
  }
  if (getEvidenceLabel(item) === "Not observed") {
    return "Scanner did not retain a clear matching transparency disclosure";
  }
  return "Policy text included matching disclosure evidence";
}

function getArticle13Snippet(evidence: Record<string, unknown>) {
  const article13Signal = getRecord(evidence.article13Signal);
  const text = getString(article13Signal?.evidenceText) ?? getString(article13Signal?.evidence_text);
  return text ? `"${truncateWholeWord(cleanPolicyExcerptStart(text), 180, "...[more in evidence packet]")}"` : null;
}

function getStrongestEvidenceDetail(item: GdprEprivacyCoverageChecklistItem) {
  const evidence = getRetainedEvidenceRecord(item);
  const highlights = getStringArrayFromEvidenceKeys(evidence, ["evidenceHighlights", "evidence_highlights"]);
  if (highlights.length > 0) {
    return cleanEvidenceText(highlights[0] ?? "");
  }
  const vendorPhrase = formatList(getEvidenceVendorNames(item).slice(0, 4));
  const firstSeenMs = getFirstEvidenceMs(item);
  if (vendorPhrase) {
    return joinRationaleParts([`observed vendors include ${vendorPhrase}`, formatFirstSeenPhrase(firstSeenMs)]);
  }
  if (item.criticalEvidence.statusBasis) {
    return cleanEvidenceText(item.criticalEvidence.statusBasis);
  }
  return null;
}

function getEvidenceBackedFallbackRationale(item: GdprEprivacyCoverageChecklistItem) {
  const evidence = getRetainedEvidenceRecord(item);
  const evidenceLabel = getEvidenceLabel(item);
  const source = getRetainedEvidenceSourceSummary(item);
  const statusBasis = item.criticalEvidence.statusBasis ? cleanEvidenceText(item.criticalEvidence.statusBasis) : null;
  const strongestDetail = getStrongestEvidenceDetail(item);
  const missingEvidence = getMissingEvidenceSummary(item);
  const policySurface = getPolicySurfaceSummaryDetail(evidence);
  const projectedFindings = getProjectedFindingSummary(evidence);
  const signalState = getSignalObservedSummary(evidence);

  if (policyTextExtractionLimited(item)) {
    return joinRationaleParts([
      `Coverage limited from retained ${source}`,
      statusBasis,
      getPolicyTextExtractionSummary(evidence),
      missingEvidence,
      policySurface
    ]);
  }

  if (evidenceLabel === "Not testable") {
    return joinRationaleParts([
      `Not testable from retained ${source}`,
      missingEvidence ?? statusBasis,
      policySurface
    ]);
  }

  if (evidenceLabel === "Potential gap") {
    return joinRationaleParts([
      `Potential gap from retained ${source}`,
      strongestDetail ?? statusBasis,
      projectedFindings,
      signalState
    ]);
  }

  if (evidenceLabel === "Partial concern") {
    return joinRationaleParts([
      `Partial support from retained ${source}`,
      strongestDetail ?? statusBasis,
      missingEvidence,
      policySurface
    ]);
  }

  if (evidenceLabel === "Not confirmed") {
    return joinRationaleParts([
      `Not confirmed from retained ${source}`,
      strongestDetail ?? statusBasis,
      missingEvidence,
      policySurface
    ]);
  }

  if (evidenceLabel === "Observed") {
    return joinRationaleParts([
      `Observed from retained ${source}`,
      strongestDetail ?? statusBasis,
      projectedFindings,
      policySurface
    ]);
  }

  return joinRationaleParts([
    `Not observed in retained ${source}`,
    strongestDetail ?? statusBasis,
    missingEvidence,
    signalState
  ]);
}

function getRetainedEvidenceSourceSummary(item: GdprEprivacyCoverageChecklistItem) {
  const evidence = getRetainedEvidenceRecord(item);
  if (getRecord(evidence.policySurfaceSummary)) {
    return "policy-surface evidence";
  }
  if (getRecord(evidence.sessionReplayEvidence) || getRecord(evidence.browserDeviceEntropyEvidence) || getEvidenceVendorNames(item).length > 0) {
    return "runtime evidence";
  }
  if (getStringArrayFromEvidenceKeys(evidence, ["projectedFindings", "projected_findings"]).length > 0 || item.criticalEvidence.projectedFindings.length > 0) {
    return "unified finding projection evidence";
  }
  if (item.criticalEvidence.missingOrIncompleteSourceSignals.length > 0) {
    return "source-signal coverage evidence";
  }
  return "scanner evidence";
}

function policyTextExtractionLimited(item: GdprEprivacyCoverageChecklistItem) {
  const evidence = getRetainedEvidenceRecord(item);
  const health = getPolicyTextExtractionHealth(evidence);
  const status = getString(health?.policyTextExtractionStatus) ?? getString(health?.policy_text_extraction_status);
  return Boolean(status && status !== "ok");
}

function getPolicyTextExtractionHealth(evidence: Record<string, unknown>) {
  const policySurfaceSummary = getRecord(evidence.policySurfaceSummary) ?? getRecord(evidence.policy_surface_summary);
  return getRecord(evidence.policyTextExtractionHealth) ??
    getRecord(evidence.policy_text_extraction_health) ??
    getRecord(policySurfaceSummary?.policyTextExtractionHealth) ??
    getRecord(policySurfaceSummary?.policy_text_extraction_health);
}

function getPolicyTextExtractionSummary(evidence: Record<string, unknown>) {
  const health = getPolicyTextExtractionHealth(evidence);
  if (!health) {
    return null;
  }
  const status = getString(health.policyTextExtractionStatus) ?? getString(health.policy_text_extraction_status);
  const extracted = getNumber(health.extractedTextLength ?? health.extracted_text_length);
  const required = getNumber(health.minimumTextLengthRequired ?? health.minimum_text_length_required);
  const parts = [
    status ? `policy text extraction ${status}` : "policy text extraction limited",
    typeof extracted === "number" ? `${Math.round(extracted)} characters retained` : null,
    typeof required === "number" ? `${Math.round(required)} required` : null
  ].filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join("; ") : null;
}

function getMissingEvidenceSummary(item: GdprEprivacyCoverageChecklistItem) {
  const missing = item.criticalEvidence.missingOrIncompleteSourceSignals.slice(0, 2).flatMap((signal) => {
    const expected = getEvidenceValueSummary(signal.expected);
    const actual = getEvidenceValueSummary(signal.actual);
    return expected ? [`expected ${expected}${actual ? `; retained ${actual}` : ""}`] : [];
  });
  return missing.length > 0 ? `Missing or incomplete source signal: ${missing.join("; ")}` : null;
}

function getEvidenceValueSummary(value: unknown) {
  if (typeof value === "string") {
    return cleanEvidenceText(value);
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.length > 0 ? `${value.length} retained value${value.length === 1 ? "" : "s"}` : "";
  }
  if (value && typeof value === "object") {
    return "structured value";
  }
  return "";
}

function getPolicySurfaceSummaryDetail(evidence: Record<string, unknown>) {
  const summary = getRecord(evidence.policySurfaceSummary);
  if (!summary) {
    return null;
  }
  const urls = uniqueStrings([
    ...getStringArrayFromEvidenceKeys(summary, ["privacyPolicyUrls", "privacy_policy_urls"]),
    ...getStringArrayFromEvidenceKeys(summary, ["cookiePolicyUrls", "cookie_policy_urls"])
  ]).slice(0, 2);
  const urlPhrase = formatList(urls);
  const textCount = getFirstNumberFromRecord(summary, [
    "privacyPolicyTextCharacterCount",
    "privacy_policy_text_character_count",
    "retainedTextCharacterCount",
    "retained_text_character_count"
  ]);
  const guessedOnly = getFirstBooleanFromRecord(summary, [
    "keyPageGuessedOnly",
    "key_page_guessed_only",
    "privacyPolicyGuessedOnly",
    "privacy_policy_guessed_only"
  ]);
  return joinRationaleParts([
    urlPhrase ? `policy surface: ${urlPhrase}` : "policy surface retained",
    typeof textCount === "number" ? `${Math.round(textCount)} policy-text characters retained` : null,
    guessedOnly === true ? "policy attribution was guessed/weak" : null
  ]);
}

function getProjectedFindingSummary(evidence: Record<string, unknown>) {
  const projected = getStringArrayFromEvidenceKeys(evidence, ["projectedFindings", "projected_findings"]);
  const projectedObjects = getNestedRecordStrings(evidence.projectedFindings ?? evidence.projected_findings, ["label", "id"]).slice(0, 3);
  const previews = getNestedRecordStrings(evidence.projectedFindingPreview, ["label", "id"]).slice(0, 3);
  const findingEntities = getNestedRecordStrings(evidence.findingEntities, ["id", "label"]).slice(0, 3);
  const phrase = formatList(uniqueStrings([...projected, ...projectedObjects, ...previews, ...findingEntities]).slice(0, 3));
  return phrase ? `projected finding evidence: ${phrase}` : null;
}

function getSignalObservedSummary(evidence: Record<string, unknown>) {
  const signalObserved = evidence.signalObserved ?? evidence.signal_observed;
  if (signalObserved === true) {
    return "structured signalObserved=true retained";
  }
  if (signalObserved === false) {
    return "structured signalObserved=false retained";
  }
  if (signalObserved === "partial") {
    return "structured signalObserved=partial retained";
  }
  return null;
}

type CanonicalRuntimeEvidenceKind = "advertising" | "analytics" | "retargeting" | "storage" | "tracking";

type CanonicalRuntimeEvidenceEntry = {
  category: string | null;
  firstSeenMs: number | null;
  party: string | null;
  preConsent: boolean | null;
  priority: string | null;
  vendor: string;
};

function getCanonicalRuntimeEvidenceSummary(input: {
  fallbackFirstSeenMs: number | null;
  item: GdprEprivacyCoverageChecklistItem;
  lead: string;
  maxEntries?: number;
  rowKind: CanonicalRuntimeEvidenceKind;
}) {
  const entries = getCanonicalRuntimeEvidenceEntries(input.item);
  const matchingEntries = entries.filter((entry) => canonicalEntryMatchesKind(entry, input.rowKind));
  const thirdPartyMatchingEntries = matchingEntries.filter(isThirdPartyCanonicalRuntimeEvidenceEntry);
  const candidateEntries = (
    input.rowKind === "tracking" && thirdPartyMatchingEntries.length > 0 ? thirdPartyMatchingEntries.sort(compareCanonicalRuntimeEvidenceEntries) :
      input.rowKind === "tracking" ? matchingEntries.sort(compareCanonicalRuntimeEvidenceEntries) :
      matchingEntries.length > 0 ? matchingEntries :
        entries
  );
  const primaryEntries = candidateEntries.slice(0, input.maxEntries ?? 4);
  if (primaryEntries.length === 0) {
    return null;
  }
  const firstSeenMs = minNumber([
    input.fallbackFirstSeenMs,
    ...primaryEntries.map((entry) => entry.firstSeenMs)
  ]);
  const preConsentObserved = primaryEntries.some((entry) => entry.preConsent === true) || getPreConsentQualifier(input.item) !== null;
  const omittedCount = Math.max(candidateEntries.length - primaryEntries.length, 0);
  return joinRationaleParts([
    `${input.lead}${preConsentObserved ? " before consent" : ""}: ${formatCanonicalRuntimeEvidenceEntries(primaryEntries, { includeTiming: firstSeenMs === null })}`,
    omittedCount > 0 ? `${omittedCount} additional eligible tracker${omittedCount === 1 ? "" : "s"} retained in expandable evidence` : null,
    formatFirstSeenPhrase(firstSeenMs),
    preConsentObserved ? "no consent action was recorded first" : null
  ]);
}

function getCanonicalRuntimeEvidenceEntries(item: GdprEprivacyCoverageChecklistItem): CanonicalRuntimeEvidenceEntry[] {
  const evidence = getRetainedEvidenceRecord(item);
  const rowEntries = uniqueCanonicalRuntimeEvidenceEntries([
    ...getCanonicalRuntimeEvidenceEntriesFromRows(evidence.preconsentThirdPartyTrackerGroups),
    ...getCanonicalRuntimeEvidenceEntriesFromRows(evidence.preconsent_third_party_tracker_groups),
    ...getCanonicalRuntimeEvidenceEntriesFromRows(evidence.preconsent_tracker_vendor_evidence),
    ...getCanonicalRuntimeEvidenceEntriesFromRows(evidence.preConsentTrackerVendorEvidence),
    ...getCanonicalRuntimeEvidenceEntriesFromRows(evidence.preconsentThirdPartyCookieStorageGroups),
    ...getCanonicalRuntimeEvidenceEntriesFromRows(evidence.preconsent_third_party_cookie_storage_groups),
    ...getCanonicalRuntimeEvidenceEntriesFromRows(evidence.advertisingRetargetingVendorEvidence),
    ...getCanonicalRuntimeEvidenceEntriesFromRows(evidence.analyticsVendorEvidence),
    ...getCanonicalRuntimeEvidenceEntriesFromRows(evidence.findingEntities),
    ...getCanonicalRuntimeEvidenceEntriesFromRows(evidence.representativeRequests),
    ...getCanonicalRuntimeEvidenceEntriesFromRows(evidence.representative_requests)
  ]);
  const rowVendors = new Set(rowEntries.map((entry) => entry.vendor.toLowerCase()));
  const vendorListEntries = getEvidenceVendorNames(item)
    .filter((vendor) => !rowVendors.has(vendor.toLowerCase()))
    .map((vendor) => ({
      category: null,
      firstSeenMs: null,
      party: null,
      preConsent: null,
      priority: null,
      vendor
    }));
  return uniqueCanonicalRuntimeEvidenceEntries([...rowEntries, ...vendorListEntries]);
}

function getCanonicalRuntimeEvidenceEntriesFromRows(value: unknown): CanonicalRuntimeEvidenceEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((entry) => {
    const record = getRecord(entry);
    if (!record) {
      return [];
    }
    const vendor = getFirstStringFromRecord(record, [
      "vendor",
      "vendorName",
      "vendor_name",
      "matchedVendorName",
      "matched_vendor_name",
      "name"
    ]);
    if (!vendor) {
      return [];
    }
    return [{
      category: getFirstStringFromRecord(record, ["category", "vendorCategory", "vendor_category", "purpose", "classification"]),
      firstSeenMs: getFirstNumberFromRecord(record, ["firstSeenMs", "first_seen_ms", "firstObservedMs", "first_observed_ms", "timestampMs", "timestamp_ms"]),
      party: getFirstStringFromRecord(record, ["party", "partyType", "party_type", "firstPartyOrThirdParty", "first_party_or_third_party"]),
      preConsent: getFirstBooleanFromRecord(record, ["preConsent", "pre_consent", "beforeConsent", "before_consent"]),
      priority: getFirstStringFromRecord(record, ["priority", "reviewPriority", "review_priority", "trackerPriority", "tracker_priority"]),
      vendor
    }];
  });
}

function canonicalEntryMatchesKind(entry: CanonicalRuntimeEvidenceEntry, kind: CanonicalRuntimeEvidenceKind) {
  const text = `${entry.vendor} ${entry.category ?? ""}`.toLowerCase();
  if (kind === "advertising") {
    return /\b(ad|ads|adtech|advertis|doubleclick|measurement|programmatic|verification)\b/i.test(text);
  }
  if (kind === "analytics") {
    return /\b(analytics|measurement|metrics|stats|tag manager|gtm|google analytics)\b/i.test(text);
  }
  if (kind === "retargeting") {
    return /\b(retarget|remarket|behavioral|audience|identity sync|idsync|cross[- ]site|profile activation|meta pixel|facebook pixel|linkedin insight|tiktok pixel|pinterest tag)\b/i.test(text);
  }
  if (kind === "storage") {
    return /\b(cookie|storage|analytics|measurement|advertis|personal|retarget|audience)\b/i.test(text);
  }
  return /\b(track|tracking|ad|ads|adtech|advertising|advertis\w*|analytics|measurement|retarget|cross[- ]site)\b/i.test(text);
}

function isThirdPartyCanonicalRuntimeEvidenceEntry(entry: CanonicalRuntimeEvidenceEntry) {
  const party = entry.party?.trim().toLowerCase();
  return party === "3rd" || party === "third_party" || party === "third-party" || party === "mixed";
}

function compareCanonicalRuntimeEvidenceEntries(left: CanonicalRuntimeEvidenceEntry, right: CanonicalRuntimeEvidenceEntry) {
  const priorityDelta = getCanonicalRuntimeEvidencePriorityRank(left.priority) - getCanonicalRuntimeEvidencePriorityRank(right.priority);
  if (priorityDelta !== 0) {
    return priorityDelta;
  }
  const timingDelta = (left.firstSeenMs ?? Number.POSITIVE_INFINITY) - (right.firstSeenMs ?? Number.POSITIVE_INFINITY);
  if (timingDelta !== 0) {
    return timingDelta;
  }
  return left.vendor.localeCompare(right.vendor);
}

function getCanonicalRuntimeEvidencePriorityRank(priority: string | null) {
  const normalized = priority?.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (normalized === "high" || normalized === "concern") {
    return 0;
  }
  if (normalized === "review" || normalized === "review_needed") {
    return 1;
  }
  if (normalized === "medium" || normalized === "partial_concern") {
    return 2;
  }
  if (normalized === "contextual" || normalized === "low") {
    return 3;
  }
  return 4;
}

function formatCanonicalRuntimeEvidenceEntries(entries: CanonicalRuntimeEvidenceEntry[], options: { includeTiming?: boolean } = {}) {
  return formatList(entries.map((entry) => {
    const details = [
      entry.category ? formatEvidenceCategory(entry.category) : null,
      options.includeTiming === true && entry.firstSeenMs !== null ? formatElapsedSeconds(entry.firstSeenMs) : null
    ].filter(Boolean);
    return details.length > 0 ? `${entry.vendor} (${details.join(", ")})` : entry.vendor;
  })) ?? "";
}

function uniqueCanonicalRuntimeEvidenceEntries(entries: CanonicalRuntimeEvidenceEntry[]) {
  const seen = new Set<string>();
  return entries.filter((entry) => {
    const key = `${entry.vendor.toLowerCase()}|${entry.category ?? ""}|${entry.firstSeenMs ?? ""}|${entry.party ?? ""}|${entry.preConsent ?? ""}|${entry.priority ?? ""}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function getFirstStringFromRecord(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = getString(record[key]);
    if (value) {
      return value;
    }
  }
  return null;
}

function getFirstBooleanFromRecord(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "boolean") {
      return value;
    }
  }
  return null;
}

function formatEvidenceCategory(value: string) {
  return value.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}

function getChecklistSentenceSubject(label: string) {
  const cleanedLabel = label
    .replace(/\s+observed$/i, "")
    .replace(/\s+availability$/i, "")
    .replace(/\s+/g, " ")
    .trim();

  return cleanedLabel.length > 0
    ? cleanedLabel.charAt(0).toLowerCase() + cleanedLabel.slice(1)
    : "this row";
}

function getRetainedEvidenceRecord(item: GdprEprivacyCoverageChecklistItem) {
  const evidence = item.criticalEvidence.retainedEvidence;
  return evidence && typeof evidence === "object" && !Array.isArray(evidence)
    ? evidence as Record<string, unknown>
    : {};
}

function getRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function getRecordArray(value: unknown) {
  return Array.isArray(value)
    ? value.flatMap((entry) => {
        const record = getRecord(entry);
        return record ? [record] : [];
      })
    : [];
}

function getString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function getNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0).map((entry) => entry.trim())
    : [];
}

function getStringArrayFromEvidenceKeys(evidence: Record<string, unknown>, keys: string[]) {
  return uniqueStrings(keys.flatMap((key) => getStringArray(evidence[key])));
}

function getNestedRecordStrings(value: unknown, keys: string[]) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((entry) => {
    const record = getRecord(entry);
    if (!record) {
      return [];
    }
    return keys.flatMap((key) => {
      const stringValue = getString(record[key]);
      return stringValue ? [stringValue] : [];
    });
  });
}

function getEmbeddedContentPurposeParts(evidence: Record<string, unknown>) {
  const buckets = getRecord(evidence.embeddedContentPurposeBuckets) ?? getRecord(evidence.embedded_content_purpose_buckets);
  if (!buckets) {
    return [];
  }
  const purposeLabels: Array<[string, string]> = [
    ["videoAdSdk", "video/ad SDK evidence"],
    ["mediaEmbed", "media embed evidence"],
    ["mapEmbed", "map embed evidence"],
    ["socialEmbed", "social embed evidence"],
    ["formOrChatWidget", "form/chat widget evidence"],
    ["fontStaticResource", "lower-risk font/static resource evidence"],
    ["otherEmbeddedContent", "other embedded content evidence"]
  ];
  return purposeLabels.flatMap(([key, label]) => {
    const hosts = uniqueStrings([
      ...getStringArray(buckets[key]),
      ...getStringArray(buckets[toSnakeCase(key)])
    ]).slice(0, 3);
    return hosts.length > 0 ? [{ hosts, label }] : [];
  });
}

function toSnakeCase(value: string) {
  return value.replace(/[A-Z]/g, (match) => `_${match.toLowerCase()}`);
}

function formatEmbeddedPurposeParts(parts: Array<{ hosts: string[]; label: string }>) {
  return parts.map((part) => `${part.label} (${formatList(part.hosts) ?? "retained host"}`).join("), ") + ")";
}

function getEvidenceVendorNames(item: GdprEprivacyCoverageChecklistItem) {
  const evidence = getRetainedEvidenceRecord(item);
  return uniqueStrings([
    ...getStringArrayFromEvidenceKeys(evidence, [
      "advertisingRetargetingVendors",
      "advertising_retargeting_vendors",
      "advertisingVendors",
      "advertising_vendors",
      "retargetingBehavioralAdvertisingVendors",
      "retargeting_behavioral_advertising_vendors",
      "advertisingSharingVendors",
      "analyticsVendors",
      "analytics_vendors",
      "thirdPartyTrackingVendors",
      "third_party_tracking_vendors",
      "preconsent_tracker_vendors",
      "preConsentTrackerVendors",
      "runtime_vendors",
      "runtimeVendors",
      "vendors"
    ]),
    ...getNestedRecordStrings(evidence.preconsent_tracker_vendor_evidence, ["vendor", "vendorName", "vendor_name", "matched_vendor_name"]),
    ...getNestedRecordStrings(evidence.findingEntities, ["vendor", "vendorName", "vendor_name", "matched_vendor_name"])
  ]);
}

function getFirstEvidenceMs(item: GdprEprivacyCoverageChecklistItem) {
  const evidence = getRetainedEvidenceRecord(item);
  const direct = getFirstNumberFromRecord(evidence, [
    "firstObservedMs",
    "first_observed_ms",
    "firstSeenMs",
    "first_seen_ms",
    "firstRuntimeVendorObservedMs",
    "first_runtime_vendor_observed_ms",
    "firstPreConsentTrackingRequestMs",
    "first_pre_consent_tracking_request_ms",
    "firstPreconsentThirdPartyTrackingObservedMs",
    "first_preconsent_third_party_tracking_observed_ms",
    "firstPreConsentThirdPartyTrackingObservedMs",
    "first_pre_consent_third_party_tracking_observed_ms",
    "firstPreconsentCookieOrStorageObservedMs",
    "first_preconsent_cookie_or_storage_observed_ms",
    "firstPreConsentCookieOrStorageObservedMs",
    "first_pre_consent_cookie_or_storage_observed_ms",
    "firstAdvertisingRetargetingVendorObservedMs",
    "first_advertising_retargeting_vendor_observed_ms",
    "firstAdvertisingVendorObservedMs",
    "first_advertising_vendor_observed_ms",
    "firstRetargetingBehavioralAdvertisingVendorObservedMs",
    "first_retargeting_behavioral_advertising_vendor_observed_ms",
    "firstAnalyticsVendorObservedMs",
    "first_analytics_vendor_observed_ms",
    "firstSocialMediaEmbedObservedMs",
    "first_social_media_embed_observed_ms",
    "firstEmbeddedContentObservedMs",
    "first_embedded_content_observed_ms"
  ]);
  const nested = getFirstNumberFromRows([
    evidence.preconsent_tracker_vendor_evidence,
    evidence.representativeRequests,
    evidence.representative_requests,
    evidence.embeddedContentObservations,
    evidence.embedded_content_observations,
    evidence.socialMediaEmbedObservations,
    evidence.social_media_embed_observations,
    evidence.preConsentCookieExamples,
    evidence.pre_consent_cookie_examples
  ]);
  const textMs = getFirstMsFromText([
    item.criticalEvidence.statusBasis,
    item.note,
    item.explanation,
    ...getStringArrayFromEvidenceKeys(evidence, ["evidenceHighlights", "evidence_highlights"])
  ]);
  return minNumber([direct, nested, textMs]);
}

function getFirstNumberFromRecord(record: Record<string, unknown> | null, keys: string[]) {
  if (!record) {
    return null;
  }
  return minNumber(keys.map((key) => {
    const value = record[key];
    return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
  }));
}

function getFirstNumberFromRows(values: unknown[]) {
  const numbers = values.flatMap((value) => Array.isArray(value) ? value : []).flatMap((entry) => {
    const record = getRecord(entry);
    return record ? [getFirstNumberFromRecord(record, ["firstSeenMs", "first_seen_ms", "firstObservedMs", "first_observed_ms", "timestampMs", "timestamp_ms"])] : [];
  });
  return minNumber(numbers);
}

function getFirstMsFromText(values: Array<string | null | undefined>) {
  const numbers = values.flatMap((value) => {
    if (!value) {
      return [];
    }
    return [...value.matchAll(/(\d+(?:\.\d+)?)\s*ms\b/gi)].map((match) => Number(match[1])).filter((number) => Number.isFinite(number) && number >= 0);
  });
  return minNumber(numbers);
}

function minNumber(values: Array<number | null | undefined>) {
  const numbers = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0);
  return numbers.length > 0 ? Math.min(...numbers) : null;
}

function formatFirstSeenPhrase(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value)
    ? `first seen ${formatElapsedSeconds(value)} after scan start`
    : null;
}

function formatElapsedSeconds(value: number) {
  const seconds = Math.max(0, value) / 1000;
  return `${seconds.toPrecision(3)}s`;
}

function getConsentActionQualifier(item: GdprEprivacyCoverageChecklistItem) {
  return /consent action was not recorded|before consent action|before any recorded consent/i.test([
    item.criticalEvidence.statusBasis,
    item.note,
    item.explanation
  ].join(" "))
    ? "before any recorded consent action"
    : null;
}

function getPreConsentQualifier(item: GdprEprivacyCoverageChecklistItem) {
  return /pre[- ]consent|before consent|before any recorded consent/i.test([
    item.criticalEvidence.statusBasis,
    item.note,
    item.explanation,
    retainedText(item)
  ].join(" "))
    ? "before any recorded consent action"
    : null;
}

function extractQuotedButtonLabels(value: string | null | undefined) {
  if (!value) {
    return [];
  }
  return [...value.matchAll(/[“"']([^“"']{2,60}?)(?:[”"'])/g)].map((match) => match[1] ?? "").filter(Boolean);
}

function formatList(values: string[]) {
  const uniqueValues = uniqueStrings(values.map((value) => cleanEvidenceText(value)).filter(Boolean));
  if (uniqueValues.length === 0) {
    return null;
  }
  if (uniqueValues.length === 1) {
    return uniqueValues[0] ?? null;
  }
  if (uniqueValues.length === 2) {
    return `${uniqueValues[0]} and ${uniqueValues[1]}`;
  }
  return `${uniqueValues.slice(0, -1).join(", ")}, and ${uniqueValues.at(-1)}`;
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function joinRationaleParts(parts: Array<string | null | undefined>) {
  const cleanParts = uniqueStrings(parts.flatMap((part) => {
    const cleaned = part ? cleanEvidenceText(part).replace(/[.;]\s*$/g, "") : "";
    return cleaned ? [cleaned] : [];
  }));
  if (cleanParts.length === 0) {
    return "";
  }
  return `${cleanParts.join("; ")}.`;
}

function cleanEvidenceText(value: string) {
  return value
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:])/g, "$1")
    .trim();
}

function cleanPolicyExcerptStart(value: string) {
  const raw = value.trim();
  const startsWithUnsafeFragment =
    /^[.…]{1,3}[\p{L}\p{N}]/u.test(raw) ||
    /^[\p{Ll}\p{N}]/u.test(raw);
  const cleaned = cleanEvidenceText(raw.replace(/^[.…\s]+/u, "").replace(/^[^\p{L}\p{N}]+/u, ""));
  if (!startsWithUnsafeFragment) {
    return cleaned;
  }
  const firstWordBoundary = cleaned.search(/\s/u);
  return firstWordBoundary > 0 ? cleaned.slice(firstWordBoundary).trimStart() : cleaned;
}

function truncateSentence(value: string, maxLength: number) {
  const cleaned = cleanEvidenceText(value);
  return truncateWholeWord(cleaned, maxLength);
}

function truncateWholeWord(value: string, maxLength: number, suffix = "...") {
  const cleaned = cleanEvidenceText(value);
  if (cleaned.length <= maxLength) {
    return cleaned;
  }
  const hardLimit = Math.max(1, maxLength - suffix.length);
  const clipped = cleaned.slice(0, hardLimit).trimEnd();
  const lastSpace = clipped.lastIndexOf(" ");
  const wordSafeClip = lastSpace > Math.floor(hardLimit * 0.6)
    ? clipped.slice(0, lastSpace)
    : clipped;
  return `${wordSafeClip.replace(/[,:;.!?]+$/g, "").trimEnd()}${suffix}`;
}

function renderRationaleText(value: string | null | undefined) {
  const displayValue = typeof value === "string" && value.trim().length > 0
    ? value
    : "Retained scanner evidence was evaluated for this checklist row.";
  return displayValue.split(/("[^"]+")/g).map((part, index) => {
    if (part.startsWith("\"") && part.endsWith("\"")) {
      return (
        <span className="font-mono text-[0.86em] italic text-slate-700" key={`${index}:${part}`}>
          {part}
        </span>
      );
    }
    return <React.Fragment key={`${index}:${part}`}>{part}</React.Fragment>;
  });
}

function getStringArrayFromRetainedEvidence(item: GdprEprivacyCoverageChecklistItem, key: string) {
  const value = getRetainedEvidenceRecord(item)[key];
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    : [];
}

function hasQuantitativePostRejectReductionEvidence(item: GdprEprivacyCoverageChecklistItem) {
  const evidence = getRetainedEvidenceRecord(item);
  return [
    "trackingReductionPercent",
    "trackingReductionRatio",
    "nonEssentialTrackingReductionPercent",
    "baselineRequestCount",
    "postRejectRequestCount",
    "baselineTrackerCount",
    "postRejectTrackerCount"
  ].some((key) => typeof evidence[key] === "number" && Number.isFinite(evidence[key] as number));
}

function getGdprSectionSummary(input: {
  fallbackSummary: string;
  items: GdprEprivacyCoverageChecklistItem[];
  lensSummary?: string;
  reviewSummary: ReturnType<typeof deriveGdprEprivacyReviewSummary>;
  scoreSummary?: string;
}) {
  const primary = input.lensSummary ?? input.fallbackSummary;
  const scorePrefix = input.scoreSummary ? `${input.scoreSummary} ` : "";
  return `${scorePrefix}${primary} ${input.reviewSummary.coverageText} ${input.reviewSummary.priorityReviewText} Review retained evidence for ${getGdprReviewedAreas(input.items)}.`;
}

function getGdprReviewedAreas(items: GdprEprivacyCoverageChecklistItem[]) {
  const rowIds = new Set(items.map((item) => item.id));
  const areas = [
    rowIds.has("pre_consent_cookies_storage") || rowIds.has("pre_consent_third_party_tracking")
      ? "pre-consent storage and tracking"
      : null,
    rowIds.has("consent_surface_observed") ? "consent surface evidence" : null,
    rowIds.has("reject_all_path_availability") ? "refusal path availability" : null,
    rowIds.has("accept_consent_control") ? "accept consent control availability" : null,
    rowIds.has("options_settings_preferences_control") ? "options/settings/preferences control availability" : null,
    rowIds.has("post_reject_tracking_reduction") ? "deferred refusal-path tracking evidence" : null,
    rowIds.has("preference_withdrawal_control") ? "withdrawal or preference-control evidence" : null,
    rowIds.has("sensitive_surfaces_third_party_tracking") ? "sensitive-surface tracking context" : null,
    rowIds.has("session_replay_fingerprinting_review") ||
      rowIds.has("session_replay_before_consent") ||
      rowIds.has("session_replay_disclosure_alignment") ||
      rowIds.has("session_replay_sensitive_surface") ||
      rowIds.has("session_replay_after_refusal")
      ? "session replay and fingerprinting context"
      : null,
    rowIds.has("cross_border_endpoint_review") ? "cross-border analytics/tracking endpoint context" : null,
    rowIds.has("accessibility_consent_controls") ? "consent-control accessibility" : null,
  ].filter((area): area is string => Boolean(area));

  return areas.length > 0 ? areas.join(", ") : "the available GDPR/ePrivacy checklist rows";
}

function RowToolButton({
  active,
  icon,
  label,
  onClick
}: {
  active: boolean;
  icon: "correction" | "evidence" | "review";
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={label}
      aria-pressed={active}
      className={cn(
        "scan-report-button group/tool inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
        active
          ? icon === "evidence"
            ? "border-sky-300 bg-sky-50 text-sky-700 shadow-sm"
            : icon === "correction"
              ? "border-emerald-300 bg-emerald-50 text-emerald-700 shadow-sm"
              : "border-indigo-300 bg-indigo-50 text-indigo-700 shadow-sm"
          : "border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-800"
      )}
      title={label}
      type="button"
      onClick={onClick}
    >
      {icon === "evidence" ? <EvidenceToolIcon /> : icon === "correction" ? <CorrectionToolIcon /> : <PolicyReviewToolIcon />}
    </button>
  );
}

function PolicyReviewToolIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 20 20">
      <path
        d="M8.7 13.1a4.4 4.4 0 1 0 0-8.8 4.4 4.4 0 0 0 0 8.8Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
      <path d="m12 12 3.7 3.7" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" />
      <path d="M6.9 8.6h3.6M8.7 6.8v3.6" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5" />
    </svg>
  );
}

function EvidenceToolIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 20 20">
      <path d="M5.2 2.8h6.1l3.5 3.5v10.9H5.2V2.8Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.7" />
      <path d="M11.2 2.9v3.6h3.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" />
      <path d="m8 9-1.5 1.5L8 12" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6" />
      <path d="m12 9 1.5 1.5L12 12" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6" />
      <path d="M10.6 8.6 9.4 12.4" stroke="currentColor" strokeLinecap="round" strokeWidth="1.6" />
    </svg>
  );
}

function CorrectionToolIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 20 20">
      <path
        d="M5.8 2.9 9 6.1 7.1 8 3.9 4.8 2.4 7.4l3.7 3.7 2.4-.6 6.6 6.6a1.8 1.8 0 0 0 2.5-2.5L11 8l.6-2.4-3.7-3.7-2.1 1Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
      <path d="M15 15.2h.1" stroke="currentColor" strokeLinecap="round" strokeWidth="2.4" />
    </svg>
  );
}

function PolicyExcerptModal({
  onClose,
  payload
}: {
  onClose: () => void;
  payload: PolicyReviewPayload;
}) {
  const isNotConfirmed = payload.evidenceLabel === "Not confirmed";
  const highlightedPolicyHtml = renderHighlightedPolicyHtml(payload.capturedText, payload.snippets);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-3 py-4 sm:px-6">
      <div
        aria-labelledby="policy-excerpt-modal-title"
        aria-modal="true"
        className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-slate-50 shadow-2xl"
        role="dialog"
      >
        <style>{`
          .policy-excerpt-modal .legend-item.policy-highlight-color-1 span, .policy-excerpt-modal .policy-highlight-marker.policy-highlight-color-1 { background: ${isNotConfirmed ? "#fdba74" : "#fef08a"}; color: ${isNotConfirmed ? "#7c2d12" : "#713f12"}; }
          .policy-excerpt-modal .legend-item.policy-highlight-color-2 span, .policy-excerpt-modal .policy-highlight-marker.policy-highlight-color-2 { background: #bfdbfe; color: #1e3a8a; }
          .policy-excerpt-modal .legend-item.policy-highlight-color-3 span, .policy-excerpt-modal .policy-highlight-marker.policy-highlight-color-3 { background: #d9f99d; color: #365314; }
          .policy-excerpt-modal .legend-item.policy-highlight-color-4 span, .policy-excerpt-modal .policy-highlight-marker.policy-highlight-color-4 { background: #fecdd3; color: #881337; }
          .policy-excerpt-modal .legend-item.policy-highlight-color-5 span, .policy-excerpt-modal .policy-highlight-marker.policy-highlight-color-5 { background: #ddd6fe; color: #4c1d95; }
          .policy-excerpt-modal .legend-item.policy-highlight-color-6 span, .policy-excerpt-modal .policy-highlight-marker.policy-highlight-color-6 { background: #fed7aa; color: #7c2d12; }
          .policy-excerpt-modal mark.policy-highlight { position: relative; border-radius: 5px; color: inherit; box-decoration-break: clone; -webkit-box-decoration-break: clone; padding: 0 2px; }
          .policy-excerpt-modal mark.policy-highlight-color-1 { background: ${isNotConfirmed ? "#fdba74" : "#fef08a"}; box-shadow: 0 0 0 2px ${isNotConfirmed ? "#fdba74" : "#fef08a"}; }
          .policy-excerpt-modal mark.policy-highlight-color-2 { background: #bfdbfe; box-shadow: 0 0 0 2px #bfdbfe; }
          .policy-excerpt-modal mark.policy-highlight-color-3 { background: #d9f99d; box-shadow: 0 0 0 2px #d9f99d; }
          .policy-excerpt-modal mark.policy-highlight-color-4 { background: #fecdd3; box-shadow: 0 0 0 2px #fecdd3; }
          .policy-excerpt-modal mark.policy-highlight-color-5 { background: #ddd6fe; box-shadow: 0 0 0 2px #ddd6fe; }
          .policy-excerpt-modal mark.policy-highlight-color-6 { background: #fed7aa; box-shadow: 0 0 0 2px #fed7aa; }
          .policy-excerpt-modal .policy-highlight-marker { display: inline-flex; width: 17px; height: 17px; align-items: center; justify-content: center; border-radius: 999px; margin-right: 5px; transform: translateY(-1px); font-size: 10px; font-weight: 800; line-height: 1; }
        `}</style>
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-5 py-4">
          <div className="min-w-0 space-y-1">
            <h2 id="policy-excerpt-modal-title" className="text-xl font-semibold tracking-normal text-slate-950">
              Excerpt from Privacy Policy
            </h2>
            <p className="text-sm leading-6 text-slate-600">
              <span className="font-semibold text-slate-700">Finding:</span> {payload.findingLabel}
            </p>
            {payload.sourceUrl ? (
              <p className="break-all text-sm leading-6 text-slate-600">
                <span className="font-semibold text-slate-700">Source URL:</span> {payload.sourceUrl}
              </p>
            ) : null}
          </div>
          <button
            aria-label="Close policy excerpt"
            className="scan-report-button inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-slate-500 hover:text-slate-900"
            type="button"
            onClick={onClose}
          >
            <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 20 20">
              <path d="m5.5 5.5 9 9M14.5 5.5l-9 9" stroke="currentColor" strokeLinecap="round" strokeWidth="1.9" />
            </svg>
          </button>
        </div>
        <div className="policy-excerpt-modal min-h-0 flex-1 overflow-y-auto px-5 py-5">
          <div className="mx-auto max-w-5xl">
            <p className="mb-4 text-sm leading-6 text-slate-600">
              Scanner evidence captured at scan time, not a live fetch of the current policy page.
            </p>
            {isNotConfirmed ? (
              <p className="mb-4 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-sm leading-6 text-orange-900">
                <span className="font-semibold">Not Confirmed:</span> this retained snippet requires manual review before relying on it.
              </p>
            ) : null}
            <div className="mb-6 flex flex-wrap gap-2">
              {payload.snippets.map((snippet, index) => (
                <span
                  key={`${snippet.label}-${index}`}
                  className={cn(
                    "legend-item inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700",
                    `policy-highlight-color-${(index % 6) + 1}`
                  )}
                >
                  <span className="inline-flex h-[18px] w-[18px] items-center justify-center rounded-full text-[11px]">
                    {index + 1}
                  </span>
                  {snippet.label}
                </span>
              ))}
            </div>
            <article
              className="whitespace-pre-wrap break-words rounded-lg border border-slate-200 bg-white p-5 text-[15px] leading-7 text-slate-950 shadow-sm"
              dangerouslySetInnerHTML={{ __html: highlightedPolicyHtml }}
            />
            <p className="mt-4 text-xs leading-5 text-slate-400">
              CertScore.ai can make mistakes. Verify findings before relying on them.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function ChecklistRows({
  allowPolicyReview,
  expandAllAdvancedEvidence,
  items,
  onOpenPolicyReview,
  showDebugConfidenceImprovements
}: {
  allowPolicyReview?: boolean;
  expandAllAdvancedEvidence: boolean;
  items: GdprEprivacyCoverageChecklistItem[];
  onOpenPolicyReview: (payload: PolicyReviewPayload) => void;
  showDebugConfidenceImprovements: boolean;
}) {
  const [openToolsByRow, setOpenToolsByRow] = React.useState<Record<string, RowToolState>>({});
  React.useEffect(() => {
    setOpenToolsByRow({});
  }, [expandAllAdvancedEvidence]);
  const toggleRowTool = (rowId: string, tool: keyof RowToolState) => {
    setOpenToolsByRow((current) => ({
      ...current,
      [rowId]: {
        ...current[rowId],
        [tool]: !current[rowId]?.[tool]
      }
    }));
  };

  return (
    <div className="divide-y divide-slate-200">
      {items.map((item) => {
        const evidenceLabel = getEvidenceLabel(item);
        const assessmentDirection = getAssessmentDirection(item);
        const rowRationale = getChecklistRowRationale(item);
        const rowToolState = openToolsByRow[item.id] ?? {};
        const evidenceOpen = expandAllAdvancedEvidence || Boolean(rowToolState.evidence);
        const correctionOpen = expandAllAdvancedEvidence || Boolean(rowToolState.correction);
        const policyReviewPayload = getGdprTransparencyPolicyReviewPayload(item);
        const showPolicyReview =
          allowPolicyReview === true &&
          (evidenceLabel === "Observed" || evidenceLabel === "Not confirmed") &&
          policyReviewPayload !== null;
        return (
          <div
            key={item.id}
            className="grid grid-cols-1 gap-3 px-4 py-3 text-sm md:grid-cols-[minmax(13rem,0.8fr)_minmax(0,1.5fr)]"
          >
            <div className="min-w-0 space-y-2">
              <div className="flex items-start gap-3">
                <CoverageStatusGlyph direction={assessmentDirection} evidenceLabel={evidenceLabel} />
                <div className="min-w-0 space-y-1.5">
                  <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                    <p className="min-w-0 font-medium text-slate-950">{item.label}</p>
                    <span
                      className={cn(
                        "inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.1em]",
                        getEvidenceLabelBadgeClasses(evidenceLabel)
                      )}
                    >
                      {evidenceLabel}
                    </span>
                  </div>
                  <DebugConfidenceSummary item={item} showImprovements={showDebugConfidenceImprovements} />
                </div>
              </div>
            </div>
            <div className="min-w-0 space-y-1">
              <div className="hidden items-start gap-2 md:flex">
                <div className="flex shrink-0 items-center gap-1 pt-0.5">
                  {showPolicyReview ? (
                    <RowToolButton
                      active={false}
                      icon="review"
                      label={`Open captured privacy policy for ${item.label}`}
                      onClick={() => {
                        if (policyReviewPayload) {
                          onOpenPolicyReview(policyReviewPayload);
                        }
                      }}
                    />
                  ) : null}
                  <RowToolButton
                    active={evidenceOpen}
                    icon="evidence"
                    label={`Toggle evidence packet for ${item.label}`}
                    onClick={() => toggleRowTool(item.id, "evidence")}
                  />
                  <RowToolButton
                    active={correctionOpen}
                    icon="correction"
                    label={`Toggle correction steps for ${item.label}`}
                    onClick={() => toggleRowTool(item.id, "correction")}
                  />
                </div>
                <p className="line-clamp-2 min-w-0 text-sm leading-6 text-slate-600">{renderRationaleText(rowRationale)}</p>
              </div>
              <div className="flex items-start gap-2 md:hidden">
                <div className="flex shrink-0 items-center gap-1 pt-0.5">
                  {showPolicyReview ? (
                    <RowToolButton
                      active={false}
                      icon="review"
                      label={`Open captured privacy policy for ${item.label}`}
                      onClick={() => {
                        if (policyReviewPayload) {
                          onOpenPolicyReview(policyReviewPayload);
                        }
                      }}
                    />
                  ) : null}
                  <RowToolButton
                    active={evidenceOpen}
                    icon="evidence"
                    label={`Toggle evidence packet for ${item.label}`}
                    onClick={() => toggleRowTool(item.id, "evidence")}
                  />
                  <RowToolButton
                    active={correctionOpen}
                    icon="correction"
                    label={`Toggle correction steps for ${item.label}`}
                    onClick={() => toggleRowTool(item.id, "correction")}
                  />
                </div>
                <p className="line-clamp-2 min-w-0 text-xs leading-5 text-slate-500">{renderRationaleText(rowRationale)}</p>
              </div>
              {evidenceOpen ? (
                <details className="mt-2 rounded-md border border-slate-200 bg-white" open>
                  <summary className="cursor-pointer px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500">
                    Evidence packet
                  </summary>
                  <div className="max-h-[50vh] overflow-y-auto">
                    <RegulatoryChecklistEvidenceDetails evidenceRefs={getDisplayEvidenceRefs(item)} jsonPayload={stringifyEvidenceJson(item)} />
                  </div>
                </details>
              ) : null}
              {correctionOpen ? (
                <RegulatoryChecklistCorrectionSteps
                  defaultOpen
                  jsonPayload={stringifyEvidenceJson(item)}
                />
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function GdprEprivacyCoverageChecklistCard({
  defaultOpen = true,
  gdprEprivacyLens,
  items,
  showDebugConfidenceImprovements = true,
  showSummaryStrip = true
}: GdprEprivacyCoverageChecklistCardProps) {
  const { expandAllAdvancedEvidence } = useRegulatoryChecklistAdvancedEvidence();
  const [policyReviewPayload, setPolicyReviewPayload] = React.useState<PolicyReviewPayload | null>(null);
  const reportItems = getReportableGdprEprivacyCoverageItems(items);
  const itemsById = new Map(reportItems.map((item) => [item.id, item]));
  const groupedRowIds = new Set<string>(REPORT_ROW_GROUPS.flatMap((group) => [...group.rowIds]));
  const groupedSections = REPORT_ROW_GROUPS.map((group) => ({
    ...group,
    items: group.rowIds.flatMap((rowId) => itemsById.get(rowId) ?? [])
  })).filter((group) => group.items.length > 0);
  const additionalItems = reportItems.filter((item) => !groupedRowIds.has(item.id));
  const checklistScore = deriveRegulatoryCoverageScore({ framework: "gdpr_eprivacy", rows: reportItems });
  const reviewSummary = deriveGdprEprivacyReviewSummary(reportItems);
  const gdprSectionSummary =
    getGdprSectionSummary({
      fallbackSummary: `${reviewSummary.coverageText} ${reviewSummary.priorityReviewText}`,
      items: reportItems,
      lensSummary: gdprEprivacyLens?.summary,
      reviewSummary,
      scoreSummary: checklistScore.summary
    });

  return (
    <CollapsibleSectionCard
      collapsible={false}
      defaultOpen={defaultOpen}
      showChevron={false}
      title={getGdprSummaryTitle({
        items: reportItems,
        summary: gdprSectionSummary
      })}
      contentClassName="space-y-3 px-4 pb-4"
      summaryClassName="px-4 py-4"
    >
      {showSummaryStrip ? <ChecklistRowSummaryStrip items={reportItems} /> : null}
      {groupedSections.map((group) => (
        <div key={group.title} className="overflow-hidden rounded-lg border border-slate-200">
          <div className="grid grid-cols-1 gap-3 border-b border-slate-200 bg-slate-50 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 md:grid-cols-[minmax(13rem,0.8fr)_minmax(0,1.5fr)]">
            <span>{group.title}</span>
            <span className="hidden md:block">Scan-context note</span>
          </div>
          <ChecklistRows
            allowPolicyReview={group.title === "GDPR Transparency"}
            expandAllAdvancedEvidence={expandAllAdvancedEvidence}
            items={group.items}
            onOpenPolicyReview={setPolicyReviewPayload}
            showDebugConfidenceImprovements={showDebugConfidenceImprovements}
          />
        </div>
      ))}
      {additionalItems.length > 0 ? (
        <div className="overflow-hidden rounded-lg border border-slate-200">
          <ChecklistRows
            expandAllAdvancedEvidence={expandAllAdvancedEvidence}
            items={additionalItems}
            onOpenPolicyReview={setPolicyReviewPayload}
            showDebugConfidenceImprovements={showDebugConfidenceImprovements}
          />
        </div>
      ) : null}
      {policyReviewPayload ? (
        <PolicyExcerptModal
          payload={policyReviewPayload}
          onClose={() => setPolicyReviewPayload(null)}
        />
      ) : null}
    </CollapsibleSectionCard>
  );
}
