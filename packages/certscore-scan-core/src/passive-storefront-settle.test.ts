import assert from "node:assert/strict";
import test from "node:test";
import { chromium } from "playwright";
import { waitForPassiveStorefrontSettle } from "./passive-storefront-settle.js";

test("passive storefront settling stays on the original document and skips action gates", async t => {
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const page = await browser.newPage();
  const entry = "https://shop.test/";
  // All navigations are fulfilled in-process, with no public target contact.
  await page.route("**/*", route => route.fulfill({ contentType: "text/html", body: "<body></body>" }));
  const storefront = '<main><article itemtype="https://schema.org/Product">' + "Product details and availability. ".repeat(7) + "</article></main>";
  for (const shell of ["Veuillez patienter…", "Wird geladen…", "Cargando…"]) {
    await page.goto(entry);
    await page.evaluate(({ shell, storefront }) => {
      document.body.textContent = shell;
      setTimeout(() => { document.body.innerHTML = storefront; }, 220);
    }, { shell, storefront });
    assert.equal(await waitForPassiveStorefrontSettle(page, entry, 1_100), "storefront_observed");
  }
  await page.route(entry, route => route.fulfill({ status: 202, contentType: "text/html", body: "<body></body>" }));
  let navigationRequests = 0;
  page.on("request", request => { if (request.isNavigationRequest()) navigationRequests++; });
  const pending = await page.goto(entry);
  assert.equal(pending?.status(), 202);
  await page.evaluate(storefront => {
    setTimeout(() => { document.body.innerHTML = storefront; }, 220);
  }, storefront);
  assert.equal(await waitForPassiveStorefrontSettle(page, entry, 750, 202), "storefront_observed");
  assert.equal(navigationRequests, 1, "the passive wait must not reload");

  await page.goto(entry);
  assert.equal(await waitForPassiveStorefrontSettle(page, entry, 250, 202), "unverified");
  assert.equal(navigationRequests, 2, "an empty timeout must not reload either");
  await page.unroute(entry);

  await page.goto(entry);
  await page.evaluate(() => { document.body.innerHTML = '<form><button>Weiter shoppen</button></form>'; });
  assert.equal(await waitForPassiveStorefrontSettle(page, entry, 750), "ineligible");

  await page.evaluate(() => { document.body.textContent = "Please wait, loading…"; });
  assert.equal(await waitForPassiveStorefrontSettle(page, entry, 250), "unverified");

  await page.evaluate(() => {
    document.body.textContent = "Loading…";
    setTimeout(() => location.assign("https://other-shop.test/"), 130);
  });
  assert.equal(await waitForPassiveStorefrontSettle(page, entry, 450), "unverified");

  await page.route(entry, route => route.fulfill({ contentType: "text/html", body: storefront }));
  await page.goto(entry);
  await page.evaluate(() => {
    document.body.textContent = "Loading…";
    setTimeout(() => location.reload(), 130);
  });
  assert.equal(await waitForPassiveStorefrontSettle(page, entry, 750), "storefront_navigation_observed");
});

test("only an intended, representative destination resolves a passive navigation", async t => {
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const entry = "https://shop.test/";
  const target = "https://www.shop.test/";
  for (const scenario of ["redirect", "loading", "challenge", "unrelated"] as const) {
    const page = await browser.newPage();
    const destination = scenario === "unrelated" ? "https://other.test/" : target;
    const notice = scenario === "redirect"
      ? `You will be automatically re-directed to our consumer site momentarily, or you may navigate to Home content at our new location by following this link: <a href="${destination}">${destination}</a>`
      : "Loading…";
    const content = scenario === "challenge" ? "<form><button>Continue shopping</button></form>" :
      '<main><article itemtype="https://schema.org/Product">' + "Product details and availability. ".repeat(7) + "</article></main>";
    await page.route("**/*", route => route.fulfill({ contentType: "text/html; charset=utf-8", body: route.request().url() === entry
      ? `<body>${notice}</body>`
      : content }));
    await page.goto(entry);
    await page.evaluate(url => { setTimeout(() => location.assign(url), 250); }, destination);
    const outcome = await waitForPassiveStorefrontSettle(page, entry, 850, 200, [entry, target]);
    assert.equal(outcome, scenario === "redirect" || scenario === "loading" ? "storefront_navigation_observed" : "unverified", scenario);
    await page.close();
  }
});

test("the runtime scanner binds an automatic transition to the final storefront response", async () => {
  const { mkdtemp, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { createArtifactWriter } = await import("./artifact-writer.js");
  const { preConsentRuntimeScanner } = await import("./scanners/pre-consent-runtime-scanner.js");
  const folder = await mkdtemp(join(tmpdir(), "passive-storefront-navigation-"));
  const entry = "https://storefront.test/";
  const target = entry; // The site replaces the document without changing the committed URL.
  const storefront = '<main><article itemtype="https://schema.org/Product">' + "Product details and availability. ".repeat(7) + "</article></main>";
  try {
    const result = await preConsentRuntimeScanner({
      artifactWriter: await createArtifactWriter(folder),
      captureScope: "runtime_evidence", screenshotMode: "never", waitMode: "fast",
      internalBudgetMs: 12_000, normalizedUrl: entry, url: entry, scanStartedAtMs: Date.now(),
      // Fulfill both the initial document and its scripted replacement locally.
      routeFulfillers: [
        { urlPattern: "**/*", status: 404 },
        {
          urlPattern: new RegExp("^" + entry.replaceAll(".", "\\.") + "$"),
          status: 200,
          contentType: "text/html; charset=utf-8",
          body: `<!doctype html><body><script>
            if (sessionStorage.getItem("revealed")) {
              document.body.innerHTML = ${JSON.stringify(storefront)};
            } else {
              document.body.textContent = "Loading…";
              sessionStorage.setItem("revealed", "yes");
              setTimeout(() => location.assign(${JSON.stringify(target)}), 480);
            }
          </script></body>`,
        },
      ],
    });
    const terminal = result.domSnapshots.find(s => s.artifactId === "dom_text_pre_consent");
    assert.match(terminal?.textExcerpt ?? "", /Product details/);
    const navigation = terminal?.runtimeDocumentCapture?.passiveStorefrontNavigation;
    assert.ok(navigation, JSON.stringify({ snapshots: result.domSnapshots, errors: result.moduleRun.errors }));
    assert.equal(terminal?.runtimeDocumentCapture?.response?.status, 200);
    assert.equal(navigation.destinationDocumentToken, terminal?.documentIdentity?.token);
    assert.notEqual(navigation.destinationDocumentToken, navigation.sourceDocumentToken);
  } finally {
    await rm(folder, {recursive:true,force:true});
  }
});

test("French and Italian shopping interstitials require an intended storefront in the original session", async t => {
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const copy = [
    {
      locale: "fr",
      heading: "Cliquez sur le bouton ci-dessous pour continuer vos achats",
      label: "Continuer les achats",
      footer: "Conditions générales de vente Vos informations personnelles © 1996-2025, Amazon.com, Inc. ou ses filiales.",
    },
    {
      locale: "it",
      heading: "Fai clic sul pulsante qui sotto per continuare a fare acquisti",
      label: "Continua con gli acquisti",
      footer: "Condizioni generali di uso e vendita Informativa sulla privacy © 1996-2025, Amazon.com, Inc. o società affiliate.",
    },
  ];
  const storefront = '<main><article itemtype="https://schema.org/Product">' +
    "Product details, catalog selection and availability. ".repeat(6) + "</article></main>";

  for (const { locale, heading, label, footer } of copy) {
    for (const scenario of ["storefront", "challenge", "wrong-site"] as const) {
      const context = await browser.newContext({ offline: true, serviceWorkers: "block" });
      try {
        const page = await context.newPage();
        const intended = `https://${locale}.storefront.test/`;
        const destination = scenario === "wrong-site" ? "https://different-storefront.test/" : intended;
        const shell = `<p>${heading}</p><button type="button">${label}</button> <footer>${footer}</footer>`;
        let visits = 0;
        await context.route("**/*", async route => {
          // Every request must be one of the fixture's top-level navigations.
          assert.equal(route.request().isNavigationRequest(), true);
          assert.equal(route.request().method(), "GET");
          assert.equal(route.request().url(), visits === 0 ? intended : destination);
          visits++;
          assert.ok(visits <= 2, "the observer must not issue retries or form submissions");
          const body = visits === 1 || scenario === "challenge" ? shell : storefront;
          await route.fulfill({ contentType: "text/html; charset=utf-8", status: 200, body });
        });
        await page.goto(intended);
        // This is an inert mock button. The fixture simulates the replacement
        // document independently of any user or scanner action.
        await page.evaluate(url => { setTimeout(() => location.assign(url), 250); }, destination);
        const expected = scenario === "storefront" ? "storefront_navigation_observed" : "unverified";
        assert.equal(await waitForPassiveStorefrontSettle(page, intended, 900), expected, `${locale}/${scenario}`);
        assert.equal(visits, 2, `${locale}/${scenario}: initial navigation and fixture transition only`);
      } finally {
        await context.close();
      }
    }
  }
});
