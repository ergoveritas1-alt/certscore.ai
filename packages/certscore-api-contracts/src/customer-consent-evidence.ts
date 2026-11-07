import {z} from 'zod';
const text=z.string().max(240),state=z.enum(['observed','not_observed','unknown']);
export const customerConsentEvidenceSchema=z.object({
 version:z.literal('certscore.customer-consent-evidence.v1'),
 binding:z.object({scanId:z.string().uuid(),createdAt:z.string().datetime(),reportVersion:text,reportSourceHash:z.string().regex(/^[a-f0-9]{64}$/)}).strict(),
 status:z.enum(['available','unavailable']),reason:text,
 assessment:z.object({version:z.enum(['2.0','2.1','2.2']),sourceHash:z.string().regex(/^fnv1a-[0-9a-f]{8}$/),computedAt:z.string().datetime(),coverage:z.enum(['complete','limited','none','not_applicable'])}).strict().optional(),
 controls:z.array(z.object({id:z.enum(['accept','reject','options','privacyOptOut']),state,layer:z.enum(['first_layer','deeper_layer','unknown']),inspection:z.object({policy:text,status:z.enum(['complete','limited'])}).strict().nullable(),firstObservedAtMs:z.number().int().nonnegative().nullable(),lastObservedAtMs:z.number().int().nonnegative().nullable()}).strict()).max(4),
 criteria:z.array(z.object({id:text,status:text,sourceIds:z.array(text).max(4),sourceIdCount:z.number().int().nonnegative(),sourceIdsTruncated:z.boolean()}).strict()).max(16),
 checklist:z.array(z.object({id:z.enum(['cmp_framework_signal_observed','consent_optional_defaults_on']),evidenceState:text,assessmentStatus:text}).strict()).max(2),
}).strict().superRefine((p,ctx)=>{
 const fail=(message:string)=>ctx.addIssue({code:z.ZodIssueCode.custom,message});
 if(p.status==='available'&&(!p.assessment||p.controls.length!==4))fail('Available packet needs persisted assessment and four controls');
 if(p.status==='unavailable'&&(p.assessment||p.controls.length||p.criteria.length||p.checklist.length))fail('Unavailable packet cannot supply values');
 for(const rows of [p.controls,p.criteria,p.checklist])if(new Set(rows.map(r=>r.id)).size!==rows.length)fail('Duplicate customer evidence identity');
 for(const c of p.criteria)if(c.sourceIdCount<c.sourceIds.length||c.sourceIdsTruncated!==(c.sourceIdCount>c.sourceIds.length))fail('Criterion source cap mismatch');
 for(const c of p.controls)if(c.firstObservedAtMs!==null&&c.lastObservedAtMs!==null&&c.firstObservedAtMs>c.lastObservedAtMs)fail('Reversed control observation time');
});
