import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { query } from "@website-signal-risk-scanner/db";
import { getBetterAuthEnv } from "../better-auth/env";

export const ANONYMOUS_SCAN_CLAIM_COOKIE = "certscore_anonymous_scan_claim";
const MAX_CLAIMED_SCAN_IDS = 20;
const CLAIM_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

function sign(value: string) {
  return createHmac("sha256", getBetterAuthEnv().BETTER_AUTH_SECRET).update(value).digest("base64url");
}

function encodeClaims(scanIds: string[], issuedAt = Date.now()) {
  const payload = JSON.stringify({ issuedAt, scanIds: Array.from(new Set(scanIds)).slice(-MAX_CLAIMED_SCAN_IDS) });
  const encoded = Buffer.from(payload).toString("base64url");
  return `${encoded}.${sign(encoded)}`;
}

function decodeClaims(value: string | undefined) {
  if (!value) return [];
  const [encoded, signature] = value.split(".");
  if (!encoded || !signature) return [];
  const expected = sign(encoded);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) return [];

  try {
    const parsed = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as { issuedAt?: unknown; scanIds?: unknown };
    if (typeof parsed.issuedAt !== "number" || Date.now() - parsed.issuedAt > CLAIM_MAX_AGE_MS || !Array.isArray(parsed.scanIds)) return [];
    return parsed.scanIds.filter((scanId): scanId is string => typeof scanId === "string" && /^[0-9a-f-]{32,36}$/i.test(scanId)).slice(0, MAX_CLAIMED_SCAN_IDS);
  } catch {
    return [];
  }
}

export async function addAnonymousScanClaimCookie(response: Response, scanId: string) {
  const cookieStore = await cookies();
  const scanIds = decodeClaims(cookieStore.get(ANONYMOUS_SCAN_CLAIM_COOKIE)?.value);
  const value = encodeClaims([...scanIds, scanId]);
  response.headers.append("Set-Cookie", `${ANONYMOUS_SCAN_CLAIM_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(CLAIM_MAX_AGE_MS / 1000)}${process.env.NODE_ENV === "production" ? "; Secure" : ""}`);
}

export async function claimAnonymousScansForUser(userId: string) {
  const cookieStore = await cookies();
  const scanIds = decodeClaims(cookieStore.get(ANONYMOUS_SCAN_CLAIM_COOKIE)?.value);
  cookieStore.delete(ANONYMOUS_SCAN_CLAIM_COOKIE);
  if (scanIds.length === 0) return [];

  const result = await query<{ id: string }>(
    `update scans
        set claimed_by_user_id = $1,
            claimed_at = timezone('utc', now())
      where id = any($2::uuid[])
        and organization_id is null
        and submitted_by_user_id is null
        and claimed_by_user_id is null
      returning id`,
    [userId, scanIds],
    { readOnly: false }
  );
  return result.rows.map((row) => row.id);
}
