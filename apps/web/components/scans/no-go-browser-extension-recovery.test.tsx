import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NoGoBrowserExtensionRecovery } from "./no-go-browser-extension-recovery";

test("renders the public browser-extension recovery action", () => {
  const html = renderToStaticMarkup(
    <NoGoBrowserExtensionRecovery isTargetSiteState={false} />
  );

  assert.match(html, /Try scanning from Chrome/);
  assert.match(html, /Show instructions/);
  assert.match(html, /\/browser-extension/);
  assert.match(html, /access controls, regional behavior, or browser-specific rendering/);
  assert.doesNotMatch(html, /no-go/i);
});

test("warns that a target-site state can persist in Chrome", () => {
  const html = renderToStaticMarkup(
    <NoGoBrowserExtensionRecovery isTargetSiteState />
  );

  assert.match(html, /same page until the underlying site issue is resolved/);
  assert.doesNotMatch(html, /may help when the hosted scanner encounters access controls/);
});
