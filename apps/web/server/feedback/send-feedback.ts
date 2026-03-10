"use server";

import { redirect } from "next/navigation";
import nodemailer from "nodemailer";

export type SendFeedbackActionState = {
  error: string | null;
};

type GmailFeedbackConfig = {
  appUrl: string;
  fromEmail: string;
  toEmail: string;
  appPassword: string;
};

function getGmailFeedbackConfig(): GmailFeedbackConfig | null {
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

export async function sendFeedbackAction(
  _: SendFeedbackActionState,
  formData: FormData
): Promise<SendFeedbackActionState> {
  const subject = String(formData.get("subject") ?? "").trim();
  const feedback = String(formData.get("feedback") ?? "").trim();
  const userEmail = String(formData.get("userEmail") ?? "").trim();

  if (!subject) {
    return { error: "Subject is required." };
  }

  if (!feedback) {
    return { error: "Feedback is required." };
  }

  const gmailConfig = getGmailFeedbackConfig();

  if (!gmailConfig) {
    return {
      error: "Feedback email is not configured yet. Add GMAIL_SMTP_USER and GMAIL_SMTP_APP_PASSWORD to enable sending."
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
      from: `"CertScore.ai Feedback" <${gmailConfig.fromEmail}>`,
      to: gmailConfig.toEmail,
      replyTo: userEmail || gmailConfig.fromEmail,
      subject: `[CertScore.ai Feedback] ${subject}`,
      text: [
        feedback,
        "",
        `From user: ${userEmail || "Unknown user"}`,
        `Sent from: ${gmailConfig.appUrl}/app/feedback`
      ].join("\n")
    });
  } catch {
    return { error: "Feedback could not be sent. Please verify the Gmail sender and app password." };
  }

  redirect("/app");
}
