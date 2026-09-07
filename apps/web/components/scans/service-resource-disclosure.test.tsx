import React from "react";
import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ServiceResourceRows } from "./service-resource-rows";
import { InventoryResourceProvider } from "./inventory-resource-details";
import { runtimeGraphUiFixture } from "./runtime-evidence-graph-ui-fixture";

Object.assign(globalThis, { React });

test("resource graph button requires resolved displayable links, including parent-only links", () => {
  const graph = runtimeGraphUiFixture();
  const row = {name:"Fixture",kind:"request",eventCount:1,pageIds:[],purposes:[],relationships:[],occurrence:{kind:"request",label:"Fixture",details:{},evidenceRefs:[],graphNodeRefs:["request"]}} as unknown as React.ComponentProps<typeof ServiceResourceRows>["row"];
  const render = (projection?: typeof graph) => renderToStaticMarkup(<InventoryResourceProvider projection={projection}><table><tbody><ServiceResourceRows row={row} pageName={id=>id}/></tbody></table></InventoryResourceProvider>);
  assert.doesNotMatch(render(), /Show related resources/);
  assert.match(render(graph), /Show related resources/);
  const parentOnly = structuredClone(graph);
  parentOnly.graphs[0]!.edges = parentOnly.graphs[0]!.edges.filter(edge=>edge.to === "request");
  assert.match(render(parentOnly), /Show related resources/);
  const empty = structuredClone(graph);
  empty.graphs[0]!.edges = [];
  assert.doesNotMatch(render(empty), /Show related resources/);
  row.occurrence.graphNodeRefs = ["missing"];
  assert.doesNotMatch(render(graph), /Show related resources/);
});
