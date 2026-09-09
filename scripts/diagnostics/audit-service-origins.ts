/** Read-only audit of already-retained graphs; no scans or persistence. */
import { loadFullSiteCrawl, loadFullSitePages } from "../../packages/db/src/index";
import { crawlObservationSchema } from "../../packages/shared/src/full-site-crawl";
import { loadFullSiteGraphContext } from "../../apps/web/server/scans/full-site-graph";
import { buildServiceOriginLookup } from "../../apps/web/lib/scans/service-origins";
import { crawlOccurrenceGraphIdentity, matchInventoryResources } from "../../apps/web/lib/scans/inventory-resource-relationships";
import { identifyCrawlService } from "../../apps/web/lib/scans/full-site-resource-context";
async function main() {
const endpoint = process.env.S3_ENDPOINT;
if (!endpoint || !["localhost", "127.0.0.1", "[::1]"].includes(new URL(endpoint).hostname)) throw new Error("A local artifact store is required");
const scanId = process.argv[2];
if (!scanId) throw new Error("Scan ID required");
const crawl = await loadFullSiteCrawl(scanId);
if (!(crawl?.policy_json as {localExecution?:boolean})?.localExecution) throw new Error("This audit is restricted to retained local scans");
const pages = await loadFullSitePages(scanId);
const unmatched = new Map<string, number>();
const totals = new Map<string,{occurrences:number; linked:number; parents:Set<string>}>();
let retained=0, verified=0, bytes=0;
for (const page of pages) {
 const parsed=crawlObservationSchema.safeParse(page.compact_json);
 if (!parsed.success || !parsed.data.runtimeGraph) continue;
 retained++;
 const context=await loadFullSiteGraphContext(scanId!,page.id);
 const graph=context?.projection.graphs.find(g=>g.scenario==="pre_consent");
 if (!graph) continue;
 verified++;
 bytes+=parsed.data.runtimeGraph.sourceSizeBytes;
 const originsFor=buildServiceOriginLookup(graph, page.final_url ?? page.target_url);
 for (const occurrence of parsed.data.occurrences) {
  const identity=identifyCrawlService(occurrence);
  const name=identity?.product??identity?.vendor;
  if (!name || !/Fonts|Static Assets/.test(name)) continue;
  const row=totals.get(name)??{occurrences:0,linked:0,parents:new Set<string>()};
  const origins=originsFor(occurrence);
  if (name === "Google Fonts" && !origins.length) {
    const nodes=matchInventoryResources(graph,crawlOccurrenceGraphIdentity(occurrence));
    const refs=crawlOccurrenceGraphIdentity(occurrence).nodeRefs??[];
    const parents=graph.edges.filter(e=>nodes.some(n=>n.id===e.to)).map(e=>{
      const n=graph.nodes.find(n=>n.id===e.from);
      return [e.relation,n?.kind,n?.url ? new URL(n.url).hostname : "no-url"].join(":");
    });
    const signature=JSON.stringify({matches:nodes.length,refs:refs.length,parents:[...new Set(parents)]});
    unmatched.set(signature,(unmatched.get(signature)??0)+occurrence.eventCount);
  }
  row.occurrences+=occurrence.eventCount;
  if(origins.length) row.linked+=occurrence.eventCount;
  origins.forEach(o=>row.parents.add(o.name));
  totals.set(name,row);
 }
}
const { loadFullSiteReport } = await import("../../apps/web/server/scans/full-site-report");
const { buildServiceHierarchy } = await import("../../apps/web/lib/scans/service-hierarchy");
const report=await loadFullSiteReport(scanId, new URLSearchParams({kind:"all"}));
const hierarchy=report ? buildServiceHierarchy(report.services) : [];
console.log(JSON.stringify({hierarchy:hierarchy.map(b=>({name:b.service.name,directSite:b.directSite,resources:b.service.resources.length})),retained,verified,bytes,unmatched:[...unmatched],services:[...totals].map(([service,v])=>({service,...v,parents:[...v.parents]}))},null,2));
process.exit(0);

}
main().catch(error => { console.error(error.message); process.exit(1); });
