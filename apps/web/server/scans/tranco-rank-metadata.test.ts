import assert from "node:assert/strict";
import test from "node:test";
import {
  buildTrancoRankLookupCandidates,
  withTrancoRankMetadata
} from "./tranco-rank-metadata";

test("buildTrancoRankLookupCandidates prefers exact host then registrable fallback", () => {
  const lookup = buildTrancoRankLookupCandidates({
    hostname: "www.example.co.uk",
    normalizedUrl: "https://www.example.co.uk/path"
  });

  assert.deepEqual(lookup, {
    candidates: ["www.example.co.uk", "example.co.uk"],
    lookupHostname: "www.example.co.uk",
    lookupRegistrableDomain: "example.co.uk"
  });
});

test("buildTrancoRankLookupCandidates can derive host from normalized URL", () => {
  const lookup = buildTrancoRankLookupCandidates({
    normalizedUrl: "https://news.example.com/privacy"
  });

  assert.deepEqual(lookup, {
    candidates: ["news.example.com", "example.com"],
    lookupHostname: "news.example.com",
    lookupRegistrableDomain: "example.com"
  });
});

test("withTrancoRankMetadata attaches bounded site metadata without replacing existing metadata", () => {
  const config = withTrancoRankMetadata(
    {
      maxPages: 1,
      processor: "test",
      profile: "homepage",
      siteMetadata: {
        other: true
      } as Record<string, unknown>,
      source: "test"
    },
    {
      lookupHostname: "www.example.com",
      lookupRegistrableDomain: "example.com",
      matchType: "registrable_domain",
      matchedHostname: "example.com",
      rank: 123,
      rankBand: "top_1k",
      source: "validation_targets",
      sourceUpdatedAt: "2026-07-08T00:00:00.000Z"
    }
  );

  assert.deepEqual(config.siteMetadata, {
    other: true,
    tranco: {
      lookupHostname: "www.example.com",
      lookupRegistrableDomain: "example.com",
      matchType: "registrable_domain",
      matchedHostname: "example.com",
      rank: 123,
      rankBand: "top_1k",
      source: "validation_targets",
      sourceUpdatedAt: "2026-07-08T00:00:00.000Z"
    }
  });
});
