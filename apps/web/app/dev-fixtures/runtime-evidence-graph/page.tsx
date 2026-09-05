import { notFound } from "next/navigation";
import { RuntimeEvidenceGraphExplorer } from "../../../components/scans/runtime-evidence-graph-explorer";
import { runtimeGraphUiFixture } from "../../../components/scans/runtime-evidence-graph-ui-fixture";
import { createHash } from "node:crypto";

export const dynamic = "force-dynamic";

export default async function RuntimeGraphFixturePage({ searchParams }: { searchParams: Promise<{ lazy?: string }> }) {
  if (process.env.NODE_ENV !== "development") notFound();
  const projection = runtimeGraphUiFixture();
  const lazy = (await searchParams).lazy === "1";
  if (lazy) {
    projection.scanId = "00000000-0000-4000-8000-000000000123";
    const sha256 = createHash("sha256").update(JSON.stringify(projection)).digest("hex");
    projection.details = { href: `/api/scans/${projection.scanId}/runtime-evidence-graph`, sha256, scenarioCount: projection.graphs.length, nodeCount: projection.graphs.reduce((sum, graph) => sum + graph.nodes.length, 0), edgeCount: projection.graphs.reduce((sum, graph) => sum + graph.edges.length, 0) };
    projection.graphs = [];
  }
  return <main className="mx-auto max-w-6xl space-y-5 p-6">
    <h1 className="text-xl font-semibold">Development-only relationship graph fixture</h1>
    <p className="text-sm text-slate-600">Synthetic UI test data, not a website scan or retained customer evidence. This page is unavailable in production.</p>
    {lazy ? <p>Deferred-read fixture: the automated browser harness supplies a synthetic response. This is not a production scan identifier.</p> : null}
    <RuntimeEvidenceGraphExplorer projection={projection} />
    <h2 className="text-lg font-semibold">Historical scan: no graph</h2>
    <RuntimeEvidenceGraphExplorer projection={{ contractVersion: "certscore.runtime-evidence-graph-projection.v1", scanId: "historical-fixture", registryVersion: "unavailable", status: "unavailable", graphs: [], limitations: ["historical_graph_not_captured"], findingOrScoreEffect: false }} />
    <div data-testid="runtime-graph-disabled-fixture"><RuntimeEvidenceGraphExplorer /></div>
  </main>;
}
