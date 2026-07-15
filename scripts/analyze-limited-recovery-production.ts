import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

type ProductionRecord = {
  coverageStatus?: string | null;
  domain: string;
  noGoReason?: string | null;
  resultDisposition?: string | null;
  resultUrl?: string | null;
  riskLevel?: string | null;
  scanId?: string | null;
  scanStatus?: string | null;
  score?: number | null;
  status: string;
  statusUrl?: string | null;
};

type LocalResult = {
  domain: string;
  durationMs?: number;
  runtime?: {
    coverageStatus?: string;
    noGoCandidate?: boolean;
    noGoReasons?: string[];
    thirdPartyRequests?: number;
    cookiesBeforeConsent?: number;
  };
  moduleRuns?: Array<{ moduleName?: string; durationMs?: number; status?: string }>;
  status?: string;
};

type Comparison = {
  domain: string;
  localOutcome: string;
  productionOutcome: string;
  localCoverageStatus: string | null;
  productionCoverageStatus: string | null;
  localDurationMs: number | null;
  productionScanTimeSeconds: number | null;
  localThirdPartyRequests: number | null;
  productionThirdPartyRequests: number | null;
  localCookiesBeforeConsent: number | null;
  productionCookiesBeforeConsent: number | null;
  productionNoGoReason: string | null;
  productionScore: number | null;
  productionRiskLevel: string | null;
};

const ROOT = path.resolve("artifacts/limited-recovery-production-20260715");
const REQUEUE_PATH = path.join(ROOT, "requeue.json");
const OUTPUT_PATH = path.join(ROOT, "comparison.json");
const MARKDOWN_PATH = path.join(ROOT, "comparison.md");

function localOutcome(row: LocalResult | undefined) {
  if (!row) return "not_in_local_rerun";
  if (row.status === "failed") return "failed";
  if (row.runtime?.noGoCandidate) return "no_go";
  if (row.runtime?.coverageStatus === "usable") return "usable";
  if (row.runtime?.coverageStatus === "limited_partial") return "limited_partial";
  return row.runtime?.coverageStatus ?? "unknown";
}

function productionOutcome(row: ProductionRecord) {
  if (row.status === "failed") return "failed";
  if (row.resultDisposition === "no_go") return "no_go";
  return "evidence_limited";
}

async function fetchJson(url: string) {
  const response = await fetch(url, {
    headers: { accept: "application/json", "user-agent": "CertScore-recovery-comparison/1.0" },
    signal: AbortSignal.timeout(30_000),
  });
  const body = await response.json() as Record<string, unknown>;
  return { body, status: response.status };
}

async function fetchProductionDetails(row: ProductionRecord) {
  if (!row.resultUrl) return { body: {}, scanTimeSeconds: null };
  try {
    const url = new URL(row.resultUrl);
    url.searchParams.set("detail", "summary");
    const { body } = await fetchJson(url.toString());
    const timestamps = typeof body.timestamps === "object" && body.timestamps !== null ? body.timestamps as Record<string, unknown> : null;
    const executive = typeof body.executiveSummary === "object" && body.executiveSummary !== null
      ? body.executiveSummary as Record<string, unknown>
      : null;
    return {
      body,
      scanTimeSeconds: typeof executive?.scanTimeSeconds === "number"
        ? executive.scanTimeSeconds
        : typeof timestamps?.createdAt === "string" && typeof timestamps?.completedAt === "string"
          ? (Date.parse(timestamps.completedAt) - Date.parse(timestamps.createdAt)) / 1_000
          : null,
    };
  } catch (error) {
    return { body: { fetchError: error instanceof Error ? error.message : String(error) }, scanTimeSeconds: null };
  }
}

function numberAt(record: Record<string, unknown> | null, key: string) {
  return typeof record?.[key] === "number" ? record[key] as number : null;
}

function stringAt(record: Record<string, unknown> | null, key: string) {
  return typeof record?.[key] === "string" ? record[key] as string : null;
}

async function main() {
  const production = JSON.parse(await readFile(REQUEUE_PATH, "utf8")) as { records: ProductionRecord[] };
  const localRows: LocalResult[] = [];
  for (const batch of ["batch-1", "batch-2", "batch-3"]) {
    const input = JSON.parse(await readFile(`artifacts/limited-recovery-full-20260714/${batch}/Wc01V2ScanLabCohort.summary.json`, "utf8")) as { results: LocalResult[] };
    localRows.push(...input.results);
  }
  const localByDomain = new Map(localRows.map((row) => [row.domain, row]));
  let cursor = 0;
  const details = new Map<string, Awaited<ReturnType<typeof fetchProductionDetails>>>();
  async function worker() {
    while (cursor < production.records.length) {
      const row = production.records[cursor];
      cursor += 1;
      details.set(row.domain, await fetchProductionDetails(row));
    }
  }
  await Promise.all(Array.from({ length: 4 }, () => worker()));

  const comparisons: Comparison[] = production.records.map((row) => {
    const local = localByDomain.get(row.domain);
    const detail = details.get(row.domain)?.body ?? {};
    const executive = typeof detail.executiveSummary === "object" && detail.executiveSummary !== null
      ? detail.executiveSummary as Record<string, unknown>
      : null;
    const coverage = typeof detail.coverage === "object" && detail.coverage !== null
      ? detail.coverage as Record<string, unknown>
      : null;
    const summary = typeof detail.summary === "object" && detail.summary !== null
      ? detail.summary as Record<string, unknown>
      : null;
    return {
      domain: row.domain,
      localOutcome: localOutcome(local),
      productionOutcome: productionOutcome(row),
      localCoverageStatus: local?.runtime?.coverageStatus ?? null,
      productionCoverageStatus: stringAt(coverage, "status") ?? row.coverageStatus ?? null,
      localDurationMs: local?.durationMs ?? null,
      productionScanTimeSeconds: details.get(row.domain)?.scanTimeSeconds ?? null,
      localThirdPartyRequests: local?.runtime?.thirdPartyRequests ?? null,
      productionThirdPartyRequests: numberAt(executive, "thirdPartyRequests"),
      localCookiesBeforeConsent: local?.runtime?.cookiesBeforeConsent ?? null,
      productionCookiesBeforeConsent: numberAt(executive, "cookiesPreConsent"),
      productionNoGoReason: stringAt(typeof detail.noGo === "object" && detail.noGo !== null ? detail.noGo as Record<string, unknown> : null, "reasonCode") ?? row.noGoReason ?? null,
      productionScore: numberAt(summary, "score") ?? row.score ?? null,
      productionRiskLevel: stringAt(summary, "riskLevel") ?? row.riskLevel ?? null,
    };
  });

  const transitionCounts = Object.fromEntries(
    [...comparisons.reduce((counts, row) => {
      const key = `${row.localOutcome}->${row.productionOutcome}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
      return counts;
    }, new Map<string, number>())].sort(([a], [b]) => a.localeCompare(b)),
  );
  const scoreRows = comparisons.filter((row) => row.productionScore !== null);
  const scores = scoreRows.map((row) => row.productionScore as number).sort((a, b) => a - b);
  const report = {
    generatedAt: new Date().toISOString(),
    source: REQUEUE_PATH,
    transitionCounts,
    scoreStats: {
      count: scores.length,
      average: scores.length ? scores.reduce((sum, score) => sum + score, 0) / scores.length : null,
      median: scores.length ? scores[Math.floor(scores.length / 2)] : null,
      min: scores[0] ?? null,
      max: scores.at(-1) ?? null,
    },
    comparisons,
  };
  await mkdir(ROOT, { recursive: true });
  await writeFile(OUTPUT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  const lines = [
    "# Limited-recovery production comparison",
    "",
    `Generated: ${report.generatedAt}`,
    "",
    "## Outcome transitions",
    "",
    "| Local outcome | Production outcome | Count |",
    "|---|---|---:|",
    ...Object.entries(transitionCounts).map(([key, count]) => {
      const [local, productionOutcomeValue] = key.split("->");
      return `| ${local} | ${productionOutcomeValue} | ${count} |`;
    }),
    "",
    `Production score stats for ${scores.length} evidence-bearing results: average ${report.scoreStats.average?.toFixed(1) ?? "n/a"}, median ${report.scoreStats.median ?? "n/a"}, range ${report.scoreStats.min ?? "n/a"}-${report.scoreStats.max ?? "n/a"}.`,
    "",
    "## Domain comparison",
    "",
    "| Domain | Local | Production | Production coverage | No-go reason | Score |",
    "|---|---|---|---|---|---:|",
    ...comparisons.map((row) => `| ${row.domain} | ${row.localOutcome} | ${row.productionOutcome} | ${row.productionCoverageStatus ?? ""} | ${row.productionNoGoReason ?? ""} | ${row.productionScore ?? ""} |`),
    "",
  ];
  await writeFile(MARKDOWN_PATH, `${lines.join("\n")}\n`, "utf8");
  console.log(JSON.stringify({ output: OUTPUT_PATH, markdown: MARKDOWN_PATH, transitionCounts, scoreStats: report.scoreStats }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
