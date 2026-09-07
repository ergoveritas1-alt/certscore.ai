import assert from "node:assert/strict";
import test from "node:test";
import { localInventoryEnabled } from "./local-dispatch";
test("local inventory execution requires an explicit flag and cannot run in production", () => {
  const mutableEnv = process.env as Record<string, string | undefined>;
  const env=mutableEnv.NODE_ENV, flag=process.env.CERTSCORE_FULL_SITE_LOCAL_EXECUTION;
  try {
    mutableEnv.NODE_ENV="development";delete process.env.CERTSCORE_FULL_SITE_LOCAL_EXECUTION;
    assert.equal(localInventoryEnabled(),false);
    process.env.CERTSCORE_FULL_SITE_LOCAL_EXECUTION="1";assert.equal(localInventoryEnabled(),true);
    mutableEnv.NODE_ENV="production";assert.equal(localInventoryEnabled(),false);
  } finally {
    if(env===undefined) delete mutableEnv.NODE_ENV;else mutableEnv.NODE_ENV=env;
    if(flag===undefined) delete process.env.CERTSCORE_FULL_SITE_LOCAL_EXECUTION;else process.env.CERTSCORE_FULL_SITE_LOCAL_EXECUTION=flag;
  }
});
