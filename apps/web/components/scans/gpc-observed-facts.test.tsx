import React from "react";
import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { GpcObservedFacts } from "./gpc-observed-facts";

test("GPC facts are visible directly with no disclosure click or warning banner", () => {
  const html = renderToStaticMarkup(<GpcObservedFacts facts={[
    { label: "Activity with GPC", value: "2 tracking requests observed with GPC" },
    { label: "Site-recorded sale opt-out", value: "Opted out" },
  ]} />);
  assert.match(html, /aria-label="Observed GPC results"/);
  assert.match(html, /2 tracking requests observed with GPC/);
  assert.match(html, /Site-recorded sale opt-out/);
  assert.doesNotMatch(html, /<details|indeterminate|unknown|compliant/i);
  assert.equal(renderToStaticMarkup(<GpcObservedFacts facts={[]} />), "");
});
