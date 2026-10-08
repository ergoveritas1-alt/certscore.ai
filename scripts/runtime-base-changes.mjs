import { execFileSync } from "node:child_process";
import { runtimeBaseInputsChanged, runtimeBaseSourceFingerprint } from "./lib/runtime-base-inputs.mjs";

const [component, base, head] = process.argv.slice(2);
if (!["web", "validation"].includes(component) || !base || !head) throw new Error("Usage: runtime-base-changes.mjs web|validation BASE HEAD");
const git = args => execFileSync("git", args, {encoding:"utf8"});
if (base === "--fingerprint") {
  const files = git(["ls-tree", "-r", "--name-only", head]).trim().split("\n").filter(Boolean);
  process.stdout.write(`${await runtimeBaseSourceFingerprint(component, files, file => git(["show", `${head}:${file}`]))}\n`);
  process.exit(0);
}
const files = git(["diff", "--name-only", base, head]).trim().split("\n").filter(Boolean);
const changed = await runtimeBaseInputsChanged(component, files,
  file => git(["show", `${base}:${file}`]), file => git(["show", `${head}:${file}`]));
process.stdout.write(changed ? "1\n" : "0\n");
