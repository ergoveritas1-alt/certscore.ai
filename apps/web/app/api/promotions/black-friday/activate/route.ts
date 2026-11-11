import { after, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getCurrentUser } from "../../../../../server/auth";
import { provisionSelfServeUserSession } from "../../../../../server/auth-flows/provision-self-serve-user";
import { campaignStore, PromotionError } from "../../../../../server/promotions/repository";
import { drainCampaignEmails } from "../../../../../server/promotions/email";
import { assertSameOrigin,rateLimit,promotionResponseError } from "../../../../../server/promotions/http";
export async function POST(request: Request) {
  try{
    assertSameOrigin(request);await rateLimit(request,"invite");
    const user=await getCurrentUser();if(!user) throw new PromotionError("Sign in to activate your invitation.",401);
    const token=(await cookies()).get("bf26-invite")?.value??"";
    const invite=await campaignStore.invitation(token,process.env.BETTER_AUTH_SECRET??"");
    if(invite.email!==user.email.toLowerCase()) throw new PromotionError("Sign in with the email that received this invitation.",403);
    const context=await provisionSelfServeUserSession(user);
    const a=await campaignStore.activate(token,process.env.BETTER_AUTH_SECRET??"",context.user);
    after(()=>drainCampaignEmails(a.id).then(()=>undefined).catch(()=>undefined));
    const response=NextResponse.json({end:a.entitlement_end?.toISOString()});response.cookies.delete("bf26-invite");return response;
  }catch(error){return promotionResponseError(error);}
}
