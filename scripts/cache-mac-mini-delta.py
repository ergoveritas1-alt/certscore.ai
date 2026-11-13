#!/usr/bin/env python3
"""CertScore.ai exact-ID cache refresh. No directory enumeration or source writes."""
import argparse, collections, concurrent.futures, datetime, hashlib, json, os, pathlib, re

UUID = re.compile(r'^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$', re.I)
MAX_PENDING_RECHECKS = 100
# Reserve launch space for control accessibility, required receipts and unavailable reasons.
DAILY_PENDING_RECHECKS = 56
def utc(v): return datetime.datetime.fromisoformat(v.replace('Z', '+00:00')).astimezone(datetime.timezone.utc)
def digest(b): return hashlib.sha256(b).hexdigest()
def read(p): return json.loads(p.read_text())
def signature(p):
    s=p.stat(); return {'sizeBytes':s.st_size,'mtimeNs':s.st_mtime_ns,'ctimeNs':s.st_ctime_ns}

def pending_exports(prior, original_inventories=None):
    """Recover queue entries from their original, bounded ID-selection receipt."""
    original_inventories = original_inventories or {}
    inventories = {}
    pending = {}
    def inventory_row(ref, scan_id):
        key = (ref['file'], ref['sha256'], ref['bytes'])
        if key not in inventories:
            file = pathlib.Path(ref['file'])
            if not 0 < ref['bytes'] <= 32_000_000 or file.stat().st_size != ref['bytes']:
                raise ValueError('Pending ID inventory receipt size mismatch')
            data = file.read_bytes()
            if digest(data) != ref['sha256']:
                raise ValueError('Pending ID inventory receipt hash mismatch')
            inventory = json.loads(data)
            rows = {row['scanId']:row for row in inventory['rows']}
            if inventory.get('version') != 'certscore.mac-mini-direct-id-inventory.v1' or inventory.get('readOnly') is not True or len(rows) != len(inventory['rows']) or len(rows) > 5000:
                raise ValueError('Invalid pending ID inventory')
            inventories[key] = rows, inventory['end']
        rows, cutoff = inventories[key]
        row = rows.get(scan_id)
        if not row or row.get('isMacMini') is not True or row.get('isCanary') is not False or not row.get('originalRequestId'):
            raise ValueError('Pending ID lacks original-creator selection proof')
        return row, cutoff

    for entry in prior['receipts']:
        if entry['state'] != 'source_unavailable':
            continue
        scan_id = entry['scanId']
        if not UUID.fullmatch(scan_id) or scan_id in pending:
            raise ValueError('Invalid or duplicate pending scan ID')
        checked_ref = entry.get('selectionInventory') or prior['directInventory']
        origin_ref = original_inventories.get(scan_id) or entry.get('originalSelectionInventory') or checked_ref
        observed_ref = entry.get('observedSelectionInventory') or checked_ref
        origin, origin_cutoff = inventory_row(origin_ref, scan_id)
        checked, last_check = inventory_row(checked_ref, scan_id)
        observed, observed_cutoff = inventory_row(observed_ref, scan_id)
        if not utc(origin_cutoff) <= utc(last_check) <= utc(observed_cutoff) <= utc(prior['end']):
            raise ValueError('Pending inventory chronology mismatch')
        if any(row['originalRequestId'] != origin['originalRequestId'] or
               utc(row['created_at']) != utc(origin['created_at']) for row in (checked, observed)):
            raise ValueError('Pending inventory ancestry mismatch')
        pending[scan_id] = {**entry, 'selectionInventory':checked_ref, 'originalSelectionInventory':origin_ref,
                            'scanCreatedAt':origin['created_at'], 'productionStatus':checked['status'],
                            'publicationRequestStatus':observed.get('publicationRequestStatus'),
                            'lastExactCheckUtc':last_check, 'originalRequestId':origin['originalRequestId'],
                            'checkedReadyGeneration':ready_generation(checked),
                            'observedReadyGeneration':ready_generation(observed)}
    return pending

def ready_generation(row):
    if (row.get('status') not in ('completed', 'completed_limited') or
        row.get('publicationRequestStatus') == 'terminal_failure' or row.get('projection_status') != 'ready'):
        return None
    version, source, payload = (row.get(key) for key in
                                ('projection_version', 'projection_source_hash', 'projection_payload_sha256'))
    if not isinstance(version, str) or not version or not all(isinstance(value, str) and re.fullmatch(r'[0-9a-f]{64}', value)
                              for value in (source, payload)):
        return None
    return version, source, payload

def pending_plan(pending, start, end, limit=MAX_PENDING_RECHECKS):
    eligible = [r for r in pending.values() if start <= utc(r['scanCreatedAt']) < end]
    if not isinstance(limit,int) or not 0 <= limit <= MAX_PENDING_RECHECKS:
        raise ValueError('Pending limit must be between zero and 100')
    eligible.sort(key=lambda r: (utc(r['lastExactCheckUtc']), utc(r['scanCreatedAt']), r['scanId']))
    ready, terminal, rotation = [], [], []
    for row in eligible:
        age = end - utc(row['lastExactCheckUtc'])
        generation = row.get('observedReadyGeneration')
        if generation:
            if generation != row.get('checkedReadyGeneration') or age >= datetime.timedelta(days=1):
                ready.append(row)
        elif age >= datetime.timedelta(days=3):
            lane = terminal if row.get('publicationRequestStatus') == 'terminal_failure' else rotation
            lane.append(row)
    ready.sort(key=lambda row: row['observedReadyGeneration'] == row.get('checkedReadyGeneration'))
    # Interleave lanes so trimming the existing query tail still leaves room
    # for failed attempts and terminal publication failures.
    ordered = []
    lanes = (ready, terminal, rotation)
    for index in range(max(map(len, lanes))):
        ordered.extend(lane[index] for lane in lanes if index < len(lane))
    selected = [r['scanId'] for r in ordered[:limit]]
    selected_ids = set(selected)
    return {'priorPendingCount':len(pending), 'pendingRefreshIds':selected,
            'deferredPendingIds':[r['scanId'] for r in eligible if r['scanId'] not in selected_ids],
            'completedReservedCount':sum(r['scanId'] in selected_ids for r in ready),
            'deferredPendingCount':len(eligible)-len(selected), 'agedOutPendingCount':len(pending)-len(eligible)}

def refresh(source, out, start, end, reuse, inventory_file, original_inventories=None):
    if (out/'cache-manifest.json').exists(): raise ValueError('Fresh immutable cache required')
    if not 0 < inventory_file.stat().st_size <= 32_000_000:
        raise ValueError('Direct ID inventory size outside bounds')
    inventory_bytes = inventory_file.read_bytes()
    if not 0 < len(inventory_bytes) <= 32_000_000:
        raise ValueError('Direct ID inventory size outside bounds')
    inventory = json.loads(inventory_bytes)
    inventory_ref = {'file':str(inventory_file),'sha256':digest(inventory_bytes),'bytes':len(inventory_bytes)}
    prior_file=reuse/'cache-manifest.json'; prior_bytes=prior_file.read_bytes(); prior=json.loads(prior_bytes)
    if inventory.get('version')!='certscore.mac-mini-direct-id-inventory.v1' or inventory.get('readOnly') is not True: raise ValueError('Verified read-only ID inventory required')
    items=inventory['rows']
    if len(items)>5000 or len({r['scanId'] for r in items})!=len(items): raise ValueError('Duplicate or excessive IDs')
    if any(not UUID.fullmatch(r['scanId']) or r.get('isMacMini') is not True for r in items): raise ValueError('Original bot identity required')
    if utc(inventory['end'])!=end or utc(inventory['start'])>utc(prior['end']): raise ValueError('Inventory does not cover refresh delta')
    old={r['scanId']:r for r in prior['receipts'] if r['state']=='copied' and start<=utc(r['scanCreatedAt'])<end}
    selected={r['scanId']:r for r in items if start<=utc(r['created_at'])<end}
    pending = pending_exports(prior, original_inventories)
    plan = pending_plan(pending, start, end)
    targeted = inventory.get('pendingRefreshIds', plan['pendingRefreshIds'])
    if not isinstance(targeted,list) or len(targeted)>MAX_PENDING_RECHECKS or len(set(targeted))!=len(targeted) or any(scan_id not in pending for scan_id in targeted):
        raise ValueError('Invalid bounded pending recheck list')
    targeted = set(targeted)
    for scan_id in pending.keys() & selected.keys():
        origin, row = pending[scan_id], selected[scan_id]
        if (row.get('originalRequestId') != origin['originalRequestId'] or row.get('isCanary') is not False or
            utc(row['created_at']) != utc(origin['scanCreatedAt'])):
            raise ValueError('Pending refresh original-creator mismatch')
    deferred = {scan_id:entry for scan_id,entry in pending.items()
                if start<=utc(entry['scanCreatedAt'])<end and (scan_id not in targeted or scan_id not in selected)}
    ids=sorted(set(old)|set(selected)|set(deferred)); target=out/'evidence';target.mkdir(parents=True,exist_ok=True)
    def copy(id):
        if id in deferred:
            entry = deferred[id]
            carried = {key:value for key,value in entry.items()
                       if key not in ('originalRequestId', 'checkedReadyGeneration', 'observedReadyGeneration')}
            if id in selected:
                carried['observedSelectionInventory'] = inventory_ref
            return {**carried, 'deferredRecheck':True, 'remoteMetadataChecked':False, 'remoteBytesRead':False}
        origin = pending.get(id) or old.get(id) or {}
        ancestry = {'originalSelectionInventory':origin['originalSelectionInventory']} if 'originalSelectionInventory' in origin else {}
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
            return {**ancestry,'scanId':id,'state':'copied','sha256':h,'bytes':len(b),'source':str(src),'file':str(dst),'scanCreatedAt':created.isoformat(),'site':value.get('domain'),'scanStatus':value.get('scanStatus'),'dateBasis':'canonical_created_at','sourceStat':stat,'freshness':freshness,'cacheBytesReused':reused,'remoteMetadataChecked':remote_metadata,'remoteBytesRead':remote_bytes,'canonicalGenerationUnchanged':stable,'originSelection':'production_original_creator' if row else 'retained_history'}
        except FileNotFoundError:
            if prev:return {'scanId':id,'state':'invalid','reason':'Previously cached export or selected replacement is unavailable; preserve prior snapshot','remoteMetadataChecked':remote_metadata,'remoteBytesRead':remote_bytes}
            return {**ancestry,'scanId':id,'state':'source_unavailable','reason':'Exact export file absent; no API regeneration or scan initiated','productionStatus':(row or {}).get('status'),'remoteMetadataChecked':remote_metadata,'remoteBytesRead':remote_bytes}
        except Exception as e:return {**ancestry,'scanId':id,'state':'invalid','reason':str(e),'remoteMetadataChecked':remote_metadata,'remoteBytesRead':remote_bytes}
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        receipts=[]
        for result in pool.map(copy,ids):
            receipts.append(result)
            if len(receipts)%250==0: print(json.dumps({'phase':'exact_id_cache','accounted':len(receipts),'total':len(ids)}),flush=True)
    counts=dict(collections.Counter(r['state'] for r in receipts));copied=[r for r in receipts if r['state']=='copied']
    manifest={'version':'certscore.mac-mini-evidence-cache.v1','start':start.isoformat(),'end':end.isoformat(),'source':str(source),'selection':'Bounded production original-creator IDs; exact file paths only. Verified local history and stable canonical generations reused.','attemptInventoryComplete':False,'discovery':{'mode':'production_exact_ids','directoryEnumerated':False,'candidateFiles':len(ids),'productionIds':len(items),'duplicateNamesIgnored':0},'receipts':receipts,'counts':counts,'cachedBytes':sum(r['bytes'] for r in copied),'sourceWrites':0,'oldSourceNames':prior.get('oldSourceNames',[]),'incrementalPolicy':'Only missing/new or changed selected exports read remotely; all unchanged history reused locally','directInventory':inventory_ref,'transferCounts':{'remoteMetadataChecks':sum(r.get('remoteMetadataChecked',False) for r in receipts),'remoteExportReads':sum(r.get('remoteBytesRead',False) for r in receipts),'localFilesReused':sum(r.get('cacheBytesReused',False) for r in copied),'canonicalUnchangedLocalReuse':sum(r.get('canonicalGenerationUnchanged',False) for r in copied),'newFiles':sum(r['scanId'] not in old for r in copied),'changedFiles':sum(r['scanId'] in old and r['sha256']!=old[r['scanId']]['sha256'] for r in copied)}}
    if inventory_file.stat().st_size != len(inventory_bytes) or inventory_file.read_bytes() != inventory_bytes:
        raise ValueError('Direct ID inventory changed during refresh')
    if prior_file.read_bytes()!=prior_bytes: raise ValueError('Prior cache manifest changed during refresh')
    manifest['previousCache']={'file':str(prior_file),'sha256':digest(prior_bytes),'bytes':len(prior_bytes)}
    manifest['pendingRechecks'] = {
        'priorPendingCount':len(pending), 'targetedIds':sorted(targeted),
        'recheckedCount':sum(r['scanId'] in targeted and r.get('remoteMetadataChecked',False) for r in receipts),
        'deferredCount':len(deferred), 'agedOutCount':plan['agedOutPendingCount'],
    }
    with (out/'cache-manifest.json').open('x') as f:f.write(json.dumps(manifest,indent=2)+'\n')
    print(json.dumps({k:v for k,v in manifest.items() if k not in ['receipts','oldSourceNames']}),flush=True)
    return manifest

def continuity_inventories(path):
    """Import historical ancestry from a locally retained continuity receipt."""
    if path is None:
        return {}
    receipt = read(path)
    entries = [row for row in receipt['entries'] if row['outcome'] == 'still_pending'] + receipt['newlyPending']
    refs = {row['scanId']:row['originalSelectionInventory'] for row in entries}
    if len(refs) != len(entries) or len(refs) > 5000:
        raise ValueError('Invalid pending continuity ancestry')
    return refs

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--source');p.add_argument('--out');p.add_argument('--start',required=True);p.add_argument('--end',required=True);p.add_argument('--reuse',required=True);p.add_argument('--inventory');p.add_argument('--continuity',type=pathlib.Path);p.add_argument('--plan-pending',action='store_true');a=p.parse_args()
    start,end=utc(a.start),utc(a.end)
    reuse=pathlib.Path(a.reuse).resolve()
    original_inventories = continuity_inventories(a.continuity)
    if a.plan_pending:
        print(json.dumps(pending_plan(pending_exports(read(reuse/'cache-manifest.json'),original_inventories),start,end,DAILY_PENDING_RECHECKS)))
        raise SystemExit(0)
    if not (a.source and a.out and a.inventory):
        p.error('--source, --out and --inventory are required for a refresh')
    source,out,inv=[pathlib.Path(x).resolve() for x in [a.source,a.out,a.inventory]]
    if not start<end or (end-start).total_seconds()>32*86400 or out==source or source in out.parents:raise ValueError('Bounded local month cache required')
    refresh(source,out,start,end,reuse,inv,original_inventories)
