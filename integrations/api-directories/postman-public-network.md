# Postman Public API Network Listing

Use `integrations/postman/certscore-api-v2.postman_collection.json` as the seed collection for a public CertScore workspace.

Suggested workspace copy:

```text
CertScore API

CertScore Pulse and API v2 provide automated public-web observations for website risk-signal review: scan creation, status polling, public-safe findings, Pulse projection, latest-domain lookup, and pre-consent cookies and trackers.

CertScore outputs are automated review signals. They are not legal advice, certification, or a compliance determination.
```

Suggested links:

- Developer hub: https://certscore.ai/developers
- Quickstart: https://certscore.ai/developers/quickstart
- API reference: https://certscore.ai/developers/reference
- OpenAPI: https://certscore.ai/api/v2/openapi.json
- SDK: https://certscore.ai/developers/sdk
- MCP: https://certscore.ai/developers/mcp
- Support: support@certscore.ai

Publishing checklist:

- Import the collection.
- Set `CERTSCORE_API_KEY` as a secret collection variable.
- Keep `baseUrl` as `https://certscore.ai`.
- Publish the workspace to the Postman Public API Network.
- Add a Run in Postman button to the developer docs after the public workspace URL is available.
