import json,pathlib,hashlib,statistics,datetime,subprocess,collections,math
root=pathlib.Path.cwd();base=root/'artifacts/ar-live-paired-20261009';out=root/'docs/certscore-v2/calibration-runs/2026-10-09-ar-live-paired';out.mkdir(parents=True,exist_ok=True)
read=lambda p:json.loads(pathlib.Path(p).read_text())
main=read(base/'summary.json');repair=read(base/'action-repair-summary.json');assert len(main['visits'])==48 and len(repair['visits'])==15 and all(v.get('completedAt') for v in main['visits']+repair['visits'])
repairs={(v['url'],v['version'],v['repeat']):v for v in repair['visits']}
noGo=read(base/'reviewed-no-go.json')
expected={__import__('urllib.parse',fromlist=['urlparse']).urlparse(v['url']).hostname:{'accept':True,'reject':not any(x in v['url'] for x in ['upshow.tv','gotokyo.org'])} for v in main['visits'] if 'nomura.com' not in v['url']}
visits=[];actions=[];invalid=[];handoffs=[]
def ms(s):return datetime.datetime.fromisoformat(s.replace('Z','+00:00')).timestamp()*1000
for v in main['visits']:
 d=read(root/v['resultPath']);host=__import__('urllib.parse',fromlist=['urlparse']).urlparse(v['url']).hostname
 bad=any('scan_identity_mismatch' in x for l in d['lanes'] for x in l.get('limitations',[]))
 if bad:invalid.append({k:v[k] for k in ['url','version','repeat']})
 if host in noGo:continue
 c=next(l for l in d['lanes'] if l['lane']=='consent');packet=read((root/v['resultPath']).parent/'consent/CanonicalEvidenceBundle.json');g=read((root/v['resultPath']).parent/'consent/ConsentControlGeometryEvidence.json')
 obs=c['observations'][0];geometryRef=g.get('screenshotArtifactRef');images={i['path']:i for i in c['screenshots']};im=images.get(geometryRef);identity=g.get('documentIdentity');bound=bool(im and identity and im.get('documentIdentity')==identity and im.get('url')==g.get('pageUrl'))
 reference=geometryRef or c['screenshots'][0]['path'];known=expected[host]
 row={k:v[k] for k in ['url','version','repeat','resultPath']};row.update({'host':host,'expectedVisible':known,'observed':{'accept':obs['accept'],'reject':obs['reject']},'captureStatus':obs.get('captureStatus'),'inventoryOutcome':obs.get('inventoryOutcome'),'visualReview':{'reviewer':'Codex primary agent','provenance':'model_assisted_visual_review','reference':str(pathlib.Path(reference).relative_to(root)),'humanAdjudicated':False,'independentlyReviewed':False},'geometryScreenshotBound':bound,'sameDocumentSnapshot':all(x.get('documentIdentity')==obs.get('documentIdentity') for x in c.get('domSnapshots',[])),'passiveDurationMs':c['durationMs']});visits.append(row)
 for h in d['handoffs']:
  handoffs.append({'version':v['version'],'url':v['url'],'repeat':v['repeat'],'artifactId':h['artifactId'],'lagMs':round(ms(d['startedAt'])+h['handedOffAtMs']-ms(packet['startedAt'])-h['capturedAtMs'],3)})
 av=repairs.get((v['url'],v['version'],v['repeat']),v);ad=read(root/av['resultPath']);assert not any('scan_identity_mismatch' in x for l in ad['lanes'] for x in l.get('limitations',[]))
 for lane in ['accept','reject']:
  l=next(l for l in ad['lanes'] if l['lane']==lane);p=(root/av['resultPath']).parent/lane/('PostAcceptEvidencePacket.json' if lane=='accept' else 'PostRefusalEvidencePacket.json');ap=read(p);proof=ap.get('actionControlProof') or {};reg=l.get('registration') or {};click=(l.get('click') or {}).get('outcome');after=ap.get('afterActionCapture');proofOk=bool(proof.get('action')==lane and proof.get('authorizedTargetSha256')==ap.get('exactTargetSha256') and proof.get('visible') and proof.get('enabled') and proof.get('uniquelyActionable'))
  complete=bool(after and after.get('activationStatus')=='completed' and after.get('action')==lane and after.get('actionDispatchedAtMs')==reg.get('actionDispatchedAtMs') and after.get('stopReason')=='window_elapsed' and after.get('storageSnapshotRetained') and after.get('requestsDropped')==0 and after.get('captureEndedAtMs',0)-after.get('actionDispatchedAtMs',0)>=after.get('requestedWindowMs',math.inf))
  actions.append({'url':v['url'],'version':v['version'],'repeat':v['repeat'],'lane':lane,'passiveControlVisible':known[lane],'measurementStratum':'action_only_repair' if av is not v else 'original_three_lane_visit','packet':str(p.relative_to(root)),'resolver':l.get('resolver'),'click':click,'proofValid':proofOk,'registration':reg.get('status'),'registrationReason':reg.get('reason'),'confirmedWitnesses':reg.get('witnesses') if reg.get('status')=='confirmed' else [],'fullWindowUnconfirmedCapture':complete,'captureStopReason':after.get('stopReason') if after else None,'limitations':l.get('limitations'),'durationMs':l.get('durationMs')})
assert len(visits)==44 and len(actions)==88
metrics={}
for ver in ['baseline','candidate']:
 vs=[v for v in visits if v['version']==ver];ats=[a for a in actions if a['version']==ver];truth=pred=tp=fp=fn=tn=0
 for v in vs:
  for a in ['accept','reject']:
   t=v['expectedVisible'][a];p=v['observed'][a];tp+=t and p;fp+=not t and p;fn+=t and not p;tn+=not t and not p
 m={'usableVisits':len(vs),'decisions':len(vs)*2,'truePositive':tp,'falsePositive':fp,'falseNegative':fn,'trueNegative':tn,'visualAgreement':(tp+tn)/(len(vs)*2),'visibleControlRecall':tp/(tp+fn),'acceptIdentified':sum(v['observed']['accept'] for v in vs),'acceptVisuallyPresent':sum(v['expectedVisible']['accept'] for v in vs),'rejectIdentified':sum(v['observed']['reject'] for v in vs),'rejectVisuallyPresent':sum(v['expectedVisible']['reject'] for v in vs),'geometryScreenshotBound':sum(v['geometryScreenshotBound'] for v in vs),'passiveDurationMedianMs':statistics.median(v['passiveDurationMs'] for v in vs),'actions':{}}
 for lane in ['accept','reject']:
  rows=[a for a in ats if a['lane']==lane];clicked=[a for a in rows if a['click']=='completed'];unconfirmed=[a for a in clicked if a['registration']=='unconfirmed']
  m['actions'][lane]={'sessions':len(rows),'passiveVisibleSessions':sum(a['passiveControlVisible'] for a in rows),'completedClicks':len(clicked),'verifiedClickProofs':sum(a['proofValid'] for a in clicked),'confirmedRegistrations':sum(a['registration']=='confirmed' for a in rows),'unconfirmedCompletedClicks':len(unconfirmed),'fullWindowCapturesAmongUnconfirmed':sum(a['fullWindowUnconfirmedCapture'] for a in unconfirmed),'notAttemptedReasons':dict(collections.Counter((a.get('registrationReason') or 'unknown') for a in rows if a['click']!='completed'))}
 metrics[ver]=m
contacts=[]
for a in main['results']+repair['results']:
 host=__import__('urllib.parse',fromlist=['urlparse']).urlparse(a['url']).hostname
 r={k:a[k] for k in ['url','scanId','startedAt','completedAt','scannerRuntimeStarted','status','version','repeat','lane']}
 if host in noGo:r['runtime']={'noGoCandidate':True,'noGoReasons':[noGo[host]['reason']]}
 elif a.get('runtime'):r['runtime']=a['runtime']
 contacts.append(r)
allcontacts={'runKey':main['runKey'],'generatedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'results':contacts}
(base/'all-contacts-summary.json').write_text(json.dumps(allcontacts,indent=2)+'\n');assert len(contacts)==174
# Hash frozen scanner sources and timestamps. Baseline reproducible from HEAD, candidate manifest records exact file bytes.
sourceManifests={}
for ver,src in [('baseline',base/'baseline'),('candidate',root)]:
 files=[]
 for package in ['certscore-scan-core','certscore-contracts','shared']:
  for p in sorted((src/'packages'/package/'src').rglob('*')):
   if p.is_file():files.append({'path':str(p.relative_to(src)),'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'mtimeMs':p.stat().st_mtime*1000})
 serial='\n'.join(x['path']+':'+x['sha256'] for x in files)
 sourceManifests[ver]={'sha256':hashlib.sha256(serial.encode()).hexdigest(),'fileCount':len(files),'files':files,'latestMtimeMs':max(x['mtimeMs'] for x in files)}
start=min(ms(v['startedAt']) for v in main['visits'])
summary={'runKey':main['runKey'],'generatedAt':allcontacts['generatedAt'],'localOnly':True,'deploymentPerformed':False,'baselineCommit':subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),'sourceHashes':{k:{x:y for x,y in v.items() if x!='files'} for k,v in sourceManifests.items()},'candidateSourceMtimePredatesAllVisits':sourceManifests['candidate']['latestMtimeMs']<start,'protocol':main['protocol'],'plannedSites':12,'usableSites':11,'originalVisits':48,'usablePassiveVisits':44,'originalSessions':144,'actionRepairVisits':15,'actionRepairSessions':30,'totalContactSessions':174,'harnessInvalidOriginalActionVisits':invalid,'excludedSites':noGo,'metrics':metrics,'methodology':{'visualLabels':'Primary Codex agent model-assisted visual inspection of all44 usable representative screenshots. No independent human adjudication. Missing Reject on partial inventory is not promoted to verified absence.','scope':'Local scanner control observations/actions, not AWS coordinator or customer API/report projection verification.','population':'Selected diagnostic sites; repeated visits are correlated; not an estimated production defect rate.','actionRepairs':'15 harness-invalid non-Nomura visit action pairs rerun after corrected parentScanId binding. Repairs are action-only and a distinct stratum, not same-time passive/action observations. No product sources changed during batch.','cost':'No recurring change or paid model calls. Central contact history/export/persistence estimated under $0.10 once.','screenshots':'Local captures, not production safety-approved assets.','handoff':'Clock-normalized per CanonicalEvidenceBundle.startedAt versus outer visit.startedAt; zero/submillisecond measurement noise possible.'},'unresolved':['Sodexo and Adecco newly recognized contextual necessary-only controls remain observation-only, so Reject action authorization still fails closed.','Receitas Nestle Portuguese Reject label remains below action confidence threshold.','GoTokyo action navigation times out despite passive banner capture.','Several completed clicks lack a verified semantic state receipt; do not treat as registered consent or refusal.','Nomura CloudFront403 was not classified no-go by scanner; reviewed exclusion and no-further-contact applied.'],'visits':visits,'actions':actions}
(out/'results.json').write_text(json.dumps(summary,indent=2)+'\n');(out/'source-manifests.json').write_text(json.dumps(sourceManifests,indent=2)+'\n');(out/'handoff-timing.json').write_text(json.dumps(handoffs,indent=2)+'\n')
for name in ['selection.json','reviewed-no-go.json']:(out/name).write_bytes((base/name).read_bytes())
for name in ['run.mts','visit.mts','repair-actions.mts','analyze.py']:(out/name).write_bytes((base/name).read_bytes())
print(json.dumps({k:summary[k] for k in ['metrics','candidateSourceMtimePredatesAllVisits','totalContactSessions']},indent=2))
for ver in ['baseline','candidate']:
 hs=[x['lagMs'] for x in handoffs if x['version']==ver];print(ver,'handoff median',statistics.median(hs),'max',max(hs))
