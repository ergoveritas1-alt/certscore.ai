import { fetchStaticPage } from "@website-signal-risk-scanner/scan-core";

async function main() {
  const url = process.argv[2]?.trim();

  if (!url) {
    throw new Error("Usage: inspect-static-page.ts <url>");
  }

  const page = await fetchStaticPage({ url });

  console.log(
    JSON.stringify(
      {
        pageUrl: page.pageUrl,
        finalUrl: page.finalUrl,
        fetchStatus: page.fetchStatus,
        title: page.title,
        hasFreeScan: /free scan/i.test(`${page.title ?? ""} ${page.textContent}`),
        hasRunAScan: /run a scan/i.test(`${page.title ?? ""} ${page.textContent}`),
        textSample: page.textContent.slice(0, 1500)
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
