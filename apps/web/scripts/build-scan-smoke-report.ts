import { writeFileSync } from "node:fs";
import process from "node:process";
import { closePools, query, queryOne } from "@website-signal-risk-scanner/db";
import { getReportUnifiedFinding } from "@website-signal-risk-scanner/shared";
import {
  dedupeHeadlineFindings,
  deriveConsentAuditFindings
} from "../lib/scans/consent-audit-findings";
import { withHybridRuntimeArtifactFallbacks } from "../lib/scans/hybrid-runtime-evidence";
import {
  buildReviewFindings,
  buildSectionReviewIssues
} from "../lib/scans/scan-report-review-findings";
import { buildUnifiedFindingDisplayPackets, type UnifiedFindingDisplayPacket } from "../lib/scans/unified-findings";
import { repairFindingFamilyPacketEvents } from "../server/scans/family-packet-event-repair";
import { loadMergedSignalsByScanId } from "../server/scans/merged-signal-summary";

const DEFAULT_TARGET_FINDINGS = [
  "pre_consent_tracking_detected",
  "third_party_tracking_before_consent",
  "tracking_cookies_set_before_consent",
  "non_essential_tracking_continued_after_reject",
  "reject_option_missing_or_hidden",
  "rtb_cookie_sync_observed",
  "cross_domain_identifier_sharing_observed",
  "cookie_disclosure_gap",
  "weak_cookie_security_attributes"
];

const TARGET_SIGNAL_PATTERN =
  /(preconsent|pre_consent|third_party.*consent|tracking.*consent|weak_cookie|cookie_disclosure|reject|rtb|identifier)/;

const LEGACY_TARGET_FINDING_ALIASES: Record<string, string[]> = {
  analytics_cookies_before_consent: ["preconsent_tracking"],
  non_essential_tracking_continued_after_reject: [
    "reject_did_not_reduce_tracking",
    "reject_did_not_reduce_third_party_cookies"
  ],
  pre_consent_tracking_detected: ["preconsent_tracking"],
  reject_option_missing_or_hidden: ["reject_button_missing"],
  third_party_tracking_before_consent: ["preconsent_tracking"],
  tracking_cookies_set_before_consent: ["preconsent_tracking"]
};

type ScanRow = {
  completed_at: string | null;
  created_at: string;
  domain_hostname: string | null;
  id: string;
  pages_requested: number | null;
  pages_scanned: number | null;
  scan_config_json: Record<string, unknown> | null;
  started_at: string | null;
  status: string;
};

type SmokeSummaryRow = {
  blocking_classification: string | null;
  cmp_detected: boolean;
  cmp_vendor: string | null;
  completed_at: string | null;
  consent_banner_visible: boolean;
  domain: string;
  downgraded_findings_count: number;
  observed_domain: string;
  rank: number | null;
  reject_path_attempted: boolean;
  reject_path_success: boolean | null;
  scan_id: string;
  scan_status: "success" | "partial" | "blocked" | "timeout" | "failed";
  started_at: string | null;
  surfaced_findings_count: number;
  suppressed_findings_count: number;
  third_party_request_count: number | null;
  total_request_count: number | null;
  total_runtime_ms: number | null;
};

type RankedDomain = {
  domain: string;
  rank: number | null;
};

function getArgValue(flag: string) {
  const index = process.argv.indexOf(flag);
  return index === -1 ? null : process.argv[index + 1] ?? null;
}

function hasFlag(flag: string) {
  return process.argv.includes(flag);
}

function getListArg(flag: string) {
  return (getArgValue(flag) ?? "")
    .split(/[\s,]+/)
    .map((value) => value.trim())
    .filter(Boolean);
}

function parseRankedDomains(): RankedDomain[] {
  return getListArg("--ranked-domains").map((entry) => {
    const [rankText, ...domainParts] = entry.split(":");
    const rank = Number(rankText);
    const domain = domainParts.join(":").trim();
    return {
      domain,
      rank: Number.isFinite(rank) ? rank : null
    };
  }).filter((entry) => entry.domain.length > 0);
}

function parseTargetFindings() {
  const raw = getArgValue("--target-findings");
  if (!raw) {
    return DEFAULT_TARGET_FINDINGS;
  }

  return raw.split(",").map((value) => value.trim()).filter(Boolean);
}

function resolveTargetUnifiedFindingIds(targetFindings: string[]) {
  const resolved = new Set<string>();

  for (const finding of targetFindings) {
    const direct = getReportUnifiedFinding(finding);
    if (direct) {
      resolved.add(direct.id);
    }
    for (const alias of LEGACY_TARGET_FINDING_ALIASES[finding] ?? []) {
      resolved.add(alias);
    }
  }

  return resolved;
}

function diffMs(start: string | null | undefined, end: string | null | undefined) {
  if (!start || !end) {
    return null;
  }

  const startMs = Date.parse(start);
  const endMs = Date.parse(end);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
    return null;
  }

  return Math.max(0, endMs - startMs);
}

function stripDbRecord(record: Record<string, unknown> | null | undefined) {
  if (!record) {
    return null;
  }

  const next = { ...record };
  delete next.id;
  delete next.created_at;
  delete next.updated_at;
  return next;
}

function getBoolean(value: unknown) {
  return value === true;
}

function getNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function getRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function getArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function countUniqueRequestUrls(rows: unknown[], keys: string[]) {
  const urls = new Set<string>();
  for (const row of rows) {
    const record = getRecord(row);
    if (!record) {
      continue;
    }

    for (const key of keys) {
      const value = getString(record[key]);
      if (value) {
        urls.add(value);
        break;
      }
    }
  }

  return urls.size > 0 ? urls.size : null;
}

function maxNullable(...values: Array<number | null>) {
  const finite = values.filter((value): value is number => value !== null);
  return finite.length > 0 ? Math.max(...finite) : null;
}

function getStageMetadata(scanConfig: Record<string, unknown> | null, stage: string) {
  const execution = getRecord(scanConfig?.execution);
  const summary = getRecord(execution?.summary);
  const stages = Array.isArray(summary?.stages) ? summary.stages : [];
  const row = stages.find((entry) => getRecord(entry)?.stage === stage);
  return getRecord(getRecord(row)?.metadata) ?? {};
}

function classifyScanStatus(input: {
  blockedFlag: boolean;
  coverageLevel: string | null;
  homepageFetchStatus: string | null;
  scanOutcome: string | null;
  status: string;
}): SmokeSummaryRow["scan_status"] {
  if (input.status === "failed" || input.status === "canceled") {
    return "failed";
  }
  if (input.scanOutcome === "transport_failure" || input.homepageFetchStatus === "timeout") {
    return "timeout";
  }
  if (input.blockedFlag) {
    return "blocked";
  }
  if (input.coverageLevel?.includes("partial") || input.coverageLevel === "limited_none") {
    return "partial";
  }
  return input.status === "completed" ? "success" : "failed";
}

function getPacketStatusCounts(packets: Array<{ presentationDecision?: { status?: string } }>) {
  return packets.reduce<Record<string, number>>((acc, packet) => {
    const status = packet.presentationDecision?.status ?? "unknown";
    acc[status] = (acc[status] ?? 0) + 1;
    return acc;
  }, {});
}

function summarizePacketDiagnostics(packet: UnifiedFindingDisplayPacket) {
  return {
    appliedRules: packet.surfacingDecision.appliedRules,
    confidence: packet.confidenceBand,
    decisionReasons: packet.surfacingDecision.decisionReasons,
    decisionState: packet.surfacingDecision.decisionState,
    downgradeReasons: packet.presentationDecision.downgradeReasons ?? [],
    evidenceFlags: packet.evidence?.flags ?? [],
    evidenceKeys: packet.evidence ? Object.keys(packet.evidence) : [],
    externalSurfacingEligibilities: packet.concernContext?.externalSurfacingEligibilities ?? [],
    id: packet.unifiedFindingId,
    negativeEvidenceFlags: packet.concernContext?.negativeEvidenceFlags ?? [],
    promotionEligibilities: packet.concernContext?.promotionEligibilities ?? [],
    reportLane: packet.surfacingDecision.reportLane,
    status: packet.presentationDecision.status,
    summary: packet.summary,
    surfaceTier: packet.surfacingDecision.surfaceTier
  };
}

function getPacketBlockerKeys(packet: UnifiedFindingDisplayPacket) {
  return [
    ...(packet.concernContext?.negativeEvidenceFlags ?? []),
    ...(packet.presentationDecision.downgradeReasons ?? []),
    ...packet.surfacingDecision.decisionReasons,
    ...packet.surfacingDecision.appliedRules
  ].filter((value) => value.trim().length > 0);
}

function incrementCount(target: Record<string, number>, key: string) {
  target[key] = (target[key] ?? 0) + 1;
}

async function loadScanRows(scanIds: string[]) {
  const result = await query<ScanRow>(
    `
      select s.id,
             d.hostname as domain_hostname,
             s.status,
             s.created_at,
             s.started_at,
             s.completed_at,
             s.pages_requested,
             s.pages_scanned,
             s.scan_config_json
        from scans s
        left join domains d on d.id = s.domain_id
       where s.id = any($1::uuid[])
    `,
    [scanIds],
    { readOnly: true }
  );

  const byId = new Map(result.rows.map((row) => [row.id, row] as const));
  return scanIds.map((scanId) => byId.get(scanId)).filter((row): row is ScanRow => Boolean(row));
}

async function buildReport() {
  const scanIds = getListArg("--scan-ids");
  if (scanIds.length === 0) {
    throw new Error("Provide --scan-ids with one or more scan ids.");
  }

  const rankedDomains = parseRankedDomains();
  const targetFindings = parseTargetFindings();
  const targetFindingSet = resolveTargetUnifiedFindingIds(targetFindings);
  const scanRows = await loadScanRows(scanIds);
  const observedAtByScanId = new Map(
    scanRows.map((row) => [row.id, row.completed_at ?? row.started_at ?? row.created_at ?? null] as const)
  );
  const mergedSignalsByScanId = await loadMergedSignalsByScanId({
    observedAtByScanId,
    scanIds: scanRows.map((row) => row.id)
  });

  const summaryRows: SmokeSummaryRow[] = [];
  const findingRows = [];
  const targetSignalRows = [];
  const promotionBlockerCounts: Record<string, number> = {};
  const targetPacketStatusCounts: Record<string, number> = {};
  const targetPacketBlockerCounts: Record<string, number> = {};

  for (const [index, scan] of scanRows.entries()) {
    const rankedDomain = rankedDomains[index] ?? null;
    const [
      snapshot,
      runtimeArtifactsRow,
      signalRows,
      eventRows
    ] = await Promise.all([
      queryOne<Record<string, unknown>>(`select * from scan_snapshots where scan_id = $1`, [scan.id], { readOnly: true }),
      queryOne<Record<string, unknown>>(`select * from scan_runtime_artifacts where scan_id = $1`, [scan.id], { readOnly: true }),
      query<Record<string, unknown>>(
        `
          select signal_key,
                 signal_label,
                 signal_value_json,
                 confidence,
                 evidence_refs
            from scan_signals
           where scan_id = $1
           order by signal_key asc
        `,
        [scan.id],
        { readOnly: true }
      ).then((result) => result.rows),
      query<Record<string, unknown>>(
        `
          select id, event_type, message, metadata_json, created_at
            from scan_events
           where scan_id = $1
           order by created_at asc
        `,
        [scan.id],
        { readOnly: true }
      ).then((result) => result.rows)
    ]);

    const runtimeArtifacts = runtimeArtifactsRow
      ? withHybridRuntimeArtifactFallbacks(stripDbRecord(runtimeArtifactsRow) ?? runtimeArtifactsRow) ??
        stripDbRecord(runtimeArtifactsRow)
      : null;
    const repairedEvents = repairFindingFamilyPacketEvents({
      events: eventRows.map((event) => ({
        createdAt: getString(event.created_at),
        eventType: String(event.event_type ?? ""),
        id: String(event.id ?? ""),
        message: String(event.message ?? ""),
        metadataJson: event.metadata_json
      })),
      policyEnrichment: []
    });
    const consentAuditFindings = dedupeHeadlineFindings(deriveConsentAuditFindings(snapshot, runtimeArtifacts));
    const consentReviewIssues = buildSectionReviewIssues({
      accessibilityIssueRows: [],
      consentAuditFindings,
      pageEvidenceRows: [],
      policyBehaviorContradictions: [],
      preconsentViolationRows: [],
      runtimeArtifacts,
      scanReportReviewIssues: [],
      sectionId: "consent_controls_enforcement",
      signalHitRows: [],
      snapshot: snapshot ?? {}
    });
    const reviewFindingCandidates = buildReviewFindings({
      issues: consentReviewIssues,
      prioritizedAccessibilityRuleRows: [],
      runtimeArtifacts,
      sectionId: "consent_controls_enforcement",
      sectionItems: []
    });
    const packets = buildUnifiedFindingDisplayPackets({
      mergedSignals: mergedSignalsByScanId.get(scan.id) ?? [],
      policyEnrichment: [],
      reviewFindingCandidates,
      scanEvents: repairedEvents,
      validationFindings: [],
      validationFindingLookup: new Map()
    });
    const packetCounts = getPacketStatusCounts(packets);
    const targetPackets = packets.filter((packet) => targetFindingSet.has(packet.unifiedFindingId));
    const visiblePackets = packets.filter((packet) => packet.presentationDecision.status !== "suppress");
    const suppressedPackets = packets.filter((packet) => packet.presentationDecision.status === "suppress");
    const nonSurfacedPackets = packets.filter((packet) => packet.presentationDecision.status !== "surface");
    const nonSurfacedTargetPackets = targetPackets.filter((packet) => packet.presentationDecision.status !== "surface");

    for (const packet of targetPackets) {
      incrementCount(targetPacketStatusCounts, packet.presentationDecision.status);
    }
    for (const packet of nonSurfacedPackets) {
      for (const blocker of getPacketBlockerKeys(packet)) {
        incrementCount(promotionBlockerCounts, blocker);
      }
    }
    for (const packet of nonSurfacedTargetPackets) {
      for (const blocker of getPacketBlockerKeys(packet)) {
        incrementCount(targetPacketBlockerCounts, blocker);
      }
    }

    const crawlMetadata = getStageMetadata(scan.scan_config_json, "crawl_discovery");
    const sanitizedNetworkEvidence = getRecord(runtimeArtifactsRow?.sanitized_network_evidence);
    const hybridRuntimeEvidence = getRecord(runtimeArtifactsRow?.hybrid_runtime_evidence);
    const hybridNetworkSummary = getRecord(hybridRuntimeEvidence?.networkSummary);
    const sanitizedNetworkEntries = getArray(sanitizedNetworkEvidence?.entries);
    const purposeClassificationRows = getArray(runtimeArtifactsRow?.request_purpose_classification_confidence);
    const thirdPartyRequestCount = getNumber(runtimeArtifactsRow?.third_party_request_count);
    const derivedTotalRequestCount =
      getNumber(hybridNetworkSummary?.totalRequestCount) ??
      getNumber(hybridNetworkSummary?.total_request_count) ??
      getNumber(sanitizedNetworkEvidence?.totalRequestCount) ??
      getNumber(sanitizedNetworkEvidence?.total_request_count) ??
      getNumber(sanitizedNetworkEvidence?.requestCount) ??
      countUniqueRequestUrls(purposeClassificationRows, ["requestUrl", "request_url"]) ??
      countUniqueRequestUrls(sanitizedNetworkEntries, ["requestUrlSanitized", "request_url_sanitized", "requestUrl", "request_url"]) ??
      null;
    const totalRequestCount = maxNullable(derivedTotalRequestCount, thirdPartyRequestCount);
    const scanOutcome = getString(snapshot?.scan_outcome);
    const coverageLevel = getString(snapshot?.coverage_level);
    const homepageFetchStatus = getString(snapshot?.homepage_fetch_status);
    const blockedFlag = getBoolean(snapshot?.blocked_flag);
    const observedDomain = getString(snapshot?.domain) ?? scan.domain_hostname ?? rankedDomain?.domain ?? scan.id;
    const domain = rankedDomain?.domain ?? scan.domain_hostname ?? observedDomain;

    summaryRows.push({
      blocking_classification:
        getString(snapshot?.block_page_classification) ??
        getString(crawlMetadata.blockPageClassification) ??
        getString(snapshot?.stop_reason_label),
      cmp_detected: Boolean(getString(snapshot?.cmp_vendor_name)),
      cmp_vendor: getString(snapshot?.cmp_vendor_name),
      completed_at: scan.completed_at,
      consent_banner_visible: getBoolean(snapshot?.cookie_banner_present) || getBoolean(runtimeArtifactsRow?.consent_surface_observed),
      domain,
      downgraded_findings_count: packetCounts.audit_only ?? 0,
      observed_domain: observedDomain,
      rank: rankedDomain?.rank ?? null,
      reject_path_attempted:
        (getNumber(runtimeArtifactsRow?.consent_reject_click_count) ?? 0) > 0 ||
        runtimeArtifactsRow?.consent_reject_interaction_succeeded !== null,
      reject_path_success:
        typeof runtimeArtifactsRow?.consent_reject_interaction_succeeded === "boolean"
          ? runtimeArtifactsRow.consent_reject_interaction_succeeded
          : null,
      scan_id: scan.id,
      scan_status: classifyScanStatus({
        blockedFlag,
        coverageLevel,
        homepageFetchStatus,
        scanOutcome,
        status: scan.status
      }),
      started_at: scan.started_at,
      surfaced_findings_count: packetCounts.surface ?? 0,
      suppressed_findings_count: packetCounts.suppress ?? 0,
      third_party_request_count: thirdPartyRequestCount,
      total_request_count: totalRequestCount,
      total_runtime_ms: diffMs(scan.started_at, scan.completed_at)
    });

    findingRows.push({
      domain,
      rank: rankedDomain?.rank ?? null,
      scanId: scan.id,
      targetPackets: targetPackets.map(summarizePacketDiagnostics),
      visiblePackets: visiblePackets.map(summarizePacketDiagnostics),
      suppressedPackets: suppressedPackets.map((packet) => ({
        ...summarizePacketDiagnostics(packet),
        evidenceEntities: packet.evidence?.entities ?? {},
        rationale: packet.presentationDecision.rationale,
        surfacingDecision: packet.surfacingDecision ?? null
      })),
      weakCookieSupport: runtimeArtifactsRow?.cookie_attribute_summary ?? null
    });

    for (const signal of signalRows) {
      const signalKey = getString(signal.signal_key);
      if (!signalKey || !TARGET_SIGNAL_PATTERN.test(signalKey)) {
        continue;
      }

      targetSignalRows.push({
        confidence: typeof signal.confidence === "number" ? signal.confidence : null,
        domain,
        evidenceRefCount: Array.isArray(signal.evidence_refs) ? signal.evidence_refs.length : null,
        rank: rankedDomain?.rank ?? null,
        scanId: scan.id,
        signalKey,
        value: signal.signal_value_json
      });
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    scope: {
      scanCount: summaryRows.length,
      targetFindings,
      targetUnifiedFindingIds: [...targetFindingSet]
    },
    summaryRows,
    findingRows,
    targetSignalRows,
    promotionBlockers: Object.entries(promotionBlockerCounts)
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
      .map(([blocker, count]) => ({ blocker, count })),
    targetPacketBlockers: Object.entries(targetPacketBlockerCounts)
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
      .map(([blocker, count]) => ({ blocker, count })),
    targetPacketStatusCounts,
    health: {
      missingSignalConfidenceCount: targetSignalRows.filter((row) => row.confidence === null).length,
      missingSignalEvidenceRefCount: targetSignalRows.filter((row) => row.evidenceRefCount === 0).length,
      missingTotalRequestCount: summaryRows.filter((row) => row.total_request_count === null).length
    }
  };
}

function renderMarkdown(report: Awaited<ReturnType<typeof buildReport>>) {
  const lines = [
    "# Scan Smoke Report",
    "",
    `Generated: ${report.generatedAt}`,
    `Scans: ${report.scope.scanCount}`,
    "",
    "| Rank | Domain | Status | Runtime ms | Total req | 3P req | CMP | Banner | Reject | S/A/S |",
    "|---:|---|---|---:|---:|---:|---|---|---|---|"
  ];

  for (const row of report.summaryRows) {
    lines.push(
      `| ${row.rank ?? ""} | ${row.domain} | ${row.scan_status} | ${row.total_runtime_ms ?? ""} | ${row.total_request_count ?? ""} | ${row.third_party_request_count ?? ""} | ${row.cmp_vendor ?? "no"} | ${row.consent_banner_visible ? "yes" : "no"} | ${row.reject_path_attempted ? row.reject_path_success ? "success" : "attempted" : "no"} | ${row.surfaced_findings_count}/${row.downgraded_findings_count}/${row.suppressed_findings_count} |`
    );
  }

  lines.push(
    "",
    "## Health",
    "",
    `- Missing total_request_count rows: ${report.health.missingTotalRequestCount}`,
    `- Target signal rows missing confidence: ${report.health.missingSignalConfidenceCount}`,
    `- Target signal rows with empty evidence_refs: ${report.health.missingSignalEvidenceRefCount}`,
    "",
    "## Promotion Blockers",
    "",
    "### Target Packet Status",
    "",
    "| Status | Count |",
    "|---|---:|"
  );

  for (const [status, count] of Object.entries(report.targetPacketStatusCounts).sort((left, right) => right[1] - left[1])) {
    lines.push(`| ${status} | ${count} |`);
  }

  lines.push(
    "",
    "### Target Packet Blockers",
    "",
    "| Blocker | Count |",
    "|---|---:|"
  );

  for (const row of report.targetPacketBlockers.slice(0, 25)) {
    lines.push(`| \`${row.blocker}\` | ${row.count} |`);
  }

  lines.push(
    "",
    "### All Non-Surfaced Packet Blockers",
    "",
    "| Blocker | Count |",
    "|---|---:|"
  );

  for (const row of report.promotionBlockers.slice(0, 25)) {
    lines.push(`| \`${row.blocker}\` | ${row.count} |`);
  }

  lines.push(
    "",
    "## Target Signals",
    "",
    "| Domain | Signal | Confidence | Evidence refs |",
    "|---|---|---:|---:|"
  );

  for (const row of report.targetSignalRows) {
    lines.push(`| ${row.domain} | \`${row.signalKey}\` | ${row.confidence ?? ""} | ${row.evidenceRefCount ?? ""} |`);
  }

  return `${lines.join("\n")}\n`;
}

async function main() {
  const report = await buildReport();
  const outputPath = getArgValue("--out");
  const output = hasFlag("--markdown") ? renderMarkdown(report) : `${JSON.stringify(report, null, 2)}\n`;

  if (outputPath) {
    writeFileSync(outputPath, output);
    process.stderr.write(`[build-scan-smoke-report] wrote ${outputPath}\n`);
    return;
  }

  process.stdout.write(output);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePools();
  });
