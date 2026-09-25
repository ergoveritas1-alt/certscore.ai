import assert from "node:assert/strict";
import test from "node:test";
import { gpcActivityComparisonSchema as publicSchema } from "./gpc-activity-comparison";

test("canonical and public GPC activity contracts retain bounded facts and reject stronger claims", async () => {
  const { gpcActivityComparisonSchema: canonical } = await import("../../certscore-contracts/src/gpc-activity-comparison");
  const { gpcActivityComparisonFixture } = await import("../../certscore-contracts/src/test-fixtures/gpc-activity-comparison");
  const fixture = gpcActivityComparisonFixture();
  for (const schema of [canonical, publicSchema]) {
    assert.deepEqual(schema.parse(fixture), fixture);
    for (const invalid of [
      { ...fixture, durationMs: 5000 }, { ...fixture, scoreEffect: "deduct" },
      { ...fixture, causedByGpc: "established" }, { ...fixture, legalConclusion: "honored" },
      { ...fixture, activity: { ...fixture.activity, analyticsReplay: { ...fixture.activity.analyticsReplay, baselineRequests: 5001 } } },
      { ...fixture, sourceHashes: { baseline: "missing", gpc: fixture.sourceHashes.gpc } },
    ]) assert.equal(schema.safeParse(invalid).success, false);
  }
});
