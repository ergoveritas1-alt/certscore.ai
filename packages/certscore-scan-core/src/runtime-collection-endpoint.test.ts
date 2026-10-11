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
