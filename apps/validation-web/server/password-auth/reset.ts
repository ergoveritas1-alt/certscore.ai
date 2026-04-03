import { createAdminClient } from "@website-signal-risk-scanner/db";
import { createGmailTransport, getGmailConfig } from "../email/gmail";

function buildPasswordResetUrl(input: {
  appUrl: string;
  hashedToken: string;
  redirectTo: string;
  verificationType: string;
}) {
  const targetUrl = new URL(input.redirectTo);
  const nextPath = `${targetUrl.pathname}${targetUrl.search}`;

  return `${input.appUrl}/auth/callback?token_hash=${encodeURIComponent(input.hashedToken)}&type=${encodeURIComponent(input.verificationType)}&next=${encodeURIComponent(nextPath)}`;
}

export async function sendPasswordResetEmail(input: { email: string; redirectTo: string }) {
  const gmailConfig = getGmailConfig();

  if (!gmailConfig) {
    throw new Error("Gmail SMTP is not configured.");
  }

  const supabase = createAdminClient();
  const {
    data,
    error
  } = await supabase.auth.admin.generateLink({
    email: input.email,
    options: {
      redirectTo: input.redirectTo
    },
    type: "recovery"
  });

  if (error || !data.properties.action_link) {
    throw new Error(`Failed to create password reset link: ${error?.message ?? "Unknown error"}`);
  }

  const transporter = createGmailTransport(gmailConfig);
  const resetUrl = buildPasswordResetUrl({
    appUrl: gmailConfig.appUrl,
    hashedToken: data.properties.hashed_token,
    redirectTo: input.redirectTo,
    verificationType: data.properties.verification_type
  });

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
