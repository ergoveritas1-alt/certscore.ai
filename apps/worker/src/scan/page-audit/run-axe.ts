import axe from "axe-core";
import type { AxeResults } from "axe-core";
import type { Page } from "playwright";

export async function runAxe(page: Page): Promise<AxeResults> {
  await page.addScriptTag({
    content: axe.source
  });

  return page.evaluate(async () => {
    const axeGlobal = (window as typeof window & {
      axe: {
        run: () => Promise<AxeResults>;
      };
    }).axe;

    return axeGlobal.run();
  });
}
