/** Public documentation only; runtime validation remains the strict graph projection schema. */
const id = { type: "string", minLength: 1, maxLength: 160 } as const;
const hash = { type: "string", pattern: "^[a-f0-9]{64}$" } as const;
const text = { type: "string", maxLength: 240 } as const;
const number = { type: "number", minimum: 0 } as const;
const integer = { type: "integer", minimum: 0 } as const;
const boolean = { type: "boolean" } as const;
const url = { type: "string", maxLength: 600, description: "Sanitized HTTP(S) URL; no credentials, query, fragment or sensitive identifier path segments." } as const;
const boundedStrings = (maxItems: number, maxLength: number) => ({ type: "array", maxItems, items: { type: "string", maxLength } });
export const runtimeEvidenceGraphOpenApiSchemas = {
  RuntimeEvidenceGraphProjection: {
    type: "object", additionalProperties: false,
    description: "Verified, bounded inventory evidence only. Missing relationships are unknown; no finding or score effect. Existing scan authorization and read-rate policy apply. Historical or disabled captures may be unavailable.",
    required: ["contractVersion", "scanId", "status", "registryVersion", "graphs", "limitations", "findingOrScoreEffect"],
    properties: {
      contractVersion: { type: "string", const: "certscore.runtime-evidence-graph-projection.v1" }, scanId: id,
      status: { type: "string", enum: ["available", "limited", "unavailable"] },
      sourceBundle: { type: "object", additionalProperties: false, required: ["sha256", "sizeBytes", "verified"], properties: { sha256: hash, sizeBytes: { type: "integer", minimum: 1 }, verified: { type: "boolean", const: true } } },
      registryVersion: { type: "string", maxLength: 600 }, graphs: { type: "array", maxItems: 4, items: { $ref: "#/components/schemas/RuntimeEvidenceGraph" } },
      details: { type: "object", additionalProperties: false, description: "Report-only deferred relationship details; loaded through the protected scan endpoint, not a public S3 URL.", required: ["href", "sha256", "scenarioCount", "nodeCount", "edgeCount"], properties: { href: { type: "string", pattern: "^/api/scans/[a-f0-9-]{36}/runtime-evidence-graph$" }, sha256: hash, scenarioCount: { type: "integer", minimum: 1, maximum: 4 }, nodeCount: { ...integer, maximum: 4000 }, edgeCount: { ...integer, maximum: 8000 } } },
      limitations: boundedStrings(16, 120), findingOrScoreEffect: { type: "boolean", const: false },
    },
  },
  RuntimeEvidenceGraph: {
    type: "object", additionalProperties: false, required: ["captureId", "scenario", "sourceHash", "startedAt", "completedAt", "nodes", "edges", "stacks", "coverage"],
    properties: {
      captureId: id, scenario: { type: "string", enum: ["pre_consent", "gpc", "post_accept", "post_reject"] }, sourceHash: hash,
      startedAt: { type: "string", format: "date-time" }, completedAt: { type: "string", format: "date-time" },
      action: { type: "object", additionalProperties: false, required: ["status"], properties: { status: { type: "string", enum: ["unconfirmed", "confirmed"] }, registeredAtMs: number } },
      nodes: { type: "array", maxItems: 1000, items: { $ref: "#/components/schemas/RuntimeEvidenceGraphNode" } },
      edges: { type: "array", maxItems: 2000, items: { type: "object", additionalProperties: false, required: ["id", "from", "to", "relation", "basis", "directness"], properties: {
        id, from: id, to: id,
        relation: { type: "string", enum: ["belongs_to_document", "belongs_to_frame", "frame_parent", "worker_request", "initiated_by", "parser_loaded", "async_ancestor", "response_to", "redirected_from", "response_cookie_attempt", "script_cookie_attempt", "cookie_included", "cookie_blocked", "snapshot_confirms", "storage_operation", "script_storage_operation", "handled_by_service_worker", "loaded_resource"] },
        basis: { type: "string", enum: ["cdp", "browser_snapshot", "instrumented_call", "unique_scope_time_match"] }, directness: { type: "string", enum: ["direct", "inferred"] },
      } } },
      stacks: { type: "array", maxItems: 128, items: { type: "object", additionalProperties: false, required: ["id", "frames", "truncated"], properties: { id, truncated: boolean, frames: { type: "array", maxItems: 12, items: { type: "object", additionalProperties: false, required: ["async"], properties: { url, scriptId: id, line: integer, column: integer, async: boolean } } } } } },
      coverage: { type: "object", additionalProperties: false, required: ["status", "capabilities", "reasons", "droppedNodes", "droppedEdges", "unresolvedRequests", "pendingTasks"], properties: {
        status: { type: "string", enum: ["complete", "partial", "unavailable"] }, reasons: boundedStrings(32, 100), droppedNodes: integer, droppedEdges: integer, unresolvedRequests: integer, pendingTasks: integer,
        capabilities: { type: "array", maxItems: 16, items: { type: "object", additionalProperties: false, required: ["name", "status"], properties: { name: { type: "string", maxLength: 64 }, status: { type: "string", enum: ["observed", "supported", "partial", "unavailable"] } } } },
      } },
    },
  },
  RuntimeEvidenceGraphNode: {
    type: "object", additionalProperties: false, required: ["id", "kind", "label", "observedAtMs"],
    properties: {
      id, kind: { type: "string", enum: ["document", "frame", "worker", "script", "resource", "request", "response", "cookie", "storage", "connection"] }, label: text, url, observedAtMs: number,
      captureBasis: { type: "string", enum: ["cdp", "instrumented_call", "page_realm_snapshot"] },
      scopeMatchKey: { ...hash, description: "Same scoped identity within this scan only, including host-only/domain and partition scope. Does not establish equal values, persistence, absence or consent response." },
      frameId: id, documentId: id, requestId: id, sessionId: id, redirectHop: integer, resourceType: { type: "string", maxLength: 50 },
      method: { type: "string", maxLength: 24 }, status: { type: "integer", minimum: 0, maximum: 999 }, initiatorType: { type: "string", maxLength: 24 }, stackId: id,
      fromServiceWorker: boolean, fromCache: boolean,
      operation: { type: "string", enum: ["http_set", "js_set", "cookie_store_set", "snapshot", "setItem", "removeItem", "clear", "database_metadata", "cache_metadata"] },
      outcome: { type: "string", enum: ["attempted", "native_call_returned", "native_call_failed", "stored", "blocked", "sent", "unknown"] },
      storageType: { type: "string", enum: ["localStorage", "sessionStorage", "indexedDB", "cacheStorage"] },
      cookie: { type: "object", additionalProperties: false, required: ["name", "domain", "path"], properties: { name: text, domain: text, path: text, hostOnly: boolean, identityRedacted: boolean, partitionOpaque: boolean, partitionKey: { type: "object", additionalProperties: false, required: ["topLevelSite"], properties: { topLevelSite: url, hasCrossSiteAncestor: boolean } } } },
      cookieAttributes: { type: "object", additionalProperties: false, properties: { secure: boolean, httpOnly: boolean, sameSite: { type: "string", maxLength: 24 }, expires: { type: "number" }, maxAge: { type: "number" }, session: boolean, priority: { type: "string", maxLength: 24 }, sourceScheme: { type: "string", maxLength: 24 }, sourcePort: { type: "integer" }, size: integer } },
      valueSize: integer, messageCount: integer, reasons: boundedStrings(12, 100),
      classification: { type: "object", additionalProperties: false, required: ["vendor", "purpose", "confidence", "basis", "disclosure", "policyEvidenceRefs"], properties: { vendor: text, product: text, entity: text, purpose: { type: "string", maxLength: 80 }, confidence: { type: "number", minimum: 0, maximum: 1 }, basis: { type: "string", const: "canonical_registry" }, disclosure: { type: "string", enum: ["mentioned", "not_found_in_reviewed_surfaces", "unknown"] }, disclosureScope: { type: "string", enum: ["product", "vendor", "entity"] }, policyEvidenceRefs: boundedStrings(8, 500) } },
    },
  },
} as const;
