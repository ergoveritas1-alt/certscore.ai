import assert from "node:assert/strict";
import test from "node:test";
import { isCollectionEndpoint } from "./scanners/pre-consent-runtime-scanner";

test("vendor script, stylesheet and font downloads are not collection endpoints", () => {
  for (const [url, type] of [
    ["https://www.google-analytics.com/analytics.js", "script"],
    ["https://static.hotjar.com/c/hotjar-123.js?sv=7", "script"],
    ["https://edge.fullstory.com/s/fs.js", "script"],
    // Retained GPC packets label these vendor SDK downloads as fetch.
    ["https://www.google-analytics.com/analytics.js", "fetch"],
    ["https://static.hotjar.com/c/hotjar-123.js?sv=7", "fetch"],
    ["https://edge.fullstory.com/s/fs.js", "fetch"],
    ["https://www.google-analytics.com/analytics.js", "xhr"],
    ["https://analytics.tiktok.com/i18n/pixel/events.js", "script"],
    ["https://www.google-analytics.com/module.mjs?collect=1", "script"],
    ["https://www.google-analytics.com/analytics.css", "stylesheet"],
    ["https://www.google-analytics.com/analytics.woff2", "font"],
  ]) assert.equal(isCollectionEndpoint(url!, type!).observed, false, url);
});

test("actual collection requests survive script-resource exclusions", () => {
  for (const [url, type] of [
    ["https://www.google-analytics.com/g/collect?v=2", "fetch"],
    ["https://www.google-analytics.com/collect?filename=analytics.js", "image"],
    ["https://www.facebook.com/tr/?id=123", "image"],
    ["https://c.clarity.ms/collect", "xhr"],
    ["https://www.google.com/pagead/conversion/123/", "script"],
    ["https://www.google-analytics.com/j/collect", "script"],
  ]) assert.equal(isCollectionEndpoint(url!, type!).observed, true, url);
  assert.equal(isCollectionEndpoint("https://www.google.com/recaptcha/api.js", "script").observed, false);
});

import { isCanonicalAdvertisingCollectionCandidate } from "@certscore/vendor-resolver";
test("configuration and measurement-support contacts are retained without collection qualification", () => {
  for (const url of ["https://config.aps.amazon-adsystem.com/configs/3219", "https://pagead2.googlesyndication.com/pagead/ping?e=test", "https://www.google.com/ccm/collect?en=page_view"]) {
    assert.equal(isCanonicalAdvertisingCollectionCandidate(url, "fetch"), false, url);
  }
  assert.equal(isCollectionEndpoint("https://config.aps.amazon-adsystem.com/configs/3219", "fetch").category, "vendor_configuration");
  for (const url of ["https://dpm.demdex.net/id", "https://www.google.com/pagead/1p-user-list/123/?npa=1", "https://c.amazon-adsystem.com/aax2/apstag?event=ad"]) {
    assert.equal(isCanonicalAdvertisingCollectionCandidate(url, "fetch"), true, url);
  }
});
