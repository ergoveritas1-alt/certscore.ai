import assert from "node:assert/strict";
import test from "node:test";
import { buildCrossDomainIdentifierPrevalenceAudit } from "./cross-domain-identifier-prevalence-audit";

test("cross-domain identifier prevalence audit collapses scans with same persisted registered domain", () => {
  const audit = buildCrossDomainIdentifierPrevalenceAudit([
    {
      domain: "example.com",
      finalUrl: "https://www.example.com/",
      registeredDomain: "example.com",
      scanId: "scan-1",
      topFindingIds: ["cross_domain_identifier_sharing_observed"],
      trancoRank: 10
    },
    {
      domain: "www.example.com",
      finalUrl: "https://example.com/",
      registeredDomain: "example.com",
      scanId: "scan-2",
      topFindingIds: ["cross_domain_identifier_sharing_observed"],
      trancoRank: 11
    }
  ]);

  assert.equal(audit.rawPositiveScanCount, 2);
  assert.equal(audit.uniqueCanonicalReportingDomainCount, 1);
  assert.equal(audit.countChangedUnderStrictCanonicalGrouping, true);
  assert.equal(audit.canonicalReportingGroups[0]?.canonicalReportingDomain, "example.com");
});

test("cross-domain identifier prevalence audit does not collapse lexical siblings without canonical convergence", () => {
  const audit = buildCrossDomainIdentifierPrevalenceAudit([
    {
      domain: "huffpost.com",
      finalUrl: "https://www.huffpost.com/",
      registeredDomain: "huffpost.com",
      scanId: "scan-1",
      topFindingIds: ["cross_domain_identifier_sharing_observed"],
      trancoRank: 1034
    },
    {
      domain: "huffingtonpost.com",
      finalUrl: "https://huffingtonpost.com/",
      registeredDomain: "huffingtonpost.com",
      scanId: "scan-2",
      topFindingIds: ["cross_domain_identifier_sharing_observed"],
      trancoRank: 1132
    }
  ]);

  assert.equal(audit.rawPositiveScanCount, 2);
  assert.equal(audit.uniqueCanonicalReportingDomainCount, 2);
  assert.equal(audit.countChangedUnderStrictCanonicalGrouping, false);
  assert.deepEqual(audit.possibleSiblingCandidates, [
    {
      domains: ["huffingtonpost.com", "huffpost.com"],
      reason: "possible_sibling_not_deduped",
      dedupedInStrictCanonicalGrouping: false
    }
  ]);
});

test("cross-domain identifier prevalence audit falls back to final URL then manifest domain", () => {
  const audit = buildCrossDomainIdentifierPrevalenceAudit([
    {
      domain: "submitted.example",
      finalUrl: "https://www.final.example/",
      scanId: "scan-1",
      topFindingIds: ["cross_domain_identifier_sharing_observed"]
    },
    {
      domain: "fallback.example",
      scanId: "scan-2",
      topFindingIds: ["cross_domain_identifier_sharing_observed"]
    },
    {
      domain: "not-positive.example",
      registeredDomain: "not-positive.example",
      scanId: "scan-3",
      topFindingIds: []
    }
  ]);

  assert.equal(audit.rawPositiveScanCount, 2);
  assert.deepEqual(
    audit.canonicalReportingGroups.map((group) => group.canonicalReportingDomain).sort(),
    ["fallback.example", "final.example"]
  );
  assert.equal(audit.rawPositiveDomains.includes("not-positive.example"), false);
});
