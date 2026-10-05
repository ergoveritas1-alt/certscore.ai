import fs from 'node:fs';import crypto from 'node:crypto';import {getDomain} from 'tldts';
const root='artifacts/research/gpc-controlled-study-2026',seed='certscore-gpc-controlled-v1-2026-09-30-V349N';
const hash=(x:string)=>crypto.createHash('sha256').update(x).digest('hex');
const raw=fs.readFileSync(`${root}/private/tranco-V349N.csv`,'utf8').trim().split('\n');
if(raw.length!==1000000)throw Error(`Incomplete frame: ${raw.length}`);
const edges=[0,1000,...Array.from({length:19},(_,i)=>Math.round(10**(3+3*(i+1)/19)))];
const bands:any[][]=Array.from({length:20},()=>[]),seen=new Set();let excluded=0;
for(const line of raw){const [rank0,host0]=line.trim().split(',');const rank=Number(rank0);const domain=getDomain(host0!,{allowPrivateDomains:true});if(!domain||seen.has(domain)){excluded++;continue;}seen.add(domain);const band=edges.findIndex((e,i)=>i>0&&rank>edges[i-1]!&&rank<=e);if(band<1)throw Error('rank');bands[band-1]!.push({rank,domain,rank_band:band});}
const sample:any[]=[],randomization:any[]=[];
const order=(label:string)=>(a:any,b:any)=>hash(seed+'|'+label+'|'+a.domain).localeCompare(hash(seed+'|'+label+'|'+b.domain));
for(let i=0;i<20;i++){
 const all=bands[i]!,chosen=all.sort(order('sample')).slice(0,50).sort((a,b)=>a.rank-b.rank);
 for(const row of chosen){row.site_id='site_'+hash(seed+'|id|'+row.domain).slice(0,16);row.url='https://'+row.domain+'/';row.seed=seed;row.list_id='V349N';row.list_date='2026-09-29';row.band_population=all.length;row.inclusion_probability=50/all.length;sample.push(row);}
 for(const block of [1,2]){
  const shuffled=[...chosen].sort(order('primary-block-'+block));
  for(let j=0;j<50;j++){const s=shuffled[j]!,assigned=j<25?'AB':'BA';for(let position=0;position<2;position++)randomization.push({visit_id:`${s.site_id}_primary_b${block}_p${position+1}`,site_id:s.site_id,design:'primary',block,assigned_order:assigned,position:position+1,condition:assigned[position]==='A'?'absent':'enabled',ua_profile:'chromium',attempt:1});}
 }
 for(const s of [...chosen].sort(order('aa')).slice(0,5))for(let position=1;position<=2;position++)randomization.push({visit_id:`${s.site_id}_aa_b3_p${position}`,site_id:s.site_id,design:'aa',block:3,assigned_order:'AA',position,condition:'absent',ua_profile:'chromium',attempt:1});
}
const pilot=[...sample].sort(order('pilot')).slice(0,24);const validation=[...sample].sort(order('blinded-validation')).slice(0,50);
function write(name:string,rows:any[]){const keys=Object.keys(rows[0]);const quote=(v:any)=>'"'+String(v??'').replaceAll('"','""')+'"';fs.writeFileSync(root+'/'+name,[keys.join(','),...rows.map(r=>keys.map(k=>quote(r[k])).join(','))].join('\n')+'\n');}
write('sample_frame.csv',sample);write('randomization.csv',randomization);write('pilot_sites.csv',pilot.map(s=>({site_id:s.site_id,selection_basis:'SHA256 pilot seed order'})));write('blinded_validation_sample.csv',validation.map(s=>({site_id:s.site_id,selection_basis:'SHA256 blinded-validation seed order'})));
write('adjudication_log.csv',[{packet_id:'',reviewer:'',reviewed_at_utc:'',evidence_hash:'',condition_blinded:'',delivery_correct:'',request_set_complete:'',taxonomy_correct:'',cookie_storage_correct:'',semantic_correct:'',rationale:''}]);
fs.writeFileSync(root+'/sample_manifest.json',JSON.stringify({seed,listId:'V349N',listDate:'2026-09-29',source:'https://tranco-list.eu/list/V349N/1000000',sourceSha256:hash(fs.readFileSync(root+'/private/tranco-V349N.csv','utf8')),edges,excludedBeforeSelection:excluded,sites:sample.length,visits:randomization.length,pilotSites:pilot.length,pilotVisits:randomization.filter(r=>pilot.some(s=>s.site_id===r.site_id)).length,files:Object.fromEntries(['sample_frame.csv','randomization.csv','pilot_sites.csv','blinded_validation_sample.csv'].map(f=>[f,hash(fs.readFileSync(root+'/'+f,'utf8'))]))},null,2)+'\n');console.log('Frozen',sample.length,'sites',randomization.length,'visits');
