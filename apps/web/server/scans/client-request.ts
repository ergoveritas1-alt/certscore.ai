import { queryOne } from "@website-signal-risk-scanner/db";

export type ClientRequestScan = {
  id: string;
  organization_id: string | null;
  scan_type: string;
  status: string;
};

export async function findScanByClientRequestId(requestId: string | null | undefined) {
  if (!requestId || requestId.length > 120) {
    return null;
  }

  return queryOne<ClientRequestScan>(
    `select id, organization_id, scan_type, status
       from scans
      where scan_config_json->>'clientRequestId' = $1
      order by created_at desc
      limit 1`,
    [requestId],
    { readOnly: true }
  );
}
