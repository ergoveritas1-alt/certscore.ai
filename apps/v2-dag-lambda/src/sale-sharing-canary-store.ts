import {GetObjectCommand,PutObjectCommand,S3Client} from "@aws-sdk/client-s3";
import {saleSharingCanaryLedger,type SaleSharingCanaryCampaign} from "@certscore/contracts";

export function createSaleSharingCanaryStore(campaign:SaleSharingCanaryCampaign,signal:AbortSignal,client:Pick<S3Client,"send">=new S3Client({region:"us-west-1",maxAttempts:1})) {
  return saleSharingCanaryLedger({
    async readText(Key){
      try{
        const r=await client.send(new GetObjectCommand({Bucket:campaign.bucket,Key}),{abortSignal:signal});
        if(r.ContentLength===undefined||r.ContentLength>8192||!r.Body)throw Error("canary_record_invalid");
        return r.Body.transformToString();
      }catch(e){if((e as {name?:string}).name==="NoSuchKey")return null;throw e;}
    },
    async createText(Key,Body){await client.send(new PutObjectCommand({Bucket:campaign.bucket,Key,Body,ContentType:"application/json",IfNoneMatch:"*"}),{abortSignal:signal});},
  });
}
