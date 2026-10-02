import csv,json,statistics,math
from pathlib import Path
from collections import Counter
R=Path('artifacts/research/gpc-controlled-study-2026');P=Path('artifacts/research-analysis/gpc-production-20260930')
r=json.loads((R/'private/calibration-records.json').read_text());allrows=list(csv.DictReader((P/'gpc_executions.csv').open()));cohort=[x for x in allrows if x['primary_stable_period']=='True' and x['known_canary_or_internal']=='False']
def dist(v):
 v=sorted(v)
 return {'n':len(v),**{k:v[min(len(v)-1,math.ceil(p*len(v))-1)] if v else None for k,p in [('median',.5),('p75',.75),('p90',.9),('p95',.95),('p99',.99)]},'mean':statistics.mean(v) if v else None}
metrics=['requests','thirdParty','trackers.requests','trackers.services','advertising.requests','advertising.services','analytics.requests','analytics.services','cookieWriteEvents']
def get(x,k):
 for z in k.split('.'):x=x[z]
 return x
windows=[]
for lane in ['baseline','gpc']:
 for h in [250,500,1000,2000,5000,10000]:
  rr=[w for x in r if x['lane']==lane for w in x['windows'] if w['horizonMs']==h]
  for m in metrics:windows.append({'lane':lane,'horizon_ms':h,'metric':m,**dist([get(w,m) for w in rr])})
with (R/'calibration_activity.csv').open('w') as f:
 w=csv.DictWriter(f,fieldnames=list(windows[0]));w.writeheader();w.writerows(windows)
timings=[]
for lane in ['baseline','gpc']:
 for label in sorted(set(k for x in r for k in x['timing'])):timings.append({'lane':lane,'metric_ms':label,**dist([x['timing'][label] for x in r if x['lane']==lane and label in x['timing'] and x['timing'][label]>=0])})
with (R/'calibration_timing.csv').open('w') as f:
 w=csv.DictWriter(f,fieldnames=list(timings[0]));w.writeheader();w.writerows(timings)
def failure(x):
 return {'bot_challenge':any(x[k+'_access_outcome']=='bot_challenge' for k in ['baseline','gpc']),
 'access_denied':any(x[k+'_access_outcome']=='access_denied' for k in ['baseline','gpc']),
 'navigation_failed':any(x[k+'_access_outcome']=='navigation_failed' for k in ['baseline','gpc']),
 'blank_or_unusable':any(x[k+'_access_outcome']=='blank_or_unusable' for k in ['baseline','gpc']),
 'document_mismatch':'document_mismatch' in x['strict_limitation_keys'] or 'context_or_document_mismatch' in x['bounded_limitation_keys'],
 'delivery_not_strictly_verified':x['delivery_status']!='verified',
 'request_retention_limit':any(k in x['bounded_limitation_keys'] for k in ['retained_request_set_incomplete','request_set_unverified']),
 'capture_incomplete': 'capture_incomplete' in x['bounded_limitation_keys'],
 'semantic_not_observed':x['gpc_semantic_probe']!='observed',
 'network_pair_usable':x['usable_domain_observation']=='True'}
bands=[]
for band in ['all']+sorted(set(x['rank_band'] or 'unavailable' for x in cohort)):
 rr=cohort if band=='all' else [x for x in cohort if (x['rank_band'] or 'unavailable')==band]
 bands.append({'rank_band':band,'n':len(rr),**{k:sum(failure(x)[k] for x in rr) for k in failure(cohort[0])}})
with (R/'calibration_attrition.csv').open('w') as f:
 w=csv.DictWriter(f,fieldnames=list(bands[0]));w.writeheader();w.writerows(bands)
stats={'lane_n':dict(Counter(x['lane'] for x in r)),'max_certified_horizon':{lane:dict(Counter(x.get('maxCertifiedHorizonMs',0) for x in r if x['lane']==lane)) for lane in ['baseline','gpc']},'timings':timings,'rank_bands':bands,'activity':windows,'semantic_status':dict(Counter(x['gpc_semantic_probe'] or 'missing' for x in cohort))}
(R/'calibration_statistics.json').write_text(json.dumps(stats,indent=2)+'\n')
print(json.dumps({'attrition':bands,'timings':[x for x in timings if x['metric_ms'] in ['worker total','page navigation','browser launch','commit from worker start']]},indent=2))

fractions=[]
for lane in ['baseline','gpc']:
 rr=[x for x in r if x['lane']==lane and any(w['horizonMs']==1000 for w in x['windows'])]
 for horizon in [250,500,1000]:
  for metric in metrics[:-1]:
   ratios=[]
   for x in rr:
    maximum=next(w for w in x['windows'] if w['horizonMs']==1000);w=next((w for w in x['windows'] if w['horizonMs']==horizon),None)
    if w and get(maximum,metric)>0:ratios.append(get(w,metric)/get(maximum,metric))
   fractions.append({'lane':lane,'horizon_ms':horizon,'metric':metric,'complete_1s_visits':len(rr),'positive_1s_denominator':len(ratios),**dist(ratios)})
with (R/'calibration_cumulative_fraction.csv').open('w') as f:
 w=csv.DictWriter(f,fieldnames=list(fractions[0]));w.writeheader();w.writerows(fractions)
