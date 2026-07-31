import { headers } from "next/headers";
import { getAuth } from "../better-auth/auth";
import { createGmailTransport, getGmailConfig } from "../email/gmail";
import {
  type PasswordEmailPurpose,
  withPasswordEmailPurpose
} from "./password-email-purpose";

function getRequestOrigin(headerStore: Headers) {
  const forwardedHost = headerStore.get("x-forwarded-host")?.trim();
  const host = forwardedHost || headerStore.get("host")?.trim();

  if (!host) {
    return process.env.NEXT_PUBLIC_APP_URL?.trim() || "http://localhost:3000";
  }

  const protocol = headerStore.get("x-forwarded-proto")?.trim() || (host.includes("localhost") ? "http" : "https");
  return `${protocol}://${host}`;
}

async function sendPasswordLink(email: string, purpose: PasswordEmailPurpose) {
  const gmailConfig = getGmailConfig();
  if (!gmailConfig) {
    throw new Error("Email delivery is not configured. Set GMAIL_SMTP_USER and GMAIL_SMTP_APP_PASSWORD.");
  }
  await createGmailTransport(gmailConfig).verify();

  const headerStore = await headers();
  const requestOrigin = getRequestOrigin(headerStore);

  await withPasswordEmailPurpose(purpose, () =>
    getAuth().api.requestPasswordReset({
      body: {
        email,
        redirectTo: `${requestOrigin}/reset-password/update`
      },
      headers: headerStore
    })
  );
}

export function sendPasswordSetupLink(email: string) {
  return sendPasswordLink(email, "account_setup");
}

export function sendPasswordResetLink(email: string) {
  return sendPasswordLink(email, "password_reset");
}
