import "server-only";
import { createHmac } from "node:crypto";
import { query } from "@website-signal-risk-scanner/db";
import { ZodError } from "zod";
import { NextResponse } from "next/server";
import { getTrustedRequestSourceIp } from "../../lib/request-source-ip";
import { PromotionError } from "./repository";
export function assertSameOrigin(request: Request) {
  const expected=process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  if(request.headers.get("origin")!==new URL(expected).origin || request.headers.get("sec-fetch-site")==="cross-site") throw new PromotionError("Request origin not permitted.",403);
}
export async function boundedBody(request: Request) {
  if(!request.headers.get("content-type")?.startsWith("application/json")) throw new PromotionError("JSON is required.",415);
  const reader=request.body?.getReader(); if(!reader) throw new PromotionError("Request body required.");
  const chunks:Uint8Array[]=[];let length=0;
  while(true) { const part=await reader.read();if(part.done) break;length+=part.value.length;if(length>12000){await reader.cancel();throw new PromotionError("Request too large.",413);}chunks.push(part.value); }
  try{return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string,unknown>;}catch{throw new PromotionError("Invalid JSON.");}
}
export async function rateLimit(request: Request, kind: "application"|"event"|"invite", run: typeof query=query) {
  const secret=process.env.BETTER_AUTH_SECRET; if(!secret || secret.length<32) throw new PromotionError("Campaign temporarily unavailable.",503);
  const ip=getTrustedRequestSourceIp(request.headers)??"unknown";
  const hour=new Date().toISOString().slice(0,13);
  const key=createHmac("sha256",secret).update(`bf26-abuse:${kind}:${hour}:${ip}`).digest("hex");
  const row=(await run(`insert into promotion_rate_limits(key,window_start,count) values($1,date_trunc('hour',now()),1) on conflict(key) do update set count=promotion_rate_limits.count+1 returning count`,[key])).rows[0];
  if(!row || row.count>(kind==="application"?5:kind==="invite"?20:120)) throw new PromotionError("Too many requests. Please try again later.",429);
}
export function promotionResponseError(error: unknown) {
  if(error instanceof ZodError) return NextResponse.json({error:"Please check the highlighted fields.",fields:Object.fromEntries(error.issues.map(i=>[i.path[0],i.message]))},{status:400});
  if(error instanceof PromotionError) return NextResponse.json({error:error.message},{status:error.status,headers:error.status===429?{"Retry-After":"3600"}:{}});
  console.error("[bf26] request failed",{errorClass:error instanceof Error?error.name:"unknown"});
  return NextResponse.json({error:"We could not complete that request. Please try again."},{status:503});
}
