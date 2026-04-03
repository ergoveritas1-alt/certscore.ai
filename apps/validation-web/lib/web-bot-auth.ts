import { randomUUID } from "node:crypto";
import { getCrawlerPublicUrl, getCrawlerUserAgent } from "@website-signal-risk-scanner/shared";
import {
  buildHttpMessageSignaturesDirectoryResponse,
  buildWebBotAuthRequestHeaders,
  createWebBotAuthKeyMaterial,
  getDefaultSignatureAgentUrl,
  type HttpMessageSignaturesDirectoryResult,
  type WebBotAuthKeyMaterial,
  type WebBotAuthRequestSignatureResult
} from "@website-signal-risk-scanner/web-bot-auth";

type ValidationWebBotAuthConfig = {
  enabled: boolean;
  expiresSeconds: number;
  includeNonce: boolean;
  keyMaterial: WebBotAuthKeyMaterial | null;
  signatureAgentUrl: string;
  userAgent: string;
};

function getValidationWebBotAuthConfig(): ValidationWebBotAuthConfig {
  const signatureAgentUrl =
    process.env.WEB_BOT_AUTH_SIGNATURE_AGENT_URL ??
    getDefaultSignatureAgentUrl({ crawlerPublicUrl: getCrawlerPublicUrl() });

  return {
    enabled: process.env.WEB_BOT_AUTH_ENABLED === "1",
    expiresSeconds: Number(process.env.WEB_BOT_AUTH_EXPIRES_SECONDS ?? "300"),
    includeNonce: process.env.WEB_BOT_AUTH_INCLUDE_NONCE === "1",
    keyMaterial: process.env.WEB_BOT_AUTH_PRIVATE_KEY_PEM
      ? createWebBotAuthKeyMaterial(process.env.WEB_BOT_AUTH_PRIVATE_KEY_PEM)
      : null,
    signatureAgentUrl,
    userAgent: getCrawlerUserAgent()
  };
}

export function getValidationWebBotAuthDirectoryResponse(requestUrl: string): HttpMessageSignaturesDirectoryResult | null {
  const config = getValidationWebBotAuthConfig();

  if (!config.keyMaterial) {
    return null;
  }

  return buildHttpMessageSignaturesDirectoryResponse({
    expiresInSeconds: config.expiresSeconds,
    keyMaterial: config.keyMaterial,
    requestUrl
  });
}

export function buildValidationCrawlerRequestHeaders(url: string | URL) {
  const config = getValidationWebBotAuthConfig();
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
