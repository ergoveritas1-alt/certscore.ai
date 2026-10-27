import { crawlDisplayUrl } from "@website-signal-risk-scanner/shared/full-site-urls";
import { unscannedCrawlPageLimitation } from "./full-site-crawl-limitation";

/** Page lifecycle metadata only: this export does not create findings or assess scores. */
export type CoverageCsvPage = {
  id: string;
  target_url: string;
  final_url: string | null;
  source: string;
  status: string;
  limitation: string | null;
  attempt_count: number;
  has_capture: boolean;
  capture_status: string | null;
  http_status: string | null;
  failure_kind: string | null;
  capture_limitations: unknown;
  started_at: Date | string | null;
  completed_at: Date | string | null;
  crawl_status: string;
  stop_reason: string | null;
};

const reasons: Record<string, string> = {
  robots_disallowed: "Disallowed by the retained robots.txt rules.",
  robots_disallowed_all: "robots.txt disallowed all eligible additional pages.",
  robots_unavailable_or_blocked: "robots.txt could not be verified; additional crawling stopped.",
  not_scanned_crawl_permission_unverified: "Permission for additional crawling could not be verified.",
  robots_delay_exceeds_crawl_budget: "The robots.txt crawl delay exceeded the allowed scan time.",
  not_scanned_discovery_unavailable: "Additional-page discovery was unavailable.",
  discovery_unavailable_or_blocked: "Additional-page discovery was unavailable or blocked.",
  sitemap_discovery_limited: "Sitemap discovery was limited; the crawl used the links it could discover.",
  sitemap_document_limit: "The sitemap document limit was reached.",
  discovered_url_limit: "The discovered-URL limit was reached.",
  all_discovered_eligible_targets_attempted: "All discovered eligible targets were attempted.",
  outside_validated_hostname_scope: "URL is outside the validated hostnames for this crawl.",
  non_page_download: "URL points to a download or non-page resource.",
  action_or_authenticated_workflow: "URL belongs to an action or sign-in workflow excluded from crawling.",
  action_or_sensitive_query: "URL contains an action or sensitive query parameter.",
  malformed_path: "URL path is malformed.",
  crawl_trap_depth: "URL exceeded the path-depth or query-parameter safety limit.",
  query_variant_limit: "The limit for query variants of this path was reached.",
  section_trap_limit: "The per-section crawl safety limit was reached.",
  max_pages_unvisited: "The scan's page limit was reached before this page completed.",
  max_pages: "The scan's page limit was reached.",
  max_pages_homepage_only: "The scan was limited to the starting page.",
  wall_clock_limit: "The crawl's total time limit was reached.",
  user_cancelled: "The crawl was cancelled by the user.",
  parent_cancelled_or_failed: "The parent scan was cancelled or failed.",
  authorization_revoked: "Permission to continue this crawl was revoked.",
  rate_limit: "The target site rate-limited the page request.",
  rate_limit_retry_budget: "The crawl stopped after reaching its rate-limit retry allowance.",
  challenge: "The page presented a bot or access challenge.",
  confirmed_bot_challenge: "The crawl stopped after a confirmed bot challenge.",
  repeated_http_blocking: "The crawl stopped after repeated HTTP access blocks.",
  http_error: "The page returned an HTTP error.",
  navigation_timeout: "Page navigation timed out.",
  collection_failure: "Page capture failed.",
  inventory_observation_failed: "The page inventory could not be captured.",
  observation_deadline: "Page capture reached its time limit.",
  runtime_collection_limitation: "Some runtime evidence could not be collected.",
  page_context_unavailable: "The page context was unavailable during capture.",
  homepage_baseline_coverage_limited: "The starting-page baseline capture was limited.",
  worker_lease_expired: "Worker result was not received before the deadline.",
  claim_deadline_expired: "Worker start was not acknowledged before the deadline.",
  dispatch_admission_timeout: "The page worker did not start before the deadline.",
  dispatch_queue_unavailable: "The queue for additional page workers was unavailable.",
  homepage_unavailable: "The starting-page capture was unavailable; additional crawling stopped.",
};

function timestamp(value: CoverageCsvPage["started_at"]) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : "";
}

export function coverageCsvOutcome(page: CoverageCsvPage) {
  const http = page.http_status == null ? null : Number(page.http_status);
  const httpStatus = http !== null && Number.isInteger(http) && http >= 100 && http <= 599 ? http : null;
  const retainedLimitations = Array.isArray(page.capture_limitations)
    ? page.capture_limitations.filter((value): value is string => typeof value === "string" && value.length > 0) : [];
  const terminal = ["completed", "cancelled", "stopped"].includes(page.crawl_status);
  const unvisited = ["queued", "dispatching", "cancelled", "excluded"].includes(page.status);
  const permissionLimitation = unscannedCrawlPageLimitation(
    { status: page.crawl_status, stop_reason: page.stop_reason },
    { status: page.status, limitation: page.limitation, compact_json: page.has_capture ? true : null },
  );
  const stopReason = terminal && unvisited && page.status !== "excluded" ? page.stop_reason : null;
  const codes = [...new Set([page.limitation, page.failure_kind, ...retainedLimitations, permissionLimitation, stopReason]
    .filter((value): value is string => Boolean(value)))];
  const details = codes.map(code => reasons[code] ?? `Recorded limitation: ${code}`);
  if (httpStatus !== null && httpStatus >= 400) details.unshift(`HTTP ${httpStatus}.`);
  let status: string;
  if (page.status === "completed" || page.status === "partial") {
    if (!page.has_capture) {
      status = "Scanned — results unavailable";
      details.unshift("The page is recorded as scanned, but its capture metadata is unavailable.");
    } else if (page.status === "partial" || page.capture_status === "partial") {
      status = "Scanned — partial capture";
      if (!details.length) details.push("Only part of the page capture was retained; no specific reason was recorded.");
    } else if (codes.length || (httpStatus !== null && httpStatus >= 400) || page.capture_status !== "completed") {
      status = "Scanned — capture issue";
      if (!details.length) details.push("Capture completion could not be confirmed from retained metadata.");
    } else {
      status = "Scanned — complete capture";
      details.push("Completed within the recorded capture scope; this is not a claim of compliance or exhaustive testing.");
    }
  } else if (page.status === "blocked" || page.status === "failed") {
    status = page.status === "blocked" ? "Scan blocked" : "Scan failed";
    if (!details.length) details.push("Capture unavailable; no specific failure reason was retained.");
  } else if (page.status === "active") {
    status = "Scanning";
    details.unshift("The page worker is still active; the outcome is not final.");
  } else if (!terminal && ["queued", "dispatching"].includes(page.status)) {
    status = page.status === "dispatching" ? "Waiting for worker" : page.attempt_count > 0 ? "Waiting for retry" : "Queued";
    details.unshift("Page processing is pending; the outcome is not final.");
  } else if (unvisited) {
    // An admitted attempt is not proof of a visit, and a cancelled retry may retain an earlier capture.
    const prefix = page.attempt_count > 0 || page.has_capture ? "Not completed" : "Not scanned";
    const has = (...values: string[]) => values.some(value => codes.includes(value));
    const category = has("robots_disallowed", "robots_disallowed_all") ? "robots.txt disallowed"
      : has("robots_delay_exceeds_crawl_budget") ? "robots.txt delay limit"
      : has("robots_unavailable_or_blocked", "not_scanned_crawl_permission_unverified") ? "robots.txt not verified"
      : has("outside_validated_hostname_scope") ? "outside crawl scope"
      : has("max_pages", "max_pages_unvisited", "max_pages_homepage_only") ? "page limit reached"
      : has("wall_clock_limit") ? "crawl time limit"
      : has("crawl_trap_depth", "query_variant_limit", "section_trap_limit") ? "crawl safety limit"
      : has("user_cancelled", "parent_cancelled_or_failed") || page.crawl_status === "cancelled" ? "cancelled"
      : page.status === "excluded" ? "excluded URL" : "crawl stopped";
    status = `${prefix} — ${category}`;
    if (page.has_capture) details.unshift("An earlier attempt retained capture metadata; this page did not finish successfully.");
    if (!details.length) details.push("No specific reason was retained.");
  } else {
    status = "Unknown";
    details.unshift("The recorded page status is not recognized.");
  }
  return { status, reason: details.join(" "), codes: codes.join("; "), httpStatus };
}

function csvCell(value: unknown) {
  const text = value == null ? "" : String(value);
  const safe = /^\s*[=+@-]/.test(text) || /^[\t\r\n]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

function coveragePriority(status: string) {
  if (status === "Scanned — complete capture") return 0;
  if (status.startsWith("Scanned —")) return 10;
  if (status === "Scan blocked" || status === "Scan failed") return 20;
  if (status === "Unknown") return 25;
  if (status.startsWith("Not completed —")) return 30;
  if (status === "Scanning" || status.startsWith("Waiting for") || status === "Queued") return 40;
  if (status.startsWith("Not scanned — robots.txt")) return 50;
  if (status === "Not scanned — page limit reached") return 70;
  if (status === "Not scanned — crawl safety limit") return 80;
  if (status === "Not scanned — excluded URL") return 90;
  if (status === "Not scanned — outside crawl scope") return 100;
  return 60; // Other crawl stops, time limits and cancellations precede routine exclusions.
}

export function renderFullSiteCoverageCsv(scanId: string, pages: CoverageCsvPage[], exportedAt = new Date()) {
  const rows: unknown[][] = [["Page URL", "Coverage status", "Issue / reason", "HTTP status", "Capture scope",
    "Attempts", "Discovery source", "Started at (UTC)", "Completed at (UTC)", "Recorded page status", "Reason codes",
    "Crawl status", "Crawl stop reason", "Page ID", "Scan ID", "Exported at (UTC)", "Final URL"]];
  // Stable sorting preserves discovery order within each priority and leaves caller data untouched.
  const sorted = pages.map(page => ({ page, outcome: coverageCsvOutcome(page) }))
    .sort((a, b) => coveragePriority(a.outcome.status) - coveragePriority(b.outcome.status));
  for (const { page, outcome } of sorted) {
    const source = page.source.startsWith("sitemap:") ? `sitemap:${crawlDisplayUrl(page.source.slice(8))}` : page.source;
    rows.push([crawlDisplayUrl(page.target_url), outcome.status, outcome.reason,
      outcome.httpStatus, page.source === "homepage" ? "Starting-page baseline" : "Additional-page resource inventory",
      page.attempt_count, source, timestamp(page.started_at), timestamp(page.completed_at), page.status, outcome.codes,
      page.crawl_status, page.stop_reason, page.id, scanId, exportedAt.toISOString(), page.final_url ? crawlDisplayUrl(page.final_url) : ""]);
  }
  // UTF-8 BOM preserves status labels in spreadsheet applications; quoted cells prevent formula execution.
  return "\uFEFF" + rows.map(row => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
