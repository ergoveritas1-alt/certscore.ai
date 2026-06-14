import {
  type ArtifactRef,
  type DirectVsInferred,
  type EvidenceRef,
  type PolicySurfaceObservation,
  type ScanModuleRun,
} from "@certscore/contracts";
import { chromium, type Browser } from "playwright";
import type { ArtifactWriter } from "../artifact-writer.js";

const SOURCE_SCANNER = "policy_surface";
const SCENARIO = "policy_surface_review";
const MAX_CANDIDATES_TO_FETCH = 8;
const MAX_SECONDARY_CANDIDATES_TO_FETCH = 5;
const POLICY_FETCH_CONCURRENCY = 3;
const POLICY_FETCH_TIMEOUT_MS = 5_000;
const MAX_EXCERPT_CHARS = 520;

export interface PolicySurfaceScannerInput {
  url: string;
  normalizedUrl: string;
  scanStartedAtMs: number;
  internalBudgetMs: number;
  artifactWriter: ArtifactWriter;
  enableNanoPolicyAssist?: boolean;
  nanoAssistProvider?: PolicyNanoAssistProvider;
  discoveryMode?: "full" | "fast";
}

export interface PolicySurfaceScannerResult {
  moduleRun: ScanModuleRun;
  policySurfaceObservations: PolicySurfaceObservation[];
  artifactRefs: ArtifactRef[];
}

export interface PolicyNanoAssistProvider {
  classifyLinks?(input: NanoLinkClassificationInput): Promise<NanoLinkClassificationResult>;
  extractTopics?(input: NanoTopicExtractionInput): Promise<NanoTopicExtractionResult>;
}

export interface NanoLinkClassificationInput {
  assistId: string;
  pageUrl: string;
  candidates: PolicySurfaceCandidate[];
}

export interface NanoLinkClassificationResult {
  assistId: string;
  rankedCandidates: Array<{
    candidateId: string;
    likelySurfaceType: PolicySurfaceObservation["surfaceType"];
    shouldFetch: boolean;
    priorityRank: number;
    confidence: number;
    reason: string;
    uncertaintyNotes?: string[];
  }>;
}

export interface NanoTopicExtractionInput {
  assistId: string;
  surfaceUrl: string;
  surfaceType: PolicySurfaceObservation["surfaceType"];
  title?: string;
  excerpt: string;
  deterministicTopicHits: string[];
}

export interface NanoTopicExtractionResult {
  assistId: string;
  observedTopics: PolicySurfaceObservation["observedTopics"];
  mentionedVendors: string[];
  mentionedPurposes: string[];
  mentionedRights: string[];
  mentionedControls: string[];
  confidence: number;
  uncertaintyNotes?: string[];
}

interface PolicySurfaceCandidate {
  candidateId: string;
  url: string;
  normalizedUrl: string;
  linkText: string;
  selector?: string;
  surroundingTextExcerpt?: string;
  domLocation: "footer" | "header" | "nav" | "body";
  sameOrigin: boolean;
  fetchable: boolean;
  clickable: boolean;
  mayLeadToConsentControls: boolean;
  observationOnly: boolean;
  deterministicSurfaceType: PolicySurfaceObservation["surfaceType"];
  deterministicScore: number;
  deterministicKeywordMatches: string[];
  discoveryMethod: PolicySurfaceObservation["discoveryMethod"];
  assisted?: NanoLinkClassificationResult["rankedCandidates"][number];
}

interface PolicyFacts {
  observedTopics: PolicySurfaceObservation["observedTopics"];
  mentionedVendors: string[];
  mentionedPurposes: string[];
  mentionedRights: string[];
  mentionedControls: string[];
  confidence: number;
  keywords: string[];
}

interface AssistedPolicyFacts extends PolicyFacts {
  assistMetadata: PolicySurfaceObservation["assistMetadata"];
}

export async function policySurfaceScanner(
  input: PolicySurfaceScannerInput,
): Promise<PolicySurfaceScannerResult> {
  const moduleStartedAtMs = Date.now();
  const moduleStartedAt = new Date(moduleStartedAtMs).toISOString();
  const timingBreakdown: NonNullable<ScanModuleRun["timingBreakdown"]> = [];
  const artifactRefs: ArtifactRef[] = [];
  const observations: PolicySurfaceObservation[] = [];

  try {
    const homepage = await recordPolicyTiming(
      timingBreakdown,
      "homepage fetch",
      "Fetch homepage HTML for static policy link discovery.",
      () => fetchText(input.normalizedUrl, remainingMs(input, moduleStartedAtMs)),
    );
    if (!homepage.ok) {
      const fallbackCandidates = commonPathCandidatesFor(input.normalizedUrl, 0);
      const fallbackResults = await fetchRankedPolicyCandidates({
        input,
        timingBreakdown,
        moduleStartedAtMs,
        candidates: fallbackCandidates,
        labelPrefix: "homepage-failed common-path",
      });
      observations.push(...fallbackResults.observations);
      artifactRefs.push(...fallbackResults.artifactRefs);
      if (observations.length > 0) {
        return {
          moduleRun: moduleRun("completed", moduleStartedAt, moduleStartedAtMs, [], timingBreakdown),
          policySurfaceObservations: observations,
          artifactRefs,
        };
      }
      return {
        moduleRun: moduleRun("failed", moduleStartedAt, moduleStartedAtMs, [`Homepage fetch failed with status ${homepage.status ?? "unknown"} and common-path fallback retained no policy surfaces.`], timingBreakdown),
        policySurfaceObservations: [],
        artifactRefs,
      };
    }

    const { candidateHtml, homepageText } = await recordPolicyTiming(
      timingBreakdown,
      "homepage parse",
      "Decode homepage text and embedded HTML.",
      async () => ({
        homepageText: htmlToVisibleText(homepage.text),
        candidateHtml: `${homepage.text}\n${decodeEmbeddedHtml(homepage.text)}`,
      }),
    );
    const staticCandidates = await recordPolicyTiming(
      timingBreakdown,
      "candidate extraction/dedupe",
      "Static and control policy candidate extraction plus dedupe.",
      async () => dedupeCandidates([
        ...extractCandidates(input.normalizedUrl, candidateHtml, homepageText),
        ...extractControlCandidates(input.normalizedUrl, candidateHtml, homepageText),
      ]),
    );
    const fastStaticCoverage = input.discoveryMode === "fast" && hasFastStaticPolicyCoverage(staticCandidates);
    const renderedCandidates = fastStaticCoverage
      ? await recordPolicyTiming(
        timingBreakdown,
        "rendered discovery skipped",
        "Skipped rendered policy discovery because static planned-DAG candidates covered required surfaces.",
        async () => [] as PolicySurfaceCandidate[],
      )
      : await recordPolicyTiming(
        timingBreakdown,
        "rendered discovery",
        "Optional browser-rendered footer/header policy link discovery.",
        () => extractRenderedCandidates(input, moduleStartedAtMs),
      );
    const linkCandidates = fastStaticCoverage
      ? staticCandidates
      : await recordPolicyTiming(
        timingBreakdown,
        "candidate extraction/dedupe rendered merge",
        "Merge static, rendered, and control policy candidates plus dedupe.",
        async () => dedupeCandidates([
          ...staticCandidates,
          ...renderedCandidates,
        ]),
      );
    const initialCandidates = linkCandidates.length > 0
      ? linkCandidates
      : commonPathCandidatesFor(input.normalizedUrl, linkCandidates.length);
    let rankedCandidates = input.discoveryMode === "fast"
      ? await recordPolicyTiming(
        timingBreakdown,
        "deterministic link ranking",
        `Rank ${initialCandidates.length} policy candidates deterministically for planned-DAG fast mode.`,
        async () => deterministicFetchFallback(initialCandidates),
      )
      : await recordPolicyTiming(
        timingBreakdown,
        "Nano link ranking",
        `Rank ${initialCandidates.length} policy candidates for supported surfaces.`,
        () => rankCandidatesWithRequiredNano(input, initialCandidates),
      );
    if (rankedCandidates.length === 0 && input.discoveryMode === "fast") {
      rankedCandidates = await recordPolicyTiming(
        timingBreakdown,
        "Nano link ranking",
        `Rank ${initialCandidates.length} policy candidates for supported surfaces after deterministic fast-path found no fetchable candidates.`,
        () => rankCandidatesWithRequiredNano(input, initialCandidates),
      );
    }
    if (rankedCandidates.length === 0 && linkCandidates.length > 0) {
      rankedCandidates = deterministicFetchFallback(linkCandidates);
      if (rankedCandidates.length === 0) {
        const commonPathCandidates = commonPathCandidatesFor(input.normalizedUrl, linkCandidates.length);
        rankedCandidates = await recordPolicyTiming(
          timingBreakdown,
          "Nano common-path ranking",
          `Rank ${commonPathCandidates.length} common policy paths after empty first pass.`,
          () => rankCandidatesWithRequiredNano(
            input,
            commonPathCandidates,
          ),
        );
        if (rankedCandidates.length === 0) {
          rankedCandidates = deterministicFetchFallback(commonPathCandidates);
        }
      }
    }
    if (rankedCandidates.length === 0) {
      rankedCandidates = deterministicFetchFallback(initialCandidates);
    }
    rankedCandidates = mergeSupplementalPolicyCandidates(
      rankedCandidates,
      initialCandidates,
      policyFetchLimit(input),
    );
    const policyResults = await fetchPolicyCandidateGroup({
      input,
      timingBreakdown,
      moduleStartedAtMs,
      rankedCandidates,
      labelPrefix: "policy",
    });
    observations.push(...policyResults.observations);
    artifactRefs.push(...policyResults.artifactRefs);
    const secondaryCandidates = mergeSupplementalPolicyCandidates(
      [],
      dedupeCandidates(policyResults.secondaryCandidates),
      input.discoveryMode === "fast" ? 0 : MAX_SECONDARY_CANDIDATES_TO_FETCH,
      observations,
    );
    if (secondaryCandidates.length > 0) {
      const secondaryResults = await fetchPolicyCandidateGroup({
        input,
        timingBreakdown,
        moduleStartedAtMs,
        rankedCandidates: secondaryCandidates,
        labelPrefix: "secondary policy",
      });
      observations.push(...secondaryResults.observations);
      artifactRefs.push(...secondaryResults.artifactRefs);
    }

    return {
      moduleRun: moduleRun("completed", moduleStartedAt, moduleStartedAtMs, [], timingBreakdown),
      policySurfaceObservations: observations,
      artifactRefs,
    };
  } catch (error) {
    return {
      moduleRun: moduleRun("failed", moduleStartedAt, moduleStartedAtMs, [error instanceof Error ? error.message : String(error)], timingBreakdown),
      policySurfaceObservations: observations,
      artifactRefs,
    };
  }
}

interface ProcessPolicyCandidateInput {
  input: PolicySurfaceScannerInput;
  timingBreakdown: NonNullable<ScanModuleRun["timingBreakdown"]>;
  moduleStartedAtMs: number;
  candidate: PolicySurfaceCandidate;
  candidateIndex: number;
}

interface ProcessPolicyCandidateResult {
  observation: PolicySurfaceObservation;
  artifactRefs: ArtifactRef[];
  secondaryCandidates: PolicySurfaceCandidate[];
}

async function fetchRankedPolicyCandidates(input: {
  input: PolicySurfaceScannerInput;
  timingBreakdown: NonNullable<ScanModuleRun["timingBreakdown"]>;
  moduleStartedAtMs: number;
  candidates: PolicySurfaceCandidate[];
  labelPrefix: string;
}): Promise<{ observations: PolicySurfaceObservation[]; artifactRefs: ArtifactRef[]; secondaryCandidates: PolicySurfaceCandidate[] }> {
  let rankedCandidates = await recordPolicyTiming(
    input.timingBreakdown,
    `${input.labelPrefix} Nano ranking`,
    `Rank ${input.candidates.length} fallback policy candidates for supported surfaces.`,
    () => rankCandidatesWithRequiredNano(input.input, input.candidates),
  );
  if (rankedCandidates.length === 0) {
    rankedCandidates = deterministicFetchFallback(input.candidates);
  }
  return fetchPolicyCandidateGroup({
    input: input.input,
    timingBreakdown: input.timingBreakdown,
    moduleStartedAtMs: input.moduleStartedAtMs,
    rankedCandidates,
    labelPrefix: input.labelPrefix,
  });
}

async function fetchPolicyCandidateGroup(input: {
  input: PolicySurfaceScannerInput;
  timingBreakdown: NonNullable<ScanModuleRun["timingBreakdown"]>;
  moduleStartedAtMs: number;
  rankedCandidates: PolicySurfaceCandidate[];
  labelPrefix: string;
}): Promise<{ observations: PolicySurfaceObservation[]; artifactRefs: ArtifactRef[]; secondaryCandidates: PolicySurfaceCandidate[] }> {
  const toFetch = input.rankedCandidates.slice(0, MAX_CANDIDATES_TO_FETCH);
  const policyResults = await recordPolicyTiming(
    input.timingBreakdown,
    `${input.labelPrefix} fetch group`,
    `Fetch and project up to ${toFetch.length} ranked policy candidates with concurrency ${POLICY_FETCH_CONCURRENCY}. Child fetch/topic timings may overlap and do not sum to wall time.`,
    () => mapWithConcurrency(
      toFetch.map((candidate, candidateIndex) => ({ candidate, candidateIndex })),
      POLICY_FETCH_CONCURRENCY,
      ({ candidate, candidateIndex }) => processPolicyCandidate({
        input: input.input,
        timingBreakdown: input.timingBreakdown,
        moduleStartedAtMs: input.moduleStartedAtMs,
        candidate,
        candidateIndex,
      }),
    ),
  );
  return {
    artifactRefs: policyResults.flatMap((result) => result.artifactRefs),
    observations: policyResults.map((result) => result.observation),
    secondaryCandidates: policyResults.flatMap((result) => result.secondaryCandidates),
  };
}

async function processPolicyCandidate({
  input,
  timingBreakdown,
  moduleStartedAtMs,
  candidate,
  candidateIndex,
}: ProcessPolicyCandidateInput): Promise<ProcessPolicyCandidateResult> {
  if (candidate.observationOnly) {
    return {
      observation: observationFromCandidate(candidate, {
        status: "observed",
        confidence: Math.max(0.58, candidate.assisted?.confidence ?? candidate.deterministicScore),
      }),
      artifactRefs: [],
      secondaryCandidates: [],
    };
  }
  if (Date.now() - moduleStartedAtMs > input.internalBudgetMs) {
    return {
      observation: observationFromCandidate(candidate, {
        status: "skipped_budget",
        confidence: candidate.assisted?.confidence ?? candidate.deterministicScore,
      }),
      artifactRefs: [],
      secondaryCandidates: [],
    };
  }

  const fetched = await recordPolicyTiming(
    timingBreakdown,
    `policy fetch ${candidateIndex + 1}`,
    `Fetch ${candidate.deterministicSurfaceType} candidate document.`,
    () => fetchText(candidate.normalizedUrl, remainingPolicyFetchMs(input, moduleStartedAtMs)),
  );
  if (!fetched.ok) {
    return {
      observation: observationFromCandidate(candidate, {
        status: "failed",
        httpStatus: fetched.status,
        confidence: Math.max(0.35, candidate.assisted?.confidence ?? candidate.deterministicScore),
      }),
      artifactRefs: [],
      secondaryCandidates: [],
    };
  }

  const title = titleFromHtml(fetched.text);
  const visibleText = htmlToVisibleText(fetched.text);
  const deterministic = extractPolicyFacts(visibleText);
  const excerpt = boundedExcerpt(visibleText, prioritizedExcerptKeywords(deterministic));
  const excerptId = `policy_excerpt_${stableHash(candidate.normalizedUrl)}`;
  const artifactPath = await recordPolicyTiming(
    timingBreakdown,
    `policy artifact ${candidateIndex + 1}`,
    `Write bounded ${candidate.deterministicSurfaceType} excerpt artifact.`,
    () => input.artifactWriter.writeTextArtifact(`${excerptId}.txt`, excerpt),
  );
  const artifactRef: ArtifactRef = {
    artifactId: excerptId,
    artifactType: "other",
    path: artifactPath,
    observedAtMs: elapsed(input.scanStartedAtMs),
    sourceScanner: SOURCE_SCANNER,
    scenario: SCENARIO,
    sensitivity: "redacted",
    redactionStatus: "redacted",
    relatedEventIds: [],
    label: `${candidate.deterministicSurfaceType} excerpt`,
  };
  const topicAssist = await recordPolicyTiming(
    timingBreakdown,
    `Nano topic extraction ${candidateIndex + 1}`,
    `Extract bounded topics for ${candidate.deterministicSurfaceType} candidate.`,
    () => maybeExtractTopics(input, candidate, {
      title,
      excerpt,
      deterministicTopics: deterministic.observedTopics,
    }),
  );
  const merged = mergePolicyFacts(deterministic, topicAssist);

  return {
    observation: observationFromCandidate(candidate, {
      status: "fetched",
      httpStatus: fetched.status,
      title,
      textExcerpt: excerpt,
      boundedTextExcerptIds: [excerptId],
      observedTopics: merged.observedTopics,
      mentionedVendors: merged.mentionedVendors,
      mentionedPurposes: merged.mentionedPurposes,
      mentionedRights: merged.mentionedRights,
      mentionedControls: merged.mentionedControls,
      lastUpdatedText: lastUpdatedText(visibleText),
      evidenceRefs: [{
        refId: `ref_${excerptId}`,
        artifactId: excerptId,
        eventType: "policy_surface",
        url: candidate.normalizedUrl,
        excerpt,
      }],
      artifactRefs: [artifactRef],
      assistMetadata: topicAssist?.assistMetadata ?? [],
      confidence: Math.max(candidate.assisted?.confidence ?? 0, deterministic.confidence),
    }),
    artifactRefs: [artifactRef],
    secondaryCandidates: highValueSecondaryCandidatesFromPolicyPage(
      candidate.normalizedUrl,
      `${fetched.text}\n${decodeEmbeddedHtml(fetched.text)}`,
      visibleText,
    ),
  };
}

function moduleRun(
  status: ScanModuleRun["status"],
  startedAt: string,
  startedAtMs: number,
  errors: string[] = [],
  timingBreakdown?: ScanModuleRun["timingBreakdown"],
): ScanModuleRun {
  return {
    moduleName: "policySurfaceScanner",
    status,
    startedAt,
    completedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAtMs,
    timingBreakdown,
    evidenceRefs: [],
    errors,
  };
}

async function recordPolicyTiming<T>(
  timingBreakdown: NonNullable<ScanModuleRun["timingBreakdown"]>,
  label: string,
  detail: string,
  run: () => Promise<T>,
): Promise<T> {
  const startedAtMs = Date.now();
  try {
    return await run();
  } finally {
    timingBreakdown.push({
      label,
      detail,
      durationMs: Date.now() - startedAtMs,
    });
  }
}

async function mapWithConcurrency<TInput, TOutput>(
  inputs: TInput[],
  concurrency: number,
  mapper: (input: TInput) => Promise<TOutput>,
): Promise<TOutput[]> {
  const results = new Array<TOutput>(inputs.length);
  let nextIndex = 0;
  const workerCount = Math.min(Math.max(1, concurrency), inputs.length);

  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (nextIndex < inputs.length) {
      const currentIndex = nextIndex++;
      const input = inputs[currentIndex];
      if (input === undefined) {
        continue;
      }
      results[currentIndex] = await mapper(input);
    }
  }));

  return results;
}

function extractCandidates(baseUrl: string, html: string, visibleText: string): PolicySurfaceCandidate[] {
  const candidates: PolicySurfaceCandidate[] = [];
  const anchorPattern = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  let index = 0;
  while ((match = anchorPattern.exec(html))) {
    const attrs = match[1] ?? "";
    const href = attr(attrs, "href");
    if (!href) {
      continue;
    }
    const normalizedUrl = normalizeUrl(href, baseUrl);
    if (!normalizedUrl || !isFetchablePolicyUrl(baseUrl, normalizedUrl)) {
      continue;
    }
    const linkText = htmlToVisibleText(match[2] ?? "").slice(0, 160);
    const attributeText = [attr(attrs, "aria-label"), attr(attrs, "title")].filter(Boolean).join(" ");
    const candidateText = normalizeWhitespace(`${linkText} ${attributeText}`).slice(0, 220) || normalizedUrl;
    const surroundingTextExcerpt = surroundingText(visibleText, linkText);
    const deterministic = classifySurface(`${candidateText} ${normalizedUrl}`);
    const domLocation = domLocationFor(html, match.index);
    const observationOnly = isObservationOnlyPreferenceControl(deterministic.surfaceType, candidateText);
    candidates.push({
      candidateId: `policy_candidate_${index++}`,
      url: href,
      normalizedUrl,
      linkText: candidateText,
      surroundingTextExcerpt,
      domLocation,
      sameOrigin: sameOrigin(baseUrl, normalizedUrl),
      fetchable: true,
      clickable: true,
      mayLeadToConsentControls: observationOnly,
      observationOnly,
      deterministicSurfaceType: deterministic.surfaceType,
      deterministicScore: deterministic.score,
      deterministicKeywordMatches: deterministic.keywords,
      discoveryMethod: domLocation === "footer"
        ? "footer_link"
        : domLocation === "header" || domLocation === "nav"
          ? "header_link"
          : "page_text_link",
    });
  }
  return candidates;
}

function extractControlCandidates(baseUrl: string, html: string, visibleText: string): PolicySurfaceCandidate[] {
  const candidates: PolicySurfaceCandidate[] = [];
  const controlPattern = /<(button|[^>]+\brole=["'](?:button|link)["'][^>]*)\b([^>]*)>([\s\S]*?)<\/(?:button|[^>]+)>/gi;
  let match: RegExpExecArray | null;
  let index = 0;
  while ((match = controlPattern.exec(html))) {
    const fullTag = match[0] ?? "";
    const attrs = `${match[1] ?? ""} ${match[2] ?? ""}`;
    const href = attr(attrs, "href") ?? attr(attrs, "data-href") ?? attr(attrs, "data-url");
    const normalizedUrl = href ? normalizeUrl(href, baseUrl) : baseUrl;
    if (!normalizedUrl) {
      continue;
    }
    const text = normalizeWhitespace([
      htmlToVisibleText(match[3] ?? ""),
      attr(attrs, "aria-label"),
      attr(attrs, "title"),
      attr(attrs, "id"),
      href,
    ].filter(Boolean).join(" ")).slice(0, 220);
    const deterministic = classifySurface(`${text} ${normalizedUrl}`);
    if (deterministic.surfaceType === "unknown" || !isPreferenceControlSurface(deterministic.surfaceType, text)) {
      continue;
    }
    const selector = attr(attrs, "id") ? `#${attr(attrs, "id")}` : undefined;
    const domLocation = domLocationFor(html, match.index);
    const fetchable = Boolean(href) && isFetchablePolicyUrl(baseUrl, normalizedUrl);
    candidates.push({
      candidateId: `policy_control_candidate_${index++}`,
      url: href ?? baseUrl,
      normalizedUrl,
      linkText: text || normalizedUrl,
      selector,
      surroundingTextExcerpt: surroundingText(visibleText, text),
      domLocation,
      sameOrigin: sameOrigin(baseUrl, normalizedUrl),
      fetchable,
      clickable: /<button\b|role=["'](?:button|link)["']/i.test(fullTag),
      mayLeadToConsentControls: true,
      observationOnly: !fetchable || isObservationOnlyPreferenceControl(deterministic.surfaceType, text),
      deterministicSurfaceType: deterministic.surfaceType,
      deterministicScore: deterministic.score,
      deterministicKeywordMatches: deterministic.keywords,
      discoveryMethod: domLocation === "footer"
        ? "footer_link"
        : domLocation === "header" || domLocation === "nav"
          ? "header_link"
          : "page_text_link",
    });
  }
  return candidates;
}

async function extractRenderedCandidates(
  input: PolicySurfaceScannerInput,
  moduleStartedAtMs: number,
): Promise<PolicySurfaceCandidate[]> {
  if (remainingMs(input, moduleStartedAtMs) < 1_500) {
    return [];
  }
  let browser: Browser | undefined;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      ignoreHTTPSErrors: true,
      viewport: { width: 1366, height: 900 },
    });
    const page = await context.newPage();
    await page.goto(input.normalizedUrl, {
      waitUntil: "domcontentloaded",
      timeout: Math.min(8_000, Math.max(1_000, remainingMs(input, moduleStartedAtMs))),
    });
    await page.waitForLoadState("networkidle", {
      timeout: Math.min(1_000, Math.max(500, remainingMs(input, moduleStartedAtMs))),
    }).catch(() => undefined);
    await page.waitForTimeout(Math.min(400, Math.max(250, remainingMs(input, moduleStartedAtMs))));
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
    }).catch(() => undefined);
    await page.waitForTimeout(Math.min(300, Math.max(150, remainingMs(input, moduleStartedAtMs))));
    const visibleText = await page.locator("body").innerText({ timeout: 1_500 }).catch(() => "");
    const rawCandidates = await page.evaluate(() => {
      type RawCandidate = {
        href?: string;
        text: string;
        selector?: string;
        domLocation: "footer" | "header" | "nav" | "body";
        clickable: boolean;
      };

      function normalizeText(value: string | null | undefined): string {
        return (value ?? "").replace(/\s+/g, " ").trim();
      }

      function domLocationForElement(element: Element): RawCandidate["domLocation"] {
        if (element.closest("footer")) return "footer";
        if (element.closest("header")) return "header";
        if (element.closest("nav")) return "nav";
        return "body";
      }

      function selectorFor(element: Element): string | undefined {
        const cssEscape = (value: string): string => value.replace(/["\\]/g, "\\$&");
        const id = element.getAttribute("id");
        if (id) return `#${cssEscape(id)}`;
        const testId = element.getAttribute("data-testid");
        if (testId) return `[data-testid="${cssEscape(testId)}"]`;
        const aria = element.getAttribute("aria-label");
        const tag = element.tagName.toLowerCase();
        if (aria) return `${tag}[aria-label="${cssEscape(aria)}"]`;
        return tag;
      }

      function hrefFromElement(element: Element): string | undefined {
        const direct = element.getAttribute("href") ??
          element.getAttribute("data-href") ??
          element.getAttribute("data-url") ??
          element.getAttribute("data-link");
        if (direct) return direct;
        const onclick = element.getAttribute("onclick") ?? "";
        return /(?:location\.href|window\.location|document\.location)\s*=\s*['"]([^'"]+)['"]/i.exec(onclick)?.[1];
      }

      function collect(root: ParentNode, output: RawCandidate[]): void {
        const elements = [
          ...root.querySelectorAll("a[href], button, [role='button'], [role='link'], [aria-label], [title]"),
        ];
        for (const element of elements) {
          const href = hrefFromElement(element);
          const text = normalizeText([
            element.textContent,
            element.getAttribute("aria-label"),
            element.getAttribute("title"),
            element.getAttribute("data-testid"),
            href,
          ].filter(Boolean).join(" "));
          if (!text && !href) continue;
          output.push({
            href,
            text: text.slice(0, 220),
            selector: selectorFor(element),
            domLocation: domLocationForElement(element),
            clickable: element.matches("button, a, [role='button'], [role='link']"),
          });
          const shadowRoot = (element as HTMLElement).shadowRoot;
          if (shadowRoot) collect(shadowRoot, output);
        }
      }

      const output: RawCandidate[] = [];
      collect(document, output);
      return output;
    }).catch(() => []);

    return rawCandidates.flatMap((candidate, index): PolicySurfaceCandidate[] => {
      const normalizedUrl = candidate.href ? normalizeUrl(candidate.href, input.normalizedUrl) : input.normalizedUrl;
      const evidenceText = `${candidate.text} ${normalizedUrl ?? ""}`;
      const deterministic = classifySurface(evidenceText);
      if (deterministic.surfaceType === "unknown" || deterministic.score <= 0.2 || !normalizedUrl) {
        return [];
      }
      const fetchable = Boolean(candidate.href) && isFetchablePolicyUrl(input.normalizedUrl, normalizedUrl);
      if (!fetchable && !isPreferenceControlSurface(deterministic.surfaceType, candidate.text)) {
        return [];
      }
      const observationOnly = !fetchable || isObservationOnlyPreferenceControl(deterministic.surfaceType, candidate.text);
      return [{
        candidateId: `policy_rendered_candidate_${index}`,
        url: candidate.href ?? input.normalizedUrl,
        normalizedUrl,
        linkText: candidate.text || normalizedUrl,
        selector: candidate.selector,
        surroundingTextExcerpt: surroundingText(visibleText, candidate.text),
        domLocation: candidate.domLocation,
        sameOrigin: sameOrigin(input.normalizedUrl, normalizedUrl),
        fetchable,
        clickable: candidate.clickable,
        mayLeadToConsentControls: isPreferenceControlSurface(deterministic.surfaceType, evidenceText),
        observationOnly,
        deterministicSurfaceType: deterministic.surfaceType,
        deterministicScore: deterministic.score,
        deterministicKeywordMatches: deterministic.keywords,
        discoveryMethod: candidate.domLocation === "footer"
          ? "footer_link"
          : candidate.domLocation === "header" || candidate.domLocation === "nav"
            ? "header_link"
            : "page_text_link",
      }];
    });
  } catch {
    return [];
  } finally {
    await browser?.close().catch(() => undefined);
  }
}

function commonPathCandidatesFor(baseUrl: string, startIndex: number): PolicySurfaceCandidate[] {
  const paths = [
    "/privacy",
    "/privacy-policy",
    "/privacy-notice",
    "/legal/privacy",
    "/legal/privacy/",
    "/cookie-policy",
    "/cookies-policy",
    "/cookie-notice",
    "/cookies",
    "/privacy/cookies",
    "/privacy/cookie-policy",
    "/privacy-and-cookies",
    "/legal/cookies-and-tracking-technologies",
    "/legal/cookies-and-tracking-technologies/",
    "/cookie-settings",
    "/privacy-choices",
    "/your-privacy-choices",
    "/yourprivacychoices",
    "/privacy/your-privacy-choices",
    "/do-not-sell",
    "/do-not-sell-or-share",
    "/privacy#do-not-sell",
    "/privacy#your-privacy-choices",
    "/california-privacy-notice",
    "/privacy/california-privacy-notice",
    "/notice-at-collection",
    "/terms",
    "/accessibility",
  ];
  return paths.map((path, offset) => {
    const normalizedUrl = normalizeUrl(path, baseUrl) ?? baseUrl;
    const deterministic = classifySurface(path);
    return {
      candidateId: `policy_candidate_${startIndex + offset}`,
      url: path,
      normalizedUrl,
      linkText: path.replace(/[-/]/g, " ").trim(),
      domLocation: "body" as const,
      sameOrigin: true,
      fetchable: true,
      clickable: false,
      mayLeadToConsentControls: deterministic.surfaceType === "your_privacy_choices" || deterministic.surfaceType === "cookie_settings",
      observationOnly: false,
      deterministicSurfaceType: deterministic.surfaceType,
      deterministicScore: deterministic.score - 0.15,
      deterministicKeywordMatches: deterministic.keywords,
      discoveryMethod: "guessed_common_path" as const,
    };
  }).filter((candidate) => candidate.deterministicScore > 0.2);
}

function deterministicFetchFallback(candidates: PolicySurfaceCandidate[]): PolicySurfaceCandidate[] {
  return candidates
    .filter((candidate) =>
      candidate.fetchable &&
      candidate.deterministicSurfaceType !== "unknown" &&
      candidate.deterministicScore >= 0.5,
    )
    .sort((left, right) =>
      surfacePriority(left.deterministicSurfaceType) - surfacePriority(right.deterministicSurfaceType) ||
      right.deterministicScore - left.deterministicScore ||
      left.normalizedUrl.localeCompare(right.normalizedUrl),
    )
    .slice(0, MAX_CANDIDATES_TO_FETCH);
}

function hasFastStaticPolicyCoverage(candidates: PolicySurfaceCandidate[]): boolean {
  const fetchable = deterministicFetchFallback(candidates);
  if (fetchable.length === 0) {
    return false;
  }
  const surfaceTypes = new Set(fetchable.map((candidate) => candidate.deterministicSurfaceType));
  return surfaceTypes.has("privacy_policy") ||
    (surfaceTypes.has("cookie_policy") && (
      surfaceTypes.has("california_notice") ||
      surfaceTypes.has("your_privacy_choices") ||
      surfaceTypes.has("do_not_sell_or_share")
    ));
}

function policyFetchLimit(input: PolicySurfaceScannerInput): number {
  return input.discoveryMode === "fast" ? 4 : MAX_CANDIDATES_TO_FETCH;
}

function mergeSupplementalPolicyCandidates(
  rankedCandidates: PolicySurfaceCandidate[],
  allCandidates: PolicySurfaceCandidate[],
  limit: number,
  existingObservations: PolicySurfaceObservation[] = [],
): PolicySurfaceCandidate[] {
  const existingUrls = new Set(existingObservations
    .map((observation) => observation.normalizedUrl ?? observation.url)
    .filter((value): value is string => Boolean(value)));
  const selected = new Map<string, PolicySurfaceCandidate>();
  for (const candidate of rankedCandidates) {
    const key = candidateKey(candidate);
    if (!existingUrls.has(candidate.normalizedUrl)) {
      selected.set(key, candidate);
    }
  }

  const rankedKeys = new Set(selected.keys());
  const supplements = allCandidates
    .filter((candidate) =>
      !rankedKeys.has(candidateKey(candidate)) &&
      !existingUrls.has(candidate.normalizedUrl) &&
      isHighValuePolicySupplement(candidate)
    )
    .sort((left, right) =>
      surfacePriority(left.deterministicSurfaceType) - surfacePriority(right.deterministicSurfaceType) ||
      right.deterministicScore - left.deterministicScore ||
      left.normalizedUrl.localeCompare(right.normalizedUrl),
    );

  for (const candidate of supplements) {
    selected.set(candidateKey(candidate), candidate);
    if (selected.size >= limit) {
      break;
    }
  }

  return [...selected.values()].slice(0, limit);
}

function highValueSecondaryCandidatesFromPolicyPage(
  baseUrl: string,
  html: string,
  visibleText: string,
): PolicySurfaceCandidate[] {
  return dedupeCandidates([
    ...extractCandidates(baseUrl, html, visibleText),
    ...extractControlCandidates(baseUrl, html, visibleText),
  ]).filter(isHighValuePolicySupplement);
}

function candidateKey(candidate: PolicySurfaceCandidate) {
  return candidate.observationOnly && candidate.selector
    ? `${candidate.normalizedUrl}#${candidate.selector}`
    : candidate.normalizedUrl;
}

function isHighValuePolicySupplement(candidate: PolicySurfaceCandidate): boolean {
  if (!candidate.fetchable && !candidate.observationOnly) {
    return false;
  }
  if (candidate.deterministicScore < 0.5) {
    return false;
  }
  return [
    "cookie_policy",
    "your_privacy_choices",
    "do_not_sell_or_share",
    "consent_preferences",
    "cookie_settings",
    "notice_at_collection",
    "california_notice",
  ].includes(candidate.deterministicSurfaceType);
}

function surfacePriority(surfaceType: PolicySurfaceObservation["surfaceType"]): number {
  const index = [
    "privacy_policy",
    "cookie_policy",
    "your_privacy_choices",
    "do_not_sell_or_share",
    "consent_preferences",
    "cookie_settings",
    "notice_at_collection",
    "california_notice",
    "accessibility_statement",
    "terms",
    "ai_disclosure",
  ].indexOf(surfaceType);
  return index >= 0 ? index : 999;
}

async function rankCandidatesWithRequiredNano(
  input: PolicySurfaceScannerInput,
  candidates: PolicySurfaceCandidate[],
): Promise<PolicySurfaceCandidate[]> {
  if (input.enableNanoPolicyAssist === false) {
    throw new Error("Nano policy assist cannot be disabled for policy-surface link discovery.");
  }
  if (!input.nanoAssistProvider?.classifyLinks) {
    throw new Error("Nano policy assist is required for policy-surface link discovery but no Nano link classification provider is configured.");
  }

  const byId = new Map(candidates.map((candidate) => [candidate.candidateId, candidate]));
  const assistId = `nano_policy_links_${stableHash(input.normalizedUrl)}`;
  const result = await input.nanoAssistProvider.classifyLinks({
    assistId,
    pageUrl: input.normalizedUrl,
    candidates,
  });
  const rankedIds = new Set<string>();
  for (const ranked of result.rankedCandidates) {
    const candidate = byId.get(ranked.candidateId);
    if (candidate) {
      rankedIds.add(ranked.candidateId);
      candidate.assisted = ranked;
      candidate.deterministicSurfaceType = ranked.likelySurfaceType;
      candidate.discoveryMethod = "nano_assisted_link_classification";
    }
  }
  return [...byId.values()]
    .filter((candidate) =>
      rankedIds.has(candidate.candidateId) &&
      candidate.assisted?.shouldFetch !== false &&
      candidate.assisted?.likelySurfaceType !== "unknown",
    )
    .sort((left, right) =>
      (left.assisted?.priorityRank ?? 999) - (right.assisted?.priorityRank ?? 999) ||
      (right.assisted?.confidence ?? 0) - (left.assisted?.confidence ?? 0) ||
      left.normalizedUrl.localeCompare(right.normalizedUrl),
    );
}

async function maybeExtractTopics(
  input: PolicySurfaceScannerInput,
  candidate: PolicySurfaceCandidate,
  facts: { title?: string; excerpt: string; deterministicTopics: PolicySurfaceObservation["observedTopics"] },
): Promise<AssistedPolicyFacts | undefined> {
  if (!input.enableNanoPolicyAssist || !input.nanoAssistProvider?.extractTopics) {
    return undefined;
  }
  const assistId = `nano_policy_topics_${stableHash(candidate.normalizedUrl)}`;
  const result = await input.nanoAssistProvider.extractTopics({
    assistId,
    surfaceUrl: candidate.normalizedUrl,
    surfaceType: candidate.deterministicSurfaceType,
    title: facts.title,
    excerpt: facts.excerpt,
    deterministicTopicHits: facts.deterministicTopics,
  });
  return {
    observedTopics: result.observedTopics,
    mentionedVendors: result.mentionedVendors,
    mentionedPurposes: result.mentionedPurposes,
    mentionedRights: result.mentionedRights,
    mentionedControls: result.mentionedControls,
    confidence: result.confidence,
    keywords: [],
    assistMetadata: [{
      assistId,
      modelAssistProvider: "nano",
      assistType: "topic_extraction",
      inputEvidenceRefs: [],
      inputExcerptIds: [],
      outputSchemaVersion: "policy-assist.v1",
      confidence: result.confidence,
      uncertaintyNotes: result.uncertaintyNotes ?? [],
      evidenceRefs: [],
      usedForFinalFinding: false,
    }],
  };
}

function observationFromCandidate(
  candidate: PolicySurfaceCandidate,
  input: Partial<PolicySurfaceObservation> & { status: PolicySurfaceObservation["status"]; confidence: number },
): PolicySurfaceObservation {
  const nanoMetadata: PolicySurfaceObservation["assistMetadata"] = candidate.assisted
    ? [{
      assistId: `nano_policy_links_${stableHash(candidate.normalizedUrl)}`,
      modelAssistProvider: "nano",
      assistType: "link_classification",
      inputEvidenceRefs: [],
      inputExcerptIds: [],
      outputSchemaVersion: "policy-assist.v1",
      confidence: candidate.assisted.confidence,
      uncertaintyNotes: candidate.assisted.uncertaintyNotes ?? [],
      evidenceRefs: [],
      usedForFinalFinding: false,
    }]
    : [];
  return {
    observationId: `policy_surface_${stableHash(candidate.normalizedUrl)}`,
    sourceScanner: SOURCE_SCANNER,
    scenario: SCENARIO,
    consentStateAtTime: "not_applicable",
    surfaceType: candidate.deterministicSurfaceType,
    url: candidate.url,
    normalizedUrl: candidate.normalizedUrl,
    linkText: candidate.linkText,
    selector: candidate.selector,
    surroundingTextExcerpt: candidate.surroundingTextExcerpt,
    discoveryMethod: candidate.discoveryMethod,
    status: input.status,
    httpStatus: input.httpStatus,
    fetchable: candidate.fetchable,
    clickable: candidate.clickable,
    mayLeadToConsentControls: candidate.mayLeadToConsentControls,
    title: input.title,
    textExcerpt: input.textExcerpt,
    boundedTextExcerptIds: input.boundedTextExcerptIds ?? [],
    observedTopics: input.observedTopics ?? [],
    mentionedVendors: input.mentionedVendors ?? [],
    mentionedPurposes: input.mentionedPurposes ?? [],
    mentionedRights: input.mentionedRights ?? [],
    mentionedControls: input.mentionedControls ?? [],
    lastUpdatedText: input.lastUpdatedText,
    confidence: input.confidence,
    directVsInferred: candidate.assisted ? "mixed" : "direct",
    evidenceRefs: input.evidenceRefs ?? [],
    artifactRefs: input.artifactRefs ?? [],
    assistMetadata: [...nanoMetadata, ...(input.assistMetadata ?? [])],
  };
}

function classifySurface(value: string): {
  surfaceType: PolicySurfaceObservation["surfaceType"];
  score: number;
  keywords: string[];
} {
  const lower = value.toLowerCase();
  const checks: Array<[PolicySurfaceObservation["surfaceType"], RegExp[]]> = [
    ["do_not_sell_or_share", [/do not sell/i, /do-not-sell/i, /do not sell or share/i, /do-not-share/i]],
    ["consent_preferences", [/preference center/i, /privacy center/i, /privacy settings/i, /consent settings/i]],
    ["your_privacy_choices", [/your privacy choices/i, /privacy choices/i, /your choices/i, /ad choices/i, /adchoices/i]],
    ["notice_at_collection", [/notice at collection/i]],
    ["california_notice", [/california privacy/i, /state privacy rights/i, /state privacy policy/i, /state-privacy-policy/i, /about-state-privacy-policy/i]],
    ["cookie_settings", [/cookie settings/i, /cookie preferences/i, /manage preferences/i, /cookie consent/i]],
    ["cookie_policy", [/cookie policy/i, /cookies\b/i]],
    ["privacy_policy", [/privacy policy/i, /privacy notice/i, /privacy\b/i]],
    ["ai_disclosure", [/\bai\b/i, /artificial intelligence/i]],
    ["accessibility_statement", [/accessibility/i]],
    ["terms", [/terms/i]],
  ];
  for (const [surfaceType, patterns] of checks) {
    const matches = patterns.filter((pattern) => pattern.test(lower)).map((pattern) => pattern.source);
    if (matches.length > 0) {
      return { surfaceType, score: Math.min(0.95, 0.55 + matches.length * 0.18), keywords: matches };
    }
  }
  return { surfaceType: "unknown", score: 0.1, keywords: [] };
}

function isPreferenceControlSurface(surfaceType: PolicySurfaceObservation["surfaceType"], value: string): boolean {
  return surfaceType === "consent_preferences" ||
    surfaceType === "cookie_settings" ||
    /manage preferences|preference center|privacy center|privacy settings|cookie settings|cookie preferences|ad choices|your choices/i.test(value);
}

function isObservationOnlyPreferenceControl(surfaceType: PolicySurfaceObservation["surfaceType"], value: string): boolean {
  return surfaceType === "consent_preferences" ||
    surfaceType === "cookie_settings" ||
    /manage preferences|preference center|privacy center|privacy settings|cookie settings|cookie preferences/i.test(value);
}

function extractPolicyFacts(text: string): {
  observedTopics: PolicySurfaceObservation["observedTopics"];
  mentionedVendors: string[];
  mentionedPurposes: string[];
  mentionedRights: string[];
  mentionedControls: string[];
  confidence: number;
  keywords: string[];
} {
  const rules: Array<[PolicySurfaceObservation["observedTopics"][number], RegExp, string]> = [
    ["cookies", /\bcookies?\b/i, "cookies"],
    ["analytics", /\banalytics?\b/i, "analytics"],
    ["advertising", /\badvertis/i, "advertising"],
    ["targeted_advertising", /targeted advertising|interest-based advertising/i, "targeted advertising"],
    ["sale_or_share", /\bsale\b|\bshare\b/i, "sale/share"],
    ["do_not_sell_or_share", /do not sell|do not share/i, "do not sell/share"],
    ["global_privacy_control", /global privacy control|\bGPC\b|opt[-\s]?out preference signal/i, "global privacy control"],
    ["california_privacy_rights", /california|CCPA|CPRA/i, "california privacy rights"],
    ["notice_at_collection", /notice at collection|notice of collection|(?:information we collect|categories of personal information)[\s\S]{0,1200}(?:business purposes|commercial purpose|categories of sources)/i, "notice at collection"],
    ["sensitive_personal_information", /sensitive personal information/i, "sensitive personal information"],
    ["profiling_or_automated_decision_making", /profiling|automated decision/i, "profiling"],
    ["session_replay_or_behavioral_analytics", /session replay|behavioral analytics/i, "session replay"],
    ["third_party_disclosures", /third parties|third-party|partners/i, "third parties"],
    ["vendor_list", /vendor list|service providers|processors/i, "vendor list"],
    ["consent_withdrawal", /withdraw consent|opt out|opt-out/i, "consent withdrawal"],
    ["cookie_settings", /cookie settings|cookie preferences|manage preferences/i, "cookie settings"],
    ["data_retention", /retain|retention/i, "data retention"],
    ["ai_generated_content", /ai-generated|generated by ai/i, "ai generated content"],
    ["ai_features", /artificial intelligence|\bAI\b/i, "ai features"],
    ["contact_privacy", /privacy@|contact us/i, "contact privacy"],
    ["accessibility", /accessibility/i, "accessibility"],
  ];
  const observedTopics = unique(rules.filter(([, pattern]) => pattern.test(text)).map(([topic]) => topic));
  const keywords = rules.filter(([, pattern]) => pattern.test(text)).map(([, , keyword]) => keyword);
  const vendors = knownVendorMentions(text);
  return {
    observedTopics,
    mentionedVendors: vendors,
    mentionedPurposes: unique(observedTopics.filter((topic) => ["analytics", "advertising", "targeted_advertising"].includes(topic))),
    mentionedRights: unique(observedTopics.filter((topic) => ["california_privacy_rights", "do_not_sell_or_share"].includes(topic))),
    mentionedControls: unique(observedTopics.filter((topic) => ["global_privacy_control", "cookie_settings", "consent_withdrawal"].includes(topic))),
    confidence: observedTopics.length > 0 || vendors.length > 0 ? 0.76 : 0.45,
    keywords,
  };
}

function knownVendorMentions(text: string): string[] {
  const vendors = [
    "Google Analytics",
    "Google Ads",
    "DoubleClick",
    "Meta",
    "Facebook Pixel",
    "Microsoft Clarity",
    "Hotjar",
    "FullStory",
    "TikTok",
    "LinkedIn",
    "Adobe",
    "Amazon Ads",
    "LiveRamp",
    "The Trade Desk",
    "Criteo",
    "Lotame",
    "Taboola",
    "Outbrain",
    "Quantcast",
    "OneTrust",
    "Cookiebot",
    "Didomi",
    "TrustArc",
  ];
  return vendors.filter((vendor) => new RegExp(`\\b${escapeRegExp(vendor)}\\b`, "i").test(text));
}

function mergePolicyFacts(
  deterministic: PolicyFacts,
  assisted: AssistedPolicyFacts | undefined,
): PolicyFacts {
  if (!assisted) {
    return deterministic;
  }
  return {
    observedTopics: unique([...deterministic.observedTopics, ...assisted.observedTopics]),
    mentionedVendors: unique([...deterministic.mentionedVendors, ...assisted.mentionedVendors]),
    mentionedPurposes: unique([...deterministic.mentionedPurposes, ...assisted.mentionedPurposes]),
    mentionedRights: unique([...deterministic.mentionedRights, ...assisted.mentionedRights]),
    mentionedControls: unique([...deterministic.mentionedControls, ...assisted.mentionedControls]),
    confidence: Math.max(deterministic.confidence, assisted.confidence),
    keywords: deterministic.keywords,
  };
}

async function fetchText(url: string, timeoutMs: number): Promise<{ ok: boolean; status?: number; text: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(500, timeoutMs));
  try {
    const response = await fetch(url, { signal: controller.signal, redirect: "follow" });
    const contentType = response.headers.get("content-type") ?? "";
    if (!response.ok || !/text|html|json/i.test(contentType)) {
      return { ok: response.ok, status: response.status, text: "" };
    }
    return {
      ok: true,
      status: response.status,
      text: (await response.text()).slice(0, 500_000),
    };
  } catch {
    return { ok: false, text: "" };
  } finally {
    clearTimeout(timeout);
  }
}

function boundedExcerpt(text: string, keywords: string[]): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  const lower = normalized.toLowerCase();
  const keyword = keywords.find((item) => lower.includes(item.toLowerCase()));
  const index = keyword ? Math.max(0, lower.indexOf(keyword.toLowerCase()) - 180) : 0;
  return normalized.slice(index, index + MAX_EXCERPT_CHARS);
}

const TOPIC_EXCERPT_KEYWORD_PRIORITY: Array<{
  topic: PolicySurfaceObservation["observedTopics"][number];
  keywords: string[];
}> = [
  { topic: "global_privacy_control", keywords: ["global privacy control", "GPC", "opt-out preference signal"] },
  { topic: "do_not_sell_or_share", keywords: ["do not sell", "do not share"] },
  { topic: "notice_at_collection", keywords: ["notice at collection", "notice of collection", "information we collect", "categories of personal information"] },
  { topic: "sensitive_personal_information", keywords: ["sensitive personal information"] },
  { topic: "targeted_advertising", keywords: ["targeted advertising", "interest-based advertising"] },
  { topic: "cookie_settings", keywords: ["cookie settings", "cookie preferences", "manage preferences"] },
  { topic: "consent_withdrawal", keywords: ["withdraw consent", "opt out", "opt-out"] },
];

function prioritizedExcerptKeywords(facts: PolicyFacts): string[] {
  const topicAnchors = TOPIC_EXCERPT_KEYWORD_PRIORITY
    .filter((entry) => facts.observedTopics.includes(entry.topic))
    .flatMap((entry) => entry.keywords);
  return unique([...topicAnchors, ...facts.keywords]);
}

function htmlToVisibleText(html: string): string {
  return normalizeWhitespace(html
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">"));
}

function decodeEmbeddedHtml(html: string): string {
  return html
    .replace(/\\u003c/gi, "<")
    .replace(/\\u003e/gi, ">")
    .replace(/\\u0026/gi, "&")
    .replace(/\\u002F/gi, "/")
    .replace(/\\"/g, "\"")
    .slice(0, 250_000);
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function titleFromHtml(html: string): string | undefined {
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1];
  return title ? htmlToVisibleText(title).slice(0, 180) : undefined;
}

function attr(attrs: string, name: string): string | undefined {
  return new RegExp(`${name}=["']([^"']+)["']`, "i").exec(attrs)?.[1];
}

function normalizeUrl(href: string, baseUrl: string): string | undefined {
  try {
    const parsed = new URL(href, baseUrl);
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return undefined;
  }
}

function isFetchablePolicyUrl(baseUrl: string, url: string): boolean {
  if (sameOrigin(baseUrl, url)) {
    return true;
  }
  return /privacy|consent|onetrust|cookiebot|didomi|trustarc/i.test(url);
}

function sameOrigin(left: string, right: string): boolean {
  try {
    return new URL(left).origin === new URL(right).origin;
  } catch {
    return false;
  }
}

function domLocationFor(html: string, index: number): PolicySurfaceCandidate["domLocation"] {
  const prefix = html.slice(Math.max(0, index - 2_000), index).toLowerCase();
  if (prefix.lastIndexOf("<footer") > prefix.lastIndexOf("</footer")) {
    return "footer";
  }
  if (prefix.lastIndexOf("<header") > prefix.lastIndexOf("</header")) {
    return "header";
  }
  if (prefix.lastIndexOf("<nav") > prefix.lastIndexOf("</nav")) {
    return "nav";
  }
  return "body";
}

function surroundingText(visibleText: string, linkText: string): string | undefined {
  if (!linkText) {
    return undefined;
  }
  const index = visibleText.toLowerCase().indexOf(linkText.toLowerCase());
  if (index < 0) {
    return undefined;
  }
  return visibleText.slice(Math.max(0, index - 120), index + linkText.length + 120);
}

function lastUpdatedText(text: string): string | undefined {
  return /(last updated|effective date|updated):?\s+([A-Za-z0-9, .-]{4,40})/i.exec(text)?.[0]?.slice(0, 80);
}

function dedupeCandidates(candidates: PolicySurfaceCandidate[]): PolicySurfaceCandidate[] {
  const byUrl = new Map<string, PolicySurfaceCandidate>();
  for (const candidate of candidates) {
    const key = candidate.observationOnly && candidate.selector
      ? `${candidate.normalizedUrl}#${candidate.selector}`
      : candidate.normalizedUrl;
    const existing = byUrl.get(key);
    if (
      !existing ||
      (candidate.fetchable && !existing.fetchable) ||
      candidate.deterministicScore > existing.deterministicScore
    ) {
      byUrl.set(key, candidate);
    }
  }
  return [...byUrl.values()];
}

function remainingMs(input: PolicySurfaceScannerInput, startedAtMs: number): number {
  return Math.max(500, input.internalBudgetMs - (Date.now() - startedAtMs));
}

function remainingPolicyFetchMs(input: PolicySurfaceScannerInput, startedAtMs: number): number {
  return Math.min(POLICY_FETCH_TIMEOUT_MS, remainingMs(input, startedAtMs));
}

function elapsed(scanStartedAtMs: number): number {
  return Math.max(0, Date.now() - scanStartedAtMs);
}

function stableHash(value: string): string {
  let hash = 0;
  for (const char of value.toLowerCase()) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return hash.toString(16);
}

function unique<T extends string>(values: T[]): T[] {
  return [...new Set(values)];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
