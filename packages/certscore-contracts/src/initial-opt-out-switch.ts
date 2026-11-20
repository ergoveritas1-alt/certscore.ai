import {z} from "zod";

export const initialOptOutSwitchSchema=z.object({
  version:z.literal("inmobi_choice.initial_opt_out_switch.v1"),
  scope:z.enum(["sale","sharing"]), label:z.string().max(120),
  labelCandidateId:z.string().regex(/^candidate_[0-9]{1,3}$/),
  frameSlot:z.literal(0), labelFrameSlot:z.literal(0), binding:z.literal("same_visible_row"),
}).strict().superRefine((p,ctx)=>{
  if (initialOptOutSwitchScope(p.label)!==p.scope) ctx.addIssue({code:"custom",message:"Exact visible row label must name this switch's purpose."});
});
export type InitialOptOutSwitch=z.infer<typeof initialOptOutSwitchSchema>;
const originalSwitchPoint = z.tuple([z.number().finite(), z.number().finite()]);
export const originalInitialOptOutSwitchesSchema = z.object({
  version: z.literal("original_initial_opt_out_switches.v1"),
  documentUrl: z.string().url().max(500),
  documentToken: z.string().min(1).max(160),
  observedAtMs: z.number().int().nonnegative(),
  rows: z.array(z.object({
    scope: z.enum(["sale", "sharing"]), label: z.string().min(1).max(120),
    switchCenter: originalSwitchPoint, labelCenter: originalSwitchPoint,
  }).strict()).min(1).max(2),
}).strict().superRefine((packet, ctx) => {
  if (!/^https?:\/\//.test(packet.documentUrl) ||
      new Set(packet.rows.map(row => row.scope)).size !== packet.rows.length ||
      packet.rows.some(row => initialOptOutSwitchScope(row.label) !== row.scope ||
        row.switchCenter[0] <= row.labelCenter[0] || packet.rows.some(peer => peer !== row &&
          peer.switchCenter.every((value, i) => value === row.switchCenter[i])))) {
    ctx.addIssue({code: "custom", message: "The original document must retain distinct, visible opt-out rows."});
  }
});
export type OriginalInitialOptOutSwitches = z.infer<typeof originalInitialOptOutSwitchesSchema>;
export function initialOptOutSwitchScope(value:unknown): "sale"|"sharing"|undefined {
  if(typeof value!=="string" || value.length>120) return;
  const label=value.trim().replace(/\s+/g," ").toLowerCase();
  if(label==="i want to opt-out of the sale of my personal data.") return "sale";
  if(label==="i want to opt-out of the sharing of my personal data.") return "sharing";
}
const record=(value:unknown):Record<string,unknown>=>value && typeof value==="object" && !Array.isArray(value) ? value as Record<string,unknown> : {};
function visibleBox(row:Record<string,unknown>,url:string) {
  const style=record(row.computedStyle),frame=record(row.frameContext),box=record(row.boundingBox);
  if (frame.frameKind!=="main_frame" || frame.frameUrl!==url || row.layer!=="first_layer" || row.enabled!==true ||
      row.intersectsViewport!==true || row.clippedByScrollableAncestor!==false || record(row.occlusion).center!==true ||
      style.visibility!=="visible" || typeof style.display!=="string" || style.display==="none" || !(Number(style.opacity)>0) ||
      typeof style.pointerEvents!=="string" || style.pointerEvents==="none" ||
      typeof box.x!=="number" || !Number.isFinite(box.x) || typeof box.y!=="number" || !Number.isFinite(box.y) ||
      typeof box.height!=="number" || !Number.isFinite(box.height) || box.height<=0 ||
      typeof box.width!=="number" || !Number.isFinite(box.width) || box.width<=0) return;
  return {x:box.x,y:box.y,h:box.height,w:box.width};
}
/** Observation-only visual row binding; duplicate document IDs do not assign accessible names. */
export function verifiedInitialOptOutSwitch(raw:unknown,ordinal:number,url:string):InitialOptOutSwitch|undefined {
  const geometry=record(raw),rows=geometry.candidates;
  if(!Array.isArray(rows) || rows.length>160 || !Array.isArray(geometry.containers) ||
     !geometry.containers.some(c=>record(c).selectorHint==="#qc-cmp2-usp" && record(c).role==="dialog" && record(c).layer==="first_layer" &&
       record(c).intersectsViewport===true)) return;
  const row=record(rows[ordinal]), parsed=initialOptOutSwitchSchema.safeParse(row.initialOptOutSwitch);
  if(!parsed.success || row.candidateId!==`candidate_${ordinal}` || row.selectorHint==null || row.role!=="switch" || row.tagName!=="button" ||
      row.actionType!=="other" || row.decisionStatus!=="ambiguous" || row.semanticallyInteractive!==true ||
      row.presentationType!=="dedicated_button" || row.consentContextConfirmed!==true ||
      [row.ariaLabel,row.title,row.value].some(s=>s!=null && s!=="" && s!==parsed.data.label)) return;
  const labelOrdinal=Number(parsed.data.labelCandidateId.slice(10)),label=record(rows[labelOrdinal]);
  if(row.candidateId===label.candidateId || label.candidateId!==parsed.data.labelCandidateId ||
      label.tagName!=="label" || label.semanticallyInteractive!==false || label.label!==parsed.data.label ||
      rows.filter(r=>record(record(r).initialOptOutSwitch).labelCandidateId===parsed.data.labelCandidateId).length!==1) return;
  const a=visibleBox(row,url),b=visibleBox(label,url);
  if(!a || !b || b.x+b.w>a.x+1 || a.x-(b.x+b.w)>240 ||
      Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y)<Math.min(a.h,b.h)*0.5) return;
  return parsed.data;
}
