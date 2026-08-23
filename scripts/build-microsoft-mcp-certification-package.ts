import { execFileSync } from "node:child_process";
import { mkdir, rm, utimes, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import sharp from "sharp";

const outputRoot = resolve("outputs/microsoft-mcp-certification-v2");
const packageDir = join(outputRoot, "package");
const zipPath = join(outputRoot, "certscore-microsoft-mcp-package-v1.0.0.zip");
const templateKeyVaultUri = "https://REPLACE-WITH-CERTSCORE-MCP-KEY-VAULT.vault.azure.net/";
const keyVaultUri = process.env.CERTSCORE_MICROSOFT_KEY_VAULT_URI?.trim() || templateKeyVaultUri;

if (keyVaultUri !== templateKeyVaultUri && !/^https:\/\/[a-z0-9-]+\.vault\.azure\.net\/$/.test(keyVaultUri)) {
  throw new Error("CERTSCORE_MICROSOFT_KEY_VAULT_URI must be an exact https://<name>.vault.azure.net/ URI.");
}

async function lightTools() {
  const { createCertScoreMcpServer } = await import("../packages/certscore-mcp/dist/server.js");
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createCertScoreMcpServer({ toolProfile: "light" });
  const client = new Client({ name: "certscore-microsoft-package-builder", version: "1.0.0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  try {
    return (await client.listTools()).tools;
  } finally {
    await client.close();
    await server.close();
  }
}

const manifest = {
  $schema: "https://developer.microsoft.com/en-us/json-schemas/teams/vDevPreview/MicrosoftTeams.schema.json",
  manifestVersion: "devPreview",
  version: "1.0.0",
  id: "b971ee8e-f595-4a87-8b18-a401171f821d",
  developer: {
    name: "CertScore.ai",
    mpnId: "7150890",
    websiteUrl: "https://certscore.ai/contact",
    privacyUrl: "https://certscore.ai/privacy",
    termsOfUseUrl: "https://certscore.ai/terms"
  },
  name: {
    short: "CertScore.ai Microsoft MCP",
    full: "CertScore.ai Website Privacy Scanner MCP for Microsoft"
  },
  description: {
    short: "Evidence-backed privacy scans for public websites.",
    full: "Microsoft-authenticated CertScore.ai MCP Light scans public websites for observable privacy, consent, policy, tracker, cookie/storage, and HTTPS/TLS signals. Results support human and agentic review and are not legal advice, certification, or a compliance determination."
  },
  agentConnectors: [{
    id: "certscore-microsoft-mcp",
    displayName: "CertScore.ai Website Privacy Scanner MCP",
    description: "Scan or reuse a public-website assessment, check status, and retrieve its bounded evidence-backed report bundle.",
    toolSource: {
      remoteMcpServer: {
        mcpServerUrl: "https://mcp.certscore.ai/mcp/microsoft",
        mcpToolDescription: { file: "mcptools.json" },
        authorization: {
          type: "AzureKeyVault",
          referenceId: keyVaultUri
        }
      }
    }
  }],
  icons: { outline: "outline.png", color: "color.png" },
  accentColor: "#020617"
};

const intro = `# CertScore.ai Website Privacy Scanner MCP

CertScore.ai provides evidence-backed website privacy scanning for public websites. It observes bounded public-web signals such as pre-consent cookies and browser storage, third-party trackers, CMP and consent controls, privacy-policy signals, GDPR/ePrivacy and CCPA/CPRA review signals, and HTTPS/TLS behavior.

This is the Microsoft-authenticated edition of CertScore.ai MCP Light. Microsoft authenticates service-to-service with a tenant-bound Microsoft Entra application token. End users do not need separate CertScore credentials.

## Three-tool lifecycle

1. Use \`certscore_scan_site\` to request a scan or reuse an eligible recent completed scan. Keep the stable \`scanId\` returned by the tool. The default \`freshness=latest\` avoids unnecessary new scans; use \`refresh\` only when a fresh run is explicitly required.
2. Use \`certscore_get_scan_status\` with that \`scanId\` while the scan is queued, running, or finalizing. Follow the returned retry guidance and stop at a terminal state.
3. For \`completed\` or \`completed_limited\`, use \`certscore_get_scan_bundle\` to retrieve the bounded canonical findings, evidence summaries and references, provenance, coverage limitations, score metadata, and public report URL.

The Microsoft endpoint retains MCP Light's bounded anonymous-style scan and read quotas. Eligible recent-result reuse does not consume a new-scan allowance. Current automated-access policy and retry guidance are published at https://certscore.ai/developers/reference. For higher-volume use, contact support@certscore.ai.

## Public reports and evidence boundaries

Usable completed results include a public CertScore report URL. Returned content is bounded and public-safe: it excludes raw cookie values, raw request or response bodies, sensitive payloads, full DOM content, and unredacted query values. Findings and checklist rows come from CertScore's canonical evidence, concern-policy, and projection pipeline.

Results are evidence-backed automated observations of public websites for human and agentic review. They are not legal advice, certification, or a compliance determination. Missing or limited evidence is not proof of compliance, and observed review lenses are not legal conclusions.

## Known issues and limitations

- Scans cover observable public-web behavior from the selected execution region and time; site behavior can vary by location, session, account state, personalization, and later changes.
- \`completed_limited\` is usable but has explicit coverage limitations. Read those limitations before interpreting findings.
- Missing consent-action evidence does not establish Accept, Reject, Decline, or deeper preference behavior.
- Do not extrapolate observed vendors, embeds, requests, cookies, fingerprinting, tracking, or processing beyond what the retained evidence supports.
- Authentication is service-to-service. Microsoft Entra or Azure Key Vault configuration failures require administrator or publisher remediation rather than end-user CertScore login.

## Support and policies

- Support: https://certscore.ai/contact or support@certscore.ai
- Privacy: https://certscore.ai/privacy
- Terms: https://certscore.ai/terms
`;

const outlineSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
  <path d="M16 2.2c3.7 1.9 8 2.9 13 3.2v7.9c0 8-5.2 13.9-13 16.7C8.2 27.2 3 21.3 3 13.3V5.4c5-.3 9.3-1.3 13-3.2Z" fill="none" stroke="#FFFFFF" stroke-width="2" stroke-linejoin="round"/>
  <path d="m10.6 15.7 3.9 3.8 8.8-9" fill="none" stroke="#FFFFFF" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

async function main() {
  await rm(packageDir, { force: true, recursive: true });
  await rm(zipPath, { force: true });
  await mkdir(packageDir, { recursive: true });
  const tools = await lightTools();
  await Promise.all([
    writeFile(join(packageDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8"),
    writeFile(join(packageDir, "mcptools.json"), `${JSON.stringify({ tools }, null, 2)}\n`, "utf8"),
    writeFile(join(packageDir, "intro.md"), intro, "utf8"),
    sharp("apps/web/public/certscore-mark-dark.svg")
      .resize(120, 120)
      .extend({ top: 36, bottom: 36, left: 36, right: 36, background: "#020617" })
      .png()
      .toFile(join(packageDir, "color.png")),
    sharp(Buffer.from(outlineSvg)).resize(32, 32).png().toFile(join(packageDir, "outline.png"))
  ]);

  const packageTimestamp = new Date("2026-08-22T00:00:00.000Z");
  await Promise.all(["manifest.json", "mcptools.json", "intro.md", "color.png", "outline.png"]
    .map((name) => utimes(join(packageDir, name), packageTimestamp, packageTimestamp)));

  execFileSync("zip", ["-X", "-q", zipPath, "manifest.json", "mcptools.json", "intro.md", "color.png", "outline.png"], {
    cwd: packageDir,
    env: { ...process.env, TZ: "UTC" }
  });
  console.log(JSON.stringify({ keyVaultTemplate: keyVaultUri === templateKeyVaultUri, outputRoot, packageDir, toolCount: tools.length, zipPath }));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
