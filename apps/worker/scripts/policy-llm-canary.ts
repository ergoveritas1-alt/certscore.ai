import { randomUUID } from "node:crypto";
import {
  assessPolicyPageContentQuality,
  buildScanPlan,
  chunkPolicyText,
  discoverCandidatePages,
  enrichPolicyPages,
  fetchStaticPage,
  ruleBasedPolicyPreprocess,
  upgradeThinPolicyPages,
  type StaticPageResult
} from "@website-signal-risk-scanner/scan-core";

type CanaryRunResult = {
  completedAt: string;
  cacheHit: boolean;
  diagnostics: Array<{
    chunkDiagnostics: Array<{
      attemptCount: number;
      chunkId: string;
      failureCode: string | null;
      failureDetail: string | null;
      rawLength: number | null;
      rawPreview: string | null;
      score: number;
      selectedReason: string;
      success: boolean;
    }>;
    pageType: string;
    pageUrl: string;
    selectedChunkCount: number;
    totalChunkCount: number;
  }>;
  domain: string;
  durationMs: number;
  homepageFetchStatus: string;
  legalRows: Array<{
    page_type: string;
    page_url: string;
    policy_actionable_flags: string[];
    policy_ai_model: string | null;
    policy_arbitration_present?: boolean | null;
    policy_effective_date?: string | null;
    policy_governing_law?: string | null;
    policy_semantic_confidence: number | null;
  }>;
  policySelectionStrategy: string;
  privacyCandidatesConsidered: number;
  privacyPagesFetched: number;
  privacyRows: Array<{
    page_type: string;
    page_url: string;
    policy_actionable_flags: string[];
    policy_ai_model: string | null;
    policy_semantic_confidence: number | null;
  }>;
  repetition: number;
  runId: string;
  termsRows: Array<{
    page_type: string;
    page_url: string;
    policy_actionable_flags: string[];
    policy_ai_model: string | null;
    policy_arbitration_present?: boolean | null;
    policy_effective_date?: string | null;
    policy_governing_law?: string | null;
    policy_semantic_confidence: number | null;
  }>;
  timingMs: {
    enrichment: number;
    homepageFetch: number;
    policyFetch: number;
  };
};

const canaryEnrichmentCache = new Map<
  string,
  {
    diagnostics: CanaryRunResult["diagnostics"];
    legalRows: CanaryRunResult["legalRows"];
    privacyRows: CanaryRunResult["privacyRows"];
    termsRows: CanaryRunResult["termsRows"];
  }
>();

function toCanaryLegalRow(row: Awaited<ReturnType<typeof enrichPolicyPages>>["enrichments"][number]) {
  return {
    page_type: row.pageType ?? "unknown",
    page_url: row.pageUrl,
    policy_actionable_flags: row.policyActionableFlags,
    policy_semantic_confidence: row.policySemanticConfidence,
    policy_ai_model: row.policyAiModel,
    policy_effective_date: row.policyEffectiveDate ?? null,
    policy_governing_law: row.policyGoverningLaw ?? null,
    policy_arbitration_present: row.policyArbitrationPresent ?? null
  };
}

function normalizeHostname(hostname: string) {
  return hostname.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/+$/, "");
}

function normalizeCandidateUrlForDedup(url: string) {
  const decoded = url.replace(/&amp;/g, "&");

  try {
    const parsed = new URL(decoded);
    parsed.hash = "";
    parsed.search = "";
    return parsed.toString().replace(/\/+$/, "");
  } catch {
    return decoded.replace(/\/+$/, "");
  }
}

function confidenceBand(value: number | null) {
  if (value === null) {
    return "none";
  }

  if (value >= 0.75) {
    return "high";
  }

  if (value >= 0.5) {
    return "medium";
  }

  return "low";
}

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, worker: (item: T) => Promise<R>) {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function runWorker() {
    while (true) {
      const current = nextIndex;
      nextIndex += 1;

      if (current >= items.length) {
        return;
      }

      results[current] = await worker(items[current]!);
    }
  }

  const workerCount = Math.max(1, Math.min(concurrency, items.length));
  await Promise.all(Array.from({ length: workerCount }, () => runWorker()));
  return results;
}

function shouldFallbackToAdditionalCandidates(page: StaticPageResult | undefined) {
  if (!page) {
    return true;
  }

  if (["blocked", "forbidden", "not_found", "timeout", "error"].includes(page.fetchStatus)) {
    return true;
  }

  if (page.pageType === "privacy_policy") {
    const normalizedUrl = page.pageUrl.toLowerCase();
    return (
      assessPolicyPageContentQuality(page).insufficientContent ||
      normalizedUrl.includes("/help/article/") ||
      normalizedUrl.includes("/hc/") ||
      normalizedUrl.includes("/support/")
    );
  }

  return false;
}

function scorePrivacyCandidateUrl(url: string) {
  const normalized = url.toLowerCase();
  let score = 0;

  if (normalized.includes("privacystatement")) {
    score += 500;
  }
  if (normalized.includes("privacy-policy")) {
    score += 350;
  }
  if (normalized.includes("/legal/privacy")) {
    score += 250;
  }
  if (normalized.includes("/privacy")) {
    score += 125;
  }
  if (normalized.includes("/help/article/")) {
    score -= 250;
  }
  if (normalized.includes("/hc/") || normalized.includes("/support/")) {
    score -= 175;
  }
  if (normalized.includes("consumer-health-data")) {
    score -= 150;
  }
  if (normalized.includes("third-party-ads")) {
    score -= 250;
  }

  return score;
}

function scoreSupplementalLegalCandidate(input: { pageType: string; url: string }) {
  const normalized = input.url.toLowerCase();
  let score = input.pageType === "terms_of_service" ? 200 : input.pageType === "cookie_policy" ? 100 : 0;

  if (normalized.includes("terms")) {
    score += 100;
  }
  if (normalized.includes("legal")) {
    score += 50;
  }
  if (normalized.includes("/help/article/")) {
    score -= 100;
  }

  return score;
}

function scoreFetchedPrivacyPage(page: StaticPageResult) {
  const quality = assessPolicyPageContentQuality(page);
  const url = page.pageUrl.toLowerCase();
  let score = quality.wordCount + quality.textLength / 20 + scorePrivacyCandidateUrl(url);

  if (quality.insufficientContent) {
    score -= 500;
  }

  return score;
}

function selectBestPrivacyPages(pages: StaticPageResult[]) {
  const privacyPages = pages.filter((page) => page.pageType === "privacy_policy");

  if (privacyPages.length <= 1) {
    return pages;
  }

  const bestPrivacyPage = [...privacyPages].sort((left, right) => scoreFetchedPrivacyPage(right) - scoreFetchedPrivacyPage(left))[0]!;
  return pages.filter((page) => page.pageType !== "privacy_policy" || page.pageUrl === bestPrivacyPage.pageUrl);
}

async function fetchPolicyCandidates(homepageUrl: string, privacyOnly: boolean) {
  const homepageStartedAt = Date.now();
  const homepage = await fetchStaticPage({
    pageType: "homepage",
    url: homepageUrl
  });
  const homepageFetchMs = Date.now() - homepageStartedAt;
  const discoveredLinkSet = new Set(homepage.links.map((link) => link.href));

  const candidates = discoverCandidatePages(homepage.finalUrl ?? homepageUrl, homepage.links)
    .filter((candidate) => candidate.pageType !== "homepage")
    .filter((candidate) => (privacyOnly ? candidate.pageType === "privacy_policy" : ["privacy_policy", "terms_of_service", "cookie_policy"].includes(candidate.pageType)))
    .sort((left, right) => {
      const leftDiscovered = discoveredLinkSet.has(left.url) ? 1 : 0;
      const rightDiscovered = discoveredLinkSet.has(right.url) ? 1 : 0;

      if (rightDiscovered !== leftDiscovered) {
        return rightDiscovered - leftDiscovered;
      }

      if (right.priority !== left.priority) {
        return right.priority - left.priority;
      }

      if (privacyOnly && left.pageType === "privacy_policy" && right.pageType === "privacy_policy") {
        const privacyScoreDiff = scorePrivacyCandidateUrl(right.url) - scorePrivacyCandidateUrl(left.url);
        if (privacyScoreDiff !== 0) {
          return privacyScoreDiff;
        }
      }

      return left.url.localeCompare(right.url);
    });

  const deduped = new Map<string, { pageType: string; priority: number; url: string }>();
  for (const candidate of candidates) {
    if (!deduped.has(candidate.url)) {
      deduped.set(candidate.url, candidate);
    }
  }

  const selected = [...deduped.values()].slice(0, privacyOnly ? 3 : 5);
  const policyFetchStartedAt = Date.now();
  const pages: StaticPageResult[] = [];

  if (selected[0]) {
    pages.push(
      await fetchStaticPage({
        pageType: selected[0].pageType as StaticPageResult["pageType"],
        url: selected[0].url
      })
    );
  }

  if (selected.length > 1 && shouldFallbackToAdditionalCandidates(pages[0])) {
    const fallbackPages = await Promise.all(
      selected.slice(1).map((candidate) =>
        fetchStaticPage({
          pageType: candidate.pageType as StaticPageResult["pageType"],
          url: candidate.url
        })
      )
    );
    pages.push(...fallbackPages);
  }

  const policyFetchMs = Date.now() - policyFetchStartedAt;
  const fetchedPagesByUrl = new Map<string, StaticPageResult>();

  for (const page of pages) {
    fetchedPagesByUrl.set(page.pageUrl, page);
  }

  await upgradeThinPolicyPages({
    fetchedPagesByUrl,
    plan: buildScanPlan({
      homepage,
      requestedPageCount: privacyOnly ? 1 : 3,
      robotsCrawlDelayMs: null
    }),
    robotsPolicy: null
  });

  const selectedPages = selectBestPrivacyPages([...fetchedPagesByUrl.values()]);

  return {
    homepage,
    pages: selectedPages,
    allCandidates: [...deduped.values()],
    policyFetchMs,
    homepageFetchMs,
    policySelectionStrategy: selected.length > 1 ? "top-1-with-fallback" : "single-candidate"
  };
}

async function fetchSupplementalLegalPages(input: {
  allCandidates: Array<{ pageType: string; priority: number; url: string }>;
  selectedPages: StaticPageResult[];
}) {
  const selectedUrls = new Set(input.selectedPages.map((page) => page.pageUrl));
  const supplementalCandidates = input.allCandidates
    .filter((candidate) => candidate.pageType !== "privacy_policy" && !selectedUrls.has(candidate.url))
    .sort((left, right) => {
      const scoreDiff = scoreSupplementalLegalCandidate(right) - scoreSupplementalLegalCandidate(left);
      if (scoreDiff !== 0) {
        return scoreDiff;
      }

      return right.priority - left.priority;
    })
    .slice(0, 3);

  // Second-hop discovery: legal/privacy hub pages sometimes expose terms links that the homepage/footer does not.
  for (const selectedPage of input.selectedPages) {
    for (const candidate of discoverCandidatePages(selectedPage.pageUrl, selectedPage.links)
      .filter((candidate) => candidate.pageType !== "privacy_policy" && !selectedUrls.has(candidate.url))
      .sort((left, right) => {
        const scoreDiff = scoreSupplementalLegalCandidate(right) - scoreSupplementalLegalCandidate(left);
        if (scoreDiff !== 0) {
          return scoreDiff;
        }

        return right.priority - left.priority;
      })
      .slice(0, 3)) {
      if (
        !supplementalCandidates.some(
          (existing) => normalizeCandidateUrlForDedup(existing.url) === normalizeCandidateUrlForDedup(candidate.url)
        )
      ) {
        supplementalCandidates.push(candidate);
      }
    }
  }

  const pages: StaticPageResult[] = [];

  for (const supplemental of supplementalCandidates.slice(0, 5)) {
    const page = await fetchStaticPage({
      pageType: supplemental.pageType as StaticPageResult["pageType"],
      url: supplemental.url
    });

    if (!(page.fetchStatus === "ok" || page.fetchStatus === "redirected")) {
      continue;
    }

    if (assessPolicyPageContentQuality(page).insufficientContent) {
      continue;
    }

    pages.push(page);
  }

  return pages;
}

function maybeAugmentPrivacyPage(input: {
  privacyPage: StaticPageResult;
  privacyPageChunkCount: number;
  supplementalPage: StaticPageResult | null;
}) {
  if (input.privacyPageChunkCount !== 1 || !input.supplementalPage) {
    return input.privacyPage;
  }

  const privacyQuality = assessPolicyPageContentQuality(input.privacyPage);
  if (privacyQuality.wordCount > 450) {
    return input.privacyPage;
  }

  const supplementalWords = input.supplementalPage.textContent.split(/\s+/).slice(0, 500).join(" ").trim();
  if (supplementalWords.length < 200) {
    return input.privacyPage;
  }

  return {
    ...input.privacyPage,
    html: `${input.privacyPage.html}\n<!-- supplemental-${input.supplementalPage.pageType} -->\n${input.supplementalPage.html}`,
    textContent: `${input.privacyPage.textContent}\n\nSupplemental ${input.supplementalPage.pageType.replace(/_/g, " ")} context:\n${supplementalWords}`
  } satisfies StaticPageResult;
}

async function runOnePolicyCanary(input: {
  fastFailLlm: boolean;
  hostname: string;
  llmMaxChunks: number | null;
  privacyOnly: boolean;
  repetition: number;
}) {
  const startedAt = Date.now();
  const runId = randomUUID();
  const homepageUrl = `https://${input.hostname}/`;
  const fetched = await fetchPolicyCandidates(homepageUrl, input.privacyOnly);
  const previousAttemptLimit = process.env.LLM_ENRICHMENT_MAX_ATTEMPTS;
  const previousChunkLimit = process.env.LLM_ENRICHMENT_MAX_CHUNKS;
  const previousForceLastChunk = process.env.LLM_ENRICHMENT_FORCE_LAST_CHUNK;
  let bundle;
  const enrichmentStartedAt = Date.now();
  let cacheHit = false;

  const privacyPage = fetched.pages.find((page) => page.pageType === "privacy_policy");
  const privacyPageChunkCount = privacyPage
    ? chunkPolicyText({
        text: ruleBasedPolicyPreprocess({
          html: privacyPage.html,
          text: privacyPage.textContent
        }).normalizedText
      }).length
    : 0;
  const privacyPageQuality = privacyPage ? assessPolicyPageContentQuality(privacyPage) : null;
  const shouldFetchSupplementalLegalPages =
    !input.privacyOnly ||
    (privacyPage !== undefined &&
      privacyPageChunkCount === 1 &&
      Boolean(privacyPageQuality) &&
      (privacyPageQuality?.wordCount ?? 0) <= 450);
  const supplementalPages = shouldFetchSupplementalLegalPages
    ? await fetchSupplementalLegalPages({
        allCandidates: fetched.allCandidates,
        selectedPages: fetched.pages
      })
    : [];
  const privacyAugmentSource = supplementalPages[0] ?? null;
  const effectivePages = [
    ...(privacyPage && privacyAugmentSource
      ? fetched.pages.map((page) =>
          page.pageUrl === privacyPage.pageUrl
            ? maybeAugmentPrivacyPage({
                privacyPage,
                privacyPageChunkCount,
                supplementalPage: privacyAugmentSource
              })
            : page
        )
      : fetched.pages),
    ...supplementalPages.filter((supplemental) => !fetched.pages.some((page) => page.pageUrl === supplemental.pageUrl))
  ].filter(
    (page, index, pages) =>
      pages.findIndex((candidate) => normalizeCandidateUrlForDedup(candidate.pageUrl) === normalizeCandidateUrlForDedup(page.pageUrl)) === index
  );
  const forceSingleChunkPrivacyLlm =
    privacyPage !== undefined &&
    privacyPageChunkCount === 1 &&
    !privacyPageQuality?.insufficientContent;
  const canaryChunkLimit =
    privacyPage && privacyPageChunkCount > 2
      ? Math.min(input.llmMaxChunks ?? 3, 2)
      : input.llmMaxChunks;
  const normalizedPolicyHash = privacyPage
    ? ruleBasedPolicyPreprocess({
        html: privacyPage.html,
        text: privacyPage.textContent
      }).normalizedPolicyHash
    : null;
  const cacheKey = normalizedPolicyHash ? `${input.hostname}:${normalizedPolicyHash}` : null;

  try {
    if (input.fastFailLlm) {
      process.env.LLM_ENRICHMENT_MAX_ATTEMPTS = privacyPage && privacyPageChunkCount > 1 ? "2" : "1";
    }
    if (canaryChunkLimit !== null) {
      process.env.LLM_ENRICHMENT_MAX_CHUNKS = String(canaryChunkLimit);
    }
    if (privacyPage && privacyPageChunkCount > 2) {
      process.env.LLM_ENRICHMENT_FORCE_LAST_CHUNK = "0";
    }

    if (cacheKey && canaryEnrichmentCache.has(cacheKey)) {
      cacheHit = true;
      bundle = canaryEnrichmentCache.get(cacheKey)!;
    } else {
      bundle = await enrichPolicyPages({
        scanId: runId,
        organizationId: "local-canary",
        domainId: input.hostname,
        pages: effectivePages,
        advertisingTrackerCount: 0,
        sessionReplayTrackerCount: 0,
        euExposureLikely: true,
        californiaExposureLikely: true,
        allowLlm: true,
        forceLlm: forceSingleChunkPrivacyLlm
      });

      if (cacheKey) {
        canaryEnrichmentCache.set(cacheKey, {
          diagnostics: bundle.diagnostics,
          legalRows: bundle.enrichments.map((row) => toCanaryLegalRow(row)),
          privacyRows: bundle.enrichments
            .filter((row) => row.pageType === "privacy_policy")
            .map((row) => toCanaryLegalRow(row)),
          termsRows: bundle.enrichments
            .filter((row) => row.pageType === "terms_of_service")
            .map((row) => toCanaryLegalRow(row))
        });
      }
    }
  } finally {
    process.env.LLM_ENRICHMENT_MAX_ATTEMPTS = previousAttemptLimit;
    process.env.LLM_ENRICHMENT_MAX_CHUNKS = previousChunkLimit;
    process.env.LLM_ENRICHMENT_FORCE_LAST_CHUNK = previousForceLastChunk;
  }

  const enrichmentMs = Date.now() - enrichmentStartedAt;

  const completedAt = new Date().toISOString();
  return {
    runId,
    domain: input.hostname,
    repetition: input.repetition,
    completedAt,
    cacheHit,
    durationMs: Date.now() - startedAt,
    homepageFetchStatus: fetched.homepage.fetchStatus,
    policySelectionStrategy: fetched.policySelectionStrategy,
    privacyCandidatesConsidered: fetched.pages.length,
    privacyPagesFetched: fetched.pages.filter((page) => page.pageType === "privacy_policy").length,
    timingMs: {
      homepageFetch: fetched.homepageFetchMs,
      policyFetch: fetched.policyFetchMs,
      enrichment: enrichmentMs
    },
    privacyRows:
      "enrichments" in bundle
        ? bundle.enrichments
            .filter((row) => row.pageType === "privacy_policy")
            .map((row) => toCanaryLegalRow(row))
        : bundle.privacyRows,
    legalRows:
      "enrichments" in bundle
        ? bundle.enrichments.map((row) => toCanaryLegalRow(row))
        : bundle.legalRows,
    termsRows:
      "enrichments" in bundle
        ? bundle.enrichments
            .filter((row) => row.pageType === "terms_of_service")
            .map((row) => toCanaryLegalRow(row))
        : bundle.termsRows,
    diagnostics: bundle.diagnostics
  } satisfies CanaryRunResult;
}

function summarizeStability(results: CanaryRunResult[]) {
  const byDomain = new Map<string, CanaryRunResult[]>();

  for (const result of results) {
    byDomain.set(result.domain, [...(byDomain.get(result.domain) ?? []), result]);
  }

  return [...byDomain.entries()].map(([domain, runs]) => {
    const privacyFlagSets = runs.map((run) => [...new Set(run.privacyRows.flatMap((row) => row.policy_actionable_flags ?? []))].sort());
    const confidenceBands = runs.map((run) => confidenceBand(run.privacyRows[0]?.policy_semantic_confidence ?? null));
    const aiModels = runs.map((run) => run.privacyRows[0]?.policy_ai_model ?? null);

    return {
      domain,
      runIds: runs.map((run) => run.runId),
      completedRuns: runs.length,
      privacyFlagSets,
      confidenceBands,
      aiModels,
      stableFlags: privacyFlagSets.every((flags) => JSON.stringify(flags) === JSON.stringify(privacyFlagSets[0] ?? [])),
      stableConfidenceBand: confidenceBands.every((band) => band === confidenceBands[0]),
      stableModel: aiModels.every((model) => model === aiModels[0])
    };
  });
}

async function main() {
  const args = process.argv.slice(2);
  const repetitionFlagIndex = args.findIndex((value) => value === "--repetitions");
  const concurrencyFlagIndex = args.findIndex((value) => value === "--concurrency");
  const llmMaxChunksFlagIndex = args.findIndex((value) => value === "--llm-max-chunks");
  const fastFailLlm = args.includes("--fast-fail-llm");
  const privacyOnly = !args.includes("--include-non-privacy");
  const repetitions =
    repetitionFlagIndex >= 0
      ? Math.max(1, Number.parseInt(args[repetitionFlagIndex + 1] ?? "2", 10) || 2)
      : 2;
  const concurrency =
    concurrencyFlagIndex >= 0
      ? Math.max(1, Number.parseInt(args[concurrencyFlagIndex + 1] ?? "3", 10) || 3)
      : 3;
  const llmMaxChunks =
    llmMaxChunksFlagIndex >= 0
      ? Math.max(1, Number.parseInt(args[llmMaxChunksFlagIndex + 1] ?? "3", 10) || 3)
      : 3;

  const ignoredIndexes = new Set<number>();
  if (repetitionFlagIndex >= 0) {
    ignoredIndexes.add(repetitionFlagIndex);
    ignoredIndexes.add(repetitionFlagIndex + 1);
  }
  if (concurrencyFlagIndex >= 0) {
    ignoredIndexes.add(concurrencyFlagIndex);
    ignoredIndexes.add(concurrencyFlagIndex + 1);
  }
  if (llmMaxChunksFlagIndex >= 0) {
    ignoredIndexes.add(llmMaxChunksFlagIndex);
    ignoredIndexes.add(llmMaxChunksFlagIndex + 1);
  }

  const hostnames = args
    .filter((_, index) => !ignoredIndexes.has(index) && !args[index]?.startsWith("--"))
    .map(normalizeHostname);

  if (hostnames.length === 0) {
    throw new Error("Usage: policy-llm-canary.ts [--repetitions N] [--concurrency N] [--include-non-privacy] <hostname> [hostname...]");
  }

  const jobs = [];
  for (let repetition = 1; repetition <= repetitions; repetition += 1) {
    for (const hostname of hostnames) {
      jobs.push({
        hostname,
        repetition,
        privacyOnly,
        fastFailLlm,
        llmMaxChunks
      });
    }
  }

  const results = await mapWithConcurrency(jobs, concurrency, (job) => runOnePolicyCanary(job));

  console.log(
    JSON.stringify(
      {
        mode: privacyOnly ? "policy-only-privacy-first" : "policy-only-legal-pages",
        repetitions,
        concurrency,
        fastFailLlm,
        llmMaxChunks,
        hostnames,
        results,
        stability: summarizeStability(results)
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
