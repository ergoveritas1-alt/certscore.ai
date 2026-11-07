import { z } from "zod";
import {
  REDHAT_OPT_OUT_POLICY, REDHAT_OPT_OUT_TARGET,
  saleSharingOptOutDispatchSchema, type SaleSharingCanaryLedger,
} from "@certscore/contracts";
import { createSaleSharingCanaryStore } from "./sale-sharing-canary-store";

const hash = z.string().regex(/^[a-f0-9]{64}$/);
// Keep claims within the scanner role's existing artifact object permissions.
export const REDHAT_CANARY_KEY_PREFIX = "v2-dag-lambda/local/redhat-opt-out-canary";

export const redHatCanaryGrantSchema = z.object({
  version: z.literal("redhat_opt_out_canary.v1"),
  scanId: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/),
  region: z.literal("us-west-1"),
  functionName: z.string().regex(/^[a-zA-Z0-9_-]+:[1-9][0-9]*$/),
  buildGitSha: z.string().regex(/^[a-f0-9]{40}$/),
  issuedAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
}).strict().refine(grant => {
  const ms = Date.parse(grant.expiresAt) - Date.parse(grant.issuedAt);
  return ms > 0 && ms <= 86_400_000;
}, "Grant must expire within 24 hours.");
export type RedHatCanaryGrant = z.infer<typeof redHatCanaryGrantSchema>;
const approvalSchema = z.object({ grant: redHatCanaryGrantSchema, approved: z.literal(true) }).strict();

type Runtime = { functionName?: string; functionVersion?: string; buildGitSha?: string; region?: string; memoryMb?: number };
export type RedHatCanaryOptions = {
  // Trusted offline fixtures only. Production reads the operator-owned Lambda environment.
  grant?: RedHatCanaryGrant | null;
  runtime?: Runtime;
  ledger?: SaleSharingCanaryLedger;
  signal?: AbortSignal;
  deadlineAtMs?: number;
};

function configuredGrant(): unknown {
  const raw = process.env.CERTSCORE_REDHAT_OPT_OUT_CANARY;
  if (!raw || Buffer.byteLength(raw) > 2048) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export async function claimRedHatCanary(input: {
  stage: "coordinator" | "worker";
  scanId: string; targetUrl: string; region: string; functionName: string;
  dispatch: unknown; parentDispatchSha256?: string;
}, options: RedHatCanaryOptions = {}) {
  if (process.env.CERTSCORE_REDHAT_OPT_OUT_RELOAD_ENABLED !== "1") throw Error("redhat_opt_out_reload_inactive");
  const parsed = redHatCanaryGrantSchema.safeParse(options.grant === undefined ? configuredGrant() : options.grant);
  const dispatch = saleSharingOptOutDispatchSchema.safeParse(input.dispatch);
  if (!parsed.success || !dispatch.success || dispatch.data.policyVersion !== REDHAT_OPT_OUT_POLICY ||
      dispatch.data.scanId !== input.scanId || input.targetUrl !== REDHAT_OPT_OUT_TARGET ||
      !hash.safeParse(input.parentDispatchSha256).success) throw Error("redhat_canary_not_authorized");
  const grant = parsed.data;
  const runtime = options.runtime ?? {
    functionName: process.env.AWS_LAMBDA_FUNCTION_NAME,
    functionVersion: process.env.AWS_LAMBDA_FUNCTION_VERSION,
    region: process.env.AWS_REGION,
    memoryMb: Number(process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE),
    buildGitSha: process.env.BUILD_GIT_SHA,
  };
  const verify = () => {
    const now = Date.now();
    if (grant.scanId !== input.scanId || input.region !== grant.region || input.functionName !== grant.functionName ||
        now < Date.parse(grant.issuedAt) || now >= Date.parse(grant.expiresAt)) throw Error("redhat_canary_not_authorized");
    if (`${runtime.functionName}:${runtime.functionVersion}` !== grant.functionName ||
        runtime.region !== grant.region || runtime.memoryMb !== 3008 ||
        runtime.buildGitSha !== grant.buildGitSha) throw Error("redhat_canary_runtime_mismatch");
  };
  verify();
  options.signal?.throwIfAborted();
  const remaining = Math.min(500, (options.deadlineAtMs ?? Infinity) - Date.now(), Date.parse(grant.expiresAt) - Date.now());
  if (remaining <= 0) throw Error("redhat_canary_deadline");
  const timer = AbortSignal.timeout(Math.max(1, Math.floor(remaining)));
  const signal = options.signal ? AbortSignal.any([options.signal, timer]) : timer;
  const bucket = process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET?.trim();
  if (!options.ledger && !bucket) throw Error("redhat_canary_store_unavailable");
  const ledger = options.ledger ?? createSaleSharingCanaryStore({bucket: bucket!}, signal);
  const prefix = `${REDHAT_CANARY_KEY_PREFIX}/${grant.scanId}`;
  const claim = { grant, parentDispatchSha256: input.parentDispatchSha256, source: dispatch.data.redHatAuthorization };
  let onAbort: (() => void) | undefined;
  const aborted = new Promise<never>((_, reject) => {
    onAbort = () => reject(Error("redhat_canary_deadline"));
    signal.addEventListener("abort", onAbort, {once: true});
    if (signal.aborted) onAbort();
  });
  try {
    await Promise.race([aborted, (async () => {
      // Require positive authorization. Access denied or an unreadable/missing
      // object must never be interpreted as approval.
      const approval = approvalSchema.safeParse(await ledger.read(`${prefix}/approval.json`));
      if (!approval.success || JSON.stringify(approval.data.grant) !== JSON.stringify(grant)) throw Error("redhat_canary_approval_missing_or_revoked");
      signal.throwIfAborted();
      if (input.stage === "worker") {
        const coordinator = await ledger.read(`${prefix}/coordinator.json`);
        if (JSON.stringify(coordinator) !== JSON.stringify(claim)) throw Error("redhat_canary_prior_claim_missing");
      }
      signal.throwIfAborted();
      verify();
      // Both writes are atomic. A timeout after an uncertain write burns that attempt.
      await ledger.create(`${prefix}/${input.stage}.json`, claim);
    })()]);
  } finally {
    if (onAbort) signal.removeEventListener("abort", onAbort);
  }
  signal.throwIfAborted();
  verify();
}
