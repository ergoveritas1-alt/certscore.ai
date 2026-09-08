import assert from "node:assert/strict";
import test from "node:test";
import type { ApiRuntimeEvidenceGraph } from "@certscore/api-contracts";
import { buildServiceOriginLookup } from "./service-origins";
const occurrence = {kind:"request", label:"https://fonts.googleapis.com/css", graphNodeRefs:["font"], evidenceRefs:[], details:{method:"GET"}};
const nodes = [
  {id:"youtube", kind:"frame", url:"https://www.youtube.com/embed/example"},
  {id:"document",kind:"document"},
  {id:"font",kind:"request",url:"https://fonts.googleapis.com/css",method:"GET"},
  {id:"vimeo",kind:"frame",url:"https://player.vimeo.com/video/12345"},
];
const edge = (id:string,from:string,to:string,relation:string,directness="direct") => ({id,from,to,relation,directness});
const graph = (edges:unknown[], extra:unknown[]=[]) => ({nodes:[...nodes,...extra],edges}) as ApiRuntimeEvidenceGraph;
test("links across a retained frame/document ancestry without conflating Google products", () => {
 const result=buildServiceOriginLookup(graph([edge("a","youtube","document","belongs_to_frame"),edge("b","document","font","parser_loaded")]))(occurrence);
 assert.equal(result.length,1);
 assert.match(result[0]!.name,/YouTube/i);
 assert.equal(result[0]!.inferred,false);
 assert.deepEqual(result[0]!.edgeIds,["b","a"]);
});
test("preserves multiple origins, inference, and terminates cycles", () => {
 const result=buildServiceOriginLookup(graph([edge("a","youtube","font","loaded_resource","inferred"),edge("b","vimeo","font","parser_loaded"),edge("c","font","font","initiated_by")]))(occurrence);
 assert.equal(result.length,2);
 assert.equal(result.filter(row=>row.inferred).length,1);
});
test("no association from shared vendor, unrelated edges, or ambiguous endpoint matches", () => {
 assert.equal(buildServiceOriginLookup(graph([]))(occurrence).length,0);
 assert.equal(buildServiceOriginLookup(graph([edge("a","youtube","font","cookie_included")]))(occurrence).length,0);
 const ambiguous=graph([edge("a","youtube","font","parser_loaded")],[{...nodes[2],id:"font2"}]);
 assert.equal(buildServiceOriginLookup(ambiguous)({...occurrence,graphNodeRefs:[]}).length,0);
});
test("site origins require direct loading ancestry, not document membership", () => {
 const site={id:"site",kind:"document",url:"https://example.com/page"};
 const g=graph([edge("load","site","font","parser_loaded")],[site]);
 assert.equal(buildServiceOriginLookup(g,"https://example.com/page")(occurrence)[0]?.kind,"site");
 assert.equal(buildServiceOriginLookup(graph([edge("member","site","font","belongs_to_document")],[site]),site.url)(occurrence).length,0);
 assert.equal(buildServiceOriginLookup(g,"https://example.com/other")(occurrence).length,0);
 assert.equal(buildServiceOriginLookup(graph([edge("load","site","font","parser_loaded","inferred")],[site]),site.url)(occurrence).length,0);
});
test("same-service chains may reach the site, but partial references and child frames fail closed", () => {
 const site={id:"site",kind:"document",url:"https://example.com/page"};
 const css={id:"css",kind:"resource",url:"https://fonts.googleapis.com/css2"};
 const edges=[edge("a","site","css","parser_loaded"),edge("b","css","font","parser_loaded")];
 const g=graph(edges,[site,css]);
 assert.equal(buildServiceOriginLookup(g,site.url)(occurrence)[0]?.kind,"site");
 assert.equal(buildServiceOriginLookup(g,site.url)({...occurrence,graphNodeRefs:["font","missing"]}).some(o=>o.kind==="site"),false);
 const nested=graph([...edges,edge("frame","child","site","belongs_to_frame"),edge("parent","outer","child","frame_parent")],[site,css,{id:"child",kind:"frame"},{id:"outer",kind:"frame"}]);
 assert.equal(buildServiceOriginLookup(nested,site.url)(occurrence).some(o=>o.kind==="site"),false);
});
