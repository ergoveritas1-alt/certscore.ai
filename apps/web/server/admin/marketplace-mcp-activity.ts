import "server-only";

import { query, queryOne } from "@website-signal-risk-scanner/db";
import { requirePlatformAdminContext } from "./platform-admin";

export type MarketplaceMcpActivityRow = {
  event_id: string;
  occurred_at: string;
  marketplace_agreement_id: string;
  marketplace_license_arn: string;
  buyer_account_id: string | null;
  tool_name: string;
  outcome: "success" | "error" | "rate_limited";
  error_code: string | null;
  scan_decision: "reused" | "new" | "unavailable" | "not_applicable";
  scan_id: string | null;
  scan_status: string | null;
  canonical_scan_status: string | null;
  scan_created_at: string | null;
  completed_at: string | null;
};

type Summary = {
  tool_calls: number;
  scan_requests: number;
  dispatched_scans: number;
  completed_scans: number;
  report_retrievals: number;
};

export async function loadMarketplaceMcpActivity(input: {
  agreementId?: string | null;
  buyerAccountId?: string | null;
  page?: number;
}) {
  await requirePlatformAdminContext();
  const agreementId = input.agreementId?.trim() || null;
  const buyerAccountId = input.buyerAccountId?.trim() || null;
  if (agreementId && !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/.test(agreementId)) throw new Error("Invalid Marketplace agreement ID");
  if (buyerAccountId && !/^[0-9]{12}$/.test(buyerAccountId)) throw new Error("Invalid buyer account ID");
  const page = Math.max(1, Math.min(10_000, Math.floor(input.page || 1)));
  const values = [agreementId, buyerAccountId];
  const from = `from public.mcp_tool_invocation_events events
    left join public.marketplace_light_licenses license
      on license.license_arn = events.marketplace_license_arn
    left join public.scans scan on scan.id = case
      when events.scan_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then events.scan_id::uuid else null end
    where events.surface = 'mcp_marketplace_light'
      and ($1::text is null or events.marketplace_agreement_id = $1)
      and ($2::text is null or license.buyer_account_id = $2)`;
  const [summary, rows] = await Promise.all([
    queryOne<Summary>(`select count(*)::int as tool_calls,
      count(*) filter (where events.tool_name = 'certscore_scan_site')::int as scan_requests,
      count(distinct scan.id) filter (where events.tool_name = 'certscore_scan_site' and events.scan_decision = 'new')::int as dispatched_scans,
      count(distinct scan.id) filter (where events.tool_name = 'certscore_scan_site' and events.scan_decision = 'new' and scan.status = 'completed' and scan.completed_at is not null)::int as completed_scans,
      count(*) filter (where events.tool_name in ('certscore_get_scan_bundle', 'certscore_get_report_evidence_page') and events.outcome = 'success')::int as report_retrievals
      ${from}`, values, { readOnly: true }),
    query<MarketplaceMcpActivityRow>(`select events.event_id, events.occurred_at::text as occurred_at,
      events.marketplace_agreement_id, events.marketplace_license_arn,
      license.buyer_account_id, events.tool_name, events.outcome, events.error_code,
      events.scan_decision, events.scan_id, events.scan_status,
      scan.status as canonical_scan_status, scan.created_at::text as scan_created_at,
      scan.completed_at::text as completed_at
      ${from}
      order by events.occurred_at desc, events.event_id desc
      limit 50 offset $3`, [...values, (page - 1) * 50], { readOnly: true }),
  ]);
  return {
    items: rows.rows,
    page,
    pageSize: 50,
    summary: summary ?? { tool_calls: 0, scan_requests: 0, dispatched_scans: 0, completed_scans: 0, report_retrievals: 0 },
  };
}
