import assert from "node:assert/strict";
import test from "node:test";
import {runtimeGraphUiFixture} from "../../components/scans/runtime-evidence-graph-ui-fixture";
import {projectGpcResourceInventory} from "./gpc-resource-inventory";
function fixture() {
 const projection=runtimeGraphUiFixture();
 const graph=projection.graphs.find(g=>g.scenario==="gpc")!;
 graph.captureId=`${projection.scanId}:gpc_observation`;
 graph.nodes=[
  {id:"main",kind:"frame",label:"main",url:"https://fixture.test/",observedAtMs:0},
  {id:"child",kind:"frame",label:"child",url:"https://video.example/embed",observedAtMs:25},
  {id:"a",kind:"request",label:"image",url:"https://fixture.test/image.jpg",observedAtMs:50,method:"GET",resourceType:"Image"},
  {id:"b",kind:"request",label:"image again",url:"https://fixture.test/image.jpg",observedAtMs:100,method:"GET",resourceType:"Image"},
  {id:"c",kind:"request",label:"unknown",url:"https://unknown.example/pixel",observedAtMs:200,method:"GET"},
  {id:"response",kind:"response",label:"response",observedAtMs:250,status:200},
  {id:"cookie1",kind:"cookie",label:"same",observedAtMs:300,operation:"snapshot",cookie:{name:"same",domain:"fixture.test",path:"/",hostOnly:true}},
  {id:"cookie2",kind:"cookie",label:"same",observedAtMs:301,operation:"js_set",outcome:"attempted",cookie:{name:"same",domain:"fixture.test",path:"/other",hostOnly:true}},
  {id:"storage",kind:"storage",label:"preference",url:"https://fixture.test/",observedAtMs:400,operation:"snapshot",storageType:"localStorage",scopeMatchKey:"d".repeat(64)},
 ];
 graph.edges=[{id:"parent",from:"main",to:"child",relation:"frame_parent",basis:"cdp",directness:"direct"}];graph.stacks=[];
 graph.coverage.droppedNodes=5;
 return projection;
}
test("GPC inventory includes ordinary requests and scoped storage without counting responses or the main frame",()=>{
 const projection=fixture(),original=structuredClone(projection);
 const result=projectGpcResourceInventory({scanId:projection.scanId,projection,pageUrl:"https://fixture.test/"})!;
 assert.equal(result.inventory.resources.length,6);
 assert.equal(result.inventory.requestMetric?.value,3);
 assert.equal(result.inventory.resources.find(r=>r.kind==="request"&&r.eventCount===2)?.occurrence.firstSeenMs,50);
 assert.equal(result.inventory.resources.filter(r=>r.kind==="embed").length,1);
 assert.equal(result.inventory.resources.filter(r=>r.kind==="cookie").length,2);
 assert.equal(result.inventory.resources.find(r=>r.occurrence.id==="cookie1")?.occurrence.firstSeenMs,null);
 assert.equal(result.inventory.resources.find(r=>r.occurrence.id==="cookie1")?.inventoryEvidence,"Review");
 assert.equal(result.inventory.resources.find(r=>r.occurrence.id==="cookie2")?.inventoryEvidence,"Unclassified");
 assert.equal(result.inventory.resources.find(r=>r.occurrence.id==="c")?.inventoryEvidence,"Unclassified");
 assert.equal(result.inventory.mix.type.reduce((n,x)=>n+x.count,0),6);
 assert.match(result.note,/5 graph records were omitted/);
 assert.equal(result.clockLabel,"Times from GPC visit start");
 assert.deepEqual(projection,original);
});
test("missing, ambiguous, cross-scan and unverified GPC stay unavailable instead of borrowing another phase",()=>{
 for(const change of ["missing","ambiguous","scan","capture","source","unavailable","invalid_url"]){
  const p=fixture(),g=p.graphs.find(g=>g.scenario==="gpc")!;
  if(change==="missing")p.graphs=p.graphs.filter(g=>g.scenario!=="gpc");
  if(change==="ambiguous")p.graphs=[g,g];
  if(change==="scan")p.scanId="other";
  if(change==="capture")g.captureId="other:gpc_observation";
  if(change==="source")delete p.sourceBundle;
  if(change==="unavailable")g.coverage.status="unavailable";
  if(change==="invalid_url")g.nodes[0]!.url="https://fixture.test/?secret=private";
  assert.equal(projectGpcResourceInventory({scanId:"ui-fixture",projection:p,pageUrl:"https://fixture.test/"}),null,change);
 }
});
test("a retained empty capture remains an explicit zero inventory",()=>{
 const p=fixture(),g=p.graphs.find(g=>g.scenario==="gpc")!;g.nodes=[];g.edges=[];
 const result=projectGpcResourceInventory({scanId:p.scanId,projection:p,pageUrl:"https://fixture.test/"});
 assert.ok(result);assert.equal(result.inventory.resources.length,0);assert.equal(result.inventory.requestMetric?.value,0);
});

test("requests without retained URLs remain useful observations with an explicit label",()=>{
 const p=fixture(),g=p.graphs.find(g=>g.scenario==="gpc")!;delete g.nodes.find(n=>n.id==="c")!.url;
 const result=projectGpcResourceInventory({scanId:p.scanId,projection:p,pageUrl:"https://fixture.test/"})!;
 const row=result.inventory.resources.find(r=>r.occurrence.id==="c")!;
 assert.equal(row.name,"Request URL not retained");assert.equal(row.occurrence.relationship,"unknown");
 assert.equal(result.inventory.requestMetric?.value,3);
});

test("GPC joins image response and cookie evidence to the exact request before classifying delivery", () => {
  const p = fixture();
  const graph = p.graphs.find(g => g.scenario === "gpc")!;
  graph.nodes = [
    { id: "req", kind: "request", method: "GET", resourceType: "Image", label: "image", observedAtMs: 1,
      url: "https://cdn.sanity.io/images/abc/production/photo.png",
      classification: { vendor: "Sanity", purpose: "infrastructure", confidence: 0.99, basis: "canonical_registry", disclosure: "unknown", policyEvidenceRefs: [] } },
    { id: "resp", kind: "response", label: "image response", observedAtMs: 2, status: 200 },
    { id: "cookie", kind: "cookie", label: "cookie", observedAtMs: 2 },
  ];
  graph.edges = [{ id: "resp-edge", from: "req", to: "resp", relation: "response_to", basis: "cdp", directness: "direct" }];
  const imageClass = () => projectGpcResourceInventory({ scanId: p.scanId, projection: p, pageUrl: "https://sanity.io/" })!.inventory.resources.find(r => r.kind === "request")?.inventoryEvidence;
  assert.equal(imageClass(), "Contextual");
  graph.edges.push({ id: "attempt", from: "resp", to: "cookie", relation: "response_cookie_attempt", basis: "cdp", directness: "direct" });
  assert.equal(imageClass(), "Review");
  graph.edges.pop();
  graph.edges.push({ id: "sent", from: "cookie", to: "req", relation: "cookie_included", basis: "cdp", directness: "direct" });
  assert.equal(imageClass(), "Review");
});

test("merges successful measurement into the same endpoint as the graph and keeps library downloads contextual", () => {
  const projection = fixture();
  const graph = projection.graphs.find(g => g.scenario === "gpc")!;
  const ad = "https://pagead2.googlesyndication.com/ccm/collect";
  const library = "https://www.googletagmanager.com/gtag/js";
  graph.nodes = [
    {id:"ad", kind:"request", observedAtMs:2, method:"POST", resourceType:"Fetch", url:ad, label:ad},
    {id:"script", kind:"request", observedAtMs:1, method:"GET", resourceType:"Script", url:library, label:library},
  ];
  graph.edges = [];
  const measurementInventory = {scanId:projection.scanId, sourceSha256:"f".repeat(64), graphSha256:graph.sourceHash, endpoints:[
    {hostname:"pagead2.googlesyndication.com", method:"POST", role:"advertising", count:2, firstSeenMs:2},
    {hostname:"measure.fixture.test", method:"GET", role:"analytics", count:1, firstSeenMs:3},
  ]};
  const read = (proof: unknown) => projectGpcResourceInventory({scanId:projection.scanId, projection, pageUrl:"https://fixture.test/", measurementInventory:proof})!;
  const inventory = read(measurementInventory).inventory;
  assert.equal(inventory.resources.find(r => r.name === library)?.inventoryEvidence, "Contextual");
  assert.equal(inventory.resources.find(r => r.name === ad)?.eventCount, 2);
  assert.equal(inventory.resources.filter(r => r.inventoryEvidence === "Non-essential").length, 2);
  for (const stale of [{scanId:"other"}, {graphSha256:"c".repeat(64)}]) {
    assert.equal(read({...measurementInventory, ...stale}).inventory.resources.some(r => r.name.includes("measure.fixture.test")), false);
  }
});

test("a successful Sanity batch request counts once for review across GPC evidence sources", () => {
  const projection = fixture();
  const graph = projection.graphs.find(g => g.scenario === "gpc")!;
  const url = "https://www.sanity.io/intake/dp/beacon/v1/batch";
  graph.nodes = [
    {id:"beacon", kind:"request", method:"POST", resourceType:"Ping", url, label:url, observedAtMs:1},
    {id:"response", kind:"response", status:503, label:"response", observedAtMs:2},
  ];
  graph.edges = [{id:"edge", from:"beacon", to:"response", relation:"response_to", basis:"cdp", directness:"direct"}];
  const project = (measurementInventory?: unknown) => projectGpcResourceInventory({
    scanId:projection.scanId, pageUrl:"https://www.sanity.io", projection, measurementInventory,
  })!.inventory.resources;
  assert.equal(project()[0]?.inventoryEvidence, "Unclassified");
  graph.nodes[1]!.status = 200;
  assert.equal(project()[0]?.inventoryEvidence, "Review");
  const proof = {scanId:projection.scanId, graphSha256:graph.sourceHash, sourceSha256:"f".repeat(64),
    endpoints:[{hostname:"www.sanity.io", role:"sanity_batch_beacon", method:"POST", count:2, firstSeenMs:1}]};
  for (const includeGraphRequest of [true, false]) {
    if (!includeGraphRequest) { graph.nodes = []; graph.edges = []; }
    const rows = project(proof);
    assert.deepEqual(rows.map(r => [r.name, r.eventCount, r.inventoryEvidence, r.occurrence.purpose]), [[url, 2, "Review", "unknown"]]);
  }
});
