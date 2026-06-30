# CertScore API Contracts

Shared public contract package for CertScore API, Pulse API, SDK, and MCP surfaces.

This package is the home for public-safe schemas, enums, OpenAPI builders, and future SDK/MCP contract types. It must not create findings, infer scanner evidence, or bypass the canonical CertScore scan-to-report flow.

Current scope:

- Pulse v1 public constants.
- Pulse v1 public response/status/error schemas.
- Pulse v1 OpenAPI document builder used by the web route.
- Draft API v2 resource schemas and OpenAPI builder.

Future scope:

- API v2 route implementation and compatibility tests.
- SDK resource-client response types.
- MCP tool input/output schemas.
