import { createHash } from "node:crypto";
import { apiRuntimeEvidenceGraphProjectionSchema, type ApiRuntimeEvidenceGraph, type ApiRuntimeEvidenceGraphProjection } from "@certscore/api-contracts";
import { verifyRuntimeEvidenceGraph, type CanonicalEvidenceBundle, type RuntimeEvidenceGraph, type RuntimeGraphNode } from "@certscore/contracts";
import { CANONICAL_VENDOR_RESOLVER_VERSION, findCanonicalVendorMention, resolveVendorObservations, type VendorResolverInput } from "@certscore/vendor-resolver";

type RetainedSource = { verificationStatus: string; sha256?: string; sizeBytes?: number };
export type RuntimeGraphPolicyDocument = { text: string; evidenceRef: string; textSha256: string; sourceBundleSha256: string; coverage: "complete" | "partial"; targetOwned: boolean; verified: boolean };
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

export function applyRuntimeGraphPresentationSwitch<T extends Record<string, unknown> | null>(artifacts: T, environment: Record<string, string | undefined>): T {
  if (!artifacts || environment.CERTSCORE_RUNTIME_GRAPH_PRESENTATION === "on") return artifacts;
  const { runtimeEvidenceGraphProjection: _graph, runtimeEvidenceGraphReference: _reference, ...retained } = artifacts;
  return retained as T;
}

/** Read-time copy only: never alter the retained payload, its checksum, or a shared cache entry. */
export function presentRuntimeGraphForRead<T extends { runtimeArtifacts: Record<string, unknown> | null } | null>(record: T, environment: Record<string, string | undefined>): T {
  if (!record || environment.CERTSCORE_RUNTIME_GRAPH_PRESENTATION === "on") return record;
  return { ...record, runtimeArtifacts: applyRuntimeGraphPresentationSwitch(record.runtimeArtifacts, environment) } as T;
}

/** Inventory-only projection. This module does not construct concerns, findings, severity or scores. */
export function projectRuntimeEvidenceGraphs(input: {
  bundle: CanonicalEvidenceBundle; scanId: string; source?: RetainedSource;
  policyDocuments?: RuntimeGraphPolicyDocument[];
}): ApiRuntimeEvidenceGraphProjection {
  const output: ApiRuntimeEvidenceGraphProjection = {
    contractVersion: "certscore.runtime-evidence-graph-projection.v1", scanId: input.scanId,
    status: "unavailable", registryVersion: CANONICAL_VENDOR_RESOLVER_VERSION,
    graphs: [], limitations: [], findingOrScoreEffect: false,
  };
  if (input.bundle.scanId !== input.scanId || input.source?.verificationStatus !== "verified" || !input.source.sha256 || !input.source.sizeBytes) {
    output.limitations.push("retained_bundle_not_verified"); return output;
  }
  output.sourceBundle = { sha256: input.source.sha256, sizeBytes: input.source.sizeBytes, verified: true };
  output.limitations.push(...(input.bundle.runtimeEvidenceGraphDiagnostics ?? []).map(row => `${row.scenario}:${row.reason}`));
  const scenarios = ["pre_consent", "gpc", "post_accept", "post_reject"] as const;
  for (const scenario of scenarios) {
    const packet = scenario === "post_accept" ? input.bundle.postAcceptEvidence : scenario === "post_reject" ? input.bundle.postRefusalEvidence : undefined;
    const rejected = packet?.runtimeEvidenceGraphDiagnostics?.find(row => row.scenario === scenario) ?? input.bundle.runtimeEvidenceGraphDiagnostics?.find(row => row.scenario === scenario);
    if (rejected) { if (packet) output.limitations.push(`${scenario}:${rejected.reason}`); continue; }
    if ((scenario === "post_accept" || scenario === "post_reject") && !packet) { output.limitations.push(`${scenario}:packet_unavailable`); continue; }
    const lane = scenario === "pre_consent" ? "runtime_evidence" : scenario === "gpc" ? "gpc_observation" : scenario === "post_accept" ? "accept_observation" : "reject_observation";
    const candidates = packet ? [packet.runtimeEvidenceGraph].filter(Boolean) : (input.bundle.runtimeEvidenceGraphs ?? []).filter(graph => graph.scenario === scenario);
    if (packet && packet.parentScanId !== input.scanId) { output.limitations.push(`${scenario}:packet_identity_mismatch`); continue; }
    if (candidates.length !== 1) { output.limitations.push(`${scenario}:${candidates.length ? "ambiguous" : "not_captured"}`); continue; }
    const verified = verifyRuntimeEvidenceGraph(candidates[0], { scanId: input.scanId, scenario, sha256 });
    if (!verified.graph) { output.limitations.push(`${scenario}:${verified.reason}`); continue; }
    const graph = verified.graph;
    if (packet) {
      const registration = "acceptanceRegistration" in packet ? packet.acceptanceRegistration : packet.refusalRegistration;
      const at = "acceptanceRegisteredAtMs" in registration ? registration.acceptanceRegisteredAtMs : "refusalRegisteredAtMs" in registration ? registration.refusalRegisteredAtMs : undefined;
      if (graph.action?.status === "confirmed" && (registration.status !== "confirmed" || graph.action.registeredAtMs !== at)) {
        output.limitations.push(`${scenario}:action_anchor_mismatch`); continue;
      }
    }
    if (graph.captureId !== `${input.scanId}:${lane}`) { output.limitations.push(`${scenario}:capture_identity_mismatch`); continue; }
    if (graph.mode !== "project") { output.limitations.push(`${scenario}:capture_only`); continue; }
    const documents = (input.policyDocuments ?? []).slice(0, 16).filter(document => document.verified && document.targetOwned && document.sourceBundleSha256 === input.source!.sha256 && document.text.length <= 1_000_000 && sha256(document.text) === document.textSha256);
    output.graphs.push(projectGraph(graph, documents));
  }
  output.status = output.graphs.length ? output.graphs.some(graph => graph.coverage.status !== "complete") || output.limitations.length ? "limited" : "available" : "unavailable";
  const parsed = apiRuntimeEvidenceGraphProjectionSchema.safeParse(output);
  return parsed.success ? parsed.data : { ...output, status: "unavailable", graphs: [], limitations: ["public_graph_validation_failed"] };
}

function projectGraph(graph: RuntimeEvidenceGraph, documents: RuntimeGraphPolicyDocument[]): ApiRuntimeEvidenceGraph {
  const inputs: VendorResolverInput[] = graph.nodes.filter(node => ["request", "response", "script", "resource", "cookie", "storage", "connection"].includes(node.kind)).map(node => ({
    evidenceId: node.id, type: node.kind === "cookie" ? "cookie" : node.kind === "storage" ? "cmp_runtime" : node.kind === "script" ? "script" : node.kind === "response" ? "response" : "request",
    url: node.url, hostname: node.hostname ?? node.cookie?.domain, cookieName: node.cookie?.identityRedacted ? undefined : node.cookie?.name,
    storageKey: node.kind === "storage" ? node.name : undefined,
  }));
  const matches = resolveVendorObservations(inputs);
  const policyByIdentity = new Map<string, { state: "mentioned" | "not_found_in_reviewed_surfaces" | "unknown"; scope?: "product" | "vendor" | "entity"; refs: string[] }>();
  for (const vendor of matches) {
    const key = JSON.stringify([vendor.entity, vendor.vendor, vendor.product]);
    if (policyByIdentity.has(key)) continue;
    const mentions = documents.flatMap(document => { const match = findCanonicalVendorMention(document.text, vendor); return match ? [{ document, match }] : []; });
    const reviewed = mentions.length ? mentions.map(row => row.document) : documents.filter(document => document.coverage === "complete");
    policyByIdentity.set(key, { state: mentions.length ? "mentioned" : reviewed.length ? "not_found_in_reviewed_surfaces" : "unknown", scope: mentions[0]?.match.scope, refs: reviewed.map(document => document.evidenceRef).slice(0, 8) });
  }
  const vendorsByNode = new Map<string, typeof matches>();
  for (const match of matches) for (const source of match.matchSources) {
    if (!source.sourceEventId) continue;
    const existing = vendorsByNode.get(source.sourceEventId) ?? [];
    if (!existing.some(row => row.vendor === match.vendor && row.entity === match.entity && row.product === match.product)) existing.push(match);
    vendorsByNode.set(source.sourceEventId, existing);
  }
  return {
    captureId: graph.captureId, scenario: graph.scenario, sourceHash: graph.sourceHash,
    startedAt: graph.startedAt, completedAt: graph.completedAt, action: graph.action,
    coverage: graph.coverage, edges: graph.edges, stacks: graph.stacks,
    nodes: graph.nodes.map(node => {
      const { valueHash: _valueHash, hostname: _hostname, bytes: _bytes, name: _name, ...safe } = node;
      const result: ApiRuntimeEvidenceGraph["nodes"][number] = { ...safe, label: label(node) };
      // Compare scoped identities only, not values or causal persistence. Redacted/opaque identities cannot match.
      if (node.cookie && typeof node.cookie.hostOnly === "boolean" && !node.cookie.identityRedacted && !node.cookie.partitionOpaque && (!node.cookie.partitionKey || typeof node.cookie.partitionKey.hasCrossSiteAncestor === "boolean"))
        result.scopeMatchKey = sha256(JSON.stringify([graph.scanId, "cookie", node.cookie.name, node.cookie.domain, node.cookie.hostOnly, node.cookie.path, node.cookie.partitionKey?.topLevelSite, node.cookie.partitionKey?.hasCrossSiteAncestor]));
      if (node.kind === "storage" && node.storageType && node.name && node.name !== "unknown" && !node.name.includes("_redacted_") && node.url && !node.url.includes("_redacted_"))
        result.scopeMatchKey = sha256(JSON.stringify([graph.scanId, "storage", node.url, node.storageType, node.name]));
      const candidates = vendorsByNode.get(node.id) ?? [];
      if (candidates.length === 1) {
        const vendor = candidates[0]!;
        const policy = policyByIdentity.get(JSON.stringify([vendor.entity, vendor.vendor, vendor.product]));
        result.classification = {
          vendor: vendor.vendor.slice(0, 240), product: vendor.product?.slice(0, 240), entity: vendor.entity?.slice(0, 240), purpose: vendor.purpose ?? "unknown", confidence: vendor.confidence, basis: "canonical_registry",
          disclosure: policy?.state ?? "unknown",
          disclosureScope: policy?.scope,
          policyEvidenceRefs: [...new Set(policy?.refs ?? [])].slice(0, 8).map(ref => ref.slice(0, 500)),
        };
      }
      return result;
    }),
  };
}

function label(node: RuntimeGraphNode) {
  return (node.cookie?.name || node.name || node.url || `${node.kind} ${node.id.slice(0, 8)}`).slice(0, 240);
}

/** Additional-page graph: verified raw inventory artifact, never a synthetic canonical bundle. */
export function projectCrawlRuntimeGraph(input: {
  graph: unknown; pageId: string; attemptId: string;
  source: { sha256: string; sizeBytes: number; verificationStatus: string };
}): ApiRuntimeEvidenceGraphProjection {
  const result: ApiRuntimeEvidenceGraphProjection = {
    contractVersion: "certscore.runtime-evidence-graph-projection.v1", scanId: input.pageId,
    status: "unavailable", registryVersion: CANONICAL_VENDOR_RESOLVER_VERSION,
    graphs: [], limitations: [], findingOrScoreEffect: false,
  };
  if (input.source.verificationStatus !== "verified" || !/^[a-f0-9]{64}$/.test(input.source.sha256) || input.source.sizeBytes <= 0) {
    result.limitations.push("retained_inventory_not_verified"); return result;
  }
  result.sourceBundle = { sha256: input.source.sha256, sizeBytes: input.source.sizeBytes, verified: true };
  const verified = verifyRuntimeEvidenceGraph(input.graph, { scanId: input.pageId, scenario: "pre_consent", sha256 });
  if (!verified.graph || verified.graph.captureId !== `${input.pageId}:${input.attemptId}:runtime_evidence` || verified.graph.mode !== "project") {
    result.limitations.push("page_graph_identity_or_integrity_unverified"); return result;
  }
  result.graphs = [projectGraph(verified.graph, [])];
  result.status = verified.graph.coverage.status === "complete" ? "available" : "limited";
  return apiRuntimeEvidenceGraphProjectionSchema.parse(result);
}
