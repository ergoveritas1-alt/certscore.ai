import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createServer as createHttpServer, type Server as HttpServer } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createArtifactWriter } from "./artifact-writer.js";
import {
  preConsentRuntimeScanner,
  probeStrictTls,
} from "./scanners/pre-consent-runtime-scanner.js";

test("strict TLS probe keeps timeouts and network failures unknown instead of invalid", async () => {
  const result = await probeStrictTls("https://192.0.2.1/", undefined, Date.now() + 10);

  assert.equal(result.attempted, true);
  assert.notEqual(result.errorCategory, "tls_or_certificate_failure");
  assert.equal(result.validCertificate, undefined);
});

test("pre-consent scanner uses strict TLS probe and records transport-security evidence", async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), "certscore-transport-security-"));
  const assetServer = await startAssetServer();
  const tls = await createSelfSignedCertificate(tempRoot);
  const httpsServer = await startHttpsFixtureServer({
    certPath: tls.certPath,
    keyPath: tls.keyPath,
    body: `
      <!doctype html>
      <html>
        <body>
          <img src="${assetServer.url}/pixel.png?cache_buster=secret" alt="">
          <form method="post" action="${assetServer.url}/submit?email=person@example.test">
            <label>Email <input type="email" name="email"></label>
            <label>Password <input type="password" name="password"></label>
          </form>
        </body>
      </html>
    `,
  });

  try {
    const artifactWriter = await createArtifactWriter(path.join(tempRoot, "out"));
    const result = await preConsentRuntimeScanner({
      url: httpsServer.url,
      normalizedUrl: httpsServer.url,
      scanStartedAtMs: Date.now(),
      internalBudgetMs: 10_000,
      artifactWriter,
      screenshotMode: "never",
      waitMode: "fast",
    });

    assert.equal(result.moduleRun.status, "completed", result.moduleRun.errors.join("; "));
    const observation = result.transportSecurityObservations[0];
    assert.ok(observation, "transport-security observation should be retained");
    assert.equal(observation.pageHttpsObserved, true);
    assert.equal(observation.summary.scannedPagesUseHttps, true);
    assert.equal(observation.tlsProbe.attempted, true);
    assert.equal(observation.tlsProbe.validCertificate, false);
    assert.equal(observation.tlsProbe.errorCategory, "tls_or_certificate_failure");
    assert.equal(observation.summary.validTlsCertificate, false);
    assert.equal(observation.summary.mixedContentObserved, true);
    assert.ok(observation.mixedContent.observedCount > 0);
    assert.equal(observation.summary.insecureFormTransportObserved, true);

    const insecureForm = observation.formTransports.find((form) => form.insecureTransportObserved);
    assert.ok(insecureForm, "insecure form transport should be retained");
    assert.equal(insecureForm.actionScheme, "http");
    assert.equal(insecureForm.hasEmailField, true);
    assert.equal(insecureForm.hasSensitiveFieldHint, true);
    assert.equal(insecureForm.actionUrl?.includes("person@example.test"), false);
    assert.equal(insecureForm.actionUrl?.includes("email=%5Bredacted%5D"), true);

    const artifact = JSON.parse(
      await readFile(path.join(tempRoot, "out", "TransportSecurityObservation.json"), "utf8"),
    ) as typeof observation;
    assert.equal(artifact.tlsProbe.validCertificate, false);
    assert.equal(artifact.summary.insecureFormTransportObserved, true);
  } finally {
    await closeServer(httpsServer.server);
    await closeServer(assetServer.server);
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("pre-consent scanner retains early transport evidence when later runtime work exhausts the module budget", async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), "certscore-transport-budget-"));
  const server = createHttpServer((request, response) => {
    if (request.url === "/slow") {
      setTimeout(() => {
        response.writeHead(204);
        response.end();
      }, 5_000);
      return;
    }
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end("<!doctype html><html><body><script>fetch('/slow')</script><p>Loaded page</p></body></html>");
  });
  await listen(server);

  try {
    const artifactWriter = await createArtifactWriter(path.join(tempRoot, "out"));
    const url = serverUrl(server, "http");
    const result = await preConsentRuntimeScanner({
      url,
      normalizedUrl: url,
      scanStartedAtMs: Date.now(),
      internalBudgetMs: 1_800,
      softDeadlineSignal: AbortSignal.timeout(1_800),
      artifactWriter,
      screenshotMode: "never",
      waitMode: "fast",
    });

    assert.equal(result.moduleRun.status, "partial");
    const observation = result.transportSecurityObservations[0];
    assert.ok(observation, "early transport observation should survive the soft deadline");
    assert.equal(observation.finalScheme, "http");
    assert.equal(observation.pageHttpsObserved, false);
    assert.equal(observation.httpProbe.attempted, true);
    assert.equal(observation.tlsProbe.attempted, true);
  } finally {
    server.closeAllConnections();
    await closeServer(server);
    await rm(tempRoot, { recursive: true, force: true });
  }
});

async function createSelfSignedCertificate(tempRoot: string): Promise<{ certPath: string; keyPath: string }> {
  const certPath = path.join(tempRoot, "cert.pem");
  const keyPath = path.join(tempRoot, "key.pem");
  execFileSync("openssl", [
    "req",
    "-x509",
    "-newkey",
    "rsa:2048",
    "-nodes",
    "-keyout",
    keyPath,
    "-out",
    certPath,
    "-subj",
    "/CN=127.0.0.1",
    "-days",
    "1",
  ], { stdio: "ignore" });
  return { certPath, keyPath };
}

async function startAssetServer(): Promise<{ server: HttpServer; url: string }> {
  const server = createHttpServer((request, response) => {
    if (request.url?.startsWith("/pixel.png")) {
      response.writeHead(200, { "content-type": "image/png" });
      response.end(Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
        "base64",
      ));
      return;
    }
    response.writeHead(204);
    response.end();
  });
  await listen(server);
  return { server, url: serverUrl(server, "http") };
}

async function startHttpsFixtureServer(input: {
  body: string;
  certPath: string;
  keyPath: string;
}): Promise<{ server: HttpServer; url: string }> {
  const server = createHttpsServer({
    cert: readFileSync(input.certPath),
    key: readFileSync(input.keyPath),
  }, (_request, response) => {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(input.body);
  });
  await listen(server);
  return { server, url: serverUrl(server, "https") };
}

async function listen(server: HttpServer): Promise<void> {
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
}

function serverUrl(server: HttpServer, scheme: "http" | "https"): string {
  const address = server.address();
  assert.ok(address && typeof address === "object");
  return `${scheme}://127.0.0.1:${address.port}/`;
}

async function closeServer(server: HttpServer): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
}
