import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { createRequire, syncBuiltinESMExports } from "node:module";
import path from "node:path";
import { gzipSync, gunzipSync, brotliCompressSync, brotliDecompressSync, constants } from "node:zlib";
import { canonicalEvidenceBundleSchema } from "./index";
import { parseCanonicalEvidenceArtifact as parse, serializeCanonicalEvidenceArtifact as serialize } from "./canonical-evidence-artifact";
import { gpcProductionRuntimeFixture } from "./test-fixtures/gpc-production";
import { canonicalWideJourneyFixture } from "./test-fixtures/canonical-wide-journeys";

function oversizedFixture() {
  const bundle = gpcProductionRuntimeFixture();
  const prototype = bundle.networkEvents[0]!;
  for (let i = 0; i < 400; i++) bundle.networkEvents.push({ ...prototype,
    eventId: `padding-${i}`, requestId: `padding-${i}`, url: `https://static.example.test/${"asset".repeat(280)}/${i}.js`,
    requestUrl: `https://static.example.test/${"asset".repeat(280)}/${i}.js` });
  return bundle;
}

const sha=(v:Uint8Array)=>createHash("sha256").update(v).digest("hex");
test("lossless canonical representation preserves every typed fact and exact inner JSON bytes",()=>{
  const b=oversizedFixture(),original=JSON.stringify(b),stored=serialize(b),packet=JSON.parse(stored);
  assert.equal(packet.artifactFormat,"certscore.canonical-evidence-artifact.v1");
  assert.ok(Buffer.byteLength(stored)<400*1024);assert.ok(Buffer.byteLength(original)>400*1024);
  assert.equal(gunzipSync(Buffer.from(packet.payload,"base64")).toString(),original);
  assert.deepEqual(parse(stored),canonicalEvidenceBundleSchema.parse(JSON.parse(original)));
  const additive={...b,retainedFutureContext:{labels:["kept",null],nested:{value:7}}};
  assert.equal(JSON.stringify(parse(serialize(additive))),JSON.stringify(additive));
  assert.equal(JSON.stringify(b),original,"encoding cannot mutate producer evidence");
  assert.equal(serialize(b),stored,"encoding is deterministic on the supported runtime");
});
test("ordinary legacy JSON, including old/missing optional facts, keeps JSON.parse semantics",()=>{
  for(const legacy of [{schemaVersion:"certscore.v2.alpha.1",scanId:"old"},{schemaVersion:"certscore.v2.canonical-evidence-bundle.v1"},{artifactFormat:"unrelated-format.v1"},[],null,{}]){
    const stored=serialize(legacy,2);assert.equal(stored,JSON.stringify(legacy,null,2));assert.deepEqual(parse(stored),legacy);
  }
});
test("oversized evidence stays lossless and falls back to ordinary JSON when encoding grows it",context=>{
  const bytes = Buffer.alloc(500_000); let seed = 0x12345678;
  for (let i=0;i<bytes.length;i++) { seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;bytes[i]=seed&255; }
  const value={...gpcProductionRuntimeFixture(),retainedFutureContext:bytes.toString("base64")};
  const json=JSON.stringify(value);assert.ok(Buffer.byteLength(json)>400*1024);
  const stored=serialize(value);
  assert.ok(Buffer.byteLength(stored)<=Buffer.byteLength(json),"encoding must never grow the stored artifact");
  assert.equal(JSON.stringify(parse(stored)),json,"encoding must preserve every JSON field");
  // Native compression ratios vary with the runtime. Force a larger candidate
  // to exercise the exact fallback on every supported platform.
  const zlib=createRequire(path.join(process.cwd(),"fixture.cjs"))("node:zlib");
  const mock=context.mock.method(zlib,"gzipSync",()=>Buffer.alloc(Buffer.byteLength(json)));
  syncBuiltinESMExports();
  try { assert.equal(serialize(value),json); }
  finally { mock.mock.restore();syncBuiltinESMExports(); }
  const unsupported={schemaVersion:"unsupported",retainedFutureContext:"x".repeat(500_000)};
  assert.equal(serialize(unsupported),JSON.stringify(unsupported));
});
test("malformed, unsupported, oversized and noncanonical envelopes fail closed with bounded errors",()=>{
  const good=JSON.parse(serialize(oversizedFixture()));
  const invalid=[{...good,artifactFormat:"certscore.canonical-evidence-artifact.v3"},{...good,encoding:"other"},
    {...good,decodedSizeBytes:20_000_001},{...good,decodedSizeBytes:2},{...good,decodedSizeBytes:good.decodedSizeBytes+1},
    {...good,decodedSha256:"0".repeat(64)},{...good,payload:good.payload.slice(0,-8)},
    {...good,payload:good.payload+"\n"},{...good,privateValue:"PRIVATE"},{...good,payload:"PRIVATE"}];
  for(const value of invalid)assert.throws(()=>parse(JSON.stringify(value)),{name:"SyntaxError",message:"Canonical evidence artifact failed bounded lossless decoding."});
  const duplicate=JSON.stringify(good).replace('"encoding":','"encoding":"gzip_base64","encoding":');
  assert.throws(()=>parse(duplicate));assert.throws(()=>parse(JSON.stringify(good).slice(0,-1)));
  const bomb=Buffer.alloc(1_000_000,97);
  assert.throws(()=>parse(JSON.stringify({...good,decodedSizeBytes:2,payload:gzipSync(bomb).toString("base64")})));
});
test("encoded JSON requires supported schema and one layer; caller-owned schema validation remains explicit",()=>{
  const good=JSON.parse(serialize(oversizedFixture()));
  const wrap=(bytes:Buffer)=>JSON.stringify({...good,decodedSizeBytes:bytes.length,decodedSha256:sha(bytes),payload:gzipSync(bytes).toString("base64")});
  assert.throws(()=>parse(wrap(Buffer.from(JSON.stringify(good)))));
  assert.throws(()=>parse(wrap(Buffer.from([255,255,255]))));
  const unsupported=wrap(Buffer.from(JSON.stringify({...gpcProductionRuntimeFixture(),schemaVersion:"unsupported"})));
  assert.throws(()=>parse(unsupported));assert.throws(()=>parse(unsupported,{schemaValidation:"caller"}));
  const malformed=wrap(Buffer.from(JSON.stringify({schemaVersion:"certscore.v2.canonical-evidence-bundle.v1",scanId:"PRIVATE"})));
  assert.throws(()=>parse(malformed));
  assert.throws(()=>canonicalEvidenceBundleSchema.parse(parse(malformed,{schemaValidation:"caller"})));
});


test("Brotli v2 preserves wide retained evidence; already-fitting gzip v1 bytes remain exact",()=>{
  const bundle=gpcProductionRuntimeFixture();bundle.observedJourneys=canonicalWideJourneyFixture();
  const original=JSON.stringify(bundle),body=Buffer.from(original);
  const gzip={artifactFormat:"certscore.canonical-evidence-artifact.v1",encoding:"gzip_base64",decodedSizeBytes:body.length,decodedSha256:sha(body),payload:gzipSync(body,{level:1}).toString("base64")};
  assert.ok(Buffer.byteLength(JSON.stringify(gzip))>400*1024);
  const stored=serialize(bundle),packet=JSON.parse(stored);
  assert.equal(packet.artifactFormat,"certscore.canonical-evidence-artifact.v2");assert.equal(packet.encoding,"brotli_base64");
  assert.ok(Buffer.byteLength(stored)<=400*1024);
  assert.equal(brotliDecompressSync(Buffer.from(packet.payload,"base64")).toString(),original);
  assert.equal(JSON.stringify(parse(stored)),original);assert.equal(JSON.stringify(bundle),original);
  assert.equal(JSON.stringify(parse(JSON.stringify(gzip))),original,"old oversized gzip remains readable");
  const smaller=oversizedFixture(),smallBytes=Buffer.from(JSON.stringify(smaller));
  assert.equal(serialize(smaller),JSON.stringify({artifactFormat:"certscore.canonical-evidence-artifact.v1",encoding:"gzip_base64",decodedSizeBytes:smallBytes.length,decodedSha256:sha(smallBytes),payload:gzipSync(smallBytes,{level:1}).toString("base64")}));
  assert.equal(serialize(bundle),stored);
});

test("Brotli version/encoding, original decoded size/hash, schema and expansion bounds fail closed",()=>{
  const bundle=gpcProductionRuntimeFixture();bundle.observedJourneys=canonicalWideJourneyFixture();
  const good=JSON.parse(serialize(bundle));assert.equal(good.encoding,"brotli_base64");
  const invalid=[{...good,artifactFormat:"certscore.canonical-evidence-artifact.v1"},{...good,encoding:"gzip_base64"},
    {...good,decodedSizeBytes:2},{...good,decodedSizeBytes:20_000_001},{...good,decodedSha256:"0".repeat(64)},
    {...good,payload:good.payload.slice(0,-8)},{...good,payload:good.payload+"\n"},{...good,unexpected:"PRIVATE"}];
  for(const v of invalid)assert.throws(()=>parse(JSON.stringify(v)),{name:"SyntaxError",message:"Canonical evidence artifact failed bounded lossless decoding."});
  const wrap=(bytes:Buffer)=>JSON.stringify({...good,decodedSizeBytes:bytes.length,decodedSha256:sha(bytes),payload:brotliCompressSync(bytes).toString("base64")});
  assert.throws(()=>parse(wrap(Buffer.from(JSON.stringify(good)))));
  assert.throws(()=>parse(wrap(Buffer.from([255,255]))));
  assert.throws(()=>parse(wrap(Buffer.from(JSON.stringify({...bundle,schemaVersion:"unsupported"}))),{schemaValidation:"caller"}));
  const largeWindowBody=Buffer.alloc(100_000,97);
  const largeWindow=brotliCompressSync(largeWindowBody,{params:{[constants.BROTLI_PARAM_LARGE_WINDOW]:1,[constants.BROTLI_PARAM_LGWIN]:25}});
  assert.equal(brotliDecompressSync(largeWindow,{params:{[constants.BROTLI_DECODER_PARAM_LARGE_WINDOW]:1}}).length,largeWindowBody.length);
  assert.throws(()=>parse(JSON.stringify({...good,decodedSizeBytes:largeWindowBody.length,decodedSha256:sha(largeWindowBody),payload:largeWindow.toString("base64")})));
  const bomb=brotliCompressSync(Buffer.alloc(1_000_000,97));
  assert.throws(()=>parse(JSON.stringify({...good,decodedSizeBytes:2,payload:bomb.toString("base64")})));
  assert.throws(()=>parse(JSON.stringify(good).replace('"encoding":','"encoding":"brotli_base64","encoding":')));
});


test("an unavailable or larger Brotli candidate preserves the exact usable gzip artifact",context=>{
  const bundle=gpcProductionRuntimeFixture();bundle.observedJourneys=canonicalWideJourneyFixture();
  const body=Buffer.from(JSON.stringify(bundle));
  const original=JSON.stringify({artifactFormat:"certscore.canonical-evidence-artifact.v1",encoding:"gzip_base64",decodedSizeBytes:body.length,decodedSha256:sha(body),payload:gzipSync(body,{level:1}).toString("base64")});
  assert.ok(Buffer.byteLength(original)>400*1024);
  const zlib=createRequire(path.join(process.cwd(),"fixture.cjs"))("node:zlib");
  for(const implementation of [()=>{throw Error("PRIVATE native encoder failure");},()=>Buffer.alloc(body.length)]) {
    const mock=context.mock.method(zlib,"brotliCompressSync",implementation);syncBuiltinESMExports();
    try {assert.equal(serialize(bundle),original);assert.equal(JSON.stringify(parse(original)),body.toString());}
    finally {mock.mock.restore();syncBuiltinESMExports();}
  }
});
