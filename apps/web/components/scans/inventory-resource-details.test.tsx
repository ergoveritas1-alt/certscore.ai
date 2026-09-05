import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { readFile } from "node:fs/promises";
import { renderToStaticMarkup } from "react-dom/server";
import { InventoryResourceProvider, InventoryResourceRow, matchInventoryResources } from "./inventory-resource-details";
import { runtimeGraphUiFixture } from "./runtime-evidence-graph-ui-fixture";
import { InventoryNameDisclosure } from "./inventory-name-disclosure";

test("evidence details omit search controls and boilerplate but retain fields and pagination", async () => {
  const resources = await readFile(new URL("./inventory-resource-details.tsx", import.meta.url), "utf8");
  const fields = await readFile(new URL("./retained-evidence-fields.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(resources, /Find a resource|Inventory columns describe|<p>Coverage:/);
  assert.doesNotMatch(fields, /Find a field|Exact field names|Only authorized, display-safe|Search · inspect · copy/);
  assert.match(resources, /All scenario evidence fields/);
  assert.match(fields, /Next fields/);
  assert.match(fields, /Copy safe evidence JSON/);
  assert.match(fields, /title=\{field.path\}/);
  assert.equal((resources.match(/style=\{\{ paddingLeft: indent \}\}/g) ?? []).length, 2);
  assert.match(resources, /const indent = Math.min\(depth, 3\) \* 12/);
  assert.ok(resources.includes('<span className="sr-only">Site/entity relationship not supplied</span>'));
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

test("inventory association requires retained cookie references or request endpoint and method, never vendor", () => {
  const graph = runtimeGraphUiFixture().graphs[0]!;
  assert.deepEqual(matchInventoryResources(graph, { cookieRefs: [], nodeRefs: ["request"], requests: [] }).map(node => node.id), ["request"]);
  assert.equal(matchInventoryResources(graph, { cookieRefs: [], nodeRefs: ["missing-node"], requests: [] }).length, 0);
  assert.deepEqual(matchInventoryResources(graph, { cookieRefs: ["cookie"], requests: [] }).map(node => node.id), ["cookie"]);
  assert.deepEqual(matchInventoryResources(graph, { cookieRefs: [], requests: [{ hostname: "metrics.fixture.test", path: "/collect", method: "GET" }] }).map(node => node.id), ["request"]);
  assert.equal(matchInventoryResources(graph, { cookieRefs: [], requests: [{ hostname: "metrics.fixture.test", path: "/other", method: "GET" }] }).length, 0);
  assert.equal(matchInventoryResources(graph, { cookieRefs: [], requests: [{ hostname: "metrics.fixture.test", path: "/collect", method: "POST" }] }).length, 0);
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
