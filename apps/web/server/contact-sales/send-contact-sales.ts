"use server";

import { redirect } from "next/navigation";
import { createGmailTransport, getGmailConfig } from "../email/gmail";

export type SendContactSalesActionState = {
  error: string | null;
};

type ContactRequestType = "quick-assessment" | "sales" | "monitor-site";

function normalizeContactRequestType(value: string): ContactRequestType {
  if (value === "sales" || value === "sales-contact") {
    return "sales";
  }
  if (value === "monitor-site") {
    return "monitor-site";
  }
  return "quick-assessment";
}

function getRequestTypeLabel(requestType: ContactRequestType) {
  if (requestType === "sales") {
    return "Talk with sales";
  }
  if (requestType === "monitor-site") {
    return "Monitor this site";
  }
  return "Quick assessment";
}

export async function sendContactSalesAction(
  _: SendContactSalesActionState,
  formData: FormData
): Promise<SendContactSalesActionState> {
  const requestType = normalizeContactRequestType(String(formData.get("requestType") ?? "quick-assessment").trim());
  const fullName = String(formData.get("fullName") ?? "").trim();
  const workEmail = String(formData.get("workEmail") ?? "").trim();
  const company = String(formData.get("company") ?? "").trim();
  const website = String(formData.get("website") ?? "").trim();
  const message = String(formData.get("message") ?? "").trim();
  const monitoringInterest = String(formData.get("monitoringInterest") ?? "").trim();

  if (!workEmail) {
    return { error: "Work email is required." };
  }

  if ((requestType === "quick-assessment" || requestType === "monitor-site") && !website) {
    return {
      error:
        requestType === "monitor-site"
          ? "Website is required for monitoring interest."
          : "Website is required for a quick assessment."
    };
  }

  if (requestType === "sales" && !message) {
    return { error: "Please add a short message so we know how to help." };
  }

  const gmailConfig = getGmailConfig();
  const toEmail = "support@certscore.ai";

  if (!gmailConfig) {
    return {
      error: "Contact sales email is not configured yet. Add GMAIL_SMTP_USER and GMAIL_SMTP_APP_PASSWORD to enable sending."
    };
  }

  const transporter = createGmailTransport(gmailConfig);

  try {
    await transporter.sendMail({
      from: `"CertScore.ai Contact Sales" <${gmailConfig.fromEmail}>`,
      to: toEmail,
      replyTo: workEmail,
      subject: `[CertScore.ai Contact] ${getRequestTypeLabel(requestType)} · ${company || website || workEmail}`,
      text: [
        `Request type: ${getRequestTypeLabel(requestType)}`,
        `Name: ${fullName || "Not provided"}`,
        `Work email: ${workEmail}`,
        `Company: ${company || "Not provided"}`,
        `Website: ${website || "Not provided"}`,
        `Monitoring interest: ${monitoringInterest || "Not provided"}`,
        "",
        "Inquiry:",
        message || "Not provided",
        "",
        `Sent from: ${gmailConfig.appUrl}/contact-sales`
      ].join("\n")
    });
  } catch {
    return { error: "Contact request could not be sent. Please verify the Gmail sender and app password." };
  }

  if (requestType === "monitor-site") {
    redirect(`/monitor-site/thanks${website ? `?website=${encodeURIComponent(website)}` : ""}`);
  }

  redirect("/");
}
