import type { MergedPolicyExtraction, PolicyChunkExtraction, PolicyPageType, PolicyRulePreprocessResult } from "./types";

function clampSummary(text: string | null, maxLength = 280) {
  if (!text) {
    return null;
  }

  return text.length <= maxLength ? text : text.slice(0, maxLength).trim();
}

function median(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const midpoint = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[midpoint - 1]! + sorted[midpoint]!) / 2 : sorted[midpoint]!;
}

function dedupeListWithConfidence<T extends { confidence: number }>(
  items: T[],
  getKey: (item: T) => string,
  threshold: number
) {
  const grouped = new Map<string, T[]>();

  for (const item of items) {
    const key = getKey(item);
    grouped.set(key, [...(grouped.get(key) ?? []), item]);
  }

  return [...grouped.entries()]
    .map(([, group]) => {
      const best = group.reduce((winner, item) => (item.confidence > winner.confidence ? item : winner), group[0]!);
      const score = median(group.map((item) => item.confidence));
      return {
        ...best,
        confidence: Math.max(best.confidence, score)
      };
    })
    .filter((item) => item.confidence >= threshold);
}

function mergeEnumField<T extends string | boolean | null>(input: {
  chunks: Array<{ confidence: number; value: T }>;
  defaultValue: T;
  highThreshold: number;
  moderateThreshold: number;
}) {
  const nonNull = input.chunks.filter((chunk) => chunk.value !== null);
  if (nonNull.length === 0) {
    return {
      confidence: 0,
      value: input.defaultValue
    };
  }
  const high = nonNull.find((chunk) => chunk.confidence >= input.highThreshold);
  if (high) {
    return high;
  }

  const grouped = new Map<string, Array<{ confidence: number; value: T }>>();
  for (const chunk of nonNull) {
    const key = String(chunk.value);
    grouped.set(key, [...(grouped.get(key) ?? []), chunk]);
  }

  const winner = [...grouped.values()].sort((left, right) => {
    if (right.length !== left.length) {
      return right.length - left.length;
    }

    return median(right.map((entry) => entry.confidence)) - median(left.map((entry) => entry.confidence));
  })[0];

  if (!winner) {
    return {
      confidence: 0,
      value: input.defaultValue
    };
  }

  const winnerMedian = median(winner.map((entry) => entry.confidence));
  return winnerMedian >= input.moderateThreshold
    ? {
        confidence: winnerMedian,
        value: winner[0]!.value
      }
    : {
        confidence: winnerMedian,
        value: input.defaultValue
      };
}

function buildPolicyFieldCoverage(input: {
  pageType: PolicyPageType;
  ruleResult: PolicyRulePreprocessResult;
  policySemanticConfidence: number;
  merged: {
    policyEffectiveDate: string | null;
    policyGoverningLaw: string | null;
    policyArbitrationPresent: boolean | null;
    policyDsarMechanism: string;
    policyDoNotSell: string;
    privacyContactChannelType: string | null;
    policyRetentionPeriods: Array<{ periodText: string }>;
    policyRetentionDisclosure: string | null;
    policyTransferMechanisms: Array<{ mechanism: string }>;
    policyNoticeContactPresent: boolean | null;
    policyTerminationOrSuspensionPresent: boolean | null;
    policyCancellationOrRefundPresent: boolean | null;
    policyCookieDisclosures: Array<{ cookieName: string | null; provider: string | null; duration: string | null; purpose: string | null }>;
  };
}) {
  const baseConfidence = input.policySemanticConfidence > 0 ? input.policySemanticConfidence : null;
  const fields: Record<string, { confidence: number | null; found: boolean; snippetKey: string | null }> = {};

  if (input.pageType === "terms_of_service") {
    fields.effective_date = {
      confidence: input.merged.policyEffectiveDate ? baseConfidence : null,
      found: Boolean(input.merged.policyEffectiveDate),
      snippetKey: "effective_date"
    };
    fields.governing_law = {
      confidence: input.merged.policyGoverningLaw ? baseConfidence : null,
      found: Boolean(input.merged.policyGoverningLaw),
      snippetKey: "governing_law"
    };
    fields.arbitration = {
      confidence: input.merged.policyArbitrationPresent ? baseConfidence : null,
      found: input.merged.policyArbitrationPresent === true,
      snippetKey: "arbitration"
    };
    fields.notice_contact = {
      confidence: input.merged.policyNoticeContactPresent ? baseConfidence : null,
      found: input.merged.policyNoticeContactPresent === true,
      snippetKey: "notice_contact"
    };
    fields.termination_or_suspension = {
      confidence: input.merged.policyTerminationOrSuspensionPresent ? baseConfidence : null,
      found: input.merged.policyTerminationOrSuspensionPresent === true,
      snippetKey: "termination"
    };
    fields.cancellation_or_refund = {
      confidence: input.merged.policyCancellationOrRefundPresent ? baseConfidence : null,
      found: input.merged.policyCancellationOrRefundPresent === true,
      snippetKey: "cancellation_refund"
    };
  } else if (input.pageType === "cookie_policy") {
    fields.cookie_rows = {
      confidence: input.merged.policyCookieDisclosures.length > 0 ? baseConfidence : null,
      found: input.merged.policyCookieDisclosures.length > 0,
      snippetKey: input.merged.policyCookieDisclosures[0]?.cookieName ? `cookie:${input.merged.policyCookieDisclosures[0].cookieName.toLowerCase()}` : null
    };
    fields.cookie_duration = {
      confidence: input.merged.policyCookieDisclosures.some((item) => Boolean(item.duration)) ? baseConfidence : null,
      found: input.merged.policyCookieDisclosures.some((item) => Boolean(item.duration)),
      snippetKey: input.merged.policyCookieDisclosures[0]?.cookieName ? `cookie:${input.merged.policyCookieDisclosures[0].cookieName.toLowerCase()}` : null
    };
    fields.cookie_provider = {
      confidence: input.merged.policyCookieDisclosures.some((item) => Boolean(item.provider)) ? baseConfidence : null,
      found: input.merged.policyCookieDisclosures.some((item) => Boolean(item.provider)),
      snippetKey: input.merged.policyCookieDisclosures[0]?.provider ? `cookie-provider:${input.merged.policyCookieDisclosures[0].provider.toLowerCase()}` : null
    };
  } else {
    fields.dsar_path = {
      confidence: input.merged.policyDsarMechanism !== "unknown" ? baseConfidence : null,
      found: input.merged.policyDsarMechanism === "present" || input.merged.policyDsarMechanism === "partial",
      snippetKey: "dsar"
    };
    fields.privacy_contact = {
      confidence: input.merged.privacyContactChannelType && input.merged.privacyContactChannelType !== "none" ? baseConfidence : null,
      found: Boolean(input.merged.privacyContactChannelType && input.merged.privacyContactChannelType !== "none"),
      snippetKey: "dsar"
    };
    fields.do_not_sell = {
      confidence: input.merged.policyDoNotSell !== "unknown" ? baseConfidence : null,
      found: input.merged.policyDoNotSell === "present_link" || input.merged.policyDoNotSell === "present_text",
      snippetKey: "do_not_sell"
    };
    fields.retention = {
      confidence:
        input.merged.policyRetentionDisclosure !== "none" || input.merged.policyRetentionPeriods.length > 0 ? baseConfidence : null,
      found: input.merged.policyRetentionDisclosure !== "none" || input.merged.policyRetentionPeriods.length > 0,
      snippetKey: "retention"
    };
    fields.third_party_sharing = {
      confidence:
        input.merged.policyTransferMechanisms.length > 0 || input.ruleResult.mentions.some((item) => item.topic === "cross_border_transfer")
          ? baseConfidence
          : null,
      found:
        input.merged.policyTransferMechanisms.length > 0 || input.ruleResult.mentions.some((item) => item.topic === "cross_border_transfer"),
      snippetKey: "transfer:SCC"
    };
  }

  const coverageEntries = Object.values(fields);
  const foundCount = coverageEntries.filter((entry) => entry.found).length;
  const ratio = coverageEntries.length > 0 ? foundCount / coverageEntries.length : 0;
  const snippetCount = Object.keys(input.ruleResult.evidenceSnippets).length;
  const structurallyWeak =
    snippetCount === 0 ||
    ratio < 0.5 ||
    input.policySemanticConfidence < 0.6 ||
    input.ruleResult.actionableFlags.includes("low_confidence") ||
    input.ruleResult.actionableFlags.includes("llm_provider_error");

  return {
    fields,
    policyCoverageRatio: ratio,
    policySnippetCount: snippetCount,
    policyStructurallyWeak: structurallyWeak
  };
}

export function mergePolicyChunkExtractions(input: {
  chunkExtractions: PolicyChunkExtraction[];
  highThreshold: number;
  moderateThreshold: number;
  pageType?: PolicyPageType;
  ruleResult: PolicyRulePreprocessResult;
}): MergedPolicyExtraction {
  const pageType = input.pageType ?? "privacy_policy";
  const isTermsPage = pageType === "terms_of_service";
  const effectiveDate = mergeEnumField({
    chunks: input.chunkExtractions.map((chunk) => chunk.effectiveDate),
    defaultValue: input.ruleResult.updateDate,
    highThreshold: input.highThreshold,
    moderateThreshold: input.moderateThreshold
  });
  const governingLaw = mergeEnumField({
    chunks: input.chunkExtractions.map((chunk) => chunk.governingLaw),
    defaultValue: input.ruleResult.governingLaw,
    highThreshold: input.highThreshold,
    moderateThreshold: input.moderateThreshold
  });
  const arbitrationPresent = mergeEnumField({
    chunks: input.chunkExtractions.map((chunk) => chunk.arbitrationPresent),
    defaultValue: input.ruleResult.arbitrationPresent,
    highThreshold: input.highThreshold,
    moderateThreshold: input.moderateThreshold
  });
  const mentionsGdpr = mergeEnumField({
    chunks: input.chunkExtractions.map((chunk) => chunk.mentionsGdpr),
    defaultValue: null,
    highThreshold: input.highThreshold,
    moderateThreshold: input.moderateThreshold
  });
  const dsarMechanism = mergeEnumField({
    chunks: input.chunkExtractions.map((chunk) => chunk.dsarMechanism),
    defaultValue: input.ruleResult.dsarMechanism,
    highThreshold: input.highThreshold,
    moderateThreshold: input.moderateThreshold
  });
  const dataAccessRequestPresent = mergeEnumField({
    chunks: input.chunkExtractions.map((chunk) => chunk.dataAccessRequestPresent),
    defaultValue: input.ruleResult.dataAccessRequestPresent,
    highThreshold: input.highThreshold,
    moderateThreshold: input.moderateThreshold
  });
  const dataDeletionRequestPresent = mergeEnumField({
    chunks: input.chunkExtractions.map((chunk) => chunk.dataDeletionRequestPresent),
    defaultValue: input.ruleResult.dataDeletionRequestPresent,
    highThreshold: input.highThreshold,
    moderateThreshold: input.moderateThreshold
  });
  const privacyContactChannelType = mergeEnumField({
    chunks: input.chunkExtractions.map((chunk) => chunk.privacyContactChannelType),
    defaultValue: input.ruleResult.privacyContactChannelType,
    highThreshold: input.highThreshold,
    moderateThreshold: input.moderateThreshold
  });
  const retentionDisclosure = mergeEnumField({
    chunks: input.chunkExtractions.map((chunk) => chunk.retentionDisclosure),
    defaultValue: input.ruleResult.retentionDisclosure,
    highThreshold: input.highThreshold,
    moderateThreshold: input.moderateThreshold
  });
  const doNotSell = mergeEnumField({
    chunks: input.chunkExtractions.map((chunk) => chunk.doNotSell),
    defaultValue: input.ruleResult.doNotSell,
    highThreshold: input.highThreshold,
    moderateThreshold: input.moderateThreshold
  });
  const childrenReference = mergeEnumField({
    chunks: input.chunkExtractions.map((chunk) => chunk.childrenReference),
    defaultValue: input.ruleResult.childrenReference,
    highThreshold: input.highThreshold,
    moderateThreshold: input.moderateThreshold
  });
  const policyClaimNoSale = mergeEnumField({
    chunks: input.chunkExtractions.map((chunk) => chunk.policyClaimNoSale),
    defaultValue: input.ruleResult.policyClaimNoSale,
    highThreshold: input.highThreshold,
    moderateThreshold: input.moderateThreshold
  });
  const policyClaimNoTracking = mergeEnumField({
    chunks: input.chunkExtractions.map((chunk) => chunk.policyClaimNoTracking),
    defaultValue: input.ruleResult.policyClaimNoTracking,
    highThreshold: input.highThreshold,
    moderateThreshold: input.moderateThreshold
  });
  const policyClaimPrivacyProtective = mergeEnumField({
    chunks: input.chunkExtractions.map((chunk) => chunk.policyClaimPrivacyProtective),
    defaultValue: input.ruleResult.policyClaimPrivacyProtective,
    highThreshold: input.highThreshold,
    moderateThreshold: input.moderateThreshold
  });
  const dataCategories = dedupeListWithConfidence(
    input.chunkExtractions.flatMap((chunk) => chunk.dataCategories.map((item) => ({ ...item, category: item.value }))),
    (item) => item.category,
    input.moderateThreshold
  ).map((item) => ({
    category: item.category,
    confidence: item.confidence,
    snippet: item.snippet
  }));
  const retentionStatements = dedupeListWithConfidence(
    input.chunkExtractions.flatMap((chunk) => chunk.retentionStatements),
    (item) => `${item.category}:${item.periodText}`,
    input.moderateThreshold
  );
  const policyCookieDisclosures = input.ruleResult.cookieDisclosures ?? [];
  const transferMechanisms = dedupeListWithConfidence(
    input.chunkExtractions.flatMap((chunk) => chunk.transferMechanisms),
    (item) => item.mechanism,
    input.moderateThreshold
  );
  const summaryCandidates = input.chunkExtractions
    .filter((chunk) => chunk.summary.text)
    .sort((left, right) => right.summary.confidence - left.summary.confidence);
  const policySummaryShort = summaryCandidates[0]?.summary.text
    ? summaryCandidates[1]?.summary.text && summaryCandidates[1].summary.text !== summaryCandidates[0].summary.text
      ? clampSummary(`${summaryCandidates[0].summary.text} — ${summaryCandidates[1].summary.text}`)
      : clampSummary(summaryCandidates[0].summary.text)
    : clampSummary(input.ruleResult.summary);
  const ambiguitySeed = isTermsPage
    ? (governingLaw.confidence < input.moderateThreshold ? 18 : 0) +
      (arbitrationPresent.confidence < input.moderateThreshold ? 18 : 0) +
      (effectiveDate.confidence < input.moderateThreshold ? 12 : 0)
    : (input.ruleResult.actionableFlags.includes("vague_policy_language") ? 18 : 0) +
      (dsarMechanism.confidence < input.moderateThreshold ? 16 : 0) +
      (doNotSell.confidence < input.moderateThreshold ? 16 : 0) +
      (retentionStatements.length === 0 && input.ruleResult.mentions.some((mention) => mention.topic === "data_retention") ? 18 : 0);
  const policyMentions = [
    ...input.ruleResult.mentions,
    ...(mentionsGdpr.value ? [{ topic: "gdpr", confidence: mentionsGdpr.confidence }] : []),
    ...(transferMechanisms.length > 0 ? [{ topic: "cross_border_transfer", confidence: median(transferMechanisms.map((item) => item.confidence)) }] : [])
  ].reduce<Array<{ confidence: number; topic: string }>>((accumulator, item) => {
    if (accumulator.some((existing) => existing.topic === item.topic)) {
      return accumulator.map((existing) =>
        existing.topic === item.topic ? { ...existing, confidence: Math.max(existing.confidence, item.confidence) } : existing
      );
    }

    return [...accumulator, item];
  }, []);
  const policySemanticConfidence = median(
    (
      isTermsPage
        ? [
            input.ruleResult.semanticConfidence,
            effectiveDate.confidence,
            governingLaw.confidence,
            arbitrationPresent.confidence
          ]
        : [
            input.ruleResult.semanticConfidence,
            mentionsGdpr.confidence,
            dsarMechanism.confidence,
            dataAccessRequestPresent.confidence,
            dataDeletionRequestPresent.confidence,
            privacyContactChannelType.confidence,
            retentionDisclosure.confidence,
            doNotSell.confidence,
            policyClaimNoSale.confidence,
            policyClaimNoTracking.confidence,
            policyClaimPrivacyProtective.confidence,
            childrenReference.confidence,
            ...dataCategories.map((item) => item.confidence),
            ...retentionStatements.map((item) => item.confidence),
            ...transferMechanisms.map((item) => item.confidence)
          ]
    ).filter((value) => value > 0)
  );
  const policyFieldCoverage = buildPolicyFieldCoverage({
    pageType,
    policySemanticConfidence,
    ruleResult: input.ruleResult,
    merged: {
      policyArbitrationPresent: arbitrationPresent.value,
      policyCancellationOrRefundPresent: input.ruleResult.cancellationOrRefundPresent,
      policyCookieDisclosures,
      policyDsarMechanism: dsarMechanism.value,
      policyDoNotSell: doNotSell.value,
      policyEffectiveDate: effectiveDate.value ?? input.ruleResult.updateDate,
      policyGoverningLaw: governingLaw.value ?? input.ruleResult.governingLaw,
      policyNoticeContactPresent: input.ruleResult.noticeContactPresent,
      policyRetentionDisclosure: retentionDisclosure.value ?? input.ruleResult.retentionDisclosure,
      policyRetentionPeriods: retentionStatements.length > 0 ? retentionStatements : input.ruleResult.retentionStatements,
      policyTerminationOrSuspensionPresent: input.ruleResult.terminationOrSuspensionPresent,
      policyTransferMechanisms: transferMechanisms.length > 0 ? transferMechanisms : input.ruleResult.transferMechanisms,
      privacyContactChannelType: privacyContactChannelType.value ?? input.ruleResult.privacyContactChannelType
    }
  });

  return {
    policyActionableFlags: Array.from(
      new Set([
        ...input.ruleResult.actionableFlags.filter((flag) => flag !== "arbitration_clause_present"),
        ...(arbitrationPresent.value ? ["arbitration_clause_present"] : []),
        ...(policySemanticConfidence < input.moderateThreshold ? ["low_confidence"] : []),
        ...(!isTermsPage && dsarMechanism.value !== "present" ? ["missing_dsar"] : [])
      ])
    ),
    policyAmbiguityScore: Math.max(0, Math.min(100, Math.round(ambiguitySeed))),
    policyArbitrationPresent: arbitrationPresent.value,
    policyChildrenReference: childrenReference.value ?? input.ruleResult.childrenReference,
    policyCookieDisclosures: policyCookieDisclosures.map((item) => ({
      confidence: item.confidence,
      cookieName: item.cookieName,
      duration: item.duration,
      provider: item.provider,
      purpose: item.purpose,
      snippetHash: null
    })),
    policyFieldCoverage: policyFieldCoverage.fields,
    policyCoverageRatio: policyFieldCoverage.policyCoverageRatio,
    policyEffectiveDate: effectiveDate.value ?? input.ruleResult.updateDate,
    policyGoverningLaw: governingLaw.value ?? input.ruleResult.governingLaw,
    policyNoticeContactPresent: input.ruleResult.noticeContactPresent,
    policySnippetCount: policyFieldCoverage.policySnippetCount,
    policyStructurallyWeak: policyFieldCoverage.policyStructurallyWeak,
    privacyContactChannelType: privacyContactChannelType.value ?? input.ruleResult.privacyContactChannelType,
    policyRetentionDisclosure: retentionDisclosure.value ?? input.ruleResult.retentionDisclosure,
    policyClaimNoSale: policyClaimNoSale.value ?? input.ruleResult.policyClaimNoSale,
    policyClaimNoTracking: policyClaimNoTracking.value ?? input.ruleResult.policyClaimNoTracking,
    policyClaimPrivacyProtective: policyClaimPrivacyProtective.value ?? input.ruleResult.policyClaimPrivacyProtective,
    policyDataCategories: Array.from(new Set([...input.ruleResult.dataCategories, ...dataCategories.map((item) => item.category)])).sort(),
    dataAccessRequestPresent: Boolean(dataAccessRequestPresent.value),
    dataDeletionRequestPresent: Boolean(dataDeletionRequestPresent.value),
    policyDoNotSell: doNotSell.value,
    policyDoNotSellConfidence: doNotSell.confidence,
    policyDsarConfidence: dsarMechanism.confidence,
    policyDsarMechanism: dsarMechanism.value,
    policyMentions,
    policyRetentionPeriods: (retentionStatements.length > 0 ? retentionStatements : input.ruleResult.retentionStatements).map((item) => ({
      category: item.category,
      confidence: item.confidence,
      periodText: item.periodText,
      snippetHash: null
    })),
    policySemanticConfidence,
    policySubprocessorsListed:
      input.ruleResult.mentions.some((mention) => mention.topic === "cross_border_transfer") || transferMechanisms.length > 0
        ? true
        : null,
    policySummaryShort,
    policyTerminationOrSuspensionPresent: input.ruleResult.terminationOrSuspensionPresent,
    policyCancellationOrRefundPresent: input.ruleResult.cancellationOrRefundPresent,
    policyTransferMechanisms: (transferMechanisms.length > 0 ? transferMechanisms : input.ruleResult.transferMechanisms).map((item) => ({
      confidence: item.confidence,
      mechanism: item.mechanism,
      snippetHash: null
    }))
  };
}
