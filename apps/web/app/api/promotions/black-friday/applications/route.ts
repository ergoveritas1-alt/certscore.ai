import { after, NextResponse } from "next/server";
import { campaignStore } from "../../../../../server/promotions/repository";
import { drainCampaignEmails } from "../../../../../server/promotions/email";
import { assertSameOrigin,boundedBody,rateLimit,promotionResponseError } from "../../../../../server/promotions/http";
import { applicationSchema, BF26_CAPTCHA_ACTION, SUCCESS_MESSAGE } from "../../../../../lib/promotions/black-friday";
import { getTurnstileConfig, verifyTurnstile } from "../../../../../server/turnstile";
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);await rateLimit(request,"application");
    const body = await boundedBody(request);
    const input = applicationSchema.parse(body);
    const captcha = getTurnstileConfig();
    if (captcha) await verifyTurnstile(captcha, BF26_CAPTCHA_ACTION, body.captchaToken, input.requestId);
    const result=await campaignStore.submit(input,request.headers.get("sec-gpc")==="1");
    if(result.id) after(()=>drainCampaignEmails(result.id!).then(()=>undefined).catch(()=>undefined));
    return NextResponse.json({message:SUCCESS_MESSAGE},{status:202,headers:{"Cache-Control":"no-store"}});
  }catch(error){return promotionResponseError(error);}
}
