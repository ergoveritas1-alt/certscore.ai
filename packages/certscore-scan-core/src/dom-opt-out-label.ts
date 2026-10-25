import {classifyConsentGeometryAccess} from "./consent-geometry-access";
import {createHash} from "node:crypto";
import {domOptOutLabelSchema,domOptOutSearchSchema,isOptOutSearchAccessShell,findCurrentDomOptOutSignal} from "@certscore/contracts";
import type {DocumentBoundCapture} from "./document-bound-capture";
/** Reprocess the existing document-bound text read. No browser operation. */
export function retainDomOptOutLabel(capture:DocumentBoundCapture<string>,artifactId:string){
  if(capture.documentIdentity?.source!=="cdp_loader_id"||!capture.documentIdentity.token)return undefined;
  const text=capture.value.slice(0,100000),match=findCurrentDomOptOutSignal(text);if(!match)return undefined;
  const textSha256=createHash("sha256").update(text).digest("hex");
  const parsed=domOptOutLabelSchema.safeParse({version:"dom_opt_out_label.v2",artifactId,documentUrl:capture.url,
    documentToken:capture.documentIdentity.token,capturedAtMs:capture.capturedAtMs,textChars:text.length,label:match.label,scope:match.scope,scopeLabel:match.scopeLabel,
    ...(match.context?{contextPassage:{evidenceRef:`dom-text:${artifactId}`,textSha256,...match.context}}:{}),
    passage:{evidenceRef:`dom-text:${artifactId}`,textSha256,
      start:match.start,end:match.end,excerpt:match.label}});
  return parsed.success?parsed.data:undefined;
}

/** Same body read and original loader; reaching the existing text cap stays limited. */
export function retainDomOptOutSearch(capture:DocumentBoundCapture<string>,artifactId:string){
  if(capture.documentIdentity?.source!=="cdp_loader_id"||!capture.documentIdentity.token||!capture.value.trim())return undefined;
  const text=capture.value.slice(0,100000);
  const result=isOptOutSearchAccessShell(text)?'capture_unusable':findCurrentDomOptOutSignal(text)?'specific_signal':/^\s*(?:Opt[ -]?Out|Personali[sz]ed settings)\s*$/im.test(text)?'ambiguous_hint':'no_qualifying_signal';
  let publicBody=false;
  try {
    const url=new URL(capture.url);
    publicBody=['http:','https:'].includes(url.protocol)&&!url.username&&!url.password&&
      !/(?:^|\/)(?:login|log-in|signin|sign-in|sign_in|auth)(?:\/|$)/i.test(url.pathname)&&
      text.trim().length>=300&&(text.slice(0,4000).match(/\p{L}/gu)?.length??0)>=150&&
      classifyConsentGeometryAccess({pageUrl:capture.url,bodyText:text.slice(0,4000)}).status==='loaded'&&
      !isOptOutSearchAccessShell(text);
  }catch{ /* Unusable captures never supply the independent body basis. */ }
  const parsed=domOptOutSearchSchema.safeParse({version:'dom_opt_out_search.v2',artifactId,documentUrl:capture.url,
    bodyUsability:publicBody?'substantive_public_page':'unusable_or_unverified',
    documentToken:capture.documentIdentity.token,capturedAtMs:capture.capturedAtMs,textSha256:createHash('sha256').update(text).digest('hex'),
    textChars:text.length,truncated:capture.value.length>=100000,result});
  return parsed.success?parsed.data:undefined;
}
