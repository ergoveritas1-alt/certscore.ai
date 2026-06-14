import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

type CapturePlan = {
  primary?: PlanRow[];
  qualify?: PlanRow[];
};

type PlanRow = {
  host: string;
  lanes: string[];
  priorStatus: string;
  score: number;
};

type CohortSummary = {
  results?: Array<{
    domain?: string;
    durationMs?: number;
    eligibleFindingKeys?: string[];
    runtime?: {
      cookiesBeforeConsent?: number;
      observedJourneys?: number;
      thirdPartyRequests?: number;
      vendorObservations?: number;
    };
    status?: string;
    url?: string;
  }>;
};

type SelectedRow = {
  durationMs: number;
  eligibleCandidates: number;
  host: string;
  lanes: string[];
  localScore: number;
  planScore: number;
  thirdPartyRequests: number;
};

const DEFAULT_LIMIT = 10;
const HEAVY_REQUEST_THRESHOLD = 900;

function getArg(name: string) {
  const index = process.argv.indexOf(name);
  if (index === -1) return null;
  return process.argv[index + 1] ?? null;
}

function requiredArg(name: string) {
  const value = getArg(name);
  if (!value) throw new Error(`Missing ${name}.`);
  return value;
}

function intArg(name: string, fallback: number) {
  const raw = getArg(name);
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`${name} must be a positive integer.`);
  return parsed;
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

function localScore(input: {
  durationMs: number;
  eligibleCandidates: number;
  thirdPartyRequests: number;
  vendorObservations: number;
}) {
  let score = 0;
  score += Math.min(input.eligibleCandidates, 12) * 2;
  score += Math.min(input.vendorObservations, 12);
  score += input.thirdPartyRequests > 0 ? 3 : 0;
  score += input.thirdPartyRequests >= HEAVY_REQUEST_THRESHOLD ? -8 : 0;
  score += input.durationMs <= 20_000 ? 8 : input.durationMs <= 45_000 ? 4 : input.durationMs <= 75_000 ? 1 : -5;
  return score;
}

function main() {
  const planPath = requiredArg("--plan");
  const qualifySummaryPath = requiredArg("--qualification-summary");
  const outDir = getArg("--out-dir") ?? path.join("artifacts", "v2-gold-corpus-promoted");
  const limit = intArg("--limit", DEFAULT_LIMIT);
  const plan = readJson<CapturePlan>(planPath);
  const summary = readJson<CohortSummary>(qualifySummaryPath);
  const planRows = new Map<string, PlanRow>();
  for (const row of [...(plan.primary ?? []), ...(plan.qualify ?? [])]) {
    const host = normalizeHost(row.host);
    if (!host) continue;
    const existing = planRows.get(host);
    if (!existing || row.score > existing.score) planRows.set(host, { ...row, host });
  }

  const candidates: SelectedRow[] = [];
  for (const result of summary.results ?? []) {
    if (result.status !== "completed") continue;
    const host = normalizeHost(result.domain ?? result.url);
    const planned = planRows.get(host);
    if (!host || !planned) continue;
    const durationMs = result.durationMs ?? 0;
    const thirdPartyRequests = result.runtime?.thirdPartyRequests ?? 0;
    const eligibleCandidates = result.eligibleFindingKeys?.length ?? 0;
    const row: SelectedRow = {
      durationMs,
      eligibleCandidates,
      host,
      lanes: planned.lanes,
      localScore: localScore({
        durationMs,
        eligibleCandidates,
        thirdPartyRequests,
        vendorObservations: result.runtime?.vendorObservations ?? 0,
      }),
      planScore: planned.score,
      thirdPartyRequests,
    };
    candidates.push(row);
  }

  const selected: SelectedRow[] = [];
  const laneCounts = new Map<string, number>();
  const sorted = candidates.sort((left, right) =>
    (right.planScore + right.localScore) - (left.planScore + left.localScore) ||
    left.thirdPartyRequests - right.thirdPartyRequests ||
    left.host.localeCompare(right.host)
  );

  for (const row of sorted) {
    const addsScarceLane = row.lanes.some((lane) => (laneCounts.get(lane) ?? 0) < 2);
    const notTooHeavy = row.thirdPartyRequests < HEAVY_REQUEST_THRESHOLD || selected.length < Math.ceil(limit / 2);
    if ((addsScarceLane || selected.length < Math.ceil(limit / 2)) && notTooHeavy) {
      selected.push(row);
      for (const lane of row.lanes) laneCounts.set(lane, (laneCounts.get(lane) ?? 0) + 1);
    }
    if (selected.length >= limit) break;
  }

  for (const row of sorted) {
    if (selected.length >= limit) break;
    if (selected.some((candidate) => candidate.host === row.host)) continue;
    if (row.thirdPartyRequests >= HEAVY_REQUEST_THRESHOLD) continue;
    selected.push(row);
  }

  mkdirSync(outDir, { recursive: true });
  writeFileSync(path.join(outDir, "qualified-full-capture-hosts.txt"), `${selected.map((row) => row.host).join("\n")}\n`);
  writeFileSync(path.join(outDir, "QualifiedFullCaptureSelection.json"), `${JSON.stringify({
    generatedAt: new Date().toISOString(),
    selected,
    rejected: sorted.filter((row) => !selected.some((candidate) => candidate.host === row.host)),
  }, null, 2)}\n`);
  writeFileSync(path.join(outDir, "QualifiedFullCaptureSelection.md"), toMarkdown(selected, sorted.filter((row) => !selected.some((candidate) => candidate.host === row.host))));

  console.log(JSON.stringify({ outDir, selected: selected.length }, null, 2));
}

function toMarkdown(selected: SelectedRow[], rejected: SelectedRow[]) {
  const lines = [
    "# Qualified Full Capture Selection",
    "",
    "Hosts promoted after local `standard` qualification. Use these for expensive `full --capture-replay` capture.",
    "",
  ];
  appendRows(lines, "Selected", selected);
  appendRows(lines, "Held Back", rejected);
  return `${lines.join("\n")}\n`;
}

function appendRows(lines: string[], title: string, rows: SelectedRow[]) {
  lines.push(`## ${title}`, "");
  lines.push("| Host | Total score | Plan | Local | 3P requests | Duration ms | Eligible | Lanes |");
  lines.push("| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |");
  for (const row of rows) {
    lines.push(`| ${row.host} | ${row.planScore + row.localScore} | ${row.planScore} | ${row.localScore} | ${row.thirdPartyRequests} | ${row.durationMs} | ${row.eligibleCandidates} | ${row.lanes.join(", ")} |`);
  }
  lines.push("");
}

main();
