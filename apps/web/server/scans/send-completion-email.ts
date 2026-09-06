import "server-only";
import {
  beginFullSiteCompletionEmail,
  finishFullSiteCompletionEmail,
} from "@website-signal-risk-scanner/db";
import { createGmailTransport, getGmailConfig } from "../email/gmail";
import { loadFullSiteReport } from "./full-site-report";
import { buildScanCompletionEmail } from "./completion-email-content";

const defaults = {
  begin: beginFullSiteCompletionEmail,
  finish: finishFullSiteCompletionEmail,
  load: loadFullSiteReport,
  config: getGmailConfig,
  transport: createGmailTransport,
};
export async function sendScanCompletionEmail(
  scanId: string,
  token: string,
  dependencies = defaults,
) {
  const config = dependencies.config();
  if (!config) throw new Error("Completion email delivery is not configured.");
  const recipient = await dependencies.begin(scanId, token);
  if (!recipient) return;
  let deliveryStarted = false;
  let transporter: ReturnType<typeof createGmailTransport> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient.email))
      throw new Error("Recipient email unavailable.");
    const report = await dependencies.load(scanId);
    if (!report || report.summary.counts.pending)
      throw new Error("Terminal inventory unavailable.");
    const reportUrl = new URL(`/scan/${scanId}`, config.appUrl);
    if (
      process.env.NODE_ENV === "production" &&
      reportUrl.protocol !== "https:"
    )
      throw new Error("Report origin requires HTTPS.");
    const domain = report.pages.rows[0]
      ? new URL(report.pages.rows[0].url).hostname
      : "your website";
    const content = buildScanCompletionEmail({
      summary: report.summary,
      domain,
      reportUrl: reportUrl.toString(),
    });
    transporter = dependencies.transport(config);
    const messageId = `<scan-complete-${scanId}@certscore.ai>`;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        transporter?.close();
        reject(new Error("Delivery timeout"));
      }, 20000);
    });
    deliveryStarted = true;
    const result = await Promise.race([
      transporter.sendMail({
        from: `"CertScore.ai Reports" <${config.fromEmail}>`,
        to: recipient.email,
        messageId,
        ...content,
      }),
      timeout,
    ]);
    if (!result.accepted?.length)
      throw new Error("Delivery acceptance unavailable.");
    await dependencies.finish(scanId, token, "sent", messageId);
  } catch (error) {
    // SMTP cannot guarantee exactly-once delivery. Retry only before SMTP DATA;
    // ambiguous outcomes remain explicit for operations, without duplicate mail.
    const command = (error as { command?: string })?.command;
    const safeRetry =
      !deliveryStarted ||
      (typeof command === "string" &&
        /^(CONN|EHLO|HELO|STARTTLS|AUTH(?: .*|)|MAIL FROM|RCPT TO)$/.test(
          command,
        ));
    await dependencies.finish(scanId, token, safeRetry ? "retry" : "uncertain");
    console.error("[scan-completion-email] delivery did not finish", {
      scanId,
      outcome: safeRetry ? "retry" : "uncertain",
    });
  } finally {
    if (timer) clearTimeout(timer);
    transporter?.close();
  }
}
