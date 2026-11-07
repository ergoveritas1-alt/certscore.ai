import {z} from 'zod';

export const EXPLICIT_OPT_OUT_CONTROL_POLICY = 'explicit_opt_out_controls.v1' as const;
export const BOUND_OPT_OUT_RECIPE = 'onetrust.explicit_sale_share.v3-bound-controls' as const;
const labels = ['your privacy choices', 'privacy choices', 'do not sell or share my personal information', 'do not sell or share', 'do not sell my personal information'];
const suffixes = [', opens the preference center dialog', ', opens preference center dialog'];

/** Exact reviewed entrance names only; never strip arbitrary accessible-name text. */
export function explicitOptOutEntranceName(value: string): string | undefined {
  const name=value.trim().toLowerCase().replace(/\s+/g,' ');
  return labels.find(label=>name===label || suffixes.some(suffix=>name===label+suffix));
}

export const boundOptOutControlSchema=z.object({
  version:z.literal(EXPLICIT_OPT_OUT_CONTROL_POLICY),
  recipeVersion:z.literal(BOUND_OPT_OUT_RECIPE),
  selector:z.enum(['button.ot-sdk-show-settings','a.ot-sdk-show-settings','button#onetrust-pc-btn-handler']),
  accessibleLabel:z.string().min(1).max(120),
  href:z.literal('#').optional(),
}).strict().superRefine((row,ctx)=>{
  if(!explicitOptOutEntranceName(row.accessibleLabel) || (row.selector.startsWith('a.') ? row.href!=='#' : row.href!==undefined))
    ctx.addIssue({code:'custom',message:'Bound opt-out control needs its reviewed label and on-page route.'});
});
export type BoundOptOutControl=z.infer<typeof boundOptOutControlSchema>;

/** Uses only the already returned DOM.describeNode attributes. No extra reads. */
export function boundOptOutControlFromAttributes(tag:string,attributes:unknown,label:unknown):BoundOptOutControl|undefined {
  if(!['button','a'].includes(tag)||typeof label!=='string'||label.length>120||!explicitOptOutEntranceName(label)||
    !Array.isArray(attributes)||attributes.length>128||attributes.length%2)return undefined;
  const attrs=new Map<string,string>();
  for(let i=0;i<attributes.length;i+=2){
    const key=attributes[i],value=attributes[i+1];
    if(typeof key!=='string'||typeof value!=='string'||attrs.has(key))return undefined;
    if(['id','class','href','target','download','form','type'].includes(key))attrs.set(key,value);
  }
  const classes=attrs.get('class')??'';
  const banner=tag==='button'&&attrs.get('id')==='onetrust-pc-btn-handler';
  if(classes.length>512||(!banner&&!classes.split(/\s+/).includes('ot-sdk-show-settings'))||attrs.has('form')||attrs.get('type')?.toLowerCase()==='submit')return undefined;
  if(tag==='a'&&(attrs.get('href')!=='#'||attrs.has('target')||attrs.has('download')))return undefined;
  return boundOptOutControlSchema.parse({version:EXPLICIT_OPT_OUT_CONTROL_POLICY,recipeVersion:BOUND_OPT_OUT_RECIPE,
    selector:banner?'button#onetrust-pc-btn-handler':`${tag}.ot-sdk-show-settings`,accessibleLabel:label,...(tag==='a'?{href:'#'}:{})});
}
