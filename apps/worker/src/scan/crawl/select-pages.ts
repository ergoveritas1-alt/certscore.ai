import { classifyPage, type PageType } from "./classify-page";

export type SelectedPage = {
  pageType: PageType;
  priority: number;
  url: string;
};

const KEYWORD_WEIGHTS: Array<{ keyword: string; weight: number }> = [
  { keyword: "/contact", weight: 90 },
  { keyword: "/privacy", weight: 88 },
  { keyword: "/terms", weight: 84 },
  { keyword: "/cookie", weight: 82 },
  { keyword: "/legal", weight: 78 },
  { keyword: "/about", weight: 76 },
  { keyword: "/services", weight: 72 },
  { keyword: "/service", weight: 72 },
  { keyword: "/shop", weight: 70 },
  { keyword: "/product", weight: 68 },
  { keyword: "/category", weight: 64 },
  { keyword: "/checkout", weight: 62 },
  { keyword: "/cart", weight: 60 },
  { keyword: "/refund", weight: 58 },
  { keyword: "/review", weight: 54 },
  { keyword: "/testimonial", weight: 54 },
  { keyword: "/blog", weight: 48 },
  { keyword: "/article", weight: 46 }
];

function scoreUrl(url: string, homepageUrl: string) {
  if (url === homepageUrl) {
    return 1000;
  }

  const normalized = new URL(url);
  const path = normalized.pathname.toLowerCase();
  let score = 0;

  for (const entry of KEYWORD_WEIGHTS) {
    if (path.includes(entry.keyword)) {
      score += entry.weight;
    }
  }

  const segmentCount = path.split("/").filter(Boolean).length;
  score += Math.max(0, 20 - segmentCount * 4);

  if (!path.includes("/tag/") && !path.includes("/author/") && !path.includes("/page/")) {
    score += 6;
  }

  if (normalized.search.length > 0) {
    score -= 10;
  }

  return score;
}

export function selectTopPages(input: { homepageUrl: string; maxPages: number; urls: string[] }): SelectedPage[] {
  const dedupedUrls = [...new Set([input.homepageUrl, ...input.urls])];

  return dedupedUrls
    .map((url) => ({
      url,
      priority: scoreUrl(url, input.homepageUrl),
      pageType: classifyPage(url)
    }))
    .sort((left, right) => {
      if (right.priority !== left.priority) {
        return right.priority - left.priority;
      }

      return left.url.localeCompare(right.url);
    })
    .slice(0, input.maxPages);
}
