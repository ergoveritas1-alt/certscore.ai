import "server-only";

import { SCAN_EVENT_TYPES, type PlanCode } from "@website-signal-risk-scanner/shared";
import { getPlanLimits } from "../plans/get-plan-limits";
import { queueFullScanForDomain } from "../scans/create-full-scan";
import { getScheduledMonitoringDecision } from "./scheduled-monitoring-decision";
import {
  insertScheduleWorkflowEvent,
  loadScheduledMonitoringDomainCandidates,
  type ScheduledMonitoringDomainRow
} from "./repository";

const DEFAULT_SCHEDULED_MONITORING_LIMIT = 1;
const DEFAULT_EXCLUDED_SCHEDULED_MONITORING_ORG_SLUGS = [
  "certscore-corpus-import",
  "validation-ops-internal"
];

export type ScheduledMonitoringDomainCandidate = {
  activeScanExists: boolean;
  domainId: string;
  hostname: string;
  lastCompletedAt: string | null;
  maxPagesOverride: number | null;
  normalizedUrl: string;
  organizationId: string;
  organizationPlan: PlanCode;
  scanFrequency: string | null;
  settingsFrequency: string | null;
};

export type ScheduledMonitoringSweepResult = {
  canaryDomain: string | null;
  checked: number;
  enqueued: number;
  excludedOrganizationSlugs: string[];
  failed: number;
  skippedActive: number;
  skippedManual: number;
  skippedNotDue: number;
};

function toCandidate(row: ScheduledMonitoringDomainRow): ScheduledMonitoringDomainCandidate {
  return {
    activeScanExists: row.active_scan_exists,
    domainId: row.domain_id,
    hostname: row.hostname,
    lastCompletedAt: row.last_completed_at,
    maxPagesOverride: row.max_pages_override,
    normalizedUrl: row.normalized_url,
    organizationId: row.organization_id,
    organizationPlan: row.organization_plan,
    scanFrequency: row.scan_frequency,
    settingsFrequency: row.settings_frequency
  };
}

export async function runScheduledMonitoringSweep(input: {
  canaryDomain?: string | null;
  excludedOrganizationSlugs?: string[];
  limit?: number;
  now?: Date;
} = {}): Promise<ScheduledMonitoringSweepResult> {
  const limit = input.limit ?? DEFAULT_SCHEDULED_MONITORING_LIMIT;
  const now = input.now ?? new Date();
  const excludedOrganizationSlugs = input.excludedOrganizationSlugs ?? DEFAULT_EXCLUDED_SCHEDULED_MONITORING_ORG_SLUGS;
  const result: ScheduledMonitoringSweepResult = {
    canaryDomain: input.canaryDomain ?? null,
    checked: 0,
    enqueued: 0,
    excludedOrganizationSlugs,
    failed: 0,
    skippedActive: 0,
    skippedManual: 0,
    skippedNotDue: 0
  };

  await insertScheduleWorkflowEvent({
    eventType: SCAN_EVENT_TYPES.scheduleSweepStarted,
    message: "Scheduled monitoring sweep started.",
    metadataJson: {
      canaryDomain: input.canaryDomain ?? null,
      excludedOrganizationSlugs,
      limit,
      startedAt: now.toISOString()
    }
  });

  const candidates = (await loadScheduledMonitoringDomainCandidates({
    canaryDomain: input.canaryDomain,
    excludedOrganizationSlugs,
    limit
  })).map(toCandidate);

  for (const candidate of candidates) {
    result.checked += 1;
    const decision = getScheduledMonitoringDecision({
      activeScanExists: candidate.activeScanExists,
      domainFrequency: candidate.scanFrequency,
      lastCompletedAt: candidate.lastCompletedAt,
      now,
      organizationPlan: candidate.organizationPlan,
      settingsFrequency: candidate.settingsFrequency
    });

    if (!decision.due) {
      if (decision.reason === "active_scan_exists") {
        result.skippedActive += 1;
        await insertScheduleWorkflowEvent({
          domainId: candidate.domainId,
          eventType: SCAN_EVENT_TYPES.scheduledScanSkippedExistingActiveScan,
          message: "Scheduled monitoring skipped because an active scan already exists.",
          metadataJson: {
            frequency: decision.frequency,
            source: "scheduled-monitoring"
          },
          organizationId: candidate.organizationId
        });
      } else if (decision.reason === "manual_frequency") {
        result.skippedManual += 1;
      } else {
        result.skippedNotDue += 1;
      }
      continue;
    }

    const planLimits = await getPlanLimits(candidate.organizationPlan);
    const queued = await queueFullScanForDomain({
      domainContext: {
        activeScanExists: false,
        domain: {
          hostname: candidate.hostname,
          id: candidate.domainId,
          lastScannedAt: candidate.lastCompletedAt,
          maxPagesOverride: candidate.maxPagesOverride,
          normalizedUrl: candidate.normalizedUrl
        }
      },
      domainId: candidate.domainId,
      organizationId: candidate.organizationId,
      planCode: candidate.organizationPlan,
      planLimitsOverride: planLimits,
      scanType: "scheduled",
      enforceMonthlyUsageLimit: true,
      source: "scheduled-monitoring",
      submittedByUserId: null
    });

    if (queued.error || !queued.scanId) {
      result.failed += 1;
      await insertScheduleWorkflowEvent({
        domainId: candidate.domainId,
        eventType: SCAN_EVENT_TYPES.scheduleSweepFailed,
        message: "Scheduled monitoring could not queue a scan.",
        metadataJson: {
          error: queued.error ?? "Unknown scheduled monitoring queue error.",
          frequency: decision.frequency,
          source: "scheduled-monitoring"
        },
        organizationId: candidate.organizationId
      });
      continue;
    }

    result.enqueued += 1;
    await insertScheduleWorkflowEvent({
      domainId: candidate.domainId,
      eventType: SCAN_EVENT_TYPES.scheduledScanEnqueued,
      message: "Scheduled monitoring scan queued.",
      metadataJson: {
        frequency: decision.frequency,
        source: "scheduled-monitoring"
      },
      organizationId: candidate.organizationId,
      scanId: queued.scanId
    });
  }

  await insertScheduleWorkflowEvent({
    eventType: SCAN_EVENT_TYPES.scheduleSweepCompleted,
    message: "Scheduled monitoring sweep completed.",
    metadataJson: result
  });

  return result;
}
