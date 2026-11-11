import { after, NextResponse } from "next/server";
import { campaignStore } from "../../../../../server/promotions/repository";
import { drainCampaignEmails } from "../../../../../server/promotions/email";
import { assertSameOrigin,boundedBody,rateLimit,promotionResponseError } from "../../../../../server/promotions/http";
import { SUCCESS_MESSAGE } from "../../../../../lib/promotions/black-friday";
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);await rateLimit(request,"application");
    const result=await campaignStore.submit(await boundedBody(request),request.headers.get("sec-gpc")==="1");
    if(result.id) after(()=>drainCampaignEmails(result.id!).then(()=>undefined).catch(()=>undefined));
    return NextResponse.json({message:SUCCESS_MESSAGE},{status:202,headers:{"Cache-Control":"no-store"}});
  }catch(error){return promotionResponseError(error);}
}
