"""Quality-first pilot summary; preserves all assigned failures and exclusions."""
import json,csv,sys,statistics,math
from pathlib import Path
from collections import Counter
root=Path(sys.argv[1]);mode=sys.argv[2] if len(sys.argv)>2 else 'pilot-v3';records=[json.loads(p.read_text()) for p in sorted((root/'private'/mode).glob('site_*.json'))]
audit=json.loads((root/'exports'/f'{mode}_audit.json').read_text());pairs=list(csv.DictReader((root/'exports'/f'{mode}_pairs.csv').open()))
primary=[p for p in pairs if p['design']=='primary' and p['horizon_ms']=='10000'];aa=[p for p in pairs if p['design']=='aa' and p['horizon_ms']=='10000']
raw=[r for r in records if 'artifact' in r];durations=sorted(r['provenance']['totalDurationMs']/1000 for r in raw);per_site=Counter(p['site_id'] for p in primary)
q=lambda p:durations[min(len(durations)-1,math.ceil(len(durations)*p)-1)] if durations else None
out={'plannedVisits':98,'terminalVisits':len(records),'retainedArtifacts':len(raw),'status':dict(Counter(r['status'] for r in records)),'primary10sPairs':len(primary),'aa10sPairs':len(aa),'sitesWithTwoCompletePrimaryBlocks':sum(n==2 for n in per_site.values()),'runtimeSeconds':{'n':len(durations),'median':q(.5),'p95':q(.95),'max':max(durations) if durations else None,'mean':statistics.mean(durations) if durations else None},'compressedArtifactBytes':sum(r['artifact']['compressedBytes'] for r in raw),'observedMainPageBytes':sum(r['coverage']['transferredBytes'] for r in raw),'semanticSnapshotStatus':dict(Counter(s.get('semantic',{}).get('gppStatus','missing') if s.get('semantic') else 'missing' for r in raw for s in r['observed']['snapshots'])),'accessSnapshotStatus':dict(Counter(s['access']['status'] for r in raw for s in r['observed']['snapshots'])),'auditErrors':audit['errors']}
(root/'exports/pilot_operational_summary.json').write_text(json.dumps(out,indent=2)+'\n');print(json.dumps(out,indent=2))
