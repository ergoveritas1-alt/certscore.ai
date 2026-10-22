import assert from "node:assert/strict";
import test from "node:test";
import { runInNewContext } from "node:vm";
import type { Page } from "playwright";
import { readDocumentSiteMetadata } from "./scanners/pre-consent-runtime-scanner";

function fakePage(assets: string[], drift = false) {
  let url = "https://cms.example/";
  const element = (value: string) => ({ getAttribute: () => value });
  return {
    url: () => url,
    evaluate: async (callback: Function, patterns: string[]) => {
      const value = runInNewContext(`(${callback.toString()})(patterns)`, {
        URL, patterns, performance, location: { origin: "https://cms.example" },
        document: { title: "Fixture", documentElement: { lang: "en" }, baseURI: url,
          querySelectorAll: (selector: string) => selector.startsWith("meta") ? [element("Drupal 10.4.2")] : assets.map(element),
        },
      });
      if (drift) url = "https://cms.example/changed";
      return value;
    },
  } as unknown as Page;
}
test("existing DOM read retains bounded CMS paths without query secrets or extra requests", async () => {
  const metadata = await readDocumentSiteMetadata(fakePage([
    "/core/misc/drupal.js?secret=discard#fragment", "/core/misc/drupal.js?duplicate=yes", "https://third.example/core/misc/drupal.js", "/theme.js?version=10.4.2",
    ...Array.from({ length: 10 }, (_, index) => `/typo3conf/ext/test${index}/asset.js`),
  ]));
  assert.equal(metadata?.generators[0], "Drupal 10.4.2");
  assert.equal(metadata?.cmsAssets.length, 6);
  assert.equal(metadata?.cmsAssets[0], "https://cms.example/core/misc/drupal.js");
  assert.equal(metadata?.cmsAssets.some(value => /secret|duplicate|third|theme/.test(value)), false);
});
test("navigation during metadata capture discards the result", async () => {
  assert.equal(await readDocumentSiteMetadata(fakePage(["/core/misc/drupal.js"], true)), null);
});
