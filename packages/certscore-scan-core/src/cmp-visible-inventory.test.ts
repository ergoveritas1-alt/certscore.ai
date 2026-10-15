import assert from "node:assert/strict";
import test from "node:test";
import { chromium } from "playwright";
import { readVisibleCmpInventory } from "./cmp-visible-inventory.js";
import { projectVisibleCmpInventory, cmpVisibleInventorySchema } from "@certscore/contracts";

test("shared labelled inventory preserves literal fields across shadow tables, definition cards and ARIA tables", async () => {
  const browser = await chromium.launch({headless: true});
  try {
    const page = await browser.newPage();
    await page.setContent(`<section id="panel"><table><tbody>
      <tr><th>Cookie name</th><th>Provider</th><th>Purpose</th><th>Duration</th></tr>
      <tr><td>_ga</td><td>Google Analytics</td><td>Audience measurement</td><td>2 years</td></tr></tbody></table>
      <dl><div><dt>Cookie name</dt><dd>session</dd><dt>Provider</dt><dd>Example Service</dd><dt>Description</dt><dd>Account session</dd><dt>Expiry</dt><dd>Session</dd></div></dl>
      <div id="shadow"></div></section>`);
    await page.locator("#shadow").evaluate(e => { e.attachShadow({mode:"open"}).innerHTML = '<div role="table"><div role="row"><span role="columnheader">Cookie name</span><span role="columnheader">Vendor</span><span role="columnheader">Purpose</span></div><div role="row"><span role="cell">pref</span><span role="cell">Preference Service</span><span role="cell">Remember settings</span></div></div>'; });
    const result = await readVisibleCmpInventory(page.locator("#panel"));
    const projected = projectVisibleCmpInventory(result);
    assert.deepEqual(projected.declarations.map(row => [row.name,row.purpose,row.duration]), [
      ["_ga", "Audience measurement", "2 years"], ["session", "Account session", "Session"], ["pref", "Remember settings", ""],
    ]);
    assert.deepEqual(projected.services.map(row => row.name), ["Google Analytics", "Example Service", "Preference Service"]);
    assert.ok(projected.services.every(row => row.source === "cmp_visible_inventory" && row.sourceRef));
    assert.equal(result.truncated, false);
    assert.equal(result.unresolvedRecords, 0);
  } finally { await browser.close(); }
});

test("hidden, ambiguous, merged and unlabelled inventories do not manufacture records or services", async () => {
  const browser = await chromium.launch({headless:true});
  try {
    const page = await browser.newPage();
    for (const mode of ["hidden", "transparent", "aria-hidden", "duplicate", "merged", "unlabelled", "nested-hidden"]) {
      const style = mode === "hidden" ? 'hidden' : mode === "transparent" ? 'style="opacity:0"' : mode === "aria-hidden" ? 'aria-hidden="true"' : '';
      await page.setContent(`<section id="panel"><div ${style}><table>
      <tr><th>${mode === "unlabelled" ? "Name" : "Cookie name"}</th><th>${mode === "duplicate" ? "Cookie name" : mode === "unlabelled" ? "Company" : "Provider"}</th></tr>
      <tr><td ${mode === "merged" ? 'colspan="2"' : ''}>_ga</td><td ${mode === "nested-hidden" ? 'style="visibility:hidden"' : ''}>Google Analytics</td></tr></table></div></section>`);
      const inventory = await readVisibleCmpInventory(page.locator("#panel"));
      assert.deepEqual(inventory.records, [], mode);
    }
    await page.setContent('<section id="panel"><dl><dt>Cookie name</dt><dd>_ga</dd><dt>Provider</dt><dd>google.com</dd><dt>Purpose</dt><dd>Analytics category</dd></dl></section>');
    const sample = projectVisibleCmpInventory(await readVisibleCmpInventory(page.locator("#panel")));
    assert.equal(sample.services.length, 0, "a host is not a named service");
    assert.equal(sample.declarations.length, 1);
  } finally { await browser.close(); }
});

test("shared visible inventory caps records and text and rejects forged field mappings", async () => {
  const browser = await chromium.launch({headless:true});
  try {
    const page = await browser.newPage();
    await page.setContent('<section id="panel"><table><tr><th>Cookie name</th><th>Purpose</th></tr><tr><td><code>_ga</code><br>Cookie annotation</td><td>'+ 'x'.repeat(400) +'</td></tr></table></section>');
    const excerpt = await readVisibleCmpInventory(page.locator("#panel"));
    assert.equal(excerpt.truncated, true);
    assert.equal(projectVisibleCmpInventory(excerpt).declarations[0]?.name, "_ga");
    assert.equal(projectVisibleCmpInventory(excerpt).declarations[0]?.purpose.length, 240);
    await page.setContent('<section id="panel"><table><tr><th>Cookie name</th><th>Purpose</th></tr>'+Array.from({length:120},(_,i)=>`<tr><td>cookie${i}</td><td>${'x'.repeat(220)}</td></tr>`).join('')+'</table></section>');
    const inventory = await readVisibleCmpInventory(page.locator("#panel"));
    assert.equal(inventory.truncated,true); assert.ok(inventory.records.length <= 100);
    const forged = structuredClone(inventory);
    forged.records[0]!.fields[0]!.label = "Unrelated title";
    assert.equal(cmpVisibleInventorySchema.safeParse(forged).success,false);
    assert.equal(cmpVisibleInventorySchema.safeParse({...inventory, complete:true}).success,false);
  } finally { await browser.close(); }
});
