import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import PublicScanLoading from "./loading";

test("public scan route loading does not claim report finalization before status is known", () => {
  const html = renderToStaticMarkup(<PublicScanLoading />);

  assert.match(html, /Loading scan status/);
  assert.match(html, /checking the scan.*current stage/i);
  assert.match(html, /Connecting/);
  assert.doesNotMatch(html, /Finishing your report/);
  assert.doesNotMatch(html, /Almost there/);
});
