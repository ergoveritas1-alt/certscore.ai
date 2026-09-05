import { notFound } from "next/navigation";
import { RuntimeEvidenceGraphExplorer } from "../../../components/scans/runtime-evidence-graph-explorer";
import { runtimeGraphUiFixture } from "../../../components/scans/runtime-evidence-graph-ui-fixture";
import { createHash } from "node:crypto";
import { RuntimeInventoryTable } from "../../../components/scans/shared-scan-detail-view";
import type { InventoryGroupRow } from "../../../lib/scans/runtime-inventory-projection";

export const dynamic = "force-dynamic";

export default async function RuntimeGraphFixturePage({ searchParams }: { searchParams: Promise<{ lazy?: string; report?: string }> }) {
  if (process.env.NODE_ENV !== "development") notFound();
  const projection = runtimeGraphUiFixture();
  const lazy = (await searchParams).lazy === "1";
  const report = (await searchParams).report === "1";
  const rows: InventoryGroupRow[] = [{
    vendor: "Google", type: "tracker", purpose: "Analytics", purposes: ["Analytics"], macroCategory: "Analytics", priority: "high", confidence: "high",
    canonicalEntity: null, attributionSignatures: [], cookieNames: [], cookieDetails: [], dataFlows: [], domains: ["metrics.fixture.test"], firstSeenMs: 40,
    observedRecordCount: 1, party: "third_party", siteRelationship: "cross_site", entityRelationship: "external_entity", preConsent: true, rawProducts: ["Synthetic measurement"], regulatoryRelevance: [], requestCount: 1, setByThirdPartyScript: false,
    requestDetails: [{ hostname: "metrics.fixture.test", path: "/collect", method: "GET", essentiality: "non_essential", cookieNamesSent: [], identifierParameterNames: [], initiatorUrl: "https://widget.fixture.test/widget.js", responseCookieNamesSet: ["fixture_id"], responseObserved: true, responseStorageAttempted: true, vendor: "Google" }],
  }];
  rows.push({ ...rows[0]!, type: "cookie", vendor: "Measurement cookie", cookieNames: ["fixture_id"], rawProducts: [], requestCount: null, requestDetails: [], firstSeenMs: 60, cookieDetails: [{ cookieName: "fixture_id", cookiePath: "/", domain: "metrics.fixture.test", category: "Analytics", evidenceRefs: ["cookie"], firstObservedAtMs: 60, initiatorDomain: null, initiatorUrl: null, initiatorVendor: null, nonEssential: true, essentiality: "non_essential", party: "third_party", responseUrl: null, sourceRequestUrl: null, setAtMs: 60, setMethod: "http_set", timingBasis: "synthetic_fixture", evidenceGrade: "synthetic", timingEvidence: "before_consent_cookie_write" }] });
  rows.push({ ...rows[0]!, vendor: "Unattributed resource", priority: "review_needed", confidence: "low", purpose: "Unknown", purposes: ["Unknown"], macroCategory: "Review", domains: ["unresolved.fixture.test"], rawProducts: ["Unresolved endpoint"], requestDetails: [], firstSeenMs: null });
  if (lazy) {
    projection.scanId = "00000000-0000-4000-8000-000000000123";
    const sha256 = createHash("sha256").update(JSON.stringify(projection)).digest("hex");
    projection.details = { href: `/api/scans/${projection.scanId}/runtime-evidence-graph`, sha256, scenarioCount: projection.graphs.length, nodeCount: projection.graphs.reduce((sum, graph) => sum + graph.nodes.length, 0), edgeCount: projection.graphs.reduce((sum, graph) => sum + graph.edges.length, 0) };
    projection.graphs = [];
  }
  return <main className="mx-auto max-w-6xl space-y-5 p-6">
    <h1 className="text-xl font-semibold">Cookies &amp; Trackers · local design review</h1>
    <p className="text-sm text-slate-600">Synthetic UI test data, not a website scan or retained customer evidence. This page is unavailable in production.</p>
    {lazy ? <p>Deferred-read fixture: the automated browser harness supplies a synthetic response. This is not a production scan identifier.</p> : null}
    {report ? <RuntimeInventoryTable presentationState={{ status: "retained", message: null }} projection={{ runtimeEvidenceGraph: projection, groupedRows: rows, ungroupedRows: rows }} /> : <RuntimeEvidenceGraphExplorer projection={projection} initiallyOpen={!lazy} inventory={<div className="rounded-lg border p-4 text-sm text-slate-600">Pre-consent inventory. In a scan report, this tab preserves the existing full table, charts, detail controls and export.</div>} />}
    {!report ? <><h2 className="text-lg font-semibold">Historical scan: no graph</h2>
    <RuntimeEvidenceGraphExplorer projection={{ contractVersion: "certscore.runtime-evidence-graph-projection.v1", scanId: "historical-fixture", registryVersion: "unavailable", status: "unavailable", graphs: [], limitations: ["historical_graph_not_captured"], findingOrScoreEffect: false }} />
    <div data-testid="runtime-graph-disabled-fixture"><RuntimeEvidenceGraphExplorer /></div>
    </> : null}
  </main>;
}
