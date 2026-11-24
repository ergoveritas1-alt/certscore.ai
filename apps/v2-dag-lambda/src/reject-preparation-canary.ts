import { randomBytes } from "node:crypto";
import { classifyConsentControlLabel } from "@certscore/contracts";
import { DeleteMessageCommand, ReceiveMessageCommand, SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import { readRejectFirstLayerProof, rejectFirstLayerProofMatches,
  type RejectFirstLayerProof } from "@certscore/scan-core/reject-gate-shadow-receipt";

const functionName = "certscore-v2-dag-local-ar-canary-20261123";
const queueUrl = "https://sqs.eu-central-1.amazonaws.com/199536052647/certscore-v2-dag-local-ar-prep-20261123";
const version = "certscore.reject-preparation-release.v1";
export const REJECT_PREPARATION_RELEASE_TIMEOUT_MS = 750;
const targets = new Set(["deferred-aria", "delayed-banner", "native-aria", "nested-caption", "quiet-aria",
  "quiet-reject", "reject-first", "visible-text"].map(fixture =>
  `https://www.ergoveritas.com/testar-recovery-20261123-${fixture}.html`));

type PreparationTarget = {
  awsRegion: string;
  targetUrl: string;
  functionName: string;
  resultPurpose: string;
  targetEnvironment: string;
  postRefusalObservation?: {enabled: boolean; interactionAuthorization: {kind: string; authorizationId: string}};
};
type Binding = { scanId: string; targetUrl: string; parentDispatchSha256: string; preparationId: string };

export function rejectPreparationCanaryEnabled(payload: PreparationTarget, env = process.env) {
  return env.CERTSCORE_REJECT_PREPARATION_CANARY_ENABLED === "1" &&
    env.AWS_LAMBDA_FUNCTION_NAME === functionName &&
    /^[1-9][0-9]*$/.test(env.AWS_LAMBDA_FUNCTION_VERSION ?? "") &&
    payload.functionName === `${functionName}:${env.AWS_LAMBDA_FUNCTION_VERSION}` &&
    payload.targetEnvironment === "production" && payload.resultPurpose === "synthetic_verification" &&
    payload.awsRegion === "eu-central-1" && targets.has(payload.targetUrl) &&
    payload.postRefusalObservation?.enabled === true &&
    payload.postRefusalObservation.interactionAuthorization.kind === "owned_canary" &&
    payload.postRefusalObservation.interactionAuthorization.authorizationId === "ergoveritas_owned_post_refusal_canary.v1";
}

export function newRejectPreparationId() {
  return randomBytes(16).toString("hex");
}

export function isRejectPreparationId(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{32}$/.test(value);
}

export function readRejectPreparationRelease(body: string | undefined, binding: Binding, nowMs: number) {
  if (!body || Buffer.byteLength(body) > 4_096) return undefined;
  try {
    const record = JSON.parse(body);
    if (record?.version !== version || record.preparationId !== binding.preparationId) return undefined;
    const proof = readRejectFirstLayerProof(record.proof);
    return rejectFirstLayerProofMatches(proof, binding.scanId, binding.targetUrl, binding.parentDispatchSha256, nowMs)
      ? proof : undefined;
  } catch {
    return undefined;
  }
}

let classifierWarmed = false;

/** Warm shared classifier code with static labels. No result becomes evidence. */
export function warmRejectPreparationClassifier() {
  if (classifierWarmed) return;
  for (const label of ["Decline all", "Accept all"]) {
    classifyConsentControlLabel({
      label, usage: "action", classifierProfile: "multilingual_v1", hasConsentContext: true,
    });
  }
  classifierWarmed = true;
}

export function prepareRejectProofSender(client = new SQSClient({ region: "eu-central-1", maxAttempts: 1 })) {
  // Prime the SDK credential provider while passive capture runs. SDK request
  // signing still performs its normal credential checks when a proof arrives.
  void client.config.credentials().catch(() => undefined);
  return async (binding: Binding, proof: RejectFirstLayerProof, signal: AbortSignal) => {
    signal.throwIfAborted();
    const releaseStartedAtMs = Date.now();
    if (!isRejectPreparationId(binding.preparationId) ||
        !rejectFirstLayerProofMatches(proof, binding.scanId, binding.targetUrl, binding.parentDispatchSha256, releaseStartedAtMs)) {
      throw new Error("reject_preparation_release_unverified");
    }
    const result = await client.send(new SendMessageCommand({
      QueueUrl: queueUrl, MessageBody: JSON.stringify({ version, preparationId: binding.preparationId, proof }),
    }), { abortSignal: AbortSignal.any([signal, AbortSignal.timeout(REJECT_PREPARATION_RELEASE_TIMEOUT_MS)]) });
    if (!result.MessageId) throw new Error("reject_preparation_release_unacknowledged");
    console.info(JSON.stringify({ event: "reject_preparation_release_timing.v1", scanId: proof.scanId,
      releaseStartedAtMs, releaseAcknowledgedAtMs: Date.now() }));
  };
}

export async function takeRejectPreparationRelease(
  binding: Binding, signal: AbortSignal,
  client = new SQSClient({ region: "eu-central-1", maxAttempts: 1 }),
) {
  const response = await client.send(new ReceiveMessageCommand({
    QueueUrl:queueUrl, WaitTimeSeconds:14, MaxNumberOfMessages:1, VisibilityTimeout:45,
  }), {abortSignal:signal});
  const receipt = response.Messages?.[0];
  const proof = readRejectPreparationRelease(receipt?.Body, binding, Date.now());
  if (!proof || !receipt?.ReceiptHandle) throw new Error("reject_preparation_release_unverified");
  signal.throwIfAborted();
  await client.send(new DeleteMessageCommand({QueueUrl:queueUrl,ReceiptHandle:receipt.ReceiptHandle}),
    {abortSignal:AbortSignal.any([signal,AbortSignal.timeout(750)])});
  if (proof.expiresAtMs <= Date.now()) throw new Error("reject_preparation_release_expired");
  return proof;
}

export type RejectPreparationGate = {
  waitForProof(): Promise<RejectFirstLayerProof>;
  signal: AbortSignal;
};

export async function withPreparedRejectBrowser<T, Browser extends { contexts(): unknown[]; close(): Promise<void> }>(input: {
  launch(): Promise<Browser>;
  takeProof(signal: AbortSignal): Promise<RejectFirstLayerProof>;
  run(browser: Browser, gate: RejectPreparationGate): Promise<T>;
  signal?: AbortSignal;
}) {
  const cancel = new AbortController();
  const signal = AbortSignal.any([cancel.signal, AbortSignal.timeout(15_000), ...(input.signal ? [input.signal] : [])]);
  signal.throwIfAborted();
  const startedAt = Date.now();
  const release = Promise.resolve().then(() => input.takeProof(signal))
    .then(proof => ({ proof, receivedAt:Date.now() }));
  // The queue can reject while Chromium is still preparing. The same rejection
  // is delivered at the navigation gate.
  void release.catch(() => undefined);
  let browser: Browser | undefined;
  try {
    const opened = await input.launch();
    browser = opened;
    if (opened.contexts().length !== 0) throw new Error("reject_preparation_browser_not_blank");
    const readyAt = Date.now();
    signal.throwIfAborted();
    return await input.run(opened, {
      signal,
      waitForProof: async () => {
        const { proof, receivedAt } = await release;
        signal.throwIfAborted();
        if (proof.expiresAtMs <= Date.now()) throw new Error("reject_preparation_release_expired");
        console.info(JSON.stringify({event:"reject_browser_preparation.v1",scanId:proof.scanId,
          launchMs:readyAt-startedAt,waitedForProofMs:receivedAt-startedAt,
          setupReadyBeforeProofMs:receivedAt-readyAt,browserReadyAtMs:readyAt,proofReceivedAtMs:receivedAt}));
        return proof;
      },
    });
  } finally {
    cancel.abort();
    await browser?.close().catch(() => undefined);
  }
}
