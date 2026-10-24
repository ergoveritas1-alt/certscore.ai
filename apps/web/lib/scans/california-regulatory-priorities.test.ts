import assert from "node:assert/strict";
import test from "node:test";
import type { UnifiedFindingDisplayPacket } from "./unified-findings";
import { projectCaliforniaRegulatoryPriorities } from "./california-regulatory-priorities";
import { selectRegulatoryReview } from "./regulatory-review-catalog";

test("unbound legacy and GPC packets cannot be elevated by canonical priority projection", () => {
  for(const unifiedFindingId of ["gpc_response","cpra_cba_opt_out_missing","sale_sharing_controls_missing","do_not_sell_sharing_disclosure_conflict"]){
    const finding={unifiedFindingId,surfacingDecision:{reportable:true},presentationDecision:{status:"surface"},concernContext:{promotionEligibilities:["eligible"],externalSurfacingEligibilities:["eligible"]}} as unknown as UnifiedFindingDisplayPacket;
    assert.deepEqual(projectCaliforniaRegulatoryPriorities([finding]),[]);
  }
});

test("catalog ranks an already-projected GPC finding only in California review", () => {
  const row = {id: "gpc_response", status: "Potential gap", rank: 1};
  assert.deepEqual(selectRegulatoryReview([row], "ccpa_cpra"), {regulatory: [row], other: [], topIssues: [row]});
  assert.deepEqual(selectRegulatoryReview([row], "gdpr_eprivacy"), {regulatory: [], other: [], topIssues: []});
});
