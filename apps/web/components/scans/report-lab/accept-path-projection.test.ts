import assert from "node:assert/strict";
import test from "node:test";
import { buildAcceptPathProjection } from "./timeline-report-model";

test("coverage-only and no-click Accept outcomes cannot create an After Accept card", () => {
  assert.equal(buildAcceptPathProjection({postAcceptObservationCoverage:{status:"limited"}}, []), null);
  assert.equal(buildAcceptPathProjection({postAcceptEvidenceProjection:{registrationStatus:"not_attempted",acceptanceExercised:false,resolver:{reason:"deterministic_accept_control_not_found"}}}, []), null);
});
test("verified independent Accept activity is retained without relying on passive controls", () => {
  const projection = buildAcceptPathProjection({postAcceptEvidenceProjection:{registrationStatus:"confirmed",acceptanceExercised:true,productionProjectable:true,postAcceptActivity:[]}}, []);
  assert.equal(projection?.registrationConfirmed,true);
});
test("completed click with unconfirmed registration remains a neutral incomplete action", () => {
  const projection = buildAcceptPathProjection({postAcceptEvidenceProjection:{registrationStatus:"unconfirmed",interactionDiagnostics:{click:{outcome:"completed"}},postAcceptActivity:[]}}, []);
  assert.equal(projection?.state,"incomplete");
  assert.equal(projection?.scoreEffect,"none");
});
