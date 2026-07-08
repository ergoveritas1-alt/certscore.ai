# @certscore/sdk

## Unreleased

- Documented the browser-style async bot workflow with separate submit latency, queue time, scanner runtime, and SDK wall-time measurements.
- Updated the canonical resource workflow example to use API v2 scan creation, background polling, and lifecycle timing instead of treating a blocking Pulse call as scanner runtime.

## 0.2.2

- Added `CertScore` as a friendly alias for `CertScoreClient`.
- Added the `certscore-sdk-doctor` CLI smoke check.
- Expanded first-run and error-handling documentation for self-serve `cs_ro_` and `cs_rw_` keys.

## 0.2.1

- Aligned the repo package with the already-published npm package and refreshed install-first SDK documentation.
- Documented self-serve `cs_rw_` scan-creation keys for low-volume REST/SDK trials.

## 0.2.0

- Prepared the SDK for public npm distribution as `@certscore/sdk`.
- Added public package metadata, public publish config, and install-first README guidance.
- Documented the CertScore Pulse GitHub Action workflow as the recommended CI entry point.

## 0.1.0

- Prepared the TypeScript SDK as a source-preview package for future public distribution.
- Changed `certscore.scans.wait()` before first publish so it always resolves to the completed API v2 scan resource object.
- Added `CertScoreTimeoutError` and `CertScoreScanFailedError` exports for typed timeout and terminal failure handling.
