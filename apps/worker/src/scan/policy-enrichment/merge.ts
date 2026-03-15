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
    policyEffectiveDate: effectiveDate.value ?? input.ruleResult.updateDate,
    policyGoverningLaw: governingLaw.value ?? input.ruleResult.governingLaw,
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
    policyTransferMechanisms: (transferMechanisms.length > 0 ? transferMechanisms : input.ruleResult.transferMechanisms).map((item) => ({
      confidence: item.confidence,
      mechanism: item.mechanism,
      snippetHash: null
    }))
  };
}
