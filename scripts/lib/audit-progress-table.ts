/** Presentation order only: preserves every returned measure and finding ID. */
type Entry={kind:"metric"|"quantity"|"finding";id:string;label:string;group:string;[key:string]:any};
export function quantityMeasureGroup(id:string):string{
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
