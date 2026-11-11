import "server-only";
import { withWriteTransaction } from "@website-signal-risk-scanner/db";
import { cleanAttribution,sourceGroup } from "../../lib/promotions/black-friday";
import type { Sql } from "./repository";
export async function recordCampaignAggregate(data:{id:string;event:"bf26_landing_view"|"bf26_form_start";consent:boolean;attribution?:unknown},gpc:boolean,transaction:<T>(fn:(sql:Sql)=>Promise<T>)=>Promise<T>=withWriteTransaction) {
  const source=sourceGroup(cleanAttribution(data.attribution,data.consent,gpc));
  await transaction(async db=>{
    const inserted=await db.query(`insert into promotion_request_receipts values($1,$2,now()+interval '30 minutes') on conflict do nothing returning id`,[data.id,data.event]);
    if(inserted.rowCount)await db.query(`insert into promotion_aggregate_events(day,event,source,count) values((now() at time zone 'America/Los_Angeles')::date,$1,$2,1) on conflict(day,event,source) do update set count=promotion_aggregate_events.count+1`,[data.event,source]);
  });
}
