import {createHash} from 'node:crypto';
import type {BrowserContext,Page,Frame,Locator} from 'playwright';
import {decodeOsanoReceipt,osanoReceiptEvidenceSchema,osanoReceiptDecision,OSANO_RECEIPT_PROTOCOL_SHA256,type ConsentConfirmationReason} from '@certscore/contracts';
import {captureExactCookieWrite} from './exact-cookie-write-capture.js';
import {receiptCaptureToken,retainReceiptCookies,retainReceiptWrites} from './consent-receipt-capture.js';
import type {ActionStateWrite,SemanticState} from './consent-action-semantic-state.js';
const sha=(s:string)=>createHash('sha256').update(s).digest('hex');
type Cookie=Awaited<ReturnType<BrowserContext['cookies']>>[number];
type Facts={url:string;source?:string;controlBound:boolean;writes:ActionStateWrite[];localValue?:string};
export type OsanoReceiptBaseline={documentUrl:string;configurationSha256:string;capturedAtEpochMs:number;lastSequence:number;
  beforeValueSha256?:string;beforeIdentitySha256?:string;attempts:number};
const identity=(c:Cookie)=>sha(JSON.stringify(['cookie_name_domain_path_partition',c.domain.toLowerCase().replace(/^\./,''),c.path,c.partitionKey??'',c.name]));

/** Serialized passive read. No SDK calls, injected globals or extra actions. */
function readFacts(control?:Element|void):Facts{
  const w=window as unknown as {__tcfapi?:unknown;Osano?:{cm?:{getConsent?:unknown}};
    __certscoreReadPostAcceptWrites?:()=>ActionStateWrite[];__certscoreReadPostRefusalWrites?:()=>ActionStateWrite[]};
  const writes=(w.__certscoreReadPostAcceptWrites??w.__certscoreReadPostRefusalWrites)?.().slice(-96)??[];
  let source:string|undefined,localValue:string|undefined;
  try{
    if(!Object.hasOwn(window,'__tcfapi')&&typeof w.Osano?.cm?.getConsent==='function'&&document.scripts.length<=96){
      const urls=Array.from(document.scripts).map(s=>s.src).filter(s=>/^https:\/\/cmp\.osano\.com\//.test(s));
      if(urls.length>0&&urls.length<=4&&new Set(urls).size===1&&/^https:\/\/cmp\.osano\.com\/[A-Za-z0-9_-]{1,80}\/[A-Za-z0-9-]{1,80}\/osano\.js$/.test(urls[0]!))source=urls[0];
    }
    const value=localStorage.getItem('osano_consentmanager');if(value!==null&&value.length<=2048)localValue=value;
  }catch{/* Missing source or unavailable readback cannot confirm. */}
  return {url:location.href,source,controlBound:Boolean(control?.isConnected&&control.closest('.osano-cm-window')),writes,localValue};
}
export async function captureOsanoReceiptBaseline(context:BrowserContext,scope:Page|Frame,control:Locator):Promise<OsanoReceiptBaseline|undefined>{
  const documentUrl=scope.url();
  const [facts,cookies]=await Promise.all([control.evaluate(readFacts).catch(()=>undefined),context.cookies(documentUrl).catch(()=>undefined)]);
  if(!facts?.source||!facts.controlBound||facts.url!==documentUrl||scope.url()!==documentUrl||!cookies)return;
  const matches=cookies.filter(c=>c.name==='osano_consentmanager');
  if(matches.length>1||matches.some(c=>c.httpOnly||c.partitionKey))return;
  return {documentUrl,configurationSha256:sha(facts.source),capturedAtEpochMs:Date.now(),lastSequence:Math.max(0,...facts.writes.map(w=>w.sequence)),attempts:0,
    ...(matches[0]?{beforeValueSha256:sha(matches[0].value),beforeIdentitySha256:identity(matches[0])}:{})};
}
export function verifyOsanoReceipt(input:{baseline:OsanoReceiptBaseline;facts:Facts;cookies:Cookie[];actionAt:number;readAt:number;onDiagnostic?:(r:ConsentConfirmationReason)=>void}):SemanticState|undefined{
  const fail=(r:ConsentConfirmationReason)=>{input.onDiagnostic?.(r);return undefined;};
  const {baseline:b,facts:f}=input;
  if(f.url!==b.documentUrl||b.capturedAtEpochMs>input.actionAt)return fail('sdk_document_changed');
  if(!f.source||sha(f.source)!==b.configurationSha256)return fail('configuration_changed');
  const cookies=input.cookies.filter(c=>c.name==='osano_consentmanager');
  if(cookies.length!==1)return fail(cookies.length?'receipt_ambiguous':'receipt_missing');
  const c=cookies[0]!,id=identity(c);
  if(c.httpOnly||c.partitionKey||c.path!=='/'||(b.beforeIdentitySha256&&id!==b.beforeIdentitySha256))return fail('receipt_identity_changed');
  if(sha(c.value)===b.beforeValueSha256)return fail('no_fresh_decision');
  // The latest cookie write must match; never borrow an older matching write
  // after a reversal/deletion or from another document or cookie scope.
  const write=[...f.writes].reverse().find(w=>w.storageType==='cookie'&&w.name===c.name);
  if(!write||write.sequence<=b.lastSequence||write.observedAtEpochMs<input.actionAt||write.observedAtEpochMs>input.readAt)return fail('no_fresh_decision');
  const exact=write.cookieAssignment&&write.documentUrl===b.documentUrl?captureExactCookieWrite({assignment:write.cookieAssignment,url:write.documentUrl,
    observedAtMs:Math.round(write.observedAtEpochMs),source:'main_document_setter'}):undefined;
  if(!exact||exact.identityHash!==id)return fail('receipt_identity_changed');
  if(write.value!==c.value||exact.valueHash!==sha(c.value)||f.localValue!==c.value)return fail('receipt_readback_mismatch');
  const decoded=decodeOsanoReceipt(c.value,c.domain.replace(/^\./,''));
  if(!decoded)return fail('receipt_format_unsupported');
  // Both the receipt's own save clock and our observed setter must be fresh.
  if(decoded.consentTimestamp<input.actionAt||decoded.consentTimestamp>write.observedAtEpochMs)return fail('no_fresh_decision');
  const proof=osanoReceiptEvidenceSchema.safeParse({policyVersion:'osano_complete_cookie_receipt.v1',protocolSourceSha256:OSANO_RECEIPT_PROTOCOL_SHA256,
    writeBinding:'exact_document_cookie_assignment',scope:'non_tcf_optional_categories',documentSha256:sha(b.documentUrl),configurationSha256:b.configurationSha256,
    cookieIdentitySha256:id,stateSha256:sha(c.value),baselineCapturedAtEpochMs:b.capturedAtEpochMs,baselineWriteSequence:b.lastSequence,writeSequence:write.sequence,
    writtenAtEpochMs:Math.round(write.observedAtEpochMs),consentTimestamp:decoded.consentTimestamp,readAtEpochMs:input.readAt,categories:decoded.categories});
  if(!proof.success)return fail('category_proof_invalid');
  return {key:c.name,stateHash:proof.data.stateSha256,observedAtEpochMs:proof.data.writtenAtEpochMs,decision:osanoReceiptDecision(proof.data),osanoReceiptEvidence:proof.data};
}
/** At most one fallback attempt per confirmation stage, two per action. */
export async function readVerifiedOsanoReceipt(context:BrowserContext,scope:Page|Frame,baseline:OsanoReceiptBaseline,actionAt:number,onDiagnostic?:(r:ConsentConfirmationReason)=>void){
  if(baseline.attempts++>=2)return;
  const token=receiptCaptureToken(scope),url=scope.url();
  const [facts,cookies]=await Promise.all([scope.evaluate(readFacts).catch(()=>undefined),context.cookies(url).catch(()=>undefined)]);
  if(!facts||!cookies||scope.url()!==url||url!==baseline.documentUrl)return;
  retainReceiptWrites(token,facts.writes);retainReceiptCookies(token,cookies,'osano_consentmanager');
  return verifyOsanoReceipt({baseline,facts,cookies,actionAt,readAt:Date.now(),onDiagnostic});
}
