import { after,NextResponse } from "next/server";
import { getCurrentUser } from "../../../../../server/auth";
import { isPlatformAdminEmail } from "../../../../../server/admin/platform-admin";
import { campaignStore,PromotionError } from "../../../../../server/promotions/repository";
import { drainCampaignEmails,maintainCampaign } from "../../../../../server/promotions/email";
import { assertSameOrigin,boundedBody,promotionResponseError } from "../../../../../server/promotions/http";
import { csvCell } from "../../../../../lib/promotions/black-friday";
import { query } from "@website-signal-risk-scanner/db";
import { z } from "zod";
async function admin(){const user=await getCurrentUser();if(!user||!isPlatformAdminEmail(user.email))throw new PromotionError("Administrator access required.",403);return user;}
export async function GET(){try{await admin();const rows=await campaignStore.list();const columns=["id","submitted_at","company","full_name","email","business_domain","status","allocation","business_group","approved_at","activation_deadline","activated_at","entitlement_end","user_id","organization_id","notes","marketing_opt_in"] as const;const extra=["businessType","website","country","state","clientSites","intendedUse","linkedIn","comments"] as const;const csv=[ [...columns,...extra,"attribution"].map(csvCell).join(","),...rows.map(a=>[...columns.map(c=>a[c] instanceof Date?(a[c] as Date).toISOString():a[c]),...extra.map(c=>a.details[c]),JSON.stringify(a.attribution)].map(csvCell).join(","))].join("\r\n");return new NextResponse(csv,{headers:{"Content-Type":"text/csv; charset=utf-8","Content-Disposition":"attachment; filename=certscore-ai-black-friday-2026.csv","Cache-Control":"private, no-store"}});}catch(e){return promotionResponseError(e);}}
const schema=z.object({id:z.string().uuid().optional(),action:z.enum(["notes","under_review","approve","reject","resend","retry_email","maintenance"]),notes:z.string().max(5000).default(""),group:z.string().max(160).default(""),verified:z.boolean().default(false)});
export async function POST(request:Request){try{assertSameOrigin(request);const user=await admin();const data=schema.parse(await boundedBody(request));
  if(data.action==="maintenance") {after(()=>maintainCampaign().then(()=>undefined).catch(()=>undefined));return NextResponse.json({ok:true});}
  if(!data.id)throw new PromotionError("Application ID required.");
  if(data.action==="retry_email"){
    await query(`update promotion_email_outbox set status='pending',attempts=0,available_at=now() where application_id=$1 and status='failed'`,[data.id]);
    await query(`insert into promotion_audit_log(application_id,actor_id,action) values($1,$2,'retry_email')`,[data.id,user.id]);
  }else await campaignStore.review(data.id,user.id,data.action,data.notes,data.group,data.verified);
  after(()=>drainCampaignEmails(data.id).then(()=>undefined).catch(()=>undefined));return NextResponse.json({ok:true});
}catch(e){return promotionResponseError(e);}}
