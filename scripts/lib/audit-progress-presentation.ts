/** Presentation only. Never changes the aggregation engine, denominators or exports. */
export function auditPresentation() {
  const unresolved = new Set(['unavailable','unknown','not_assessed','not_attempted','intentionally_omitted','unsupported','unverified','indeterminate','insufficient_evidence']);
  const attention = (value:any) => Object.entries(value.counts??{}).some(([s,n]) => Number(n)>0 && /(^|_)(failed|failure|timeout|aborted|invalid)(_|$)/.test(s));
  function hasEvidence(e:any,v:any):boolean {
    if (e.kind==='quantity') return v.measured>0;
    if (e.kind==='finding') return v.denominator>0 || v.incompletePositives>0;
    return attention(v) || Object.entries(v.counts??{}).some(([s,n])=>Number(n)>0&&!unresolved.has(s));
  }
  function category(e:any,target:any):string {
    if(target?.signalClass?.startsWith('P'))return 'Site observations';
    if(target?.signalClass?.startsWith('H'))return 'Scanner health & coverage';
    if(target?.signalClass?.startsWith('N'))return 'Context';
    if(e.kind==='finding'||/^(?:sealed\.)?(control\.|topic\.|checklist\.|verdict\.)/.test(e.id))return 'Site observations';
    return 'Scanner health & coverage';
  }
  function gapLabel(e:any,v:any):string|null {
    const n=v.denominator??v.eligible??0,c=v.counts??{};
    if(e.kind==='finding'&&v.incompletePositives>0)return 'Retained positives';
    if(e.kind==='finding'&&!n&&v.eligible>0)return 'No complete inventories';
    if(!n)return 'No eligible reports';
    if(e.kind==='quantity')return v.measured?null:'No retained measurement';
    if(e.kind==='finding')return null;
    if(c.intentionally_omitted===n)return 'Not scheduled';
    if(c.not_assessed===n)return 'Not assessed';
    if(c.not_attempted===n)return 'Not attempted';
    if(c.unsupported===n)return 'Unsupported';
    if(c.unavailable===n)return 'No retained value';
    if(Object.entries(c).every(([s,count])=>!count||unresolved.has(s)))return 'Unresolved';
    return null;
  }
  /** Only exact sources are selected. Known public export versions can be ordered;
   * otherwise use a uniquely largest explicit cohort, never a blended rate. */
  function cohort(v:any):{value:any;source:string;label:string;selected:number;total:number}|null {
    if(v.source!=='mixed_sources')return null;
    const all=Object.entries(v.series??{}).map(([source,value]:[string,any])=>({source,value,n:value.denominator??value.eligible??0}));
    const candidates=all.filter(p=>p.n>0&&!/unknown|unversioned|unavailable|id_selection/.test(p.source));
    if(!candidates.length)return null;
    const publicParts=candidates.map(p=>({...p,match:p.source.match(/^public_export\/pulse-public-v(\d+)\/scan-report-projection-v(\d+)(.*)$/)}));
    let picked:typeof candidates[number]|undefined, label='Largest cohort';
    if(publicParts.every(p=>p.match)){
      publicParts.sort((a,b)=>Number(b.match![1])-Number(a.match![1])||Number(b.match![2])-Number(a.match![2]));
      const first=publicParts[0]!;
      if(publicParts.filter(p=>p.match![1]===first.match![1]&&p.match![2]===first.match![2]).length===1){picked=first;label='Latest export v'+first.match![1];}
    }else{
      candidates.sort((a,b)=>b.n-a.n);
      if(candidates.length===1||candidates[0]!.n>candidates[1]!.n)picked=candidates[0];
    }
    return picked?{value:picked.value,source:picked.source,label,selected:picked.n,total:v.denominator??v.eligible??0}:null;
  }
  return {attention,hasEvidence,category,gapLabel,cohort};
}

/** A bounded, non-sensitive projection of the reviewed register. Validation goals
 * remain distinct from a daily prevalence target and never activate an alert. */
export function makeAuditTargetReview(register:any) {
  if(register?.version!=='certscore.audit-target-proposal.v2'||!Array.isArray(register.items)||register.items.length>2000)throw Error('Unsupported audit target register');
  const goals:Record<string,any>={};
  const titles:Record<string,string>={integrity:'100% source/accounting correctness',fixture:'100% expected fixture results',semantic:'≥95% recall · ≥99% precision',coverage:'≥99% supported measurement completion',aro:'≥95% A/R/O agreement · ≤1% false claims',policy_capture:'≥83% gate capture · ≤3% reviewed misses',gpc_completion:'Completion and Wilson lower bound >95%'};
  for(const [id,g] of Object.entries(register.goals??{}) as [string,any][]){
    if(!titles[id]||typeof g.target!=='string'||typeof g.denominator!=='string'||typeof g.status!=='string')throw Error('Unsupported target goal');
    goals[id]={title:titles[id],status:g.status.startsWith('existing_')?'Existing scoped goal':'Proposed goal',target:g.target,denominator:g.denominator,verification:g.verification??'',source:g.source?String(g.source).split('/').slice(-1)[0]:undefined};
  }
  const items:Record<string,any>={};
  for(const r of register.items){
    const kind=r.kind==='state'?'metric':r.kind;
    if(!['metric','quantity','finding'].includes(kind)||typeof r.id!=='string')throw Error('Unsupported target item');
    const key=kind+':'+r.id;if(items[key])throw Error('Duplicate target item');
    // This adapter supports the reviewed proposal only. A future calibrated
    // daily target needs an explicit cohort, unit and validation contract.
    if(r.healthyDailyTarget!=null||r.healthyDailyRange!=null)throw Error('Calibrated target needs a reviewed presentation contract');
    const ids=r.recommendedGoalIds??[];
    if(!Array.isArray(ids)||ids.some((id:string)=>!goals[id]))throw Error('Unknown target goal');
    const primary=r.id.replace(/^sealed\./,'')==='outcome'&&ids.includes('integrity')?'integrity':
      ['aro','policy_capture','gpc_completion','coverage','semantic','fixture','integrity'].find(id=>ids.includes(id));
    items[key]={dailyStatus:'Not calibrated',signalClass:r.signalClass,primaryGoal:primary,goalIds:ids,decision:r.targetDecision,scope:r.requirementsAndInterpretation,oracle:r.specificOracle,optimization:r.specificOptimization};
  }
  return {version:'certscore.audit-target-presentation.v1',status:'review_proposal_not_active_thresholds',sourceSha256:register.sourceSha256,registerVersion:register.version,goals,items};
}
