"use server";

import { createDomainRequestSchema } from "@website-signal-risk-scanner/shared";
import { queryOne } from "@website-signal-risk-scanner/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDashboardContext } from "../auth";
import { checkDomainDns } from "../domains/domain-dns";
import {
  countOrganizationDomains,
  createOrganizationDomain,
  findOrganizationDomainByNormalizedUrl
} from "../domains/repository";
import { updateAdminMonitorSiteRequestSetup } from "../admin/repository";
import { getPlanLimits } from "../plans/get-plan-limits";
import { ensureMonitorSiteRequestsTable } from "./monitor-site-request";

type MonitorSiteSetupRequestRow = {
  created_at: string;
  id: string;
  metadata_json: Record<string, unknown> | null;
  monitoring_goal: string;
  normalized_hostname: string;
  status: "pending" | "contacted" | "converted" | "closed";
  updated_at: string;
  website: string;
  work_email: string;
};

export type MonitorSiteSetupCandidate = {
  canConnect: boolean;
  connectedDomainId: string | null;
  createdAt: string;
  emailMatches: boolean;
  error: string | null;
  hostname: string;
  monitorSetup: {
    activeFrequency: string | null;
    requestedFrequency: string | null;
    setupStatus: "activated" | "pending_setup";
  } | null;
  monitoringGoal: string;
  requestEmail: string;
  signedInEmail: string;
  status: MonitorSiteSetupRequestRow["status"];
  updatedAt: string;
  website: string;
};

const connectMonitorSiteRequestSchema = z.object({
  requestedFrequency: z.enum(["manual", "daily", "weekly", "monthly"]),
  token: z.string().regex(/^[A-Za-z0-9_-]{20,120}$/, "Invalid monitor request token.")
});

function getRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function getString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function getSetupStatus(value: unknown) {
  return value === "activated" || value === "pending_setup" ? value : null;
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function setupRedirect(token: string, params: Record<string, string>): never {
  const searchParams = new URLSearchParams({ token, ...params });
  redirect(`/app/monitor-site/setup?${searchParams.toString()}`);
}

async function loadMonitorSiteSetupRequestByToken(token: string): Promise<MonitorSiteSetupRequestRow | null> {
  if (!/^[A-Za-z0-9_-]{20,120}$/.test(token)) {
    return null;
  }

  await ensureMonitorSiteRequestsTable();

  return await queryOne<MonitorSiteSetupRequestRow>(
    `select id,
            website,
            normalized_hostname,
            work_email,
            monitoring_goal,
            metadata_json,
            status,
            created_at,
            updated_at
       from monitor_site_requests
      where metadata_json->>'publicStatusToken' = $1
      limit 1`,
    [token],
    { readOnly: true }
  );
}

function toCandidate(input: {
  row: MonitorSiteSetupRequestRow;
  signedInEmail: string;
}): MonitorSiteSetupCandidate {
  const setup = getRecord(input.row.metadata_json?.monitorSetup);
  const setupStatus = getSetupStatus(setup?.setupStatus);
  const emailMatches = normalizeEmail(input.row.work_email) === normalizeEmail(input.signedInEmail);

  return {
    canConnect: emailMatches && input.row.status !== "closed" && setupStatus !== "activated",
    connectedDomainId: getString(setup?.domainId),
    createdAt: input.row.created_at,
    emailMatches,
    error:
      input.row.status === "closed"
        ? "This monitoring request is closed."
        : emailMatches
          ? null
          : "Sign in with the work email used on the monitoring request to connect it to a workspace.",
    hostname: input.row.normalized_hostname,
    monitorSetup: setupStatus
      ? {
          activeFrequency: getString(setup?.activeFrequency),
          requestedFrequency: getString(setup?.requestedFrequency),
          setupStatus
        }
      : null,
    monitoringGoal: input.row.monitoring_goal,
    requestEmail: input.row.work_email,
    signedInEmail: input.signedInEmail,
    status: input.row.status,
    updatedAt: input.row.updated_at,
    website: input.row.website
  };
}

export async function getMonitorSiteSetupCandidate(token: string): Promise<MonitorSiteSetupCandidate | null> {
  const { user } = await getDashboardContext();
  const row = await loadMonitorSiteSetupRequestByToken(token);

  if (!row) {
    return null;
  }

  return toCandidate({
    row,
    signedInEmail: user.email
  });
}

export async function connectMonitorSiteRequestFormAction(formData: FormData): Promise<void> {
  const parsed = connectMonitorSiteRequestSchema.parse({
    requestedFrequency: formData.get("requestedFrequency"),
    token: formData.get("token")
  });
  const dashboardContext = await getDashboardContext();
  const row = await loadMonitorSiteSetupRequestByToken(parsed.token);

  if (!row) {
    setupRedirect(parsed.token, { error: "not-found" });
  }

  if (normalizeEmail(row.work_email) !== normalizeEmail(dashboardContext.user.email)) {
    setupRedirect(parsed.token, { error: "email-mismatch" });
  }

  if (row.status === "closed") {
    setupRedirect(parsed.token, { error: "closed" });
  }

  const existingSetup = getRecord(row.metadata_json?.monitorSetup);
  if (getSetupStatus(existingSetup?.setupStatus) === "activated") {
    setupRedirect(parsed.token, { linked: "already-active" });
  }

  const parsedDomain = createDomainRequestSchema.safeParse({
    domain: row.website
  });

  if (!parsedDomain.success) {
    setupRedirect(parsed.token, { error: "invalid-domain" });
  }

  const [domainCount, planLimits] = await Promise.all([
    countOrganizationDomains(dashboardContext.organization.id),
    getPlanLimits(dashboardContext.organization.plan)
  ]);

  const dnsStatus = await checkDomainDns(parsedDomain.data.hostname);
  if (!dnsStatus.exists) {
    setupRedirect(parsed.token, { error: "dns" });
  }

  let domain = await findOrganizationDomainByNormalizedUrl({
    normalizedUrl: parsedDomain.data.normalizedUrl,
    organizationId: dashboardContext.organization.id
  });

  if (!domain) {
    if (domainCount >= planLimits.maxDomains) {
      setupRedirect(parsed.token, { error: "domain-limit" });
    }

    domain = await createOrganizationDomain({
      hostname: parsedDomain.data.hostname,
      normalizedUrl: parsedDomain.data.normalizedUrl,
      organizationId: dashboardContext.organization.id,
      scanFrequency: "manual"
    });
  }

  const linkedAt = new Date().toISOString();

  await updateAdminMonitorSiteRequestSetup({
    id: row.id,
    metadata: {
      monitorSetup: {
        accountLinkedAt: linkedAt,
        accountLinkedByUserId: dashboardContext.user.id,
        domainId: domain.id,
        hostname: parsedDomain.data.hostname,
        linkedAt,
        linkedByUserId: dashboardContext.user.id,
        normalizedUrl: parsedDomain.data.normalizedUrl,
        organizationId: dashboardContext.organization.id,
        requestedFrequency: parsed.requestedFrequency,
        setupSource: "account_self_serve",
        setupStatus: "pending_setup"
      }
    },
    status: "converted"
  });

  revalidatePath("/app");
  revalidatePath("/app/domains");
  revalidatePath(`/app/domains/${domain.id}`);
  revalidatePath("/app/monitor-site/setup");
  setupRedirect(parsed.token, { linked: "1" });
}
