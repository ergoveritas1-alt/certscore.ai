import assert from "node:assert/strict";
import test from "node:test";
import {groupedProgressEntries} from "./audit-progress-table";
test("one master table includes all metrics, counts and distinct findings in contiguous measure groups",()=>{
  const entries=groupedProgressEntries([{id:"outcome",label:"Outcome",group:"Outcomes"},{id:"first",label:"First",group:"Forms"},{id:"second",label:"Second",group:"Outcomes"}],
    [{id:"forms.observed",label:"Forms"},{id:"storage.unclassified",label:"Unknown storage"}],
    [{id:"a",label:"A",family:"accessibility"},{id:"a",label:"A",family:"accessibility"},{id:"other",label:"Other",family:"other"}]);
  assert.equal(entries.length,7);assert.deepEqual(entries.slice(0,2).map(e=>e.id),["outcome","second"]);
  assert.deepEqual(entries.filter(e=>e.group==="Forms").map(e=>e.kind),["metric","quantity"]);
  const closed=new Set<string>();let group="";for(const e of entries){if(e.group!==group){assert.ok(!closed.has(e.group));if(group)closed.add(group);group=e.group;}}
});
