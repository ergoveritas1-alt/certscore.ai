import type { PasswordEmailPurpose } from "./password-email-purpose";

type PasswordEmailContentInput = {
  email: string;
  purpose: PasswordEmailPurpose;
  url: string;
};

export function buildPasswordEmailContent({
  email,
  purpose,
  url
}: PasswordEmailContentInput): { subject: string; text: string } {
  if (purpose === "account_setup") {
    return {
      subject: "Welcome to CertScore.ai — set your password",
      text: [
        "Welcome to CertScore.ai.",
        "",
        `An account has been created for you using ${email}.`,
        "",
        "Use the secure link below to create your password and activate your account:",
        url,
        "",
        "This link expires in 24 hours. Once your password is set, you can sign in and access any workspace assigned to you.",
        "",
        "If you were not expecting this invitation, you can safely ignore this email or contact your workspace administrator."
      ].join("\n")
    };
  }

  return {
    subject: "Reset your CertScore.ai password",
    text: [
      "We received a request to reset your CertScore.ai password.",
      "",
      "Use this secure link to choose a new password:",
      url,
      "",
      `If you did not request a reset for ${email}, you can ignore this email.`
    ].join("\n")
  };
}
