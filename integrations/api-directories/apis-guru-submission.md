# APIs.guru Submission

Use this body for an APIs.guru `Add API` issue or pull request.

```text
Format: openapi
Official: true
Url: https://certscore.ai/api/v2/openapi.json
Name: CertScore API
Category: security
Logo: https://certscore.ai/certscore-mark-dark.png
Homepage: https://certscore.ai/developers
Description: CertScore Pulse and API v2 expose automated public-web observations for website risk-signal review, including scan creation, scan status, public-safe findings, Pulse projection, latest-domain lookup, and pre-consent cookies and trackers. CertScore outputs are review signals, not legal advice, certification, or a compliance determination.
```

Pre-submit checks:

- `https://certscore.ai/api/v2/openapi.json` returns HTTP 200 JSON.
- OpenAPI `info.version` matches the public release being announced.
- The docs page at `https://certscore.ai/developers` links to API, SDK, MCP, examples, and support.
