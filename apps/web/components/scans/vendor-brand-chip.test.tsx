import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { VendorBrandChip } from "./vendor-brand-chip";

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
