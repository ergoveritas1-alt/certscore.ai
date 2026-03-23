import type {
  ObservedPageEvidence,
  ObservedPageRole,
  PageType,
  ScanSignalHit,
  ScanSnapshot
} from "@website-signal-risk-scanner/shared";
import type { StaticPageResult } from "../snapshot/types";
import { stableHash } from "../snapshot/hash";

export const FINANCIAL_SIGNAL_DETECTOR_VERSION = "financial-v1";
export const FINANCIAL_RULE_VERSION = "financial-rules-v1";

export const CORE_PAGES_DEFINITION: PageType[] = [
  "homepage",
  "contact",
  "about",
  "privacy_policy",
  "terms_of_service",
  "pricing",
  "product",
  "support"
];

export const LOCAL_DISCLOSURE_TOKEN_RADIUS = 80;
export const LOCAL_DISCLOSURE_DOM_SIBLING_RADIUS = 1;
export const MAX_ACCEPTABLE_LINK_DEPTH_FOR_MATERIAL_TERMS = 1;
export const ENTITY_TRANSPARENCY_MINIMUM_SURFACE_SCORE = 4;
export const EXPLAINER_SURFACE_MAX_CRAWL_DEPTH = 2;

const FINANCIAL_SIGNAL_KEYS = [
  "financial.performance_claim_text_present",
  "financial.return_or_yield_percentage_present",
  "financial.investment_outperformance_language_present",
  "financial.guaranteed_return_language_present",
  "financial.low_risk_high_return_language_present",
  "financial.hypothetical_or_backtest_language_present",
  "financial.testimonial_or_review_block_near_financial_claim_present",
  "financial.risk_disclosure_text_present",
  "financial.claim_cta_block_present",
  "entity.legal_entity_name_text_present",
  "entity.company_address_text_present",
  "entity.contact_email_present",
  "entity.contact_phone_present",
  "entity.contact_form_present",
  "entity.about_page_present",
  "entity.team_or_leadership_page_present",
  "entity.jurisdiction_or_operating_entity_text_present",
  "entity.regulatory_or_license_claim_text_present",
  "entity.registration_identifier_text_present",
  "entity.multiple_entity_names_detected_on_site",
  "commercial.pricing_page_present",
  "commercial.fee_related_text_present",
  "commercial.fee_schedule_table_present",
  "commercial.withdrawal_redemption_terms_text_present",
  "commercial.cancellation_terms_text_present",
  "commercial.account_closure_terms_text_present",
  "commercial.promo_price_or_free_claim_present",
  "commercial.variable_fee_language_present_without_explanation",
  "financial.leverage_language_present",
  "financial.margin_trading_language_present",
  "financial.options_or_futures_language_present",
  "financial.perpetuals_or_derivatives_language_present",
  "financial.staking_apy_language_present",
  "financial.copy_trading_language_present",
  "financial.ai_trading_or_automated_trading_language_present",
  "financial.loss_risk_disclosure_text_present",
  "financial.high_risk_product_explainer_page_present"
] as const;

export type FinancialSignalKey = (typeof FINANCIAL_SIGNAL_KEYS)[number];

type FinancialBlock = {
  blockIndex: number;
  pageRole: ObservedPageRole;
  pageType: PageType;
  pageUrl: string;
  text: string;
  tokenEnd: number;
  tokenStart: number;
};

type MatchPatternDefinition = {
  detectorName: string;
  detectorType: ScanSignalHit["detectorType"];
  patterns: RegExp[];
  signalKey: FinancialSignalKey;
};

type FinancialAnalysisInput = {
  pages: StaticPageResult[];
  scanId: string;
};

type SignalHitAccumulator = {
  detectorName: string;
  detectorType: ScanSignalHit["detectorType"];
  evidenceRefs: string[];
  pageRole: ObservedPageRole;
  pageType: PageType;
  pageUrl: string;
  payload: Record<string, unknown>;
  signalKey: FinancialSignalKey;
};

type FinancialSignalSummaryFields = Pick<
  ScanSnapshot,
  | "aboutPagePresent"
  | "accountClosureTermsPresent"
  | "aiTradingLanguagePresent"
  | "cancellationTermsPresent"
  | "claimCtaBlockPresent"
  | "copyTradingLanguagePresent"
  | "entityTransparencySurfaceScore"
  | "feeRelatedTextPresent"
  | "feeSchedulePresent"
  | "financialClaimWithCtaCount"
  | "guaranteedReturnLanguagePresent"
  | "highRiskProductExplainerPagePresent"
  | "highRiskProductSignalCount"
  | "hypotheticalOrBacktestLanguagePresent"
  | "investmentOutperformanceLanguagePresent"
  | "jurisdictionOrOperatingEntityTextPresent"
  | "leverageLanguagePresent"
  | "lossRiskDisclosureTextPresent"
  | "lowRiskHighReturnLanguagePresent"
  | "marginTradingLanguagePresent"
  | "materialFeeTermsMinLinkDepth"
  | "multipleEntityNamesDetected"
  | "optionsOrFuturesLanguagePresent"
  | "performanceClaimCount"
  | "performanceClaimPresent"
  | "perpetualsOrDerivativesLanguagePresent"
  | "pricingPagePresent"
  | "promoPriceOrFreeClaimPresent"
  | "registrationClaimPresent"
  | "registrationIdentifierPresent"
  | "returnOrYieldPercentagePresent"
  | "riskDisclosureTextPresent"
  | "stakingApyLanguagePresent"
  | "teamOrLeadershipPagePresent"
  | "testimonialOrReviewBlockNearFinancialClaimPresent"
  | "variableFeeLanguageWithoutExplanation"
  | "withdrawalTermsPresent"
>;

export type FinancialAnalysisResult = {
  pageEvidence: ObservedPageEvidence[];
  signalHits: ScanSignalHit[];
  summary: FinancialSignalSummaryFields;
};

const PERFORMANCE_CLAIM_PATTERNS: MatchPatternDefinition[] = [
  {
    signalKey: "financial.performance_claim_text_present",
    detectorName: "financial_performance_claim_text",
    detectorType: "text_pattern",
    patterns: [
      /\b(?:apy|apr|annual percentage yield|yield|return(?:s)?|roi|profit(?:s)?|alpha|outperform(?:ance)?)\b/gi,
      /\b(?:earn|earning)\s+(?:up to\s+)?\d{1,4}(?:\.\d+)?%/gi
    ]
  },
  {
    signalKey: "financial.return_or_yield_percentage_present",
    detectorName: "financial_return_or_yield_percentage",
    detectorType: "text_pattern",
    patterns: [
      /\b(?:apy|apr|yield|return(?:s)?|roi)\b.{0,24}\b\d{1,4}(?:\.\d+)?%/gi,
      /\b\d{1,4}(?:\.\d+)?%\b.{0,24}\b(?:apy|apr|yield|return(?:s)?|roi)\b/gi
    ]
  },
  {
    signalKey: "financial.investment_outperformance_language_present",
    detectorName: "financial_outperformance_language",
    detectorType: "text_pattern",
    patterns: [/\b(?:outperform(?:s|ed|ing)?|beat the market|market[- ]beating|alpha generation)\b/gi]
  },
  {
    signalKey: "financial.guaranteed_return_language_present",
    detectorName: "financial_guaranteed_return_language",
    detectorType: "text_pattern",
    patterns: [/\b(?:guaranteed|assured|risk[- ]free)\s+(?:returns?|yield|profit)\b/gi]
  },
  {
    signalKey: "financial.low_risk_high_return_language_present",
    detectorName: "financial_low_risk_high_return_language",
    detectorType: "text_pattern",
    patterns: [
      /\b(?:low[- ]risk|safe|stable)\b.{0,30}\b(?:high returns?|high yield|outsized returns?)\b/gi,
      /\b(?:high returns?|high yield)\b.{0,30}\b(?:low[- ]risk|safe|stable)\b/gi
    ]
  },
  {
    signalKey: "financial.hypothetical_or_backtest_language_present",
    detectorName: "financial_hypothetical_or_backtest_language",
    detectorType: "text_pattern",
    patterns: [/\b(?:hypothetical|backtest(?:ed)?|simulated results?|paper trading)\b/gi]
  },
  {
    signalKey: "financial.risk_disclosure_text_present",
    detectorName: "financial_risk_disclosure_text",
    detectorType: "text_pattern",
    patterns: [
      /\b(?:capital at risk|you may lose|loss(?:es)? may exceed|past performance is not indicative|not investment advice|not guaranteed)\b/gi
    ]
  }
];

const ENTITY_PATTERNS: MatchPatternDefinition[] = [
  {
    signalKey: "entity.legal_entity_name_text_present",
    detectorName: "entity_legal_name_text",
    detectorType: "text_pattern",
    patterns: [
      /\b(?:[A-Z][A-Za-z0-9&.,' -]{2,}\s+(?:LLC|L\.L\.C\.|Inc\.?|Incorporated|Corp\.?|Corporation|Ltd\.?|Limited|LLP|LP|PLC))\b/g
    ]
  },
  {
    signalKey: "entity.company_address_text_present",
    detectorName: "entity_company_address_text",
    detectorType: "text_pattern",
    patterns: [/\b\d{1,6}\s+[A-Za-z0-9.\- ]+\s+(?:street|st|road|rd|avenue|ave|boulevard|blvd|lane|ln|drive|dr)\b/gi]
  },
  {
    signalKey: "entity.contact_email_present",
    detectorName: "entity_contact_email",
    detectorType: "text_pattern",
    patterns: [/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi]
  },
  {
    signalKey: "entity.contact_phone_present",
    detectorName: "entity_contact_phone",
    detectorType: "text_pattern",
    patterns: [/(?:\+?1[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}/g]
  },
  {
    signalKey: "entity.jurisdiction_or_operating_entity_text_present",
    detectorName: "entity_jurisdiction_text",
    detectorType: "text_pattern",
    patterns: [/\b(?:operated by|trading as|registered in|incorporated in|organized under the laws of)\b/gi]
  },
  {
    signalKey: "entity.regulatory_or_license_claim_text_present",
    detectorName: "entity_regulatory_or_license_claim_text",
    detectorType: "text_pattern",
    patterns: [/\b(?:regulated by|licensed by|authori[sz]ed by|registered with|member of finra|nfa member)\b/gi]
  },
  {
    signalKey: "entity.registration_identifier_text_present",
    detectorName: "entity_registration_identifier_text",
    detectorType: "text_pattern",
    patterns: [/\b(?:crd|nmls|license|registration|firm reference)\s*(?:#|no\.?|number)?\s*[:\-]?\s*[A-Z0-9-]{3,}\b/gi]
  }
];

const COMMERCIAL_PATTERNS: MatchPatternDefinition[] = [
  {
    signalKey: "commercial.fee_related_text_present",
    detectorName: "commercial_fee_related_text",
    detectorType: "text_pattern",
    patterns: [/\b(?:fee|fees|commission|spread|pricing|charges|expense ratio|maker[- ]taker)\b/gi]
  },
  {
    signalKey: "commercial.withdrawal_redemption_terms_text_present",
    detectorName: "commercial_withdrawal_redemption_terms",
    detectorType: "text_pattern",
    patterns: [/\b(?:withdraw(?:al)?|redeem|redemption|cash out|payout)\b/gi]
  },
  {
    signalKey: "commercial.cancellation_terms_text_present",
    detectorName: "commercial_cancellation_terms",
    detectorType: "text_pattern",
    patterns: [/\b(?:cancel(?:lation)?|terminate subscription|stop service)\b/gi]
  },
  {
    signalKey: "commercial.account_closure_terms_text_present",
    detectorName: "commercial_account_closure_terms",
    detectorType: "text_pattern",
    patterns: [/\b(?:close your account|account closure|delete your account)\b/gi]
  },
  {
    signalKey: "commercial.promo_price_or_free_claim_present",
    detectorName: "commercial_promo_price_or_free_claim",
    detectorType: "text_pattern",
    patterns: [/\b(?:free|zero fees?|no fees?|bonus|promo(?:tional)?|save\s+\$?\d+|\d{1,3}%\s+off)\b/gi]
  }
];

const HIGH_RISK_PATTERNS: MatchPatternDefinition[] = [
  {
    signalKey: "financial.leverage_language_present",
    detectorName: "financial_leverage_language",
    detectorType: "text_pattern",
    patterns: [/\b(?:leveraged?|up to\s+\d{1,3}x|x leverage)\b/gi]
  },
  {
    signalKey: "financial.margin_trading_language_present",
    detectorName: "financial_margin_trading_language",
    detectorType: "text_pattern",
    patterns: [/\bmargin trading\b/gi]
  },
  {
    signalKey: "financial.options_or_futures_language_present",
    detectorName: "financial_options_or_futures_language",
    detectorType: "text_pattern",
    patterns: [/\b(?:options?|futures?)\b/gi]
  },
  {
    signalKey: "financial.perpetuals_or_derivatives_language_present",
    detectorName: "financial_perpetuals_or_derivatives_language",
    detectorType: "text_pattern",
    patterns: [/\b(?:perpetuals?|perpetual contracts?|derivatives?|swaps?)\b/gi]
  },
  {
    signalKey: "financial.staking_apy_language_present",
    detectorName: "financial_staking_apy_language",
    detectorType: "text_pattern",
    patterns: [/\b(?:staking)\b.{0,24}\b(?:apy|yield)\b/gi, /\b(?:apy|yield)\b.{0,24}\b(?:staking)\b/gi]
  },
  {
    signalKey: "financial.copy_trading_language_present",
    detectorName: "financial_copy_trading_language",
    detectorType: "text_pattern",
    patterns: [/\bcopy trading|copy trader|copy top traders?\b/gi]
  },
  {
    signalKey: "financial.ai_trading_or_automated_trading_language_present",
    detectorName: "financial_ai_trading_or_automated_trading_language",
    detectorType: "text_pattern",
    patterns: [/\b(?:ai trading|automated trading|trading bot|algorithmic trading|signals bot)\b/gi]
  },
  {
    signalKey: "financial.loss_risk_disclosure_text_present",
    detectorName: "financial_loss_risk_disclosure_text",
    detectorType: "text_pattern",
    patterns: [/\b(?:capital at risk|can lose all|may lose more than|losses may exceed|high risk of loss)\b/gi]
  }
];

const CLAIM_CTA_TERMS = /\b(?:sign up|get started|start trading|invest now|open account|buy now|join now|trade now|start earning)\b/i;
const TESTIMONIAL_TERMS = /\b(?:testimonial|review|customer story|trustpilot|stars?|ratings?|what our users say|what traders say)\b/i;
const FEE_SCHEDULE_TERMS = /\b(?:fee schedule|maker[- ]taker|commission schedule|pricing table|spread table)\b/i;
const VARIABLE_FEE_TERMS = /\b(?:fees may vary|variable fee|dynamic pricing|spread may vary)\b/i;
const VARIABLE_FEE_EXPLANATION_TERMS = /\b(?:based on|depending on|see schedule|calculated|tiered|maker|taker)\b/i;
const HIGH_RISK_EXPLAINER_TERMS = /\b(?:risk disclosure|trading guide|how leverage works|what is margin|what is copy trading|derivatives guide)\b/i;
const PRODUCT_SERVICE_TERMS = /\b(?:sign up|get started|pricing|open account|buy|trade|invest|start earning)\b/i;

function decodeHtml(text: string) {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'")
    .replace(/&#x27;/gi, "'");
}

function stripTagsPreserveBlocks(html: string) {
  return decodeHtml(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<\/?(?:section|article|div|li|p|main|aside|footer|header|nav|table|tr|td|th|ul|ol|br|h[1-6]|a|button)[^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/[ \t]+/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

function tokenize(text: string) {
  return text.match(/\b[\w%'.-]+\b/g) ?? [];
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => typeof value === "string" && value.trim().length > 0))];
}

function toPageRole(pageType: PageType): ObservedPageRole {
  switch (pageType) {
    case "homepage":
      return "core";
    case "pricing":
      return "pricing";
    case "product":
    case "signup":
    case "checkout":
    case "login":
      return "product";
    case "privacy_policy":
    case "terms_of_service":
    case "cookie_policy":
    case "refund_policy":
    case "shipping_policy":
    case "subscription_terms":
    case "affiliate_disclosure":
    case "advertising_disclosure":
      return "legal";
    case "contact":
      return "contact";
    case "about":
      return "about";
    case "support":
      return "support";
    default:
      return "other";
  }
}

function buildBlocks(page: StaticPageResult): FinancialBlock[] {
  const source = page.html.trim().length > 0 ? stripTagsPreserveBlocks(page.html) : page.textContent;
  const rawBlocks = source
    .split("\n")
    .map((block) => block.replace(/\s+/g, " ").trim())
    .filter((block) => block.length >= 20);

  if (rawBlocks.length === 0 && page.textContent.trim().length > 0) {
    rawBlocks.push(page.textContent.trim());
  }

  let tokenCursor = 0;
  return rawBlocks.map((text, index) => {
    const tokenCount = tokenize(text).length;
    const block = {
      blockIndex: index,
      pageRole: toPageRole(page.pageType),
      pageType: page.pageType,
      pageUrl: page.pageUrl,
      text,
      tokenStart: tokenCursor,
      tokenEnd: tokenCursor + Math.max(0, tokenCount - 1)
    } satisfies FinancialBlock;
    tokenCursor += tokenCount;
    return block;
  });
}

function computeCrawlDepths(pages: StaticPageResult[]) {
  const byUrl = new Map(pages.map((page) => [page.pageUrl, page]));
  const homepage = pages.find((page) => page.pageType === "homepage") ?? pages[0] ?? null;
  const depths = new Map<string, number | null>(pages.map((page) => [page.pageUrl, null]));

  if (!homepage) {
    return depths;
  }

  depths.set(homepage.pageUrl, 0);
  const queue = [homepage.pageUrl];
  while (queue.length > 0) {
    const currentUrl = queue.shift()!;
    const currentDepth = depths.get(currentUrl);
    const page = byUrl.get(currentUrl);

    if (typeof currentDepth !== "number" || !page) {
      continue;
    }

    for (const link of page.links) {
      if (!byUrl.has(link.href) || depths.get(link.href) !== null) {
        continue;
      }

      depths.set(link.href, currentDepth + 1);
      queue.push(link.href);
    }
  }

  for (const page of pages) {
    if (depths.get(page.pageUrl) !== null) {
      continue;
    }

    depths.set(page.pageUrl, page.pageType === "homepage" ? 0 : 1);
  }

  return depths;
}

function canonicalizeEntityName(name: string) {
  return name
    .toLowerCase()
    .replace(/\b(?:llc|l\.l\.c\.|inc\.?|incorporated|corp\.?|corporation|ltd\.?|limited|llp|lp|plc)\b/g, "")
    .replace(/\b(?:copyright|all rights reserved|dba|doing business as)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function buildEvidenceId(input: {
  matchedText: string | null;
  pageUrl: string;
  signalKey: string;
  tokenEnd: number | null;
  tokenStart: number | null;
}) {
  return stableHash(input).slice(0, 24);
}

function pushEvidenceAndHit(
  accumulator: {
    evidence: ObservedPageEvidence[];
    hits: SignalHitAccumulator[];
  },
  input: {
    block: FinancialBlock;
    detectorName: string;
    detectorType: ScanSignalHit["detectorType"];
    matchedText: string | null;
    metadata?: Record<string, unknown>;
    pageUrl?: string;
    signalKey: FinancialSignalKey;
    tokenEnd?: number | null;
    tokenStart?: number | null;
  }
) {
  const tokenStart = input.tokenStart ?? input.block.tokenStart;
  const tokenEnd = input.tokenEnd ?? input.block.tokenEnd;
  const evidenceId = buildEvidenceId({
    matchedText: input.matchedText,
    pageUrl: input.pageUrl ?? input.block.pageUrl,
    signalKey: input.signalKey,
    tokenEnd,
    tokenStart
  });
  accumulator.evidence.push({
    evidenceId,
    scanId: "",
    pageUrl: input.pageUrl ?? input.block.pageUrl,
    pageType: input.block.pageType,
    pageRole: input.block.pageRole,
    crawlDepth: null,
    sourceKind: input.detectorType === "page_classifier" ? "page_metadata" : "dom_text",
    matchedText: input.matchedText,
    selector: null,
    domPath: null,
    containerSelector: null,
    containerDomPath: null,
    siblingIndex: input.block.blockIndex,
    tokenStart,
    tokenEnd,
    screenshotRef: null,
    metadata: input.metadata ?? null
  });

  const existing = accumulator.hits.find(
    (hit) => hit.signalKey === input.signalKey && hit.pageUrl === (input.pageUrl ?? input.block.pageUrl)
  );
  if (existing) {
    existing.evidenceRefs.push(evidenceId);
    existing.payload.count = Number(existing.payload.count ?? 0) + 1;
    existing.payload.matchedTexts = uniqueStrings([
      ...((existing.payload.matchedTexts as string[] | undefined) ?? []),
      input.matchedText
    ]);
    return;
  }

  accumulator.hits.push({
    signalKey: input.signalKey,
    detectorName: input.detectorName,
    detectorType: input.detectorType,
    evidenceRefs: [evidenceId],
    pageRole: input.block.pageRole,
    pageType: input.block.pageType,
    pageUrl: input.pageUrl ?? input.block.pageUrl,
    payload: {
      count: 1,
      matchedTexts: uniqueStrings([input.matchedText]),
      ...(input.metadata ?? {})
    }
  });
}

function detectPatternMatches(
  accumulator: { evidence: ObservedPageEvidence[]; hits: SignalHitAccumulator[] },
  blocksByPage: Map<string, FinancialBlock[]>,
  definition: MatchPatternDefinition
) {
  for (const blocks of blocksByPage.values()) {
    for (const block of blocks) {
      for (const pattern of definition.patterns) {
        pattern.lastIndex = 0;
        const matches = [...block.text.matchAll(pattern)];
        for (const match of matches) {
          pushEvidenceAndHit(accumulator, {
            block,
            detectorName: definition.detectorName,
            detectorType: definition.detectorType,
            matchedText: (match[0] ?? "").trim(),
            metadata: { matchedPattern: pattern.source },
            signalKey: definition.signalKey
          });
        }
      }
    }
  }
}

function buildPageClassifierBlock(page: StaticPageResult): FinancialBlock {
  const title = page.title?.trim() ? `${page.title.trim()} ` : "";
  return {
    blockIndex: 0,
    pageRole: toPageRole(page.pageType),
    pageType: page.pageType,
    pageUrl: page.pageUrl,
    text: `${title}${page.pageUrl}`.trim(),
    tokenStart: 0,
    tokenEnd: Math.max(0, tokenize(`${title}${page.pageUrl}`.trim()).length - 1)
  };
}

function hasHighRiskSignalKey(key: string) {
  return key.startsWith("financial.leverage_") ||
    key.startsWith("financial.margin_trading_") ||
    key.startsWith("financial.options_or_futures_") ||
    key.startsWith("financial.perpetuals_or_derivatives_") ||
    key.startsWith("financial.staking_apy_") ||
    key.startsWith("financial.copy_trading_") ||
    key.startsWith("financial.ai_trading_");
}

function hasPerformanceClaimKey(key: string) {
  return (
    key === "financial.performance_claim_text_present" ||
    key === "financial.return_or_yield_percentage_present" ||
    key === "financial.investment_outperformance_language_present" ||
    key === "financial.guaranteed_return_language_present" ||
    key === "financial.low_risk_high_return_language_present" ||
    key === "financial.hypothetical_or_backtest_language_present"
  );
}

function findNearestBlockDistance(source: FinancialBlock, candidates: FinancialBlock[]) {
  let nearest: number | null = null;
  for (const candidate of candidates) {
    if (candidate.pageUrl !== source.pageUrl) {
      continue;
    }
    const distance = Math.abs(candidate.blockIndex - source.blockIndex);
    if (nearest === null || distance < nearest) {
      nearest = distance;
    }
  }
  return nearest;
}

export function analyzeFinancialSignals(input: FinancialAnalysisInput): FinancialAnalysisResult {
  const crawlDepthByPage = computeCrawlDepths(input.pages);
  const blocksByPage = new Map(input.pages.map((page) => [page.pageUrl, buildBlocks(page)]));
  const accumulator = {
    evidence: [] as ObservedPageEvidence[],
    hits: [] as SignalHitAccumulator[]
  };

  for (const definition of [...PERFORMANCE_CLAIM_PATTERNS, ...ENTITY_PATTERNS, ...COMMERCIAL_PATTERNS, ...HIGH_RISK_PATTERNS]) {
    detectPatternMatches(accumulator, blocksByPage, definition);
  }

  for (const page of input.pages) {
    const pageBlock = buildPageClassifierBlock(page);
    if (page.pageType === "pricing") {
      pushEvidenceAndHit(accumulator, {
        block: pageBlock,
        detectorName: "commercial_pricing_page",
        detectorType: "page_classifier",
        matchedText: page.pageUrl,
        signalKey: "commercial.pricing_page_present"
      });
    }
    if (page.pageType === "about") {
      pushEvidenceAndHit(accumulator, {
        block: pageBlock,
        detectorName: "entity_about_page",
        detectorType: "page_classifier",
        matchedText: page.pageUrl,
        signalKey: "entity.about_page_present"
      });
    }
    if (/team|leadership|founders?|management/i.test(`${page.title ?? ""} ${page.pageUrl}`)) {
      pushEvidenceAndHit(accumulator, {
        block: pageBlock,
        detectorName: "entity_team_or_leadership_page",
        detectorType: "page_classifier",
        matchedText: page.pageUrl,
        signalKey: "entity.team_or_leadership_page_present"
      });
    }
    if (page.forms.length > 0 && /contact|support|help|request/i.test(`${page.title ?? ""} ${page.textContent} ${page.pageUrl}`)) {
      pushEvidenceAndHit(accumulator, {
        block: pageBlock,
        detectorName: "entity_contact_form_page",
        detectorType: "page_classifier",
        matchedText: "contact form present",
        signalKey: "entity.contact_form_present"
      });
    }
    if (FEE_SCHEDULE_TERMS.test(`${page.title ?? ""} ${page.textContent}`) || (/<table/i.test(page.html) && /\b(?:fee|commission|spread)\b/i.test(page.textContent))) {
      pushEvidenceAndHit(accumulator, {
        block: pageBlock,
        detectorName: "commercial_fee_schedule_table",
        detectorType: "page_classifier",
        matchedText: page.title ?? page.pageUrl,
        signalKey: "commercial.fee_schedule_table_present"
      });
    }
    if (HIGH_RISK_EXPLAINER_TERMS.test(`${page.title ?? ""} ${page.textContent}`)) {
      pushEvidenceAndHit(accumulator, {
        block: pageBlock,
        detectorName: "financial_high_risk_product_explainer_page",
        detectorType: "page_classifier",
        matchedText: page.title ?? page.pageUrl,
        signalKey: "financial.high_risk_product_explainer_page_present"
      });
    }
  }

  for (const blocks of blocksByPage.values()) {
    const claimBlocks = blocks.filter((block) =>
      PERFORMANCE_CLAIM_PATTERNS.some((definition) =>
        accumulator.hits.some((hit) => hit.signalKey === definition.signalKey && hit.pageUrl === block.pageUrl && hit.evidenceRefs.some((ref) => {
          const evidence = accumulator.evidence.find((item) => item.evidenceId === ref);
          return evidence?.siblingIndex === block.blockIndex;
        }))
      )
    );

    for (const block of claimBlocks) {
      if (CLAIM_CTA_TERMS.test(block.text)) {
        pushEvidenceAndHit(accumulator, {
          block,
          detectorName: "financial_claim_cta_block",
          detectorType: "dom_classifier",
          matchedText: block.text.slice(0, 280),
          signalKey: "financial.claim_cta_block_present"
        });
      }

      const nearbyBlocks = blocks.filter((candidate) => Math.abs(candidate.blockIndex - block.blockIndex) <= LOCAL_DISCLOSURE_DOM_SIBLING_RADIUS);
      if (nearbyBlocks.some((candidate) => TESTIMONIAL_TERMS.test(candidate.text))) {
        pushEvidenceAndHit(accumulator, {
          block,
          detectorName: "financial_testimonial_near_claim",
          detectorType: "dom_classifier",
          matchedText: block.text.slice(0, 280),
          signalKey: "financial.testimonial_or_review_block_near_financial_claim_present"
        });
      }
    }

    for (const block of blocks) {
      if (VARIABLE_FEE_TERMS.test(block.text) && !VARIABLE_FEE_EXPLANATION_TERMS.test(block.text)) {
        pushEvidenceAndHit(accumulator, {
          block,
          detectorName: "commercial_variable_fee_without_explanation",
          detectorType: "dom_classifier",
          matchedText: block.text.slice(0, 280),
          signalKey: "commercial.variable_fee_language_present_without_explanation"
        });
      }
    }
  }

  const entityNames = uniqueStrings(
    input.pages.flatMap((page) =>
      [...(`${page.title ?? ""}\n${page.textContent}`).matchAll(/\b([A-Z][A-Za-z0-9&.,' -]{2,}\s+(?:LLC|L\.L\.C\.|Inc\.?|Incorporated|Corp\.?|Corporation|Ltd\.?|Limited|LLP|LP|PLC))\b/g)].map(
        (match) => canonicalizeEntityName(match[1] ?? "")
      )
    )
  ).filter((value) => value.length >= 4);

  if (entityNames.length > 1) {
    const homepage = input.pages.find((page) => page.pageType === "homepage") ?? input.pages[0];
    if (homepage) {
      pushEvidenceAndHit(accumulator, {
        block: buildPageClassifierBlock(homepage),
        detectorName: "entity_multiple_names_detected",
        detectorType: "page_classifier",
        matchedText: entityNames.join(", "),
        metadata: { canonicalEntityNames: entityNames },
        signalKey: "entity.multiple_entity_names_detected_on_site"
      });
    }
  }

  const pageEvidence = accumulator.evidence.map((evidence) => ({
    ...evidence,
    scanId: input.scanId,
    crawlDepth: crawlDepthByPage.get(evidence.pageUrl) ?? null
  }));
  const signalHits: ScanSignalHit[] = accumulator.hits.map((hit) => ({
    id: stableHash({
      detectorName: hit.detectorName,
      pageUrl: hit.pageUrl,
      signalKey: hit.signalKey
    }).slice(0, 24),
    scanId: input.scanId,
    signalKey: hit.signalKey,
    detectorName: hit.detectorName,
    detectorType: hit.detectorType,
    detectorVersion: FINANCIAL_SIGNAL_DETECTOR_VERSION,
    pageUrl: hit.pageUrl,
    pageType: hit.pageType,
    pageRole: hit.pageRole,
    evidenceRefs: uniqueStrings(hit.evidenceRefs),
    payload: hit.payload
  }));

  const signalKeySet = new Set(signalHits.map((hit) => hit.signalKey));
  const performanceClaimCount = signalHits.filter((hit) => hasPerformanceClaimKey(hit.signalKey)).length;
  const financialClaimWithCtaCount = signalHits.filter((hit) => hit.signalKey === "financial.claim_cta_block_present").length;
  const pricingDepths = signalHits
    .filter((hit) => hit.signalKey === "commercial.pricing_page_present" || hit.signalKey === "commercial.fee_schedule_table_present")
    .map((hit) => crawlDepthByPage.get(hit.pageUrl))
    .filter((value): value is number => typeof value === "number");
  const materialFeeTermsMinLinkDepth = pricingDepths.length > 0 ? Math.min(...pricingDepths) : null;
  const highRiskProductSignalCount = signalHits.filter((hit) => hasHighRiskSignalKey(hit.signalKey)).length;

  const summary: FinancialSignalSummaryFields = {
    performanceClaimPresent: performanceClaimCount > 0,
    performanceClaimCount,
    returnOrYieldPercentagePresent: signalKeySet.has("financial.return_or_yield_percentage_present"),
    investmentOutperformanceLanguagePresent: signalKeySet.has("financial.investment_outperformance_language_present"),
    guaranteedReturnLanguagePresent: signalKeySet.has("financial.guaranteed_return_language_present"),
    lowRiskHighReturnLanguagePresent: signalKeySet.has("financial.low_risk_high_return_language_present"),
    hypotheticalOrBacktestLanguagePresent: signalKeySet.has("financial.hypothetical_or_backtest_language_present"),
    testimonialOrReviewBlockNearFinancialClaimPresent: signalKeySet.has("financial.testimonial_or_review_block_near_financial_claim_present"),
    riskDisclosureTextPresent: signalKeySet.has("financial.risk_disclosure_text_present"),
    claimCtaBlockPresent: signalKeySet.has("financial.claim_cta_block_present"),
    financialClaimWithCtaCount,
    aboutPagePresent: signalKeySet.has("entity.about_page_present"),
    teamOrLeadershipPagePresent: signalKeySet.has("entity.team_or_leadership_page_present"),
    jurisdictionOrOperatingEntityTextPresent: signalKeySet.has("entity.jurisdiction_or_operating_entity_text_present"),
    registrationClaimPresent: signalKeySet.has("entity.regulatory_or_license_claim_text_present"),
    registrationIdentifierPresent: signalKeySet.has("entity.registration_identifier_text_present"),
    multipleEntityNamesDetected: signalKeySet.has("entity.multiple_entity_names_detected_on_site"),
    entityTransparencySurfaceScore: [
      signalKeySet.has("entity.legal_entity_name_text_present"),
      signalKeySet.has("entity.company_address_text_present"),
      signalKeySet.has("entity.contact_email_present") || signalKeySet.has("entity.contact_phone_present") || signalKeySet.has("entity.contact_form_present"),
      signalKeySet.has("entity.about_page_present"),
      signalKeySet.has("entity.team_or_leadership_page_present"),
      signalKeySet.has("entity.jurisdiction_or_operating_entity_text_present")
    ].filter(Boolean).length,
    pricingPagePresent: signalKeySet.has("commercial.pricing_page_present"),
    feeRelatedTextPresent: signalKeySet.has("commercial.fee_related_text_present"),
    feeSchedulePresent: signalKeySet.has("commercial.fee_schedule_table_present"),
    withdrawalTermsPresent: signalKeySet.has("commercial.withdrawal_redemption_terms_text_present"),
    cancellationTermsPresent: signalKeySet.has("commercial.cancellation_terms_text_present"),
    accountClosureTermsPresent: signalKeySet.has("commercial.account_closure_terms_text_present"),
    promoPriceOrFreeClaimPresent: signalKeySet.has("commercial.promo_price_or_free_claim_present"),
    variableFeeLanguageWithoutExplanation: signalKeySet.has("commercial.variable_fee_language_present_without_explanation"),
    materialFeeTermsMinLinkDepth,
    leverageLanguagePresent: signalKeySet.has("financial.leverage_language_present"),
    marginTradingLanguagePresent: signalKeySet.has("financial.margin_trading_language_present"),
    optionsOrFuturesLanguagePresent: signalKeySet.has("financial.options_or_futures_language_present"),
    perpetualsOrDerivativesLanguagePresent: signalKeySet.has("financial.perpetuals_or_derivatives_language_present"),
    stakingApyLanguagePresent: signalKeySet.has("financial.staking_apy_language_present"),
    copyTradingLanguagePresent: signalKeySet.has("financial.copy_trading_language_present"),
    aiTradingLanguagePresent: signalKeySet.has("financial.ai_trading_or_automated_trading_language_present"),
    lossRiskDisclosureTextPresent: signalKeySet.has("financial.loss_risk_disclosure_text_present"),
    highRiskProductExplainerPagePresent: signalKeySet.has("financial.high_risk_product_explainer_page_present"),
    highRiskProductSignalCount
  };

  return {
    pageEvidence,
    signalHits,
    summary
  };
}

export function getFinancialSignalHitsForPage(signalHits: ScanSignalHit[], pageUrl: string, signalKeys?: string[]) {
  const allowed = signalKeys ? new Set(signalKeys) : null;
  return signalHits.filter((hit) => hit.pageUrl === pageUrl && (allowed === null || allowed.has(hit.signalKey)));
}

export function getObservedEvidenceByIds(pageEvidence: ObservedPageEvidence[], evidenceRefs: string[]) {
  const wanted = new Set(evidenceRefs);
  return pageEvidence.filter((evidence) => wanted.has(evidence.evidenceId));
}

export function collectBlocksForSignalHits(pageEvidence: ObservedPageEvidence[], signalHits: ScanSignalHit[]) {
  return signalHits
    .flatMap((hit) => getObservedEvidenceByIds(pageEvidence, hit.evidenceRefs))
    .filter((evidence) => evidence.siblingIndex !== null)
    .map((evidence) => ({
      pageUrl: evidence.pageUrl,
      siblingIndex: evidence.siblingIndex ?? 0,
      tokenStart: evidence.tokenStart ?? 0,
      tokenEnd: evidence.tokenEnd ?? 0
    }));
}

export function getNearestDisclosureDistance(params: {
  claimHits: ScanSignalHit[];
  disclosureHits: ScanSignalHit[];
  pageEvidence: ObservedPageEvidence[];
}) {
  const disclosureBlocks = collectBlocksForSignalHits(params.pageEvidence, params.disclosureHits);

  return params.claimHits.map((claimHit) => {
    const claimBlocks = collectBlocksForSignalHits(params.pageEvidence, [claimHit]);
    let nearestSiblingDistance: number | null = null;
    let nearestTokenDistance: number | null = null;

    for (const claimBlock of claimBlocks) {
      const samePageDisclosures = disclosureBlocks.filter((disclosure) => disclosure.pageUrl === claimBlock.pageUrl);
      const siblingDistance = findNearestBlockDistance(
        {
          blockIndex: claimBlock.siblingIndex,
          pageRole: "other",
          pageType: "other",
          pageUrl: claimBlock.pageUrl,
          text: "",
          tokenStart: claimBlock.tokenStart,
          tokenEnd: claimBlock.tokenEnd
        },
        samePageDisclosures.map((disclosure) => ({
          blockIndex: disclosure.siblingIndex,
          pageRole: "other",
          pageType: "other",
          pageUrl: disclosure.pageUrl,
          text: "",
          tokenStart: disclosure.tokenStart,
          tokenEnd: disclosure.tokenEnd
        }))
      );
      if (siblingDistance !== null && (nearestSiblingDistance === null || siblingDistance < nearestSiblingDistance)) {
        nearestSiblingDistance = siblingDistance;
      }

      for (const disclosure of samePageDisclosures) {
        const tokenDistance = Math.min(
          Math.abs((disclosure.tokenStart ?? 0) - (claimBlock.tokenEnd ?? 0)),
          Math.abs((claimBlock.tokenStart ?? 0) - (disclosure.tokenEnd ?? 0))
        );
        if (nearestTokenDistance === null || tokenDistance < nearestTokenDistance) {
          nearestTokenDistance = tokenDistance;
        }
      }
    }

    return {
      claimHit,
      nearestSiblingDistance,
      nearestTokenDistance
    };
  });
}
