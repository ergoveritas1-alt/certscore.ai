import {createHash} from 'node:crypto';

type Slot='requested'|'scheduled'|'blocked_request'|'request';
type Candidate={url:string;atMs:number;actionAtMs:number;sourceDocumentSha256:string;isMainFrame:boolean;reason?:string;method?:string;requestId?:string;redirectedRequestId?:string};
const reasons=new Set(['formSubmissionGet','formSubmissionPost','httpHeaderRefresh','scriptInitiated','metaTagRefresh','pageBlockInterstitial','reload','anchorClick']);

/** Passive CDP metadata only. Does not authorize or continue any request. */
export class RedHatNavigationRecorder {
 private entries:Partial<Record<Slot,unknown>>={};private checks=0;private spent=0;private limited=false;
 record(slot:Slot,c:Candidate){
  if(this.entries[slot]||this.checks>=32||this.spent>=10){this.limited ||= this.checks>=32||this.spent>=10;return;}
  this.checks++;const start=performance.now();
  try{
   if(!Number.isFinite(c.atMs)||!Number.isFinite(c.actionAtMs)||c.atMs<c.actionAtMs||!/^[a-f0-9]{64}$/.test(c.sourceDocumentSha256))return;
   if(typeof c.url!=='string'||c.url.length>4096){this.limited=true;return;}
   const parsed=new URL(c.url),safe=parsed.protocol==='https:'&&!parsed.username&&!parsed.password;
   const path=safe&&parsed.pathname.length<=512?parsed.origin+parsed.pathname:null;
   const entry={atMs:c.atMs,actionAtMs:c.actionAtMs,sourceDocumentSha256:c.sourceDocumentSha256,isMainFrame:c.isMainFrame,
    destination:path,exactDestination:safe&&!parsed.search&&!parsed.hash?path:null,
    queryPresent:Boolean(parsed.search),fragmentPresent:Boolean(parsed.hash),urlSha256:createHash('sha256').update(c.url).digest('hex'),
    reason:c.reason?(reasons.has(c.reason)?c.reason:'unsupported'):undefined,
    method:c.method?(['GET','POST','HEAD'].includes(c.method)?c.method:'other'):undefined,
    requestId:c.requestId?.slice(0,80),redirectedRequestId:c.redirectedRequestId?.slice(0,80)};
   const next={...this.entries,[slot]:entry};
   if(Buffer.byteLength(JSON.stringify({entries:next}),'utf8')>1800){this.limited=true;return;}
   this.entries=next;
  }catch{this.limited=true;}finally{this.spent+=performance.now()-start;}
 }
 snapshot(){return {version:'redhat.post-click-navigation.v1',entries:this.entries,checks:this.checks,processingMs:Math.ceil(this.spent),limited:this.limited||this.spent>=10};}
}
