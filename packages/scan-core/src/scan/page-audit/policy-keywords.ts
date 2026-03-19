export type PolicyType = "privacy" | "terms" | "cookie" | "refund";

export const POLICY_URL_KEYWORDS: Record<PolicyType, string[]> = {
  privacy: ["privacy"],
  terms: ["terms", "conditions", "legal"],
  cookie: ["cookie"],
  refund: ["refund", "return", "returns"]
};

export const POLICY_CONTENT_KEYWORDS: Record<PolicyType, Record<string, string[]>> = {
  privacy: {
    personal_information: ["personal information", "personal data"],
    cookies: ["cookie", "cookies"],
    contact: ["contact", "email", "@", "reach us"],
    third_parties: ["third party", "sharing", "analytics", "service provider"]
  },
  terms: {
    governing_law: ["governing law", "laws of"],
    liability: ["liability", "limitation of liability"],
    site_use: ["use of site", "prohibited", "acceptable use"],
    disputes: ["dispute", "arbitration", "claims"]
  },
  cookie: {
    cookies: ["cookie", "cookies"],
    analytics_advertising: ["analytics", "advertising", "performance cookie"],
    preferences: ["manage preferences", "browser controls", "cookie settings"]
  },
  refund: {
    returns: ["return", "returns"],
    refunds: ["refund", "refunds"],
    eligibility: ["days", "window", "eligibility", "exchange"]
  }
};

export const COMMERCE_SIGNAL_TERMS = [
  "cart",
  "checkout",
  "product",
  "products",
  "shop",
  "buy now",
  "add to cart",
  "category"
];

export function detectPolicyTypeFromUrl(url: string): PolicyType | null {
  const pathname = new URL(url).pathname.toLowerCase();

  if (POLICY_URL_KEYWORDS.privacy.some((keyword) => pathname.includes(keyword))) {
    return "privacy";
  }

  if (POLICY_URL_KEYWORDS.terms.some((keyword) => pathname.includes(keyword))) {
    return "terms";
  }

  if (POLICY_URL_KEYWORDS.cookie.some((keyword) => pathname.includes(keyword))) {
    return "cookie";
  }

  if (POLICY_URL_KEYWORDS.refund.some((keyword) => pathname.includes(keyword))) {
    return "refund";
  }

  return null;
}
