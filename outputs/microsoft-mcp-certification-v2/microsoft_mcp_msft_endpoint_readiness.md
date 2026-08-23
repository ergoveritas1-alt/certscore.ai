# CertScore.ai Microsoft MCP endpoint readiness

Assessment date: 2026-08-23
Repository: `/Users/benmasek/WC01`
Target endpoint: `https://mcp.certscore.ai/mcp/microsoft`

## A. Executive verdict

- **ENDPOINT IMPLEMENTATION READY:** YES, for review and deployment. The endpoint is locally implemented behind a default-off feature flag, is tenant/resource/client/role bound, and reuses the Light server. It is not present in production until the reviewed AWS deployment occurs.
- **PACKAGE READY:** YES, for post-deployment Microsoft Developer Portal validation and upload. The archive contains the verified Key Vault URI, passes the live Microsoft vDevPreview schema, contains exactly the five expected root files and three canonical Light tools, and passes the targeted credential scan. Upload remains intentionally deferred.
- **AZURE SETUP READY:** YES. Ben manually verified the two-app Entra topology, v2 resource token configuration, exact four enabled Key Vault secrets, Microsoft certification service-principal RBAC, successful client-credentials token acquisition, and the required token claims.
- **PRODUCTION DEPLOYMENT REQUIRED:** YES.

No deploy, AWS production mutation, production scan, commit, push, Partner Center validation, upload, or submission was performed. Read-only AWS inspection and Terraform planning were performed.

## B. Architecture

### Request flow

```text
Microsoft certification/runtime
  -> reads four credential values from dedicated Azure Key Vault
  -> confidential client requests an app-only Entra v2 token for api://<resource-app-id>/.default
  -> HTTPS Bearer request to existing AWS-hosted /mcp/microsoft
  -> tenant-specific Microsoft JWKS signature and claims validation
  -> existing MCP Light server and exact Light tool definitions
  -> existing CertScore API, scan reuse, status, bundle, evidence, quotas, and public report behavior
```

### Trust boundaries

- Azure Key Vault contains the confidential client secret. AWS does not read the vault and does not store that secret.
- AWS trusts only RS256 tokens signed by the configured tenant's canonical Entra JWKS endpoint.
- The validator binds the exact tenant, v2 issuer, resource audience, confidential client ID, and `Mcp.Access` application role. Delegated `scp` tokens are rejected.
- Authentication completes before MCP body parsing, session initialization, scan creation, quota consumption, or tool dispatch. Host/origin transport checks remain ahead of authentication.
- Successful MCP sessions are bound to the validated tenant/client pair without retaining or logging the bearer token.

### Azure components

- Single-tenant resource/API app: `CertScore.ai Microsoft MCP API`.
- Resource/API app client ID: `29eaafce-c468-4f71-8408-8cbdc1bb535b`.
- Application ID URI: `api://29eaafce-c468-4f71-8408-8cbdc1bb535b`.
- Resource app token version: `api.requestedAccessTokenVersion = 2`.
- Application-only app role: `Mcp.Access`.
- Single-tenant confidential client app: `CertScore.ai Microsoft MCP Client`, client ID `87f30881-d870-422a-96f2-95a7c7d38f50`.
- Dedicated Standard Key Vault `cs-msft-mcp-kv-7150890` at `https://cs-msft-mcp-kv-7150890.vault.azure.net/`, with exact enabled secrets `ClientId`, `ClientSecret`, `TokenUrl`, and `AzureActiveDirectoryResourceId`.
- Microsoft certification service principal application ID `8e91e74f-afe9-41cd-8c3f-17a9562a74ea`, granted vault-scoped `Key Vault Secrets User`.

Ben manually verified these Azure components and a real client-credentials token. The secret value and token were not provided to or persisted by this repository work.

### AWS components

- Existing MCP ECS service and task definition.
- Existing load balancer/domain; path routing remains application-level, so no new listener, DNS record, certificate, service, database, queue, or secret is required.
- Five non-secret ECS environment values are designed; the feature flag defaults off.

## C. Microsoft requirements reconciliation

Official live sources consulted again on 2026-08-23:

- [MCP server certification](https://learn.microsoft.com/en-us/microsoft-agent-365/mcp-certification).
- [Register MCP servers as Agent Connectors](https://learn.microsoft.com/en-us/microsoftteams/platform/m365-apps/agent-connectors).
- [Remote MCP authorization schema](https://learn.microsoft.com/en-us/microsoft-365/extensibility/schema/root-agent-connectors-tool-source-remote-mcp-server-authorization?view=m365-app-1.27).
- [Remote MCP server schema](https://learn.microsoft.com/en-us/microsoft-365/extensibility/schema/root-agent-connectors-tool-source-remote-mcp-server?view=m365-app-1.27).
- [Static MCP tool-description schema](https://learn.microsoft.com/en-us/microsoft-365/extensibility/schema/root-agent-connectors-tool-source-remote-mcp-server-mcp-tool-description?view=m365-app-1.27).
- [Teams app icon requirements](https://learn.microsoft.com/en-us/microsoftteams/platform/concepts/design/design-teams-app-icon-store-appbar).
- [Entra access-token claims](https://learn.microsoft.com/en-my/entra/identity-platform/access-token-claims-reference), [claims validation](https://learn.microsoft.com/en-my/entra/identity-platform/claims-validation), [client-credentials/app-only access](https://learn.microsoft.com/en-us/entra/identity-platform/app-only-access-primer), and [scopes and `.default`](https://learn.microsoft.com/en-us/entra/identity-platform/scopes-oidc).
- [Azure Key Vault RBAC guidance](https://learn.microsoft.com/en-us/azure/key-vault/general/rbac-guide).

The current certification page requires Azure Key Vault for new submissions, the four exact case-sensitive secrets, the vault URI in the manifest, and secret-read access for the named Microsoft certification service principal. The AWS MCP therefore validates inbound tokens only; adding an Azure SDK or copying the client secret into AWS would be unnecessary and would expand the trust boundary.

The package uses `manifestVersion: "devPreview"` and Microsoft's live `vDevPreview` schema because the current certification page's Azure Key Vault sample uses that schema and the downloaded live schema accepts `authorization.type: "AzureKeyVault"`. The downloaded stable v1.27 manifest schema currently rejects `AzureKeyVault` even though the certification and Agent Connector documentation requires/describes it. The generated manifest validates with zero errors against the live vDevPreview schema. This documentation/schema mismatch is a Partner Center validation risk to recheck immediately before upload.

For Entra client credentials, the Key Vault `AzureActiveDirectoryResourceId` is `api://29eaafce-c468-4f71-8408-8cbdc1bb535b` and token acquisition requests `api://29eaafce-c468-4f71-8408-8cbdc1bb535b/.default`. In the verified v2 access token, `aud` is the resource app's client-ID GUID, matching the AWS validator configuration.

## D. Repository changes

### Runtime, tests, dependency, and infrastructure

- `apps/mcp/package.json` — declares the existing lockfile-resolved `jose` package as a direct runtime dependency.
- `apps/mcp/src/env.ts` — adds validated, default-off Microsoft endpoint configuration and prevents noncanonical production JWKS overrides.
- `apps/mcp/src/microsoft-entra-auth.ts` — adds the reusable Entra JWT/JWKS validator.
- `apps/mcp/src/microsoft-entra-auth.test.ts` — covers validator success and issuer, tenant, audience, time, client, role, token-kind, and version failures.
- `apps/mcp/src/index.ts` — adds the authenticated sibling route while reusing the Light handler and keeping `/mcp` and `/mcp/light` routes intact.
- `apps/mcp/src/http-integration.test.ts` — adds end-to-end mocked Entra route, security, no-side-effect, no-token-forwarding, logging, tool parity, and tool-call tests.
- `infra/aws/web-ecs/variables.tf` — adds default-off, non-secret Terraform inputs.
- `infra/aws/web-ecs/main.tf` — passes those inputs to the existing MCP ECS task.
- `infra/aws/web-ecs/terraform.tfvars.example` — documents safe defaults.
- `pnpm-lock.yaml` — records `jose` as a direct MCP workspace dependency without introducing a new resolved version.
- `scripts/build-microsoft-mcp-certification-package.ts` — deterministically exports the live Light tool definitions, manifest template, introduction, brand icons, and root-only ZIP; a validated environment input accepts the verified final Key Vault URI.

### Generated deliverables

- `outputs/microsoft-mcp-certification-v2/package/manifest.json`
- `outputs/microsoft-mcp-certification-v2/package/mcptools.json`
- `outputs/microsoft-mcp-certification-v2/package/intro.md`
- `outputs/microsoft-mcp-certification-v2/package/color.png`
- `outputs/microsoft-mcp-certification-v2/package/outline.png`
- `outputs/microsoft-mcp-certification-v2/certscore-microsoft-mcp-package-v1.0.0.zip`
- `outputs/microsoft-mcp-certification-v2/azure_setup.md`
- `outputs/microsoft-mcp-certification-v2/microsoft_mcp_msft_endpoint_readiness.md`

### Deployment configuration

```text
CERTSCORE_MICROSOFT_MCP_ENABLED=1
CERTSCORE_MICROSOFT_TENANT_ID=3fecc197-3e2f-415e-9a36-9fbed37cce61
CERTSCORE_MICROSOFT_RESOURCE_AUDIENCE=29eaafce-c468-4f71-8408-8cbdc1bb535b
CERTSCORE_MICROSOFT_ALLOWED_CLIENT_ID=87f30881-d870-422a-96f2-95a7c7d38f50
CERTSCORE_MICROSOFT_REQUIRED_ROLE=Mcp.Access
```

All are non-secret. `CERTSCORE_MICROSOFT_JWKS_URL` exists only for mocked tests; production derives the canonical tenant URL and rejects an arbitrary override. No Entra client secret belongs in AWS.

### Production diff review

- Runtime diff: one direct `jose` dependency, validated Microsoft configuration, a tenant-scoped remote-JWKS verifier, one default-off `/mcp/microsoft` sibling route, and focused unit/integration coverage. It reuses the exact Light tool server and existing quotas; it adds no database, scan-pipeline, listener, DNS, queue, storage, or secret dependency.
- AWS diff: five non-secret Terraform variables and five ECS environment entries on the existing isolated `mcp-http` container. No IAM, task-role, security-group, ALB, DNS, certificate, service-count, CPU/memory, or AWS Secrets Manager change is present.
- Live read-only inspection: `certscore-web-mcp` is healthy at task definition `certscore-web-mcp:60`, desired/running `1/1`, with image `certscore-web-mcp:3cb2b2aa8128809b1f3721efb9258ed163e49603`; it has none of the Microsoft environment entries and therefore does not expose the new route.
- Full Terraform plan caveat: the current un-targeted plan is not deploy-safe. It proposes unrelated web task/service changes and would reconcile MCP from Terraform's older task-definition/image state. Do not run a full `terraform apply` for this rollout. Use the repository MCP image workflow first, then a reviewed MCP-only targeted Terraform plan/apply with the immutable deployed Git SHA passed as `mcp_image_tag` and the five verified values.

Rollback: capture the active MCP task-definition ARN immediately before the targeted apply, and restore that exact revision if endpoint verification fails. `/mcp/light` and `/mcp` remain independent. Revoke the client credential or role separately only if an identity compromise is suspected.

## E. Auth validation

Validated token properties:

- RS256 signature using tenant-specific published JWKS.
- Exact v2 issuer `https://login.microsoftonline.com/3fecc197-3e2f-415e-9a36-9fbed37cce61/v2.0`.
- Exact `tid` and `ver: "2.0"`.
- `exp` and `nbf`, with five seconds of clock tolerance.
- Exact resource/API client-ID GUID in `aud`.
- Exact confidential client ID in `azp` (`appid` is supported as the v1 claim name but v2 is required).
- `roles` contains configured `Mcp.Access`.
- Nonempty delegated `scp` is absent.

Missing tokens, invalid schemes, malformed or unverifiable JWTs, wrong issuer/tenant/audience/client/version, expired tokens, future-not-before tokens, and delegated tokens return 401. A valid token missing the required application role returns 403. All failures occur before MCP parsing or scan/tool work. A valid token may proceed to initialize, list, and call only the Light tools.

`jose.createRemoteJWKSet` caches keys for six hours, uses a 30-second refresh cooldown, and bounds fetches to five seconds. Production uses only `https://login.microsoftonline.com/3fecc197-3e2f-415e-9a36-9fbed37cce61/discovery/v2.0/keys`.

Logs never include Authorization headers, tokens, secrets, or full claim payloads. Rejections log only an outcome/reason. Successful validation may log the validated tenant ID and client ID plus request method. Tests assert that valid and malformed token markers do not appear and that the Entra token is never forwarded to the CertScore API.

## F. Tool parity

| Property | Public Light | Microsoft sibling | Result |
|---|---|---|---|
| Implementation | `createCertScoreMcpServer({ toolProfile: "light" })` | Same | Exact |
| Tool count | 3 | 3 | Exact |
| Names | scan, status, bundle canonical names | Same | Exact |
| Descriptions | Canonical Light descriptions | Same objects | Exact |
| Input schemas | Canonical Light schemas | Same objects | Exact |
| Scan/reuse/status/bundle semantics | Light | Light handler | Shared |
| Safety, evidence, legal-boundary language | Light | Light handler | Shared |
| New-scan quota | Anonymous Light policy, requester-IP keyed | Same policy, requester-IP keyed | Preserved |
| Read limits | Canonical shared MCP read policy | Same | Preserved |

Integration tests compare name, description, input schema, ordering, and count. The generated `mcptools.json` is exported from a locally initialized Light server rather than manually duplicated.

## G. Azure setup

Azure setup is complete. Ben verified `aud=29eaafce-c468-4f71-8408-8cbdc1bb535b`, `iss=https://login.microsoftonline.com/3fecc197-3e2f-415e-9a36-9fbed37cce61/v2.0`, `tid=3fecc197-3e2f-415e-9a36-9fbed37cce61`, `azp=87f30881-d870-422a-96f2-95a7c7d38f50`, `roles=["Mcp.Access"]`, `ver=2.0`, and `scp=null` on a real client-credentials token. The current client secret successfully obtains that token. The exact four Key Vault secrets are enabled, and Microsoft's certification service principal has `Key Vault Secrets User`.

Repository-side verification relies on Ben's manual Azure evidence; this work did not retrieve or print the secret or token. `azure_setup.md` now records the verified non-secret configuration and retains the setup/rotation procedure.

## H. Package

| File | SHA-256 | Validation |
|---|---|---|
| `manifest.json` | `d7db21f44ab4988a499c1d14c4451d32769adc8bc1974a3a5df63353f073f8e1` | Valid live vDevPreview schema; verified Key Vault URI |
| `mcptools.json` | `2012e9ecafdb6bb040a61c241267d424139b3da293a75ee093a1553d2b1a2934` | Valid JSON; exactly three canonical Light tools |
| `intro.md` | `1bf22fc2bc8333ac5c2f3cd74df3a737848f18d1dea1c194a7e4006e890bcf32` | Boundary-safe Microsoft edition positioning |
| `color.png` | `f4ffa4ab982d404b098e835090a5a21987623f6e95103ad81c6495587d1022d2` | 192x192 RGBA/sRGB; existing vector brand mark within 120x120 safe area |
| `outline.png` | `e5eaa533c6d61c0018f8a931d5f1990a24de4da63cb21d26529f07cb67ad8b80` | 32x32 RGBA/sRGB; transparent background and white outline mark |
| ZIP | `f02dfc8225e9a0ed7ab0434884a4f10822bdecfde801c26901346b0968376ba7` | Integrity passes; exact five root files; deterministic timestamp/order |

The ZIP has no wrapper directory, `.DS_Store`, absolute paths, symlinks, extra files, or detected credential patterns. Both JSON files parse. The live vDevPreview manifest schema reports zero errors. The manifest contains `authorization.type=AzureKeyVault` and the exact verified vault URI. The archive is package-ready, but upload remains intentionally blocked on production endpoint deployment and bounded live authentication QA.

## I. Tests

| Command/check | Result |
|---|---|
| `pnpm --filter @certscore/mcp-http test` | PASS, 25/25 |
| `pnpm --filter @certscore/api-contracts test` | PASS, 14/14 |
| `pnpm --filter @certscore/mcp-auth test` | PASS, 3/3 |
| `pnpm --filter @certscore/mcp test` | PASS, 73/73 |
| `pnpm --filter @certscore/mcp-http build` | PASS |
| `pnpm typecheck` | PASS, 19/19 workspaces |
| `NODE_OPTIONS=--max-old-space-size=8192 pnpm build` | PASS, 19/19 workspaces; initial default-heap run reached Node's 4 GB ceiling after 18/19 |
| Next.js build-integrated lint/type validation | PASS; no root `lint` script is configured |
| `node --import tsx scripts/verify-mcp-light-production.ts` | PASS, read-only; production Light is unauthenticated and has exactly three tools; lifecycle scan intentionally skipped |
| Microsoft mocked integration matrix | PASS: all 15 requested cases, including no scan/quota side effect and no token leakage/forwarding |
| `terraform fmt -check -recursive` | PASS |
| `terraform validate` | PASS |
| Full production Terraform plan with verified values | REVIEWED/REJECTED FOR APPLY: also proposes unrelated web reconciliation and older MCP Terraform state |
| MCP-only targeted Terraform plan with current immutable image and verified values | PASS SCOPE REVIEW: only `aws_ecs_task_definition.mcp` replacement and `aws_ecs_service.mcp` update; plan only, not applied |
| Live Microsoft vDevPreview manifest validation | PASS, zero errors |
| ZIP names, dimensions, integrity, symlink/`.DS_Store`, JSON, SHA-256 checks | PASS |
| Targeted package credential-pattern scan | PASS; no private key, JWT, bearer token, AWS/GitHub token, or assigned client-secret pattern |
| `git diff --check` | PASS |
| `pnpm audit --prod --audit-level high` | CAVEAT: existing repository audit is not clean (72 advisories: 1 critical, 32 high, 33 moderate, 6 low); no advisory names `jose` |

The audit includes existing Better Auth, Next.js, PostCSS, `nanoid`, `fast-uri`, and `ip-address` paths; `fast-uri` and `ip-address` also occur under existing MCP dependency paths. `jose@6.2.2` was already resolved transitively and this change only makes it direct for the MCP runtime; no advisory names `jose`. Remediating or explicitly accepting the existing baseline is outside this endpoint diff but remains a production release decision.

Read-only production checks passed for the existing Light endpoint and its exact three tools. Production health reports `microsoftEndpoint: null`, and `/mcp/microsoft` returns 404 as expected before deployment. No live Microsoft authentication QA or production scan was performed.

## J. Costs

- **Azure:** App registrations, enterprise applications, and role assignments have no expected direct recurring charge. The now-created Standard Key Vault bills secret operations transactionally. Under expected certification/low-volume runtime retrieval (well below 10,000 operations/month), the conservative incremental estimate remains **less than $0.10/month**; actual pricing depends on the Azure agreement and region. See [Azure Key Vault pricing](https://azure.microsoft.com/en-us/pricing/details/key-vault/).
- **AWS:** **$0 new fixed monthly cost** and no new AWS resources. The path runs in the existing MCP ECS service; marginal JWT CPU and occasional JWKS HTTPS traffic are estimated at **less than $0.01/month** at certification traffic. Existing scan costs and canonical quotas are unchanged.
- **Paid model/API usage:** none added.

Both anticipated increments are below the repository's $1/month approval threshold and are disclosed here. Higher traffic should trigger a fresh cost review rather than being inferred as pre-approved.

## K. Risks

- **Token/client binding:** A wrong tenant, resource, client, delegated token, or missing role fails closed. The proposed production values match the manually verified real token.
- **Credential rotation:** Microsoft depends on the Key Vault client secret while AWS does not. Rotate with an overlapping second credential and Key Vault secret version before deleting the old credential. Track expiry operationally.
- **Certification service access:** The Microsoft service principal must exist in the tenant and retain vault-scoped `Key Vault Secrets User`. Tenant policy, RBAC propagation, vault firewall settings, or an incorrect object ID can block certification.
- **Manifest schema:** Azure Key Vault currently requires the certification page's devPreview schema due the stable v1.27 schema mismatch. Revalidate current documentation and Developer Portal acceptance immediately before upload.
- **Quota interaction:** Microsoft keeps anonymous Light-style scan safety and quotas. New scans are keyed by requester IP, so shared Microsoft egress can aggregate allowance; scan reuse mitigates this. Do not raise limits silently if certification traffic exposes contention.
- **JWKS/network:** Cached JWKS avoids per-request calls, but initial/rotation refresh requires Microsoft login endpoint reachability. Failure is bounded and closed.
- **Rollout:** The flag defaults off. The current full Terraform plan includes unrelated web reconciliation and older MCP Terraform state, so it must not be applied wholesale. Use the reviewed MCP-only sequence and retain the pre-enable task-definition ARN for rollback.
- **Dependency baseline:** The existing production audit has high/critical advisories unrelated to `jose`; release review should explicitly accept or remediate that baseline.

## L. Exact next steps

1. **Ben review/approval:** Review the implementation/infrastructure diff, this readiness report, the rebuilt ZIP/hash, the sub-$1/month cost disclosure, the dependency-audit baseline, and the MCP-only deployment sequence. The exact next action is to approve or reject committing this scoped work and proceeding to the AWS rollout; do not upload the package yet.
2. **Commit and MCP image workflow:** From a clean reviewed branch, commit/push the scoped MCP, infrastructure, builder, lockfile, and output files. Let `.github/workflows/mcp-aws-ecs-deploy.yml` build, scan, deploy, and verify the immutable MCP image. Record the deployed Git SHA and task-definition ARN.
3. **MCP-only configuration:** Run a targeted Terraform plan with `mcp_image_tag=<deployed Git SHA>` and the five exact verified Microsoft variables. Require a plan limited to replacement of `aws_ecs_task_definition.mcp` and update of `aws_ecs_service.mcp`; then apply that saved plan. Do not run an un-targeted apply.
4. **Live QA:** Use the real Entra token only from a secure operator shell to test 401/403 behavior, valid initialize and exact tools/list parity, logs, and rollback readiness. Do not create a production scan unless Ben separately authorizes it. Confirm `/mcp/light` and `/mcp` remain unchanged.
5. **Partner Center:** Validate the already-rebuilt ZIP in Microsoft Developer Portal, then upload/submit only after separate approval.
