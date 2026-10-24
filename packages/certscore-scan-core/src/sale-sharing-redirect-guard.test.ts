import assert from "node:assert/strict";
import test from "node:test";
import {EventEmitter} from "node:events";
import type {CDPSession} from "playwright";
import {installSaleSharingRedirectGuard} from "./sale-sharing-redirect";
import {assertPublicNetworkUrl} from "./public-network-guard";
import {SALE_SHARING_REDIRECT_POLICY,SALE_SHARING_REDIRECT_AUTHORIZATION} from "@certscore/contracts";

test("redirect interception rejects ancestry, DNS, duplicate headers and late continuations before transport",async t=>{
  for(const mode of ["valid","private-initial","private-destination","dns-changed","ancestry","duplicate-location","budget","late-response","subframe"]){
    await t.test(mode,async()=>{
      const emitter=new EventEmitter(),calls:{method:string;args:Record<string,unknown>}[]=[];let invalidated=false,expired=false,alternateChecks=0;
      const cdp=Object.assign(emitter,{send:async(method:string,args:Record<string,unknown>)=>{calls.push({method,args});return {};}}) as unknown as CDPSession;
      const guard=await installSaleSharingRedirectGuard({cdp,mainFrameId:"main",config:{enabled:true,policyVersion:SALE_SHARING_REDIRECT_POLICY,scanId:"one",exactTargetUrl:"https://example.com/",redirectAuthorization:{version:SALE_SHARING_REDIRECT_AUTHORIZATION,alternateTargetUrl:"https://www.example.com/"}},
        remaining:()=>{if(expired)throw new Error("deadline");return 100;},onInvalidated:()=>{invalidated=true;},
        validatePublicUrl:async url=>{
          if(url==="https://www.example.com/")alternateChecks++;
          const privateAnswer=mode==="private-initial"||url==="https://www.example.com/"&&(mode==="private-destination"||mode==="dns-changed"&&alternateChecks===2);
          await assertPublicNetworkUrl(url,{resolver:async()=>[{address:privateAnswer?"127.0.0.1":"93.184.216.34",family:4}]});
        },
      });
      const emit=async(fields:Record<string,unknown>)=>{emitter.emit("Fetch.requestPaused",{requestId:"first",frameId:"main",resourceType:"Document",request:{url:"https://example.com/",method:"GET"},...fields});await new Promise(resolve=>setImmediate(resolve));};
      if(mode==="subframe"){
        await emit({frameId:"child"});assert.equal(invalidated,false);assert.equal(calls.at(-1)?.method,"Fetch.failRequest");return;
      }
      await emit({});
      if(mode==="private-initial"){assert.equal(calls.at(-1)?.method,"Fetch.failRequest");assert.equal(guard.actionTarget(),null);return;}
      const location={name:"Location",value:"https://www.example.com/"};
      await emit({responseStatusCode:302,responseHeaders:mode==="duplicate-location"?[location,location]:[location]});
      if(mode==="private-destination"||mode==="duplicate-location"){
        assert.equal(calls.some(c=>c.method==="Fetch.continueResponse"),false);assert.equal(guard.actionTarget(),null);return;
      }
      if(mode==="budget")expired=true;
      const destination={requestId:"second",redirectedRequestId:mode==="ancestry"?"unrelated":"first",request:{url:"https://www.example.com/",method:"GET"}};
      if(mode==="late-response")await emit({...destination,redirectedRequestId:"unrelated"});
      await emit(destination);
      await emit({...destination,responseStatusCode:200,responseHeaders:[]});
      if(mode==="valid"){
        assert.equal(guard.actionTarget(),"https://www.example.com/");assert.equal(invalidated,false);assert.equal(guard.proof()?.sourceRequestId,"first");assert.equal(guard.proof()?.targetRequestId,"second");
        // The same grant cannot navigate again, even to its original URL.
        await emit({requestId:"third"});assert.equal(guard.actionTarget(),null);assert.equal(invalidated,true);
      }else{
        assert.equal(guard.actionTarget(),null);assert.equal(invalidated,true);
        assert.equal(calls.filter(c=>c.method==="Fetch.continueRequest").length,1,"destination request was never continued");
      }
    });
  }
});

import {SALE_SHARING_EXACT_ROUTE_POLICY,saleSharingExactRouteAuthorization} from "@certscore/contracts";
test("two-hop exact routes validate each public destination and cannot resume after invalidation",async t=>{
  for(const mode of ["valid","private-intermediate","private-final","changed-final-dns","wrong-final-parent","reused-request-id","final-post","final-deadline","invalidation-during-dns"]){
    await t.test(mode,async()=>{
      const emitter=new EventEmitter(),calls:{method:string;args:Record<string,unknown>}[]=[];
      const original="https://cognitiondigital.io/",grant=saleSharingExactRouteAuthorization(original)!,urls=[original,...grant.targets];
      let invalidated=false,expired=false,finalChecks=0;let interrupt:()=>Promise<void>;
      const cdp=Object.assign(emitter,{send:async(method:string,args:Record<string,unknown>)=>{calls.push({method,args});return {};}}) as unknown as CDPSession;
      const guard=await installSaleSharingRedirectGuard({cdp,mainFrameId:"main",config:{enabled:true,policyVersion:SALE_SHARING_EXACT_ROUTE_POLICY,scanId:"one",exactTargetUrl:original,exactRouteAuthorization:grant},
        onInvalidated:()=>{invalidated=true;},remaining:()=>{if(expired)throw new Error("deadline");return 100;},validatePublicUrl:async url=>{
          if(url===urls[2])finalChecks++;
          if(mode==="final-deadline"&&finalChecks===1)expired=true;
          if(mode==="invalidation-during-dns"&&finalChecks===1)await interrupt();
          const privateAnswer=mode==="private-intermediate"&&url===urls[1]||mode==="private-final"&&url===urls[2]||mode==="changed-final-dns"&&url===urls[2]&&finalChecks===2;
          await assertPublicNetworkUrl(url,{resolver:async()=>[{address:privateAnswer?"127.0.0.1":"93.184.216.34",family:4}]});
        }});
      const emit=async(index:number,patch:Record<string,unknown>={})=>{emitter.emit("Fetch.requestPaused",{requestId:`r${index}`,frameId:"main",resourceType:"Document",request:{url:urls[index]??original,method:"GET"},...(index>0?{redirectedRequestId:`r${index-1}`} :{}),...patch});await new Promise(resolve=>setImmediate(resolve));};
      interrupt=()=>emit(2,{redirectedRequestId:"unrelated"});
      await emit(0);await emit(0,{responseStatusCode:301,responseHeaders:[{name:"Location",value:urls[1]}]});
      if(!invalidated){await emit(1);await emit(1,{responseStatusCode:302,responseHeaders:[{name:"Location",value:urls[2]}]});}
      if(!invalidated)await emit(2,mode==="wrong-final-parent"?{redirectedRequestId:"r0"}:mode==="reused-request-id"?{requestId:"r0"}:mode==="final-post"?{request:{url:urls[2],method:"POST"}}:{});
      if(!invalidated)await emit(2,{responseStatusCode:200,responseHeaders:[]});
      if(mode==="valid"){
        assert.equal(guard.actionTarget(),urls[2]);assert.equal(guard.routeProof()?.hops.length,2);assert.equal(guard.routeProof()?.hops[1]?.sourceRequestId,"r1");assert.equal(guard.proof(),null);
        await emit(3);assert.equal(guard.actionTarget(),null);assert.ok(invalidated);
      }else{
        assert.ok(invalidated);assert.equal(guard.actionTarget(),null);
        assert.equal(calls.filter(c=>c.method==="Fetch.continueRequest").length,mode==="private-intermediate"?1:2);
        // Late response delivery cannot recreate a usable document after failure.
        await emit(2,{responseStatusCode:200});assert.equal(guard.actionTarget(),null);assert.equal(guard.routeProof(),null);
      }
    });
  }
});
