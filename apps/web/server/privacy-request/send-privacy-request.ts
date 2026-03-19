"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { createGmailTransport, getGmailConfig } from "../email/gmail";

export type SendPrivacyRequestActionState = {
  error: string | null;
};

const ALLOWED_REQUEST_TYPES = new Set([
  "access",
  "delete",
  "correct",
  "portability",
  "object",
  "opt-out",
  "other"
]);

function normalizeRequestType(value: string) {
  return ALLOWED_REQUEST_TYPES.has(value) ? value : "other";
}

function normalizeJurisdiction(value: string) {
  if (value === "gdpr" || value === "uk-gdpr" || value === "ccpa-cpra" || value === "other") {
    return value;
  }

  return "other";
}

function normalizeVerificationStatus(value: string) {
  if (value === "account-email" || value === "alternate-email" || value === "authorized-agent") {
    return value;
  }

  return "alternate-email";
}

export async function sendPrivacyRequestAction(
  _: SendPrivacyRequestActionState,
  formData: FormData
): Promise<SendPrivacyRequestActionState> {
  const requestType = normalizeRequestType(String(formData.get("requestType") ?? "").trim());
  const fullName = String(formData.get("fullName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const organization = String(formData.get("organization") ?? "").trim();
  const countryOrState = String(formData.get("countryOrState") ?? "").trim();
  const jurisdiction = normalizeJurisdiction(String(formData.get("jurisdiction") ?? "").trim());
  const verificationStatus = normalizeVerificationStatus(String(formData.get("verificationStatus") ?? "").trim());
  const identifiers = String(formData.get("identifiers") ?? "").trim();
  const details = String(formData.get("details") ?? "").trim();

  if (!email) {
    return { error: "Email is required so we can verify and respond to the request." };
  }

  if (!details) {
    return { error: "Describe the request so we know what records or actions to review." };
  }

  const gmailConfig = getGmailConfig();
  const toEmail = process.env.PRIVACY_REQUEST_TO_EMAIL?.trim() || process.env.FEEDBACK_TO_EMAIL?.trim() || "privacy@certscore.ai";

  if (!gmailConfig) {
    return {
      error: "Privacy request email is not configured yet. Send your request to privacy@certscore.ai while this form is being enabled."
    };
  }

  const transporter = createGmailTransport(gmailConfig);
  const requestId = `DSAR-${randomUUID().slice(0, 8).toUpperCase()}`;

  try {
    await transporter.sendMail({
      from: `"CertScore.ai Privacy Requests" <${gmailConfig.fromEmail}>`,
      to: toEmail,
      replyTo: email,
      subject: `[CertScore.ai DSAR] ${requestId} · ${requestType} · ${organization || email}`,
      text: [
        `Request ID: ${requestId}`,
        `Request type: ${requestType}`,
        `Full name: ${fullName || "Not provided"}`,
        `Email: ${email}`,
        `Organization: ${organization || "Not provided"}`,
        `Country/State: ${countryOrState || "Not provided"}`,
        `Jurisdiction: ${jurisdiction}`,
        `Verification path: ${verificationStatus}`,
        `Identifiers: ${identifiers || "Not provided"}`,
        "",
        "Request details:",
        details,
        "",
        `Sent from: ${gmailConfig.appUrl}/privacy-request`
      ].join("\n")
    });
  } catch {
    return {
      error: "The privacy request could not be sent. Email privacy@certscore.ai directly while we resolve the delivery issue."
    };
  }

  redirect(`/privacy-request?submitted=1&requestId=${encodeURIComponent(requestId)}`);
}
