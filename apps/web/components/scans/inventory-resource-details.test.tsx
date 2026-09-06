import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { readFile } from "node:fs/promises";
import { renderToStaticMarkup } from "react-dom/server";
import { InventoryResourceProvider, InventoryResourceRow, ResourceDetails, matchInventoryResources } from "./inventory-resource-details";
import { runtimeGraphUiFixture } from "./runtime-evidence-graph-ui-fixture";
import { InventoryNameDisclosure } from "./inventory-name-disclosure";

test("missing graphs keep a discoverable relationship explanation instead of removing the icon", () => {
  const html = renderToStaticMarkup(<InventoryResourceProvider><table><tbody><InventoryResourceRow inspect identity={{ cookieRefs: [], requests: [] }} facts={{ name: "Google Fonts" }}><tr><td>Inspect</td><td>Type</td><td>Google</td><td>Google Fonts</td></tr></InventoryResourceRow></tbody></table></InventoryResourceProvider>);
  assert.match(html, /Explain unavailable relationship evidence/);
  assert.match(html, /<span>—<\/span>/);
});

test("evidence details omit search controls and boilerplate but retain fields and pagination", async () => {
  const resources = await readFile(new URL("./inventory-resource-details.tsx", import.meta.url), "utf8");
  const fields = await readFile(new URL("./retained-evidence-fields.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(resources, /Find a resource|Inventory columns describe|<p>Coverage:/);
  assert.doesNotMatch(fields, /Find a field|Exact field names|Only authorized, display-safe|Search · inspect · copy/);
  assert.doesNotMatch(resources, /label="Inventory fields"|All scenario evidence fields/);
  assert.match(resources, /Technical evidence/);
  assert.match(fields, /Next fields/);
  assert.match(fields, /Copy safe evidence JSON/);
  assert.match(fields, /title=\{field.path\}/);
  assert.equal((resources.match(/style=\{\{ paddingLeft: indent \}\}/g) ?? []).length, 2);
  assert.match(resources, /const indent = Math.min\(depth, 3\) \* 12/);
  assert.ok(resources.includes('<span className="sr-only">Site/entity relationship not supplied</span>'));
});

test("resource drawer defaults to summary with one collapsed technical payload and a brief graph limitation", () => {
  const html = renderToStaticMarkup(<ResourceDetails identity={{ cookieRefs: [], requests: [] }} facts={{ name: "Google Maps embed", purpose: "Embedded maps" }} evidence={{ requestDetails: [{ path: "/maps/embed" }], supportingObservations: [{ type: "embed", observedAtMs: 10875 }] }} />);
  assert.match(html, /Resource summary/);
  assert.match(html, /Relationship coverage: no graph retained/);
  assert.match(html, /<details[^>]*data-inventory-technical-evidence="true"/);
  assert.doesNotMatch(html, /<details[^>]* open|Inventory fields|Safe JSON|Evidence scenario|Inventory summary &amp;/);
  assert.equal((html.match(/<pre\b/g) ?? []).length, 1);
  assert.match(html, /maps\/embed/);
  assert.match(html, /10875/);
});

test("retained relationships stay available while full scenario exploration is technical detail", () => {
  const html = renderToStaticMarkup(<InventoryResourceProvider projection={runtimeGraphUiFixture()}><ResourceDetails identity={{ cookieRefs: [], nodeRefs: ["request"], requests: [] }} facts={{ name: "Fixture" }} /></InventoryResourceProvider>);
  assert.match(html, />Relationships</);
  assert.match(html, /Resource evidence scenario/);
  assert.match(html, /All captured resources in this scenario/);
  assert.ok(html.indexOf("All captured resources in this scenario") > html.indexOf("Technical evidence"));
  assert.doesNotMatch(html, /Inventory fields|Safe JSON/);
});

test("compact inventory places links before vendor and preserves full names in popovers", () => {
  const name = "A complete retained resource name";
  const html = renderToStaticMarkup(<InventoryResourceProvider projection={runtimeGraphUiFixture()}><table><tbody><InventoryResourceRow inspect identity={{ cookieRefs: [], nodeRefs: ["request"], requests: [] }} facts={{ name }}><tr><td>Old inspect</td><td>Type</td><td>Vendor</td><td><InventoryNameDisclosure compact fullName={name}/></td></tr></InventoryResourceRow></tbody></table></InventoryResourceProvider>);
  assert.match(html, /aria-label="Inspect A complete retained resource name details"/);
  assert.match(html, /aria-label="Show 1 immediate link; descendants expand separately"/);
  assert.match(html, /title="A complete retained resource name"/);
  assert.match(html, /A complete retained resou\.\.\./);
  assert.match(html, /popover="auto"/);
  assert.match(html, /Full resource name/);
  assert.ok(html.indexOf('aria-label="Show 1 immediate link;') < html.indexOf('>Vendor<'));
  assert.doesNotMatch(html, /connected resources|Old inspect|A complete\.\.\./);
});

test("inventory association requires retained references, endpoint identity, or exact canonical product identity, never vendor", () => {
  const graph = runtimeGraphUiFixture().graphs[0]!;
  assert.deepEqual(matchInventoryResources(graph, { cookieRefs: [], nodeRefs: ["request"], requests: [] }).map(node => node.id), ["request"]);
  assert.equal(matchInventoryResources(graph, { cookieRefs: [], nodeRefs: ["missing-node"], requests: [] }).length, 0);
  assert.deepEqual(matchInventoryResources(graph, { cookieRefs: ["cookie"], requests: [] }).map(node => node.id), ["cookie"]);
  assert.deepEqual(matchInventoryResources(graph, { cookieRefs: [], requests: [{ hostname: "metrics.fixture.test", path: "/collect", method: "GET" }] }).map(node => node.id), ["request"]);
  const wwwGraph = {
    ...graph,
    nodes: graph.nodes.map(node => node.id === "request" ? { ...node, url: "https://www.metrics.fixture.test/collect" } : node),
  };
  const wwwMatches = matchInventoryResources(wwwGraph, { cookieRefs: [], requests: [{ hostname: "metrics.fixture.test", path: "/collect", method: "GET" }] });
  assert.deepEqual(wwwMatches.map(node => node.id), ["request"]);
  assert.equal(wwwGraph.edges.filter(edge => wwwMatches.some(node => node.id === edge.from)).length, 1);
  assert.equal(matchInventoryResources(wwwGraph, { cookieRefs: [], requests: [{ hostname: "cdn.metrics.fixture.test", path: "/collect", method: "GET" }] }).length, 0);
  const productGraph = {
    ...graph,
    nodes: graph.nodes.map(node => node.id === "request" ? { ...node, classification: { vendor: "Example owner", product: "Example CMP", entity: "Example owner, Inc.", purpose: "consent_management", confidence: 1, basis: "canonical_registry" as const, disclosure: "unknown" as const, policyEvidenceRefs: [] } } : node),
  };
  const productMatches = matchInventoryResources(productGraph, { cookieRefs: [], products: ["Example CMP"], requests: [] });
  assert.deepEqual(productMatches.map(node => node.id), ["request"]);
  assert.equal(productGraph.edges.filter(edge => productMatches.some(node => node.id === edge.from)).length, 1);
  assert.equal(matchInventoryResources(productGraph, { cookieRefs: [], products: ["Example owner"], requests: [] }).length, 0);
  assert.equal(matchInventoryResources(graph, { cookieRefs: [], requests: [{ hostname: "metrics.fixture.test", path: "/other", method: "GET" }] }).length, 0);
  assert.equal(matchInventoryResources(graph, { cookieRefs: [], requests: [{ hostname: "metrics.fixture.test", path: "/collect", method: "POST" }] }).length, 0);
});

test("compact relationship icon remains for a canonical product row without endpoint details", () => {
  const projection = runtimeGraphUiFixture();
  const graph = projection.graphs[0]!;
  projection.graphs[0] = {
    ...graph,
    nodes: graph.nodes.map(node => node.id === "request" ? { ...node, classification: { vendor: "Example owner", product: "Example CMP", entity: "Example owner, Inc.", purpose: "consent_management", confidence: 1, basis: "canonical_registry" as const, disclosure: "unknown" as const, policyEvidenceRefs: [] } } : node),
  };
  const html = renderToStaticMarkup(<InventoryResourceProvider projection={projection}><table><tbody><InventoryResourceRow inspect identity={{ cookieRefs: [], products: ["Example CMP"], requests: [] }} facts={{ name: "Example CMP" }}><tr><td>Inspect</td><td>Type</td><td>Vendor</td><td>Name</td></tr></InventoryResourceRow></tbody></table></InventoryResourceProvider>);
  assert.match(html, /aria-label="Show 1 immediate link; descendants expand separately"/);
});

test("original cells remain unchanged and companion detail rows are collapsed and bound for sorting", () => {
  const html = renderToStaticMarkup(<InventoryResourceProvider projection={runtimeGraphUiFixture()}><table><tbody><InventoryResourceRow identity={{ cookieRefs: [], requests: [] }} facts={{ observedAtMs: 0 }}><tr data-inventory-row><td>Original vendor</td><td>Original purpose</td></tr></InventoryResourceRow></tbody></table></InventoryResourceProvider>);
  assert.match(html, /Original vendor/);
  assert.match(html, /Original purpose/);
  assert.match(html, /aria-expanded="false"/);
  assert.match(html, /<tr hidden="" data-resource-detail=/);
  assert.match(html, /colSpan="3"/);
  assert.doesNotMatch(html, /Find a resource/);
});
