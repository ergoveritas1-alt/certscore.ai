import {
  type ArtifactRef,
  type DirectVsInferred,
  type EvidenceRef,
  type PolicySurfaceObservation,
  type ScanModuleRun,
} from "@certscore/contracts";
import { chromium, type Browser } from "playwright";
import type { ArtifactWriter } from "../artifact-writer.js";
import { chromiumLaunchOptions } from "../playwright-runtime.js";

const SOURCE_SCANNER = "policy_surface";
const SCENARIO = "policy_surface_review";
const MAX_CANDIDATES_TO_FETCH = 8;
const MAX_SECONDARY_CANDIDATES_TO_FETCH = 5;
const POLICY_FETCH_CONCURRENCY = 3;
const POLICY_FETCH_TIMEOUT_MS = 5_000;
const MAX_EXCERPT_CHARS = 6_000;

export interface PolicySurfaceScannerInput {
  url: string;
  normalizedUrl: string;
  scanStartedAtMs: number;
  internalBudgetMs: number;
  artifactWriter: ArtifactWriter;
  browser?: Browser;
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
  article13DisclosureSignals?: PolicySurfaceObservation["article13DisclosureSignals"];
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
  article13DisclosureSignals: PolicySurfaceObservation["article13DisclosureSignals"];
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
  let staticCandidateCount = 0;
  let renderedCandidateCount = 0;
  let observedCandidateCount = 0;
  let commonPathFallbackUsed = false;

  try {
    const homepage = await recordPolicyTiming(
      timingBreakdown,
      "homepage fetch",
      "Fetch homepage HTML for static policy link discovery.",
      () => fetchText(input.normalizedUrl, remainingMs(input, moduleStartedAtMs)),
    );
    if (!homepage.ok) {
      const fallbackCandidates = commonPathCandidatesFor(input.normalizedUrl, 0);
      commonPathFallbackUsed = true;
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
        artifactRefs.push(await writePolicyCaptureDiagnostics({
          input,
          moduleStartedAtMs,
          staticCandidateCount,
          renderedCandidateCount,
          observedCandidateCount,
          commonPathFallbackUsed,
          observations,
        }));
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
    staticCandidateCount = staticCandidates.length;
    const fastStaticCoverage =
      input.discoveryMode === "fast" &&
      hasFastStaticPolicyCoverage(staticCandidates) &&
      hasStaticPreferenceControlCoverage(staticCandidates);
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
    renderedCandidateCount = renderedCandidates.length;
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
    observedCandidateCount = linkCandidates.length;
    const commonPathCandidates = commonPathCandidatesFor(input.normalizedUrl, linkCandidates.length);
    const initialCandidates = linkCandidates.length > 0
      ? linkCandidates
      : commonPathCandidates;
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
        rankedCandidates = await recordPolicyTiming(
          timingBreakdown,
          "Nano common-path ranking",
          `Rank ${commonPathCandidates.length} common policy paths after empty first pass.`,
          () => rankCandidatesWithRequiredNano(
            input,
            commonPathCandidates,
          ),
        );
        commonPathFallbackUsed = true;
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

    if (linkCandidates.length > 0 && !hasRetainedCorePolicyOrControlSurface(observations) && commonPathCandidates.length > 0) {
      commonPathFallbackUsed = true;
      const commonPathResults = await fetchPolicyCandidateGroup({
        input,
        timingBreakdown,
        moduleStartedAtMs,
        rankedCandidates: deterministicCommonPathFetchFallback(commonPathCandidates),
        labelPrefix: "common-path policy",
      });
      observations.push(...commonPathResults.observations);
      artifactRefs.push(...commonPathResults.artifactRefs);
    }

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

    artifactRefs.push(await writePolicyCaptureDiagnostics({
      input,
      moduleStartedAtMs,
      staticCandidateCount,
      renderedCandidateCount,
      observedCandidateCount,
      commonPathFallbackUsed,
      observations,
    }));

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

async function writePolicyCaptureDiagnostics(input: {
  input: PolicySurfaceScannerInput;
  moduleStartedAtMs: number;
  staticCandidateCount: number;
  renderedCandidateCount: number;
  observedCandidateCount: number;
  commonPathFallbackUsed: boolean;
  observations: PolicySurfaceObservation[];
}): Promise<ArtifactRef> {
  const fetchedObservations = input.observations.filter((observation) => observation.status === "fetched");
  const coreSurfaces = fetchedObservations.filter((observation) =>
    isCorePolicyOrControlSurface(observation) &&
    !isStateSpecificPrivacyPath(observation.normalizedUrl ?? observation.url)
  );
  const path = await input.input.artifactWriter.writeJsonArtifact("PolicySurfaceCaptureDiagnostics.json", {
    artifactVersion: "policy_surface_capture_diagnostics.v1",
    sourceScanner: SOURCE_SCANNER,
    generatedAt: new Date().toISOString(),
    normalizedUrl: input.input.normalizedUrl,
    corePolicySurfaceRetained: coreSurfaces.length > 0,
    coreSurfaceTypes: uniqueStrings(coreSurfaces.map((observation) => observation.surfaceType)),
    observedCandidateCount: input.observedCandidateCount,
    staticCandidateCount: input.staticCandidateCount,
    renderedCandidateCount: input.renderedCandidateCount,
    commonPathFallbackUsed: input.commonPathFallbackUsed,
    fetchedCount: fetchedObservations.length,
    failedCandidateCount: input.observations.filter((observation) => observation.status === "failed").length,
    winningSurfaceUrls: coreSurfaces
      .map((observation) => observation.normalizedUrl ?? observation.url)
      .filter((value, index, values) => values.indexOf(value) === index)
      .slice(0, 8),
    policyCaptureDurationMs: Date.now() - input.moduleStartedAtMs,
  });
  return {
    artifactId: "policy_surface_capture_diagnostics",
    artifactType: "json",
    path,
    createdAt: new Date().toISOString(),
    sourceScanner: SOURCE_SCANNER,
    scenario: SCENARIO,
    sensitivity: "internal_only",
    redactionStatus: "internal_only",
    relatedEventIds: [],
    label: "Policy surface capture diagnostics",
  };
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
  const visibleText = await resolvePolicyVisibleText({
    html: fetched.text,
    baseUrl: candidate.normalizedUrl,
    timeoutMs: Math.max(4_000, remainingPolicyFetchMs(input, moduleStartedAtMs)),
  });
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
      article13DisclosureSignals: merged.article13DisclosureSignals,
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

async function resolvePolicyVisibleText(input: {
  html: string;
  baseUrl: string;
  timeoutMs: number;
}): Promise<string> {
  const visibleText = htmlToVisibleText(input.html);
  const oneTrustText = await extractOneTrustNoticeText({
    html: input.html,
    baseUrl: input.baseUrl,
    timeoutMs: input.timeoutMs,
    depth: 0,
  });
  if (oneTrustText && oneTrustText.length > visibleText.length * 2) {
    return oneTrustText;
  }
  if (oneTrustText && /processing error|privacy center.*error/i.test(visibleText)) {
    return oneTrustText;
  }
  return visibleText;
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
  const ownsBrowser = !input.browser;
  try {
    browser = input.browser ?? await chromium.launch(chromiumLaunchOptions({ headless: true }));
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
    if (ownsBrowser) {
      await browser?.close().catch(() => undefined);
    }
  }
}

function commonPathCandidatesFor(baseUrl: string, startIndex: number): PolicySurfaceCandidate[] {
  const paths = [
    "/privacy",
    "/privacy-policy",
    "/privacy-policy/",
    "/privacy-notice",
    "/en-us/about-nvidia/privacy-policy",
    "/en-us/about-nvidia/privacy-policy/",
    "/en-us/about-nvidia/privacy-center",
    "/en-us/about-nvidia/privacy-center/",
    "/help/privacy",
    "/help/privacy/",
    "/legal/privacy",
    "/legal/privacy/",
    "/legal/privacy-cookie-statement",
    "/legal/privacy-cookie-statement/",
    "/global/en/legal/privacy-cookie-statement",
    "/global/en/legal/privacy-cookie-statement/",
    "/customer-service/privacy-policy",
    "/customer-service/privacy-policy/",
    "/us/en/customer-service/privacy-policy",
    "/us/en/customer-service/privacy-policy/",
    "/global/en/customer-service/privacy-policy",
    "/global/en/customer-service/privacy-policy/",
    "/us/en-us/privacy",
    "/us/en-us/privacy.html",
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
    "/privacy#your-privacy-choices",
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

function deterministicCommonPathFetchFallback(candidates: PolicySurfaceCandidate[]): PolicySurfaceCandidate[] {
  return dedupeCommonPathCandidates(candidates)
    .filter((candidate) =>
      candidate.fetchable &&
      candidate.deterministicSurfaceType !== "unknown" &&
      candidate.deterministicScore >= 0.5,
    )
    .sort((left, right) =>
      commonPathPriority(left) - commonPathPriority(right) ||
      surfacePriority(left.deterministicSurfaceType) - surfacePriority(right.deterministicSurfaceType) ||
      right.deterministicScore - left.deterministicScore ||
      left.normalizedUrl.localeCompare(right.normalizedUrl),
    )
    .slice(0, MAX_CANDIDATES_TO_FETCH);
}

function dedupeCommonPathCandidates(candidates: PolicySurfaceCandidate[]): PolicySurfaceCandidate[] {
  const selected = new Map<string, PolicySurfaceCandidate>();
  for (const candidate of candidates) {
    const key = commonPathCandidateKey(candidate.normalizedUrl);
    const existing = selected.get(key);
    if (!existing || candidate.deterministicScore > existing.deterministicScore) {
      selected.set(key, candidate);
    }
  }
  return [...selected.values()];
}

function commonPathCandidateKey(value: string): string {
  try {
    const parsed = new URL(value);
    parsed.hash = "";
    parsed.search = "";
    parsed.pathname = parsed.pathname.replace(/\/+$/, "") || "/";
    return parsed.toString();
  } catch {
    return value.replace(/[?#].*$/, "").replace(/\/+$/, "") || "/";
  }
}

function commonPathPriority(candidate: PolicySurfaceCandidate): number {
  const path = safeUrlPath(candidate.normalizedUrl);
  if (/\/global\/[^/]+\/legal\/privacy-cookie-statement\/?$/.test(path)) {
    return 0;
  }
  if (/\/legal\/privacy-cookie-statement\/?$/.test(path)) {
    return 1;
  }
  if (path === "/privacy" || path === "/privacy/") {
    return 2;
  }
  if (path === "/privacy-policy" || path === "/privacy-policy/") {
    return 3;
  }
  if (path === "/privacy-notice" || path === "/privacy-notice/") {
    return 4;
  }
  if (path === "/en-us/about-nvidia/privacy-policy" || path === "/en-us/about-nvidia/privacy-policy/") {
    return 5;
  }
  if (path === "/help/privacy" || path === "/help/privacy/") {
    return 6;
  }
  if (path === "/legal/privacy" || path === "/legal/privacy/") {
    return 7;
  }
  if (/cookie/.test(path)) {
    return 8;
  }
  if (/terms/.test(path)) {
    return 20;
  }
  if (/privacy-choices/.test(path)) {
    return 50;
  }
  return 10;
}

function safeUrlPath(value: string): string {
  try {
    return new URL(value).pathname.replace(/\/+$/, "") || "/";
  } catch {
    return value;
  }
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

function hasStaticPreferenceControlCoverage(candidates: PolicySurfaceCandidate[]): boolean {
  return candidates.some((candidate) =>
    candidate.observationOnly &&
    candidate.mayLeadToConsentControls &&
    (
      candidate.deterministicSurfaceType === "cookie_settings" ||
      candidate.deterministicSurfaceType === "consent_preferences" ||
      candidate.deterministicSurfaceType === "your_privacy_choices"
    )
  );
}

function policyFetchLimit(input: PolicySurfaceScannerInput): number {
  return input.discoveryMode === "fast" ? 6 : MAX_CANDIDATES_TO_FETCH;
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
  }

  return [...selected.values()].slice(0, limit);
}

function hasRetainedCorePolicyOrControlSurface(observations: PolicySurfaceObservation[]): boolean {
  return observations.some((observation) =>
    (observation.status === "fetched" || observation.status === "observed") &&
    isCorePolicyOrControlSurface(observation) &&
    !isStateSpecificPrivacyPath(observation.normalizedUrl ?? observation.url)
  );
}

function isCorePolicyOrControlSurface(observation: Pick<PolicySurfaceObservation, "surfaceType">): boolean {
  return [
    "privacy_policy",
    "cookie_policy",
    "cookie_settings",
    "consent_preferences",
    "your_privacy_choices",
  ].includes(observation.surfaceType);
}

function isStateSpecificPrivacyPath(value: string): boolean {
  const path = safeUrlPath(value).toLowerCase();
  return /california|state-privacy|do-not-sell|notice-at-collection/.test(path);
}

function uniqueStrings(values: string[]): string[] {
  return values.filter((value, index) => values.indexOf(value) === index);
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
    article13DisclosureSignals: result.article13DisclosureSignals ?? [],
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
    article13DisclosureSignals: input.article13DisclosureSignals ?? [],
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
    ["cookie_settings", [/cookie settings/i, /cookie preferences/i, /manage cookies\+?/i, /manage preferences/i, /cookie consent/i]],
    ["cookie_policy", [/cookie policy/i, /cookie statement/i, /privacy-cookie-statement/i, /cookies\b/i]],
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
    /manage cookies\+?|manage preferences|preference center|privacy center|privacy settings|cookie settings|cookie preferences|ad choices|your choices/i.test(value);
}

function isObservationOnlyPreferenceControl(surfaceType: PolicySurfaceObservation["surfaceType"], value: string): boolean {
  return surfaceType === "consent_preferences" ||
    surfaceType === "cookie_settings" ||
    /manage cookies\+?|manage preferences|preference center|privacy center|privacy settings|cookie settings|cookie preferences/i.test(value);
}

function extractPolicyFacts(text: string): {
  observedTopics: PolicySurfaceObservation["observedTopics"];
  article13DisclosureSignals: PolicySurfaceObservation["article13DisclosureSignals"];
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
    ["controller_contact", /controller|privacy@|contact us|data protection officer|\bdpo\b/i, "controller/contact"],
    ["processing_purposes", /purpose|why we process|use your (?:personal )?(?:data|information)|process(?:ing)? (?:your )?(?:personal )?(?:data|information)/i, "processing purposes"],
    ["legal_basis", /legal basis|lawful basis|legitimate interests?|contractual necessity|public interest|vital interests?/i, "legal basis"],
    ["recipients_or_vendor_categories", /recipients|service providers|processors|partners|third parties|third-party/i, "recipients"],
    ["data_subject_rights", /right to access|right to delete|right to erasure|right to rectification|right to object|data subject rights|exercise (?:your )?rights/i, "data subject rights"],
    ["international_transfers", /international transfer|transfer (?:your )?(?:personal )?(?:data|information).{0,80}(?:outside|to)|standard contractual clauses|adequacy decision/i, "international transfers"],
    ["dpo_contact", /data protection officer|\bdpo\b/i, "DPO"],
    ["supervisory_authority", /supervisory authority|data protection authority|lodge a complaint|complain to (?:a )?(?:regulator|authority)/i, "supervisory authority"],
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
    article13DisclosureSignals: article13SignalsFromText(text),
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
    article13DisclosureSignals: mergeArticle13DisclosureSignals(deterministic.article13DisclosureSignals, assisted.article13DisclosureSignals),
    mentionedVendors: unique([...deterministic.mentionedVendors, ...assisted.mentionedVendors]),
    mentionedPurposes: unique([...deterministic.mentionedPurposes, ...assisted.mentionedPurposes]),
    mentionedRights: unique([...deterministic.mentionedRights, ...assisted.mentionedRights]),
    mentionedControls: unique([...deterministic.mentionedControls, ...assisted.mentionedControls]),
    confidence: Math.max(deterministic.confidence, assisted.confidence),
    keywords: deterministic.keywords,
  };
}

function article13SignalsFromText(text: string): PolicySurfaceObservation["article13DisclosureSignals"] {
  const rules: Array<{
    disclosureType: PolicySurfaceObservation["article13DisclosureSignals"][number]["disclosureType"];
    pattern: RegExp;
    partialPattern?: RegExp;
    excerptPatterns: RegExp[];
  }> = [
    {
      disclosureType: "controller_contact",
      pattern: /(?:data controller|controller|privacy@|contact (?:us|our privacy team)|privacy office|data protection officer|\bdpo\b)/i,
      excerptPatterns: [/data controller/i, /controller/i, /privacy@/i, /privacy office/i, /data protection officer/i, /\bdpo\b/i],
    },
    {
      disclosureType: "processing_purposes",
      pattern: /(?:purpose(?:s)? (?:of|for|we|to)|why we process|we (?:use|process) (?:your )?(?:personal )?(?:data|information) (?:to|for)|(?:use|processing) of (?:your )?(?:personal )?(?:data|information)|provide (?:our )?services|personalize (?:content|services|experience))/i,
      excerptPatterns: [/purpose(?:s)? (?:of|for|we|to)/i, /why we process/i, /we (?:use|process) (?:your )?(?:personal )?(?:data|information) (?:to|for)/i, /(?:use|processing) of (?:your )?(?:personal )?(?:data|information)/i, /provide (?:our )?services/i, /personalize (?:content|services|experience)/i],
    },
    {
      disclosureType: "legal_basis",
      pattern: /(?:legal basis|lawful basis|legitimate interests?|consent|performance of (?:a )?contract|contractual necessity|legal obligation|public task|public interest|vital interests?)/i,
      excerptPatterns: [/legal basis/i, /lawful basis/i, /legitimate interests?/i, /consent/i, /performance of (?:a )?contract/i, /contractual necessity/i, /legal obligation/i, /public task/i, /public interest/i, /vital interests?/i],
    },
    {
      disclosureType: "recipients_or_vendor_categories",
      pattern: /(?:recipients|service providers|processors|vendors?|partners|affiliates|third parties|third-party|advertising partners?|analytics providers?)/i,
      excerptPatterns: [/recipients/i, /service providers/i, /processors/i, /vendors?/i, /partners/i, /affiliates/i, /third parties/i, /third-party/i, /advertising partners?/i, /analytics providers?/i],
    },
    {
      disclosureType: "data_retention",
      pattern: /(?:retention period|retention criteria|storage period|retain.{0,80}(?:as long as necessary|required by law|for the purposes|until|unless)|keep your (?:personal )?(?:data|information).{0,80}(?:as long as necessary|required by law|for)|stored for|kept for|as long as necessary|delete (?:it|them|the data|personal data|personal information) after)/i,
      partialPattern: /(?:retain|retention|keep your (?:personal )?(?:data|information))/i,
      excerptPatterns: [/retention period/i, /retention criteria/i, /storage period/i, /retain.{0,80}(?:as long as necessary|required by law|for the purposes|until|unless)/i, /keep your (?:personal )?(?:data|information).{0,80}(?:as long as necessary|required by law|for)/i, /stored for/i, /kept for/i, /as long as necessary/i, /delete (?:it|them|the data|personal data|personal information) after/i, /retain/i, /retention/i],
    },
    {
      disclosureType: "data_subject_rights",
      pattern: /(?:right to (?:access|delete|erase|erasure|rectif|object|restrict|port)|rights? to (?:access|delete|erase|erasure|rectif|object|restrict|port)|data subject rights|exercise (?:your )?rights)/i,
      excerptPatterns: [/right to (?:access|delete|erase|erasure|rectif|object|restrict|port)/i, /rights? to (?:access|delete|erase|erasure|rectif|object|restrict|port)/i, /data subject rights/i, /exercise (?:your )?rights/i],
    },
    {
      disclosureType: "international_transfers",
      pattern: /(?:international transfer|cross-border transfer|standard contractual clauses|adequacy decision|outside (?:the )?(?:eea|european economic area|uk|united kingdom|eu|european union)|third countr(?:y|ies)|data privacy framework|\bdpf\b|privacy shield)/i,
      partialPattern: /transfer (?:your )?(?:personal )?(?:data|information)/i,
      excerptPatterns: [/international transfer/i, /cross-border transfer/i, /standard contractual clauses/i, /adequacy decision/i, /outside (?:the )?(?:eea|european economic area|uk|united kingdom|eu|european union)/i, /third countr(?:y|ies)/i, /data privacy framework/i, /\bdpf\b/i, /privacy shield/i, /transfer (?:your )?(?:personal )?(?:data|information)/i],
    },
    {
      disclosureType: "dpo_contact",
      pattern: /(?:data protection officer|\bdpo\b|data protection contact)/i,
      excerptPatterns: [/data protection officer/i, /\bdpo\b/i, /data protection contact/i],
    },
    {
      disclosureType: "supervisory_authority",
      pattern: /(?:supervisory authority|data protection authority|lodge a complaint|complain to (?:a )?(?:regulator|authority)|\bico\b|\bcnil\b|\bdpc\b)/i,
      excerptPatterns: [/supervisory authority/i, /data protection authority/i, /lodge a complaint/i, /complain to (?:a )?(?:regulator|authority)/i, /\bico\b/i, /\bcnil\b/i, /\bdpc\b/i],
    },
    {
      disclosureType: "automated_decision_making_or_profiling",
      pattern: /(?:automated decision|solely automated|profiling|meaningful information about the logic)/i,
      excerptPatterns: [/automated decision/i, /solely automated/i, /profiling/i, /meaningful information about the logic/i],
    },
  ];
  return rules.flatMap((rule) => {
    const status = rule.pattern.test(text)
      ? "observed" as const
      : rule.partialPattern?.test(text)
        ? "partial" as const
        : null;
    return status
      ? [{
          disclosureType: rule.disclosureType,
          status,
          evidenceText: boundedExcerptForPatterns(text, status === "partial" && rule.partialPattern
            ? [rule.partialPattern, ...rule.excerptPatterns]
            : rule.excerptPatterns).slice(0, 320),
          confidence: status === "observed" ? 0.78 : 0.62,
          source: "deterministic" as const,
        }]
      : [];
  });
}

function mergeArticle13DisclosureSignals(
  deterministic: PolicySurfaceObservation["article13DisclosureSignals"],
  assisted: PolicySurfaceObservation["article13DisclosureSignals"] | undefined,
): PolicySurfaceObservation["article13DisclosureSignals"] {
  const byType = new Map<string, PolicySurfaceObservation["article13DisclosureSignals"][number]>();
  for (const signal of [...deterministic, ...(assisted ?? [])]) {
    const current = byType.get(signal.disclosureType);
    if (!current || signal.status === "observed" && current.status !== "observed" || signal.confidence > current.confidence) {
      byType.set(signal.disclosureType, signal);
    }
  }
  return [...byType.values()].slice(0, 12);
}

async function extractOneTrustNoticeText(input: {
  html: string;
  baseUrl: string;
  timeoutMs: number;
  depth: number;
}): Promise<string | null> {
  if (input.depth > 2) {
    return null;
  }

  const noticeUrls = extractOneTrustNoticeUrls(input.html, input.baseUrl).slice(0, 4);
  for (const noticeUrl of noticeUrls) {
    const fetched = await fetchText(noticeUrl, input.timeoutMs);
    if (!fetched.ok || !fetched.text.trim()) {
      continue;
    }
    const payload = parseJsonObject(fetched.text);
    if (!payload) {
      continue;
    }

    const policyUrls = extractOneTrustPolicyUrls(payload, noticeUrl).slice(0, 2);
    for (const policyUrl of policyUrls) {
      const policy = await fetchText(policyUrl, input.timeoutMs);
      if (!policy.ok || !policy.text.trim()) {
        continue;
      }
      const policyPayload = parseJsonObject(policy.text);
      if (policyPayload) {
        const nestedPolicyUrls = extractOneTrustPolicyUrls(policyPayload, policyUrl)
          .filter((nestedUrl) => nestedUrl !== policyUrl)
          .slice(0, 2);
        for (const nestedPolicyUrl of nestedPolicyUrls) {
          const nestedPolicy = await fetchText(nestedPolicyUrl, input.timeoutMs);
          if (!nestedPolicy.ok || !nestedPolicy.text.trim()) {
            continue;
          }
          const nestedPayload = parseJsonObject(nestedPolicy.text);
          if (nestedPayload) {
            const nestedUrls = extractOneTrustPolicyUrls(nestedPayload, nestedPolicyUrl);
            const nestedText = extractOneTrustNoticePayloadText(nestedPayload);
            if (nestedText && nestedText.length > 500 && nestedUrls.length === 0) {
              return nestedText;
            }
          }
          const nestedNoticeText = await extractOneTrustNoticeText({
            html: nestedPolicy.text,
            baseUrl: nestedPolicyUrl,
            timeoutMs: input.timeoutMs,
            depth: input.depth + 1,
          });
          if (nestedNoticeText && nestedNoticeText.length > 500) {
            return nestedNoticeText;
          }
        }

        const policyText = extractOneTrustNoticePayloadText(policyPayload);
        if (policyText && policyText.length > 500) {
          return policyText;
        }
      }

      const nestedText = await extractOneTrustNoticeText({
        html: policy.text,
        baseUrl: policyUrl,
        timeoutMs: input.timeoutMs,
        depth: input.depth + 1,
      });
      if (nestedText && nestedText.length > 500) {
        return nestedText;
      }

      const visibleText = htmlToVisibleText(policy.text);
      if (visibleText.length > 500 && !/processing error|privacy center.*error/i.test(visibleText)) {
        return visibleText;
      }
    }

    const directText = extractOneTrustNoticePayloadText(payload);
    if (directText && directText.length > 500) {
      return directText;
    }
  }

  return null;
}

function extractOneTrustNoticeUrls(html: string, baseUrl: string): string[] {
  const urls: string[] = [];
  const directPattern = /https?:\/\/privacyportal-cdn\.onetrust\.com\/[^"'<>\s)]+?\.json/gi;
  let directMatch: RegExpExecArray | null;
  while ((directMatch = directPattern.exec(html))) {
    urls.push(directMatch[0] ?? "");
  }

  const loadNoticePattern = /OneTrust\.NoticeApi\.LoadNotices\s*\(\s*(\[[\s\S]*?\])/gi;
  let loadNoticeMatch: RegExpExecArray | null;
  while ((loadNoticeMatch = loadNoticePattern.exec(html))) {
    const rawUrls = parseJsonArrayOfStrings(loadNoticeMatch[1] ?? "");
    urls.push(...rawUrls);
  }

  return unique(urls
    .map((url) => normalizeUrl(url, baseUrl))
    .filter((url): url is string => Boolean(url)));
}

function extractOneTrustPolicyUrls(payload: unknown, baseUrl: string): string[] {
  const urls = new Set<string>();
  const contentLinks: string[] = [];

  function visit(value: unknown, keyHint = ""): void {
    if (typeof value === "string") {
      if (keyHint === "policyUrl") {
        const normalized = normalizeUrl(value, baseUrl);
        if (normalized) {
          urls.add(normalized);
        }
      }
      if (/<a\b/i.test(value)) {
        contentLinks.push(...extractPolicyLinksFromHtml(value, baseUrl));
      }
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        visit(item, keyHint);
      }
      return;
    }
    if (isPlainObject(value)) {
      for (const [key, child] of Object.entries(value)) {
        visit(child, key);
      }
    }
  }

  visit(payload);
  for (const link of contentLinks) {
    urls.add(link);
  }

  return [...urls].sort((left, right) => oneTrustPolicyUrlPriority(left) - oneTrustPolicyUrlPriority(right));
}

function extractOneTrustNoticePayloadText(payload: unknown): string | null {
  const contentBlocks: string[] = [];

  function visit(value: unknown, keyHint = ""): void {
    if (typeof value === "string") {
      if (keyHint === "content" || /<p\b|<h[1-6]\b|<section\b|<article\b|<li\b/i.test(value)) {
        contentBlocks.push(value);
      }
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        visit(item, keyHint);
      }
      return;
    }
    if (isPlainObject(value)) {
      for (const [key, child] of Object.entries(value)) {
        visit(child, key);
      }
    }
  }

  visit(payload);
  const text = htmlToVisibleText(contentBlocks.join(" "));
  return text.length > 0 ? text : null;
}

function extractPolicyLinksFromHtml(html: string, baseUrl: string): string[] {
  const links: Array<{ url: string; text: string }> = [];
  const anchorPattern = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = anchorPattern.exec(html))) {
    const href = attr(match[1] ?? "", "href");
    const url = href ? normalizeUrl(href, baseUrl) : undefined;
    if (!url) {
      continue;
    }
    links.push({ url, text: htmlToVisibleText(match[2] ?? "") });
  }
  return links
    .filter((link) => /privacy policy|privacy notice|policycenter\/b2c|privacy-notices/i.test(`${link.text} ${link.url}`))
    .sort((left, right) => oneTrustPolicyUrlPriority(`${left.text} ${left.url}`) - oneTrustPolicyUrlPriority(`${right.text} ${right.url}`))
    .map((link) => link.url);
}

function oneTrustPolicyUrlPriority(value: string): number {
  if (/(?:\/|-)(?:en-us|en_us)(?:[./?#_-]|$)|\/b2c\/en-us\b/i.test(value)) {
    return 0;
  }
  if (/(?:\/|-)en(?:[./?#_-]|$)|privacy policy/i.test(value)) {
    return 1;
  }
  if (/\/b2c\b|privacy notice|privacy-notices/i.test(value)) {
    return 2;
  }
  return 5;
}

function parseJsonObject(value: string): unknown | null {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function parseJsonArrayOfStrings(value: string): string[] {
  const parsed = parseJsonObject(value);
  return Array.isArray(parsed)
    ? parsed.filter((item): item is string => typeof item === "string")
    : [];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

type FetchTextResult = { ok: boolean; status?: number; text: string };

async function fetchText(url: string, timeoutMs: number): Promise<FetchTextResult> {
  const startedAtMs = Date.now();
  const primary = await fetchTextOnce(url, timeoutMs);
  if (primary.ok || primary.status !== undefined) {
    return primary;
  }

  const fallbackUrl = wwwFallbackUrlForPolicyFetch(url);
  if (!fallbackUrl) {
    return primary;
  }

  const remainingTimeoutMs = Math.max(500, timeoutMs - (Date.now() - startedAtMs));
  return fetchTextOnce(fallbackUrl, remainingTimeoutMs);
}

async function fetchTextOnce(url: string, timeoutMs: number): Promise<FetchTextResult> {
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

export function wwwFallbackUrlForPolicyFetch(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || parsed.hostname.startsWith("www.")) {
      return null;
    }
    const labels = parsed.hostname.split(".").filter(Boolean);
    if (labels.length !== 2) {
      return null;
    }
    parsed.hostname = `www.${parsed.hostname}`;
    return parsed.toString();
  } catch {
    return null;
  }
}

function boundedExcerpt(text: string, keywords: string[]): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  const lower = normalized.toLowerCase();
  const keyword = keywords.find((item) => lower.includes(item.toLowerCase()));
  const index = keyword ? Math.max(0, lower.indexOf(keyword.toLowerCase()) - 180) : 0;
  return normalized.slice(index, index + MAX_EXCERPT_CHARS);
}

function boundedExcerptForPatterns(text: string, patterns: RegExp[]): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  const matchIndex = patterns
    .map((pattern) => {
      pattern.lastIndex = 0;
      return normalized.search(pattern);
    })
    .find((index) => index >= 0);
  const index = matchIndex === undefined ? 0 : Math.max(0, matchIndex - 180);
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
