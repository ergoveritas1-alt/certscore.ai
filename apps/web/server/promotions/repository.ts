import "server-only";
import { getCampaignConfig } from "./config";
import { getDomain } from "tldts";
import { createHmac, timingSafeEqual } from "node:crypto";
import { query, withWriteTransaction } from "@website-signal-risk-scanner/db";
import type { QueryResult, QueryResultRow } from "pg";
import { applicationSchema, cleanAttribution, campaignOpen, CAPACITY, CAMPAIGN, TERMS_VERSION, addCalendarMonths, type ApplicationInput } from "../../lib/promotions/black-friday";

export type Sql = {query: <T extends QueryResultRow = QueryResultRow>(text:string, values?:unknown[]) => Promise<QueryResult<T>>};
export type Application = {
  id: string; email: string; company: string; full_name: string; business_domain: string;
  details: ApplicationInput; attribution: Record<string,string>; submitted_at: Date; status: string; notes: string;
  business_group: string | null; allocation: number | null; approved_at: Date | null; rejected_at: Date | null;
  activation_deadline: Date | null; invite_version: number; activated_at: Date | null; entitlement_end: Date | null;
  organization_id: string | null; user_id: string | null; marketing_opt_in: boolean;
};
export class PromotionError extends Error { constructor(message: string, public status = 400) { super(message); } }
export function inviteToken(a: Pick<Application,"id"|"invite_version">, secret: string) {
  if (secret.length < 32) throw new Error("Campaign signing is not configured.");
  const payload = `${a.id}.${a.invite_version}`;
  return `${payload}.${createHmac("sha256",secret).update(`bf26-invite:${payload}`).digest("base64url")}`;
}
export function validInviteToken(token: string, a: Application, secret: string) {
  if (!/^[a-f0-9-]{36}\.[0-9]{1,6}\.[A-Za-z0-9_-]{43}$/.test(token)) return false;
  const expected = inviteToken(a,secret);
  return token.length === expected.length && timingSafeEqual(Buffer.from(token),Buffer.from(expected));
}
export function campaignTestWindow() { return getCampaignConfig().testWindow; }
export function createCampaignStore(transaction: <T>(fn:(sql: Sql)=>Promise<T>)=>Promise<T>, sql: Sql) {
  const queue = async (db: Sql,id: string,kind: string,revision=1) => { await db.query(`insert into promotion_email_outbox(application_id,kind,revision) values($1,$2,$3) on conflict do nothing`,[id,kind,revision]); };
  const event = async (db: Sql,id: string,name: string) => { await db.query(`insert into promotion_events(application_id,event) values($1,$2) on conflict do nothing`,[id,name]); };
  const audit = async (db: Sql,id: string,actor: string,action: string,details: unknown={}) => { await db.query(`insert into promotion_audit_log(application_id,actor_id,action,details) values($1,$2,$3,$4::jsonb)`,[id,actor,action,JSON.stringify(details)]); };
  async function allocated(db: Sql) { return Number((await db.query(`select count(*)::int n from promotion_applications where campaign_id=$1 and allocation is not null`,[CAMPAIGN])).rows[0]!.n); }
  return {
    async availability(now = new Date()) { const count=await allocated(sql); return { allocated:count, capacity:CAPACITY, open:campaignOpen(now,count,campaignTestWindow()) }; },
    async submit(raw: unknown, gpc: boolean, now=new Date()) {
      const input=applicationSchema.parse(raw);
      return transaction(async db => {
        await db.query(`select id from promotion_campaigns where id=$1 for update`,[CAMPAIGN]);
        const hostname=new URL(input.website).hostname.toLowerCase();
        const domain=getDomain(hostname,{allowPrivateDomains:true}) ?? hostname;
        const duplicate=await db.query(`select id from promotion_applications where campaign_id=$1 and (request_id=$2 or email=$3 or business_domain=$4) limit 1`,[CAMPAIGN,input.requestId,input.email,domain]);
        if (duplicate.rows.length) return { created:false, id:null };
        if (!campaignOpen(now,await allocated(db),campaignTestWindow())) throw new PromotionError("Applications are closed or all promotional places have been allocated.",409);
        // Do not expose whether an arbitrary email has a paid account. Manual
        // approval and authenticated activation perform authoritative eligibility checks.
        const {requestId,analyticsConsent,attribution,websiteConfirm,terms,marketingOptIn,...details}=input;
        const row=(await db.query(`insert into promotion_applications(campaign_id,request_id,email,business_domain,full_name,company,details,attribution,terms_version,marketing_opt_in,submitted_at) values($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9,$10,$11) returning id`,[CAMPAIGN,requestId,input.email,domain,input.fullName,input.company,JSON.stringify(details),JSON.stringify(cleanAttribution(attribution,analyticsConsent,gpc)),TERMS_VERSION,marketingOptIn,now])).rows[0]!;
        await event(db,row.id,"bf26_form_submit");
        await queue(db,row.id,"owner"); await queue(db,row.id,"received");
        return {created:true,id:row.id as string};
      });
    },
    async review(id: string,actor: string, action: string, notes: string, group: string, verified: boolean, now=new Date()) {
      if (notes.length>5000 || group.length>160) throw new PromotionError("Review text is too long.");
      return transaction(async db => {
        await db.query(`select id from promotion_campaigns where id=$1 for update`,[CAMPAIGN]);
        const a=(await db.query<Application>(`select * from promotion_applications where id=$1 for update`,[id])).rows[0];
        if (!a) throw new PromotionError("Application not found.",404);
        if (action==="notes") { await db.query(`update promotion_applications set notes=$2 where id=$1`,[id,notes]); await audit(db,id,actor,"notes_updated"); return; }
        if (action==="under_review") {
          if (a.status!=="submitted") throw new PromotionError("Only submitted applications can enter review.",409);
          await db.query(`update promotion_applications set status='under_review',notes=$2 where id=$1`,[id,notes]);
        } else if (action==="approve") {
          if (a.allocation!==null) return;
          if (!["submitted","under_review"].includes(a.status)) throw new PromotionError("This application cannot be approved.",409);
          if (!verified || !group.trim()) throw new PromotionError("Confirm business eligibility and enter its commonly controlled business group.");
          const earlier=await db.query(`select id from promotion_applications where campaign_id=$1 and (submitted_at,id)<($2,$3) and status in ('submitted','under_review') limit 1`,[CAMPAIGN,a.submitted_at,id]);
          if (earlier.rows.length) throw new PromotionError("Resolve earlier applications first to preserve submission order.",409);
          const count=await allocated(db);
          if (count>=CAPACITY) throw new PromotionError("All ten places are allocated.",409);
          const duplicate=await db.query(`select 1 from promotion_applications where campaign_id=$1 and business_group=$2`,[CAMPAIGN,group.trim().toLowerCase()]);
          if(duplicate.rows.length) throw new PromotionError("This business group already has an allocation.",409);
          const paid=await db.query(`select 1 from users u join organization_members m on m.user_id=u.id join organizations o on o.id=m.organization_id where lower(u.email)=$1 and (o.plan<>'free' or coalesce(o.stripe_subscription_status,'') in ('active','trialing','past_due','incomplete','unpaid','paused')) limit 1`,[a.email]);
          if(paid.rows.length) throw new PromotionError("This applicant already has a paid subscription.",409);
          await db.query(`update promotion_applications set status='approved',approved_at=$2,activation_deadline=$3,allocation=$4,business_group=$5,notes=$6 where id=$1`,[id,now,new Date(now.getTime()+14*86400000),count+1,group.trim().toLowerCase(),notes]);
          await event(db,id,"bf26_approved"); await queue(db,id,"invitation");
        } else if (action==="reject") {
          if(a.status==="rejected") return;
          if(a.allocation!==null || !["submitted","under_review"].includes(a.status)) throw new PromotionError("An allocated application cannot be rejected.",409);
          await db.query(`update promotion_applications set status='rejected',rejected_at=$2,notes=$3 where id=$1`,[id,now,notes]);
          await event(db,id,"bf26_rejected"); await queue(db,id,"rejected");
        } else if (action==="resend") {
          if(!a.approved_at || a.activated_at || !a.activation_deadline || now>=a.activation_deadline) throw new PromotionError("No active invitation is available.",409);
          const active=await db.query(`select 1 from promotion_email_outbox where application_id=$1 and kind='invitation' and (status in ('pending','sending') or sent_at > now()-interval '5 minutes')`,[id]);
          if(active.rows.length) throw new PromotionError("An invitation is queued, in flight, or was sent within five minutes.",409);
          await db.query(`update promotion_applications set invite_version=invite_version+1 where id=$1`,[id]);
          await queue(db,id,"invitation",a.invite_version+1);
        } else throw new PromotionError("Unknown review action.");
        await audit(db,id,actor,action,{verified:action==="approve"?verified:undefined});
      });
    },
    async invitation(token: string,secret: string,now=new Date()) {
      const id=token.split(".")[0]; if(!id || !/^[a-f0-9-]{36}$/.test(id)) throw new PromotionError("Invalid invitation.",403);
      const a=(await sql.query<Application>(`select * from promotion_applications where id=$1`,[id])).rows[0];
      if(!a || !a.approved_at || !validInviteToken(token,a,secret) || !a.activation_deadline || (!a.activated_at && now>=a.activation_deadline) || (a?.entitlement_end && now>=a.entitlement_end)) throw new PromotionError("This invitation is invalid or expired.",403);
      return a;
    },
    async activate(token: string, secret: string, user: {id:string; email:string}, now=new Date()) {
      return transaction(async db => {
        const id=token.split(".")[0]; if(!id || !/^[a-f0-9-]{36}$/.test(id)) throw new PromotionError("Invalid invitation.",403);
        const a=(await db.query<Application>(`select * from promotion_applications where id=$1 for update`,[id])).rows[0];
        if(!a || !a.approved_at || !validInviteToken(token,a,secret) || a.email!==user.email.toLowerCase()) throw new PromotionError("Sign in with the business email that received this invitation.",403);
        if(a.activated_at) { if(a.entitlement_end && now>=a.entitlement_end) throw new PromotionError("Your promotional Pro access has ended.",409); if(a.user_id!==user.id) throw new PromotionError("Invitation already redeemed.",409); return a; }
        if(!a.activation_deadline || now>=a.activation_deadline) throw new PromotionError("The 14-day activation deadline has passed.",409);
        const membership=(await db.query(`select o.*,m.role from organizations o join organization_members m on m.organization_id=o.id where m.user_id=$1 for update of o`,[user.id])).rows[0];
        if(!membership || membership.plan!=="free" || membership.marketplace_browser || (membership.stripe_subscription_id && !["canceled","incomplete_expired"].includes(membership.stripe_subscription_status ?? ""))) throw new PromotionError("Use an eligible free or trial workspace without an existing paid subscription.",409);
        const members=(await db.query(`select count(*)::int n from organization_members where organization_id=$1`,[membership.id])).rows[0];
        if(!members || members.n>1 && !["owner","admin"].includes(membership.role)) throw new PromotionError("A workspace owner or admin must link this account.",403);
        const row=(await db.query<Application>(`update promotion_applications set status='activated',activated_at=$2,entitlement_end=$3,user_id=$4,organization_id=$5 where id=$1 returning *`,[id,now,addCalendarMonths(now,3),user.id,membership.id])).rows[0]!;
        await event(db,id,"bf26_activated"); await audit(db,id,user.id,"activated"); await queue(db,id,"activated");
        return row;
      });
    },
    async list() { return (await sql.query<Application>(`select * from promotion_applications where campaign_id=$1 order by submitted_at,id`,[CAMPAIGN])).rows; },
    async maintain() {
      await sql.query(`update promotion_applications set status='expired' where (activated_at is not null and entitlement_end<=now() or activated_at is null and activation_deadline<=now()) and status in ('approved','invited','activated')`);
      await sql.query(`insert into promotion_email_outbox(application_id,kind) select a.id,'expiring' from promotion_applications a join organizations o on o.id=a.organization_id where a.activated_at is not null and a.entitlement_end>now() and a.entitlement_end<=now()+interval '7 days' and o.plan='free' on conflict do nothing`);
      await sql.query(`delete from promotion_request_receipts where expires_at<now()`);
      await sql.query(`delete from promotion_rate_limits where window_start<now()-interval '1 day'`);
      await sql.query(`update promotion_email_outbox set status='uncertain',last_error='Worker stopped during delivery; inspect before resending.' where status='sending' and lease_until<now()`);
    }
  };
}
export const campaignStore = createCampaignStore(withWriteTransaction,{query});
