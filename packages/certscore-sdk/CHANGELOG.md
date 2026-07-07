# @certscore/sdk

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
