import type {CDPSession} from "playwright";
import {saleSharingOptOutDispatchSchema,SALE_SHARING_REDIRECT_POLICY,SALE_SHARING_EXACT_ROUTE_POLICY,type SaleSharingOptOutDispatch,type SaleSharingOptOutEvidence} from "@certscore/contracts";

type Pause={requestId:string;frameId:string;resourceType:string;request:{url:string;method:string};redirectedRequestId?:string;responseStatusCode?:number;responseErrorReason?:string;responseHeaders?:{name:string;value:string}[]};

/** Protect both stages of the browser's own navigation. Playwright routing alone
 * does not intercept every redirect hop. No preflight fetch, synthetic response,
 * second goto, or document replacement is used. Caller must enforce native TLS
 * validation and block service workers in this isolated context. */
export async function installSaleSharingRedirectGuard(input:{
  cdp:CDPSession;mainFrameId:string;config:SaleSharingOptOutDispatch;
  validatePublicUrl:(url:string)=>Promise<unknown>;remaining:()=>number;
  onInvalidated:()=>void;
}){
  const config=saleSharingOptOutDispatchSchema.parse(input.config);
  const exactRoute=config.policyVersion===SALE_SHARING_EXACT_ROUTE_POLICY;
  const targets=exactRoute?config.exactRouteAuthorization?.targets:config.policyVersion===SALE_SHARING_REDIRECT_POLICY&&config.redirectAuthorization?[config.redirectAuthorization.alternateTargetUrl]:undefined;
  if(!targets)throw new Error("redirect_authorization_missing");
  const urls=[config.exactTargetUrl,...targets],{cdp}=input;
  const requestIds:string[]=[],statuses:(301|302|303|307|308)[]=[];
  let failure:string|null=null,actionTarget:string|null=null;
  let proof:NonNullable<SaleSharingOptOutEvidence["redirectProof"]>|null=null;
  let routeProof:NonNullable<SaleSharingOptOutEvidence["exactRouteProof"]>|null=null;
  const responded=new Set<string>();
  const block=async(event:Pause,reason:string,invalidate=true)=>{
    if(invalidate){failure??=reason;actionTarget=null;input.onInvalidated();}
    await cdp.send("Fetch.failRequest",{requestId:event.requestId,errorReason:"BlockedByClient"}).catch(()=>undefined);
  };
  const handle=async(event:Pause)=>{
    if(event.resourceType!=="Document"||event.frameId!==input.mainFrameId){await block(event,"subframe_navigation_blocked",false);return;}
    if(failure){await block(event,failure);return;}
    input.remaining();
    if(event.responseErrorReason){await block(event,"redirect_transport_failed");return;}
    if(event.responseStatusCode===undefined){
      if(event.request.method!=="GET"){await block(event,"redirect_method_not_authorized");return;}
      const index=requestIds.length;
      if(index===0){
        if(event.request.url!==urls[0]||event.redirectedRequestId){await block(event,"redirect_initial_target_mismatch");return;}
      }else if(index>=urls.length||!statuses[index-1]||event.redirectedRequestId!==requestIds[index-1]||event.request.url!==urls[index]||requestIds.includes(event.requestId)){
        await block(event,"redirect_ancestry_or_hop_limit");return;
      }
      requestIds.push(event.requestId);
      await input.validatePublicUrl(event.request.url);input.remaining();
      if(failure){await block(event,failure);return;}
      await cdp.send("Fetch.continueRequest",{requestId:event.requestId});return;
    }
    const index=requestIds.indexOf(event.requestId);
    if(index<0||event.request.url!==urls[index]||responded.has(event.requestId)){await block(event,"redirect_response_binding_mismatch");return;}
    responded.add(event.requestId);
    const status=event.responseStatusCode;
    if([301,302,303,307,308].includes(status)){
      if(index>=targets.length||statuses[index]!==undefined){await block(event,"redirect_hop_limit");return;}
      const locations=(event.responseHeaders??[]).filter(h=>h.name.toLowerCase()==="location");
      if(locations.length!==1||locations[0]!.value.length>2000){await block(event,"redirect_location_invalid");return;}
      let destination:string;
      try{destination=new URL(locations[0]!.value,urls[index]).href;}catch{await block(event,"redirect_location_invalid");return;}
      if(destination!==urls[index+1]){await block(event,"redirect_destination_not_authorized");return;}
      // Validate before releasing the redirect response; request-stage validation
      // runs again before its destination connects, with no settled DNS cache.
      await input.validatePublicUrl(destination);input.remaining();
      if(failure){await block(event,failure);return;}
      statuses[index]=status as 301|302|303|307|308;
    }else if(status>=200&&status<300){
      // An intermediate 200 does not authorize acting there or skipping the rest.
      if(index!==0&&index!==urls.length-1){await block(event,"redirect_route_incomplete");return;}
      actionTarget=event.request.url;
      if(index>0){
        const hops=targets.map((toUrl,i)=>({version:"sale_sharing_redirect_proof.v1" as const,fromUrl:urls[i]!,toUrl,status:statuses[i]!,sourceRequestId:requestIds[i]!,targetRequestId:requestIds[i+1]!,tlsValidated:true as const}));
        if(exactRoute)routeProof={version:"sale_sharing_exact_route_proof.v1",hops};
        else proof=hops[0]!;
      }
    }else{
      await block(event,"redirect_document_http_error");return;
    }
    input.remaining();
    await cdp.send("Fetch.continueResponse",{requestId:event.requestId});
  };
  cdp.on("Fetch.requestPaused",(event:Pause)=>{
    void handle(event).catch(()=>block(event,"redirect_validation_failed"));
  });
  await cdp.send("Fetch.enable",{patterns:[
    {urlPattern:"*",resourceType:"Document",requestStage:"Request"},
    {urlPattern:"*",resourceType:"Document",requestStage:"Response"},
  ]});
  return {actionTarget:()=>actionTarget,proof:()=>proof,routeProof:()=>routeProof,failure:()=>failure};
}
