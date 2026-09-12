import assert from "node:assert/strict";
import test from "node:test";
import { canAssessRetainedCrawl, isRobotsCrawlLimitation, wasPageNotScannedForRobots } from "./full-site-crawl-limitation";
import { scanFailureExplanation } from "./scan-failure-explanation";

for (const reason of ["robots_unavailable_or_blocked", "robots_delay_exceeds_crawl_budget"]) {
  test(`${reason} preserves eligibility for canonical retained assessment only after termination`, () => {
    const crawl = {status: "stopped", stop_reason: reason, completed_at: "2026-09-12T02:18:21Z"};
    assert.equal(canAssessRetainedCrawl(crawl), true);
    assert.equal(canAssessRetainedCrawl({...crawl, completed_at: null}), false);
    assert.equal(canAssessRetainedCrawl({...crawl, status: "running"}), false);
    assert.equal(wasPageNotScannedForRobots(crawl, {status: "queued", compact_json: null}), true);
    for (const status of ["completed", "partial", "active", "failed", "excluded"]) {
      assert.equal(wasPageNotScannedForRobots(crawl, {status, compact_json: null}), false);
    }
    assert.equal(wasPageNotScannedForRobots(crawl, {status: "queued", compact_json: {}}), false);
    const explanation = scanFailureExplanation(reason);
    assert.match(explanation.detail, /Captured page results are retained/);
    assert.match(explanation.detail, /additional pages were not scanned/);
    assert.doesNotMatch(explanation.detail, /could produce a completed report/);
  });
}

test("unrelated failures and unfinished scans do not become assessable", () => {
  for (const reason of [null, "homepage_baseline_unverifiable", "dispatch_queue_unavailable"]) {
    assert.equal(canAssessRetainedCrawl({status: "stopped", stop_reason: reason, completed_at: "2026-09-12"}), false);
  }
  assert.equal(canAssessRetainedCrawl({status: "completed", stop_reason: null, completed_at: "2026-09-12"}), true);
  assert.equal(isRobotsCrawlLimitation("completed", "robots_unavailable_or_blocked"), false);
});
