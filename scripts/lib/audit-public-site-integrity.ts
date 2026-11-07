import {z} from 'zod';
import {siteIntegrityLinkSchema,SITE_INTEGRITY_LIMITS} from '../../packages/certscore-contracts/src/site-integrity';
/** Customer-full-v2 projection intentionally omits the private document token. Never reconstruct it. */
const hash=z.string().regex(/^[a-f0-9]{64}$/);
const observation=z.object({sourceLane:z.literal('runtime_evidence'),documentUrl:z.string().url().max(2048).refine(v=>{const u=new URL(v);return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password&&!u.search&&!u.hash;}),capturedAt:z.string().datetime(),inspectedLinks:z.number().int().min(0).max(SITE_INTEGRITY_LIMITS.inspectedLinks),truncated:z.boolean(),links:z.array(siteIntegrityLinkSchema).max(SITE_INTEGRITY_LIMITS.retainedLinks)}).strict();
const shared={scanId:z.string().min(1).max(160),sourceHash:hash,observationHash:hash,verificationStatus:z.literal('verified')};
export const publicSiteIntegritySchema=z.discriminatedUnion('contractVersion',[
 z.object({...shared,contractVersion:z.literal('certscore.site-integrity-projection.v1'),evidenceRef:z.literal('CanonicalEvidenceBundle.json#siteIntegrityObservation'),observation:observation.extend({contractVersion:z.literal('certscore.site-integrity-observation.v1'),scope:z.literal('starting_page_main_document')})}).strict(),
 z.object({...shared,contractVersion:z.literal('certscore.site-integrity-projection.v2'),pageId:z.string().uuid(),attemptId:z.string().uuid(),configurationHash:hash,evidenceRef:z.string(),observation:observation.extend({contractVersion:z.literal('certscore.site-integrity-observation.v2'),scope:z.literal('additional_page_main_document')})}).strict(),
]).superRefine((p,ctx)=>{
 const o=p.observation;
 if(p.contractVersion==='certscore.site-integrity-projection.v2'&&p.evidenceRef!==`full-site:${p.pageId}:${p.attemptId}:evidence.json#siteIntegrityObservation`)ctx.addIssue({code:'custom',message:'Page-attempt binding mismatch'});
 if(new Set(o.links.map(l=>l.evidenceRef)).size!==o.links.length||o.links.some(l=>Number(l.evidenceRef.split(':').at(-1))>=o.inspectedLinks||l.codeProof&&l.codeProofUnavailableReason)||o.links.length>o.inspectedLinks||o.links.reduce((n,l)=>n+(l.codeProof?Buffer.byteLength(JSON.stringify(l.codeProof)):0),0)>SITE_INTEGRITY_LIMITS.codeProofPageBytes)ctx.addIssue({code:'custom',message:'Invalid bounded link inventory'});
});
