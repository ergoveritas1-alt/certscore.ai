from pathlib import Path
import json,hashlib,datetime
out=Path(__file__).resolve().parent
summary=json.loads((out/'summary-verified.json').read_text())
assert len(summary['visits'])==16 and all(v['status']=='completed' for v in summary['visits'])
assert len(summary['results'])==48
metrics=[]
for host in sorted({v['url'] for v in summary['visits']}):
 row={'url':host,'versions':{}}
 for version in ['baseline','candidate']:
  visits=[v for v in summary['visits'] if v['url']==host and v['version']==version]
  lanes=[r for r in summary['results'] if r['url']==host and r['version']==version]
  row['versions'][version]={a:{'sessions':len([r for r in lanes if r['lane']==a]),'completedClicks':sum(r.get('click',{}).get('outcome')=='completed' for r in lanes if r['lane']==a),'confirmed':sum(r.get('registration',{}).get('status')=='confirmed' for r in lanes if r['lane']==a),'outcomes':[{'repeat':r['repeat'],'click':r.get('click',{}).get('outcome'),'registration':r.get('registration',{}).get('status'),'reason':r.get('registration',{}).get('reason'),'recipe':r.get('actionControlProof',{}).get('recipeId'),'actionSemantics':r.get('actionControlProof',{}).get('actionSemantics'),'durationMs':r['durationMs'],'limitations':r.get('limitations',[])} for r in lanes if r['lane']==a]} for a in ['accept','reject']}
 metrics.append(row)
contacts=[]
trial_counts=[]
for name in ['pass1-summary.json','summary-final.json','summary-verified.json']:
 s=json.loads((out/name).read_text())
 trial_counts.append({'summary':name,'visits':len(s['visits']),'contacts':len(s['results']),'purpose':'final_comparison' if name=='summary-verified.json' else 'failed_diagnostic_iteration'})
 for r in s['results']:
  contacts.append({k:r[k] for k in ['url','scanId','startedAt','completedAt','scannerRuntimeStarted','status','runtime'] if k in r})
contacts.sort(key=lambda r:(r['startedAt'],r['scanId']))
assert len({r['scanId'] for r in contacts})==len(contacts)
now=datetime.datetime.now(datetime.timezone.utc).isoformat()
(out/'all-contacts-summary.json').write_text(json.dumps({'runKey':summary['runKey'],'generatedAt':now,'results':contacts},indent=2)+'\n')
(out/'metrics.json').write_text(json.dumps({'generatedAt':now,'localOnly':True,'populationEstimate':False,'protocol':'Fixed diagnostic comparison; two repeats per source and site; ABBA/BAAB; separate fresh consent/Accept/Reject sessions.','sites':metrics,'trials':trial_counts,'allContacts':len(contacts),'noGoContacts':sum(r.get('runtime',{}).get('noGoCandidate',False) for r in contacts)},indent=2)+'\n')
for r in metrics:print(r['url'],{v:{a:(r['versions'][v][a]['completedClicks'],r['versions'][v][a]['confirmed']) for a in ['accept','reject']} for v in ['baseline','candidate']})
print('allContacts',len(contacts))
