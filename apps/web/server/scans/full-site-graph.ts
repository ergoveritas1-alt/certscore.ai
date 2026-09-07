import "server-only";
import { loadFullSiteCrawl, loadFullSitePages, query, readFullSiteArtifact } from "@website-signal-risk-scanner/db";
import { crawlObservationSchema } from "@website-signal-risk-scanner/shared";
import { projectCrawlRuntimeGraph } from "./runtime-evidence-graph-projection";

export async function loadFullSiteGraph(scanId: string, pageId: string) {
  if (!/^[a-f0-9-]{36}$/i.test(pageId)) return null;
  const crawl = await loadFullSiteCrawl(scanId);
  const [page] = await loadFullSitePages(scanId, pageId);
  if (!crawl || !page?.observation_json || !["completed", "partial"].includes(page.status)) return null;
  const parsed = crawlObservationSchema.safeParse(page.observation_json);
  if (!parsed.success) return null;
  const observation = parsed.data;
  if (observation.attemptId !== page.attempt_id) return null;
  if (!observation.runtimeGraph || observation.parentScanId !== scanId || observation.pageJobId !== pageId || observation.configurationHash !== crawl.configuration_hash) return null;
  const { rows: [attempt] } = await query<{ artifact_json: { bucket: string; evidenceKey: string; sourceHash: string } }>(
    "select artifact_json from full_site_attempts where id=$1 and page_id=$2 and status in ('completed','partial')", [observation.attemptId, pageId]);
  const artifact = attempt?.artifact_json;
  const expectedKey = `${crawl.artifact_prefix}/${pageId}/${observation.attemptId}/evidence.json`;
  if (!artifact || artifact.bucket !== crawl.bucket || artifact.evidenceKey !== expectedKey || artifact.sourceHash !== observation.sourceHash) return null;
  const source = { sha256: observation.sourceHash, sizeBytes: observation.runtimeGraph.sourceSizeBytes, verificationStatus: "verified" };
  const evidence = await readFullSiteArtifact({ bucket: artifact.bucket, key: artifact.evidenceKey, region: crawl.region, sha256: source.sha256, sizeBytes: source.sizeBytes, maxBytes: 64 * 1024 * 1024 });
  const projection = projectCrawlRuntimeGraph({ graph: (evidence as { runtimeEvidenceGraph?: unknown })?.runtimeEvidenceGraph, pageId, attemptId: observation.attemptId, source });
  const graph = projection.graphs[0];
  if (!graph || graph.sourceHash !== observation.runtimeGraph.sha256 || graph.nodes.length !== observation.runtimeGraph.nodeCount || graph.edges.length !== observation.runtimeGraph.edgeCount) return null;
  return projection;
}
