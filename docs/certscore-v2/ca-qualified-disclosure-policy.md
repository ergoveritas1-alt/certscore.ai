# CertScore.ai revised California qualification — October 22, 2026

The owner authorized local implementation and retained-evidence replay of the revised CA bar: no mandatory cookie match and no automatic NPA exemption. No browser work, Options panels, deployment or historical report rewrite is authorized.

New request qualification uses `ca_sale_sharing_qualification.v2`, GPC observation qualification `gpc_sale_sharing_evidence.v4`, California GPC policy `california-gpc-response.v9-qualified-disclosure`, and post-Reject assessment `california-post-reject.v2-qualified-disclosure`.

## Minimum bar

Require positively observed successful collection, the applicable verified GPC delivery or completed authorized Reject path, unambiguous canonical recipient attribution, supported sale/sharing role/purpose and original source/request/document/ancestry proof. Preserve bounded completion and the canonical typed assessment, normalized concern, policy, unified-finding and scoring pipeline. A risk finding is not a determination of a legal violation.

The reviewed identity-sync, audience and identified advertising protocols can qualify without any cookie match or persistent-storage evidence. The prior CA role rules already supported this; explicit regressions now protect that boundary. The separate measurement inspector's exact-cookie binding establishes persistence only and is not a general CA prerequisite.

`google_npa` is retained as request-local context but no longer vetoes otherwise supported collection under the revised policy. Missing or false NPA is not required. This does not infer that NPA was ignored or that a declared restriction was honored. Invalid/duplicated NPA fields remain unresolved privacy evidence, not a valid declaration.

RDP, limited-ads, Meta LDU, US Privacy opt-out, GPP restrictions/service-provider declarations and invalid/unsupported/conflicting privacy proof retain their approved treatment. Neither an NPA declaration nor removing its veto can supply a missing advertising role. Standard analytics CID/SID, publisher/page/session identifiers, vendor presence and script downloads alone remain insufficient. The implementation does not claim complete coverage of every non-advertising sale: a further role requires supported retained evidence and a reviewed deterministic mapping; unknown contract or recipient use must not be invented.

## Versions and historical treatment

New GPC observations require v4 rows carrying the revised request qualifier. Historical v1–v3 observation rows retain their previous semantics and California policy versions. Old observations are not silently upgraded on read. Rebuilding an observation from verified original worker bytes is a distinct offline/new materialization.

Post-Reject v2 may assess existing retained request-role and processing facts under the new bar without mutating their original packet or hash. Persisted v1 assessments are revalidated using v1 semantics; they are not silently relabeled v2. Score effects must match the corresponding assessment policy version. Malformed, stale, failed, incomplete or unbound evidence remains neutral.

Union eligible recipients across GPC, Reject and explicit opt-out once, preserving the 47-point shared family and historical weights. EU Reject presence scoring and separate GPP scoring are unchanged. Customer reports retain factual findings and resulting scores without deduction explanations.

## Budget and replay

No added visit, wait, header read, inspection slot, model call, worker, retention period or paid service. Existing caps are unchanged. New bounded version labels add an estimated less than $0.10/month retained metadata at 100,000 scans / 30-day retention; no new recurring capacity.

Replay results are in `artifacts/ca-qualification-revision-2026-10-22/`: 47 original cohort scans plus the most recent Ovid AWS verification were replayed locally from retained evidence. No new live contacts or production writes occurred. Synthetic regressions demonstrate supported NPA-bearing Google advertising collection reaching the canonical CA score without cookie-match proof; they are never represented as Ovid evidence.
