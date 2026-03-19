import nodemailer from "nodemailer";

type GmailConfig = {
  appPassword: string;
  appUrl: string;
  fromEmail: string;
};

export function getGmailConfig(): GmailConfig | null {
  const fromEmail = process.env.GMAIL_SMTP_USER?.trim();
  const appPassword = process.env.GMAIL_SMTP_APP_PASSWORD?.trim();

  if (!fromEmail || !appPassword || appPassword === "your-gmail-app-password") {
    return null;
  }

  return {
    appPassword,
    appUrl: process.env.NEXT_PUBLIC_APP_URL?.trim() || "http://localhost:3000",
    fromEmail
  };
}

export function createGmailTransport(config: GmailConfig) {
  return nodemailer.createTransport({
    auth: {
      pass: config.appPassword,
      user: config.fromEmail
    },
    service: "gmail"
  });
}
