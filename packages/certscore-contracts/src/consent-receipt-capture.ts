import {z} from 'zod';
import type {RefinementCtx} from 'zod';

const hash=z.string().regex(/^[a-f0-9]{64}$/);
const time=z.number().int().nonnegative();
export const receiptFactSchema=z.object({pathSha256:hash, value:z.union([z.boolean(),z.enum(['yes','no','allow','deny','ACCEPT','DENY','granted','denied','mixed','unknown','active','inactive','always active'])])}).strict();
export const consentReceiptObservationSchema=z.object({
  phase:z.enum(['baseline','initial','terminal']),source:z.enum(['cookie','write','api','api_partial','configuration']),
  keySha256:hash,identitySha256:hash.optional(),valueSha256:hash.optional(),
  readAtEpochMs:time,available:z.boolean(),cookieMultiplicity:z.enum(['none','unique','ambiguous']).optional(),
  format:z.enum(['cookieyes','cookiebot','onetrust_groups','json','scalar','opaque','api','api_partial','configuration']),
  facts:z.array(receiptFactSchema).max(16), factsLimited:z.boolean(), omittedFields:z.number().int().min(0).max(4096),
  writeObservedAtEpochMs:z.number().finite().nonnegative().optional(),writeSequence:z.number().int().nonnegative().optional(),
  storageType:z.enum(['cookie','local_storage','session_storage']).optional(),
  provider:z.enum(['cookie_information','cookiescript','finsweet','didomi','termly','transcend','borlabs','osano','hubspot','drupal_eu_cookie','onetrust']).optional(),
  apiReadKind:z.enum(['get_state','saved_event']).optional(),readbackMatched:z.boolean().optional(),
  decision:z.enum(['granted','denied','mixed','unknown']).optional(),configurationSha256:hash.optional(),sdkSourceSha256:hash.optional(),
  eventSequence:z.number().int().nonnegative().optional(),eventObservedAtEpochMs:z.number().finite().nonnegative().optional(),
}).strict().superRefine((row,ctx)=>{
  if(row.source==='cookie'&&(!row.cookieMultiplicity||(row.available&&!row.identitySha256)))ctx.addIssue({code:'custom',message:'Cookie observations require explicit multiplicity and exact readback identity.'});
  if(!row.available&&(row.valueSha256||row.facts.length))ctx.addIssue({code:'custom',message:'Unavailable reads cannot carry receipt facts.'});
  if(row.eventObservedAtEpochMs!==undefined&&row.eventObservedAtEpochMs>row.readAtEpochMs)ctx.addIssue({code:'custom',message:'Events cannot occur after their read.'});
  if(row.writeObservedAtEpochMs!==undefined&&row.writeObservedAtEpochMs>row.readAtEpochMs)ctx.addIssue({code:'custom',message:'Writes cannot occur after their read.'});
});
/** Retained observations, never an independent consent witness. Raw receipt IDs,
 * free-form values and category names are excluded; paths are SHA-256 encoded. */
export const consentReceiptCaptureSchema=z.object({
  policyVersion:z.literal('consent_receipt_capture.v1'),diagnosticOnly:z.literal(true),
  scanId:z.string().min(1).max(160),action:z.enum(['accept','reject']),authorizedTargetSha256:hash,
  frameIdentitySha256:hash.optional(),clockOriginAtEpochMs:time,actionDispatchedAtEpochMs:time,
  frozenAtEpochMs:time,documentStable:z.boolean(),cancelled:z.boolean(),
  observationsTruncated:z.boolean(),processingLimited:z.boolean(),
  observations:z.array(consentReceiptObservationSchema).max(8),
}).strict().superRefine((value,ctx)=>{
  if(new TextEncoder().encode(JSON.stringify(value)).byteLength>8192)ctx.addIssue({code:'custom',message:'Receipt capture exceeds the 8192-byte evidence cap.'});
  if((!value.documentStable||value.cancelled)&&value.observations.length)ctx.addIssue({code:'custom',message:'Invalidated capture cannot retain session-bound observations.'});
  for(const row of value.observations){
    if(row.readAtEpochMs<value.clockOriginAtEpochMs||row.readAtEpochMs>value.frozenAtEpochMs||
      (row.phase==='baseline'?row.readAtEpochMs>value.actionDispatchedAtEpochMs:row.readAtEpochMs<value.actionDispatchedAtEpochMs))ctx.addIssue({code:'custom',message:'Receipt phase/time must join the same action window.'});
  }
});
export type ConsentReceiptCapture=z.infer<typeof consentReceiptCaptureSchema>;
export type ConsentReceiptObservation=z.infer<typeof consentReceiptObservationSchema>;
export function validateConsentReceiptCapture(value:ConsentReceiptCapture|undefined,input:{
  artifactVersion:string;scanId:string;action:'accept'|'reject';targetSha256?:string;frameIdentitySha256?:string;
  dispatchedAtMs?:number;readyAtMs:number;completedAt:string;clickOutcome?:string;
},ctx:RefinementCtx){
  if(!value)return;
  const origin=Date.parse(input.completedAt)-input.readyAtMs;
  if(!input.artifactVersion.endsWith('.v2')||value.scanId!==input.scanId||value.action!==input.action||
    value.authorizedTargetSha256!==input.targetSha256||value.frameIdentitySha256!==input.frameIdentitySha256||
    input.clickOutcome!=='completed'||input.dispatchedAtMs===undefined||value.clockOriginAtEpochMs!==origin||
    value.actionDispatchedAtEpochMs!==origin+input.dispatchedAtMs||value.frozenAtEpochMs>Date.parse(input.completedAt))
    ctx.addIssue({code:'custom',path:['consentReceiptCapture'],message:'Receipt capture must bind to this exact completed action, target, frame, scan and clock.'});
}
