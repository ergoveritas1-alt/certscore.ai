/** Crawl permission failures limit coverage; they do not invalidate captured evidence. */
export function isRobotsCrawlLimitation(status: string | undefined, reason: string | null | undefined) {
  return status === "stopped" && [
    "robots_unavailable_or_blocked",
    "robots_delay_exceeds_crawl_budget",
  ].includes(reason ?? "");
}

export function canAssessRetainedCrawl(crawl: { status: string; stop_reason: string | null; completed_at: unknown }) {
  return Boolean(crawl.completed_at) && (crawl.status === "completed" || isRobotsCrawlLimitation(crawl.status, crawl.stop_reason));
}

export function wasPageNotScannedForRobots(crawl: { status: string; stop_reason: string | null }, page: { status: string; compact_json: unknown }) {
  return isRobotsCrawlLimitation(crawl.status, crawl.stop_reason) && page.status === "queued" && !page.compact_json;
}
