"use server";

import { redirect } from "next/navigation";
import { createGmailTransport, getGmailConfig } from "../email/gmail";

export type SendContactSalesActionState = {
  error: string | null;
};

export async function sendContactSalesAction(
  _: SendContactSalesActionState,
  formData: FormData
): Promise<SendContactSalesActionState> {
  const requestType = String(formData.get("requestType") ?? "quick-assessment").trim() === "sales" ? "sales" : "quick-assessment";
  const fullName = String(formData.get("fullName") ?? "").trim();
  const workEmail = String(formData.get("workEmail") ?? "").trim();
  const company = String(formData.get("company") ?? "").trim();
  const website = String(formData.get("website") ?? "").trim();
  const message = String(formData.get("message") ?? "").trim();

  if (!workEmail) {
    return { error: "Work email is required." };
  }

  if (requestType === "quick-assessment" && !website) {
    return { error: "Website is required for a quick assessment." };
  }

  if (requestType === "sales" && !website && !message && !company) {
    return { error: "Add at least a website, company, or short note so we know how to follow up." };
  }

  const gmailConfig = getGmailConfig();
  const toEmail = process.env.FEEDBACK_TO_EMAIL?.trim() || "ben@certscore.ai";

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
      subject: `[CertScore.ai Contact] ${requestType === "quick-assessment" ? "Quick assessment" : "Sales inquiry"} · ${company || website || workEmail}`,
      text: [
        `Request type: ${requestType === "quick-assessment" ? "Quick assessment" : "Talk with sales"}`,
        `Name: ${fullName || "Not provided"}`,
        `Work email: ${workEmail}`,
        `Company: ${company || "Not provided"}`,
        `Website: ${website || "Not provided"}`,
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

  redirect("/");
}
