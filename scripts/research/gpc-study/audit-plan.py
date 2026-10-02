from pathlib import Path
import csv,collections,json
R=Path('artifacts/research/gpc-controlled-study-2026');rows=list(csv.DictReader((R/'randomization.csv').open()));sites=list(csv.DictReader((R/'sample_frame.csv').open()))
assert len(sites)==len({s['domain'] for s in sites})==len({s['site_id'] for s in sites})==1000
assert len(rows)==len({r['visit_id'] for r in rows})==4200
assert set(collections.Counter(s['rank_band'] for s in sites).values())=={50}
for b in ['1','2']:
 rr=[r for r in rows if r['block']==b];assert len(rr)==2000
 assert collections.Counter(r['condition'] for r in rr)=={'absent':1000,'enabled':1000}
 assert collections.Counter(r['assigned_order'] for r in rr)=={'AB':1000,'BA':1000}
for site in sites:
 rr=[r for r in rows if r['site_id']==site['site_id']];assert len(rr) in [4,6]
 for b in ['1','2']:
  pair=sorted([r for r in rr if r['block']==b],key=lambda r:int(r['position']));assert len(pair)==2
  assert ''.join('A' if r['condition']=='absent' else 'B' for r in pair)==pair[0]['assigned_order']
print('Frozen plan: 1000 domains, 20 × 50, 4000 primary + 200 A/A; balanced assignments and unique IDs verified')
