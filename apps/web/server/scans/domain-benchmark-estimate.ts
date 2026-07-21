const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
export const DOMAIN_BENCHMARK_EVENT_TYPE = "presentation.domain_benchmark_estimated";

export type DomainBenchmarkEstimate = {
  confidence: "low" | "medium" | "high";
  estimatedRankLabel: string;
  expectedCookiesBeforeConsent: number;
  expectedOverallScore: number;
  expectedThirdPartyRequests: number;
  industry: string;
  rationale: string;
};

const GENERIC_UNKNOWN_INDUSTRY_PATTERN = /general web|placeholder|brand landing|unknown|generic/i;
const CERTSCORE_HOST_PATTERN = /(^|\.)certscore\.ai$/i;
const DAILY_JP_HOST_PATTERN = /(^|\.)daily\.co\.jp$/i;
const IMOU_HOST_PATTERN = /(^|\.)(?:imoulife\.com|imou\.com)$/i;
const ARUBA_IT_HOST_PATTERN = /(^|\.)aruba\.it$/i;

function getString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function getFiniteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function clampNumber(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function shouldAllowZeroCookieEstimate(input: { industry: string; rationale: string }) {
  const haystack = `${input.industry} ${input.rationale}`.toLowerCase();
  return /minimal static|personal site|placeholder|government|public sector|privacy-first|brochure site|documentation-only|open source project/.test(
    haystack
  );
}

function extractJsonObject(text: string) {
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    return null;
  }

  try {
    return JSON.parse(text.slice(firstBrace, lastBrace + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function getRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function getStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0) : [];
}

function normalizeToken(value: string | null) {
  return value?.trim().toLowerCase().replace(/[_-]+/g, " ") ?? null;
}

export function getDomainBenchmarkEstimateOverride(domainHostname: string | null | undefined): DomainBenchmarkEstimate | null {
  const hostname = domainHostname?.trim().toLowerCase();
  if (!hostname) {
    return null;
  }

  if (DAILY_JP_HOST_PATTERN.test(hostname)) {
    return {
      confidence: "high",
      estimatedRankLabel: "Large Japanese news publisher",
      expectedCookiesBeforeConsent: 4,
      expectedOverallScore: 70,
      expectedThirdPartyRequests: 55,
      industry: "Media / Japanese sports-news publisher",
      rationale: "Matched the daily.co.jp registrable domain; do not collapse the multi-label .co.jp suffix into the unrelated Daily.co video-conferencing brand."
    };
  }

  if (IMOU_HOST_PATTERN.test(hostname)) {
    return {
      confidence: "high",
      estimatedRankLabel: "Global smart-home consumer electronics brand",
      expectedCookiesBeforeConsent: 2,
      expectedOverallScore: 76,
      expectedThirdPartyRequests: 18,
      industry: "Consumer electronics / smart-home security",
      rationale: "Matched the IMOU and IMOU Life registrable domains and their camera, doorbell, smart-lock, and home-security product family."
    };
  }

  if (ARUBA_IT_HOST_PATTERN.test(hostname)) {
    return {
      confidence: "high",
      estimatedRankLabel: "Large Italian digital-infrastructure provider",
      expectedCookiesBeforeConsent: 2,
      expectedOverallScore: 74,
      expectedThirdPartyRequests: 24,
      industry: "Technology / hosting, cloud, PEC and connectivity",
      rationale: "Matched Aruba S.p.A.'s aruba.it service domain and its hosting, cloud, certified-email (PEC), connectivity, and digital-trust product evidence; do not infer the unrelated Aruba tourism entity from the brand name alone."
    };
  }

  if (!CERTSCORE_HOST_PATTERN.test(hostname)) {
    return null;
  }

  return {
    confidence: "high",
    estimatedRankLabel: "Specialized SaaS",
    expectedCookiesBeforeConsent: 0,
    expectedOverallScore: 86,
    expectedThirdPartyRequests: 8,
    industry: "Compliance software / privacy and accessibility risk analytics",
    rationale: "Matched first-party CertScore.ai domain; use the product category instead of hostname-only credit-scoring inference."
  };
}

function formatMacroIndustryLabel(input: {
  businessModels: string[];
  companyName: string | null;
  industryPrimary: string;
  siteType: string | null;
}) {
  const primary = normalizeToken(input.industryPrimary);
  const siteType = normalizeToken(input.siteType);
  const businessModels = input.businessModels.map((value) => normalizeToken(value)).filter((value): value is string => Boolean(value));

  if (primary === "media") {
    const hasStreaming =
      businessModels.some((value) => /subscription|streaming|video|content/.test(value)) ||
      /abc|network|tv|stream|news/i.test(input.companyName ?? "");
    return hasStreaming ? "Media / publisher / streaming & news" : "Media / publisher";
  }

  if (primary === "education") {
    return businessModels.some((value) => /course|training|download/.test(value))
      ? "Education / online courses"
      : "Education";
  }

  if (primary === "ecommerce" || businessModels.some((value) => /commerce|shop|retail/.test(value))) {
    return "Commerce / retail";
  }

  if (primary === "saas" || siteType === "web app") {
    return "SaaS / web application";
  }

  return primary ? `${primary.charAt(0).toUpperCase()}${primary.slice(1)}` : null;
}

export function buildDomainBenchmarkEstimateFromMacroEnrichment(value: unknown): DomainBenchmarkEstimate | null {
  const record = getRecord(value);
  const normalizedOutput = getRecord(record?.normalized_output_json) ?? getRecord(record?.raw_response_json);
  if (!normalizedOutput) {
    return null;
  }

  const industryPrimary = getString(normalizedOutput.industry_primary);
  const confidence = getFiniteNumber(normalizedOutput.confidence) ?? getFiniteNumber(record?.confidence);
  if (!industryPrimary || (typeof confidence === "number" && confidence < 0.6)) {
    return null;
  }

  const companyName = getString(normalizedOutput.company_name);
  const siteType = getString(normalizedOutput.site_type);
  const businessModels = getStringArray(normalizedOutput.business_model);
  const industry = formatMacroIndustryLabel({
    businessModels,
    companyName,
    industryPrimary,
    siteType
  });
  if (!industry) {
    return null;
  }

  const normalizedIndustry = normalizeToken(industryPrimary);
  const benchmark =
    normalizedIndustry === "media"
      ? {
          expectedCookiesBeforeConsent: 4,
          expectedOverallScore: 70,
          expectedThirdPartyRequests: 55,
          estimatedRankLabel: "Large media publisher"
        }
      : normalizedIndustry === "education"
        ? {
            expectedCookiesBeforeConsent: 2,
            expectedOverallScore: 76,
            expectedThirdPartyRequests: 18,
            estimatedRankLabel: "Specialized content / education"
          }
        : {
            expectedCookiesBeforeConsent: 2,
            expectedOverallScore: 72,
            expectedThirdPartyRequests: 24,
            estimatedRankLabel: "Typical category peer"
          };

  return {
    confidence: confidence !== null && confidence >= 0.75 ? "high" : "medium",
    industry,
    rationale: `Matched scan macro enrichment${companyName ? ` for ${companyName}` : ""}: ${industryPrimary}${siteType ? `, ${siteType}` : ""}.`,
    ...benchmark
  };
}

export function shouldPreferMacroBenchmarkEstimate(input: {
  currentEstimate: DomainBenchmarkEstimate | null;
  macroEstimate: DomainBenchmarkEstimate | null;
}) {
  if (!input.macroEstimate) {
    return false;
  }

  if (!input.currentEstimate) {
    return true;
  }

  return (
    GENERIC_UNKNOWN_INDUSTRY_PATTERN.test(input.currentEstimate.industry) ||
    GENERIC_UNKNOWN_INDUSTRY_PATTERN.test(input.currentEstimate.rationale)
  );
}

export function normalizeDomainBenchmarkEstimate(value: unknown): DomainBenchmarkEstimate | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const industry = getString(record.industry);
  const estimatedRankLabel = getString(record.estimatedRankLabel);
  const rationale = getString(record.rationale) ?? "Best-effort benchmark estimate from domain and likely industry.";
  const confidenceValue = getString(record.confidence);
  const confidence =
    confidenceValue === "low" || confidenceValue === "medium" || confidenceValue === "high" ? confidenceValue : "medium";
  const expectedOverallScore = getFiniteNumber(record.expectedOverallScore);
  const expectedThirdPartyRequests = getFiniteNumber(record.expectedThirdPartyRequests);
  const expectedCookiesBeforeConsent = getFiniteNumber(record.expectedCookiesBeforeConsent);

  if (!industry || !estimatedRankLabel || expectedOverallScore === null || expectedThirdPartyRequests === null || expectedCookiesBeforeConsent === null) {
    return null;
  }

  const normalizedCookieEstimate =
    expectedCookiesBeforeConsent === 0 && !shouldAllowZeroCookieEstimate({ industry, rationale })
      ? 2
      : expectedCookiesBeforeConsent;

  return {
    confidence,
    estimatedRankLabel,
    expectedCookiesBeforeConsent: clampNumber(normalizedCookieEstimate, 0, 100),
    expectedOverallScore: clampNumber(expectedOverallScore, 0, 100),
    expectedThirdPartyRequests: clampNumber(expectedThirdPartyRequests, 0, 200),
    industry,
    rationale
  };
}

export async function generateDomainBenchmarkEstimate(input: {
  domainHostname: string;
}): Promise<DomainBenchmarkEstimate | null> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return null;
  }

  const model = process.env.VALIDATION_NANO_MODEL?.trim() || "gpt-5.4-nano";
  const response = await fetch(OPENAI_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You estimate website benchmark values from a domain name only. Infer likely industry/category from the domain and use realistic priors from typical sites in that category. Return only JSON with: industry, estimatedRankLabel, expectedOverallScore, expectedThirdPartyRequests, expectedCookiesBeforeConsent, confidence, rationale. Output calibrated, non-extreme estimates. For expectedCookiesBeforeConsent, do not default to 0: most modern sites set at least 1 to 3 cookies before consent for session, load-balancing, security, consent-state, analytics, or embedded services. Use 0 only when the domain strongly suggests a minimal static, personal, placeholder, privacy-first, or government-style site with very limited tracking. If uncertain, prefer a small positive value over 0."
        },
        {
          role: "user",
          content: [
            `Domain: ${input.domainHostname}`,
            "Task:",
            "- Best-guess the site's industry/category.",
            "- Best-guess a popularity rank label such as 'Top 1k', 'Top 10k', 'Top 100k', 'Top 1M', or 'Long-tail'.",
            "- Best-guess typical values for:",
            "  1. overall score (0-100, higher is better)",
            "  2. third-party requests on first load",
            "  3. cookies before consent",
            "- This is a benchmark estimate for this type of domain, not a restatement of any observed scan output.",
            "- Use realistic website-category priors and common web patterns.",
            "- For cookies before consent, avoid 0 unless the domain clearly indicates a very minimal or privacy-centric site; otherwise usually choose at least 1 to 3, and more for ecommerce, media, SaaS, marketing, or ad-supported sites.",
            "- Keep rationale short and concrete."
          ].join("\n")
        }
      ],
      max_completion_tokens: 220
    }),
    signal: AbortSignal.timeout(15_000)
  });

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as {
    choices?: Array<{
      message?: {
        content?: string;
      };
    }>;
  };
  const content = payload.choices?.[0]?.message?.content;
  if (typeof content !== "string" || content.trim().length === 0) {
    return null;
  }

  return normalizeDomainBenchmarkEstimate(extractJsonObject(content));
}
