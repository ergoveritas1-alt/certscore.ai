// Operational status only. This does not change evidence, findings, or scores.
export function fullSiteFinalizationStartedAt(
  crawl: { status: string; discovery_complete: boolean; requested_json: { maxPages: number }; started_at: Date | string },
  pages: Array<{ status: string; scheduled: boolean; completed_at: Date | string | null }>,
): string | null {
  if (crawl.status !== "running" || !crawl.discovery_complete ||
      pages.some(page => ["active", "dispatching"].includes(page.status) || (page.scheduled && page.status === "queued"))) return null;
  if (pages.some(page => page.status === "queued") && pages.filter(page => page.scheduled).length < crawl.requested_json.maxPages) return null;
  const timestamps = [new Date(crawl.started_at).getTime(), ...pages.filter(page => page.scheduled && page.completed_at).map(page => new Date(page.completed_at!).getTime())];
  if (timestamps.some(value => !Number.isFinite(value))) return null;
  return new Date(Math.max(...timestamps)).toISOString();
}

export function fullSiteFinalizationDelayed(startedAt: string | null | undefined, now: number | null) {
  return Boolean(startedAt && now !== null && now - Date.parse(startedAt) >= 60_000);
}
