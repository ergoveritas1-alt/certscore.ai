import { createAdminClient } from "@website-signal-risk-scanner/db";
import { randomBytes, createHash } from "node:crypto";
import { createGmailTransport, getGmailConfig } from "../email/gmail";
import { hashPassword } from "./password";
import { findPasswordAuthUserByEmail, updatePasswordAuthUserPassword } from "./user";

type ResetTokenRow = {
  expires_at: string;
  id: string;
  user_id: string;
};

function hashResetToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function buildPasswordResetUrl(token: string) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || "http://localhost:3000";
  return `${appUrl}/reset-password/update?token=${encodeURIComponent(token)}`;
}

export async function sendPasswordResetEmail(input: { email: string; redirectTo: string }) {
  const gmailConfig = getGmailConfig();

  if (!gmailConfig) {
    throw new Error("Gmail SMTP is not configured.");
  }

  const passwordUser = await findPasswordAuthUserByEmail(input.email);

  if (!passwordUser) {
    throw new Error("User not found");
  }

  const supabase = createAdminClient();
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

  await supabase
    .from("password_auth_reset_tokens")
    .delete()
    .eq("user_id", passwordUser.id)
    .is("consumed_at", null);

  const { error } = await supabase.from("password_auth_reset_tokens").insert({
    expires_at: expiresAt.toISOString(),
    token_hash: hashResetToken(token),
    user_id: passwordUser.id
  });

  if (error) {
    throw new Error(`Failed to create password reset token: ${error.message}`);
  }

  const transporter = createGmailTransport(gmailConfig);
  const resetUrl = buildPasswordResetUrl(token);

  return transporter.sendMail({
    from: `"CertScore.ai" <${gmailConfig.fromEmail}>`,
    subject: "Reset your CertScore.ai password",
    text: [
      "We received a request to reset your CertScore.ai password.",
      "",
      "Use this secure link to choose a new password:",
      resetUrl,
      "",
      "This link expires in 1 hour. If you did not request a reset, you can ignore this email."
    ].join("\n"),
    to: input.email
  });
}

export async function resetPasswordWithToken(input: { password: string; token: string }) {
  const supabase = createAdminClient();
  const tokenHash = hashResetToken(input.token);
  const { data, error } = await supabase
    .from("password_auth_reset_tokens")
    .select("id, user_id, expires_at")
    .eq("token_hash", tokenHash)
    .is("consumed_at", null)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to validate password reset token: ${error.message}`);
  }

  if (!data) {
    return false;
  }

  const tokenRow = data as ResetTokenRow;

  if (new Date(tokenRow.expires_at).getTime() <= Date.now()) {
    return false;
  }

  const passwordHash = await hashPassword(input.password);
  const nowIso = new Date().toISOString();
  await updatePasswordAuthUserPassword({
    passwordHash,
    userId: tokenRow.user_id
  });

  const { error: consumeError } = await supabase
    .from("password_auth_reset_tokens")
    .update({ consumed_at: nowIso })
    .eq("id", tokenRow.id);

  if (consumeError) {
    throw new Error(`Failed to consume password reset token: ${consumeError.message}`);
  }

  return true;
}
