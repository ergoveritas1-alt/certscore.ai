import assert from "node:assert/strict";
import test from "node:test";
import { chromium } from "playwright";
import { canonicalConsentSurfacePresent, distinctActionTargets } from "./cmp-action-target.js";

test("confirmation surface requires exact composed ancestry and an available unique scope", async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await page.setContent('<section id="banner" style="display:contents"><button id="choice">Accept</button></section><section id="other"><button>Other</button></section>');
    const control = page.locator("#choice");
    assert.equal(await canonicalConsentSurfacePresent(page, control, "#banner"), true);
    assert.equal(await canonicalConsentSurfacePresent(page, control, "#other"), false);
    assert.equal(await canonicalConsentSurfacePresent(page, control, "section"), false);
    assert.equal(await canonicalConsentSurfacePresent(page, page.locator("button"), "#banner"), false);
    for (const attribute of ["hidden", "inert", "aria-hidden"]) {
      await page.locator("#banner").evaluate((node, attribute) => node.setAttribute(attribute, "true"), attribute);
      assert.equal(await canonicalConsentSurfacePresent(page, control, "#banner"), false, attribute);
      await page.locator("#banner").evaluate((node, attribute) => node.removeAttribute(attribute), attribute);
    }
    await control.evaluate((node) => node.remove());
    assert.equal(await canonicalConsentSurfacePresent(page, control, "#banner"), false);
  } finally { await browser.close(); }
});

test("action aliases require identical live nodes and identical action contracts", async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await page.setContent('<section id="banner"><button id="a" class="accept">Accept all</button><button id="b">Accept all</button><iframe srcdoc="<button id=a>Accept all</button>"></iframe></section>');
    const recipe = { cmpId: "fixture", bannerSelector: "#banner", confirmation: { kind: "local_storage_equals", key: "consent", expectedValue: "granted" } };
    const a = { recipe, control: page.locator("#a") };
    const alias = { recipe, control: page.locator(".accept") };
    const distinct = { recipe, control: page.locator("#b") };
    const run = (matches: typeof a[]) => distinctActionTargets(matches, Date.now() + 2_000);
    assert.equal((await run([a, alias])).length, 1);
    assert.equal((await run([a, distinct])).length, 2);
    assert.equal((await run([a, { ...alias, recipe: { ...recipe, confirmation: { ...recipe.confirmation, expectedValue: "denied" } } }])).length, 2);
    assert.equal((await run([a, { recipe, control: page.frames()[1]!.locator("#a") }])).length, 2);
    assert.equal((await distinctActionTargets([a, alias], Date.now() - 1)).length, 2);
    assert.equal((await distinctActionTargets([a, alias], Date.now() + 2000, AbortSignal.abort())).length, 2);
    await page.locator("#a").evaluate((node) => node.remove());
    assert.equal((await run([a, alias])).length, 2);
  } finally { await browser.close(); }
});

test("keeps ambiguous locator matches and accessible-control recipes fail closed", async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await page.setContent(`
      <section id="banner">
        <button id="one" class="candidate">Accept all</button>
        <button id="two" class="candidate">Accept all</button>
      </section>
    `);
    const recipe = {
      cmpId: "fixture",
      bannerSelector: "#banner",
      controlExpectedNormalizedLabel: "accept all",
      confirmation: { kind: "local_storage_equals", key: "consent", expectedValue: "granted" },
    };

    // A non-unique locator must not be reduced by selecting an arbitrary node.
    const ambiguous = await distinctActionTargets([
      { recipe, control: page.locator("#one") },
      { recipe, control: page.locator(".candidate") },
    ], Date.now() + 2_000);
    assert.equal(ambiguous.length, 2);

    // Accessible-control recipes can resolve to a host/proxy rather than the
    // actual action node, so browser-node equality is insufficient proof.
    const accessibleRecipe = { ...recipe, accessibleControl: { backendNodeId: 42 } };
    const accessible = await distinctActionTargets([
      { recipe: accessibleRecipe, control: page.locator("#one") },
      { recipe: accessibleRecipe, control: page.locator("#one") },
    ], Date.now() + 2_000);
    assert.equal(accessible.length, 2);
  } finally {
    await browser.close();
  }
});
