import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createArtifactWriter } from "./artifact-writer.js";
import { preConsentRuntimeScanner } from "./scanners/pre-consent-runtime-scanner.js";

for (const slowLayout of [false, true]) {
test(`form notices retain local text and policy links without values or cross-form attribution (${slowLayout ? "slow layout" : "normal layout"})`, { timeout: 60_000 }, async () => {
  const server = createServer((_request, response) => {
    response.setHeader("Content-Type", "text/html");
    response.end(`<!doctype html><title>Contact fixture</title><h1>Contact our support team</h1>
      ${slowLayout ? `<script>
        const original = Element.prototype.getBoundingClientRect;
        const inspected = new WeakSet();
        Element.prototype.getBoundingClientRect = function () {
          if (this.matches('input, textarea') && !inspected.has(this)) {
            inspected.add(this);
            const until = performance.now() + 12;
            while (performance.now() < until) {}
          }
          return original.call(this);
        };
      </script>` : ''}
      <section><form aria-label="Contact"><input name="email" type="email" value="private-value@example.test">
      <label><input type="checkbox">I agree to personal data processing for handling my request. <a href="/privacy?secret=private">Privacy policy</a></label>
      <textarea>private-message-value</textarea></form></section>
      <section><form aria-label="Other"><input name="name"></form><p>Personal data is used for support.</p></section>
      <form aria-label="Unrelated"><input name="search"></form>
      <footer><p>Privacy footer should not be attributed</p></footer>`);
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const url = `http://127.0.0.1:${address.port}/`;
  const root = await mkdtemp(path.join(tmpdir(), "form-disclosure-"));
  try {
    const result = await preConsentRuntimeScanner({ url, normalizedUrl: url, scanStartedAtMs: Date.now(), internalBudgetMs: 10_000,
      artifactWriter: await createArtifactWriter(root), captureScope: "runtime_evidence", screenshotMode: "never", waitMode: "fast" });
    const forms = result.collectionSurfaceInventory?.forms;
    assert.ok(forms, JSON.stringify(result.moduleRun));
    const contact = forms.find(form => form.title === "Contact")?.privacyDisclosure;
    assert.match(contact?.excerpts[0]?.text ?? "", /handling my request/);
    assert.equal(contact?.excerpts[0]?.links[0]?.url, `${url}privacy`);
    assert.equal(forms.find(form => form.title === "Other")?.privacyDisclosure?.excerpts[0]?.association, "adjacent_notice");
    assert.equal(forms.find(form => form.title === "Unrelated")?.privacyDisclosure, undefined);
    assert.doesNotMatch(JSON.stringify(forms.map(form => form.privacyDisclosure)), /private-value|private-message|footer|secret/);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(root, { recursive: true, force: true });
  }
});

}
