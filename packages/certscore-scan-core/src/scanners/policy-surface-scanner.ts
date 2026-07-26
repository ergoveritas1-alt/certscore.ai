import {
  type ArtifactRef,
  article13DisclosureRejectReason as sharedArticle13DisclosureRejectReason,
  classifyGdprTransparencyTopics,
  classifyPrivacySurface,
  type DirectVsInferred,
  type EvidenceRef,
  type PolicyCookieDisclosureObservation,
  type PolicySurfaceObservation,
  type PrivacySurfaceClassification,
  type PrivacySurfaceMatchStrength,
  PRIVACY_EVIDENCE_LOCALE_REGISTRY,
  privacySurfacePathsForLocale,
  type ScanModuleRun,
  type SupportedPrivacyEvidenceLocale,
} from "@certscore/contracts";
import { chromium, type Browser, type Page } from "playwright";
import { Resolver } from "node:dns/promises";
import { isIP } from "node:net";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import {
  brotliDecompressSync,
  gunzipSync,
  inflateSync,
} from "node:zlib";
import type { ArtifactWriter } from "../artifact-writer.js";
import { chromiumContextOptions, chromiumLaunchOptions } from "../playwright-runtime.js";
import { abortReason, boundedCleanup, throwIfAborted } from "../abort.js";
import { getRegistrableDomainFromUrl } from "../domain-utils.js";
import { httpTransportFallbackUrl } from "../transport-fallback.js";

const SOURCE_SCANNER = "policy_surface";
const SCENARIO = "policy_surface_review";
const MAX_CANDIDATES_TO_FETCH = 8;
const MAX_COMMON_PATH_CANDIDATES_TO_FETCH = 8;
const MAX_RENDERED_COMMON_PATH_LOW_QUALITY_FALLBACKS = 2;
const MAX_RENDERED_COMMON_PATH_FAILED_FETCH_FALLBACKS = 4;
const MAX_SECONDARY_CANDIDATES_TO_FETCH = 5;
const MAX_FAST_SECONDARY_CANDIDATES_TO_FETCH = 2;
const POLICY_FETCH_CONCURRENCY = 4;
const POLICY_RENDERED_FETCH_CONCURRENCY = 1;
const POLICY_FETCH_TIMEOUT_MS = 5_000;
// The policy module already has a five-second hard-deadline reserve. Use part
// of that existing reserve for one strong, actually observed privacy link
// that reached evaluation just after the soft budget; this does not extend
// the module's outer deadline or broaden common-path guessing.
const POLICY_PROTECTED_OBSERVED_FETCH_TIMEOUT_MS = 1_800;
const POLICY_PROTECTED_RENDERED_FETCH_TIMEOUT_MS = 2_200;
const POLICY_PROTECTED_RESERVE_MS = 4_500;
// Text resolution for a warmed policy document can legitimately consume most
// of eight seconds on a large notice. Preserve a bounded publication window so
// already-fetched evidence is not replaced by `skipped_budget` immediately
// before its observation is assembled.
const POLICY_CANDIDATE_PROCESSING_TIMEOUT_MS = 12_000;
const POLICY_FAST_RENDERED_DISCOVERY_TIMEOUT_MS = 10_000;
const MAX_RENDERED_POLICY_DISCOVERY_ELEMENTS = 1_000;
const MAX_RENDERED_POLICY_DISCOVERY_HTML_CHARS = 500_000;
const MAX_RENDERED_POLICY_DISCOVERY_TEXT_CHARS = 100_000;
export const POLICY_HOMEPAGE_FETCH_TIMEOUT_MS = 5_000;
const MAX_EXCERPT_CHARS = 6_000;
const MAX_NANO_POLICY_ANALYSIS_EXCERPT_CHARS = 40_000;
const MIN_SUBSTANTIVE_POLICY_TEXT_CHARS = 2_500;
const MAX_CANONICAL_POLICY_LINK_FETCHES = 2;
const MAX_POLICY_SURFACE_TEXT_ARTIFACT_CHARS = 256_000;
const MAX_POLICY_SURFACE_TEXT_ARTIFACT_TOTAL_CHARS = 1_000_000;
const MAX_FETCHED_TEXT_CHARS = 500_000;
const MAX_POLICY_TEXT_RESPONSE_BYTES = 2_500_000;
const MAX_POLICY_DECOMPRESSED_BYTES = 2_500_000;
const MAX_POLICY_PDF_BYTES = 2_500_000;
const MAX_POLICY_PDF_PAGES = 12;
const MAX_POLICY_PDF_TEXT_CHARS = 500_000;
const MAX_POLICY_FETCH_DIAGNOSTICS = 32;
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
  absoluteDeadlineAtMs?: number;
  artifactWriter: ArtifactWriter;
  browser?: Browser;
  enableNanoPolicyAssist?: boolean;
  nanoAssistProvider?: PolicyNanoAssistProvider;
  policySurfaceSeeds?: Array<{
    confidence?: number;
    hintType: string;
    source: "prior_scan_hint" | "canonical_legal_surface_hint";
    url: string;
  }>;
  discoveryMode?: "full" | "fast";
  signal?: AbortSignal;
}

export interface PolicySurfaceScannerResult {
  moduleRun: ScanModuleRun;
  policySurfaceObservations: PolicySurfaceObservation[];
  artifactRefs: ArtifactRef[];
}

export type RetainedRenderedPolicyLink = {
  domLocation: "footer" | "header" | "nav" | "body";
  href: string;
  linkText: string;
  pageUrl: string;
  selector?: string;
};

export function policySurfaceObservationsFromRetainedRenderedLinks(input: {
  links: RetainedRenderedPolicyLink[];
  evidenceRef?: EvidenceRef;
}): PolicySurfaceObservation[] {
  const observations = policySurfaceCandidatesFromRetainedRenderedLinks(input.links).map((candidate) =>
    observationFromCandidate(candidate, {
      status: "observed",
      confidence: Math.max(
        candidate.deterministicMatchStrength === "direct" ? 0.9 : 0.72,
        candidate.deterministicScore,
      ),
      evidenceRefs: input.evidenceRef ? [input.evidenceRef] : [],
    })
  );
  const combinedAliases = privacyAliasesForCombinedPrivacyCookieSurfaces(observations);
  return mergePolicySurfaceObservations([], [...observations, ...combinedAliases]);
}

function policySurfaceCandidatesFromRetainedRenderedLinks(
  links: RetainedRenderedPolicyLink[],
  observationOnly = true,
): PolicySurfaceCandidate[] {
  return links.flatMap((link, index): PolicySurfaceCandidate[] => {
    const deterministic = classifySurface({ linkText: link.linkText, url: link.href });
    if (deterministic.surfaceType === "unknown" || deterministic.score <= 0.2) return [];
    const candidate: PolicySurfaceCandidate = {
      candidateId: `policy_preconsent_rendered_candidate_${index}`,
      url: link.href,
      normalizedUrl: link.href,
      linkText: link.linkText || link.href,
      selector: link.selector,
      domLocation: link.domLocation,
      sameOrigin: sameOrigin(link.pageUrl, link.href),
      fetchable: true,
      clickable: true,
      mayLeadToConsentControls: isPreferenceControlSurface(deterministic.surfaceType, link.linkText),
      observationOnly,
      deterministicSurfaceType: deterministic.surfaceType,
      deterministicScore: deterministic.score,
      deterministicKeywordMatches: deterministic.keywords,
      ...classifierCandidateFields(deterministic),
      discoveryMethod: link.domLocation === "footer"
        ? "footer_link"
        : link.domLocation === "header" || link.domLocation === "nav"
          ? "header_link"
          : "page_text_link",
    };
    return [candidate];
  });
}

export function mergePolicySurfaceObservations(
  primary: PolicySurfaceObservation[],
  supplemental: PolicySurfaceObservation[],
): PolicySurfaceObservation[] {
  const merged = new Map<string, PolicySurfaceObservation>();
  for (const observation of [...primary, ...supplemental]) {
    const key = policySurfaceObservationKey(observation);
    const existing = merged.get(key);
    if (!existing || policyObservationRank(observation) > policyObservationRank(existing)) {
      merged.set(key, observation);
    }
  }
  return [...merged.values()];
}

export function countRecoveredPolicySurfaceObservations(
  primary: PolicySurfaceObservation[],
  supplemental: PolicySurfaceObservation[],
): number {
  const confirmedPrimaryKeys = new Set(
    primary
      .filter((observation) => observation.status === "observed" || observation.status === "fetched")
      .map(policySurfaceObservationKey),
  );
  return new Set(
    supplemental
      .filter((observation) => !confirmedPrimaryKeys.has(policySurfaceObservationKey(observation)))
      .map(policySurfaceObservationKey),
  ).size;
}

function policySurfaceObservationKey(observation: PolicySurfaceObservation): string {
  return `${observation.surfaceType}:${canonicalPolicyUrlIdentity(observation.normalizedUrl ?? observation.url)}`;
}

function policyObservationRank(observation: PolicySurfaceObservation): number {
  const statusRank: Record<PolicySurfaceObservation["status"], number> = {
    fetched: 7,
    observed: 6,
    candidate: 5,
    assisted_candidate: 4,
    failed: 3,
    skipped_budget: 2,
    not_observed: 1,
  };
  return statusRank[observation.status] * 10 + observation.confidence;
}

export interface PolicyNanoAssistProvider {
  classifyLinks?(input: NanoLinkClassificationInput): Promise<NanoLinkClassificationResult>;
  extractTopics?(input: NanoTopicExtractionInput): Promise<NanoTopicExtractionResult>;
}

export interface NanoLinkClassificationInput {
  assistId: string;
  pageUrl: string;
  candidates: PolicySurfaceCandidate[];
  signal?: AbortSignal;
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
  signal?: AbortSignal;
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
  seedSource?: "prior_scan_hint" | "canonical_legal_surface_hint";
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

interface PolicyDocumentFetchCaches {
  browserRuntime: PolicyBrowserRuntime;
  diagnostics: PolicyFetchDiagnosticsCollector;
  direct: Map<string, Promise<FetchTextResult>>;
  rendered: Map<string, Promise<FetchTextResult>>;
  runRenderedFetch: <T>(run: () => Promise<T>) => Promise<T>;
}

type PolicyFetchAttemptOutcome =
  | "fetched"
  | "content_decoding_failed"
  | "decompressed_body_too_large"
  | "http_error"
  | "network_error"
  | "timeout"
  | "unsupported_content_type"
  | "oversized_pdf"
  | "empty_rendered_body"
  | "navigation_no_response";

interface PolicyFetchAttemptDiagnostic {
  mode: "direct" | "rendered";
  requestedUrl: string;
  finalUrl?: string;
  outcome: PolicyFetchAttemptOutcome;
  httpStatus?: number;
  contentType?: string;
  contentEncoding?: string;
  compressedSizeBytes?: number;
  decompressedSizeBytes?: number;
  decodingOutcome?: "identity" | "gzip" | "br" | "deflate" | "failed" | "too_large";
}

interface PolicyFetchDiagnostic {
  stage: "homepage" | "candidate_direct" | "candidate_rendered";
  candidateUrl?: string;
  discoveryMethod?: PolicySurfaceObservation["discoveryMethod"];
  surfaceType?: PolicySurfaceObservation["surfaceType"];
  ok: boolean;
  httpStatus?: number;
  failureReason?: Exclude<PolicyFetchAttemptOutcome, "fetched">;
  attempts: PolicyFetchAttemptDiagnostic[];
}

interface PolicyFetchDiagnosticsCollector {
  homepageFetch?: PolicyFetchDiagnostic;
  failedFetches: PolicyFetchDiagnostic[];
  successfulFetches: PolicyFetchDiagnostic[];
  protectedObservedFetchAttempts: number;
  renderedRecoveryAttempts: number;
  renderedRecoverySuccesses: number;
  seenFailureKeys: Set<string>;
}

export function canonicalWwwPolicyUrlVariant(value: string) {
  try {
    const variant = new URL(value);
    if (variant.protocol !== "https:" || variant.hostname.startsWith("www.") || variant.hostname.split(".").length !== 2) {
      return null;
    }
    variant.hostname = `www.${variant.hostname}`;
    return variant.toString();
  } catch {
    return null;
  }
}

interface PolicyBrowserRuntime {
  close(): Promise<void>;
  getBrowser(): Promise<Browser>;
}

export async function policySurfaceScanner(
  input: PolicySurfaceScannerInput,
): Promise<PolicySurfaceScannerResult> {
  const parentSignal = input.signal;
  throwIfAborted(parentSignal);
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
  const policyFetchDiagnostics: PolicyFetchDiagnosticsCollector = {
    failedFetches: [],
    successfulFetches: [],
    protectedObservedFetchAttempts: 0,
    renderedRecoveryAttempts: 0,
    renderedRecoverySuccesses: 0,
    seenFailureKeys: new Set(),
  };
  const policyBrowserRuntime = createPolicyBrowserRuntime(input.browser);
  let policyModuleDeadlineReached = false;
  let externalPolicyDeadlineReached = false;
  const hasExternalPolicyDeadline = input.absoluteDeadlineAtMs !== undefined;
  const policyDeadlineAtMs = Math.max(
    moduleStartedAtMs + 10,
    Math.min(
      input.absoluteDeadlineAtMs ?? moduleStartedAtMs + input.internalBudgetMs + 5_000,
      moduleStartedAtMs + input.internalBudgetMs + 5_000,
    ),
  );
  const policyModuleDeadlineMs = Math.max(10, policyDeadlineAtMs - moduleStartedAtMs);
  const policyDeadlineController = new AbortController();
  input = {
    ...input,
    absoluteDeadlineAtMs: input.absoluteDeadlineAtMs === undefined ? undefined : policyDeadlineAtMs,
    signal: combineAbortSignals(parentSignal, policyDeadlineController.signal),
  };
  const policyModuleDeadlineTimer = setTimeout(() => {
    policyModuleDeadlineReached = true;
    if (hasExternalPolicyDeadline) {
      externalPolicyDeadlineReached = true;
      policyDeadlineController.abort(new Error(
        `Policy-surface lane reached its absolute ${policyModuleDeadlineMs}ms deadline; retained evidence is coverage-limited.`,
      ));
    }
    void policyBrowserRuntime.close();
  }, policyModuleDeadlineMs);
  const abortPolicyRuntime = () => {
    policyModuleDeadlineReached = true;
    void policyBrowserRuntime.close();
  };
  input.signal?.addEventListener("abort", abortPolicyRuntime, { once: true });
  const completedPolicyModuleRun = () => {
    if (hasExternalPolicyDeadline && Date.now() >= policyDeadlineAtMs) {
      policyModuleDeadlineReached = true;
      return moduleRun(
        observations.length > 0 ? "partial" : "skipped_budget",
        moduleStartedAt,
        moduleStartedAtMs,
        [`Policy-surface lane reached its absolute ${policyModuleDeadlineMs}ms deadline; retained evidence is coverage-limited.`],
        timingBreakdown,
      );
    }
    return moduleRun("completed", moduleStartedAt, moduleStartedAtMs, [], timingBreakdown);
  };
  const policyDocumentFetchCaches: PolicyDocumentFetchCaches = {
    browserRuntime: policyBrowserRuntime,
    diagnostics: policyFetchDiagnostics,
    direct: new Map(),
    rendered: new Map(),
    runRenderedFetch: createConcurrencyLimiter(POLICY_RENDERED_FETCH_CONCURRENCY),
  };

  try {
    const seededCandidates = policySurfaceSeedCandidatesFor(input);
    const homepage = await recordPolicyTiming(
      timingBreakdown,
      "homepage fetch",
      "Fetch homepage HTML for static policy link discovery.",
      () => fetchText(
        input.normalizedUrl,
        Math.min(POLICY_HOMEPAGE_FETCH_TIMEOUT_MS, remainingMs(input, moduleStartedAtMs)),
        input.signal,
        { allowHttpTransportFallback: true },
      ),
    );
    recordPolicyFetchDiagnostic(policyFetchDiagnostics, {
      stage: "homepage",
      result: homepage,
    });
    const homepageFinalUrl = [...(homepage.attempts ?? [])]
      .reverse()
      .find((attempt) => attempt.outcome === "fetched")?.finalUrl;
    if (homepage.ok && homepageFinalUrl && homepageFinalUrl !== input.normalizedUrl) {
      input = { ...input, normalizedUrl: homepageFinalUrl, url: homepageFinalUrl };
    }
    if (!homepage.ok) {
      const fallbackCandidates = dedupeCandidates([
        ...seededCandidates,
        ...commonPathCandidatesFor(input.normalizedUrl, seededCandidates.length),
      ]);
      const speculativeCommonPathNanoAbortController = new AbortController();
      const speculativeCommonPathNanoRankingPromise = recordPolicyTiming(
        timingBreakdown,
        "homepage-failed common-path Nano ranking",
        `Rank ${fallbackCandidates.length} common policy paths in parallel with rendered discovery and rendered candidate recovery.`,
        () => rankCandidatesWithRequiredNano(
          input,
          fallbackCandidates,
          combineAbortSignals(input.signal, speculativeCommonPathNanoAbortController.signal),
        ),
      );
      // The speculative ranking is authoritative only if rendered recovery does
      // not retain a core surface. Observe rejection immediately while Chromium
      // continues so it cannot become an unhandled rejection.
      void speculativeCommonPathNanoRankingPromise.catch(() => undefined);
      let renderedCandidates: PolicySurfaceCandidate[];
      try {
        const renderedDiscovery = await recordPolicyTiming(
          timingBreakdown,
          "homepage-failed rendered discovery",
          "Bounded browser-rendered policy link discovery after static homepage fetch failed.",
          () => extractRenderedCandidatesBeforeSoftDeadline(input, moduleStartedAtMs, policyBrowserRuntime),
        );
        renderedCandidates = renderedDiscovery.candidates;
      } catch (error) {
        speculativeCommonPathNanoAbortController.abort();
        await speculativeCommonPathNanoRankingPromise.catch(() => undefined);
        throw error;
      }
      renderedCandidateCount = renderedCandidates.length;
      if (renderedCandidates.length > 0) {
        observedCandidateCount = renderedCandidates.length;
        let renderedResults: Awaited<ReturnType<typeof fetchRankedPolicyCandidates>>;
        try {
          renderedResults = await fetchRankedPolicyCandidates({
            input,
            fetchCaches: policyDocumentFetchCaches,
            timingBreakdown,
            moduleStartedAtMs,
            candidates: renderedCandidates,
            labelPrefix: "homepage-failed rendered",
            policySurfaceTextArtifactBudget,
          });
        } catch (error) {
          speculativeCommonPathNanoAbortController.abort();
          await speculativeCommonPathNanoRankingPromise.catch(() => undefined);
          throw error;
        }
        observations.push(...renderedResults.observations);
        artifactRefs.push(...renderedResults.artifactRefs);
        if (hasRetainedCorePolicyOrControlSurface(observations)) {
          speculativeCommonPathNanoAbortController.abort();
          await speculativeCommonPathNanoRankingPromise.catch(() => undefined);
          artifactRefs.push(await writePolicyCaptureDiagnostics({
            input,
            moduleStartedAtMs,
            staticCandidateCount,
            renderedCandidateCount,
            observedCandidateCount,
            commonPathFallbackUsed,
            observations,
            candidates: renderedCandidates,
            policyFetchDiagnostics,
          }));
          return {
            moduleRun: completedPolicyModuleRun(),
            policySurfaceObservations: observations,
            artifactRefs,
          };
        }
      }
      commonPathFallbackUsed = true;
      const nanoRankedFallbackCandidates = await speculativeCommonPathNanoRankingPromise;
      const fallbackResults = await fetchPolicyCandidateGroup({
        input,
        fetchCaches: policyDocumentFetchCaches,
        timingBreakdown,
        moduleStartedAtMs,
        rankedCandidates: mergeCommonPathFallbackCandidates(
          deterministicCommonPathFetchFallback(fallbackCandidates),
          nanoRankedFallbackCandidates,
        ),
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
          policyFetchDiagnostics,
        }));
        return {
          moduleRun: completedPolicyModuleRun(),
          policySurfaceObservations: observations,
          artifactRefs,
        };
      }
      artifactRefs.push(await writePolicyCaptureDiagnostics({
        input,
        moduleStartedAtMs,
        staticCandidateCount,
        renderedCandidateCount,
        observedCandidateCount,
        commonPathFallbackUsed,
        observations,
        candidates: dedupeCandidates([
          ...seededCandidates,
          ...renderedCandidates,
          ...fallbackCandidates,
        ]),
        policyFetchDiagnostics,
      }));
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
        ...seededCandidates,
        ...extractCandidates(input.normalizedUrl, candidateHtml, homepageText),
        ...extractControlCandidates(input.normalizedUrl, candidateHtml, homepageText),
        ...extractEmbeddedConsentConfigCandidates(input.normalizedUrl, candidateHtml, homepageText),
      ]),
    );
    staticCandidateCount = staticCandidates.length;
    const fastStaticCoverage =
      input.discoveryMode === "fast" &&
      hasCompleteFetchableStaticCoreCoverage(staticCandidates);
    const commonPathCandidates = commonPathCandidatesFor(
      input.normalizedUrl,
      staticCandidates.length,
      commonPathLocaleHints(input.normalizedUrl, homepage.text, homepageText),
    );
    const shouldStartSpeculativeCommonPathRanking =
      input.discoveryMode === "fast" &&
      !fastStaticCoverage &&
      commonPathCandidates.length > 0 &&
      deterministicFetchFallback(staticCandidates).length === 0;
    const speculativeStaticFetchCandidates = input.discoveryMode === "fast" && !fastStaticCoverage
      ? deterministicFetchFallback(staticCandidates)
        .filter((candidate) => candidate.fetchable && !candidate.observationOnly)
        .slice(0, POLICY_FETCH_CONCURRENCY)
      : [];
    const speculativeStaticFetchPromise = speculativeStaticFetchCandidates.length > 0
      ? recordPolicyTiming(
        timingBreakdown,
        "static policy fetch warmup",
        `Warm ${speculativeStaticFetchCandidates.length} deterministic policy fetches in parallel with rendered discovery; final ranking and projection remain authoritative.`,
        () => warmPolicyDocumentFetchCache({
          cache: policyDocumentFetchCaches.direct,
          candidates: speculativeStaticFetchCandidates,
          input,
          moduleStartedAtMs,
        }),
      )
      : undefined;
    void speculativeStaticFetchPromise?.catch(() => undefined);
    const speculativeCommonPathNanoAbortController = shouldStartSpeculativeCommonPathRanking
      ? new AbortController()
      : undefined;
    const speculativeCommonPathCandidates = shouldStartSpeculativeCommonPathRanking
      ? commonPathCandidates.map((candidate) => ({ ...candidate }))
      : [];
    const speculativeCommonPathNanoRankingPromise = speculativeCommonPathNanoAbortController
      ? recordPolicyTiming(
        timingBreakdown,
        "Nano common-path ranking",
        `Rank ${commonPathCandidates.length} common policy paths in parallel with rendered discovery.`,
        () => rankCandidatesWithRequiredNano(
          input,
          speculativeCommonPathCandidates,
          combineAbortSignals(input.signal, speculativeCommonPathNanoAbortController.signal),
        ),
      )
      : undefined;
    // The speculative call is consumed only if rendered discovery still leaves no
    // deterministic fetch candidates. Observe rejection immediately so a slow or
    // failed Nano call cannot become an unhandled rejection while Chromium runs.
    void speculativeCommonPathNanoRankingPromise?.catch(() => undefined);
    let renderedCandidates: PolicySurfaceCandidate[];
    let renderedDiscoveryDeadlineReached = false;
    try {
      if (fastStaticCoverage) {
        renderedCandidates = await recordPolicyTiming(
          timingBreakdown,
          "rendered discovery skipped",
          "Skipped rendered policy discovery because static planned-DAG candidates covered required surfaces.",
          async () => [] as PolicySurfaceCandidate[],
        );
      } else {
        const renderedDiscovery = await recordPolicyTiming(
          timingBreakdown,
          "rendered discovery",
          "Optional browser-rendered footer/header policy link discovery.",
          () => extractRenderedCandidatesBeforeSoftDeadline(input, moduleStartedAtMs, policyBrowserRuntime),
        );
        renderedCandidates = renderedDiscovery.candidates;
        renderedDiscoveryDeadlineReached = renderedDiscovery.deadlineReached;
      }
    } catch (error) {
      speculativeCommonPathNanoAbortController?.abort();
      await speculativeCommonPathNanoRankingPromise?.catch(() => undefined);
      await speculativeStaticFetchPromise?.catch(() => undefined);
      throw error;
    }
    await speculativeStaticFetchPromise?.catch(() => undefined);
    renderedCandidateCount = renderedCandidates.length;
    const linkCandidates = fastStaticCoverage
      ? staticCandidates
      : await recordPolicyTiming(
        timingBreakdown,
        "candidate extraction/dedupe rendered merge",
        "Merge static, rendered, and control policy candidates plus dedupe.",
        async () => dedupeCandidates([
          ...seededCandidates,
          ...staticCandidates,
          ...renderedCandidates,
        ]),
      );
    observedCandidateCount = linkCandidates.length;
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
    const shouldConsumeSpeculativeCommonPathRanking =
      rankedCandidates.length === 0 &&
      input.discoveryMode === "fast" &&
      shouldSpeculateCommonPathNanoRanking(linkCandidates, commonPathCandidates);
    if (speculativeCommonPathNanoRankingPromise && !shouldConsumeSpeculativeCommonPathRanking) {
      speculativeCommonPathNanoAbortController?.abort();
      await speculativeCommonPathNanoRankingPromise.catch(() => undefined);
    }
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
          speculativeCommonPathNanoRankingPromise ?? recordPolicyTiming(
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
      fetchCaches: policyDocumentFetchCaches,
      timingBreakdown,
      moduleStartedAtMs,
      rankedCandidates,
      labelPrefix: "policy",
      policySurfaceTextArtifactBudget,
      prefetchedOnly: renderedDiscoveryDeadlineReached,
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
        fetchCaches: policyDocumentFetchCaches,
        timingBreakdown,
        moduleStartedAtMs,
        rankedCandidates: commonPathRankedCandidates,
        labelPrefix: "common-path policy",
        policySurfaceTextArtifactBudget,
        prefetchedOnly: renderedDiscoveryDeadlineReached,
      });
      observations.push(...commonPathResults.observations);
      artifactRefs.push(...commonPathResults.artifactRefs);
    }

    const secondaryCandidates = mergeSupplementalPolicyCandidates(
      [],
      dedupeCandidates(policyResults.secondaryCandidates),
      input.discoveryMode === "fast"
        ? MAX_FAST_SECONDARY_CANDIDATES_TO_FETCH
        : MAX_SECONDARY_CANDIDATES_TO_FETCH,
      observations,
    );
    if (secondaryCandidates.length > 0) {
      const secondaryResults = await fetchPolicyCandidateGroup({
        input,
        fetchCaches: policyDocumentFetchCaches,
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
      policyFetchDiagnostics,
    }));

    return {
      moduleRun: completedPolicyModuleRun(),
      policySurfaceObservations: observations,
      artifactRefs,
    };
  } catch (error) {
    const parentCancellation = abortReason(parentSignal);
    if (parentCancellation) throw parentCancellation;
    if (externalPolicyDeadlineReached || policyDeadlineController.signal.aborted) {
      return {
        moduleRun: moduleRun(
          observations.length > 0 ? "partial" : "skipped_budget",
          moduleStartedAt,
          moduleStartedAtMs,
          [`Policy-surface lane reached its absolute ${policyModuleDeadlineMs}ms deadline; retained evidence is coverage-limited.`],
          timingBreakdown,
        ),
        policySurfaceObservations: observations,
        artifactRefs,
      };
    }
    return {
      moduleRun: moduleRun("failed", moduleStartedAt, moduleStartedAtMs, [
        policyModuleDeadlineReached
          ? `Policy-surface module exceeded its ${policyModuleDeadlineMs}ms hard deadline; retained evidence may be incomplete.`
          : error instanceof Error ? error.message : String(error)
      ], timingBreakdown),
      policySurfaceObservations: observations,
      artifactRefs,
    };
  } finally {
    clearTimeout(policyModuleDeadlineTimer);
    input.signal?.removeEventListener("abort", abortPolicyRuntime);
    policyDeadlineController.abort(new Error("Policy-surface lane completed; cancel remaining background work."));
    await boundedCleanup(Promise.allSettled([
      ...policyDocumentFetchCaches.direct.values(),
      ...policyDocumentFetchCaches.rendered.values(),
    ]), 500);
    await boundedCleanup(policyBrowserRuntime.close());
  }
}

export async function recoverPolicyDocumentsFromRetainedRenderedLinks(input: {
  scannerInput: PolicySurfaceScannerInput;
  links: RetainedRenderedPolicyLink[];
  existingObservations: PolicySurfaceObservation[];
  evidenceRef?: EvidenceRef;
}): Promise<{
  artifactRefs: ArtifactRef[];
  observations: PolicySurfaceObservation[];
  timingBreakdown: NonNullable<ScanModuleRun["timingBreakdown"]>;
}> {
  const usablePrivacyDocumentRetained = input.existingObservations.some((observation) =>
    observation.surfaceType === "privacy_policy" &&
    observation.status === "fetched" &&
    observation.documentEvaluationState !== "insufficient"
  );
  if (usablePrivacyDocumentRetained || input.links.length === 0) {
    return { artifactRefs: [], observations: [], timingBreakdown: [] };
  }

  const moduleStartedAtMs = Date.now();
  const timingBreakdown: NonNullable<ScanModuleRun["timingBreakdown"]> = [];
  const diagnostics: PolicyFetchDiagnosticsCollector = {
    failedFetches: [],
    successfulFetches: [],
    protectedObservedFetchAttempts: 0,
    renderedRecoveryAttempts: 0,
    renderedRecoverySuccesses: 0,
    seenFailureKeys: new Set(),
  };
  const browserRuntime = createPolicyBrowserRuntime(input.scannerInput.browser);
  const recoveryInput: PolicySurfaceScannerInput = {
    ...input.scannerInput,
    absoluteDeadlineAtMs: moduleStartedAtMs + 6_000,
    internalBudgetMs: 6_000,
  };
  const fetchCaches: PolicyDocumentFetchCaches = {
    browserRuntime,
    diagnostics,
    direct: new Map(),
    rendered: new Map(),
    runRenderedFetch: createConcurrencyLimiter(POLICY_RENDERED_FETCH_CONCURRENCY),
  };
  try {
    const existingKeys = new Set(input.existingObservations
      .filter((observation) => observation.status === "fetched")
      .map(policySurfaceObservationKey));
    const candidates = prioritizePolicyCandidateEvaluation(
      policySurfaceCandidatesFromRetainedRenderedLinks(input.links, false)
        .map((candidate) => ({
          ...candidate,
          normalizedUrl: canonicalPolicyUrlIdentity(candidate.normalizedUrl),
        })),
    )
      .filter((candidate) =>
        candidate.deterministicSurfaceType === "privacy_policy" ||
        candidate.deterministicSurfaceType === "cookie_policy"
      )
      .filter((candidate) =>
        !existingKeys.has(`${candidate.deterministicSurfaceType}:${canonicalPolicyUrlIdentity(candidate.normalizedUrl)}`)
      )
      .slice(0, 3);
    if (candidates.length === 0) {
      return { artifactRefs: [], observations: [], timingBreakdown };
    }
    const recovered = await fetchPolicyCandidateGroup({
      input: recoveryInput,
      fetchCaches,
      timingBreakdown,
      moduleStartedAtMs,
      rankedCandidates: candidates,
      labelPrefix: "rendered-link recovery",
      policySurfaceTextArtifactBudget: {
        remainingChars: MAX_POLICY_SURFACE_TEXT_ARTIFACT_TOTAL_CHARS,
      },
    });
    const observations = recovered.observations.map((observation) => ({
      ...observation,
      evidenceRefs: input.evidenceRef
        ? uniqueEvidenceRefs([...(observation.evidenceRefs ?? []), input.evidenceRef])
        : observation.evidenceRefs,
    }));
    const diagnosticsPath = await input.scannerInput.artifactWriter.writeJsonArtifact(
      "PolicyRenderedLinkRecoveryDiagnostics.json",
      {
        artifactVersion: "policy_rendered_link_recovery_diagnostics.v1",
        generatedAt: new Date().toISOString(),
        candidateCount: candidates.length,
        fetchedCount: observations.filter((observation) => observation.status === "fetched").length,
        usableDocumentCount: observations.filter((observation) =>
          observation.documentEvaluationState === "usable"
        ).length,
        protectedObservedFetchAttempts: diagnostics.protectedObservedFetchAttempts,
        renderedRecoveryAttempts: diagnostics.renderedRecoveryAttempts,
        renderedRecoverySuccesses: diagnostics.renderedRecoverySuccesses,
        failedFetches: diagnostics.failedFetches,
        successfulFetches: diagnostics.successfulFetches,
        durationMs: Date.now() - moduleStartedAtMs,
      },
    );
    return {
      observations,
      timingBreakdown,
      artifactRefs: [
        ...recovered.artifactRefs,
        {
          artifactId: "policy_rendered_link_recovery_diagnostics",
          artifactType: "json",
          path: diagnosticsPath,
          createdAt: new Date().toISOString(),
          sourceScanner: SOURCE_SCANNER,
          scenario: SCENARIO,
          sensitivity: "internal_only",
          redactionStatus: "internal_only",
          relatedEventIds: [],
          label: "Rendered policy-link recovery diagnostics",
        },
      ],
    };
  } finally {
    await boundedCleanup(Promise.allSettled([
      ...fetchCaches.direct.values(),
      ...fetchCaches.rendered.values(),
    ]), 500);
    await boundedCleanup(browserRuntime.close());
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
      discoveryMethod: observation.discoveryMethod,
      surfaceType: "privacy_policy" as const,
      directVsInferred: "mixed" as const,
      classifierReasonCodes: uniqueStrings([
        ...(observation.classifierReasonCodes ?? []),
        "combined_privacy_cookie_surface",
      ]).slice(0, 16),
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
  policyFetchDiagnostics: PolicyFetchDiagnosticsCollector;
}): Promise<ArtifactRef> {
  const fetchedObservations = input.observations.filter((observation) => observation.status === "fetched");
  const coreSurfaces = fetchedObservations.filter((observation) =>
    isCorePolicyOrControlSurface(observation) &&
    !isStateSpecificPrivacyPath(observation.normalizedUrl ?? observation.url)
  );
  const observedLinkCount = input.observations.filter((observation) =>
    observation.linkObservationState === "observed"
  ).length;
  const fetchStartedCount = input.observations.filter((observation) =>
    observation.documentFetchState === "fetched" || observation.documentFetchState === "failed"
  ).length;
  const skippedBudgetCount = input.observations.filter((observation) =>
    observation.documentFetchState === "skipped_budget" || observation.status === "skipped_budget"
  ).length;
  const usableDocumentCount = input.observations.filter((observation) =>
    observation.documentEvaluationState === "usable"
  ).length;
  const path = await input.input.artifactWriter.writeJsonArtifact("PolicySurfaceCaptureDiagnostics.json", {
    artifactVersion: "policy_surface_capture_diagnostics.v2",
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
    funnel: {
      candidateDiscoveredCount: input.staticCandidateCount + input.renderedCandidateCount,
      candidateSelectedCount: input.observations.length,
      documentFetchStartedCount: fetchStartedCount,
      documentFetchedCount: fetchedObservations.length,
      documentUsableCount: usableDocumentCount,
      fetchFailedCount: input.observations.filter((observation) => observation.documentFetchState === "failed").length,
      observedLinkCount,
      protectedObservedFetchAttempts: input.policyFetchDiagnostics.protectedObservedFetchAttempts,
      renderedRecoveryAttempts: input.policyFetchDiagnostics.renderedRecoveryAttempts,
      renderedRecoverySuccesses: input.policyFetchDiagnostics.renderedRecoverySuccesses,
      skippedBudgetCount,
    },
    homepageFetch: input.policyFetchDiagnostics.homepageFetch,
    failedFetches: input.policyFetchDiagnostics.failedFetches,
    successfulFetches: input.policyFetchDiagnostics.successfulFetches,
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

function recordPolicyFetchDiagnostic(
  collector: PolicyFetchDiagnosticsCollector,
  input: {
    stage: PolicyFetchDiagnostic["stage"];
    result: FetchTextResult;
    candidate?: PolicySurfaceCandidate;
  },
): void {
  const attempts = (input.result.attempts ?? []).map((attempt) => ({
    ...attempt,
    requestedUrl: boundedDiagnosticUrl(attempt.requestedUrl),
    ...(attempt.finalUrl ? { finalUrl: boundedDiagnosticUrl(attempt.finalUrl) } : {}),
    ...(attempt.contentType ? { contentType: attempt.contentType.slice(0, 120) } : {}),
  }));
  const failedAttempt = [...attempts].reverse().find((attempt) => attempt.outcome !== "fetched");
  const diagnostic: PolicyFetchDiagnostic = {
    stage: input.stage,
    ...(input.candidate
      ? {
          candidateUrl: boundedDiagnosticUrl(input.candidate.normalizedUrl),
          discoveryMethod: input.candidate.discoveryMethod,
          surfaceType: input.candidate.deterministicSurfaceType,
        }
      : {}),
    ok: input.result.ok,
    ...(input.result.status !== undefined ? { httpStatus: input.result.status } : {}),
    ...(!input.result.ok && failedAttempt
      ? { failureReason: failedAttempt.outcome as Exclude<PolicyFetchAttemptOutcome, "fetched"> }
      : {}),
    attempts,
  };
  if (input.stage === "homepage") {
    collector.homepageFetch = diagnostic;
  }
  if (input.result.ok) {
    if (input.stage !== "homepage" && collector.successfulFetches.length < MAX_POLICY_FETCH_DIAGNOSTICS) {
      collector.successfulFetches.push(diagnostic);
    }
    return;
  }
  if (collector.failedFetches.length >= MAX_POLICY_FETCH_DIAGNOSTICS) {
    return;
  }
  const failureKey = JSON.stringify([
    diagnostic.stage,
    diagnostic.candidateUrl,
    diagnostic.httpStatus,
    diagnostic.failureReason,
  ]);
  if (collector.seenFailureKeys.has(failureKey)) {
    return;
  }
  collector.seenFailureKeys.add(failureKey);
  collector.failedFetches.push(diagnostic);
}

function boundedDiagnosticUrl(value: string): string {
  try {
    return canonicalPolicyUrlIdentity(value).slice(0, 500);
  } catch {
    return value.replace(/[?#].*$/, "").slice(0, 500);
  }
}

interface ProcessPolicyCandidateInput {
  input: PolicySurfaceScannerInput;
  timingBreakdown: NonNullable<ScanModuleRun["timingBreakdown"]>;
  moduleStartedAtMs: number;
  candidate: PolicySurfaceCandidate;
  candidateIndex: number;
  policySurfaceTextArtifactBudget: PolicySurfaceTextArtifactBudget;
  fetchCaches: PolicyDocumentFetchCaches;
  prefetchedOnly?: boolean;
}

interface ProcessPolicyCandidateResult {
  observation: PolicySurfaceObservation;
  artifactRefs: ArtifactRef[];
  secondaryCandidates: PolicySurfaceCandidate[];
}

async function fetchRankedPolicyCandidates(input: {
  input: PolicySurfaceScannerInput;
  fetchCaches: PolicyDocumentFetchCaches;
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
    fetchCaches: input.fetchCaches,
    timingBreakdown: input.timingBreakdown,
    moduleStartedAtMs: input.moduleStartedAtMs,
    rankedCandidates,
    labelPrefix: input.labelPrefix,
    policySurfaceTextArtifactBudget: input.policySurfaceTextArtifactBudget,
  });
}

async function fetchPolicyCandidateGroup(input: {
  input: PolicySurfaceScannerInput;
  fetchCaches: PolicyDocumentFetchCaches;
  timingBreakdown: NonNullable<ScanModuleRun["timingBreakdown"]>;
  moduleStartedAtMs: number;
  rankedCandidates: PolicySurfaceCandidate[];
  labelPrefix: string;
  policySurfaceTextArtifactBudget: PolicySurfaceTextArtifactBudget;
  prefetchedOnly?: boolean;
}): Promise<{ observations: PolicySurfaceObservation[]; artifactRefs: ArtifactRef[]; secondaryCandidates: PolicySurfaceCandidate[] }> {
  const toFetch = prioritizePolicyCandidateEvaluation(input.rankedCandidates)
    .slice(0, candidateGroupFetchLimit(input.rankedCandidates));
  const policyResults = await recordPolicyTiming(
    input.timingBreakdown,
    `${input.labelPrefix} fetch group`,
    `Fetch and project up to ${toFetch.length} ranked policy candidates with concurrency ${POLICY_FETCH_CONCURRENCY}. Child fetch/topic timings may overlap and do not sum to wall time.`,
    () => mapWithConcurrency(
      toFetch.map((candidate, candidateIndex) => ({ candidate, candidateIndex })),
      POLICY_FETCH_CONCURRENCY,
      ({ candidate, candidateIndex }) => processPolicyCandidateBeforeDeadline({
        input: input.input,
        fetchCaches: input.fetchCaches,
        timingBreakdown: input.timingBreakdown,
        moduleStartedAtMs: input.moduleStartedAtMs,
        candidate,
        candidateIndex,
        policySurfaceTextArtifactBudget: input.policySurfaceTextArtifactBudget,
        prefetchedOnly: input.prefetchedOnly,
      }),
    ),
  );
  return {
    artifactRefs: policyResults.flatMap((result) => result.artifactRefs),
    observations: policyResults.map((result) => result.observation),
    secondaryCandidates: policyResults.flatMap((result) => result.secondaryCandidates),
  };
}

function prioritizePolicyCandidateEvaluation(
  rankedCandidates: PolicySurfaceCandidate[],
): PolicySurfaceCandidate[] {
  const seen = new Set<string>();
  return rankedCandidates
    .map((candidate, originalIndex) => ({ candidate, originalIndex }))
    .sort((left, right) =>
      surfacePriority(left.candidate.deterministicSurfaceType) - surfacePriority(right.candidate.deterministicSurfaceType) ||
      policyCandidateDiscoveryPriority(left.candidate) - policyCandidateDiscoveryPriority(right.candidate) ||
      policyCandidateQualityScore(right.candidate) - policyCandidateQualityScore(left.candidate) ||
      right.candidate.deterministicScore - left.candidate.deterministicScore ||
      left.originalIndex - right.originalIndex
    )
    .map(({ candidate }) => candidate)
    .filter((candidate) => {
      const key = policyEvaluationCandidateKey(candidate);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function policyEvaluationCandidateKey(candidate: PolicySurfaceCandidate): string {
  if (candidate.observationOnly && candidate.selector) {
    return `${candidate.normalizedUrl}#${candidate.selector}`;
  }
  try {
    const parsed = new URL(canonicalPolicyUrlIdentity(candidate.normalizedUrl));
    if (parsed.hash && classifyPrivacySurface({ url: parsed.toString() }).surfaceType === "unknown") {
      parsed.hash = "";
    }
    parsed.pathname = parsed.pathname.replace(/\/+$/, "") || "/";
    return parsed.toString();
  } catch {
    return candidate.normalizedUrl.replace(/\/+$/, "") || "/";
  }
}

async function processPolicyCandidateBeforeDeadline(
  input: ProcessPolicyCandidateInput,
): Promise<ProcessPolicyCandidateResult> {
  const absoluteRemainingMs = deadlineRemainingMs(input.input.absoluteDeadlineAtMs);
  if (absoluteRemainingMs <= 10 || input.input.signal?.aborted) {
    return skippedBudgetCandidateResult(input.candidate);
  }
  const candidateController = new AbortController();
  const candidateSignal = combineAbortSignals(input.input.signal, candidateController.signal);
  const candidateInput: ProcessPolicyCandidateInput = {
    ...input,
    input: { ...input.input, signal: candidateSignal },
  };
  let processingSettled = false;
  const processingPromise = processPolicyCandidate(candidateInput).finally(() => {
    processingSettled = true;
  });
  void processingPromise.catch(() => undefined);
  let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
  let abortListener: (() => void) | undefined;
  const deadlinePromise = new Promise<ProcessPolicyCandidateResult>((resolve) => {
    const finishAsSkipped = () => {
      candidateController.abort(new Error("Policy candidate processing budget exhausted."));
      resolve(skippedBudgetCandidateResult(input.candidate));
    };
    deadlineTimer = setTimeout(() => {
      finishAsSkipped();
    }, Math.max(1, Math.min(POLICY_CANDIDATE_PROCESSING_TIMEOUT_MS, absoluteRemainingMs)));
    abortListener = finishAsSkipped;
    input.input.signal?.addEventListener("abort", abortListener, { once: true });
  });

  try {
    return await Promise.race([processingPromise, deadlinePromise]);
  } finally {
    if (deadlineTimer) clearTimeout(deadlineTimer);
    if (abortListener) input.input.signal?.removeEventListener("abort", abortListener);
    candidateController.abort(new Error("Policy candidate processing settled."));
    if (!processingSettled) {
      await boundedCleanup(processingPromise, 250);
    }
  }
}

function skippedBudgetCandidateResult(candidate: PolicySurfaceCandidate): ProcessPolicyCandidateResult {
  return {
    observation: observationFromCandidate(candidate, {
      status: "skipped_budget",
      fetchFailureReason: "scan_budget_exhausted",
      confidence: candidate.assisted?.confidence ?? candidate.deterministicScore,
    }),
    artifactRefs: [],
    secondaryCandidates: [],
  };
}

async function processPolicyCandidate({
  input,
  timingBreakdown,
  moduleStartedAtMs,
  candidate,
  candidateIndex,
  policySurfaceTextArtifactBudget,
  fetchCaches,
  prefetchedOnly,
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
  const hasPrefetchedDirectDocument = fetchCaches.direct.has(
    policyDocumentFetchCacheKey(candidate.normalizedUrl),
  );
  const protectedObservedFetch = shouldUseProtectedObservedPolicyFetch({
    candidate,
    candidateIndex,
    input,
    moduleStartedAtMs,
  });
  const prefetchedAfterSoftBudget =
    (Date.now() - moduleStartedAtMs > input.internalBudgetMs || prefetchedOnly === true) &&
    hasPrefetchedDirectDocument;
  if (
    (Date.now() - moduleStartedAtMs > input.internalBudgetMs || prefetchedOnly === true) &&
    !hasPrefetchedDirectDocument &&
    !protectedObservedFetch
  ) {
    return {
      observation: observationFromCandidate(candidate, {
        status: "skipped_budget",
        fetchFailureReason: "scan_budget_exhausted",
        confidence: candidate.assisted?.confidence ?? candidate.deterministicScore,
      }),
      artifactRefs: [],
      secondaryCandidates: [],
    };
  }

  if (protectedObservedFetch) {
    fetchCaches.diagnostics.protectedObservedFetchAttempts += 1;
  }
  const boundedAfterSoftBudget = prefetchedAfterSoftBudget || protectedObservedFetch;

  // Fast discovery warms deterministic static policy documents while the
  // rendered lane searches for additional controls. Keep that already-bounded
  // evidence when browser startup or rendered discovery consumes the soft
  // module budget; no new direct network work is started in this case.

  let fetched = await recordPolicyTiming(
    timingBreakdown,
    `${protectedObservedFetch ? "policy protected fetch" : "policy fetch"} ${candidateIndex + 1}`,
    `Fetch ${candidate.deterministicSurfaceType} candidate document.`,
    () => fetchPolicyDocumentSingleFlight(
      fetchCaches.direct,
      candidate.normalizedUrl,
      protectedObservedFetch
        ? Math.min(
            POLICY_PROTECTED_OBSERVED_FETCH_TIMEOUT_MS,
            remainingProtectedPolicyFetchMs(input, moduleStartedAtMs),
          )
        : remainingPolicyFetchMs(input, moduleStartedAtMs),
      input.signal,
    ),
  );
  recordPolicyFetchDiagnostic(fetchCaches.diagnostics, {
    stage: "candidate_direct",
    result: fetched,
    candidate,
  });
  if (!fetched.ok) {
    const canonicalHostVariant = canonicalWwwPolicyUrlVariant(candidate.normalizedUrl);
    if (canonicalHostVariant) {
      const variantFetched = await recordPolicyTiming(
        timingBreakdown,
        `policy canonical host retry ${candidateIndex + 1}`,
        `Retry the retained policy candidate through its canonical www host variant.`,
        () => fetchPolicyDocumentSingleFlight(
          fetchCaches.direct,
          canonicalHostVariant!,
          remainingPolicyFetchMs(input, moduleStartedAtMs),
          input.signal,
        ),
      );
      recordPolicyFetchDiagnostic(fetchCaches.diagnostics, {
        stage: "candidate_direct",
        result: variantFetched,
        candidate,
      });
      if (variantFetched.ok) fetched = variantFetched;
    }
  }
  if (!fetched.ok && shouldTryRenderedPolicyDocumentFetch({
    candidate,
    candidateIndex,
    input,
    moduleStartedAtMs,
    protectedObservedFetch,
    status: fetched.status,
  })) {
    fetchCaches.diagnostics.renderedRecoveryAttempts += 1;
    const renderedFetched = await recordPolicyTiming(
      timingBreakdown,
      `${protectedObservedFetch ? "policy protected rendered fetch fallback" : "policy rendered fetch fallback"} ${candidateIndex + 1}`,
      `Fetch ${candidate.deterministicSurfaceType} candidate document through bounded browser-rendered navigation after direct fetch failed.`,
      () => fetchRenderedPolicyDocumentSingleFlight(fetchCaches, {
        input,
        url: candidate.normalizedUrl,
        timeoutMs: protectedObservedFetch
          ? Math.min(
              POLICY_PROTECTED_RENDERED_FETCH_TIMEOUT_MS,
              remainingProtectedPolicyFetchMs(input, moduleStartedAtMs),
            )
          : Math.min(4_000, remainingMs(input, moduleStartedAtMs)),
      }),
    );
    recordPolicyFetchDiagnostic(fetchCaches.diagnostics, {
      stage: "candidate_rendered",
      result: renderedFetched,
      candidate,
    });
    if (renderedFetched.ok) {
      fetchCaches.diagnostics.renderedRecoverySuccesses += 1;
      fetched = renderedFetched;
    }
  }
  if (!fetched.ok) {
    const failedAttempt = [...(fetched.attempts ?? [])].reverse().find((attempt) => attempt.outcome !== "fetched");
    return {
      observation: observationFromCandidate(candidate, {
        status: "failed",
        httpStatus: fetched.status,
        fetchFailureReason: failedAttempt?.outcome === "fetched" ? undefined : failedAttempt?.outcome,
        redirectChain: policyFetchRedirectChain(fetched),
        confidence: Math.max(0.35, candidate.assisted?.confidence ?? candidate.deterministicScore),
      }),
      artifactRefs: [],
      secondaryCandidates: [],
    };
  }

  let fetchedFinalUrl = successfulPolicyFetchFinalUrl(fetched, candidate.normalizedUrl);
  let effectiveCandidate = fetchedFinalUrl === candidate.normalizedUrl
    ? candidate
    : {
        ...candidate,
        url: fetchedFinalUrl,
        normalizedUrl: fetchedFinalUrl,
        sameOrigin: sameOrigin(input.normalizedUrl, fetchedFinalUrl),
        fetchable: true,
      };
  let fetchedHtml = fetched.text;
  const secondaryCandidateHtmlInputs = [fetchedHtml];
  let title = titleFromHtml(fetchedHtml);
  let visibleText = boundedAfterSoftBudget
    ? await recordPolicyTiming(
      timingBreakdown,
      `policy prefetched text resolution ${candidateIndex + 1}`,
      `Resolve deterministic text from the already-fetched ${candidate.deterministicSurfaceType} document without starting follow-up network work.`,
      async () => bestPolicyDocumentText(fetched.text, htmlToVisibleText(fetched.text)),
    )
    : await recordPolicyTiming(
      timingBreakdown,
      `policy text resolution ${candidateIndex + 1}`,
      `Resolve bounded direct, OneTrust, and canonical document text for ${candidate.deterministicSurfaceType}.`,
      () => resolvePolicyVisibleText({
        html: fetched.text,
        baseUrl: effectiveCandidate.normalizedUrl,
        surfaceType: candidate.deterministicSurfaceType,
        timeoutMs: Math.max(4_000, remainingPolicyFetchMs(input, moduleStartedAtMs)),
        deadlineAtMs: input.absoluteDeadlineAtMs,
        signal: input.signal,
      }),
    );
  const urlOnlyStubResolution = boundedAfterSoftBudget
    ? undefined
    : await recordPolicyTiming(
      timingBreakdown,
      `policy url-stub follow ${candidateIndex + 1}`,
      `Follow ${candidate.deterministicSurfaceType} candidate when fetched policy body only points to a canonical policy URL.`,
      () => resolveUrlOnlyPolicyStub({
        currentUrl: effectiveCandidate.normalizedUrl,
        visibleText,
        surfaceType: candidate.deterministicSurfaceType,
        timeoutMs: remainingPolicyFetchMs(input, moduleStartedAtMs),
        deadlineAtMs: input.absoluteDeadlineAtMs,
        signal: input.signal,
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
  const renderedLowQualityFallbackWithinBudget =
    !isCommonPathFallbackCandidate(effectiveCandidate) ||
    candidateIndex < MAX_RENDERED_COMMON_PATH_LOW_QUALITY_FALLBACKS;
  if (renderedLowQualityFallbackWithinBudget && shouldTryRenderedPolicyDocumentTextFallback({
    candidate: effectiveCandidate,
    documentFormat: fetched.documentFormat,
    input,
    moduleStartedAtMs,
    protectedObservedFetch,
    visibleText,
  })) {
    fetchCaches.diagnostics.renderedRecoveryAttempts += 1;
    const renderedFetched = await recordPolicyTiming(
      timingBreakdown,
      `${protectedObservedFetch ? "policy protected rendered low-quality text fallback" : "policy rendered low-quality text fallback"} ${candidateIndex + 1}`,
      `Fetch ${effectiveCandidate.deterministicSurfaceType} candidate document through bounded browser-rendered navigation after direct fetch retained only low-quality text.`,
      () => fetchRenderedPolicyDocumentSingleFlight(fetchCaches, {
        input,
        url: effectiveCandidate.normalizedUrl,
        timeoutMs: protectedObservedFetch
          ? Math.min(
              POLICY_PROTECTED_RENDERED_FETCH_TIMEOUT_MS,
              remainingProtectedPolicyFetchMs(input, moduleStartedAtMs),
            )
          : Math.max(5_000, Math.min(6_000, remainingMs(input, moduleStartedAtMs))),
      }),
    );
    recordPolicyFetchDiagnostic(fetchCaches.diagnostics, {
      stage: "candidate_rendered",
      result: renderedFetched,
      candidate: effectiveCandidate,
    });
    if (renderedFetched.ok) {
      fetchCaches.diagnostics.renderedRecoverySuccesses += 1;
      const renderedVisibleText = await recordPolicyTiming(
        timingBreakdown,
        `policy rendered text resolution ${candidateIndex + 1}`,
        `Resolve bounded rendered document text for ${effectiveCandidate.deterministicSurfaceType}.`,
        () => resolvePolicyVisibleText({
          html: renderedFetched.text,
          baseUrl: effectiveCandidate.normalizedUrl,
          surfaceType: effectiveCandidate.deterministicSurfaceType,
          timeoutMs: Math.max(1_000, Math.min(3_000, remainingPolicyFetchMs(input, moduleStartedAtMs))),
          deadlineAtMs: input.absoluteDeadlineAtMs,
          signal: input.signal,
        }),
      );
      if (shouldAdoptPolicyDocumentText(renderedVisibleText, visibleText, { allowTopicDominant: true })) {
        fetched = renderedFetched;
        fetchedFinalUrl = successfulPolicyFetchFinalUrl(renderedFetched, effectiveCandidate.normalizedUrl);
        effectiveCandidate = {
          ...effectiveCandidate,
          url: fetchedFinalUrl,
          normalizedUrl: fetchedFinalUrl,
          sameOrigin: sameOrigin(input.normalizedUrl, fetchedFinalUrl),
          fetchable: true,
        };
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
        finalUrl: fetchedFinalUrl,
        redirectChain: policyFetchRedirectChain(fetched),
        fetchFailureReason: "low_quality_access_challenge",
        title,
        textExcerpt: excerpt,
        confidence: Math.max(0.35, candidate.assisted?.confidence ?? candidate.deterministicScore),
      }),
      artifactRefs: [],
      secondaryCandidates: [],
    };
  }
  if (!textQuality.usable || !policyDocumentMatchesExpectedSurface({
    surfaceType: effectiveCandidate.deterministicSurfaceType,
    text: visibleText,
    title,
  })) {
    return {
      observation: observationFromCandidate(effectiveCandidate, {
        status: "failed",
        httpStatus: fetched.status,
        finalUrl: fetchedFinalUrl,
        redirectChain: policyFetchRedirectChain(fetched),
        fetchFailureReason: "insufficient_policy_text",
        title,
        textExcerpt: boundedExcerpt(visibleText, []),
        confidence: Math.max(0.35, Math.min(0.55, candidate.assisted?.confidence ?? candidate.deterministicScore)),
      }),
      artifactRefs: [],
      secondaryCandidates: highValueSecondaryCandidatesFromPolicyPage(
        effectiveCandidate.normalizedUrl,
        uniqueStrings(secondaryCandidateHtmlInputs).join("\n"),
        visibleText,
      ),
    };
  }
  const policySections = textQuality.usable
    ? await recordPolicyTiming(
      timingBreakdown,
      `policy section extraction ${candidateIndex + 1}`,
      `Extract bounded retained sections from ${effectiveCandidate.deterministicSurfaceType}.`,
      async () => extractPolicySections({
        html: fetchedHtml,
        sourceUrl: effectiveCandidate.normalizedUrl,
        visibleText,
      }),
    )
    : [];
  const policyCookieDisclosures = textQuality.usable
    ? extractPolicyCookieDisclosures({
        html: fetchedHtml,
        retainedPolicySections: policySections,
        sourceUrl: effectiveCandidate.normalizedUrl,
      })
    : [];
  const retainedPolicySections = retainedPolicySectionsForObservation(policySections);
  const ownership = classifyPolicyDocumentOwnership({
    documentTitle: title,
    documentUrl: effectiveCandidate.normalizedUrl,
    targetUrl: input.normalizedUrl,
    text: visibleText,
  });
  const contentCoverage = policyContentCoverage({
    extractedSections: policySections,
    retainedSections: retainedPolicySections,
    sourceText: visibleText,
  });
  const allowLegacyArticle13Extraction = fetched.documentFormat !== "pdf";
  const sectionEvidence = textQuality.usable && allowLegacyArticle13Extraction && effectiveCandidate.deterministicSurfaceType === "privacy_policy"
    ? retainedArticle13SectionEvidenceFromSections(policySections, effectiveCandidate.normalizedUrl)
    : [];
  const deterministic = textQuality.usable
    ? await recordPolicyTiming(
      timingBreakdown,
      `policy deterministic analysis ${candidateIndex + 1}`,
      `Classify bounded deterministic facts for ${effectiveCandidate.deterministicSurfaceType}.`,
      async () => policyFactsForFetchedDocument(extractPolicyFacts(visibleText), sectionEvidence, {
        allowLegacyArticle13Extraction,
      }),
    )
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
  const topicAssist = textQuality.usable && !boundedAfterSoftBudget
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
      finalUrl: fetchedFinalUrl,
      redirectChain: policyFetchRedirectChain(fetched),
      title,
      textExcerpt: excerpt,
      boundedTextExcerptIds: [excerptId],
      observedTopics: merged.observedTopics,
      article13DisclosureSignals: merged.article13DisclosureSignals,
      gdprTransparencyTopicCandidates: merged.gdprTransparencyTopicCandidates,
      discardedArticle13DisclosureSignals: merged.discardedArticle13DisclosureSignals,
      retainedPolicySections,
      policyCookieDisclosures,
      retainedArticle13SectionEvidence: sectionEvidence,
      ...ownership,
      contentCoverage,
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

export function policyDocumentMatchesExpectedSurface(input: {
  surfaceType: PolicySurfaceObservation["surfaceType"];
  text: string;
  title?: string;
}) {
  const normalized = normalizeWhitespace(`${input.title ?? ""}\n${input.text}`);
  const obviousNavigationShellSignals = [
    /\bexplore (?:our|the)\b/i,
    /\bbuild your\b/i,
    /\bfind (?:a|an|your) (?:retailer|dealer|store)\b/i,
    /\boffers? and finance\b/i,
    /\bshop (?:now|our|the)\b/i,
    /\bview (?:all )?(?:products|models|offers)\b/i,
  ].filter((pattern) => pattern.test(normalized)).length;
  if (input.surfaceType === "privacy_policy") {
    const topicMatches = gdprTransparencyTopicMatchCount(normalized);
    const substantivePrivacySignals = [
      /\b(?:we|the (?:company|controller|organization))\s+(?:collect|process|use|share|disclose|retain|transfer)\b/i,
      /\b(?:personal data|personal information)\b/i,
      /\b(?:your privacy rights|right to access|right to delete|data controller|legal basis|retention period)\b/i,
      /\b(?:privacy policy|privacy notice|data protection notice)\b/i,
    ].filter((pattern) => pattern.test(normalized)).length;
    if (topicMatches > 0 || substantivePrivacySignals >= 2) {
      return true;
    }
    // This is a mismatch guard, not a second policy classifier. Retained
    // multilingual or unusually-worded policy text should remain reviewable
    // unless the fetched document is clearly a commercial/navigation shell.
    return obviousNavigationShellSignals < 2;
  }
  if (input.surfaceType === "cookie_policy") {
    const cookieSignal = /\b(?:cookie|browser storage|local storage|tracking technolog)\b/i.test(normalized);
    return cookieSignal || obviousNavigationShellSignals < 2;
  }
  if (input.surfaceType === "terms") {
    const termsSignal = /\b(?:terms of (?:use|service)|conditions of (?:use|service)|agreement)\b/i.test(normalized);
    return termsSignal || obviousNavigationShellSignals < 2;
  }
  return true;
}

function shouldTryRenderedPolicyDocumentFetch(input: {
  candidate: PolicySurfaceCandidate;
  candidateIndex: number;
  input: PolicySurfaceScannerInput;
  moduleStartedAtMs: number;
  protectedObservedFetch: boolean;
  status: number | undefined;
}): boolean {
  if (
    isCommonPathFallbackCandidate(input.candidate) &&
    input.candidateIndex >= MAX_RENDERED_COMMON_PATH_FAILED_FETCH_FALLBACKS
  ) {
    return false;
  }
  const recoverableStatus = input.status === undefined ||
    [401, 403, 408, 425, 429, 500, 502, 503, 504].includes(input.status);
  const remainingRecoveryMs = input.protectedObservedFetch
    ? remainingProtectedPolicyFetchMs(input.input, input.moduleStartedAtMs)
    : remainingMs(input.input, input.moduleStartedAtMs);
  const minimumRecoveryMs = input.protectedObservedFetch ? 1_000 : 2_500;
  return recoverableStatus && remainingRecoveryMs >= minimumRecoveryMs;
}

function shouldUseProtectedObservedPolicyFetch(input: {
  candidate: PolicySurfaceCandidate;
  candidateIndex: number;
  input: PolicySurfaceScannerInput;
  moduleStartedAtMs: number;
}): boolean {
  const elapsedMs = Date.now() - input.moduleStartedAtMs;
  return input.candidateIndex === 0 &&
    elapsedMs >= input.input.internalBudgetMs &&
    elapsedMs < input.input.internalBudgetMs + POLICY_PROTECTED_RESERVE_MS &&
    input.candidate.deterministicSurfaceType === "privacy_policy" &&
    input.candidate.clickable === true &&
    !input.candidate.observationOnly &&
    !isCommonPathFallbackCandidate(input.candidate) &&
    ["footer_link", "header_link", "page_text_link", "nano_assisted_link_classification"].includes(
      input.candidate.discoveryMethod,
    ) &&
    Math.max(
      input.candidate.assisted?.confidence ?? 0,
      input.candidate.deterministicScore,
    ) >= 0.72;
}

function shouldTryRenderedPolicyDocumentTextFallback(input: {
  candidate: PolicySurfaceCandidate;
  documentFormat?: "pdf" | "text";
  input: PolicySurfaceScannerInput;
  moduleStartedAtMs: number;
  protectedObservedFetch: boolean;
  visibleText: string;
}): boolean {
  const remainingRecoveryMs = input.protectedObservedFetch
    ? remainingProtectedPolicyFetchMs(input.input, input.moduleStartedAtMs)
    : remainingMs(input.input, input.moduleStartedAtMs);
  if (
    input.documentFormat === "pdf" ||
    input.candidate.deterministicSurfaceType !== "privacy_policy" ||
    remainingRecoveryMs < (input.protectedObservedFetch ? 1_000 : 2_000)
  ) {
    return false;
  }
  const normalized = normalizeWhitespace(input.visibleText);
  const topicMatchCount = gdprTransparencyTopicMatchCount(normalized);
  const textQuality = assessPolicyTextQuality(normalized);
  // A protected late-link attempt is for preserving the strongest observed
  // surface, not for spending the reserve re-rendering an already substantive
  // direct response. Reserve browser recovery here for genuinely thin shells.
  if (input.protectedObservedFetch && normalized.length >= 100) {
    return false;
  }
  const looksLikeLocalizedPolicyShell =
    topicMatchCount === 0 &&
    normalized.length < MIN_SUBSTANTIVE_POLICY_TEXT_CHARS &&
    /privacy|confidentialit[ée]|datenschutz|privacidad|protecci[oó]n de datos|informativa privacy|privacybeleid|privacyverklaring|prywatno[śs]ci/i.test(normalized);
  const looksLikeShortThinText =
    normalized.length < 500 &&
    topicMatchCount === 0 &&
    textQuality.policyTermCount < 2;
  const looksLikeIncompleteSubstantivePolicy =
    normalized.length < MIN_SUBSTANTIVE_POLICY_TEXT_CHARS &&
    topicMatchCount < 9;
  return looksLikeShortThinText ||
    looksLikeIncompleteSubstantivePolicy ||
    looksLikePrivacyCenterShell(normalized) ||
    looksLikeLocalizedPolicyShell ||
    !textQuality.usable;
}

async function fetchRenderedPolicyDocumentText(input: {
  browserRuntime: PolicyBrowserRuntime;
  input: PolicySurfaceScannerInput;
  url: string;
  timeoutMs: number;
}): Promise<FetchTextResult> {
  let context: Awaited<ReturnType<Browser["newContext"]>> | undefined;
  let releaseAbortContext: (() => void) | undefined;
  try {
    const browser = await input.browserRuntime.getBrowser();
    context = await browser.newContext(chromiumContextOptions());
    releaseAbortContext = bindAbortSignalToBrowserContext(context, input.input.signal);
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
    const status = response?.status();
    const attemptBase = {
      mode: "rendered" as const,
      requestedUrl: input.url,
      finalUrl: page.url() || input.url,
      ...(status !== undefined ? { httpStatus: status } : {}),
    };
    if (!text) {
      return {
        attempts: [{
          ...attemptBase,
          outcome: response ? "empty_rendered_body" : "navigation_no_response",
        }],
        ok: false,
        status,
        text: "",
      };
    }
    const ok = Boolean(response?.ok());
    return {
      attempts: [{
        ...attemptBase,
        outcome: ok
          ? "fetched"
          : response
            ? "http_error"
            : "navigation_no_response",
      }],
      ok,
      status,
      text: text.slice(0, 500_000),
    };
  } catch (error) {
    return {
      attempts: [{
        mode: "rendered",
        requestedUrl: input.url,
        outcome: error instanceof Error && /timeout/i.test(`${error.name} ${error.message}`)
          ? "timeout"
          : "network_error",
      }],
      ok: false,
      text: "",
    };
  } finally {
    releaseAbortContext?.();
    await context?.close().catch(() => undefined);
  }
}

export async function resolvePolicyVisibleText(input: {
  html: string;
  baseUrl: string;
  surfaceType: PolicySurfaceObservation["surfaceType"];
  timeoutMs: number;
  deadlineAtMs?: number;
  signal?: AbortSignal;
}): Promise<string> {
  throwIfAborted(input.signal);
  const visibleText = htmlToVisibleText(input.html);
  let bestText = bestPolicyDocumentText(input.html, visibleText);
  if (shouldUseDirectPolicyDocumentText(bestText)) {
    return bestText;
  }
  const shouldSpeculateCanonicalPolicyLink =
    input.surfaceType === "privacy_policy" &&
    shouldFollowCanonicalPolicyDocumentLink(input.html, input.baseUrl, bestText);
  const [oneTrustText, speculativeCanonicalPolicyText] = await Promise.all([
    extractOneTrustNoticeText({
      html: input.html,
      baseUrl: input.baseUrl,
      timeoutMs: input.timeoutMs,
      depth: 0,
      deadlineAtMs: input.deadlineAtMs,
      signal: input.signal,
    }),
    shouldSpeculateCanonicalPolicyLink
      ? fetchBestCanonicalPolicyDocumentText({
        html: input.html,
        baseUrl: input.baseUrl,
        currentText: bestText,
        timeoutMs: input.timeoutMs,
        deadlineAtMs: input.deadlineAtMs,
        signal: input.signal,
      })
      : Promise.resolve(undefined),
  ]);
  if (oneTrustText && policyTextQualityScore(oneTrustText) > policyTextQualityScore(bestText)) {
    bestText = oneTrustText;
  }

  const shouldTryCanonicalPolicyLink =
    input.surfaceType === "privacy_policy" &&
    shouldFollowCanonicalPolicyDocumentLink(input.html, input.baseUrl, bestText);
  if (shouldTryCanonicalPolicyLink) {
    const linkedPolicyText = shouldSpeculateCanonicalPolicyLink
      ? speculativeCanonicalPolicyText
      : await fetchBestCanonicalPolicyDocumentText({
        html: input.html,
        baseUrl: input.baseUrl,
        currentText: bestText,
        timeoutMs: input.timeoutMs,
        deadlineAtMs: input.deadlineAtMs,
        signal: input.signal,
      });
    if (linkedPolicyText && policyTextQualityScore(linkedPolicyText) > policyTextQualityScore(bestText)) {
      bestText = linkedPolicyText;
    }
  }

  return bestText;
}

export function shouldUseDirectPolicyDocumentText(value: string): boolean {
  const normalized = normalizeWhitespace(value);
  if (normalized.length < MIN_SUBSTANTIVE_POLICY_TEXT_CHARS) {
    return false;
  }

  const quality = assessPolicyTextQuality(normalized);
  return quality.usable && (
    quality.policyTermCount >= 2 ||
    gdprTransparencyTopicMatchCount(normalized) > 0
  );
}

async function resolveUrlOnlyPolicyStub(input: {
  currentUrl: string;
  visibleText: string;
  surfaceType: PolicySurfaceObservation["surfaceType"];
  timeoutMs: number;
  deadlineAtMs?: number;
  signal?: AbortSignal;
}): Promise<{ url: string; html: string; visibleText: string } | undefined> {
  throwIfAborted(input.signal);
  const targetUrl = policyUrlOnlyStubTargetUrl({
    text: input.visibleText,
    currentUrl: input.currentUrl,
    surfaceType: input.surfaceType,
  });
  if (!targetUrl) {
    return undefined;
  }

  const fetched = await fetchText(
    targetUrl,
    deadlineBoundTimeoutMs(Math.max(800, Math.min(2_500, input.timeoutMs)), input.deadlineAtMs),
    input.signal,
  );
  if (!fetched.ok) {
    return undefined;
  }
  const visibleText = await resolvePolicyVisibleText({
    html: fetched.text,
    baseUrl: targetUrl,
    surfaceType: input.surfaceType,
    timeoutMs: Math.max(800, Math.min(2_500, input.timeoutMs)),
    deadlineAtMs: input.deadlineAtMs,
    signal: input.signal,
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
  console.info(`[v2-policy-timing] ${label} started`);
  try {
    return await run();
  } finally {
    console.info(`[v2-policy-timing] ${label} completed in ${Date.now() - startedAtMs}ms`);
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

function createConcurrencyLimiter(concurrency: number) {
  const pending: Array<() => void> = [];
  let active = 0;

  const release = () => {
    active = Math.max(0, active - 1);
    pending.shift()?.();
  };

  return async function runLimited<T>(run: () => Promise<T>): Promise<T> {
    if (active >= concurrency) {
      await new Promise<void>((resolve) => pending.push(resolve));
    }
    active += 1;
    try {
      return await run();
    } finally {
      release();
    }
  };
}

function createPolicyBrowserRuntime(existingBrowser: Browser | undefined): PolicyBrowserRuntime {
  let ownedBrowserPromise: Promise<Browser> | undefined;
  return {
    getBrowser() {
      if (existingBrowser) {
        return Promise.resolve(existingBrowser);
      }
      ownedBrowserPromise ??= chromium.launch(chromiumLaunchOptions({ headless: true }));
      return ownedBrowserPromise;
    },
    async close() {
      if (!existingBrowser && ownedBrowserPromise) {
        const browser = await ownedBrowserPromise.catch(() => undefined);
        await browser?.close().catch(() => undefined);
      }
    },
  };
}

async function warmPolicyDocumentFetchCache(input: {
  cache: Map<string, Promise<FetchTextResult>>;
  candidates: PolicySurfaceCandidate[];
  input: PolicySurfaceScannerInput;
  moduleStartedAtMs: number;
}): Promise<void> {
  await mapWithConcurrency(
    input.candidates,
    POLICY_FETCH_CONCURRENCY,
    async (candidate) => {
      await fetchPolicyDocumentSingleFlight(
        input.cache,
        candidate.normalizedUrl,
        remainingPolicyFetchMs(input.input, input.moduleStartedAtMs),
        input.input.signal,
      );
    },
  );
}

function extractCandidates(baseUrl: string, html: string, visibleText: string, allowGdprNoticeSupplement = false): PolicySurfaceCandidate[] {
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
    const deterministicBase = classifySurface({
      linkText: candidateText,
      url: normalizedUrl,
      surroundingText: surroundingTextExcerpt,
    });
    const deterministic = allowGdprNoticeSupplement && isGdprNoticeSupplementLink(candidateText, normalizedUrl, surroundingTextExcerpt ?? "")
      ? {
          ...deterministicBase,
          surfaceType: "privacy_policy" as const,
          score: Math.max(deterministicBase.score, 0.78),
          keywords: [...deterministicBase.keywords, "gdpr_notice_link", "one_hop_privacy_supplement"],
          matchedConcept: "GDPR notice",
          classifierReasonCodes: [...deterministicBase.classifierReasonCodes, "gdpr_notice_link", "one_hop_privacy_supplement"],
        }
      : deterministicBase;
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
  browserRuntime: PolicyBrowserRuntime,
): Promise<PolicySurfaceCandidate[]> {
  if (remainingMs(input, moduleStartedAtMs) < 1_500) {
    return [];
  }
  let context: Awaited<ReturnType<Browser["newContext"]>> | undefined;
  let releaseAbortContext: (() => void) | undefined;
  try {
    const browser = await browserRuntime.getBrowser();
    context = await browser.newContext(chromiumContextOptions());
    releaseAbortContext = bindAbortSignalToBrowserContext(context, input.signal);
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
    const renderedBaseUrl = /^https?:\/\//i.test(page.url()) ? page.url() : input.normalizedUrl;
    const visibleText = await page.evaluate((maxChars) => {
      const text = document.body?.innerText ?? "";
      if (text.length <= maxChars) return text;
      const headChars = Math.floor(maxChars * 0.65);
      return `${text.slice(0, headChars)}\n\n[CertScore retained tail of oversized rendered text.]\n\n${text.slice(-(maxChars - headChars))}`;
    }, MAX_RENDERED_POLICY_DISCOVERY_TEXT_CHARS).catch(() => "");
    const rawCandidates = await page.evaluate((maxCandidates) => {
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
        if (output.length >= maxCandidates) return;
        const allElements = [
          ...root.querySelectorAll("a[href], button, [role='button'], [role='link'], [aria-label], [title]"),
        ];
        const remaining = maxCandidates - output.length;
        const headCount = Math.ceil(remaining / 2);
        const elements = allElements.length > remaining
          ? [...allElements.slice(0, headCount), ...allElements.slice(-(remaining - headCount))]
          : allElements;
        for (const element of elements) {
          if (output.length >= maxCandidates) break;
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
          if (shadowRoot && output.length < maxCandidates) collect(shadowRoot, output);
        }
      }

      const output: RawCandidate[] = [];
      collect(document, output);
      return output;
    }, MAX_RENDERED_POLICY_DISCOVERY_ELEMENTS).catch(() => []);

    const renderedPolicyRegionHtml = await page.evaluate((maxChars) => {
      const regionHtml = [
        document.head?.outerHTML ?? "",
        ...Array.from(document.querySelectorAll("header, nav, footer"), (element) => element.outerHTML),
      ].join("\n");
      if (regionHtml.length <= maxChars) return regionHtml;
      const headChars = Math.floor(maxChars * 0.5);
      return `${regionHtml.slice(0, headChars)}\n${regionHtml.slice(-(maxChars - headChars))}`;
    }, MAX_RENDERED_POLICY_DISCOVERY_HTML_CHARS).catch(() => "");
    const renderedHtmlCandidates = renderedPolicyRegionHtml
      ? extractCandidates(
        renderedBaseUrl,
        renderedPolicyRegionHtml,
        htmlToVisibleText(renderedPolicyRegionHtml),
      )
      : [];
    const fallbackRawCandidates = rawCandidates.length === 0
      ? await page.locator("a[href], button, [role='button'], [role='link'], [aria-label], [title]")
      .evaluateAll((elements, maxCandidates) => {
        const headCount = Math.ceil(maxCandidates / 2);
        const selectedElements = elements.length > maxCandidates
          ? [...elements.slice(0, headCount), ...elements.slice(-(maxCandidates - headCount))]
          : elements;
        return selectedElements.map((element) => {
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
        });
      }, MAX_RENDERED_POLICY_DISCOVERY_ELEMENTS)
      .catch(() => [])
      : [];
    const retainedRawCandidates = [
      ...rawCandidates,
      ...fallbackRawCandidates,
    ];

    return dedupeCandidates([
      ...renderedHtmlCandidates,
      ...retainedRawCandidates.flatMap((candidate, index): PolicySurfaceCandidate[] => {
      const normalizedUrl = candidate.href ? normalizeUrl(candidate.href, renderedBaseUrl) : renderedBaseUrl;
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
        renderedBaseUrl,
        normalizedUrl,
        candidate.text,
        deterministic.surfaceType,
      )) {
        return [];
      }
      if (isExternalPoweredByAttributionLink(renderedBaseUrl, normalizedUrl, candidate.text)) {
        return [];
      }
      const fetchable = Boolean(candidate.href) && isFetchablePolicyCandidateForPolicySurface({
        baseUrl: renderedBaseUrl,
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
        url: candidate.href ?? renderedBaseUrl,
        normalizedUrl,
        linkText: candidate.text || normalizedUrl,
        selector: candidate.selector,
        surroundingTextExcerpt,
        domLocation: candidate.domLocation,
        sameOrigin: sameOrigin(renderedBaseUrl, normalizedUrl),
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
    releaseAbortContext?.();
    await context?.close().catch(() => undefined);
  }
}

function bindAbortSignalToBrowserContext(
  context: { close(): Promise<void> },
  signal: AbortSignal | undefined,
): () => void {
  if (!signal) return () => undefined;
  const closeContext = () => {
    void context.close().catch(() => undefined);
  };
  if (signal.aborted) closeContext();
  else signal.addEventListener("abort", closeContext, { once: true });
  return () => signal.removeEventListener("abort", closeContext);
}

interface RenderedPolicyDiscoveryResult {
  candidates: PolicySurfaceCandidate[];
  deadlineReached: boolean;
}

async function extractRenderedCandidatesBeforeSoftDeadline(
  input: PolicySurfaceScannerInput,
  moduleStartedAtMs: number,
  browserRuntime: PolicyBrowserRuntime,
): Promise<RenderedPolicyDiscoveryResult> {
  const discoveryPromise = extractRenderedCandidates(input, moduleStartedAtMs, browserRuntime);
  void discoveryPromise.catch(() => undefined);
  const remainingBudgetMs = Math.max(1, input.internalBudgetMs - (Date.now() - moduleStartedAtMs));
  const deadlineMs = input.discoveryMode === "fast"
    ? Math.min(POLICY_FAST_RENDERED_DISCOVERY_TIMEOUT_MS, remainingBudgetMs)
    : remainingBudgetMs;
  let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
  const deadlinePromise = new Promise<RenderedPolicyDiscoveryResult>((resolve) => {
    deadlineTimer = setTimeout(() => {
      void browserRuntime.close();
      resolve({ candidates: [], deadlineReached: true });
    }, deadlineMs);
  });

  try {
    return await Promise.race([
      discoveryPromise.then((candidates) => ({ candidates, deadlineReached: false })),
      deadlinePromise,
    ]);
  } finally {
    if (deadlineTimer) clearTimeout(deadlineTimer);
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

function policySurfaceSeedCandidatesFor(input: PolicySurfaceScannerInput): PolicySurfaceCandidate[] {
  const candidates: PolicySurfaceCandidate[] = [];
  const seen = new Set<string>();
  for (const [index, seed] of (input.policySurfaceSeeds ?? []).slice(0, 12).entries()) {
    const normalizedUrl = normalizeUrl(seed.url, input.normalizedUrl);
    if (!normalizedUrl || seen.has(normalizedUrl)) continue;
    seen.add(normalizedUrl);
    const seededSurface = seededSurfaceType(seed.hintType);
    if (!seededSurface) continue;
    const linkText = seededSurfaceLabel(seededSurface);
    const deterministic = classifySurface({ linkText, url: normalizedUrl });
    const confidence = typeof seed.confidence === "number" && Number.isFinite(seed.confidence)
      ? Math.max(0, Math.min(1, seed.confidence))
      : 0.7;
    candidates.push({
      candidateId: `policy_seed_candidate_${index}`,
      url: normalizedUrl,
      normalizedUrl,
      linkText,
      domLocation: "body",
      sameOrigin: sameOrigin(input.normalizedUrl, normalizedUrl),
      fetchable: true,
      clickable: false,
      mayLeadToConsentControls: ["your_privacy_choices", "consent_preferences"].includes(seededSurface),
      observationOnly: false,
      deterministicSurfaceType: seededSurface,
      deterministicScore: Math.max(0.72, deterministic.score, confidence),
      deterministicKeywordMatches: uniqueStrings([
        ...deterministic.keywords,
        `policy_seed:${seed.hintType}`,
      ]),
      ...classifierCandidateFields(deterministic),
      deterministicClassifierReasonCodes: uniqueStrings([
        ...deterministic.classifierReasonCodes,
        "bounded_policy_surface_seed",
        seed.source,
      ]),
      discoveryMethod: seed.source === "prior_scan_hint" ? "sitemap_or_common_path" : "guessed_common_path",
      rankedFromCommonPath: seed.source === "canonical_legal_surface_hint",
      seedSource: seed.source,
    });
  }
  return candidates;
}

function seededSurfaceType(hintType: string): PolicySurfaceObservation["surfaceType"] | undefined {
  switch (hintType) {
    case "privacy_policy":
      return "privacy_policy";
    case "cookie_policy":
      return "cookie_policy";
    case "privacy_choice":
      return "your_privacy_choices";
    case "consent_preferences":
      return "consent_preferences";
    default:
      return undefined;
  }
}

function seededSurfaceLabel(surfaceType: PolicySurfaceObservation["surfaceType"]): string {
  switch (surfaceType) {
    case "privacy_policy":
      return "Privacy policy";
    case "cookie_policy":
      return "Cookie policy";
    case "your_privacy_choices":
      return "Your privacy choices";
    case "consent_preferences":
      return "Consent preferences";
    default:
      return surfaceType.replaceAll("_", " ");
  }
}

function commonPolicyPathsFor(baseUrl: string, localeHints: SupportedPrivacyEvidenceLocale[]): string[] {
  const genericCorePaths = [
    "/privacy",
    "/privacy-policy",
    "/privacy-policy/",
    "/privacy-notice",
    "/datenschutz",
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
  const hintedLocalePaths = uniqueStrings(localeHints.flatMap(privacySurfacePathsForLocale));
  return uniqueStrings([
    ...genericCorePaths,
    ...hintedLocalePaths,
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
  let hostname = "";
  try {
    hostname = new URL(baseUrl).hostname.toLowerCase();
  } catch {
    // Ignore malformed fixture URLs.
  }
  const declaredLocales = new Set(
    [...html.matchAll(/(?:\blang|hreflang|http-equiv=["']content-language["'][^>]*content)=["']?([a-z]{2})(?:[-_][a-z]{2})?/gi)]
      .map((match) => match[1]?.toLowerCase())
      .filter((value): value is string => Boolean(value)),
  );
  const haystack = `${html.slice(0, 20_000)} ${visibleText.slice(0, 20_000)}`.normalize("NFKC").toLowerCase();
  for (const entry of PRIVACY_EVIDENCE_LOCALE_REGISTRY) {
    if (declaredLocales.has(entry.locale)) add(entry.locale);
    if (entry.tldHints.some((tld) => hostname.endsWith(tld))) add(entry.locale);
    const directLocaleSignal = [
      ...entry.privacyPolicyLabels,
      ...entry.cookiePolicyLabels,
      ...entry.cookieSettingsLabels,
    ].some((hint) => haystack.includes(hint.normalize("NFKC").toLowerCase()));
    if (directLocaleSignal) add(entry.locale);
  }
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
      policyCandidateDiscoveryPriority(left) - policyCandidateDiscoveryPriority(right) ||
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

  if (candidate.deterministicClassifierReasonCodes.includes("variant_general_scope")) {
    score += 6;
  }

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

function policyCandidateDiscoveryPriority(candidate: PolicySurfaceCandidate): number {
  if (
    candidate.clickable &&
    ["footer_link", "header_link", "page_text_link"].includes(candidate.discoveryMethod)
  ) {
    return 0;
  }
  if (candidate.seedSource === "prior_scan_hint") {
    return 1;
  }
  if (candidate.discoveryMethod === "guessed_common_path") {
    return 3;
  }
  return 2;
}

function safeUrlPath(value: string): string {
  try {
    return new URL(value).pathname.replace(/\/+$/, "") || "/";
  } catch {
    return value;
  }
}

function hasCompleteFetchableStaticCoreCoverage(candidates: PolicySurfaceCandidate[]): boolean {
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
    surfaceTypes.has("your_privacy_choices") ||
    surfaceTypes.has("do_not_sell_or_share");
  return surfaceTypes.has("privacy_policy") &&
    surfaceTypes.has("terms") &&
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
      policyCandidateDiscoveryPriority(left) - policyCandidateDiscoveryPriority(right) ||
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
  seedSource?: PolicySurfaceCandidate["seedSource"];
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
      ...(candidate.seedSource ? { seedSource: candidate.seedSource } : {}),
    }));
}

function isStateSpecificPrivacyPath(value: string): boolean {
  const path = safeUrlPath(value).toLowerCase();
  return /california|state-privacy|do-not-sell|notice-at-collection/.test(path);
}

function uniqueStrings(values: string[]): string[] {
  return values.filter((value, index) => values.indexOf(value) === index);
}

function uniqueEvidenceRefs(values: EvidenceRef[]): EvidenceRef[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = `${value.refId}:${value.artifactId ?? ""}:${value.path ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function highValueSecondaryCandidatesFromPolicyPage(
  baseUrl: string,
  html: string,
  visibleText: string,
): PolicySurfaceCandidate[] {
  return dedupeCandidates([
    ...extractCandidates(baseUrl, html, visibleText, true),
    ...extractControlCandidates(baseUrl, html, visibleText),
  ]).filter((candidate) =>
    isHighValuePolicySupplement(candidate) &&
    isSameOriginPolicyPageSupplement(baseUrl, candidate)
  );
}

export function isGdprNoticeSupplementLink(linkText: string, normalizedUrl: string, surroundingTextExcerpt: string): boolean {
  const evidence = `${linkText} ${normalizedUrl} ${surroundingTextExcerpt}`;
  const explicitNotice = /\b(?:gdpr|eu|eea|european\s+economic\s+area)\b.{0,80}\b(?:privacy|notice|rights|protections?)\b|\b(?:privacy|notice|rights|protections?)\b.{0,80}\b(?:gdpr|eu|eea|european\s+economic\s+area)\b/i.test(evidence);
  const contextualClickThrough = /\b(?:additional\s+(?:rights|protections?)|eu(?:ropean)?\s+(?:residents?|users?)|international\s+users?)\b.{0,140}\bclick\s+here\b/i.test(evidence);
  return explicitNotice || contextualClickThrough;
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
  signal: AbortSignal | undefined = input.signal,
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
    signal,
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
  throwIfAborted(input.signal);
  if (deadlineRemainingMs(input.absoluteDeadlineAtMs) <= 10) {
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
    signal: input.signal,
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
  const linkObservationState = candidate.observationOnly || candidate.clickable
    ? "observed" as const
    : "candidate" as const;
  const documentFetchState = input.status === "fetched"
    ? "fetched" as const
    : input.status === "failed"
      ? "failed" as const
      : input.status === "skipped_budget"
        ? "skipped_budget" as const
        : "not_attempted" as const;
  const documentEvaluationState = input.status === "fetched"
    ? "usable" as const
    : input.fetchFailureReason === "low_quality_access_challenge"
      ? "blocked" as const
      : input.fetchFailureReason === "insufficient_policy_text"
        ? "insufficient" as const
        : "not_attempted" as const;
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
    linkObservationState,
    documentFetchState,
    documentEvaluationState,
    documentOwnerEntity: input.documentOwnerEntity,
    targetRelationship: input.targetRelationship,
    ownershipConfidence: input.ownershipConfidence,
    ownershipReasonCodes: input.ownershipReasonCodes ?? [],
    contentCoverage: input.contentCoverage,
    httpStatus: input.httpStatus,
    finalUrl: input.finalUrl,
    redirectChain: input.redirectChain ?? [],
    fetchFailureReason: input.fetchFailureReason,
    matchedLocale: candidate.deterministicMatchedLocale,
    classifierProvenance: candidate.deterministicClassifierProvenance,
    classifierReasonCodes: candidate.deterministicClassifierReasonCodes.slice(0, 16),
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
    policyCookieDisclosures: input.policyCookieDisclosures ?? [],
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

function normalizedEntityToken(value: string | undefined): string | undefined {
  const normalized = normalizeWhitespace(value ?? "")
    .replace(/\b(?:privacy|data protection|cookie)\s+(?:policy|notice|statement)\b/gi, " ")
    .replace(/[|–—-].*$/, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
  return normalized.length >= 2 ? normalized.slice(0, 240) : undefined;
}

export function classifyPolicyDocumentOwnership(input: {
  documentTitle?: string;
  documentUrl: string;
  targetUrl: string;
  text: string;
}): Pick<
  PolicySurfaceObservation,
  "documentOwnerEntity" | "targetRelationship" | "ownershipConfidence" | "ownershipReasonCodes"
> {
  const targetSite = getRegistrableDomainFromUrl(input.targetUrl);
  const documentSite = getRegistrableDomainFromUrl(input.documentUrl);
  const documentHost = (() => {
    try {
      return new URL(input.documentUrl).hostname.replace(/^www\./, "");
    } catch {
      return documentSite ?? undefined;
    }
  })();
  const titleEntity = normalizedEntityToken(input.documentTitle);
  const documentEntity = titleEntity ?? documentHost;

  if (targetSite && documentSite && targetSite === documentSite) {
    return {
      documentOwnerEntity: documentEntity ?? targetSite,
      targetRelationship: "target_controller",
      ownershipConfidence: 0.98,
      ownershipReasonCodes: ["same_registrable_domain_as_scan_target"],
    };
  }

  const targetBrand = targetSite?.split(".")[0]?.replace(/[-_]+/g, " ");
  const documentBrand = documentSite?.split(".")[0]?.replace(/[-_]+/g, " ");
  const ownershipExcerpt = normalizeWhitespace(
    `${input.documentTitle ?? ""} ${input.text.slice(0, 4_000)}`,
  );
  const targetNamed = targetBrand
    ? new RegExp(`\\b${escapeRegExp(targetBrand)}\\b`, "i").test(ownershipExcerpt)
    : false;
  const documentNamed = documentBrand
    ? new RegExp(`\\b${escapeRegExp(documentBrand)}\\b`, "i").test(ownershipExcerpt)
    : false;
  const controllerLanguage =
    /\b(?:data controller|controller of (?:your|the) (?:personal )?data|responsible for (?:processing|this (?:policy|notice))|this (?:privacy )?(?:policy|notice) applies to)\b/i
      .test(ownershipExcerpt);

  if (targetNamed && controllerLanguage) {
    return {
      documentOwnerEntity: documentEntity ?? targetBrand,
      targetRelationship: "first_party_brand",
      ownershipConfidence: 0.78,
      ownershipReasonCodes: [
        "cross_site_document",
        "target_brand_named_in_controller_context",
      ],
    };
  }

  if (documentSite && targetSite && documentSite !== targetSite && documentNamed && !targetNamed) {
    return {
      documentOwnerEntity: documentEntity ?? documentSite,
      targetRelationship: "service_provider",
      ownershipConfidence: controllerLanguage ? 0.94 : 0.86,
      ownershipReasonCodes: [
        "cross_registrable_domain",
        "document_brand_named_without_target_brand",
        ...(controllerLanguage ? ["document_brand_controller_language"] : []),
      ],
    };
  }

  return {
    documentOwnerEntity: documentEntity,
    targetRelationship: "unknown",
    ownershipConfidence: 0.45,
    ownershipReasonCodes: ["document_ownership_not_deterministically_attributed"],
  };
}

function policyContentCoverage(input: {
  extractedSections: PolicySurfaceObservation["retainedPolicySections"];
  retainedSections: PolicySurfaceObservation["retainedPolicySections"];
  sourceText: string;
}) {
  const limitationKeys = [
    input.sourceText.length >= MAX_FETCHED_TEXT_CHARS
      ? "policy_source_text_reached_retention_limit"
      : null,
    input.extractedSections.length > input.retainedSections.length
      ? "policy_section_inventory_bounded"
      : null,
    input.extractedSections.some((section) => section.extractionState === "truncated")
      ? "policy_section_text_bounded"
      : null,
    input.retainedSections.some((section) => section.quality === "limited")
      ? "limited_policy_sections_retained"
      : null,
  ].filter((value): value is string => value !== null);
  const truncated = limitationKeys.some((key) =>
    key === "policy_source_text_reached_retention_limit" ||
    key === "policy_section_inventory_bounded" ||
    key === "policy_section_text_bounded"
  );
  const partial = !truncated && (
    input.retainedSections.length === 0 ||
    input.retainedSections.every((section) => section.quality !== "strong")
  );
  return {
    status: truncated ? "truncated" as const : partial ? "partial" as const : "complete" as const,
    sourceTextChars: input.sourceText.length,
    extractedSectionCount: input.extractedSections.length,
    retainedSectionCount: input.retainedSections.length,
    retainedTableRowCount: input.retainedSections.filter((section) =>
      /\btable\b|(?:name|provider|purpose|duration)\s*\|/i.test(section.heading)
    ).length,
    limitationKeys,
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
    // Policy fetch and rendered-text inputs are already bounded by the scanner's
    // 500k text limits. Classify that bounded source directly so canonical locale
    // phrases near the end of a long policy are not lost to the English-oriented
    // Nano analysis packet. The classifier retains only bounded native excerpts.
    text,
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
  subjectScope?: "controller";
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
    textPatterns: [/servers around the world/i, /processed? outside (?:your )?country/i, /outside (?:of )?the country where you live/i, /outside (?:the )?(?:eea|european economic area|uk|united kingdom|eu|european union)/i, /data transfers? to third countr(?:y|ies)/i, /third countr(?:y|ies)/i, /legal frameworks? relating to the transfer of data/i, /data protection laws vary/i, /agreements?.{0,180}(?:protect|safeguard)/i, /adequacy/i, /Article 45|Art\.\s*45/i, /Article 46|Art\.\s*46/i, /safeguards/i, /EU-U\.S\. Data Privacy Framework/i, /UK Extension/i, /Swiss-U\.S\./i],
    observedPattern: /servers around the world|processed? (?:on servers )?outside (?:your )?country|outside (?:of )?the country where you live|data transfers? to third countr(?:y|ies)|(?:third parties|service providers?|business partners?|processors?|vendors?|recipients?).{0,220}outside (?:the )?(?:eea|european economic area|uk|united kingdom|eu|european union)|agreements?.{0,220}(?:personal information|personal data|data|information).{0,220}(?:protect|protected|safeguard|outside (?:the )?(?:eea|european economic area|uk|united kingdom|eu|european union))|legal frameworks? relating to the transfer of data|data protection laws vary|adequacy decision|(?:Article|Art\.)\s*45|(?:Article|Art\.)\s*46|appropriate safeguards|EU-U\.S\. Data Privacy Framework|UK Extension|Swiss-U\.S\.|standard contractual clauses/i,
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
    subjectScope: "controller",
    headingPatterns: [/contact/i, /European requirements/i, /data protection/i],
    textPatterns: [/privacy office/i, /data protection office/i, /data protection officer/i, /\bdpo\b/i, /contact (?:google|us)/i, /questions about this policy/i, /Google LLC/i, /Google Ireland Limited/i],
    observedPattern: /data protection officer|\bdpo\b/i,
    partialPattern: /privacy office|data protection office|contact (?:google|us)|questions about this policy|Google LLC|Google Ireland Limited/i,
  },
  {
    disclosureType: "controller_contact",
    subjectScope: "controller",
    headingPatterns: [/contact/i, /European requirements/i, /information on (?:the )?controller/i, /controller/i],
    textPatterns: [/\bcontroller\b/i, /Art\.?\s*4.{0,24}(?:No\.?\s*)?7\s+GDPR/i, /\bE-?Mail\s*:/i, /contact Google/i, /contact us/i, /questions about this policy/i, /privacy office/i, /data protection office/i, /data protection officer/i, /Google LLC/i, /Google Ireland Limited/i],
    observedPattern: /information on (?:the )?controller|data controller|\bcontroller\b|Art\.?\s*4.{0,24}(?:No\.?\s*)?7\s+GDPR|privacy@|contact (?:us|our privacy team).{0,120}(?:privacy|data protection)/i,
    partialPattern: /Google LLC|Google Ireland Limited|contact Google|questions about this policy|privacy office|data protection office/i,
  },
  {
    disclosureType: "processing_purposes",
    headingPatterns: [/processing purposes?/i, /purposes? of processing/i, /why we (?:collect|use|process)/i],
    textPatterns: [/purposes?/i, /why we (?:collect|use|process)/i, /we (?:collect|use|process).{0,120}(?:to|for)/i],
    observedPattern: /purposes? of processing|processing purposes?|why we (?:collect|use|process)|we (?:collect|use|process).{0,120}(?:to|for)/i,
  },
  {
    disclosureType: "legal_basis",
    headingPatterns: [/legal basis/i, /lawful basis/i, /European requirements/i],
    textPatterns: [/Article 6/i, /legitimate interests/i, /consent/i, /contract/i, /legal obligation/i, /public task/i, /vital interests/i, /required by law/i],
    observedPattern: /legal basis|lawful basis|Article 6|legitimate interests?|performance of (?:a )?contract|contractual necessity|legal obligation|public task|vital interests/i,
    partialPattern: /required by law|consent/i,
  },
  {
    disclosureType: "recipients_or_vendor_categories",
    headingPatterns: [/recipients?/i, /service providers?/i, /processors?/i, /sharing/i],
    textPatterns: [/recipients?/i, /service providers?/i, /processors?/i, /affiliates?/i, /third parties/i],
    observedPattern: /recipients? of (?:personal )?(?:data|information)|categories of recipients?|service providers?.{0,160}(?:process|receive|access)|processors?.{0,160}(?:personal )?(?:data|information)|share.{0,160}(?:affiliates?|third parties|service providers?)/i,
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
  deadlineAtMs?: number;
  signal?: AbortSignal;
}): Promise<string | null> {
  throwIfAborted(input.signal);
  if (input.depth > 2) {
    return null;
  }

  const noticeUrls = extractOneTrustNoticeUrls(input.html, input.baseUrl).slice(0, 4);
  for (let index = 0; index < noticeUrls.length; index += 2) {
    throwIfAborted(input.signal);
    if (deadlineRemainingMs(input.deadlineAtMs) <= 10) return null;
    const batch = noticeUrls.slice(index, index + 2);
    const results = await Promise.all(batch.map((noticeUrl) =>
      extractOneTrustNoticeTextFromUrl(input, noticeUrl)
    ));
    const retained = results.find((text): text is string => Boolean(text && text.length > 500));
    if (retained) {
      return retained;
    }
  }
  return null;
}

async function extractOneTrustNoticeTextFromUrl(
  input: {
    html: string;
    baseUrl: string;
    timeoutMs: number;
    depth: number;
    deadlineAtMs?: number;
    signal?: AbortSignal;
  },
  noticeUrl: string,
): Promise<string | null> {
  throwIfAborted(input.signal);
  const fetched = await fetchText(
    noticeUrl,
    deadlineBoundTimeoutMs(input.timeoutMs, input.deadlineAtMs),
    input.signal,
  );
  if (!fetched.ok || !fetched.text.trim()) {
    return null;
  }
  const payload = parseJsonObject(fetched.text);
  if (!payload) {
    return null;
  }

  const policyUrls = extractOneTrustPolicyUrls(payload, noticeUrl).slice(0, 2);
  for (const policyUrl of policyUrls) {
    throwIfAborted(input.signal);
    if (deadlineRemainingMs(input.deadlineAtMs) <= 10) return null;
    const policy = await fetchText(
      policyUrl,
      deadlineBoundTimeoutMs(input.timeoutMs, input.deadlineAtMs),
      input.signal,
    );
    if (!policy.ok || !policy.text.trim()) {
      continue;
    }
    const policyPayload = parseJsonObject(policy.text);
    if (policyPayload) {
      const nestedPolicyUrls = extractOneTrustPolicyUrls(policyPayload, policyUrl)
        .filter((nestedUrl) => nestedUrl !== policyUrl)
        .slice(0, 2);
      for (const nestedPolicyUrl of nestedPolicyUrls) {
        throwIfAborted(input.signal);
        if (deadlineRemainingMs(input.deadlineAtMs) <= 10) return null;
        const nestedPolicy = await fetchText(
          nestedPolicyUrl,
          deadlineBoundTimeoutMs(input.timeoutMs, input.deadlineAtMs),
          input.signal,
        );
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
          deadlineAtMs: input.deadlineAtMs,
          signal: input.signal,
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
      deadlineAtMs: input.deadlineAtMs,
      signal: input.signal,
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
  return directText && directText.length > 500 ? directText : null;
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

type FetchTextResult = {
  attempts?: PolicyFetchAttemptDiagnostic[];
  documentFormat?: "pdf" | "text";
  ok: boolean;
  status?: number;
  text: string;
};

function policyFetchRedirectChain(result: FetchTextResult): string[] {
  return uniqueStrings((result.attempts ?? [])
    .flatMap((attempt) => [attempt.requestedUrl, attempt.finalUrl].filter((value): value is string => Boolean(value)))
    .map(boundedDiagnosticUrl))
    .slice(0, 8);
}

function successfulPolicyFetchFinalUrl(result: FetchTextResult, fallbackUrl: string): string {
  const finalUrl = [...(result.attempts ?? [])]
    .reverse()
    .find((attempt) => attempt.outcome === "fetched")
    ?.finalUrl;
  return finalUrl && /^https?:\/\//i.test(finalUrl) ? finalUrl : fallbackUrl;
}

type PdfParseConstructor = new (input: { data: Uint8Array }) => {
  destroy(): Promise<void>;
  getText(input: {
    first: number;
    imageBuffer: boolean;
    imageDataUrl: boolean;
    pageJoiner: string;
  }): Promise<{ text: string }>;
};

function fetchPolicyDocumentSingleFlight(
  cache: Map<string, Promise<FetchTextResult>>,
  url: string,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<FetchTextResult> {
  const key = policyDocumentFetchCacheKey(url);
  const existing = cache.get(key);
  if (existing) {
    return existing;
  }
  const pending = fetchText(url, timeoutMs, signal);
  cache.set(key, pending);
  return pending;
}

function fetchRenderedPolicyDocumentSingleFlight(
  fetchCaches: PolicyDocumentFetchCaches,
  input: {
    input: PolicySurfaceScannerInput;
    url: string;
    timeoutMs: number;
  },
): Promise<FetchTextResult> {
  // Keep failure-recovery and low-quality-text rendering in separate buckets:
  // the latter intentionally has a longer evidence wait and must never inherit
  // a shorter earlier attempt.
  const renderClass = input.timeoutMs >= 5_000 ? "quality" : "failure";
  const key = `${policyDocumentFetchCacheKey(input.url)}|${renderClass}`;
  const existing = fetchCaches.rendered.get(key);
  if (existing) {
    return existing;
  }
  const pending = fetchCaches.runRenderedFetch(() => fetchRenderedPolicyDocumentText({
    ...input,
    browserRuntime: fetchCaches.browserRuntime,
  }));
  fetchCaches.rendered.set(key, pending);
  return pending;
}

function policyDocumentFetchCacheKey(value: string): string {
  return canonicalPolicyUrlIdentity(value);
}

const POLICY_TRACKING_QUERY_PARAM = /^(?:utm_.+|ref|ref_|referrer|source|campaign|campaignid|tag|linkcode|creative|creativeasin|ascsubtag|pf_rd_.+)$/i;
const POLICY_SENSITIVE_QUERY_PARAM = /(?:token|secret|password|passwd|email|session|auth|signature|sig|key)$/i;

export function canonicalPolicyUrlIdentity(value: string): string {
  try {
    const parsed = new URL(value);
    parsed.username = "";
    parsed.password = "";
    parsed.hash = "";
    const retained = [...parsed.searchParams.entries()]
      .filter(([name]) =>
        !POLICY_TRACKING_QUERY_PARAM.test(name) &&
        !POLICY_SENSITIVE_QUERY_PARAM.test(name)
      )
      .sort(([leftName, leftValue], [rightName, rightValue]) =>
        leftName.localeCompare(rightName) || leftValue.localeCompare(rightValue)
      );
    parsed.search = "";
    for (const [name, parameterValue] of retained) {
      parsed.searchParams.append(name, parameterValue);
    }
    parsed.pathname = parsed.pathname.replace(/\/+$/, "") || "/";
    return parsed.toString();
  } catch {
    return value.replace(/#.*$/, "");
  }
}

async function fetchText(
  url: string,
  timeoutMs: number,
  signal?: AbortSignal,
  options: { allowHttpTransportFallback?: boolean } = {},
): Promise<FetchTextResult> {
  const startedAtMs = Date.now();
  const primary = await fetchTextOnce(url, timeoutMs, signal);
  if (primary.ok || primary.status !== undefined) {
    return primary;
  }

  const attempts = [...(primary.attempts ?? [])];
  const httpFallbackUrl = options.allowHttpTransportFallback ? httpTransportFallbackUrl(url) : null;
  let httpFallbackResult: FetchTextResult | null = null;
  if (httpFallbackUrl) {
    httpFallbackResult = await fetchTextOnce(httpFallbackUrl, Math.max(500, Math.min(5_000, timeoutMs)), signal);
    attempts.push(...(httpFallbackResult.attempts ?? []));
    if (httpFallbackResult.ok) {
      return { ...httpFallbackResult, attempts };
    }
  }

  const fallbackUrl = wwwFallbackUrlForPolicyFetch(url);
  if (!fallbackUrl) {
    return { ...(httpFallbackResult ?? primary), attempts };
  }

  const remainingTimeoutMs = Math.max(500, timeoutMs - (Date.now() - startedAtMs));
  const fallback = await fetchTextOnce(fallbackUrl, remainingTimeoutMs, signal);
  return {
    ...fallback,
    attempts: [
      ...attempts,
      ...(fallback.attempts ?? []),
    ],
  };
}

async function fetchTextOnce(url: string, timeoutMs: number, parentSignal?: AbortSignal): Promise<FetchTextResult> {
  const controller = new AbortController();
  const abortFromParent = () => controller.abort(parentSignal?.reason);
  if (parentSignal?.aborted) abortFromParent();
  else parentSignal?.addEventListener("abort", abortFromParent, { once: true });
  const timeout = setTimeout(() => controller.abort(), Math.max(500, timeoutMs));
  try {
    const response = await requestBoundedPolicyResponse(url, controller.signal);
    const contentType = response.headers.get("content-type") ?? "";
    const contentEncoding = response.headers.get("content-encoding") ?? "";
    const attemptBase = {
      mode: "direct" as const,
      requestedUrl: url,
      finalUrl: response.finalUrl,
      httpStatus: response.status,
      ...(contentType ? { contentType } : {}),
    };
    const isTextResponse = /text|html|json/i.test(contentType);
    const isPdfResponse = isPdfPolicyResponse(url, contentType) && !isTextResponse;
    if (response.status < 200 || response.status >= 300) {
      return {
        attempts: [{ ...attemptBase, outcome: "http_error" }],
        ok: false,
        status: response.status,
        text: "",
      };
    }
    if (!isTextResponse && !isPdfResponse) {
      return {
        attempts: [{ ...attemptBase, outcome: "unsupported_content_type" }],
        ok: false,
        status: response.status,
        text: "",
      };
    }
    const contentLength = contentLengthFromHeader(response.headers.get("content-length"));
    if (isPdfResponse && contentLength !== undefined && contentLength > MAX_POLICY_PDF_BYTES) {
      return {
        attempts: [{ ...attemptBase, outcome: "oversized_pdf" }],
        ok: false,
        status: response.status,
        text: "",
      };
    }
    const bodyLimitBytes = isPdfResponse ? MAX_POLICY_PDF_BYTES : MAX_POLICY_TEXT_RESPONSE_BYTES;
    const { body, truncated } = response;
    if (isPdfResponse) {
      if (truncated) {
        return {
          attempts: [{ ...attemptBase, outcome: "oversized_pdf" }],
          ok: false,
          status: response.status,
          text: "",
        };
      }
      return {
        attempts: [{ ...attemptBase, outcome: "fetched" }],
        documentFormat: "pdf",
        ok: true,
        status: response.status,
        text: await extractPdfPolicyText(body),
      };
    }
    const decodedBody = decodeBoundedPolicyResponseBody(body, contentEncoding);
    const decodingAttempt = {
      ...(contentEncoding ? { contentEncoding: contentEncoding.slice(0, 40) } : {}),
      compressedSizeBytes: body.byteLength,
      decompressedSizeBytes: decodedBody.body?.byteLength,
      decodingOutcome: decodedBody.outcome,
    };
    if (!decodedBody.ok) {
      return {
        attempts: [{
          ...attemptBase,
          ...decodingAttempt,
          outcome: decodedBody.outcome === "too_large"
            ? "decompressed_body_too_large"
            : "content_decoding_failed",
        }],
        ok: false,
        status: response.status,
        text: "",
      };
    }
    return {
      attempts: [{ ...attemptBase, ...decodingAttempt, outcome: "fetched" }],
      documentFormat: "text",
      ok: true,
      status: response.status,
      text: boundedFetchedText(decodeFetchedPolicyText(decodedBody.body, contentType), MAX_FETCHED_TEXT_CHARS),
    };
  } catch (error) {
    const outcome: PolicyFetchAttemptOutcome =
      error instanceof Error && error.name === "AbortError"
        ? "timeout"
        : "network_error";
    return {
      attempts: [{
        mode: "direct",
        requestedUrl: url,
        outcome,
      }],
      ok: false,
      text: "",
    };
  } finally {
    clearTimeout(timeout);
    parentSignal?.removeEventListener("abort", abortFromParent);
  }
}

type BoundedPolicyResponse = {
  body: Uint8Array;
  finalUrl: string;
  headers: Headers;
  status: number;
  truncated: boolean;
};

export async function requestBoundedPolicyResponse(
  url: string,
  signal: AbortSignal,
  redirectsRemaining = 5,
): Promise<BoundedPolicyResponse> {
  throwIfAborted(signal);
  const parsed = new URL(url);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`Unsupported policy URL protocol: ${parsed.protocol}`);
  }
  const address = await resolvePolicyHostname(parsed.hostname, signal);
  throwIfAborted(signal);

  return await new Promise<BoundedPolicyResponse>((resolve, reject) => {
    let settled = false;
    let activeResponse: import("node:http").IncomingMessage | undefined;
    const finishReject = (error: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    const finishResolve = (value: BoundedPolicyResponse) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value);
    };
    const request = (parsed.protocol === "https:" ? httpsRequest : httpRequest)({
      headers: {
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,application/pdf;q=0.8,*/*;q=0.7",
        "accept-encoding": "identity",
        "accept-language": "en-US,en;q=0.8,de;q=0.7,fr;q=0.7,es;q=0.7,it;q=0.7,nl;q=0.7,pl;q=0.7",
        host: parsed.host,
        "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36",
      },
      hostname: address,
      method: "GET",
      path: `${parsed.pathname}${parsed.search}`,
      port: parsed.port || undefined,
      servername: parsed.hostname,
    }, (incoming) => {
      activeResponse = incoming;
      const status = incoming.statusCode ?? 0;
      const location = incoming.headers.location;
      if (status >= 300 && status < 400 && location && redirectsRemaining > 0) {
        incoming.resume();
        const redirectedUrl = new URL(location, parsed).toString();
        void requestBoundedPolicyResponse(redirectedUrl, signal, redirectsRemaining - 1)
          .then(finishResolve, finishReject);
        return;
      }
      const headers = new Headers();
      for (const [name, value] of Object.entries(incoming.headers)) {
        if (Array.isArray(value)) {
          for (const item of value) headers.append(name, item);
        } else if (value !== undefined) {
          headers.set(name, value);
        }
      }
      const chunks: Buffer[] = [];
      let sizeBytes = 0;
      let truncated = false;
      incoming.on("data", (chunk: Buffer) => {
        if (settled || truncated) return;
        const remaining = MAX_POLICY_TEXT_RESPONSE_BYTES - sizeBytes;
        if (chunk.byteLength > remaining) {
          if (remaining > 0) chunks.push(chunk.subarray(0, remaining));
          sizeBytes += Math.max(0, remaining);
          truncated = true;
          incoming.destroy();
          finishResolve({
            body: Buffer.concat(chunks, sizeBytes),
            finalUrl: parsed.toString(),
            headers,
            status,
            truncated: true,
          });
          return;
        }
        chunks.push(chunk);
        sizeBytes += chunk.byteLength;
      });
      incoming.once("end", () => finishResolve({
        body: Buffer.concat(chunks, sizeBytes),
        finalUrl: parsed.toString(),
        headers,
        status,
        truncated,
      }));
      incoming.once("error", finishReject);
    });
    const abortRequest = () => {
      const reason = abortReason(signal);
      const error = new Error(reason?.message ?? "Policy HTTP request aborted.", { cause: reason ?? undefined });
      error.name = "AbortError";
      activeResponse?.destroy(error);
      request.destroy(error);
    };
    const cleanup = () => signal.removeEventListener("abort", abortRequest);
    signal.addEventListener("abort", abortRequest, { once: true });
    request.once("error", finishReject);
    request.end();
  });
}

async function resolvePolicyHostname(hostname: string, signal: AbortSignal): Promise<string> {
  if (isIP(hostname)) return hostname;
  const resolver = new Resolver();
  const cancelResolution = () => resolver.cancel();
  signal.addEventListener("abort", cancelResolution, { once: true });
  try {
    try {
      const addresses = await awaitAbortablePolicyOperation(
        resolver.resolve4(hostname),
        signal,
        "Policy hostname resolution aborted.",
      );
      if (addresses[0]) return addresses[0];
    } catch (error) {
      throwIfAborted(signal);
      const addresses = await awaitAbortablePolicyOperation(
        resolver.resolve6(hostname),
        signal,
        "Policy hostname resolution aborted.",
      );
      if (addresses[0]) return addresses[0];
      throw error;
    }
    throw new Error(`Policy hostname did not resolve: ${hostname}`);
  } finally {
    signal.removeEventListener("abort", cancelResolution);
  }
}

export async function readBoundedResponseBody(
  response: Response,
  maxBytes: number,
  signal?: AbortSignal,
): Promise<{ body: Uint8Array; truncated: boolean }> {
  const reader = response.body?.getReader();
  if (!reader) {
    return { body: new Uint8Array(), truncated: false };
  }
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  let truncated = false;
  let completed = false;
  try {
    while (totalBytes < maxBytes) {
      throwIfAborted(signal);
      const next = await readResponseBodyChunk(reader, signal);
      if (next.done) {
        completed = true;
        break;
      }
      const remainingBytes = maxBytes - totalBytes;
      if (next.value.byteLength > remainingBytes) {
        chunks.push(next.value.subarray(0, remainingBytes));
        totalBytes += remainingBytes;
        truncated = true;
        break;
      }
      chunks.push(next.value);
      totalBytes += next.value.byteLength;
      if (totalBytes === maxBytes) {
        truncated = true;
        break;
      }
    }
  } finally {
    if (truncated || !completed) {
      await boundedCleanup(reader.cancel(), 100);
    } else {
      reader.releaseLock();
    }
  }
  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { body, truncated };
}

async function readResponseBodyChunk(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  signal?: AbortSignal,
): Promise<ReadableStreamReadResult<Uint8Array>> {
  return awaitAbortablePolicyOperation(
    reader.read(),
    signal,
    "Policy response body read aborted.",
  );
}

export async function awaitAbortablePolicyOperation<T>(
  work: Promise<T>,
  signal: AbortSignal | undefined,
  abortMessage: string,
): Promise<T> {
  if (!signal) return work;
  throwIfAborted(signal);

  let abortListener: (() => void) | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_resolve, reject) => {
        abortListener = () => {
          const reason = abortReason(signal);
          const error = new Error(reason?.message ?? abortMessage, {
            cause: reason ?? undefined,
          });
          error.name = "AbortError";
          reject(error);
        };
        signal.addEventListener("abort", abortListener, { once: true });
      }),
    ]);
  } finally {
    if (abortListener) signal.removeEventListener("abort", abortListener);
  }
}

function combineAbortSignals(...signals: Array<AbortSignal | undefined>): AbortSignal | undefined {
  const active = signals.filter((signal): signal is AbortSignal => Boolean(signal));
  if (active.length === 0) return undefined;
  if (active.length === 1) return active[0];
  const controller = new AbortController();
  for (const signal of active) {
    if (signal.aborted) {
      controller.abort(signal.reason);
      break;
    }
    signal.addEventListener("abort", () => controller.abort(signal.reason), { once: true });
  }
  return controller.signal;
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

type PolicyResponseDecodingResult =
  | {
      body: Uint8Array;
      ok: true;
      outcome: "identity" | "gzip" | "br" | "deflate";
    }
  | {
      body?: undefined;
      ok: false;
      outcome: "failed" | "too_large";
    };

export function decodeBoundedPolicyResponseBody(
  body: Uint8Array,
  contentEncodingHeader = "",
): PolicyResponseDecodingResult {
  const contentEncoding = contentEncodingHeader.split(",")[0]?.trim().toLowerCase() ?? "";
  const magicEncoding = compressionEncodingFromMagic(body);
  const declaredEncoding = (
    contentEncoding === "gzip" || contentEncoding === "x-gzip"
      ? "gzip"
      : contentEncoding === "br"
        ? "br"
        : contentEncoding === "deflate"
          ? "deflate"
          : "identity"
  );
  const encoding = magicEncoding ?? (
    declaredEncoding !== "identity" && looksLikePlainPolicyTextBytes(body)
      ? "identity"
      : declaredEncoding
  );
  if (encoding === "identity") {
    return body.byteLength <= MAX_POLICY_DECOMPRESSED_BYTES
      ? { body, ok: true, outcome: "identity" }
      : { ok: false, outcome: "too_large" };
  }
  try {
    const options = { maxOutputLength: MAX_POLICY_DECOMPRESSED_BYTES };
    const decoded = encoding === "gzip"
      ? gunzipSync(body, options)
      : encoding === "br"
        ? brotliDecompressSync(body, options)
        : inflateSync(body, options);
    if (decoded.byteLength > MAX_POLICY_DECOMPRESSED_BYTES) {
      return { ok: false, outcome: "too_large" };
    }
    return { body: decoded, ok: true, outcome: encoding };
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error
      ? String(error.code)
      : "";
    return /BUFFER_TOO_LARGE|OUT_OF_RANGE/i.test(code)
      ? { ok: false, outcome: "too_large" }
      : { ok: false, outcome: "failed" };
  }
}

function compressionEncodingFromMagic(body: Uint8Array): "gzip" | "deflate" | null {
  if (body[0] === 0x1f && body[1] === 0x8b) return "gzip";
  if (
    body.length >= 2 &&
    body[0] === 0x78 &&
    (((body[0] << 8) + (body[1] ?? 0)) % 31 === 0)
  ) {
    return "deflate";
  }
  return null;
}

function looksLikePlainPolicyTextBytes(body: Uint8Array): boolean {
  const prefix = body.subarray(0, Math.min(body.byteLength, 512));
  if (prefix.byteLength === 0) return true;
  let printable = 0;
  for (const value of prefix) {
    if (value === 0x09 || value === 0x0a || value === 0x0d || (value >= 0x20 && value <= 0x7e)) {
      printable += 1;
    }
  }
  return printable / prefix.byteLength >= 0.92;
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
  ].map(stripConsentSurfacePreambleFromPolicyText).filter((text) => text.length > 0);
  return candidates.reduce((best, candidate) =>
    shouldAdoptPolicyDocumentText(candidate, best) ? candidate : best,
  candidates[0] ?? fallbackVisibleText);
}

export function stripConsentSurfacePreambleFromPolicyText(value: string): string {
  const text = normalizeWhitespace(value);
  const heading = /\b(?:privacy policy|privacy notice|data protection notice|data privacy notice)\b/i.exec(text);
  if (!heading || heading.index < 40 || heading.index > 1_500) {
    return text;
  }
  const prefix = text.slice(0, heading.index);
  const consentSignals = [
    /\bconsent(?:ing)?\b/i,
    /\bcookie(?:s)?\b/i,
    /\b(?:agree|accept all|reject all|more options|manage preferences|privacy choices)\b/i,
    /\bpartners?\b.{0,120}\b(?:store|access|process)\b/i,
    /\bIAB(?:GPP|TCF)?\b/i
  ].filter((pattern) => pattern.test(prefix)).length;
  return consentSignals >= 2 ? text.slice(heading.index) : text;
}

export function extractPolicySections(input: {
  html: string;
  sourceUrl: string;
  visibleText: string;
}): PolicySurfaceObservation["retainedPolicySections"] {
  const htmlSections = extractPolicySectionsFromHtml(input.html, input.sourceUrl);
  const tableSections = extractPolicyTableRowsFromHtml(input.html, input.sourceUrl);
  const fallbackSections = extractPolicySectionsFromVisibleText(input.visibleText, input.sourceUrl);
  const baseSections = htmlSections.length >= 3 ? htmlSections : fallbackSections;
  const sections = [...tableSections, ...baseSections].filter((section, index, all) =>
    all.findIndex((candidate) =>
      candidate.sourceUrl === section.sourceUrl &&
      normalizeWhitespace(candidate.heading) === normalizeWhitespace(section.heading) &&
      normalizeWhitespace(candidate.textExcerpt) === normalizeWhitespace(section.textExcerpt)
    ) === index
  );
  return sections
    .map((section) => {
      const normalizedText = normalizeWhitespace(section.textExcerpt);
      return {
        ...section,
        heading: normalizeWhitespace(section.heading).slice(0, 160) || "Policy section",
        textExcerpt: normalizedText.slice(0, 1_200),
        sourceTextChars: normalizedText.length,
        extractionState: normalizedText.length > 1_200 ? "truncated" as const : "complete" as const,
      };
    })
    .filter((section) => section.textExcerpt.length >= 80)
    .slice(0, 80);
}

type CookieDisclosureColumn =
  | "cookieName"
  | "provider"
  | "duration"
  | "purpose";

const COOKIE_DISCLOSURE_HEADER_PATTERNS: Record<CookieDisclosureColumn, RegExp> = {
  cookieName: /^(?:cookie name|name of cookie|cookie|nom du cookie|nombre de la cookie|nombre de cookie|nome del cookie|cookienaam|cookie naam|nazwa pliku cookie)$/i,
  provider: /^(?:provider|vendor|service provider|fournisseur|proveedor|fornitore|aanbieder|dostawca)$/i,
  duration: /^(?:expiry|expiration|expires|duration|lifetime|retention|caducidad|duree|expiration du cookie|scadenza|durata|vervaldatum|looptijd|wygasniecie)$/i,
  purpose: /^(?:purpose|description|function|use|usage|finalite|fonction|finalidad|funcion|scopo|funzione|doel|functie|cel|przeznaczenie)$/i,
};

function normalizeCookieDisclosureHeader(value: string) {
  return normalizeWhitespace(value)
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[_|:–—-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function cookieDisclosureColumn(value: string): CookieDisclosureColumn | null {
  const normalized = normalizeCookieDisclosureHeader(value);
  for (const [column, pattern] of Object.entries(COOKIE_DISCLOSURE_HEADER_PATTERNS) as Array<
    [CookieDisclosureColumn, RegExp]
  >) {
    if (pattern.test(normalized)) {
      return column;
    }
  }
  return null;
}

function cookieDisclosureCategory(value: string): PolicyCookieDisclosureObservation["category"] {
  const normalized = normalizeCookieDisclosureHeader(value);
  if (
    /\b(?:non essential|nonessential|non necessary|optional|marketing|advertising|cookies non essentiels|cookies no esenciales|cookie non essenziali|niet essentiele cookies|opcjonalne pliki cookie)\b/i.test(normalized)
  ) {
    return "non_essential";
  }
  if (
    /\b(?:essential|strictly necessary|necessary cookies|cookies essentiels|cookies esenciales|cookie essenziali|essentiele cookies|niezbedne pliki cookie)\b/i.test(normalized)
  ) {
    return "essential";
  }
  return "unknown";
}

function normalizeCookieDisclosureValue(value: string | undefined, maxLength: number) {
  const normalized = normalizeWhitespace(value ?? "").replace(/^[-–—]+|[-–—]+$/g, "").trim();
  return normalized.length > 0 ? normalized.slice(0, maxLength) : undefined;
}

function validPolicyCookieName(value: string | undefined) {
  const normalized = normalizeCookieDisclosureValue(value, 200)?.replace(/^`+|`+$/g, "");
  if (
    !normalized ||
    /^(?:cookie|cookie name|name|provider|purpose|duration|expiry)$/i.test(normalized) ||
    normalized.split(/\s+/).length > 4 ||
    /[.!?]\s+[A-Z]/.test(normalized)
  ) {
    return null;
  }
  return /^[A-Za-z0-9_.$:#*+\-\[\]]{1,200}$/.test(normalized) ? normalized : null;
}

function nearestPolicyTableHeading(html: string, tableIndex: number) {
  const prefix = html.slice(0, tableIndex);
  const headings = Array.from(
    prefix.matchAll(/<h[1-4]\b[^>]*>([\s\S]*?)<\/h[1-4]>/gi),
  );
  return htmlToVisibleText(headings.at(-1)?.[1] ?? "");
}

function extractPolicyCookieDisclosuresFromHtml(
  html: string,
  sourceUrl: string,
): PolicyCookieDisclosureObservation[] {
  const cleanHtml = stripPageChromeHtml(html);
  return Array.from(cleanHtml.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi))
    .flatMap((tableMatch) => {
      const tableHtml = tableMatch[1] ?? "";
      const rows = Array.from(tableHtml.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi))
        .map((rowMatch) =>
          Array.from((rowMatch[1] ?? "").matchAll(/<(th|td)\b[^>]*>([\s\S]*?)<\/(?:th|td)>/gi))
            .map((cellMatch) => ({
              isHeader: (cellMatch[1] ?? "").toLowerCase() === "th",
              text: htmlToVisibleText(cellMatch[2] ?? ""),
            }))
            .filter((cell) => cell.text.length > 0)
        )
        .filter((row) => row.length > 0);
      const headerRowIndex = rows.findIndex((row) =>
        row.some((cell) => cell.isHeader) ||
        row.filter((cell) => cookieDisclosureColumn(cell.text) !== null).length >= 2
      );
      if (headerRowIndex < 0) {
        return [];
      }

      const headerRow = rows[headerRowIndex] ?? [];
      const columns = new Map<CookieDisclosureColumn, number>();
      headerRow.forEach((cell, index) => {
        const column = cookieDisclosureColumn(cell.text);
        if (column && !columns.has(column)) {
          columns.set(column, index);
        }
      });
      const cookieNameIndex = columns.get("cookieName");
      if (
        cookieNameIndex === undefined ||
        ![columns.get("provider"), columns.get("duration"), columns.get("purpose")]
          .some((index) => index !== undefined)
      ) {
        return [];
      }

      const category = cookieDisclosureCategory(
        nearestPolicyTableHeading(cleanHtml, tableMatch.index ?? 0),
      );
      return rows.slice(headerRowIndex + 1).flatMap((row) => {
        const cookieName = validPolicyCookieName(row[cookieNameIndex]?.text);
        if (!cookieName) {
          return [];
        }
        return [{
          cookieName,
          provider: normalizeCookieDisclosureValue(
            row[columns.get("provider") ?? -1]?.text,
            240,
          ),
          duration: normalizeCookieDisclosureValue(
            row[columns.get("duration") ?? -1]?.text,
            160,
          ),
          purpose: normalizeCookieDisclosureValue(
            row[columns.get("purpose") ?? -1]?.text,
            640,
          ),
          category,
          sourceUrl,
          evidenceRef: `policy_cookie_${stableHash(`${sourceUrl}|${cookieName}`)}`,
          parserProvenance: "policy_cookie_table_dom.v1" as const,
          confidence: 0.96,
        }];
      });
    });
}

function extractPolicyCookieDisclosuresFromSections(
  sections: PolicySurfaceObservation["retainedPolicySections"],
  sourceUrl: string,
): PolicyCookieDisclosureObservation[] {
  return sections.flatMap((section) => {
    const match = section.textExcerpt.match(
      /(?:^|\.\s*)(?:cookie name|name of cookie|cookie)\s*:\s*(.+?)\.\s*(?:provider|vendor)\s*:\s*(.+?)(?:\.\s*(?:expiry|expiration|duration|lifetime)\s*:\s*(.+?))?(?:\.\s*(?:purpose|description|function|usage)\s*:\s*(.+?))?$/i,
    );
    const cookieName = validPolicyCookieName(match?.[1]);
    if (!cookieName) {
      return [];
    }
    return [{
      cookieName,
      provider: normalizeCookieDisclosureValue(match?.[2], 240),
      duration: normalizeCookieDisclosureValue(match?.[3], 160),
      purpose: normalizeCookieDisclosureValue(match?.[4], 640),
      category: cookieDisclosureCategory(section.heading),
      sourceUrl,
      evidenceRef: `policy_cookie_${stableHash(`${sourceUrl}|${cookieName}`)}`,
      parserProvenance: "policy_cookie_table_text.v1" as const,
      confidence: 0.78,
    }];
  });
}

export function extractPolicyCookieDisclosures(input: {
  html: string;
  retainedPolicySections: PolicySurfaceObservation["retainedPolicySections"];
  sourceUrl: string;
}): PolicyCookieDisclosureObservation[] {
  const rows = [
    ...extractPolicyCookieDisclosuresFromHtml(input.html, input.sourceUrl),
    ...extractPolicyCookieDisclosuresFromSections(
      input.retainedPolicySections,
      input.sourceUrl,
    ),
  ];
  const deduped = new Map<string, PolicyCookieDisclosureObservation>();
  for (const row of rows) {
    const key = `${row.sourceUrl.toLowerCase()}|${row.cookieName.toLowerCase()}`;
    const current = deduped.get(key);
    if (!current || row.confidence > current.confidence) {
      deduped.set(key, row);
    }
  }
  return [...deduped.values()].slice(0, 250);
}

function extractPolicyTableRowsFromHtml(html: string, sourceUrl: string): RetainedPolicySection[] {
  const cleanHtml = stripPageChromeHtml(html);
  return Array.from(cleanHtml.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)).flatMap((tableMatch, tableIndex) => {
    const tableHtml = tableMatch[1] ?? "";
    const rows = Array.from(tableHtml.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)).map((rowMatch) => {
      const rowHtml = rowMatch[1] ?? "";
      const cells = Array.from(rowHtml.matchAll(/<(th|td)\b[^>]*>([\s\S]*?)<\/(?:th|td)>/gi)).map((cellMatch) => ({
        isHeader: (cellMatch[1] ?? "").toLowerCase() === "th",
        text: htmlToVisibleText(cellMatch[2] ?? "")
      })).filter((cell) => cell.text.length > 0);
      return { cells };
    }).filter((row) => row.cells.length > 0);
    if (rows.length === 0) {
      return [];
    }

    const firstRow = rows[0];
    const firstRowLooksLikeHeader = firstRow !== undefined && (
      firstRow.cells.some((cell) => cell.isHeader) ||
      firstRow.cells.length > 1 && firstRow.cells.every((cell) => cell.text.length <= 100)
    );
    const headers = firstRowLooksLikeHeader ? firstRow?.cells.map((cell) => cell.text) ?? [] : [];
    const dataRows = firstRowLooksLikeHeader ? rows.slice(1) : rows;

    return dataRows.map((row, rowIndex) => {
      const mappedCells = row.cells.map((cell, cellIndex) => {
        const header = headers[cellIndex];
        return header ? `${header}: ${cell.text}` : cell.text;
      });
      const textExcerpt = normalizeWhitespace(mappedCells.join(". "));
      const firstValue = row.cells[0]?.text ?? `row ${rowIndex + 1}`;
      const headingPrefix = headers.length > 0 ? headers.join(" | ") : `Table ${tableIndex + 1}`;
      return {
        sourceUrl,
        heading: normalizeWhitespace(`${headingPrefix} — ${firstValue}`).slice(0, 160),
        textExcerpt,
        charStart: (tableMatch.index ?? 0),
        charEnd: (tableMatch.index ?? 0) + tableMatch[0].length,
        quality: textExcerpt.length >= 120 ? "partial" as const : "limited" as const,
      };
    });
  });
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
    .map((section, sourceIndex) => ({
      section,
      sourceIndex,
      topicMatchCount: classifyGdprTransparencyTopics({
        text: `${section.heading}\n${section.textExcerpt}`,
      }).matches.length,
    }))
    .filter(({ section }) => section.quality !== "limited")
    .sort((left, right) =>
      right.topicMatchCount - left.topicMatchCount ||
      (right.section.quality === "strong" ? 1 : 0) - (left.section.quality === "strong" ? 1 : 0) ||
      left.sourceIndex - right.sourceIndex
    )
    .map((section) => ({
      ...section.section,
      textExcerpt: section.section.textExcerpt.slice(0, 1_200),
    }))
    .slice(0, 24);
}

export function retainedArticle13SectionEvidenceFromSections(
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
      extractionLimitation: selected.extractionState === "truncated"
        ? "selected_policy_section_truncated_by_retention_limit"
        : signalObserved === "not_confirmed"
          ? "section_retained_without_row_specific_disclosure"
          : undefined,
    }];
  });
}

function bestSectionForProfile(
  sections: RetainedPolicySection[],
  profile: (typeof ARTICLE13_SECTION_PROFILES)[number],
): RetainedPolicySection | undefined {
  let best: { section: RetainedPolicySection; score: number } | undefined;
  const controllerSpecificSections = profile.disclosureType === "controller_contact"
    ? sections.filter((section) => !/(?:third parties?|service providers?).{0,100}(?:independent )?(?:data )?controllers?/i.test(section.textExcerpt))
    : sections;
  const candidateSections = controllerSpecificSections.length > 0 ? controllerSpecificSections : sections;
  for (const section of candidateSections) {
    const haystack = `${section.heading}\n${section.textExcerpt}`;
    const canonicalTopicMatch = canonicalSectionTopicMatch(section, profile.disclosureType);
    let score = 0;
    if (canonicalTopicMatch) {
      score += canonicalTopicMatch.matchStrength === "direct" ? 8 : canonicalTopicMatch.matchStrength === "equivalent" ? 7 : 3;
    }
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
    if (profile.subjectScope === "controller") {
      score += controllerSubjectSectionScore(section);
    }
    if (section.quality === "strong") score += 1;
    if (score > (best?.score ?? 0)) {
      best = { section, score };
    }
  }
  return best && best.score >= 3 ? best.section : undefined;
}

function controllerSubjectSectionScore(section: RetainedPolicySection): number {
  const text = `${section.heading}\n${section.textExcerpt}`.toLowerCase();
  let sourceHostname: string | null = null;
  try {
    sourceHostname = new URL(section.sourceUrl).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    sourceHostname = null;
  }
  const firstPartyContactObserved = sourceHostname
    ? text.includes(`@${sourceHostname}`) || text.includes(`https://${sourceHostname}`) || text.includes(`www.${sourceHostname}`)
    : false;
  const externalSubjectFramingObserved =
    /(?:data protection officer|datenschutzbeauftragte[rsn]?|dpo).{0,160}(?:service provider|platform operator|plattformbetreiber|third party|anbieter|provider)/i.test(text) ||
    /(?:service provider|platform operator|plattformbetreiber|third party|anbieter|provider).{0,160}(?:data protection officer|datenschutzbeauftragte[rsn]?|dpo)/i.test(text);
  const privacyServiceMarketingObserved =
    /(?:data protection officer|dpo)[-\s]*(?:as a service|service)|(?:our|managed)\s+(?:dpo|data protection)\s+services?/i.test(text);

  if (privacyServiceMarketingObserved) return -10;
  if (firstPartyContactObserved) return 10;
  if (externalSubjectFramingObserved) return -8;
  return 0;
}

function bestSectionExcerptForProfile(
  section: RetainedPolicySection,
  profile: (typeof ARTICLE13_SECTION_PROFILES)[number],
): string {
  const text = normalizeWhitespace(section.textExcerpt);
  const preferredPatterns: Partial<Record<Article13DisclosureType, RegExp[]>> = {
    controller_contact: [/(?:we|our organization|[A-Z][A-Za-z ]{2,80}) (?:is|are) the (?:data )?controller.{0,220}(?:contact|privacy@|data protection)/i],
    processing_purposes: [/we (?:collect|use|process).{0,220}(?:to|for) /i],
    legal_basis: [/(?:our )?(?:legal|lawful) bases? (?:are|include).{0,260}(?:contract|legitimate interests?|legal obligations?|consent|public task|vital interests?)/i],
    data_retention: [/we retain.{0,260}(?:as long as|period|criteria|delete|anonymi[sz]e)/i],
    international_transfers: [/(?:we|our service providers?|our processors?) (?:transfer|store|process).{0,300}(?:outside|other countries|third countr(?:y|ies)|international).{0,300}(?:standard contractual clauses|adequacy|safeguards?|data privacy framework|protect)/i, /(?:international|cross-border|third-country) transfers?.{0,300}(?:standard contractual clauses|adequacy|safeguards?|data privacy framework|protect)/i],
    dpo_contact: [/(?:privacy office|data protection office|data protection officer|\bdpo\b).{0,180}(?:@|contact|email|write|telephone|phone)/i],
  };
  const directPatterns = preferredPatterns[profile.disclosureType] ?? [];
  for (const pattern of directPatterns) {
    pattern.lastIndex = 0;
    const match = pattern.exec(text);
    pattern.lastIndex = 0;
    if (!match || match.index === undefined) continue;
    const matchStart = match.index;
    const matchEnd = matchStart + match[0].length;
    const sentenceStartCandidates = [text.lastIndexOf(". ", matchStart), text.lastIndexOf("? ", matchStart), text.lastIndexOf("! ", matchStart)];
    const sentenceStart = Math.max(...sentenceStartCandidates) + (Math.max(...sentenceStartCandidates) >= 0 ? 2 : 0);
    const sentenceEndCandidates = [text.indexOf(". ", matchEnd), text.indexOf("? ", matchEnd), text.indexOf("! ", matchEnd)]
      .filter((index) => index >= matchEnd + 40)
      .filter((index) => !/\b(?:Art|No|Mr|Ms|Dr)\.$/i.test(text.slice(Math.max(0, index - 8), index + 1)));
    const sentenceEnd = sentenceEndCandidates.length > 0 ? Math.min(...sentenceEndCandidates) + 1 : Math.min(text.length, matchEnd + 320);
    const sentenceExcerpt = text.slice(Math.max(0, sentenceStart), Math.min(text.length, sentenceEnd));
    if (sentenceExcerpt.length >= 20) {
      return normalizeWhitespace(`${section.heading}. ${sentenceExcerpt}`).slice(0, 1_200);
    }
  }
  const canonicalTopicMatch = canonicalSectionTopicMatch(section, profile.disclosureType);
  if (canonicalTopicMatch) {
    return normalizeWhitespace(`${section.heading}. ${canonicalTopicMatch.evidenceExcerpt}`).slice(0, 1_200);
  }
  const patterns = [
    profile.observedPattern,
    ...(profile.partialPattern ? [profile.partialPattern] : []),
    ...profile.textPatterns,
  ];
  const excerpt = boundedExcerptForPatterns(text, patterns).slice(0, 1_200);
  const firstUrlIndex = excerpt.search(/\bhttps?:\/\//i);
  const rowSpecificExcerpt = firstUrlIndex >= 80 ? excerpt.slice(0, firstUrlIndex) : excerpt;
  return normalizeWhitespace(`${section.heading}. ${rowSpecificExcerpt}`).slice(0, 1_200);
}

function sectionEvidenceStatus(
  profile: (typeof ARTICLE13_SECTION_PROFILES)[number],
  excerpt: string,
): RetainedArticle13SectionEvidence["signalObserved"] {
  const localizedClassifierMatch = classifyGdprTransparencyTopics({ text: excerpt }).matches.find((match) =>
    match.topic === profile.disclosureType && match.matchedLocale !== "en"
  );
  if (localizedClassifierMatch) {
    return "not_confirmed";
  }
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

function canonicalSectionTopicMatch(section: RetainedPolicySection, disclosureType: Article13DisclosureType) {
  if (!isCanonicalSectionCreditTopic(disclosureType)) {
    return null;
  }
  return classifyGdprTransparencyTopics({
    text: `${section.heading}\n${section.textExcerpt}`
  }).matches.find((match) => match.topic === disclosureType) ?? null;
}

function isCanonicalSectionCreditTopic(disclosureType: Article13DisclosureType) {
  return [
    "processing_purposes",
    "legal_basis",
    "recipients_or_vendor_categories",
    "data_retention",
    "data_subject_rights",
    "international_transfers"
  ].includes(disclosureType);
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
  const sanitizedTextCandidates = textCandidates.map(stripConsentSurfacePreambleFromPolicyText);
  const bodyText = sanitizedTextCandidates.find((text) => normalizeWhitespace(text).length > 0) ?? "";
  if (!html) {
    return bodyText;
  }
  const candidates = [
    ...sanitizedTextCandidates,
    htmlToVisibleText(stripPageChromeHtml(html)),
  ].map(stripConsentSurfacePreambleFromPolicyText).map(normalizeWhitespace).filter((text) => text.length > 0);
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
  const cjkCharacters = normalized.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/gu) ?? [];
  const alphabeticWordRatio = Math.max(
    alphabeticWords.length / Math.max(totalTokens, 1),
    cjkCharacters.length / Math.max(normalized.replace(/\s/g, "").length, 1)
  );
  const cjkNaturalLanguageSentenceCount = cjkCharacters.length > 0
    ? normalized
      .split(/[。！？]/u)
      .slice(0, -1)
      .filter((sentence) => sentence.trim().length >= 20)
      .length
    : 0;
  const naturalLanguageSentenceCount =
    (normalized.match(/\b(?:we|you|your|our|users?|individuals?|customers?|visitors?|people)\b[^.!?]{20,}[.!?]/gi) ?? []).length +
    cjkNaturalLanguageSentenceCount;
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
  deadlineAtMs?: number;
  signal?: AbortSignal;
}): Promise<string | undefined> {
  throwIfAborted(input.signal);
  const urls = canonicalPolicyDocumentUrlsFromHtml(input.html, input.baseUrl);
  let bestText: string | undefined;
  let bestScore = policyTextQualityScore(input.currentText);
  const fetchedCandidates = await Promise.all(
    urls.slice(0, MAX_CANONICAL_POLICY_LINK_FETCHES).map((url) =>
      fetchText(
        url,
        deadlineBoundTimeoutMs(Math.max(800, Math.min(2_000, input.timeoutMs)), input.deadlineAtMs),
        input.signal,
      )
    ),
  );

  for (const fetched of fetchedCandidates) {
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
    if (parsed.toString().endsWith("#")) {
      parsed.hash = "";
    }
    if (
      parsed.hash &&
      classifyPrivacySurface({ url: parsed.toString() }).surfaceType === "unknown"
    ) {
      parsed.hash = "";
    }
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
  const softBudgetRemainingMs = Math.max(500, input.internalBudgetMs - (Date.now() - startedAtMs));
  if (input.absoluteDeadlineAtMs === undefined) return softBudgetRemainingMs;
  return Math.max(0, Math.min(softBudgetRemainingMs, input.absoluteDeadlineAtMs - Date.now()));
}

function remainingPolicyFetchMs(input: PolicySurfaceScannerInput, startedAtMs: number): number {
  return Math.max(1, Math.min(POLICY_FETCH_TIMEOUT_MS, remainingMs(input, startedAtMs)));
}

function remainingProtectedPolicyFetchMs(input: PolicySurfaceScannerInput, startedAtMs: number): number {
  const protectedRemainingMs = Math.max(
    500,
    input.internalBudgetMs + POLICY_PROTECTED_RESERVE_MS - (Date.now() - startedAtMs),
  );
  if (input.absoluteDeadlineAtMs === undefined) return protectedRemainingMs;
  const absoluteRemainingMs = Math.max(0, input.absoluteDeadlineAtMs - Date.now());
  return Math.max(1, Math.min(absoluteRemainingMs, protectedRemainingMs));
}

function deadlineRemainingMs(deadlineAtMs: number | undefined): number {
  return deadlineAtMs === undefined ? Number.POSITIVE_INFINITY : Math.max(0, deadlineAtMs - Date.now());
}

function deadlineBoundTimeoutMs(requestedTimeoutMs: number, deadlineAtMs: number | undefined): number {
  return Math.max(1, Math.min(requestedTimeoutMs, deadlineRemainingMs(deadlineAtMs)));
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
