import assert from "node:assert/strict";
import test from "node:test";
import type { SnapshotBundle } from "../snapshot/types";
import { buildRuntimeArtifactRow, buildSnapshotInsert } from "./save-snapshot-bundle";

test("buildRuntimeArtifactRow maps compact runtime evidence for persistence", () => {
  const bundle = {
    snapshot: {
      scanId: "scan-1",
      organizationId: "org-1",
      domainId: "domain-1"
    },
    accessibilityRuleCounts: [],
    compatibilitySignals: [],
    pages: [],
    scanPlan: {
      profile: "balanced",
      prefetchTargetCount: 2,
      expansionTargetCount: 3,
      staticFetchConcurrency: 1,
      browserNavigationTimeoutMs: 12000,
      browserPostLoadWaitMs: 1000,
      blockStylesheetsInBrowser: true
    },
    trackerVendors: [],
    runtimeArtifacts: {
      scanId: "scan-1",
      thirdPartyRequestDomains: ["cdn.example.com", "tracker.example.net"],
      thirdPartyRequestCount: 4,
      initialCookieNames: ["_ga", "consent"],
      initialCookieDomains: [".example.com", ".tracker.example.net"],
      initialCookieCount: 2,
      scriptSrcDomains: ["cdn.example.com"],
      scriptTagCount: 3,
      responseHeaders: {
        "content-security-policy": "default-src 'self'",
        "strict-transport-security": "max-age=31536000"
      },
      domStructureHash: "hash-1",
      domNodeCount: 42
    }
  } as unknown as SnapshotBundle;

  assert.deepEqual(buildRuntimeArtifactRow(bundle), {
    scan_id: "scan-1",
    organization_id: "org-1",
    domain_id: "domain-1",
    third_party_request_domains: ["cdn.example.com", "tracker.example.net"],
    third_party_request_count: 4,
    initial_cookie_names: ["_ga", "consent"],
    initial_cookie_domains: [".example.com", ".tracker.example.net"],
    initial_cookie_count: 2,
    script_src_domains: ["cdn.example.com"],
    script_tag_count: 3,
    response_headers: {
      "content-security-policy": "default-src 'self'",
      "strict-transport-security": "max-age=31536000"
    },
    dom_structure_hash: "hash-1",
    dom_node_count: 42
  });
});

test("buildSnapshotInsert omits policy enrichment id until policy rows exist", () => {
  const bundle = {
    snapshot: {
      scanId: "scan-1",
      policyEnrichmentId: "policy-1"
    }
  } as unknown as SnapshotBundle;

  assert.deepEqual(buildSnapshotInsert(bundle, { omitPolicyEnrichmentId: true }), {
    scan_id: "scan-1",
    policy_enrichment_id: null
  });

  assert.deepEqual(buildSnapshotInsert(bundle), {
    scan_id: "scan-1",
    policy_enrichment_id: "policy-1"
  });
});
