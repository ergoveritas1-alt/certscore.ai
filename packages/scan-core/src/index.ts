export { runFullScanJob } from "./scan/run-full-scan";
export { getCrawlerProductToken, getCrawlerPublicUrl, getCrawlerUserAgent } from "./scan/crawler-identity";
export { buildFindingComparisonKey } from "./scan/history/build-finding-comparison-key";
export {
  fetchTextPage,
  fetchStaticPage,
  discoverCandidatePages,
  assessPolicyPageContentQuality
} from "./scan/snapshot/extractors";
export { runConsentInteractionAudit } from "./scan/snapshot/consent-interaction";
export { runConsentProbe } from "./scan/snapshot/build-snapshot-bundle";
export { shouldContinueRuntimeWait } from "./scan/snapshot/browser-stability";
export { upgradeThinPolicyPages } from "./scan/snapshot/policy-resolution";
export { buildScanPlan } from "./scan/snapshot/scan-planner";
export type { StaticPageResult } from "./scan/snapshot/types";
export {
  analyzeFinancialSignals,
  collectBlocksForSignalHits,
  CORE_PAGES_DEFINITION,
  ENTITY_TRANSPARENCY_MINIMUM_SURFACE_SCORE,
  EXPLAINER_SURFACE_MAX_CRAWL_DEPTH,
  FINANCIAL_RULE_VERSION,
  FINANCIAL_SIGNAL_DETECTOR_VERSION,
  getFinancialSignalHitsForPage,
  getNearestDisclosureDistance,
  getObservedEvidenceByIds,
  LOCAL_DISCLOSURE_DOM_SIBLING_RADIUS,
  LOCAL_DISCLOSURE_TOKEN_RADIUS,
  MAX_ACCEPTABLE_LINK_DEPTH_FOR_MATERIAL_TERMS
} from "./scan/financial/signals";
export { createBrowser } from "./scan/browser/create-browser";
export { runAxe } from "./scan/page-audit/run-axe";
export {
  POLICY_EXTRACTION_CONFIG,
  loadPolicyPrompt,
  createPolicyLlmClient,
  getPolicyLlmAvailability
} from "./scan/policy-enrichment/llm-client";
export { chunkPolicyText, selectPolicyChunksForLlm } from "./scan/policy-enrichment/chunk";
export { ruleBasedPolicyPreprocess } from "./scan/policy-enrichment/rules";
export { validatePolicyChunkJson } from "./scan/policy-enrichment/schema";
export { enrichPolicyPages } from "./scan/policy-enrichment/run-policy-enrichment";
export * from "./scan/accessibility-benchmark";
