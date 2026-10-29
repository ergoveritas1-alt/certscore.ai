import {readFileSync,writeFileSync,mkdirSync,existsSync} from "node:fs";
import {createHash} from "node:crypto";
import {join,resolve} from "node:path";
import {pathToFileURL} from "node:url";
import {assessConsentActionStages,CONSENT_ACTION_STAGE_KEYS,type ConsentActionStages,
 postAcceptEvidencePacketSchema,postRefusalEvidencePacketSchema,projectPostAcceptEvidenceForReport,projectPostRefusalEvidenceForReport} from "../packages/certscore-contracts/src/index";

type Row={contacted:boolean;cohort:string;url:string;action:"accept"|"reject";packetSha256:string|null;stages:ConsentActionStages};
export function summarizeCmpStages(rows:Row[]){
 const keys=[...new Set(rows.map(r=>JSON.stringify([r.cohort,r.stages.provider??"Unverified CMP",r.action])))];
 return keys.map(key=>{const [cohort,provider,action]=JSON.parse(key) as string[];const planned=rows.filter(r=>r.cohort===cohort&&(r.stages.provider??"Unverified CMP")===provider&&r.action===action);const sample=planned.filter(r=>r.contacted);
  const counts=(values:Array<string>)=>Object.fromEntries([...new Set(values)].sort().map(v=>[v,values.filter(x=>x===v).length]));
  return {cohort,provider,action,total:sample.length,planned:planned.length,notContacted:planned.length-sample.length,measures:Object.fromEntries(CONSENT_ACTION_STAGE_KEYS.map(stage=>[stage,{verified:sample.filter(r=>r.stages.measures[stage]===true).length,notVerified:sample.filter(r=>r.stages.measures[stage]===false).length,unknown:sample.filter(r=>r.stages.measures[stage]===null).length}])),outcomes:counts(sample.map(r=>r.stages.outcome)),categoryChecks:counts(sample.map(r=>r.stages.categoryCheck)),diagnosticReasons:counts(sample.flatMap(r=>r.stages.diagnosticReasons)),passiveSignals:{captures:sample.filter(r=>r.stages.passiveSignals).length,eventReads:sample.filter(r=>r.stages.passiveSignals?.eventRead).length,groupsUpdated:sample.reduce((n,r)=>n+(r.stages.passiveSignals?.groupsUpdated??0),0),consentApplied:sample.reduce((n,r)=>n+(r.stages.passiveSignals?.consentApplied??0),0),receiptRequests:sample.reduce((n,r)=>n+(r.stages.passiveSignals?.receiptRequests??0),0),responses2xx:sample.reduce((n,r)=>n+(r.stages.passiveSignals?.responses2xx??0),0),responsesMissing:sample.reduce((n,r)=>n+(r.stages.passiveSignals?.responsesMissing??0),0)}};});
}
const escape=(s:unknown)=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!));
export function buildCmpStageReport(summaries:string[],out:string){
 if(existsSync(out))throw Error("Choose a new immutable output directory");
 const rows:Row[]=[],seen=new Set<string>();
 for(const input of summaries){const summary=JSON.parse(readFileSync(input,"utf8"));const cohortBase=resolve(input);
  for(const row of summary.results){const cohort=cohortBase+(typeof row.arm==="string"?" :: "+row.arm:"");if(row.action!=="accept"&&row.action!=="reject")throw Error("Unsupported action");
   if(!row.packetFile){rows.push({contacted:row.scannerRuntimeStarted===true,cohort,url:row.url,action:row.action,packetSha256:null,stages:{policyVersion:"consent_action_stages.v1",provider:null,outcome:"unknown",categoryCheck:"unknown",diagnosticReasons:[],measures:{providerAttributed:null,controlResolved:null,clickCompleted:null,observationCompleted:null,categoryScopeVerified:null,decisionVerified:null}}});continue;}
   const bytes=readFileSync(join(row.resultDirectory,row.packetFile));const hash=createHash("sha256").update(bytes).digest("hex");if(hash!==row.packetSha256)throw Error("Packet hash mismatch");
   const identity=cohort+":"+hash;if(seen.has(identity))continue;seen.add(identity);
   const packet=row.action==="accept"?postAcceptEvidencePacketSchema.parse(JSON.parse(bytes.toString())):postRefusalEvidencePacketSchema.parse(JSON.parse(bytes.toString()));
   const p=row.action==="accept"?projectPostAcceptEvidenceForReport({packet:packet as Parameters<typeof projectPostAcceptEvidenceForReport>[0]["packet"],packetSha256:hash}):projectPostRefusalEvidenceForReport({packet:packet as Parameters<typeof projectPostRefusalEvidenceForReport>[0]["packet"],packetSha256:hash});
   const stages=assessConsentActionStages(p);
   // Historical operational reasons come from these same checksum-verified bytes;
   // no stored projection, registration or decision is rewritten.
   stages.diagnosticReasons=[...new Set([
    ...(packet.confirmationDiagnostics?.reasons??[]),
    ...(packet.resolver.reason?["control:"+packet.resolver.reason]:[]),
    ...packet.limitations.filter(r=>r.startsWith("observer_result_budget_exhausted")||r==="resolver_search_budget_exhausted").map(r=>"capture:"+r),
   ])];
   rows.push({contacted:row.scannerRuntimeStarted===true,cohort,url:row.url,action:row.action,packetSha256:hash,stages});
  }
 }
 const providers=summarizeCmpStages(rows),report={policyVersion:"cmp_stage_benchmark.v1",generatedAt:new Date().toISOString(),interpretation:"Separate selected cohorts. Unknown is not failure or no CMP. Provider attribution is bound to the action control, not a page-wide CMP inventory. Category scope verification currently measures typed OneTrust group proof; other providers remain unknown. Passive diagnostics never confirm consent. No notification acknowledgment is counted as a fresh decision.",providers,rows};
 mkdirSync(out,{recursive:true});writeFileSync(join(out,"stage-report.json"),JSON.stringify(report,null,2)+"\n");
 const header=["Cohort","Provider","Action","Visits / planned","Action CMP attributed","Control resolved","Click completed","Observation completed","Category scope verified","Decision verified","Outcomes","Category checks","Reasons","Passive signals"];
 const cells=providers.map(p=>[p.cohort,p.provider,p.action,`${p.total} / ${p.planned}`,...CONSENT_ACTION_STAGE_KEYS.map(k=>{const v=p.measures[k]!;return `${v.verified}/${p.total}; not verified ${v.notVerified}; unknown ${v.unknown}`;}),JSON.stringify(p.outcomes),JSON.stringify(p.categoryChecks),JSON.stringify(p.diagnosticReasons),JSON.stringify(p.passiveSignals)]);
 writeFileSync(join(out,"stage-report.csv"),[header,...cells].map(row=>row.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(",")).join("\n")+"\n");
 const stageLabels=["Action CMP attributed","Control resolved","Click completed","Observation completed","Category scope verified","Decision verified"];
 const describe=(values:Record<string,number>)=>Object.entries(values).map(([key,count])=>`${escape(key)}: ${count}`).join("; ")||"None retained";
 const sections=[...new Set(providers.map(p=>p.cohort))].map(cohort=>{
  const title=cohort.split("/runs/").pop()??cohort;
  const group=providers.filter(p=>p.cohort===cohort);
  return `<section><h2>${escape(title)}</h2><div class="table-wrap"><table><thead><tr><th>Provider</th><th>Action</th><th>Visits / planned</th>${stageLabels.map(v=>`<th>${escape(v)}</th>`).join("")}</tr></thead><tbody>${group.map(p=>`<tr><td>${escape(p.provider)}</td><td>${escape(p.action)}</td><td>${p.total} / ${p.planned}</td>${CONSENT_ACTION_STAGE_KEYS.map(k=>{const v=p.measures[k]!;return `<td><strong>${v.verified} / ${p.total}</strong><small>Not verified ${v.notVerified}<br>Unknown ${v.unknown}</small></td>`;}).join("")}</tr><tr class="detail"><td colspan="9"><details><summary>Outcomes and diagnostics — ${escape(p.provider)} · ${escape(p.action)}</summary><p><b>Outcomes:</b> ${describe(p.outcomes)}</p><p><b>Category checks:</b> ${describe(p.categoryChecks)}</p><p><b>Reasons:</b> ${describe(p.diagnosticReasons)}</p><p><b>Passive signals:</b> ${describe(p.passiveSignals)}</p></details></td></tr>`).join("")}</tbody></table></div></section>`;
 }).join("");
 writeFileSync(join(out,"stage-report.html"),`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>CertScore.ai CMP stages</title><style>body{font:14px system-ui;margin:28px;color:#172033;background:#f6f7fb}section{margin:32px 0}h2{font-size:18px;overflow-wrap:anywhere}table{width:100%;min-width:1050px;border-collapse:collapse;background:white}.table-wrap{overflow:auto;border:1px solid #dbe1ec;border-radius:12px}th,td{padding:12px;border-bottom:1px solid #dbe1ec;text-align:left;vertical-align:top}th{background:#edf0fb}td:first-child{max-width:180px}p{max-width:1150px;line-height:1.5;overflow-wrap:anywhere}small{display:block;color:#526079;font-size:11px;margin-top:6px}strong{font-size:18px}summary{cursor:pointer;color:#526079}.detail td{padding:8px 12px;background:#fbfcff}a{color:#6141cc}</style><h1>CertScore.ai CMP verification stages</h1><p>${escape(report.interpretation)}</p><p>Each stage shows verified / contacted visits. Not verified and unknown remain separate. Uncontacted planned slots are excluded from stage denominators. A stage failure does not establish a website compliance failure. <a href="stage-report.csv">Download complete table</a> · <a href="stage-report.json">Evidence and counts</a></p>${sections}</html>`);

 return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const args=process.argv.slice(2),outIndex=args.indexOf("--out");if(outIndex<0||!args[outIndex+1])throw Error("Usage: cmp-stage-benchmark.ts <contact-summary.json>... --out <new directory>");const report=buildCmpStageReport(args.slice(0,outIndex),args[outIndex+1]!);console.log(JSON.stringify({attempts:report.rows.length,providerGroups:report.providers.length,out:args[outIndex+1]}));}
