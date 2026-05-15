import "server-only";

import { query } from "@website-signal-risk-scanner/db";
import type { MonitorSiteRequestInput } from "./monitor-site-request-validation";

export async function createMonitorSiteRequest(input: MonitorSiteRequestInput & { normalizedHostname: string }) {
  const result = await query<{ id: string }>(
    `
      insert into monitor_site_requests (
        website,
        normalized_hostname,
        work_email,
        full_name,
        company,
        monitoring_goal,
        notes,
        source_page_url,
        source_report_url,
        metadata_json
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, '{}'::jsonb)
      returning id
    `,
    [
      input.website,
      input.normalizedHostname,
      input.workEmail,
      input.fullName,
      input.company,
      input.monitoringGoal,
      input.notes,
      input.sourcePageUrl,
      input.sourceReportUrl
    ]
  );

  return result.rows[0]?.id ?? null;
}
