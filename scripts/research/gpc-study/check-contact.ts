/** Apply canonical contact eligibility to the outcome-independent frozen pilot. */
import fs from 'node:fs';
import {readCsv} from './run.ts';
import {mergeCentralContactLedger,selectCalibrationTargets} from '../../lib/scan-quality-calibration-ledger.ts';
import {publicTestContactHoldForUrl} from '../../../packages/certscore-scan-core/src/public-test-contact-holds.ts';
const root='artifacts/research/gpc-controlled-study-2026';
const old=JSON.parse(fs.readFileSync(root+'/private/contact-eligibility.json','utf8'));
const ids=new Set(readCsv(root+'/pilot_sites.csv').map(r=>r.site_id));
const frame=readCsv(root+'/sample_frame.csv').filter(r=>ids.has(r.site_id));
const targets=frame.map(r=>({url:r.url,role:'research',lanes:['gpc']}));
const centralRecords=fs.readFileSync(root+'/private/contact-history.txt','utf8').split('\n').filter(l=>l.startsWith('{')).map(l=>{const r=JSON.parse(l);return {normalizedDomain:r.normalized_domain,lastContactAt:r.last_contact_at,cooldownUntil:r.cooldown_until,effectiveState:r.effective_state,lastNoGoReasons:r.last_no_go_reason_codes,consecutiveNoGoCount:0,lastOutcome:'unavailable_in_export',lastSource:'central_export'};});
const manual=JSON.parse(fs.readFileSync('docs/certscore-v2/scan-quality-calibration-ledger.json','utf8'));
// Normalize trailing slash so manual and study URLs share the same ledger key.
manual.entries=Object.fromEntries(Object.values(manual.entries).map((e:any)=>{const url=new URL(e.url).href;return [url,{...e,url}];}));
const now=new Date(),ledger=mergeCentralContactLedger({centralRecords,ledger:manual,now,targets});
for(const r of frame){
 const hold=publicTestContactHoldForUrl(r.url);let eligible=!hold,reason=hold?'repository_contact_hold':'eligible';
 if(!hold){try{selectCalibrationTargets({ledger,limit:1,minimumCooldownDays:28,now,rotationKey:'gpc-research-contact-check',targets:[{url:r.url,role:'research',lanes:['gpc']}]});}catch{eligible=false;reason='canonical_contact_cooldown_or_block';}}
 old.sites[r.site_id]={eligible,reason};
}
old.canonicalEligibilityCheckedAt=now.toISOString();old.manualLedgerIncluded=true;old.repositoryHoldsChecked=true;
// Preserve original checkedAt: this operation does not refresh central history.
fs.writeFileSync(root+'/private/contact-eligibility.json',JSON.stringify(old,null,2)+'\n',{mode:0o600});
console.log(JSON.stringify({selected:frame.length,eligible:Object.values(old.sites).filter((x:any)=>x.eligible).length,centralCheckedAt:old.checkedAt}));
