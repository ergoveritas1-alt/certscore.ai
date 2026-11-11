import { NextResponse } from "next/server";
import { campaignStore, PromotionError } from "../../../../../server/promotions/repository";
import { assertSameOrigin,boundedBody,rateLimit,promotionResponseError } from "../../../../../server/promotions/http";
export async function POST(request: Request) {
  try{
    assertSameOrigin(request);await rateLimit(request,"invite");const data=await boundedBody(request);
    if(typeof data.token!=="string" || data.token.length>200) throw new PromotionError("Invalid invitation.",403);
    const a=await campaignStore.invitation(data.token,process.env.BETTER_AUTH_SECRET??"");
    const response=NextResponse.json({ok:true});
    response.cookies.set("bf26-invite",data.token,{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax",path:"/",maxAge:Math.max(60,Math.floor(((a.activation_deadline?.getTime()??Date.now())-Date.now())/1000))});
    return response;
  }catch(error){return promotionResponseError(error);}
}
