import {
  type ArtifactRef,
  article13DisclosureRejectReason as sharedArticle13DisclosureRejectReason,
  classifyGdprTransparencyTopics,
  classifyPrivacySurface,
  type DirectVsInferred,
  type EvidenceRef,
  type PolicySurfaceObservation,
  type PrivacySurfaceClassification,
  type PrivacySurfaceMatchStrength,
  type ScanModuleRun,
  type SupportedPrivacyEvidenceLocale,
} from "@certscore/contracts";
import { chromium, type Browser, type Page } from "playwright";
import type { ArtifactWriter } from "../artifact-writer.js";
import { chromiumContextOptions, chromiumLaunchOptions } from "../playwright-runtime.js";

const SOURCE_SCANNER = "policy_surface";
const SCENARIO = "policy_surface_review";
const MAX_CANDIDATES_TO_FETCH = 8;
const MAX_COMMON_PATH_CANDIDATES_TO_FETCH = 18;
const MAX_SECONDARY_CANDIDATES_TO_FETCH = 5;
const POLICY_FETCH_CONCURRENCY = 3;
const POLICY_FETCH_TIMEOUT_MS = 5_000;
const MAX_EXCERPT_CHARS = 6_000;
const MAX_NANO_POLICY_ANALYSIS_EXCERPT_CHARS = 40_000;
const MIN_SUBSTANTIVE_POLICY_TEXT_CHARS = 2_500;
const MAX_CANONICAL_POLICY_LINK_FETCHES = 2;
const MAX_POLICY_SURFACE_TEXT_ARTIFACT_CHARS = 256_000;
const MAX_POLICY_SURFACE_TEXT_ARTIFACT_TOTAL_CHARS = 1_000_000;
const MAX_FETCHED_TEXT_CHARS = 500_000;
const MAX_POLICY_PDF_BYTES = 2_500_000;
const MAX_POLICY_PDF_PAGES = 12;
const MAX_POLICY_PDF_TEXT_CHARS = 500_000;
const DEFAULT_POLICY_EXCERPT_KEYWORDS = [
  "personal data",
  "personal information",
  "personenbezogene daten",
  "données personnelles",
  "datos personales",
  "dati personali",
  "persoonsgegevens",
  "dane osobowe",
  "privacy policy",
  "privacy notice",
  "privacy reglement",
  "politique de confidentialité",
  "política de privacidad",
  "informativa sulla privacy",
  "privacybeleid",
  "polityka prywatności",
];

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
  discardedArticle13DisclosureSignals?: PolicySurfaceObservation["discardedArticle13DisclosureSignals"];
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
  deterministicMatchedConcept?: string;
  deterministicMatchedLocale?: SupportedPrivacyEvidenceLocale;
  deterministicMatchStrength?: PrivacySurfaceMatchStrength;
  deterministicClassifierReasonCodes: string[];
  deterministicClassifierProvenance: "privacy_surface_classifier.v1";
  discoveryMethod: PolicySurfaceObservation["discoveryMethod"];
  rankedFromCommonPath?: boolean;
  assisted?: NanoLinkClassificationResult["rankedCandidates"][number];
}

interface PolicyFacts {
  observedTopics: PolicySurfaceObservation["observedTopics"];
  article13DisclosureSignals: PolicySurfaceObservation["article13DisclosureSignals"];
  discardedArticle13DisclosureSignals: PolicySurfaceObservation["discardedArticle13DisclosureSignals"];
  gdprTransparencyTopicCandidates: PolicySurfaceObservation["gdprTransparencyTopicCandidates"];
  retainedArticle13SectionEvidence: PolicySurfaceObservation["retainedArticle13SectionEvidence"];
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

interface PolicySurfaceTextArtifactBudget {
  remainingChars: number;
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
  const policySurfaceTextArtifactBudget: PolicySurfaceTextArtifactBudget = {
    remainingChars: MAX_POLICY_SURFACE_TEXT_ARTIFACT_TOTAL_CHARS,
  };

  try {
    const homepage = await recordPolicyTiming(
      timingBreakdown,
      "homepage fetch",
      "Fetch homepage HTML for static policy link discovery.",
      () => fetchText(input.normalizedUrl, remainingMs(input, moduleStartedAtMs)),
    );
    if (!homepage.ok) {
      const renderedCandidates = await recordPolicyTiming(
        timingBreakdown,
        "homepage-failed rendered discovery",
        "Bounded browser-rendered policy link discovery after static homepage fetch failed.",
        () => extractRenderedCandidates(input, moduleStartedAtMs),
      );
      renderedCandidateCount = renderedCandidates.length;
      if (renderedCandidates.length > 0) {
        observedCandidateCount = renderedCandidates.length;
        const renderedResults = await fetchRankedPolicyCandidates({
          input,
          timingBreakdown,
          moduleStartedAtMs,
          candidates: renderedCandidates,
          labelPrefix: "homepage-failed rendered",
          policySurfaceTextArtifactBudget,
        });
        observations.push(...renderedResults.observations);
        artifactRefs.push(...renderedResults.artifactRefs);
        if (hasRetainedCorePolicyOrControlSurface(observations)) {
          artifactRefs.push(await writePolicyCaptureDiagnostics({
            input,
            moduleStartedAtMs,
            staticCandidateCount,
            renderedCandidateCount,
            observedCandidateCount,
            commonPathFallbackUsed,
            observations,
            candidates: renderedCandidates,
          }));
          return {
            moduleRun: moduleRun("completed", moduleStartedAt, moduleStartedAtMs, [], timingBreakdown),
            policySurfaceObservations: observations,
            artifactRefs,
          };
        }
      }
      const fallbackCandidates = commonPathCandidatesFor(input.normalizedUrl, 0);
      commonPathFallbackUsed = true;
      const fallbackResults = await fetchRankedPolicyCandidates({
        input,
        timingBreakdown,
        moduleStartedAtMs,
        candidates: fallbackCandidates,
        labelPrefix: "homepage-failed common-path",
        policySurfaceTextArtifactBudget,
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
          candidates: dedupeCandidates([
            ...renderedCandidates,
            ...fallbackCandidates,
          ]),
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
        ...extractEmbeddedConsentConfigCandidates(input.normalizedUrl, candidateHtml, homepageText),
      ]),
    );
    staticCandidateCount = staticCandidates.length;
    const fastStaticCoverage =
      input.discoveryMode === "fast" &&
      hasSufficientFetchableStaticGdprCoverage(staticCandidates);
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
    const commonPathCandidates = commonPathCandidatesFor(
      input.normalizedUrl,
      linkCandidates.length,
      commonPathLocaleHints(input.normalizedUrl, homepage.text, homepageText),
    );
    const initialCandidates = linkCandidates.length > 0
      ? linkCandidates
      : commonPathCandidates;
    let speculativeCommonPathRankedCandidates: PolicySurfaceCandidate[] | undefined;
    let primaryRankedCandidatesFromCommonPath = false;
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
    if (input.discoveryMode !== "fast" && linkCandidates.length === 0 && rankedCandidates.length > 0) {
      rankedCandidates = mergeCommonPathFallbackCandidates(
        deterministicCommonPathFetchFallback(commonPathCandidates),
        rankedCandidates,
      );
    }
    if (rankedCandidates.length === 0 && input.discoveryMode === "fast") {
      if (shouldSpeculateCommonPathNanoRanking(linkCandidates, commonPathCandidates)) {
        const [linkNanoRanked, commonPathNanoRanked] = await Promise.allSettled([
          recordPolicyTiming(
            timingBreakdown,
            "Nano link ranking",
            `Rank ${initialCandidates.length} policy candidates for supported surfaces after deterministic fast-path found no fetchable candidates.`,
            () => rankCandidatesWithRequiredNano(input, initialCandidates),
          ),
          recordPolicyTiming(
            timingBreakdown,
            "Nano common-path ranking",
            `Rank ${commonPathCandidates.length} common policy paths in parallel with fallback link ranking.`,
            () => rankCandidatesWithRequiredNano(
              input,
              commonPathCandidates,
            ),
          ),
        ]);
        if (linkNanoRanked.status === "rejected") {
          throw linkNanoRanked.reason;
        }
        rankedCandidates = linkNanoRanked.value;
        speculativeCommonPathRankedCandidates = mergeCommonPathFallbackCandidates(
          deterministicCommonPathFetchFallback(commonPathCandidates),
          commonPathNanoRanked.status === "fulfilled" ? commonPathNanoRanked.value : [],
        );
      } else {
        rankedCandidates = await recordPolicyTiming(
          timingBreakdown,
          "Nano link ranking",
          `Rank ${initialCandidates.length} policy candidates for supported surfaces after deterministic fast-path found no fetchable candidates.`,
          () => rankCandidatesWithRequiredNano(input, initialCandidates),
        );
      }
    }
    if (rankedCandidates.length === 0 && linkCandidates.length > 0) {
      rankedCandidates = deterministicFetchFallback(linkCandidates);
      if (rankedCandidates.length === 0) {
        if (speculativeCommonPathRankedCandidates) {
          rankedCandidates = speculativeCommonPathRankedCandidates;
        } else {
          const deterministicCommonPathRanked = deterministicCommonPathFetchFallback(commonPathCandidates);
          const nanoCommonPathRanked = await recordPolicyTiming(
            timingBreakdown,
            "Nano common-path ranking",
            `Rank ${commonPathCandidates.length} common policy paths after empty first pass.`,
            () => rankCandidatesWithRequiredNano(
              input,
              commonPathCandidates,
            ),
          );
          rankedCandidates = mergeCommonPathFallbackCandidates(
            deterministicCommonPathRanked,
            nanoCommonPathRanked,
          );
        }
        commonPathFallbackUsed = true;
        primaryRankedCandidatesFromCommonPath = true;
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
      rankedCandidates.every(isCommonPathFallbackCandidate)
        ? MAX_COMMON_PATH_CANDIDATES_TO_FETCH
        : policyFetchLimit(input),
    );
    const policyResults = await fetchPolicyCandidateGroup({
      input,
      timingBreakdown,
      moduleStartedAtMs,
      rankedCandidates,
      labelPrefix: "policy",
      policySurfaceTextArtifactBudget,
    });
    observations.push(...policyResults.observations);
    artifactRefs.push(...policyResults.artifactRefs);

    if (
      linkCandidates.length > 0 &&
      !primaryRankedCandidatesFromCommonPath &&
      !hasRetainedCorePolicyOrControlSurface(observations) &&
      commonPathCandidates.length > 0
    ) {
      commonPathFallbackUsed = true;
      const commonPathRankedCandidates = speculativeCommonPathRankedCandidates ??
        deterministicCommonPathFetchFallback(commonPathCandidates);
      const commonPathResults = await fetchPolicyCandidateGroup({
        input,
        timingBreakdown,
        moduleStartedAtMs,
        rankedCandidates: commonPathRankedCandidates,
        labelPrefix: "common-path policy",
        policySurfaceTextArtifactBudget,
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
        policySurfaceTextArtifactBudget,
      });
      observations.push(...secondaryResults.observations);
      artifactRefs.push(...secondaryResults.artifactRefs);
    }

    observations.push(...privacyAliasesForCombinedPrivacyCookieSurfaces(observations));

    artifactRefs.push(await writePolicyCaptureDiagnostics({
      input,
      moduleStartedAtMs,
      staticCandidateCount,
      renderedCandidateCount,
      observedCandidateCount,
      commonPathFallbackUsed,
      observations,
      candidates: linkCandidates,
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

function privacyAliasesForCombinedPrivacyCookieSurfaces(
  observations: PolicySurfaceObservation[],
): PolicySurfaceObservation[] {
  const existingPrivacyUrls = new Set(observations
    .filter((observation) =>
      observation.surfaceType === "privacy_policy" &&
      (observation.status === "fetched" || observation.status === "observed")
    )
    .map((observation) => observation.normalizedUrl ?? observation.url)
    .filter(Boolean));

  return observations
    .filter((observation) =>
      observation.surfaceType === "cookie_policy" &&
      combinedPrivacyCookieSurfaceText(observation) &&
      !existingPrivacyUrls.has(observation.normalizedUrl ?? observation.url),
    )
    .map((observation) => ({
      ...observation,
      observationId: `${observation.observationId}_privacy_alias`,
      discoveryMethod: "page_text_link" as const,
      surfaceType: "privacy_policy" as const,
      directVsInferred: "mixed" as const,
    }));
}

function combinedPrivacyCookieSurfaceText(observation: PolicySurfaceObservation) {
  const value = [
    observation.normalizedUrl,
    observation.url,
    observation.linkText,
    observation.title,
    observation.surroundingTextExcerpt,
  ].join(" ");
  return /privacy[-\s&/]+cookie|privacy.*cookie statement|privacy and cookie|privacy & cookie/i.test(value);
}

async function writePolicyCaptureDiagnostics(input: {
  input: PolicySurfaceScannerInput;
  moduleStartedAtMs: number;
  staticCandidateCount: number;
  renderedCandidateCount: number;
  observedCandidateCount: number;
  commonPathFallbackUsed: boolean;
  observations: PolicySurfaceObservation[];
  candidates?: PolicySurfaceCandidate[];
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
    candidateSummary: summarizePolicyCandidates(input.candidates ?? []),
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
  policySurfaceTextArtifactBudget: PolicySurfaceTextArtifactBudget;
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
  policySurfaceTextArtifactBudget: PolicySurfaceTextArtifactBudget;
}): Promise<{ observations: PolicySurfaceObservation[]; artifactRefs: ArtifactRef[]; secondaryCandidates: PolicySurfaceCandidate[] }> {
  const deterministicCommonPathRanked = input.candidates.every((candidate) => candidate.discoveryMethod === "guessed_common_path")
    ? deterministicCommonPathFetchFallback(input.candidates)
    : [];
  let rankedCandidates = await recordPolicyTiming(
    input.timingBreakdown,
    `${input.labelPrefix} Nano ranking`,
    `Rank ${input.candidates.length} fallback policy candidates for supported surfaces.`,
    () => rankCandidatesWithRequiredNano(input.input, input.candidates),
  );
  if (deterministicCommonPathRanked.length > 0) {
    rankedCandidates = mergeCommonPathFallbackCandidates(
      deterministicCommonPathRanked,
      rankedCandidates,
    );
  } else if (rankedCandidates.length === 0) {
    rankedCandidates = deterministicFetchFallback(input.candidates);
  }
  return fetchPolicyCandidateGroup({
    input: input.input,
    timingBreakdown: input.timingBreakdown,
    moduleStartedAtMs: input.moduleStartedAtMs,
    rankedCandidates,
    labelPrefix: input.labelPrefix,
    policySurfaceTextArtifactBudget: input.policySurfaceTextArtifactBudget,
  });
}

async function fetchPolicyCandidateGroup(input: {
  input: PolicySurfaceScannerInput;
  timingBreakdown: NonNullable<ScanModuleRun["timingBreakdown"]>;
  moduleStartedAtMs: number;
  rankedCandidates: PolicySurfaceCandidate[];
  labelPrefix: string;
  policySurfaceTextArtifactBudget: PolicySurfaceTextArtifactBudget;
}): Promise<{ observations: PolicySurfaceObservation[]; artifactRefs: ArtifactRef[]; secondaryCandidates: PolicySurfaceCandidate[] }> {
  const rankedCandidates = pruneEquivalentPolicyFetchCandidates(input.rankedCandidates);
  const toFetch = rankedCandidates.slice(0, candidateGroupFetchLimit(rankedCandidates));
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
        policySurfaceTextArtifactBudget: input.policySurfaceTextArtifactBudget,
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
  policySurfaceTextArtifactBudget,
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

  let fetched = await recordPolicyTiming(
    timingBreakdown,
    `policy fetch ${candidateIndex + 1}`,
    `Fetch ${candidate.deterministicSurfaceType} candidate document.`,
    () => fetchText(candidate.normalizedUrl, remainingPolicyFetchMs(input, moduleStartedAtMs)),
  );
  if (!fetched.ok && shouldTryRenderedPolicyDocumentFetch(fetched.status, input, moduleStartedAtMs)) {
    const renderedFetched = await recordPolicyTiming(
      timingBreakdown,
      `policy rendered fetch fallback ${candidateIndex + 1}`,
      `Fetch ${candidate.deterministicSurfaceType} candidate document through bounded browser-rendered navigation after direct fetch failed.`,
      () => fetchRenderedPolicyDocumentText({
        input,
        url: candidate.normalizedUrl,
        timeoutMs: Math.min(4_000, remainingMs(input, moduleStartedAtMs)),
      }),
    );
    if (renderedFetched.ok) {
      fetched = renderedFetched;
    }
  }
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

  let effectiveCandidate = candidate;
  let fetchedHtml = fetched.text;
  const secondaryCandidateHtmlInputs = [fetchedHtml];
  let title = titleFromHtml(fetchedHtml);
  let visibleText = await resolvePolicyVisibleText({
    html: fetched.text,
    baseUrl: candidate.normalizedUrl,
    surfaceType: candidate.deterministicSurfaceType,
    timeoutMs: Math.max(4_000, remainingPolicyFetchMs(input, moduleStartedAtMs)),
  });
  const urlOnlyStubResolution = await recordPolicyTiming(
    timingBreakdown,
    `policy url-stub follow ${candidateIndex + 1}`,
    `Follow ${candidate.deterministicSurfaceType} candidate when fetched policy body only points to a canonical policy URL.`,
    () => resolveUrlOnlyPolicyStub({
      currentUrl: candidate.normalizedUrl,
      visibleText,
      surfaceType: candidate.deterministicSurfaceType,
      timeoutMs: remainingPolicyFetchMs(input, moduleStartedAtMs),
    }),
  );
  if (urlOnlyStubResolution) {
    effectiveCandidate = {
      ...candidate,
      url: urlOnlyStubResolution.url,
      normalizedUrl: urlOnlyStubResolution.url,
      sameOrigin: sameOrigin(input.normalizedUrl, urlOnlyStubResolution.url),
      fetchable: true,
    };
    fetchedHtml = urlOnlyStubResolution.html;
    secondaryCandidateHtmlInputs.push(fetchedHtml);
    title = titleFromHtml(fetchedHtml);
    visibleText = urlOnlyStubResolution.visibleText;
  }
  if (shouldTryRenderedPolicyDocumentTextFallback({
    candidate: effectiveCandidate,
    documentFormat: fetched.documentFormat,
    input,
    moduleStartedAtMs,
    visibleText,
  })) {
    const renderedFetched = await recordPolicyTiming(
      timingBreakdown,
      `policy rendered low-quality text fallback ${candidateIndex + 1}`,
      `Fetch ${effectiveCandidate.deterministicSurfaceType} candidate document through bounded browser-rendered navigation after direct fetch retained only low-quality text.`,
      () => fetchRenderedPolicyDocumentText({
        input,
        url: effectiveCandidate.normalizedUrl,
        timeoutMs: Math.max(5_000, Math.min(6_000, remainingMs(input, moduleStartedAtMs))),
      }),
    );
    if (renderedFetched.ok) {
      const renderedVisibleText = await resolvePolicyVisibleText({
        html: renderedFetched.text,
        baseUrl: effectiveCandidate.normalizedUrl,
        surfaceType: effectiveCandidate.deterministicSurfaceType,
        timeoutMs: Math.max(1_000, Math.min(3_000, remainingPolicyFetchMs(input, moduleStartedAtMs))),
      });
      if (shouldAdoptPolicyDocumentText(renderedVisibleText, visibleText, { allowTopicDominant: true })) {
        fetchedHtml = renderedFetched.text;
        secondaryCandidateHtmlInputs.push(fetchedHtml);
        title = titleFromHtml(fetchedHtml) ?? title;
        visibleText = renderedVisibleText;
      }
    }
  }
  const textQuality = assessPolicyTextQuality(visibleText);
  if (textQuality.reason === "low_quality_access_challenge") {
    const excerpt = boundedExcerpt(visibleText, []);
    return {
      observation: observationFromCandidate(effectiveCandidate, {
        status: "failed",
        httpStatus: fetched.status,
        title,
        textExcerpt: excerpt,
        confidence: Math.max(0.35, candidate.assisted?.confidence ?? candidate.deterministicScore),
      }),
      artifactRefs: [],
      secondaryCandidates: [],
    };
  }
  const policySections = textQuality.usable
    ? extractPolicySections({
        html: fetchedHtml,
        sourceUrl: effectiveCandidate.normalizedUrl,
        visibleText,
      })
    : [];
  const allowLegacyArticle13Extraction = fetched.documentFormat !== "pdf";
  const sectionEvidence = textQuality.usable && allowLegacyArticle13Extraction && effectiveCandidate.deterministicSurfaceType === "privacy_policy"
    ? retainedArticle13SectionEvidenceFromSections(policySections, effectiveCandidate.normalizedUrl)
    : [];
  const deterministic = textQuality.usable
    ? policyFactsForFetchedDocument(extractPolicyFacts(visibleText), sectionEvidence, {
        allowLegacyArticle13Extraction,
      })
    : emptyPolicyFacts();
  const finalGdprTransparencyTopicCandidates = effectiveCandidate.deterministicSurfaceType === "privacy_policy"
    ? mergeGdprTransparencyTopicCandidates(
        gdprTransparencyTopicCandidatesFromText(visibleText),
        gdprTransparencyTopicCandidatesFromRetainedPolicySections(policySections),
      )
    : [];
  if (
    finalGdprTransparencyTopicCandidates.length > 0 &&
    deterministic.gdprTransparencyTopicCandidates.length === 0
  ) {
    deterministic.gdprTransparencyTopicCandidates = finalGdprTransparencyTopicCandidates;
    deterministic.confidence = Math.max(deterministic.confidence, 0.62);
  }
  const excerpt = boundedExcerpt(visibleText, prioritizedExcerptKeywords(deterministic));
  const nanoAnalysisExcerpt = textQuality.usable ? boundedPolicyAnalysisExcerpt(visibleText) : "";
  const excerptId = `policy_excerpt_${stableHash(effectiveCandidate.normalizedUrl)}`;
  const artifactPath = await recordPolicyTiming(
    timingBreakdown,
    `policy artifact ${candidateIndex + 1}`,
    `Write bounded ${effectiveCandidate.deterministicSurfaceType} excerpt artifact.`,
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
    label: `${effectiveCandidate.deterministicSurfaceType} excerpt`,
  };
  const policySurfaceTextArtifactRef = await recordPolicyTiming(
    timingBreakdown,
    `policy surface text artifact ${candidateIndex + 1}`,
    `Write normalized text-only ${effectiveCandidate.deterministicSurfaceType} policy surface artifact when budget allows.`,
    () => writePolicySurfaceTextArtifact({
      artifactWriter: input.artifactWriter,
      candidate: effectiveCandidate,
      visibleText,
      scanStartedAtMs: input.scanStartedAtMs,
      policySurfaceTextArtifactBudget,
    }),
  );
  const artifactRefs = [
    artifactRef,
    ...(policySurfaceTextArtifactRef ? [policySurfaceTextArtifactRef] : []),
  ];
  const topicAssist = textQuality.usable
    ? await recordPolicyTiming(
        timingBreakdown,
        `Nano topic extraction ${candidateIndex + 1}`,
        `Extract bounded topics for ${effectiveCandidate.deterministicSurfaceType} candidate.`,
        () => maybeExtractTopics(input, effectiveCandidate, {
          title,
          excerpt: nanoAnalysisExcerpt,
          deterministicTopics: deterministic.observedTopics,
        }),
      )
    : undefined;
  const merged = mergePolicyFacts(deterministic, topicAssist);

  return {
    observation: observationFromCandidate(effectiveCandidate, {
      status: "fetched",
      httpStatus: fetched.status,
      title,
      textExcerpt: excerpt,
      boundedTextExcerptIds: [excerptId],
      observedTopics: merged.observedTopics,
      article13DisclosureSignals: merged.article13DisclosureSignals,
      gdprTransparencyTopicCandidates: merged.gdprTransparencyTopicCandidates,
      discardedArticle13DisclosureSignals: merged.discardedArticle13DisclosureSignals,
      retainedPolicySections: retainedPolicySectionsForObservation(policySections),
      retainedArticle13SectionEvidence: sectionEvidence,
      mentionedVendors: merged.mentionedVendors,
      mentionedPurposes: merged.mentionedPurposes,
      mentionedRights: merged.mentionedRights,
      mentionedControls: merged.mentionedControls,
      lastUpdatedText: lastUpdatedText(visibleText),
      evidenceRefs: [{
        refId: `ref_${excerptId}`,
        artifactId: excerptId,
        eventType: "policy_surface",
        url: effectiveCandidate.normalizedUrl,
        excerpt,
      }],
      artifactRefs,
      assistMetadata: topicAssist?.assistMetadata ?? [],
      confidence: Math.max(candidate.assisted?.confidence ?? 0, deterministic.confidence),
    }),
    artifactRefs,
    secondaryCandidates: highValueSecondaryCandidatesFromPolicyPage(
      effectiveCandidate.normalizedUrl,
      uniqueStrings(secondaryCandidateHtmlInputs.flatMap((html) => [
        html,
        decodeEmbeddedHtml(html),
      ])).join("\n"),
      visibleText,
    ),
  };
}

function shouldTryRenderedPolicyDocumentFetch(
  status: number | undefined,
  input: PolicySurfaceScannerInput,
  moduleStartedAtMs: number,
): boolean {
  return (status === undefined || [401, 403, 429].includes(status)) &&
    remainingMs(input, moduleStartedAtMs) >= 2_500;
}

function shouldTryRenderedPolicyDocumentTextFallback(input: {
  candidate: PolicySurfaceCandidate;
  documentFormat?: "pdf" | "text";
  input: PolicySurfaceScannerInput;
  moduleStartedAtMs: number;
  visibleText: string;
}): boolean {
  if (
    input.documentFormat === "pdf" ||
    input.candidate.deterministicSurfaceType !== "privacy_policy" ||
    remainingMs(input.input, input.moduleStartedAtMs) < 2_000
  ) {
    return false;
  }
  const normalized = normalizeWhitespace(input.visibleText);
  const topicMatchCount = gdprTransparencyTopicMatchCount(normalized);
  const textQuality = assessPolicyTextQuality(normalized);
  const looksLikeLocalizedPolicyShell =
    topicMatchCount === 0 &&
    normalized.length < MIN_SUBSTANTIVE_POLICY_TEXT_CHARS &&
    /privacy|confidentialit[ée]|datenschutz|privacidad|protecci[oó]n de datos|informativa privacy|privacybeleid|privacyverklaring|prywatno[śs]ci/i.test(normalized);
  const looksLikeShortThinText =
    normalized.length < 500 &&
    topicMatchCount === 0 &&
    textQuality.policyTermCount < 2;
  return looksLikeShortThinText ||
    looksLikePrivacyCenterShell(normalized) ||
    looksLikeLocalizedPolicyShell ||
    !textQuality.usable;
}

async function fetchRenderedPolicyDocumentText(input: {
  input: PolicySurfaceScannerInput;
  url: string;
  timeoutMs: number;
}): Promise<FetchTextResult> {
  let browser: Browser | undefined;
  const ownsBrowser = !input.input.browser;
  try {
    browser = input.input.browser ?? await chromium.launch(chromiumLaunchOptions({ headless: true }));
    const context = await browser.newContext(chromiumContextOptions());
    const page = await context.newPage();
    const response = await page.goto(input.url, {
      waitUntil: "domcontentloaded",
      timeout: Math.max(1_000, input.timeoutMs),
    });
    await page.waitForLoadState("networkidle", {
      timeout: Math.min(1_000, Math.max(500, input.timeoutMs)),
    }).catch(() => undefined);
    await page.waitForFunction(
      () => (document.body?.innerText ?? "").replace(/\s+/g, " ").trim().length >= 1_000,
      undefined,
      { timeout: Math.min(1_500, Math.max(500, input.timeoutMs)) },
    ).catch(() => undefined);
    await page.waitForTimeout(Math.min(750, Math.max(250, input.timeoutMs)));
    const html = await page.content().catch(() => "");
    const bodyText = await page.locator("body").innerText({ timeout: 1_000 }).catch(() => "");
    const semanticTextCandidates = await renderedPolicySemanticTextCandidates(page);
    const text = bestRenderedPolicyDocumentText(html, [
      bodyText,
      ...semanticTextCandidates,
    ]);
    if (!text) {
      return { ok: false, status: response?.status(), text: "" };
    }
    return {
      ok: Boolean(response?.ok()),
      status: response?.status(),
      text: text.slice(0, 500_000),
    };
  } catch {
    return { ok: false, text: "" };
  } finally {
    if (ownsBrowser) {
      await browser?.close().catch(() => undefined);
    }
  }
}

async function resolvePolicyVisibleText(input: {
  html: string;
  baseUrl: string;
  surfaceType: PolicySurfaceObservation["surfaceType"];
  timeoutMs: number;
}): Promise<string> {
  const visibleText = htmlToVisibleText(input.html);
  let bestText = bestPolicyDocumentText(input.html, visibleText);

  const oneTrustText = await extractOneTrustNoticeText({
    html: input.html,
    baseUrl: input.baseUrl,
    timeoutMs: input.timeoutMs,
    depth: 0,
  });
  if (oneTrustText && policyTextQualityScore(oneTrustText) > policyTextQualityScore(bestText)) {
    bestText = oneTrustText;
  }

  const shouldTryCanonicalPolicyLink =
    input.surfaceType === "privacy_policy" &&
    shouldFollowCanonicalPolicyDocumentLink(input.html, input.baseUrl, bestText);
  if (shouldTryCanonicalPolicyLink) {
    const linkedPolicyText = await fetchBestCanonicalPolicyDocumentText({
      html: input.html,
      baseUrl: input.baseUrl,
      currentText: bestText,
      timeoutMs: input.timeoutMs,
    });
    if (linkedPolicyText && policyTextQualityScore(linkedPolicyText) > policyTextQualityScore(bestText)) {
      bestText = linkedPolicyText;
    }
  }

  return bestText;
}

async function resolveUrlOnlyPolicyStub(input: {
  currentUrl: string;
  visibleText: string;
  surfaceType: PolicySurfaceObservation["surfaceType"];
  timeoutMs: number;
}): Promise<{ url: string; html: string; visibleText: string } | undefined> {
  const targetUrl = policyUrlOnlyStubTargetUrl({
    text: input.visibleText,
    currentUrl: input.currentUrl,
    surfaceType: input.surfaceType,
  });
  if (!targetUrl) {
    return undefined;
  }

  const fetched = await fetchText(targetUrl, Math.max(800, Math.min(2_500, input.timeoutMs)));
  if (!fetched.ok) {
    return undefined;
  }
  const visibleText = await resolvePolicyVisibleText({
    html: fetched.text,
    baseUrl: targetUrl,
    surfaceType: input.surfaceType,
    timeoutMs: Math.max(800, Math.min(2_500, input.timeoutMs)),
  });
  if (policyUrlOnlyStubTargetUrl({
    text: visibleText,
    currentUrl: targetUrl,
    surfaceType: input.surfaceType,
  })) {
    return undefined;
  }

  const currentScore = policyTextQualityScore(input.visibleText);
  const resolvedScore = policyTextQualityScore(visibleText);
  const enoughSubstantiveText = normalizeWhitespace(visibleText).length >= MIN_SUBSTANTIVE_POLICY_TEXT_CHARS;
  if (!enoughSubstantiveText && resolvedScore <= currentScore + 8) {
    return undefined;
  }

  return { url: targetUrl, html: fetched.text, visibleText };
}

function policyUrlOnlyStubTargetUrl(input: {
  text: string;
  currentUrl: string;
  surfaceType: PolicySurfaceObservation["surfaceType"];
}): string | undefined {
  const normalized = normalizeWhitespace(input.text);
  if (!normalized || normalized.length > 320) {
    return undefined;
  }

  const matches = Array.from(normalized.matchAll(/https?:\/\/[^\s<>"']+/gi))
    .map((match) => match[0]?.replace(/[),.;]+$/g, ""))
    .filter((value): value is string => Boolean(value));
  const uniqueMatches = uniqueStrings(matches);
  if (uniqueMatches.length !== 1) {
    return undefined;
  }

  const urlText = uniqueMatches[0];
  if (!urlText) {
    return undefined;
  }
  const remainingText = normalizeWhitespace(normalized.replace(urlText, "").replace(/[()[\]{}:;.,\-–—|/\\]+/g, " "));
  if (remainingText.length > 24) {
    return undefined;
  }

  const targetUrl = normalizeUrl(urlText, input.currentUrl);
  if (!targetUrl || targetUrl === input.currentUrl) {
    return undefined;
  }
  if (!isFetchablePolicyUrlForPolicySurface(input.currentUrl, targetUrl, input.surfaceType)) {
    return undefined;
  }
  if (input.surfaceType === "terms" && !/terms|legal|conditions|service/i.test(targetUrl)) {
    return undefined;
  }
  if (input.surfaceType === "privacy_policy" && !/privacy|policy|notice/i.test(targetUrl)) {
    return undefined;
  }

  return targetUrl;
}

async function writePolicySurfaceTextArtifact(input: {
  artifactWriter: ArtifactWriter;
  candidate: PolicySurfaceCandidate;
  visibleText: string;
  scanStartedAtMs: number;
  policySurfaceTextArtifactBudget: PolicySurfaceTextArtifactBudget;
}): Promise<ArtifactRef | undefined> {
  if (input.policySurfaceTextArtifactBudget.remainingChars <= 0) {
    return undefined;
  }

  const normalizedText = normalizeWhitespace(input.visibleText);
  if (!normalizedText) {
    return undefined;
  }

  const maxChars = Math.min(
    MAX_POLICY_SURFACE_TEXT_ARTIFACT_CHARS,
    input.policySurfaceTextArtifactBudget.remainingChars,
  );
  if (maxChars < 512) {
    return undefined;
  }
  const truncated = normalizedText.length > maxChars;
  const retainedText = truncated
    ? `${normalizedText.slice(0, Math.max(0, maxChars - 96)).trimEnd()}\n\n[Policy surface text truncated by CertScore artifact retention budget.]`
    : normalizedText;
  input.policySurfaceTextArtifactBudget.remainingChars = Math.max(
    0,
    input.policySurfaceTextArtifactBudget.remainingChars - retainedText.length,
  );

  const artifactId = `policy_surface_text_${stableHash(input.candidate.normalizedUrl)}`;
  const path = await input.artifactWriter.writeTextArtifact(`${artifactId}.txt`, retainedText);
  return {
    artifactId,
    artifactType: "other",
    path,
    observedAtMs: elapsed(input.scanStartedAtMs),
    sourceScanner: SOURCE_SCANNER,
    scenario: SCENARIO,
    sensitivity: "redacted",
    redactionStatus: "redacted",
    relatedEventIds: [],
    label: `${input.candidate.deterministicSurfaceType} normalized text`,
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
    const linkText = htmlToVisibleText(match[2] ?? "").slice(0, 160);
    const attributeText = [attr(attrs, "aria-label"), attr(attrs, "title")].filter(Boolean).join(" ");
    const candidateText = normalizeWhitespace(`${linkText} ${attributeText}`).slice(0, 220) || href;
    const normalizedUrl = normalizeUrl(href, baseUrl);
    if (!normalizedUrl) {
      continue;
    }
    const surroundingTextExcerpt = surroundingText(visibleText, linkText);
    const domLocation = domLocationFor(html, match.index);
    const deterministic = classifySurface({
      linkText: candidateText,
      url: normalizedUrl,
      surroundingText: surroundingTextExcerpt,
    });
    if (isExternalUrlOnlyPolicyCandidate(baseUrl, normalizedUrl, candidateText, deterministic.surfaceType)) {
      continue;
    }
    const placeholderHref = isPlaceholderHref(href);
    if (isExternalPoweredByAttributionLink(baseUrl, normalizedUrl, candidateText)) {
      continue;
    }
    const fetchable = !placeholderHref && isFetchablePolicyCandidateForPolicySurface({
      baseUrl,
      href,
      normalizedUrl,
      surfaceType: deterministic.surfaceType,
      matchStrength: deterministic.matchStrength,
      linkText: candidateText,
    });
    const preferenceControl = isPreferenceControlSurface(deterministic.surfaceType, candidateText);
    if (!fetchable && !preferenceControl) {
      continue;
    }
    const observationOnly = !fetchable || isObservationOnlyPreferenceControl(deterministic.surfaceType, candidateText);
    candidates.push({
      candidateId: `policy_candidate_${index++}`,
      url: href,
      normalizedUrl,
      linkText: candidateText,
      surroundingTextExcerpt,
      domLocation,
      sameOrigin: sameOrigin(baseUrl, normalizedUrl),
      fetchable,
      clickable: true,
      mayLeadToConsentControls: observationOnly || preferenceControl,
      observationOnly,
      deterministicSurfaceType: deterministic.surfaceType,
      deterministicScore: deterministic.score,
      deterministicKeywordMatches: deterministic.keywords,
      ...classifierCandidateFields(deterministic),
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
    const surroundingTextExcerpt = surroundingText(visibleText, text);
    const deterministic = classifySurface({
      linkText: text,
      url: normalizedUrl,
      surroundingText: surroundingTextExcerpt,
    });
    if (deterministic.surfaceType === "unknown" || !isPreferenceControlSurface(deterministic.surfaceType, text)) {
      continue;
    }
    const selector = attr(attrs, "id") ? `#${attr(attrs, "id")}` : undefined;
    const domLocation = domLocationFor(html, match.index);
    const fetchable = Boolean(href) && isFetchablePolicyCandidateForPolicySurface({
      baseUrl,
      href: href ?? "",
      normalizedUrl,
      surfaceType: deterministic.surfaceType,
      matchStrength: deterministic.matchStrength,
      linkText: text,
    });
    candidates.push({
      candidateId: `policy_control_candidate_${index++}`,
      url: href ?? baseUrl,
      normalizedUrl,
      linkText: text || normalizedUrl,
      selector,
      surroundingTextExcerpt,
      domLocation,
      sameOrigin: sameOrigin(baseUrl, normalizedUrl),
      fetchable,
      clickable: /<button\b|role=["'](?:button|link)["']/i.test(fullTag),
      mayLeadToConsentControls: true,
      observationOnly: !fetchable || isObservationOnlyPreferenceControl(deterministic.surfaceType, text),
      deterministicSurfaceType: deterministic.surfaceType,
      deterministicScore: deterministic.score,
      deterministicKeywordMatches: deterministic.keywords,
      ...classifierCandidateFields(deterministic),
      discoveryMethod: domLocation === "footer"
        ? "footer_link"
        : domLocation === "header" || domLocation === "nav"
          ? "header_link"
          : "page_text_link",
    });
  }
  return candidates;
}

function extractEmbeddedConsentConfigCandidates(baseUrl: string, html: string, visibleText: string): PolicySurfaceCandidate[] {
  const candidates: PolicySurfaceCandidate[] = [];
  const patterns = [
    /consentLinkTitle\s*:\s*\{[^}]*\ben\s*:\s*["']([^"']*manage cookies\+?[^"']*)["'][^}]*\}/gi,
    /["']consentLinkTitle["']\s*:\s*\{[^}]*["']en["']\s*:\s*["']([^"']*manage cookies\+?[^"']*)["'][^}]*\}/gi,
  ];
  let index = 0;
  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(html))) {
      const label = normalizeWhitespace(match[1] ?? "").slice(0, 160);
      if (!label) {
        continue;
      }
      const deterministic = classifySurface({ linkText: label });
      if (deterministic.surfaceType !== "cookie_settings") {
        continue;
      }
      candidates.push({
        candidateId: `policy_embedded_consent_candidate_${index++}`,
        url: baseUrl,
        normalizedUrl: baseUrl,
        linkText: label,
        surroundingTextExcerpt: surroundingText(visibleText, label),
        domLocation: "body",
        sameOrigin: true,
        fetchable: false,
        clickable: false,
        mayLeadToConsentControls: true,
        observationOnly: true,
        deterministicSurfaceType: deterministic.surfaceType,
        deterministicScore: deterministic.score,
        deterministicKeywordMatches: deterministic.keywords,
        ...classifierCandidateFields(deterministic),
        discoveryMethod: "page_text_link",
      });
    }
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
    const context = await browser.newContext(chromiumContextOptions());
    const page = await context.newPage();
    const navigationTimeoutMs = input.discoveryMode === "fast" ? 4_000 : 8_000;
    await page.goto(input.normalizedUrl, {
      waitUntil: "domcontentloaded",
      timeout: Math.min(navigationTimeoutMs, Math.max(1_000, remainingMs(input, moduleStartedAtMs))),
    });
    await page.waitForLoadState("networkidle", {
      timeout: Math.min(1_000, Math.max(500, remainingMs(input, moduleStartedAtMs))),
    }).catch(() => undefined);
    await page.waitForTimeout(Math.min(400, Math.max(250, remainingMs(input, moduleStartedAtMs))));
    await waitForRenderedPolicySurfaceCandidate(page, input, moduleStartedAtMs);
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

    const renderedHtml = await page.content().catch(() => "");
    const renderedHtmlCandidates = renderedHtml
      ? extractCandidates(input.normalizedUrl, renderedHtml, htmlToVisibleText(renderedHtml))
      : [];
    const fallbackRawCandidates = await page.locator("a[href], button, [role='button'], [role='link'], [aria-label], [title]")
      .evaluateAll((elements) => elements.map((element) => {
          const normalizeText = (value: string | null | undefined): string =>
            (value ?? "").replace(/\s+/g, " ").trim();
          const href = element.getAttribute("href") ??
            element.getAttribute("data-href") ??
            element.getAttribute("data-url") ??
            element.getAttribute("data-link") ??
            undefined;
          const text = normalizeText([
            element.textContent,
            element.getAttribute("aria-label"),
            element.getAttribute("title"),
            element.getAttribute("data-testid"),
            href,
          ].filter(Boolean).join(" "));
          const domLocation: PolicySurfaceCandidate["domLocation"] = element.closest("footer")
            ? "footer"
            : element.closest("header") || element.closest("nav")
              ? "header"
              : "body";
          return {
            href,
            text: text.slice(0, 220),
            selector: element.tagName.toLowerCase(),
            domLocation,
            clickable: element.matches("button, a, [role='button'], [role='link']"),
          };
        }))
      .catch(() => []);
    const retainedRawCandidates = [
      ...rawCandidates,
      ...fallbackRawCandidates,
    ];

    return dedupeCandidates([
      ...renderedHtmlCandidates,
      ...retainedRawCandidates.flatMap((candidate, index): PolicySurfaceCandidate[] => {
      const normalizedUrl = candidate.href ? normalizeUrl(candidate.href, input.normalizedUrl) : input.normalizedUrl;
      const surroundingTextExcerpt = surroundingText(visibleText, candidate.text);
      const deterministic = classifySurface({
        linkText: candidate.text,
        url: normalizedUrl,
        surroundingText: surroundingTextExcerpt,
      });
      if (deterministic.surfaceType === "unknown" || deterministic.score <= 0.2 || !normalizedUrl) {
        return [];
      }
      if (isExternalUrlOnlyPolicyCandidate(
        input.normalizedUrl,
        normalizedUrl,
        candidate.text,
        deterministic.surfaceType,
      )) {
        return [];
      }
      if (isExternalPoweredByAttributionLink(input.normalizedUrl, normalizedUrl, candidate.text)) {
        return [];
      }
      const fetchable = Boolean(candidate.href) && isFetchablePolicyCandidateForPolicySurface({
        baseUrl: input.normalizedUrl,
        href: candidate.href ?? "",
        normalizedUrl,
        surfaceType: deterministic.surfaceType,
        matchStrength: deterministic.matchStrength,
        linkText: candidate.text,
      });
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
        surroundingTextExcerpt,
        domLocation: candidate.domLocation,
        sameOrigin: sameOrigin(input.normalizedUrl, normalizedUrl),
        fetchable,
        clickable: candidate.clickable,
        mayLeadToConsentControls: isPreferenceControlSurface(deterministic.surfaceType, candidate.text),
        observationOnly,
        deterministicSurfaceType: deterministic.surfaceType,
        deterministicScore: deterministic.score,
        deterministicKeywordMatches: deterministic.keywords,
        ...classifierCandidateFields(deterministic),
        discoveryMethod: candidate.domLocation === "footer"
          ? "footer_link"
          : candidate.domLocation === "header" || candidate.domLocation === "nav"
            ? "header_link"
          : "page_text_link",
      }];
      }),
    ]);
  } catch {
    return [];
  } finally {
    if (ownsBrowser) {
      await browser?.close().catch(() => undefined);
    }
  }
}

async function waitForRenderedPolicySurfaceCandidate(
  page: Page,
  input: PolicySurfaceScannerInput,
  moduleStartedAtMs: number,
): Promise<void> {
  const timeoutMs = Math.min(
    input.discoveryMode === "fast" ? 1_200 : 4_500,
    Math.max(250, remainingMs(input, moduleStartedAtMs) - 1_000),
  );
  if (timeoutMs < 250) {
    return;
  }

  await page.waitForFunction(() => {
    const textPattern = /\b(?:privacy policy|privacy notice|cookie policy|cookie notice|datenschutzerkl[aä]rung|politique de confidentialit[eé]|pol[ií]tica de privacidad|informativa (?:sulla )?privacy|privacybeleid|privacyverklaring|polityka prywatno[śs]ci|ustawienia prywatno[śs]ci)\b/i;
    const hrefPattern = /(?:privacy|cookie|datenschutz|confidentialit[eé]|privacidad|informativa|privacybeleid|privacyverklaring|prywatno(?:sc|sci|ść|ści)|polityka-prywatno(?:sci|ści))/i;
    const elements = document.querySelectorAll("a[href], button, [role='button'], [role='link'], [aria-label], [title]");
    for (const element of elements) {
      const href = element.getAttribute("href") ??
        element.getAttribute("data-href") ??
        element.getAttribute("data-url") ??
        element.getAttribute("data-link") ??
        "";
      if (!href || href.trim() === "#" || /^javascript:/i.test(href.trim())) {
        continue;
      }
      const text = [
        element.textContent,
        element.getAttribute("aria-label"),
        element.getAttribute("title"),
        href,
      ].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
      if (textPattern.test(text) || hrefPattern.test(href)) {
        return true;
      }
    }
    return false;
  }, undefined, {
    polling: 250,
    timeout: timeoutMs,
  }).catch(() => undefined);
}

function commonPathCandidatesFor(
  baseUrl: string,
  startIndex: number,
  localeHints: SupportedPrivacyEvidenceLocale[] = [],
): PolicySurfaceCandidate[] {
  const paths = commonPolicyPathsFor(baseUrl, localeHints);
  return paths.map((path, offset) => {
    const normalizedUrl = normalizeUrl(path, baseUrl) ?? baseUrl;
    const linkText = commonPolicyPathLabel(path);
    const deterministic = classifyCommonPathSurface(linkText, normalizedUrl);
    return {
      candidateId: `policy_candidate_${startIndex + offset}`,
      url: path,
      normalizedUrl,
      linkText,
      domLocation: "body" as const,
      sameOrigin: true,
      fetchable: true,
      clickable: false,
      mayLeadToConsentControls: deterministic.surfaceType === "your_privacy_choices" || deterministic.surfaceType === "cookie_settings",
      observationOnly: false,
      deterministicSurfaceType: deterministic.surfaceType,
      deterministicScore: deterministic.score - 0.15,
      deterministicKeywordMatches: deterministic.keywords,
      ...classifierCandidateFields(deterministic),
      discoveryMethod: "guessed_common_path" as const,
    };
  }).filter((candidate) => candidate.deterministicScore > 0.2);
}

function commonPolicyPathsFor(baseUrl: string, localeHints: SupportedPrivacyEvidenceLocale[]): string[] {
  const genericCorePaths = [
    "/privacy",
    "/privacy-policy",
    "/privacy-policy/",
    "/privacy-notice",
  ];
  const genericSecondaryPaths = [
    "/help/privacy",
    "/help/privacy/",
    "/legal/privacy",
    "/legal/privacy/",
    "/legal/privacy-cookie-statement",
    "/legal/privacy-cookie-statement/",
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
  const localizedByLocale: Record<SupportedPrivacyEvidenceLocale, string[]> = {
    en: [],
    de: ["/datenschutz", "/datenschutzerklaerung", "/datenschutzerklärung"],
    fr: ["/confidentialite", "/confidentialité", "/politique-de-confidentialite", "/politique-de-confidentialité"],
    es: ["/privacidad", "/politica-de-privacidad", "/política-de-privacidad"],
    it: ["/informativa-privacy", "/informativa-sulla-privacy"],
    nl: ["/privacybeleid", "/privacyverklaring"],
    pl: ["/prywatnosc", "/prywatność", "/polityka-prywatnosci", "/polityka-prywatności"],
  };
  const hintedLocalePaths = uniqueStrings(localeHints.flatMap((locale) => localizedByLocale[locale] ?? []));
  const fallbackLocalePaths = [
    "/datenschutz",
    "/politique-de-confidentialite",
    "/politica-de-privacidad",
    "/informativa-privacy",
    "/privacybeleid",
    "/polityka-prywatnosci",
  ];
  return uniqueStrings([
    ...genericCorePaths,
    ...(hintedLocalePaths.length > 0 ? hintedLocalePaths : fallbackLocalePaths),
    ...knownPublisherPrivacyCenterUrls(baseUrl),
    ...genericSecondaryPaths,
  ]);
}

function commonPolicyPathLabel(path: string): string {
  try {
    const parsed = new URL(path);
    return parsed.pathname.replace(/[-/]/g, " ").trim() || parsed.hostname;
  } catch {
    return path.replace(/[-/]/g, " ").trim();
  }
}

function knownPublisherPrivacyCenterUrls(baseUrl: string): string[] {
  try {
    const hostname = new URL(baseUrl).hostname.toLowerCase();
    const urls: string[] = [];
    if (hostname === "news.sky.com") {
      urls.push("https://www.sky.com/help/articles/privacy-hub-home");
    }
    if (hostname === "www.wp.pl" || hostname === "wp.pl" || hostname.endsWith(".wp.pl")) {
      urls.push("https://holding.wp.pl/poufnosc");
    }
    return urls;
  } catch {
    return [];
  }
}

function commonPathLocaleHints(
  baseUrl: string,
  html: string,
  visibleText: string,
): SupportedPrivacyEvidenceLocale[] {
  const hints: SupportedPrivacyEvidenceLocale[] = [];
  const add = (locale: SupportedPrivacyEvidenceLocale) => {
    if (!hints.includes(locale)) {
      hints.push(locale);
    }
  };
  try {
    const hostname = new URL(baseUrl).hostname.toLowerCase();
    if (hostname.endsWith(".de")) add("de");
    if (hostname.endsWith(".fr")) add("fr");
    if (hostname.endsWith(".es")) add("es");
    if (hostname.endsWith(".it")) add("it");
    if (hostname.endsWith(".nl")) add("nl");
    if (hostname.endsWith(".pl")) add("pl");
  } catch {
    // Ignore malformed fixture URLs.
  }
  const htmlLang = /\blang=["']?([a-z]{2})(?:[-_][a-z]{2})?/i.exec(html)?.[1]?.toLowerCase();
  if (htmlLang === "de") add("de");
  if (htmlLang === "fr") add("fr");
  if (htmlLang === "es") add("es");
  if (htmlLang === "it") add("it");
  if (htmlLang === "nl") add("nl");
  if (htmlLang === "pl") add("pl");
  const haystack = `${html.slice(0, 20_000)} ${visibleText.slice(0, 20_000)}`.toLowerCase();
  if (/\b(?:datenschutz|personenbezogene daten)\b/.test(haystack)) add("de");
  if (/\b(?:confidentialit[eé]|donn[eé]es personnelles)\b/.test(haystack)) add("fr");
  if (/\b(?:privacidad|datos personales)\b/.test(haystack)) add("es");
  if (/\b(?:informativa sulla privacy|dati personali)\b/.test(haystack)) add("it");
  if (/\b(?:privacybeleid|persoonsgegevens)\b/.test(haystack)) add("nl");
  if (/\b(?:polityka prywatno[śs]ci|dane osobowe|rodo)\b/.test(haystack)) add("pl");
  return hints;
}

function classifyCommonPathSurface(path: string, normalizedUrl: string): ReturnType<typeof classifySurface> {
  const linkText = path.replace(/[-/]/g, " ").trim();
  const classified = classifySurface({ linkText, url: normalizedUrl });
  if (
    /privacy|poufnosc|poufność/i.test(path) &&
    !/privacy[-/]?(?:choices|settings|preferences)|yourprivacychoices|cookie/i.test(path)
  ) {
    return {
      ...classified,
      surfaceType: "privacy_policy",
      score: Math.max(classified.score, 0.9),
      keywords: uniqueStrings([...classified.keywords, "common_path_privacy_policy"]),
      matchedConcept: classified.matchedConcept ?? "privacy_policy",
      classifierReasonCodes: uniqueStrings([
        ...classified.classifierReasonCodes,
        "matched_privacy_policy",
        "common_path_privacy_policy",
      ]),
    };
  }
  return classified;
}

function deterministicFetchFallback(candidates: PolicySurfaceCandidate[]): PolicySurfaceCandidate[] {
  return candidates
    .filter((candidate) =>
      (candidate.fetchable || candidate.observationOnly) &&
      candidate.deterministicSurfaceType !== "unknown" &&
      candidate.deterministicScore >= 0.5,
    )
    .sort((left, right) =>
      surfacePriority(left.deterministicSurfaceType) - surfacePriority(right.deterministicSurfaceType) ||
      policyCandidateQualityScore(right) - policyCandidateQualityScore(left) ||
      right.deterministicScore - left.deterministicScore ||
      left.normalizedUrl.localeCompare(right.normalizedUrl),
    )
    .slice(0, MAX_COMMON_PATH_CANDIDATES_TO_FETCH);
}

function shouldSpeculateCommonPathNanoRanking(
  linkCandidates: PolicySurfaceCandidate[],
  commonPathCandidates: PolicySurfaceCandidate[],
): boolean {
  return linkCandidates.length > 0 &&
    commonPathCandidates.length > 0 &&
    deterministicFetchFallback(linkCandidates).length === 0;
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
      policyCandidateQualityScore(right) - policyCandidateQualityScore(left) ||
      right.deterministicScore - left.deterministicScore ||
      left.normalizedUrl.localeCompare(right.normalizedUrl),
    )
    .slice(0, MAX_COMMON_PATH_CANDIDATES_TO_FETCH);
}

function mergeCommonPathFallbackCandidates(
  deterministicRanked: PolicySurfaceCandidate[],
  nanoRanked: PolicySurfaceCandidate[],
): PolicySurfaceCandidate[] {
  const selected = new Map<string, PolicySurfaceCandidate>();
  for (const candidate of [...deterministicRanked, ...nanoRanked]) {
    const key = commonPathCandidateKey(candidate.normalizedUrl);
    if (!selected.has(key)) {
      selected.set(key, candidate);
    }
  }
  return [...selected.values()].slice(0, MAX_COMMON_PATH_CANDIDATES_TO_FETCH);
}

function candidateGroupFetchLimit(rankedCandidates: PolicySurfaceCandidate[]): number {
  return rankedCandidates.every(isCommonPathFallbackCandidate)
    ? MAX_COMMON_PATH_CANDIDATES_TO_FETCH
    : MAX_CANDIDATES_TO_FETCH;
}

function isCommonPathFallbackCandidate(candidate: PolicySurfaceCandidate): boolean {
  return candidate.discoveryMethod === "guessed_common_path" || candidate.rankedFromCommonPath === true;
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
  if (/\/help\/articles\/privacy-hub-home\/?$/.test(path) || /\/poufnosc\/?$/.test(path)) {
    return 4;
  }
  if (/(?:datenschutz|datenschutzerklaerung|datenschutzerklärung|confidentialit[eé]|politique-de-confidentialit[eé]|privacidad|politica-de-privacidad|política-de-privacidad|informativa-privacy|informativa-sulla-privacy|privacybeleid|privacyverklaring|prywatnosc|prywatność|polityka-prywatnosci|polityka-prywatności)/.test(path)) {
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

function policyCandidateQualityScore(candidate: PolicySurfaceCandidate): number {
  const path = safeUrlPath(candidate.normalizedUrl).toLowerCase();
  const value = `${candidate.linkText} ${candidate.normalizedUrl}`.toLowerCase();
  let score = 0;

  if (/privacy-policy|privacy-notice|cookie-policy|terms-of-service|terms-and-conditions/.test(value)) {
    score += 4;
  }
  if (/\/(?:policies|policy|privacy|legal)\//.test(path) || /\/(?:privacy-policy|privacy-notice|cookie-policy|terms)(?:\/|$)/.test(path)) {
    score += 3;
  }
  if (/https?:\/\/[^ ]*(?:policies|policy|privacy|terms)/.test(value)) {
    score += 2;
  }
  if (candidate.discoveryMethod === "footer_link" || candidate.discoveryMethod === "header_link") {
    score += 1;
  }
  if (/\/intl\/[^/]+\/policies\//.test(path)) {
    score -= 5;
  }
  if (candidate.linkText.trim().length <= 8 && /^(privacy|terms|cookies?)$/i.test(candidate.linkText.trim())) {
    score -= 1;
  }

  return score;
}

function safeUrlPath(value: string): string {
  try {
    return new URL(value).pathname.replace(/\/+$/, "") || "/";
  } catch {
    return value;
  }
}

function hasSufficientFetchableStaticGdprCoverage(candidates: PolicySurfaceCandidate[]): boolean {
  const fetchable = deterministicFetchFallback(candidates)
    .filter((candidate) =>
      candidate.fetchable &&
      !candidate.observationOnly &&
      policyCandidateQualityScore(candidate) >= 2
    );
  if (fetchable.length === 0) {
    return false;
  }
  const surfaceTypes = new Set(fetchable.map((candidate) => candidate.deterministicSurfaceType));
  const hasCookieOrControlSurface =
    surfaceTypes.has("cookie_policy") ||
    surfaceTypes.has("consent_preferences") ||
    surfaceTypes.has("cookie_settings") ||
    surfaceTypes.has("your_privacy_choices");
  return surfaceTypes.has("privacy_policy") &&
    hasCookieOrControlSurface;
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
      policyCandidateQualityScore(right) - policyCandidateQualityScore(left) ||
      right.deterministicScore - left.deterministicScore ||
      left.normalizedUrl.localeCompare(right.normalizedUrl),
    );

  for (const candidate of supplements) {
    selected.set(candidateKey(candidate), candidate);
  }

  return capPolicyCandidatesWithSurfaceDiversity([...selected.values()], limit);
}

function capPolicyCandidatesWithSurfaceDiversity(
  candidates: PolicySurfaceCandidate[],
  limit: number,
): PolicySurfaceCandidate[] {
  if (limit <= 0 || candidates.length <= limit) {
    return candidates.slice(0, Math.max(0, limit));
  }
  if (candidates.every(isCommonPathFallbackCandidate)) {
    return candidates.slice(0, limit);
  }

  const selected = new Set<string>();
  const selectedSurfaceTypes = new Set<PolicySurfaceCandidate["deterministicSurfaceType"]>();
  const diverse: PolicySurfaceCandidate[] = [];

  for (const candidate of candidates) {
    if (diverse.length >= limit) {
      break;
    }
    if (selectedSurfaceTypes.has(candidate.deterministicSurfaceType)) {
      continue;
    }
    const key = candidateKey(candidate);
    selected.add(key);
    selectedSurfaceTypes.add(candidate.deterministicSurfaceType);
    diverse.push(candidate);
  }

  for (const candidate of candidates) {
    if (diverse.length >= limit) {
      break;
    }
    const key = candidateKey(candidate);
    if (!selected.has(key)) {
      selected.add(key);
      diverse.push(candidate);
    }
  }

  return diverse;
}

function pruneEquivalentPolicyFetchCandidates(
  candidates: PolicySurfaceCandidate[],
): PolicySurfaceCandidate[] {
  const selected = new Map<string, PolicySurfaceCandidate>();
  const order: string[] = [];
  for (const candidate of candidates) {
    const key = equivalentPolicyFetchCandidateKey(candidate);
    const existing = selected.get(key);
    if (!existing) {
      selected.set(key, candidate);
      order.push(key);
      continue;
    }
    if (policyCandidateFetchPreference(candidate) > policyCandidateFetchPreference(existing)) {
      selected.set(key, candidate);
    }
  }
  return order
    .map((key) => selected.get(key))
    .filter((candidate): candidate is PolicySurfaceCandidate => Boolean(candidate));
}

function equivalentPolicyFetchCandidateKey(candidate: PolicySurfaceCandidate): string {
  try {
    const parsed = new URL(candidate.normalizedUrl);
    parsed.hash = "";
    parsed.search = "";
    parsed.pathname = parsed.pathname.replace(/\/+$/, "") || "/";
    return `${candidate.deterministicSurfaceType}:${parsed.origin.toLowerCase()}${parsed.pathname.toLowerCase()}`;
  } catch {
    return `${candidate.deterministicSurfaceType}:${candidate.normalizedUrl.replace(/[?#].*$/, "").replace(/\/+$/, "").toLowerCase()}`;
  }
}

function policyCandidateFetchPreference(candidate: PolicySurfaceCandidate): number {
  return (candidate.fetchable ? 100 : 0) +
    (candidate.observationOnly ? -100 : 0) +
    policyCandidateQualityScore(candidate) * 10 +
    candidate.deterministicScore;
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

function summarizePolicyCandidates(candidates: PolicySurfaceCandidate[]): Array<{
  classifierProvenance: PolicySurfaceCandidate["deterministicClassifierProvenance"];
  classifierReasonCodes: string[];
  clickable: boolean;
  discoveryMethod: PolicySurfaceCandidate["discoveryMethod"];
  domLocation: PolicySurfaceCandidate["domLocation"];
  fetchable: boolean;
  linkText: string;
  matchedConcept?: string;
  matchedLocale?: SupportedPrivacyEvidenceLocale;
  matchStrength?: PrivacySurfaceMatchStrength;
  mayLeadToConsentControls: boolean;
  normalizedUrl: string;
  observationOnly: boolean;
  surfaceType: PolicySurfaceObservation["surfaceType"];
}> {
  return candidates
    .filter((candidate) =>
      candidate.deterministicSurfaceType !== "unknown" &&
      candidate.deterministicScore >= 0.5,
    )
    .sort((left, right) =>
      surfacePriority(left.deterministicSurfaceType) - surfacePriority(right.deterministicSurfaceType) ||
      policyCandidateQualityScore(right) - policyCandidateQualityScore(left) ||
      right.deterministicScore - left.deterministicScore ||
      left.normalizedUrl.localeCompare(right.normalizedUrl),
    )
    .slice(0, 20)
    .map((candidate) => ({
      classifierProvenance: candidate.deterministicClassifierProvenance,
      classifierReasonCodes: candidate.deterministicClassifierReasonCodes.slice(0, 12),
      clickable: candidate.clickable,
      discoveryMethod: candidate.discoveryMethod,
      domLocation: candidate.domLocation,
      fetchable: candidate.fetchable,
      linkText: candidate.linkText.slice(0, 160),
      matchedConcept: candidate.deterministicMatchedConcept,
      matchedLocale: candidate.deterministicMatchedLocale,
      matchStrength: candidate.deterministicMatchStrength,
      mayLeadToConsentControls: candidate.mayLeadToConsentControls,
      normalizedUrl: candidate.normalizedUrl,
      observationOnly: candidate.observationOnly,
      surfaceType: candidate.deterministicSurfaceType,
    }));
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
  ]).filter((candidate) =>
    isHighValuePolicySupplement(candidate) &&
    isSameOriginPolicyPageSupplement(baseUrl, candidate)
  );
}

function isSameOriginPolicyPageSupplement(baseUrl: string, candidate: PolicySurfaceCandidate): boolean {
  return candidate.observationOnly || sameOrigin(baseUrl, candidate.normalizedUrl);
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
    "privacy_policy",
    "cookie_policy",
    "your_privacy_choices",
    "do_not_sell_or_share",
    "consent_preferences",
    "cookie_settings",
    "notice_at_collection",
    "california_notice",
    "ai_disclosure",
    "terms",
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
    if (candidate && nanoRankedCandidateHasDirectSurfaceEvidence(candidate, ranked)) {
      rankedIds.add(ranked.candidateId);
      candidate.assisted = ranked;
      candidate.rankedFromCommonPath = candidate.discoveryMethod === "guessed_common_path";
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

function nanoRankedCandidateHasDirectSurfaceEvidence(
  candidate: PolicySurfaceCandidate,
  ranked: NanoLinkClassificationResult["rankedCandidates"][number],
): boolean {
  if (ranked.shouldFetch === false || ranked.likelySurfaceType === "unknown") {
    return false;
  }

  const directClassification = classifySurface({
    linkText: candidate.linkText,
    url: candidate.normalizedUrl,
  });

  return directClassification.surfaceType === ranked.likelySurfaceType &&
    directClassification.score >= 0.5;
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
    discardedArticle13DisclosureSignals: result.discardedArticle13DisclosureSignals ?? [],
    gdprTransparencyTopicCandidates: [],
    retainedArticle13SectionEvidence: [],
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
    gdprTransparencyTopicCandidates: input.gdprTransparencyTopicCandidates ?? [],
    discardedArticle13DisclosureSignals: input.discardedArticle13DisclosureSignals ?? [],
    retainedPolicySections: input.retainedPolicySections ?? [],
    retainedArticle13SectionEvidence: input.retainedArticle13SectionEvidence ?? [],
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

function classifySurface(input: {
  linkText?: string | null;
  url?: string | null;
  title?: string | null;
  surroundingText?: string | null;
}): {
  surfaceType: PolicySurfaceObservation["surfaceType"];
  score: number;
  keywords: string[];
  matchedConcept?: string;
  matchedLocale?: SupportedPrivacyEvidenceLocale;
  matchStrength?: PrivacySurfaceMatchStrength;
  classifierReasonCodes: string[];
  classifierProvenance: "privacy_surface_classifier.v1";
  classifierVariant?: string;
} {
  const classification: PrivacySurfaceClassification = classifyPrivacySurface(input);
  return {
    surfaceType: classification.surfaceType,
    score: classification.confidence,
    keywords: classification.reasonCodes,
    matchedConcept: classification.matchedTerm ?? classification.variant ?? classification.surfaceType,
    matchedLocale: classification.matchedLocale,
    matchStrength: classification.matchStrength,
    classifierReasonCodes: classification.reasonCodes,
    classifierProvenance: "privacy_surface_classifier.v1",
    classifierVariant: classification.variant,
  };
}

function isPreferenceControlSurface(surfaceType: PolicySurfaceObservation["surfaceType"], value: string): boolean {
  return isPreferenceControlSurfaceType(surfaceType) ||
    isPreferenceControlSurfaceType(classifySurface({ linkText: value }).surfaceType);
}

function isObservationOnlyPreferenceControl(surfaceType: PolicySurfaceObservation["surfaceType"], value: string): boolean {
  return isObservationOnlyPreferenceControlSurfaceType(surfaceType) ||
    isObservationOnlyPreferenceControlSurfaceType(classifySurface({ linkText: value }).surfaceType);
}

function isPreferenceControlSurfaceType(surfaceType: PolicySurfaceObservation["surfaceType"]): boolean {
  return [
    "consent_preferences",
    "cookie_settings",
    "your_privacy_choices",
    "do_not_sell_or_share",
  ].includes(surfaceType);
}

function isObservationOnlyPreferenceControlSurfaceType(surfaceType: PolicySurfaceObservation["surfaceType"]): boolean {
  return [
    "consent_preferences",
    "cookie_settings",
  ].includes(surfaceType);
}

function classifierCandidateFields(classification: ReturnType<typeof classifySurface>): Pick<
  PolicySurfaceCandidate,
  | "deterministicMatchedConcept"
  | "deterministicMatchedLocale"
  | "deterministicMatchStrength"
  | "deterministicClassifierReasonCodes"
  | "deterministicClassifierProvenance"
> {
  return {
    deterministicMatchedConcept: classification.matchedConcept,
    deterministicMatchedLocale: classification.matchedLocale,
    deterministicMatchStrength: classification.matchStrength,
    deterministicClassifierReasonCodes: classification.classifierReasonCodes,
    deterministicClassifierProvenance: classification.classifierProvenance,
  };
}

function extractPolicyFacts(text: string): PolicyFacts {
  const textQuality = assessPolicyTextQuality(text);
  if (!textQuality.usable) {
    const gdprTransparencyTopicCandidates = textQuality.reason === "low_quality_access_challenge"
      ? []
      : gdprTransparencyTopicCandidatesFromText(text);
    if (gdprTransparencyTopicCandidates.length > 0) {
      return {
        ...emptyPolicyFacts(),
        gdprTransparencyTopicCandidates,
        confidence: 0.62,
      };
    }
    return emptyPolicyFacts();
  }
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
    ["international_transfers", /international transfer|transfer (?:your )?(?:personal )?(?:data|information).{0,80}(?:outside|to)|(?:third parties|service providers?|business partners?|processors?|vendors?|recipients?).{0,180}outside (?:the )?(?:eea|european economic area|uk|united kingdom|eu|european union)|standard contractual clauses|adequacy decision/i, "international transfers"],
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
  const legacyArticle13Signals = article13SignalsFromText(text);
  const article13Signals = mergeArticle13DisclosureSignals({
    ...emptyPolicyFacts(),
    article13DisclosureSignals: legacyArticle13Signals.article13DisclosureSignals,
    discardedArticle13DisclosureSignals: legacyArticle13Signals.discardedArticle13DisclosureSignals,
  }, undefined);
  return {
    observedTopics,
    ...article13Signals,
    gdprTransparencyTopicCandidates: gdprTransparencyTopicCandidatesFromText(text),
    retainedArticle13SectionEvidence: [],
    mentionedVendors: vendors,
    mentionedPurposes: unique(observedTopics.filter((topic) => ["analytics", "advertising", "targeted_advertising"].includes(topic))),
    mentionedRights: unique(observedTopics.filter((topic) => ["california_privacy_rights", "do_not_sell_or_share"].includes(topic))),
    mentionedControls: unique(observedTopics.filter((topic) => ["global_privacy_control", "cookie_settings", "consent_withdrawal"].includes(topic))),
    confidence: observedTopics.length > 0 || vendors.length > 0 ? 0.76 : 0.45,
    keywords,
  };
}

function gdprTransparencyTopicCandidatesFromText(text: string): PolicySurfaceObservation["gdprTransparencyTopicCandidates"] {
  const classification = classifyGdprTransparencyTopics({
    text: boundedGdprTransparencyClassifierText(text),
  });
  return classification.matches.map((match) => ({
    topic: match.topic,
    status: "diagnostic_only" as const,
    evidenceText: match.evidenceExcerpt.slice(0, 640),
    confidence: match.confidence,
    classifierProvenance: match.classifierProvenance,
    matchedLocale: match.matchedLocale,
    matchedTerm: match.matchedTerm,
    matchStrength: match.matchStrength,
    classifierReasonCodes: match.reasonCodes,
    productionCredit: false as const,
  }));
}

export function gdprTransparencyTopicCandidatesFromRetainedPolicySections(
  sections: Pick<RetainedPolicySection, "heading" | "textExcerpt">[],
): PolicySurfaceObservation["gdprTransparencyTopicCandidates"] {
  const text = sections
    .filter((section) => section.textExcerpt.length >= 80)
    .map((section) => `${section.heading}\n${section.textExcerpt}`)
    .join("\n\n");
  return gdprTransparencyTopicCandidatesFromText(text);
}

function mergeGdprTransparencyTopicCandidates(
  primary: PolicySurfaceObservation["gdprTransparencyTopicCandidates"],
  supplemental: PolicySurfaceObservation["gdprTransparencyTopicCandidates"],
): PolicySurfaceObservation["gdprTransparencyTopicCandidates"] {
  const merged = new Map<PolicySurfaceObservation["gdprTransparencyTopicCandidates"][number]["topic"], PolicySurfaceObservation["gdprTransparencyTopicCandidates"][number]>();
  for (const candidate of [...primary, ...supplemental]) {
    if (!merged.has(candidate.topic)) {
      merged.set(candidate.topic, candidate);
    }
  }
  return [...merged.values()];
}

function boundedGdprTransparencyClassifierText(text: string): string {
  return normalizeWhitespace(text).slice(0, MAX_NANO_POLICY_ANALYSIS_EXCERPT_CHARS);
}

function emptyPolicyFacts(): PolicyFacts {
  return {
    observedTopics: [],
    article13DisclosureSignals: [],
    discardedArticle13DisclosureSignals: [],
    gdprTransparencyTopicCandidates: [],
    retainedArticle13SectionEvidence: [],
    mentionedVendors: [],
    mentionedPurposes: [],
    mentionedRights: [],
    mentionedControls: [],
    confidence: 0.2,
    keywords: [],
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

type RetainedPolicySection = PolicySurfaceObservation["retainedPolicySections"][number];
type RetainedArticle13SectionEvidence = PolicySurfaceObservation["retainedArticle13SectionEvidence"][number];
type Article13DisclosureType = PolicySurfaceObservation["article13DisclosureSignals"][number]["disclosureType"];

const ARTICLE13_SECTION_PROFILES: Array<{
  disclosureType: Article13DisclosureType;
  headingPatterns: RegExp[];
  textPatterns: RegExp[];
  observedPattern: RegExp;
  partialPattern?: RegExp;
}> = [
  {
    disclosureType: "data_retention",
    headingPatterns: [/retaining your information/i, /retention/i],
    textPatterns: [/retain/i, /retained/i, /retention/i, /deleted?/i, /deletion/i, /anonymi[sz]ed?/i, /remove/i, /expires?/i, /kept for/i, /legal purposes/i, /fraud and abuse prevention/i],
    observedPattern: /(?:retain|retained).{0,220}(?:as long as necessary|required by law|legal purposes|fraud|abuse|different periods)|deleted? or anonymi[sz]ed|kept until you remove|retention period|retention criteria/i,
  },
  {
    disclosureType: "data_subject_rights",
    headingPatterns: [/your privacy controls/i, /exporting.*deleting/i, /privacy controls/i],
    textPatterns: [/update/i, /manage/i, /export/i, /delete/i, /download a copy/i, /request/i, /remove content/i, /my activity/i, /google takeout/i, /privacy controls/i, /applicable law/i, /European Union or United Kingdom data protection law/i],
    observedPattern: /(?:right to|rights? to|data subject rights|exercise (?:your )?rights|request to (?:access|correct|delete|remove)|download a copy|google takeout|my activity|European Union or United Kingdom data protection law)/i,
    partialPattern: /(?:update|manage|export|delete|request|remove|download|access|correct|object|restrict|privacy controls)/i,
  },
  {
    disclosureType: "international_transfers",
    headingPatterns: [/data transfers?/i, /international transfers?/i],
    textPatterns: [/servers around the world/i, /processed? outside (?:your )?country/i, /outside (?:of )?the country where you live/i, /outside (?:the )?(?:eea|european economic area|uk|united kingdom|eu|european union)/i, /third countr(?:y|ies)/i, /legal frameworks? relating to the transfer of data/i, /data protection laws vary/i, /agreements?.{0,180}(?:protect|safeguard)/i, /adequacy/i, /safeguards/i, /EU-U\.S\. Data Privacy Framework/i, /UK Extension/i, /Swiss-U\.S\./i],
    observedPattern: /servers around the world|processed? (?:on servers )?outside (?:your )?country|outside (?:of )?the country where you live|(?:third parties|service providers?|business partners?|processors?|vendors?|recipients?).{0,220}outside (?:the )?(?:eea|european economic area|uk|united kingdom|eu|european union)|agreements?.{0,220}(?:personal information|personal data|data|information).{0,220}(?:protect|protected|safeguard|outside (?:the )?(?:eea|european economic area|uk|united kingdom|eu|european union))|legal frameworks? relating to the transfer of data|data protection laws vary|adequacy|safeguards|EU-U\.S\. Data Privacy Framework|UK Extension|Swiss-U\.S\.|standard contractual clauses/i,
  },
  {
    disclosureType: "supervisory_authority",
    headingPatterns: [/compliance (?:and|&) cooperation with regulators/i, /regulators/i, /complaints?/i],
    textPatterns: [/formal written complaints?/i, /complaints?/i, /regulatory authorities/i, /local data protection authorities/i, /supervisory authority/i, /data protection authority/i, /unresolved complaints?/i, /resolve/i],
    observedPattern: /lodge a complaint|complain to (?:a )?(?:supervisory|data protection) authority|supervisory authority|data protection authority/i,
    partialPattern: /formal written complaints?|regulatory authorities|local data protection authorities|unresolved complaints?|resolve/i,
  },
  {
    disclosureType: "dpo_contact",
    headingPatterns: [/contact/i, /European requirements/i, /data protection/i],
    textPatterns: [/privacy office/i, /data protection office/i, /data protection officer/i, /\bdpo\b/i, /contact (?:google|us)/i, /questions about this policy/i, /Google LLC/i, /Google Ireland Limited/i],
    observedPattern: /data protection officer|\bdpo\b/i,
    partialPattern: /privacy office|data protection office|contact (?:google|us)|questions about this policy|Google LLC|Google Ireland Limited/i,
  },
  {
    disclosureType: "controller_contact",
    headingPatterns: [/contact/i, /European requirements/i, /controller/i],
    textPatterns: [/contact Google/i, /contact us/i, /questions about this policy/i, /privacy office/i, /data protection office/i, /data protection officer/i, /Google LLC/i, /Google Ireland Limited/i],
    observedPattern: /data controller|\bcontroller\b|privacy@|contact (?:us|our privacy team).{0,120}(?:privacy|data protection)/i,
    partialPattern: /Google LLC|Google Ireland Limited|contact Google|questions about this policy|privacy office|data protection office/i,
  },
  {
    disclosureType: "legal_basis",
    headingPatterns: [/legal basis/i, /lawful basis/i, /European requirements/i],
    textPatterns: [/Article 6/i, /legitimate interests/i, /consent/i, /contract/i, /legal obligation/i, /public task/i, /vital interests/i, /required by law/i],
    observedPattern: /legal basis|lawful basis|Article 6|legitimate interests?|performance of (?:a )?contract|contractual necessity|legal obligation|public task|vital interests/i,
    partialPattern: /required by law|consent/i,
  },
  {
    disclosureType: "automated_decision_making_or_profiling",
    headingPatterns: [/automated systems/i, /profiling/i, /automated decision/i],
    textPatterns: [/automated systems/i, /algorithms?/i, /recognize patterns/i, /personalized ads/i, /customi[sz]ed search results/i, /tailored/i],
    observedPattern: /solely automated|automated decision(?:-making| making)?.{0,160}(?:legal or similarly significant effects|meaningful information about the logic involved)/i,
    partialPattern: /automated systems|algorithms?|recognize patterns|personalized ads|customi[sz]ed search results|tailored|personalization/i,
  },
];

function withSectionArticle13Evidence(
  facts: PolicyFacts,
  sectionEvidence: RetainedArticle13SectionEvidence[],
): PolicyFacts {
  if (sectionEvidence.length === 0) {
    return facts;
  }
  const sectionSignals = sectionEvidence.flatMap((evidence) => {
    if (evidence.signalObserved === "not_confirmed") {
      return [];
    }
    return [{
      disclosureType: evidence.coverageArea,
      status: evidence.signalObserved,
      evidenceText: evidence.selectedPolicySectionExcerpt.slice(0, 320),
      confidence: confidenceForArticle13DisclosureSignal(
        evidence.coverageArea,
        evidence.signalObserved === "observed" ? "observed" : "partial",
        evidence.selectedPolicySectionExcerpt,
      ),
      source: "deterministic" as const,
      selectedPolicySectionHeading: evidence.selectedPolicySectionHeading,
      selectedPolicySectionExcerpt: evidence.selectedPolicySectionExcerpt,
      selectedPolicySectionUrl: evidence.selectedPolicySectionUrl,
      evidenceSource: evidence.evidenceSource,
      selectedEvidenceStrength: evidence.selectedEvidenceStrength,
    }];
  });
  return {
    ...facts,
    article13DisclosureSignals: mergeArticle13DisclosureSignals({
      ...facts,
      article13DisclosureSignals: [...facts.article13DisclosureSignals, ...sectionSignals],
    }, undefined).article13DisclosureSignals,
    retainedArticle13SectionEvidence: sectionEvidence,
  };
}

function policyFactsForFetchedDocument(
  facts: PolicyFacts,
  sectionEvidence: RetainedArticle13SectionEvidence[],
  options: { allowLegacyArticle13Extraction: boolean },
): PolicyFacts {
  if (options.allowLegacyArticle13Extraction) {
    return withSectionArticle13Evidence(facts, sectionEvidence);
  }
  return {
    ...emptyPolicyFacts(),
    gdprTransparencyTopicCandidates: facts.gdprTransparencyTopicCandidates,
    confidence: facts.gdprTransparencyTopicCandidates.length > 0 ? Math.max(0.62, facts.confidence) : facts.confidence,
    keywords: facts.keywords,
  };
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
    ...mergeArticle13DisclosureSignals(deterministic, assisted),
    gdprTransparencyTopicCandidates: deterministic.gdprTransparencyTopicCandidates,
    retainedArticle13SectionEvidence: deterministic.retainedArticle13SectionEvidence,
    mentionedVendors: unique([...deterministic.mentionedVendors, ...assisted.mentionedVendors]),
    mentionedPurposes: unique([...deterministic.mentionedPurposes, ...assisted.mentionedPurposes]),
    mentionedRights: unique([...deterministic.mentionedRights, ...assisted.mentionedRights]),
    mentionedControls: unique([...deterministic.mentionedControls, ...assisted.mentionedControls]),
    confidence: Math.max(deterministic.confidence, assisted.confidence),
    keywords: deterministic.keywords,
  };
}

function article13SignalsFromText(text: string): Pick<PolicyFacts, "article13DisclosureSignals" | "discardedArticle13DisclosureSignals"> {
  if (!assessPolicyTextQuality(text).usable) {
    return {
      article13DisclosureSignals: [],
      discardedArticle13DisclosureSignals: [],
    };
  }
  const rules: Array<{
    disclosureType: PolicySurfaceObservation["article13DisclosureSignals"][number]["disclosureType"];
    pattern: RegExp;
    partialPattern?: RegExp;
    excerptPatterns: RegExp[];
    maxEvidenceChars?: number;
  }> = [
    {
      disclosureType: "controller_contact",
      pattern: /(?:data controller|controller|privacy@|contact (?:us|our privacy team)|privacy office|data protection officer|\bdpo\b)/i,
      partialPattern: /(?:Google LLC|Google Ireland Limited|contact Google|questions about (?:this )?(?:policy|privacy)|data protection office|privacy questions)/i,
      excerptPatterns: [/data controller/i, /controller/i, /Google LLC/i, /Google Ireland Limited/i, /contact Google/i, /questions about (?:this )?(?:policy|privacy)/i, /privacy@/i, /privacy office/i, /data protection office/i, /data protection officer/i, /\bdpo\b/i],
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
      pattern: /(?:retention period|retention criteria|storage period|retain.{0,120}(?:as long as necessary|required by law|for the purposes|until|unless|legal purposes|fraud|abuse)|retained.{0,120}(?:as long as necessary|required by law|legal purposes|fraud|abuse)|keep your (?:personal )?(?:data|information).{0,120}(?:as long as necessary|required by law|for)|stored for|kept for|as long as necessary|delete (?:it|them|the data|personal data|personal information|your information) after|deleted? or anonymi[sz]ed|expires?)/i,
      partialPattern: /(?:retention period|retention criteria|retain.{0,120}(?:as long as necessary|required by law|for the purposes|until|unless|legal purposes|fraud|abuse)|retained.{0,120}(?:as long as necessary|required by law|legal purposes|fraud|abuse)|keep your (?:personal )?(?:data|information).{0,120}(?:as long as necessary|required by law|for)|stored for|kept for|expires?)/i,
      excerptPatterns: [/retain.{0,120}(?:as long as necessary|required by law|for the purposes|until|unless|legal purposes|fraud|abuse)/i, /retained.{0,120}(?:as long as necessary|required by law|legal purposes|fraud|abuse)/i, /retention period/i, /retention criteria/i, /storage period/i, /keep your (?:personal )?(?:data|information).{0,120}(?:as long as necessary|required by law|for)/i, /stored for/i, /kept for/i, /as long as necessary/i, /delete (?:it|them|the data|personal data|personal information|your information) after/i, /deleted? or anonymi[sz]ed/i, /expires?/i, /retain/i, /retention/i],
    },
    {
      disclosureType: "data_subject_rights",
      pattern: /(?:your privacy controls.{0,250}(?:review|update|activity controls|ad settings|personalization settings|my activity)|exporting.*deleting.{0,250}(?:export|delete|remove|google takeout)|right to (?:access|delete|erase|erasure|rectif|object|restrict|port)|rights? to (?:access|delete|erase|erasure|rectif|object|restrict|port)|data subject rights|exercise (?:your )?rights|download a copy|export (?:your )?(?:data|information)|Google Takeout|My Activity|delete (?:your )?(?:data|information|account)|remove (?:content|data|information)|request to (?:remove|delete|access|correct))/i,
      excerptPatterns: [/your privacy controls.{0,250}(?:review|update|activity controls|ad settings|personalization settings|my activity)/i, /exporting.*deleting.{0,250}(?:export|delete|remove|google takeout)/i, /right to (?:access|delete|erase|erasure|rectif|object|restrict|port)/i, /rights? to (?:access|delete|erase|erasure|rectif|object|restrict|port)/i, /data subject rights/i, /exercise (?:your )?rights/i, /download a copy/i, /export (?:your )?(?:data|information)/i, /Google Takeout/i, /My Activity/i, /delete (?:your )?(?:data|information|account)/i, /remove (?:content|data|information)/i, /request to (?:remove|delete|access|correct)/i],
    },
    {
      disclosureType: "international_transfers",
      pattern: /(?:data transfers?.{0,320}(?:servers around the world|outside (?:of )?the country|legal frameworks?|data privacy frameworks?|safeguards)|international transfer|cross-border transfer|standard contractual clauses|adequacy decision|servers around the world|processed? (?:on servers )?outside (?:your )?country|outside (?:of )?the country where you live|(?:third parties|service providers?|business partners?|processors?|vendors?|recipients?).{0,240}outside (?:the )?(?:eea|european economic area|uk|united kingdom|eu|european union)|agreements?.{0,240}(?:personal information|personal data|data|information).{0,240}(?:protect|protected|safeguard|outside (?:the )?(?:eea|european economic area|uk|united kingdom|eu|european union))|legal frameworks? relating to the transfer of data|data protection laws vary|outside (?:the )?(?:eea|european economic area|uk|united kingdom|eu|european union)|third countr(?:y|ies)|data privacy framework|\bdpf\b|EU-U\.S\.|UK Extension|Swiss-U\.S\.|privacy shield)/i,
      partialPattern: /transfer (?:your )?(?:personal )?(?:data|information)/i,
      excerptPatterns: [/sometimes (?:they|such third parties|these third parties|service providers|business partners|processors|vendors|recipients).{0,120}outside (?:the )?(?:eea|european economic area|uk|united kingdom|eu|european union)/i, /(?:these|such)?\s*(?:third parties|service providers?|business partners?|processors?|vendors?|recipients?).{0,180}outside (?:the )?(?:eea|european economic area|uk|united kingdom|eu|european union)/i, /agreements?.{0,240}(?:personal information|personal data|data|information).{0,240}(?:protect|protected|safeguard|outside (?:the )?(?:eea|european economic area|uk|united kingdom|eu|european union))/i, /data transfers?.{0,320}(?:servers around the world|outside (?:of )?the country|legal frameworks?|data privacy frameworks?|safeguards)/i, /servers around the world/i, /processed? (?:on servers )?outside (?:your )?country/i, /outside (?:of )?the country where you live/i, /legal frameworks? relating to the transfer of data/i, /data protection laws vary/i, /data privacy framework/i, /international transfer/i, /cross-border transfer/i, /standard contractual clauses/i, /adequacy decision/i, /outside (?:the )?(?:eea|european economic area|uk|united kingdom|eu|european union)/i, /third countr(?:y|ies)/i, /\bdpf\b/i, /EU-U\.S\./i, /UK Extension/i, /Swiss-U\.S\./i, /privacy shield/i, /transfer (?:your )?(?:personal )?(?:data|information)/i],
      maxEvidenceChars: 640,
    },
    {
      disclosureType: "dpo_contact",
      pattern: /(?:data protection officer|\bdpo\b|data protection contact)/i,
      excerptPatterns: [/data protection officer/i, /\bdpo\b/i, /data protection contact/i],
    },
    {
      disclosureType: "supervisory_authority",
      pattern: /(?:supervisory authority|data protection authority|lodge a complaint|complain to (?:a )?(?:regulator|authority)|\bico\b|\bcnil\b|\bdpc\b)/i,
      partialPattern: /(?:compliance (?:and|&) cooperation with regulators.{0,320}(?:complaints?|regulatory authorities|local data protection authorities|resolve)|formal written complaints|regulatory authorities|local data protection authorities|unresolved complaints?|regulators?.{0,120}(?:complaints?|authorities|resolve))/i,
      excerptPatterns: [/compliance (?:and|&) cooperation with regulators.{0,320}(?:complaints?|regulatory authorities|local data protection authorities|resolve)/i, /formal written complaints/i, /regulatory authorities/i, /local data protection authorities/i, /unresolved complaints?/i, /supervisory authority/i, /data protection authority/i, /lodge a complaint/i, /complain to (?:a )?(?:regulator|authority)/i, /\bico\b/i, /\bcnil\b/i, /\bdpc\b/i],
    },
    {
      disclosureType: "automated_decision_making_or_profiling",
      pattern: /(?:automated decision|solely automated|profiling|meaningful information about the logic)/i,
      partialPattern: /(?:automated systems|algorithms?|recognize patterns|personalized ads|customi[sz]ed search results|tailored|personalization)/i,
      excerptPatterns: [/automated decision/i, /solely automated/i, /profiling/i, /meaningful information about the logic/i, /automated systems/i, /algorithms?/i, /recognize patterns/i, /personalized ads/i, /customi[sz]ed search results/i, /tailored/i, /personalization/i],
    },
  ];
  const article13DisclosureSignals: PolicySurfaceObservation["article13DisclosureSignals"] = [];
  const discardedArticle13DisclosureSignals: PolicySurfaceObservation["discardedArticle13DisclosureSignals"] = [];

  for (const rule of rules) {
    const rawStatus = rule.pattern.test(text)
      ? "observed" as const
      : rule.partialPattern?.test(text)
        ? "partial" as const
        : null;
    if (!rawStatus) {
      continue;
    }
    const evidenceText = boundedExcerptForPatterns(text, rawStatus === "partial" && rule.partialPattern
      ? [rule.partialPattern, ...rule.excerptPatterns]
      : rule.excerptPatterns).slice(0, rule.maxEvidenceChars ?? 320);
    const rejectReason = article13DisclosureRejectReason(evidenceText, rule.disclosureType);
    const confidence = confidenceForArticle13DisclosureSignal(rule.disclosureType, rawStatus, evidenceText);
    const status = rawStatus === "observed" && confidence < 0.74
      ? "partial" as const
      : rawStatus;
    if (rejectReason) {
      discardedArticle13DisclosureSignals.push({
        disclosureType: rule.disclosureType,
        evidenceText,
        rejectReason,
        confidence,
        source: "deterministic" as const,
      });
      continue;
    }
    article13DisclosureSignals.push({
      disclosureType: rule.disclosureType,
      status,
      evidenceText,
      confidence,
      source: "deterministic" as const,
    });
  }

  return {
    article13DisclosureSignals,
    discardedArticle13DisclosureSignals,
  };
}

function confidenceForArticle13DisclosureSignal(
  disclosureType: PolicySurfaceObservation["article13DisclosureSignals"][number]["disclosureType"],
  status: "observed" | "partial",
  evidenceText: string,
) {
  const text = normalizeWhitespace(evidenceText);
  if (status === "partial") {
    return confidenceForPartialArticle13Signal(disclosureType, text);
  }
  switch (disclosureType) {
    case "controller_contact":
      if (/\b(?:data controller|\bcontroller\b|privacy@|contact (?:us|our privacy team).{0,120}(?:privacy|data protection))\b/i.test(text)) return 0.9;
      if (/\b(?:data protection office|privacy office|privacy questions?)\b/i.test(text)) return 0.74;
      return 0.66;
    case "processing_purposes":
      if (/\b(?:purpose(?:s)?|why we (?:process|collect|use)|we (?:use|process|collect) (?:your )?(?:personal )?(?:data|information) (?:to|for))\b/i.test(text)) return 0.88;
      return 0.76;
    case "legal_basis":
      if (/\b(?:legal basis|lawful basis|Article 6|legitimate interests?|performance of (?:a )?contract|contractual necessity|legal obligation|public task|public interest|vital interests?)\b/i.test(text)) return 0.9;
      return 0.7;
    case "recipients_or_vendor_categories":
      if (/\b(?:recipients|service providers|processors|vendors?)\b/i.test(text)) return 0.86;
      return 0.76;
    case "data_retention":
      if (/\b(?:retention period|retention criteria|storage period|retain.{0,120}(?:as long as necessary|required by law|legal purposes|fraud|abuse)|retained.{0,120}(?:as long as necessary|required by law|legal purposes|fraud|abuse)|kept for|stored for|no longer needed)\b/i.test(text)) return 0.9;
      if (/\b(?:deleted? or anonymi[sz]ed|expires?)\b/i.test(text)) return 0.76;
      return 0.68;
    case "data_subject_rights": {
      const rightsCount = dataSubjectRightsKeywordCount(text);
      if (rightsCount >= 4 || /\b(?:data subject rights|exercise (?:your )?rights|right to (?:access|delete|erase|erasure|rectif|object|restrict|port)|rights? to (?:access|delete|erase|erasure|rectif|object|restrict|port))\b/i.test(text)) return 0.9;
      if (rightsCount >= 2) return 0.8;
      return 0.68;
    }
    case "international_transfers":
      if (/\b(?:third parties|service providers?|business partners?|processors?|vendors?|recipients?)\b.{0,220}\boutside (?:the )?(?:eea|european economic area|uk|united kingdom|eu|european union)\b/i.test(text) &&
        /\b(?:personal information|personal data|data|information|agreements?|contracts?|safeguards?|protect(?:ed)?)\b/i.test(text)) return 0.9;
      if (/\b(?:standard contractual clauses|adequacy decision|data privacy framework|\bdpf\b|EU-U\.S\.|UK Extension|Swiss-U\.S\.|outside (?:the )?(?:eea|european economic area|uk|united kingdom|eu|european union)|third countr(?:y|ies))\b/i.test(text)) return 0.92;
      if (/\b(?:servers around the world|processed? (?:on servers )?outside (?:your )?country|outside (?:of )?the country where you live|cross-border transfer|international transfer)\b/i.test(text)) return 0.84;
      return 0.66;
    case "dpo_contact":
      if (/\b(?:data protection officer|\bdpo\b)\b/i.test(text)) return 0.9;
      return 0.78;
    case "supervisory_authority":
      if (/\b(?:supervisory authority|data protection authority|lodge a complaint|complain to (?:a )?(?:supervisory|data protection) authority|\bico\b|\bcnil\b|\bdpc\b)\b/i.test(text)) return 0.9;
      return 0.66;
    case "automated_decision_making_or_profiling":
      if (/\b(?:solely automated|automated decision(?:-making| making)?.{0,160}(?:legal or similarly significant effects|meaningful information about the logic involved))\b/i.test(text)) return 0.9;
      if (/\b(?:automated decision|profiling|meaningful information about the logic)\b/i.test(text)) return 0.76;
      return 0.6;
    default:
      return 0.78;
  }
}

function confidenceForPartialArticle13Signal(
  disclosureType: PolicySurfaceObservation["article13DisclosureSignals"][number]["disclosureType"],
  evidenceText: string,
) {
  switch (disclosureType) {
    case "automated_decision_making_or_profiling":
      return 0.56;
    case "controller_contact":
    case "supervisory_authority":
      return 0.62;
    default:
      return /\b(?:right|rights|legal basis|retention|data transfer|data protection|service providers|processors)\b/i.test(evidenceText)
        ? 0.66
        : 0.58;
  }
}

function mergeArticle13DisclosureSignals(
  deterministic: PolicyFacts,
  assisted: AssistedPolicyFacts | undefined,
): Pick<PolicyFacts, "article13DisclosureSignals" | "discardedArticle13DisclosureSignals"> {
  const byType = new Map<string, PolicySurfaceObservation["article13DisclosureSignals"][number]>();
  const discardedArticle13DisclosureSignals = [...deterministic.discardedArticle13DisclosureSignals];
  for (const signal of [...deterministic.article13DisclosureSignals, ...(assisted?.article13DisclosureSignals ?? [])]) {
    const rejectReason = article13DisclosureRejectReason(signal.evidenceText ?? "", signal.disclosureType);
    if (rejectReason) {
      discardedArticle13DisclosureSignals.push({
        disclosureType: signal.disclosureType,
        evidenceText: signal.evidenceText,
        rejectReason,
        confidence: signal.confidence,
        source: signal.source,
      });
      continue;
    }
    const current = byType.get(signal.disclosureType);
    if (!current || article13SignalIsBetter(signal, current)) {
      byType.set(signal.disclosureType, signal);
    }
  }
  return {
    article13DisclosureSignals: [...byType.values()].slice(0, 12),
    discardedArticle13DisclosureSignals: [
      ...discardedArticle13DisclosureSignals,
      ...(assisted?.discardedArticle13DisclosureSignals ?? [])
    ].slice(0, 24),
  };
}

function article13SignalIsBetter(
  candidate: PolicySurfaceObservation["article13DisclosureSignals"][number],
  current: PolicySurfaceObservation["article13DisclosureSignals"][number],
) {
  if (candidate.status === "observed" && current.status !== "observed") return true;
  if (candidate.status !== "observed" && current.status === "observed") return false;
  if (candidate.confidence !== current.confidence) return candidate.confidence > current.confidence;
  if (candidate.selectedPolicySectionHeading && !current.selectedPolicySectionHeading) return true;
  if (candidate.selectedPolicySectionExcerpt && !current.selectedPolicySectionExcerpt) return true;
  return false;
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

type FetchTextResult = { documentFormat?: "pdf" | "text"; ok: boolean; status?: number; text: string };
type PdfParseConstructor = new (input: { data: Uint8Array }) => {
  destroy(): Promise<void>;
  getText(input: {
    first: number;
    imageBuffer: boolean;
    imageDataUrl: boolean;
    pageJoiner: string;
  }): Promise<{ text: string }>;
};

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
    const response = await fetch(url, {
      headers: {
        "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,application/pdf;q=0.8,*/*;q=0.7",
        "accept-language": "en-US,en;q=0.8,de;q=0.7,fr;q=0.7,es;q=0.7,it;q=0.7,nl;q=0.7,pl;q=0.7",
        "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36",
      },
      signal: controller.signal,
      redirect: "follow",
    });
    const contentType = response.headers.get("content-type") ?? "";
    const isTextResponse = /text|html|json/i.test(contentType);
    const isPdfResponse = isPdfPolicyResponse(url, contentType) && !isTextResponse;
    if (!response.ok || (!isTextResponse && !isPdfResponse)) {
      return { ok: response.ok, status: response.status, text: "" };
    }
    const contentLength = contentLengthFromHeader(response.headers.get("content-length"));
    if (isPdfResponse && contentLength !== undefined && contentLength > MAX_POLICY_PDF_BYTES) {
      return { ok: true, status: response.status, text: "" };
    }
    const body = new Uint8Array(await response.arrayBuffer());
    if (isPdfResponse) {
      return {
        documentFormat: "pdf",
        ok: true,
        status: response.status,
        text: await extractPdfPolicyText(body),
      };
    }
    return {
      documentFormat: "text",
      ok: true,
      status: response.status,
      text: boundedFetchedText(decodeFetchedPolicyText(body, contentType), MAX_FETCHED_TEXT_CHARS),
    };
  } catch {
    return { ok: false, text: "" };
  } finally {
    clearTimeout(timeout);
  }
}

function isPdfPolicyResponse(url: string, contentType: string): boolean {
  if (/application\/pdf|\bpdf\b/i.test(contentType)) {
    return true;
  }
  try {
    return /\.pdf$/i.test(new URL(url).pathname);
  } catch {
    return /\.pdf(?:[?#]|$)/i.test(url);
  }
}

function contentLengthFromHeader(value: string | null): number | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

async function extractPdfPolicyText(body: Uint8Array): Promise<string> {
  if (body.length === 0 || body.length > MAX_POLICY_PDF_BYTES) {
    return "";
  }
  const PDFParse = await loadPdfParser();
  if (!PDFParse) {
    return "";
  }
  const parser = new PDFParse({ data: body });
  try {
    const result = await parser.getText({
      first: MAX_POLICY_PDF_PAGES,
      pageJoiner: "\n",
      imageBuffer: false,
      imageDataUrl: false,
    });
    return normalizeWhitespace(result.text).slice(0, MAX_POLICY_PDF_TEXT_CHARS);
  } catch {
    return "";
  } finally {
    await parser.destroy().catch(() => undefined);
  }
}

async function loadPdfParser(): Promise<PdfParseConstructor | null> {
  try {
    const module = await import("pdf-parse");
    return module.PDFParse as PdfParseConstructor;
  } catch {
    return null;
  }
}

function decodeFetchedPolicyText(body: Uint8Array, contentType: string): string {
  const declaredCharset = charsetFromContentType(contentType);
  const decoded = decodeTextBody(body, declaredCharset ?? "utf-8");
  if (declaredCharset || replacementCharacterRatio(decoded) < 0.002) {
    return decoded;
  }
  const windowsDecoded = decodeTextBody(body, "windows-1252");
  return replacementCharacterRatio(windowsDecoded) < replacementCharacterRatio(decoded)
    ? windowsDecoded
    : decoded;
}

function charsetFromContentType(contentType: string): string | null {
  const match = /charset\s*=\s*["']?([^;"'\s]+)/i.exec(contentType);
  return match?.[1]?.trim().toLowerCase() ?? null;
}

function decodeTextBody(body: Uint8Array, charset: string): string {
  try {
    return new TextDecoder(charset).decode(body);
  } catch {
    return new TextDecoder("utf-8").decode(body);
  }
}

function replacementCharacterRatio(value: string): number {
  if (!value) {
    return 0;
  }
  return (value.match(/\uFFFD/g) ?? []).length / value.length;
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
  if (normalized.length <= MAX_EXCERPT_CHARS) {
    return normalized;
  }
  const lower = normalized.toLowerCase();
  const keyword = [...keywords, ...DEFAULT_POLICY_EXCERPT_KEYWORDS]
    .find((item) => lower.includes(item.toLowerCase()));
  const index = keyword ? Math.max(0, lower.indexOf(keyword.toLowerCase()) - 180) : 0;
  return normalized.slice(index, index + MAX_EXCERPT_CHARS);
}

function boundedPolicyAnalysisExcerpt(text: string): string {
  const normalized = normalizeWhitespace(text);
  if (normalized.length <= MAX_NANO_POLICY_ANALYSIS_EXCERPT_CHARS) {
    return normalized;
  }

  const sections: Array<{ label: string; patterns: RegExp[] }> = [
    {
      label: "policy_opening",
      patterns: [/privacy policy/i, /privacy notice/i, /effective/i, /last updated/i],
    },
    {
      label: "controller_contact",
      patterns: [/google llc/i, /google ireland limited/i, /data controller/i, /controller/i, /privacy@/i, /contact (?:us|our privacy team|google)/i, /questions about (?:this )?(?:policy|privacy)/i, /privacy office/i, /data protection office/i, /data protection officer/i, /\bdpo\b/i],
    },
    {
      label: "dpo_contact",
      patterns: [/data protection officer/i, /\bdpo\b/i, /data protection contact/i, /privacy contact/i],
    },
    {
      label: "processing_purposes",
      patterns: [/why (?:we|google|the company) (?:collects|uses|processes) data/i, /purpose(?:s)? (?:of|for|we|to)/i, /we (?:use|process|collect) (?:your )?(?:personal )?(?:data|information) (?:to|for)/i, /provide (?:our )?services/i, /personaliz[ea] (?:content|services|experience)/i],
    },
    {
      label: "legal_basis",
      patterns: [/legal basis/i, /lawful basis/i, /legitimate interests?/i, /performance of (?:a )?contract/i, /contractual necessity/i, /legal obligation/i, /public task/i, /vital interests?/i],
    },
    {
      label: "recipients_vendor_categories",
      patterns: [/recipients/i, /service providers/i, /processors/i, /vendors?/i, /partners/i, /affiliates/i, /third parties/i, /third-party/i, /advertising partners?/i, /analytics providers?/i, /sharing your information/i],
    },
    {
      label: "retention",
      patterns: [/retaining your information/i, /retention period/i, /retention criteria/i, /storage period/i, /retain.{0,120}(?:as long as necessary|required by law|for the purposes|until|unless|legal purposes|fraud|abuse)/i, /as long as necessary/i, /delete(?:d|s|tion)?|anonymi[sz]ed?|remove|expires?|kept for/i],
    },
    {
      label: "data_subject_rights",
      patterns: [/your privacy controls/i, /exporting.*deleting/i, /export|download a copy|google takeout|my activity/i, /delete (?:your )?(?:information|data|account)|remove (?:content|information|data)/i, /right to (?:access|delete|erase|erasure|rectif|object|restrict|port)/i, /rights? to (?:access|delete|erase|erasure|rectif|object|restrict|port)/i, /data subject rights/i, /exercise (?:your )?rights/i, /privacy controls/i],
    },
    {
      label: "international_transfers",
      patterns: [/data transfers?/i, /data transfer frameworks/i, /international transfer/i, /cross-border transfer/i, /servers around the world/i, /processed? (?:on servers )?outside (?:your )?country/i, /outside (?:of )?the country where you live/i, /(?:third parties|service providers?|business partners?|processors?|vendors?|recipients?).{0,220}outside (?:the )?(?:eea|european economic area|uk|united kingdom|eu|european union)/i, /agreements?.{0,220}(?:personal information|personal data|data|information).{0,220}(?:protect|protected|safeguard|outside (?:the )?(?:eea|european economic area|uk|united kingdom|eu|european union))/i, /legal frameworks? relating to the transfer of data/i, /data protection laws vary/i, /standard contractual clauses/i, /adequacy decision/i, /outside (?:the )?(?:eea|european economic area|uk|united kingdom|eu|european union)/i, /third countr(?:y|ies)/i, /data privacy framework|\bDPF\b|EU-U\.S\.|UK Extension|Swiss-U\.S\./i],
    },
    {
      label: "supervisory_authority",
      patterns: [/compliance (?:and|&) cooperation with regulators/i, /formal written complaints/i, /regulatory authorities/i, /local data protection authorities/i, /supervisory authority/i, /data protection authority/i, /unresolved complaints?/i, /regulator/i, /lodge a complaint/i, /complain to (?:a )?(?:regulator|authority)/i, /cooperation with regulators/i],
    },
    {
      label: "automated_decision_making_or_profiling",
      patterns: [/automated decision/i, /solely automated/i, /profiling/i, /meaningful information about the logic/i, /automated systems/i, /algorithms?/i, /recognize patterns/i, /personalized ads/i, /customi[sz]ed search results/i, /tailored/i],
    },
  ];

  const chunks: string[] = [];
  addPolicyAnalysisChunk(chunks, "policy_opening", normalized.slice(0, 6_000));
  for (const section of sections) {
    const chunk = boundedMatchedExcerptForPatterns(normalized, section.patterns)?.slice(0, 4_000);
    if (chunk) {
      addPolicyAnalysisChunk(chunks, section.label, chunk);
    }
  }

  const packet = uniqueStrings(chunks).join("\n\n");
  return packet.length > MAX_NANO_POLICY_ANALYSIS_EXCERPT_CHARS
    ? packet.slice(0, MAX_NANO_POLICY_ANALYSIS_EXCERPT_CHARS)
    : packet;
}

function addPolicyAnalysisChunk(chunks: string[], label: string, chunk: string): void {
  const normalized = normalizeWhitespace(chunk);
  if (!normalized) {
    return;
  }
  chunks.push(`[${label}]\n${normalized}`);
}

function boundedMatchedExcerptForPatterns(text: string, patterns: RegExp[]): string | undefined {
  const normalized = text.replace(/\s+/g, " ").trim();
  const matchIndexes = patterns
    .map((pattern) => {
      pattern.lastIndex = 0;
      return normalized.search(pattern);
    })
    .filter((index) => index >= 0);
  const matchIndex = matchIndexes.length > 0 ? Math.min(...matchIndexes) : undefined;
  if (matchIndex === undefined) {
    return undefined;
  }
  const index = Math.max(0, matchIndex - 500);
  return normalized.slice(index, index + 4_500);
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

function bestPolicyDocumentText(html: string, fallbackVisibleText: string): string {
  const candidates = [
    ...extractStructuredPolicyMetadataTexts(html),
    ...extractPolicyBodyCandidateTexts(html),
    htmlToVisibleText(stripPageChromeHtml(html)),
    fallbackVisibleText,
  ].filter((text) => text.length > 0);
  return candidates.reduce((best, candidate) =>
    shouldAdoptPolicyDocumentText(candidate, best) ? candidate : best,
  candidates[0] ?? fallbackVisibleText);
}

function extractPolicySections(input: {
  html: string;
  sourceUrl: string;
  visibleText: string;
}): RetainedPolicySection[] {
  const htmlSections = extractPolicySectionsFromHtml(input.html, input.sourceUrl);
  const fallbackSections = extractPolicySectionsFromVisibleText(input.visibleText, input.sourceUrl);
  const sections = htmlSections.length >= 3 ? htmlSections : fallbackSections;
  return sections
    .map((section) => ({
      ...section,
      heading: normalizeWhitespace(section.heading).slice(0, 160) || "Policy section",
      textExcerpt: normalizeWhitespace(section.textExcerpt).slice(0, 1_200),
    }))
    .filter((section) => section.textExcerpt.length >= 80)
    .slice(0, 80);
}

function extractPolicySectionsFromHtml(html: string, sourceUrl: string): RetainedPolicySection[] {
  const cleanHtml = stripPageChromeHtml(html);
  const headingPattern = /<(h[1-4]|[a-z][\w:-]*\b[^>]*(?:role=["']heading["']|aria-level=["'][1-4]["'])[^>]*)\b[^>]*>([\s\S]*?)<\/(?:h[1-4]|[a-z][\w:-]*)>/gi;
  const matches = Array.from(cleanHtml.matchAll(headingPattern)).map((match) => ({
    index: match.index ?? 0,
    raw: match[0] ?? "",
    heading: htmlToVisibleText(match[2] ?? ""),
  })).filter((match) => match.heading.length > 0);
  if (matches.length === 0) {
    return [];
  }
  return matches.map((match, index) => {
    const next = matches[index + 1]?.index ?? cleanHtml.length;
    const sectionHtml = cleanHtml.slice(match.index + match.raw.length, next);
    const text = htmlToVisibleText(sectionHtml);
    return {
      sourceUrl,
      heading: match.heading,
      textExcerpt: text,
      charStart: match.index,
      charEnd: next,
      quality: policySectionQuality(text),
    };
  });
}

function extractPolicySectionsFromVisibleText(visibleText: string, sourceUrl: string): RetainedPolicySection[] {
  const normalized = normalizeWhitespace(visibleText);
  const headings = [
    "Your privacy controls",
    "Exporting and deleting your information",
    "Exporting & deleting your information",
    "Retaining your information",
    "Compliance and cooperation with regulators",
    "Compliance & cooperation with regulators",
    "Automated systems",
    "European requirements",
    "Data transfers",
    "Legal basis",
    "Sharing your information",
    "Why Google collects data",
    "Information Google collects",
  ];
  const matches = headings.flatMap((heading) => {
    const escaped = escapeRegExp(heading).replace(/\\ and\\ |\\ &\\ /g, "(?: and | & )");
    const pattern = new RegExp(`\\b${escaped}\\b`, "gi");
    return Array.from(normalized.matchAll(pattern)).map((match) => ({
      heading,
      index: match.index ?? 0,
    }));
  }).sort((a, b) => a.index - b.index);
  const deduped = matches.filter((match, index) =>
    index === 0 || match.index !== matches[index - 1]?.index
  );
  if (deduped.length === 0) {
    return [{
      sourceUrl,
      heading: "Policy body",
      textExcerpt: normalized,
      charStart: 0,
      charEnd: normalized.length,
      quality: policySectionQuality(normalized),
    }];
  }
  return deduped.map((match, index) => {
    const nextIndex = deduped[index + 1]?.index ?? normalized.length;
    const text = normalized.slice(match.index, nextIndex);
    return {
      sourceUrl,
      heading: match.heading,
      textExcerpt: text,
      charStart: match.index,
      charEnd: nextIndex,
      quality: policySectionQuality(text),
    };
  });
}

function policySectionQuality(text: string): RetainedPolicySection["quality"] {
  const normalized = normalizeWhitespace(text);
  if (normalized.length >= 240 && /\b(?:we|you|your|our)\b/i.test(normalized) && /[.!?]/.test(normalized)) {
    return "strong";
  }
  return normalized.length >= 120 ? "partial" : "limited";
}

function retainedPolicySectionsForObservation(sections: RetainedPolicySection[]): RetainedPolicySection[] {
  return sections
    .filter((section) => section.quality !== "limited")
    .map((section) => ({
      ...section,
      textExcerpt: section.textExcerpt.slice(0, 1_200),
    }))
    .slice(0, 24);
}

function retainedArticle13SectionEvidenceFromSections(
  sections: RetainedPolicySection[],
  sourceUrl: string,
): RetainedArticle13SectionEvidence[] {
  return ARTICLE13_SECTION_PROFILES.flatMap((profile) => {
    const selected = bestSectionForProfile(sections, profile);
    if (!selected) {
      return [];
    }
    const excerpt = bestSectionExcerptForProfile(selected, profile);
    const signalObserved = sectionEvidenceStatus(profile, excerpt);
    return [{
      coverageArea: profile.disclosureType,
      selectedPolicySectionHeading: selected.heading,
      selectedPolicySectionExcerpt: excerpt.slice(0, 1_200),
      selectedPolicySectionUrl: selected.sourceUrl || sourceUrl,
      evidenceSource: "deterministic" as const,
      selectedEvidenceStrength: signalObserved === "observed" ? "strong" as const : signalObserved === "partial" ? "partial" as const : "limited" as const,
      signalObserved,
      extractionLimitation: signalObserved === "not_confirmed" ? "section_retained_without_row_specific_disclosure" : undefined,
    }];
  });
}

function bestSectionForProfile(
  sections: RetainedPolicySection[],
  profile: (typeof ARTICLE13_SECTION_PROFILES)[number],
): RetainedPolicySection | undefined {
  let best: { section: RetainedPolicySection; score: number } | undefined;
  for (const section of sections) {
    const haystack = `${section.heading}\n${section.textExcerpt}`;
    let score = 0;
    for (const pattern of profile.headingPatterns) {
      if (pattern.test(section.heading)) score += 6;
      pattern.lastIndex = 0;
    }
    for (const pattern of profile.textPatterns) {
      if (pattern.test(haystack)) score += 2;
      pattern.lastIndex = 0;
    }
    if (profile.observedPattern.test(section.textExcerpt)) score += 5;
    profile.observedPattern.lastIndex = 0;
    if (profile.partialPattern?.test(section.textExcerpt)) score += 3;
    if (profile.partialPattern) profile.partialPattern.lastIndex = 0;
    if (section.quality === "strong") score += 1;
    if (score > (best?.score ?? 0)) {
      best = { section, score };
    }
  }
  return best && best.score >= 3 ? best.section : undefined;
}

function bestSectionExcerptForProfile(
  section: RetainedPolicySection,
  profile: (typeof ARTICLE13_SECTION_PROFILES)[number],
): string {
  const text = normalizeWhitespace(section.textExcerpt);
  const patterns = [
    profile.observedPattern,
    ...(profile.partialPattern ? [profile.partialPattern] : []),
    ...profile.textPatterns,
  ];
  const excerpt = boundedExcerptForPatterns(text, patterns);
  return normalizeWhitespace(`${section.heading}. ${excerpt}`).slice(0, 1_200);
}

function sectionEvidenceStatus(
  profile: (typeof ARTICLE13_SECTION_PROFILES)[number],
  excerpt: string,
): RetainedArticle13SectionEvidence["signalObserved"] {
  if (profile.observedPattern.test(excerpt) && isArticle13DisclosureEvidenceUsable(excerpt, profile.disclosureType)) {
    profile.observedPattern.lastIndex = 0;
    return "observed";
  }
  profile.observedPattern.lastIndex = 0;
  if (profile.disclosureType === "data_subject_rights" && dataSubjectRightsKeywordCount(excerpt) >= 2) {
    return dataSubjectRightsKeywordCount(excerpt) >= 4 ? "observed" : "partial";
  }
  if (profile.partialPattern?.test(excerpt) && isArticle13DisclosureEvidenceUsable(excerpt, profile.disclosureType)) {
    profile.partialPattern.lastIndex = 0;
    return "partial";
  }
  if (profile.partialPattern) profile.partialPattern.lastIndex = 0;
  return "not_confirmed";
}

function dataSubjectRightsKeywordCount(value: string): number {
  const lower = value.toLowerCase();
  return [
    "update",
    "manage",
    "export",
    "delete",
    "request",
    "remove",
    "download",
    "access",
    "correct",
    "object",
    "restrict",
    "privacy controls",
  ].filter((keyword) => lower.includes(keyword)).length;
}

function extractPolicyBodyCandidateTexts(html: string): string[] {
  const blocks = [
    ...extractHtmlBlocks(html, "main"),
    ...extractHtmlBlocks(html, "article"),
    ...extractHtmlBlocks(html, "section")
      .filter((block) => /privacy|policy|notice|legal|rights|data|personal|content|article|main/i.test(block)),
    ...extractAttributedPolicyBlocks(html),
  ];
  return uniqueStrings(blocks.map((block) => htmlToVisibleText(stripPageChromeHtml(block))))
    .filter((text) => text.length >= 120);
}

function extractStructuredPolicyMetadataTexts(html: string): string[] {
  const texts: string[] = [];
  const scriptPattern = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = scriptPattern.exec(html))) {
    const attrs = match[1] ?? "";
    const rawScript = match[2] ?? "";
    const isJsonLd = /type=["']application\/ld\+json["']/i.test(attrs);
    if (!isJsonLd && !/\b(?:articleBody|privacyPolicy|privacyNotice)\b/i.test(rawScript.slice(0, 20_000))) {
      continue;
    }

    const parsed = parseJsonScriptPayload(rawScript);
    if (!parsed) {
      continue;
    }
    collectStructuredPolicyTextValues(parsed, texts);
  }

  return uniqueStrings(texts
    .map((text) => normalizeWhitespace(text).slice(0, MAX_POLICY_SURFACE_TEXT_ARTIFACT_CHARS))
    .filter((text) => text.length >= 120 && policyTextQualityScore(text) > Number.NEGATIVE_INFINITY)
    .sort((a, b) => policyTextQualityScore(b) - policyTextQualityScore(a)))
    .slice(0, 12);
}

function parseJsonScriptPayload(rawScript: string): unknown | undefined {
  const decoded = decodeBasicHtmlEntities(rawScript).trim();
  if (!decoded) {
    return undefined;
  }
  try {
    return JSON.parse(decoded);
  } catch {
    return undefined;
  }
}

function collectStructuredPolicyTextValues(value: unknown, texts: string[], keyHint = ""): void {
  if (typeof value === "string") {
    const normalized = normalizeWhitespace(value);
    if (
      normalized.length >= 120 &&
      /articleBody|description|text|body|privacy|policy|notice/i.test(keyHint) &&
      /\b(?:privacy|personal data|personal information|controller|processing|datenschutz|personenbezogene daten|confidentialit[ée]|donn[ée]es personnelles|privacidad|datos personales|dati personali|persoonsgegevens|dane osobowe|prywatno[śs]ci)\b/i.test(normalized)
    ) {
      texts.push(normalized);
    }
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectStructuredPolicyTextValues(item, texts, keyHint);
    }
    return;
  }

  if (!value || typeof value !== "object") {
    return;
  }

  for (const [key, child] of Object.entries(value)) {
    collectStructuredPolicyTextValues(child, texts, key);
  }
}

async function renderedPolicySemanticTextCandidates(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const selectors = [
      "main",
      "article",
      "[role='main']",
      "[id*='privacy' i]",
      "[class*='privacy' i]",
      "[id*='policy' i]",
      "[class*='policy' i]",
      "[id*='prywat' i]",
      "[class*='prywat' i]",
      "[id*='dane' i]",
      "[class*='dane' i]",
    ];
    const texts: string[] = [];
    for (const selector of selectors) {
      for (const element of Array.from(document.querySelectorAll(selector)).slice(0, 12)) {
        const text = (element as HTMLElement).innerText?.replace(/\s+/g, " ").trim();
        if (text && text.length >= 120) {
          texts.push(text);
        }
      }
    }
    return Array.from(new Set(texts)).slice(0, 24);
  }).catch(() => []);
}

function bestRenderedPolicyDocumentText(html: string, textCandidates: string[]): string {
  const bodyText = textCandidates.find((text) => normalizeWhitespace(text).length > 0) ?? "";
  if (!html) {
    return bodyText;
  }
  const candidates = [
    ...textCandidates,
    htmlToVisibleText(stripPageChromeHtml(html)),
  ].map(normalizeWhitespace).filter((text) => text.length > 0);
  if (candidates.length === 0) {
    return html;
  }
  return candidates.reduce((best, candidate) =>
    shouldAdoptPolicyDocumentText(candidate, best, { allowTopicDominant: true }) ? candidate : best,
  candidates[0] ?? html);
}

function shouldAdoptPolicyDocumentText(
  candidateText: string,
  currentText: string,
  options: { allowTopicDominant?: boolean } = {},
): boolean {
  const candidateScore = policyTextQualityScore(candidateText);
  const currentScore = policyTextQualityScore(currentText);
  if (candidateScore > currentScore + 8) {
    return true;
  }

  const candidateQuality = assessPolicyTextQuality(candidateText);
  const candidateTopicCount = gdprTransparencyTopicMatchCount(candidateText);
  const currentTopicCount = gdprTransparencyTopicMatchCount(currentText);
  if (
    options.allowTopicDominant &&
    candidateTopicCount > currentTopicCount &&
    normalizeWhitespace(candidateText).length > normalizeWhitespace(currentText).length * 3 &&
    candidateQuality.reason !== "low_quality_access_challenge"
  ) {
    return true;
  }
  if (!candidateQuality.usable) {
    return false;
  }
  return candidateTopicCount > currentTopicCount && candidateScore >= currentScore - 20;
}

function extractHtmlBlocks(html: string, tagName: string): string[] {
  const pattern = new RegExp(`<${tagName}\\b[\\s\\S]*?<\\/${tagName}>`, "gi");
  return Array.from(html.matchAll(pattern), (match) => match[0] ?? "");
}

function extractAttributedPolicyBlocks(html: string): string[] {
  const pattern = /<(div|section|article)\b[^>]*(?:id|class|role)=["'][^"']*(?:privacy|policy|notice|legal|article|main|content)[^"']*["'][^>]*>[\s\S]*?<\/\1>/gi;
  return Array.from(html.matchAll(pattern), (match) => match[0] ?? "");
}

function stripPageChromeHtml(html: string): string {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg\b[\s\S]*?<\/svg>/gi, " ")
    .replace(/<template\b[\s\S]*?<\/template>/gi, " ")
    .replace(/<iframe\b[\s\S]*?<\/iframe>/gi, " ")
    .replace(/<code\b[\s\S]*?<\/code>/gi, " ")
    .replace(/<pre\b[\s\S]*?<\/pre>/gi, " ")
    .replace(/<header\b[\s\S]*?<\/header>/gi, " ")
    .replace(/<nav\b[\s\S]*?<\/nav>/gi, " ")
    .replace(/<footer\b[\s\S]*?<\/footer>/gi, " ")
    .replace(/<aside\b[\s\S]*?<\/aside>/gi, " ");
}

function policyTextQualityScore(text: string): number {
  const normalized = normalizeWhitespace(text);
  const lower = normalized.toLowerCase();
  if (!normalized) {
    return Number.NEGATIVE_INFINITY;
  }
  const quality = assessPolicyTextQuality(normalized);
  let score = Math.min(normalized.length, 18_000) / 100;
  if (!quality.usable) {
    score -= 900;
  }
  score -= quality.codeSignalCount * 60;
  score -= Math.max(0, quality.codeSymbolRatio - 0.04) * 1_000;
  score += Math.min(quality.naturalLanguageSentenceCount, 8) * 8;
  score += quality.policyTermCount * 4;
  const article13Terms = [
    "personal data",
    "personal information",
    "controller",
    "legal basis",
    "lawful basis",
    "legitimate interests",
    "retain",
    "retention",
    "service providers",
    "processors",
    "rights",
    "access",
    "erasure",
    "standard contractual clauses",
    "supervisory authority",
    "data protection officer",
  ];
  for (const term of article13Terms) {
    if (lower.includes(term)) {
      score += 12;
    }
  }
  if (/\b(we|our)\s+(collect|use|process|share|disclose|retain)\b/i.test(normalized)) {
    score += 35;
  }
  if (/privacy\s+(center|preference|choices)|cookie preferences|manage privacy settings/i.test(normalized)) {
    score -= 25;
  }
  if (/repeated (header|footer) noise|global navigation|footer links about/i.test(normalized)) {
    score -= 80;
  }
  if (/processing error|loadnotices|privacy center.*error/i.test(normalized)) {
    score -= 120;
  }
  if (normalized.length < MIN_SUBSTANTIVE_POLICY_TEXT_CHARS) {
    score -= (MIN_SUBSTANTIVE_POLICY_TEXT_CHARS - normalized.length) / 45;
  }
  return score;
}

type PolicyTextQualityAssessment = {
  alphabeticWordRatio: number;
  codeSignalCount: number;
  codeSymbolRatio: number;
  naturalLanguageSentenceCount: number;
  policyTermCount: number;
  reason?: string;
  usable: boolean;
};

function assessPolicyTextQuality(value: string): PolicyTextQualityAssessment {
  const normalized = normalizeWhitespace(value);
  const emptyAssessment = {
    alphabeticWordRatio: 0,
    codeSignalCount: 0,
    codeSymbolRatio: 0,
    naturalLanguageSentenceCount: 0,
    policyTermCount: 0,
    reason: "empty_policy_text",
    usable: false
  };
  if (!normalized) {
    return emptyAssessment;
  }

  const lower = normalized.toLowerCase();
  const strongCodeSignals = [
    /this\.gbar_/i,
    /\bCONFIG:\s*\[\[\[/,
    /Copyright The Closure Library/i,
    /SPDX-License-Identifier/i,
    /\b(?:var|const|let)\s+[A-Za-z_$][\w$]*\s*=/,
    /function\s*\(/,
    /=>/,
    /_\.[A-Za-z_$][\w$]*\s*=/,
    /Object\.definePropert(?:y|ies)/,
    /(?:^|[;{])\s*[A-Za-z_$][\w$]*\s*:\s*function\b/
  ];
  const codeSignalCount = strongCodeSignals.reduce((count, pattern) => count + (pattern.test(normalized) ? 1 : 0), 0);
  const codeSymbolCount = (normalized.match(/[{}[\];=<>]/g) ?? []).length;
  const codeSymbolRatio = codeSymbolCount / Math.max(normalized.length, 1);
  const escapedUrlCount = (normalized.match(/\\x2f|\\u003c|\\u003e|https?:\\\/\\\//gi) ?? []).length;
  const minifiedTokenCount = (normalized.match(/[A-Za-z_$][\w$]{0,8}\s*[=:]\s*\S{40,}/g) ?? [])
    .filter((token) => !/https?:\/\//i.test(token))
    .length;
  const totalTokens = normalized.split(/\s+/).filter(Boolean).length;
  const alphabeticWords = normalized.match(/[\p{L}][\p{L}'-]{2,}/gu) ?? [];
  const alphabeticWordRatio = alphabeticWords.length / Math.max(totalTokens, 1);
  const naturalLanguageSentenceCount = (normalized.match(/\b(?:we|you|your|our|users?|individuals?|customers?|visitors?|people)\b[^.!?]{20,}[.!?]/gi) ?? []).length;
  const policyTermCount = uniqueStrings((lower.match(new RegExp([
    "\\b(?:privacy|collect|use|information|personal data|personal information|data|retain|delete|share|rights|contact|transfer|consent|controller|processor|legal basis|lawful basis)\\b",
    "\\b(?:datenschutz|personenbezogene daten|einwilligung|verarbeitung|aufsichtsbehörde)\\b",
    "\\b(?:confidentialité|données personnelles|traitement|consentement|droits|responsable du traitement)\\b",
    "\\b(?:privacidad|datos personales|tratamiento|consentimiento|derechos|responsable del tratamiento)\\b",
    "\\b(?:privacy|dati personali|trattamento|consenso|diritti|titolare del trattamento)\\b",
    "\\b(?:privacy|persoonsgegevens|avg|verwerking|toestemming|rechten|verwerkingsverantwoordelijke)\\b",
    "\\b(?:prywatność|dane osobowe|rodo|przetwarzanie|zgoda|prawa|administrator danych)\\b",
  ].join("|"), "g")) ?? [])).length;
  const topicMatchCount = gdprTransparencyTopicMatchCount(normalized);
  const accessChallengeSignals = [
    /\bclient challenge\b/i,
    /\ba required part of this site couldn[’']t load\b/i,
    /\bdisable any ad blockers\b/i,
    /\bplease check your connection\b/i,
    /\bentrez les caract[èe]res affich[ée]s\b/i,
    /\bt[ée]l[ée]charger le captcha audio\b/i,
    /\bcaptcha\b/i,
  ].filter((pattern) => pattern.test(normalized)).length;

  let reason: string | undefined;
  if (accessChallengeSignals >= 2) {
    reason = "low_quality_access_challenge";
  } else if (/\bthis\.gbar_|\bCONFIG:\s*\[\[\[|Copyright The Closure Library|SPDX-License-Identifier/i.test(normalized)) {
    reason = "low_quality_extracted_code_or_config";
  } else if (codeSignalCount >= 2 && naturalLanguageSentenceCount < 3) {
    reason = "low_quality_extracted_code_or_config";
  } else if (codeSymbolRatio > 0.12 && naturalLanguageSentenceCount < 4) {
    reason = "low_quality_extracted_code_or_config";
  } else if (escapedUrlCount >= 8 && naturalLanguageSentenceCount < 3) {
    reason = "low_quality_extracted_code_or_config";
  } else if (minifiedTokenCount >= 2 && naturalLanguageSentenceCount < 4) {
    reason = "low_quality_extracted_code_or_config";
  } else if (normalized.length >= 500 && alphabeticWordRatio < 0.42) {
    reason = "low_quality_extracted_code_or_config";
  } else if (normalized.length >= 500 && policyTermCount < 2 && topicMatchCount < 1 && naturalLanguageSentenceCount < 2) {
    reason = "low_quality_non_policy_text";
  }

  return {
    alphabeticWordRatio,
    codeSignalCount,
    codeSymbolRatio,
    naturalLanguageSentenceCount,
    policyTermCount,
    reason,
    usable: !reason
  };
}

function gdprTransparencyTopicMatchCount(text: string): number {
  return classifyGdprTransparencyTopics({
    text: normalizeWhitespace(text).slice(0, MAX_NANO_POLICY_ANALYSIS_EXCERPT_CHARS),
  }).matches.length;
}

function isArticle13DisclosureEvidenceUsable(
  value: string,
  disclosureType: PolicySurfaceObservation["article13DisclosureSignals"][number]["disclosureType"]
) {
  return sharedArticle13DisclosureRejectReason(value, disclosureType, { mode: "scan_core" }) === null;
}

function article13DisclosureRejectReason(
  value: string,
  disclosureType: PolicySurfaceObservation["article13DisclosureSignals"][number]["disclosureType"]
): PolicySurfaceObservation["discardedArticle13DisclosureSignals"][number]["rejectReason"] | null {
  return sharedArticle13DisclosureRejectReason(value, disclosureType, { mode: "scan_core" });
}

function looksLikePrivacyCenterShell(text: string): boolean {
  const normalized = normalizeWhitespace(text);
  if (normalized.length < MIN_SUBSTANTIVE_POLICY_TEXT_CHARS) {
    return /privacy\s+(center|settings|choices)|cookie preferences|manage privacy|processing error|datenschutzhinweis|datenschutzerkl[aä]rung|polityka prywatno[śs]ci/i.test(normalized);
  }
  return /processing error|loadnotices|privacy center.*error/i.test(normalized);
}

function shouldFollowCanonicalPolicyDocumentLink(html: string, baseUrl: string, currentText: string): boolean {
  if (looksLikePrivacyCenterShell(currentText)) {
    return true;
  }
  const normalized = normalizeWhitespace(currentText);
  if (normalized.length >= MIN_SUBSTANTIVE_POLICY_TEXT_CHARS) {
    return false;
  }
  return canonicalPolicyDocumentUrlsFromHtml(html, baseUrl).length > 0;
}

async function fetchBestCanonicalPolicyDocumentText(input: {
  html: string;
  baseUrl: string;
  currentText: string;
  timeoutMs: number;
}): Promise<string | undefined> {
  const urls = canonicalPolicyDocumentUrlsFromHtml(input.html, input.baseUrl);
  let bestText: string | undefined;
  let bestScore = policyTextQualityScore(input.currentText);

  for (const url of urls.slice(0, MAX_CANONICAL_POLICY_LINK_FETCHES)) {
    const fetched = await fetchText(url, Math.max(800, Math.min(2_000, input.timeoutMs)));
    if (!fetched.ok) {
      continue;
    }
    const text = bestPolicyDocumentText(fetched.text, htmlToVisibleText(fetched.text));
    const score = policyTextQualityScore(text);
    if (score > bestScore) {
      bestScore = score;
      bestText = text;
    }
  }

  return bestText;
}

function canonicalPolicyDocumentUrlsFromHtml(html: string, baseUrl: string): string[] {
  const anchors: Array<{ url: string; score: number }> = [];
  const anchorPattern = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = anchorPattern.exec(html))) {
    const attrs = match[1] ?? "";
    const href = attr(attrs, "href");
    if (!href) {
      continue;
    }
    const normalizedUrl = normalizeUrl(href, baseUrl);
    if (!normalizedUrl || normalizedUrl === baseUrl) {
      continue;
    }
    const linkText = htmlToVisibleText(match[2] ?? "");
    const haystack = `${linkText} ${normalizedUrl}`;
    if (!canonicalPrivacyDocumentPattern().test(haystack)) {
      continue;
    }
    if (/privacy\s+(center|settings|choices)|preference|cookie|cookies|do-not-sell|opt-out|unsubscribe|zgody|ustawienia|preferencje/i.test(haystack)) {
      continue;
    }
    if (!isFetchablePolicyUrlForPolicySurface(baseUrl, normalizedUrl, "privacy_policy")) {
      continue;
    }
    let score = 1;
    if (/privacy\s+policy/i.test(linkText)) score += 4;
    if (/datenschutzhinweis|datenschutzerkl[aä]rung|polityka prywatno[śs]ci|pol[ií]tica de privacidad/i.test(linkText)) score += 4;
    if (/\/privacy-policy\/?$/i.test(normalizedUrl)) score += 4;
    if (/\/privacy-notice\/?$/i.test(normalizedUrl)) score += 3;
    if (/datenschutzhinweis|datenschutzerklaerung|datenschutzerklärung|polityka-prywatno(?:sci|ści)|proteccion|protección/i.test(normalizedUrl)) score += 3;
    if (sameOrigin(baseUrl, normalizedUrl)) score += 2;
    anchors.push({ url: normalizedUrl, score });
  }
  return uniqueStrings(anchors
    .sort((a, b) => b.score - a.score)
    .map((anchor) => anchor.url));
}

function canonicalPrivacyDocumentPattern(): RegExp {
  return /privacy\s+(policy|notice|statement)|\/privacy-policy\b|\/privacy-notice\b|\/privacy\b|datenschutzhinweis|datenschutzerkl[aä]rung|polityka prywatno[śs]ci|polityka-prywatno(?:sci|ści)|pol[ií]tica de privacidad|protecci[oó]n de datos|proteccion\.html|informativa (?:sulla )?privacy|privacybeleid|privacyverklaring/i;
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
  return normalizeWhitespace(decodeBasicHtmlEntities(html
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg\b[\s\S]*?<\/svg>/gi, " ")
    .replace(/<template\b[\s\S]*?<\/template>/gi, " ")
    .replace(/<iframe\b[\s\S]*?<\/iframe>/gi, " ")
    .replace(/<code\b[\s\S]*?<\/code>/gi, " ")
    .replace(/<pre\b[\s\S]*?<\/pre>/gi, " ")
    .replace(/<[^>]+>/g, " ")));
}

function decodeBasicHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&apos;|&#39;|&#x27;/gi, "'")
    .replace(/&quot;|&#34;|&#x22;/gi, "\"")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
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

function boundedFetchedText(value: string, maxChars: number): string {
  if (value.length <= maxChars) {
    return value;
  }
  const privacySurfaceIndex = anchoredPrivacySurfaceIndex(value, maxChars);
  if (privacySurfaceIndex === undefined) {
    const headChars = Math.floor(maxChars * 0.65);
    const tailChars = Math.max(0, maxChars - headChars);
    return `${value.slice(0, headChars)}\n\n[CertScore retained tail of oversized response for footer policy discovery.]\n\n${value.slice(value.length - tailChars)}`;
  }

  const headChars = Math.floor(maxChars * 0.4);
  const tailChars = Math.floor(maxChars * 0.3);
  const middleChars = Math.max(0, maxChars - headChars - tailChars);
  const middleStart = Math.max(0, privacySurfaceIndex - Math.floor(middleChars / 2));
  const middleEnd = Math.min(value.length, middleStart + middleChars);
  return retainedResponseRanges(value, [
    [0, headChars],
    [middleStart, middleEnd],
    [Math.max(0, value.length - tailChars), value.length],
  ]);
}

function anchoredPrivacySurfaceIndex(value: string, maxChars: number): number | undefined {
  const lowerValue = value.toLowerCase();
  const headEnd = Math.floor(maxChars * 0.65);
  const tailStart = value.length - Math.max(0, maxChars - headEnd);
  const terms = [
    "privacy policy",
    "privacy notice",
    "privacy statement",
    "cookie policy",
    "cookie notice",
    "datenschutzerklärung",
    "datenschutzinformation",
    "datenschutz",
    "politique de confidentialité",
    "confidentialité",
    "política de privacidad",
    "informativa sulla privacy",
    "privacybeleid",
    "polityka prywatności",
  ];

  for (const term of terms) {
    let index = lowerValue.indexOf(term, headEnd);
    while (index >= 0 && index < tailStart) {
      const anchorStart = lowerValue.lastIndexOf("<a", index);
      const anchorEnd = lowerValue.indexOf("</a>", index);
      if (
        anchorStart >= 0 &&
        index - anchorStart <= 800 &&
        anchorEnd >= 0 &&
        anchorEnd - index <= 800
      ) {
        return index;
      }
      index = lowerValue.indexOf(term, index + term.length);
    }
  }

  return undefined;
}

function retainedResponseRanges(value: string, ranges: Array<[number, number]>): string {
  const normalizedRanges = ranges
    .map(([start, end]) => [Math.max(0, start), Math.min(value.length, end)] as [number, number])
    .filter(([start, end]) => end > start)
    .sort(([leftStart], [rightStart]) => leftStart - rightStart);
  const mergedRanges: Array<[number, number]> = [];

  for (const [start, end] of normalizedRanges) {
    const previous = mergedRanges[mergedRanges.length - 1];
    if (previous && start <= previous[1]) {
      previous[1] = Math.max(previous[1], end);
      continue;
    }
    mergedRanges.push([start, end]);
  }

  return mergedRanges
    .map(([start, end], index) => {
      const prefix = index === 0
        ? ""
        : "\n\n[CertScore retained middle/tail of oversized response for policy-surface discovery.]\n\n";
      return `${prefix}${value.slice(start, end)}`;
    })
    .join("");
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

function isPlaceholderHref(href: string): boolean {
  const trimmed = href.trim();
  return trimmed === "#" || /^javascript:/i.test(trimmed);
}

function isExternalPoweredByAttributionLink(baseUrl: string, url: string, label: string): boolean {
  if (sameOrigin(baseUrl, url) || !/\bpowered by\b/i.test(label)) {
    return false;
  }

  return !/\b(?:privacy|cookie)\s+(?:policy|notice|statement)\b/i.test(label);
}

function isExternalUrlOnlyPolicyCandidate(
  baseUrl: string,
  url: string,
  label: string,
  surfaceType: PolicySurfaceObservation["surfaceType"],
): boolean {
  if (
    sameOrigin(baseUrl, url) ||
    !["privacy_policy", "cookie_policy"].includes(surfaceType)
  ) {
    return false;
  }

  return /^https?:\/\//i.test(label.trim());
}

export function isFetchablePolicyUrlForPolicySurface(
  baseUrl: string,
  url: string,
  surfaceType?: PolicySurfaceObservation["surfaceType"],
): boolean {
  if (sameOrigin(baseUrl, url)) {
    return true;
  }
  if (surfaceType === "terms") {
    return /terms|legal|conditions|user-agreement|service-agreement/i.test(url);
  }
  return /privacy|consent|onetrust|cookiebot|didomi|trustarc|datenschutz|confidentialit[eé]|privacidad|informativa|privacybeleid|privacyverklaring|prywatno(?:sc|sci|ść|ści)|polityka-prywatno(?:sci|ści)|poufnosc|poufność/i.test(url);
}

export function isFetchablePolicyHrefForPolicySurface(
  baseUrl: string,
  href: string,
  normalizedUrl: string,
  surfaceType?: PolicySurfaceObservation["surfaceType"],
): boolean {
  if (isFetchablePolicyUrlForPolicySurface(baseUrl, normalizedUrl, surfaceType)) {
    return true;
  }
  try {
    const originalUrl = new URL(href, baseUrl).toString();
    return isFetchablePolicyUrlForPolicySurface(baseUrl, originalUrl, surfaceType);
  } catch {
    return isFetchablePolicyUrlForPolicySurface(baseUrl, href, surfaceType);
  }
}

export function isFetchablePolicyCandidateForPolicySurface(input: {
  baseUrl: string;
  href: string;
  normalizedUrl: string;
  surfaceType?: PolicySurfaceObservation["surfaceType"];
  matchStrength?: PrivacySurfaceMatchStrength;
  linkText: string;
}): boolean {
  if (isFetchablePolicyHrefForPolicySurface(
    input.baseUrl,
    input.href,
    input.normalizedUrl,
    input.surfaceType,
  )) {
    return true;
  }

  if (
    !["privacy_policy", "cookie_policy"].includes(input.surfaceType ?? "unknown") ||
    input.matchStrength !== "direct"
  ) {
    return false;
  }

  const label = input.linkText.trim();
  return Boolean(label) && !/^https?:\/\//i.test(label);
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
