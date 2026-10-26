import assert from "node:assert/strict";
import test from "node:test";
import { classifyRuntimeErrorPage } from "./runtime-error-page";
import { brandedSoft404, brandedInterruption } from "./test-fixtures/runtime-error-pages";

test("the complete retained regional-unavailability shell is an access block", () => {
  const shell = "OOPS!!!\nWE ARE CURRENTLY NOT AVAILABLE IN YOUR REGION.";
  assert.equal(classifyRuntimeErrorPage(shell), "unsupported_region");
  for (const text of [
    `Regional troubleshooting guide: ${shell}`,
    `${shell} Browse our available products below.`,
    `“${shell}”`,
    `${shell}${" ".repeat(4096)}Our public content remains available.`,
  ]) assert.equal(classifyRuntimeErrorPage(text), undefined);
});

test("reviewed branded page states survive navigation longer than the evidence quote", () => {
  assert.ok(brandedSoft404.indexOf("404") > 360);
  assert.equal(classifyRuntimeErrorPage(brandedSoft404), "not_found_404");
  assert.equal(classifyRuntimeErrorPage(brandedInterruption), "maintenance_or_unavailable");
  assert.equal(classifyRuntimeErrorPage(brandedSoft404.replaceAll("’", "'")), "not_found_404");
});

test("error templates require current-page context and stay bounded", () => {
  for (const text of [
    "Our public documentation explains how to customize a 404 page.",
    `Troubleshooting guide: ${brandedSoft404}`,
    `Example\n${brandedSoft404}`,
    `Article: “${brandedInterruption}” Our systems are working normally.`,
    `${brandedInterruption}\nThis quoted example demonstrates the previous outage.`,
    brandedSoft404.replace("This page doesn’t exist, or you can’t access it.", "Browse our public products and documentation."),
    `${"Navigation ".repeat(500)}${brandedSoft404}`,
    "", undefined,
  ]) assert.equal(classifyRuntimeErrorPage(text), undefined, text);
});
