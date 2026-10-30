# CertScore.ai OneTrust source-order repair

Fixed a shared source-loss defect: native navigation commit and Playwright's notification of that same commit each cleared the SDK epoch. A valid SDK request/response between those notifications was discarded. The native-first ordering now invalidates once and verifies the interleaved proof with an independent frame/loader readback.

## Demonstrated improvement

The same fully intercepted Chromium fixture uses genuine previously retained SDK bytes, SHA-256 `49582965b8ddcb8f728f5b4d33b2c73e138690f5c6815bd9918de94f62f4b80b`, 392,535 bytes, exact reviewed 202211.2.0 URL. Before the fix, valid source was present before the second notification and absent afterward. After the fix, source remains quarantined until the native checkpoint completes, then becomes available with a new immutable `documentCommit` witness. Reload without fresh SDK proof still fails. No digest substitution is used in this browser check.

[Before browser evidence](/Users/benmasek/WC01/artifacts/cmp-source-order-repair-2026-10-29/browser-before.json) · [After browser evidence](/Users/benmasek/WC01/artifacts/cmp-source-order-repair-2026-10-29/browser-proof.json). The original modules are preserved and hash-match the preceding frozen candidate. Five focused ordering cases failed before the change and pass afterward. The canonical decision fixture additionally shows that an early baseline remains unconfirmed, while a fresh baseline after verification supports the same legitimate granted decision. This is a functional recovery of a reproducible shared failure, not a newly confirmed historical or production action.

## Implementation

- `onetrust-document-binding.ts` removes the second epoch reset, tracks the commit verification kind, and permits pending served-byte proof to trigger verification after pairing.
- `onetrust-sdk-source.ts` keeps interleaved source unavailable until the checkpoint succeeds; ordinary post-pair capture remains supported.
- The typed witness explicitly distinguishes `documentCommit` from `historyApi`. Both require identical frame/loader/document hashes, exact URL, bounded chronology and a baseline after verification.

No request, pin, category rule or confirmation requirement was added or relaxed. Wrong loader/frame/URL, reload, duplicate SDKs, late/aborted work, ambiguous events, missing receipts and stale baselines remain nonconfirming. Existing two-checkpoint, one-in-flight and 100 ms caps remain; no extra await/window, worker increase, public visit or deployment occurred. The conditional read and bounded metadata are estimated below $0.10/month incremental at 100,000 scans, within existing allowances; this is an engineering estimate, not a production measurement.

## Validation

All **816 consent tests**, **850 contract tests** and **40 canonical scoring/projection tests** passed. Contracts/scan-core typechecks, scan-core build and review-engine build passed. The new browser fixture passed using actual reviewed bytes; the preserved pre-fix modules fail the same recovery check.

Initial fixture attempts remain in the artifact directory. Their first response omitted charset and Chromium decoded/transcoded its script body, correctly failing the exact digest guard. The successful fixture explicitly serves UTF-8. Later diagnostic attempts preserve this distinction; no pin or digest check was changed to accommodate the fixture.

The full retained benchmark reverified all 1,576 completed actions and all 2,800 original/supplemental packets with zero outcome changes. It remains 356 initially confirmed, or 365 including existing terminal proof. Retained packets lack the discriminating navigation sequence, so they cannot demonstrate this new capture recovery. [Replay](/Users/benmasek/WC01/artifacts/cmp-source-order-repair-2026-10-29/retained/audit.json).

The Telefónica live loss motivated this investigation, but its evidence does not prove this ordering caused it. SDK requests arriving before the native commit notification remain conservatively invalidated; the repaired path covers requests between native commit and its paired Playwright notification. The native watcher still requires paired lifecycle evidence and never restores on URL equality alone. Public recovery remains unverified; existing cooldowns and rollout hold remain in place. No public retries were made in this pass.

## Revision

Metadata Git HEAD `e7c333bab4c0dfc0ee9ad539d35593de1a90f885` plus the preserved local overlay. Six-file change fingerprint: `12737e6304584a04830985dc05747a62c4d25f9667aa4b3ce36a943065380f4c`. Complete six-package runtime source: `39f8a4379c233e29d66585f52f1fff7088122e3ead5b5399831c42515a30a036`; compiled build: `1e3ea2b184b99e104ebe09b3f7337e71ed8aaf9e2c19499776841f1633cfb74b`. [Source/build inventory](/Users/benmasek/WC01/artifacts/cmp-source-order-repair-2026-10-29/runtime-source-build.json) and [source overlay](/Users/benmasek/WC01/artifacts/cmp-source-order-repair-2026-10-29/source-overlay.tar.gz) identify the candidate independently of Git HEAD. Previous reports and live evidence remain preserved.
