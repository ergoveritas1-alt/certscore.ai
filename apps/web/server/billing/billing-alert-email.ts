import "server-only";

import type Stripe from "stripe";
import { createGmailTransport, getGmailConfig } from "../email/gmail";
import { buildBillingAlertEmail, buildBillingAlertInput } from "./billing-alert-email-content";

function getBillingAlertToEmail() {
  return (
    process.env.BILLING_ALERT_TO_EMAIL?.trim() ||
    process.env.OPS_ALERT_TO_EMAIL?.trim() ||
    process.env.FEEDBACK_TO_EMAIL?.trim() ||
    "ben@certscore.ai"
  );
}

export async function sendBillingAlertEmail(event: Stripe.Event) {
  const alertInput = buildBillingAlertInput(event);
  if (!alertInput) {
    return;
  }

  const gmailConfig = getGmailConfig();
  if (!gmailConfig) {
    return;
  }

  const message = buildBillingAlertEmail(alertInput);
  await createGmailTransport(gmailConfig).sendMail({
    from: `"CertScore.ai Billing" <${gmailConfig.fromEmail}>`,
    subject: message.subject,
    text: message.text,
    to: getBillingAlertToEmail()
  });
}
