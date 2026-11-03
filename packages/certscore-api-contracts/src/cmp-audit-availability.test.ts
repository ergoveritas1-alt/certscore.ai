import assert from "node:assert/strict";
import test from "node:test";
import {cmpAuditAvailabilitySchema,cmpAuditAvailabilityWording,describeCmpAuditAvailability} from "./cmp-audit-availability";

test("CMP availability is bounded neutral metadata with exact shared wording and no arbitrary evidence strings",()=>{
  const reason="visit_unusable",reasonCodes=["loading_or_stalled"] as const;
  const packet={contractVersion:"certscore.cmp-audit-availability.v1",reason,sourceAssessmentHash:"fnv1a-1234abcd",reasonCodes:[...reasonCodes],
    ...cmpAuditAvailabilityWording(reason,reasonCodes),scoreEffect:"none",findingEffect:"none"};
  assert.deepEqual(cmpAuditAvailabilitySchema.parse(packet),packet);
  assert.match(describeCmpAuditAvailability(cmpAuditAvailabilitySchema.parse(packet)),/Loading or stalled page evidence was recorded/);
  for(const change of [{reason:"honored"},{reasonCodes:["secret=private"]},{reasonCodes:[...reasonCodes,...reasonCodes]},
    {sourceAssessmentHash:"original-hash"},{sourceAssessmentHash:null}, {reason:"assessment_missing"},
    {observation:"https://private.test/?token=secret"},{whatToCheck:"Install GPP"},{findingEffect:"create_finding"},{scoreEffect:"deduct"},{documentToken:"secret"}])
    assert.equal(cmpAuditAvailabilitySchema.safeParse({...packet,...change}).success,false);
  const absent={...packet,reason:"assessment_missing",sourceAssessmentHash:null,reasonCodes:[],...cmpAuditAvailabilityWording("assessment_missing",[])};
  assert.equal(cmpAuditAvailabilitySchema.safeParse(absent).success,true);
});
