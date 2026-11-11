import "server-only";
import { query } from "@website-signal-risk-scanner/db";
import { campaignStore } from "./repository";
import { sourceGroup, type Attribution } from "../../lib/promotions/black-friday";
export async function campaignDashboard(from: string,to: string, dependencies={query,list:campaignStore.list}) {
  const valid=/^\d{4}-\d{2}-\d{2}$/;
  if(!valid.test(from)||!valid.test(to)||from>to||!Number.isFinite(Date.parse(from))||!Number.isFinite(Date.parse(to))) throw new Error("Choose a valid date range.");
  if ((Date.parse(to)-Date.parse(from))/86400000>366) throw new Error("Choose a date range of at most 367 days.");
  const [anonymous,operational,applications,outbox,audit]=await Promise.all([
    dependencies.query<{day:string;event:string;source:string;count:string}>(`select day::text,event,source,count::text from promotion_aggregate_events where day between $1::date and $2::date order by day`,[from,to]),
    dependencies.query<{day:string;event:string;attribution:Attribution;count:string}>(`select (e.occurred_at at time zone 'America/Los_Angeles')::date::text as day,e.event,a.attribution,count(*)::text from promotion_events e join promotion_applications a on a.id=e.application_id where e.occurred_at >= ($1::date::timestamp at time zone 'America/Los_Angeles') and e.occurred_at < (($2::date+1)::timestamp at time zone 'America/Los_Angeles') group by 1,2,3 order by 1`,[from,to]),
    dependencies.list(),dependencies.query(`select application_id,kind,status,attempts,last_error,sent_at from promotion_email_outbox order by available_at desc`),dependencies.query(`select application_id,action,created_at,actor_id from promotion_audit_log order by created_at desc limit 200`)
  ]);
  const totals:Record<string,number>={},sources:Record<string,Record<string,number>>={},days:Record<string,Record<string,number>>={};
  for(const r of [...anonymous.rows,...operational.rows.map(r=>({...r,source:sourceGroup(r.attribution)}))]) {
    const n=Number(r.count);totals[r.event]=(totals[r.event]??0)+n;
    const src=sources[r.source]??={};src[r.event]=(src[r.event]??0)+n;
    const day=days[r.day]??={};day[r.event]=(day[r.event]??0)+n;
  }
  for(let day=new Date(`${from}T00:00:00Z`);day<=new Date(`${to}T00:00:00Z`);day.setUTCDate(day.getUTCDate()+1)) days[day.toISOString().slice(0,10)]??={};
  const cohort=await dependencies.query<{submitted:number;approved:number;activated:number;first_scan:number;paid:number}>(`select count(*)::int submitted,count(*) filter(where a.allocation is not null)::int approved,count(*) filter(where a.activated_at is not null)::int activated,count(*) filter(where exists(select 1 from promotion_events e where e.application_id=a.id and event='bf26_first_scan'))::int first_scan,count(*) filter(where exists(select 1 from promotion_events e where e.application_id=a.id and event='bf26_paid_conversion'))::int paid from promotion_applications a where a.submitted_at>=($1::date::timestamp at time zone 'America/Los_Angeles') and a.submitted_at<(($2::date+1)::timestamp at time zone 'America/Los_Angeles')`,[from,to]);
  return {totals,sources,days,applications,outbox:outbox.rows,audit:audit.rows,cohort:cohort.rows[0]!,allocated:applications.filter(a=>a.allocation!==null).length};
}
