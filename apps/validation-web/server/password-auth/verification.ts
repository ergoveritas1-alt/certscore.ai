import { createAdminClient } from "@website-signal-risk-scanner/db";
import { randomBytes, createHash } from "node:crypto";
import { createGmailTransport, getGmailConfig } from "../email/gmail";

type VerificationTokenRow = {
  expires_at: string;
  id: string;
  user_id: string;
};

function hashVerificationToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function buildVerificationUrl(token: string) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || "http://localhost:3000";
  return `${appUrl}/auth/verify-email?token=${encodeURIComponent(token)}`;
}

export async function issueEmailVerificationToken(userId: string) {
  const supabase = createAdminClient();
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  await supabase
    .from("password_auth_verification_tokens")
    .delete()
    .eq("user_id", userId)
    .is("consumed_at", null);

  const { error } = await supabase.from("password_auth_verification_tokens").insert({
    expires_at: expiresAt.toISOString(),
    token_hash: hashVerificationToken(token),
    user_id: userId
  });

  if (error) {
    throw new Error(`Failed to create email verification token: ${error.message}`);
  }

  return {
    expiresAt,
    token
  };
}

export async function sendVerificationEmail(input: { email: string; userId: string }) {
  const gmailConfig = getGmailConfig();

  if (!gmailConfig) {
    return;
  }

  const { token } = await issueEmailVerificationToken(input.userId);
  const transporter = createGmailTransport(gmailConfig);
  const verificationUrl = buildVerificationUrl(token);

  await transporter.sendMail({
    from: `"CertScore.ai" <${gmailConfig.fromEmail}>`,
    subject: "Verify your CertScore.ai email",
    text: [
      "Thanks for creating your CertScore.ai account.",
      "",
      "You can already use the product. Verify your email when convenient:",
      verificationUrl,
      "",
      "If you did not create this account, you can ignore this email."
    ].join("\n"),
    to: input.email
  });
}

export async function verifyEmailToken(token: string) {
  const supabase = createAdminClient();
  const tokenHash = hashVerificationToken(token);
  const { data, error } = await supabase
    .from("password_auth_verification_tokens")
    .select("id, user_id, expires_at")
    .eq("token_hash", tokenHash)
    .is("consumed_at", null)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to verify email token: ${error.message}`);
  }

  if (!data) {
    return false;
  }

  const verificationToken = data as VerificationTokenRow;

  if (new Date(verificationToken.expires_at).getTime() <= Date.now()) {
    return false;
  }

  const nowIso = new Date().toISOString();
  const [{ error: consumeError }, { error: verifyError }] = await Promise.all([
    supabase
      .from("password_auth_verification_tokens")
      .update({ consumed_at: nowIso })
      .eq("id", verificationToken.id),
    supabase
      .from("password_auth_users")
      .update({ email_verified_at: nowIso })
      .eq("id", verificationToken.user_id)
      .is("email_verified_at", null)
  ]);

  if (consumeError) {
    throw new Error(`Failed to consume email verification token: ${consumeError.message}`);
  }

  if (verifyError) {
    throw new Error(`Failed to mark email as verified: ${verifyError.message}`);
  }

  return true;
}
