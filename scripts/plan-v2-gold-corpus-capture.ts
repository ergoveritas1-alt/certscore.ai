import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

type CandidateRow = {
  completed_at: string | null;
  evidence: Record<string, unknown>;
  hostname: string;
  normalized_url: string;
  scan_id: string;
};

type CandidateReport = {
  generated_at?: string;
  lanes: Record<string, CandidateRow[]>;
};

type CohortSummary = {
  results?: Array<{
    domain?: string;
    error?: string;
    status?: string;
    url?: string;
  }>;
};

type HostPlan = {
  evidence: Record<string, unknown>;
  host: string;
  lanes: Set<string>;
  priorStatus: "completed" | "failed" | "timeout" | "unknown";
  score: number;
};

const PRIMARY_LANES = new Set([
  "cmp_accept_reject",
  "post_reject_evidence_likely",
  "privacy_opt_out_do_not_sell",
  "preference_center_cmp",
]);

const NO_GO_LANE = "no_go_or_non_representative";

function getArg(name: string) {
  const index = process.argv.indexOf(name);
  if (index === -1) return null;
  return process.argv[index + 1] ?? null;
}

function intArg(name: string, fallback: number) {
  const raw = getArg(name);
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return parsed;
}

function requiredArg(name: string) {
  const value = getArg(name);
  if (!value) {
    throw new Error(`Missing ${name}.`);
  }
  return value;
}

function readJson<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

function normalizeHost(value: string | undefined) {
  return String(value ?? "")
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/.*$/, "")
    .replace(/^www\./i, "")
    .toLowerCase();
}

function buildPriorStatus(summaryPath: string | null) {
  const statuses = new Map<string, HostPlan["priorStatus"]>();
  if (!summaryPath) return statuses;
  const summary = readJson<CohortSummary>(summaryPath);
  for (const result of summary.results ?? []) {
    const host = normalizeHost(result.domain ?? result.url);
    if (!host) continue;
    if (result.status === "completed") {
      statuses.set(host, "completed");
    } else if (/timed out/i.test(result.error ?? "")) {
      statuses.set(host, "timeout");
    } else if (result.status === "failed") {
      statuses.set(host, "failed");
    }
  }
  return statuses;
}

function buildPlans(report: CandidateReport, priorStatuses: Map<string, HostPlan["priorStatus"]>) {
  const plans = new Map<string, HostPlan>();
  for (const [lane, rows] of Object.entries(report.lanes)) {
    for (const row of rows) {
      const host = normalizeHost(row.hostname);
      if (!host) continue;
      const existing = plans.get(host) ?? {
        evidence: {},
        host,
        lanes: new Set<string>(),
        priorStatus: priorStatuses.get(host) ?? "unknown",
        score: 0,
      };
      existing.lanes.add(lane);
      existing.evidence = { ...existing.evidence, ...row.evidence };
      plans.set(host, existing);
    }
  }

  for (const plan of plans.values()) {
    let score = 0;
    for (const lane of plan.lanes) {
      score += PRIMARY_LANES.has(lane) ? 5 : lane === NO_GO_LANE ? 2 : 1;
    }
    if (truthy(plan.evidence.accept) && truthy(plan.evidence.reject)) score += 4;
    if (truthy(plan.evidence.opt_out_clicks) || truthy(plan.evidence.signal_post_reject)) score += 4;
    if (truthy(plan.evidence.signal_dns) || truthy(plan.evidence.signal_privacy_request) || truthy(plan.evidence.dns)) score += 3;
    if (truthy(plan.evidence.prefs)) score += 2;
    if (typeof plan.evidence.cmp === "string" && plan.evidence.cmp.length > 0) score += 2;
    if (plan.priorStatus === "completed") score += 8;
    if (plan.priorStatus === "timeout") score -= 10;
    if (truthy(plan.evidence.blocked) || truthy(plan.evidence.captcha) || truthy(plan.evidence.auth_wall)) score -= 4;
    plan.score = score;
  }

  return Array.from(plans.values()).sort((left, right) => right.score - left.score || left.host.localeCompare(right.host));
}

function truthy(value: unknown) {
  return value === true || (typeof value === "number" && value > 0) || value === "true";
}

function writeList(filePath: string, hosts: string[]) {
  writeFileSync(filePath, hosts.length > 0 ? `${hosts.join("\n")}\n` : "");
}

function toMarkdown(input: {
  noGo: HostPlan[];
  primary: HostPlan[];
  qualify: HostPlan[];
  retry: HostPlan[];
}) {
  const lines = [
    "# v2 Gold Corpus Capture Plan",
    "",
    "Strategy: use prod DB as a candidate source, then run a cheap qualification pass before expensive full replay capture.",
    "",
    "Recommended sequence:",
    "",
    "1. Run quick qualification with `standard` and no replay capture.",
    "2. Run full replay capture only for primary hosts that qualify quickly.",
    "3. Capture no-go hosts separately with a shorter/no-go-oriented profile.",
    "4. Retry timeout-heavy hosts one at a time only when a specific lane still lacks coverage.",
    "",
    "Commands:",
    "",
    "```bash",
    "pnpm v2:wc01-scan-lab-cohort --urls <out>/quick-qualify-hosts.txt --profile standard --out-dir artifacts/v2-gold-quick-qualify",
    "pnpm v2:wc01-scan-lab-cohort --urls <out>/primary-full-capture-hosts.txt --profile full --capture-replay --out-dir artifacts/v2-gold-primary-full",
    "CERTSCORE_V2_SCAN_STEP_TIMEOUT_MS=45000 pnpm v2:wc01-scan-lab-cohort --urls <out>/no-go-hosts.txt --profile standard --capture-replay --out-dir artifacts/v2-gold-no-go",
    "```",
    "",
    "Avoid using a blanket longer timeout for all candidates. Use longer timeouts only for isolated retries after a site proves it fills a missing lane.",
    "",
  ];
  appendSection(lines, "Primary Full Capture", input.primary);
  appendSection(lines, "No-Go Capture", input.noGo);
  appendSection(lines, "Quick Qualification", input.qualify);
  appendSection(lines, "Isolated Retry", input.retry);
  return `${lines.join("\n")}\n`;
}

function appendSection(lines: string[], title: string, rows: HostPlan[]) {
  lines.push(`## ${title}`, "");
  if (rows.length === 0) {
    lines.push("_No hosts._", "");
    return;
  }
  lines.push("| Host | Score | Prior | Lanes | Key evidence |");
  lines.push("| --- | ---: | --- | --- | --- |");
  for (const row of rows) {
    const evidence = Object.entries(row.evidence)
      .filter(([, value]) => truthy(value) || (typeof value === "string" && value.length > 0))
      .slice(0, 8)
      .map(([key, value]) => `${key}=${String(value).replace(/\|/g, "\\|")}`)
      .join("; ");
    lines.push(`| ${row.host} | ${row.score} | ${row.priorStatus} | ${Array.from(row.lanes).sort().join(", ")} | ${evidence || "n/a"} |`);
  }
  lines.push("");
}

function main() {
  const candidatesPath = requiredArg("--candidates");
  const previousSummaryPath = getArg("--previous-summary");
  const outDir = getArg("--out-dir") ?? path.join("artifacts", "v2-gold-corpus-capture-plan");
  const primaryLimit = intArg("--primary-limit", 12);
  const noGoLimit = intArg("--no-go-limit", 6);

  const report = readJson<CandidateReport>(candidatesPath);
  const plans = buildPlans(report, buildPriorStatus(previousSummaryPath));
  const retry = plans.filter((plan) => plan.priorStatus === "timeout");
  const noGo = plans
    .filter((plan) => plan.lanes.has(NO_GO_LANE))
    .sort((left, right) => (left.priorStatus === "timeout" ? 1 : 0) - (right.priorStatus === "timeout" ? 1 : 0) || right.score - left.score)
    .slice(0, noGoLimit);
  const primary = plans
    .filter((plan) => plan.priorStatus !== "timeout")
    .filter((plan) => Array.from(plan.lanes).some((lane) => PRIMARY_LANES.has(lane)))
    .filter((plan) => !plan.lanes.has(NO_GO_LANE) || plan.priorStatus === "completed")
    .slice(0, primaryLimit);
  const qualify = plans
    .filter((plan) => plan.priorStatus === "unknown")
    .filter((plan) => !plan.lanes.has(NO_GO_LANE))
    .slice(0, Math.max(primaryLimit * 2, 20));

  mkdirSync(outDir, { recursive: true });
  writeList(path.join(outDir, "primary-full-capture-hosts.txt"), primary.map((plan) => plan.host));
  writeList(path.join(outDir, "no-go-hosts.txt"), noGo.map((plan) => plan.host));
  writeList(path.join(outDir, "quick-qualify-hosts.txt"), qualify.map((plan) => plan.host));
  writeList(path.join(outDir, "isolated-retry-hosts.txt"), retry.map((plan) => plan.host));
  writeFileSync(path.join(outDir, "V2GoldCorpusCapturePlan.json"), `${JSON.stringify({
    generatedAt: new Date().toISOString(),
    noGo: noGo.map(serializePlan),
    primary: primary.map(serializePlan),
    qualify: qualify.map(serializePlan),
    retry: retry.map(serializePlan),
  }, null, 2)}\n`);
  writeFileSync(path.join(outDir, "V2GoldCorpusCapturePlan.md"), toMarkdown({ noGo, primary, qualify, retry }));

  console.log(JSON.stringify({
    noGo: noGo.length,
    outDir,
    primary: primary.length,
    qualify: qualify.length,
    retry: retry.length,
  }, null, 2));
}

function serializePlan(plan: HostPlan) {
  return {
    evidence: plan.evidence,
    host: plan.host,
    lanes: Array.from(plan.lanes).sort(),
    priorStatus: plan.priorStatus,
    score: plan.score,
  };
}

main();
