# CertScore.ai Microsoft MCP endpoint readiness

Assessment date: 2026-08-23; package refresh: 2026-08-28
Repository: `/Users/benmasek/WC01`
Target endpoint: `https://mcp.certscore.ai/mcp/microsoft`

## A. Executive verdict

- **ENDPOINT IMPLEMENTATION READY:** YES. The scoped implementation was committed, built, scanned, deployed, enabled, and verified with a fresh real Entra client-credentials token through initialize and tools/list only. Production is healthy with the Microsoft endpoint enabled.
- **PACKAGE READY:** YES — READY TO UPLOAD when Ben separately authorizes the Partner Center action. Package v1.0.1 contains the verified Key Vault URI, exactly the five expected root files and three canonical Light tools, current support metadata, and marketplace copy that explains the bounded Reject Path and confirmed post-refusal observations. Offline structure, JSON, ASCII, icon, archive-integrity, and credential checks pass. Upload remains intentionally deferred so Partner Center can run its authenticated validator immediately before submission.
- **AZURE SETUP READY:** YES. Ben manually verified the two-app Entra topology, v2 resource token configuration, exact four enabled Key Vault secrets, Microsoft certification service-principal RBAC, successful client-credentials token acquisition, and the required token claims.
- **PRODUCTION DEPLOYMENT REQUIRED:** COMPLETE.

The feature commits were pushed and the reviewed AWS rollout was completed. No production scan, Partner Center validation, upload, or submission was performed. Production runs task definition `certscore-web-mcp:64` with `microsoftEndpoint: https://mcp.certscore.ai/mcp/microsoft`.

### Release execution outcome

- Implementation commit: `c74b2f5b283614a9be6f3d53dccd554cb13a7cdb` (`Add tenant-bound Microsoft MCP endpoint`).
- Verified-vault package commit and deployed image SHA: `0f0dc9547a30762f8c1c08ebde11d265d8ef021d` (`fix(mcp): use verified Microsoft Key Vault URI`).
- AWS workflow: `MCP AWS ECS Deploy`, run `32661304333`, job `97247802150`, completed successfully for the deployed image SHA.
- Workflow URL: `https://github.com/ergoveritas1-alt/certscore.ai/actions/runs/32661304333`.
- Task definition before enablement: `arn:aws:ecs:us-west-1:199536052647:task-definition/certscore-web-mcp:62`.
- First enabled task definition: `arn:aws:ecs:us-west-1:199536052647:task-definition/certscore-web-mcp:63`; it was rolled back solely because the first operator environment lacked Azure authentication.
- Final enabled task definition: `arn:aws:ecs:us-west-1:199536052647:task-definition/certscore-web-mcp:64`.
- The final saved Terraform plan explicitly replaced the MCP task definition and updated the service. Its non-no-op address set was programmatically asserted to be exactly `aws_ecs_service.mcp` and `aws_ecs_task_definition.mcp`; no other resource was applied.
- Enabled health returned HTTP 200, `status: ok`, version `0.2.15`, and `microsoftEndpoint: https://mcp.certscore.ai/mcp/microsoft`.
- An unauthenticated initialize request returned the designed HTTP 401 and no request-failure log event.
- Authenticated QA used Ben's authenticated Azure Cloud Shell and kept the Key Vault secret and access token in shell memory without printing either. Token acquisition passed; initialize returned HTTP 200 using protocol `2025-06-18`; the initialized notification returned HTTP 202; tools/list returned HTTP 200; and session close returned HTTP 200.
- Authenticated tools/list returned exactly `certscore_get_scan_bundle`, `certscore_get_scan_status`, and `certscore_scan_site`. The canonicalized tool schema SHA-256 was `553071f0561eeae06331f3ecae0c8c45e116a8e084b46ad0e8fe1e3947810d2a`, exactly matching the independently computed production Light digest. No tool was called.
- Current health returns HTTP 200, `status: ok`, and the exact Microsoft endpoint. Final Light verification passes with exact three-tool parity and its lifecycle scan branch skipped.
- On 2026-08-28, current health again returned HTTP 200, `status: ok`, version `0.2.16`, and the exact Microsoft endpoint.
- CloudWatch review of the final QA window found 26 MCP log events: four validated Microsoft events, the expected one rejected anonymous request, zero bearer/JWT/client-secret/Authorization material, zero `mcp_http.request_failed` events, zero rate-limit events, and zero scan-tool or scan-creation events.
- Production scans created by this release and QA: **0**.

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

Official live sources consulted again on 2026-08-28:

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
- `outputs/microsoft-mcp-certification-v2/certscore-microsoft-mcp-package-v1.0.1.zip`
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
- Live release result: the image workflow successfully deployed SHA `0f0dc9547a30762f8c1c08ebde11d265d8ef021d` as task definition `certscore-web-mcp:62`. The final targeted Terraform enablement created task definition `certscore-web-mcp:64` with the five verified non-secret values and updated only the MCP service. Production is healthy at desired/running `1/1` and exposes the authenticated Microsoft route.
- Full Terraform plan caveat: the current un-targeted plan is not deploy-safe. It proposes unrelated web task/service changes and would reconcile MCP from Terraform's older task-definition/image state. Do not run a full `terraform apply` for this rollout. Use the repository MCP image workflow first, then a reviewed MCP-only targeted Terraform plan/apply with the immutable deployed Git SHA passed as `mcp_image_tag` and the five verified values.

Rollback was exercised successfully during the first attempt by restoring the captured `certscore-web-mcp:62` task definition and waiting for service stability. It remains the exact immediate rollback target for task definition `64`. `/mcp/light` remained independent and passed its complete no-lifecycle production verifier. Revoke the client credential or role separately only if an identity compromise is suspected.

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
| `manifest.json` | `13db13904ced3edf00f013a4b67098db9cdc87ff227190b312ef72172b332257` | Microsoft 365 Agents Toolkit schema validation passes; verified Key Vault URI; current support and Reject Path metadata |
| `mcptools.json` | `07e480e62c61a66cd92d42e5a038a82c65195ea5d1d25f7aa13643dda46c14c3` | Valid JSON; exactly three canonical Light tools with current post-refusal semantics |
| `intro.md` | `36c53088cbd4d6400610a5e3f933ef93426648969c91781bb4edbc3d4ab79820` | Boundary-safe Microsoft edition positioning and bounded Reject Path guidance |
| `color.png` | `f4ffa4ab982d404b098e835090a5a21987623f6e95103ad81c6495587d1022d2` | 192x192 RGBA/sRGB; existing vector brand mark within 120x120 safe area |
| `outline.png` | `e5eaa533c6d61c0018f8a931d5f1990a24de4da63cb21d26529f07cb67ad8b80` | 32x32 RGBA/sRGB; transparent background and white outline mark |
| ZIP | `22181cd1c67354e34a9cd8728bba2c1ae76b34bb6fa0760a4c581435c03b03c8` | v1.0.1; integrity passes; exact five root files; deterministic timestamp/order |

The ZIP has no wrapper directory, `.DS_Store`, absolute paths, symlinks, extra files, or detected credential patterns. Both JSON files parse, the manifest and tool-definition headers are ASCII-only, and the manifest contains `authorization.type=AzureKeyVault` with the exact verified vault URI. The archive is package-ready. The Microsoft 365 Agents Toolkit package validator requires an authenticated Microsoft 365 developer session, so the final Microsoft validation is intentionally deferred to the authenticated Partner Center upload flow.

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
| MCP-only targeted Terraform plan/apply with immutable image and verified values | PASS/APPLIED: final exact non-no-op set was `aws_ecs_task_definition.mcp` replacement and `aws_ecs_service.mcp` update; task definition `64` is stable and enabled |
| Live authenticated Entra initialize and tools/list | PASS: initialize 200, initialized notification 202, tools/list 200, exact three tools, exact Light schema digest, zero tools/call |
| Final CloudWatch safety/no-side-effect review | PASS: zero credential material, request failures, rate-limit events, scan-tool events, or scan-creation events |
| `atk validate --manifest-file ...` using Microsoft 365 Agents Toolkit 1.1.15 | PASS, corresponding schema and validation rules |
| ZIP names, dimensions, integrity, symlink/`.DS_Store`, JSON, SHA-256 checks | PASS |
| Targeted package credential-pattern scan | PASS; no private key, JWT, bearer token, AWS/GitHub token, or assigned client-secret pattern |
| `git diff --check` | PASS |
| `pnpm audit --prod --audit-level high` | CAVEAT: existing repository audit is not clean (72 advisories: 1 critical, 32 high, 33 moderate, 6 low); no advisory names `jose` |

The critical advisory is Better Auth `GHSA-pw9m-5jxm-xr6h` / `CVE-2026-53512`: repository version `better-auth@1.6.5`, affected below `1.6.11`, through the root and `apps/web` paths. The advisory concerns refresh-token replay in Better Auth's legacy `oidcProvider()` or `mcp()` plugins for confidential OAuth clients. The deployed MCP container's filtered production dependency tree contains no Better Auth package, `/mcp/microsoft` uses the custom `jose` validator, no Better Auth plugin is imported by the MCP workspaces, and the currently deployed Light container has the same absence. `jose` is not implicated. Release acceptance was therefore recorded as an existing web/root baseline with no new MCP runtime exposure or invocation path.

Release checks passed for the Light endpoint and its exact three tools before enablement, during both enablements, after the exercised rollback, and after final authenticated QA. `/mcp/microsoft` returned the designed 401 without Authorization and accepted a fresh valid Entra token for initialize and tools/list. No tools/call or production scan was performed.

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
- **Rollout:** The flag defaults off. The scoped sequence and rollback were both exercised successfully, and the final service is stable on enabled task definition `64`. Task definition `62` remains the tested rollback target. Never apply the unrelated full Terraform reconciliation.
- **Dependency baseline:** The existing production audit has high/critical advisories unrelated to `jose`; release review should explicitly accept or remediate that baseline.

## L. Exact next steps

1. **Exact next action for Ben:** Open Partner Center and create an **Apps and Agents for M365 and Copilot** offer, then upload `certscore-microsoft-mcp-package-v1.0.1.zip`. No further AWS, Azure, token, scan, or Entra-security action is required for endpoint readiness.
2. **Partner Center:** Run the authenticated package validator during upload because of the documented devPreview/stable-schema mismatch. Fix any blocking validator issue before submission; do not submit the offer until Ben separately authorizes the final external submission action.
3. **Operations:** Keep task definition `62` recorded as the immediate rollback target and retain the current Key Vault credential-rotation/expiry process. Do not place the client secret in AWS or the repository.
