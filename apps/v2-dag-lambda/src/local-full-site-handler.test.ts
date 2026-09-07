import assert from "node:assert/strict";
import test from "node:test";
import {handler} from "./local-full-site-handler";
test("local inventory rejects malformed grants before browser work",async()=>{
 const previous=process.env.CERTSCORE_FULL_SITE_LOCAL_BRIDGE;
 try {
  process.env.CERTSCORE_FULL_SITE_LOCAL_BRIDGE="1";
  await assert.rejects(handler({message:{},grant:{}}));
  delete process.env.CERTSCORE_FULL_SITE_LOCAL_BRIDGE;
  await assert.rejects(handler({}),/disabled/);
 }finally{if(previous===undefined)delete process.env.CERTSCORE_FULL_SITE_LOCAL_BRIDGE;else process.env.CERTSCORE_FULL_SITE_LOCAL_BRIDGE=previous;}
});
