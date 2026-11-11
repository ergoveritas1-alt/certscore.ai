import "server-only";
import { queryOne } from "@website-signal-risk-scanner/db";
import { entitlementPeriod } from "../../lib/promotions/black-friday";
export async function getPromotionalEntitlement(organizationId: string, now=new Date()) {
  const row=await queryOne<{id:string;activated_at:Date;entitlement_end:Date;active:boolean;paid:boolean}>(`select a.id,a.activated_at,a.entitlement_end,promotion_active(o.id,$2) active,(o.plan<>'free') paid from promotion_applications a join organizations o on o.id=a.organization_id where a.organization_id=$1 and a.activated_at is not null`,[organizationId,now]);
  if(!row || row.paid) return null;
  const period=entitlementPeriod(row.activated_at,now);
  const usage=period?await queryOne<{pages:number}>(`select pages from promotion_usage where application_id=$1 and period_index=$2`,[row.id,period.index]):null;
  return {active:row.active,endsAt:row.entitlement_end,period,used:usage?.pages??0,limit:1000};
}
