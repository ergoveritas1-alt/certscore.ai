"""Offline launch audit. Run from repository root; never modifies the frozen research."""
import collections, csv, hashlib, json, subprocess, tempfile, zipfile
from pathlib import Path
root=Path.cwd(); source=root/'artifacts/research-analysis/session-replay-production-5000'
with tempfile.TemporaryDirectory() as scratch:
 p=Path(scratch)
 for name in ['analyze_session_replay.py','analysis_input.jsonl']:
  (p/name).write_bytes((source/name).read_bytes())
 subprocess.run(['python3',str(p/'analyze_session_replay.py')],check=True,stdout=subprocess.DEVNULL)
 outputs=['session_replay_domains.csv','session_replay_vendors.csv','session_replay_forms.csv','statistics.json']
 for name in outputs: assert (source/name).read_bytes()==(p/name).read_bytes(),name
 s=json.loads((p/'statistics.json').read_text())
 rows=list(csv.DictReader((p/'session_replay_domains.csv').open()))
 positive=[r for r in rows if r['replay_state']=='observed']
 assert len(rows)==3199 and len(positive)==383
 services=collections.Counter(v for r in positive for v in r['services'].split(';'))
 assert services=={'Microsoft Clarity':265,'Hotjar':116,'Contentsquare':18,'FullStory':8,'Quantum Metric':5}
 forms=[r for r in positive if r['form_evidence_usable']=='True']; copresent=[r for r in forms if r['form_same_page_request']=='True']
 comparison=[r for r in rows if r['replay_state']=='not_observed' and r['form_evidence_usable']=='True']
 assert (len(forms),len(copresent),len(comparison),sum(int(r['form_count'])>0 for r in comparison))==(380,191,2781,1331)
 email=sum('email' in r['field_categories'].split(';') for r in copresent); assert email==55
 # Conservatively remove EVERY date_of_birth label, including the audited false positive.
 inputs=[json.loads(l) for l in (p/'analysis_input.jsonl').read_text().splitlines()]; changed=0
 for x in inputs:
  for form in (x.get('form_inventory') or {}).get('forms',[]):
   for field in form['fields']:
    if field['category']=='date_of_birth': field['category']='unknown'; changed+=1
 (p/'analysis_input.jsonl').write_text('\n'.join(json.dumps(x) for x in inputs))
 subprocess.run(['python3',str(p/'analyze_session_replay.py')],check=True,stdout=subprocess.DEVNULL)
 after=json.loads((p/'statistics.json').read_text())
 for key in ['total','usable','observed','form_eligible','same_page_forms']: assert after['domains'][key]==s['domains'][key]
 assert after['form_comparison']==s['form_comparison']
 assert [(v['service'],v['domains']) for v in after['vendors']]==[(v['service'],v['domains']) for v in s['vendors']]
 archive=zipfile.ZipFile(source/'session_replay_research_shareable.zip')
 for name in outputs+['analysis_input.jsonl','analyze_session_replay.py']:
  assert archive.read(name)==(source/name).read_bytes(), 'archive drift: '+name
 data={'selected':5000,'completed':s['successful'],'usableExecutions':s['executions']['usable'],'unknownExecutions':s['executions']['unknown'],'domains':len(rows),'positive':len(positive),'positiveFormsEvaluable':len(forms),'positiveForms':len(copresent),'comparisonEvaluable':len(comparison),'comparisonForms':1331,'emailDomains':email,'services':[{'name':k,'domains':v} for k,v in services.most_common()],'firstCreated':s['first_created'],'lastCreated':s['last_created'],'cutoff':'2026-10-01T08:30:00Z'}
 destination=root/'apps/web/lib/marketing/session-replay-study-data.json'
 if destination.exists(): assert json.loads(destination.read_text())==data, 'published aggregate drift'
 else: destination.write_text(json.dumps(data,indent=2)+'\n')
 audit={'result':'PASS','method':'Offline full reproduction, independent CSV aggregation, ZIP comparison, removal of all date_of_birth labels','sourceInputSHA256':hashlib.sha256((source/'analysis_input.jsonl').read_bytes()).hexdigest(),'matchingOutputs':outputs,'dateOfBirthLabelsRemoved':changed,'mainServiceAndFormsResultsUnchanged':True,'publishedPercentages':{'replay':f'{383/3199*100:.1f}%','clarity':f'{265/383*100:.1f}%','forms':f'{191/380*100:.1f}%','comparison':f'{1331/2781*100:.1f}%','email':f'{55/191*100:.1f}%'},'publicData':data,'archivePublished':False}
 (root/'artifacts/releases/session-replay/data-verification.json').write_text(json.dumps(audit,indent=2)+'\n')
 print(json.dumps({'result':audit['result'],'percentages':audit['publishedPercentages'],'removedLabels':changed}))
