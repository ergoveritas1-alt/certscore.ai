import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ReportPageEventTimeline } from "./report-page-event-timeline";
import { RuntimeObservationTimeline } from "./runtime-observation-sections";

const path = {clockLabel:"Times from confirmed Accept",events:[{at:"0s",atMs:0,label:"Accept confirmed",detail:"Confirmed decision",tone:"positive" as const}]};
test("timeline defaults to pre-consent and only offers available successful action views", () => {
  for (const accept of [null,path]) for (const reject of [null,path]) {
    const html=renderToStaticMarkup(<ReportPageEventTimeline events={[]} accept={accept} reject={reject}/>);
    assert.match(html, /Pre-consent page event timeline/);
    assert.equal(html.includes(">Accept</button>"),!!accept);
    assert.equal(html.includes(">Reject</button>"),!!reject);
    if (accept || reject) assert.match(html, /aria-pressed="true"[^>]*>Pre-consent/);
    else assert.doesNotMatch(html, /Page event timeline view/);
    assert.doesNotMatch(html, /Times from confirmed Accept/);
  }
});

test("timeline concerns color the marker, time, label and detail red while ordinary events stay neutral", () => {
  const events = [{at:"0.06s",atMs:60,label:"Non-essential request",detail:"Retained issue evidence",tone:"concern" as const}];
  const concern = renderToStaticMarkup(<RuntimeObservationTimeline compact events={events}/>);
  assert.match(concern, /bg-rose-500 ring-rose-500/);
  assert.match(concern, /text-rose-700[^>]*>0.06s/);
  assert.match(concern, /text-rose-800[^>]*>Non-essential request/);
  assert.match(concern, /text-rose-700[^>]*>Retained issue evidence/);
  const ordinary = renderToStaticMarkup(<RuntimeObservationTimeline compact events={events.map(event=>({...event,tone:"neutral"}))}/>);
  assert.doesNotMatch(ordinary, /text-rose|bg-rose/);
});
