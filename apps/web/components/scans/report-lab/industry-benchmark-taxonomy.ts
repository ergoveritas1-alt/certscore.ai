export const INDUSTRY_BENCHMARK_SLUGS = [
  "technology",
  "retail",
  "media",
  "health",
  "fintech",
  "government",
  "education",
  "travel",
  "entertainment",
  "social",
] as const;

export type IndustryBenchmarkSlug = (typeof INDUSTRY_BENCHMARK_SLUGS)[number];

export const INDUSTRY_BENCHMARK_LABELS: Record<IndustryBenchmarkSlug, string> = {
  education: "Education",
  entertainment: "Entertainment",
  fintech: "Fintech & Financial Services",
  government: "Government",
  health: "Health & Healthcare",
  media: "News & Media",
  retail: "Retail & E-commerce",
  social: "Social & Community",
  technology: "Technology & SaaS",
  travel: "Travel & Hospitality",
};

const INDUSTRY_PATTERNS: Array<[IndustryBenchmarkSlug, RegExp]> = [
  ["social", /social media|social network|dating|community platform|forum/i],
  ["government", /government|public sector|municipal|federal|regulatory authority/i],
  ["education", /education|university|academic|school|learning|research institution/i],
  ["retail", /retail|commerce|marketplace|shopping|consumer goods|fashion|storefront/i],
  ["health", /health|medical|dental|clinic|hospital|pharma|wellness|veterinary/i],
  ["fintech", /fintech|finance|financial|bank|credit|insurance|crypto|payment|trading/i],
  ["travel", /travel|airline|hotel|hospitality|booking|tourism/i],
  ["entertainment", /entertainment|gaming|game portal|casino|gambling|sports betting|adult/i],
  ["media", /media|news|journal|publish|newspaper|broadcast|streaming|content platform/i],
  ["technology", /technology|software|saas|cloud|hosting|developer|internet service|search engine|cybersecurity|telecom/i],
];

export function normalizeIndustryBenchmarkSlug(industry: string | null | undefined): IndustryBenchmarkSlug | null {
  const normalized = industry?.trim();
  if (!normalized) return null;
  return INDUSTRY_PATTERNS.find(([, pattern]) => pattern.test(normalized))?.[0] ?? null;
}
