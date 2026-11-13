import {z} from 'zod';

/** Reviewed writer protocol, not a claim of live script byte verification. */
export const OSANO_RECEIPT_PROTOCOL_SHA256 = '15e57f9e4a2e7a53de50e60783790b28e4f9db707f219ca2207e1cdb955ba268' as const;
export const OSANO_RECEIPT_CATEGORIES = ['ANALYTICS','MARKETING','PERSONALIZATION'] as const;
const choice=z.enum(['ACCEPT','DENY']);
const hash=z.string().regex(/^[a-f0-9]{64}$/),time=z.number().int().nonnegative();
export const osanoReceiptEvidenceSchema=z.object({
  policyVersion:z.literal('osano_complete_cookie_receipt.v1'),protocolSourceSha256:z.literal(OSANO_RECEIPT_PROTOCOL_SHA256),
  writeBinding:z.literal('exact_document_cookie_assignment'),scope:z.literal('non_tcf_optional_categories'),
  documentSha256:hash,configurationSha256:hash,cookieIdentitySha256:hash,stateSha256:hash,
  baselineCapturedAtEpochMs:time,baselineWriteSequence:time,writeSequence:time,
  writtenAtEpochMs:time,consentTimestamp:time,readAtEpochMs:time,
  categories:z.object({ANALYTICS:choice,MARKETING:choice,PERSONALIZATION:choice,ESSENTIAL:z.literal('ACCEPT'),STORAGE:choice,OPT_OUT:choice}).strict(),
}).strict().superRefine((p,ctx)=>{
  if(p.writeSequence<=p.baselineWriteSequence||p.baselineCapturedAtEpochMs>p.consentTimestamp||
    p.consentTimestamp>p.writtenAtEpochMs||p.writtenAtEpochMs>p.readAtEpochMs)
    ctx.addIssue({code:z.ZodIssueCode.custom,message:'Osano requires ordered fresh receipt and exact write evidence.'});
});
export type OsanoReceiptEvidence=z.infer<typeof osanoReceiptEvidenceSchema>;
export function osanoReceiptDecision(p:Pick<OsanoReceiptEvidence,'categories'>){
  return OSANO_RECEIPT_CATEGORIES.every(k=>p.categories[k]==='ACCEPT')?'granted' as const:
    OSANO_RECEIPT_CATEGORIES.every(k=>p.categories[k]==='DENY')?'denied' as const:'mixed' as const;
}
export function validateOsanoReceiptEnvelope(p:OsanoReceiptEvidence|undefined,e:{startedAt:string;completedAt:string;dispatchedAtMs?:number;observedAtMs?:number;frameIdentitySha256?:string;cmpId?:string},ctx:z.RefinementCtx){
  if(!p)return;const start=Date.parse(e.startedAt),click=start+(e.dispatchedAtMs??NaN);
  if(e.cmpId!=='Osano'||p.documentSha256!==e.frameIdentitySha256||!Number.isFinite(click)||
    p.baselineCapturedAtEpochMs<start||p.baselineCapturedAtEpochMs>click||p.consentTimestamp<click||p.writtenAtEpochMs<click||
    p.readAtEpochMs>Date.parse(e.completedAt)||e.observedAtMs===undefined||start+e.observedAtMs!==p.writtenAtEpochMs)
    ctx.addIssue({code:z.ZodIssueCode.custom,path:['decisionEvidence'],message:'Osano receipt must bind the verified document, control and dispatched action.'});
}
export function validateOsanoReceiptProjection(p:OsanoReceiptEvidence|undefined,b:{packetSha256?:string;actionControlProof?:{cmpId?:string;frameIdentitySha256?:string}},ctx:z.RefinementCtx){
  if(p&&(!b.packetSha256||b.actionControlProof?.cmpId!=='Osano'||p.documentSha256!==b.actionControlProof.frameIdentitySha256))
    ctx.addIssue({code:z.ZodIssueCode.custom,message:'Osano receipt projection requires its verified packet and control binding.'});
}

/** Bounded XXTEA receipt decoding. Encryption is an encoding, not authenticity:
 * callers must verify the exact browser write and source/readback separately. */
export function decodeOsanoReceipt(value:string,domain:string):{categories:OsanoReceiptEvidence['categories'];consentTimestamp:number}|undefined{
  if(value.length<12||value.length>2048||!/^[-_A-Za-z0-9]+={0,2}$/.test(value)||value.length%4||
    domain.length>253||!/^[a-z0-9.-]+$/.test(domain))return;
  try{
    const binary=atob(value.replace(/-/g,'+').replace(/_/g,'/'));
    if(binary.length<8||binary.length%4||btoa(binary).replace(/\+/g,'-').replace(/\//g,'_')!==value)return;
    const bytes=Uint8Array.from(binary,c=>c.charCodeAt(0)),view=new DataView(bytes.buffer),words=new Uint32Array(bytes.length/4);
    for(let i=0;i<words.length;i++)words[i]=view.getUint32(i*4,true);
    const keyBytes=new Uint8Array(16);keyBytes.set(new TextEncoder().encode(domain).slice(0,16));
    const kv=new DataView(keyBytes.buffer),key=Array.from({length:4},(_,i)=>kv.getUint32(i*4,true));
    const delta=0x9e3779b9,rounds=6+Math.floor(52/words.length);let sum=(rounds*delta)>>>0,y=words[0]!;
    for(let round=0;round<rounds;round++){
      const e=(sum>>>2)&3;
      for(let p=words.length-1;p>=0;p--){
        const z=words[(p+words.length-1)%words.length]!;
        const mix=(((z>>>5)^(y<<2))+((y>>>3)^(z<<4)))^((sum^y)+(key[(p&3)^e]!^z));
        y=words[p]=(words[p]!-mix)>>>0;
      }
      sum=(sum-delta)>>>0;
    }
    for(let i=0;i<words.length;i++)view.setUint32(i*4,words[i]!,true);
    let end=bytes.length;while(end&&bytes[end-1]===0)end--;
    const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes.subarray(0,end));
    // JSON.parse alone silently accepts duplicate fields. Reject them at every
    // object depth before projecting the fixed receipt schema.
    const stack:Array<Set<string>|null>=[];
    for(let i=0;i<text.length;i++){
      const c=text[i];if(c==='{'){stack.push(new Set());continue;}if(c==='['){stack.push(null);continue;}
      if(c==='}'||c===']'){stack.pop();continue;}if(c!=='"')continue;
      const start=i++;for(;i<text.length;i++){if(text[i]==='\\'){i++;continue;}if(text[i]==='"')break;}
      let next=i+1;while(next<text.length&&/\s/.test(text[next]!))next++;
      if(text[next]!==':')continue;const name=JSON.parse(text.slice(start,i+1)),keys=stack.at(-1);
      if(keys){if(keys.has(name))return;keys.add(name);}
    }
    // The writer always merges its IAB serializer, even with TCF disabled.
    // Only the exact empty skeleton is supported; any purpose/vendor decision,
    // consent string, disclosure or unknown extension requires a TCF adapter.
    const empty=z.object({}).strict();
    const emptyIab=z.object({v2:z.object({p:z.object({c:empty,li:empty}).strict(),
      v:z.object({c:empty,li:empty}).strict(),vd:empty.optional()}).strict(),euconsent:z.literal('').optional()}).strict();
    const parsed=z.object({consent:z.object({ANALYTICS:choice,MARKETING:choice,PERSONALIZATION:choice,
      ESSENTIAL:z.literal('ACCEPT'),STORAGE:choice,OPT_OUT:choice,extUsrData:z.literal('').optional(),iab:emptyIab.optional()}).strict(),consentTimestamp:time.positive()}).strict().safeParse(JSON.parse(text));
    if(!parsed.success)return;
    // The reviewed writer includes extUsrData even when cross-device identity
    // is empty. Nonempty identity and unknown extensions remain unsupported.
    const {extUsrData:_emptyIdentity,iab:_emptyIab,...categories}=parsed.data.consent;
    return {categories,consentTimestamp:parsed.data.consentTimestamp};
  }catch{return;}
}
