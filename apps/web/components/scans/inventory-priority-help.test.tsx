import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { InventoryPriorityHelp } from "./inventory-priority-help";

test("priority help uses stable semantic popover targets", () => {
  const resource = renderToStaticMarkup(<InventoryPriorityHelp />);
  assert.match(resource, /popoverTarget="resource-priority-legend"/);
  assert.match(resource, /id="resource-priority-legend"/);

  const service = renderToStaticMarkup(<InventoryPriorityHelp service />);
  assert.match(service, /popoverTarget="service-priority-legend"/);
  assert.match(service, /id="service-priority-legend"/);
  assert.doesNotMatch(resource + service, /_R_/);
});
