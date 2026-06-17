# ADR: Production Scanner Posture

## Status

Accepted for the current production scanner.

## Context

Post-consent consent-flow automation adds latency, brittleness, and interpretation risk. CCPA/CPRA review also depends on applicability, user geography, sale/share analysis, universal opt-out handling, and control-flow validation that the current production scanner should not imply it exhaustively tests.

## Decision

The current production scanner is centered on GDPR/ePrivacy-oriented pre-consent runtime behavior and public policy surfaces. Automated post-choice consent-flow execution and CCPA/CPRA California privacy review are deferred from core production scanning.

CertScore reports observable risk signals from public policy surfaces and pre-consent site behavior. It does not claim exhaustive consent-path validation.

The production scanner execution direction is the CertScore v2 DAG scanner architecture, preferably dispatched through the configured Lambda handoff when the Lambda function and result queue are available. The production profile is the v2 `standard` core profile: policy surfaces, pre-consent runtime observations, and retained evidence artifacts. Post-consent Lambda worker lanes and accept/reject/manage flows are disabled for production scanning and may only remain as research/diagnostic code.

## Core Scan

Current core scan evidence may include:

- Consent banner, reject option, CMP/framework, and cookie notice or cookie-policy availability
- Pre-consent cookies/storage, third-party tracking, analytics vendor, session replay, and device-identification/fingerprinting signals
- Collection surface presence
- Privacy notice availability and Article 13 transparency disclosure signals, including controller/contact, purposes, legal basis, recipients/vendor categories, retention, rights, and international transfers
- Runtime vendor vs public disclosure alignment

## Deferred From Core

These are research/diagnostic-only unless a separate production integration is explicitly approved:

- Accept flow tracking delta
- Reject flow tracking delta
- Post-reject vendor reduction
- Preference center save verification
- Post-choice control behavior
- Consent-state persistence
- After-refusal conclusions
- CCPA/CPRA California privacy review
- Do Not Sell/Share availability and opt-out-path conclusions
- GPC or universal opt-out handling conclusions
- Marketing consent checkbox detection
- Privacy notice proximity near collection surfaces
- Newsletter or marketing sign-up classification
- Embedded-content pre-consent classification
- Analytics-specific disclosure alignment
- Embedded-content disclosure alignment

Existing research code, fixtures, and historical artifacts may remain for internal review. They must not create production findings, checklist rows, executive findings, regulatory lenses, or report copy outside the canonical production pipeline.

## Pipeline Constraint

Production surfacing still follows:

```text
WS01 observed evidence
-> WC01 normalized concern
-> WC01 concern policy
-> WC01 unified finding / checklist projection
-> executive/regulatory display
```

Display code must not create post-choice findings from raw signals or retained diagnostic artifacts.

## Consequences

- WS01 remains responsible for observed runtime and policy-surface evidence.
- WC01 production surfacing remains normalized concern -> concern policy -> unified finding/checklist projection.
- Missing valid signals should be fixed by adding WS01 observed evidence and WC01 concern/policy mappings, not by patching report display code.
- Public copy, scan options, and API docs should describe GDPR/ePrivacy, pre-consent runtime observations, and public policy surfaces only.
