/** Presentation-only, row-joined stages. Never changes retained outcomes or CSVs.
 * Kept self-contained so the file viewer uses the identical implementation. */
export function optOutFunnel(rows:any[],timezone='America/Los_Angeles') {
 const dates=new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'});
 const days:Record<string,any>={};
 const key=(id:string)=>'sealed.opt_out.'+id;
 const state=(row:any,id:string)=>row.states[key(id)]??'unavailable';
 const count=(rs:any[],id:string,allowed:string[])=>{
  const counts:Record<string,number>={};
  for(const row of rs){const value=state(row,id);const s=allowed.includes(value)?value:'unavailable';counts[s]=(counts[s]??0)+1;}
  return {eligible:rs.length,counts};
 };
 for(const row of rows){
  if(!row.reportable)continue;
  const date=dates.format(new Date(row.createdAt));(days[date]??=[]).push(row);
 }
 return Object.fromEntries(Object.entries(days).map(([date,rs]:[string,any[]])=>{
  const dispatched=rs.filter(r=>state(r,'dispatch')==='dispatch_recorded');
  const notDispatched=rs.filter(r=>state(r,'dispatch')==='conditional_no_dispatch_recorded').length;
  const excluded=rs.filter(r=>state(r,'dispatch')==='excluded_by_profile').length;
  const unknown=rs.length-dispatched.length-notDispatched-excluded;
  const orphanedOutcomes=rs.filter(r=>state(r,'dispatch')!=='dispatch_recorded'&&
   (state(r,'action_completion')==='completed'||['confirmed_terminal','confirmed_initial'].includes(state(r,'choice_confirmation')))).length;
  const groups:Record<string,any[]>={};
  for(const row of dispatched){
   const sources=['dispatch','action_completion','choice_confirmation','post_confirmation_observation'].map(id=>row.metricSources?.[key(id)]??'unavailable');
   (groups[JSON.stringify(sources)]??=[]).push(row);
  }
  const stages=Object.entries(groups).map(([source,group])=>{
   const completed=group.filter(r=>state(r,'action_completion')==='completed');
   const terminal=completed.filter(r=>state(r,'choice_confirmation')==='confirmed_terminal');
   const initial=completed.filter(r=>state(r,'choice_confirmation')==='confirmed_initial');
   return {sources:JSON.parse(source),dispatched:group.length,
    actions:count(group,'action_completion',['completed','not_completed']),
    confirmations:count(completed,'choice_confirmation',['confirmed_terminal','confirmed_initial','unconfirmed','not_attempted']),
    afterTerminal:count(terminal,'post_confirmation_observation',['complete','limited','not_measured']),
    afterInitial:count(initial,'post_confirmation_observation',['complete','limited','not_measured']),
    outOfSequence:group.filter(r=>state(r,'action_completion')!=='completed'&&['confirmed_terminal','confirmed_initial'].includes(state(r,'choice_confirmation'))).length};
  });
  const broad=rs.filter(r=>state(r,'presence')==='observed');
  const skippedBroad=broad.filter(r=>state(r,'dispatch')==='conditional_no_dispatch_recorded');
  const absent=skippedBroad.filter(r=>state(r,'conditional_control')==='not_observed_in_source').length;
  const unsupported=skippedBroad.filter(r=>state(r,'conditional_control')==='observed'&&state(r,'supported_route')==='unsupported_or_unverified').length;
  const reasons:Record<string,number>={};
  for(const row of rs.filter(r=>state(r,'dispatch')==='conditional_no_dispatch_recorded')){
   const reason=state(row,'dispatch_reason');reasons[reason]=(reasons[reason]??0)+1;
  }
  const rejectionDetails=rs.filter(r=>state(r,'dispatch')==='conditional_no_dispatch_recorded'&&r.optOutRejection)
   .map(r=>({scanId:r.scanId,site:r.site,source:r.metricSources?.[key('dispatch_reason')]??'unavailable',...r.optOutRejection}));
  return [date,{reportable:rs.length,dispatched:dispatched.length,notDispatched,excluded,unknown,orphanedOutcomes,stages,reasons,
   rejectionDetails,
   broadSignals:broad.length,skippedBroad:skippedBroad.length,noQualifyingControlRecorded:absent,controlWithoutSupportedRoute:unsupported,
   unresolvedPrerequisites:skippedBroad.length-absent-unsupported}];
 }));
}
