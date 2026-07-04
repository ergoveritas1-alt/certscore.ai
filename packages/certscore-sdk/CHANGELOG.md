# @certscore/sdk

## 0.1.0

- Prepared the TypeScript SDK for first public npm preview publication.
- Changed `certscore.scans.wait()` before first publish so it always resolves to the completed API v2 scan resource object.
- Added `CertScoreTimeoutError` and `CertScoreScanFailedError` exports for typed timeout and terminal failure handling.
