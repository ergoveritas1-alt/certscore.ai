import assert from "node:assert/strict";
import test from "node:test";
import { assessTechnologySignals, buildTechnologyInventory, technologyInventorySchema, TECHNOLOGY_INVENTORY_MAX_BYTES, type TechnologySignal } from "./technology-inventory";
const url = "https://fixture.example/";
const signal = (kind: TechnologySignal["kind"], value: string, index = 0, sourceUrl = url): TechnologySignal =>
  ({ kind, value, sourceUrl, sourceRef: "runtime:dom", evidenceRef: `site_integrity:tech-signal:${index}` });

test("all eighteen supplemental identities have deterministic positive fixtures", () => {
  const cases = [
    ["generator", "Ghost 5.10.1", "ghost"], ["generator", "Hugo 0.100.0", "hugo"], ["generator", "Webflow", "webflow"],
    ["generator", "HubSpot", "hubspot"], ["generator", "Contentful", "contentful"], ["generator", "WooCommerce 9.1.0", "woocommerce"],
    ["generator", "Next.js 15.1.0", "nextjs"], ["generator", "React 19.0.0", "react"], ["generator", "Vue 3.5.0", "vue"], ["generator", "Nuxt 3.10.0", "nuxt"],
    ["header", "server: nginx/1.26.1", "nginx"], ["header", "server: Apache/2.4.60", "apache"], ["header", "server: Microsoft-IIS/10.0", "iis"],
    ["header", "x-powered-by: PHP/8.3.12", "php"],
    ["header", "server: cloudflare", "cloudflare"], ["header", "via: CloudFront; x-amz-cf-id: present", "cloudfront"],
    ["header", "server: Fastly", "fastly"], ["header", "server: AkamaiGHost", "akamai"],
  ] as const;
  for (const [kind, value, id] of cases) {
    const inventory = buildTechnologyInventory([signal(kind, value)], url);
    assert.equal(inventory.detections[0]?.id, id);
    assert.equal(inventory.detections[0]?.confidence, "high");
    assert.equal(technologyInventorySchema.safeParse(inventory).success, true);
  }
});

test("PHP needs an explicit runtime declaration, never a URL suffix or a CMS implication", () => {
  const declared = assessTechnologySignals([signal("header", "x-powered-by: PHP/8.3.12")], url)[0]!;
  assert.equal(declared.id, "php"); assert.equal(declared.category, "runtime"); assert.equal(declared.version, "8.3.12");
  assert.equal(assessTechnologySignals([signal("header", "x-powered-by: PHP")], url)[0]?.version, null);
  assert.deepEqual(assessTechnologySignals([signal("asset", "/index.php", 0, `${url}index.php`), signal("generator", "WordPress 6.8", 1)], url), []);
  assert.deepEqual(assessTechnologySignals([signal("header", "x-powered-by: PHP/8.3.12-custom")], url), []);
});

test("asset evidence is tentative, scoped to its origin, and supplies no runtime version", () => {
  for (const [path, id] of [["/wp-content/plugins/woocommerce/client.js", "woocommerce"], ["/_next/static/chunks/app.js", "nextjs"],
    ["/_nuxt/entry.js", "nuxt"], ["/react@19.0.0/umd/react.production.min.js", "react"], ["/vue@3.5.0/dist/vue.global.prod.js", "vue"]]) {
    for (const origin of ["https://fixture.example", "https://external.example"]) {
      const row = assessTechnologySignals([signal("asset", path!, 0, `${origin}${path}`)], url)[0]!;
      assert.equal(row.id, id); assert.equal(row.version, null); assert.equal(row.confidence, "tentative");
      assert.equal(row.scope, origin.includes("external") ? "external_asset" : "page_component");
    }
  }
});

test("independent page markers corroborate a framework but repeated paths do not", () => {
  const asset = signal("asset", "/_next/static/app.js", 0, `${url}_next/static/app.js`);
  const marker = signal("marker", 'script#__NEXT_DATA__[type="application/json"]', 1);
  assert.equal(assessTechnologySignals([asset, marker], url)[0]?.confidence, "high");
  assert.equal(assessTechnologySignals([asset, { ...asset, evidenceRef: "site_integrity:tech-signal:1" }], url)[0]?.confidence, "tentative");
  const remote = { ...asset, sourceUrl: "https://external.example/_next/static/app.js" };
  assert.ok(assessTechnologySignals([remote, marker], url).every(row => row.confidence === "tentative"));
});

test("names in prose, lookalikes, unrelated headers and cache versions do not establish identities", () => {
  for (const value of ["We use React 19.0.0", "React plugin 19.0.0", "Ghostwriter 1.2.3", "Hugo 0", "Next.js tutorial", "VueCommerce", "server: cloudflare.example", "x-cache: HIT"]) {
    assert.deepEqual(assessTechnologySignals([signal("generator", value)], url), []);
    assert.deepEqual(assessTechnologySignals([signal("header", value)], url), []);
  }
  for (const path of ["/articles/nextjs.html", "/wp-content/plugins/woocommerce-fake/app.js", "/_next/fake.txt", "/react-example.js", "/preview/vue-settings.js"])
    assert.deepEqual(assessTechnologySignals([signal("asset", path, 0, new URL(path, url).href)], url), []);
  assert.deepEqual(assessTechnologySignals([signal("asset", "/_next/static/app.js", 0, `${url}unrelated.js`)], url), []);
  assert.deepEqual(assessTechnologySignals([signal("asset", "/_next/static/app.js", 0, "not a URL")], url), []);
});

test("conflicts stay explicit while legitimate different technologies coexist", () => {
  const rows = assessTechnologySignals([signal("generator", "React 19.0.0"), signal("generator", "React 18.3.1", 1), signal("generator", "Ghost 5.10.1", 2)], url);
  const react = rows.find(row => row.id === "react")!;
  assert.equal(react.version, null); assert.equal(react.versionStatus, "conflicting");
  assert.deepEqual(react.observedVersions, ["18.3.1", "19.0.0"]);
  assert.equal(rows.find(row => row.id === "ghost")?.version, "5.10.1");
});

test("bounded inventory is reproducible, rejects tampering, and tolerates JSONB ordering", () => {
  const signals = Array.from({ length: 30 }, (_, i) => signal("asset", `/_next/static/${"a".repeat(100)}${i}.js`, i, `${url}_next/static/${"a".repeat(100)}${i}.js`));
  const bounded = buildTechnologyInventory(signals, url);
  assert.ok(bounded.truncated); assert.ok(Buffer.byteLength(JSON.stringify(bounded)) <= TECHNOLOGY_INVENTORY_MAX_BYTES);
  assert.equal(technologyInventorySchema.safeParse(bounded).success, true);
  assert.deepEqual(bounded, buildTechnologyInventory(signals, url));
  const inventory = buildTechnologyInventory([signals[0]!], url);
  assert.equal(technologyInventorySchema.safeParse(inventory).success, true);
  assert.equal(technologyInventorySchema.safeParse({ ...inventory, ruleset: "invented" }).success, false);
  assert.equal(technologyInventorySchema.safeParse({ ...inventory, detections: [{ ...inventory.detections[0], confidence: "high" }] }).success, false);
  const reversed = { ...inventory, detections: inventory.detections.map(row => Object.fromEntries(Object.entries(row).reverse())) };
  assert.equal(technologyInventorySchema.safeParse(reversed).success, true);
  assert.equal(technologyInventorySchema.safeParse({ ...inventory, signals: [...inventory.signals, inventory.signals[0]] }).success, false);
});

test("budget truncation cannot erase a known version conflict or invent corroboration", () => {
  const conflicts = Array.from({ length: 8 }, (_, i) => ({ ...signal("generator", `React 19.0.${i}`, i), sourceRef: "x".repeat(256) }));
  const inventory = buildTechnologyInventory([
    signal("header", "x-powered-by: PHP/8.3.12", 8),
    ...conflicts,
    signal("marker", 'script#__NEXT_DATA__[type="application/json"]', 9),
  ], url);
  assert.equal(inventory.truncated, true);
  const react = inventory.detections.find(row => row.id === "react");
  assert.ok(!react || react.versionStatus === "conflicting" && react.observedVersions.length === 8);
  assert.equal(inventory.detections.find(row => row.id === "php")?.version, "8.3.12");
  assert.equal(inventory.detections.find(row => row.id === "nextjs")?.confidence, "tentative");
  assert.equal(technologyInventorySchema.safeParse(inventory).success, true);
});
