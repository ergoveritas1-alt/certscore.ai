/** Additive public inventory contract. Relationships are evidence, not findings or score effects. */
export interface RuntimeEvidenceGraphNode {
  id: string;
  kind: "document" | "frame" | "worker" | "script" | "resource" | "request" | "response" | "cookie" | "storage" | "connection";
  label: string;
  observedAtMs: number;
  url?: string;
  scopeMatchKey?: string;
  captureBasis?: "cdp" | "instrumented_call" | "page_realm_snapshot";
  frameId?: string; documentId?: string; requestId?: string; sessionId?: string;
  redirectHop?: number; resourceType?: string; method?: string; status?: number; initiatorType?: string; stackId?: string;
  fromServiceWorker?: boolean; fromCache?: boolean;
  operation?: "http_set" | "js_set" | "cookie_store_set" | "snapshot" | "setItem" | "removeItem" | "clear" | "database_metadata" | "cache_metadata";
  outcome?: "attempted" | "native_call_returned" | "native_call_failed" | "stored" | "blocked" | "sent" | "unknown";
  storageType?: "localStorage" | "sessionStorage" | "indexedDB" | "cacheStorage";
  cookie?: { name: string; domain: string; path: string; hostOnly?: boolean; identityRedacted?: boolean; partitionKey?: { topLevelSite: string; hasCrossSiteAncestor?: boolean }; partitionOpaque?: boolean };
  cookieAttributes?: { secure?: boolean; httpOnly?: boolean; sameSite?: string; expires?: number; maxAge?: number; session?: boolean; priority?: string; sourceScheme?: string; sourcePort?: number; size?: number };
  valueSize?: number; messageCount?: number; reasons?: string[];
  classification?: { vendor: string; product?: string; entity?: string; purpose: string; confidence: number; basis: "canonical_registry"; disclosure: "mentioned" | "not_found_in_reviewed_surfaces" | "unknown"; disclosureScope?: "product" | "vendor" | "entity"; policyEvidenceRefs: string[] };
}

export interface RuntimeEvidenceGraphEdge {
  id: string; from: string; to: string;
  relation: "belongs_to_document" | "belongs_to_frame" | "frame_parent" | "worker_request" | "initiated_by" | "parser_loaded" | "async_ancestor" | "response_to" | "redirected_from" | "response_cookie_attempt" | "script_cookie_attempt" | "cookie_included" | "cookie_blocked" | "snapshot_confirms" | "storage_operation" | "script_storage_operation" | "handled_by_service_worker" | "loaded_resource";
  basis: "cdp" | "browser_snapshot" | "instrumented_call" | "unique_scope_time_match";
  directness: "direct" | "inferred";
}

export interface RuntimeEvidenceGraph {
  captureId: string; scenario: "pre_consent" | "gpc" | "post_accept" | "post_reject"; sourceHash: string;
  startedAt: string; completedAt: string;
  action?: { status: "unconfirmed" | "confirmed"; registeredAtMs?: number };
  nodes: RuntimeEvidenceGraphNode[];
  edges: RuntimeEvidenceGraphEdge[];
  stacks: Array<{ id: string; frames: Array<{ url?: string; scriptId?: string; line?: number; column?: number; async: boolean }>; truncated: boolean }>;
  coverage: { status: "complete" | "partial" | "unavailable"; capabilities: Array<{ name: string; status: "observed" | "supported" | "partial" | "unavailable" }>; reasons: string[]; droppedNodes: number; droppedEdges: number; unresolvedRequests: number; pendingTasks: number };
}

export interface RuntimeEvidenceGraphProjection {
  contractVersion: "certscore.runtime-evidence-graph-projection.v1";
  scanId: string;
  status: "available" | "limited" | "unavailable";
  sourceBundle?: { sha256: string; sizeBytes: number; verified: true };
  registryVersion: string;
  graphs: RuntimeEvidenceGraph[];
  details?: { href: string; sha256: string; scenarioCount: number; nodeCount: number; edgeCount: number };
  limitations: string[];
  findingOrScoreEffect: false;
}
