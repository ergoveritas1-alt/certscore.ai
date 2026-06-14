import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import {
  canonicalEvidenceBundleSchema,
  reviewResultSchema,
  type CanonicalEvidenceBundle,
  type NetworkEvent,
  type ReviewResult,
} from "@certscore/contracts";
import { reviewEvidenceBundle } from "@certscore/review-engine";
import {
  projectReviewResultToV2ReportDraft,
  type V2ReportProjectionDraft,
} from "../index";
import {
  ALLOWED_PROJECTION_STATUSES,
  projectionSanitizationWarnings,
} from "./sanitization";

type ShadowArgs = {
  calibrationPath?: string;
  outPath?: string;
};

type EndpointGroupKind =
  | "known_adtech_support_endpoint"
  | "known_performance_security_endpoint"
  | "site_owned_infrastructure"
  | "unresolved_collection_like_endpoint"
  | "ignored_noise";

type SiteShadowSummary = {
  siteKey: string;
  url: string;
  projectionPath: string;
  rowsByStatus: Record<string, number>;
  reviewSignalCount: number;
  observedCount: number;
  limitationOrNotTestableCount: number;
  rowsWithCappedExcerpts: number;
  rowsMissingEvidenceExcerpts: number;
  disallowedStatusesCount: number;
  sanitizationWarnings: string[];
  topRowKeys: string[];
  moduleStatuses: Array<{
    moduleName: string;
    status: string;
    errorCount: number;
  }>;
  endpointGroups: Record<EndpointGroupKind, number>;
  preferenceCenterTraversal: PreferenceCenterTraversalSummary;
};

type ShadowProjectionSummary = {
  generatedAt: string;
  calibrationPath: string;
  outPath: string;
  siteCount: number;
  rowsByStatus: Record<string, number>;
  reviewSignalCount: number;
  observedCount: number;
  limitationOrNotTestableCount: number;
  rowsWithCappedExcerpts: number;
  rowsMissingEvidenceExcerpts: number;
  disallowedStatusesCount: number;
  sanitizationWarningCounts: Record<string, number>;
  topRowKeysByFrequency: Array<{ findingKey: string; count: number }>;
  moduleStatusCounts: Record<string, number>;
  endpointGroups: Record<EndpointGroupKind, number>;
  preferenceCenterTraversal: PreferenceCenterTraversalSummary;
  sites: SiteShadowSummary[];
  notes: string[];
};

type PreferenceCenterTraversalSummary = {
  traversals: number;
  opened: number;
  secondLayerObserved: number;
  rejectAttempted: number;
  rejectSucceeded: number;
  saveAttempted: number;
  saveSucceeded: number;
  limitations: Record<string, number>;
};

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.calibrationPath || !args.outPath) {
    throw new Error("Usage: pnpm v2:shadow-project --calibration <calibration-artifacts-dir> --out <shadow-projection-dir>");
  }

  const siteDirs = await listSiteDirs(args.calibrationPath);
  const siteSummaries: SiteShadowSummary[] = [];
  await mkdir(args.outPath, { recursive: true });

  for (const siteDir of siteDirs) {
    const bundlePath = join(args.calibrationPath, siteDir, "CanonicalEvidenceBundle.json");
    const reviewPath = join(args.calibrationPath, siteDir, "ReviewResult.json");
    const bundle = await readBundle(bundlePath);
    const review = await readReviewIfPresent(reviewPath) ?? await reviewEvidenceBundle(bundle);
    const projection = projectReviewResultToV2ReportDraft({ review, bundle });
    const outputDir = join(args.outPath, siteDir);
    const projectionPath = join(outputDir, "V2ReportProjectionDraft.json");
    await mkdir(outputDir, { recursive: true });
    await writeFile(projectionPath, `${JSON.stringify(projection, null, 2)}\n`, "utf8");

    siteSummaries.push(summarizeSite(siteDir, projectionPath, bundle, projection));
  }

  const summary = aggregateSummary(args.calibrationPath, args.outPath, siteSummaries);
  await writeFile(
    join(args.outPath, "shadow-projection-summary.json"),
    `${JSON.stringify(summary, null, 2)}\n`,
    "utf8",
  );
  await writeFile(
    join(args.outPath, "shadow-projection-summary.md"),
    renderMarkdownSummary(summary),
    "utf8",
  );
  console.log(`Wrote ${join(args.outPath, "shadow-projection-summary.json")}`);
  console.log(`Wrote ${join(args.outPath, "shadow-projection-summary.md")}`);
}

function parseArgs(argv: string[]): ShadowArgs {
  const args: ShadowArgs = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--calibration") {
      args.calibrationPath = requiredValue(argv, ++index, arg);
    } else if (arg === "--out") {
      args.outPath = requiredValue(argv, ++index, arg);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

function requiredValue(argv: string[], index: number, flag: string) {
  const value = argv[index];
  if (!value) {
    throw new Error(`Missing value for ${flag}.`);
  }
  return value;
}

async function listSiteDirs(calibrationPath: string) {
  const entries = await readdir(calibrationPath, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

async function readBundle(path: string): Promise<CanonicalEvidenceBundle> {
  return canonicalEvidenceBundleSchema.parse(JSON.parse(await readFile(path, "utf8")));
}

async function readReviewIfPresent(path: string): Promise<ReviewResult | undefined> {
  try {
    return reviewResultSchema.parse(JSON.parse(await readFile(path, "utf8")));
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

function summarizeSite(
  siteKey: string,
  projectionPath: string,
  bundle: CanonicalEvidenceBundle,
  projection: V2ReportProjectionDraft,
): SiteShadowSummary {
  const rowsByStatus = countBy(projection.rows.map((row) => row.status));
  const sanitizationWarnings = projectionSanitizationWarnings(projection);
  const disallowedStatusesCount = projection.rows.filter((row) =>
    !ALLOWED_PROJECTION_STATUSES.has(row.status),
  ).length;

  return {
    siteKey,
    url: projection.url,
    projectionPath,
    rowsByStatus,
    reviewSignalCount: rowsByStatus.review_signal ?? 0,
    observedCount: rowsByStatus.observed ?? 0,
    limitationOrNotTestableCount:
      (rowsByStatus.coverage_limitation ?? 0) + (rowsByStatus.not_testable ?? 0),
    rowsWithCappedExcerpts: projection.rows.filter((row) =>
      row.evidencePacket.displaySafeExcerptStats.capped,
    ).length,
    rowsMissingEvidenceExcerpts: projection.rows.filter((row) =>
      row.evidenceExcerptIds.length > 0 &&
      row.evidencePacket.displaySafeExcerpts.length === 0,
    ).length,
    disallowedStatusesCount,
    sanitizationWarnings,
    topRowKeys: projection.rows.map((row) => row.findingKey),
    moduleStatuses: bundle.modulesRun.map((moduleRun) => ({
      moduleName: moduleRun.moduleName,
      status: moduleRun.status,
      errorCount: moduleRun.errors.length,
    })),
    endpointGroups: endpointGroupsForBundle(bundle),
    preferenceCenterTraversal: preferenceCenterTraversalSummary(bundle),
  };
}

function aggregateSummary(
  calibrationPath: string,
  outPath: string,
  sites: SiteShadowSummary[],
): ShadowProjectionSummary {
  const rowsByStatus: Record<string, number> = {};
  const sanitizationWarningCounts: Record<string, number> = {};
  const moduleStatusCounts: Record<string, number> = {};
  const endpointGroups = emptyEndpointGroups();
  const preferenceCenterTraversal = emptyPreferenceCenterTraversalSummary();
  const rowKeyCounts: Record<string, number> = {};

  for (const site of sites) {
    addCounts(rowsByStatus, site.rowsByStatus);
    for (const warning of site.sanitizationWarnings) {
      sanitizationWarningCounts[warning] = (sanitizationWarningCounts[warning] ?? 0) + 1;
    }
    for (const moduleRun of site.moduleStatuses) {
      const key = `${moduleRun.moduleName}:${moduleRun.status}`;
      moduleStatusCounts[key] = (moduleStatusCounts[key] ?? 0) + 1;
    }
    addEndpointGroups(endpointGroups, site.endpointGroups);
    addPreferenceCenterTraversal(preferenceCenterTraversal, site.preferenceCenterTraversal);
    for (const key of site.topRowKeys) {
      rowKeyCounts[key] = (rowKeyCounts[key] ?? 0) + 1;
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    calibrationPath,
    outPath,
    siteCount: sites.length,
    rowsByStatus,
    reviewSignalCount: rowsByStatus.review_signal ?? 0,
    observedCount: rowsByStatus.observed ?? 0,
    limitationOrNotTestableCount:
      (rowsByStatus.coverage_limitation ?? 0) + (rowsByStatus.not_testable ?? 0),
    rowsWithCappedExcerpts: sites.reduce((sum, site) => sum + site.rowsWithCappedExcerpts, 0),
    rowsMissingEvidenceExcerpts: sites.reduce((sum, site) => sum + site.rowsMissingEvidenceExcerpts, 0),
    disallowedStatusesCount: sites.reduce((sum, site) => sum + site.disallowedStatusesCount, 0),
    sanitizationWarningCounts,
    topRowKeysByFrequency: Object.entries(rowKeyCounts)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 15)
      .map(([findingKey, count]) => ({ findingKey, count })),
    moduleStatusCounts,
    endpointGroups,
    preferenceCenterTraversal,
    sites,
    notes: [
      "Internal shadow projection only. Not wired to production report UI.",
      "Projection summaries preserve review signals and limitations and must not be treated as legal conclusions.",
      "Sanitization warnings are conservative diagnostics for internal readiness review.",
    ],
  };
}

function preferenceCenterTraversalSummary(bundle: CanonicalEvidenceBundle): PreferenceCenterTraversalSummary {
  const summary = emptyPreferenceCenterTraversalSummary();
  for (const attempt of bundle.consentActionAttempts) {
    const traversal = attempt.preferenceCenterTraversal;
    if (!traversal) {
      continue;
    }
    summary.traversals += 1;
    if (traversal.openSucceeded) {
      summary.opened += 1;
    }
    if (traversal.secondLayerObserved) {
      summary.secondLayerObserved += 1;
    }
    if (traversal.attemptedRejectViaPreferenceCenter) {
      summary.rejectAttempted += 1;
    }
    if (traversal.attemptedRejectViaPreferenceCenter && traversal.succeeded) {
      summary.rejectSucceeded += 1;
    }
    if (traversal.attemptedSaveChoices) {
      summary.saveAttempted += 1;
    }
    if (traversal.attemptedSaveChoices && traversal.succeeded) {
      summary.saveSucceeded += 1;
    }
    if (traversal.failureReason) {
      summary.limitations[traversal.failureReason] = (summary.limitations[traversal.failureReason] ?? 0) + 1;
    }
  }
  return summary;
}

function endpointGroupsForBundle(bundle: CanonicalEvidenceBundle) {
  const groups = emptyEndpointGroups();
  for (const event of bundle.networkEvents) {
    const kind = endpointGroupForNetworkEvent(event);
    if (kind) {
      groups[kind] += 1;
    }
  }
  return groups;
}

function endpointGroupForNetworkEvent(event: NetworkEvent): EndpointGroupKind | undefined {
  if (event.attributionStatus === "ignored_noise") {
    return "ignored_noise";
  }
  if (event.attributionStatus === "site_owned_infrastructure") {
    return "site_owned_infrastructure";
  }
  if (event.endpointSubtype === "google_consent_or_tag_support" || event.endpointSubtype === "google_owned_infrastructure") {
    return "known_adtech_support_endpoint";
  }
  if (event.endpointSubtype === "google_recaptcha_or_security") {
    return "known_performance_security_endpoint";
  }
  if (
    event.requestHostname?.includes("nr-data.net") ||
    event.requestHostname?.includes("newrelic.com") ||
    event.requestHostname?.includes("go-mpulse.net") ||
    event.requestHostname?.includes("px-cloud.net") ||
    event.requestHostname?.includes("forter.com") ||
    event.requestHostname?.includes("live-chat.sprinklr.com") ||
    event.requestHostname?.includes("adtrafficquality.google")
  ) {
    return "known_performance_security_endpoint";
  }
  if (
    event.requestHostname?.includes("pagead") ||
    event.requestHostname?.includes("googlesyndication.com") ||
    event.requestHostname?.includes("amazon-adsystem.com") ||
    event.requestHostname?.includes("paa-reporting-advertising.amazon") ||
    event.requestHostname?.includes("publishers.advertising.a2z.com") ||
    event.requestHostname?.includes("doubleverify.com") ||
    event.requestHostname?.includes("adsrvr.org") ||
    event.requestHostname?.includes("criteo.com") ||
    event.requestHostname?.includes("demdex.net") ||
    event.requestHostname?.includes("pinterest.com") ||
    event.requestHostname?.includes("tiktok.com") ||
    event.requestHostname?.includes("rubiconproject.com") ||
    event.requestHostname?.includes("crwdcntrl.net") ||
    event.requestHostname?.includes("openx.net") ||
    event.requestHostname?.includes("reddit.com") ||
    event.requestHostname?.includes("tapad.com") ||
    event.requestHostname?.includes("singular.net") ||
    event.requestHostname?.includes("rlcdn.com") ||
    event.requestHostname?.includes("casalemedia.com") ||
    event.requestHostname?.includes("pubmatic.com") ||
    event.requestHostname?.includes("taboola.com") ||
    event.requestHostname?.includes("adsafeprotected.com") ||
    event.requestHostname?.includes("agkn.com") ||
    event.requestHostname?.includes("revjet.com") ||
    event.requestHostname?.includes("spotify.com") ||
    event.requestHostname?.includes("brightline.tv") ||
    event.requestHostname?.includes("fullstory.com") ||
    event.requestHostname?.includes("digital-cloud.medallia.com") ||
    event.requestHostname?.includes("ads.linkedin.com") ||
    event.requestHostname?.includes("quantserve.com") ||
    event.requestHostname?.includes("attentivemobile.com")
  ) {
    return "known_adtech_support_endpoint";
  }
  if (event.collectionEndpointObserved || event.attributionStatus === "unresolved_meaningful") {
    return "unresolved_collection_like_endpoint";
  }
  return undefined;
}

function emptyEndpointGroups(): Record<EndpointGroupKind, number> {
  return {
    known_adtech_support_endpoint: 0,
    known_performance_security_endpoint: 0,
    site_owned_infrastructure: 0,
    unresolved_collection_like_endpoint: 0,
    ignored_noise: 0,
  };
}

function addEndpointGroups(
  target: Record<EndpointGroupKind, number>,
  source: Record<EndpointGroupKind, number>,
) {
  for (const key of Object.keys(target) as EndpointGroupKind[]) {
    target[key] += source[key];
  }
}

function emptyPreferenceCenterTraversalSummary(): PreferenceCenterTraversalSummary {
  return {
    traversals: 0,
    opened: 0,
    secondLayerObserved: 0,
    rejectAttempted: 0,
    rejectSucceeded: 0,
    saveAttempted: 0,
    saveSucceeded: 0,
    limitations: {},
  };
}

function addPreferenceCenterTraversal(
  target: PreferenceCenterTraversalSummary,
  source: PreferenceCenterTraversalSummary,
) {
  target.traversals += source.traversals;
  target.opened += source.opened;
  target.secondLayerObserved += source.secondLayerObserved;
  target.rejectAttempted += source.rejectAttempted;
  target.rejectSucceeded += source.rejectSucceeded;
  target.saveAttempted += source.saveAttempted;
  target.saveSucceeded += source.saveSucceeded;
  addCounts(target.limitations, source.limitations);
}

function countBy(values: string[]) {
  const counts: Record<string, number> = {};
  for (const value of values) {
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return counts;
}

function addCounts(target: Record<string, number>, source: Record<string, number>) {
  for (const [key, value] of Object.entries(source)) {
    target[key] = (target[key] ?? 0) + value;
  }
}

function renderMarkdownSummary(summary: ShadowProjectionSummary) {
  const lines = [
    "# CertScore v2 Shadow Projection Summary",
    "",
    `Generated: ${summary.generatedAt}`,
    `Calibration: ${summary.calibrationPath}`,
    `Output: ${summary.outPath}`,
    `Sites: ${summary.siteCount}`,
    "",
    "This is internal diagnostic output only. It is not customer-facing report prose and does not state legal conclusions.",
    "",
    "## Aggregate",
    "",
    `Rows by status: ${formatRecord(summary.rowsByStatus)}`,
    `Review signals: ${summary.reviewSignalCount}`,
    `Observed rows: ${summary.observedCount}`,
    `Coverage limitation / not-testable rows: ${summary.limitationOrNotTestableCount}`,
    `Rows with capped excerpts: ${summary.rowsWithCappedExcerpts}`,
    `Rows missing projected excerpts despite evidence ids: ${summary.rowsMissingEvidenceExcerpts}`,
    `Disallowed statuses: ${summary.disallowedStatusesCount}`,
    `Sanitization warnings: ${formatRecord(summary.sanitizationWarningCounts) || "none"}`,
    `Endpoint groups: ${formatRecord(summary.endpointGroups)}`,
    `Preference-center traversal: ${formatPreferenceCenterTraversal(summary.preferenceCenterTraversal)}`,
    `Module statuses: ${formatRecord(summary.moduleStatusCounts)}`,
    "",
    "## Top Row Keys",
    "",
    ...summary.topRowKeysByFrequency.map((row) => `- ${row.findingKey}: ${row.count}`),
    "",
    "## Sites",
    "",
  ];
  for (const site of summary.sites) {
    lines.push(
      `### ${site.url}`,
      "",
      `Projection: ${site.projectionPath}`,
      `Rows by status: ${formatRecord(site.rowsByStatus)}`,
      `Capped rows: ${site.rowsWithCappedExcerpts}`,
      `Rows missing projected excerpts: ${site.rowsMissingEvidenceExcerpts}`,
      `Sanitization warnings: ${site.sanitizationWarnings.join("|") || "none"}`,
      `Endpoint groups: ${formatRecord(site.endpointGroups)}`,
      `Preference-center traversal: ${formatPreferenceCenterTraversal(site.preferenceCenterTraversal)}`,
      `Modules: ${site.moduleStatuses.map((moduleRun) => `${moduleRun.moduleName}:${moduleRun.status}`).join("; ")}`,
      "",
    );
  }
  return `${lines.join("\n")}\n`;
}

function formatPreferenceCenterTraversal(summary: PreferenceCenterTraversalSummary) {
  return `total=${summary.traversals}, opened=${summary.opened}, second_layer=${summary.secondLayerObserved}, reject_attempted=${summary.rejectAttempted}, reject_succeeded=${summary.rejectSucceeded}, save_attempted=${summary.saveAttempted}, save_succeeded=${summary.saveSucceeded}, limitations=${formatRecord(summary.limitations) || "none"}`;
}

function formatRecord(record: Record<string, number>) {
  return Object.entries(record)
    .filter(([, value]) => value !== 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([key, value]) => `${key}=${value}`)
    .join(", ");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
