#!/usr/bin/env node
/**
 * Aggregate finding stats across ALL completed scans in prod DB.
 * Lightweight: only counts, no example selection or export.
 */

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { closePools, query } from "@website-signal-risk-scanner/db";
import { loadScanRecord, type ScanRow } from "../report-production-finding-frequency";
import { projectExecutiveFindingsFromUnifiedPackets } from "../../lib/scans/executive-findings-projection";
import { buildRegulatoryRiskSource } from "../../lib/scans/regulatory-risk-source";
import { buildMergedSignalRecords } from "../../lib/scans/merged-signals";
import {
  withHybridRuntimeArtifactFallbacks,
  getHybridDerivedTrackerVendors
} from "../../lib/scans/hybrid-runtime-evidence";
import { getPrimaryPolicyEnrichmentRow } from "../../lib/scans/policy-enrichment-row";
import {
  getPrimaryCategoryDescription,
  getPrimaryCategoryLabel,
  mapSignalKeyToTaxonomy
} from "../../lib/scans/signal-taxonomy";
import type { UnifiedFindingDisplayPacket } from "../../lib/scans/unified-findings";
import type { CertScoreFinding } from "../../lib/scans/finding-registry";

async function loadAllCompletedScans(): Promise<ScanRow[]> {
  const result = await query<ScanRow>(`
    select s.id, s.organization_id, s.domain_id, s.scan_type, s.status,
           s.created_at, s.started_at, s.completed_at, s.pages_requested,
           s.pages_scanned, s.error_message
    from scans s
    where s.status = 'completed'
    order by s.completed_at desc nulls last
  `, [], { readOnly: true });
  return result.rows;
}

async function buildScanContext(
  scan: ScanRow,
  buildScanReportUnifiedFindingsFn: (record: Record<string, unknown>) => UnifiedFindingDisplayPacket[]
) {
  const record = await loadScanRecord(scan.id);
  if (!record) return null;

  const unifiedPackets = buildScanReportUnifiedFindingsFn(record);
  const signalRecords = buildMergedSignalRecords(record);
  const hybridFallbacks = withHybridRuntimeArtifactFallbacks(record);
  const policyEnrichment = getPrimaryPolicyEnrichmentRow(record);
  const trackerVendors = getHybridDerivedTrackerVendors(record);

  const executiveProjection = projectExecutiveFindingsFromUnifiedPackets(
    unifiedPackets,
    signalRecords,
    policyEnrichment,
    hybridFallbacks,
    trackerVendors
  );

  const regulatorySource = buildRegulatoryRiskSource(
    unifiedPackets,
    signalRecords,
    policyEnrichment
  );

  return {
    scanId: scan.id,
    scanType: scan.scan_type,
    hasOrg: !!scan.organization_id,
    domainHostname: (record as Record<string, unknown>).domainHostname as string | undefined,
    completedAt: scan.completed_at,
    pagesScanned: scan.pages_scanned,
    unifiedPackets,
    executiveProjection,
    regulatorySource,
    signalRecords,
    policyEnrichment,
  };
}

type FindingStats = {
  finding_id: string;
  finding_label: string;
  total_encounters: number;
  surfaced: number;
  suppressed: number;
  audit_only: number;
  review: number;
  strong: number;
  good: number;
  limited: number;
  direct: number;
  inferred: number;
  exec_mapped: number;
  with_snippets: number;
  with_counts: number;
  unique_domains: Set<string>;
  unique_scans: Set<string>;
};

function getStatus(packet: UnifiedFindingDisplayPacket): string {
  const decision = (packet as Record<string, unknown>).presentationDecision as
    | { status?: string }
    | undefined;
  return decision?.status ?? "unknown";
}

async function main() {
  console.info("[stats] Starting prod DB finding stats aggregation...");

  const scans = await loadAllCompletedScans();
  console.info(`[stats] Loaded ${scans.length} completed scans.`);

  const componentModule = await import("../../components/scans/shared-scan-detail-view");
  const buildScanReportUnifiedFindingsFn =
    (componentModule as Record<string, unknown>).buildScanReportUnifiedFindings as (
      record: Record<string, unknown>
    ) => UnifiedFindingDisplayPacket[];

  if (typeof buildScanReportUnifiedFindingsFn !== "function") {
    throw new Error("Could not resolve buildScanReportUnifiedFindings");
  }

  const stats = new Map<string, FindingStats>();
  let processed = 0;
  let skipped = 0;

  for (const scan of scans) {
    try {
      const context = await buildScanContext(scan, buildScanReportUnifiedFindingsFn);
      if (!context) { skipped++; continue; }

      for (const packet of context.unifiedPackets) {
        const fid = String(packet.unifiedFindingId ?? "");
        if (!fid) continue;

        if (!stats.has(fid)) {
          stats.set(fid, {
            finding_id: fid,
            finding_label: packet.label ?? fid,
            total_encounters: 0,
            surfaced: 0,
            suppressed: 0,
            audit_only: 0,
            review: 0,
            strong: 0,
            good: 0,
            limited: 0,
            direct: 0,
            inferred: 0,
            exec_mapped: 0,
            with_snippets: 0,
            with_counts: 0,
            unique_domains: new Set(),
            unique_scans: new Set(),
          });
        }

        const s = stats.get(fid)!;
        s.total_encounters++;
        s.unique_scans.add(scan.id);
        if (context.domainHostname) s.unique_domains.add(context.domainHostname);

        const status = getStatus(packet);
        if (status === "surface") s.surfaced++;
        else if (status === "suppress") s.suppressed++;
        else if (status === "audit_only") s.audit_only++;
        else if (status === "review") s.review++;

        const confidence = packet.confidenceBand;
        if (confidence === "high") s.strong++;
        else if (confidence === "medium") s.good++;
        else if (confidence === "low") s.limited++;

        const hasDirect = (packet as Record<string, unknown>).confidenceInputs?.hasDirectRuntimeEvidence;
        if (hasDirect === true) s.direct++;
        else s.inferred++;

        const execMatch = context.executiveProjection.trace.packets.find(
          (p: { unifiedFindingId: string }) => p.unifiedFindingId === fid
        );
        if (execMatch?.inExecutiveFindings) s.exec_mapped++;

        const details = (packet as Record<string, unknown>).details as Record<string, unknown> | undefined;
        const snippets = details?.evidenceSnippets as unknown[] | undefined;
        if (snippets && snippets.length > 0) s.with_snippets++;

        const counts = details?.counts as Record<string, unknown> | undefined;
        if (counts && Object.keys(counts).length > 0) s.with_counts++;
      }

      processed++;
      if (processed % 100 === 0) {
        console.info(`[stats] Processed ${processed}/${scans.length} scans...`);
      }
    } catch (e) {
      skipped++;
    }
  }

  console.info(`[stats] Done. Processed: ${processed}, Skipped: ${skipped}, Unique findings: ${stats.size}`);

  // Sort by total_encounters desc
  const sorted = [...stats.values()].sort((a, b) => b.total_encounters - a.total_encounters);

  // Write CSV
  const outDir = "artifacts/eval/finding-corpus/2026-04-28-top40-reviewed";
  const headers = [
    "finding_id", "finding_label", "total_encounters", "surfaced", "suppressed", "audit_only", "review",
    "surface_rate", "suppression_rate", "audit_only_rate",
    "strong", "good", "limited", "direct", "inferred", "exec_mapped",
    "with_snippets", "with_counts", "unique_scans", "unique_domains"
  ];

  const rows = sorted.map(s => {
    const total = s.total_encounters || 1;
    return [
      s.finding_id,
      s.finding_label,
      s.total_encounters,
      s.surfaced,
      s.suppressed,
      s.audit_only,
      s.review,
      (s.surfaced / total).toFixed(3),
      (s.suppressed / total).toFixed(3),
      (s.audit_only / total).toFixed(3),
      s.strong,
      s.good,
      s.limited,
      s.direct,
      s.inferred,
      s.exec_mapped,
      s.with_snippets,
      s.with_counts,
      s.unique_scans.size,
      s.unique_domains.size,
    ].map(v => {
      const str = String(v);
      if (str.includes(",") || str.includes("\"") || str.includes("\n")) {
        return `"${str.replace(/"/g, "\"\"")}"`;
      }
      return str;
    });
  });

  const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n") + "\n";
  writeFileSync(join(outDir, "prod_db_finding_stats.csv"), csv, "utf8");

  console.info(`[stats] Wrote ${sorted.length} rows to ${join(outDir, "prod_db_finding_stats.csv")}`);

  await closePools();
  process.exit(0);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
