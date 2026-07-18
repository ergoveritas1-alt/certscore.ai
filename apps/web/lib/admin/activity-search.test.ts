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
      exclusions: { domain: [], email: [], ip: [], requester: [], scanId: [], source: [] },
      query: "example.com",
      source: "homepage-anonymous"
    }
  );
});

test("does not consume source syntax on activity pages that have not enabled it", () => {
  assert.deepEqual(parseAdminActivitySearch("source:sdk"), {
    exclusions: { domain: [], email: [], ip: [], requester: [], scanId: [], source: [] },
    query: "source:sdk",
    source: null
  });
});

test("combines exact source filtering with requester exclusion", () => {
  assert.deepEqual(
    parseAdminActivitySearch("source:homepage-anonymous requester!=test*", { source: true }),
    {
      exclusions: { domain: [], email: [], ip: [], requester: ["test%"], scanId: [], source: [] },
      query: null,
      source: "homepage-anonymous"
    }
  );
});

test("parses field exclusions with whitespace, wildcards, and a remaining search", () => {
  assert.deepEqual(
    parseAdminActivitySearch('example.com ip != 66.* email!="robot*@example.com" scan_id!=abc*'),
    {
      exclusions: {
        domain: [],
        email: ["robot%@example.com"],
        ip: ["66.%"],
        requester: [],
        scanId: ["abc%"],
        source: []
      },
      query: "example.com",
      source: null
    }
  );
});

test("supports multiple exclusions and only enables source exclusion for scan admin", () => {
  assert.deepEqual(
    parseAdminActivitySearch("ip!=66.* ip!=192.0.2.* domain!=internal.* source!=sdk", { source: true }),
    {
      exclusions: {
        domain: ["internal.%"],
        email: [],
        ip: ["66.%", "192.0.2.%"],
        requester: [],
        scanId: [],
        source: ["%sdk%"]
      },
      query: null,
      source: null
    }
  );
  assert.equal(parseAdminActivitySearch("source!=sdk").query, "source!=sdk");
});
