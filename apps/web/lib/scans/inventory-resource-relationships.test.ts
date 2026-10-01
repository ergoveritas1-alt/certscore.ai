import assert from "node:assert/strict";
import test from "node:test";
import type { ApiRuntimeEvidenceGraph } from "@certscore/api-contracts";
import { countInventoryResourceChildren, createInventoryRelationshipCounter, type InventoryResourceIdentity } from "./inventory-resource-relationships";

test("indexed relationships preserve exact refs, endpoint aliases, product boundaries and unique children", () => {
  const graph = {nodes: [
    {id:"a",kind:"request",url:"https://www.example.com/track?q=1",method:"GET",classification:{basis:"canonical_registry",product:"Example Analytics"}},
    {id:"b",kind:"request",url:"https://example.com/track",method:"GET"},
    {id:"c",kind:"request",url:"https://sub.example.com/track",method:"GET",classification:{basis:"canonical_registry",product:"Example Ads"}},
    {id:"d",kind:"cookie"},
    {id:"e",kind:"request",url:"https://example.com/track",method:"POST"},
  ],edges:[{from:"a",to:"x"},{from:"b",to:"x"},{from:"a",to:"y"},{from:"c",to:"z"},{from:"d",to:"w"},{from:"e",to:"p"},{from:"missing",to:"bad"}]} as unknown as ApiRuntimeEvidenceGraph;
  const count = createInventoryRelationshipCounter(graph);
  const identities: InventoryResourceIdentity[] = [
    {cookieRefs:[],requests:[{hostname:" EXAMPLE.COM ",path:"/track",method:"GET"}]},
    {cookieRefs:["d"],nodeRefs:["a","missing"],requests:[]},
    {cookieRefs:[],requests:[],products:[" example   analytics "]},
    {cookieRefs:[],requests:[{hostname:"example.com",path:"/other",method:"GET"}],products:["Example Analytics"]},
    {cookieRefs:[],requests:[{hostname:"sub.example.com",path:"/track",method:"GET"}]},
    {cookieRefs:[],requests:[{hostname:"example.com",path:"/track",method:"POST"}]},
    {cookieRefs:[],requests:[],products:["Example"]},
  ];
  for (const identity of identities) assert.equal(count(identity), countInventoryResourceChildren(graph,identity));
  assert.equal(count(identities[0]!),2);
  assert.equal(count(identities[1]!),3);
  assert.equal(count(identities[3]!),0);
});
