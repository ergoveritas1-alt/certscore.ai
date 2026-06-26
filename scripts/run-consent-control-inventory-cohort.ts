import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createArtifactWriter } from "../packages/certscore-scan-core/src/artifact-writer.js";
import { getScanProfile } from "../packages/certscore-scan-core/src/profiles.js";
import { preConsentRuntimeScanner } from "../packages/certscore-scan-core/src/scanners/pre-consent-runtime-scanner.js";
import { resolveVendorObservations } from "../packages/certscore-vendor-resolver/src/index.js";

type Args = {
  artifactRoot: string;
  dryRun: boolean;
  limit: number;
  outDir?: string;
  urlsPath?: string;
};

type SourceCandidate = {
  bundlePath?: string;
  host: string;
  mtimeMs?: number;
  url: string;
};

type CohortRow = {
  acceptObserved: boolean;
  cmpDetected: boolean;
  cmpVendorProduct: string[];
  diagnosticsMissReasons: string[];
  domain: string;
  domTextArtifactPath?: string;
  freshScanId: string;
  fullPageScreenshotPath?: string;
  inventoryBasis: string[];
  inventoryTimings: Array<{ label: string; durationMs: number; detail?: string }>;
  mismatchFlag: boolean;
  evidenceLimitedReason?: string;
  optionsObserved: boolean;
  privacyOptOutObserved: boolean;
  rejectObserved: boolean;
  retainedActionTypes: string[];
  retainedLabels: string[];
  scanDurationMs?: number;
  sourceBundlePath?: string;
  status: "completed" | "failed";
  url: string;
  visualQaHumanStatus: "unreviewed" | "present" | "absent" | "unclear";
  viewportScreenshotPath?: string;
  error?: string;
};

type CohortReport = {
  reportVersion: "certscore.consent_control_inventory_cohort.1";
  generatedAt: string;
  outputDir: string;
  selection: {
    artifactRoot: string;
    limit: number;
    source: "urls_file" | "latest_local_artifacts";
    urlsPath?: string;
  };
  totals: {
    acceptObserved: number;
    cmpEvidenceSites: number;
    evidenceLimited: number;
    failed: number;
    optionsObserved: number;
    rejectObserved: number;
    totalSites: number;
  };
  topMissReasons: Array<{ reason: string; count: number }>;
  rows: CohortRow[];
};

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const timestamp = formatRunTimestamp(new Date());
  const outDir = path.resolve(args.outDir ?? path.join("artifacts", "consent-control-inventory-cohort", timestamp));
  const candidates = args.urlsPath
    ? await readUrlCandidates(args.urlsPath, args.limit)
    : await latestLocalArtifactCandidates(args.artifactRoot, args.limit);

  if (args.dryRun) {
    console.log(`Consent-control inventory cohort dry run: ${candidates.length} URL(s)`);
    candidates.forEach((candidate, index) => console.log(`${index + 1}. ${candidate.url}`));
    return;
  }

  await mkdir(outDir, { recursive: true });
  const rows: CohortRow[] = [];
  for (const [index, candidate] of candidates.entries()) {
    const siteDir = path.join(outDir, slugForHost(candidate.host));
    await mkdir(siteDir, { recursive: true });
    const row = await runSite(candidate, siteDir, index + 1).catch((error) =>
      failedRow(candidate, index + 1, error)
    );
    rows.push(row);
    await writeReports(reportForRows({
      args,
      outDir,
      rows,
      source: args.urlsPath ? "urls_file" : "latest_local_artifacts",
    }));
    console.log(`[${index + 1}/${candidates.length}] ${row.status} ${candidate.host}`);
  }
}

async function runSite(candidate: SourceCandidate, siteDir: string, index: number): Promise<CohortRow> {
  const startedAtMs = Date.now();
  const artifactWriter = await createArtifactWriter(siteDir);
  const result = await preConsentRuntimeScanner({
    url: candidate.url,
    normalizedUrl: candidate.url,
    scanStartedAtMs: startedAtMs,
    internalBudgetMs: getScanProfile("quick").internalBudgetMs,
    artifactWriter,
    screenshotCaptureMode: "viewport_first",
    screenshotMode: "always",
    waitMode: "fast",
  });
  const observation = result.consentUiObservations[0];
  const normalizedVendorObservations = resolveVendorObservations(result.vendorResolverInputs);
  const cmpVendorProduct = [
    ...result.cmpRuntimeObservations.map((cmp) => [cmp.vendor, cmp.product].filter(Boolean).join(" / ")),
    ...normalizedVendorObservations
      .filter((vendor) => vendor.vendorCategory === "consent_management")
      .map((vendor) => [vendor.vendorName, vendor.productName].filter(Boolean).join(" / ")),
  ].filter(Boolean);
  const viewportScreenshot = result.screenshots.find((screenshot) => screenshot.artifactId === "screenshot_pre_consent");
  const fullPageScreenshot = result.screenshots.find((screenshot) => screenshot.artifactId === "screenshot_pre_consent_full_page");
  const timings = (result.moduleRun.timingBreakdown ?? []).filter((entry) => /consent UI|screenshot|CMP runtime/i.test(entry.label));
  const freshScanId = `consent-control-${String(index).padStart(2, "0")}-${slugForHost(candidate.host)}-${Date.now()}`;
  const moduleError = result.moduleRun.errors.join("; ") || undefined;
  const navigationTransportFailure = moduleError ? isNavigationTransportFailure(moduleError) : false;
  const status = result.moduleRun.status === "failed" ? "failed" : "completed";
  const diagnosticsMissReasons = [
    ...(observation?.inventoryDiagnostics?.rejectionReasons ?? []),
    ...(navigationTransportFailure ? ["navigation_transport_failure"] : []),
  ];

  return {
    acceptObserved: observation?.acceptControlObserved === true,
    cmpDetected: result.cmpRuntimeObservations.length > 0 || cmpVendorProduct.length > 0,
    cmpVendorProduct: unique(cmpVendorProduct),
    diagnosticsMissReasons,
    domain: candidate.host,
    domTextArtifactPath: result.domSnapshots[0]?.path,
    freshScanId,
    fullPageScreenshotPath: fullPageScreenshot?.path,
    inventoryBasis: observation?.basis ?? [],
    inventoryTimings: timings,
    mismatchFlag: false,
    evidenceLimitedReason: navigationTransportFailure
      ? "navigation_transport_failure_no_public_page_evidence_retained"
      : evidenceLimitedReasonFor({
      acceptObserved: observation?.acceptControlObserved === true,
      cmpDetected: result.cmpRuntimeObservations.length > 0 || cmpVendorProduct.length > 0,
      diagnosticsMissReasons,
      optionsObserved: observation?.managePreferencesControlObserved === true,
      privacyOptOutObserved: observation?.controls.some((control) => control.actionType === "do_not_sell_share") === true,
      rejectObserved: observation?.rejectControlObserved === true,
      status,
    }),
    optionsObserved: observation?.managePreferencesControlObserved === true,
    privacyOptOutObserved: observation?.controls.some((control) => control.actionType === "do_not_sell_share") === true,
    rejectObserved: observation?.rejectControlObserved === true,
    retainedActionTypes: observation?.controls.map((control) => control.actionType) ?? [],
    retainedLabels: observation?.controls.map((control) => control.label) ?? [],
    scanDurationMs: result.moduleRun.durationMs,
    sourceBundlePath: candidate.bundlePath,
    status,
    url: candidate.url,
    visualQaHumanStatus: "unreviewed",
    viewportScreenshotPath: viewportScreenshot?.path,
    error: moduleError,
  };
}

async function latestLocalArtifactCandidates(artifactRoot: string, limit: number): Promise<SourceCandidate[]> {
  const bundlePaths = await findFiles(path.resolve(artifactRoot), "CanonicalEvidenceBundle.json");
  const pathsByMtime = (await Promise.all(bundlePaths.map(async (bundlePath) => {
    const stats = await stat(bundlePath);
    return { bundlePath, mtimeMs: stats.mtimeMs };
  }))).sort((left, right) => right.mtimeMs - left.mtimeMs);
  const seen = new Set<string>();
  const selected: SourceCandidate[] = [];
  for (const entry of pathsByMtime) {
    const raw = await readJson<{ normalizedUrl?: string; url?: string }>(entry.bundlePath).catch(() => undefined);
    const url = raw?.normalizedUrl ?? raw?.url;
    const host = hostForUrl(url);
    if (!url || !host || seen.has(host)) {
      continue;
    }
    seen.add(host);
    selected.push({ bundlePath: entry.bundlePath, host, mtimeMs: entry.mtimeMs, url });
    if (selected.length >= limit) {
      break;
    }
  }
  return selected;
}

async function readUrlCandidates(urlsPath: string, limit: number): Promise<SourceCandidate[]> {
  const content = await readFile(urlsPath, "utf8");
  const seen = new Set<string>();
  return content.split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((url) => ({ host: hostForUrl(url), url }))
    .filter((candidate): candidate is { host: string; url: string } => Boolean(candidate.host))
    .filter((candidate) => {
      if (seen.has(candidate.host)) {
        return false;
      }
      seen.add(candidate.host);
      return true;
    })
    .slice(0, limit);
}

async function findFiles(root: string, filename: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  const results: string[] = [];
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) {
      continue;
    }
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      results.push(...await findFiles(entryPath, filename));
    } else if (entry.isFile() && entry.name === filename) {
      results.push(entryPath);
    }
  }
  return results;
}

function reportForRows(input: {
  args: Args;
  outDir: string;
  rows: CohortRow[];
  source: "urls_file" | "latest_local_artifacts";
}): CohortReport {
  const missCounts = new Map<string, number>();
  for (const row of input.rows) {
    for (const reason of row.diagnosticsMissReasons) {
      missCounts.set(reason, (missCounts.get(reason) ?? 0) + 1);
    }
  }
  return {
    reportVersion: "certscore.consent_control_inventory_cohort.1",
    generatedAt: new Date().toISOString(),
    outputDir: input.outDir,
    selection: {
      artifactRoot: input.args.artifactRoot,
      limit: input.args.limit,
      source: input.source,
      urlsPath: input.args.urlsPath,
    },
    totals: {
      acceptObserved: input.rows.filter((row) => row.acceptObserved).length,
      cmpEvidenceSites: input.rows.filter((row) => row.cmpDetected).length,
      evidenceLimited: input.rows.filter((row) =>
        row.evidenceLimitedReason || (
          row.status === "completed" && !row.acceptObserved && !row.rejectObserved && !row.optionsObserved
        )
      ).length,
      failed: input.rows.filter((row) => row.status === "failed").length,
      optionsObserved: input.rows.filter((row) => row.optionsObserved).length,
      rejectObserved: input.rows.filter((row) => row.rejectObserved).length,
      totalSites: input.rows.length,
    },
    topMissReasons: [...missCounts.entries()]
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
      .slice(0, 12)
      .map(([reason, count]) => ({ reason, count })),
    rows: input.rows,
  };
}

async function writeReports(report: CohortReport): Promise<void> {
  await mkdir(report.outputDir, { recursive: true });
  await writeFile(
    path.join(report.outputDir, "ConsentControlInventoryCohort.report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );
  await writeFile(
    path.join(report.outputDir, "ConsentControlInventoryCohort.report.md"),
    `${markdownForReport(report)}\n`,
    "utf8",
  );
}

function markdownForReport(report: CohortReport): string {
  const lines: string[] = [];
  lines.push("# Consent Control Inventory Cohort");
  lines.push("");
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push(`Output: ${report.outputDir}`);
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`- Total sites: ${report.totals.totalSites}`);
  lines.push(`- CMP-evidence sites: ${report.totals.cmpEvidenceSites}`);
  lines.push(`- Accept observed: ${report.totals.acceptObserved}`);
  lines.push(`- Reject observed: ${report.totals.rejectObserved}`);
  lines.push(`- Options observed: ${report.totals.optionsObserved}`);
  lines.push(`- Evidence-limited: ${report.totals.evidenceLimited}`);
  lines.push("");
  lines.push("## Top Miss Reasons");
  lines.push("");
  if (report.topMissReasons.length === 0) {
    lines.push("- None recorded.");
  } else {
    for (const reason of report.topMissReasons) {
      lines.push(`- ${reason.reason}: ${reason.count}`);
    }
  }
  lines.push("");
  lines.push("## Visual QA");
  lines.push("");
  lines.push("- Human visual QA status defaults to `unreviewed`.");
  lines.push("- Visual QA annotations are advisory for this cohort report and do not alter scanner evidence or findings.");
  lines.push("- Likely false negatives from visual QA: not reviewed.");
  lines.push("- Likely false positives from visual QA: not reviewed.");
  lines.push("");
  lines.push("## Sites");
  lines.push("");
  lines.push("| Domain | CMP | Accept | Reject | Options | Privacy opt-out | Labels | Evidence limit | Viewport screenshot | Full-page screenshot | DOM text | Miss reasons |");
  lines.push("|---|---:|---:|---:|---:|---:|---|---|---|---|---|---|");
  for (const row of report.rows) {
    lines.push([
      row.domain,
      row.cmpDetected ? "yes" : "no",
      row.acceptObserved ? "yes" : "no",
      row.rejectObserved ? "yes" : "no",
      row.optionsObserved ? "yes" : "no",
      row.privacyOptOutObserved ? "yes" : "no",
      row.retainedLabels.join("<br>") || "-",
      row.evidenceLimitedReason ?? "-",
      artifactLink(row.viewportScreenshotPath),
      artifactLink(row.fullPageScreenshotPath),
      artifactLink(row.domTextArtifactPath),
      row.diagnosticsMissReasons.join("<br>") || "-",
    ].map((cell) => ` ${cell.replace(/\|/g, "\\|")} `).join("|").replace(/^/, "|").replace(/$/, "|"));
  }
  lines.push("");
  lines.push("## Needs Deeper Investigation");
  lines.push("");
  const needsInvestigation = report.rows.filter((row) =>
    row.status === "failed" ||
    Boolean(row.evidenceLimitedReason) ||
    (row.cmpDetected && !row.acceptObserved && !row.rejectObserved && !row.optionsObserved)
  );
  if (needsInvestigation.length === 0) {
    lines.push("- None from structured evidence; visual QA remains unreviewed.");
  } else {
    for (const row of needsInvestigation) {
      const reason = row.evidenceLimitedReason ?? row.error ?? (row.diagnosticsMissReasons.join(", ") || "CMP evidence but no structured controls retained");
      lines.push(`- ${row.domain}: ${reason}`);
    }
  }
  return lines.join("\n");
}

function failedRow(candidate: SourceCandidate, index: number, error: unknown): CohortRow {
  const message = error instanceof Error ? error.message : String(error);
  const navigationTransportFailure = isNavigationTransportFailure(message);
  return {
    acceptObserved: false,
    cmpDetected: false,
    cmpVendorProduct: [],
    diagnosticsMissReasons: [navigationTransportFailure ? "navigation_transport_failure" : "timing_expired_before_controls_surfaced"],
    domain: candidate.host,
    evidenceLimitedReason: navigationTransportFailure ? "navigation_transport_failure_no_public_page_evidence_retained" : undefined,
    freshScanId: `consent-control-${String(index).padStart(2, "0")}-${slugForHost(candidate.host)}-${Date.now()}`,
    inventoryBasis: [],
    inventoryTimings: [],
    mismatchFlag: false,
    optionsObserved: false,
    privacyOptOutObserved: false,
    rejectObserved: false,
    retainedActionTypes: [],
    retainedLabels: [],
    sourceBundlePath: candidate.bundlePath,
    status: "failed",
    url: candidate.url,
    visualQaHumanStatus: "unreviewed",
    error: message,
  };
}

function evidenceLimitedReasonFor(input: {
  acceptObserved: boolean;
  cmpDetected: boolean;
  diagnosticsMissReasons: string[];
  optionsObserved: boolean;
  privacyOptOutObserved: boolean;
  rejectObserved: boolean;
  status: CohortRow["status"];
}) {
  if (input.status !== "completed") {
    return undefined;
  }
  if (input.acceptObserved || input.rejectObserved || input.optionsObserved) {
    return undefined;
  }
  if (input.privacyOptOutObserved) {
    return "privacy_opt_out_only_no_cookie_banner_controls";
  }
  if (input.cmpDetected) {
    return "cmp_evidence_but_cookie_banner_controls_absent_on_retained_page";
  }
  if (input.diagnosticsMissReasons.includes("frame_inaccessible")) {
    return "frame_inaccessible_no_cookie_banner_controls_retained";
  }
  return undefined;
}

function isNavigationTransportFailure(message: string) {
  return /page\.goto|net::ERR_|ERR_HTTP2_PROTOCOL_ERROR|ERR_QUIC_PROTOCOL_ERROR|navigation timeout|timeout \d+ms exceeded/i.test(message);
}

function artifactLink(value: string | undefined): string {
  return value ? `[artifact](${pathToFileURL(path.resolve(value)).href})` : "-";
}

async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, "utf8")) as T;
}

function hostForUrl(value: string | undefined): string | null {
  if (!value) {
    return null;
  }
  try {
    return new URL(value).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return null;
  }
}

function slugForHost(host: string): string {
  return host.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "site";
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function formatRunTimestamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    artifactRoot: "artifacts",
    dryRun: false,
    limit: 30,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--artifact-root" && next) {
      args.artifactRoot = next;
      index += 1;
    } else if (arg === "--dry-run") {
      args.dryRun = true;
    } else if (arg === "--limit" && next) {
      args.limit = Number.parseInt(next, 10);
      index += 1;
    } else if (arg === "--out-dir" && next) {
      args.outDir = next;
      index += 1;
    } else if (arg === "--urls" && next) {
      args.urlsPath = next;
      index += 1;
    } else if (arg === "--help" || arg === "-h") {
      console.log([
        "Usage: node --import tsx scripts/run-consent-control-inventory-cohort.ts [options]",
        "",
        "Options:",
        "  --artifact-root <dir>  Local artifact root to search for CanonicalEvidenceBundle.json files. Default: artifacts",
        "  --urls <path>          Use an explicit URL list instead of latest local artifacts.",
        "  --limit <n>            Number of unique hosts to rerun. Default: 30",
        "  --out-dir <dir>        Output directory. Default: artifacts/consent-control-inventory-cohort/<timestamp>",
        "  --dry-run              Print selected URLs without scanning.",
      ].join("\n"));
      process.exit(0);
    }
  }
  if (!Number.isFinite(args.limit) || args.limit < 1) {
    throw new Error("--limit must be a positive integer.");
  }
  return args;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
