import assert from "node:assert/strict";
import test from "node:test";
import { describeFullSitePageFailure } from "./full-site-page-failure";

test("failed pages explain the retained main-document status without changing the outcome", () => {
  const page = { status: "failed", httpStatus: 500 };
  assert.equal(describeFullSitePageFailure(page), "HTTP 500");
  assert.equal(page.status, "failed");
  assert.equal(describeFullSitePageFailure({ status: "blocked", httpStatus: 429 }), "HTTP 429");
  assert.equal(describeFullSitePageFailure({ status: "failed", httpStatus: 404 }), "HTTP 404");
  assert.equal(describeFullSitePageFailure({ status: "failed", httpStatus: 200 }), "Capture could not be assessed (HTTP 200)");
  assert.equal(describeFullSitePageFailure({ status: "failed", httpStatus: null }), "Capture unavailable; HTTP status not retained");
  assert.equal(describeFullSitePageFailure({ status: "partial", httpStatus: 500 }), "HTTP 500 · partial inventory retained; excluded from scoring");
  assert.equal(describeFullSitePageFailure({ status: "partial", httpStatus: 200 }), "Partial capture; coverage limited");
  for (const status of ["completed", "cancelled", "queued"])
    assert.equal(describeFullSitePageFailure({ status, httpStatus: 500 }), null);
});
