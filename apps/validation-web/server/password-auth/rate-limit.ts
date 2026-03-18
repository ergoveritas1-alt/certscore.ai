import { createAdminClient } from "@website-signal-risk-scanner/db";

type RateLimitInput = {
  action: string;
  bucketKey: string;
  blockDurationSeconds: number;
  maxAttempts: number;
  windowSeconds: number;
};

type RateLimitRow = {
  attempts: number;
  blocked_until: string | null;
  id: string;
  window_started_at: string;
};

type RateLimitResult = {
  allowed: boolean;
  retryAfterSeconds: number | null;
};

function isMissingRateLimitTableError(message: string) {
  const normalized = message.toLowerCase();
  return normalized.includes("password_auth_rate_limits") && normalized.includes("schema cache");
}

function secondsUntil(input: Date) {
  return Math.max(1, Math.ceil((input.getTime() - Date.now()) / 1000));
}

async function applyRateLimit(input: RateLimitInput): Promise<RateLimitResult> {
  const supabase = createAdminClient();
  const now = new Date();
  const { data, error } = await supabase
    .from("password_auth_rate_limits")
    .select("id, attempts, window_started_at, blocked_until")
    .eq("action", input.action)
    .eq("bucket_key", input.bucketKey)
    .maybeSingle();

  if (error) {
    if (isMissingRateLimitTableError(error.message)) {
      console.warn("Password auth rate limits unavailable; allowing request", {
        action: input.action
      });
      return { allowed: true, retryAfterSeconds: null };
    }

    throw new Error(`Failed to read auth rate limit: ${error.message}`);
  }

  const row = (data as RateLimitRow | null) ?? null;

  if (!row) {
    const { error: insertError } = await supabase.from("password_auth_rate_limits").insert({
      action: input.action,
      attempts: 1,
      blocked_until: null,
      bucket_key: input.bucketKey,
      window_started_at: now.toISOString()
    });

    if (insertError) {
      if (isMissingRateLimitTableError(insertError.message)) {
        console.warn("Password auth rate-limit initialization unavailable; allowing request", {
          action: input.action
        });
        return { allowed: true, retryAfterSeconds: null };
      }

      throw new Error(`Failed to initialize auth rate limit: ${insertError.message}`);
    }

    return { allowed: true, retryAfterSeconds: null };
  }

  if (row.blocked_until) {
    const blockedUntil = new Date(row.blocked_until);

    if (blockedUntil > now) {
      return {
        allowed: false,
        retryAfterSeconds: secondsUntil(blockedUntil)
      };
    }
  }

  const windowStartedAt = new Date(row.window_started_at);
  const withinWindow = now.getTime() - windowStartedAt.getTime() < input.windowSeconds * 1000;
  const nextAttempts = withinWindow ? row.attempts + 1 : 1;
  const blockedUntil = nextAttempts > input.maxAttempts ? new Date(now.getTime() + input.blockDurationSeconds * 1000) : null;

  const { error: updateError } = await supabase
    .from("password_auth_rate_limits")
    .update({
      attempts: nextAttempts,
      blocked_until: blockedUntil?.toISOString() ?? null,
      window_started_at: withinWindow ? row.window_started_at : now.toISOString()
    })
    .eq("id", row.id);

  if (updateError) {
    if (isMissingRateLimitTableError(updateError.message)) {
      console.warn("Password auth rate-limit update unavailable; allowing request", {
        action: input.action
      });
      return { allowed: true, retryAfterSeconds: null };
    }

    throw new Error(`Failed to update auth rate limit: ${updateError.message}`);
  }

  if (blockedUntil) {
    return {
      allowed: false,
      retryAfterSeconds: secondsUntil(blockedUntil)
    };
  }

  return { allowed: true, retryAfterSeconds: null };
}

async function enforceNamedPasswordAuthRateLimit(input: {
  actionPrefix: string;
  blockDurationSeconds: number;
  email: string;
  ipAddress: string;
  maxEmailAttempts: number;
  maxIpAttempts: number;
  windowSeconds: number;
}) {
  const results = await Promise.all([
    applyRateLimit({
      action: `${input.actionPrefix}:email`,
      blockDurationSeconds: input.blockDurationSeconds,
      bucketKey: input.email,
      maxAttempts: input.maxEmailAttempts,
      windowSeconds: input.windowSeconds
    }),
    applyRateLimit({
      action: `${input.actionPrefix}:ip`,
      blockDurationSeconds: input.blockDurationSeconds,
      bucketKey: input.ipAddress,
      maxAttempts: input.maxIpAttempts,
      windowSeconds: input.windowSeconds
    })
  ]);

  const blocked = results.find((result) => !result.allowed);

  if (!blocked) {
    return null;
  }

  return `Too many attempts. Try again in ${blocked.retryAfterSeconds ?? 60}s.`;
}

export async function enforcePasswordAuthRateLimit(input: { email: string; ipAddress: string; mode: "sign_in" | "create_account" }) {
  const actionPrefix = input.mode === "create_account" ? "password_signup" : "password_signin";
  return enforceNamedPasswordAuthRateLimit({
    actionPrefix,
    blockDurationSeconds: 900,
    email: input.email,
    ipAddress: input.ipAddress,
    maxEmailAttempts: input.mode === "create_account" ? 5 : 10,
    maxIpAttempts: input.mode === "create_account" ? 10 : 25,
    windowSeconds: 900
  });
}

export async function enforcePasswordResetRequestRateLimit(input: { email: string; ipAddress: string }) {
  return enforceNamedPasswordAuthRateLimit({
    actionPrefix: "password_reset_request",
    blockDurationSeconds: 900,
    email: input.email,
    ipAddress: input.ipAddress,
    maxEmailAttempts: 5,
    maxIpAttempts: 20,
    windowSeconds: 900
  });
}

export async function enforcePasswordResetConfirmRateLimit(input: { token: string; ipAddress: string }) {
  return enforceNamedPasswordAuthRateLimit({
    actionPrefix: "password_reset_confirm",
    blockDurationSeconds: 900,
    email: input.token,
    ipAddress: input.ipAddress,
    maxEmailAttempts: 10,
    maxIpAttempts: 25,
    windowSeconds: 900
  });
}
