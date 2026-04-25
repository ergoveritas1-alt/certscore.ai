import { readFileSync, writeFileSync } from "node:fs";
import process from "node:process";
import { closePools } from "@website-signal-risk-scanner/db";
import { buildProductionFindingFrequencyReport } from "./report-production-finding-frequency";

type LineageRow = {
  bucket?: string;
  findingId?: string;
  negativeEvidenceFlags?: string[];
  packetEvidence?: {
    directRuntime?: boolean;
    packetBacked?: boolean;
    pageAttribution?: boolean;
    policyText?: boolean;
    readableSnippet?: boolean;
  } | null;
  rawReasons?: string[];
};

type LineageReport = {
  rows?: LineageRow[];
};

const DEFAULT_FOCUS_FINDINGS = [
  "policy_clarity_risk",
  "privacy_contact_path_present",
  "privacy_rights_path_present",
  "cookie_disclosure_gap",
  "tracking_technologies_disclosure_present",
  "targeted_advertising_disclosure_present",
  "third_party_advertising_disclosure_present",
  "behavioral_analytics_disclosure_present",
  "consent_gated_tracking_claim_conflict"
];

function getArgValue(flag: string) {
  const index = process.argv.indexOf(flag);
  return index === -1 ? null : process.argv[index + 1] ?? null;
}

function hasFlag(flag: string) {
  return process.argv.includes(flag);
}

function getNumberArg(flag: string, fallback: number) {
  const raw = getArgValue(flag);
  if (!raw) {
    return fallback;
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseFocusFindings() {
  const raw = getArgValue("--findings") ?? getArgValue("--finding");
  if (!raw || raw === "default") {
    return DEFAULT_FOCUS_FINDINGS;
  }
  return raw.split(",").map((value) => value.trim()).filter(Boolean);
}

function loadLineage(path: string | null) {
  if (!path) {
    return null;
  }

  const parsed = JSON.parse(readFileSync(path, "utf8")) as LineageReport;
  return Array.isArray(parsed.rows) ? parsed.rows : [];
}

function summarizeLineage(rows: LineageRow[] | null, findingId: string) {
  const findingRows = rows?.filter((row) => row.findingId === findingId) ?? [];
  const count = (bucket: string) => findingRows.filter((row) => row.bucket === bucket).length;
  const flags = new Map<string, number>();
  const reasons = new Map<string, number>();
  const retainedPacketEvidence = {
    directRuntime: 0,
    packetBacked: 0,
    pageAttribution: 0,
    policyText: 0,
    readableSnippet: 0
  };

  for (const row of findingRows) {
    for (const flag of row.negativeEvidenceFlags ?? []) {
      flags.set(flag, (flags.get(flag) ?? 0) + 1);
    }
    for (const reason of row.rawReasons ?? []) {
      reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
    }
    if (row.packetEvidence?.directRuntime) retainedPacketEvidence.directRuntime += 1;
    if (row.packetEvidence?.packetBacked) retainedPacketEvidence.packetBacked += 1;
    if (row.packetEvidence?.pageAttribution) retainedPacketEvidence.pageAttribution += 1;
    if (row.packetEvidence?.policyText) retainedPacketEvidence.policyText += 1;
    if (row.packetEvidence?.readableSnippet) retainedPacketEvidence.readableSnippet += 1;
  }

  const top = (values: Map<string, number>) =>
    [...values.entries()]
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
      .slice(0, 3)
      .map(([value, valueCount]) => `${value} (${valueCount})`)
      .join(", ");

  return {
    auditOnlyMissingEvidence: count("audit_only_missing_evidence"),
    noRawEvidence: count("no_raw_evidence"),
    rawPresentNoUnifiedPacket: count("raw_present_no_unified_packet"),
    retainedPacketEvidence,
    runtimeSupportOnlyNoPacket: count("runtime_support_only_no_disclosure_packet"),
    suppressed: count("suppressed"),
    surfaced: count("surfaced"),
    topFlags: top(flags),
    topRawReasons: top(reasons)
  };
}

function classifyLikelyGap(input: {
  auditOnlyScanCount: number;
  anyStatusScanCount: number;
  lineage: ReturnType<typeof summarizeLineage>;
}) {
  const auditPressure = input.anyStatusScanCount > 0
    ? input.auditOnlyScanCount / input.anyStatusScanCount
    : 0;

  if (input.lineage.rawPresentNoUnifiedPacket > 0) {
    return "raw_present_no_unified_packet";
  }
  if (input.lineage.runtimeSupportOnlyNoPacket > 0) {
    return "runtime_support_without_policy_packet";
  }
  if (
    input.lineage.auditOnlyMissingEvidence > 0 &&
    (input.lineage.retainedPacketEvidence.policyText > 0 || input.lineage.retainedPacketEvidence.readableSnippet > 0)
  ) {
    return "packet_has_text_but_contract_failed";
  }
  if (auditPressure >= 0.5) {
    return "high_audit_pressure";
  }
  return "lower_priority";
}

async function main() {
  const outputPath = getArgValue("--out");
  const lineagePath = getArgValue("--lineage");
  const scanType = getArgValue("--scan-type") ?? "full";
  const limit = getNumberArg("--limit", 30);
  const findings = new Set(parseFocusFindings());
  const lineageRows = loadLineage(lineagePath);
  const frequency = await buildProductionFindingFrequencyReport({
    baselinePath: null,
    includeNonSurface: true,
    limit,
    scanType
  });

  const rows = frequency.topFindings
    .filter((entry) => findings.has(entry.findingId))
    .map((entry) => {
      const lineage = summarizeLineage(lineageRows, entry.findingId);
      const auditPressure = entry.anyStatusScanCount > 0
        ? Number(((entry.auditOnlyScanCount / entry.anyStatusScanCount) * 100).toFixed(1))
        : 0;
      return {
        auditOnlyScanCount: entry.auditOnlyScanCount,
        auditPressure,
        likelyGap: classifyLikelyGap({
          auditOnlyScanCount: entry.auditOnlyScanCount,
          anyStatusScanCount: entry.anyStatusScanCount,
          lineage
        }),
        lineage,
        surfaceScanCount: entry.scanCount,
        totalScanCount: entry.anyStatusScanCount,
        findingId: entry.findingId
      };
    })
    .sort((left, right) =>
      right.auditPressure - left.auditPressure ||
      right.auditOnlyScanCount - left.auditOnlyScanCount ||
      left.findingId.localeCompare(right.findingId)
    );

  const output = {
    focusFindings: [...findings],
    generatedAt: new Date().toISOString(),
    lineageSource: lineagePath,
    rows,
    scope: frequency.scope
  };

  const rendered = hasFlag("--json")
    ? `${JSON.stringify(output, null, 2)}\n`
    : [
        "# Production Evidence Loss Audit",
        "",
        `Generated: ${output.generatedAt}`,
        `Scope: ${frequency.scope.scanCount} recent ${scanType} scans`,
        lineagePath ? `Lineage source: ${lineagePath}` : "Lineage source: not provided",
        "",
        "| Finding | Surface scans | Audit-only scans | Audit pressure | Likely gap | Raw/no packet | Runtime support/no packet | Audit-only missing evidence | Top flags | Top raw reasons |",
        "|---|---:|---:|---:|---|---:|---:|---:|---|---|",
        ...rows.map((row) =>
          `| \`${row.findingId}\` | ${row.surfaceScanCount} | ${row.auditOnlyScanCount} | ${row.auditPressure.toFixed(1)}% | ${row.likelyGap} | ${row.lineage.rawPresentNoUnifiedPacket} | ${row.lineage.runtimeSupportOnlyNoPacket} | ${row.lineage.auditOnlyMissingEvidence} | ${row.lineage.topFlags || "-"} | ${row.lineage.topRawReasons || "-"} |`
        ),
        ""
      ].join("\n");

  if (outputPath) {
    writeFileSync(outputPath, rendered, "utf8");
  }
  process.stdout.write(rendered);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePools();
  });
