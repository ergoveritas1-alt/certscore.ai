import {findAdvertisingDomChoice,matchAdvertisingDomChoice} from "./reviewed-opt-out-routes";
import {z} from "zod";
import {californiaPassageSchema} from "./california-clause-assessment";
/** A positive label in already-read visible body text, never control readiness,
 * effective choice, absence, or a cross-session document binding. */
export function findDomOptOutLabel(text:string,extended=false){
  if(text.length>100000)return undefined;
  const match=(extended?/^[ \t]*(Your (?:California )?Privacy Choices|Do(?: Not|n['’]t) (?:Sell(?: or Share)?|Share)(?: My (?:Personal )?(?:Information|Data|Info))?)[ \t]*$/im:/^[ \t]*(Your (?:California )?Privacy Choices|Do Not (?:Sell(?: or Share)?|Share) My (?:Personal )?(?:Information|Data|Info))[ \t]*$/im).exec(text);
  if(!match)return undefined;
  const label=match[1]!,start=match.index+match[0].indexOf(label);
  if(/\b(?:example|sample|hypothetical|unavailable|no longer|not available)\b/i.test(text.slice(Math.max(0,start-120),start)))return undefined;
  return {label,start,end:start+label.length};
}
export const domOptOutLabelSchema=z.object({
  version:z.enum(["dom_opt_out_label.v1","dom_opt_out_label.v2"]),artifactId:z.string().min(1).max(160),
  documentUrl:z.string().url().max(800),documentToken:z.string().min(1).max(160),capturedAtMs:z.number().int().nonnegative(),
  textChars:z.number().int().positive().max(100000),label:z.string().min(1).max(200),passage:californiaPassageSchema,
  scope:z.enum(["observed_page","personalized_advertising"]).optional(),scopeLabel:z.string().max(100).optional(),contextPassage:californiaPassageSchema.optional(),
}).strict().superRefine((row,ctx)=>{
  const current=row.version==="dom_opt_out_label.v2";
  const match=findDomOptOutLabel(row.passage.excerpt,current);
  const ads=current&&row.contextPassage?matchAdvertisingDomChoice(row.label,row.contextPassage.excerpt):undefined;
  if((!match&&!ads)||match&&match.label!==row.label||row.passage.excerpt!==row.label||
    (!current&&(row.scope||row.scopeLabel||row.contextPassage))||
    current&&(row.scope!==(ads?.scope??"observed_page")||row.scopeLabel!==(ads?.scopeLabel??"Observed page only"))||
    row.contextPassage&&(row.contextPassage.evidenceRef!==row.passage.evidenceRef||row.contextPassage.textSha256!==row.passage.textSha256||row.contextPassage.end>row.passage.start||row.passage.start-row.contextPassage.end>800)||row.passage.end>row.textChars||
    row.passage.evidenceRef!==`dom-text:${row.artifactId}`||new TextEncoder().encode(JSON.stringify(row)).length>1024)
    ctx.addIssue({code:"custom",message:"A DOM opt-out label must retain its own bounded text and document proof."});
});
export type DomOptOutLabel=z.infer<typeof domOptOutLabelSchema>;

export function findCurrentDomOptOutSignal(text:string){
 const named=findDomOptOutLabel(text,true);
 return named?{...named,scope:"observed_page" as const,scopeLabel:"Observed page only",context:undefined}:findAdvertisingDomChoice(text);
}
