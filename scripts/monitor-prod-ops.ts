import { execFileSync } from "node:child_process";
import { createAdminClient } from "@website-signal-risk-scanner/db";
import { createGmailTransport, getGmailConfig } from "../apps/web/server/email/gmail";

const DEFAULT_PROJECT_ID = "certscore-ai";
const DEFAULT_REGION = "us-central1";
const DEFAULT_ENVIRONMENT = "production";
const DEFAULT_HEARTBEAT_STALE_MINUTES = 10;
const DEFAULT_SUPABASE_URL = "https://wgfhzyrysztmtrjbcsgy.supabase.co";
const DEFAULT_SUPABASE_ANON_KEY = "sb_publishable_5IJ4sZwcahADQtkyMq2rgA_g6NaYJxS";
const DEFAULT_SUPABASE_SERVICE_ROLE_SECRET = "certscore-validation-worker-supabase-service-role-key";
const VALIDATION_SETTINGS_KEY = "default";

type WorkerPoolDescription = {
  spec?: {
    template?: {
      spec?: {
        serviceAccountName?: string;
      };
    };
  };
  status?: {
    conditions?: Array<{
      message?: string;
      status?: string;
      type?: string;
    }>;
    latestCreatedRevisionName?: string;
    latestReadyRevisionName?: string;
  };
};

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

function describeWorkerPool(projectId: string, region: string, workerPoolName: string) {
  const raw = execFileSync(
    "gcloud",
    [
      "beta",
      "run",
      "worker-pools",
      "describe",
      workerPoolName,
      "--project",
      projectId,
      "--region",
      region,
      "--format=json"
    ],
    {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    }
  );

  return JSON.parse(raw) as WorkerPoolDescription;
}

function accessSecret(projectId: string, secretName: string) {
  return execFileSync(
    "gcloud",
    ["secrets", "versions", "access", "latest", "--project", projectId, "--secret", secretName],
    {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    }
  ).trim();
}

function summarizeWorkerPool(workerPoolName: string, description: WorkerPoolDescription) {
  const readyCondition = description.status?.conditions?.find((condition) => condition.type === "Ready");

  return {
    latestCreatedRevisionName: description.status?.latestCreatedRevisionName ?? null,
    latestReadyRevisionName: description.status?.latestReadyRevisionName ?? null,
    message: readyCondition?.message ?? null,
    ready: readyCondition?.status === "True",
    serviceAccountName: description.spec?.template?.spec?.serviceAccountName ?? null,
    workerPoolName
  };
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
  const projectId = process.env.GCP_PROJECT_ID?.trim() || DEFAULT_PROJECT_ID;
  const region = process.env.GCP_REGION?.trim() || DEFAULT_REGION;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || DEFAULT_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || DEFAULT_SUPABASE_ANON_KEY;
  const supabaseServiceRoleSecretName =
    process.env.SUPABASE_SERVICE_ROLE_SECRET_NAME?.trim() || DEFAULT_SUPABASE_SERVICE_ROLE_SECRET;
  const supabaseServiceRoleKey = accessSecret(projectId, supabaseServiceRoleSecretName);
  const staleMinutes = Number(process.env.OPS_HEARTBEAT_STALE_MINUTES ?? DEFAULT_HEARTBEAT_STALE_MINUTES);
  const staleThresholdMs = staleMinutes * 60_000;
  const findings: string[] = [];

  const db = createAdminClient({
    NEXT_PUBLIC_SUPABASE_ANON_KEY: supabaseAnonKey,
    NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
    SUPABASE_SERVICE_ROLE_KEY: supabaseServiceRoleKey
  });
  const { data: validationSettings, error: validationSettingsError } = await db
    .from("validation_settings")
    .select("last_worker_heartbeat_at, last_worker_host, pipeline_enabled")
    .eq("singleton_key", VALIDATION_SETTINGS_KEY)
    .maybeSingle<ValidationSettingsRow>();

  if (validationSettingsError) {
    findings.push(`Validation settings query failed: ${validationSettingsError.message}`);
  } else if (!validationSettings) {
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

  const workerPools = [
    summarizeWorkerPool("certscore-worker", describeWorkerPool(projectId, region, "certscore-worker")),
    summarizeWorkerPool("certscore-validation-worker", describeWorkerPool(projectId, region, "certscore-validation-worker"))
  ];

  for (const workerPool of workerPools) {
    if (!workerPool.ready) {
      findings.push(
        `${workerPool.workerPoolName} is not ready (ready revision ${workerPool.latestReadyRevisionName ?? "none"}, latest created ${workerPool.latestCreatedRevisionName ?? "none"}). ${workerPool.message ?? ""}`.trim()
      );
    }
  }

  if (findings.length === 0) {
    console.log(
      JSON.stringify(
        {
          environment,
          status: "ok",
          validationHeartbeatAt: validationSettings?.last_worker_heartbeat_at ?? null,
          workerPools
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
    `Project: ${projectId}/${region}`,
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
