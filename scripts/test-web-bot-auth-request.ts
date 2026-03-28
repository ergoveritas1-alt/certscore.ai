import { buildWebBotAuthRequestHeaders, createWebBotAuthKeyMaterial, getDefaultSignatureAgentUrl } from "../packages/web-bot-auth/src";
import { getCrawlerPublicUrl } from "../packages/shared/src/utils/crawler-identity";

const testUrl = process.argv[2] ?? "https://crawltest.com/cdn-cgi/web-bot-auth";
const privateKeyPem = process.env.WEB_BOT_AUTH_PRIVATE_KEY_PEM;

if (!privateKeyPem) {
  throw new Error("WEB_BOT_AUTH_PRIVATE_KEY_PEM is required.");
}

const keyMaterial = createWebBotAuthKeyMaterial(privateKeyPem);
const signatureAgentUrl =
  process.env.WEB_BOT_AUTH_SIGNATURE_AGENT_URL ??
  getDefaultSignatureAgentUrl({ crawlerPublicUrl: getCrawlerPublicUrl() });
const result = buildWebBotAuthRequestHeaders({
  expiresInSeconds: Number(process.env.WEB_BOT_AUTH_EXPIRES_SECONDS ?? "300"),
  keyMaterial,
  nonce: process.env.WEB_BOT_AUTH_INCLUDE_NONCE === "1" ? "debug-nonce" : undefined,
  signatureAgentUrl,
  url: testUrl
});

console.info("Signed request metadata:");
console.info(
  JSON.stringify(
    {
      created: result.created,
      expires: result.expires,
      keyId: result.keyId,
      signatureAgentUrl,
      signatureHeader: result.headers.Signature.slice(0, 24) + "...<redacted>",
      signatureInput: result.headers["Signature-Input"]
    },
    null,
    2
  )
);

const response = await fetch(testUrl, {
  headers: result.headers
});

console.info("");
console.info(`Status: ${response.status}`);
console.info(await response.text());
