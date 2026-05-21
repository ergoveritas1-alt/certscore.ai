"use server";

import { query, queryOne } from "@website-signal-risk-scanner/db";
import {
  buildSharedFullScanConfig,
  SCAN_EVENT_TYPES,
  VALIDATION_DEFAULT_INTERVAL_MINUTES,
  VALIDATION_DEFAULT_RUN_MODE,
  VALIDATION_INTERVAL_OPTIONS,
  type ValidationPipelineState,
  type ValidationRunMode,
  type ValidationRunStatus,
  type ValidationVerdict
} from "@website-signal-risk-scanner/shared";
import { normalizeUrl, extractHostname } from "@website-signal-risk-scanner/shared";
import { revalidatePath } from "next/cache";
import { enqueueFullScanJob } from "../queue/full-scan-queue";
import { enqueueValidationCollectJob, getValidationQueueAvailability, getValidationQueueHealth } from "../queue/validation-queue";
import { getWebServerEnv } from "../../lib/env";
import { requireValidationAdminContext } from "./auth";
import { shouldSurfaceSupplementalPolicyReviewFinding } from "../../lib/scans/supplemental-policy-review-gates";
import {
  getHybridConsentAuditCompleted,
  getHybridPreconsentTrackerEvidenceUrls,
  getHybridPreconsentViolationCount
} from "../../lib/scans/hybrid-runtime-evidence";
import {
  formatRepresentativeAccessibilityCoverage,
  getAccessibilityFindingIdForRuleCode,
  getRepresentativeAccessibilityExampleCoverage,
  hasBehaviorReproducedFocusManagementEvidence,
  normalizePersistedAccessibilityRuleExamples,
  type PersistedAccessibilityRuleExampleRow
} from "../../lib/scans/accessibility-evidence";
import { loadMergedSignalsByScanId } from "../scans/merged-signal-summary";
import {
  buildCookieDisclosureGapEvidence,
  buildRuntimeCookieInventory
} from "../../lib/scans/runtime-cookie-evidence";

type ValidationSettingsRow = {
  automatic_interval_minutes: number;
  last_tranco_sync_at: string | null;
  last_worker_heartbeat_at: string | null;
  last_worker_host: string | null;
  last_worker_started_at: string | null;
  next_due_at: string | null;
  operator_note: string | null;
  pipeline_enabled: boolean;
  run_mode: ValidationRunMode;
  singleton_key: string;
  updated_at: string;
  updated_by_user_id: string | null;
};

type ValidationRunRow = {
  average_agreement_score: number | null;
  completed_at: string | null;
  created_at: string;
  domain_id: string | null;
  error_message: string | null;
  finding_count: number;
  hostname: string;
  id: string;
  rank_band: string | null;
  reviewed_finding_count: number;
  scan_id: string | null;
  status: ValidationRunStatus;
  tranco_rank: number | null;
  trigger_mode: ValidationRunMode;
};

type ScanEventRow = {
  created_at: string;
  event_type: string;
  id: string;
  message: string;
  metadata_json: unknown;
};

type ValidationTargetRow = {
  active: boolean;
  backoff_until: string | null;
  cooldown_until: string | null;
  created_at?: string | null;
  deny_reason: string | null;
  denylisted: boolean;
  failure_count?: number;
  hostname: string;
  id: string;
  last_completed_at?: string | null;
  last_error: string | null;
  last_run_at?: string | null;
  last_status: string | null;
  normalized_url: string;
  rank_band: string | null;
  source?: string;
  tranco_rank: number | null;
  updated_at?: string | null;
};

type ValidationRunFindingRow = {
  category: string;
  description: string;
  evidence_json: Record<string, unknown>;
  finding_rank: number;
  id: string;
  page_url: string | null;
  rule_key: string;
  severity: string;
  subtype: string | null;
  title: string;
  validation_verdicts?:
    | {
        confidence: number | null;
      }
    | Array<{
        confidence: number | null;
      }>
    | null;
};

type ValidationFindingConfidenceRow = {
  confidence: number | null;
  validation_run_finding_id: string;
};

type ExistingFindingIdentity = Pick<ValidationRunFindingRow, "rule_key" | "title">;

type ScanSignalRow = {
  category: string;
  signal_key: string;
  signal_label: string;
  signal_value_json: boolean | number | string | string[] | null;
  value_type: string;
};

type SnapshotSupplementRow = {
  accessibility_litigation_risk_score: number | null;
  retargeting_pixel_detected: boolean | null;
};

type PolicyReviewQueueRow = {
  id: string;
  policy_enrichment_id: string | null;
  reason: string;
  review_status: string | null;
  scan_id: string;
};

type PolicyEnrichmentLookupRow = {
  id: string;
  policy_actionable_flags?: string[] | null;
  policy_ambiguity_score?: number | null;
  policy_coverage_ratio?: number | null;
  policy_cookie_disclosures?: unknown[] | null;
  policy_effective_date?: string | null;
  policy_field_coverage?: Record<string, unknown>;
  policy_governing_law?: string | null;
  policy_notice_contact_present?: boolean | null;
  page_type: string | null;
  page_url: string | null;
  policy_semantic_confidence?: number | null;
  policy_snippet_count?: number | null;
  policy_structurally_weak?: boolean | null;
  policy_summary_short?: string | null;
  policy_termination_or_suspension_present?: boolean | null;
  policy_cancellation_or_refund_present?: boolean | null;
  policy_arbitration_present?: boolean | null;
};

export type ScanAccessibilityRuleExampleRow = PersistedAccessibilityRuleExampleRow;

const TRANCO_SOURCE_FALLBACK_URL = "https://tranco-list.eu/latest_list";
const VALIDATION_QUEUE_HANDOFF_TIMEOUT_MS = 5_000;

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown database error.";
}

function withValidationQueueHandoffTimeout<T>(promise: Promise<T>) {
  return Promise.race<T>([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error("Validation queue handoff timed out.")), VALIDATION_QUEUE_HANDOFF_TIMEOUT_MS);
    })
  ]);
}

async function failValidationQueueHandoff(input: {
  actorUserId: string;
  hostname: string;
  message: string;
  scanId: string;
  targetId: string | null;
  validationRunId: string;
}) {
  const completedAt = new Date().toISOString();
  await query(
    `
      update validation_runs
         set completed_at = $2,
             error_message = $3,
             status = 'failed'
       where id = $1
    `,
    [input.validationRunId, completedAt, input.message]
  );

  if (input.targetId) {
    await query(
      `
        update validation_targets
           set last_completed_at = $2,
               last_error = $3,
               last_status = 'failed'
         where id = $1
      `,
      [input.targetId, completedAt, input.message]
    );
  }

  await query(
    `
      insert into scan_events (scan_id, domain_id, organization_id, event_type, message, metadata_json)
      values ($1, null, null, $2, $3, $4)
    `,
    [
      input.scanId,
      SCAN_EVENT_TYPES.validationRunFailed,
      "Validation queue handoff failed.",
      {
        error: input.message,
        validationRunId: input.validationRunId
      }
    ]
  );

  await query(
    `
      insert into validation_audit_events (actor_user_id, event_type, metadata_json)
      values ($1, $2, $3)
    `,
    [
      input.actorUserId,
      "validation.manual_run_queue_failed",
      {
        hostname: input.hostname,
        scanId: input.scanId,
        targetId: input.targetId,
        validationRunId: input.validationRunId,
        error: input.message
      }
    ]
  );
}

function rankBandForRank(rank: number | null) {
  if (!rank) {
    return "50k-100k";
  }

  if (rank <= 5_000) {
    return "1k-5k";
  }

  if (rank <= 20_000) {
    return "5k-20k";
  }

  if (rank <= 50_000) {
    return "20k-50k";
  }

  if (rank <= 100_000) {
    return "50k-100k";
  }

  return "50k-100k";
}

async function listTrancoPreviewTargets(limit = 7) {
  const env = getWebServerEnv();
  const response = await fetch(env.VALIDATION_TRANCO_SOURCE_URL ?? TRANCO_SOURCE_FALLBACK_URL, {
    headers: {
      "User-Agent": "ValidationOpsCrawler/1.0"
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch Tranco source: ${response.status}`);
  }

  const contentType = response.headers.get("content-type") ?? "";
  let body = await response.text();

  if (contentType.includes("text/html") || body.includes("/download/")) {
    const match = body.match(/href="(\/download\/[^"]+\/1000000)"/i);

    if (!match?.[1]) {
      throw new Error("Failed to resolve Tranco CSV download URL.");
    }

    const csvUrl = new URL(match[1], "https://tranco-list.eu").toString();
    const csvResponse = await fetch(csvUrl, {
      headers: {
        "User-Agent": "ValidationOpsCrawler/1.0"
      }
    });

    if (!csvResponse.ok) {
      throw new Error(`Failed to fetch Tranco CSV: ${csvResponse.status}`);
    }

    body = await csvResponse.text();
  }

  const minRank = env.VALIDATION_TRANCO_MIN_RANK ?? 10_000;
  const maxRank = env.VALIDATION_TRANCO_MAX_RANK ?? 20_000;
  const rows: ValidationTargetRow[] = [];
  let eligibleCount = 0;

  for (const line of body.split(/\r?\n/)) {
    if (!line) {
      continue;
    }

    const [rankText, hostText] = line.split(",");
    const rank = Number(rankText);
    const hostname = hostText?.trim().toLowerCase();

    if (!Number.isFinite(rank) || !hostname) {
      continue;
    }

    if (rank < minRank || rank > maxRank) {
      continue;
    }

    let candidate: ValidationTargetRow;
    try {
      candidate = {
        active: true,
        backoff_until: null,
        cooldown_until: null,
        deny_reason: null,
        denylisted: false,
        failure_count: 0,
        hostname,
        id: `tranco-preview-${rank}`,
        last_completed_at: null,
        last_error: null,
        last_run_at: null,
        last_status: null,
        normalized_url: normalizeUrl(hostname),
        rank_band: rankBandForRank(rank),
        source: "tranco",
        tranco_rank: rank
      };
    } catch {
      continue;
    }

    eligibleCount += 1;

    if (rows.length < limit) {
      rows.push(candidate);
      continue;
    }

    const replaceIndex = Math.floor(Math.random() * eligibleCount);
    if (replaceIndex < limit) {
      rows[replaceIndex] = candidate;
    }
  }

  return rows;
}

function getUpcomingTargets(targets: ValidationTargetRow[], limit = 7) {
  const now = new Date();
  const eligibleTargets = targets.filter((target) => {
    if (!target.active || target.denylisted) {
      return false;
    }

    const cooldownOk = !target.cooldown_until || new Date(target.cooldown_until) <= now;
    const backoffOk = !target.backoff_until || new Date(target.backoff_until) <= now;
    return cooldownOk && backoffOk;
  });

  const manualTargets = eligibleTargets
    .filter((target) => target.source === "manual")
    .sort((left, right) => {
      const leftRunAt = left.last_run_at ? new Date(left.last_run_at).getTime() : 0;
      const rightRunAt = right.last_run_at ? new Date(right.last_run_at).getTime() : 0;

      if (leftRunAt !== rightRunAt) {
        return leftRunAt - rightRunAt;
      }

      return left.hostname.localeCompare(right.hostname);
    });

  const shuffledTrancoTargets = eligibleTargets
    .filter((target) => {
      const rank = target.tranco_rank;
      return target.source === "tranco" && rank !== null && rank >= 1000 && rank <= 20000;
    })
    .sort(() => Math.random() - 0.5);

  return [...manualTargets, ...shuffledTrancoTargets].slice(0, limit);
}

function sortValidationTargetsForDisplay(targets: ValidationTargetRow[]) {
  return [...targets].sort((left, right) => {
    const leftManual = left.source === "manual";
    const rightManual = right.source === "manual";

    if (leftManual !== rightManual) {
      return leftManual ? -1 : 1;
    }

    if (leftManual && rightManual) {
      const leftUpdatedAt = left.updated_at ? new Date(left.updated_at).getTime() : 0;
      const rightUpdatedAt = right.updated_at ? new Date(right.updated_at).getTime() : 0;
      if (leftUpdatedAt !== rightUpdatedAt) {
        return rightUpdatedAt - leftUpdatedAt;
      }
    }

    const leftDenylisted = left.denylisted === true;
    const rightDenylisted = right.denylisted === true;
    if (leftDenylisted !== rightDenylisted) {
      return leftDenylisted ? 1 : -1;
    }

    const leftCooldown = left.cooldown_until ? new Date(left.cooldown_until).getTime() : 0;
    const rightCooldown = right.cooldown_until ? new Date(right.cooldown_until).getTime() : 0;
    if (leftCooldown !== rightCooldown) {
      return leftCooldown - rightCooldown;
    }

    const leftRank = left.tranco_rank ?? Number.MAX_SAFE_INTEGER;
    const rightRank = right.tranco_rank ?? Number.MAX_SAFE_INTEGER;
    if (leftRank !== rightRank) {
      return leftRank - rightRank;
    }

    return left.hostname.localeCompare(right.hostname);
  });
}

function isPopulatedValidationSignal(key: string, value: ScanSignalRow["signal_value_json"]) {
  if (value === null || value === undefined || value === "") {
    return false;
  }

  if (Array.isArray(value)) {
    return value.length > 0;
  }

  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      return false;
    }

    if (/score|window_days|word_count|semantic_confidence/i.test(key)) {
      return true;
    }

    return value > 0;
  }

  if (typeof value === "string") {
    return value.trim().length > 0 && value !== "unknown" && value !== "absent" && value !== "none";
  }

  return true;
}

function isConcerningValidationSignal(row: ScanSignalRow) {
  if (!isPopulatedValidationSignal(row.signal_key, row.signal_value_json)) {
    return false;
  }

  const negativePatterns = [
    /dark_pattern/,
    /preconsent/,
    /conflict/,
    /mismatch/,
    /litigation_risk_score/,
    /error_count/,
    /warning_count/,
    /issue_count/,
    /failures_count/,
    /store_credit_only/,
    /termination_for_cause/,
    /service_suspension_or_termination/,
    /retargeting_pixel/,
    /session_replay/,
    /functional_misalignment/,
    /technical_disclosure/,
    /disclosure_gap/,
    /surface_missing/,
    /fetch_failed/,
    /extraction_limited/,
    /bounded_search/,
    /structurally_obstructed/,
    /likely_obstructed/,
    /high_sensitivity_data_collection_detected/,
    /limited_time_offer_language_present/,
    /discount_claim_present/,
    /original_price_comparison_present/
  ];

  if (negativePatterns.some((pattern) => pattern.test(row.signal_key))) {
    return true;
  }

  if (typeof row.signal_value_json === "number" && /risk_score|ambiguity_score|friction_score/i.test(row.signal_key)) {
    return row.signal_value_json > 0;
  }

  return false;
}

function getValidationConcernReason(row: ScanSignalRow) {
  const key = row.signal_key;

  if (/functional_misalignment/i.test(key)) {
    return "Strong runtime evidence suggests the live rights-fulfillment experience conflicts with the site’s policy posture.";
  }

  if (/technical_disclosure/i.test(key)) {
    return "Runtime behavior suggests a tracking or replay function that is not clearly disclosed in the scanned policy materials.";
  }

  if (/disclosure_gap/i.test(key)) {
    return "Observed runtime cookies could not be reconciled to explicit cookie disclosures on the site.";
  }

  if (/structurally_obstructed|likely_obstructed/i.test(key)) {
    return "The scanned policy surface was too weak or structurally obstructed for reliable technical disclosure reconciliation.";
  }

  if (/preconsent|tracking_before_consent/i.test(key)) {
    return "Observed before a clear user choice was made.";
  }

  if (/conflict|mismatch/i.test(key)) {
    return "Signals a contradiction or mismatch that merits direct review.";
  }

  if (/dark_pattern|limited_time_offer_language_present|discount_claim_present|original_price_comparison_present/i.test(key)) {
    return "Promotional or choice architecture may need closer disclosure review.";
  }

  if (/store_credit_only/i.test(key)) {
    return "Post-purchase remedy may be more restrictive than expected.";
  }

  if (/termination_for_cause|service_suspension_or_termination/i.test(key)) {
    return "Terms reserve restrictive enforcement rights that should be read directly.";
  }

  if (/risk_score|ambiguity_score|friction_score/i.test(key)) {
    return "Scanner-derived risk indicator is elevated.";
  }

  if (/error_count|warning_count|issue_count|failures_count/i.test(key)) {
    return "Automated issues were surfaced in this area.";
  }

  if (/surface_missing/i.test(key)) {
    return "A key disclosure or support page surface was not detected during the scan.";
  }

  if (/fetch_failed/i.test(key)) {
    return "A key disclosure or support page was linked from the scanned site, but automated retrieval of that target was limited during the scan.";
  }

  if (/extraction_limited/i.test(key)) {
    return "A key disclosure page was linked and fetched, but the retrieved content was too limited for reliable automated extraction on its own.";
  }

  if (/key_page_discovery_unresolved_after_bounded_search/i.test(key)) {
    return "The scanner exhausted its bounded key-page discovery budget without confirming one or more expected legal or support pages.";
  }

  return "This signal is worth reviewer attention.";
}

function getValidationSignalSeverity(row: ScanSignalRow) {
  if (/preconsent|session_replay|conflict|mismatch|functional_misalignment|technical_disclosure|disclosure_gap/i.test(row.signal_key)) {
    return "high";
  }

  if (/privacy_policy_(surface_missing|fetch_failed)/i.test(row.signal_key)) {
    return "high";
  }

  if (/key_page_discovery_unresolved_after_bounded_search|structurally_obstructed|likely_obstructed|surface_missing|fetch_failed|extraction_limited/i.test(row.signal_key)) {
    return "medium";
  }

  if (typeof row.signal_value_json === "number" && /risk_score|ambiguity_score|friction_score/i.test(row.signal_key)) {
    return row.signal_value_json >= 70 ? "high" : "medium";
  }

  return "medium";
}

function getSupplementalFindingTitle(row: ScanSignalRow) {
  if (row.signal_key === "privacy.policy_runtime_functional_misalignment_detected") {
    return "High-confidence functional misalignment";
  }

  if (row.signal_key === "disclosure.policy_runtime_missing_technical_disclosure_detected") {
    return "Missing technical disclosure";
  }

  if (row.signal_key === "disclosure.policy_runtime_disclosure_likely_obstructed") {
    return "Disclosure likely obstructed";
  }

  if (row.signal_key === "privacy.cookie_runtime_disclosure_gap_detected") {
    return "Cookie disclosure gap";
  }

  if (row.signal_key === "disclosure.cookie_policy_structurally_obstructed") {
    return "Cookie policy structurally obstructed";
  }

  if (row.signal_key === "disclosure.privacy_policy_surface_missing") {
    return "Privacy policy surface not detected";
  }

  if (row.signal_key === "disclosure.privacy_policy_fetch_failed") {
    return "Privacy policy linked but not retrievable";
  }

  if (row.signal_key === "disclosure.privacy_policy_extraction_limited") {
    return "Privacy policy linked but automated extraction was limited";
  }

  if (row.signal_key === "disclosure.terms_of_service_surface_missing") {
    return "Terms page surface not detected";
  }

  if (row.signal_key === "disclosure.terms_of_service_fetch_failed") {
    return "Terms page linked but not retrievable";
  }

  if (row.signal_key === "disclosure.terms_of_service_extraction_limited") {
    return "Terms page linked but automated extraction was limited";
  }

  if (row.signal_key === "disclosure.cookie_policy_surface_missing") {
    return "Cookie policy surface not detected";
  }

  if (row.signal_key === "disclosure.cookie_policy_fetch_failed") {
    return "Cookie policy linked but not retrievable";
  }

  if (row.signal_key === "disclosure.cookie_policy_extraction_limited") {
    return "Cookie policy linked but automated extraction was limited";
  }

  if (row.signal_key === "disclosure.accessibility_statement_surface_missing") {
    return "Accessibility statement surface not detected";
  }

  if (row.signal_key === "disclosure.accessibility_statement_fetch_failed") {
    return "Accessibility statement linked but not retrievable";
  }

  if (row.signal_key === "disclosure.accessibility_statement_extraction_limited") {
    return "Accessibility statement linked but automated extraction was limited";
  }

  if (row.signal_key === "disclosure.contact_page_surface_missing") {
    return "Contact page surface not detected";
  }

  if (row.signal_key === "disclosure.contact_page_fetch_failed") {
    return "Contact page linked but not retrievable";
  }

  if (row.signal_key === "disclosure.key_page_discovery_unresolved_after_bounded_search") {
    return "Bounded key-page discovery unresolved";
  }

  if (row.signal_key === "privacy.user_rights_friction_score" && typeof row.signal_value_json === "number") {
    return row.signal_value_json >= 100 ? "Critical user-rights fulfillment friction" : "High user-rights fulfillment friction";
  }

  if (row.signal_key === "accessibility.accessibility_risk_score" && typeof row.signal_value_json === "number") {
    return "Elevated accessibility risk score";
  }

  return row.signal_label;
}

function normalizePolicyPageTypeLabel(pageType: string | null) {
  switch (pageType) {
    case "privacy_policy":
      return "Privacy Policy";
    case "terms_of_service":
      return "TOS";
    case "cookie_policy":
      return "Cookie Policy";
    default:
      return "Policy";
  }
}

function buildPolicyReviewDescription(reason: string) {
  switch (reason) {
    case "policy_behavior_conflict_candidate":
      return "Observed site behavior may conflict with the site’s public-facing policy language.";
    case "session_replay_without_disclosure_detected":
      return "Indirect replay-related signals may be present without a clear matching disclosure in the scanned policy pages.";
    case "missing_dsar_high_exposure":
      return "The site may have elevated exposure while the policy text does not yet show a clearly indexed privacy-rights request path.";
    case "low_confidence_critical_fields":
      return "Critical policy extraction fields were low confidence and need manual review in the scan report.";
    default:
      return `This issue was added to the scan report review queue under ${reason.replaceAll("_", " ")}.`;
  }
}

function buildPolicyReviewTitle(input: { pageTypeLabel: string; reason: string }) {
  switch (input.reason) {
    case "low_confidence_critical_fields":
      return `Low-confidence extraction ${input.pageTypeLabel}`;
    case "session_replay_without_disclosure_detected":
      return `Possible replay/disclosure mismatch ${input.pageTypeLabel}`;
    case "missing_dsar_high_exposure":
      return `Possible missing privacy-rights path ${input.pageTypeLabel}`;
    default:
      return `${input.reason.replaceAll("_", " ")} ${input.pageTypeLabel}`.replace(/\b\w/g, (char) => char.toUpperCase());
  }
}

function buildPolicyReviewEvidencePayload(input: {
  policyEnrichmentId: string | null;
  enrichment?: PolicyEnrichmentLookupRow;
  reason: string;
  reviewStatus: string | null;
}) {
  const summary = input.enrichment?.policy_summary_short?.trim() ?? null;
  const pageUrl = input.enrichment?.page_url ?? null;
  const policyCoverageRatio = input.enrichment?.policy_coverage_ratio ?? null;
  const policySemanticConfidence = input.enrichment?.policy_semantic_confidence ?? null;
  const policyAmbiguityScore = input.enrichment?.policy_ambiguity_score ?? null;
  const policySnippetCount = input.enrichment?.policy_snippet_count ?? null;
  const policyStructurallyWeak = input.enrichment?.policy_structurally_weak ?? null;

  return {
    claim:
      input.reason === "policy_behavior_conflict_candidate"
        ? "Observed site behavior may conflict with the site’s public-facing policy language."
        : buildPolicyReviewDescription(input.reason),
    confidenceBasis: [
      input.reason === "policy_behavior_conflict_candidate"
        ? "Policy review logic flagged a possible mismatch between public-facing policy language and observed site behavior."
        : input.reason === "low_confidence_critical_fields"
          ? "Policy extraction retained low-confidence critical fields that need manual review."
          : buildPolicyReviewDescription(input.reason),
      summary ? `Retained policy summary: ${summary}` : null,
      typeof policyCoverageRatio === "number"
        ? `Policy coverage ratio: ${Math.round(policyCoverageRatio * 100)}%.`
        : null,
      typeof policySemanticConfidence === "number"
        ? `Policy semantic confidence: ${policySemanticConfidence.toFixed(2)}.`
        : null,
      typeof policyAmbiguityScore === "number"
        ? `Policy ambiguity score: ${policyAmbiguityScore.toFixed(2)}.`
        : null,
      typeof policySnippetCount === "number"
        ? `Policy snippet count retained: ${policySnippetCount}.`
        : null,
      policyStructurallyWeak === true ? "The policy surface also showed structural weakness signals." : null
    ].filter((value): value is string => typeof value === "string" && value.length > 0),
    missingEvidence: [
      input.reason === "policy_behavior_conflict_candidate"
        ? "Concrete runtime evidence or direct policy excerpts proving the specific conflict on a live page."
        : null,
      input.reason === "low_confidence_critical_fields"
        ? "Higher-confidence extraction or direct excerpts for the affected policy fields."
        : null,
      input.reason === "session_replay_without_disclosure_detected"
        ? "Direct runtime page evidence showing the replay behavior that lacks matching disclosure."
        : null,
      input.reason === "missing_dsar_high_exposure"
        ? "Direct disclosure excerpts confirming whether a DSAR path is actually present."
        : null
    ].filter((value): value is string => typeof value === "string" && value.length > 0),
    pageUrls: pageUrl ? [pageUrl] : [],
    policyEvidence: summary ? [summary] : [],
    reviewQueueReason: input.reason,
    reviewStatus: input.reviewStatus,
    pageType: input.enrichment?.page_type ?? null,
    pageUrl,
    policyEnrichmentId: input.policyEnrichmentId,
    policyAmbiguityScore,
    policyArbitrationPresent: input.enrichment?.policy_arbitration_present ?? null,
    policyCancellationOrRefundPresent: input.enrichment?.policy_cancellation_or_refund_present ?? null,
    policyCoverageRatio,
    policyEffectiveDate: input.enrichment?.policy_effective_date ?? null,
    policyFieldCoverage: input.enrichment?.policy_field_coverage ?? {},
    policyGoverningLaw: input.enrichment?.policy_governing_law ?? null,
    policyNoticeContactPresent: input.enrichment?.policy_notice_contact_present ?? null,
    policySemanticConfidence,
    policySnippetCount,
    policyStructurallyWeak,
    policySummaryShort: summary,
    policyTerminationOrSuspensionPresent: input.enrichment?.policy_termination_or_suspension_present ?? null
  };
}

const ACCESSIBILITY_SPLIT_FINDING_METADATA: Record<string, {
  description: string;
  ruleKey: string;
  severity: string;
  title: string;
}> = {
  keyboard_navigation_accessibility_issue: {
    description: "Automated keyboard-related rule evidence was retained and warrants manual keyboard operability review.",
    ruleKey: "accessibility_review.navigation_issues",
    severity: "high",
    title: "Keyboard navigation accessibility issue"
  },
  semantic_labeling_accessibility_issue: {
    description: "Accessible name, label, role, or semantic rule examples were retained and warrant assistive technology review.",
    ruleKey: "accessibility_review.semantic_labeling_issues",
    severity: "medium",
    title: "Semantic labeling accessibility issue"
  },
  text_alternative_accessibility_issue: {
    description: "Text alternative rule examples were retained and warrant review for non-text content accessibility.",
    ruleKey: "accessibility_review.text_alternative_issues",
    severity: "low",
    title: "Text alternative accessibility issue"
  },
  visual_contrast_accessibility_issue: {
    description: "Color contrast rule examples were retained and warrant review for perceivability barriers.",
    ruleKey: "accessibility_review.contrast_failures",
    severity: "medium",
    title: "Visual contrast accessibility issue"
  }
};

function buildAccessibilitySplitEvidence(examples: ScanAccessibilityRuleExampleRow[]) {
  const normalizedExamples = normalizePersistedAccessibilityRuleExamples(examples);
  const representativeCoverage = getRepresentativeAccessibilityExampleCoverage({
    accessibilityRuleExamples: normalizedExamples
  });
  const pageUrls = [...new Set(examples.map((example) => example.page_url))];
  const exampleSnippets = examples.map((example) => {
    const selector = Array.isArray(example.representative_selectors) ? example.representative_selectors[0] : null;
    return selector
      ? `${example.rule_code} on ${example.page_url} (${selector})`
      : `${example.rule_code} on ${example.page_url}`;
  });

  return {
    accessibilityRuleExamples: normalizedExamples,
    confidenceBasis: [
      `Representative accessibility examples were retained across ${pageUrls.length} page${pageUrls.length === 1 ? "" : "s"}.`,
      representativeCoverage.representativeExampleCount > 0
        ? formatRepresentativeAccessibilityCoverage(representativeCoverage)
        : null
    ].filter((entry): entry is string => typeof entry === "string"),
    maxAxeImpact: representativeCoverage.maxImpact,
    pageUrls,
    representativeAxeExampleCount: representativeCoverage.representativeExampleCount,
    representativeAxePageCount: representativeCoverage.distinctPageCount,
    representativeAxeRuleCount: representativeCoverage.distinctRuleCount,
    representativeAccessibilityExampleSummary:
      representativeCoverage.representativeExampleCount > 0
        ? formatRepresentativeAccessibilityCoverage(representativeCoverage)
        : null,
    runtimeEvidence: exampleSnippets
  };
}

function getFocusManagementEvidenceEntries(runtimeArtifacts: Record<string, unknown> | null) {
  if (!runtimeArtifacts) {
    return [] as Record<string, unknown>[];
  }

  const direct = runtimeArtifacts.focusManagementEvidence ?? runtimeArtifacts.focus_management_evidence;
  const hybrid = runtimeArtifacts.hybridRuntimeEvidence ?? runtimeArtifacts.hybrid_runtime_evidence;
  const hybridRecord = hybrid && typeof hybrid === "object" && !Array.isArray(hybrid) ? hybrid as Record<string, unknown> : null;
  const nested = hybridRecord?.focusManagementEvidence ?? hybridRecord?.focus_management_evidence;
  const values = [direct, nested];

  return values.flatMap((value) =>
    Array.isArray(value)
      ? value.filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object" && !Array.isArray(entry))
      : value && typeof value === "object" && !Array.isArray(value)
        ? [value as Record<string, unknown>]
        : []
  );
}

function buildSupplementalFocusManagementFinding(input: {
  existingFindings: ExistingFindingIdentity[];
  runtimeArtifacts: Record<string, unknown> | null;
  startingRank: number;
}) {
  const evidenceEntries = getFocusManagementEvidenceEntries(input.runtimeArtifacts).filter((entry) =>
    hasBehaviorReproducedFocusManagementEvidence({ focusManagementEvidence: entry })
  );
  if (evidenceEntries.length === 0) {
    return [] as ValidationRunFindingRow[];
  }

  const title = "Focus management accessibility issue";
  const ruleKey = "accessibility_review.focus_management_issue";
  const existingRuleKeys = new Set(input.existingFindings.map((row) => row.rule_key));
  const existingTitles = new Set(input.existingFindings.map((row) => row.title.trim().toLowerCase()));
  if (existingRuleKeys.has(ruleKey) || existingTitles.has(title.toLowerCase())) {
    return [];
  }

  const pageUrls = [...new Set(evidenceEntries.map((entry) => entry.pageUrl).filter((value): value is string => typeof value === "string"))];
  const issueTypes = [...new Set(evidenceEntries.map((entry) => entry.issueType).filter((value): value is string => typeof value === "string"))];

  return [{
    category: "accessibility",
    description: "Behavior-reproduced focus-management evidence was retained from WS01 keyboard interaction tracing.",
    evidence_json: {
      confidenceBasis: [
        "WS01 reproduced the focus-management behavior with keyboard interaction tracing.",
        "Evidence includes sanitized active-element transitions, dialog context, expected behavior, and observed behavior."
      ],
      focusManagementEvidence: evidenceEntries,
      issueTypes,
      pageUrls,
      runtimeEvidence: evidenceEntries.map((entry) =>
        `${String(entry.issueType ?? "focus_management_issue")} on ${String(entry.pageUrl ?? "unknown page")}: ${String(entry.observed ?? "behavior reproduced")}`
      )
    },
    finding_rank: input.startingRank + 1,
    id: "supplemental:accessibility:focus_management_issue",
    page_url: pageUrls[0] ?? null,
    rule_key: ruleKey,
    severity: "high",
    subtype: "runtime_focus_management",
    title
  }];
}

function buildSupplementalPolicyQueueFindings(input: {
  existingFindings: ExistingFindingIdentity[];
  policyEnrichmentById: Map<string, PolicyEnrichmentLookupRow>;
  policyReviewQueueRows: PolicyReviewQueueRow[];
  startingRank: number;
}) {
  const existingRuleKeys = new Set(input.existingFindings.map((row) => row.rule_key));
  const existingTitles = new Set(input.existingFindings.map((row) => row.title.trim().toLowerCase()));
  const supplements: ValidationRunFindingRow[] = [];

  for (const row of input.policyReviewQueueRows) {
    const enrichment = row.policy_enrichment_id ? input.policyEnrichmentById.get(row.policy_enrichment_id) : undefined;
    const pageType = enrichment?.page_type ?? "unknown";
    const pageTypeLabel = normalizePolicyPageTypeLabel(pageType);
    const title = buildPolicyReviewTitle({
      pageTypeLabel,
      reason: row.reason
    });
    const ruleKey = `policy_review.${row.reason}.${String(pageType).toLowerCase()}`;
    const evidencePayload = buildPolicyReviewEvidencePayload({
      enrichment,
      policyEnrichmentId: row.policy_enrichment_id,
      reason: row.reason,
      reviewStatus: row.review_status
    });

    if (existingRuleKeys.has(ruleKey) || existingTitles.has(title.trim().toLowerCase())) {
      continue;
    }

    if (
      !shouldSurfaceSupplementalPolicyReviewFinding({
        evidence: evidencePayload,
        reason: row.reason,
        ruleKey
      })
    ) {
      continue;
    }

    supplements.push({
      category: "legal",
      description: buildPolicyReviewDescription(row.reason),
      evidence_json: evidencePayload,
      finding_rank: input.startingRank + supplements.length + 1,
      id: `supplemental:policy_review:${row.id}`,
      page_url: enrichment?.page_url ?? null,
      rule_key: ruleKey,
      severity: row.reason === "policy_behavior_conflict_candidate" ? "high" : "medium",
      subtype: "policy_review_queue",
      title
    });
  }

  return supplements;
}

function buildSupplementalSnapshotFindings(input: {
  accessibilityRuleExamples: ScanAccessibilityRuleExampleRow[];
  existingFindings: ExistingFindingIdentity[];
  snapshot: SnapshotSupplementRow | null;
  startingRank: number;
}) {
  const snapshot = input.snapshot;
  if (!snapshot) {
    return [] as ValidationRunFindingRow[];
  }

  const existingRuleKeys = new Set(input.existingFindings.map((row) => row.rule_key));
  const existingTitles = new Set(input.existingFindings.map((row) => row.title.trim().toLowerCase()));
  const supplements: ValidationRunFindingRow[] = [];

  if (snapshot.retargeting_pixel_detected === true) {
    const title = "Retargeting pixel detected";
    const ruleKey = "scan_snapshot.commerce.retargeting_pixel_detected";

    if (!existingRuleKeys.has(ruleKey) && !existingTitles.has(title.toLowerCase())) {
      supplements.push({
        category: "privacy",
        description: "Advertising or retargeting technology appears to be active and merits direct review.",
        evidence_json: {
          snapshotField: "retargeting_pixel_detected",
          value: true
        },
        finding_rank: input.startingRank + supplements.length + 1,
        id: "supplemental:snapshot:retargeting_pixel_detected",
        page_url: null,
        rule_key: ruleKey,
        severity: "high",
        subtype: "snapshot_review",
        title
      });
    }
  }

  const accessibilityExamplesByFindingId = new Map<string, ScanAccessibilityRuleExampleRow[]>();
  for (const example of input.accessibilityRuleExamples) {
    const findingId = getAccessibilityFindingIdForRuleCode(example.rule_code);
    if (!findingId) {
      continue;
    }
    accessibilityExamplesByFindingId.set(findingId, [
      ...(accessibilityExamplesByFindingId.get(findingId) ?? []),
      example
    ]);
  }

  for (const [findingId, examples] of accessibilityExamplesByFindingId) {
    const metadata = ACCESSIBILITY_SPLIT_FINDING_METADATA[findingId];
    if (!metadata) {
      continue;
    }

    if (!existingRuleKeys.has(metadata.ruleKey) && !existingTitles.has(metadata.title.toLowerCase())) {
      supplements.push({
        category: "accessibility",
        description: metadata.description,
        evidence_json: buildAccessibilitySplitEvidence(examples.slice(0, 5)),
        finding_rank: input.startingRank + supplements.length + 1,
        id: `supplemental:accessibility:${findingId}`,
        page_url: null,
        rule_key: metadata.ruleKey,
        severity: metadata.severity,
        subtype: "snapshot_review",
        title: metadata.title
      });
    }
  }

  return supplements;
}

function normalizeStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    : [];
}

function buildSupplementalCookieDisclosureGapFindings(input: {
  cookiePolicyRow: PolicyEnrichmentLookupRow | null;
  existingFindings: ExistingFindingIdentity[];
  runtimeArtifacts: Record<string, unknown> | null;
  startingRank: number;
}) {
  const ruleKey = "cookie_runtime.disclosure_gap";
  const title = "Cookie disclosure gap";
  const existingRuleKeys = new Set(input.existingFindings.map((row) => row.rule_key));
  const existingTitles = new Set(input.existingFindings.map((row) => row.title.trim().toLowerCase()));
  if (existingRuleKeys.has(ruleKey) || existingTitles.has(title.toLowerCase()) || !input.cookiePolicyRow || !input.runtimeArtifacts) {
    return [] as ValidationRunFindingRow[];
  }

  const cookieDisclosures = input.cookiePolicyRow.policy_cookie_disclosures ?? [];
  const policyFlags = normalizeStringArray(input.cookiePolicyRow.policy_actionable_flags);
  const policyConfidence = input.cookiePolicyRow.policy_semantic_confidence ?? null;
  const structurallyWeak =
    cookieDisclosures.length === 0 ||
    input.cookiePolicyRow.policy_structurally_weak === true ||
    (policyConfidence !== null && policyConfidence < 0.6) ||
    policyFlags.includes("low_confidence") ||
    policyFlags.includes("llm_provider_error");
  if (structurallyWeak) {
    return [] as ValidationRunFindingRow[];
  }

  const inventory = buildRuntimeCookieInventory({ runtimeArtifacts: input.runtimeArtifacts });
  const evidence = buildCookieDisclosureGapEvidence({
    cookiePolicyUrl: input.cookiePolicyRow.page_url,
    disclosures: cookieDisclosures,
    inventory
  });
  if (evidence.unmatched_cookie_count <= 0) {
    return [] as ValidationRunFindingRow[];
  }

  return [
    {
      category: "privacy",
      description: "Observed runtime cookies could not be reconciled to explicit cookie disclosures on the site.",
      evidence_json: {
        ...evidence,
        cookiePolicyUrl: evidence.cookie_policy_url,
        disclosedCookieNames: evidence.disclosed_cookie_names,
        disclosedCookieProviders: evidence.disclosed_cookie_providers,
        runtimeCookieNames: evidence.runtime_cookie_names,
        unmatchedCookieCategories: evidence.unmatched_cookie_categories,
        unmatchedCookieCount: evidence.unmatched_cookie_count,
        unmatchedCookieNames: evidence.unmatched_cookie_names,
        unmatchedCookieVendors: evidence.unmatched_cookie_vendors,
        unmatchedRuntimeCookies: evidence.unmatched_runtime_cookies,
        unmatchedThirdPartyCookieCount: evidence.unmatched_third_party_cookie_count
      },
      finding_rank: input.startingRank + 1,
      id: "supplemental:cookie_runtime:disclosure_gap",
      page_url: input.cookiePolicyRow.page_url ?? null,
      rule_key: ruleKey,
      severity: evidence.unmatched_third_party_cookie_count > 0 ? "high" : "medium",
      subtype: "runtime_policy_reconciliation",
      title
    }
  ];
}

async function loadSupplementalValidationFindings(input: {
  existingFindings: ExistingFindingIdentity[];
  scanId: string | null;
}) {
  if (!input.scanId) {
    return [] as ValidationRunFindingRow[];
  }

  let snapshot: SnapshotSupplementRow | null;
  let policyQueue: PolicyReviewQueueRow[];
  let accessibilityRuleExamples: ScanAccessibilityRuleExampleRow[];
  let cookiePolicyRow: PolicyEnrichmentLookupRow | null;
  let runtimeArtifacts: Record<string, unknown> | null;
  try {
    [snapshot, policyQueue, accessibilityRuleExamples, cookiePolicyRow, runtimeArtifacts] = await Promise.all([
      queryOne<SnapshotSupplementRow>(
        `
          select retargeting_pixel_detected, accessibility_litigation_risk_score
          from scan_snapshots
          where scan_id = $1
        `,
        [input.scanId],
        { readOnly: true }
      ),
      query<PolicyReviewQueueRow>(
        `
          select id, policy_enrichment_id, reason, review_status, scan_id
          from policy_review_queue
          where scan_id = $1
        `,
        [input.scanId],
        { readOnly: true }
      ).then((result) => result.rows),
      query<ScanAccessibilityRuleExampleRow>(
        `
          select
            page_url,
            rule_code,
            rule_group,
            severity,
            impact,
            help,
            help_url,
            description,
            node_count,
            representative_selectors
          from scan_accessibility_rule_examples
          where scan_id = $1
          order by node_count desc
          limit 10
        `,
        [input.scanId],
        { readOnly: true }
      ).then((result) => result.rows),
      queryOne<PolicyEnrichmentLookupRow>(
        `
          select
            id,
            page_type,
            page_url,
            policy_actionable_flags,
            policy_cookie_disclosures,
            policy_semantic_confidence,
            policy_structurally_weak,
            policy_summary_short
          from policy_enrichment
          where scan_id = $1
            and page_type = 'cookie_policy'
          order by created_at desc
          limit 1
        `,
        [input.scanId],
        { readOnly: true }
      ),
      queryOne<Record<string, unknown>>(
        `
          select *
          from scan_runtime_artifacts
          where scan_id = $1
        `,
        [input.scanId],
        { readOnly: true }
      )
    ]);
  } catch (error) {
    throw new Error(`Failed to load supplemental validation findings for ${input.scanId}: ${getErrorMessage(error)}`);
  }

  const queueRows = policyQueue;
  const enrichmentIds = queueRows
    .map((row) => row.policy_enrichment_id)
    .filter((value): value is string => typeof value === "string" && value.length > 0);

  let policyEnrichmentRows: PolicyEnrichmentLookupRow[] = [];
  if (enrichmentIds.length > 0) {
    try {
      policyEnrichmentRows = await query<PolicyEnrichmentLookupRow>(
        `
          select
            id,
            page_type,
            page_url,
            policy_ambiguity_score,
            policy_arbitration_present,
            policy_cancellation_or_refund_present,
            policy_coverage_ratio,
            policy_effective_date,
            policy_field_coverage,
            policy_governing_law,
            policy_notice_contact_present,
            policy_semantic_confidence,
            policy_snippet_count,
            policy_structurally_weak,
            policy_summary_short,
            policy_termination_or_suspension_present
          from policy_enrichment
          where id = any($1::uuid[])
        `,
        [enrichmentIds],
        { readOnly: true }
      ).then((result) => result.rows);
    } catch (error) {
      throw new Error(`Failed to load supplemental policy enrichment rows for ${input.scanId}: ${getErrorMessage(error)}`);
    }
  }
  const policyEnrichmentById = new Map(policyEnrichmentRows.map((row) => [row.id, row]));

  const policySupplements = buildSupplementalPolicyQueueFindings({
    existingFindings: input.existingFindings,
    policyEnrichmentById,
    policyReviewQueueRows: queueRows,
    startingRank: input.existingFindings.length
  });
  const snapshotSupplements = buildSupplementalSnapshotFindings({
    accessibilityRuleExamples,
    existingFindings: [...input.existingFindings, ...policySupplements],
    snapshot: snapshot ?? null,
    startingRank: input.existingFindings.length + policySupplements.length
  });
  const cookieGapSupplements = buildSupplementalCookieDisclosureGapFindings({
    cookiePolicyRow: cookiePolicyRow ?? null,
    existingFindings: [...input.existingFindings, ...policySupplements, ...snapshotSupplements],
    runtimeArtifacts: runtimeArtifacts ?? null,
    startingRank: input.existingFindings.length + policySupplements.length + snapshotSupplements.length
  });
  const focusManagementSupplements = buildSupplementalFocusManagementFinding({
    existingFindings: [...input.existingFindings, ...policySupplements, ...snapshotSupplements, ...cookieGapSupplements],
    runtimeArtifacts: runtimeArtifacts ?? null,
    startingRank: input.existingFindings.length + policySupplements.length + snapshotSupplements.length + cookieGapSupplements.length
  });

  return [...policySupplements, ...snapshotSupplements, ...cookieGapSupplements, ...focusManagementSupplements].map((row, index) => ({
    ...row,
    finding_rank: input.existingFindings.length + index + 1
  }));
}

export async function loadSupplementalValidationFindingsForScan(input: {
  existingFindings: Array<{
    title: string;
    ruleKey: string;
  }>;
  scanId: string | null;
}) {
  const supplementalRows = await loadSupplementalValidationFindings({
    existingFindings: input.existingFindings.map((finding) => ({
      rule_key: finding.ruleKey,
      title: finding.title
    })),
    scanId: input.scanId
  });

  return supplementalRows.map((row) => ({
    agreementScore: null,
    category: row.category,
    description: row.description,
    evidence: row.evidence_json ?? null,
    findingFamily: null,
    findingScope: null,
    findingSource: null,
    findingSubject: null,
    id: row.id,
    model: null,
    modelConfidence: null,
    pageUrl: row.page_url,
    promptVersion: null,
    rationale: null,
    ruleKey: row.rule_key,
    severity: row.severity,
    subtype: row.subtype,
    systemConfidenceBand: null,
    systemConfidenceExplanation: null,
    systemConfidenceScore: null,
    title: row.title,
    verdict: null
  }));
}

function shouldLoadSupplementalFindingsForRunStatus(status: string | null | undefined) {
  return status === "completed" || status === "failed";
}

function getEffectiveValidationRunStatus(input: {
  scanStatus?: string | null;
  status: string | null | undefined;
}) {
  if (input.status === "completed" || input.status === "failed") {
    return input.status;
  }

  if (input.scanStatus === "completed") {
    return "completed";
  }

  if (input.scanStatus === "failed") {
    return "failed";
  }

  if (input.status === "waiting_for_scan") {
    return "waiting_for_scan";
  }

  if (input.scanStatus === "running" || input.scanStatus === "processing") {
    return "collecting";
  }

  return input.status ?? null;
}

export async function ensureValidationRunForManualScan(input: {
  domainId: string;
  hostname: string;
  normalizedUrl: string;
  organizationId: string | null;
  scanId: string;
  submittedByUserId: string | null;
  triggerMode?: ValidationRunMode;
}) {
  const availability = getValidationQueueAvailability();
  if (!availability.enabled) {
    return null;
  }

  let settings: { pipeline_enabled: boolean } | null;
  try {
    settings = await queryOne<{ pipeline_enabled: boolean }>(
      `
        select pipeline_enabled
        from validation_settings
        where singleton_key = 'default'
      `,
      [],
      { readOnly: true }
    );
  } catch (error) {
    throw new Error(`Failed to load validation pipeline state: ${getErrorMessage(error)}`);
  }

  if (process.env.VALIDATION_PIPELINE_ENABLED === "0" || !settings?.pipeline_enabled) {
    return null;
  }

  let existingRun: { id: string } | null;
  try {
    existingRun = await queryOne<{ id: string }>(
      `
        select id
        from validation_runs
        where scan_id = $1
        order by created_at desc
        limit 1
      `,
      [input.scanId],
      { readOnly: true }
    );
  } catch (error) {
    throw new Error(`Failed to check validation run for manual scan ${input.scanId}: ${getErrorMessage(error)}`);
  }

  if (existingRun) {
    return existingRun.id;
  }

  let previousRun: { tranco_rank: number | null; rank_band: string | null } | null;
  try {
    previousRun = await queryOne<{ tranco_rank: number | null; rank_band: string | null }>(
      `
        select tranco_rank, rank_band
        from validation_runs
        where domain_id = $1
        order by created_at desc
        limit 1
      `,
      [input.domainId],
      { readOnly: true }
    );
  } catch (error) {
    throw new Error(`Failed to load previous validation run for manual scan ${input.scanId}: ${getErrorMessage(error)}`);
  }

  const insertBase = {
    domain_id: input.domainId,
    hostname: input.hostname,
    normalized_url: input.normalizedUrl,
    rank_band: previousRun?.rank_band ?? null,
    scan_id: input.scanId,
    tranco_rank: previousRun?.tranco_rank ?? null,
    trigger_mode: input.triggerMode ?? "manual",
    triggered_by_user_id: input.submittedByUserId
  };

  let run: { id: string } | null = null;
  let runError: { message?: string } | null = null;

  {
    try {
      run = await queryOne<{ id: string }>(
        `
          insert into validation_runs (
            domain_id,
            hostname,
            normalized_url,
            rank_band,
            scan_id,
            tranco_rank,
            trigger_mode,
            triggered_by_user_id,
            status
          )
          values ($1, $2, $3, $4, $5, $6, $7, $8, 'waiting_for_scan')
          returning id
        `,
        [
          insertBase.domain_id,
          insertBase.hostname,
          insertBase.normalized_url,
          insertBase.rank_band,
          insertBase.scan_id,
          insertBase.tranco_rank,
          insertBase.trigger_mode,
          insertBase.triggered_by_user_id
        ]
      );
    } catch (error) {
      runError = { message: getErrorMessage(error) };
    }
  }

  const statusConstraintRejectedWaitingForScan =
    !run &&
    typeof runError?.message === "string" &&
    runError.message.includes("validation_runs_status_check");

  if (statusConstraintRejectedWaitingForScan) {
    try {
      run = await queryOne<{ id: string }>(
        `
          insert into validation_runs (
            domain_id,
            hostname,
            normalized_url,
            rank_band,
            scan_id,
            tranco_rank,
            trigger_mode,
            triggered_by_user_id,
            status
          )
          values ($1, $2, $3, $4, $5, $6, $7, $8, 'queued')
          returning id
        `,
        [
          insertBase.domain_id,
          insertBase.hostname,
          insertBase.normalized_url,
          insertBase.rank_band,
          insertBase.scan_id,
          insertBase.tranco_rank,
          insertBase.trigger_mode,
          insertBase.triggered_by_user_id
        ]
      );
      runError = null;
    } catch (error) {
      runError = { message: getErrorMessage(error) };
    }
  }

  if (runError || !run) {
    throw new Error(`Failed to create validation run for manual scan ${input.scanId}: ${runError?.message ?? "Unknown error"}`);
  }

  await query(
    `
      insert into validation_audit_events (actor_user_id, event_type, metadata_json)
      values ($1, $2, $3)
    `,
    [
      input.submittedByUserId,
      "validation.manual_run_queued",
      {
        domainId: input.domainId,
        hostname: input.hostname,
        reason: input.triggerMode === "automatic" ? "scheduled_scan_created" : "manual_scan_created",
        scanId: input.scanId,
        validationRunId: run.id
      }
    ]
  );

  try {
    await enqueueValidationCollectJob(run.id);
  } catch (error) {
    console.error("[validation] failed to enqueue collect job for scan validation run", {
      error: getErrorMessage(error),
      scanId: input.scanId,
      validationRunId: run.id
    });
  }

  return run.id;
}

async function ensureValidationDomainForOrganization(input: {
  organizationId: string;
  hostname: string;
  normalizedUrl: string;
}) {
  let existing: { hostname: string; id: string; normalized_url: string } | null;
  try {
    existing = await queryOne<{ hostname: string; id: string; normalized_url: string }>(
      `
        select id, hostname, normalized_url
        from domains
        where organization_id = $1
          and normalized_url = $2
      `,
      [input.organizationId, input.normalizedUrl],
      { readOnly: true }
    );
  } catch (error) {
    throw new Error(`Failed to load validation domain ${input.normalizedUrl}: ${getErrorMessage(error)}`);
  }

  if (existing) {
    return existing;
  }

  const data = await queryOne<{ hostname: string; id: string; normalized_url: string }>(
    `
      insert into domains (hostname, normalized_url, organization_id, scan_frequency)
      values ($1, $2, $3, 'manual')
      returning id, hostname, normalized_url
    `,
    [input.hostname, input.normalizedUrl, input.organizationId]
  );

  if (!data) {
    throw new Error(`Failed to create validation domain ${input.hostname}: Unknown error`);
  }

  return data;
}

async function createValidationScan(input: {
  domainId: string;
  hostname: string;
  normalizedUrl: string;
  organizationId: string;
  pagesRequested?: number;
  submittedByUserId: string;
}) {
  const pagesRequested = Math.max(3, input.pagesRequested ?? 8);
  const scanConfig = buildSharedFullScanConfig({
    hostname: input.hostname,
    maxPages: pagesRequested,
    normalizedUrl: input.normalizedUrl,
    processor: "agentic-validation-v1",
    profile: "agentic-validation-v1",
    source: "validation-manual"
  });

  const data = await queryOne<{ id: string }>(
    `
      insert into scans (
        domain_id,
        organization_id,
        pages_requested,
        pages_scanned,
        scan_config_json,
        scan_type,
        status,
        submitted_by_user_id
      )
      values ($1, $2, $3, 0, $4, 'full', 'queued', $5)
      returning id
    `,
    [input.domainId, input.organizationId, pagesRequested, scanConfig, input.submittedByUserId]
  );

  if (!data) {
    throw new Error(`Failed to create validation scan for ${input.hostname}: Unknown error`);
  }

  const scanId = data.id;
  await query(
    `
      update domains
         set latest_scan_id = $3
       where id = $1
         and organization_id = $2
    `,
    [input.domainId, input.organizationId, scanId]
  );

  return scanId;
}

function getPipelineState(settings: ValidationSettingsRow): ValidationPipelineState {
  return process.env.VALIDATION_PIPELINE_ENABLED === "0"
    ? "paused_by_env"
    : settings.pipeline_enabled
      ? "running"
      : "paused_by_admin";
}

async function requireAdmin() {
  return requireValidationAdminContext();
}

export async function getValidationSettings() {
  const context = await requireAdmin();
  const data = await queryOne<ValidationSettingsRow>(
    `
      insert into validation_settings (
        automatic_interval_minutes,
        run_mode,
        singleton_key
      )
      values ($1, $2, 'default')
      on conflict (singleton_key) do update
        set automatic_interval_minutes = validation_settings.automatic_interval_minutes
      returning
        singleton_key,
        pipeline_enabled,
        run_mode,
        automatic_interval_minutes,
        operator_note,
        updated_at,
        updated_by_user_id,
        next_due_at,
        last_tranco_sync_at,
        last_worker_heartbeat_at,
        last_worker_started_at,
        last_worker_host
    `,
    [VALIDATION_DEFAULT_INTERVAL_MINUTES, VALIDATION_DEFAULT_RUN_MODE]
  );

  if (!data) {
    throw new Error("Failed to load validation settings: Unknown error");
  }

  const row = data;
  const queueHealth = getValidationQueueAvailability().enabled ? await getValidationQueueHealth() : null;
  const heartbeatAgeMs = row.last_worker_heartbeat_at ? Date.now() - new Date(row.last_worker_heartbeat_at).getTime() : null;
  const workerHealthy = typeof heartbeatAgeMs === "number" ? heartbeatAgeMs <= 90_000 : false;
  const collectWaiting = queueHealth?.collect.waiting ?? 0;
  const rankWaiting = queueHealth?.rank.waiting ?? 0;
  const collectActive = queueHealth?.collect.active ?? 0;
  const rankActive = queueHealth?.rank.active ?? 0;
  const backlogDetected = Boolean(
    queueHealth &&
      (collectWaiting > 0 || rankWaiting > 0) &&
      collectActive + rankActive === 0
  );

  return {
    automaticIntervalMinutes: row.automatic_interval_minutes,
    lastTrancoSyncAt: row.last_tranco_sync_at,
    lastWorkerHeartbeatAt: row.last_worker_heartbeat_at,
    lastWorkerHost: row.last_worker_host,
    lastWorkerStartedAt: row.last_worker_started_at,
    nextDueAt: row.next_due_at,
    operatorNote: row.operator_note,
    pipelineEnabled: row.pipeline_enabled,
    pipelineState: getPipelineState(row),
    queueHealth,
    runMode: row.run_mode,
    updatedAt: row.updated_at,
    updatedByUserId: row.updated_by_user_id,
    workerBacklogDetected: backlogDetected,
    workerHealthy,
    viewerEmail: context.user.email ?? ""
  };
}

export async function listValidationTargets(limit = 25) {
  await requireAdmin();
  let manualRows: ValidationTargetRow[];
  let trancoRows: ValidationTargetRow[];
  try {
    [manualRows, trancoRows] = await Promise.all([
      query<ValidationTargetRow>(
        `
          select
            id, hostname, normalized_url, tranco_rank, rank_band, active, denylisted, deny_reason,
            cooldown_until, backoff_until, last_status, last_error, last_run_at, last_completed_at,
            failure_count, source, created_at, updated_at
          from validation_targets
          where source = 'manual'
          order by updated_at desc
          limit $1
        `,
        [limit],
        { readOnly: true }
      ).then((result) => result.rows),
      query<ValidationTargetRow>(
        `
          select
            id, hostname, normalized_url, tranco_rank, rank_band, active, denylisted, deny_reason,
            cooldown_until, backoff_until, last_status, last_error, last_run_at, last_completed_at,
            failure_count, source, created_at, updated_at
          from validation_targets
          where source <> 'manual' or source is null
          order by tranco_rank asc nulls first
          limit $1
        `,
        [Math.max(limit * 20, 100)],
        { readOnly: true }
      ).then((result) => result.rows)
    ]);
  } catch (error) {
    throw new Error(`Failed to load validation targets: ${getErrorMessage(error)}`);
  }

  const rows = [
    ...manualRows,
    ...trancoRows
  ];
  const persistedRows = sortValidationTargetsForDisplay(rows).slice(0, limit);
  const persistedHostnames = new Set(persistedRows.map((row) => row.hostname));

  let displayRows = persistedRows;
  if (displayRows.length < limit) {
    const previewRows = getUpcomingTargets(await listTrancoPreviewTargets(limit * 2), limit * 2).filter(
      (row) => !persistedHostnames.has(row.hostname)
    );
    displayRows = [...persistedRows, ...previewRows].slice(0, limit);
  }

  return displayRows.map((row) => ({
    active: row.active,
    backoffUntil: row.backoff_until,
    cooldownUntil: row.cooldown_until,
    denyReason: row.deny_reason,
    denylisted: row.denylisted,
    hostname: row.hostname,
    id: row.id,
    isPersisted: !row.id.startsWith("tranco-preview-"),
    lastError: row.last_error,
    lastStatus: row.last_status,
    normalizedUrl: row.normalized_url,
    rankBand: row.rank_band,
    source: row.source ?? "tranco",
    trancoRank: row.tranco_rank
  }));
}

export async function listValidationRuns(input?: {
  page?: number;
  rankBand?: string | null;
  ruleKey?: string | null;
  status?: string | null;
}) {
  await requireAdmin();
  const page = Math.max(1, input?.page ?? 1);
  const from = (page - 1) * 50;
  const to = from + 49;

  let scanIdsFilter: string[] | null = null;
  if (input?.ruleKey) {
    let matchingRunIds: Array<{ validation_run_id: string }>;
    try {
      matchingRunIds = await query<{ validation_run_id: string }>(
        `
          select validation_run_id
          from validation_run_findings
          where rule_key = $1
        `,
        [input.ruleKey],
        { readOnly: true }
      ).then((result) => result.rows);
    } catch (error) {
      throw new Error(`Failed to filter validation runs by rule key: ${getErrorMessage(error)}`);
    }

    scanIdsFilter = [...new Set(matchingRunIds.map((row) => row.validation_run_id))];
    if (scanIdsFilter.length === 0) {
      return {
        items: [],
        page,
        pageCount: 0,
        totalCount: 0
      };
    }
  }

  const whereClauses = ["1 = 1"];
  const values: unknown[] = [];
  if (input?.status) {
    values.push(input.status);
    whereClauses.push(`status = $${values.length}`);
  }
  if (input?.rankBand) {
    values.push(input.rankBand);
    whereClauses.push(`rank_band = $${values.length}`);
  }
  if (scanIdsFilter) {
    values.push(scanIdsFilter);
    whereClauses.push(`id = any($${values.length}::uuid[])`);
  }

  let rows: ValidationRunRow[];
  let countRow: { count: number } | null;
  try {
    [rows, countRow] = await Promise.all([
      query<ValidationRunRow>(
        `
          select
            id,
            domain_id,
            hostname,
            tranco_rank,
            rank_band,
            trigger_mode,
            status,
            scan_id,
            created_at,
            completed_at,
            finding_count,
            reviewed_finding_count,
            average_agreement_score,
            error_message
          from validation_runs
          where ${whereClauses.join(" and ")}
          order by created_at desc
          offset $${values.length + 1}
          limit $${values.length + 2}
        `,
        [...values, from, to - from + 1],
        { readOnly: true }
      ).then((result) => result.rows),
      queryOne<{ count: number }>(
        `
          select count(*)::int as count
          from validation_runs
          where ${whereClauses.join(" and ")}
        `,
        values,
        { readOnly: true }
      )
    ]);
  } catch (error) {
    throw new Error(`Failed to load validation runs: ${getErrorMessage(error)}`);
  }

  const runIds = rows.map((row) => row.id);
  const scanIds = rows.map((row) => row.scan_id).filter((value): value is string => typeof value === "string" && value.length > 0);
  const findingCountByRun = new Map<string, number>();
  const existingFindingIdentitiesByRun = new Map<string, ExistingFindingIdentity[]>();
  const scanStatusById = new Map<string, { completed_at: string | null; started_at: string | null; status: string }>();

  if (runIds.length > 0) {
    let findings: Array<{ id: string; validation_run_id: string; rule_key: string; title: string }>;
    try {
      findings = await query<{ id: string; validation_run_id: string; rule_key: string; title: string }>(
        `
          select id, validation_run_id, rule_key, title
          from validation_run_findings
          where validation_run_id = any($1::uuid[])
        `,
        [runIds],
        { readOnly: true }
      ).then((result) => result.rows);
    } catch (error) {
      throw new Error(`Failed to load validation run findings: ${getErrorMessage(error)}`);
    }

    for (const row of findings) {
      const list = findingCountByRun.get(row.validation_run_id) ?? 0;
      findingCountByRun.set(row.validation_run_id, list + 1);
      const existing = existingFindingIdentitiesByRun.get(row.validation_run_id) ?? [];
      existing.push({ rule_key: row.rule_key, title: row.title });
      existingFindingIdentitiesByRun.set(row.validation_run_id, existing);
    }
  }

  if (scanIds.length > 0) {
    let scans: Array<{ completed_at: string | null; id: string; started_at: string | null; status: string }>;
    try {
      scans = await query<{ completed_at: string | null; id: string; started_at: string | null; status: string }>(
        `
          select id, status, started_at, completed_at
          from scans
          where id = any($1::uuid[])
        `,
        [scanIds],
        { readOnly: true }
      ).then((result) => result.rows);
    } catch (error) {
      throw new Error(`Failed to load linked scans for validation runs: ${getErrorMessage(error)}`);
    }

    for (const row of scans) {
      scanStatusById.set(row.id, row);
    }
  }

  const supplementalCountByRun = new Map<string, number>();
  for (const row of rows) {
    const effectiveStatus = getEffectiveValidationRunStatus({
      scanStatus: row.scan_id ? (scanStatusById.get(row.scan_id)?.status ?? null) : null,
      status: row.status
    });
    const persistedCount = findingCountByRun.get(row.id) ?? row.finding_count;
    const supplements = shouldLoadSupplementalFindingsForRunStatus(effectiveStatus)
      ? await loadSupplementalValidationFindings({
          existingFindings: existingFindingIdentitiesByRun.get(row.id) ?? [],
          scanId: row.scan_id
        })
      : [];
    supplementalCountByRun.set(row.id, persistedCount + supplements.length);
  }

  const totalCount = countRow?.count ?? 0;
  return {
    items: rows.map((row) => ({
      averageAgreementScore: null,
      completedAt: row.completed_at,
      createdAt: row.created_at,
      domainId: row.domain_id,
      errorMessage: row.error_message,
      findingCount: supplementalCountByRun.get(row.id) ?? findingCountByRun.get(row.id) ?? row.finding_count,
      hostname: row.hostname,
      id: row.id,
      rankBand: row.rank_band,
      reviewedFindingCount: 0,
      scanCompletedAt: row.scan_id ? (scanStatusById.get(row.scan_id)?.completed_at ?? null) : null,
      scanId: row.scan_id,
      scanStartedAt: row.scan_id ? (scanStatusById.get(row.scan_id)?.started_at ?? null) : null,
      scanStatus: row.scan_id ? (scanStatusById.get(row.scan_id)?.status ?? null) : null,
      status: getEffectiveValidationRunStatus({
        scanStatus: row.scan_id ? (scanStatusById.get(row.scan_id)?.status ?? null) : null,
        status: row.status
      }),
      trancoRank: row.tranco_rank,
      triggerMode: row.trigger_mode
    })),
    page,
    pageCount: Math.ceil(totalCount / 50),
    totalCount
  };
}

export async function getValidationRunDetail(validationRunId: string) {
  await requireAdmin();
  let run: ValidationRunRow | null;
  try {
    run = await queryOne<ValidationRunRow>(
      `
        select
          id,
          domain_id,
          hostname,
          tranco_rank,
          rank_band,
          trigger_mode,
          status,
          scan_id,
          created_at,
          completed_at,
          finding_count,
          reviewed_finding_count,
          average_agreement_score,
          error_message
        from validation_runs
        where id = $1
      `,
      [validationRunId],
      { readOnly: true }
    );
  } catch (error) {
    throw new Error(`Failed to load validation run ${validationRunId}: ${getErrorMessage(error)}`);
  }

  if (!run) {
    return null;
  }

  const runScanId = run.scan_id;
  let scanRow: { completed_at: string | null; started_at: string | null; status: string } | null = null;
  let scanSnapshot: Record<string, unknown> | null = null;
  let runtimeArtifacts: Record<string, unknown> | null = null;
  let accessibilityRuleCountTotal = 0;
  let scanEvents: ScanEventRow[] = [];
  let policyEnrichmentRows: Record<string, unknown>[] = [];

  try {
    [
      scanRow,
      scanSnapshot,
      runtimeArtifacts,
      accessibilityRuleCountTotal,
      scanEvents,
      policyEnrichmentRows
    ] = await Promise.all([
      runScanId
        ? queryOne<{ completed_at: string | null; started_at: string | null; status: string }>(
            `
              select status, started_at, completed_at
              from scans
              where id = $1
            `,
            [runScanId],
            { readOnly: true }
          )
        : Promise.resolve(null),
      runScanId
        ? queryOne<Record<string, unknown>>(
            `
              select
                timeout_flag,
                render_mode_used,
                preconsent_tracking_detected,
                tracking_before_consent_detected,
                wcag_error_count_total,
                pages_scanned,
                pages_requested
              from scan_snapshots
              where scan_id = $1
            `,
            [runScanId],
            { readOnly: true }
          )
        : Promise.resolve(null),
      runScanId
        ? queryOne<Record<string, unknown>>(
            `
              select
                consent_audit_completed,
                consent_preconsent_violation_count,
                consent_baseline_tracker_evidence_urls,
                key_page_discovery_summary,
                hybrid_runtime_evidence
              from scan_runtime_artifacts
              where scan_id = $1
            `,
            [runScanId],
            { readOnly: true }
          )
        : Promise.resolve(null),
      runScanId
        ? queryOne<{ count: number }>(
            `
              select count(*)::int as count
              from scan_accessibility_rule_counts
              where scan_id = $1
            `,
            [runScanId],
            { readOnly: true }
          ).then((row) => row?.count ?? 0)
        : Promise.resolve(0),
      runScanId
        ? query<ScanEventRow>(
            `
              select id, event_type, message, metadata_json, created_at
              from scan_events
              where scan_id = $1
              order by created_at asc
            `,
            [runScanId],
            { readOnly: true }
          ).then((result) => result.rows)
        : Promise.resolve([] as ScanEventRow[]),
      runScanId
        ? query<Record<string, unknown>>(
            `
              select *
              from policy_enrichment
              where scan_id = $1
              order by created_at asc
            `,
            [runScanId],
            { readOnly: true }
          ).then((result) => result.rows)
        : Promise.resolve([] as Record<string, unknown>[])
    ]);
  } catch (error) {
    throw new Error(`Failed to load validation run detail context: ${getErrorMessage(error)}`);
  }

  let findingRows: ValidationRunFindingRow[];
  try {
    findingRows = await query<ValidationRunFindingRow>(
      `
        select
          id,
          category,
          subtype,
          rule_key,
          title,
          description,
          severity,
          page_url,
          evidence_json,
          finding_rank
        from validation_run_findings
        where validation_run_id = $1
        order by finding_rank asc
      `,
      [validationRunId],
      { readOnly: true }
    ).then((result) => result.rows);
  } catch (error) {
    throw new Error(`Failed to load validation run findings: ${getErrorMessage(error)}`);
  }

  const findingIds = findingRows.map((row) => row.id);
  const confidenceByFindingId = new Map<string, ValidationFindingConfidenceRow>();

  if (findingIds.length > 0) {
    let verdictRows: ValidationFindingConfidenceRow[];
    try {
      verdictRows = await query<ValidationFindingConfidenceRow>(
        `
          select validation_run_finding_id, confidence
          from validation_verdicts
          where validation_run_finding_id = any($1::uuid[])
          order by created_at desc
        `,
        [findingIds],
        { readOnly: true }
      ).then((result) => result.rows);
    } catch (error) {
      throw new Error(`Failed to load validation verdicts: ${getErrorMessage(error)}`);
    }

    for (const row of verdictRows) {
      if (!confidenceByFindingId.has(row.validation_run_finding_id)) {
        confidenceByFindingId.set(row.validation_run_finding_id, row);
      }
    }
  }

  let normalizedFindings = findingRows.map((row) => ({
    ...row,
    validation_verdicts: confidenceByFindingId.get(row.id) ?? null
  })) as ValidationRunFindingRow[];
  const scanStatus =
    scanRow && typeof (scanRow as { status?: unknown }).status === "string"
      ? String((scanRow as { status: string }).status)
      : null;
  const effectiveStatus = getEffectiveValidationRunStatus({
    scanStatus,
    status: run.status
  });
  const supplementalFindings = shouldLoadSupplementalFindingsForRunStatus(effectiveStatus)
    ? await loadSupplementalValidationFindings({
        existingFindings: normalizedFindings,
        scanId: runScanId
    })
    : [];
  normalizedFindings = [...normalizedFindings, ...supplementalFindings];
  const mergedSignalsByScanId = runScanId
    ? await loadMergedSignalsByScanId({
        observedAtByScanId: new Map<string, string | null>([
          [
            runScanId,
            (scanRow && typeof (scanRow as { completed_at?: unknown }).completed_at === "string"
              ? String((scanRow as { completed_at: string }).completed_at)
              : null) ??
              (scanRow && typeof (scanRow as { started_at?: unknown }).started_at === "string"
                ? String((scanRow as { started_at: string }).started_at)
                : null) ??
              (run as ValidationRunRow).created_at
          ]
        ]),
        scanIds: [runScanId]
      })
    : new Map();

  return {
    averageAgreementScore: (run as ValidationRunRow).average_agreement_score,
    completedAt:
      (run as ValidationRunRow).completed_at ??
      (scanRow && typeof (scanRow as { completed_at?: unknown }).completed_at === "string"
        ? String((scanRow as { completed_at: string }).completed_at)
        : null),
    createdAt: (run as ValidationRunRow).created_at,
    domainId: (run as ValidationRunRow).domain_id,
    errorMessage: (run as ValidationRunRow).error_message,
    findingCount: normalizedFindings.length,
    hostname: (run as ValidationRunRow).hostname,
    id: (run as ValidationRunRow).id,
    rankBand: (run as ValidationRunRow).rank_band,
    reviewedFindingCount: (run as ValidationRunRow).reviewed_finding_count,
    scanCompletedAt:
      scanRow && typeof (scanRow as { completed_at?: unknown }).completed_at === "string"
        ? String((scanRow as { completed_at: string }).completed_at)
        : null,
    scanId: (run as ValidationRunRow).scan_id,
    scanStartedAt:
      scanRow && typeof (scanRow as { started_at?: unknown }).started_at === "string"
        ? String((scanRow as { started_at: string }).started_at)
        : null,
    scanStatus:
      scanStatus,
    scanExecution: {
      accessibilityRuleCountTotal: accessibilityRuleCountTotal ?? 0,
      consentAuditCompleted:
        runtimeArtifacts && typeof (runtimeArtifacts as { consent_audit_completed?: unknown }).consent_audit_completed === "boolean"
          ? Boolean((runtimeArtifacts as { consent_audit_completed: boolean }).consent_audit_completed)
          : getHybridConsentAuditCompleted((runtimeArtifacts as Record<string, unknown> | null) ?? null),
      consentPreconsentViolationCount:
        runtimeArtifacts && typeof (runtimeArtifacts as { consent_preconsent_violation_count?: unknown }).consent_preconsent_violation_count === "number"
          ? Number((runtimeArtifacts as { consent_preconsent_violation_count: number }).consent_preconsent_violation_count)
          : getHybridPreconsentViolationCount((runtimeArtifacts as Record<string, unknown> | null) ?? null),
      keyPageDiscoverySummary:
        runtimeArtifacts && typeof (runtimeArtifacts as { key_page_discovery_summary?: unknown }).key_page_discovery_summary === "object"
          ? ((runtimeArtifacts as { key_page_discovery_summary: unknown }).key_page_discovery_summary ?? null)
          : null,
      pagesRequested:
        scanSnapshot && typeof (scanSnapshot as { pages_requested?: unknown }).pages_requested === "number"
          ? Number((scanSnapshot as { pages_requested: number }).pages_requested)
          : null,
      pagesScanned:
        scanSnapshot && typeof (scanSnapshot as { pages_scanned?: unknown }).pages_scanned === "number"
          ? Number((scanSnapshot as { pages_scanned: number }).pages_scanned)
          : null,
      preconsentTrackingDetected:
        scanSnapshot && typeof (scanSnapshot as { preconsent_tracking_detected?: unknown }).preconsent_tracking_detected === "boolean"
          ? Boolean((scanSnapshot as { preconsent_tracking_detected: boolean }).preconsent_tracking_detected)
          : null,
      renderModeUsed:
        scanSnapshot && typeof (scanSnapshot as { render_mode_used?: unknown }).render_mode_used === "string"
          ? String((scanSnapshot as { render_mode_used: string }).render_mode_used)
          : null,
      timeoutFlag:
        scanSnapshot && typeof (scanSnapshot as { timeout_flag?: unknown }).timeout_flag === "boolean"
          ? Boolean((scanSnapshot as { timeout_flag: boolean }).timeout_flag)
          : null,
      trackerEvidenceUrlCount:
        runtimeArtifacts &&
        Array.isArray((runtimeArtifacts as { consent_baseline_tracker_evidence_urls?: unknown }).consent_baseline_tracker_evidence_urls)
          ? ((runtimeArtifacts as { consent_baseline_tracker_evidence_urls: unknown[] }).consent_baseline_tracker_evidence_urls).length
          : getHybridPreconsentTrackerEvidenceUrls((runtimeArtifacts as Record<string, unknown> | null) ?? null).length,
      trackingBeforeConsentDetected:
        scanSnapshot && typeof (scanSnapshot as { tracking_before_consent_detected?: unknown }).tracking_before_consent_detected === "boolean"
          ? Boolean((scanSnapshot as { tracking_before_consent_detected: boolean }).tracking_before_consent_detected)
          : null,
      wcagErrorCountTotal:
        scanSnapshot && typeof (scanSnapshot as { wcag_error_count_total?: unknown }).wcag_error_count_total === "number"
          ? Number((scanSnapshot as { wcag_error_count_total: number }).wcag_error_count_total)
          : null
    },
    scanEvents: ((scanEvents ?? []) as ScanEventRow[]).map((event) => ({
      createdAt: event.created_at,
      eventType: event.event_type,
      id: event.id,
      message: event.message,
      metadataJson: event.metadata_json
    })),
    policyEnrichment: ((policyEnrichmentRows ?? []) as Record<string, unknown>[]).map((row) => ({ ...row })),
    mergedSignals: runScanId ? mergedSignalsByScanId.get(runScanId) ?? [] : [],
    status: effectiveStatus,
    trancoRank: (run as ValidationRunRow).tranco_rank,
    triggerMode: (run as ValidationRunRow).trigger_mode,
    rows: normalizedFindings.map((finding) => {
      const verdictRows = Array.isArray(finding.validation_verdicts)
        ? finding.validation_verdicts
        : finding.validation_verdicts
          ? [finding.validation_verdicts]
          : [];
      const verdict = verdictRows[0];

      return {
        automatedFinding: {
          category: finding.category,
          description: finding.description,
          evidence: finding.evidence_json ?? {},
          modelConfidence: verdict?.confidence ?? null,
          pageUrl: finding.page_url,
          rank: finding.finding_rank,
          ruleKey: finding.rule_key,
          severity: finding.severity,
          subtype: finding.subtype,
          title: finding.title
        }
      };
    })
  };
}

export async function getValidationIssueAnalytics() {
  await requireAdmin();
  let findingRows: Array<{ id: string; rule_key: string; title: string }>;
  try {
    findingRows = await query<{ id: string; rule_key: string; title: string }>(
      `
        select id, rule_key, title
        from validation_run_findings
      `,
      [],
      { readOnly: true }
    ).then((result) => result.rows);
  } catch (error) {
    throw new Error(`Failed to load validation finding analytics: ${getErrorMessage(error)}`);
  }

  const findingIds = findingRows.map((row) => row.id);
  const verdictMap = new Map<string, ValidationVerdict>();

  if (findingIds.length > 0) {
    let verdicts: Array<{ validation_run_finding_id: string; verdict: ValidationVerdict }>;
    try {
      verdicts = await query<{ validation_run_finding_id: string; verdict: ValidationVerdict }>(
        `
          select validation_run_finding_id, verdict
          from validation_verdicts
          where validation_run_finding_id = any($1::uuid[])
        `,
        [findingIds],
        { readOnly: true }
      ).then((result) => result.rows);
    } catch (error) {
      throw new Error(`Failed to load validation verdict analytics: ${getErrorMessage(error)}`);
    }

    for (const row of verdicts) {
      verdictMap.set(row.validation_run_finding_id, row.verdict);
    }
  }

  const byRule = new Map<
    string,
    {
      flaggedCount: number;
      inconclusiveCount: number;
      notSupportedCount: number;
      reviewedCount: number;
      supportedCount: number;
      title: string;
    }
  >();

  for (const finding of findingRows) {
    const bucket = byRule.get(finding.rule_key) ?? {
      flaggedCount: 0,
      inconclusiveCount: 0,
      notSupportedCount: 0,
      reviewedCount: 0,
      supportedCount: 0,
      title: finding.title
    };
    bucket.flaggedCount += 1;
    const verdict = verdictMap.get(finding.id);
    if (verdict) {
      bucket.reviewedCount += 1;
      if (verdict === "supported") {
        bucket.supportedCount += 1;
      } else if (verdict === "not_supported") {
        bucket.notSupportedCount += 1;
      } else {
        bucket.inconclusiveCount += 1;
      }
    }
    byRule.set(finding.rule_key, bucket);
  }

  return [...byRule.entries()]
    .map(([ruleKey, row]) => ({
      ...row,
      notSupportedRate: row.reviewedCount > 0 ? row.notSupportedCount / row.reviewedCount : 0,
      ruleKey,
      supportedRate: row.reviewedCount > 0 ? row.supportedCount / row.reviewedCount : 0
    }))
    .sort((left, right) => right.reviewedCount - left.reviewedCount || left.supportedRate - right.supportedRate);
}

export async function updateValidationSettingsAction(input: {
  automaticIntervalMinutes?: number;
  operatorNote?: string | null;
  pipelineEnabled?: boolean;
  runMode?: ValidationRunMode;
}) {
  const context = await requireAdmin();

  if (input.automaticIntervalMinutes !== undefined && !(VALIDATION_INTERVAL_OPTIONS as readonly number[]).includes(input.automaticIntervalMinutes)) {
    throw new Error("Invalid validation interval.");
  }

  const patch: Record<string, boolean | number | string | null> = {
    updated_by_user_id: context.user.id
  };

  if (input.automaticIntervalMinutes !== undefined) {
    patch.automatic_interval_minutes = input.automaticIntervalMinutes;
  }

  if (input.pipelineEnabled !== undefined) {
    patch.pipeline_enabled = input.pipelineEnabled;
  }

  if (input.runMode !== undefined) {
    patch.run_mode = input.runMode;
  }

  if (input.operatorNote !== undefined) {
    patch.operator_note = input.operatorNote;
  }

  const patchEntries = Object.entries(patch);
  const assignmentSql = patchEntries.map(([key], index) => `${key} = $${index + 1}`).join(", ");
  const values = patchEntries.map(([, value]) => value);

  try {
    await query(
      `
        update validation_settings
           set ${assignmentSql}
         where singleton_key = 'default'
      `,
      values
    );

    await query(
      `
        insert into validation_audit_events (actor_user_id, event_type, metadata_json, reason)
        values ($1, $2, $3, $4)
      `,
      [
        context.user.id,
        input.pipelineEnabled !== undefined
          ? input.pipelineEnabled
            ? "validation.pipeline_resumed"
            : "validation.pipeline_paused"
          : input.runMode !== undefined
            ? "validation.mode_changed"
            : "validation.interval_changed",
        input,
        input.operatorNote ?? null
      ]
    );
  } catch (error) {
    throw new Error(`Failed to update validation settings: ${getErrorMessage(error)}`);
  }

  revalidatePath("/app");
  revalidatePath("/app/scans");
  revalidatePath("/app/issues");
}

export async function queueManualValidationRunAction(input: {
  hostname?: string;
  normalizedUrl?: string;
  source?: string;
  targetId: string;
  trancoRank?: number;
}) {
  const context = await requireAdmin();
  const availability = getValidationQueueAvailability();
  if (!availability.enabled) {
    throw new Error(availability.reason ?? "Validation queue is unavailable.");
  }

  const isSyntheticPreviewTarget = input.targetId.startsWith("tranco-preview-");
  let resolvedTarget: { hostname: string; id: string; normalized_url: string; tranco_rank: number | null } | null = null;

  if (!isSyntheticPreviewTarget) {
    try {
      resolvedTarget = await queryOne<{ hostname: string; id: string; normalized_url: string; tranco_rank: number | null }>(
        `
          select id, hostname, normalized_url, tranco_rank
          from validation_targets
          where id = $1
        `,
        [input.targetId],
        { readOnly: true }
      );
    } catch (error) {
      throw new Error(`Failed to load validation target: ${getErrorMessage(error)}`);
    }
  }

  if (!resolvedTarget && input.hostname && input.normalizedUrl) {
    const materializedSource = input.source === "tranco" ? "tranco" : "manual";
    const insertedTarget = await queryOne<{ hostname: string; id: string; normalized_url: string; tranco_rank: number | null }>(
      `
        insert into validation_targets (
          active,
          denylisted,
          hostname,
          normalized_url,
          rank_band,
          source,
          tranco_rank
        )
        values (true, false, $1, $2, $3, $4, $5)
        on conflict (hostname) do update
          set active = excluded.active,
              denylisted = excluded.denylisted,
              normalized_url = excluded.normalized_url,
              rank_band = excluded.rank_band,
              source = excluded.source,
              tranco_rank = excluded.tranco_rank
        returning id, hostname, normalized_url, tranco_rank
      `,
      [input.hostname, input.normalizedUrl, rankBandForRank(input.trancoRank ?? null), materializedSource, input.trancoRank ?? null]
    );

    if (!insertedTarget) {
      throw new Error("Failed to materialize validation target: Unknown error");
    }

    await query(
      `
        insert into validation_audit_events (actor_user_id, event_type, metadata_json)
        values ($1, $2, $3)
      `,
      [
        context.user.id,
        "validation.target_added",
        {
          hostname: input.hostname,
          normalizedUrl: input.normalizedUrl,
          source: `${materializedSource}_fallback_materialized`,
          trancoRank: input.trancoRank ?? null
        }
      ]
    );

    resolvedTarget = insertedTarget;
  }

  if (!resolvedTarget) {
    throw new Error("Validation target not found.");
  }

  let settings: { pipeline_enabled: boolean } | null;
  try {
    settings = await queryOne<{ pipeline_enabled: boolean }>(
      `
        select pipeline_enabled
        from validation_settings
        where singleton_key = 'default'
      `,
      [],
      { readOnly: true }
    );
  } catch (error) {
    throw new Error(`Failed to load validation pipeline state: ${getErrorMessage(error)}`);
  }

  if (process.env.VALIDATION_PIPELINE_ENABLED === "0" || !settings?.pipeline_enabled) {
    throw new Error("Validation pipeline is paused.");
  }

  const domain = await ensureValidationDomainForOrganization({
    hostname: resolvedTarget.hostname,
    normalizedUrl: resolvedTarget.normalized_url,
    organizationId: context.organization.id
  });
  const scanId = await createValidationScan({
    domainId: domain.id,
    hostname: resolvedTarget.hostname,
    normalizedUrl: resolvedTarget.normalized_url,
    organizationId: context.organization.id,
    submittedByUserId: context.user.id
  });

  const run = await queryOne<{ id: string }>(
    `
      insert into validation_runs (
        domain_id,
        hostname,
        normalized_url,
        rank_band,
        scan_id,
        status,
        tranco_rank,
        trigger_mode,
        triggered_by_user_id,
        validation_target_id
      )
      values ($1, $2, $3, $4, $5, 'queued', $6, 'manual', $7, $8)
      returning id
    `,
    [
      domain.id,
      resolvedTarget.hostname,
      resolvedTarget.normalized_url,
      rankBandForRank(resolvedTarget.tranco_rank),
      scanId,
      resolvedTarget.tranco_rank,
      context.user.id,
      resolvedTarget.id
    ]
  );

  if (!run) {
    throw new Error("Failed to create manual validation run: Unknown error");
  }

  await query(
    `
      update validation_targets
         set last_error = null,
             last_run_at = $2,
             last_status = 'queued'
       where id = $1
    `,
    [resolvedTarget.id, new Date().toISOString()]
  );

  try {
    await withValidationQueueHandoffTimeout(enqueueFullScanJob(scanId));
    await withValidationQueueHandoffTimeout(enqueueValidationCollectJob(run.id));
  } catch (queueError) {
    const message = queueError instanceof Error ? queueError.message : "Unknown validation queue handoff error";
    await failValidationQueueHandoff({
      actorUserId: context.user.id,
      hostname: resolvedTarget.hostname,
      message,
      scanId,
      targetId: resolvedTarget.id,
      validationRunId: run.id
    });
    throw new Error(`Validation queue handoff failed: ${message}`);
  }

  await query(
    `
      insert into validation_audit_events (actor_user_id, event_type, metadata_json)
      values ($1, $2, $3)
    `,
    [
      context.user.id,
      "validation.manual_run_queued",
      {
        hostname: resolvedTarget.hostname,
        targetId: resolvedTarget.id,
        validationRunId: run.id
      }
    ]
  );

  await query(`delete from validation_targets where id = $1`, [resolvedTarget.id]);

  await query(
    `
      insert into validation_audit_events (actor_user_id, event_type, metadata_json)
      values ($1, $2, $3)
    `,
    [
      context.user.id,
      "validation.target_removed",
      {
        hostname: resolvedTarget.hostname,
        reason: "queued_for_manual_run",
        targetId: resolvedTarget.id,
        validationRunId: run.id
      }
    ]
  );

  await addRandomTrancoValidationTarget({
    actorUserId: context.user.id,
    eventType: "validation.target_added",
    excludedHostnames: [resolvedTarget.hostname],
    metadata: {
      replacedHostname: resolvedTarget.hostname,
      validationRunId: run.id
    }
  });

  revalidatePath("/app");
  revalidatePath("/app/scans");
  revalidatePath("/app/validation");

  return {
    scanId,
    validationRunId: run.id
  };
}

export async function queueValidationRescanAction(input: { domainId: string }) {
  const context = await requireAdmin();
  const availability = getValidationQueueAvailability();
  if (!availability.enabled) {
    throw new Error(availability.reason ?? "Validation queue is unavailable.");
  }

  let domain: { hostname: string; id: string; normalized_url: string } | null;
  try {
    domain = await queryOne<{ hostname: string; id: string; normalized_url: string }>(
      `
        select id, hostname, normalized_url
        from domains
        where id = $1
          and organization_id = $2
      `,
      [input.domainId, context.organization.id],
      { readOnly: true }
    );
  } catch (error) {
    throw new Error(`Failed to load validation domain: ${getErrorMessage(error)}`);
  }

  if (!domain) {
    throw new Error("Validation domain not found.");
  }

  let settings: { pipeline_enabled: boolean } | null;
  try {
    settings = await queryOne<{ pipeline_enabled: boolean }>(
      `
        select pipeline_enabled
        from validation_settings
        where singleton_key = 'default'
      `,
      [],
      { readOnly: true }
    );
  } catch (error) {
    throw new Error(`Failed to load validation pipeline state: ${getErrorMessage(error)}`);
  }

  if (process.env.VALIDATION_PIPELINE_ENABLED === "0" || !settings?.pipeline_enabled) {
    throw new Error("Validation pipeline is paused.");
  }

  const scanId = await createValidationScan({
    domainId: domain.id,
    hostname: domain.hostname,
    normalizedUrl: domain.normalized_url,
    organizationId: context.organization.id,
    submittedByUserId: context.user.id
  });

  const previousRun = await queryOne<{ rank_band: string | null; tranco_rank: number | null }>(
    `
      select tranco_rank, rank_band
      from validation_runs
      where domain_id = $1
      order by created_at desc
      limit 1
    `,
    [domain.id],
    { readOnly: true }
  );

  const run = await queryOne<{ id: string }>(
    `
      insert into validation_runs (
        domain_id,
        hostname,
        normalized_url,
        rank_band,
        scan_id,
        status,
        tranco_rank,
        trigger_mode,
        triggered_by_user_id,
        validation_target_id
      )
      values ($1, $2, $3, $4, $5, 'queued', $6, 'manual', $7, null)
      returning id
    `,
    [
      domain.id,
      domain.hostname,
      domain.normalized_url,
      previousRun?.rank_band ?? null,
      scanId,
      previousRun?.tranco_rank ?? null,
      context.user.id
    ]
  );

  if (!run) {
    throw new Error("Failed to create validation re-scan run: Unknown error");
  }

  try {
    await withValidationQueueHandoffTimeout(enqueueFullScanJob(scanId));
    await withValidationQueueHandoffTimeout(enqueueValidationCollectJob((run as { id: string }).id));
  } catch (queueError) {
    const message = queueError instanceof Error ? queueError.message : "Unknown validation queue handoff error";
    await failValidationQueueHandoff({
      actorUserId: context.user.id,
      hostname: domain.hostname,
      message,
      scanId,
      targetId: null,
      validationRunId: run.id
    });
    throw new Error(`Validation queue handoff failed: ${message}`);
  }

  await query(
    `
      insert into validation_audit_events (actor_user_id, event_type, metadata_json)
      values ($1, $2, $3)
    `,
    [
      context.user.id,
      "validation.manual_run_queued",
      {
        domainId: input.domainId,
        hostname: domain.hostname,
        scanId,
        validationRunId: run.id,
        reason: "validation_rescan"
      }
    ]
  );

  revalidatePath("/app");
  revalidatePath("/app/scans");
  revalidatePath("/app/validation");

  return {
    scanId,
    validationRunId: run.id
  };
}

export async function updateValidationTargetStateAction(input: {
  clearBackoff?: boolean;
  denyReason?: string | null;
  denylisted?: boolean;
  hostname?: string;
  normalizedUrl?: string;
  source?: string;
  targetId: string;
  trancoRank?: number;
}) {
  const context = await requireAdmin();
  const patch: Record<string, string | boolean | null> = {};
  const isSyntheticPreviewTarget = input.targetId.startsWith("tranco-preview-");

  let resolvedTargetId = input.targetId;
  if (isSyntheticPreviewTarget && input.hostname && input.normalizedUrl) {
    const materializedSource = input.source === "tranco" ? "tranco" : "manual";
    const insertedTarget = await queryOne<{ id: string }>(
      `
        insert into validation_targets (
          active,
          denylisted,
          hostname,
          normalized_url,
          rank_band,
          source,
          tranco_rank
        )
        values (true, false, $1, $2, $3, $4, $5)
        on conflict (hostname) do update
          set active = excluded.active,
              denylisted = excluded.denylisted,
              normalized_url = excluded.normalized_url,
              rank_band = excluded.rank_band,
              source = excluded.source,
              tranco_rank = excluded.tranco_rank
        returning id
      `,
      [input.hostname, input.normalizedUrl, rankBandForRank(input.trancoRank ?? null), materializedSource, input.trancoRank ?? null]
    );

    if (!insertedTarget) {
      throw new Error("Failed to materialize validation target: Unknown error");
    }

    resolvedTargetId = insertedTarget.id;
  }

  if (input.clearBackoff) {
    patch.backoff_until = null;
    patch.cooldown_until = null;
    patch.last_error = null;
  }

  if (input.denylisted !== undefined) {
    patch.denylisted = input.denylisted;
    patch.deny_reason = input.denylisted ? input.denyReason ?? "Suppressed by operator." : null;
  }

  const patchEntries = Object.entries(patch);
  if (patchEntries.length > 0) {
    const setClause = patchEntries.map(([key], index) => `${key} = $${index + 1}`).join(", ");
    await query(
      `
        update validation_targets
           set ${setClause}
         where id = $${patchEntries.length + 1}
      `,
      [...patchEntries.map(([, value]) => value), resolvedTargetId]
    );
  }

  await query(
    `
      insert into validation_audit_events (actor_user_id, event_type, metadata_json)
      values ($1, $2, $3)
    `,
    [
      context.user.id,
      input.denylisted ? "validation.target_suppressed" : input.clearBackoff ? "validation.target_backoff_cleared" : "validation.target_updated",
      {
        ...input,
        targetId: resolvedTargetId
      }
    ]
  );

  revalidatePath("/app");
  revalidatePath("/app/scans");
}

export async function removeValidationTargetAction(input: { targetId: string }) {
  const context = await requireAdmin();
  let target: { hostname: string; id: string } | null;
  try {
    target = await queryOne<{ hostname: string; id: string }>(
      `
        select id, hostname
        from validation_targets
        where id = $1
      `,
      [input.targetId],
      { readOnly: true }
    );
  } catch (error) {
    throw new Error(`Failed to load validation target: ${getErrorMessage(error)}`);
  }

  if (!target) {
    throw new Error("Validation target not found.");
  }

  await query(`delete from validation_targets where id = $1`, [input.targetId]);

  await query(
    `
      insert into validation_audit_events (actor_user_id, event_type, metadata_json)
      values ($1, $2, $3)
    `,
    [
      context.user.id,
      "validation.target_removed",
      {
        hostname: target.hostname,
        targetId: input.targetId
      }
    ]
  );

  revalidatePath("/app");
  revalidatePath("/app/scans");
  revalidatePath("/app/validation");
}

async function pickRandomTrancoValidationTarget(
  excludedHostnames: string[] = []
) {
  const targetRank = Math.floor(Math.random() * (50_000 - 1_000 + 1)) + 1_000;
  const excluded = excludedHostnames.filter(Boolean);

  const loadCandidate = async (direction: "gte" | "lte") => {
    return await queryOne<{ hostname: string; normalized_url: string; tranco_rank: number | null }>(
      `
        select hostname, normalized_url, tranco_rank
        from validation_targets
        where source = 'tranco'
          and tranco_rank between 1000 and 50000
          and (
            cardinality($1::text[]) = 0
            or not (hostname = any($1::text[]))
          )
          and tranco_rank ${direction === "gte" ? ">=" : "<="} $2
        order by tranco_rank ${direction === "gte" ? "asc" : "desc"}
        limit 1
      `,
      [excluded, targetRank],
      { readOnly: true }
    );
  };

  const [higherCandidate, lowerCandidate] = await Promise.all([loadCandidate("gte"), loadCandidate("lte")]);
  const candidate =
    higherCandidate && lowerCandidate
      ? Math.abs((higherCandidate.tranco_rank ?? targetRank) - targetRank) <= Math.abs((lowerCandidate.tranco_rank ?? targetRank) - targetRank)
        ? higherCandidate
        : lowerCandidate
      : higherCandidate ?? lowerCandidate;

  if (!candidate) {
    throw new Error("No Tranco validation target is available in the 1000-50000 range.");
  }

  return {
    candidate,
    targetRank
  };
}

async function addRandomTrancoValidationTarget(params: {
  actorUserId: string;
  excludedHostnames?: string[];
  eventType?: string;
  metadata?: Record<string, unknown>;
}) {
  const { actorUserId, excludedHostnames, eventType = "validation.target_added", metadata } = params;
  try {
    const { candidate, targetRank } = await pickRandomTrancoValidationTarget(excludedHostnames);

    const hostname = extractHostname(candidate.normalized_url);
    const normalizedUrl = normalizeUrl(candidate.normalized_url);

    await query(
      `
        insert into validation_targets (
          active,
          denylisted,
          hostname,
          normalized_url,
          rank_band,
          source,
          tranco_rank
        )
        values (true, false, $1, $2, $3, 'tranco', $4)
        on conflict (hostname) do update
          set active = excluded.active,
              denylisted = excluded.denylisted,
              normalized_url = excluded.normalized_url,
              rank_band = excluded.rank_band,
              source = excluded.source,
              tranco_rank = excluded.tranco_rank
      `,
      [hostname, normalizedUrl, rankBandForRank(candidate.tranco_rank ?? null), candidate.tranco_rank ?? null]
    );

    await query(
      `
        insert into validation_audit_events (actor_user_id, event_type, metadata_json)
        values ($1, $2, $3)
      `,
      [
        actorUserId,
        eventType,
        {
          hostname,
          ...metadata,
          normalizedUrl,
          selectedRank: candidate.tranco_rank,
          targetRank
        }
      ]
    );

    return {
      hostname,
      normalizedUrl,
      selectedRank: candidate.tranco_rank,
      targetRank
    };
  } catch (error) {
    const previews = await listTrancoPreviewTargets(32);
    const excluded = new Set((excludedHostnames ?? []).filter(Boolean));
    const fallback = previews.find((target) => !excluded.has(target.hostname));

    if (!fallback) {
      if (error instanceof Error) {
        throw error;
      }

      throw new Error("No Tranco validation target is available.");
    }

    await query(
      `
        insert into validation_targets (
          active,
          denylisted,
          hostname,
          normalized_url,
          rank_band,
          source,
          tranco_rank
        )
        values (true, false, $1, $2, $3, 'tranco', $4)
        on conflict (hostname) do update
          set active = excluded.active,
              denylisted = excluded.denylisted,
              normalized_url = excluded.normalized_url,
              rank_band = excluded.rank_band,
              source = excluded.source,
              tranco_rank = excluded.tranco_rank
      `,
      [fallback.hostname, fallback.normalized_url, rankBandForRank(fallback.tranco_rank ?? null), fallback.tranco_rank ?? null]
    );

    await query(
      `
        insert into validation_audit_events (actor_user_id, event_type, metadata_json)
        values ($1, $2, $3)
      `,
      [
        actorUserId,
        eventType,
        {
          hostname: fallback.hostname,
          ...metadata,
          normalizedUrl: fallback.normalized_url,
          selectedRank: fallback.tranco_rank,
          targetRank: fallback.tranco_rank,
          replacementSource: "tranco_preview_fallback"
        }
      ]
    );

    return {
      hostname: fallback.hostname,
      normalizedUrl: fallback.normalized_url,
      selectedRank: fallback.tranco_rank,
      targetRank: fallback.tranco_rank
    };
  }
}

export async function addValidationTargetAction(input: { hostname: string }) {
  const context = await requireAdmin();
  const normalizedUrl = normalizeUrl(input.hostname);
  const hostname = extractHostname(normalizedUrl);

  await query(
    `
      insert into validation_targets (
        active,
        denylisted,
        hostname,
        normalized_url,
        source
      )
      values (true, false, $1, $2, 'manual')
      on conflict (hostname) do update
        set active = excluded.active,
            denylisted = excluded.denylisted,
            normalized_url = excluded.normalized_url,
            source = excluded.source
    `,
    [hostname, normalizedUrl]
  );

  await query(
    `
      insert into validation_audit_events (actor_user_id, event_type, metadata_json)
      values ($1, $2, $3)
    `,
    [
      context.user.id,
      "validation.target_added",
      {
        hostname,
        normalizedUrl,
        source: "manual_entry"
      }
    ]
  );

  revalidatePath("/app");
  revalidatePath("/app/validation");
}
