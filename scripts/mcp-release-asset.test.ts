import assert from "node:assert/strict";
import test from "node:test";
import { assertPublishedMcpReleaseAsset, mcpReleaseMetadataUrl, verifyMcpReleaseAssetMetadata } from "./lib/mcp-release-asset";

const cask = {version:"0.2.23",sha256:"a".repeat(64),url:"https://github.com/ergoveritas1-alt/certscore.ai/releases/download/certscore-mcp-v0.2.23/certscore-mcp-v0.2.23.tar.gz"};
const receipt = () => ({tag_name:"certscore-mcp-v0.2.23",draft:false,prerelease:false,published_at:"2026-09-25T11:56:24Z",assets:[
  {name:"certscore-mcp-v0.2.23.tar.gz",state:"uploaded",size:271390,browser_download_url:cask.url,digest:`sha256:${cask.sha256}`},
]});

test("MCP guard uses one metadata-only GET with redirects disabled and no archive request",async()=>{
  const calls:Array<{url:string;init:RequestInit|undefined}>=[];
  await assertPublishedMcpReleaseAsset(cask,{fetchImpl:async(input,init)=>{calls.push({url:String(input),init});return Response.json(receipt());}});
  assert.equal(calls.length,1);assert.equal(calls[0]!.url,mcpReleaseMetadataUrl(cask));
  assert.equal(calls[0]!.init?.method,"GET");assert.equal(calls[0]!.init?.redirect,"error");
  assert.ok(!("Range" in calls[0]!.init!.headers!));
});

test("MCP metadata source cannot be redirected by a cask URL, version or digest",()=>{
  for(const bad of [{...cask,url:cask.url.replace('github.com','untrusted.test')},{...cask,url:cask.url+'?download=1'},
    {...cask,version:'../other'},{...cask,sha256:'invalid'}]) assert.throws(()=>mcpReleaseMetadataUrl(bad));
});

test("MCP release metadata rejects missing, ambiguous, unready and mismatched proof",()=>{
  verifyMcpReleaseAssetMetadata(cask,receipt());
  for(const change of [
    (m:ReturnType<typeof receipt>)=>{m.tag_name='different';},
    (m:ReturnType<typeof receipt>)=>{m.draft=true;},
    (m:ReturnType<typeof receipt>)=>{m.prerelease=true;},
    (m:ReturnType<typeof receipt>)=>{m.published_at='invalid';},
    (m:ReturnType<typeof receipt>)=>{m.assets=[];},
    (m:ReturnType<typeof receipt>)=>{m.assets.push({...m.assets[0]!});},
    (m:ReturnType<typeof receipt>)=>{m.assets[0]!.state='new';},
    (m:ReturnType<typeof receipt>)=>{m.assets[0]!.size=0;},
    (m:ReturnType<typeof receipt>)=>{m.assets[0]!.digest='sha256:'+'b'.repeat(64);},
    (m:ReturnType<typeof receipt>)=>{m.assets[0]!.browser_download_url='https://untrusted.test/file';},
  ]) {const m=receipt();change(m);assert.throws(()=>verifyMcpReleaseAssetMetadata(cask,m));}
  assert.throws(()=>verifyMcpReleaseAssetMetadata(cask,null));
});

test("MCP metadata HTTP, malformed JSON and transport failures never fall back to asset download",async()=>{
  for(const fetchImpl of [
    async()=>new Response('',{status:404}),async()=>new Response('',{status:403}),
    async()=>new Response('invalid'),async()=>{throw Error('network unavailable');},
  ]) {let calls=0;await assert.rejects(assertPublishedMcpReleaseAsset(cask,{fetchImpl:async(...args)=>{calls++;return fetchImpl();}}));assert.equal(calls,1);}
});
