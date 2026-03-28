import { getDefaultSignatureAgentUrl, createWebBotAuthKeyMaterial } from "../packages/web-bot-auth/src";
import { getCrawlerPublicUrl } from "../packages/shared/src/utils/crawler-identity";

const signatureAgentUrl =
  process.env.WEB_BOT_AUTH_SIGNATURE_AGENT_URL ??
  getDefaultSignatureAgentUrl({ crawlerPublicUrl: getCrawlerPublicUrl() });
const enabled = process.env.WEB_BOT_AUTH_ENABLED === "1";
const keyMaterial = process.env.WEB_BOT_AUTH_PRIVATE_KEY_PEM
  ? createWebBotAuthKeyMaterial(process.env.WEB_BOT_AUTH_PRIVATE_KEY_PEM)
  : null;

console.info(JSON.stringify({
  enabled,
  hasKeyMaterial: keyMaterial !== null,
  keyId: keyMaterial?.thumbprint ?? null,
  signatureAgentUrl
}, null, 2));
