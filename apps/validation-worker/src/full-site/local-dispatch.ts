import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { claimFullSitePage, putStorageObject } from "@website-signal-risk-scanner/db";
import { z } from "zod";

export function localInventoryEnabled() {
  return process.env.NODE_ENV !== "production" && process.env.CERTSCORE_FULL_SITE_LOCAL_EXECUTION === "1";
}
const responseSchema=z.object({artifacts:z.array(z.object({key:z.string(),body:z.string()})).length(2),finish:z.object({operation:z.literal("finish"),sha256:z.string(),sizeBytes:z.number(),evidenceSizeBytes:z.number()})});
export async function dispatchLocalInventory(job: {pageId:string;attemptId:string;token:string;region:string}) {
  if(!localInventoryEnabled()) throw new Error("Invalid local inventory target");
  const grant=await claimFullSitePage(job);
  if(!grant) return;
  const message={contractVersion:"certscore.full-site-page-dispatch.v1",pageId:job.pageId,attemptId:job.attemptId,token:job.token};
  const dir = await mkdtemp(path.join(tmpdir(), "certscore-inventory-"));
  let response: z.infer<typeof responseSchema>;
  try {
    const output = path.join(dir, "result.json");
    await new Promise<void>((resolve, reject) => {
      const child = spawn(process.execPath, ["--import", "tsx", "../v2-dag-lambda/src/local-full-site-runner.ts", output], {
        cwd: path.resolve(__dirname, "../.."),
        env: { ...process.env, AWS_REGION: job.region, CERTSCORE_FULL_SITE_INVENTORY_WORKER: "1", CERTSCORE_FULL_SITE_LOCAL_BRIDGE: "1", CERTSCORE_PUBLIC_NETWORK_GUARD_FORCE: "true" },
        stdio: ["pipe", "ignore", "inherit"],
      });
      const timer=setTimeout(() => child.kill("SIGKILL"), 35000);
      child.once("error", reject);
      child.once("exit", code => {clearTimeout(timer); code===0 ? resolve() : reject(new Error("Local inventory process failed"));});
      child.stdin.end(JSON.stringify({message,grant}));
    });
    response=responseSchema.parse(JSON.parse(await readFile(output,"utf8")));
  } finally { await rm(dir,{recursive:true,force:true}); }
  const prefix=`${grant.artifactPrefix}/${job.pageId}/${job.attemptId}`;
  const expected=new Set([`${prefix}/inventory.json`,`${prefix}/evidence.json`]);
  for(const artifact of response.artifacts){
    if(!expected.delete(artifact.key)) throw new Error("Unexpected inventory artifact");
    await putStorageObject({bucket:grant.bucket,key:artifact.key,body:artifact.body,contentType:"application/json"});
  }
  const origin=new URL(process.env.CERTSCORE_WEB_BASE_URL ?? "http://localhost:3000");
  if(!["localhost","127.0.0.1","[::1]"].includes(origin.hostname)) throw new Error("Local bridge requires loopback control plane");
  const finish=await fetch(new URL("/api/internal/full-site/page",origin),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...message,...response.finish}),signal:AbortSignal.timeout(10000),redirect:"error"});
  if(!finish.ok) throw new Error(`Local inventory persistence failed (${finish.status})`);
}
