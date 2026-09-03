import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { VendorBrandChip, VendorBrandLogo } from "./vendor-brand-chip";

test("VendorBrandChip renders cached logos for known vendors and host aliases", () => {
  const html = renderToStaticMarkup(
    createElement("div", null, [
      createElement(VendorBrandChip, { key: "google", label: "securepubads.g.doubleclick.net", suffix: "domain" }),
      createElement(VendorBrandChip, { key: "meta", label: "Meta Pixel", suffix: "vendor" }),
      createElement(VendorBrandChip, { key: "dv", label: "vtrk.dv.tech", suffix: "domain" }),
      createElement(VendorBrandChip, { key: "rubicon", label: "micro.rubiconproject.com", suffix: "domain" }),
      createElement(VendorBrandChip, { key: "adobe", label: "assets.adobedtm.com", suffix: "domain" }),
      createElement(VendorBrandChip, { key: "jw", label: "cdn.jwplayer.com", suffix: "domain" }),
      createElement(VendorBrandChip, { key: "vudu", label: "images2.vudu.com", suffix: "domain" })
    ])
  );

  assert.match(html, /\/vendor-logos\/google\.png/);
  assert.match(html, /\/vendor-logos\/facebook\.png/);
  assert.match(html, /\/vendor-logos\/doubleverify\.png/);
  assert.match(html, /\/vendor-logos\/magnite\.png/);
  assert.match(html, /\/vendor-logos\/adobe\.png/);
  assert.match(html, /\/vendor-logos\/jwplayer\.png/);
  assert.match(html, /\/vendor-logos\/vudu\.png/);
});

test("VendorBrandChip falls back to favicon lookup for unknown host-like labels", () => {
  const html = renderToStaticMarkup(
    createElement(VendorBrandChip, { label: "app.mps.vsnt.net", suffix: "domain" })
  );

  assert.match(html, /https:\/\/www\.google\.com\/s2\/favicons\?domain=app\.mps\.vsnt\.net&amp;sz=64/);
});

test("VendorBrandChip caps long labels and preserves the full value in the title", () => {
  const label = "68547f8f-2fd8-4ff3-9b63-51e86e2edee8.edge.permutive.ap";
  const html = renderToStaticMarkup(
    createElement(VendorBrandChip, { label, suffix: "domain" })
  );

  assert.match(html, /68547f8f-2fd8-4ff3-9b6\.\.\./);
  assert.match(html, /title="68547f8f-2fd8-4ff3-9b63-51e86e2edee8\.edge\.permutive\.ap"/);
  assert.doesNotMatch(html, />68547f8f-2fd8-4ff3-9b63-51e86e2edee8\.edge\.permutive\.ap</);
});

test("VendorBrandLogo renders a known CMP logo and stays empty when no logo is available", () => {
  const knownHtml = renderToStaticMarkup(
    createElement(VendorBrandLogo, { label: "OneTrust" })
  );
  const unknownHtml = renderToStaticMarkup(
    createElement(VendorBrandLogo, { label: "Consent platform not identified" })
  );

  assert.match(knownHtml, /\/vendor-logos\/onetrust\.png/);
  assert.equal(unknownHtml, "");
});
