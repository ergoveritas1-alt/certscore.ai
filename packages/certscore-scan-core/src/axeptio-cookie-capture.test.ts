import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { cookieEventSchema } from "@certscore/contracts";
import { AXEPTIO_COOKIE_PURPOSE_POLICY } from "@certscore/vendor-resolver";
import { createArtifactWriter } from "./artifact-writer";
import { preConsentRuntimeScanner } from "./scanners/pre-consent-runtime-scanner";
import { classifyCookieEvents } from "./journey-builder";

test("runtime producer retains exact preference-cookie policy through journey classification", async () => {
  const names = ["axeptio_cookies", "axeptio_all_vendors", "axeptio_authorized_vendors"];
  const server = createServer((_request, response) => {
    response.setHeader("content-type", "text/html");
    response.setHeader("set-cookie", [...names, "axeptio_unknown", "_ga"].map(name => `${name}=fixture; Path=/; SameSite=Lax`));
    response.end("<!doctype html><title>Cookie capture fixture</title><p>Public website</p>");
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const url = `http://127.0.0.1:${address.port}/`;
  const outDir = await mkdtemp(path.join(tmpdir(), "axeptio-cookie-fixture-"));
  try {
    const result = await preConsentRuntimeScanner({ url, normalizedUrl: url, scanStartedAtMs: Date.now(), internalBudgetMs: 6000,
      artifactWriter: await createArtifactWriter(outDir), captureScope: "runtime_evidence", waitMode: "fast", screenshotMode: "never" });
    const events = classifyCookieEvents(result.cookieEvents, []);
    for (const name of names) {
      const retained = events.filter(event => event.cookieName === name);
      assert.ok(retained.length, result.moduleRun.errors.join("; "));
      for (const event of retained) {
        assert.equal(cookieEventSchema.parse(event).cookiePurpose, "consent_management");
        assert.equal(event.cookieEssentiality, "essential");
        assert.ok(event.cookieEssentialityReasonCodes?.includes(`cookie_purpose_policy:${AXEPTIO_COOKIE_PURPOSE_POLICY}`));
      }
    }
    assert.equal(events.find(event => event.cookieName === "_ga")?.cookieEssentiality, "non_essential");
    assert.equal(events.find(event => event.cookieName === "axeptio_unknown")?.cookieEssentiality, "unknown");
    const legacy = events.filter(event => names.includes(event.cookieName)).map(event => ({ ...event,
      cookiePurpose: "unknown" as const, cookieEssentiality: "unknown" as const, cookieEssentialityReasonCodes: [] }));
    assert.ok(classifyCookieEvents(legacy, []).every(event => event.cookiePurpose === "unknown"));
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await rm(outDir, { recursive: true, force: true });
  }
});
