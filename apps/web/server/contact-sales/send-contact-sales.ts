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
  const fullName = String(formData.get("fullName") ?? "").trim();
  const workEmail = String(formData.get("workEmail") ?? "").trim();
  const company = String(formData.get("company") ?? "").trim();
  const website = String(formData.get("website") ?? "").trim();
  const message = String(formData.get("message") ?? "").trim();

  if (!fullName) {
    return { error: "Name is required." };
  }

  if (!workEmail) {
    return { error: "Work email is required." };
  }

  if (!company) {
    return { error: "Company is required." };
  }

  if (!message) {
    return { error: "Tell us what you want to discuss." };
  }

  const gmailConfig = getGmailConfig();
  const toEmail = process.env.FEEDBACK_TO_EMAIL?.trim() || "ben@ergoveritas.com";

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
      subject: `[CertScore.ai Contact Sales] ${company} inquiry`,
      text: [
        `Name: ${fullName}`,
        `Work email: ${workEmail}`,
        `Company: ${company}`,
        `Website: ${website || "Not provided"}`,
        "",
        "Inquiry:",
        message,
        "",
        `Sent from: ${gmailConfig.appUrl}/contact-sales`
      ].join("\n")
    });
  } catch {
    return { error: "Contact request could not be sent. Please verify the Gmail sender and app password." };
  }

  redirect("/");
}
