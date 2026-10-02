import { FullSiteExecutiveSummary } from "../../../components/scans/full-site-executive-summary";
import { ReportInventorySummary } from "../../../components/scans/report-inventory-summary";
import { ReportInventoryNavigation } from "../../../components/scans/report-inventory-navigation";
import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { SinglePageResourceInventory } from "../../../components/scans/single-page-resource-inventory";
import { SHADOW_REPORT } from "../../../components/scans/report-lab/shadow-report-data";
import { inventoryLayoutFixture } from "./inventory-fixture";

test("current preview uses service groups and consistent distinct-resource totals", () => {
  const fixture = inventoryLayoutFixture("supplied", SHADOW_REPORT.scan.id);
  const html = renderToStaticMarkup(<SinglePageResourceInventory inventory={fixture.inventory} report={{ ...SHADOW_REPORT, inventorySummary: fixture.metrics }} />);
  assert.match(html, /199 distinct resources = 196 requests \+ 3 embedded frames\. Services group these resources\./);
  assert.equal(fixture.inventory.resources.length, 199);
  assert.equal(fixture.inventory.services.length, 7);
  assert.match(html, /6 distinct services, including child services/);
  // This fixture identifies fonts but retains no loading-origin proof.
  assert.doesNotMatch(html, /Expand Google Fonts/);
  assert.match(html, /Unattributed resources/);
  assert.match(html, /Google Static Assets/);
  assert.equal(fixture.metrics[1]?.overview?.identifiedServices, 6);
  assert.equal(fixture.metrics[1]?.overview?.distinctResources, 196);
  const overview = fixture.metrics[1]!.overview!;
  assert.equal(overview.distinctEmbeds, 3);
  assert.deepEqual(overview.distinctClassifications?.requests, { nonEssential: 0, review: 46, unclassified: 74, contextual: 76, essential: 0 });
  assert.equal(overview.distinctClassifications?.embeds.contextual, 3);
  const summary = renderToStaticMarkup(<ReportInventorySummary metrics={fixture.metrics} />);
  assert.doesNotMatch(summary, /805|205|296|304|>13<|Request events|Frame observations/);
  assert.equal(fixture.metrics[2]!.value, 13); // Source event counts are preserved independently of display totals.
  assert.equal(overview.distinctResources + overview.distinctStorage + overview.distinctEmbeds, fixture.inventory.resources.length);
  for (const mix of Object.values(fixture.inventory.mix)) assert.equal(mix?.reduce((sum, row) => sum + row.count, 0), 199);
  for (const label of ["Services", "Resources", "Services and their member resources", "Policy disclosure", "Location", "Type mix", "Evidence mix", "Purpose mix", "Site relationship", "Google Maps", "YouTube", "Collapse all"]) assert.ok(html.includes(label), label);
  assert.doesNotMatch(html, /compact-resource-inventory/);
});

test("empty and large current-table fixtures keep their totals consistent", () => {
  const empty = inventoryLayoutFixture("empty", "page");
  assert.equal(empty.inventory.resources.length, 0);
  assert.equal(empty.inventory.services.length, 0);
  const large = inventoryLayoutFixture("large", "page");
  assert.equal(large.metrics[1]?.overview?.identifiedServices, 48);
  assert.equal(large.metrics[1]?.overview?.distinctResources, 240);
});


test("overview owns the only inventory summary while the table and breakdowns remain below", () => {
  const fixture = inventoryLayoutFixture("supplied", SHADOW_REPORT.scan.id);
  const report = { ...SHADOW_REPORT, inventorySummary: fixture.metrics };
  const html = renderToStaticMarkup(<ReportInventoryNavigation>
    <FullSiteExecutiveSummary pending={false} scannedPages={10} inventorySummary={<ReportInventorySummary metrics={fixture.metrics} />} />
    <SinglePageResourceInventory inventory={fixture.inventory} report={report} />
  </ReportInventoryNavigation>);
  assert.equal((html.match(/aria-label="Inventory summary"/g) ?? []).length, 1);
  assert.ok(html.indexOf('aria-label="Inventory summary"') < html.indexOf('id="report-resource-inventory"'));
  assert.doesNotMatch(html, /Pre-consent privacy evidence/);
  assert.match(html, /Resource counts &amp; classifications/);
  assert.match(html, /Resource breakdowns/);
  assert.match(html, /Services and their member resources/);
  for (const action of ["View services", "Explore requests", "Explore cookies and storage", "Explore embedded frames"]) assert.ok(!html.includes(`aria-label="${action}"`), `${action} shortcut remains removed`);
});
