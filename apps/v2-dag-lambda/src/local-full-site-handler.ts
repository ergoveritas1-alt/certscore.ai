/** Isolated development runner using the canonical inventory collector. */
import { S3Client } from "@aws-sdk/client-s3";
import { z } from "zod";
import { runFullSitePage } from "./full-site-page";
const request = z.object({
  message: z.object({ contractVersion: z.literal("certscore.full-site-page-dispatch.v1"), pageId: z.string().uuid(), attemptId: z.string().uuid(), token: z.string().regex(/^[a-f0-9]{64}$/) }).strict(),
  grant: z.object({ scanId:z.string().uuid(), pageId:z.string().uuid(), attemptId:z.string().uuid(), url:z.string().url(), hosts:z.array(z.string()).min(1), region:z.string(), configurationHash:z.string(), configuration:z.object({profile:z.enum(["tiny","standard"]),waitMode:z.enum(["fast","full"])}).passthrough(), robots:z.record(z.unknown()), bucket:z.string(), artifactPrefix:z.string() }).strict(),
}).strict();
export async function handler(event: unknown) {
  if (process.env.CERTSCORE_FULL_SITE_LOCAL_BRIDGE !== "1") throw new Error("Local inventory bridge disabled");
  const { message, grant } = request.parse(event);
  if (grant.region !== process.env.AWS_REGION || grant.pageId !== message.pageId || grant.attemptId !== message.attemptId) throw new Error("Grant identity mismatch");
  const context = z.object({userAgent:z.string().optional(),locale:z.string().optional(),timezoneId:z.string().optional(),extraHTTPHeaders:z.record(z.string()).optional()}).passthrough().parse(grant.configuration.context);
  // Match the retained homepage browser context; the collector verifies its hash.
  for (const [suffix,value] of Object.entries({USER_AGENT:context.userAgent,LOCALE:context.locale,TIMEZONE_ID:context.timezoneId,ACCEPT_LANGUAGE:context.extraHTTPHeaders?.["Accept-Language"]})) {
    process.env[`CERTSCORE_V2_DAG_LAMBDA_CHROMIUM_${suffix}`]=value ?? "";
    delete process.env[`CERTSCORE_CHROMIUM_${suffix}`];
  }
  const artifacts: Array<{key:string;body:string}> = [];
  let bytes=0;
  let finish: Record<string,unknown> | undefined;
  const s3Client = {send: async (command: {input:{Key:string;Body:string}}) => {
    const {Key:key,Body:body}=command.input;
    bytes+=Buffer.byteLength(body);
    if(bytes>2*1024*1024) throw new Error("Local inventory response exceeds limit");
    artifacts.push({key,body});return {};
  }} as unknown as S3Client;
  await runFullSitePage(message, {s3Client,control:async body => {
    if(body.operation === "claim") return {grant};
    finish=body; return {};
  }});
  return {artifacts,finish};
}
