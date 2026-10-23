export const SCAN_CREATION_SOURCES = {
  mcp_light: "MCP · Light",
  mcp_authenticated: "MCP · Authenticated",
  mcp: "MCP",
  browser_homepage: "Browser · Homepage",
  browser_dashboard: "Browser · Dashboard",
  browser: "Browser",
  api: "API",
  scheduled: "Scheduled",
  internal: "Internal",
  unknown: "Unknown"
} as const;

export type ScanCreationSource = keyof typeof SCAN_CREATION_SOURCES;
export type ScanCreationAttribution = {
  trafficClass?: string;
  kind: ScanCreationSource;
  requestId: string | null;
  requestedAt: string | null;
};

// Exact retained channel values only: never infer origin from a visitor or IP.
const CHANNELS: Record<Exclude<ScanCreationSource, "unknown">, readonly string[]> = {
  mcp_light: ["mcp_light"],
  mcp_authenticated: ["mcp_authenticated"],
  mcp: ["mcp", "mcp_anonymous"],
  browser_homepage: ["homepage-anonymous", "marketing-anonymous-full-scan"],
  browser_dashboard: ["manual-dashboard", "new-domain-overview"],
  browser: ["browser", "marketing-full-scan"],
  api: ["pulse_api", "sdk", "other_api", "gpt_action"],
  scheduled: ["scheduler", "scheduled-monitoring"],
  internal: ["corpus-import", "validation_ops", "operator-post-reject-proof-verification"]
};

export function scanCreationSource(channel: string | null | undefined): ScanCreationSource {
  return (Object.entries(CHANNELS).find(([, values]) => values.includes(channel ?? ""))?.[0] as ScanCreationSource) ?? "unknown";
}

export function scanCreationSourceSql(expression: string) {
  return `case ${Object.entries(CHANNELS).map(([kind, channels]) => `when ${expression} in (${channels.map((channel) => `'${channel}'`).join(",")}) then '${kind}'`).join(" ")} else 'unknown' end`;
}

// Only explicit creation requests qualify. Reads/reuse and missing historical
// provenance must never become scan ownership, even when they are the only rows.
export function scanCreationRequestsSql(scanId?: string) {
  return `select pr.scan_id, pr.public_id, pr.requested_at,
      pr.requested_by, pr.request_context, pr.requested_url,
      case when pr.request_channel = 'mcp' and pr.request_context ->> 'anonymousMcpSurface' = 'mcp_light' then 'mcp_light'
        when pr.request_channel = 'mcp' and pr.requested_by ->> 'anonymous' = 'false' then 'mcp_authenticated'
        else pr.request_channel end as channel, 0 as priority
    from public.pulse_requests pr
    where pr.scan_id is not null ${scanId ? `and pr.scan_id = ${scanId}` : ""}
      and pr.resolution_mode in ('created_new_scan', 'queued_new_scan')
      and coalesce(pr.request_context ->> 'mode', '') <> 'scanId'
    union all
    select coalesce(sr.fulfilled_by_scan_id, sr.scan_id), sr.public_id, sr.requested_at,
      sr.requested_by, sr.request_context, sr.requested_url, sr.request_channel as channel, 1 as priority
    from public.scan_requests sr
    where coalesce(sr.fulfilled_by_scan_id, sr.scan_id) is not null
      ${scanId ? `and coalesce(sr.fulfilled_by_scan_id, sr.scan_id) = ${scanId}` : ""}
      and sr.resolution_mode = 'queued_new_scan'
      and coalesce(sr.request_context ->> 'mode', '') <> 'scanId'`;
}

// Filtering, row enrichment and traffic classification share the same ordering.
export function scanCreatorSql(scanId: string) {
  return `select creator.* from (${scanCreationRequestsSql(scanId)}) creator
    order by creator.requested_at asc, creator.priority asc, creator.public_id asc limit 1`;
}

export function scanOriginalRequestsSql() {
  return `select distinct on (creator.scan_id) creator.*
    from (${scanCreationRequestsSql()}) creator
    order by creator.scan_id, creator.requested_at asc, creator.priority asc, creator.public_id asc`;
}

export function scanCreatedViaSql(scanId: string, config: string) {
  return scanCreationSourceSql(`coalesce((select origin.channel from (${scanCreatorSql(scanId)}) origin), ${config} ->> 'source')`);
}
