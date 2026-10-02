"""Frozen primary endpoint skeleton. No production access; reads immutable visit JSON."""
import csv,json,sys,statistics,hashlib,subprocess
from pathlib import Path
from collections import defaultdict,Counter
ENDPOINTS=('tracker_services','tracker_requests','advertising_services','advertising_requests','analytics_services','analytics_requests','third_party_requests')
def values(w):return dict(zip(ENDPOINTS,[len(w['trackers']['services']),w['trackers']['requests'],len(w['advertisingMarketing']['services']),w['advertisingMarketing']['requests'],len(w['analyticsReplay']['services']),w['analyticsReplay']['requests'],w['thirdPartyRequests']]))
def main(root,mode='pilot-v3'):
 subprocess.run(['node','-e','require(process.argv[1])',str((root/'study_runner/audit-results.cjs').resolve()),str(root.resolve()),mode],check=True,stdout=subprocess.DEVNULL)
 run=root/'private'/mode; records=[]
 for p in sorted(run.glob('site_*.json')):
  r=json.loads(p.read_text());assert r['visit']['visit_id']==p.stem;records.append(r)
 ids=[r['visit']['visit_id'] for r in records];assert len(ids)==len(set(ids))
 groups=defaultdict(list)
 for r in records:groups[(r['visit']['site_id'],r['visit']['design'],r['visit']['block'])].append(r)
 pairs=[];limitations=Counter()
 for key,rr in groups.items():
  if len(rr)!=2:limitations['missing_visit']+=1;continue
  rr.sort(key=lambda r:r['visit']['position']);aa=key[1]=='aa';a=rr[0] if aa else next((r for r in rr if r['visit']['condition']=='absent'),None);b=rr[1] if aa else next((r for r in rr if r['visit']['condition']=='enabled'),None)
  if not a or not b:limitations['invalid_assignment']+=1;continue
  for h in (1000,5000,10000):
   aw=next((w for w in a.get('derived',{}).get('windows',[]) if w['horizonMs']==h),None);bw=next((w for w in b.get('derived',{}).get('windows',[]) if w['horizonMs']==h),None)
   bound=a.get('observed',{}).get('document',{}).get('urlSha256')==b.get('observed',{}).get('document',{}).get('urlSha256')
   if not aw or not bw or not aw['complete'] or not bw['complete'] or not bound:limitations[f'ineligible_{h}']+=1;continue
   av,bv=values(aw),values(bw);row={'site_id':key[0],'design':key[1],'block':key[2],'assigned_order':a['visit']['assigned_order'],'horizon_ms':h}
   for e in ENDPOINTS:row.update({f'baseline_{e}':av[e],f'gpc_or_second_{e}':bv[e],f'delta_{e}':bv[e]-av[e]})
   for e in ['trackers','advertisingMarketing','analyticsReplay']:
    row[e+'_removed']=json.dumps(sorted(set(aw[e]['services'])-set(bw[e]['services'])));row[e+'_introduced']=json.dumps(sorted(set(bw[e]['services'])-set(aw[e]['services'])))
   pairs.append(row)
 root.joinpath('exports').mkdir(exist_ok=True)
 with (root/'exports'/f'{mode}_pairs.csv').open('w',newline='') as f:
  keys=list(pairs[0]) if pairs else ['site_id','design','block','assigned_order','horizon_ms']+[f'delta_{e}' for e in ENDPOINTS];w=csv.DictWriter(f,fieldnames=keys);w.writeheader();w.writerows(pairs)
 summary={'run':mode,'terminal_visits':len(records),'status':dict(Counter(r.get('status') for r in records)),'pair_exclusions':dict(limitations),'primary_endpoint_names':ENDPOINTS,'descriptive':{}}
 for design in ['primary','aa']:
  pp=[r for r in pairs if r['design']==design and r['horizon_ms']==10000]
  summary['descriptive'][design]={e:{'n':len(pp),'mean_delta':statistics.mean([r['delta_'+e] for r in pp]) if pp else None,'median_delta':statistics.median([r['delta_'+e] for r in pp]) if pp else None,'decrease':sum(r['delta_'+e]<0 for r in pp),'unchanged':sum(r['delta_'+e]==0 for r in pp),'increase':sum(r['delta_'+e]>0 for r in pp)} for e in ENDPOINTS}
 (root/'exports'/f'{mode}_summary.json').write_text(json.dumps(summary,indent=2)+'\n');print(json.dumps({'visits':len(records),'eligible_endpoint_pairs':len(pairs),'primary_10s_pairs':sum(r['design']=='primary' and r['horizon_ms']==10000 for r in pairs)}))
if __name__=='__main__':main(Path(sys.argv[1]),sys.argv[2] if len(sys.argv)>2 else 'pilot-v3')
