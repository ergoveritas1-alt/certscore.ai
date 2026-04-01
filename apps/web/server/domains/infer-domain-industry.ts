"use server";

import { createAdminClient } from "@website-signal-risk-scanner/db";

type IndustryOption = {
  id: string;
  slug: string;
};

const EXACT_HOSTNAME_TO_INDUSTRY: Record<string, string> = {
  "betterment.com": "fintech",
  "chime.com": "fintech",
  "coinbase.com": "fintech",
  "fidelity.com": "fintech",
  "kalshi.com": "fintech",
  "paypal.com": "fintech",
  "polymarket.com": "fintech",
  "robinhood.com": "fintech",
  "schwab.com": "fintech",
  "stripe.com": "fintech",
  "tbank.ru": "fintech",
  "vanguard.com": "fintech",
  "adidas.com": "retail",
  "airbnb.com": "retail",
  "aliexpress.com": "retail",
  "amazon.com": "retail",
  "apple.com": "retail",
  "bestbuy.com": "retail",
  "homedepot.com": "retail",
  "ikea.com": "retail",
  "nike.com": "retail",
  "rei.com": "retail",
  "shop.app": "retail",
  "shopify.com": "technology",
  "target.com": "retail",
  "temu.com": "retail",
  "timex.com": "retail",
  "walmart.com": "retail",
  "wayfair.com": "retail",
  "billboard.com": "media",
  "bloomberg.com": "media",
  "businessinsider.com": "media",
  "cbs.com": "media",
  "cnbc.com": "media",
  "cnn.com": "media",
  "espn.com": "media",
  "foxnews.com": "media",
  "huffpost.com": "media",
  "marketwatch.com": "media",
  "newsweek.com": "media",
  "nytimes.com": "media",
  "washingtonpost.com": "media",
  "wsj.com": "media",
  "cdc.gov": "health",
  "fda.gov": "health",
  "mayoclinic.org": "health",
  "nih.gov": "health",
  "google.com": "technology",
  "microsoft.com": "technology",
  "github.com": "technology",
  "docker.com": "technology",
  "nvidia.com": "technology",
  "zoom.us": "technology",
  "facebook.com": "social",
  "instagram.com": "social",
  "reddit.com": "social",
  "snapchat.com": "social",
  "tiktok.com": "social",
  "whatsapp.com": "social",
  "x.com": "social",
  "booking.com": "travel",
  "delta.com": "travel",
  "trip.com": "travel",
  "tripadvisor.com": "travel",
  "united.com": "travel",
  "berkeley.edu": "education",
  "code.org": "education",
  "harvard.edu": "education",
  "mit.edu": "education",
  "princeton.edu": "education",
  "stanford.edu": "education",
  "ucla.edu": "education",
  "usc.edu": "education",
  "yale.edu": "education"
};

const KEYWORD_RULES: Array<{ industry: string; keywords: string[] }> = [
  { industry: "fintech", keywords: ["bank", "capital", "finance", "fintech", "fund", "invest", "money", "pay", "trade", "wallet"] },
  { industry: "health", keywords: ["care", "clinic", "doctor", "health", "hospital", "medical", "pharma", "wellness"] },
  { industry: "media", keywords: ["broadcast", "media", "news", "press", "radio", "stream", "tv"] },
  { industry: "retail", keywords: ["apparel", "cart", "fashion", "shop", "store"] },
  { industry: "travel", keywords: ["air", "airline", "flight", "hotel", "travel", "trip", "vacation"] },
  { industry: "education", keywords: ["academy", "college", "course", "edu", "institute", "learn", "school", "university"] },
  { industry: "government", keywords: ["agency", "city", "county", "gov", "ministry", "state"] },
  { industry: "entertainment", keywords: ["entertainment", "game", "movie", "music", "sport", "video"] },
  { industry: "social", keywords: ["chat", "community", "forum", "messenger", "social"] },
  { industry: "technology", keywords: ["ai", "app", "cloud", "data", "dev", "infra", "platform", "software", "tech"] }
];

function normalizeHostname(hostname: string) {
  return hostname.trim().toLowerCase().replace(/^www\./, "");
}

function tokenizeHostname(hostname: string) {
  return normalizeHostname(hostname)
    .split(".")
    .flatMap((segment) => segment.split(/[^a-z0-9]+/))
    .filter(Boolean);
}

function detectIndustrySlug(hostname: string) {
  const normalizedHostname = normalizeHostname(hostname);
  const exactMatch = EXACT_HOSTNAME_TO_INDUSTRY[normalizedHostname];

  if (exactMatch) {
    return exactMatch;
  }

  const tokens = tokenizeHostname(normalizedHostname);

  for (const rule of KEYWORD_RULES) {
    if (rule.keywords.some((keyword) => tokens.some((token) => token.includes(keyword) || keyword.includes(token)))) {
      return rule.industry;
    }
  }

  return null;
}

export async function inferPrimaryIndustryIdForHostname(hostname: string): Promise<string | null> {
  const inferredSlug = detectIndustrySlug(hostname);

  if (!inferredSlug) {
    return null;
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase.from("industries").select("id, slug").eq("slug", inferredSlug).maybeSingle();

  if (error) {
    if (error.message?.includes("relation \"public.industries\" does not exist")) {
      return null;
    }

    throw new Error(`Failed to resolve inferred industry: ${error.message}`);
  }

  return (data as IndustryOption | null)?.id ?? null;
}
