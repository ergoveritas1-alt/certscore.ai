import type { SaleSharingCanaryLedger } from "@certscore/contracts";
import type { RedHatCanaryGrant } from "../redhat-opt-out-canary";

export function redHatCanaryFixture(scanId: string) {
  const grant: RedHatCanaryGrant = {
    version: "redhat_opt_out_canary.v1", scanId, region: "us-west-1",
    functionName: "certscore-redhat-fixture:42", buildGitSha: "a".repeat(40),
    issuedAt: new Date(Date.now() - 1000).toISOString(), expiresAt: new Date(Date.now() + 60_000).toISOString(),
  };
  const runtime = { functionName: "certscore-redhat-fixture", functionVersion: "42", region: grant.region, buildGitSha: grant.buildGitSha, memoryMb: 3008 };
  const claims = new Map<string, unknown>();
  const approval: {value:unknown} = {value:{grant,approved:true}};
  const ledger: SaleSharingCanaryLedger = {
    async read(key) { return key === `v2-dag-lambda/local/redhat-opt-out-canary/${scanId}/approval.json` ? approval.value : claims.get(key) ?? null; },
    async create(key, value) {
      if (claims.has(key)) throw Error("already_claimed");
      claims.set(key, value);
    },
  };
  return { grant, runtime, ledger, claims, approval };
}
