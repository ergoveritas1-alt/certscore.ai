import { NextResponse } from "next/server";
import { recordCampaignAggregate } from "../../../../../server/promotions/aggregate";
import { z } from "zod";
import { assertSameOrigin,boundedBody,rateLimit,promotionResponseError } from "../../../../../server/promotions/http";
const schema=z.object({id:z.string().uuid(),event:z.enum(["bf26_landing_view","bf26_form_start"]),consent:z.boolean(),attribution:z.unknown().optional()});
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);await rateLimit(request,"event");const data=schema.parse(await boundedBody(request));
    await recordCampaignAggregate(data,request.headers.get("sec-gpc")==="1");
    return new NextResponse(null,{status:204});
  }catch(error){return promotionResponseError(error);}
}
