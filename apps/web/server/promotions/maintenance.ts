import "server-only";
import { getCampaignConfig } from "./config";
import { maintainCampaign } from "./email";
// Uses the existing long-running AWS web process. PostgreSQL SKIP LOCKED claims
// serialize delivery across replicas. No new cron, queue service or paid capacity.
const state=globalThis as typeof globalThis & {bf26Maintenance?:ReturnType<typeof setInterval>};
export function startCampaignMaintenance() {
  if(state.bf26Maintenance || !getCampaignConfig().emailDelivery)return;
  let running=false;
  async function tick(){
    if(running)return;
    // Latest public approval is not date-limited: stop only after all allocations
    // and messages are settled, via the explicit launch switch when campaign ends.
    running=true;
    try{await maintainCampaign();}catch{console.error("[bf26] maintenance failed; durable outbox retained");}finally{running=false;}
  }
  state.bf26Maintenance=setInterval(()=>void tick(),5*60*1000);state.bf26Maintenance.unref();void tick();
}
