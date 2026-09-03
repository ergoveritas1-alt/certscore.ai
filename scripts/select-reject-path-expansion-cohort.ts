import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { publicTestContactHoldForUrl } from "../packages/certscore-scan-core/src/public-test-contact-holds.js";

const DISALLOWED_DOMAINS = ["vercel.com"];
const DISALLOWED_PATH_SEGMENTS = new Set([
  "account", "auth", "cart", "checkout", "login", "payment", "purchase",
  "register", "session", "signin", "signup",
]);

type SourceRecord = {
  completed_at: string;
  effective_state: string | null;
  hostname: string;
  packet: { targetUrl: string };
  scan_id: string;
  sourceOutcome: string;
};

type PriorSelection = {
  selected: Array<{ normalizedDomain: string }>;
};

type Args = {
  limit: number;
  out: string;
  priorSelections: string[];
  sourceCache: string;
  sourceCohortSize: number;
};

function parseArgs(argv: string[]): Args {
  const args: Args = {
    limit: 60,
    out: "artifacts/scan-quality-calibration/2026-08-30-reject-path-60/RejectPath60Selection.json",
    priorSelections: ["artifacts/scan-quality-calibration/2026-08-30-reject-path-50/RejectPath50Selection.json"],
    sourceCache: "artifacts/scan-quality-calibration/2026-08-30-reject-path-50/RejectPathSourceRecords.cache.json",
    sourceCohortSize: 392,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    const value = argv[++index];
    if (!value) throw new Error(`Missing value for ${arg}`);
    if (arg === "--limit") args.limit = Number(value);
    else if (arg === "--out") args.out = value;
    else if (arg === "--prior-selection") args.priorSelections.push(value);
    else if (arg === "--source-cache") args.sourceCache = value;
    else if (arg === "--source-cohort-size") args.sourceCohortSize = Number(value);
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!Number.isInteger(args.limit) || args.limit < 1 || args.limit > 100) {
    throw new Error("--limit must be an integer from 1 through 100");
  }
  if (!Number.isInteger(args.sourceCohortSize) || args.sourceCohortSize < args.limit) {
    throw new Error("--source-cohort-size must be an integer at least as large as --limit");
  }
  return args;
}

function normalizeDomain(value: string) {
  return value.trim().toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
}

function sanitizeTarget(value: string) {
  let target: URL;
  try { target = new URL(value); } catch { return null; }
  if (target.protocol !== "https:" || target.username || target.password || (target.port && target.port !== "443")) return null;
  const hostname = target.hostname.toLowerCase().replace(/\.$/, "");
  if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost")) return null;
  if (DISALLOWED_DOMAINS.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`))) return null;
  if (target.pathname.toLowerCase().split("/").filter(Boolean).some((segment) => DISALLOWED_PATH_SEGMENTS.has(segment))) return null;
  target.hostname = hostname;
  target.port = "";
  target.hash = "";
  target.search = "";
  return target.toString();
}

function findExactAnchoredCohort(records: SourceRecord[], size: number) {
  const sorted = records.toSorted((left, right) => Date.parse(right.completed_at) - Date.parse(left.completed_at));
  const matches: SourceRecord[][] = [];
  for (const anchor of sorted) {
    const upper = Date.parse(anchor.completed_at) + 1;
    const lower = upper - 24 * 60 * 60 * 1_000;
    const candidate = sorted.filter((record) => {
      const completedAt = Date.parse(record.completed_at);
      return completedAt >= lower && completedAt < upper;
    });
    if (candidate.length === size) matches.push(candidate);
  }
  if (matches.length !== 1) {
    throw new Error(`Expected one exact ${size}-scan 24-hour cohort; found ${matches.length}.`);
  }
  return matches[0]!;
}

function stableRank(domain: string) {
  return createHash("sha256").update(`reject-path-392-expansion-v1:${domain}`).digest("hex");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const records = JSON.parse(await readFile(path.resolve(args.sourceCache), "utf8")) as SourceRecord[];
  const priorSelections = await Promise.all(args.priorSelections.map(async (filePath) =>
    JSON.parse(await readFile(path.resolve(filePath), "utf8")) as PriorSelection
  ));
  const priorDomains = new Set(priorSelections.flatMap((prior) =>
    prior.selected.map((entry) => normalizeDomain(entry.normalizedDomain))
  ));
  const cohort = findExactAnchoredCohort(records, args.sourceCohortSize);
  const exclusions: Array<{ normalizedDomain: string; reason: string; scanId: string }> = [];
  const eligible: Array<SourceRecord & { exactTargetUrl: string; normalizedDomain: string }> = [];
  const seen = new Set<string>();

  for (const record of cohort) {
    if (record.sourceOutcome === "confirmed") continue;
    const exactTargetUrl = sanitizeTarget(record.packet.targetUrl);
    const normalizedDomain = exactTargetUrl ? normalizeDomain(new URL(exactTargetUrl).hostname) : normalizeDomain(record.hostname);
    if (seen.has(normalizedDomain)) continue;
    seen.add(normalizedDomain);
    if (priorDomains.has(normalizedDomain)) {
      exclusions.push({ normalizedDomain, reason: "excluded_previous_cohort", scanId: record.scan_id });
      continue;
    }
    if (!exactTargetUrl) {
      exclusions.push({ normalizedDomain, reason: "unsafe_or_disallowed_target", scanId: record.scan_id });
      continue;
    }
    if (record.effective_state === "blocked" || record.effective_state === "do_not_calibrate") {
      exclusions.push({ normalizedDomain, reason: "central_ledger_blocked", scanId: record.scan_id });
      continue;
    }
    const hold = publicTestContactHoldForUrl(exactTargetUrl);
    if (hold) {
      exclusions.push({ normalizedDomain, reason: `repository_hold:${hold.reason}`, scanId: record.scan_id });
      continue;
    }
    eligible.push({ ...record, exactTargetUrl, normalizedDomain });
  }

  const selected = eligible.toSorted((left, right) =>
    stableRank(left.normalizedDomain).localeCompare(stableRank(right.normalizedDomain))
  ).slice(0, args.limit);
  if (selected.length !== args.limit) {
    throw new Error(`Only ${selected.length} safe distinct failed targets remained; required ${args.limit}.`);
  }

  const countOutcomes = (values: SourceRecord[]) => values.reduce<Record<string, number>>((counts, record) => {
    counts[record.sourceOutcome] = (counts[record.sourceOutcome] ?? 0) + 1;
    return counts;
  }, {});
  const artifact = {
    artifactVersion: "certscore.reject_path_expansion_selection.v1",
    generatedAt: new Date().toISOString(),
    initiatesTargetContact: false,
    sourceCohortCount: cohort.length,
    sourceDistinctDomainCount: new Set(cohort.map((record) => normalizeDomain(record.hostname))).size,
    sourceCounts: countOutcomes(cohort),
    sourceWindow: { newest: cohort[0]?.completed_at, oldest: cohort.at(-1)?.completed_at },
    requestedCount: args.limit,
    selectedCount: selected.length,
    selectionMethod: "sha256_seeded_without_replacement",
    selectionSeed: "reject-path-392-expansion-v1",
    cooldownOverride: {
      authorizedBy: "product_owner",
      authorizedInCurrentTask: true,
      scope: `one immediate local rescan of each of ${args.limit} selected targets`,
    },
    exclusions,
    selected: selected.map((record) => ({
      exactTargetUrl: record.exactTargetUrl,
      normalizedDomain: record.normalizedDomain,
      sourceCompletedAt: record.completed_at,
      sourceOutcome: record.sourceOutcome,
      sourceScanId: record.scan_id,
    })),
  };
  const outputPath = path.resolve(args.out);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({
    eligibleCount: eligible.length,
    outputPath,
    selectedCount: selected.length,
    sourceCohortCount: cohort.length,
    sourceDistinctDomainCount: artifact.sourceDistinctDomainCount,
    selectedCounts: countOutcomes(selected),
  }, null, 2));
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
