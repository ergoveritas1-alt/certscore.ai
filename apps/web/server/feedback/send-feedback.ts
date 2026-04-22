"use server";

import { redirect } from "next/navigation";
import { createGmailTransport, getGmailConfig } from "../email/gmail";

export type SendFeedbackActionState = {
  error: string | null;
};

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

  const gmailConfig = getGmailConfig();
  const toEmail = process.env.FEEDBACK_TO_EMAIL?.trim() || "ben@certscore.ai";

  if (!gmailConfig) {
    return {
      error: "Feedback email is not configured yet. Add GMAIL_SMTP_USER and GMAIL_SMTP_APP_PASSWORD to enable sending."
    };
  }

  const transporter = createGmailTransport(gmailConfig);

  try {
    await transporter.sendMail({
      from: `"CertScore.ai Feedback" <${gmailConfig.fromEmail}>`,
      to: toEmail,
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
