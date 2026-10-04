import { readFileSync, writeFileSync } from "node:fs";
import { CORE_MARKETING_POSITIONING } from "../apps/web/lib/marketing/core-positioning";
import { SESSION_REPLAY_STUDY_LINK } from "../apps/web/lib/marketing/research-links";
import { getPublishedReleases, releasePath } from "../apps/web/lib/releases";
const start = "<!-- public-discovery:start -->";
const end = "<!-- public-discovery:end -->";
const block = `${start}\n## Current releases and original research\n\n${getPublishedReleases().slice(0, 3).map(r => `- [${r.headline}](https://certscore.ai${releasePath(r)}): ${r.shortDescription}`).join("\n")}\n- [${SESSION_REPLAY_STUDY_LINK.label}](https://certscore.ai${SESSION_REPLAY_STUDY_LINK.href}): ${SESSION_REPLAY_STUDY_LINK.description}\n${end}`;
let stale = false;
for (const path of ["apps/web/public/llms.txt", "apps/web/public/llms-full.txt"]) {
  const source = readFileSync(path, "utf8");
  let result = source.replace(/^Scan cookies,.*CertScore\.ai\.$/m, CORE_MARKETING_POSITIONING);
  result = result.replace(/\n## Session replay launch and original research\n(?:- .*\n?)*/g, "\n");
  const a = result.indexOf(start), b = result.indexOf(end);
  if (a >= 0 && b >= a) result = result.slice(0,a) + block + result.slice(b+end.length);
  else result = result.replace(/^(# [^\n]+\n)/, `$1\n${block}\n`);
  result = result.trimEnd() + "\n";
  if (result !== source) {
    stale = true;
    if (!process.argv.includes("--check")) writeFileSync(path, result);
  }
}
if (stale && process.argv.includes("--check")) throw new Error("Public discovery files are stale. Run pnpm exec tsx scripts/sync-public-discovery.ts");
console.log(stale ? "Public discovery synchronized" : "Public discovery is current");
