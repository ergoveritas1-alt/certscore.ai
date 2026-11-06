import {z} from 'zod';
export const REDHAT_OPT_OUT_POLICY='bounded_sale_sharing_opt_out.v4-redhat-reload' as const;
export const REDHAT_OPT_OUT_RECIPE='trustarc.redhat_explicit_choice.v1' as const;
export const REDHAT_OPT_OUT_TARGET='https://redhat.com/' as const;
export const REDHAT_OPT_OUT_DOCUMENT='https://www.redhat.com/en' as const;
export const REDHAT_OPT_OUT_LABEL='Do Not Sell or Share My Personal Information' as const;
const hash=z.string().regex(/^[a-f0-9]{64}$/),ms=z.number().int().min(0).max(3000),id=z.string().min(1).max(200);
export const redHatOptOutAuthorizationSchema=z.object({version:z.literal('redhat.opt-out-source.v1'),sourceSha256:hash,observationId:id,documentUrl:z.literal(REDHAT_OPT_OUT_DOCUMENT),documentToken:id}).strict();
export const redHatChoiceReadSchema=z.object({phase:z.enum(['before','after','terminal']),atMs:ms,documentSha256:hash,
 status:z.enum(['observed','api_unavailable','invalid_response','document_changed','budget_exhausted','api_failed']),
 decision:z.object({source:z.enum(['implied','asserted']),selectedCategoryIndices:z.array(z.number().int().min(0).max(64)).min(1).max(16)}).strict().nullable(),
}).strict().superRefine((r,c)=>{const values=r.decision?.selectedCategoryIndices;if((r.status==='observed')!==Boolean(r.decision)||values&&(new Set(values).size!==values.length||values.includes(0)&&values.length!==1))c.addIssue({code:'custom',message:'Invalid bounded TrustArc read.'});});
export const redHatOptOutProofSchema=z.object({version:z.literal('redhat.opt-out-proof.v1'),source:redHatOptOutAuthorizationSchema,
 initialDocumentSha256:hash.nullable(),bindingVerified:z.boolean(),captureFinishedMs:ms,
 route:z.array(z.object({url:z.enum([REDHAT_OPT_OUT_TARGET,REDHAT_OPT_OUT_DOCUMENT]),requestId:id,redirectedRequestId:id.nullable(),status:z.number().int().min(100).max(599).optional()}).strict()).max(3),
 control:z.object({visibleLabel:z.literal(REDHAT_OPT_OUT_LABEL),accessibleLabel:z.literal(REDHAT_OPT_OUT_LABEL),dialogId:z.string().regex(/^pop-div3\d{1,32}$/),portalId:z.string().regex(/^pop-frame\d{1,32}$/),openShadow:z.boolean(),hitTargetVerified:z.literal(true)}).strict().nullable(),
 clickAtMs:ms.nullable(),reads:z.array(redHatChoiceReadSchema).max(3),followUpMs:ms,
 reload:z.object({requestId:id,networkId:id,sourceDocumentSha256:hash,replacementDocumentSha256:hash,requestedAtMs:ms,actionAtMs:ms,
  reason:z.literal('reload'),targetUrl:z.literal(REDHAT_OPT_OUT_DOCUMENT),method:z.literal('GET'),responseStatus:z.literal(200),committed:z.literal(true),
 }).strict().nullable(),
}).strict().superRefine((p,c)=>{
 if(new Set(p.reads.map(r=>r.phase)).size!==p.reads.length||p.reads.some((r,i)=>r.atMs>p.captureFinishedMs||i>0&&(r.atMs<p.reads[i-1]!.atMs||['before','after','terminal'].indexOf(r.phase)<=['before','after','terminal'].indexOf(p.reads[i-1]!.phase))))c.addIssue({code:'custom',message:'Choice read phases must be bounded and ordered.'});
 if(p.reload&&(p.reload.sourceDocumentSha256!==p.initialDocumentSha256||p.reload.sourceDocumentSha256===p.reload.replacementDocumentSha256||p.reload.actionAtMs!==p.clickAtMs||p.reload.requestedAtMs<p.reload.actionAtMs||p.reload.requestedAtMs-p.reload.actionAtMs>750))c.addIssue({code:'custom',message:'Reload must bind its original action and distinct replacement document.'});
});
export type RedHatOptOutProof=z.infer<typeof redHatOptOutProofSchema>;

/** A terminal category choice, not semantic sale/sharing proof or an earlier observation window. */
export function redHatTerminalChoiceConfirmed(p:RedHatOptOutProof):boolean {
 const [a,b,reload]=p.route,before=p.reads.find(r=>r.phase==='before'),after=p.reads.find(r=>r.phase==='after'),terminal=p.reads.find(r=>r.phase==='terminal'),r=p.reload;
 return Boolean(new Set(p.route.map(r=>r.requestId)).size===p.route.length&&p.bindingVerified&&p.control&&p.clickAtMs!==null&&p.initialDocumentSha256&&a?.url===REDHAT_OPT_OUT_TARGET&&a.status===301&&a.redirectedRequestId===null&&b?.url===REDHAT_OPT_OUT_DOCUMENT&&b.status===200&&b.redirectedRequestId===a.requestId&&
  before?.status==='observed'&&before.decision?.source==='implied'&&JSON.stringify(before.decision.selectedCategoryIndices)==='[0]'&&before.documentSha256===p.initialDocumentSha256&&before.atMs<=p.clickAtMs&&
  after&&after.documentSha256===p.initialDocumentSha256&&after.atMs>=p.clickAtMs&&terminal?.status==='observed'&&terminal.decision?.source==='asserted'&&!terminal.decision.selectedCategoryIndices.includes(0)&&terminal.atMs-after.atMs>=750&&p.followUpMs>=750&&
  r&&reload?.url===REDHAT_OPT_OUT_DOCUMENT&&reload.status===200&&reload.redirectedRequestId===null&&reload.requestId===r.requestId&&terminal.documentSha256===r.replacementDocumentSha256&&terminal.atMs>=r.requestedAtMs);
}
export const optOutExecutionAssessmentSchema=z.object({version:z.literal('opt_out_execution_assessment.v1'),scanId:id,packetSha256:hash,
 actionCompleted:z.boolean(),choiceConfirmation:z.enum(['not_attempted','unconfirmed','confirmed_initial','confirmed_terminal']),
 confirmationBasis:z.enum(['gpp_sale_sharing','cmp_explicit_choice']),confirmationReadAtMs:ms.nullable(),
 postConfirmationObservation:z.enum(['complete','limited','not_measured']),observationWindowMs:z.number().int().min(0).max(500),
}).strict();
