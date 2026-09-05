import { apiRuntimeEvidenceGraphProjectionSchema, type ApiRuntimeEvidenceGraph } from "@certscore/api-contracts";

/** Synthetic development/test data only. Never persisted or used by a report adapter. */
export function runtimeGraphUiFixture() {
  const nodes: ApiRuntimeEvidenceGraph["nodes"] = [
    { id: "document", kind: "document", label: "https://fixture.test/", url: "https://fixture.test/", observedAtMs: 0 },
    { id: "widget", kind: "script", label: "Widget script", url: "https://widget.fixture.test/widget.js", observedAtMs: 20, classification: { vendor: "Google", product: "Widget script", purpose: "analytics", confidence: 1, basis: "canonical_registry", disclosure: "unknown", policyEvidenceRefs: [] } },
    { id: "request", kind: "request", label: "Measurement request", url: "https://metrics.fixture.test/collect", observedAtMs: 40, method: "GET" },
    { id: "response", kind: "response", label: "Measurement response", observedAtMs: 60, status: 200 },
    { id: "cookie", kind: "cookie", label: "fixture_id", observedAtMs: 60, operation: "http_set", outcome: "attempted", cookie: { name: "fixture_id", domain: "metrics.fixture.test", path: "/", hostOnly: true }, cookieAttributes: { secure: true, httpOnly: true, sameSite: "None" } },
    ...Array.from({ length: 45 }, (_, index) => ({ id: `storage-${index}`, kind: "storage" as const, label: `fixture_key_${index}`, observedAtMs: 100 + index, storageType: "localStorage" as const, operation: "snapshot" as const, captureBasis: "page_realm_snapshot" as const, outcome: "native_call_returned" as const, scopeMatchKey: index.toString(16).padStart(64, "0") })),
  ];
  const edges: ApiRuntimeEvidenceGraph["edges"] = [
    ...nodes.filter(node => node.kind === "storage").map(node => ({ id: `context-${node.id}`, from: "document", to: node.id, relation: "storage_operation" as const, basis: "browser_snapshot" as const, directness: "direct" as const })),
    { id: "e1", from: "document", to: "request", relation: "belongs_to_document", basis: "cdp", directness: "direct" },
    { id: "e2", from: "widget", to: "request", relation: "initiated_by", basis: "cdp", directness: "direct" },
    { id: "e3", from: "request", to: "response", relation: "response_to", basis: "cdp", directness: "direct" },
    { id: "e4", from: "response", to: "cookie", relation: "response_cookie_attempt", basis: "cdp", directness: "direct" },
  ];
  const graph: ApiRuntimeEvidenceGraph = { captureId: "ui-fixture:runtime_evidence", scenario: "pre_consent", sourceHash: "a".repeat(64), startedAt: "2026-09-04T00:00:00.000Z", completedAt: "2026-09-04T00:00:01.000Z", nodes, edges, stacks: [], coverage: { status: "partial", capabilities: [], reasons: ["synthetic_ui_fixture"], droppedNodes: 0, droppedEdges: 0, unresolvedRequests: 1, pendingTasks: 0 } };
  return apiRuntimeEvidenceGraphProjectionSchema.parse({
    contractVersion: "certscore.runtime-evidence-graph-projection.v1", scanId: "ui-fixture", status: "limited",
    sourceBundle: { sha256: "b".repeat(64), sizeBytes: 1, verified: true }, registryVersion: "synthetic-ui-fixture-only",
    graphs: [graph, { ...graph, captureId: "ui-fixture:accept_observation", scenario: "post_accept", action: { status: "confirmed", registeredAtMs: 50 } }, { ...graph, captureId: "ui-fixture:reject_observation", scenario: "post_reject", action: { status: "confirmed", registeredAtMs: 50 } }, { ...graph, captureId: "ui-fixture:gpc", scenario: "gpc" }],
    limitations: ["synthetic_ui_fixture"], findingOrScoreEffect: false,
  });
}
