import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

type ReplayEvidenceReport = {
  corpusDirectory?: string;
  evaluatedManifests?: number;
  evaluatedSites?: number;
  generatedAt?: string;
  readiness?: Record<string, unknown>;
  sites?: Array<{ siteKey?: string; sourceUrl?: string; [key: string]: unknown }>;
  summary?: Record<string, unknown>;
};

function getArgValues(name: string) {
  const values: string[] = [];
  for (let index = 0; index < process.argv.length; index += 1) {
    if (process.argv[index] !== name) continue;
    const value = process.argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for ${name}.`);
    values.push(value);
    index += 1;
  }
  return values;
}

function getArg(name: string) {
  const index = process.argv.indexOf(name);
  if (index === -1) return null;
  return process.argv[index + 1] ?? null;
}

function readJson<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

function siteKey(site: { siteKey?: string; sourceUrl?: string }) {
  return String(site.siteKey ?? site.sourceUrl ?? "").replace(/\/$/, "").toLowerCase();
}

function main() {
  const inputs = getArgValues("--report");
  const out = getArg("--out");
  if (inputs.length === 0 || !out) {
    throw new Error("Usage: pnpm exec tsx scripts/merge-v2-replay-evidence-reports.ts --report <ReplayEvidenceReport.json> [--report ...] --out <merged.json>");
  }

  const reports = inputs.map((input) => readJson<ReplayEvidenceReport>(input));
  const sites = new Map<string, Record<string, unknown>>();
  for (const report of reports) {
    for (const site of report.sites ?? []) {
      const key = siteKey(site);
      if (!key) continue;
      sites.set(key, site);
    }
  }

  const merged: ReplayEvidenceReport = {
    corpusDirectory: reports.map((report) => report.corpusDirectory).filter(Boolean).join(", "),
    evaluatedManifests: reports.reduce((sum, report) => sum + (report.evaluatedManifests ?? 0), 0),
    evaluatedSites: sites.size,
    generatedAt: new Date().toISOString(),
    readiness: {
      recommendation: reports.every((report) => String(report.readiness?.recommendation ?? "").includes("READY"))
        ? "READY_FOR_100_SITE_CAPTURE"
        : "REVIEW_RECOMMENDED",
      sourceReports: inputs,
    },
    sites: Array.from(sites.values()),
    summary: {
      sourceReportCount: reports.length,
    },
  };

  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(merged, null, 2)}\n`);
  console.log(JSON.stringify({ evaluatedSites: merged.evaluatedSites, out }, null, 2));
}

main();
