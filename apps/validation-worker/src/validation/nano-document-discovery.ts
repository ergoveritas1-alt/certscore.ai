import { getWorkerEnv } from "../env";
import { buildValidationWorkerCrawlerHeaders } from "../web-bot-auth";

const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";

type NanoDocCandidate = {
  documentType: string;
  priorityTier: "priority" | "secondary";
  url: string;
};

type DiscoveryInputCandidate = {
  anchorText?: string | null;
  candidateScore?: number | null;
  discoveredFrom?: string | null;
  documentType?: string | null;
  score?: number | null;
  sourceUrl?: string | null;
  url: string;
};

type HomepageDiscoveryResult = {
  candidates: DiscoveryInputCandidate[];
};

function getString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function getNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeDocUrl(url: string | null) {
  if (!url) {
    return null;
  }

  try {
    const parsed = new URL(url);
    parsed.hash = "";
    ["next", "redirect", "return_to", "returnTo"].forEach((key) => parsed.searchParams.delete(key));
    const search = parsed.searchParams.toString();
    parsed.search = search.length > 0 ? `?${search}` : "";
    return parsed.toString();
  } catch {
    return url;
  }
}

function isSupportedDocumentType(value: string | null): value is "privacy_policy" | "terms_of_service" | "cookie_policy" {
  return value === "privacy_policy" || value === "terms_of_service" || value === "cookie_policy";
}

function guessDocumentType(input: { anchorText?: string | null; url: string }) {
  const haystack = `${input.anchorText ?? ""} ${input.url}`.toLowerCase();

  if (/cookie policy|cookie notice|cookies\b/.test(haystack)) {
    return "cookie_policy" as const;
  }
  if (/terms of service|terms and conditions|\bterms\b|\blegal terms\b/.test(haystack)) {
    return "terms_of_service" as const;
  }
  if (/privacy policy|privacy notice|\bprivacy\b|your privacy choices|data privacy/.test(haystack)) {
    return "privacy_policy" as const;
  }

  return null;
}

function looksLikeLegalHub(input: { anchorText?: string | null; url: string }) {
  const haystack = `${input.anchorText ?? ""} ${input.url}`.toLowerCase();
  return /legal center|legal hub|legal\b|policies\b|privacy center|your privacy choices/.test(haystack);
}

function scoreLegalCandidate(input: { anchorText?: string | null; discoveredFrom: string; url: string }) {
  const haystack = `${input.anchorText ?? ""} ${input.url}`.toLowerCase();
  let score = 0.2;

  if (/privacy policy|privacy notice/.test(haystack)) score += 0.55;
  else if (/cookie policy|cookie notice/.test(haystack)) score += 0.5;
  else if (/terms of service|terms and conditions/.test(haystack)) score += 0.45;
  else if (/\bprivacy\b|\bcookies\b|\bterms\b/.test(haystack)) score += 0.3;

  if (/footer_link|homepage_rendered_link|legal_hub_link/.test(input.discoveredFrom)) score += 0.15;
  if (/legal|privacy|terms|cookies|policy/.test(new URL(input.url).pathname.toLowerCase())) score += 0.1;

  return Math.min(1, score);
}

function isLikelyLegalHref(href: string) {
  const value = href.toLowerCase();
  return /privacy|terms|legal|cookie|policy|your-privacy-choices|data-privacy/.test(value);
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function stripHtmlToText(html: string) {
  return decodeHtmlEntities(html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

function extractRenderedLegalCandidates(input: { discoveredFrom: string; html: string; pageUrl: string }) {
  const baseUrl = new URL(input.pageUrl);
  const matches = [...input.html.matchAll(/<a\b[^>]*href=(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi)];
  const byUrl = new Map<string, DiscoveryInputCandidate>();

  for (const match of matches) {
    const rawHref = match[2] ?? "";
    const rawText = stripHtmlToText(match[3] ?? "");
    if (!rawHref || (!isLikelyLegalHref(rawHref) && !isLikelyLegalHref(rawText))) {
      continue;
    }

    try {
      const absoluteUrl = normalizeDocUrl(new URL(rawHref, baseUrl).toString());
      if (!absoluteUrl) {
        continue;
      }
      const anchorText = rawText.length > 0 ? rawText.slice(0, 160) : null;
      const documentType = guessDocumentType({ anchorText, url: absoluteUrl });
      const candidate: DiscoveryInputCandidate = {
        anchorText,
        candidateScore: scoreLegalCandidate({
          anchorText,
          discoveredFrom: input.discoveredFrom,
          url: absoluteUrl
        }),
        discoveredFrom: input.discoveredFrom,
        documentType,
        sourceUrl: input.pageUrl,
        url: absoluteUrl
      };
      const existing = byUrl.get(absoluteUrl);
      if (!existing || (candidate.candidateScore ?? 0) > (existing.candidateScore ?? 0)) {
        byUrl.set(absoluteUrl, candidate);
      }
    } catch {
      continue;
    }
  }

  return [...byUrl.values()];
}

async function fetchRenderedLegalCandidates(url: string, discoveredFrom: string) {
  try {
    const request = buildValidationWorkerCrawlerHeaders(url);
    const response = await fetch(url, {
      headers: request.headers,
      redirect: "follow",
      signal: AbortSignal.timeout(10_000)
    });
    if (!response.ok) {
      return [] as DiscoveryInputCandidate[];
    }

    const html = await response.text();
    const finalUrl = response.url || url;
    return extractRenderedLegalCandidates({
      discoveredFrom,
      html,
      pageUrl: finalUrl
    });
  } catch {
    return [] as DiscoveryInputCandidate[];
  }
}

async function buildHomepageDiscoveryCandidates(input: { domainHostname: string | null }) : Promise<HomepageDiscoveryResult> {
  if (!input.domainHostname) {
    return { candidates: [] };
  }

  const homepageUrl = normalizeDocUrl(`https://${input.domainHostname}/`) ?? `https://${input.domainHostname}/`;
  const homepageCandidates = await fetchRenderedLegalCandidates(homepageUrl, "homepage_rendered_link");
  const legalHubCandidates = homepageCandidates.filter((candidate) => looksLikeLegalHub({
    anchorText: candidate.anchorText,
    url: candidate.url
  }));

  const secondHopCandidates = legalHubCandidates.length > 0
    ? await fetchRenderedLegalCandidates(legalHubCandidates[0]!.url, "legal_hub_link")
    : [];

  const merged = new Map<string, DiscoveryInputCandidate>();
  for (const candidate of [...homepageCandidates, ...secondHopCandidates]) {
    const existing = merged.get(candidate.url);
    if (!existing || (candidate.candidateScore ?? 0) > (existing.candidateScore ?? 0)) {
      merged.set(candidate.url, candidate);
    }
  }

  return {
    candidates: [...merged.values()]
  };
}

function buildEvidenceCandidates(input: {
  discoveryCandidates?: Array<Record<string, unknown>>;
  homepageDiscoveryCandidates?: Array<DiscoveryInputCandidate>;
  pages: Array<Record<string, unknown>>;
}) {
  const candidates = new Map<string, DiscoveryInputCandidate>();

  for (const page of input.pages) {
    const url = normalizeDocUrl(getString(page.page_url) ?? getString(page.pageUrl));
    const documentType = getString(page.page_type) ?? getString(page.pageType);
    if (!url || !isSupportedDocumentType(documentType)) {
      continue;
    }

    candidates.set(url, {
      discoveredFrom: "scanner_page",
      documentType,
      score: 1,
      url
    });
  }

  for (const candidate of input.homepageDiscoveryCandidates ?? []) {
    const existing = candidates.get(candidate.url);
    if (!existing || (candidate.candidateScore ?? 0) > (existing.candidateScore ?? 0)) {
      candidates.set(candidate.url, candidate);
    }
  }

  for (const candidate of input.discoveryCandidates ?? []) {
    const url = normalizeDocUrl(getString(candidate.candidate_url) ?? getString(candidate.candidateUrl));
    const documentType =
      getString(candidate.page_type) ??
      getString(candidate.pageType) ??
      guessDocumentType({
        anchorText: getString(candidate.anchor_text) ?? getString(candidate.anchorText),
        url: url ?? ""
      });
    if (!url || (!documentType && !looksLikeLegalHub({
      anchorText: getString(candidate.anchor_text) ?? getString(candidate.anchorText),
      url
    }))) {
      continue;
    }

    const score =
      getNumber(candidate.candidate_score) ??
      getNumber(candidate.candidateScore) ??
      0;

    const nextCandidate: DiscoveryInputCandidate = {
      anchorText: getString(candidate.anchor_text) ?? getString(candidate.anchorText),
      candidateScore: score,
      discoveredFrom: getString(candidate.discovered_from) ?? getString(candidate.discoveredFrom),
      documentType,
      score,
      sourceUrl: getString(candidate.source_url) ?? getString(candidate.sourceUrl),
      url
    };

    const existing = candidates.get(url);
    if (!existing || (nextCandidate.score ?? 0) > (existing.score ?? 0)) {
      candidates.set(url, nextCandidate);
    }
  }

  return [...candidates.values()];
}

function buildSeedFallbackCandidates(domainHostname: string | null) {
  if (!domainHostname) {
    return [] as NanoDocCandidate[];
  }

  return [
    { documentType: "privacy_policy", priorityTier: "secondary", url: `https://${domainHostname}/privacy` },
    { documentType: "terms_of_service", priorityTier: "secondary", url: `https://${domainHostname}/terms` },
    { documentType: "cookie_policy", priorityTier: "secondary", url: `https://${domainHostname}/cookie-policy` }
  ] satisfies NanoDocCandidate[];
}

function limitNanoDocCandidates(candidates: NanoDocCandidate[]) {
  const counts = new Map<string, number>();
  const limited: NanoDocCandidate[] = [];

  for (const candidate of candidates) {
    const currentCount = counts.get(candidate.documentType) ?? 0;
    const limit = candidate.documentType === "privacy_policy" ? 2 : 1;
    if (currentCount >= limit) {
      continue;
    }

    counts.set(candidate.documentType, currentCount + 1);
    limited.push(candidate);
  }

  return limited;
}

export function buildNanoDocCandidateUrls(input: {
  discoveryCandidates?: Array<Record<string, unknown>>;
  domainHostname: string | null;
  homepageDiscoveryCandidates?: Array<DiscoveryInputCandidate>;
  pages: Array<Record<string, unknown>>;
}) {
  const evidenceCandidates = buildEvidenceCandidates(input);
  const orderedEvidence = evidenceCandidates
    .filter((candidate) => isSupportedDocumentType(candidate.documentType ?? null))
    .sort((left, right) => (right.score ?? 0) - (left.score ?? 0) || left.url.localeCompare(right.url))
    .map((candidate) => ({
      documentType: candidate.documentType!,
      priorityTier:
        candidate.discoveredFrom === "scanner_page" ||
        candidate.discoveredFrom === "footer_link" ||
        candidate.discoveredFrom === "legal_hub" ||
        candidate.discoveredFrom === "rendered_link" ||
        (candidate.score ?? 0) >= 0.75
          ? "priority"
          : "secondary",
      url: candidate.url
    } satisfies NanoDocCandidate));

  if (orderedEvidence.length > 0) {
    return limitNanoDocCandidates(orderedEvidence);
  }

  return buildSeedFallbackCandidates(input.domainHostname);
}

function extractJson(raw: string) {
  const trimmed = raw.trim();
  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fencedMatch?.[1]?.trim() ?? trimmed;
  const firstBrace = candidate.indexOf("{");
  const lastBrace = candidate.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return candidate.slice(firstBrace, lastBrace + 1);
  }
  return candidate;
}

function normalizeSelectedCandidates(input: {
  available: DiscoveryInputCandidate[];
  parsed: Record<string, unknown>;
}) {
  const availableByUrl = new Map(input.available.map((candidate) => [candidate.url, candidate] as const));
  const selected = Array.isArray(input.parsed.selected_candidates)
    ? input.parsed.selected_candidates
    : Array.isArray(input.parsed.selectedCandidates)
      ? input.parsed.selectedCandidates
      : [];

  const normalized: NanoDocCandidate[] = [];
  const byDocTypeCount = new Map<string, number>();

  for (const row of selected) {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      continue;
    }

    const selectedUrl = normalizeDocUrl(getString((row as Record<string, unknown>).url));
    const selectedType = getString((row as Record<string, unknown>).document_type) ?? getString((row as Record<string, unknown>).documentType);
    if (!selectedUrl || !isSupportedDocumentType(selectedType)) {
      continue;
    }

    const available = availableByUrl.get(selectedUrl);
    if (!available) {
      continue;
    }

    const currentCount = byDocTypeCount.get(selectedType) ?? 0;
    const limit = selectedType === "privacy_policy" ? 2 : 1;
    if (currentCount >= limit) {
      continue;
    }

    byDocTypeCount.set(selectedType, currentCount + 1);
    normalized.push({
      documentType: selectedType,
      priorityTier: "priority",
      url: selectedUrl
    });
  }

  return limitNanoDocCandidates(normalized);
}

export async function rankNanoDocDiscoveryCandidatesWithLlm(input: {
  discoveryCandidates?: Array<Record<string, unknown>>;
  domainHostname: string | null;
  homepageDiscoveryCandidates?: Array<DiscoveryInputCandidate>;
  pages: Array<Record<string, unknown>>;
}) {
  const available = buildEvidenceCandidates(input);
  if (available.length === 0) {
    return [] as NanoDocCandidate[];
  }

  const env = getWorkerEnv();
  if (!env.OPENAI_API_KEY) {
    return [] as NanoDocCandidate[];
  }

  const response = await fetch(OPENAI_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: env.VALIDATION_NANO_MODEL,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You rank public-facing legal-document discovery candidates for a website. Return JSON only. Select only from the provided candidate URLs. Prefer real rendered legal pages over guessed patterns. Focus on privacy_policy first, then cookie_policy, then terms_of_service. Avoid login, app, support, account, marketing, and non-legal destinations. Return at most 2 privacy_policy URLs, 1 cookie_policy URL, and 1 terms_of_service URL in selected_candidates."
        },
        {
          role: "user",
          content: JSON.stringify(
            {
              domainHostname: input.domainHostname,
              candidates: available.map((candidate) => ({
                anchorText: candidate.anchorText ?? null,
                candidateScore: candidate.candidateScore ?? null,
                discoveredFrom: candidate.discoveredFrom ?? null,
                documentTypeGuess: candidate.documentType ?? null,
                sourceUrl: candidate.sourceUrl ?? null,
                url: candidate.url
              }))
            },
            null,
            2
          )
        }
      ]
    })
  });

  if (!response.ok) {
    return [] as NanoDocCandidate[];
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const parsed = JSON.parse(extractJson(payload.choices?.[0]?.message?.content ?? "{}")) as Record<string, unknown>;
  return normalizeSelectedCandidates({
    available,
    parsed
  });
}

export async function selectNanoDocCandidates(input: {
  discoveryCandidates?: Array<Record<string, unknown>>;
  domainHostname: string | null;
  pages: Array<Record<string, unknown>>;
}) {
  const homepageDiscovery = await buildHomepageDiscoveryCandidates({
    domainHostname: input.domainHostname
  }).catch(() => ({ candidates: [] as DiscoveryInputCandidate[] }));
  const llmSelected = await rankNanoDocDiscoveryCandidatesWithLlm({
    ...input,
    homepageDiscoveryCandidates: homepageDiscovery.candidates
  }).catch(() => [] as NanoDocCandidate[]);
  if (llmSelected.length > 0) {
    return llmSelected;
  }

  return buildNanoDocCandidateUrls({
    ...input,
    homepageDiscoveryCandidates: homepageDiscovery.candidates
  });
}
