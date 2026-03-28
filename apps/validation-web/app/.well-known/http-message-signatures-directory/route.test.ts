import assert from "node:assert/strict";
import test from "node:test";

test("well-known directory endpoint returns a signed JWKS response", async () => {
  const previousKey = process.env.WEB_BOT_AUTH_PRIVATE_KEY_PEM;
  const previousUrl = process.env.NEXT_PUBLIC_APP_URL;
  const { generateWebBotAuthKeyPair } = await import("../../../../../packages/web-bot-auth/src/index");
  process.env.WEB_BOT_AUTH_PRIVATE_KEY_PEM = generateWebBotAuthKeyPair().privateKeyPem.replace(/\n/g, "\\n");
  process.env.NEXT_PUBLIC_APP_URL = "https://consentcheck.site";

  try {
    const { GET } = await import("./route");
    const response = GET(new Request("https://consentcheck.site/.well-known/http-message-signatures-directory"));
    const body = await response.text();

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "application/http-message-signatures-directory+json");
    assert.match(response.headers.get("signature") ?? "", /^sig1=:.+:$/);
    assert.match(response.headers.get("signature-input") ?? "", /tag="http-message-signatures-directory"/);
    assert.ok(Array.isArray(JSON.parse(body).keys));
  } finally {
    if (previousKey === undefined) {
      delete process.env.WEB_BOT_AUTH_PRIVATE_KEY_PEM;
    } else {
      process.env.WEB_BOT_AUTH_PRIVATE_KEY_PEM = previousKey;
    }

    if (previousUrl === undefined) {
      delete process.env.NEXT_PUBLIC_APP_URL;
    } else {
      process.env.NEXT_PUBLIC_APP_URL = previousUrl;
    }
  }
});
