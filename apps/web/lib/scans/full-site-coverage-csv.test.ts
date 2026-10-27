import assert from "node:assert/strict";
import test from "node:test";
import { coverageCsvOutcome, renderFullSiteCoverageCsv, type CoverageCsvPage } from "./full-site-coverage-csv";

const page: CoverageCsvPage = {
  id: "page-1", target_url: "https://example.test/", final_url: "https://example.test/", source: "homepage",
  status: "completed", limitation: null, attempt_count: 1, has_capture: true, capture_status: "completed",
  http_status: "200", failure_kind: null, capture_limitations: [], started_at: "2026-10-25T12:00:00Z",
  completed_at: "2026-10-25T12:00:05Z", crawl_status: "completed", stop_reason: "max_pages",
};
const unvisited = { status: "excluded", attempt_count: 0, has_capture: false, capture_status: null, http_status: null, final_url: null };

test("capture outcomes distinguish completeness, website errors and worker errors without scoring claims", () => {
  assert.equal(coverageCsvOutcome(page).status, "Scanned — complete capture");
  assert.equal(coverageCsvOutcome({...page, status:"partial", capture_limitations:["observation_deadline"]}).status, "Scanned — partial capture");
  assert.match(coverageCsvOutcome({...page, status:"partial", capture_limitations:["observation_deadline"]}).reason, /time limit/);
  assert.equal(coverageCsvOutcome({...page, capture_limitations:["runtime_collection_limitation"]}).status, "Scanned — capture issue");
  assert.equal(coverageCsvOutcome({...page, has_capture:false}).status, "Scanned — results unavailable");
  for (const status of ["partial", "blocked", "failed"]) {
    const outcome = coverageCsvOutcome({...page, status, http_status:"403"});
    assert.match(outcome.reason, /HTTP 403/);
    assert.doesNotMatch(outcome.reason, /scor|deduct/);
  }
  for (const limitation of ["worker_lease_expired", "claim_deadline_expired", "dispatch_admission_timeout"]) {
    const outcome = coverageCsvOutcome({...page, status:"failed", http_status:null, limitation});
    assert.equal(outcome.status, "Scan failed");
    assert.match(outcome.reason, /deadline/);
    assert.doesNotMatch(outcome.reason, /HTTP/);
  }
  assert.equal(coverageCsvOutcome({...page, status:"future_status"}).status, "Unknown");
  assert.match(coverageCsvOutcome({...page, status:"partial", capture_limitations:["future_reason"]}).reason, /Recorded limitation: future_reason/);
});

test("unvisited pages retain distinct robots, scope, safety, limit and cancellation reasons", () => {
  const cases = [
    ["robots_disallowed", "robots.txt disallowed"],
    ["outside_validated_hostname_scope", "outside crawl scope"],
    ["non_page_download", "excluded URL"],
    ["action_or_authenticated_workflow", "excluded URL"],
    ["action_or_sensitive_query", "excluded URL"],
    ["malformed_path", "excluded URL"],
    ["crawl_trap_depth", "crawl safety limit"],
    ["query_variant_limit", "crawl safety limit"],
    ["section_trap_limit", "crawl safety limit"],
    ["max_pages_unvisited", "page limit reached"],
    ["wall_clock_limit", "crawl time limit"],
    ["user_cancelled", "cancelled"],
  ];
  for (const [limitation, category] of cases) {
    const outcome = coverageCsvOutcome({...page, ...unvisited, limitation:limitation!});
    assert.equal(outcome.status, `Not scanned — ${category}`);
    assert.ok(outcome.reason);
  }
  for (const [stop_reason, category] of [["robots_unavailable_or_blocked", "robots.txt not verified"], ["robots_delay_exceeds_crawl_budget", "robots.txt delay limit"], ["discovery_unavailable_or_blocked", "crawl stopped"]]) {
    const outcome = coverageCsvOutcome({...page, ...unvisited, status:"queued", crawl_status:"stopped", stop_reason:stop_reason!});
    assert.equal(outcome.status, `Not scanned — ${category}`);
    assert.doesNotMatch(outcome.status, /disallowed/);
  }
  assert.equal(coverageCsvOutcome({...page, ...unvisited, status:"queued"}).status, "Not scanned — page limit reached");
  assert.equal(coverageCsvOutcome({...page, status:"cancelled", limitation:"user_cancelled", crawl_status:"cancelled", stop_reason:"user_cancelled"}).status, "Not completed — cancelled");
});

test("pending and running pages never claim completion, including retries with a retained earlier capture", () => {
  for (const [status, label] of [["queued", "Queued"], ["dispatching", "Waiting for worker"], ["active", "Scanning"]]) {
    assert.equal(coverageCsvOutcome({...page, ...unvisited, status:status!, crawl_status:"running", stop_reason:null}).status, label);
  }
  const retry = coverageCsvOutcome({...page, status:"queued", crawl_status:"running", stop_reason:null, failure_kind:"rate_limit", http_status:"429"});
  assert.equal(retry.status, "Waiting for retry");
  assert.match(retry.reason, /HTTP 429/);
  assert.equal(coverageCsvOutcome({...page, status:"active", crawl_status:"cancelled", stop_reason:"user_cancelled"}).status, "Scanning");
});

test("CSV exports every retained page with UTF-8, safe cells, redacted URLs, UTC and no pagination", () => {
  const pages = Array.from({length:143}, (_, index) => ({...page, id:`page-${index}`, target_url:`https://example.test/page-${index}?email=private@example.test`}));
  pages[1] = {...pages[1]!, source:' \t=HYPERLINK("evil")', limitation:'reason, with "quotes"\nand newline'};
  pages[2] = {...pages[2]!, source:"sitemap:https://example.test/map.xml?token=secret", final_url:"https://user:password@example.test/redirect?session=secret"};
  const csv = renderFullSiteCoverageCsv("scan-1", pages, new Date("2026-10-25T13:00:00Z"));
  assert.ok(csv.startsWith('\uFEFF"Page URL","Coverage status","Issue / reason"'));
  assert.equal(csv.match(/"scan-1"/g)?.length, 143);
  assert.ok(csv.includes('"page-142"'));
  assert.ok(csv.includes('"\' \t=HYPERLINK(""evil"")"'));
  assert.ok(csv.includes('reason, with ""quotes""\nand newline'));
  assert.doesNotMatch(csv, /private@example|secret|password/);
  assert.ok(csv.includes("%5Bredacted%5D"));
  assert.ok(csv.includes("2026-10-25T12:00:00.000Z"));
  assert.equal(renderFullSiteCoverageCsv("scan-1", []).split("\r\n").length, 2);
});

test("CSV puts complete captures first, then actionable outcomes, with Final URL last", () => {
  const cases: Array<[string, Partial<CoverageCsvPage>]> = [
    ["outside", {...unvisited, limitation:"outside_validated_hostname_scope"}],
    ["safety", {...unvisited, limitation:"section_trap_limit"}],
    ["page-limit", {...unvisited, status:"cancelled", limitation:"max_pages_unvisited"}],
    ["robots", {...unvisited, limitation:"robots_disallowed"}],
    ["queued", {...unvisited, status:"queued", crawl_status:"running", stop_reason:null}],
    ["failed", {status:"failed", limitation:"claim_deadline_expired"}],
    ["partial", {status:"partial", capture_status:"partial"}],
    ["complete-first", {}],
    ["complete-second", {}],
    ["excluded", {...unvisited, limitation:"non_page_download"}],
    ["cancelled", {...unvisited, status:"cancelled", limitation:"user_cancelled", crawl_status:"cancelled", stop_reason:"user_cancelled"}],
  ];
  const pages = cases.map(([id, patch]) => ({...page, ...patch, id, target_url:`https://example.test/${id}`, final_url:`https://example.test/final-${id}`}));
  const originalOrder = pages.map(page => page.id);
  const lines = renderFullSiteCoverageCsv("scan-1", pages).trimEnd().split("\r\n");
  assert.ok(lines[0]!.endsWith(',"Final URL"'));
  const ids = lines.slice(1).map(line => line.match(/^"https:\/\/example.test\/([^"]+)"/)?.[1]);
  assert.deepEqual(ids, ["complete-first", "complete-second", "partial", "failed", "queued", "robots", "cancelled", "page-limit", "safety", "excluded", "outside"]);
  for (const [index, id] of ids.entries()) assert.ok(lines[index + 1]!.endsWith(`,"https://example.test/final-${id}"`));
  assert.deepEqual(pages.map(page => page.id), originalOrder);
});
