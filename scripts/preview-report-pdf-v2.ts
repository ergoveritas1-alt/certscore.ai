/** Local-only preview. Does not change the production export route or its flags. */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { buildReportPdfV2Model } from "../apps/web/server/scans/report-pdf-v2-model";
import { renderCanonicalReportPdf } from "../apps/web/server/scans/report-export-pdf";
import type { CanonicalReportExport } from "../apps/web/server/scans/report-export";
const args = process.argv.slice(2), value = (key: string) => { const i = args.indexOf(key); return i < 0 ? undefined : args[i + 1]; };
const input = value("--report"), output = value("--out");
if (!input || !output)
    throw new Error("Usage: REPORT_TEMPLATE=v2 tsx scripts/preview-report-pdf-v2.ts --report canonical.json --out preview.pdf [--source-pdf saved.pdf] [--python python3] [--paper letter|a4]");
const template = value("--template") ?? process.env.REPORT_TEMPLATE ?? "v1", paper = value("--paper") ?? "letter";
if (!["v1", "v2"].includes(template) || !["letter", "a4"].includes(paper))
    throw new Error("Unsupported preview template or paper");
const root = dirname(fileURLToPath(import.meta.url)), out = resolve(output), work = join(dirname(out), `${out.split("/").at(-1)!.replace(/\.pdf$/i, "")}-source`);
mkdirSync(work, { recursive: true });
const bytes = readFileSync(input), sourceHash = createHash("sha256").update(bytes).digest("hex"), report = JSON.parse(bytes.toString()) as CanonicalReportExport;
const python = value("--python") ?? process.env.CERTSCORE_PDF_PYTHON ?? "python3";
let assets: {
    brandName?: string;
    logo?: string;
    capture?: string;
    sourcePdfSha256?: string;
} = {};
function run(script: string, parameters: string[]) { const child = spawnSync(python, [join(root, "report-pdf-v2", script), ...parameters], { stdio: "inherit", timeout: 120000 }); if (child.status !== 0)
    throw new Error(`Local PDF ${script} failed (${child.status})`); }
if (value("--source-pdf")) {
    run("prepare-assets.py", ["--source", resolve(value("--source-pdf")!), "--scan-id", report.scan.id, "--out", join(work, "assets")]);
    assets = JSON.parse(readFileSync(join(work, "assets/assets.json"), "utf8"));
}
const options = { brandName: value("--brand-name") ?? assets.brandName, timeZone: value("--time-zone") ?? "UTC", appUrl: "https://certscore.ai" };
if (template === "v1") {
    if (paper !== "letter")
        throw new Error("Paper selection is available in the local v2 preview only");
    writeFileSync(out, renderCanonicalReportPdf(report, { ...options, brandLogo: assets.logo ? { body: readFileSync(assets.logo), contentType: "image/png" } : undefined, visualEvidence: assets.capture ? { body: readFileSync(assets.capture), contentType: "image/png" } : undefined }));
}
else {
    const model = buildReportPdfV2Model(report, options), path = join(work, "model.json");
    writeFileSync(path, JSON.stringify(model, null, 2) + "\n");
    run("render.py", ["--model", path, "--out", out, "--paper", paper, ...(assets.logo ? ["--logo", assets.logo] : []), ...(assets.capture ? ["--capture", assets.capture] : [])]);
}
if (createHash("sha256").update(readFileSync(input)).digest("hex") !== sourceHash)
    throw new Error("The source export changed during preview");
writeFileSync(join(work, "provenance.json"), JSON.stringify({ template, paper, scanId: report.scan.id, sourceSha256: sourceHash, sourcePdfSha256: assets.sourcePdfSha256 ?? null, outputSha256: createHash("sha256").update(readFileSync(out)).digest("hex"), productionChanged: false, newScans: 0, recurringCostIncrementUsd: 0 }, null, 2) + "\n");
process.stdout.write(`${out}\n`);
