import {classifyDeclaredCookiePurpose} from "@certscore/vendor-resolver";
import {runtimeStoragePurposeV2Schema,storageReadTraceSchema,cookieSnapshotSchema,type RuntimeStoragePurposeV2,type CaliforniaPolicyDocument} from "@certscore/contracts";
import {createHash} from "node:crypto";
import {runtimeStoragePurposeAssessmentSchema,runtimeScriptEvidenceSchema,verifyRuntimeEvidenceGraph,type CanonicalEvidenceBundle,type RuntimeStoragePurposeAssessment} from "@certscore/contracts";
const baseline=(scenario:string|undefined)=>["pre_consent","fresh_pre_consent"].includes(scenario??"");
/** Source flow is retained as inferred semantics. It never establishes necessity,
 * a consent decision, legal compliance, or a score effect. */
export function assessRuntimeStoragePurposes(bundle:CanonicalEvidenceBundle,documentUrl:string,sourceBundleSha256:string):RuntimeStoragePurposeAssessment {
  const candidates=(bundle.runtimeEvidenceGraphs??[]).filter(graph=>graph.scenario === "pre_consent");
  const verified=candidates.length===1?verifyRuntimeEvidenceGraph(candidates[0],{scanId:bundle.scanId,scenario:"pre_consent",mode:"project",sha256:value=>createHash("sha256").update(value).digest("hex")}):null;
  const graph=verified?.graph?.captureId === `${bundle.scanId}:runtime_evidence`?verified.graph:undefined;
  const sources=(bundle.runtimeScriptEvidence??[]).flatMap(raw=>{const parsed=runtimeScriptEvidenceSchema.safeParse(raw);if(!parsed.success||parsed.data.facts.some(fact=>createHash("sha256").update(fact.excerpts[0]!.text).digest("hex")!==fact.expressionSha256))return [];const row=parsed.data;
    return graph&&row.scanId===bundle.scanId&&row.documentUrl===documentUrl&&graph.nodes.some(node=>node.kind === "document"&&node.url===documentUrl&&node.documentId===row.documentId&&node.frameId===row.frameId)?[row]:[];});
  const items:RuntimeStoragePurposeAssessment["items"]=[];
  const writes=(graph?.nodes??[]).filter(node=>node.captureBasis === "instrumented_call"&&node.outcome === "native_call_returned"&&["js_set","setItem"].includes(node.operation??"")&&node.cookieAttributes?.maxAge!==0&&
    graph!.nodes.some(doc=>doc.id===node.documentId&&doc.kind === "document"&&doc.url===documentUrl&&doc.frameId===node.frameId));
  function sourceFor(write:typeof writes[number],kind:"storage_referrer_flow"|"checkbox_preference_cookie_call"){
    const document=graph!.nodes.find(node=>node.id === write.documentId)!;
    const scriptIds=graph!.edges.filter(edge=>edge.to===write.id&&["script_cookie_attempt","script_storage_operation"].includes(edge.relation)).map(edge=>edge.from);
    const urls=new Set(graph!.nodes.filter(node=>scriptIds.includes(node.id)&&node.kind === "script"&&node.documentId===write.documentId&&node.frameId===write.frameId).map(node=>node.url));
    const eligible=sources.filter(source=>source.documentId===document.documentId&&source.frameId===document.frameId);
    if(kind === "storage_referrer_flow")return eligible.find(source=>urls.has(source.scriptUrl)&&source.facts.some(fact=>fact.kind===kind&&fact.name===write.name&&fact.storageType===write.storageType));
    // The executed inline cookie helper and the checked-state caller must both be
    // retained in this exact loader/frame; a helper name alone receives no credit.
    const helpers=eligible.filter(source=>urls.has(source.scriptUrl)).flatMap(source=>source.facts.filter(fact=>fact.kind === "cookie_parameter_setter").map(fact=>fact.helper));
    return eligible.find(source=>source.facts.some(fact=>fact.kind===kind&&fact.name===write.cookie?.name&&helpers.includes(fact.helper)));
  }
  const cookies=(bundle.cookieEvents??[]).filter(event=>baseline(event.scenario)&&event.documentUrl===documentUrl);
  const names=[...new Set([...cookies.map(cookie=>cookie.cookieName),...writes.filter(write=>write.kind === "cookie").map(write=>write.cookie?.name).filter((name):name is string=>Boolean(name))])];
  for(const name of names.slice(0,24)){
    const namedCookies=cookies.filter(cookie=>cookie.cookieName===name),namedWrites=writes.filter(write=>write.cookie?.name===name);
    const cookie=namedCookies[0],write=namedWrites[0];
    const scopes=new Set([...namedCookies.map(cookie=>JSON.stringify([cookie.cookieDomain,cookie.cookiePath])),...namedWrites.map(write=>JSON.stringify([write.cookie?.domain,write.cookie?.path]))]);
    // A shared name must not borrow a different scope's purpose. Partitioned or
    // competing scopes stay unresolved until separately keyed assessment exists.
    const source=scopes.size===1&&namedWrites.length>0&&namedWrites.every(write=>!write.cookie?.partitionKey&&!write.cookie?.partitionOpaque&&sourceFor(write,"checkbox_preference_cookie_call"))?sourceFor(write!,"checkbox_preference_cookie_call"):undefined;
    const known=scopes.size===1&&namedCookies.every(row=>row.cookiePurpose===cookie?.cookiePurpose)&&cookie?.cookiePurpose&&["marketing","personalization","session_replay","consent_management","tag_management","infrastructure","performance_monitoring","customer_support","preferences","analytics","advertising","functional","security"].includes(cookie.cookiePurpose)?cookie.cookiePurpose as Exclude<RuntimeStoragePurposeAssessment["items"][number]["purpose"],"unknown">:undefined;
    items.push({kind:"cookie",name,purpose:known??(source?"preferences":"unknown"),dataOrigin:"unknown",basis:known?"canonical_registry":source?"script_and_runtime":"runtime_only",
      evidenceRefs:[...(cookie?[cookie.eventId]:[]),...(write?[write.id]:[]),...(source?[`script-source:${source.sourceSha256}`]:[])].slice(0,8),...(source?{sourceSha256:source.sourceSha256}:{}),
      reason:known?"Purpose identified by the canonical cookie registry.":source?"Retained same-document code maps checked control states to this cookie through the observed cookie-writing helper. Preference purpose is inferred; registration and necessity are unassessed.":"Cookie observed; its name and setter alone do not establish a business purpose or necessity."});
  }
  for(const snapshot of bundle.storageSnapshots??[]){
    if(!baseline(snapshot.scenario)||snapshot.url!==documentUrl||!snapshot.captureContext)continue;
    let origin:string;try{origin=new URL(documentUrl).origin;}catch{continue;}
    if(snapshot.captureContext.origin!==origin)continue;
    for(const kind of ["localStorage","sessionStorage"] as const){
      if(!snapshot.captureContext[kind === "localStorage"?"localStorageReadComplete":"sessionStorageReadComplete"])continue;
      for(const name of (kind === "localStorage"?snapshot.localStorageKeys:snapshot.sessionStorageKeys).slice(0,24)){
        if(items.length>=32||items.some(item=>item.kind===kind&&item.name===name))continue;
        const write=writes.find(write=>write.kind === "storage"&&write.storageType===kind&&write.name===name);
        const source=write?sourceFor(write,"storage_referrer_flow"):undefined;
        items.push({kind,name,purpose:"unknown",dataOrigin:source?"document_referrer":"unknown",basis:source?"script_and_runtime":"runtime_only",
          evidenceRefs:[snapshot.artifactId,...(write?[write.id]:[]),...(source?[`script-source:${source.sourceSha256}`]:[])],...(source?{sourceSha256:source.sourceSha256}:{}),
          reason:source?"The observed write is linked to retained code deriving this entry from document.referrer. Referral/navigation data is identified; its business use and transmission remain unverified.":"Key presence is observed; stored data and business purpose are unresolved."});
      }
    }
  }
  return runtimeStoragePurposeAssessmentSchema.parse({contractVersion:"certscore.runtime-storage-purpose.v1",sourceBundleSha256,retainedSources:sources,items});
}

/** V2 supplements runtime semantics with separately attributed website claims and
 * actual read callsites. Claims never replace the runtime purpose. */
export function assessRuntimeStoragePurposesV2(bundle:CanonicalEvidenceBundle,documentUrl:string,sourceBundleSha256:string,documents:CaliforniaPolicyDocument[],policyComplete:boolean):RuntimeStoragePurposeV2 {
  const prior=assessRuntimeStoragePurposes(bundle,documentUrl,sourceBundleSha256);
  const candidates=(bundle.runtimeEvidenceGraphs??[]).filter(graph=>graph.scenario === "pre_consent");
  const graph=candidates.length===1?verifyRuntimeEvidenceGraph(candidates[0],{scanId:bundle.scanId,scenario:"pre_consent",mode:"project",sha256:value=>createHash("sha256").update(value).digest("hex")}).graph:undefined;
  const parsed=storageReadTraceSchema.safeParse(bundle.storageReadTrace);
  const trace=graph&&graph.captureId===`${bundle.scanId}:runtime_evidence`&&parsed.success&&parsed.data.scanId===bundle.scanId&&parsed.data.captureId===graph.captureId?parsed.data:undefined;
  const validReads=trace?.observations.filter(read=>read.documentUrl===documentUrl&&graph!.nodes.some(node=>node.kind === "document"&&node.url===documentUrl&&node.documentId===read.documentId&&node.frameId===read.frameId))??[];
  const baseItems:RuntimeStoragePurposeV2["items"]=prior.items.slice();
  let inventoryLimited=baseItems.length>=32||new Set((bundle.cookieEvents??[]).filter(event=>baseline(event.scenario)&&event.documentUrl===documentUrl).map(event=>event.cookieName)).size>24;
  const snapshotScopes=new Map<string,Set<string>>();
  // Bind browser-context cookies to the verified committed document. A response
  // can precede the legacy event's document URL; its absence must not erase an
  // independently completed, loader-bound browser snapshot.
  if(graph?.captureId===`${bundle.scanId}:runtime_evidence`)for(const raw of (bundle.cookieSnapshots??[]).slice(0,4)){
    const parsed=cookieSnapshotSchema.safeParse(raw);if(!parsed.success)continue;
    const snapshot=parsed.data,coverage=snapshot.captureCoverage;
    if(snapshot.consentStateAtTime!=="pre_consent"||!coverage||coverage.documentUrl!==documentUrl||coverage.targetUrl!==documentUrl||snapshot.capturedAtMs<coverage.completedAtMs||!graph.nodes.some(node=>node.kind === "document"&&node.url===documentUrl&&node.documentId===coverage.documentToken))continue;
    if(snapshot.cookies.length>32)inventoryLimited=true;
    for(const cookie of snapshot.cookies.slice(0,32)){
      const retained=graph.nodes.find(node=>node.kind === "cookie"&&node.operation === "snapshot"&&node.captureBasis === "cdp"&&node.outcome === "stored"&&node.cookie?.name===cookie.name&&node.cookie.domain===cookie.domain&&node.cookie.path===cookie.path&&!node.cookie.partitionKey&&!node.cookie.partitionOpaque);
      if(cookie.partitionKey){inventoryLimited=true;continue;}
      if(!retained||!cookie.path){inventoryLimited=true;continue;}
      const scopes=snapshotScopes.get(cookie.name)??new Set<string>();scopes.add(JSON.stringify([cookie.domain,cookie.path]));snapshotScopes.set(cookie.name,scopes);
      if(baseItems.some(item=>item.kind === "cookie"&&item.name===cookie.name))continue;
      if(baseItems.length>=32){inventoryLimited=true;continue;}
      const events=(bundle.cookieEvents??[]).filter(event=>baseline(event.scenario)&&event.operation === "browser_snapshot"&&event.cookieName===cookie.name&&event.cookieDomain===cookie.domain&&event.cookiePath===cookie.path&&!event.partitionKey);
      const known=events.length>0&&events.every(event=>event.cookiePurpose===events[0]!.cookiePurpose)?events[0]!.cookiePurpose:"unknown";
      baseItems.push({kind:"cookie",name:cookie.name,cookieScope:{domain:cookie.domain,path:cookie.path},purpose:known,dataOrigin:"unknown",basis:known === "unknown"?"runtime_only":"canonical_registry",evidenceRefs:[snapshot.artifactId,retained.id],reason:known === "unknown"?"Cookie retained in a verified document-bound browser snapshot; runtime purpose remains unverified.":"Canonical cookie purpose retained for the exact name/domain/path identity in the bound browser snapshot."});
    }
  }
  const kindOrder={cookie:0,localStorage:1,sessionStorage:2};
  baseItems.sort((a,b)=>kindOrder[a.kind]-kindOrder[b.kind]||(a.name<b.name?-1:a.name>b.name?1:0));
  const items:RuntimeStoragePurposeV2["items"]=baseItems.map(item=>{
    if(item.kind === "cookie"){
      const scopes=new Set((bundle.cookieEvents??[]).filter(row=>baseline(row.scenario)&&row.documentUrl===documentUrl&&row.cookieName===item.name).map(row=>JSON.stringify([row.cookieDomain,row.cookiePath])));
      for(const scope of snapshotScopes.get(item.name)??[])scopes.add(scope);
      if(item.cookieScope)scopes.add(JSON.stringify([item.cookieScope.domain,item.cookieScope.path]));
      for(const node of graph?.nodes??[])if(node.kind === "cookie"&&node.cookie?.name===item.name&&node.documentId&&graph!.nodes.some(doc=>doc.id===node.documentId&&doc.url===documentUrl))scopes.add(JSON.stringify([node.cookie.domain,node.cookie.path]));

      const onlyScope=scopes.size===1?JSON.parse([...scopes][0]!) as [string|undefined,string|undefined]:undefined;
      const domain=onlyScope?.[0]?.replace(/^\./,"");
      const firstParty=Boolean(domain&&(new URL(documentUrl).hostname===domain||new URL(documentUrl).hostname.endsWith(`.${domain}`)));
      const declarations=policyComplete&&firstParty&&scopes.size===1?documents.flatMap(document=>{
        const surface=bundle.policySurfaceObservations.find(surface=>`policy-text:${surface.observationId}`===document.evidenceRef);
        if(!surface||!["target_controller","first_party_brand"].includes(surface.targetRelationship??"")||createHash("sha256").update(document.text).digest("hex")!==document.textSha256)return [];
        return (surface.policyCookieDisclosures??[]).filter(row=>row.cookieName===item.name&&row.parserProvenance === "policy_cookie_table_dom.v1"&&row.confidence>=0.9).flatMap(row=>{
          if(typeof row.purpose!=="string"||!row.evidenceRef)return [];
          let sameUrl=false;try{sameUrl=new URL(row.sourceUrl??"").href===new URL(document.url).href;}catch{return [];}
          if(!sameUrl)return [];
          const text=`${row.cookieName} ${row.purpose}`,start=document.text.indexOf(text);
          if(start<0||document.text.indexOf(text,start+text.length)>=0)return [];
          const excerpt=text.slice(0,480);
          return [{purpose:classifyDeclaredCookiePurpose(row.purpose),declarationRef:row.evidenceRef,passage:{evidenceRef:document.evidenceRef,textSha256:document.textSha256,start,end:start+excerpt.length,excerpt}}];
        });
      }):[];
      const purposes=new Set(declarations.map(row=>row.purpose));
      return {...item,...(declarations.length&&purposes.size===1?{declaredPurpose:declarations[0]}:{})};
    }
    const observed=validReads.filter(read=>read.storageType===item.kind&&read.name===item.name&&read.outcome === "returned");
    const reads=observed.slice(0,8).map(read=>{
      const source=prior.retainedSources.find(source=>source.sourceKind === "loaded_script"&&source.scriptUrl===read.callerUrl&&source.documentId===read.documentId&&source.frameId===read.frameId&&source.facts.some(fact=>fact.kind === "storage_read_context"&&(fact.name===item.name||fact.keySource === "enumerated_storage_key")&&fact.storageType===item.kind&&withinSourceCall(read,fact.callsite)));
      const fact=source?.facts.find(fact=>fact.kind === "storage_read_context"&&(fact.name===item.name||fact.keySource === "enumerated_storage_key")&&fact.storageType===item.kind&&withinSourceCall(read,fact.callsite));
      return {evidenceRef:read.id,context:fact?.useContext??"unresolved" as const,...(source?{sourceSha256:source.sourceSha256}:{}),callerUrl:read.callerUrl,line:read.line,column:read.column,valueState:read.valueState,count:read.count};
    });
    const limited=!trace||trace.limitReached||observed.length>8||validReads.length!==trace.observations.length;
    const cleanup=reads.some(read=>read.context === "storage_cleanup_check")&&reads.every(read=>["storage_cleanup_check","storage_enumeration"].includes(read.context));
    return {...item,readUse:{coverageLimited:limited,status:reads.length?"observed":limited?"limited":"not_observed_in_window",reads,
      reason:cleanup?"Observed reads enumerate browser storage or perform a cleanup check. The technical uses are identified; the business reason for retaining referrer data remains unresolved.":reads.length?"Storage reads and their retained source context are recorded; business purpose and successful transmission remain separate.":limited?"The bounded read trace is incomplete or unavailable; no absence-of-use conclusion is supported.":"No matching application read was retained during this starting-page window; later use remains unassessed."}};
  });
  return runtimeStoragePurposeV2Schema.parse({...prior,contractVersion:"certscore.runtime-storage-purpose.v2",inventoryLimited,...(trace?{retainedReadTrace:trace}:{}),items});
}
function withinSourceCall(read:{line:number;column:number},site:{line:number;column:number;endLine:number;endColumn:number}|undefined){
  return Boolean(site&&read.line>=site.line&&read.line<=site.endLine&&(read.line!==site.line||read.column>=site.column)&&(read.line!==site.endLine||read.column<site.endColumn));
}
