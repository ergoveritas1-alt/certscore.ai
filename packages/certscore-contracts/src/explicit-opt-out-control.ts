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

/** Names the purpose on the control itself, excluding policy prose and generic settings. */
export const PRIVACY_CHOICE_ENTRANCE_LABEL_PATTERN = /^(?:do not (?:sell(?: or share)?|share) my personal (?:information|info)|your (?:california )?privacy choices)$/i;
export function namesPrivacyChoiceEntrance(label: string): boolean {
  return PRIVACY_CHOICE_ENTRANCE_LABEL_PATTERN.test(label.trim().replace(/\s+/g, " "));
}

export const EXPLICIT_SALE_SHARING_LAUNCHER_LABEL = /^do not sell or share my (?:(?:personal )?information|data|info)$/i;
export const standaloneSaleSharingAnchorSchema = z.object({
  version: z.literal("standalone_sale_sharing_anchor.v1"),
  binding: z.literal("main_document_fixed_end_inline_handler"),
}).strict();
export type StandaloneSaleSharingAnchor = z.infer<typeof standaloneSaleSharingAnchorSchema>;

/** Observed purpose and the accessible description of opening a dialog.
 * This predicate is separate from the executable recipe's name allowlist. */
export function namesOptOutSettingsEntrance(label: unknown, accessibleName: unknown): boolean {
  if (typeof label !== "string" || typeof accessibleName !== "string" ||
      label.length > 120 || accessibleName.length > 180) return false;
  const normalize = (text: string) => text.trim().toLowerCase().replace(/\s+/g, " ");
  const visible = normalize(label);
  const purpose = visible.replace(/ \/ customize settings$/, "");
  return namesPrivacyChoiceEntrance(purpose) &&
    suffixes.some(suffix => normalize(accessibleName) === visible + suffix);
}

export const originalOneTrustSettingsEntranceSchema = z.object({
  version: z.literal("original_onetrust_settings_entrance.v1"),
  selector: z.literal("#onetrust-pc-btn-handler"),
  documentUrl: z.string().url().max(500),
  documentToken: z.string().min(1).max(160),
  observedAtMs: z.number().int().nonnegative(),
  label: z.string().min(1).max(120),
  ariaLabel: z.string().min(1).max(180),
  testedPoints: z.literal(5),
  matchingPoints: z.number().int().min(3).max(5),
}).strict().refine(row => namesOptOutSettingsEntrance(row.label, row.ariaLabel),
  "The starting-document settings entrance requires its exact visible and accessible names.");

/** The quoted control is the object of an affirmative, complete instruction.
 * A purpose elsewhere in the same notice cannot qualify a different button. */
export function optOutSettingsNoticeSentence(label: unknown, notice: unknown): string | undefined {
  if (typeof label !== "string" || label.length > 120 ||
      typeof notice !== "string" || notice.length > 1600) return undefined;
  const normalizedLabel = label.trim().toLowerCase().replace(/\s+/g, " ");
  const rightsButton = normalizedLabel === "your privacy rights";
  if (!rightsButton && !namesPrivacyChoiceEntrance(label)) return undefined;
  const sentences = notice.trim().replace(/\s+/g, " ").match(/[^.!?]+(?:[.!?]|$)/g) ?? [];
  for (const part of sentences) {
    const sentence = part.trim();
    if (sentence.length > 320) continue;
    const normalized = sentence.toLowerCase().replace(/[“”]/g, '"');
    if (rightsButton && normalized === "by clicking the button on the right, you can exercise your privacy rights (such as a right to opt-out of the use of certain cookies or to opt-out of the sharing of your personal information for the purposes of cross-contextual behavioral advertising).") return sentence;
    if (normalized === `click on "${normalizedLabel}" to customize your preferences.` ||
        normalized === `click on "x" or "accept all" to confirm that you agree to these practices, "${normalizedLabel}" to customize your preferences, or "reject non-necessary" to decline the use of certain cookies.`) return sentence;
  }
  return undefined;
}

export function namesNoticeBoundPrivacyRightsButton(label: unknown, accessibleName: unknown): boolean {
  if (typeof label !== "string" || typeof accessibleName !== "string") return false;
  const normalize = (text: string) => text.trim().toLowerCase().replace(/\s+/g, " ");
  return normalize(label) === "your privacy rights" &&
    suffixes.some(suffix => normalize(accessibleName) === "your privacy rights" + suffix);
}

export const settingsEntranceNoticeSchema = z.object({
  version: z.literal("onetrust.same_banner_notice.v1"),
  bannerSelector: z.literal("#onetrust-banner-sdk"),
  noticeSelector: z.literal("#onetrust-policy-text"),
  sentence: z.string().min(1).max(320),
}).strict();
export type SettingsEntranceNotice = z.infer<typeof settingsEntranceNoticeSchema>;

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
