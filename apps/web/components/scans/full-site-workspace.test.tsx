import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {FullSiteWorkspace} from "./full-site-workspace";

test("a report awaiting its first response does not claim an active scan or zero forms", () => {
 const html=renderToStaticMarkup(<FullSiteWorkspace scanId="loading" requested={{maxPages:20,concurrency:4,waitSeconds:5}}><p>Homepage report content</p></FullSiteWorkspace>);
 assert.match(html,/Loading report…/);
 assert.match(html,/Loading page count…/);
 assert.doesNotMatch(html,/data-full-site-progress|0 forms|0s elapsed|Pages scanned|Across scanned pages/);
});
