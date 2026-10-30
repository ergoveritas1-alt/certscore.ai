import { parseArgs } from "node:util";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createHash } from "node:crypto";
import type { CanonicalReportExport } from "../apps/web/server/scans/report-export";
import { renderCanonicalReportDocx } from "../apps/web/server/scans/report-export-docx";
import { pdfTimeZone } from "../apps/web/server/scans/report-pdf-time";

async function main() {
  const { values } = parseArgs({ options: { report: { type: "string" }, out: { type: "string" }, "time-zone": { type: "string", default: "UTC" }, "brand-name": { type: "string" }, "brand-logo": { type: "string" }, "header-theme": { type: "string", default: "white" } } });
  if (!values.report || !values.out || !values.out.endsWith(".docx")) throw new Error("Use --report canonical-report.json --out preview.docx [--time-zone UTC].");
  const timeZone = pdfTimeZone(values["time-zone"]);
  if (!timeZone) throw new Error("Invalid report time zone.");
  if (!["white", "black"].includes(values["header-theme"]!)) throw new Error("Invalid report header theme.");
  const source = await readFile(values.report);
  const report = JSON.parse(source.toString("utf8")) as CanonicalReportExport;
  if (report.artifactType !== "certscore_canonical_report_export" || report.artifactVersion !== "canonical-report-export-v8") throw new Error("A frozen canonical v8 report export is required.");
  const started = performance.now();
  const brandLogo = values["brand-logo"] ? { body: await readFile(values["brand-logo"]), contentType: "image/png" } : undefined;
  const docx = await renderCanonicalReportDocx(report, { timeZone, brandName: values["brand-name"], brandLogo, headerTheme: values["header-theme"] as "white" | "black" });
  const out = resolve(values.out);
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, docx);
  await writeFile(`${out}.provenance.json`, `${JSON.stringify({
    source: resolve(values.report), sourceSha256: createHash("sha256").update(source).digest("hex"),
    outputSha256: createHash("sha256").update(docx).digest("hex"), scanId: report.scan.id,
    reviewFocus: report.reviewFocus, timeZone, bytes: docx.length, renderMs: Math.round(performance.now() - started),
    brandName: values["brand-name"] ?? "CertScore.ai", brandLogoSha256: brandLogo ? createHash("sha256").update(brandLogo.body).digest("hex") : null, headerTheme: values["header-theme"],
    newScans: 0, deployed: false,
  }, null, 2)}\n`);
  console.log(out);
}
void main().catch(error => { console.error(error.message); process.exitCode = 1; });
