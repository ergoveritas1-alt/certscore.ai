"""Outcome-independent pilot evidence packets; no human decisions are generated."""
import json,csv,hashlib,sys
from pathlib import Path
root=Path(sys.argv[1]);mode=sys.argv[2] if len(sys.argv)>2 else 'pilot-v1'
seed='certscore-gpc-pilot-review-v1'
h=lambda value:hashlib.sha256((seed+'|'+value).encode()).hexdigest()
selected=sorted([r['site_id'] for r in csv.DictReader((root/'pilot_sites.csv').open())],key=h)[:10]
out=root/'private'/'review-packets'/mode;out.mkdir(parents=True,exist_ok=True)
def scrub(value):
 if isinstance(value,dict):return {k:scrub(v) for k,v in value.items() if 'gpc' not in k.lower() and k not in ('scanId','stateSha256','stateTransitions','acknowledgment')}
 if isinstance(value,list):return [scrub(v) for v in value]
 return value
key=[]
for i,site in enumerate(selected,1):
 files=sorted((root/'private'/mode).glob(site+'_*.json'),key=lambda p:h(p.stem))
 for j,p in enumerate(files,1):
  r=json.loads(p.read_text());label=f'packet_{i:02d}_visit_{j}';observed=r.get('observed',{})
  packet={'packetId':label,'sourceArtifactSha256':r.get('artifact',{}).get('sha256'),'status':r['status'],'requests':[{k:v for k,v in q.items() if k not in ('secGpc','userAgent')} for q in observed.get('requests',[])],'document':observed.get('document'),'snapshots':[{'horizonMs':s['horizonMs'],'startedAt':s['startedAt'],'completedAt':s['completedAt'],'documentToken':s['documentToken'],'documentStable':s['documentStable'],'access':s['access'],'cookies':s['cookies'],'frames':[{k:v for k,v in f.items() if k not in ('navigatorPresent','navigatorValue')} if f else None for f in s['frames']],'semantic':scrub(s['semantic'])} for s in observed.get('snapshots',[])]}
  (out/(label+'.json')).write_text(json.dumps(packet,indent=2)+'\n');key.append({'packetId':label,'visitId':p.stem,'condition':r['visit']['condition']})
(root/'private'/f'{mode}_review-unblinding-key.json').write_text(json.dumps(key,indent=2)+'\n')
(out/'README.md').write_text('Evidence-only pilot review packets. Selection seed: '+seed+'. Ten pilot sites selected by hash priority before any effect-based selection; missing/failed visits remain represented. Taxonomy classifications are visible because classification correctness is the review target; treatment configuration, delivery readback and derived paired differences are omitted. Site/vendor URLs may identify sites. A separate delivery reviewer uses the original retained artifact and is not treatment-blind. No human adjudication is implied by packet generation.\n')
print(json.dumps({'selectedSites':len(selected),'packets':len(key)}))
