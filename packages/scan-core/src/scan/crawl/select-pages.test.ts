import assert from "node:assert/strict";
import test from "node:test";
import { classifyPage } from "./classify-page";
import { selectTopPages } from "./select-pages";

test("classifyPage treats governance routes as about pages", () => {
  assert.equal(classifyPage("https://example.com/team"), "about");
  assert.equal(classifyPage("https://example.com/leadership"), "about");
  assert.equal(classifyPage("https://example.com/founders"), "about");
});

test("selectTopPages prioritizes about pages ahead of generic routes", () => {
  const selected = selectTopPages({
    homepageUrl: "https://example.com/",
    maxPages: 4,
    urls: [
      "https://example.com/blog/post-1",
      "https://example.com/about",
      "https://example.com/team",
      "https://example.com/products",
      "https://example.com/contact"
    ]
  });

  assert.deepEqual(selected.slice(0, 3).map((page) => page.url), [
    "https://example.com/",
    "https://example.com/contact",
    "https://example.com/about"
  ]);
});
