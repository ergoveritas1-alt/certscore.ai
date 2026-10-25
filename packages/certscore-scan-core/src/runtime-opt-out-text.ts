import {domOptOutSearchSchema,GATE_RUNTIME_TEXT_PAGE,GATE_RUNTIME_TEXT_TARGET} from '@certscore/contracts';
import {captureDocumentBoundValue,type DocumentBoundCapture,type DocumentCaptureBinding} from './document-bound-capture';
import {retainDomOptOutSearch} from './dom-opt-out-label';

export type RuntimeTextCapture=DocumentBoundCapture<string>&{documentReadyState:string;documentLanguage?:string};
/** Wrap the already scheduled renderer operation. Cached before/after bindings
 * are sampled when it resolves, not when a later Promise.all result is awaited. */
export async function captureBoundRuntimeTextSnapshot<T extends {domText:string;pageUrl:string;documentReadyState:string;documentLanguage?:string}>(input:{
 capture:()=>Promise<T>;readBinding:()=>DocumentCaptureBinding;scanStartedAtMs:number;now?:()=>number;
}):Promise<T&{domTextCapture:RuntimeTextCapture}>{
 const bound=await captureDocumentBoundValue(input);
 return {...bound.value,domTextCapture:{value:bound.value.domText,url:bound.url,capturedAtMs:bound.capturedAtMs,
  documentIdentity:bound.value.pageUrl===bound.url?bound.documentIdentity:undefined,documentReadyState:bound.value.documentReadyState,documentLanguage:bound.value.documentLanguage}};
}
/** Only new, parsed, bound Gate baseline reads can produce this observation.
 * A later metadata token can invalidate this proof, never supply its binding. */
export function retainRuntimeOptOutSearch(capture:RuntimeTextCapture|undefined,targetUrl:string,retainedText:string){
 if(!capture||targetUrl!==GATE_RUNTIME_TEXT_TARGET||capture.url!==GATE_RUNTIME_TEXT_PAGE||capture.value!==retainedText||
  !['interactive','complete'].includes(capture.documentReadyState))return;
 const body=retainDomOptOutSearch(capture,'dom_text_pre_consent');if(!body||body.version!=='dom_opt_out_search.v2')return;
 const possibleChoice=/opt[ -]?out|privacy choices|Global Privacy Control|Do Not Track|\bGPC\b/i.test(capture.value);
 const parsed=domOptOutSearchSchema.safeParse({...body,result:body.result==='no_qualifying_signal'&&possibleChoice?'ambiguous_hint':body.result,
  version:'dom_opt_out_search.v3',sourceLane:'runtime_evidence',targetUrl,
  documentReadyState:capture.documentReadyState,documentLanguage:capture.documentLanguage?.trim().toLowerCase()});
 return parsed.success?parsed.data:undefined;
}
