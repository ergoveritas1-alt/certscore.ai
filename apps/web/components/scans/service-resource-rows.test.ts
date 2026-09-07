import assert from "node:assert/strict";
import test from "node:test";
import { runtimeGraphUiFixture } from "./runtime-evidence-graph-ui-fixture";
import { serviceResourceLinks } from "./service-resource-rows";

test("service resource links retain parents and children without counting duplicate observations", () => {
  const graph = runtimeGraphUiFixture().graphs[0]!;
  graph.edges.push({ ...graph.edges.find(edge => edge.id === "e3")!, id: "duplicate" });
  const links = serviceResourceLinks(graph, ["request"]);
  assert.deepEqual(links.map(link => [link.direction, link.node.id]).sort(), [["Child", "response"], ["Parent", "document"], ["Parent", "widget"]]);
  assert.equal(links.find(link => link.node.id === "widget")?.edge.relation, "initiated_by");
  assert.equal(serviceResourceLinks(graph, ["missing"]).length, 0);
});

test("multi-occurrence roots exclude internal links and ignore dangling graph references", () => {
  const graph = runtimeGraphUiFixture().graphs[0]!;
  graph.edges.push({ ...graph.edges.find(edge => edge.id === "e3")!, id: "dangling", to: "not-retained" });
  const links = serviceResourceLinks(graph, ["request", "response"]);
  assert.deepEqual(links.map(link => link.node.id).sort(), ["cookie", "document", "widget"]);
});

test("bidirectional links preserve direction so cycles can be labeled and stopped by the row path", () => {
  const graph = runtimeGraphUiFixture().graphs[0]!;
  graph.edges.push({ ...graph.edges.find(edge => edge.id === "e3")!, id: "back", from: "response", to: "request" });
  assert.deepEqual(serviceResourceLinks(graph, ["request"]).filter(link => link.node.id === "response").map(link => link.direction).sort(), ["Child", "Parent"]);
});
