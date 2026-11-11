/** Offline presentation only. All populations are retained rows, not production totals.
 * Keep this function self-contained: the file viewer embeds the same implementation. */
export function auditDataHealth(data:any,rows:any[],context:any={},now=Date.now()) {
 const dates=new Intl.DateTimeFormat('en-CA',{timeZone:data.timezone??'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'});
 const ends=(data.windows??[]).map((w:any)=>Date.parse(w.end)).filter(Number.isFinite);
 const cutoff=ends.length?Math.max(...ends):NaN;
 const day=Number.isFinite(cutoff)?dates.format(new Date(cutoff)):null;
 const current=rows.filter(r=>day&&dates.format(new Date(r.createdAt))===day);
 const reportable=current.filter(r=>r.reportable);
 const count=(rs:any[],fn:(r:any)=>string)=>rs.reduce((acc:any,r:any)=>{const v=fn(r);acc[v]=(acc[v]??0)+1;return acc;},{});
 const receipts=(rs:any[])=>rs.filter(r=>Object.values(r.metricSources??{}).some(s=>String(s).startsWith('persisted_policy_receipt/'))).length;
 const previousDate=day?new Date(Date.parse(day+'T12:00:00Z')-86400000).toISOString().slice(0,10):null;
 const previous=rows.filter(r=>r.reportable&&dates.format(new Date(r.createdAt))===previousDate);
 // Same site and explicit source/version profile; no aggregate rate or causal delta.
 const signature=(r:any)=>{
  const profile=[r.site,r.region,r.comparisonMetadata?.profile??r.profile,r.comparisonMetadata?.producer??r.producer,r.assessmentVersion,r.projectionVersion,r.defaultSource];
  if(profile.some(v=>typeof v!=='string'||!v||/unknown|unavailable|not retained|not_exported/i.test(v)))return null;
  return JSON.stringify([...profile,Object.entries(r.metricSources??{}).sort(([a],[b])=>a.localeCompare(b))]);
 };
 const previousKeys=new Set(previous.map(signature).filter(Boolean));
 const comparable=reportable.filter(r=>{const key=signature(r);return key&&previousKeys.has(key);});
 const previousSites=new Set(previous.map(r=>r.site));
 const groups=count(reportable,r=>JSON.stringify([r.region,r.comparisonMetadata?.profile??r.profile,r.assessmentVersion,r.projectionVersion]));
 const quantities=['site.link_evidence','technology.detections','technology.matches'].map(id=>{
  const measured=reportable.filter(r=>Number.isFinite(r.measurements?.[id]));
  return {id,eligible:reportable.length,measured:measured.length,zero:measured.filter(r=>r.measurements[id]===0).length,
   positive:measured.filter(r=>r.measurements[id]>0).length,unavailable:reportable.length-measured.length,
   reasons:count(reportable.filter(r=>!Number.isFinite(r.measurements?.[id])),r=>r.technicalCountUnavailable?.reasons[id]??'reason_not_retained')};
 });
 const details=reportable.filter(r=>r.controlAccessibilityCoverage).map(r=>r.controlAccessibilityCoverage);
 const pending=context.pending??[];
 const ages=pending.map((r:any)=>(cutoff-Date.parse(r.createdAt))/86400000).filter((n:number)=>Number.isFinite(n)&&n>=0);
 const available=receipts(reportable),previousAvailable=receipts(previous);
 return {cutoff:Number.isFinite(cutoff)?new Date(cutoff).toISOString():null,date:day,
  ageHours:Number.isFinite(cutoff)?Math.max(0,(now-cutoff)/3600000):null,
  completeDay:(data.days??[]).find((d:any)=>d.date===day)?.completeDay===true,
  attempts:current.length,reportable:reportable.length,noGo:current.filter(r=>r.states.outcome==='no_go').length,
  exportUnavailable:current.filter(r=>r.states.outcome==='export_unavailable').length,
  outcomes:count(current,r=>r.states.outcome??'unknown'),quantities,
  policy:{available,unavailable:reportable.length-available,previousDate,previousAvailable,previousReportable:previous.length,
   deliveryGap:reportable.length>0&&available===0&&previousAvailable>0},
  controls:{receipts:details.length,unavailable:reportable.length-details.length,
   statuses:count(details,r=>r.status),reasons:count(details.flatMap(r=>r.reasons.map((reason:string)=>({reason}))),r=>r.reason)},
  comparability:{previousDate,previousReportable:previous.length,sameSites:new Set(reportable.filter(r=>previousSites.has(r.site)).map(r=>r.site)).size,
   matchedReports:comparable.length,matchedSites:new Set(comparable.map(r=>r.site)).size,metadataUnavailable:reportable.filter(r=>!signature(r)).length,groups},
  pending:{available:Array.isArray(context.pending),count:pending.length,oldestAttemptAgeDays:ages.length?Math.max(...ages):null,
   over7Days:ages.filter((n:number)=>n>=7).length,statuses:count(pending,(r:any)=>r.status??'unavailable'),scope:'Entire verified cache queue; age since scan creation at snapshot cutoff'},
  integrity:{masterStatus:data.masterValueParity?.status??'unavailable',masterMismatches:data.masterValueParity?.mismatches??null,recordedErrors:(data.errors??[]).length},
 };
}
