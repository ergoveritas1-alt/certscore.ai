# CertScore.ai Microsoft MCP Azure setup

Status: Azure/Entra setup complete and manually verified by Ben on 2026-08-23. The certification package has been rebuilt with the verified Key Vault URI. This repository does not contain, and AWS must not receive, the confidential client secret.

Current Microsoft certification requires an Azure Key Vault referenced by its vault URI and the case-sensitive secrets `ClientId`, `ClientSecret`, `TokenUrl`, and `AzureActiveDirectoryResourceId`. The Microsoft certification application service principal `8e91e74f-afe9-41cd-8c3f-17a9562a74ea` needs the least-privilege `Key Vault Secrets User` role at that vault.

## Verified values

Use a password manager or secure operator note, not this repository, for the confidential client secret.

```text
TENANT_ID=3fecc197-3e2f-415e-9a36-9fbed37cce61
KEY_VAULT_NAME=cs-msft-mcp-kv-7150890
KEY_VAULT_URI=https://cs-msft-mcp-kv-7150890.vault.azure.net/
RESOURCE_APP_CLIENT_ID=29eaafce-c468-4f71-8408-8cbdc1bb535b
RESOURCE_APP_ID_URI=api://29eaafce-c468-4f71-8408-8cbdc1bb535b
CLIENT_APP_CLIENT_ID=87f30881-d870-422a-96f2-95a7c7d38f50
REQUIRED_ROLE=Mcp.Access
CLIENT_SECRET=<secret value; never commit or place in AWS>
TOKEN_URL=https://login.microsoftonline.com/3fecc197-3e2f-415e-9a36-9fbed37cce61/oauth2/v2.0/token
MICROSOFT_CERTIFICATION_SERVICE_PRINCIPAL_APP_ID=8e91e74f-afe9-41cd-8c3f-17a9562a74ea
```

The two-app topology is deliberately single-tenant (`AzureADMyOrg`). The resource/API app represents CertScore's protected MCP API. The confidential client app is the sole allowed caller and receives the application-only `Mcp.Access` app role.

The resource app has `api.requestedAccessTokenVersion = 2`. The dedicated Key Vault contains four enabled secrets with the exact case-sensitive names `ClientId`, `ClientSecret`, `TokenUrl`, and `AzureActiveDirectoryResourceId`. Microsoft's certification service principal has vault-scoped `Key Vault Secrets User` access. Ben obtained a real client-credentials token using the current `ClientSecret` and manually verified the claims recorded below.

## Completed portal procedure (retained for audit and recovery)

1. In Microsoft Entra admin center, open **Identity > Applications > App registrations > New registration**. Create `CertScore.ai Microsoft MCP API`, select **Accounts in this organizational directory only**, and record its Application (client) ID and Directory (tenant) ID.
2. Open that resource app's **Expose an API** page and set the Application ID URI to `api://29eaafce-c468-4f71-8408-8cbdc1bb535b`.
3. Open **App roles > Create app role**. Use display name `MCP access`, allowed member types **Applications**, value `Mcp.Access`, and enable it. Record the role ID from the manifest or application object.
4. Create a second single-tenant registration named `CertScore.ai Microsoft MCP Client`. Record its Application (client) ID.
5. On the client app, open **Certificates & secrets > Client secrets > New client secret**. Use the shortest operationally practical lifetime, record its expiry, and copy the secret value once into a password manager.
6. On the client app, open **API permissions > Add a permission > My APIs > CertScore.ai Microsoft MCP API > Application permissions**, select `Mcp.Access`, then select **Grant admin consent**.
7. Create a Standard-tier Key Vault named for example `certscore-mcp-msft-kv-<unique-suffix>` with **Azure role-based access control** enabled. Keep it dedicated to Microsoft MCP certification/runtime credential material.
8. Add four secrets with exact case-sensitive names and these values:
   - `ClientId`: confidential client application's client ID.
   - `ClientSecret`: confidential client secret value.
   - `TokenUrl`: `https://login.microsoftonline.com/3fecc197-3e2f-415e-9a36-9fbed37cce61/oauth2/v2.0/token`.
   - `AzureActiveDirectoryResourceId`: `api://29eaafce-c468-4f71-8408-8cbdc1bb535b`.
9. In **Enterprise applications**, locate the application with Application ID `8e91e74f-afe9-41cd-8c3f-17a9562a74ea`. If it is not instantiated in the tenant, create its service principal as shown in the CLI procedure. Record its Object ID.
10. On the Key Vault, open **Access control (IAM) > Add role assignment**, select **Key Vault Secrets User**, select the Microsoft certification enterprise application, and scope the assignment to this vault only.
11. Run the client-credentials token test below. Do not proceed until the verified claims match exactly.
12. Rebuild the package from the verified Key Vault URI with the exact commands below. Repository-side schema, archive, and credential-pattern validation now pass. Microsoft Developer Portal validation and upload remain intentionally deferred until after endpoint deployment and bounded live authentication QA.

```bash
cd /Users/benmasek/WC01
pnpm --filter @certscore/mcp build
CERTSCORE_MICROSOFT_KEY_VAULT_URI="https://cs-msft-mcp-kv-7150890.vault.azure.net/" \
  node --import tsx scripts/build-microsoft-mcp-certification-package.ts
```

The builder accepts only an exact `https://<name>.vault.azure.net/` URI. Omitting the environment value deliberately regenerates the conspicuous blocked template rather than guessing a production vault.

## Repeatable Azure CLI procedure

These commands create resources and therefore must be run by Ben only after reviewing names, subscription, region, and cost. They are not executed automatically.

```bash
az login
az account set --subscription '<SUBSCRIPTION_ID_OR_NAME>'

TENANT_ID="$(az account show --query tenantId -o tsv)"
SUBSCRIPTION_ID="$(az account show --query id -o tsv)"
RESOURCE_GROUP='certscore-microsoft-mcp'
AZURE_LOCATION='westus2'
KEY_VAULT_NAME='certscore-mcp-msft-kv-<unique-suffix>'
MICROSOFT_CERTIFICATION_APP_ID='8e91e74f-afe9-41cd-8c3f-17a9562a74ea'
MCP_ACCESS_APP_ROLE_ID="$(uuidgen | tr '[:upper:]' '[:lower:]')"

az group create --name "$RESOURCE_GROUP" --location "$AZURE_LOCATION"

RESOURCE_APP_CLIENT_ID="$(az ad app create \
  --display-name 'CertScore.ai Microsoft MCP API' \
  --sign-in-audience AzureADMyOrg \
  --query appId -o tsv)"
RESOURCE_APP_ID_URI="api://$RESOURCE_APP_CLIENT_ID"

az ad app update --id "$RESOURCE_APP_CLIENT_ID" \
  --identifier-uris "$RESOURCE_APP_ID_URI" \
  --set api.requestedAccessTokenVersion=2 \
  --app-roles "[{
    \"allowedMemberTypes\":[\"Application\"],
    \"description\":\"Invoke the CertScore.ai Microsoft MCP endpoint.\",
    \"displayName\":\"MCP access\",
    \"id\":\"$MCP_ACCESS_APP_ROLE_ID\",
    \"isEnabled\":true,
    \"value\":\"Mcp.Access\"
  }]"
az ad sp create --id "$RESOURCE_APP_CLIENT_ID"

CLIENT_APP_CLIENT_ID="$(az ad app create \
  --display-name 'CertScore.ai Microsoft MCP Client' \
  --sign-in-audience AzureADMyOrg \
  --query appId -o tsv)"
az ad sp create --id "$CLIENT_APP_CLIENT_ID"

az ad app permission add \
  --id "$CLIENT_APP_CLIENT_ID" \
  --api "$RESOURCE_APP_CLIENT_ID" \
  --api-permissions "${MCP_ACCESS_APP_ROLE_ID}=Role"
az ad app permission admin-consent --id "$CLIENT_APP_CLIENT_ID"

# This command returns the secret value once. Keep it only in this shell and a password manager.
CLIENT_SECRET="$(az ad app credential reset \
  --id "$CLIENT_APP_CLIENT_ID" \
  --append \
  --display-name 'Microsoft MCP certification runtime' \
  --years 1 \
  --query password -o tsv)"

az keyvault create \
  --name "$KEY_VAULT_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --location "$AZURE_LOCATION" \
  --sku standard \
  --enable-rbac-authorization true
KEY_VAULT_ID="$(az keyvault show --name "$KEY_VAULT_NAME" --query id -o tsv)"
KEY_VAULT_URI="$(az keyvault show --name "$KEY_VAULT_NAME" --query properties.vaultUri -o tsv)"
TOKEN_URL="https://login.microsoftonline.com/$TENANT_ID/oauth2/v2.0/token"

az keyvault secret set --vault-name "$KEY_VAULT_NAME" --name ClientId --value "$CLIENT_APP_CLIENT_ID" --output none
az keyvault secret set --vault-name "$KEY_VAULT_NAME" --name ClientSecret --value "$CLIENT_SECRET" --output none
az keyvault secret set --vault-name "$KEY_VAULT_NAME" --name TokenUrl --value "$TOKEN_URL" --output none
az keyvault secret set --vault-name "$KEY_VAULT_NAME" --name AzureActiveDirectoryResourceId --value "$RESOURCE_APP_ID_URI" --output none

MICROSOFT_CERTIFICATION_SP_OBJECT_ID="$(az ad sp show --id "$MICROSOFT_CERTIFICATION_APP_ID" --query id -o tsv 2>/dev/null || true)"
if [ -z "$MICROSOFT_CERTIFICATION_SP_OBJECT_ID" ]; then
  MICROSOFT_CERTIFICATION_SP_OBJECT_ID="$(az ad sp create --id "$MICROSOFT_CERTIFICATION_APP_ID" --query id -o tsv)"
fi
az role assignment create \
  --assignee-object-id "$MICROSOFT_CERTIFICATION_SP_OBJECT_ID" \
  --assignee-principal-type ServicePrincipal \
  --role 'Key Vault Secrets User' \
  --scope "$KEY_VAULT_ID"

printf 'Tenant: %s\nResource app: %s\nResource URI: %s\nClient app: %s\nKey Vault URI: %s\nRole: Mcp.Access\n' \
  "$TENANT_ID" "$RESOURCE_APP_CLIENT_ID" "$RESOURCE_APP_ID_URI" "$CLIENT_APP_CLIENT_ID" "$KEY_VAULT_URI"
```

If `az ad app permission admin-consent` is restricted by tenant policy, a Global Administrator or Privileged Role Administrator must grant the same application permission in the portal. Do not weaken the API to accept role-less tokens.

## Token acquisition and claim verification

For the v2 client-credentials flow, request the resource Application ID URI plus `/.default`. That request uses the Key Vault `AzureActiveDirectoryResourceId` value as the resource identifier. A v2 token's `aud` is expected to be the resource/API app's client-ID GUID, not the `api://...` URI. This difference is intentional.

```bash
ACCESS_TOKEN="$(curl --fail --silent --show-error \
  --request POST "$TOKEN_URL" \
  --header 'Content-Type: application/x-www-form-urlencoded' \
  --data-urlencode "client_id=$CLIENT_APP_CLIENT_ID" \
  --data-urlencode "client_secret=$CLIENT_SECRET" \
  --data-urlencode "scope=$RESOURCE_APP_ID_URI/.default" \
  --data-urlencode 'grant_type=client_credentials' \
  | jq -r '.access_token')"
test -n "$ACCESS_TOKEN" && test "$ACCESS_TOKEN" != null

ACCESS_TOKEN="$ACCESS_TOKEN" TENANT_ID="$TENANT_ID" RESOURCE_APP_CLIENT_ID="$RESOURCE_APP_CLIENT_ID" \
CLIENT_APP_CLIENT_ID="$CLIENT_APP_CLIENT_ID" node --input-type=module -e '
  import { createRemoteJWKSet, jwtVerify } from "jose";
  const issuer = `https://login.microsoftonline.com/${process.env.TENANT_ID}/v2.0`;
  const jwks = createRemoteJWKSet(new URL(`https://login.microsoftonline.com/${process.env.TENANT_ID}/discovery/v2.0/keys`));
  const { payload } = await jwtVerify(process.env.ACCESS_TOKEN, jwks, {
    algorithms: ["RS256"], issuer, audience: process.env.RESOURCE_APP_CLIENT_ID
  });
  const selected = { aud: payload.aud, iss: payload.iss, tid: payload.tid, azp: payload.azp, appid: payload.appid, roles: payload.roles, ver: payload.ver, exp: payload.exp, nbf: payload.nbf };
  console.log(JSON.stringify(selected, null, 2));
  if (payload.tid !== process.env.TENANT_ID) throw new Error("tid mismatch");
  if (payload.azp !== process.env.CLIENT_APP_CLIENT_ID) throw new Error("azp mismatch");
  if (!Array.isArray(payload.roles) || !payload.roles.includes("Mcp.Access")) throw new Error("Mcp.Access missing");
'

unset ACCESS_TOKEN CLIENT_SECRET
```

Verified claims from the real client-credentials token:

- `iss`: `https://login.microsoftonline.com/3fecc197-3e2f-415e-9a36-9fbed37cce61/v2.0`
- `tid`: `3fecc197-3e2f-415e-9a36-9fbed37cce61`
- `aud`: `29eaafce-c468-4f71-8408-8cbdc1bb535b`
- `azp`: `87f30881-d870-422a-96f2-95a7c7d38f50`
- `roles`: `["Mcp.Access"]`
- `ver`: `2.0`
- `scp`: `null`, because this is an app-only token

The token value, complete decoded JWT, client secret, and Key Vault secret values were not placed in this repository or AWS.

Do not paste the access token, client secret, full decoded JWT, or Key Vault secret values into tickets, logs, chat, source control, or Partner Center metadata fields.

## AWS configuration after the token test

Insert only these non-secret values into the existing MCP ECS configuration:

```text
CERTSCORE_MICROSOFT_MCP_ENABLED=1
CERTSCORE_MICROSOFT_TENANT_ID=3fecc197-3e2f-415e-9a36-9fbed37cce61
CERTSCORE_MICROSOFT_RESOURCE_AUDIENCE=29eaafce-c468-4f71-8408-8cbdc1bb535b
CERTSCORE_MICROSOFT_ALLOWED_CLIENT_ID=87f30881-d870-422a-96f2-95a7c7d38f50
CERTSCORE_MICROSOFT_REQUIRED_ROLE=Mcp.Access
```

Do not put `ClientSecret` in AWS. The AWS service validates inbound JWTs through Microsoft's tenant JWKS and never acquires tokens. `CERTSCORE_MICROSOFT_JWKS_URL` is test-only; production derives the tenant-specific Microsoft JWKS URL and rejects a noncanonical override.

## Rotation

Before the client secret expires, create a second credential, store its value as a new `ClientSecret` Key Vault secret version, confirm Microsoft can obtain a token, and only then remove the prior credential. Keep the confidential client ID stable so AWS client binding and existing certification configuration do not change. Review Key Vault audit logs and the secret expiry schedule regularly.
