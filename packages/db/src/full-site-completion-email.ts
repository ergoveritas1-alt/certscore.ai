import { createHash, randomBytes } from "node:crypto";
import { fullSiteInternalEnabled } from "./full-site-crawl";
import { query, queryOne } from "./postgres";
const hash = (token: string) =>
  createHash("sha256").update(token).digest("hex");

export async function reserveFullSiteCompletionEmail() {
  if (!fullSiteInternalEnabled()) return null;
  // SMTP may have accepted a message before a process died. Never blindly resend it.
  await query(
    `update full_site_completion_emails set status='uncertain',last_error='delivery_outcome_unknown' where status='sending' and lease_until<now()`,
  );
  await query(
    `update full_site_completion_emails set status=case when attempts<3 then 'pending' else 'failed' end,token_hash=null,available_at=now()+interval '1 minute',last_error='dispatch_expired' where status='dispatching' and lease_until<now()`,
  );
  const token = randomBytes(32).toString("hex");
  const row = await queryOne<{ scan_id: string }>(
    `update full_site_completion_emails e set status='dispatching',attempts=attempts+1,token_hash=$1,lease_until=now()+interval '90 seconds'
    where e.scan_id=(select n.scan_id from full_site_completion_emails n join full_site_crawls c on c.scan_id=n.scan_id
      where n.status='pending' and n.attempts<3 and n.available_at<=now() and c.status in ('completed','stopped') and c.completed_at is not null
      and not exists(select 1 from full_site_pages p where p.scan_id=c.scan_id and p.status in ('queued','dispatching','active'))
      order by n.available_at limit 1 for update of n skip locked) returning e.scan_id`,
    [hash(token)],
  );
  return row ? { scanId: row.scan_id, token } : null;
}

export async function beginFullSiteCompletionEmail(
  scanId: string,
  token: string,
) {
  if (!fullSiteInternalEnabled()) return null;
  return queryOne<{ email: string }>(
    `with claimed as (
    update full_site_completion_emails e set status='sending',lease_until=now()+interval '2 minutes'
    from full_site_crawls c where e.scan_id=$1 and c.scan_id=e.scan_id and e.token_hash=$2 and e.status='dispatching' and e.lease_until>now()
    and c.status in ('completed','stopped') and c.completed_at is not null
    and not exists(select 1 from full_site_pages p where p.scan_id=c.scan_id and p.status in ('queued','dispatching','active'))
    returning c.authorized_user_id
  ) select u.email from claimed join users u on u.id=claimed.authorized_user_id`,
    [scanId, hash(token)],
  );
}

export async function finishFullSiteCompletionEmail(
  scanId: string,
  token: string,
  outcome: "sent" | "retry" | "uncertain",
  messageId?: string,
) {
  await query(
    `update full_site_completion_emails set status=case when $3='retry' then case when attempts<3 then 'pending' else 'failed' end else $3 end,
    sent_at=case when $3='sent' then now() else null end,message_id=$4,token_hash=null,lease_until=null,available_at=now()+interval '5 minutes',
    last_error=case when $3='sent' then null when $3='retry' then 'delivery_not_started' else 'delivery_outcome_unknown' end
    where scan_id=$1 and token_hash=$2 and status='sending'`,
    [scanId, hash(token), outcome, messageId ?? null],
  );
}
