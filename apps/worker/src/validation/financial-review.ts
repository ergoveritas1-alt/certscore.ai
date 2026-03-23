import {
  ENTITY_TRANSPARENCY_MINIMUM_SURFACE_SCORE,
  EXPLAINER_SURFACE_MAX_CRAWL_DEPTH,
  FINANCIAL_RULE_VERSION,
  getNearestDisclosureDistance,
  getObservedEvidenceByIds,
  LOCAL_DISCLOSURE_DOM_SIBLING_RADIUS,
  LOCAL_DISCLOSURE_TOKEN_RADIUS,
  MAX_ACCEPTABLE_LINK_DEPTH_FOR_MATERIAL_TERMS
} from "@website-signal-risk-scanner/scan-core";
import type {
  FindingCategory,
  FindingSeverity,
  ObservedPageEvidence,
  ReviewRuleEvidence,
  ScanSignalHit
} from "@website-signal-risk-scanner/shared";

export type FinancialSectionReviewFinding = {
  category: FindingCategory;
  description: string;
  evidence_json: Record<string, unknown>;
  finding_id: string | null;
  page_url: string | null;
  rule_key: string;
  severity: FindingSeverity;
  subtype: string | null;
  title: string;
};

type SupportingSignal = {
  category: string;
  key: string;
  label: string;
  value: boolean | number | string | string[] | Record<string, unknown>;
};

type RulePacketInput = {
  claim: string;
  confidenceBasis: string[];
  description: string;
  evidenceRefs: string[];
  localSearch: ReviewRuleEvidence["localSearch"];
  missingEvidence?: string[];
  pageEvidence: ObservedPageEvidence[];
  pageUrl: string | null;
  ruleKey: string;
  severity: FindingSeverity;
  signalHits: ScanSignalHit[];
  supportingSignalKeys: string[];
  title: string;
};

const PERFORMANCE_CLAIM_SIGNAL_KEYS = [
  "financial.performance_claim_text_present",
  "financial.return_or_yield_percentage_present",
  "financial.investment_outperformance_language_present",
  "financial.guaranteed_return_language_present",
  "financial.low_risk_high_return_language_present"
] as const;

const HYPOTHETICAL_SIGNAL_KEYS = ["financial.hypothetical_or_backtest_language_present"] as const;
const RISK_DISCLOSURE_SIGNAL_KEYS = ["financial.risk_disclosure_text_present"] as const;
const PROMO_SIGNAL_KEYS = ["commercial.promo_price_or_free_claim_present"] as const;
const HIGH_RISK_SIGNAL_KEYS = [
  "financial.leverage_language_present",
  "financial.margin_trading_language_present",
  "financial.options_or_futures_language_present",
  "financial.perpetuals_or_derivatives_language_present",
  "financial.staking_apy_language_present",
  "financial.copy_trading_language_present",
  "financial.ai_trading_or_automated_trading_language_present"
] as const;
const HIGH_RISK_DISCLOSURE_SIGNAL_KEYS = ["financial.loss_risk_disclosure_text_present"] as const;
const FEE_DISCLOSURE_SIGNAL_KEYS = [
  "commercial.fee_related_text_present",
  "commercial.fee_schedule_table_present",
  "commercial.withdrawal_redemption_terms_text_present",
  "commercial.cancellation_terms_text_present",
  "commercial.account_closure_terms_text_present"
] as const;

function humanizeSignalKey(key: string) {
  const [, tail = key] = key.split(".", 2);
  return tail
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function categoryForSignal(key: string) {
  if (key.startsWith("financial.") || key.startsWith("entity.") || key.startsWith("commercial.")) {
    return "disclosure";
  }

  return "privacy";
}

function toSupportingSignal(hit: ScanSignalHit): SupportingSignal {
  const count = typeof hit.payload.count === "number" ? hit.payload.count : null;
  return {
    category: categoryForSignal(hit.signalKey),
    key: hit.signalKey,
    label: humanizeSignalKey(hit.signalKey),
    value: count !== null && count > 1 ? count : true
  };
}

function getHits(signalHits: ScanSignalHit[], keys: readonly string[]) {
  const wanted = new Set(keys);
  return signalHits.filter((hit) => wanted.has(hit.signalKey));
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => typeof value === "string" && value.trim().length > 0))];
}

function qualifyLocalDisclosure(result: { nearestSiblingDistance: number | null; nearestTokenDistance: number | null }) {
  return (
    (typeof result.nearestSiblingDistance === "number" && result.nearestSiblingDistance <= LOCAL_DISCLOSURE_DOM_SIBLING_RADIUS) ||
    (typeof result.nearestTokenDistance === "number" && result.nearestTokenDistance <= LOCAL_DISCLOSURE_TOKEN_RADIUS)
  );
}

function buildRuleEvidence(input: RulePacketInput) {
  const supportingSignals = input.supportingSignalKeys
    .flatMap((signalKey) => input.signalHits.filter((hit) => hit.signalKey === signalKey))
    .map(toSupportingSignal);
  const matchedEvidence = getObservedEvidenceByIds(input.pageEvidence, input.evidenceRefs).slice(0, 6).map((evidence) => ({
    crawlDepth: evidence.crawlDepth,
    domPath: evidence.domPath,
    matchedText: evidence.matchedText,
    pageRole: evidence.pageRole,
    pageType: evidence.pageType,
    pageUrl: evidence.pageUrl,
    selector: evidence.selector,
    siblingIndex: evidence.siblingIndex,
    tokenEnd: evidence.tokenEnd,
    tokenStart: evidence.tokenStart
  }));

  return {
    claim: input.claim,
    confidenceBasis: input.confidenceBasis,
    evidenceRefs: input.evidenceRefs,
    matchedPageEvidence: matchedEvidence,
    missingEvidence: input.missingEvidence ?? [],
    pageUrls: uniqueStrings([input.pageUrl, ...matchedEvidence.map((evidence) => evidence.pageUrl)]),
    policyEvidence: [],
    reviewPolicy: {
      claimType: "behavior_without_disclosure",
      contraryEvidenceTypes: ["contrary_runtime_evidence", "contrary_policy_disclosure"],
      detectorStrength: input.severity === "high" ? "strong" : "medium",
      gapTolerance: "medium",
      requiredSupportTypes: ["signal_hits", "page_evidence", "local_window_metadata"],
      rubric: {
        inconclusiveIf: ["Relevant disclosure context may exist outside the bounded local search window."],
        notSupportedIf: ["Nearby qualifying disclosure evidence is present in the retained page artifacts."],
        supportedIf: ["The retained page artifacts show the triggering signal structure and the bounded local search did not find qualifying support."]
      }
    },
    ruleKey: input.ruleKey,
    ruleVersion: FINANCIAL_RULE_VERSION,
    runtimeEvidence: [],
    supportingSignals,
    localSearch: input.localSearch
  };
}

function buildFinding(input: RulePacketInput): FinancialSectionReviewFinding {
  return {
    category: "legal",
    description: input.description,
    evidence_json: buildRuleEvidence(input),
    finding_id: null,
    page_url: input.pageUrl,
    rule_key: input.ruleKey,
    severity: input.severity,
    subtype: "finance_section_review",
    title: input.title
  };
}

function gatherDisclosureRuleBreaches(input: {
  claimHits: ScanSignalHit[];
  disclosureHits: ScanSignalHit[];
  pageEvidence: ObservedPageEvidence[];
}) {
  const distances = getNearestDisclosureDistance({
    claimHits: input.claimHits,
    disclosureHits: input.disclosureHits,
    pageEvidence: input.pageEvidence
  });

  const missing = distances.filter((entry) => {
    const hasAnyDisclosure = entry.nearestSiblingDistance !== null || entry.nearestTokenDistance !== null;
    return !hasAnyDisclosure || !qualifyLocalDisclosure(entry);
  });
  const exceeded = missing.filter((entry) => entry.nearestSiblingDistance !== null || entry.nearestTokenDistance !== null);

  return { exceeded, missing };
}

function minExplainerDepth(signalHits: ScanSignalHit[], pageEvidence: ObservedPageEvidence[]) {
  const explainerHits = getHits(signalHits, ["financial.high_risk_product_explainer_page_present"]);
  const depths = explainerHits
    .flatMap((hit) => getObservedEvidenceByIds(pageEvidence, hit.evidenceRefs))
    .map((evidence) => evidence.crawlDepth)
    .filter((depth): depth is number => typeof depth === "number");

  return depths.length > 0 ? Math.min(...depths) : null;
}

function servicePromotionDetected(signalHits: ScanSignalHit[]) {
  return getHits(signalHits, [...PROMO_SIGNAL_KEYS, "financial.claim_cta_block_present", ...HIGH_RISK_SIGNAL_KEYS]).length > 0;
}

function transparencySurfaceScore(signalHits: ScanSignalHit[]) {
  return [
    "entity.legal_entity_name_text_present",
    "entity.company_address_text_present",
    "entity.about_page_present",
    "entity.team_or_leadership_page_present",
    "entity.jurisdiction_or_operating_entity_text_present"
  ].filter((key) => getHits(signalHits, [key]).length > 0).length +
    (getHits(signalHits, ["entity.contact_email_present", "entity.contact_phone_present", "entity.contact_form_present"]).length > 0 ? 1 : 0);
}

function buildContainerLabels(pageEvidence: ObservedPageEvidence[], evidenceRefs: string[]) {
  return uniqueStrings(
    getObservedEvidenceByIds(pageEvidence, evidenceRefs).map((evidence) => `${evidence.pageUrl}#${evidence.siblingIndex ?? "na"}`)
  );
}

function buildFinancialReviewFindingSet(input: {
  pageEvidence: ObservedPageEvidence[];
  signalHits: ScanSignalHit[];
}) {
  const findings: FinancialSectionReviewFinding[] = [];
  const performanceClaimHits = getHits(input.signalHits, PERFORMANCE_CLAIM_SIGNAL_KEYS);
  const riskDisclosureHits = getHits(input.signalHits, RISK_DISCLOSURE_SIGNAL_KEYS);
  const performanceDisclosureBreaches = gatherDisclosureRuleBreaches({
    claimHits: performanceClaimHits,
    disclosureHits: riskDisclosureHits,
    pageEvidence: input.pageEvidence
  });

  if (performanceDisclosureBreaches.missing.length > 0) {
    const evidenceRefs = uniqueStrings(
      performanceDisclosureBreaches.missing.flatMap((entry) => entry.claimHit.evidenceRefs)
    );
    findings.push(buildFinding({
      claim: "Observable investment or performance claims appear without qualifying nearby risk disclosure support.",
      confidenceBasis: [
        `Detected ${performanceDisclosureBreaches.missing.length} performance-claim block${performanceDisclosureBreaches.missing.length === 1 ? "" : "s"} without qualifying nearby disclosure.`,
        "The retained local search checked same-page claim containers, nearby sibling blocks, and token-radius proximity."
      ],
      description: "Financial claim blocks appear without qualifying local risk disclosure support.",
      evidenceRefs,
      localSearch: {
        tokenRadius: LOCAL_DISCLOSURE_TOKEN_RADIUS,
        domSiblingRadius: LOCAL_DISCLOSURE_DOM_SIBLING_RADIUS,
        evaluatedPageUrls: uniqueStrings(performanceDisclosureBreaches.missing.map((entry) => entry.claimHit.pageUrl)),
        evaluatedContainers: buildContainerLabels(input.pageEvidence, evidenceRefs),
        matchedDisclosureEvidenceRefs: []
      },
      pageEvidence: input.pageEvidence,
      pageUrl: performanceDisclosureBreaches.missing[0]?.claimHit.pageUrl ?? null,
      ruleKey: "section_review.claim_block_without_local_risk_disclosure",
      severity: "high",
      signalHits: input.signalHits,
      supportingSignalKeys: [...PERFORMANCE_CLAIM_SIGNAL_KEYS, ...RISK_DISCLOSURE_SIGNAL_KEYS],
      title: "Performance claim lacks nearby risk disclosure"
    }));
  }

  if (performanceDisclosureBreaches.exceeded.length > 0) {
    const evidenceRefs = uniqueStrings(
      performanceDisclosureBreaches.exceeded.flatMap((entry) => entry.claimHit.evidenceRefs)
    );
    findings.push(buildFinding({
      claim: "Risk disclosure text exists, but it appears farther away than the configured local-support threshold for the claim block.",
      confidenceBasis: [
        `Detected ${performanceDisclosureBreaches.exceeded.length} claim block${performanceDisclosureBreaches.exceeded.length === 1 ? "" : "s"} where disclosure distance exceeded the local threshold.`,
        "This rule is conservative and does not infer illegality; it only captures observable claim-to-disclosure separation."
      ],
      description: "Nearby claim and disclosure distance exceeded the configured local-support threshold.",
      evidenceRefs,
      localSearch: {
        tokenRadius: LOCAL_DISCLOSURE_TOKEN_RADIUS,
        domSiblingRadius: LOCAL_DISCLOSURE_DOM_SIBLING_RADIUS,
        evaluatedPageUrls: uniqueStrings(performanceDisclosureBreaches.exceeded.map((entry) => entry.claimHit.pageUrl)),
        evaluatedContainers: buildContainerLabels(input.pageEvidence, evidenceRefs),
        matchedDisclosureEvidenceRefs: uniqueStrings(riskDisclosureHits.flatMap((hit) => hit.evidenceRefs))
      },
      pageEvidence: input.pageEvidence,
      pageUrl: performanceDisclosureBreaches.exceeded[0]?.claimHit.pageUrl ?? null,
      ruleKey: "section_review.claim_disclosure_distance_exceeds_threshold",
      severity: "medium",
      signalHits: input.signalHits,
      supportingSignalKeys: [...PERFORMANCE_CLAIM_SIGNAL_KEYS, ...RISK_DISCLOSURE_SIGNAL_KEYS],
      title: "Performance disclosure too far from claim"
    }));
  }

  const hypotheticalBreaches = gatherDisclosureRuleBreaches({
    claimHits: getHits(input.signalHits, HYPOTHETICAL_SIGNAL_KEYS),
    disclosureHits: riskDisclosureHits,
    pageEvidence: input.pageEvidence
  });

  if (hypotheticalBreaches.missing.length > 0) {
    const evidenceRefs = uniqueStrings(hypotheticalBreaches.missing.flatMap((entry) => entry.claimHit.evidenceRefs));
    findings.push(buildFinding({
      claim: "Hypothetical or backtested results appear without nearby qualifying disclosure support.",
      confidenceBasis: [
        `Detected ${hypotheticalBreaches.missing.length} hypothetical-results block${hypotheticalBreaches.missing.length === 1 ? "" : "s"} without nearby qualification.`,
        "The bounded local search used the configured sibling and token radii."
      ],
      description: "Hypothetical or backtested results appear without nearby qualification support.",
      evidenceRefs,
      localSearch: {
        tokenRadius: LOCAL_DISCLOSURE_TOKEN_RADIUS,
        domSiblingRadius: LOCAL_DISCLOSURE_DOM_SIBLING_RADIUS,
        evaluatedPageUrls: uniqueStrings(hypotheticalBreaches.missing.map((entry) => entry.claimHit.pageUrl)),
        evaluatedContainers: buildContainerLabels(input.pageEvidence, evidenceRefs),
        matchedDisclosureEvidenceRefs: []
      },
      pageEvidence: input.pageEvidence,
      pageUrl: hypotheticalBreaches.missing[0]?.claimHit.pageUrl ?? null,
      ruleKey: "section_review.hypothetical_results_without_local_qualification",
      severity: "high",
      signalHits: input.signalHits,
      supportingSignalKeys: [...HYPOTHETICAL_SIGNAL_KEYS, ...RISK_DISCLOSURE_SIGNAL_KEYS],
      title: "Hypothetical results lack nearby qualification"
    }));
  }

  const registrationClaimHits = getHits(input.signalHits, ["entity.regulatory_or_license_claim_text_present"]);
  const registrationIdentifierHits = getHits(input.signalHits, ["entity.registration_identifier_text_present"]);
  if (registrationClaimHits.length > 0 && registrationIdentifierHits.length === 0) {
    const evidenceRefs = uniqueStrings(registrationClaimHits.flatMap((hit) => hit.evidenceRefs));
    findings.push(buildFinding({
      claim: "A regulatory or license claim appears on site, but no on-site registration identifier text was detected in the retained surfaces.",
      confidenceBasis: [
        `Detected ${registrationClaimHits.length} registration-claim surface${registrationClaimHits.length === 1 ? "" : "s"} with no identifier hit.`,
        "This is an on-site support gap only; it does not assess off-site legitimacy or validity."
      ],
      description: "Registration or license claims appear without an accompanying on-site identifier.",
      evidenceRefs,
      localSearch: {
        tokenRadius: LOCAL_DISCLOSURE_TOKEN_RADIUS,
        domSiblingRadius: LOCAL_DISCLOSURE_DOM_SIBLING_RADIUS,
        evaluatedPageUrls: uniqueStrings(registrationClaimHits.map((hit) => hit.pageUrl)),
        evaluatedContainers: buildContainerLabels(input.pageEvidence, evidenceRefs),
        matchedDisclosureEvidenceRefs: []
      },
      pageEvidence: input.pageEvidence,
      pageUrl: registrationClaimHits[0]?.pageUrl ?? null,
      ruleKey: "section_review.registration_claim_without_identifier",
      severity: "medium",
      signalHits: input.signalHits,
      supportingSignalKeys: ["entity.regulatory_or_license_claim_text_present", "entity.registration_identifier_text_present"],
      title: "Registration claim lacks identifier"
    }));
  }

  const surfaceScore = transparencySurfaceScore(input.signalHits);
  if (surfaceScore < ENTITY_TRANSPARENCY_MINIMUM_SURFACE_SCORE) {
    const evidenceRefs = uniqueStrings(
      getHits(input.signalHits, [
        "entity.legal_entity_name_text_present",
        "entity.company_address_text_present",
        "entity.contact_email_present",
        "entity.contact_phone_present",
        "entity.contact_form_present",
        "entity.about_page_present",
        "entity.team_or_leadership_page_present",
        "entity.jurisdiction_or_operating_entity_text_present"
      ]).flatMap((hit) => hit.evidenceRefs)
    );
    findings.push(buildFinding({
      claim: "The observable operator-identity and governance surface is sparse relative to the configured transparency threshold.",
      confidenceBasis: [
        `Transparency surface score: ${surfaceScore} of ${ENTITY_TRANSPARENCY_MINIMUM_SURFACE_SCORE} required.`,
        "The score is based only on reproducible on-site surfaces such as legal name, address, contact, about, team, and jurisdiction text."
      ],
      description: "Entity identity and governance surfaces are sparse across the scanned pages.",
      evidenceRefs,
      localSearch: {
        tokenRadius: LOCAL_DISCLOSURE_TOKEN_RADIUS,
        domSiblingRadius: LOCAL_DISCLOSURE_DOM_SIBLING_RADIUS,
        evaluatedPageUrls: uniqueStrings(input.signalHits.map((hit) => hit.pageUrl)),
        evaluatedContainers: buildContainerLabels(input.pageEvidence, evidenceRefs),
        matchedDisclosureEvidenceRefs: []
      },
      pageEvidence: input.pageEvidence,
      pageUrl: input.signalHits[0]?.pageUrl ?? null,
      ruleKey: "section_review.entity_transparency_surface_sparse",
      severity: "medium",
      signalHits: input.signalHits,
      supportingSignalKeys: [
        "entity.legal_entity_name_text_present",
        "entity.company_address_text_present",
        "entity.contact_email_present",
        "entity.contact_phone_present",
        "entity.contact_form_present",
        "entity.about_page_present",
        "entity.team_or_leadership_page_present",
        "entity.jurisdiction_or_operating_entity_text_present"
      ],
      title: "Entity transparency surface is sparse"
    }));
  }

  if (getHits(input.signalHits, ["entity.multiple_entity_names_detected_on_site"]).length > 0) {
    const evidenceRefs = uniqueStrings(getHits(input.signalHits, ["entity.multiple_entity_names_detected_on_site"]).flatMap((hit) => hit.evidenceRefs));
    findings.push(buildFinding({
      claim: "Multiple canonicalized entity names were detected across the scanned site surfaces.",
      confidenceBasis: [
        "The detector found more than one canonicalized legal-entity naming pattern on site.",
        "This captures an observable naming inconsistency pattern only."
      ],
      description: "Multiple entity names were detected across the scanned site surfaces.",
      evidenceRefs,
      localSearch: {
        tokenRadius: LOCAL_DISCLOSURE_TOKEN_RADIUS,
        domSiblingRadius: LOCAL_DISCLOSURE_DOM_SIBLING_RADIUS,
        evaluatedPageUrls: uniqueStrings(getHits(input.signalHits, ["entity.multiple_entity_names_detected_on_site"]).map((hit) => hit.pageUrl)),
        evaluatedContainers: buildContainerLabels(input.pageEvidence, evidenceRefs),
        matchedDisclosureEvidenceRefs: []
      },
      pageEvidence: input.pageEvidence,
      pageUrl: getHits(input.signalHits, ["entity.multiple_entity_names_detected_on_site"])[0]?.pageUrl ?? null,
      ruleKey: "section_review.inconsistent_entity_naming_pattern_detected",
      severity: "medium",
      signalHits: input.signalHits,
      supportingSignalKeys: ["entity.multiple_entity_names_detected_on_site"],
      title: "Entity naming pattern is inconsistent"
    }));
  }

  const contactSurfacePresent = getHits(input.signalHits, ["entity.contact_email_present", "entity.contact_phone_present", "entity.contact_form_present"]).length > 0;
  if (registrationClaimHits.length > 0 && !contactSurfacePresent) {
    const evidenceRefs = uniqueStrings(registrationClaimHits.flatMap((hit) => hit.evidenceRefs));
    findings.push(buildFinding({
      claim: "A regulated-claim context appears without a meaningful observable contact surface.",
      confidenceBasis: [
        "A registration or licensing claim was detected.",
        "No contact email, phone number, or contact form signal was retained on the scanned pages."
      ],
      description: "Regulated-claim context appears with minimal contact surface support.",
      evidenceRefs,
      localSearch: {
        tokenRadius: LOCAL_DISCLOSURE_TOKEN_RADIUS,
        domSiblingRadius: LOCAL_DISCLOSURE_DOM_SIBLING_RADIUS,
        evaluatedPageUrls: uniqueStrings(registrationClaimHits.map((hit) => hit.pageUrl)),
        evaluatedContainers: buildContainerLabels(input.pageEvidence, evidenceRefs),
        matchedDisclosureEvidenceRefs: []
      },
      pageEvidence: input.pageEvidence,
      pageUrl: registrationClaimHits[0]?.pageUrl ?? null,
      ruleKey: "section_review.contact_surface_minimal_for_regulated_claim_context",
      severity: "medium",
      signalHits: input.signalHits,
      supportingSignalKeys: [
        "entity.regulatory_or_license_claim_text_present",
        "entity.contact_email_present",
        "entity.contact_phone_present",
        "entity.contact_form_present"
      ],
      title: "Regulated claim lacks contact surface"
    }));
  }

  const promotedService = servicePromotionDetected(input.signalHits);
  if (
    promotedService &&
    getHits(input.signalHits, ["commercial.pricing_page_present", "commercial.fee_schedule_table_present"]).length === 0
  ) {
    findings.push(buildFinding({
      claim: "A promoted service or offer context appears without an observable pricing or fee-schedule surface.",
      confidenceBasis: [
        "Promotional or CTA-style service signals were retained.",
        "No pricing-page or fee-schedule signal was retained in the scan artifacts."
      ],
      description: "Promoted service context appears without an observable pricing or fee-schedule surface.",
      evidenceRefs: uniqueStrings(getHits(input.signalHits, [...PROMO_SIGNAL_KEYS, "financial.claim_cta_block_present", ...HIGH_RISK_SIGNAL_KEYS]).flatMap((hit) => hit.evidenceRefs)),
      localSearch: {
        tokenRadius: LOCAL_DISCLOSURE_TOKEN_RADIUS,
        domSiblingRadius: LOCAL_DISCLOSURE_DOM_SIBLING_RADIUS,
        evaluatedPageUrls: uniqueStrings(input.signalHits.map((hit) => hit.pageUrl)),
        evaluatedContainers: [],
        matchedDisclosureEvidenceRefs: []
      },
      pageEvidence: input.pageEvidence,
      pageUrl: input.signalHits[0]?.pageUrl ?? null,
      ruleKey: "section_review.service_promoted_without_fee_schedule_surface",
      severity: "medium",
      signalHits: input.signalHits,
      supportingSignalKeys: [...PROMO_SIGNAL_KEYS, "financial.claim_cta_block_present", "commercial.pricing_page_present", "commercial.fee_schedule_table_present"],
      title: "Promoted service lacks fee surface"
    }));
  }

  const promoClaimBreaches = gatherDisclosureRuleBreaches({
    claimHits: getHits(input.signalHits, PROMO_SIGNAL_KEYS),
    disclosureHits: getHits(input.signalHits, FEE_DISCLOSURE_SIGNAL_KEYS),
    pageEvidence: input.pageEvidence
  });
  if (promoClaimBreaches.missing.length > 0) {
    const evidenceRefs = uniqueStrings(promoClaimBreaches.missing.flatMap((entry) => entry.claimHit.evidenceRefs));
    findings.push(buildFinding({
      claim: "A promotional price or free claim appears without nearby material fee or exit-term context.",
      confidenceBasis: [
        `Detected ${promoClaimBreaches.missing.length} promotional claim block${promoClaimBreaches.missing.length === 1 ? "" : "s"} without nearby fee or material-condition context.`,
        "The retained local search checked the configured claim-to-terms window only."
      ],
      description: "Promotional price claims appear without nearby material fee or terms context.",
      evidenceRefs,
      localSearch: {
        tokenRadius: LOCAL_DISCLOSURE_TOKEN_RADIUS,
        domSiblingRadius: LOCAL_DISCLOSURE_DOM_SIBLING_RADIUS,
        evaluatedPageUrls: uniqueStrings(promoClaimBreaches.missing.map((entry) => entry.claimHit.pageUrl)),
        evaluatedContainers: buildContainerLabels(input.pageEvidence, evidenceRefs),
        matchedDisclosureEvidenceRefs: uniqueStrings(getHits(input.signalHits, FEE_DISCLOSURE_SIGNAL_KEYS).flatMap((hit) => hit.evidenceRefs))
      },
      pageEvidence: input.pageEvidence,
      pageUrl: promoClaimBreaches.missing[0]?.claimHit.pageUrl ?? null,
      ruleKey: "section_review.price_claim_without_material_conditions_nearby",
      severity: "medium",
      signalHits: input.signalHits,
      supportingSignalKeys: [...PROMO_SIGNAL_KEYS, ...FEE_DISCLOSURE_SIGNAL_KEYS],
      title: "Promotional price claim lacks nearby conditions"
    }));
  }

  const feeDepths = getHits(input.signalHits, ["commercial.pricing_page_present", "commercial.fee_schedule_table_present"])
    .flatMap((hit) => getObservedEvidenceByIds(input.pageEvidence, hit.evidenceRefs))
    .map((evidence) => evidence.crawlDepth)
    .filter((depth): depth is number => typeof depth === "number");
  const minFeeDepth = feeDepths.length > 0 ? Math.min(...feeDepths) : null;
  if (typeof minFeeDepth === "number" && minFeeDepth > MAX_ACCEPTABLE_LINK_DEPTH_FOR_MATERIAL_TERMS) {
    const evidenceRefs = uniqueStrings(getHits(input.signalHits, ["commercial.pricing_page_present", "commercial.fee_schedule_table_present"]).flatMap((hit) => hit.evidenceRefs));
    findings.push(buildFinding({
      claim: "Material fee or pricing surfaces were found only beyond the configured acceptable crawl depth.",
      confidenceBasis: [
        `Minimum detected fee-surface crawl depth: ${minFeeDepth}.`,
        `Configured maximum acceptable link depth: ${MAX_ACCEPTABLE_LINK_DEPTH_FOR_MATERIAL_TERMS}.`
      ],
      description: "Material fee or pricing surfaces were found deeper than the configured threshold.",
      evidenceRefs,
      localSearch: {
        tokenRadius: LOCAL_DISCLOSURE_TOKEN_RADIUS,
        domSiblingRadius: LOCAL_DISCLOSURE_DOM_SIBLING_RADIUS,
        evaluatedPageUrls: uniqueStrings(getHits(input.signalHits, ["commercial.pricing_page_present", "commercial.fee_schedule_table_present"]).map((hit) => hit.pageUrl)),
        evaluatedContainers: buildContainerLabels(input.pageEvidence, evidenceRefs),
        matchedDisclosureEvidenceRefs: [],
        maxAcceptableLinkDepth: MAX_ACCEPTABLE_LINK_DEPTH_FOR_MATERIAL_TERMS
      },
      pageEvidence: input.pageEvidence,
      pageUrl: getHits(input.signalHits, ["commercial.pricing_page_present", "commercial.fee_schedule_table_present"])[0]?.pageUrl ?? null,
      ruleKey: "section_review.material_fee_terms_link_depth_exceeds_threshold",
      severity: "medium",
      signalHits: input.signalHits,
      supportingSignalKeys: ["commercial.pricing_page_present", "commercial.fee_schedule_table_present"],
      title: "Material fee terms are hard to locate"
    }));
  }

  if (promotedService && getHits(input.signalHits, ["commercial.withdrawal_redemption_terms_text_present"]).length === 0) {
    findings.push(buildFinding({
      claim: "A promoted service context appears without observable withdrawal or redemption terms.",
      confidenceBasis: [
        "Promotional or product-offer signals were retained.",
        "No withdrawal or redemption terms signal was retained."
      ],
      description: "Withdrawal or redemption terms were not detected in the scanned service surfaces.",
      evidenceRefs: [],
      localSearch: {
        tokenRadius: LOCAL_DISCLOSURE_TOKEN_RADIUS,
        domSiblingRadius: LOCAL_DISCLOSURE_DOM_SIBLING_RADIUS,
        evaluatedPageUrls: uniqueStrings(input.signalHits.map((hit) => hit.pageUrl)),
        evaluatedContainers: [],
        matchedDisclosureEvidenceRefs: []
      },
      pageEvidence: input.pageEvidence,
      pageUrl: null,
      ruleKey: "section_review.withdrawal_redemption_terms_missing",
      severity: "medium",
      signalHits: input.signalHits,
      supportingSignalKeys: [...PROMO_SIGNAL_KEYS, "financial.claim_cta_block_present", "commercial.withdrawal_redemption_terms_text_present"],
      title: "Withdrawal or redemption terms missing"
    }));
  }

  if (
    promotedService &&
    getHits(input.signalHits, [
      "commercial.cancellation_terms_text_present",
      "commercial.account_closure_terms_text_present",
      "commercial.withdrawal_redemption_terms_text_present"
    ]).length === 0
  ) {
    findings.push(buildFinding({
      claim: "A promoted service context appears without observable cancellation, closure, withdrawal, or redemption exit terms.",
      confidenceBasis: [
        "Promotional or product-offer signals were retained.",
        "No account-exit terms signal was retained."
      ],
      description: "Account-exit terms were not detected in the scanned service surfaces.",
      evidenceRefs: [],
      localSearch: {
        tokenRadius: LOCAL_DISCLOSURE_TOKEN_RADIUS,
        domSiblingRadius: LOCAL_DISCLOSURE_DOM_SIBLING_RADIUS,
        evaluatedPageUrls: uniqueStrings(input.signalHits.map((hit) => hit.pageUrl)),
        evaluatedContainers: [],
        matchedDisclosureEvidenceRefs: []
      },
      pageEvidence: input.pageEvidence,
      pageUrl: null,
      ruleKey: "section_review.account_exit_terms_missing",
      severity: "medium",
      signalHits: input.signalHits,
      supportingSignalKeys: [
        ...PROMO_SIGNAL_KEYS,
        "financial.claim_cta_block_present",
        "commercial.cancellation_terms_text_present",
        "commercial.account_closure_terms_text_present",
        "commercial.withdrawal_redemption_terms_text_present"
      ],
      title: "Account-exit terms missing"
    }));
  }

  const highRiskHits = getHits(input.signalHits, HIGH_RISK_SIGNAL_KEYS);
  const highRiskDisclosureBreaches = gatherDisclosureRuleBreaches({
    claimHits: highRiskHits,
    disclosureHits: getHits(input.signalHits, HIGH_RISK_DISCLOSURE_SIGNAL_KEYS),
    pageEvidence: input.pageEvidence
  });
  if (highRiskDisclosureBreaches.missing.length > 0) {
    const evidenceRefs = uniqueStrings(highRiskDisclosureBreaches.missing.flatMap((entry) => entry.claimHit.evidenceRefs));
    findings.push(buildFinding({
      claim: "High-risk product promotion appears without nearby loss-risk disclosure support.",
      confidenceBasis: [
        `Detected ${highRiskDisclosureBreaches.missing.length} high-risk product surface${highRiskDisclosureBreaches.missing.length === 1 ? "" : "s"} without nearby loss-risk disclosure.`,
        "The local check used the configured bounded claim-to-disclosure window."
      ],
      description: "High-risk product promotion appears without nearby loss-risk disclosure support.",
      evidenceRefs,
      localSearch: {
        tokenRadius: LOCAL_DISCLOSURE_TOKEN_RADIUS,
        domSiblingRadius: LOCAL_DISCLOSURE_DOM_SIBLING_RADIUS,
        evaluatedPageUrls: uniqueStrings(highRiskDisclosureBreaches.missing.map((entry) => entry.claimHit.pageUrl)),
        evaluatedContainers: buildContainerLabels(input.pageEvidence, evidenceRefs),
        matchedDisclosureEvidenceRefs: []
      },
      pageEvidence: input.pageEvidence,
      pageUrl: highRiskDisclosureBreaches.missing[0]?.claimHit.pageUrl ?? null,
      ruleKey: "section_review.high_risk_product_without_local_loss_risk_disclosure",
      severity: "high",
      signalHits: input.signalHits,
      supportingSignalKeys: [...HIGH_RISK_SIGNAL_KEYS, ...HIGH_RISK_DISCLOSURE_SIGNAL_KEYS],
      title: "High-risk product lacks nearby loss-risk disclosure"
    }));
  }

  const explainerDepth = minExplainerDepth(input.signalHits, input.pageEvidence);
  if (highRiskHits.length > 0 && (explainerDepth === null || explainerDepth > EXPLAINER_SURFACE_MAX_CRAWL_DEPTH)) {
    const evidenceRefs = uniqueStrings(highRiskHits.flatMap((hit) => hit.evidenceRefs));
    findings.push(buildFinding({
      claim: "High-risk product promotion appears without an observable explainer or education surface within the configured crawl depth.",
      confidenceBasis: [
        `Detected ${highRiskHits.length} high-risk product signal hit${highRiskHits.length === 1 ? "" : "s"}.`,
        explainerDepth === null
          ? "No explainer-surface evidence was retained."
          : `Nearest explainer surface depth (${explainerDepth}) exceeded the configured maximum (${EXPLAINER_SURFACE_MAX_CRAWL_DEPTH}).`
      ],
      description: "High-risk product promotion appears without a nearby explainer surface.",
      evidenceRefs,
      localSearch: {
        tokenRadius: LOCAL_DISCLOSURE_TOKEN_RADIUS,
        domSiblingRadius: LOCAL_DISCLOSURE_DOM_SIBLING_RADIUS,
        evaluatedPageUrls: uniqueStrings(highRiskHits.map((hit) => hit.pageUrl)),
        evaluatedContainers: buildContainerLabels(input.pageEvidence, evidenceRefs),
        matchedDisclosureEvidenceRefs: uniqueStrings(getHits(input.signalHits, ["financial.high_risk_product_explainer_page_present"]).flatMap((hit) => hit.evidenceRefs)),
        explainerSurfaceMaxCrawlDepth: EXPLAINER_SURFACE_MAX_CRAWL_DEPTH
      },
      pageEvidence: input.pageEvidence,
      pageUrl: highRiskHits[0]?.pageUrl ?? null,
      ruleKey: "section_review.high_risk_product_without_explainer_surface",
      severity: "medium",
      signalHits: input.signalHits,
      supportingSignalKeys: [...HIGH_RISK_SIGNAL_KEYS, "financial.high_risk_product_explainer_page_present"],
      title: "High-risk product lacks explainer surface"
    }));
  }

  const performancePages = new Set(performanceClaimHits.map((hit) => hit.pageUrl));
  const overlappingHighRiskHits = highRiskHits.filter((hit) => performancePages.has(hit.pageUrl));
  if (overlappingHighRiskHits.length > 0) {
    const evidenceRefs = uniqueStrings([
      ...overlappingHighRiskHits.flatMap((hit) => hit.evidenceRefs),
      ...performanceClaimHits.filter((hit) => performancePages.has(hit.pageUrl)).flatMap((hit) => hit.evidenceRefs)
    ]);
    findings.push(buildFinding({
      claim: "Yield or return claims appear in a retained high-risk product context.",
      confidenceBasis: [
        `Detected ${uniqueStrings(overlappingHighRiskHits.map((hit) => hit.pageUrl)).length} page${uniqueStrings(overlappingHighRiskHits.map((hit) => hit.pageUrl)).length === 1 ? "" : "s"} containing both high-risk product and performance-claim signals.`
      ],
      description: "Yield or return claims appear in a retained high-risk product context.",
      evidenceRefs,
      localSearch: {
        tokenRadius: LOCAL_DISCLOSURE_TOKEN_RADIUS,
        domSiblingRadius: LOCAL_DISCLOSURE_DOM_SIBLING_RADIUS,
        evaluatedPageUrls: uniqueStrings(overlappingHighRiskHits.map((hit) => hit.pageUrl)),
        evaluatedContainers: buildContainerLabels(input.pageEvidence, evidenceRefs),
        matchedDisclosureEvidenceRefs: []
      },
      pageEvidence: input.pageEvidence,
      pageUrl: overlappingHighRiskHits[0]?.pageUrl ?? null,
      ruleKey: "section_review.yield_claim_in_high_risk_product_context",
      severity: "medium",
      signalHits: input.signalHits,
      supportingSignalKeys: [...PERFORMANCE_CLAIM_SIGNAL_KEYS, ...HIGH_RISK_SIGNAL_KEYS],
      title: "Yield claim appears in high-risk context"
    }));
  }

  return findings;
}

export function buildFinancialSectionReviewFindings(input: {
  pageEvidence: ObservedPageEvidence[];
  signalHits: ScanSignalHit[];
}) {
  return buildFinancialReviewFindingSet(input);
}
