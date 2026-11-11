import "server-only";
import { getCampaignConfig } from "./config";
import { query, withWriteTransaction } from "@website-signal-risk-scanner/db";
import { createGmailTransport, getGmailConfig } from "../email/gmail";
import { campaignStore, inviteToken, type Application } from "./repository";

export function campaignEmail(a: Application, kind: string, origin: string, secret: string, allocated: number) {
  const base = new URL(origin);
  const activation = new URL("/black-friday/activate",base); activation.hash=inviteToken(a,secret);
  const deadline=a.activation_deadline?.toISOString() ?? "";
  const content: Record<string,{subject:string;text:string;to:string}> = {
    owner:{to:"ben@certscore.ai",subject:`[CertScore.ai Black Friday] New application — ${a.company.replace(/[\r\n]/g," ")}`,text:[`Applicant: ${a.full_name} <${a.email}>`,`Organization: ${a.company}`,`Website: ${a.details.website}`,`Type: ${a.details.businessType}`,`Websites overseen: ${a.details.clientSites}`,`Intended use: ${a.details.intendedUse}`,`Submitted: ${a.submitted_at.toISOString()}`,`Attribution: ${JSON.stringify(a.attribution)}`,`Allocated: ${allocated}/10 (at delivery)`,new URL(`/app/admin/promotions/black-friday-2026?application=${a.id}`,base).href].join("\n")},
    received:{to:a.email,subject:"CertScore.ai — Black Friday application received",text:"Thank you for applying. Your application has been reviewed. Your decision is sent in a separate email."},
    invitation:{to:a.email,subject:"Your CertScore.ai Black Friday application is approved",text:`Your organization has been approved for three calendar months of Pro, including 1,000 page scans per monthly entitlement period. Activate by ${deadline} (UTC).\n\n${activation.href}\n\nSign in or create an account using ${a.email}. Your three months start when you activate. No credit card, charge or automatic paid renewal. This link is personal; do not forward it.`},
    rejected:{to:a.email,subject:"An update on your CertScore.ai Black Friday application",text:"Thank you for your interest. We are unable to approve your application for this limited promotion. Reply to this email if you would like us to clarify the decision. No account or subscription has been changed."},
    activated:{to:a.email,subject:"Your complimentary CertScore.ai Pro access is active",text:`Your Pro access is active through ${a.entitlement_end?.toISOString()} (UTC). You have 1,000 page scans in each monthly entitlement period. There is no automatic paid renewal.\n\n${new URL('/app',base).href}`},
    expiring:{to:a.email,subject:"Your complimentary CertScore.ai Pro access ends soon",text:`Your promotional access ends ${a.entitlement_end?.toISOString()} (UTC). No charge or paid renewal will occur. If you wish to continue, you can explicitly choose a paid plan in your account.\n\n${new URL('/app/modify-plan',base).href}`}
  };
  const message=content[kind]; if(!message) throw new Error("Unknown campaign email kind."); return message;
}
const defaults={query,transaction:withWriteTransaction,config:getGmailConfig,transport:createGmailTransport};
export async function drainCampaignEmails(applicationId?: string, dependencies=defaults) {
  // Explicit opt-in prevents SMTP contacts from local rendering or tests.
  if(!getCampaignConfig().emailDelivery) return {sent:0,disabled:true};
  let sent=0;
  for(let i=0;i<20;i++) {
    const job=await dependencies.transaction(async db => {
      // Owner alerts can go out on submission. Applicant messages wait for
      // a recorded approval or rejection, including receipts already queued.
      const row = (await db.query(`
        select job.*
        from promotion_email_outbox job
        join promotion_applications application on application.id = job.application_id
        where job.status in ('pending', 'failed')
          and job.attempts < 5 and job.available_at <= now()
          and ($1::uuid is null or job.application_id = $1)
          and (job.kind = 'owner' or application.approved_at is not null or application.rejected_at is not null)
        order by job.available_at, job.id
        for update of job skip locked
        limit 1
      `, [applicationId ?? null])).rows[0];
      if(!row) return null;
      await db.query(`update promotion_email_outbox set status='sending',attempts=attempts+1,lease_until=now()+interval '2 minutes' where id=$1`,[row.id]);return row;
    });
    if(!job) break;
    let started=false; let timer:ReturnType<typeof setTimeout>|undefined; let transport:ReturnType<typeof createGmailTransport>|undefined;
    try {
      const config=dependencies.config(); if(!config) throw new Error("Email not configured");
      if(process.env.NODE_ENV==="production" && new URL(config.appUrl).origin!=="https://certscore.ai") throw new Error("Campaign email origin must be https://certscore.ai");
      const a=(await dependencies.query<Application>(`select * from promotion_applications where id=$1`,[job.application_id])).rows[0]!;
      if(job.kind==="invitation" && (a.activated_at || !a.activation_deadline || a.activation_deadline<=new Date() || a.invite_version!==job.revision)) throw new Error("Invitation is no longer current");
      const count=(await dependencies.query(`select count(*)::int n from promotion_applications where allocation is not null`)).rows[0]!.n;
      const message=campaignEmail(a,job.kind,config.appUrl,process.env.BETTER_AUTH_SECRET??"",count);
      transport=dependencies.transport(config); started=true;
      const result=await Promise.race([transport.sendMail({...message,from:`"CertScore.ai" <${config.fromEmail}>`,replyTo:"ben@certscore.ai",messageId:`<bf26-${job.id}@certscore.ai>`}),new Promise<never>((_,reject)=>{timer=setTimeout(()=>{transport?.close();reject(new Error("Delivery timeout"));},20000);})]);
      if(!result.accepted?.length) throw new Error("SMTP acceptance unavailable");
      await dependencies.transaction(async db=>{
        await db.query(`update promotion_email_outbox set status='sent',sent_at=now(),last_error=null where id=$1`,[job.id]);
        if(job.kind==="invitation") {
          await db.query(`insert into promotion_events(application_id,event) values($1,'bf26_invite_sent') on conflict do nothing`,[job.application_id]);
          await db.query(`update promotion_applications set status='invited' where id=$1 and status='approved'`,[job.application_id]);
        }
      }); sent++;
    } catch(error) {
      const command=(error as {command?:string}).command;
      const retry=!started || (typeof command==="string" && /^(CONN|EHLO|HELO|STARTTLS|AUTH(?: .*|)|MAIL FROM|RCPT TO)$/.test(command));
      await dependencies.query(`update promotion_email_outbox set status=$2,last_error=$3,available_at=now()+interval '15 minutes' where id=$1`,[job.id,retry?"failed":"uncertain",retry?"Delivery unavailable; retry pending.":"SMTP outcome uncertain; review before resending."]);
    } finally {if(timer) clearTimeout(timer);transport?.close();}
  }
  return {sent,disabled:false};
}
export async function maintainCampaign() { await campaignStore.maintain(); return drainCampaignEmails(); }
