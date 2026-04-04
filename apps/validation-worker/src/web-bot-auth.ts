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

const BROWSER_NAVIGATION_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36";

function getOrigin(value: string | URL | null | undefined) {
  if (!value) {
    return null;
  }

  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
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

export function buildValidationWorkerDocumentHeaders(input: {
  referer?: string | URL | null;
  url: string | URL;
}) {
  const config = getValidationWorkerWebBotAuthConfig();
  const headers: Record<string, string> = {
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Cache-Control": "no-cache",
    Pragma: "no-cache",
    Priority: "u=0, i",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
    "Upgrade-Insecure-Requests": "1",
    "User-Agent": BROWSER_NAVIGATION_USER_AGENT
  };
  let signing: WebBotAuthRequestSignatureResult | null = null;

  const targetOrigin = getOrigin(input.url);
  const refererOrigin = getOrigin(input.referer);
  if (typeof input.referer === "string" && input.referer.length > 0 && refererOrigin) {
    headers.Referer = input.referer;
    headers["Sec-Fetch-Site"] = targetOrigin && refererOrigin === targetOrigin ? "same-origin" : "cross-site";
  }

  if (config.enabled) {
    if (!config.keyMaterial) {
      throw new Error("WEB_BOT_AUTH_ENABLED=1 requires WEB_BOT_AUTH_PRIVATE_KEY_PEM.");
    }

    signing = buildWebBotAuthRequestHeaders({
      expiresInSeconds: config.expiresSeconds,
      keyMaterial: config.keyMaterial,
      nonce: config.includeNonce ? randomUUID() : undefined,
      signatureAgentUrl: config.signatureAgentUrl,
      url: input.url
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
      referer: headers.Referer ?? null,
      requestProfile: "browser_document_navigation",
      signatureAgentUrl: config.signatureAgentUrl
    }
  };
}
