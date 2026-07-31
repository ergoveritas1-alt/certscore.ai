import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { InfoTip } from "./info-tip";

test("InfoTip renders above neighboring report surfaces with bounded readable copy", () => {
  const html = renderToStaticMarkup(
    createElement(InfoTip, {
      align: "end",
      placement: "top",
      text: "Consent-management, payment, authentication, CDN, functional, or other context-dependent activity."
    })
  );

  assert.match(html, /aria-label="More information"/);
  assert.match(html, /tabindex="0"/);
  assert.match(html, /z-\[80\]/);
  assert.match(html, /max-w-\[min\(18rem,calc\(100vw-2rem\)\)\]/);
  assert.match(html, /whitespace-normal/);
  assert.match(html, /break-words/);
  assert.match(html, /bottom-full mb-2/);
  assert.match(html, /group-focus-within\/tooltip:block/);
});
