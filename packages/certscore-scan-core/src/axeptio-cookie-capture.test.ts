import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { cookieEventSchema } from "@certscore/contracts";
import { COOKIE_PURPOSE_POLICY } from "@certscore/vendor-resolver";
import { createArtifactWriter } from "./artifact-writer";
import { preConsentRuntimeScanner } from "./scanners/pre-consent-runtime-scanner";
import { classifyCookieEvents } from "./journey-builder";

test("runtime producer retains exact preference-cookie policy through journey classification", async () => {
  const names = ["axeptio_cookies", "axeptio_all_vendors", "axeptio_authorized_vendors", "cookieyes-consent"];
  const server = createServer((_request, response) => {
    response.setHeader("content-type", "text/html");
    response.setHeader("set-cookie", [...names, "axeptio_unknown", "_ga", "aws-waf-token", "GCLB", "country"].map(name => `${name}=fixture; Path=/; SameSite=Lax`));
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
        assert.equal(event.cookieClassification?.version, COOKIE_PURPOSE_POLICY);
        assert.equal(event.cookieClassification?.cookieName, name);
        assert.ok(event.cookieEssentialityReasonCodes?.includes(`cookie_purpose_policy:${COOKIE_PURPOSE_POLICY}`));
      }
    }
    assert.equal(events.find(event => event.cookieName === "_ga")?.cookieEssentiality, "non_essential");
    assert.equal(events.find(event => event.cookieName === "axeptio_unknown")?.cookieEssentiality, "unknown");
    assert.equal(events.find(event => event.cookieName === "country")?.cookieEssentiality, "unknown", "a local fixture cannot claim the documented OpenAI cookie domain");
    for (const [name, purpose, essentiality] of [["aws-waf-token", "security", "essential"], ["GCLB", "infrastructure", "unknown"]]) {
      const event = events.find(event => event.cookieName === name);
      assert.ok(event);
      assert.equal(cookieEventSchema.parse(event).cookiePurpose, purpose);
      assert.equal(event.cookieEssentiality, essentiality);
      assert.ok(event.cookieEssentialityReasonCodes?.includes(`cookie_purpose_policy:${COOKIE_PURPOSE_POLICY}`));
    }
    const ga = events.find(event => event.cookieName === "_ga")!;
    const corrupt = classifyCookieEvents([{ ...ga, cookiePurpose: "unknown" }], [])[0]!;
    assert.equal(corrupt.cookiePurpose, "unknown");
    assert.equal(corrupt.cookieEssentiality, "unknown");
    const unrelated = { observationId: "other-domain", matchedEvidenceIds: ["other-event"],
      matchedCookieNames: [ga.cookieName], purpose: "analytics", vendor: "Other provider" } as never;
    const unbound = classifyCookieEvents([{ ...ga, cookieClassification: undefined }], [unrelated])[0]!;
    assert.equal(unbound.cookiePurpose, "unknown");
    assert.equal(unbound.vendorAssociated, false, "a same-name cookie cannot borrow another event's provider");
    const legacy = events.filter(event => names.includes(event.cookieName)).map(event => ({ ...event,
      cookieClassification: undefined, cookiePurpose: "unknown" as const, cookieEssentiality: "unknown" as const, cookieEssentialityReasonCodes: [] }));
    assert.ok(classifyCookieEvents(legacy, []).every(event => event.cookiePurpose === "unknown"));
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await rm(outDir, { recursive: true, force: true });
  }
});
