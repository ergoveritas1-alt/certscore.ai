import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import type { sendContactSalesAction as contactAction } from "./send-contact-sales";

test("contact submission requires its own verified challenge before reaching mail delivery", async (t) => {
  const result = await build({
    entryPoints: [fileURLToPath(new URL("./send-contact-sales.ts", import.meta.url))],
    bundle: true,
    write: false,
    format: "cjs",
    platform: "node",
    packages: "external",
    plugins: [{
      name: "mock-next-navigation",
      setup(build) {
        build.onResolve({ filter: /^(next\/navigation|server-only)$/ }, ({ path }) => ({ path, namespace: "mock" }));
        build.onLoad({ filter: /.*/, namespace: "mock" }, ({ path }) => ({
          contents: path === "next/navigation" ? "export function redirect() { throw new Error('Unexpected redirect'); }" : ""
        }));
      }
    }]
  });
  const compiled = { exports: {} };
  new Function("require", "exports", "module", result.outputFiles[0]!.text)(
    createRequire(import.meta.url), compiled.exports, compiled
  );
  const { sendContactSalesAction } = compiled.exports as { sendContactSalesAction: typeof contactAction };
  const env = process.env;
  process.env = {
    ...env,
    NEXT_PUBLIC_APP_URL: "https://certscore.ai",
    CERTSCORE_BF26_TURNSTILE_SITE_KEY: "test-site-key",
    CERTSCORE_BF26_TURNSTILE_SECRET_KEY: "test-secret",
    GMAIL_SMTP_USER: "",
    GMAIL_SMTP_APP_PASSWORD: ""
  };
  t.after(() => { process.env = env; });
  const requestId = randomUUID();
  const siteverify = t.mock.method(globalThis, "fetch", async (_url: string, init: RequestInit) => {
    const token = (init.body as URLSearchParams).get("response");
    return Response.json({
      success: true,
      hostname: "certscore.ai",
      action: token === "campaign-token" ? "bf26_application" : "contact_sales",
      cdata: requestId
    });
  });

  const form = new FormData();
  form.set("workEmail", "applicant@example.com");
  form.set("message", "Test inquiry");
  form.set("website", "example.com");
  for (const requestType of ["sales-contact", "quick-assessment", "monitor-site"]) {
    form.set("requestType", requestType);
    assert.match((await sendContactSalesAction({ error: null }, form)).error ?? "", /complete the security check/);
  }
  assert.equal(siteverify.mock.callCount(), 0);

  form.set("requestType", "sales-contact");
  form.set("captchaRequestId", requestId);
  form.set("captchaToken", "campaign-token");
  assert.match((await sendContactSalesAction({ error: null }, form)).error ?? "", /complete the security check/);
  form.set("captchaToken", "contact-token");
  form.set("captchaRequestId", randomUUID());
  assert.match((await sendContactSalesAction({ error: null }, form)).error ?? "", /complete the security check/);
  form.set("captchaRequestId", requestId);
  assert.match((await sendContactSalesAction({ error: null }, form)).error ?? "", /couldn't send your message/);
  assert.equal(siteverify.mock.callCount(), 3);
});
