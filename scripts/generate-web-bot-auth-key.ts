import { generateWebBotAuthKeyPair, getDefaultSignatureAgentUrl } from "../packages/web-bot-auth/src";
import { getCrawlerPublicUrl } from "../packages/shared/src/utils/crawler-identity";

const generated = generateWebBotAuthKeyPair();
const signatureAgentUrl = getDefaultSignatureAgentUrl({
  crawlerPublicUrl: getCrawlerPublicUrl()
});

console.info("Web Bot Auth Ed25519 key generated.");
console.info("");
console.info("Thumbprint:");
console.info(generated.thumbprint);
console.info("");
console.info("Signature-Agent URL:");
console.info(signatureAgentUrl);
console.info("");
console.info("Private key PEM:");
console.info(generated.privateKeyPem);
console.info("");
console.info("Env-safe private key value:");
console.info(generated.privateKeyPem.replace(/\n/g, "\\n"));
console.info("");
console.info("Public JWKS:");
console.info(JSON.stringify(generated.jwks, null, 2));
