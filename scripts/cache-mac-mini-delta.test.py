"""Offline checks for exact-ID cache acquisition; no cloud or product tests."""
import hashlib, importlib.util, json, pathlib, tempfile, unittest
from unittest import mock

spec=importlib.util.spec_from_file_location('delta',pathlib.Path(__file__).with_name('cache-mac-mini-delta.py'))
delta=importlib.util.module_from_spec(spec);spec.loader.exec_module(delta)
ID='11111111-1111-4111-8111-111111111111'
NEW='22222222-2222-4222-8222-222222222222'

class DeltaTests(unittest.TestCase):
    def fixture(self,root,rows):
        root=root.resolve()
        source=root/'source';(source/'evidence').mkdir(parents=True);prior=root/'prior';(prior/'evidence').mkdir(parents=True)
        value={'scanId':ID,'timestamps':{'createdAt':'2026-10-26T12:00:00Z'},'scanStatus':'completed','meta':{'reportProjectionSourceHash':'a'*64}}
        b=json.dumps(value).encode();p=prior/'evidence'/(ID+'.json');p.write_bytes(b)
        receipt={'scanId':ID,'state':'copied','file':str(p),'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest(),'scanCreatedAt':'2026-10-26T12:00:00+00:00','scanStatus':'completed','sourceStat':{'sizeBytes':0,'mtimeNs':0,'ctimeNs':0}}
        (prior/'cache-manifest.json').write_text(json.dumps({'end':'2026-10-27T14:00:00+00:00','receipts':[receipt]}))
        inv=root/'inventory.json';inv.write_text(json.dumps({'version':'certscore.mac-mini-direct-id-inventory.v1','readOnly':True,'start':'2026-10-25T14:00:00+00:00','end':'2026-10-28T14:00:00+00:00','rows':rows}))
        return source,prior,inv
    def row(self,id=ID,**kw):
        return {'scanId':id,'isMacMini':True,'isCanary':False,'created_at':'2026-10-26T12:00:00+00:00','updated_at':'2026-10-26T13:00:00+00:00','projection_source_hash':'a'*64,**kw}
    def run_refresh(self,root,source,prior,inv):
        with mock.patch.object(delta.os,'scandir',side_effect=AssertionError('Directory enumeration forbidden')):
            result=delta.refresh(source,root.resolve()/'out',delta.utc('2026-09-28T14:00:00Z'),delta.utc('2026-10-28T14:00:00Z'),prior,inv)
            self.assertEqual(result['counts'].get('invalid',0),0,result['receipts'])
            return result
    def test_generation_stable_cached_file_needs_no_remote_metadata_or_content(self):
        with tempfile.TemporaryDirectory() as t:
            root=pathlib.Path(t);source,prior,inv=self.fixture(root,[self.row()])
            original=pathlib.Path.stat
            def stat(p,*a,**kw):
                if str(p).startswith(str(source)):raise AssertionError('Remote stat forbidden for unchanged generation')
                return original(p,*a,**kw)
            with mock.patch.object(pathlib.Path,'stat',stat):m=self.run_refresh(root,source,prior,inv)
            self.assertEqual(m['transferCounts']['remoteExportReads'],0);self.assertEqual(m['transferCounts']['localFilesReused'],1)
    def test_new_and_changed_files_are_the_only_export_reads(self):
        with tempfile.TemporaryDirectory() as t:
            root=pathlib.Path(t);source,prior,inv=self.fixture(root,[self.row(updated_at='2026-10-28T12:00:00Z'),self.row(NEW)])
            for id in [ID,NEW]:(source/'evidence'/(id+'.json')).write_text(json.dumps({'scanId':id,'scanStatus':'completed','timestamps':{'createdAt':'2026-10-26T12:00:00Z'},'changed':True}))
            original=(prior/'evidence'/(ID+'.json')).read_bytes();m=self.run_refresh(root,source,prior,inv)
            self.assertEqual(m['transferCounts']['newFiles'],1);self.assertEqual(m['transferCounts']['changedFiles'],1);self.assertEqual(m['transferCounts']['remoteExportReads'],2)
            self.assertEqual((prior/'evidence'/(ID+'.json')).read_bytes(),original)
    def test_missing_file_and_canary_remain_explicit_without_fabrication(self):
        with tempfile.TemporaryDirectory() as t:
            root=pathlib.Path(t);source,prior,inv=self.fixture(root,[self.row(NEW)])
            m=self.run_refresh(root,source,prior,inv);self.assertEqual(m['counts']['source_unavailable'],1);self.assertFalse((root/'out/evidence'/(NEW+'.json')).exists())
        with tempfile.TemporaryDirectory() as t:
            root=pathlib.Path(t);source,prior,inv=self.fixture(root,[self.row(NEW,isCanary=True)])
            m=self.run_refresh(root,source,prior,inv);self.assertEqual(m['counts']['excluded_canary_or_test'],1)
    def test_duplicate_or_unverified_ids_fail_before_source_access(self):
        for rows in [[self.row(),self.row()],[self.row(isMacMini=False)]]:
            with tempfile.TemporaryDirectory() as t:
                root=pathlib.Path(t);source,prior,inv=self.fixture(root,rows)
                with self.assertRaises(ValueError):self.run_refresh(root,source,prior,inv)
    def test_public_millisecond_timestamp_matches_database_microseconds(self):
        with tempfile.TemporaryDirectory() as t:
            root=pathlib.Path(t);source,prior,inv=self.fixture(root,[self.row(created_at='2026-10-26T12:00:00.000388+00:00')])
            self.run_refresh(root,source,prior,inv)
        with tempfile.TemporaryDirectory() as t:
            root=pathlib.Path(t);source,prior,inv=self.fixture(root,[self.row(created_at='2026-10-26T12:00:00.001388+00:00')])
            m=delta.refresh(source,root.resolve()/'out',delta.utc('2026-09-28T14:00:00Z'),delta.utc('2026-10-28T14:00:00Z'),prior,inv)
            self.assertEqual(m['counts']['invalid'],1)
    def test_missing_previously_cached_bytes_block_instead_of_disappearing(self):
        with tempfile.TemporaryDirectory() as t:
            root=pathlib.Path(t);source,prior,inv=self.fixture(root,[self.row()]);(prior/'evidence'/(ID+'.json')).unlink()
            m=delta.refresh(source,root.resolve()/'out',delta.utc('2026-09-28T14:00:00Z'),delta.utc('2026-10-28T14:00:00Z'),prior,inv)
            self.assertEqual(m['counts']['invalid'],1)

    def test_pending_queue_keeps_deferred_ids_even_if_returned_by_overlap(self):
        with tempfile.TemporaryDirectory() as t:
            root=pathlib.Path(t)
            ids=[f'33333333-3333-4333-8333-{i:012d}' for i in range(108)]
            rows=[self.row(scan_id, status='failed', originalRequestId='original-request') for scan_id in ids]
            source,prior,inv=self.fixture(root,rows)
            prior_manifest=prior/'cache-manifest.json'
            previous=delta.read(prior_manifest)
            old_inventory={**delta.read(inv),'end':previous['end']}
            original=prior/'delta-inventory.json'
            old_bytes=json.dumps(old_inventory).encode()
            original.write_bytes(old_bytes)
            old_ref={'file':str(original),'bytes':len(old_bytes),'sha256':delta.digest(old_bytes)}
            previous['directInventory']=old_ref
            previous['receipts'] += [{'scanId':scan_id,'state':'source_unavailable','productionStatus':'failed'} for scan_id in ids]
            prior_manifest.write_text(json.dumps(previous))
            start=delta.utc('2026-09-28T14:00:00Z')
            end=delta.utc('2026-10-28T14:00:00Z')
            plan=delta.pending_plan(delta.pending_exports(previous),start,end)
            self.assertEqual(plan['pendingRefreshIds'],ids[:100])
            inv.write_text(json.dumps({**delta.read(inv),'pendingRefreshIds':plan['pendingRefreshIds']}))
            manifest=self.run_refresh(root,source,prior,inv)
            missing={r['scanId']:r for r in manifest['receipts'] if r['state']=='source_unavailable'}
            self.assertEqual(set(missing),set(ids))
            self.assertEqual(manifest['pendingRechecks']['recheckedCount'],100)
            self.assertEqual(manifest['transferCounts']['remoteMetadataChecks'],100)
            for scan_id in ids[100:]:
                self.assertEqual(missing[scan_id]['selectionInventory'],old_ref)
                self.assertFalse(missing[scan_id]['remoteMetadataChecked'])
            next_plan=delta.pending_plan(delta.pending_exports(manifest),start,end)
            self.assertEqual(next_plan['pendingRefreshIds'][:8],ids[100:])

    def test_completed_reservation_and_oldest_check_rotation_preserve_all_ids(self):
        pending={str(i):dict(scanId=str(i),scanCreatedAt='2026-10-26T12:00:00Z',lastExactCheckUtc='2026-10-27T12:00:00Z' if i<141 else '2026-10-28T12:00:00Z',productionStatus='failed' if i<141 else 'completed') for i in range(157)}
        start,end=delta.utc('2026-10-01T00:00:00Z'),delta.utc('2026-11-01T00:00:00Z')
        plan=delta.pending_plan(pending,start,end,56)
        self.assertEqual(sum(pending[i]['productionStatus']=='completed' for i in plan['pendingRefreshIds']),16)
        self.assertEqual(len(plan['deferredPendingIds']),101)
        self.assertEqual(set(plan['pendingRefreshIds']+plan['deferredPendingIds']),set(pending))
        first_failed={i for i in plan['pendingRefreshIds'] if pending[i]['productionStatus']=='failed'}
        for i in plan['pendingRefreshIds']:pending[i]['lastExactCheckUtc']='2026-10-29T12:00:00Z'
        second=delta.pending_plan(pending,start,end,56)
        self.assertFalse(first_failed.intersection(second['pendingRefreshIds']))
        self.assertEqual(delta.pending_plan(pending,start,end,0)['pendingRefreshIds'],[])
        with self.assertRaises(ValueError):delta.pending_plan(pending,start,end,101)

if __name__=='__main__':unittest.main()
