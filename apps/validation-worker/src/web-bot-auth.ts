import { randomUUID } from "node:crypto";
import { getCrawlerPublicUrl, getCrawlerUserAgent } from "@website-signal-risk-scanner/shared";
import {
  buildWebBotAuthRequestHeaders,
  createWebBotAuthKeyMaterial,
  getDefaultSignatureAgentUrl,
  type WebBotAuthKeyMaterial,
  type WebBotAuthRequestSignatureResult
} from "@website-signal-risk-scanner/web-bot-auth";
import { getWorkerEnv } from "./env";

type ValidationWorkerWebBotAuthConfig = {
  enabled: boolean;
  expiresSeconds: number;
  includeNonce: boolean;
  keyMaterial: WebBotAuthKeyMaterial | null;
  signatureAgentUrl: string;
  userAgent: string;
};

function getValidationWorkerWebBotAuthConfig(): ValidationWorkerWebBotAuthConfig {
  const env = getWorkerEnv();
  const signatureAgentUrl =
    env.WEB_BOT_AUTH_SIGNATURE_AGENT_URL ?? getDefaultSignatureAgentUrl({ crawlerPublicUrl: getCrawlerPublicUrl() });

  return {
    enabled: env.WEB_BOT_AUTH_ENABLED,
    expiresSeconds: env.WEB_BOT_AUTH_EXPIRES_SECONDS,
    includeNonce: env.WEB_BOT_AUTH_INCLUDE_NONCE,
    keyMaterial: env.WEB_BOT_AUTH_PRIVATE_KEY_PEM ? createWebBotAuthKeyMaterial(env.WEB_BOT_AUTH_PRIVATE_KEY_PEM) : null,
    signatureAgentUrl,
    userAgent: getCrawlerUserAgent()
  };
}

export function buildValidationWorkerCrawlerHeaders(url: string | URL) {
  const config = getValidationWorkerWebBotAuthConfig();
  const headers: Record<string, string> = {
    "User-Agent": config.userAgent
  };
  let signing: WebBotAuthRequestSignatureResult | null = null;

  if (config.enabled) {
    if (!config.keyMaterial) {
      throw new Error("WEB_BOT_AUTH_ENABLED=1 requires WEB_BOT_AUTH_PRIVATE_KEY_PEM.");
    }

    signing = buildWebBotAuthRequestHeaders({
      expiresInSeconds: config.expiresSeconds,
      keyMaterial: config.keyMaterial,
      nonce: config.includeNonce ? randomUUID() : undefined,
      signatureAgentUrl: config.signatureAgentUrl,
      url
    });
    Object.assign(headers, signing.headers);
  }

  return {
    headers,
    metadata: {
      created: signing?.created ?? null,
      enabled: config.enabled,
      expires: signing?.expires ?? null,
      keyId: config.keyMaterial?.thumbprint ?? null,
      signatureAgentUrl: config.signatureAgentUrl
    }
  };
}
