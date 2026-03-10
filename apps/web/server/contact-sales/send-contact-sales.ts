"use server";

import { redirect } from "next/navigation";
import nodemailer from "nodemailer";

export type SendContactSalesActionState = {
  error: string | null;
};

type GmailContactSalesConfig = {
  appUrl: string;
  fromEmail: string;
  toEmail: string;
  appPassword: string;
};

function getGmailContactSalesConfig(): GmailContactSalesConfig | null {
  const fromEmail = process.env.GMAIL_SMTP_USER?.trim();
  const appPassword = process.env.GMAIL_SMTP_APP_PASSWORD?.trim();

  if (!fromEmail || !appPassword || appPassword === "your-gmail-app-password") {
    return null;
  }

  return {
    appUrl: process.env.NEXT_PUBLIC_APP_URL?.trim() || "http://localhost:3000",
    fromEmail,
    toEmail: process.env.FEEDBACK_TO_EMAIL?.trim() || "ben@ergoveritas.com",
    appPassword
  };
}

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

  const gmailConfig = getGmailContactSalesConfig();

  if (!gmailConfig) {
    return {
      error: "Contact sales email is not configured yet. Add GMAIL_SMTP_USER and GMAIL_SMTP_APP_PASSWORD to enable sending."
    };
  }

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: gmailConfig.fromEmail,
      pass: gmailConfig.appPassword
    }
  });

  try {
    await transporter.sendMail({
      from: `"CertScore.ai Contact Sales" <${gmailConfig.fromEmail}>`,
      to: gmailConfig.toEmail,
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
