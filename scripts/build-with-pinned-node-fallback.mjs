import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

export async function buildWithPinnedNodeFallback({ args, policy, env, run, writePolicy, log = () => {}, signal }) {
  if (args[0] !== "docker" || args[1] !== "buildx" || args[2] !== "build") throw new Error("Expected the canonical Docker build command");
  const rules = policy.rules?.filter(rule => rule.selector?.identifier === "docker-image://docker.io/library/node:22-bookworm-slim");
  const rule = rules?.length === 1 ? rules[0] : null;
  const match = rule?.action === "CONVERT" && /^docker-image:\/\/public\.ecr\.aws\/docker\/library\/node@(sha256:[a-f0-9]{64})$/.exec(rule.updates?.identifier ?? "");
  if (!match) throw new Error("The approved pinned Node source policy is unavailable");
  const digest = match[1];
  const first = await run(args, { env, stream: true, signal });
  const diagnostic = `${first.stdout ?? ""}\n${first.stderr ?? ""}`;
  if (first.code === 0 || first.cancelled || signal?.aborted ||
      !diagnostic.includes(`https://public.ecr.aws/v2/docker/library/node/manifests/${digest}`) ||
      !/429[^\n]{0,120}Too Many Requests|toomanyrequests: Data limit exceeded/i.test(diagnostic)) return first.code;

  const upstream = `docker.io/library/node@${digest}`;
  log(`The public Node mirror returned 429; verifying the same approved digest at ${upstream}.`);
  const verified = await run(["docker", "buildx", "imagetools", "inspect", upstream, "--format", "{{json .Manifest}}"],
    { env, stream: false, timeoutMs: 30_000, signal });
  if (verified.code !== 0 || verified.cancelled || signal?.aborted) throw new Error("Pinned upstream Node verification failed; build remains blocked");
  if (Buffer.byteLength(verified.stdout ?? "") > 128 * 1024) throw new Error("Upstream Node descriptor exceeded the verification bound");
  const descriptor = JSON.parse(verified.stdout);
  if (descriptor.digest !== digest || !["application/vnd.oci.image.index.v1+json", "application/vnd.docker.distribution.manifest.list.v2+json"].includes(descriptor.mediaType)) {
    throw new Error("Upstream Node descriptor does not match the approved image digest");
  }
  if (signal?.aborted) return 130;
  const fallback = structuredClone(policy);
  fallback.rules.find(row => row.selector?.identifier === rule.selector.identifier).updates.identifier = `docker-image://${upstream}`;
  const temporary = await writePolicy(fallback);
  try {
    if (signal?.aborted) return 130;
    log("Verified the approved Node digest. Retrying this build once using its original Docker Official Image source.");
    return (await run(args, { env: { ...env, EXPERIMENTAL_BUILDKIT_SOURCE_POLICY: temporary.path }, stream: true, signal })).code;
  } finally { await temporary.cleanup(); }
}

async function runProcess(args, { env, stream, timeoutMs, signal }) {
  if (signal?.aborted) return { code: 130, cancelled: true };
  return await new Promise(resolve => {
    const child = spawn(args[0], args.slice(1), { env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "", stderr = "", timedOut = false;
    const keep = text => text.slice(-128 * 1024);
    child.stdout.on("data", bytes => { stdout = keep(stdout + bytes.toString()); if (stream) process.stdout.write(bytes); });
    child.stderr.on("data", bytes => { stderr = keep(stderr + bytes.toString()); if (stream) process.stderr.write(bytes); });
    const cancel = () => child.kill("SIGTERM");
    signal?.addEventListener("abort", cancel, { once: true });
    if (signal?.aborted) cancel();
    const timer = timeoutMs ? setTimeout(() => { timedOut = true; child.kill("SIGTERM"); }, timeoutMs) : undefined;
    const finish = result => { clearTimeout(timer); signal?.removeEventListener("abort", cancel); resolve(result); };
    child.on("error", error => finish({ code: 1, stdout, stderr: keep(stderr + error.message) }));
    child.on("close", code => finish({ code: timedOut ? 124 : code ?? 130, stdout, stderr, cancelled: signal?.aborted ?? false }));
  });
}

async function main() {
  const args = process.argv.slice(2).filter((value, index) => index !== 0 || value !== "--");
  const policy = JSON.parse(await readFile(process.env.EXPERIMENTAL_BUILDKIT_SOURCE_POLICY ?? "scripts/docker-source-policy.json", "utf8"));
  const controller = new AbortController();
  const cancel = () => controller.abort();
  process.on("SIGTERM", cancel); process.on("SIGINT", cancel);
  try {
    process.exitCode = await buildWithPinnedNodeFallback({ args, policy, env: process.env, run: runProcess,
      signal: controller.signal, log: console.log, writePolicy: async document => {
        const directory = await mkdtemp(path.join(tmpdir(), "certscore-pinned-node-"));
        const file = path.join(directory, "source-policy.json");
        try { await writeFile(file, `${JSON.stringify(document)}\n`, { mode: 0o600 }); }
        catch (error) { await rm(directory, { recursive: true, force: true }); throw error; }
        return { path: file, cleanup: () => rm(directory, { recursive: true, force: true }) };
      } });
  } finally { process.off("SIGTERM", cancel); process.off("SIGINT", cancel); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
