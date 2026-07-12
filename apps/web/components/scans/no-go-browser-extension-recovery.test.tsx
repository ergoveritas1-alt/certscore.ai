import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NoGoBrowserExtensionRecovery } from "./no-go-browser-extension-recovery";

test("renders the admin recovery action with a bounded scan id", () => {
  const html = renderToStaticMarkup(
    <NoGoBrowserExtensionRecovery isTargetSiteState={false} scanId="scan-123" />
  );

  assert.match(html, /Try scanning from Chrome/);
  assert.match(html, /Show instructions/);
  assert.match(html, /\/app\/browser-scans\/setup\?scanId=scan-123/);
  assert.match(html, /access controls, regional behavior, or browser-specific rendering/);
  assert.doesNotMatch(html, /no-go/i);
});

test("warns that a target-site state can persist in Chrome", () => {
  const html = renderToStaticMarkup(
    <NoGoBrowserExtensionRecovery isTargetSiteState scanId="scan-target-state" />
  );

  assert.match(html, /same page until the underlying site issue is resolved/);
  assert.doesNotMatch(html, /may help when the hosted scanner encounters access controls/);
});
