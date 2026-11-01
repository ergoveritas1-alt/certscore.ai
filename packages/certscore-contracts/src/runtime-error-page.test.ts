import assert from "node:assert/strict";
import test from "node:test";
import { classifyRuntimeErrorPage } from "./runtime-error-page";
import { brandedSoft404, brandedInterruption } from "./test-fixtures/runtime-error-pages";
import { retainedYandexChallenge, retainedRadwareChallenge } from "./test-fixtures/runtime-challenge-pages";

const redirectNotice = "You will be automatically re-directed to our consumer site momentarily, or you may navigate to Alaska Communications content at our new location by following this link:\n\nhttp://www.alaskacommunications.com/";

test("a complete browser-verification shell requires its incident identifier and no substantive content", () => {
  const shell="Verifying your browser before proceeding...\n\nIncident ID: d005b52c-dxzu-4f00-a40c-48c85e3abb67";
  assert.equal(classifyRuntimeErrorPage(shell),"captcha_or_challenge");
  for(const text of [`Guide: ${shell}`,`“${shell}”`,`${shell}\nOur products are available`,"Verifying your browser before proceeding...",`Incident ID: sample ${"x".repeat(512)}`])
    assert.equal(classifyRuntimeErrorPage(text),undefined);
});

test("retained CAPTCHA templates remain separate from quoted instructions and substantive pages", () => {
  for(const shell of [retainedYandexChallenge,retainedRadwareChallenge]){
    assert.equal(classifyRuntimeErrorPage(shell),"captcha_or_challenge");
    for(const text of [`Guide: ${shell}`,`“${shell}”`,`${shell}\nPublic products and services`,shell.replace("are automated.","are available.").replace("made us think that you are a bot.","show our products and services.")])
      assert.equal(classifyRuntimeErrorPage(text),undefined);
  }
});

test("the complete retained redirect notice is not a captured destination page", () => {
  assert.equal(classifyRuntimeErrorPage(redirectNotice), "redirect_only_page");
  assert.equal(classifyRuntimeErrorPage(redirectNotice.replace("Alaska Communications", "Example Company").replace("http://www.alaskacommunications.com/", "https://destination.example/")), "redirect_only_page");
  for (const text of [
    `Article: ${redirectNotice}`, `“${redirectNotice}”`, `${redirectNotice}\nOur products and services`,
    redirectNotice.replace("http://www.alaskacommunications.com/", "https://user:secret@example.com/"),
    redirectNotice.replace("http://www.alaskacommunications.com/", "https://"),
    redirectNotice.replace("http://www.alaskacommunications.com/", "javascript:open()"),
    `${redirectNotice}${" ".repeat(512)}More content`,
    "Visit our new website: https://destination.example/",
  ]) assert.equal(classifyRuntimeErrorPage(text), undefined, text);
});

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
