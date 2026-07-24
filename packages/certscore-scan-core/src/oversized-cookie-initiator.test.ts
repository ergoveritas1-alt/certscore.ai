import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { cookieEventSchema } from "@certscore/contracts";
import { createArtifactWriter } from "./artifact-writer.js";
import { MAX_INITIATOR_URL_CHARS } from "./bounded-initiator-url.js";
import { preConsentRuntimeScanner } from "./scanners/pre-consent-runtime-scanner.js";

test("pre-consent scan retains an oversized cookie initiator without rejecting the artifact", async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), "certscore-oversized-cookie-initiator-"));
  const pageUrl = "https://oversized-initiator.test/";
  const scriptUrl =
    `https://www.google.cz/xjs/${"bootstrap-segment/".repeat(180)}loader.js` +
    "?session_token=must-not-be-retained";
  try {
    const result = await preConsentRuntimeScanner({
      artifactWriter: await createArtifactWriter(tempRoot),
      internalBudgetMs: 8_000,
      normalizedUrl: pageUrl,
      routeFulfillers: [
        {
          urlPattern: /^https:\/\/oversized-initiator\.test\/$/,
          contentType: "text/html",
          body: `<!doctype html><html><body><h1>Public test page</h1><script src="${scriptUrl}"></script></body></html>`,
        },
        {
          urlPattern: /^https:\/\/www\.google\.cz\/xjs\//,
          contentType: "application/javascript",
          body: `document.cookie = "oversized_cookie=1; Path=/; SameSite=Lax";`,
        },
      ],
      scanStartedAtMs: Date.now(),
      screenshotMode: "never",
      url: pageUrl,
      waitMode: "fast",
    });

    const cookie = result.cookieEvents.find((event) => event.cookieName === "oversized_cookie");
    assert.ok(cookie);
    assert.ok(cookie.setterScriptUrl);
    assert.ok(cookie.setterScriptUrl.length <= MAX_INITIATOR_URL_CHARS);
    assert.ok(cookie.initiatorChain?.every((value) => value.length <= MAX_INITIATOR_URL_CHARS));
    assert.doesNotMatch(cookie.setterScriptUrl, /session_token|must-not-be-retained/);
    assert.doesNotThrow(() => cookieEventSchema.array().parse(result.cookieEvents));
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});
