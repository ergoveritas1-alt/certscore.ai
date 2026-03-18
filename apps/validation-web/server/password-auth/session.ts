import "server-only";

import { createAdminClient } from "@website-signal-risk-scanner/db";
import { randomBytes, createHash } from "node:crypto";
import { isIP } from "node:net";
import { cookies } from "next/headers";
import { PASSWORD_AUTH_COOKIE_NAME, PASSWORD_AUTH_SESSION_TTL_DAYS } from "./constants";
import { getAuthenticatedProfile } from "./user";

type SessionRow = {
  expires_at: string;
  user_id: string;
};

function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function buildSessionExpiryDate() {
  return new Date(Date.now() + PASSWORD_AUTH_SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
}

function normalizeIpAddress(value: string | null) {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();

  if (isIP(trimmed)) {
    return trimmed;
  }

  const unwrapped = trimmed.replace(/^\[|\]$/g, "");

  if (isIP(unwrapped)) {
    return unwrapped;
  }

  const withoutPort = unwrapped.replace(/:\d+$/, "");

  if (isIP(withoutPort)) {
    return withoutPort;
  }

  const ipv4Mapped = withoutPort.replace(/^::ffff:/i, "");

  if (isIP(ipv4Mapped)) {
    return ipv4Mapped;
  }

  return null;
}

export function getPasswordSessionCookieOptions(expiresAt: Date) {
  return {
    expires: expiresAt,
    httpOnly: true,
    path: "/",
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production"
  };
}

export async function setPasswordSessionCookie(token: string, expiresAt: Date) {
  const cookieStore = await cookies();
  cookieStore.set(PASSWORD_AUTH_COOKIE_NAME, token, getPasswordSessionCookieOptions(expiresAt));
}

export async function clearPasswordSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.set(PASSWORD_AUTH_COOKIE_NAME, "", {
    expires: new Date(0),
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production"
  });
}

export async function createPasswordSession(input: { ipAddress: string | null; userAgent: string | null; userId: string }) {
  const supabase = createAdminClient();
  const token = randomBytes(32).toString("base64url");
  const expiresAt = buildSessionExpiryDate();
  const normalizedIpAddress = normalizeIpAddress(input.ipAddress);
  const primaryInsert = await supabase.from("password_auth_sessions").insert({
    expires_at: expiresAt.toISOString(),
    ip_address: normalizedIpAddress,
    session_token_hash: hashSessionToken(token),
    user_agent: input.userAgent,
    user_id: input.userId
  });

  if (primaryInsert.error) {
    console.error("Failed to create password session with request metadata", {
      error: primaryInsert.error.message,
      ipAddress: input.ipAddress,
      normalizedIpAddress,
      userId: input.userId,
      userAgentLength: input.userAgent?.length ?? 0
    });

    const fallbackInsert = await supabase.from("password_auth_sessions").insert({
      expires_at: expiresAt.toISOString(),
      ip_address: null,
      session_token_hash: hashSessionToken(token),
      user_agent: null,
      user_id: input.userId
    });

    if (fallbackInsert.error) {
      throw new Error(`Failed to create password session: ${fallbackInsert.error.message}`);
    }
  }

  await setPasswordSessionCookie(token, expiresAt);
}

export async function revokePasswordSessionToken(token: string | null) {
  if (!token) {
    return;
  }

  const supabase = createAdminClient();
  await supabase.from("password_auth_sessions").delete().eq("session_token_hash", hashSessionToken(token));
}

export async function revokeAllPasswordSessionsForUser(userId: string) {
  const supabase = createAdminClient();
  const { error } = await supabase.from("password_auth_sessions").delete().eq("user_id", userId);

  if (error) {
    throw new Error(`Failed to revoke password sessions: ${error.message}`);
  }
}

export async function getPasswordSessionUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get(PASSWORD_AUTH_COOKIE_NAME)?.value;

  if (!token) {
    return null;
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("password_auth_sessions")
    .select("user_id, expires_at")
    .eq("session_token_hash", hashSessionToken(token))
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load password session: ${error.message}`);
  }

  if (!data) {
    return null;
  }

  const session = data as SessionRow;

  if (new Date(session.expires_at).getTime() <= Date.now()) {
    await supabase.from("password_auth_sessions").delete().eq("session_token_hash", hashSessionToken(token));
    return null;
  }

  return getAuthenticatedProfile(session.user_id);
}

export async function revokeCurrentPasswordSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(PASSWORD_AUTH_COOKIE_NAME)?.value;

  if (!token) {
    await clearPasswordSessionCookie();
    return;
  }

  await revokePasswordSessionToken(token);
  await clearPasswordSessionCookie();
}
