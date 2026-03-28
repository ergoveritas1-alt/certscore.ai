import assert from "node:assert/strict";
import test from "node:test";
import { deriveScanStopReason } from "./scan-stop-reason";

test("classifies 403 challenge runs as access limited", () => {
  const result = deriveScanStopReason({
    challengeSuspected: true,
    homepageFetchHttpStatus: 403,
    homepageFetchStatus: "forbidden",
    pagesScanned: 0
  });

  assert.equal(result?.kind, "reachability_blocked_challenge_suspected");
  assert.equal(result?.outcomeTitle, "Access limited by site protections");
});

test("classifies robots restrictions separately", () => {
  const result = deriveScanStopReason({
    robotsAllowed: false,
    robotsFetchStatus: "ok"
  });

  assert.equal(result?.kind, "robots_restricted");
  assert.equal(result?.reason, "Reason: robots.txt disallowed scanner access to the homepage.");
});

test("classifies navigation timeouts separately from transport failure", () => {
  const result = deriveScanStopReason({
    homepageFetchStatus: "timeout",
    pagesScanned: 0
  });

  assert.equal(result?.kind, "timeout_navigation");
  assert.equal(result?.outcomeTitle, "Transport failure");
});
