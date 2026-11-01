import assert from "node:assert/strict";
import test from "node:test";
import {groupedProgressEntries,controlPresenceUnavailableLabel,mixedRateHeading,latestVersionSample} from "./audit-progress-table";
test('headline selects numeric latest version with its actual sample and no invented full-day estimate',()=>{
 const older={rate:24.5,numerator:34,denominator:139},latest={rate:24.4,numerator:11,denominator:45};
 const v={source:'mixed_sources',series:{'public_export/pulse-public-v5/scan-report-projection-v27':older,'public_export/pulse-public-v10/scan-report-projection-v27':latest}};
 assert.equal(latestVersionSample(v)?.value,latest);assert.equal(latestVersionSample(v)?.version,'v10');
 latest.rate=null as any;assert.equal(latestVersionSample(v)?.value.rate,null);
 assert.equal(latestVersionSample({source:'mixed_sources',series:{'public_export/pulse-public-v10/scan-report-projection-v27/engine-a':older,'public_export/pulse-public-v10/scan-report-projection-v27/engine-b':latest}}),null);
 assert.equal(latestVersionSample({source:'mixed_sources',series:{unknown:older}}),null);
});
test('mixed-version rates get an explicit heading instead of looking like missing data',()=>{
 assert.equal(mixedRateHeading({source:'mixed_sources'}),'Rates by version');
 assert.equal(mixedRateHeading({source:'public_export/pulse-public-v10/scan-report-projection-v27'}),null);
});
test("one master table includes all metrics, counts and distinct findings in contiguous measure groups",()=>{
  const entries=groupedProgressEntries([{id:"outcome",label:"Outcome",group:"Outcomes"},{id:"first",label:"First",group:"Forms"},{id:"second",label:"Second",group:"Outcomes"}],
    [{id:"forms.observed",label:"Forms"},{id:"storage.unclassified",label:"Unknown storage"}],
    [{id:"a",label:"A",family:"accessibility"},{id:"a",label:"A",family:"accessibility"},{id:"other",label:"Other",family:"other"}]);
  assert.equal(entries.length,7);assert.deepEqual(entries.slice(0,2).map(e=>e.id),["outcome","second"]);
  assert.deepEqual(entries.filter(e=>e.group==="Forms").map(e=>e.kind),["metric","quantity"]);
  const closed=new Set<string>();let group="";for(const e of entries){if(e.group!==group){assert.ok(!closed.has(e.group));if(group)closed.add(group);group=e.group;}}
});
test("legacy unexported opt-out is distinct from measured zero, unknown and missing modern evidence",()=>{
  const absent={source:"public_export/pulse-public-v10/scan-report-projection-v27",counts:{unavailable:10},denominator:10};
  assert.equal(controlPresenceUnavailableLabel("control.privacyOptOut",absent),"Not exported");
  assert.equal(controlPresenceUnavailableLabel("sealed.control.privacyOptOut",absent),null);
  assert.equal(controlPresenceUnavailableLabel("control.reject",absent),null);
  const cases:Parameters<typeof controlPresenceUnavailableLabel>[1][]=[{...absent,source:"public_export/pulse-public-v11/scan-report-projection-v27"},
    {...absent,counts:{not_observed:10}}, {...absent,counts:{unknown:10}}, {...absent,denominator:0},
    {...absent,series:{[absent.source]:{},"unavailable_public_export":{}}}];
  for(const v of cases)
    assert.equal(controlPresenceUnavailableLabel("control.privacyOptOut",v),null);
  assert.equal(controlPresenceUnavailableLabel("control.privacyOptOut",{...absent,series:{[absent.source]:{},"public_export/pulse-public-v5/scan-report-projection-v27":{}}}),"Not exported");
});
