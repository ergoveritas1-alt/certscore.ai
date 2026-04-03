import { getWorkerEnv } from "../env";

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

function buildEvidenceCandidates(input: {
  discoveryCandidates?: Array<Record<string, unknown>>;
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

  for (const candidate of input.discoveryCandidates ?? []) {
    const url = normalizeDocUrl(getString(candidate.candidate_url) ?? getString(candidate.candidateUrl));
    const documentType = getString(candidate.page_type) ?? getString(candidate.pageType);
    if (!url || !isSupportedDocumentType(documentType)) {
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

export function buildNanoDocCandidateUrls(input: {
  discoveryCandidates?: Array<Record<string, unknown>>;
  domainHostname: string | null;
  pages: Array<Record<string, unknown>>;
}) {
  const evidenceCandidates = buildEvidenceCandidates(input);
  const orderedEvidence = evidenceCandidates
    .sort((left, right) => (right.score ?? 0) - (left.score ?? 0) || left.url.localeCompare(right.url))
    .map((candidate) => ({
      documentType: candidate.documentType ?? "privacy_policy",
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
    return orderedEvidence;
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

  return normalized;
}

export async function rankNanoDocDiscoveryCandidatesWithLlm(input: {
  discoveryCandidates?: Array<Record<string, unknown>>;
  domainHostname: string | null;
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
  const llmSelected = await rankNanoDocDiscoveryCandidatesWithLlm(input).catch(() => [] as NanoDocCandidate[]);
  if (llmSelected.length > 0) {
    return llmSelected;
  }

  return buildNanoDocCandidateUrls(input);
}

