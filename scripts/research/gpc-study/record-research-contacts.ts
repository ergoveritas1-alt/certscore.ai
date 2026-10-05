/** Local contact ledger candidate only: production remains read-only. */
import fs from 'node:fs';import {readCsv} from './csv.ts';
import {createEmptyCalibrationLedger,recordCalibrationOutcomes} from '../../lib/scan-quality-calibration-ledger.ts';
const root=process.argv[2]??'artifacts/research/gpc-controlled-study-2026';
const assignments=new Map(readCsv(root+'/randomization.csv').map(r=>[r.visit_id,r]));
const frame=new Map(readCsv(root+'/sample_frame.csv').map(r=>[r.site_id,r]));
const contacts:any[]=[];
for(const run of ['pilot-v1','pilot-v2','pilot-v3']){
 const dir=root+'/private/'+run;if(!fs.existsSync(dir))continue;
 for(const file of fs.readdirSync(dir).filter(f=>f.endsWith('.started')).sort()){
  const id=file.slice(0,-8),a=assignments.get(id)!;const started=JSON.parse(fs.readFileSync(dir+'/'+file,'utf8'));const terminal=dir+'/'+id+'.json';const r=fs.existsSync(terminal)?JSON.parse(fs.readFileSync(terminal,'utf8')):undefined;
  const access=(r?.observed?.snapshots??[]).map((s:any)=>s.access.status);const reasons=access.filter((x:string)=>['bot_challenge','access_denied'].includes(x));
  contacts.push({runKey:'gpc-controlled-2026.'+run+'.'+id,visitId:id,run,url:frame.get(a.site_id)!.url,startedAt:started.at,completedAt:r?.provenance?.completedAt,scannerRuntimeStarted:true,status:r?.status==='complete'?'completed':'failed',runtime:{noGoCandidate:reasons.length>0,noGoReasons:[...new Set(reasons)]},certainty:r?.artifact?'retained_capture':'possible_contact_no_raw_capture',discarded:run!=='pilot-v3'});
 }
}
contacts.sort((a,b)=>a.startedAt.localeCompare(b.startedAt));const summary={generatedAt:new Date().toISOString(),results:contacts};
const targets=[...frame.values()].map(s=>({url:s.url,role:'research',lanes:['gpc']}));
const ledger=recordCalibrationOutcomes({ledger:createEmptyCalibrationLedger(),minimumCooldownDays:28,now:new Date(),summary,targetUrls:new Set(targets.map(t=>t.url))});
for(const [name,value] of Object.entries({'research-contact-summary.json':summary,'research-contact-ledger.candidate.json':ledger,'research-contact-manifest.json':{targets,publicContactPolicy:{minimumCooldownDays:28}}}))fs.writeFileSync(root+'/private/'+name,JSON.stringify(value,null,2)+'\n',{mode:0o600});
console.log(JSON.stringify({possibleOrVerifiedContacts:contacts.length,domains:Object.keys(ledger.entries).length,productionWrites:0}));
