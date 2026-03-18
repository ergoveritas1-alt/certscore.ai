import type { Page } from "playwright";

export type CookieSignals = {
  acceptPresent: boolean;
  bannerPresent: boolean;
  matchedSelectors: string[];
  matchedTextSnippets: string[];
  preferencesPresent: boolean;
  rejectPresent: boolean;
};

export async function detectCookieSignals(page: Page): Promise<CookieSignals> {
  return page.evaluate(() => {
    const elements = Array.from(document.querySelectorAll("button, a, div, section, aside, form"));
    const snippets = new Set<string>();
    const selectors = new Set<string>();

    let bannerPresent = false;
    let acceptPresent = false;
    let rejectPresent = false;
    let preferencesPresent = false;

    for (const element of elements) {
      const text = `${element.textContent ?? ""} ${element.getAttribute("aria-label") ?? ""} ${element.getAttribute("title") ?? ""}`
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
      const idAndClass = `${element.id} ${element.className}`.toLowerCase();

      if (
        text.includes("cookie") ||
        text.includes("consent") ||
        text.includes("privacy") ||
        idAndClass.includes("cookie") ||
        idAndClass.includes("consent") ||
        idAndClass.includes("cmp")
      ) {
        bannerPresent = true;
        if (snippets.size < 3 && text.length > 0) {
          snippets.add(text.slice(0, 140));
        }

        if (selectors.size < 3) {
          const selector =
            element.id.length > 0
              ? `#${element.id}`
              : typeof element.className === "string" && element.className.trim().length > 0
                ? `.${element.className.trim().split(/\s+/).slice(0, 2).join(".")}`
                : element.tagName.toLowerCase();
          selectors.add(selector);
        }
      }

      if (text.includes("accept") || text.includes("allow all")) {
        acceptPresent = true;
      }

      if (text.includes("reject") || text.includes("decline") || text.includes("deny")) {
        rejectPresent = true;
      }

      if (
        text.includes("preferences") ||
        text.includes("manage") ||
        text.includes("settings") ||
        text.includes("customize")
      ) {
        preferencesPresent = true;
      }
    }

    return {
      bannerPresent,
      acceptPresent,
      rejectPresent,
      preferencesPresent,
      matchedTextSnippets: [...snippets].slice(0, 3),
      matchedSelectors: [...selectors].slice(0, 3)
    };
  });
}
