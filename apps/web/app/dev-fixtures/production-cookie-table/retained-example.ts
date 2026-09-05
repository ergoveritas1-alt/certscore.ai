import "server-only";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { apiRuntimeEvidenceGraphProjectionSchema } from "@certscore/api-contracts";
import { verifyRuntimeEvidenceGraph } from "@certscore/contracts";
import { SHADOW_REPORT, type ShadowReportData } from "../../../components/scans/report-lab/shadow-report-data";
import { nodeDomain, observationTime } from "../../../components/scans/runtime-evidence-graph-model";
import { readPersistedScanReportProjection } from "../../../server/scans/scan-report-projection-contract";
import { buildTimelineReportModel } from "../../../components/scans/report-lab/timeline-report-model";
import type { ScanDetailResponse } from "../../../server/scans/get-scan-by-id";

/** Exact, owner-authorized fresh scan; only the verified canonical projection supplies inventory. */
export async function retainedPferdeklinikExample(): Promise<ShadowReportData> {
  if (process.env.NODE_ENV !== "development") throw new Error("Development only");
  const scanId = "fc9fd33b-8413-4e07-b27b-28b950de8896";
  const snapshot = JSON.parse(await readFile("/tmp/pferdeklinik-preview-report-20260905.json", "utf8"));
  const record = readPersistedScanReportProjection({ scan: { id: scanId, status: "completed" } as ScanDetailResponse["scan"], snapshot });
  if (!record || snapshot.scan_id !== scanId || snapshot.scan_status !== "completed") throw new Error("Retained report integrity mismatch");
  const projection = apiRuntimeEvidenceGraphProjectionSchema.parse(JSON.parse(await readFile("/tmp/pferdeklinik-preview-graph-20260905.json", "utf8")));
  const expected = apiRuntimeEvidenceGraphProjectionSchema.parse(record.runtimeArtifacts?.runtimeEvidenceGraphProjection);
  if (projection.scanId !== scanId || projection.details || !projection.sourceBundle?.verified || projection.sourceBundle.sha256 !== expected?.sourceBundle?.sha256 || projection.sourceBundle.sizeBytes !== expected.sourceBundle.sizeBytes) throw new Error("Retained report/graph binding mismatch");
  return buildTimelineReportModel({ ...record, runtimeArtifacts: { ...record.runtimeArtifacts, runtimeEvidenceGraphProjection: projection } });
}

/** Read-only local replay. Never persist these presentation rows or modify canonical inventory. */
export async function retainedPocketTacticsExample(): Promise<ShadowReportData> {
  if (process.env.NODE_ENV !== "development") throw new Error("Development only");
  const prefix = "/tmp/certscore-graph-final-gates-6VQMEU/5e996cac-8b17-4eed-ba71-8039948f8203";
  const bytes = await readFile(`${prefix}-bundle.json`);
  const projection = apiRuntimeEvidenceGraphProjectionSchema.parse(JSON.parse(await readFile(`${prefix}-public-graph.json`, "utf8")));
  const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");
  if (createHash("sha256").update(bytes).digest("hex") !== "8573437997415d1d384c18e7583c0dba76b57950990418238e7ea6a1d9edad21" || projection.sourceBundle?.sha256 !== createHash("sha256").update(bytes).digest("hex") || projection.sourceBundle.sizeBytes !== bytes.length) throw new Error("Retained example checksum mismatch");
  const bundle = JSON.parse(bytes.toString("utf8"));
  if (projection.scanId !== bundle.scanId) throw new Error("Retained example identity mismatch");
  for (const graph of projection.graphs) {
    const raw = bundle.runtimeEvidenceGraphs.find((item: { scenario: string }) => item.scenario === graph.scenario);
    const verified = verifyRuntimeEvidenceGraph(raw, { scanId: projection.scanId, scenario: graph.scenario, sha256 });
    if (!verified.graph || verified.graph.sourceHash !== graph.sourceHash) throw new Error("Retained graph integrity mismatch");
  }
  const graph = projection.graphs.find(item => item.scenario === "pre_consent")!;
  const ids = ["1327f6b09c2813af3c002fe834f31585", "38c9a9b69f885ad730e029a6d28cb265", "d0aa5508ca32429b2289a21cfeddf0dd", "95a8df9a09db1b25a4da1757d06af3d8"];
  const nodes = ids.map(id => graph.nodes.find(node => node.id === id)!);
  if (nodes.some(node => !node)) throw new Error("Retained parent missing");
  return { ...SHADOW_REPORT, runtimeEvidenceGraph: projection, metrics: { ...SHADOW_REPORT.metrics, vendors: new Set(nodes.flatMap(node => node.classification ? [node.classification.vendor] : [])).size, domains: new Set(nodes.map(nodeDomain)).size }, inventory: nodes.map(node => ({
    vendor: node.classification?.vendor ?? "Unclassified", type: "Script", name: node.url ?? node.label,
    purpose: node.classification?.purpose ?? "Unknown", evidence: "Review", category: "Review", priority: "Not assessed",
    domains: nodeDomain(node), observed: observationTime(node.observedAtMs), relationship: "Unknown", entityRelationship: "Unknown",
    confidence: "Not assessed", requestNames: "See linked requests", serverLocation: "Not retained", controllingEntity: node.classification?.entity ?? "Not retained", transferMechanism: "Unknown", recordCount: 1, requestCount: null,
    evidenceJson: { retainedGraphNodeIds: [node.id], node, sourceBundle: projection.sourceBundle, coverage: graph.coverage },
  })) };
}
