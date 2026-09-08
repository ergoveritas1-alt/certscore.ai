import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { cookieEventSchema, networkEventSchema, iframeEventSchema, runtimeEvidenceEventSchema, scanModuleRunSchema, collectionSurfaceObservationSchema } from "@certscore/contracts";
import { resolveCanonicalVendor } from "@certscore/vendor-resolver";
import { query, readFullSiteArtifact, type FullSiteCrawlRow } from "@website-signal-risk-scanner/db";
import type { CrawlPage, CrawlObservation } from "@website-signal-risk-scanner/shared";
import { buildNormalizedConcerns } from "../../lib/scans/normalized-concerns";
import { buildUnifiedFindingDisplayPackets, type UnifiedFindingCandidate } from "../../lib/scans/unified-findings";
import { isPromotionGradePreconsentRequestRow } from "../../lib/scans/preconsent-public-evidence";
import { classifyRetainedRequestActivity, retainedRequestEssentiality, summarizeFullSiteRuntimeEvidence } from "./local-v2-dag-report";
import { deriveGdprEprivacyCoveragePolicyOutcomes } from "../../lib/scans/gdpr-eprivacy-coverage-policy";
import { deriveGdprEprivacyCoverageChecklist, type GdprEprivacyCoverageChecklistItem } from "../../lib/scans/gdpr-eprivacy-coverage-checklist";
import { deriveCanonicalOverallScoreForReport } from "./canonical-overall-score";
import { getGdprEprivacyRowDeduction, GDPR_EPRIVACY_EVIDENCE_SCORE_VERSION } from "../../lib/scans/regulatory-coverage-score";
import { readPersistedScanReportProjection } from "./scan-report-projection-contract";
import { getPersistedCanonicalReportProjection } from "./persisted-canonical-report-projection";
import type { ScanDetailResponse } from "./get-scan-by-id";

import { FULL_SITE_SCORING_POLICY_VERSION, SCORING_RULE_BY_ID } from "../../lib/scans/scoring-policy";
import { buildSitePriorityReview, sitePriorityFindingSchema, type SitePriorityFinding } from "../../lib/scans/full-site-priority-review";
import { buildChecklistConcernTopFindings } from "../../lib/scans/checklist-concern-top-findings";
import { projectExecutiveFindingsFromUnifiedPackets } from "../../lib/scans/executive-findings-projection";
const VERSION = FULL_SITE_SCORING_POLICY_VERSION;
const PRIORITY_VERSION = "site-priority-review.v3";
const persistedScoreSchema = z.object({
  version: z.literal(VERSION), value: z.number().int().min(0).max(100).nullable(),
  scoredPages: z.number().int().min(1), limitedPages: z.number().int().nonnegative(), scope: z.string(),
  priorityReview: z.array(sitePriorityFindingSchema),
  sources: z.array(z.object({pageId: z.string(), sourceHash: z.string().regex(/^[a-f0-9]{64}$/), findingIds: z.array(z.string())})),
});
const additionalRuntimeSchema = z.object({
  moduleRun: scanModuleRunSchema,
  iframeEvents: iframeEventSchema.array(),
  runtimeTimeline: runtimeEvidenceEventSchema.array(),
  collectionSurfaceObservations: collectionSurfaceObservationSchema.array(),
});
const cache = new Map<string, { expiresAt: number; result: Promise<FullSiteScore | null> }>();
export type FullSiteScore = {
  version: string;
  value: number | null;
  scoredPages: number;
  limitedPages: number;
  scope: string;
  priorityReview: SitePriorityFinding[];
  sources: Array<{ pageId: string; sourceHash: string; findingIds: string[] }>;
};

/** Merge only canonical checklist projections. Repeated identities retain one deduction. */
export function mergeSiteChecklistRows(home: GdprEprivacyCoverageChecklistItem[], additional: GdprEprivacyCoverageChecklistItem[]) {
  return home.map(row => {
    // Additional passive captures cannot establish consent-control, policy or action findings.
    if (!SCORING_RULE_BY_ID.get(row.id)?.siteWide) return row;
    const eligible = additional.filter(candidate => candidate.id === row.id && getGdprEprivacyRowDeduction(candidate) > 0);
    if (!eligible.length) return row;
    const sources = [row, ...eligible].filter(source => getGdprEprivacyRowDeduction(source) > 0).sort((a, b) => getGdprEprivacyRowDeduction(b) - getGdprEprivacyRowDeduction(a));
    const refs = [...new Set(sources.flatMap(source => source.evidenceRefs))];
    if (["session_replay_fingerprinting_review", "device_identification_fingerprinting_signal_observed"].includes(row.id)) {
      const field = row.id === "session_replay_fingerprinting_review" ? "sessionReplayEvidence" : "browserDeviceEntropyEvidence";
      const key = row.id === "session_replay_fingerprinting_review" ? "vendors" : "hosts";
      const identities = new Set(sources.flatMap(source => {
        const evidence = source.criticalEvidence.retainedEvidence[field] as Record<string, unknown> | undefined;
        return Array.isArray(evidence?.[key]) ? (evidence[key] as unknown[]).filter((value): value is string => typeof value === "string").map(value => value.trim().toLowerCase()) : [];
      }).filter(Boolean));
      const strongest = sources[0]!;
      return { ...strongest, evidenceRefs: refs, criticalEvidence: { ...strongest.criticalEvidence, retainedEvidence: {
        ...strongest.criticalEvidence.retainedEvidence,
        [field]: { ...(strongest.criticalEvidence.retainedEvidence[field] as Record<string, unknown>), [key]: [...identities] },
      } } };
    }
    // Flat runtime categories apply once across the site, retaining the strongest eligible projection.
    if (!["pre_consent_cookies_storage", "pre_consent_third_party_tracking"].includes(row.id)) return { ...sources[0]!, evidenceRefs: refs };
    const evidence = sources.flatMap(source => {
      const raw = source.criticalEvidence.retainedEvidence;
      const retained = raw[row.id === "pre_consent_cookies_storage" ? "eligiblePreconsentCookieStorageRows" : "preconsentThirdPartyTrackerGroups"];
      const records = Array.isArray(retained) ? retained : [];
      return row.id === "pre_consent_cookies_storage" ? records : [...records, ...[raw.selectedPreconsentThirdPartyTrackingVendors, raw.preconsentThirdPartyTrackingVendors].flatMap(value => Array.isArray(value) ? value.map(vendor => ({vendor})) : [])];
    });
    const identities = new Map(evidence.map(record => {
      const r = record as Record<string, unknown>;
      return [row.id === "pre_consent_cookies_storage" ? JSON.stringify([r.storageType, r.name, r.domain, r.path, r.partitionKey]) : String(r.vendor).toLowerCase(), record];
    }));
    return {
      ...sources[0]!,
      evidenceRefs: [...new Set(sources.flatMap(source => source.evidenceRefs))],
      criticalEvidence: {
        ...sources[0]!.criticalEvidence,
        retainedEvidence: {
          ...sources[0]!.criticalEvidence.retainedEvidence,
          [row.id === "pre_consent_cookies_storage" ? "eligiblePreconsentCookieStorageRows" : "preconsentThirdPartyTrackerGroups"]: [...identities.values()],
        },
      },
    };
  });
}

/** Inventory preserved from an error response must never enter concern/scoring projection. */
export function isFullSiteScoringCaptureComplete(page: {
  status: string;
  observation?: Pick<CrawlObservation, "status" | "httpStatus" | "failureKind"> | null;
}) {
  const observation = page.observation;
  return page.status === "completed" && observation?.status === "completed" &&
    !observation.failureKind && (observation.httpStatus === null || observation.httpStatus < 400);
}

export async function loadFullSiteScore(crawl: FullSiteCrawlRow, pages: CrawlPage[]): Promise<FullSiteScore | null> {
  if (!crawl.completed_at || crawl.status !== "completed") return null;
  const { rows: [snapshot] } = await query<Record<string, unknown>>(
    "select report_projection_payload,report_projection_payload_sha256,report_projection_payload_size_bytes,report_projection_status,report_projection_version,report_projection_computed_at from scan_snapshots where scan_id=$1", [crawl.scan_id]);
  if (!snapshot) return null;
  const home = readPersistedScanReportProjection({ scan: { id: crawl.scan_id, status: "completed" } as ScanDetailResponse["scan"], snapshot });
  const canonical = home && getPersistedCanonicalReportProjection(home);
  if (!canonical) return null;
  const key = createHash("sha256").update(JSON.stringify([VERSION, PRIORITY_VERSION, GDPR_EPRIVACY_EVIDENCE_SCORE_VERSION, snapshot.report_projection_payload_sha256, crawl.configuration_hash, pages.map(p => [p.id, p.status, p.observation?.sourceHash])])).digest("hex");
  const saved = z.object({ fullSiteScore: z.object({sourceHash: z.string(), score: z.unknown()}) }).safeParse(crawl.policy_json);
  if (saved.success && saved.data.fullSiteScore.sourceHash === key) {
    const parsed = persistedScoreSchema.safeParse(saved.data.fullSiteScore.score);
    if (parsed.success) return parsed.data;
  }
  const existing = cache.get(key);
  if (existing && existing.expiresAt > Date.now()) return existing.result;
  const pending = (async () => {
    const projected: GdprEprivacyCoverageChecklistItem[] = [];
    const sources: FullSiteScore["sources"] = [];
    let scoredPages = 1, limitedPages = 0;
    for (const page of pages.filter(p => !["excluded", "cancelled"].includes(p.status) && p.observation?.executionProfile !== "homepage_baseline")) {
      const observation = page.observation;
      if (!observation || !isFullSiteScoringCaptureComplete(page) || observation.parentScanId !== crawl.scan_id || observation.pageJobId !== page.id || observation.configurationHash !== crawl.configuration_hash || !observation.runtimeGraph) { limitedPages++; continue; }
      try {
        const { rows: [attempt] } = await query<{ artifact_json: { bucket: string; evidenceKey: string; sourceHash: string } }>("select artifact_json from full_site_attempts where id=$1 and page_id=$2 and status='completed'", [observation.attemptId, page.id]);
        const artifact = attempt?.artifact_json;
        if (!artifact || artifact.bucket !== crawl.bucket || artifact.evidenceKey !== `${crawl.artifact_prefix}/${page.id}/${observation.attemptId}/evidence.json` || artifact.sourceHash !== observation.sourceHash) { limitedPages++; continue; }
        const evidence = await readFullSiteArtifact({ bucket: artifact.bucket, key: artifact.evidenceKey, region: crawl.region, sha256: observation.sourceHash, sizeBytes: observation.runtimeGraph.sourceSizeBytes, maxBytes: 64 * 1024 * 1024 }) as { cookieEvents?: unknown; networkEvents?: unknown };
        const pageRows = projectFullSiteScoringEvidence(evidence, page.id, observation.sourceHash, observation.finalUrl ?? observation.requestedUrl);
        if (!pageRows) { limitedPages++; continue; }
        const runtimeCoverage = additionalRuntimeSchema.safeParse(evidence);
        if (!runtimeCoverage.success || runtimeCoverage.data.moduleRun.status !== "completed") limitedPages++;
        projected.push(...pageRows);
        sources.push({ pageId: page.id, sourceHash: observation.sourceHash, findingIds: pageRows.filter(row => SCORING_RULE_BY_ID.get(row.id)?.siteWide && getGdprEprivacyRowDeduction(row) > 0).map(row => row.id) });
        scoredPages++;
      } catch { limitedPages++; }
    }
    const checklistRows = mergeSiteChecklistRows(canonical.checklistRows, projected);
    const executive = projectExecutiveFindingsFromUnifiedPackets(canonical.ownerUnifiedFindings.filter(finding => finding.unifiedFindingId === "acceptance_signal_contradicts_action")).topFindings;
    const homePage = pages.find(page => page.source === "homepage");
    const homeFindingIds = buildChecklistConcernTopFindings(canonical.checklistRows).map(finding => String(finding.evidenceDetails?.policyEvidenceDetails?.rowId ?? finding.id));
    const priorityReview = buildSitePriorityReview(checklistRows, [
      ...(homePage ? [{ id: homePage.id, url: homePage.finalUrl ?? homePage.url, homepage: true, findingIds: [...homeFindingIds, ...executive.map(finding => finding.id)] }] : []),
      ...sources.map(source => { const page = pages.find(page => page.id === source.pageId)!; return { id: page.id, url: page.finalUrl ?? page.url, homepage: false, findingIds: source.findingIds }; }),
    ], executive);
    const result = { version: VERSION, priorityReview, value: deriveCanonicalOverallScoreForReport({ checklistRows, unifiedFindings: canonical.globalUnifiedFindings }), scoredPages, limitedPages, sources, scope: "Homepage audit plus eligible retained storage, tracking, session replay, fingerprinting, sensitive-surface and embed evidence across scanned pages; duplicate identities count once. Additional-page consent, policy and action checks remain unassessed." };
    // Persist the versioned, evidence-bound result once; table filtering and downloads reuse it.
    if (!limitedPages) await query("update full_site_crawls set policy_json=jsonb_set(policy_json,'{fullSiteScore}',$2::jsonb) where scan_id=$1 and status='completed'", [crawl.scan_id, JSON.stringify({sourceHash: key, score: result})]);
    return result;
  })();
  cache.set(key, { expiresAt: Date.now() + 10 * 60_000, result: pending });
  if (cache.size > 32) cache.delete(cache.keys().next().value!);
  pending.catch(() => cache.delete(key));
  return pending;
}

export function projectFullSiteScoringEvidence(evidence: Record<string, unknown>, pageId: string, sourceHash: string, documentUrl?: string) {
        const parsed = cookieEventSchema.array().safeParse(evidence.cookieEvents);
        if (!parsed.success) return null;
        // Preserve retained observation type and timing; a snapshot is never turned into a write.
        const cookieWriteObservations = parsed.data.filter(e => e.consentStateAtTime === "pre_consent" && (!e.scenario || e.scenario === "fresh_pre_consent")).map(e => ({
          cookieName: e.cookieName, domain: e.cookieDomain, cookiePath: e.cookiePath,
          partitionKey: e.partitionKey, category: e.cookiePurpose,
          essentiality: e.cookieEssentiality, essentialityConfidence: e.cookieEssentialityConfidence,
          beforeConsent: true, timestampMs: e.timestampMs, firstObservedAtMs: e.timestampMs,
          setMethod: e.operation, setAtMs: /snapshot/.test(e.operation ?? "") ? null : e.timestampMs,
          party: e.cookieParty, setterScriptUrl: e.setterScriptUrl, initiatorChain: e.initiatorChain,
          evidenceRefs: [`${pageId}:${sourceHash}:${e.eventId}`],
        }));
        const network = networkEventSchema.array().safeParse(evidence.networkEvents);
        if (!network.success) return null;
        const requests = network.data.filter(e => e.consentStateAtTime === "pre_consent" && (!e.scenario || e.scenario === "fresh_pre_consent")).flatMap(e => {
          const vendor = resolveCanonicalVendor({ type: "request", url: e.requestUrl, evidenceId: e.eventId }).observation;
          if (!vendor) return [];
          const classification = classifyRetainedRequestActivity({ category: vendor.purpose, collectionEndpointObserved: e.collectionEndpointObserved === true, resourceType: e.resourceType, url: e.requestUrl });
          const row = { pageUrl: e.topLevelUrl, requestUrl: e.requestUrl, hostname: e.requestHostname, vendor: vendor.vendor, category: vendor.purpose, confidence: vendor.confidence, runtimePhase: "pre_consent", firstSeenMs: e.timestampMs, essentiality: retainedRequestEssentiality(classification), classification, collectionEndpointObserved: e.collectionEndpointObserved === true, hasIdentifierLikeParameters: e.hasIdentifierLikeParameters, evidenceRefs: [`${pageId}:${sourceHash}:${e.eventId}`] };
          return isPromotionGradePreconsentRequestRow(row) ? [row] : [];
        });
        const reviewFindingCandidates: UnifiedFindingCandidate[] = requests.length ? [{ categoryId: "privacy", title: "Pre-consent tracking detected", description: "Classified tracking requests were retained during an independent fresh page visit without a consent action.", sourceType: "signal", signalSource: "runtime_artifact_signal", signalKey: "privacy.preconsent_tracking_detected", observedValue: "true", severity: "medium", evidence: requests.flatMap(r => r.evidenceRefs), fallbackEvidence: { requestPurposeClassificationConfidence: requests } }] : [];
        const runtime = additionalRuntimeSchema.safeParse(evidence);
        const preConsent = (event: { consentStateAtTime?: string; scenario?: string }) => event.consentStateAtTime === "pre_consent" && (!event.scenario || event.scenario === "fresh_pre_consent");
        const runtimeSummary = runtime.success && documentUrl && runtime.data.moduleRun.status === "completed" ? summarizeFullSiteRuntimeEvidence({
          modulesRun: [runtime.data.moduleRun],
          networkEvents: network.data.filter(preConsent),
          iframeEvents: runtime.data.iframeEvents.filter(preConsent),
          runtimeTimeline: runtime.data.runtimeTimeline.filter(preConsent),
          collectionSurfaceObservations: runtime.data.collectionSurfaceObservations.filter(preConsent),
        }, requests, documentUrl) : {};
        const runtimeArtifacts = { hybrid_runtime_evidence: { ...runtimeSummary, cookieWriteObservations, requestPurposeClassificationConfidence: requests } };
        const normalizedConcerns = buildNormalizedConcerns({ reviewFindingCandidates, validationFindings: [], runtimeArtifacts });
        const unifiedFindings = buildUnifiedFindingDisplayPackets({ reviewFindingCandidates, validationFindings: [], validationFindingLookup: new Map(), runtimeArtifacts });
        const coverageOutcomes = deriveGdprEprivacyCoveragePolicyOutcomes({ normalizedConcerns, runtimeArtifacts, coverageLimited: false, scanCompleted: true });
        const pageRows = deriveGdprEprivacyCoverageChecklist({ coverageOutcomes, coverageLimited: false, scanCompleted: true, unifiedFindings });
        return pageRows;

}
