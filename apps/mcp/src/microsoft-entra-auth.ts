import {
  createRemoteJWKSet,
  jwtVerify,
  type JWTVerifyGetKey,
  type JWTPayload
} from "jose";

export type MicrosoftEntraAuthConfig = {
  allowedClientId: string;
  audience: string;
  jwksUrl?: string;
  requiredRole: string;
  tenantId: string;
};

export type MicrosoftEntraClaims = JWTPayload & {
  appid?: string;
  azp?: string;
  roles: string[];
  tid: string;
};

export type MicrosoftEntraAuthResult =
  | { ok: true; claims: MicrosoftEntraClaims; clientId: string; tenantId: string }
  | { ok: false; reason: "invalid_token" | "wrong_client" | "missing_role" };

export type MicrosoftEntraTokenValidator = {
  verify(token: string): Promise<MicrosoftEntraAuthResult>;
};

export function microsoftEntraIssuer(tenantId: string) {
  return `https://login.microsoftonline.com/${tenantId}/v2.0`;
}

export function microsoftEntraJwksUrl(tenantId: string) {
  return `https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`;
}

export function createMicrosoftEntraTokenValidator(
  config: MicrosoftEntraAuthConfig,
  options: { getKey?: JWTVerifyGetKey } = {}
): MicrosoftEntraTokenValidator {
  const getKey = options.getKey ?? createRemoteJWKSet(
    new URL(config.jwksUrl ?? microsoftEntraJwksUrl(config.tenantId)),
    {
      cacheMaxAge: 6 * 60 * 60 * 1000,
      cooldownDuration: 30_000,
      timeoutDuration: 5_000
    }
  );
  const issuer = microsoftEntraIssuer(config.tenantId);

  return {
    async verify(token) {
      try {
        const { payload } = await jwtVerify(token, getKey, {
          algorithms: ["RS256"],
          audience: config.audience,
          clockTolerance: 5,
          issuer
        });
        if (payload.tid !== config.tenantId || payload.ver !== "2.0") {
          return { ok: false, reason: "invalid_token" };
        }
        // App-only client-credentials tokens carry roles and no delegated scp claim.
        if (typeof payload.scp === "string" && payload.scp.trim()) {
          return { ok: false, reason: "invalid_token" };
        }
        const clientId = typeof payload.azp === "string"
          ? payload.azp
          : typeof payload.appid === "string"
            ? payload.appid
            : null;
        if (clientId !== config.allowedClientId) {
          return { ok: false, reason: "wrong_client" };
        }
        const roles = Array.isArray(payload.roles)
          ? payload.roles.filter((role): role is string => typeof role === "string")
          : [];
        if (!roles.includes(config.requiredRole)) {
          return { ok: false, reason: "missing_role" };
        }
        return {
          ok: true,
          claims: { ...payload, roles, tid: config.tenantId },
          clientId,
          tenantId: config.tenantId
        };
      } catch {
        return { ok: false, reason: "invalid_token" };
      }
    }
  };
}
