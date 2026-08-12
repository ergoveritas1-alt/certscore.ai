import { execFile } from "node:child_process";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const SHA_PATTERN = /^[0-9a-f]{40}$/i;

export type WebDeployAncestryAssessment = {
  allowed: boolean;
  reason:
    | "explicit_override"
    | "explicit_override_unverifiable_live_revision"
    | "forward_deploy"
    | "non_descendant"
    | "same_revision";
};

export function assessWebDeployAncestry(input: {
  allowNonDescendant: boolean;
  isAncestor: boolean;
  liveSha: string;
  targetSha: string;
}): WebDeployAncestryAssessment {
  if (!SHA_PATTERN.test(input.targetSha)) {
    throw new Error("Target web revision must be a full 40-character Git SHA.");
  }
  if (!SHA_PATTERN.test(input.liveSha)) {
    if (input.allowNonDescendant) {
      return { allowed: true, reason: "explicit_override_unverifiable_live_revision" };
    }
    throw new Error("Live web revision must be a full 40-character Git SHA.");
  }
  if (input.liveSha.toLowerCase() === input.targetSha.toLowerCase()) {
    return { allowed: true, reason: "same_revision" };
  }
  if (input.isAncestor) {
    return { allowed: true, reason: "forward_deploy" };
  }
  if (input.allowNonDescendant) {
    return { allowed: true, reason: "explicit_override" };
  }
  return { allowed: false, reason: "non_descendant" };
}

function getArg(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}

function truthy(value: string | null | undefined) {
  return ["1", "true", "yes"].includes(value?.trim().toLowerCase() ?? "");
}

async function git(args: string[]) {
  const result = await execFileAsync("git", args, {
    cwd: process.cwd(),
    maxBuffer: 10 * 1024 * 1024
  });
  return result.stdout.trim();
}

async function ensureCommitAvailable(sha: string) {
  try {
    await git(["cat-file", "-e", `${sha}^{commit}`]);
  } catch {
    await git(["fetch", "--no-tags", "origin", sha]);
    await git(["cat-file", "-e", `${sha}^{commit}`]);
  }
}

async function gitIsAncestor(ancestor: string, descendant: string) {
  try {
    await git(["merge-base", "--is-ancestor", ancestor, descendant]);
    return true;
  } catch (error) {
    const exitCode = typeof error === "object" && error !== null && "code" in error
      ? Number(error.code)
      : null;
    if (exitCode === 1) {
      return false;
    }
    throw error;
  }
}

async function readLiveRevision(baseUrl: string) {
  const response = await fetch(new URL("/api/version", baseUrl), {
    headers: { Accept: "application/json" },
    redirect: "follow"
  });
  const payload = await response.json().catch(() => null) as { gitSha?: unknown } | null;
  const gitSha = typeof payload?.gitSha === "string" ? payload.gitSha.trim() : "";
  if (!response.ok || !gitSha) {
    throw new Error(`Could not determine the current production web Git SHA from ${baseUrl}/api/version.`);
  }
  return gitSha;
}

async function main() {
  const targetSha = getArg("--target") ?? process.env.GITHUB_SHA ?? await git(["rev-parse", "HEAD"]);
  const liveBaseUrl = getArg("--live-url") ?? process.env.LIVE_WEB_BASE_URL ?? "https://certscore.ai";
  const allowNonDescendant = process.argv.includes("--allow-non-descendant") ||
    truthy(process.env.ALLOW_NON_DESCENDANT_WEB_DEPLOY);
  if (!SHA_PATTERN.test(targetSha)) {
    throw new Error("Target web revision must be a full 40-character Git SHA.");
  }

  const liveSha = await readLiveRevision(liveBaseUrl);
  const liveRevisionIsSha = SHA_PATTERN.test(liveSha);
  if (liveRevisionIsSha) {
    await ensureCommitAvailable(liveSha);
  }
  const isAncestor = liveRevisionIsSha
    ? await gitIsAncestor(liveSha, targetSha)
    : false;
  const assessment = assessWebDeployAncestry({
    allowNonDescendant,
    isAncestor,
    liveSha,
    targetSha
  });

  console.log(`Current live web SHA: ${liveSha}`);
  console.log(`Target web SHA:       ${targetSha}`);
  console.log(`Ancestry result:      ${assessment.reason}`);
  if (assessment.reason === "explicit_override_unverifiable_live_revision") {
    console.warn(
      "The live build reports a non-Git revision. Proceeding only because the emergency non-descendant override was explicitly supplied."
    );
  }
  if (!assessment.allowed) {
    throw new Error(
      "Refusing a non-descendant web deployment because it would remove changes already live in production. Merge the live revision into the target branch first."
    );
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (invokedPath === import.meta.url) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
