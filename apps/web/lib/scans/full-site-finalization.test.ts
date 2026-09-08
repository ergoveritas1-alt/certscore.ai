import assert from "node:assert/strict";
import test from "node:test";
import { fullSiteFinalizationStartedAt, fullSiteFinalizationDelayed } from "./full-site-finalization";
const crawl = { status: "running", discovery_complete: true, requested_json: { maxPages: 2 }, started_at: "2026-09-08T22:25:00Z" };
const pages = [
  { status: "completed", scheduled: true, completed_at: "2026-09-08T22:25:20Z" },
  { status: "failed", scheduled: true, completed_at: "2026-09-08T22:26:00Z" },
  { status: "queued", scheduled: false, completed_at: null },
];
test("finalization delay uses persisted terminal page time, including failures and exhausted page budgets", () => {
  const start = fullSiteFinalizationStartedAt(crawl, pages);
  assert.equal(start, "2026-09-08T22:26:00.000Z");
  assert.equal(fullSiteFinalizationDelayed(start, Date.parse("2026-09-08T22:26:59Z")), false);
  assert.equal(fullSiteFinalizationDelayed(start, Date.parse("2026-09-08T22:27:00Z")), true);
  assert.equal(fullSiteFinalizationDelayed(null, Date.now()), false);
});
test("discovery, pacing, dispatch and active work are not finalization stalls", () => {
  assert.equal(fullSiteFinalizationStartedAt({ ...crawl, discovery_complete: false }, pages), null);
  assert.equal(fullSiteFinalizationStartedAt({ ...crawl, requested_json: { maxPages: 3 } }, pages), null);
  for (const status of ["active", "dispatching", "queued"]) {
    assert.equal(fullSiteFinalizationStartedAt(crawl, [{ ...pages[0]!, status }]), null);
  }
  for (const status of ["completed", "cancelled", "stopped", "waiting_homepage"]) {
    assert.equal(fullSiteFinalizationStartedAt({ ...crawl, status }, pages), null);
  }
  assert.ok(fullSiteFinalizationStartedAt({ ...crawl, requested_json: { maxPages: 10 } }, pages.slice(0, 2)), "Exhausted discovery can finalize below the page limit");
});
