"""Export prespecified operational denominators without URLs or outcome-based selection."""
import csv,json,sys
from pathlib import Path
from collections import Counter
root=Path(sys.argv[1]);mode=sys.argv[2] if len(sys.argv)>2 else 'pilot-v3'
frame={r['site_id']:r for r in csv.DictReader((root/'sample_frame.csv').open())};pilot={r['site_id'] for r in csv.DictReader((root/'pilot_sites.csv').open())}
rows=[]
for a in csv.DictReader((root/'randomization.csv').open()):
 if mode.startswith('pilot') and a['site_id'] not in pilot:continue
 p=root/'private'/mode/(a['visit_id']+'.json');r=json.loads(p.read_text()) if p.exists() else {};obs=r.get('observed',{});prov=r.get('provenance',{});cov=r.get('coverage',{});row={k:a[k] for k in ['visit_id','site_id','design','block','position','condition','assigned_order']}
 row.update(rank_band=frame[a['site_id']]['rank_band'],status=r.get('status','not_terminal'),artifact_retained=bool(r.get('artifact')),source_sha256=r.get('artifact',{}).get('sha256',''),config_sha256=r.get('configSha256',''),started_at=prov.get('startedAt',''),completed_at=prov.get('completedAt',''),duration_ms=prov.get('totalDurationMs',''),request_attempts_retained=len(obs.get('requests',[])),requests_dropped=cov.get('requestsDropped',''),main_document_delivery_proof=bool(obs.get('delivery')),limitations=json.dumps(cov.get('limitations',[])))
 for h in (1000,5000,10000):
  w=next((w for w in r.get('derived',{}).get('windows',[]) if w['horizonMs']==h),{});s=next((s for s in obs.get('snapshots',[]) if s['horizonMs']==h),{})
  row[f'network_complete_{h}']=w.get('complete',False);row[f'snapshot_timing_bound_{h}']=w.get('snapshotComplete',False);row[f'access_{h}']=s.get('access',{}).get('status','unobserved');row[f'endpoint_lag_ms_{h}']=s.get('lagMs','');row[f'semantic_status_{h}']=(s.get('semantic') or {}).get('gppStatus','unobserved')
 rows.append(row)
(root/'exports').mkdir(exist_ok=True)
with (root/'exports'/f'{mode}_intention_to_measure.csv').open('w',newline='') as f:
 w=csv.DictWriter(f,fieldnames=list(rows[0]));w.writeheader();w.writerows(rows)
print(json.dumps({'assignedVisits':len(rows),'terminalVisits':sum(r['status']!='not_terminal' for r in rows),'statuses':dict(Counter(r['status'] for r in rows))}))
