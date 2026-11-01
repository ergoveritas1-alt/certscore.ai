# CertScore.ai invalid-baseline consent verification — October 31, 2026

Owner direction: continue engineering before release. Local only; no deployment,
public target, production scan, cloud query/task, external privacy action,
historical rewrite, new consent recipe or confirmation eligibility grant.

The retained OneTrust-associated selection contains 61 scans/93 unconfirmed
completed-click paths in the Oct 24–30 Los Angeles public-v5/projection-v27
cohort. Exactly 28 local original bundles cover 42 paths; 33 originals remain
unavailable. The original runtime identifies OneTrust on 40 paths; two retain no
resolver provider. Initial public provider association does not repair this.
All 24 Accept paths lack granular confirmation diagnostics; 18 Reject paths
retain legacy configuration/group limitations, nine also no-fresh-decision.
None retains decoded receipt capture. These facts do not establish the specific
baseline failure or permit a historical confirmation upgrade.

A current cookie branch cannot verify a decision when its immutable pre-action
OneTrust baseline is missing or invalid. Repeating cookie and write-snapshot
IPC during the same initial verification invocation cannot repair that baseline.
The shared local gate retains the first diagnostic read, shares its pending or
failed result for that invocation, and returns no cookie decision. A separately
created terminal invocation reads current data independently. Verified OneTrust
baselines and every other cookie branch retain their prior repeated-read
behavior. TCF remains outside the gate and continues on its original cadence.
Its independent valid result can still confirm Accept or Reject.

## Evidence-quality assessment

This deliberately samples an ineligible diagnostic branch once per invocation;
intermediate receipt/write diagnostics formerly piggybacking on that branch
are not complete. Reuse marks the existing receipt capture
`observationsTruncated` flag. Missing intermediate observations must not be
interpreted as no writes, no receipt or a complete inventory. No raw receipt,
key, new contract field or scoring effect is introduced.

Focused loopback fixtures preserve distinct initial and later terminal receipt
hashes while the cookie decision remains unknown. Initial/terminal evidence
states remain separate. The baseline fixtures used 41 total cookie IPC reads
per action; the repaired bounded fixtures used seven while still polling TCF.
These are local fixture counts, not scan-latency or fleet-improvement estimates.
Positive controls use a loaded, internally consistent TCF v2 purpose envelope
and a post-action listener update to confirm through the independent TCF path
despite the invalid cookie baseline. Native document, target, freshness,
category completeness, cancellation and absolute deadline guards are unchanged.

Tests cover pending/rejected diagnostic reads, fresh terminal invocations,
unchanged valid/other-CMP reads, independent TCF results and explicit incomplete
receipt sampling. The permanent retained gate includes these regressions and
the existing granular confirmation-diagnostic cases.

The broader receipt/category coverage opportunity remains unresolved without
source-bound retained inputs. Missing baseline cookies, unsupported SDKs or
category universes must not be reinterpreted to manufacture confirmations.

Local paid usage is $0. Conservative added promise/flag bookkeeping is below
$0.01/month at 100,000 scans; removing repeated IPC is expected to reduce net
work. No extra browser/SDK/body/cookie read, polling interval, time allowance,
worker, capacity, service or retention is added. Dashboard source pins/contracts,
historical records, schedule, model, project and invocation accounting remain.
