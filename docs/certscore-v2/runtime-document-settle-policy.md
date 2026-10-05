# Loading-document runtime capture

On October 5, 2026, the product owner approved implementation of one targeted
passive wait, capped at ten additional seconds, before the baseline and GPC
runtime inventories. This addresses forms and other DOM evidence appearing after
a substantive but still-parsing document satisfied the initial navigation gate.

## Capture behavior

- Only isolated starting-page runtime-evidence sessions, including GPC, use the
  allowance. Additional-page `inventory_only` captures retain their existing
  bounded protocol.
- A parsed document skips the allowance and its additional quiet interval.
- A loading document awaits DOMContentLoaded and the existing 250ms network
  quiet interval with no pending tracked requests. New requests restart quiet.
- The parser and request wait share one ten-second cap. The existing module,
  parent scan, Lambda and coordinator deadlines remain authoritative. Reserve
  2.5 seconds of the internal module budget for the inventory itself.
- The initial readiness read shares that cap. A busy parser delaying the read
  must not short-circuit the allowance; a same-document DOMContentLoaded event
  plus request quiet can independently complete it while the read is pending.
- Cancellation, main-frame navigation, page closure or an unavailable read ends
  the wait. All listeners and timers are removed at the terminal outcome.
- Capture uses the existing browser context, atomic inventory and retention
  path. It adds no browser run, invocation, click, retry, model call or late
  publication path. GPC delivery verification and comparison eligibility remain
  independent of parsing and settling.

A wait that cannot finish retains observed evidence but limits inventory coverage
with `document_settle_incomplete`. An inventory captured while still parsing also
retains `document_still_loading`. Neither limitation establishes absence. The
canonical collection assessment supplies the report's incomplete-coverage state;
an empty limited inventory must not be displayed as “no forms observed.”

The module timing row `runtime loading document settle` records skipped,
completed, timed-out or failed outcomes and elapsed duration. It is operational
telemetry and does not create evidence or findings.

## Approved cost estimate and validation

The approval followed a conservative incremental estimate of up to $200/month
at 100,000 scans/month if every scan needed the full allowance, including compute
and evidence storage. At the observed 1.6–2.3% affected-scan rate, applying that
same conservative envelope gives roughly $3–$5/month. The cohort is preliminary:
246 comparable completed sharded scans over October 2–5 covered 29 distinct
hosts. Older versions without loading telemetry were excluded. This is an
estimate, not measured post-rollout spend.

The lower-cost alternative was the report coverage correction alone, with no
additional runtime allowance and $0 incremental recurring cost. Implementation
of the targeted wait was expressly requested after the cost and latency review.

Deterministic tests cover streamed document tails, asynchronous form requests,
baseline/GPC capture, ready-document skipping, the hard cap, pending requests,
cancellation, document changes and unavailable reads. Retained incomplete
assessments are checked through persisted report projection and public and
authenticated report rendering. No production rescan is required for these tests.

Before the busy-read correction was committed, an owner-requested passive scan
of `https://sits.com/en/` retained two forms and nine fields, including the
contact form's privacy and optional marketing disclosures. The retained local
inventory also passes assessment, persistence and public/authenticated rendering
regressions. Ongoing requests still limit coverage at the unchanged cap; that
limitation preserves the observed form rows instead of erasing them.
