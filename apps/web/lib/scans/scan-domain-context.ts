export interface ScanDomainContext {
  domainIndustryPrimary: string | null;
  investorOrSecuritiesPromotion: boolean | null;
}

export function buildScanDomainContext(
  macroEnrichment: Record<string, unknown> | null | undefined
): ScanDomainContext {
  if (!macroEnrichment) {
    return { domainIndustryPrimary: null, investorOrSecuritiesPromotion: null };
  }

  const normalizedOutput =
    macroEnrichment.normalized_output_json && typeof macroEnrichment.normalized_output_json === "object"
      ? (macroEnrichment.normalized_output_json as Record<string, unknown>)
      : null;

  const monetizationSignals =
    normalizedOutput?.monetization_signals && typeof normalizedOutput.monetization_signals === "object"
      ? (normalizedOutput.monetization_signals as Record<string, unknown>)
      : null;

  const domainIndustryPrimary =
    typeof normalizedOutput?.industry_primary === "string" ? normalizedOutput.industry_primary : null;

  const investorOrSecuritiesPromotion =
    typeof monetizationSignals?.investor_or_securities_promotion === "boolean"
      ? monetizationSignals.investor_or_securities_promotion
      : null;

  return { domainIndustryPrimary, investorOrSecuritiesPromotion };
}
