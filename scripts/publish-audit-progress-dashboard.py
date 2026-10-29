#!/usr/bin/env python3
"""Publish a verified local audit snapshot through an atomic latest symlink."""
import argparse,datetime,hashlib,json,os,pathlib,uuid

def digest(p):
    h=hashlib.sha256()
    with p.open('rb') as f:
        for b in iter(lambda:f.read(4*1024*1024),b''):h.update(b)
    return h.hexdigest()
def read(p):
    if p.stat().st_size>80_000_000:raise ValueError('Input exceeds bound')
    return json.loads(p.read_text())
def end(data):
    return max(datetime.datetime.fromisoformat(w['end'].replace('Z','+00:00')) for w in data['windows'])
def publish(run,root):
    root=root.resolve();run=run.resolve()
    if not run.is_relative_to(root/'runs'):raise ValueError('Dashboard must be inside audit runs')
    seal=read(run/'dashboard-seal.json');required={'dashboard.html','dashboard.json','daily-metrics.csv','daily-volumes.csv','exclusions.json'};verified={}
    for entry in seal['files']:
        p=pathlib.Path(entry['file']).resolve()
        if p.parent!=run or not p.is_file() or p.stat().st_size>80_000_000:raise ValueError('Output escapes snapshot or exceeds bound')
        if digest(p)!=entry['sha256'] or entry.get('bytes',p.stat().st_size)!=p.stat().st_size:raise ValueError('Output hash/size mismatch')
        verified[p.name]=entry['sha256']
    if not required.issubset(verified):raise ValueError('Required sealed outputs missing')
    data=read(run/'dashboard.json')
    if data.get('errors') or data.get('timezone')!='America/Los_Angeles' or 'Mac mini' not in data.get('cohort',''):raise ValueError('Dashboard cohort/source validation failed')
    caches=[s for s in data['sources'] if pathlib.Path(s['file']).name=='cache-manifest.json']
    if len(caches)!=1:raise ValueError('One fresh cache manifest required')
    cache=pathlib.Path(caches[0]['file'])
    if digest(cache)!=caches[0]['sha256']:raise ValueError('Cache manifest hash mismatch')
    manifest=read(cache)
    if manifest.get('sourceWrites')!=0 or manifest.get('counts',{}).get('invalid',0):raise ValueError('Cache refresh incomplete')
    if any(r.get('freshness') not in ['source_bytes_verified','source_metadata_unchanged','historical_cache_verified'] for r in manifest['receipts'] if r.get('state')=='copied'):raise ValueError('Cache freshness unavailable')
    latest=root/'latest';previous=None
    if latest.is_symlink():
        previous=latest.resolve()
        if not previous.is_relative_to(root/'runs'):raise ValueError('Existing latest target escapes audit runs')
        if end(read(previous/'dashboard.json'))>end(data):raise ValueError('Cannot replace a newer snapshot')
    elif latest.exists():raise ValueError('Latest path is not a managed symlink')
    receipt=run/'dashboard-publication.json'
    if receipt.exists() and latest.is_symlink() and latest.resolve()==run:return read(receipt)
    payload={'version':'certscore.mac-mini-progress-latest.v1','runId':run.name,'snapshotDirectory':str(run),'snapshotEndUtc':end(data).isoformat(),'publishedAtUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'includedRows':data['includedRows'],'files':verified,'previousDirectory':str(previous) if previous else None,'productionWrites':0,'scheduledInvocationsAdded':0}
    token=uuid.uuid4().hex;link=root/('.latest-'+token);pointer=root/'progress-dashboard-latest.json';temporary=root/('.progress-dashboard-latest-'+token+'.json')
    try:
        link.symlink_to(run,target_is_directory=True);temporary.write_text(json.dumps(payload,indent=2)+'\n')
        os.replace(link,latest);os.replace(temporary,pointer)
        if latest.resolve()!=run or read(pointer)['snapshotDirectory']!=str(run):raise ValueError('Latest publication did not verify')
        with receipt.open('x') as f:f.write(json.dumps(payload,indent=2)+'\n')
    finally:
        for p in [link,temporary]:
            if p.is_symlink() or p.exists():p.unlink()
    return payload
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--run',required=True);p.add_argument('--state-root',default='/Users/benmasek/WC01/artifacts/daily-scan-audit');a=p.parse_args()
    print(json.dumps(publish(pathlib.Path(a.run),pathlib.Path(a.state_root))))
