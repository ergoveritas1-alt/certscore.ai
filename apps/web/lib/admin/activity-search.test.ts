import assert from "node:assert/strict";
import test from "node:test";
import { normalizeAdminActivityFilter, parseAdminActivitySearch } from "./activity-search";

test("normalizes Any filter sentinels to no server-side filter", () => {
  assert.equal(normalizeAdminActivityFilter("any", ["any"]), null);
  assert.equal(normalizeAdminActivityFilter(" ANY ", ["any"]), null);
  assert.equal(normalizeAdminActivityFilter("all", ["all"]), null);
  assert.equal(normalizeAdminActivityFilter("fresh", ["any"]), "fresh");
});

test("parses an exact admin scan source and preserves the remaining search", () => {
  assert.deepEqual(
    parseAdminActivitySearch("source:homepage-anonymous example.com", { source: true }),
    {
      query: "example.com",
      requesterExclude: null,
      source: "homepage-anonymous"
    }
  );
});

test("does not consume source syntax on activity pages that have not enabled it", () => {
  assert.deepEqual(parseAdminActivitySearch("source:sdk"), {
    query: "source:sdk",
    requesterExclude: null,
    source: null
  });
});

test("combines exact source filtering with requester exclusion", () => {
  assert.deepEqual(
    parseAdminActivitySearch("source:homepage-anonymous requester!=test*", { source: true }),
    {
      query: null,
      requesterExclude: "test%",
      source: "homepage-anonymous"
    }
  );
});
