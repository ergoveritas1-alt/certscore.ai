import assert from "node:assert/strict";
import test from "node:test";
import { apiRuntimeEvidenceGraphProjectionSchema, apiRuntimeEvidenceGraphSchema } from "./runtime-evidence-graph.js";
import { runtimeEvidenceGraphOpenApiSchemas as docs } from "./runtime-evidence-graph-openapi.js";

test("OpenAPI documents every public graph field and bounded relationship enum", () => {
  const graph = apiRuntimeEvidenceGraphSchema.innerType().shape;
  assert.deepEqual(Object.keys(docs.RuntimeEvidenceGraph.properties).sort(), Object.keys(graph).sort());
  assert.deepEqual(Object.keys(docs.RuntimeEvidenceGraphNode.properties).sort(), Object.keys(graph.nodes.element.shape).sort());
  assert.deepEqual(Object.keys(docs.RuntimeEvidenceGraphProjection.properties).sort(), Object.keys(apiRuntimeEvidenceGraphProjectionSchema.innerType().shape).sort());
  assert.deepEqual(docs.RuntimeEvidenceGraph.properties.edges.items.properties.relation.enum, graph.edges.element.shape.relation.options);
  assert.deepEqual(docs.RuntimeEvidenceGraphNode.properties.kind.enum, graph.nodes.element.shape.kind.options);
  assert.equal(docs.RuntimeEvidenceGraph.properties.nodes.maxItems, graph.nodes._def.maxLength?.value);
  assert.equal(docs.RuntimeEvidenceGraph.properties.edges.maxItems, graph.edges._def.maxLength?.value);
});
