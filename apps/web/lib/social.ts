export const CERTSCORE_LINKEDIN_URL = "https://www.linkedin.com/company/123334088";
export const CERTSCORE_X_URL = "https://x.com/certscoreai";

export type SocialProfile = {
  label: "LinkedIn" | "X";
  url: string;
};

function linkedInUrl() {
  const configured = process.env.NEXT_PUBLIC_CERTSCORE_LINKEDIN_URL?.trim();
  if (!configured) return CERTSCORE_LINKEDIN_URL;

  try {
    const url = new URL(configured);
    const hostname = url.hostname.toLowerCase();
    if (
      url.protocol !== "https:" ||
      (hostname !== "linkedin.com" && hostname !== "www.linkedin.com") ||
      !/^\/company\/[^/]+\/?$/.test(url.pathname)
    ) {
      return CERTSCORE_LINKEDIN_URL;
    }

    url.hash = "";
    url.search = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return CERTSCORE_LINKEDIN_URL;
  }
}

export function getCertScoreSocialProfiles(): SocialProfile[] {
  const canonicalLinkedInUrl = linkedInUrl();

  return [
    { label: "LinkedIn", url: canonicalLinkedInUrl },
    { label: "X", url: CERTSCORE_X_URL }
  ];
}

export function getCertScoreSocialProfileUrls() {
  return getCertScoreSocialProfiles().map((profile) => profile.url);
}
