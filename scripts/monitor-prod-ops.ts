import { queryOne } from "@website-signal-risk-scanner/db";
import { createGmailTransport, getGmailConfig } from "../apps/web/server/email/gmail";
import { getLastScannerServiceHeartbeat } from "../apps/web/server/queue/full-scan-queue";

const DEFAULT_ENVIRONMENT = "production";
const DEFAULT_HEARTBEAT_STALE_MINUTES = 10;
const VALIDATION_SETTINGS_KEY = "default";

type ValidationSettingsRow = {
  last_worker_heartbeat_at: string | null;
  last_worker_host: string | null;
  pipeline_enabled: boolean;
};

function getAlertRecipients() {
  return (process.env.OPS_ALERT_TO_EMAIL ?? process.env.FEEDBACK_TO_EMAIL ?? process.env.GMAIL_SMTP_USER ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

async function sendAlertEmail(subject: string, lines: string[]) {
  const gmailConfig = getGmailConfig();
  const recipients = getAlertRecipients();

  if (!gmailConfig || recipients.length === 0) {
    return false;
  }

  const transporter = createGmailTransport(gmailConfig);
  await transporter.sendMail({
    from: `"CertScore.ai Ops Monitor" <${gmailConfig.fromEmail}>`,
    subject,
    text: lines.join("\n"),
    to: recipients.join(", ")
  });

  return true;
}

async function main() {
  const environment = process.env.OPS_ALERT_ENVIRONMENT?.trim() || DEFAULT_ENVIRONMENT;
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error("Set DATABASE_URL before running the ops monitor.");
  }
  const staleMinutes = Number(process.env.OPS_HEARTBEAT_STALE_MINUTES ?? DEFAULT_HEARTBEAT_STALE_MINUTES);
  const staleThresholdMs = staleMinutes * 60_000;
  const findings: string[] = [];
  process.env.DATABASE_URL = databaseUrl;

  let validationSettings: ValidationSettingsRow | null = null;
  try {
    validationSettings = await queryOne<ValidationSettingsRow>(
      `
        select last_worker_heartbeat_at, last_worker_host, pipeline_enabled
        from validation_settings
        where singleton_key = $1
      `,
      [VALIDATION_SETTINGS_KEY],
      { readOnly: true }
    );
  } catch (error) {
    findings.push(`Validation settings query failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (!validationSettings) {
    findings.push("Validation settings row is missing.");
  } else if (validationSettings.pipeline_enabled) {
    if (!validationSettings.last_worker_heartbeat_at) {
      findings.push("Validation worker heartbeat is missing.");
    } else {
      const heartbeatAgeMs = Date.now() - new Date(validationSettings.last_worker_heartbeat_at).getTime();
      if (heartbeatAgeMs > staleThresholdMs) {
        findings.push(
          `Validation worker heartbeat is stale (${Math.round(heartbeatAgeMs / 60_000)}m old, host ${validationSettings.last_worker_host ?? "unknown"}).`
        );
      }
    }
  }

  const scannerHeartbeat = await getLastScannerServiceHeartbeat();

  if (scannerHeartbeat.errorMessage) {
    findings.push(scannerHeartbeat.errorMessage);
  } else if (!scannerHeartbeat.lastHeartbeatAt) {
    findings.push("Scanner service heartbeat is missing.");
  } else {
    const heartbeatAgeMs = Date.now() - new Date(scannerHeartbeat.lastHeartbeatAt).getTime();
    if (heartbeatAgeMs > staleThresholdMs) {
      findings.push(
        `Scanner service heartbeat is stale (${Math.round(heartbeatAgeMs / 60_000)}m old, host ${scannerHeartbeat.host ?? "unknown"}).`
      );
    }
  }

  if (findings.length === 0) {
    console.log(
      JSON.stringify(
        {
          environment,
          status: "ok",
          validationHeartbeatAt: validationSettings?.last_worker_heartbeat_at ?? null
        },
        null,
        2
      )
    );
    return;
  }

  const subject = `[CertScore.ai Ops] ${environment} worker alert`;
  const lines = [
    `Environment: ${environment}`,
    "",
    "Findings:",
    ...findings.map((finding) => `- ${finding}`)
  ];

  const sent = await sendAlertEmail(subject, lines);
  console.error(lines.join("\n"));

  if (!sent) {
    console.error("Alert email was not sent because Gmail sender config or OPS_ALERT_TO_EMAIL is missing.");
  }

  process.exit(1);
}

void main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Ops monitor failed: ${message}`);
  process.exit(1);
});
