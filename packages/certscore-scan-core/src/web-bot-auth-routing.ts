import { randomUUID } from "node:crypto";
import {
  buildWebBotAuthRequestHeaders,
  createWebBotAuthKeyMaterial,
  type WebBotAuthKeyMaterial,
} from "@website-signal-risk-scanner/web-bot-auth";
import type { BrowserContext } from "playwright";

const DEFAULT_EXPIRES_SECONDS = 60;
const MAX_EXPIRES_SECONDS = 300;

type WebBotAuthRoutingConfig = {
  enabled: true;
  expiresSeconds: number;
  includeNonce: boolean;
  keyMaterial: WebBotAuthKeyMaterial;
  signatureAgentUrl: string;
};

export type WebBotAuthRouteInstallation = {
  enabled: boolean;
  expiresSeconds: number | null;
  keyId: string | null;
  signatureAgentUrl: string | null;
};

function enabledFlag(value: string | undefined) {
  return value?.trim() === "1";
}

function parseExpiresSeconds(value: string | undefined) {
  const normalized = value?.trim();
  if (!normalized) return DEFAULT_EXPIRES_SECONDS;
  const parsed = Number(normalized);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > MAX_EXPIRES_SECONDS) {
    throw new Error(`WEB_BOT_AUTH_EXPIRES_SECONDS must be an integer between 1 and ${MAX_EXPIRES_SECONDS}.`);
  }
  return parsed;
}

function parseSignatureAgentUrl(value: string | undefined) {
  const normalized = value?.trim();
  if (!normalized) {
    throw new Error("WEB_BOT_AUTH_ENABLED=1 requires WEB_BOT_AUTH_SIGNATURE_AGENT_URL.");
  }
  const parsed = new URL(normalized);
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.hash) {
    throw new Error("WEB_BOT_AUTH_SIGNATURE_AGENT_URL must be a public HTTPS URL without credentials or a fragment.");
  }
  return parsed.toString();
}

export function resolveWebBotAuthRoutingConfig(
  env: NodeJS.ProcessEnv = process.env,
): WebBotAuthRoutingConfig | null {
  if (!enabledFlag(env.WEB_BOT_AUTH_ENABLED)) return null;
  const privateKeyPem = env.WEB_BOT_AUTH_PRIVATE_KEY_PEM?.trim();
  if (!privateKeyPem) {
    throw new Error("WEB_BOT_AUTH_ENABLED=1 requires WEB_BOT_AUTH_PRIVATE_KEY_PEM.");
  }
  return {
    enabled: true,
    expiresSeconds: parseExpiresSeconds(env.WEB_BOT_AUTH_EXPIRES_SECONDS),
    includeNonce: enabledFlag(env.WEB_BOT_AUTH_INCLUDE_NONCE),
    keyMaterial: createWebBotAuthKeyMaterial(privateKeyPem),
    signatureAgentUrl: parseSignatureAgentUrl(env.WEB_BOT_AUTH_SIGNATURE_AGENT_URL),
  };
}

function signedHeadersForUrl(config: WebBotAuthRoutingConfig, requestUrl: string) {
  const url = new URL(requestUrl);
  if (url.protocol !== "https:") return null;
  return buildWebBotAuthRequestHeaders({
    expiresInSeconds: config.expiresSeconds,
    keyMaterial: config.keyMaterial,
    nonce: config.includeNonce ? randomUUID() : undefined,
    signatureAgentUrl: config.signatureAgentUrl,
    url,
  });
}

export function buildWebBotAuthBrowserHeaders(
  requestUrl: string,
  env: NodeJS.ProcessEnv = process.env,
) {
  const config = resolveWebBotAuthRoutingConfig(env);
  return config ? signedHeadersForUrl(config, requestUrl) : null;
}

export async function installWebBotAuthRoute(
  context: BrowserContext,
  env: NodeJS.ProcessEnv = process.env,
): Promise<WebBotAuthRouteInstallation> {
  const config = resolveWebBotAuthRoutingConfig(env);
  if (!config) {
    return {
      enabled: false,
      expiresSeconds: null,
      keyId: null,
      signatureAgentUrl: null,
    };
  }

  await context.route("**/*", async (route) => {
    const signed = signedHeadersForUrl(config, route.request().url());
    if (!signed) {
      await route.fallback();
      return;
    }
    await route.fallback({
      headers: {
        ...route.request().headers(),
        ...signed.headers,
      },
    });
  });

  return {
    enabled: true,
    expiresSeconds: config.expiresSeconds,
    keyId: config.keyMaterial.thumbprint,
    signatureAgentUrl: config.signatureAgentUrl,
  };
}
