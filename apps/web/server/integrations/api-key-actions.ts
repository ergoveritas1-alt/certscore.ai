"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDashboardContext } from "../auth";
import {
  createIntegrationApiKey,
  isIntegrationApiKeyScope,
  revokeIntegrationApiKey,
  type IntegrationApiKeyScope
} from "./api-keys";

export type ApiKeyActionState = {
  error: string | null;
  success: string | null;
  token: string | null;
  tokenPrefix: string | null;
};

export const initialApiKeyActionState: ApiKeyActionState = {
  error: null,
  success: null,
  token: null,
  tokenPrefix: null
};

const createApiKeySchema = z.object({
  name: z.string().trim().min(2).max(80),
  expiresInDays: z.coerce.number().int().min(1).max(365).optional()
});

const revokeApiKeySchema = z.object({
  publicId: z.string().trim().min(1)
});

function parseScopes(formData: FormData): IntegrationApiKeyScope[] {
  const rawScopes = formData
    .getAll("scopes")
    .map((scope) => (typeof scope === "string" ? scope.trim() : ""))
    .filter(Boolean);
  const scopes = rawScopes.filter(isIntegrationApiKeyScope);
  if (scopes.length === 0) {
    return ["pulse:read", "pulse:scan", "mcp"];
  }
  return Array.from(new Set(scopes));
}

function expiresAtFromDays(days: number | undefined) {
  if (!days) {
    return null;
  }
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

export async function createIntegrationApiKeyAction(
  _previousState: ApiKeyActionState,
  formData: FormData
): Promise<ApiKeyActionState> {
  const parsed = createApiKeySchema.safeParse({
    name: formData.get("name"),
    expiresInDays: formData.get("expiresInDays") || undefined
  });
  if (!parsed.success) {
    return {
      ...initialApiKeyActionState,
      error: "Enter a key name and choose an expiry between 1 and 365 days."
    };
  }

  const { organization, user } = await getDashboardContext();
  const key = await createIntegrationApiKey({
    name: parsed.data.name,
    scopes: parseScopes(formData),
    organizationId: organization.id,
    ownerUserId: user.id,
    createdBy: user.email,
    expiresAt: expiresAtFromDays(parsed.data.expiresInDays),
    prefix: "live"
  });

  revalidatePath("/app/settings");
  return {
    error: null,
    success: "API key created. Store it now; CertScore will not show it again.",
    token: key.token,
    tokenPrefix: key.tokenPrefix
  };
}

export async function revokeIntegrationApiKeyAction(
  _previousState: ApiKeyActionState,
  formData: FormData
): Promise<ApiKeyActionState> {
  const parsed = revokeApiKeySchema.safeParse({
    publicId: formData.get("publicId")
  });
  if (!parsed.success) {
    return {
      ...initialApiKeyActionState,
      error: "Choose a valid key to revoke."
    };
  }

  const { organization } = await getDashboardContext();
  const revoked = await revokeIntegrationApiKey({
    organizationId: organization.id,
    publicId: parsed.data.publicId
  });

  revalidatePath("/app/settings");
  return {
    ...initialApiKeyActionState,
    success: revoked ? "API key revoked." : "That key is already revoked or no longer exists."
  };
}
