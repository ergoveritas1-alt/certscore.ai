import { createHash } from "node:crypto";
import { scanCreatorSql } from "../../apps/web/lib/admin/scan-creation-source";
import { MAC_MINI_SCAN_BOT_API_KEY_NAMES } from "../../apps/web/lib/admin/mac-mini-scan-bot";
export const BOT_ORIGIN_VERSION = "certscore.audit-bot-origin.v1";
export type BotOrigin = { scanId: string; originalRequestId: string | null; originalRequestedAt: string | null; isMacMini: boolean | null; isCanary: boolean; publicationRequestStatus: string | null };
const quote = (s: string) => "'" + s.replace(/'/g, "''") + "'";
export function botOriginSql(ids: string[]) {
  if (!ids.length || ids.length > 5000 || new Set(ids).size !== ids.length || ids.some(id => !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(id))) throw Error("Supply 1–5000 distinct scan UUIDs");
  const canary = (value: string) => `coalesce(${value}, '') ~* '^https?://[^/?#]+/[.]well-known/certscore-canary/'`;
  const owned = (value: string) => `coalesce(${value}, '') ~* '^https?://(www[.])?ergoveritas[.]com/test[123][.]html([?#]|$)'`;
  return `set statement_timeout='45s';
select row_to_json(result) from (
 select s.id as "scanId", origin.public_id as "originalRequestId", origin.requested_at as "originalRequestedAt",
   case when origin.public_id is null or origin_key.public_id is null then null
        else origin_key.name in (${MAC_MINI_SCAN_BOT_API_KEY_NAMES.map(quote).join(",")}) end as "isMacMini",
   (${canary("origin.requested_url")} or ${canary("s.scan_config_json->>'normalizedUrl'")} or
    ${owned("origin.requested_url")} or ${owned("s.scan_config_json->>'normalizedUrl'")} or
    coalesce(s.activity_traffic->>'class','') in ('test','synthetic','fixture','diagnostic','internal','routine_canary','canary') or
    exists(select 1 from public.scan_pages page where page.scan_id=s.id and (${canary("page.page_url")} or ${owned("page.page_url")}))) as "isCanary",
   publication.status as "publicationRequestStatus"
 from public.scans s
 left join lateral (${scanCreatorSql("s.id")}) origin on true
 left join public.integration_api_keys origin_key on origin_key.public_id=origin.requested_by->>'apiKeyId'
 left join public.scan_score_materialization_requests publication on publication.scan_id=s.id
 where s.id=any(array[${ids.map(quote).join(",")}]::uuid[])
 order by s.id
) result;`;
}
export const sha256 = (v: string | Uint8Array) => createHash("sha256").update(v).digest("hex");
export function botOriginWindowSql(start: string, end: string) {
  if (!Number.isFinite(Date.parse(start)) || !Number.isFinite(Date.parse(end)) || Date.parse(start)>=Date.parse(end) || Date.parse(end)-Date.parse(start)>8*86400000) throw Error("Supply a bounded origin window of at most eight days");
  return botOriginSql(["00000000-0000-4000-8000-000000000000"])
    .replace(/where s\.id=any\(array\[[^\n]+\]::uuid\[\]\)/,`where s.created_at>=${quote(new Date(start).toISOString())}::timestamptz and s.created_at<${quote(new Date(end).toISOString())}::timestamptz`)
    .replace("order by s.id\n", "order by s.id limit 5001\n");
}
