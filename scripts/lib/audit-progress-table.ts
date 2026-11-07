/** Presentation order only: preserves every returned measure and finding ID. */
type Entry={kind:"metric"|"quantity"|"finding";id:string;label:string;group:string;[key:string]:any};
export function measuredRateSeries(value:{source:string;series?:Record<string,any>}):[string,any][] {
  if(value.source!=='mixed_sources')return [];
  return Object.entries(value.series??{}).filter(([,part])=>Number.isFinite(part.rate));
}
/** Select an observed latest-version sample; never extrapolate to the full day. */
export function latestVersionSample(value:{source:string;series?:Record<string,any>}):{source:string;version:string;value:any}|null {
  if(value.source!=='mixed_sources'||!value.series)return null;
  const parsed=Object.entries(value.series).map(([source,part])=>({source,part,match:source.match(/^public_export\/pulse-public-v(\d+)\/scan-report-projection-v(\d+)(.*)$/)}));
  if(!parsed.length||parsed.some(p=>!p.match))return null;
  parsed.sort((a,b)=>Number(b.match![1])-Number(a.match![1])||Number(b.match![2])-Number(a.match![2]));
  const latest=parsed[0]!;
  if(parsed.filter(p=>p.match![1]===latest.match![1]&&p.match![2]===latest.match![2]).length!==1)return null;
  return {source:latest.source,version:'v'+latest.match![1],value:latest.part};
}
/** Presentation only: keep missing legacy exports distinct from measured zero. */
export function controlPresenceUnavailableLabel(id:string,value:{denominator:number;counts:Record<string,number>;source:string;series?:Record<string,unknown>}):string|null {
  if(!value.denominator||value.counts.unavailable!==value.denominator)return null;
  if(["policy_fetch","policy_full_text","policy_owner","cmp_dispatch","publication"].includes(id))return "Not exported";
  if(id!=="control.privacyOptOut")return null;
  const sources=value.series?Object.keys(value.series):[value.source];
  return sources.length&&sources.every(s=>/^public_export\/pulse-public-v(?:4|5|10)\//.test(s))?"Not exported":null;
}
export function unavailableMetricDetail(id:string):string {
  if(id==='control.privacyOptOut')return 'First-layer opt-out evidence was absent from the selected source.';
  if(id==='sealed.control.privacyOptOut')return 'No retained assessment matched the scan and report generation.';
  if(id.startsWith('sealed.opt_out.'))return 'No matching choice summary established this outcome.';
  if(id.startsWith('sealed.cmp_check.'))return 'No retained CMP assessment returned this check.';
  if(id.startsWith('sealed.')||id.startsWith('detail.sealed.'))return 'No matching retained evidence returned this value.';
  if(id.startsWith('detail.gpc.paired_'))return 'No verified paired evidence returned this field.';
  if(id.startsWith('terminal.'))return 'No source-bound terminal verification was retained for the eligible clicks.';
  return 'The selected source did not return this value.';
}
export function quantityMeasureGroup(id:string):string{
  if(id.startsWith("sealed.opt_out."))return "Opt-out";
  if(id.startsWith("gpc.paired.")||id.startsWith("gpc.session."))return "GPC details";
  if(/^(accept|reject)\./.test(id))return "A/R verdicts";
  if(id.startsWith("storage.")||id==="inventory.cookies")return "Storage classification";
  if(id.startsWith("accessibility."))return "Accessibility";
  if(id.startsWith("forms.")||id.startsWith("form."))return "Forms";
  if(/^(site|technology|graph)\./.test(id))return "Detailed capture availability";
  if(id==="inventory.vendors")return "Tracking & embeds";
  return "Inventory coverage";
}
export function groupedProgressEntries(metrics:any[],quantities:any[],findings:any[]):Entry[]{
  const groups=[...new Set(metrics.map(m=>m.group))],seen=new Set<string>();
  const entries:Entry[]=[...metrics.map(m=>({...m,kind:"metric" as const})),...quantities.map(q=>({...q,kind:"quantity" as const,group:quantityMeasureGroup(q.id)}))];
  for(const f of findings){
    if(seen.has(f.id))continue;seen.add(f.id);
    const accessibility=f.family==="accessibility"||/accessibility|wcag|contrast/i.test(f.id);
    entries.push({...f,kind:"finding",group:accessibility?"Accessibility findings":"Other surfaced findings"});
  }
  for(const e of entries)if(!groups.includes(e.group))groups.push(e.group);
  return entries.sort((a,b)=>groups.indexOf(a.group)-groups.indexOf(b.group)||
    ["metric","quantity","finding"].indexOf(a.kind)-["metric","quantity","finding"].indexOf(b.kind));
}

/** Missing aggregation is distinct from missing measurements. */
export function quantityAvailabilityLabel(value:{source:string;measured:number;total:number|null}):string|null {
  return value.total===null&&value.source==='mixed_sources'&&value.measured>0?'Separate measurement groups':null;
}
