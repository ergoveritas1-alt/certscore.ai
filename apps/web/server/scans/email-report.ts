"use server";

import { createGmailTransport, getGmailConfig } from "../email/gmail";

export type SendReportEmailActionState = {
  error: string | null;
  success: string | null;
};

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function normalizeScanId(value: string) {
  const scanId = value.trim();
  return /^[0-9a-f-]{32,36}$/i.test(scanId) ? scanId : "";
}

export async function sendReportEmailAction(
  _previousState: SendReportEmailActionState,
  formData: FormData
): Promise<SendReportEmailActionState> {
  const recipientEmail = String(formData.get("recipientEmail") ?? "").trim().toLowerCase();
  const domainLabel = String(formData.get("domainLabel") ?? "").trim() || "this website";
  const scanId = normalizeScanId(String(formData.get("scanId") ?? ""));

  if (!isValidEmail(recipientEmail)) {
    return {
      error: "Enter a valid email address.",
      success: null
    };
  }

  if (!scanId) {
    return {
      error: "This report link is not available yet.",
      success: null
    };
  }

  const gmailConfig = getGmailConfig();

  if (!gmailConfig) {
    return {
      error: "Report email is not configured yet.",
      success: null
    };
  }

  const reportUrl = new URL(`/scan/${scanId}`, gmailConfig.appUrl).toString();
  const transporter = createGmailTransport(gmailConfig);

  try {
    await transporter.sendMail({
      from: `"CertScore.ai Reports" <${gmailConfig.fromEmail}>`,
      to: recipientEmail,
      subject: `Your CertScore.ai report for ${domainLabel}`,
      text: [
        `Here is the CertScore.ai report for ${domainLabel}:`,
        "",
        reportUrl,
        "",
        "Automated public-web observations. Review the evidence before relying on findings."
      ].join("\n")
    });
  } catch {
    return {
      error: "Report email could not be sent right now.",
      success: null
    };
  }

  return {
    error: null,
    success: "Sent."
  };
}
