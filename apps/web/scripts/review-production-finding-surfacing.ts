import process from "node:process";
import { closePools } from "@website-signal-risk-scanner/db";
import { buildProductionFindingFrequencyReport } from "./report-production-finding-frequency";

const DEFAULT_REVIEW_FINDINGS = [
  "behavioral_analytics_disclosure_present",
  "cookie_policy_present",
  "missing_dsar_mechanism",
  "missing_transfer_disclosure",
  "policy_clarity_risk",
  "privacy_contact_channel_missing",
  "cookie_disclosure_gap"
] as const;

const EXPECTED_BEHAVIOR: Record<string, string> = {
  behavioral_analytics_disclosure_present:
    "Main-lane review only when retained page-attributed policy text names behavioral analytics, heatmaps, product analytics, session recording, or equivalent.",
  cookie_disclosure_gap:
    "Promotion requires runtime cookie/tracker inventory plus policy coverage evidence; weak policy-only or URL-only cases should stay review/audit.",
  cookie_policy_present:
    "Positive context only; should remain support/confidence coverage unless it supports a stronger cookie or tracking finding.",
  missing_dsar_mechanism:
    "Confirmed only with structured validation, readable fetched policy evidence, and a concrete policy URL; demote when a DSAR path is visible.",
  missing_transfer_disclosure:
    "Confirmed only with structured validation, readable fetched policy evidence, and a concrete policy URL; demote when transfer mechanism language is visible.",
  policy_clarity_risk:
    "Main-lane review only with page-attributed policy-fitness evidence such as retained ambiguity score, low coverage, or boilerplate signals.",
  privacy_contact_channel_missing:
    "Should stay conservative unless crawl scope and policy/legal surfaces show no privacy-specific contact channel; demote when one is visible."
};

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

function getFindingArgs() {
  const raw = getArgValue("--findings");
  if (!raw) {
    return [...DEFAULT_REVIEW_FINDINGS];
  }

  return raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function renderMarkdown(input: Awaited<ReturnType<typeof buildProductionFindingFrequencyReport>>, findingIds: string[]) {
  const byFinding = new Map(input.topFindings.map((entry) => [entry.findingId, entry]));
  const lines = [
    "# Production Finding Surfacing Review",
    "",
    `Generated: ${input.generatedAt}`,
    `Scope: ${input.scope.scanCount} completed org-backed ${input.scope.scanType} scans`,
    "",
    "| Finding | Surface scans | Audit-only scans | Review scans | Suppressed scans | Expected behavior |",
    "|---|---:|---:|---:|---:|---|"
  ];

  for (const findingId of findingIds) {
    const entry = byFinding.get(findingId);
    lines.push(
      `| \`${findingId}\` | ${entry?.scanCount ?? 0} | ${entry?.auditOnlyScanCount ?? 0} | ${entry?.reviewScanCount ?? 0} | ${entry?.suppressedScanCount ?? 0} | ${EXPECTED_BEHAVIOR[findingId] ?? "No explicit review note configured."} |`
    );
  }

  return `${lines.join("\n")}\n`;
}

async function main() {
  const findingIds = getFindingArgs();
  const report = await buildProductionFindingFrequencyReport({
    includeNonSurface: true,
    limit: getNumberArg("--report-limit", 100),
    scanType: getArgValue("--scan-type") ?? "full"
  });

  if (hasFlag("--json")) {
    const byFinding = new Map(report.topFindings.map((entry) => [entry.findingId, entry]));
    process.stdout.write(
      `${JSON.stringify({
        generatedAt: report.generatedAt,
        review: findingIds.map((findingId) => ({
          expectedBehavior: EXPECTED_BEHAVIOR[findingId] ?? null,
          findingId,
          production: byFinding.get(findingId) ?? null
        })),
        scope: report.scope
      }, null, 2)}\n`
    );
    return;
  }

  process.stdout.write(renderMarkdown(report, findingIds));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePools();
  });
