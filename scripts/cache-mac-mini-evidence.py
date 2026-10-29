#!/usr/bin/env python3
"""Read-only bounded local evidence cache. Never changes bot data."""
import argparse, concurrent.futures, datetime, hashlib, json, os, pathlib

def sha(path):
    h=hashlib.sha256()
    with open(path,'rb') as f:
        for b in iter(lambda:f.read(4*1024*1024),b''): h.update(b)
    return h.hexdigest()
def utc(value):
    if not value:return None
    try:
        parsed=datetime.datetime.fromisoformat(value.replace('Z','+00:00'))
        return parsed.astimezone(datetime.timezone.utc) if parsed.tzinfo else None
    except (ValueError,TypeError,AttributeError):return None
def copy_exports(source,out,start,end,reuse=None,refresh_ids=()):
    evidence=out/'evidence';evidence.mkdir(parents=True,exist_ok=True)
    prior_receipts={};prior_end=None;known_old=set();refresh_ids=set(refresh_ids)
    if reuse and (reuse/'cache-manifest.json').is_file():
        prior_manifest=json.loads((reuse/'cache-manifest.json').read_text())
        prior_receipts={r['scanId']:r for r in prior_manifest.get('receipts',[]) if r.get('state') in ['copied','outside_scan_window']}
        prior_end=utc(prior_manifest.get('end'));known_old=set(prior_manifest.get('oldSourceNames',[]))
    def historical(r):
        created=utc(r.get('scanCreatedAt'))
        return bool(prior_end and created and start<=created<end and created<prior_end-datetime.timedelta(hours=48) and r.get('state')=='copied' and r.get('scanId') not in refresh_ids and r.get('scanStatus') in ['completed','completed_limited','failed','expired','no_go'])
    def signature(info):return {'sizeBytes':info.st_size,'mtimeNs':info.st_mtime_ns,'ctimeNs':info.st_ctime_ns}
    candidates=[];old=0;seen=set();duplicates=0;older_names=set()
    def discover(entry):
        if entry.is_symlink() or not entry.name.endswith('.json') or len(entry.name)!=41:return ('skip',None)
        if not all(c in '0123456789abcdef-' for c in entry.name[:-5].lower()):return ('skip',None)
        prior_row=prior_receipts.get(entry.name[:-5],{});created=utc(prior_row.get('scanCreatedAt'));candidate=pathlib.Path(entry.path)
        if entry.name in known_old or created and created<start:return ('older',candidate)
        if historical(prior_row) and reuse and (reuse/'evidence'/entry.name).is_file():return ('candidate',candidate)
        try:
            info=entry.stat()
            if info.st_mtime < start.timestamp()-2*86400:return ('older',candidate)
            if info.st_size>6*1024*1024:return ('skip',None)
            return ('candidate',pathlib.Path(entry.path))
        except OSError:return ('skip',None)
    with os.scandir(source/'evidence') as entries, concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        for n,(kind,candidate) in enumerate(pool.map(discover,entries),1):
            if kind=='candidate':
                if candidate.name in seen:duplicates+=1
                else:seen.add(candidate.name);candidates.append(candidate)
            elif kind=='older':old+=1;older_names.add(candidate.name)
            if n%2000==0:print(json.dumps({'phase':'metadata_inventory','accounted':n}),flush=True)
    for scan_id,r in prior_receipts.items():
        name=scan_id+'.json'
        if historical(r) and name not in seen and reuse and (reuse/'evidence'/name).is_file():
            seen.add(name);candidates.append(source/'evidence'/name)
    print(json.dumps({'phase':'candidate_inventory','candidates':len(candidates),'olderMtimeCandidatesExcluded':old}),flush=True)
    def copy(src):
        scan_id=src.stem;dst=evidence/src.name
        try:
            prior=(reuse/'evidence'/src.name) if reuse else None
            prior_receipt=prior_receipts.get(scan_id,{})
            cached_history=historical(prior_receipt) and prior and prior.is_file()
            source_stat=prior_receipt.get('sourceStat') if cached_history else signature(src.stat())
            if source_stat and source_stat['sizeBytes']>6*1024*1024:raise ValueError('Source exceeds byte bound')
            unchanged=not cached_history and prior_receipt.get('sourceStat')==source_stat and prior and prior.is_file()
            b=prior.read_bytes() if cached_history or unchanged else src.read_bytes()
            if not cached_history and signature(src.stat())!=source_stat:raise ValueError('Source changed during read; retry on next refresh')
            if (cached_history or unchanged) and (hashlib.sha256(b).hexdigest()!=prior_receipt.get('sha256') or len(b)!=prior_receipt.get('bytes')):raise ValueError('Prior cache hash/size mismatch')
            value=json.loads(b)
            if (value.get('scanId') or value.get('scan_id'))!=scan_id:raise ValueError('Export identity mismatch')
            created=utc((value.get('timestamps') or {}).get('createdAt'))
            if not created:return {'scanId':scan_id,'state':'scan_date_unavailable'}
            if not start<=created<end:return {'scanId':scan_id,'state':'outside_scan_window','scanCreatedAt':created.isoformat()}
            digest=hashlib.sha256(b).hexdigest()
            reuse_verified=bool(prior and prior.is_file() and prior_receipt.get('sha256')==digest and prior_receipt.get('bytes')==len(b) and sha(prior)==digest)
            if not dst.exists():
                part=dst.with_suffix('.partial')
                if reuse_verified:
                    try:os.link(prior,part)
                    except OSError:part.write_bytes(b)
                else:part.write_bytes(b)
                os.replace(part,dst)
            return {'scanId':scan_id,'state':'copied','sha256':digest,'bytes':len(b),'source':str(src),'file':str(dst),'scanCreatedAt':created.isoformat(),'site':value.get('domain'),'scanStatus':value.get('scanStatus'),'dateBasis':'canonical_created_at','sourceStat':source_stat,'freshness':'historical_cache_verified' if cached_history else 'source_metadata_unchanged' if unchanged else 'source_bytes_verified','cacheBytesReused':reuse_verified}
        except Exception as e:return {'scanId':scan_id,'state':'invalid','reason':str(e)}
    receipts=[]
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        for result in pool.map(copy,candidates):
            receipts.append(result)
            if len(receipts)%250==0:
                print(json.dumps({'phase':'copy_exports','accounted':len(receipts),'total':len(candidates)}),flush=True)
                (out/'cache-progress.json').write_text(json.dumps({'accounted':len(receipts),'total':len(candidates)})+'\n')
    result={'version':'certscore.mac-mini-evidence-cache.v1','start':start.isoformat(),'end':end.isoformat(),'source':str(source),'selection':'mtime candidate discovery with 48-hour cushion; exact canonical scan-created timestamps validate inclusion','attemptInventoryComplete':False,'discovery':{'candidateFiles':len(candidates),'olderMtimeCandidatesExcluded':old,'duplicateNamesIgnored':duplicates},'receipts':receipts,'counts':{state:sum(r['state']==state for r in receipts) for state in sorted({r['state'] for r in receipts})},'cachedBytes':sum(r.get('bytes',0) for r in receipts),'sourceWrites':0,'canaries':'Cached as source when present; excluded from dashboard'}
    result['oldSourceNames']=sorted(older_names);result['incrementalPolicy']='Reuse verified terminal history; metadata-check recent 48h and pending IDs; fetch only new/missing/changed exports'
    (out/'cache-manifest.json').write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps({**{k:v for k,v in result.items() if k not in ['receipts','oldSourceNames']},'knownOldSourceNames':len(older_names)}),flush=True)

def main():
    p=argparse.ArgumentParser();p.add_argument('--source',required=True);p.add_argument('--out',required=True);p.add_argument('--start',required=True);p.add_argument('--end',required=True);p.add_argument('--exports-only',action='store_true');p.add_argument('--reuse');p.add_argument('--refresh-ids');a=p.parse_args()
    source=pathlib.Path(a.source).resolve();out=pathlib.Path(a.out).resolve();start=utc(a.start);end=utc(a.end)
    if not start or not end or not start<end or (end-start).total_seconds()>32*86400:raise ValueError('Use a bounded one-month window')
    if out==source or source in out.parents:raise ValueError('Cache must be outside the bot source')
    out.mkdir(parents=True,exist_ok=True)
    if (out/'cache-manifest.json').exists():raise ValueError('Use a fresh output directory; sealed cache manifests are immutable')
    refresh=json.loads(pathlib.Path(a.refresh_ids).read_text()) if a.refresh_ids else []
    if not isinstance(refresh,list) or len(refresh)>5000 or any(not isinstance(x,str) or len(x)!=36 or any(c not in '0123456789abcdef-' for c in x.lower()) for x in refresh):raise ValueError('Bounded UUID refresh list required')
    return copy_exports(source,out,start,end,pathlib.Path(a.reuse).resolve() if a.reuse else None,refresh)
if __name__=='__main__':main()
