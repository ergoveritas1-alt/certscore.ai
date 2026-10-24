import {saleSharingCanaryCampaignSchema} from "./sale-sharing-canary";
export function saleSharingCanaryFixture(now=Date.now()) {
  return saleSharingCanaryCampaignSchema.parse({version:"sale_sharing_canary_campaign.v1",bucket:"fixture-canary",budgetCapUsd:0.25,budgetPreflightApproved:true,
    slots:["https://gimbal.com/","https://readcube.com/"].map((targetUrl,slot)=>({version:"sale_sharing_canary.v1",campaignId:"offline-only",slot,scanId:`fixture-${slot}`,targetUrl,region:"us-west-1",functionName:"fixture-lambda:42",buildGitSha:"a".repeat(40),releaseSha256:"b".repeat(64),issuedAt:new Date(now-1000).toISOString(),expiresAt:new Date(now+60000).toISOString(),recipeVersion:slot===0?"onetrust.gimbal_settings.v2":"onetrust.readcube_settings.v1"}))});
}
