/** Pure shared server/browser aggregation and CSV generation. No network or product logic. */
export function progressEngine() {
  const dayOf=(s:string)=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(s));
  const num=(x:any)=>Number.isSafeInteger(x)&&x>=0;
  const source=(r:any,id:string)=>r.metricSources?.[id]??(id.startsWith('sealed.')?'unavailable_sealed_assessment':/^(site|technology|graph|form)\./.test(id)?'unavailable_sealed_projection':r.defaultSource??'unavailable_source');
  const eligible=(r:any,id:string)=>r.states[id]!==undefined||(id.startsWith('sealed.')&&!/^sealed\.(registration\.|terminal\.|gpc_path$|gpc_delivery$)/.test(id)&&r.reportable);
  const compare=(v:any,p:any,partial:boolean)=>{
    const same=p&&v.source===p.source&&v.source!=='mixed_sources'&&!v.source.includes('unversioned')&&!v.source.includes('unknown')&&!v.source.includes('unavailable');
    v.deltaPp=same&&v.rate!==null&&p.rate!==null?v.rate-p.rate:null;
    v.stateDeltaPp={};for(const s of new Set([...Object.keys(v.counts??{}),...Object.keys(p?.counts??{})]))v.stateDeltaPp[s]=same&&v.denominator&&p.denominator?100*(v.counts[s]??0)/v.denominator-100*(p.counts[s]??0)/p.denominator:null;
    v.comparison=!p?'baseline':!same?'source_boundary':!v.denominator||!p.denominator?'no_comparable_denominator':partial?'partial_day':'descriptive_day_over_day';
  };
  function aggregate(data:any,rows:any[]) {
    const byDay=new Map<string,any[]>();for(const r of rows){const day=dayOf(r.createdAt);if(!byDay.has(day))byDay.set(day,[]);byDay.get(day)!.push(r);}
    const result:any[]=[];
    for(const base of data.days){
      const chosen=byDay.get(base.date)??[],previous=result.at(-1),metrics:any={},quantities:any={},findings:any={};
      for(const m of data.metrics){
        const selected=chosen.filter(r=>eligible(r,m.id)),groups:any={};
        for(const r of selected){const s=source(r,m.id);(groups[s]??=[]).push(r);}
        const tally=(rs:any[],s:string)=>{const counts:any={};for(const r of rs)counts[r.states[m.id]??'unavailable']=(counts[r.states[m.id]??'unavailable']??0)+1;const n=m.success.reduce((n:number,k:string)=>n+(counts[k]??0),0);return {source:s,counts,numerator:n,denominator:rs.length,rate:rs.length&&m.success.length&&s!=='mixed_sources'&&!s.startsWith('unavailable')&&(counts.unavailable??0)!==rs.length?100*n/rs.length:null};};
        const keys=Object.keys(groups),v:any=tally(selected,keys.length===1?keys[0]!:'mixed_sources');v.series={};
        for(const [s,rs]of Object.entries(groups)){const sub=tally(rs as any[],s);compare(sub,previous?.metrics[m.id]?.series[s],!base.completeDay||!previous?.completeDay);v.series[s]=sub;}
        compare(v,previous?.metrics[m.id],!base.completeDay||!previous?.completeDay);metrics[m.id]=v;
      }
      for(const q of data.quantities??[]){
        const selected=chosen.filter(r=>r.reportable&&(!q.id.startsWith('accessibility.')||r.states.accessibility!==undefined)),groups:any={};
        for(const r of selected){const s=source(r,q.id);(groups[s]??=[]).push(r);}
        const tally=(rs:any[],s:string)=>{const values=rs.map(r=>r.measurements?.[q.id]).filter(num).sort((a:number,b:number)=>a-b),n=values.length;return {source:s,eligible:rs.length,measured:n,missing:rs.length-n,median:n&&s!=='mixed_sources'?(values[Math.floor((n-1)/2)]+values[Math.ceil((n-1)/2)])/2:null,total:n?values.reduce((a:number,b:number)=>a+b,0):null,delta:null as number|null};};
        const keys=Object.keys(groups),v:any=tally(selected,keys.length===1?keys[0]!:'mixed_sources');v.series={};
        for(const [s,rs]of Object.entries(groups)){const sub=tally(rs as any[],s),p=previous?.quantities[q.id]?.series[s];sub.delta=p&&!/unversioned|unknown|unavailable/.test(s)&&sub.median!==null&&p.median!==null?sub.median-p.median:null;v.series[s]=sub;}
        const p=previous?.quantities[q.id];v.delta=p?.source===v.source&&v.source!=='mixed_sources'&&!/unversioned|unknown|unavailable/.test(v.source)&&v.median!==null&&p.median!==null?v.median-p.median:null;quantities[q.id]=v;
      }
      const findingIds=data.findingIds??[...new Set(rows.flatMap(r=>r.findings.map((f:any)=>f.id)))];
      for(const id of findingIds){
        const groups:any={};for(const r of chosen.filter(r=>r.reportable)){const s=source(r,'findings');(groups[s]??=[]).push(r);}
        const tally=(rs:any[],s:string)=>{const full=rs.filter(r=>r.findingInventory),n=full.filter(r=>r.findings.some((f:any)=>f.id===id)).length;return {source:s,numerator:n,denominator:full.length,eligible:rs.length,unavailable:rs.length-full.length,incompletePositives:rs.filter(r=>!r.findingInventory&&r.findings.some((f:any)=>f.id===id)).length,top:rs.length&&rs.every(r=>r.topInventory===true)?rs.filter(r=>r.findings.some((f:any)=>f.id===id&&f.top)).length:null,rate:full.length&&s!=='mixed_sources'?100*n/full.length:null};};
        const keys=Object.keys(groups),v:any=tally(chosen.filter(r=>r.reportable),keys.length===1?keys[0]!:'mixed_sources');v.series={};
        for(const [s,rs]of Object.entries(groups)){const sub=tally(rs as any[],s);compare(sub,previous?.findings[id]?.series[s],!base.completeDay||!previous?.completeDay);v.series[s]=sub;}
        compare(v,previous?.findings[id],!base.completeDay||!previous?.completeDay);findings[id]=v;
      }
      result.push({...base,attempts:chosen.length,uniqueSites:new Set(chosen.map(r=>r.site)).size,reportable:chosen.filter(r=>r.reportable).length,metrics,quantities,findings});
    }
    return result;
  }
  const quote=(v:any)=>'"'+String(v??'').replaceAll('"','""')+'"';
  function stateCsv(days:any[],metrics:any[]) {
    const lines=['date,completeDay,inventoryHours,metric,source,state,count,denominator,percent,deltaPp,comparison'];
    for(const d of days)for(const m of metrics){const v=d.metrics[m.id];for(const s of Object.keys(v.series).sort()){const part=v.series[s];for(const state of Object.keys(part.stateDeltaPp).sort()){const n=part.counts[state]??0;lines.push([d.date,d.completeDay,d.inventoryHours,m.id,s,state,n,part.denominator,part.denominator?100*n/part.denominator:null,part.stateDeltaPp[state],part.comparison].map(quote).join(','));}}}
    return lines.join('\n')+'\n';
  }
  function quantityCsv(days:any[],quantities:any[]) {
    const lines=['date,completeDay,quantity,source,unit,measured,eligible,missing,median,total,delta'];
    for(const d of days)for(const q of quantities){const v=d.quantities[q.id];for(const s of Object.keys(v.series).sort()){const p=v.series[s];lines.push([d.date,d.completeDay,q.id,s,q.unit,p.measured,p.eligible,p.missing,p.median,p.total,p.delta].map(quote).join(','));}}
    return lines.join('\n')+'\n';
  }
  function findingCsv(days:any[],ids:string[]){const lines=['date,completeDay,finding,source,count,denominator,unavailable,incompletePositives,top,percent,deltaPp,comparison'];for(const d of days)for(const id of ids)for(const s of Object.keys(d.findings[id].series).sort()){const p=d.findings[id].series[s];lines.push([d.date,d.completeDay,id,s,p.numerator,p.denominator,p.unavailable,p.incompletePositives,p.top,p.rate,p.deltaPp,p.comparison].map(quote).join(','));}return lines.join('\n')+'\n';}
  return {aggregate,stateCsv,quantityCsv,findingCsv};
}
