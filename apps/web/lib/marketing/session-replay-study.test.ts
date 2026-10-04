import { CORE_MARKETING_POSITIONING } from "./core-positioning";
import { SESSION_REPLAY_STUDY_LINK } from "./research-links";
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import data from "./session-replay-study-data.json";
import { getPublishedRelease, createReleaseMetadata } from "../releases";
import { createPageMetadata, createPublicArticleSchema } from "../seo";
import sitemap from "../../app/sitemap";

const path = "/insights/session-replay-study-2026";

test("study denominators keep unknown executions and missing form evidence separate", () => {
  assert.equal(data.usableExecutions + data.unknownExecutions, data.selected);
  assert.ok(data.domains <= data.usableExecutions);
  assert.equal(((100 * data.positive) / data.domains).toFixed(1), "12.0");
  assert.equal(data.positive - data.positiveFormsEvaluable, 3);
  assert.ok(data.comparisonEvaluable < data.domains - data.positive);
  assert.equal(
    ((100 * data.positiveForms) / data.positiveFormsEvaluable).toFixed(1),
    "50.3",
  );
  assert.equal(
    ((100 * data.comparisonForms) / data.comparisonEvaluable).toFixed(1),
    "47.9",
  );
  assert.ok(
    data.services.reduce((sum, service) => sum + service.domains, 0) >
      data.positive,
  );
  assert.ok(
    !Object.keys(data).some((key) =>
      /sensitive|high.interest|before.consent/i.test(key),
    ),
  );
});

test("coordinated launch has discoverable canonical pages and a shared valid social asset", () => {
  const release = getPublishedRelease("session-replay-detection");
  assert.ok(release);
  assert.ok(
    release.sections.some((section) =>
      section.sourceLinks?.some((link) => link.href === path),
    ),
  );
  assert.equal(release.primaryCta.href, "/");
  const metadata = createPageMetadata({
    path,
    title: "Study",
    description: "Research",
  });
  assert.equal(metadata.alternates?.canonical, `https://certscore.ai${path}`);
  assert.equal(
    JSON.parse(JSON.stringify(metadata.openGraph)).images[0].url,
    JSON.parse(JSON.stringify(createReleaseMetadata(release).openGraph))
      .images[0].url,
  );
  const schema = createPublicArticleSchema({
    path,
    title: "Study",
    description: "Research",
  });
  assert.equal(schema.datePublished, release.publicationDate);
  assert.ok(
    sitemap().some((entry) => entry.url === `https://certscore.ai${path}`),
  );
  const png = readFileSync(`apps/web/public${release.socialImage.path}`);
  assert.equal(png.readUInt32BE(16), 1200);
  assert.equal(png.readUInt32BE(20), 630);
});

test("AI discovery keeps the shared positioning and current research near the top", () => {
  for (const file of ["llms.txt", "llms-full.txt"]) {
    const text = readFileSync(`apps/web/public/${file}`, "utf8");
    assert.ok(text.includes(CORE_MARKETING_POSITIONING));
    assert.ok(text.indexOf(SESSION_REPLAY_STUDY_LINK.href) < 2000);
    assert.ok(text.includes(SESSION_REPLAY_STUDY_LINK.description));
  }
});
