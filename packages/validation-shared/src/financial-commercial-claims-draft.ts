import { readFileSync } from "node:fs";
import process from "node:process";
import {
  type FinancialCommercialClaimCandidateInput,
  type FinancialCommercialClaimClassification
} from "./financial-commercial-claims";
import {
  deriveFinancialCommercialExpectedCardMode,
  deriveFinancialCommercialExpectedFindingIds
} from "./financial-commercial-claims-eval";
import type {
  FinancialCommercialClaimsCardExpectationMode,
  FinancialCommercialClaimsDatasetBucket,
  FinancialCommercialClaimsEmittableFindingId,
  FinancialCommercialClaimsPageExpectation
} from "./financial-commercial-claims.dataset";

type DraftSourceType = FinancialCommercialClaimCandidateInput["sourceType"];
type DraftSplit = "train" | "eval";

export type FinancialCommercialClaimsDraftInput = {
  adjacentAfter?: string | null;
  adjacentBefore?: string | null;
  blockHeading?: string | null;
  blockText: string;
  bucket?: FinancialCommercialClaimsDatasetBucket;
  candidateSignals?: string[];
  id?: string;
  notes?: string;
  pageType?: string | null;
  pageUrl?: string | null;
  sourceType?: DraftSourceType;
  sourceUrl?: string;
  split?: DraftSplit;
};

export type FinancialCommercialClaimsDraft = {
  expected: FinancialCommercialClaimClassification;
  id: string;
  input: FinancialCommercialClaimCandidateInput;
  notes: string;
  pageExpectation: FinancialCommercialClaimsPageExpectation;
  bucket: FinancialCommercialClaimsDatasetBucket;
  sourceUrl?: string;
  split: DraftSplit;
};

const SIGNAL_RULES = [
  { pattern: /\b(?:profit|profits|profitable|earn|earned|earning|earnings|income|cash flow|cashflow)\b/i, signal: "earnings" },
  { pattern: /\b(?:return|returns|yield|apy|apr|roi|performance)\b/i, signal: "returns" },
  { pattern: /\b\d{1,4}(?:\.\d+)?%\b/, signal: "percentage" },
  { pattern: /\b(?:guaranteed|guarantee|assured|risk[- ]free)\b/i, signal: "guarantee" },
  { pattern: /\b(?:backtest|backtested|hypothetical|simulated|historical results?|paper trading)\b/i, signal: "simulated" },
  { pattern: /\b(?:price|pricing|fee|fees|commission|spread|cost|free)\b/i, signal: "pricing" },
  { pattern: /\b(?:fee|fees|commission|spread|cost)\b/i, signal: "pricing_fee" },
  { pattern: /\b(?:best|top|leading|highest|number\s*1|#1|most|fastest|ultimate|premier)\b/i, signal: "superlative" },
  { pattern: /\b(?:today|now|limited|only \d+ spots|before .*? ends|48 hours?|deadline|expires?)\b/i, signal: "urgency" },
  { pattern: /\b(?:sign up|join|start|open account|get started|subscribe|unlock|create your account|book a demo|start now)\b/i, signal: "cta" },
  { pattern: /\b(?:trading|forex|crypto|invest|investment|signals|copy trading|portfolio|futures|options)\b/i, signal: "investment_context" },
  { pattern: /\b(?:testimonial|review|rated|trusted by|what traders say|results from users)\b/i, signal: "results_social_proof" }
] as const;

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/https?:\/\//g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
}

function compactWhitespace(value: string | null | undefined) {
  return value?.replace(/\s+/g, " ").trim() || null;
}

const ID_STOPWORDS = new Set([
  "a",
  "account",
  "and",
  "any",
  "for",
  "from",
  "get",
  "how",
  "in",
  "into",
  "my",
  "of",
  "on",
  "our",
  "start",
  "the",
  "to",
  "with",
  "your"
]);

function getPageSlug(pageType: string | null) {
  const normalized = pageType?.toLowerCase() ?? "";

  if (normalized.includes("home")) {
    return "home";
  }
  if (normalized.includes("pricing")) {
    return "pricing";
  }
  if (normalized.includes("checkout")) {
    return "checkout";
  }
  if (normalized.includes("lead")) {
    return "lead";
  }
  if (normalized.includes("legal") || normalized.includes("terms") || normalized.includes("privacy")) {
    return "legal";
  }

  const fallback = slugify(normalized);
  return fallback || "page";
}

function getHostSlug(pageUrl: string | null) {
  if (!pageUrl) {
    return "example";
  }

  try {
    const hostname = new URL(pageUrl).hostname.toLowerCase().replace(/^www\./, "");
    const parts = hostname.split(".").filter(Boolean);
    if (parts.length >= 2) {
      return slugify(parts[parts.length - 2] ?? hostname) || "example";
    }
    return slugify(hostname) || "example";
  } catch {
    return slugify(pageUrl) || "example";
  }
}

function getClaimKeyword(claimType: FinancialCommercialClaimClassification["claimType"]) {
  switch (claimType) {
    case "earnings_claim":
      return "profit";
    case "return_performance_claim":
      return "returns";
    case "pricing_fee_claim":
      return "fees";
    case "simulated_performance_claim":
      return "backtest";
    case "guaranteed_outcome_claim":
      return "guaranteed";
    case "urgency_conversion_claim":
      return "urgency";
    case "superlative_claim":
      return "best";
    default:
      return "claim";
  }
}

function getPhraseTokens(text: string | null, fallbackText: string, claimKeyword: string) {
  const source = compactWhitespace(text) ?? compactWhitespace(fallbackText) ?? "";
  const tokens = source.match(/[a-z0-9]+/gi) ?? [];
  const filtered: string[] = [];
  const seenCanonical = new Set<string>();

  for (const token of tokens.map((value) => value.toLowerCase())) {
    const canonicalToken = token
      .replace(/(?:ing|ed|es|s)$/i, "")
      .replace(/i$/i, "y");

    if (
      token.length <= 2 ||
      ID_STOPWORDS.has(token) ||
      token === claimKeyword ||
      canonicalToken === claimKeyword
    ) {
      continue;
    }
    if (filtered.includes(token) || seenCanonical.has(canonicalToken)) {
      continue;
    }
    seenCanonical.add(canonicalToken);
    filtered.push(token);
    if (filtered.length >= 2) {
      break;
    }
  }

  return filtered;
}

function buildDraftId(input: {
  blockHeading: string | null;
  blockText: string;
  claimText: string | null;
  claimType: FinancialCommercialClaimClassification["claimType"];
  pageType: string | null;
  pageUrl: string | null;
}) {
  const hostSlug = getHostSlug(input.pageUrl);
  const pageSlug = getPageSlug(input.pageType);
  const claimSlug = getClaimKeyword(input.claimType);
  const phraseTokens = getPhraseTokens(input.claimText ?? input.blockHeading, input.blockText, claimSlug);

  return slugify([hostSlug, pageSlug, claimSlug, ...phraseTokens].join("-"));
}

function pickClaimText(params: {
  blockText: string;
  blockHeading: string | null;
  claimType: FinancialCommercialClaimClassification["claimType"];
}) {
  const heading = params.blockHeading ? compactWhitespace(params.blockHeading) : null;
  const text = compactWhitespace(params.blockText) ?? "";

  if (params.claimType === "guaranteed_outcome_claim") {
    return text.match(/\b[^.?!]*guarante(?:e|ed)[^.?!]*/i)?.[0]?.trim() ?? heading ?? text;
  }
  if (params.claimType === "simulated_performance_claim") {
    return text.match(/\b[^.?!]*(?:backtest(?:ed)?|simulated|historical performance)[^.?!]*/i)?.[0]?.trim() ?? heading ?? text;
  }
  if (params.claimType === "pricing_fee_claim") {
    return text.match(/\b[^.?!]*(?:free|price|pricing|fee|fees|commission|spread|cost)[^.?!]*/i)?.[0]?.trim() ?? text;
  }
  if (params.claimType === "urgency_conversion_claim") {
    return text.match(/\b[^.?!]*(?:today|now|limited|deadline|48 hours?|expires?)[^.?!]*/i)?.[0]?.trim() ?? text;
  }
  if (params.claimType === "superlative_claim") {
    return text.match(/\b[^.?!]*(?:best|top|leading|highest|number\s*1|#1|most|fastest|ultimate|premier)[^.?!]*/i)?.[0]?.trim() ?? text;
  }
  if (params.claimType === "earnings_claim") {
    return text.match(/\b[^.?!]*(?:profit|profits|profitable|earn|earned|earning|earnings|income|cash flow|cashflow)[^.?!]*/i)?.[0]?.trim() ?? text;
  }
  if (params.claimType === "return_performance_claim") {
    return text.match(/\b[^.?!]*(?:return|returns|yield|apy|apr|roi|performance|\d{1,4}(?:\.\d+)?%)[^.?!]*/i)?.[0]?.trim() ?? text;
  }
  return null;
}

function inferCandidateSignals(input: FinancialCommercialClaimsDraftInput) {
  const sourceText = [
    input.blockHeading,
    input.blockText,
    input.adjacentBefore,
    input.adjacentAfter,
    input.pageType,
    input.pageUrl
  ]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join("\n");

  const signals = new Set(input.candidateSignals ?? []);
  for (const rule of SIGNAL_RULES) {
    if (rule.pattern.test(sourceText)) {
      signals.add(rule.signal);
    }
  }
  return [...signals];
}

function inferDisclosureType(text: string | null): FinancialCommercialClaimClassification["adjacentDisclosureType"] | null {
  if (!text) {
    return null;
  }
  if (/\b(?:hypothetical|simulated|backtest(?:ed)?|not live results)\b/i.test(text)) {
    return "simulation_disclaimer";
  }
  if (/\b(?:not guaranteed|capital at risk|investing involves risk|may lose)\b/i.test(text)) {
    return "risk_disclosure";
  }
  if (/\b(?:terms apply|eligibility|conditions apply)\b/i.test(text)) {
    return "eligibility_or_conditions";
  }
  if (/\b(?:transaction fee|management fee|service fee|withdrawal fee|additional trading or deposit fees|fees are in addition to|pricing terms|price is|cost is|commission is|spread is)\b/i.test(text)) {
    return "pricing_terms";
  }
  if (/\b(?:disclaimer|for illustrative purposes)\b/i.test(text)) {
    return "other";
  }
  return null;
}

function inferClaimType(input: {
  blockText: string;
  signals: string[];
}): FinancialCommercialClaimClassification["claimType"] {
  const text = input.blockText;
  const signalSet = new Set(input.signals);

  if (/\b(?:guaranteed|guarantee|assured|risk[- ]free)\b/i.test(text)) {
    return "guaranteed_outcome_claim";
  }
  if (/\b(?:backtest|backtested|hypothetical|simulated|historical performance)\b/i.test(text) || signalSet.has("simulated")) {
    return "simulated_performance_claim";
  }
  if (/\b(?:best|top|leading|highest|number\s*1|#1|most|fastest|ultimate|premier)\b/i.test(text) || signalSet.has("superlative")) {
    return "superlative_claim";
  }
  if (/\b(?:today|now|limited|48 hours?|deadline|expires?)\b/i.test(text) && signalSet.has("cta")) {
    return "urgency_conversion_claim";
  }
  if (/\b(?:profit|profits|profitable|earn|earned|earning|earnings|income|cash flow|cashflow)\b/i.test(text)) {
    return "earnings_claim";
  }
  if (/\b(?:return|returns|yield|apy|apr|roi|performance|\d{1,4}(?:\.\d+)?%)\b/i.test(text)) {
    return "return_performance_claim";
  }
  if (/\b(?:price|pricing|fee|fees|commission|spread|free)\b/i.test(text) && signalSet.has("pricing")) {
    return "pricing_fee_claim";
  }
  return "none";
}

function inferContextType(input: {
  pageType: string | null;
  signals: string[];
  claimType: FinancialCommercialClaimClassification["claimType"];
}) {
  const pageType = input.pageType?.toLowerCase() ?? "";
  const signalSet = new Set(input.signals);

  if (pageType.includes("pricing")) {
    return "pricing_page";
  }
  if (pageType.includes("checkout")) {
    return "checkout_offer";
  }
  if (pageType.includes("lead")) {
    return "lead_generation_offer";
  }
  if (pageType.includes("legal") || pageType.includes("terms") || pageType.includes("privacy")) {
    return "legal_disclosure";
  }
  if (signalSet.has("investment_context") || input.claimType === "guaranteed_outcome_claim" || input.claimType === "simulated_performance_claim") {
    return "financial_offer";
  }
  if (signalSet.has("pricing")) {
    return "subscription_offer";
  }
  return input.claimType === "none" ? "unknown" : "marketing_page";
}

function inferBucket(input: {
  claimType: FinancialCommercialClaimClassification["claimType"];
  findingIds: FinancialCommercialClaimsEmittableFindingId[];
  commercialContext: boolean;
}) {
  if (input.findingIds.length > 0) {
    return input.claimType === "pricing_fee_claim" ? "positive_borderline" : "positive_high_confidence";
  }
  if (!input.commercialContext) {
    return "negative_nonfinancial";
  }
  return input.claimType === "none" ? "adversarial_negative" : "negative_financial";
}

export function buildFinancialCommercialClaimsDraft(input: FinancialCommercialClaimsDraftInput): FinancialCommercialClaimsDraft {
  const adjacentAfter = compactWhitespace(input.adjacentAfter);
  const adjacentBefore = compactWhitespace(input.adjacentBefore);
  const blockHeading = compactWhitespace(input.blockHeading);
  const blockText = compactWhitespace(input.blockText) ?? "";
  const pageType = compactWhitespace(input.pageType);
  const pageUrl = compactWhitespace(input.pageUrl);
  const sourceType = input.sourceType ?? "document_source";
  const signals = inferCandidateSignals({ ...input, adjacentAfter, adjacentBefore, blockHeading, blockText, pageType, pageUrl });
  const signalSet = new Set(signals);
  const claimType = inferClaimType({ blockText, signals });
  const adjacentDisclosureText = adjacentAfter;
  const adjacentDisclosureType = inferDisclosureType(adjacentDisclosureText);
  const claimPresent = claimType !== "none";
  const commercialContext = signalSet.has("investment_context") ||
    /pricing|checkout|financial_offer|lead/i.test(pageType ?? "") ||
    (claimType === "pricing_fee_claim" && signalSet.has("pricing"));
  const expected: FinancialCommercialClaimClassification = {
    claimPresent,
    claimType,
    claimText: pickClaimText({ blockText, blockHeading, claimType }),
    commercialContext,
    contextType: inferContextType({ pageType, signals, claimType }),
    adjacentDisclosurePresent: Boolean(adjacentDisclosureType),
    adjacentDisclosureType,
    adjacentDisclosureText: adjacentDisclosureType ? adjacentDisclosureText : null,
    guaranteeLanguage: /\b(?:guaranteed|guarantee|assured|risk[- ]free)\b/i.test(blockText),
    superlativeLanguage: /\b(?:best|top|leading|highest|number\s*1|#1|most|fastest|ultimate|premier)\b/i.test(blockText),
    simulatedPerformanceLanguage: /\b(?:backtest|backtested|hypothetical|simulated|historical performance)\b/i.test(blockText),
    urgencyPresent: /\b(?:today|now|limited|only \d+ spots|48 hours?|deadline|expires?)\b/i.test([blockText, adjacentAfter].filter(Boolean).join(" ")),
    urgencyTiedToConversion: /\b(?:join|sign up|start|open account|get started|subscribe|unlock|deposit|pay)\b/i.test([blockText, adjacentAfter].filter(Boolean).join(" ")),
    pricingPresent: /\b(?:price|pricing|fee|fees|commission|spread|cost|free)\b/i.test([blockText, adjacentAfter].filter(Boolean).join(" ")),
    feeDisclosurePresent: /\b(?:transaction fee is|management fee|service fee|commission is|spread is|cost is|no additional trading or deposit fees|fees are in addition to)\b/i.test([blockText, adjacentAfter].filter(Boolean).join(" ")),
    confidence: claimType === "none" ? 0.83 : claimType === "pricing_fee_claim" ? 0.79 : 0.9,
    rationaleShort: input.notes ?? "Draft generated from a captured financial-commercial snippet using the current deterministic corpus heuristics."
  };

  const candidate: FinancialCommercialClaimCandidateInput = {
    adjacentAfter,
    adjacentBefore,
    blockHeading,
    blockText,
    candidateSignals: signals,
    pageType,
    pageUrl,
    sourceType
  };

  const expectedFindingIds = deriveFinancialCommercialExpectedFindingIds({
    candidate,
    classification: expected
  });
  const expectedCardMode: FinancialCommercialClaimsCardExpectationMode = deriveFinancialCommercialExpectedCardMode({
    classification: expected,
    findingIds: expectedFindingIds
  });
  const pageExpectation: FinancialCommercialClaimsPageExpectation = {
    expectedFindingIds,
    expectedCardMode,
    shouldShowFinancialCard: expectedCardMode !== "omit"
  };

  const draftId = buildDraftId({
    blockHeading,
    blockText,
    claimText: expected.claimText,
    claimType,
    pageType,
    pageUrl
  });

  return {
    id: input.id ?? draftId,
    bucket: input.bucket ?? inferBucket({
      claimType,
      findingIds: expectedFindingIds,
      commercialContext: expected.commercialContext
    }),
    split: input.split ?? "eval",
    notes: input.notes ?? "Draft generated from a captured financial-commercial snippet using the current deterministic corpus heuristics.",
    sourceUrl: input.sourceUrl,
    input: candidate,
    expected,
    pageExpectation
  };
}

export function formatFinancialCommercialClaimsDraftExample(input: FinancialCommercialClaimsDraftInput) {
  const draft = buildFinancialCommercialClaimsDraft(input);
  const serialized = JSON.stringify(draft, null, 4)
    .replace(/"([^"]+)":/g, "$1:")
    .replace(/\n/g, "\n  ");
  return `example(${serialized}\n})`;
}

function readJsonInput(argv: string[]) {
  const filePath = argv[2];
  const raw = filePath ? readFileSync(filePath, "utf8") : readFileSync(0, "utf8");
  return JSON.parse(raw) as FinancialCommercialClaimsDraftInput;
}

if (require.main === module) {
  const draftInput = readJsonInput(process.argv);
  process.stdout.write(`${formatFinancialCommercialClaimsDraftExample(draftInput)}\n`);
}
