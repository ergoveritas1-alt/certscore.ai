import {
  normalizeIndustryBenchmarkSlug,
  type IndustryBenchmarkSlug,
} from "./industry-benchmark-taxonomy";

export type IndustryBenchmarkRow = {
  averageNonEssentialCookiesStorage: number;
  averageNonEssentialRequests: number;
  label: string;
  sampleSize: number;
  slug: IndustryBenchmarkSlug;
};

type IndustryBenchmarkDataset = {
  allIndustries: {
    averageNonEssentialCookiesStorage: number;
    averageNonEssentialRequests: number;
    sampleSize: number;
  };
  generatedAt: string;
  rows: IndustryBenchmarkRow[];
  source: string;
  sourceSiteCount: number;
  windowEnd: string;
  windowStart: string;
};

// Generated from the local retained evidence corpus by
// scripts/generate-evidence-industry-benchmark-data.ts. The generator selects
// the latest retained completed packet per unique site and excludes incomplete
// inventory projections. Values are presentation-only and must not affect
// findings, checklist status, or score.
export const INDUSTRY_BENCHMARK_DATA: IndustryBenchmarkDataset = {
  allIndustries: {
    averageNonEssentialCookiesStorage: 2.2,
    averageNonEssentialRequests: 4.2,
    sampleSize: 5109,
  },
  generatedAt: "2026-09-01T04:48:00.360Z",
  rows: [
    { averageNonEssentialCookiesStorage: 1.8, averageNonEssentialRequests: 3.6, label: "Technology & SaaS", sampleSize: 1371, slug: "technology" },
    { averageNonEssentialCookiesStorage: 2.2, averageNonEssentialRequests: 4.3, label: "Retail & E-commerce", sampleSize: 745, slug: "retail" },
    { averageNonEssentialCookiesStorage: 2.8, averageNonEssentialRequests: 5.7, label: "News & Media", sampleSize: 983, slug: "media" },
    { averageNonEssentialCookiesStorage: 2.3, averageNonEssentialRequests: 4.6, label: "Health & Healthcare", sampleSize: 150, slug: "health" },
    { averageNonEssentialCookiesStorage: 2.7, averageNonEssentialRequests: 5.2, label: "Fintech & Financial Services", sampleSize: 239, slug: "fintech" },
    { averageNonEssentialCookiesStorage: 2.2, averageNonEssentialRequests: 2.8, label: "Government", sampleSize: 241, slug: "government" },
    { averageNonEssentialCookiesStorage: 2.8, averageNonEssentialRequests: 4.3, label: "Education", sampleSize: 520, slug: "education" },
    { averageNonEssentialCookiesStorage: 1.5, averageNonEssentialRequests: 4.3, label: "Travel & Hospitality", sampleSize: 93, slug: "travel" },
    { averageNonEssentialCookiesStorage: 1.7, averageNonEssentialRequests: 3.5, label: "Entertainment", sampleSize: 671, slug: "entertainment" },
    { averageNonEssentialCookiesStorage: 1.8, averageNonEssentialRequests: 3.8, label: "Social & Community", sampleSize: 96, slug: "social" },
  ],
  source: "Local retained evidence corpus; latest retained completed packet per unique site",
  sourceSiteCount: 5928,
  windowEnd: "2026-09-01T04:39:52.981Z",
  windowStart: "2026-08-10T21:58:35.135Z",
};

export function getIndustryBenchmark(industry: string | null | undefined) {
  const slug = normalizeIndustryBenchmarkSlug(industry);
  const matched = slug ? INDUSTRY_BENCHMARK_DATA.rows.find((row) => row.slug === slug) ?? null : null;
  if (matched) {
    return { ...matched, matchedIndustry: true as const };
  }
  if (INDUSTRY_BENCHMARK_DATA.allIndustries.sampleSize === 0) return null;
  return {
    ...INDUSTRY_BENCHMARK_DATA.allIndustries,
    label: "Top industries combined",
    matchedIndustry: false as const,
    slug: null,
  };
}

export function describeIndustryBenchmarkDifference(site: number, average: number) {
  const difference = Math.round((site - average) * 10) / 10;
  if (Math.abs(difference) < 0.05) return "At industry average";
  return `${Math.abs(difference).toFixed(1)} ${difference > 0 ? "above" : "below"} industry avg`;
}
