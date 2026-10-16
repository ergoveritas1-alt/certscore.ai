import assert from "node:assert/strict";
import test from "node:test";
import type { UnifiedFindingDisplayPacket } from "./unified-findings";
import { projectCaliforniaRegulatoryPriorities } from "./california-regulatory-priorities";
import { selectRegulatoryReview } from "./regulatory-review-catalog";

test("legacy deferred identities and GPC cannot be elevated by priority selection", () => {
  for(const unifiedFindingId of ["gpc_response","cpra_cba_opt_out_missing","sale_sharing_controls_missing","do_not_sell_sharing_disclosure_conflict"]){
    const finding={unifiedFindingId,surfacingDecision:{reportable:true},presentationDecision:{status:"surface"},concernContext:{promotionEligibilities:["eligible"],externalSurfacingEligibilities:["eligible"]}} as unknown as UnifiedFindingDisplayPacket;
    assert.deepEqual(projectCaliforniaRegulatoryPriorities([finding]),[]);
  }
  for(const mode of ["ccpa_cpra","gdpr_eprivacy"] as const) assert.deepEqual(selectRegulatoryReview([{id:"gpc_response",status:"Potential gap",rank:1}],mode),{regulatory:[],other:[]});
});
