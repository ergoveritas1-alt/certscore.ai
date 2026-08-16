import assert from "node:assert/strict";
import test from "node:test";
import { generateWebBotAuthKeyPair } from "@website-signal-risk-scanner/web-bot-auth";
import {
  buildWebBotAuthBrowserHeaders,
  installWebBotAuthRoute,
  resolveWebBotAuthRoutingConfig,
} from "./web-bot-auth-routing";

const privateKeyPem = generateWebBotAuthKeyPair().privateKeyPem;
const enabledEnv = {
  WEB_BOT_AUTH_ENABLED: "1",
  WEB_BOT_AUTH_EXPIRES_SECONDS: "60",
  WEB_BOT_AUTH_INCLUDE_NONCE: "1",
  WEB_BOT_AUTH_PRIVATE_KEY_PEM: privateKeyPem,
  WEB_BOT_AUTH_SIGNATURE_AGENT_URL:
    "https://consentcheck.site/.well-known/http-message-signatures-directory",
};

test("keeps browser request signing disabled unless explicitly enabled", () => {
  assert.equal(resolveWebBotAuthRoutingConfig({}), null);
  assert.equal(buildWebBotAuthBrowserHeaders("https://example.com/", {}), null);
});

test("fails closed when request signing is enabled without key material", () => {
  assert.throws(
    () => resolveWebBotAuthRoutingConfig({
      WEB_BOT_AUTH_ENABLED: "1",
      WEB_BOT_AUTH_SIGNATURE_AGENT_URL:
        "https://consentcheck.site/.well-known/http-message-signatures-directory",
    }),
    /requires WEB_BOT_AUTH_PRIVATE_KEY_PEM/,
  );
});

test("builds short-lived authority-bound HTTPS browser headers", () => {
  const signed = buildWebBotAuthBrowserHeaders("https://example.com/path", enabledEnv);
  assert.ok(signed);
  assert.equal(
    signed.headers["Signature-Agent"],
    '"https://consentcheck.site/.well-known/http-message-signatures-directory"',
  );
  assert.match(signed.headers["Signature-Input"] ?? "", /"@authority" "signature-agent"/);
  assert.match(signed.headers["Signature-Input"] ?? "", /tag="web-bot-auth"/);
  assert.match(signed.headers["Signature-Input"] ?? "", /nonce="[^"]+"/);
  assert.equal(signed.expires - signed.created, 60);
  assert.match(signed.signatureBase, /"@authority": example\.com/);
  assert.equal(buildWebBotAuthBrowserHeaders("http://example.com/", enabledEnv), null);
});

test("installs the signer as a route-chain fallback and preserves request headers", async () => {
  let handler: ((route: {
    fallback(options?: { headers?: Record<string, string> }): Promise<void>;
    request(): { headers(): Record<string, string>; url(): string };
  }) => Promise<void>) | undefined;
  const context = {
    async route(_pattern: string, candidate: typeof handler) {
      handler = candidate;
    },
  };
  const installation = await installWebBotAuthRoute(
    context as never,
    enabledEnv,
  );
  assert.equal(installation.enabled, true);
  assert.ok(installation.keyId);
  assert.ok(handler);

  let forwardedHeaders: Record<string, string> | undefined;
  await handler({
    async fallback(options) {
      forwardedHeaders = options?.headers;
    },
    request() {
      return {
        headers: () => ({ accept: "text/html", "x-existing": "kept" }),
        url: () => "https://example.com/",
      };
    },
  });
  assert.equal(forwardedHeaders?.["x-existing"], "kept");
  assert.match(forwardedHeaders?.Signature ?? "", /^sig1=:.+:$/);
  assert.match(forwardedHeaders?.["Signature-Input"] ?? "", /tag="web-bot-auth"/);
});
