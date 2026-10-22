# CertScore.ai Reject join during required finalization

October 22, 2026. Local implementation authorized by the owner's request to fix
Pella's Reject join/finalization gap within existing budgets, replay retained
evidence, preserve deduplication, and avoid Options panels and deployment.

`reject_join_existing_work.v1` changes only the cancellation checkpoint for an
already-invoked Reject worker when the independent passive session reports no
Reject or limited coverage. Leave that RequestResponse available while the
coordinator performs its already-required passive downloads, checksum/schema
verification, merge, auxiliary mirroring and GPC comparison. At the end of this
work, take one state snapshot. Cancel a still-unfinished worker immediately;
verify an already-returned result through the existing artifact hash, size,
parent dispatch, packet schema and source/action/document bindings.

There is no sleep, polling, new invocation, browser work, retry, extended action
search, shortened capture, larger worker, extra model call or publication path.
Keep the absolute eight-second Reject deadline anchored to the original passive
barrier, including packet verification. Results after the state snapshot or the
deadline cannot reopen a terminal result. Undispatched actions still cancel
immediately. Accept retains its existing cancellation checkpoint. This refines
only the immediate Reject cancellation point in the September 5 policy; it does
not authorize a tail wait solely to resolve passive absence.

The existing `reject_path_incomplete_at_passive_barrier` limitation remains the
compatible contract value for an unfinished passive-disagreement case. This
policy changes no external contracts, score weights, recipient qualification,
deduplication or historical policy versions. An independent action never changes
the passive control summary or its first-layer reportability requirements.

## Retained evidence and replay

The original Pella terminal remains failed for Reject. Its separate, unchanged
packet records a completed click, a full eight-second capture and no post-action
request omissions. It completed 310 ms after the original passive barrier,
during the recorded interval of required coordinator finalization work.

An offline coordinator replay uses all 68 verified retained source artifacts,
including existing screenshots and text. Only local mirror locations are
remapped. Source observations, timestamps, packet bytes, original hashes and
passive control states are preserved. Transport envelopes are reconstructed
from those bytes for the replay and deliberately deliver the Reject response
during a required auxiliary GetObject. The old code cancels it; the corrected
code joins it, without a worker-wait phase and with one terminal publication.
Both paths then pass typed assessment JSON round-trip, normalized concerns,
concern policy, unified findings/checklist and capped scoring.

The original aborted RequestResponse arrival time was not retained. This is a
counterfactual transport replay, not proof that the original live response would
have arrived before the new snapshot. No production report is rewritten and no
new AWS site scan was run.

Corrected retained replay supports 20 EU Reject points for two distinct entities,
Sentry and Google, plus 7 California potential-risk points for Google. Google is
counted once despite its cookie/service evidence and repeated requests. No full
California sale/sharing recipient qualifies from this packet. These restore the
same deductions as the earlier successful Pella verification; no additional
recipient or increment beyond that earlier 7 CA / 20 EU result was discovered.

## Cost and validation

No worker duration, coordinator idle wait or configured capture/storage cap is
increased. Newly joined evidence can add an existing packet to the terminal
bundle and its normal typed projection. The below-$1 planning estimate disclosed
before implementation is approximately $0.80/month at 100,000 scans/month and
30-day retention, using existing repository cost assumptions and a conservative
allowance for packet/typed-copy bytes, one extra verification read per recovered
join and bounded parsing. Pella's retained packet is about 108 KB. This assumes
at most roughly 300 KB of additional retained copies and about 10 ms processing
per scan across the whole 100,000-scan volume; actual incidence is expected to be
lower. No database capacity, retention extension or new paid service is added.
Reestimate before deployment if copy count, retention, incidence or processing
measurements exceed these assumptions. No recurring cost is activated locally.

Focused regression tests cover complete passive absence, limited passive
coverage, hung workers, bad checksums, replies after the snapshot, unchanged
Accept cancellation, shared absolute deadlines and single publication. Existing
California union/risk deduplication and EU Reject presence policy tests also run.
See `artifacts/pella-reject-finalization-2026-10-22/` for source hashes, test logs,
the unmodified source inventory and before/corrected replay outputs.
