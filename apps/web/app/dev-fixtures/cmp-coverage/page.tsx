import { notFound } from "next/navigation";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { ShadowScanReport } from "../../../components/scans/report-lab/shadow-scan-report";
import type { ShadowReportData } from "../../../components/scans/report-lab/shadow-report-data";

export const dynamic = "force-dynamic";

/** Explicit offline replay. Never creates a scan or updates a saved report. */
export default async function CmpCoveragePreview({ searchParams }: { searchParams: Promise<{ example?: string }> }) {
  if (process.env.NODE_ENV !== "development") notFound();
  const { example } = await searchParams;
  const scanId = example === "sits" ? "68e528ce-ff80-4dd3-99be-e9e951c2f535" : "e5478fa0-d292-4e3f-8991-b72ba2d5de23";
  const file = path.resolve(process.cwd(), `../../artifacts/cmp-coverage-v5-20261014/${scanId}-report.json`);
  const report = await readFile(file, "utf8").then(text => JSON.parse(text) as ShadowReportData).catch(() => null);
  if (!report) notFound();
  return <><aside className="bg-amber-50 px-6 py-2 text-sm text-amber-950">Local evidence replay · {example === "sits" ? "SITS" : "IKEA"} · saved report unchanged · no new scan</aside>
    <ShadowScanReport report={report} variant="timeline" />
  </>;
}
