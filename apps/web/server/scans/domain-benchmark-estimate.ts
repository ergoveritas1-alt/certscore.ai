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
