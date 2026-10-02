import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FullSiteServices, summarizeService } from "./full-site-services-table";
import { describeCrawlService } from "../../lib/scans/full-site-resource-context";

type Resource = Parameters<typeof summarizeService>[0][number];
const resource = (priority: string, time: number | null, domain: string | null, relationships: string[]) => ({ inventoryEvidence: priority, occurrence: { firstSeenMs: time, domain }, relationships }) as Resource;

test("service summaries use member classifications and page-relative observations", () => {
  const result = summarizeService([
    resource("Essential", 80, "a.example", ["first_party"]),
    resource("Review", 0, "b.example", ["third_party"]),
    resource("Non-essential", 200, "a.example", ["third_party"]),
    resource("Non-essential", null, null, []),
  ]);
  assert.equal(result.priority, "Non-essential");
  assert.equal(result.priorityCount, 2);
  assert.equal(result.firstSeen, 0);
  assert.deepEqual(result.domains, ["a.example", "b.example"]);
  assert.equal(result.relationship, "Mixed");
  assert.match(result.relationshipHint, /some site relationships are not available/);
});
test("missing facts remain unavailable and contextual precedes essential", () => {
  const empty = summarizeService([resource("unknown", null, null, [])]);
  assert.equal(empty.priority, undefined);
  assert.equal(empty.firstSeen, undefined);
  assert.equal(empty.relationship, undefined);
  assert.deepEqual(empty.domains, []);
  assert.equal(summarizeService([resource("Essential", null, null, []), resource("Contextual", null, null, [])]).priority, "Contextual");
});

test("an unresolved fonts-only inventory stays behind the unattributed disclosure", () => {
  const context = describeCrawlService({ product: "Google Fonts", vendor: "Google", entity: "Google LLC", registryVersion: "test" }, []);
  const font = { ...resource("Review", 100, "fonts.googleapis.com", ["third_party"]), key: "font", name: "font", kind: "request", pageIds: ["p"], eventCount: 1, purposes: [], context };
  const fonts = { key: "fonts", name: "Google Fonts", context, resources: [font], pageIds: ["p"], purposes: [], origins: [] };
  const render = (services: Parameters<typeof FullSiteServices>[0]["services"]) => renderToStaticMarkup(createElement(FullSiteServices, { services, pageName: () => "https://example.com", pageChoices: [] }));
  const html = render([fonts]);
  assert.match(html, /Unattributed resources \(1\)/);
  assert.doesNotMatch(html, /Expand Google Fonts/);
  assert.match(html, /Loading origins could not be verified/);
  const direct = render([{...fonts, origins: [{ key: "site:document", kind: "site", name: "Site document", nodeId: "document", edgeIds: ["load"], inferred: false, pageId: "p", occurrenceId: "request", eventCount: 1, resourceKey: "font" }]}]);
  assert.match(direct, /Expand Google Fonts/);
  assert.doesNotMatch(direct, /Unattributed resources \(1\)/);
});
