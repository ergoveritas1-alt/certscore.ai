import assert from "node:assert/strict";
import test from "node:test";
import {
  buildHttpMessageSignaturesDirectoryResponse,
  buildWebBotAuthRequestHeaders,
  computeJwkThumbprint,
  createWebBotAuthKeyMaterial,
  generateWebBotAuthKeyPair,
  getDefaultSignatureAgentUrl,
  getWebBotAuthConstants
} from "./index";

test("generates Ed25519 JWK and JWKS with thumbprint kid", () => {
  const generated = generateWebBotAuthKeyPair();

  assert.equal(generated.jwk.kty, "OKP");
  assert.equal(generated.jwk.crv, "Ed25519");
  assert.equal(generated.jwk.alg, "EdDSA");
  assert.equal(generated.jwk.use, "sig");
  assert.equal(generated.jwk.kid, generated.thumbprint);
  assert.deepEqual(generated.jwks, { keys: [generated.jwk] });
});

test("computes stable JWK thumbprints", () => {
  const keyMaterial = createWebBotAuthKeyMaterial(generateWebBotAuthKeyPair().privateKeyPem);

  assert.equal(
    computeJwkThumbprint({
      crv: keyMaterial.jwk.crv,
      kty: keyMaterial.jwk.kty,
      x: keyMaterial.jwk.x
    }),
    keyMaterial.thumbprint
  );
});

test("builds a signed key-directory response", () => {
  const generated = generateWebBotAuthKeyPair();
  const constants = getWebBotAuthConstants();
  const result = buildHttpMessageSignaturesDirectoryResponse({
    expiresInSeconds: 120,
    keyMaterial: generated,
    requestUrl: "https://consentcheck.site/.well-known/http-message-signatures-directory"
  });

  assert.equal(result.contentType, constants.directoryContentType);
  assert.deepEqual(JSON.parse(result.body), generated.jwks);
  assert.match(result.headers.Signature!, /^sig1=:.+:$/);
  assert.match(result.headers["Signature-Input"]!, /tag="http-message-signatures-directory"/);
  assert.match(result.headers["Signature-Input"]!, /"@authority";req/);
  assert.match(result.signatureBase, /"content-type": application\/http-message-signatures-directory\+json/);
});

test("builds outbound request signing headers with signature-agent and authority", () => {
  const generated = generateWebBotAuthKeyPair();
  const signatureAgentUrl = getDefaultSignatureAgentUrl({
    crawlerPublicUrl: "https://consentcheck.site/crawler"
  });
  const result = buildWebBotAuthRequestHeaders({
    expiresInSeconds: 90,
    keyMaterial: generated,
    signatureAgentUrl,
    url: "https://example.com/some-path?x=1"
  });

  assert.equal(result.headers["Signature-Agent"]!, signatureAgentUrl);
  assert.match(result.headers["Signature-Input"]!, /tag="web-bot-auth"/);
  assert.match(result.headers["Signature-Input"]!, /"signature-agent"/);
  assert.match(result.headers["Signature-Input"]!, /"@authority"/);
  assert.match(result.signatureBase, /"@authority": example\.com/);
  assert.match(result.signatureBase, new RegExp(`"signature-agent": ${signatureAgentUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
});
