import { headers } from "next/headers";
import { getAuth } from "../better-auth/auth";
import { createGmailTransport, getGmailConfig } from "../email/gmail";

function getRequestOrigin(headerStore: Headers) {
  const forwardedHost = headerStore.get("x-forwarded-host")?.trim();
  const host = forwardedHost || headerStore.get("host")?.trim();

  if (!host) {
    return process.env.NEXT_PUBLIC_APP_URL?.trim() || "http://localhost:3000";
  }

  const protocol = headerStore.get("x-forwarded-proto")?.trim() || (host.includes("localhost") ? "http" : "https");
  return `${protocol}://${host}`;
}

export async function sendPasswordSetupLink(email: string) {
  const gmailConfig = getGmailConfig();
  if (!gmailConfig) {
    throw new Error("Email delivery is not configured. Set GMAIL_SMTP_USER and GMAIL_SMTP_APP_PASSWORD.");
  }
  await createGmailTransport(gmailConfig).verify();

  const headerStore = await headers();
  const requestOrigin = getRequestOrigin(headerStore);

  await getAuth().api.requestPasswordReset({
    body: {
      email,
      redirectTo: `${requestOrigin}/reset-password/update`
    },
    headers: headerStore
  });
}
