#!/usr/bin/env python3
"""CertScore.ai exact-ID cache refresh. No directory enumeration or source writes."""
import argparse, collections, concurrent.futures, datetime, hashlib, json, os, pathlib, re

UUID = re.compile(r'^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$', re.I)
def utc(v): return datetime.datetime.fromisoformat(v.replace('Z', '+00:00')).astimezone(datetime.timezone.utc)
def digest(b): return hashlib.sha256(b).hexdigest()
def read(p): return json.loads(p.read_text())
def signature(p):
    s=p.stat(); return {'sizeBytes':s.st_size,'mtimeNs':s.st_mtime_ns,'ctimeNs':s.st_ctime_ns}

def refresh(source, out, start, end, reuse, inventory_file):
    if (out/'cache-manifest.json').exists(): raise ValueError('Fresh immutable cache required')
    inventory=read(inventory_file); prior=read(reuse/'cache-manifest.json')
    if inventory.get('version')!='certscore.mac-mini-direct-id-inventory.v1' or inventory.get('readOnly') is not True: raise ValueError('Verified read-only ID inventory required')
    items=inventory['rows']
    if len(items)>5000 or len({r['scanId'] for r in items})!=len(items): raise ValueError('Duplicate or excessive IDs')
    if any(not UUID.fullmatch(r['scanId']) or r.get('isMacMini') is not True for r in items): raise ValueError('Original bot identity required')
    if utc(inventory['end'])!=end or utc(inventory['start'])>utc(prior['end']): raise ValueError('Inventory does not cover refresh delta')
    old={r['scanId']:r for r in prior['receipts'] if r['state']=='copied' and start<=utc(r['scanCreatedAt'])<end}
    selected={r['scanId']:r for r in items if start<=utc(r['created_at'])<end}
    ids=sorted(set(old)|set(selected)); target=out/'evidence';target.mkdir(parents=True,exist_ok=True)
    def copy(id):
        prev=old.get(id); row=selected.get(id); src=source/'evidence'/(id+'.json'); dst=target/(id+'.json'); cached=None;remote_bytes=False;remote_metadata=False
        try:
            if prev:
                p=pathlib.Path(prev['file'])
                if p.resolve()!=reuse/'evidence'/(id+'.json') or p.stat().st_size>6*1024*1024: raise ValueError('Prior path/bound mismatch')
                cached=p.read_bytes()
                if digest(cached)!=prev['sha256'] or len(cached)!=prev['bytes']: raise ValueError('Prior cache hash/size mismatch')
                value=json.loads(cached)
                if (value.get('scanId') or value.get('scan_id'))!=id: raise ValueError('Prior identity mismatch')
            else: value=None
            if row and row.get('isCanary') and not prev: return {'scanId':id,'state':'excluded_canary_or_test'}
            old_generation=(value or {}).get('meta',{}).get('reportProjectionSourceHash')
            stable=bool(prev and row and old_generation and old_generation==row.get('projection_source_hash') and utc(row['updated_at'])<=utc(prior['end']) and prev.get('scanStatus') in ['completed','completed_limited','failed','expired','no_go'])
            local_only=bool(prev and (not row or row.get('isCanary') or stable))
            remote_bytes=False;remote_metadata=False
            if local_only:
                b=cached; stat=prev.get('sourceStat'); freshness='historical_cache_verified'
            else:
                remote_metadata=True
                if src.is_symlink(): raise ValueError('Source symlink excluded')
                stat=signature(src)
                if stat['sizeBytes']>6*1024*1024: raise ValueError('Source exceeds byte bound')
                if prev and stat==prev.get('sourceStat'):
                    b=cached;freshness='source_metadata_unchanged'
                else:
                    b=src.read_bytes();remote_bytes=True;freshness='source_bytes_verified'
                if signature(src)!=stat: raise ValueError('Source changed during read')
                value=json.loads(b)
            if (value.get('scanId') or value.get('scan_id'))!=id: raise ValueError('Export identity mismatch')
            created=utc(value['timestamps']['createdAt'])
            if not start<=created<end: return {'scanId':id,'state':'outside_scan_window'}
            if row:
                original=utc(row['created_at'])
                if original.replace(microsecond=original.microsecond//1000*1000)!=created.replace(microsecond=created.microsecond//1000*1000): raise ValueError('Production/archive creation-time mismatch')
            h=digest(b); reused=bool(prev and h==prev['sha256'])
            if reused: os.link(pathlib.Path(prev['file']),dst)
            else:
                with dst.open('xb') as f:f.write(b)
            return {'scanId':id,'state':'copied','sha256':h,'bytes':len(b),'source':str(src),'file':str(dst),'scanCreatedAt':created.isoformat(),'site':value.get('domain'),'scanStatus':value.get('scanStatus'),'dateBasis':'canonical_created_at','sourceStat':stat,'freshness':freshness,'cacheBytesReused':reused,'remoteMetadataChecked':remote_metadata,'remoteBytesRead':remote_bytes,'canonicalGenerationUnchanged':stable,'originSelection':'production_original_creator' if row else 'retained_history'}
        except FileNotFoundError:
            if prev:return {'scanId':id,'state':'invalid','reason':'Previously cached export or selected replacement is unavailable; preserve prior snapshot','remoteMetadataChecked':remote_metadata,'remoteBytesRead':remote_bytes}
            return {'scanId':id,'state':'source_unavailable','reason':'Exact export file absent; no API regeneration or scan initiated','productionStatus':(row or {}).get('status'),'remoteMetadataChecked':remote_metadata,'remoteBytesRead':remote_bytes}
        except Exception as e:return {'scanId':id,'state':'invalid','reason':str(e),'remoteMetadataChecked':remote_metadata,'remoteBytesRead':remote_bytes}
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        receipts=[]
        for result in pool.map(copy,ids):
            receipts.append(result)
            if len(receipts)%250==0: print(json.dumps({'phase':'exact_id_cache','accounted':len(receipts),'total':len(ids)}),flush=True)
    counts=dict(collections.Counter(r['state'] for r in receipts));copied=[r for r in receipts if r['state']=='copied']
    manifest={'version':'certscore.mac-mini-evidence-cache.v1','start':start.isoformat(),'end':end.isoformat(),'source':str(source),'selection':'Bounded production original-creator IDs; exact file paths only. Verified local history and stable canonical generations reused.','attemptInventoryComplete':False,'discovery':{'mode':'production_exact_ids','directoryEnumerated':False,'candidateFiles':len(ids),'productionIds':len(items),'duplicateNamesIgnored':0},'receipts':receipts,'counts':counts,'cachedBytes':sum(r['bytes'] for r in copied),'sourceWrites':0,'oldSourceNames':prior.get('oldSourceNames',[]),'incrementalPolicy':'Only missing/new or changed selected exports read remotely; all unchanged history reused locally','directInventory':{'file':str(inventory_file),'sha256':digest(inventory_file.read_bytes()),'bytes':inventory_file.stat().st_size},'transferCounts':{'remoteMetadataChecks':sum(r.get('remoteMetadataChecked',False) for r in receipts),'remoteExportReads':sum(r.get('remoteBytesRead',False) for r in receipts),'localFilesReused':sum(r.get('cacheBytesReused',False) for r in copied),'canonicalUnchangedLocalReuse':sum(r.get('canonicalGenerationUnchanged',False) for r in copied),'newFiles':sum(r['scanId'] not in old for r in copied),'changedFiles':sum(r['scanId'] in old and r['sha256']!=old[r['scanId']]['sha256'] for r in copied)}}
    with (out/'cache-manifest.json').open('x') as f:f.write(json.dumps(manifest,indent=2)+'\n')
    print(json.dumps({k:v for k,v in manifest.items() if k not in ['receipts','oldSourceNames']}),flush=True)
    return manifest

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--source',required=True);p.add_argument('--out',required=True);p.add_argument('--start',required=True);p.add_argument('--end',required=True);p.add_argument('--reuse',required=True);p.add_argument('--inventory',required=True);a=p.parse_args()
    start,end=utc(a.start),utc(a.end);source,out,reuse,inv=[pathlib.Path(x).resolve() for x in [a.source,a.out,a.reuse,a.inventory]]
    if not start<end or (end-start).total_seconds()>32*86400 or out==source or source in out.parents:raise ValueError('Bounded local month cache required')
    refresh(source,out,start,end,reuse,inv)
