import { Suspense } from "react";
import { DomainScanForm } from "../../../components/marketing/domain-scan-form";
import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@website-signal-risk-scanner/ui";
import { EditorialByline } from "../../../components/marketing/editorial-byline";
import { SessionReplayEvidenceExample } from "../../../components/marketing/session-replay-evidence-example";
import data from "../../../lib/marketing/session-replay-study-data.json";
import {
  createBreadcrumbSchema,
  createPageMetadata,
  createPublicArticleSchema,
} from "../../../lib/seo";

const path = "/insights/session-replay-study-2026";
const title =
  "Session replay signals appeared on nearly 1 in 8 websites we analyzed";
const description =
  "Across 5,000 production scans, 383 of 3,199 domains with usable evidence showed a session-replay service signal. Explore the services, context and methodology.";
const percent = (n: number, d: number) => `${((100 * n) / d).toFixed(1)}%`;
const number = (n: number) => n.toLocaleString("en-US");
const linkStyle =
  "font-medium text-sky-700 underline decoration-sky-300 underline-offset-4 hover:text-sky-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4";
const headingStyle =
  "text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl";

export const metadata: Metadata = createPageMetadata({
  title: "Session replay detection: findings from 5,000 scans",
  description,
  path,
});

export default function SessionReplayStudyPage() {
  const schemas = [
    createPublicArticleSchema({ title, description, path }),
    createBreadcrumbSchema([
      { name: "Home", path: "/" },
      { name: "Insights", path: "/insights" },
      { name: "Session replay study", path },
    ]),
  ];
  return (
    <article>
      {schemas.map((schema, i) => (
        <script
          key={i}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
        />
      ))}
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-5xl px-6 py-14 sm:py-20">
          <div className="flex flex-wrap items-center gap-3">
            <Badge tone="neutral">Original research</Badge>
            <span className="text-sm text-slate-500">
              September 18 – October 1, 2026 observations
            </span>
          </div>
          <h1 className="mt-6 max-w-4xl text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl lg:text-6xl">
            {title}
          </h1>
          <div className="mt-5">
            <EditorialByline path={path} />
          </div>
          <p className="mt-6 max-w-3xl text-lg leading-8 text-slate-600">
            Across {number(data.selected)} production scans,{" "}
            {number(data.domains)} distinct destination domains had usable
            evidence. Of those, {number(data.positive)} showed an observable
            session-replay service signal.
          </p>
          <figure className="mt-10 grid gap-6 rounded-2xl border border-sky-200 bg-sky-50 p-6 sm:grid-cols-[auto_1fr] sm:items-center sm:gap-10 sm:p-8">
            <p className="text-7xl font-semibold tracking-tight text-sky-800 sm:text-8xl">
              {percent(data.positive, data.domains)}
            </p>
            <figcaption className="space-y-3">
              <p className="text-xl font-semibold text-slate-950">
                383 / 3,199 analyzed domains
              </p>
              <p className="text-base leading-7 text-slate-700">
                An observable replay-service signal. A service signal does not
                prove active recording or capture of visitor inputs.
              </p>
              <p className="text-sm leading-6 text-slate-600">
                {number(data.unknownExecutions)} executions with unknown or
                insufficient evidence were excluded, not treated as negatives.
              </p>
            </figcaption>
          </figure>
          <nav
            aria-label="Study sections"
            className="mt-7 flex flex-wrap gap-x-6 gap-y-3 text-sm"
          >
            <a className={linkStyle} href="#findings">
              Findings
            </a>
            <a className={linkStyle} href="#services">
              Services
            </a>
            <a className={linkStyle} href="#forms">
              Forms context
            </a>
            <a className={linkStyle} href="#methodology">
              Methodology &amp; limitations
            </a>
          </nav>
        </div>
      </header>
      <div className="mx-auto max-w-5xl space-y-14 px-6 py-14 sm:space-y-16">
        <section id="findings" className="scroll-mt-28">
          <h2 className={headingStyle}>What we found</h2>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {[
              [
                "12.0%",
                "showed a replay-service signal",
                "383 of 3,199 distinct domains with usable evidence. This describes the analyzed sample, not the entire web.",
              ],
              [
                "69.2%",
                "of replay-positive domains included Clarity",
                "Microsoft Clarity appeared on 265 of 383 replay-positive domains, making it the most commonly observed service in this sample.",
              ],
              [
                "50.3%",
                "also had a form or input surface",
                "191 of 380 evaluable replay-positive domains. The comparison was 47.9% without an observed replay signal; this does not establish an unusual association.",
              ],
            ].map(([stat, heading, text]) => (
              <div
                key={stat}
                className="rounded-xl border border-slate-200 bg-white p-6"
              >
                <p className="text-3xl font-semibold text-sky-800">{stat}</p>
                <h3 className="mt-3 text-lg font-semibold leading-7 text-slate-950">
                  {heading}
                </h3>
                <p className="mt-3 text-sm leading-6 text-slate-600">{text}</p>
              </div>
            ))}
          </div>
        </section>
        <section id="services" className="scroll-mt-28">
          <h2 className={headingStyle}>Services observed</h2>
          <p className="mt-4 max-w-3xl leading-7 text-slate-700">
            Microsoft Clarity was the most commonly observed service, followed
            by Hotjar. These are canonical service identities, not
            parent-company market shares.
          </p>
          <figure className="mt-6 rounded-xl border border-slate-200 bg-white p-6 sm:p-8">
            <div className="mb-6 flex justify-between gap-4 text-xs font-semibold uppercase tracking-wider text-slate-500">
              <span>Service</span>
              <span>Domains</span>
            </div>
            <ul className="space-y-5">
              {data.services.map((service) => (
                <li key={service.name}>
                  <div className="mb-2 flex justify-between gap-4 text-sm font-medium text-slate-900">
                    <span>{service.name}</span>
                    <span>{service.domains}</span>
                  </div>
                  <div
                    aria-hidden="true"
                    className="h-3 overflow-hidden rounded-full bg-slate-100"
                  >
                    <div
                      className="h-full rounded-full bg-sky-700"
                      style={{
                        width: `${(100 * service.domains) / Math.max(...data.services.map((item) => item.domains))}%`,
                      }}
                    />
                  </div>
                </li>
              ))}
            </ul>
            <figcaption className="mt-6 text-sm leading-6 text-slate-600">
              Counts overlap because a domain may contain more than one
              canonical replay-service identity. Denominator: 383
              replay-positive domains. This is not web-wide market share.
            </figcaption>
          </figure>
        </section>
        <section id="forms" className="scroll-mt-28">
          <h2 className={headingStyle}>
            Forms and input surfaces: useful context
          </h2>
          <p className="mt-4 leading-7 text-slate-700">
            About half of replay-positive pages with evaluable form evidence
            also contained a form or input surface during the observed visit.
            The inventory includes search fields and controls outside native
            forms.
          </p>
          <figure className="mt-6 rounded-xl border border-slate-200 bg-white p-6 sm:p-8">
            <h3 className="font-semibold text-slate-950">
              Form/input co-presence in the analyzed sample
            </h3>
            <div className="mt-6 space-y-6">
              {[
                {
                  label: "Replay signal observed",
                  numerator: data.positiveForms,
                  denominator: data.positiveFormsEvaluable,
                },
                {
                  label: "No replay signal observed",
                  numerator: data.comparisonForms,
                  denominator: data.comparisonEvaluable,
                },
              ].map((row) => (
                <div key={row.label}>
                  <div className="flex flex-wrap justify-between gap-2 text-sm">
                    <span className="font-medium text-slate-900">
                      {row.label}
                    </span>
                    <span className="text-slate-700">
                      {percent(row.numerator, row.denominator)} ·{" "}
                      {number(row.numerator)} / {number(row.denominator)}
                    </span>
                  </div>
                  <div
                    aria-hidden="true"
                    className="mt-2 h-3 rounded-full bg-slate-100"
                  >
                    <div
                      className="h-full rounded-full bg-sky-700"
                      style={{ width: percent(row.numerator, row.denominator) }}
                    />
                  </div>
                </div>
              ))}
            </div>
            <figcaption className="mt-6 text-sm leading-6 text-slate-600">
              Both bars use a 0–100% scale and only domains with evaluable form
              evidence. The observed difference is 2.4 percentage points. This
              convenience sample does not support a web-wide estimate of that
              difference or a causal conclusion.
            </figcaption>
          </figure>
          <p className="mt-4 rounded-lg border-l-4 border-sky-600 bg-sky-50 p-5 font-medium leading-7 text-slate-900">
            Co-presence does not establish that field values were entered,
            transmitted to the replay service or recorded.
          </p>
        </section>
        <section>
          <h2 className={headingStyle}>What CertScore.ai actually detects</h2>
          <p className="mt-4 leading-7 text-slate-700">
            CertScore.ai recognizes known replay-service evidence in a bounded
            public-page visit. For this study, each positive required a retained
            canonical service identity and a product-specific network request
            tied to the measured page. Requests can include library downloads or
            unsuccessful requests.
          </p>
          <p className="mt-4 leading-7 text-slate-700">
            The public finding is a service signal. It does not establish a
            recorded session, keystroke capture, form submission capture or a
            GDPR/CCPA violation. Reviewers still need to check the website’s
            configuration, masking and disclosures.
          </p>
          <SessionReplayEvidenceExample />
          <p className="mt-5 leading-7">
            <Link
              className={linkStyle}
              href="/releases/session-replay-detection"
            >
              Explore the Session Replay Detection release
            </Link>
          </p>
        </section>
        <section id="methodology" className="scroll-mt-28">
          <h2 className={headingStyle}>Methodology</h2>
          <p className="mt-4 leading-7 text-slate-700">
            We selected the latest 5,000 production bot executions before
            October 1, 2026 at 08:30 UTC. Execution creation times ranged from
            September 18, 2026 at 18:30:48 UTC to October 1, 2026 at 08:27:40
            UTC. All ran from California (us-west-1); that describes the
            scanner’s location, not a website’s jurisdiction.
          </p>
          <dl className="mt-6 divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white px-6">
            {[
              ["Selected production executions", data.selected],
              ["Completed executions", data.completed],
              [
                "Usable representative passive executions",
                data.usableExecutions,
              ],
              [
                "Unknown / insufficient executions — excluded",
                data.unknownExecutions,
              ],
              ["Distinct usable destination domains", data.domains],
            ].map(([label, value]) => (
              <div
                key={label}
                className="flex items-center justify-between gap-5 py-4 text-sm"
              >
                <dt className="text-slate-600">{label}</dt>
                <dd className="font-semibold tabular-nums text-slate-950">
                  {number(Number(value))}
                </dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            The 1,756 excluded executions include the 12 that did not complete
            and 1,744 completed executions without usable evidence.
          </p>
          <div className="mt-6 space-y-4 leading-7 text-slate-700">
            <p>
              We used the most recent usable visit per destination registrable
              domain, with Public Suffix List private suffixes enabled.
              Redirects were attributed to the observed destination. This is a
              production convenience sample, not a random or representative
              sample of the web. We report descriptive proportions rather than
              population confidence intervals or significance tests, which would
              not account for this sample’s selection and coverage limitations.
            </p>
            <p>
              Retained runtime evidence was verified against its artifact
              identity, byte size and hash. Only representative pages with
              usable passive runtime coverage entered the primary analysis.
              Failed or insufficient visits remained unknown. Services were
              deduplicated by canonical identity within each domain.
            </p>
            <p>
              The analysis covered five service families classified by
              CertScore.ai as session replay: Microsoft Clarity, Hotjar,
              Contentsquare, FullStory and Quantum Metric. This does not measure
              every product capable of session replay. Passive observations do
              not measure consent-gating effectiveness or after-consent-only
              deployment.
            </p>
            <p>
              Form evidence required a hash-bound inventory from the same
              runtime lane and page. Limited inventories could support retained
              positive observations; missing controls under limited coverage
              were not proof of absence. Evaluable form evidence was unavailable
              for 3 of 383 replay-positive domains and 35 of 2,816 domains
              without an observed replay signal. Both groups were excluded
              from the form comparison, leaving denominators of 380 and 2,781.
            </p>
          </div>
          <details className="mt-6 rounded-xl border border-slate-200 bg-white p-6">
            <summary className="cursor-pointer font-semibold text-slate-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4">
              Measurement checks and field classification
            </summary>
            <div className="mt-4 space-y-3 text-sm leading-6 text-slate-600">
              <p>
                The launch figures were reproduced offline from the retained
                research export and cross-checked against domain, service and
                form tables. Manual agent spot-checks informed the research
                audit; they are not an independent human validation study.
              </p>
              <p>
                A field-classification audit found a birthday-themed option
                incorrectly categorized as a date-of-birth field. We do not
                publish the combined sensitive-field aggregate. Removing all
                date-of-birth labels leaves the replay prevalence, service
                counts and forms result unchanged.
              </p>
            </div>
          </details>
        </section>
        <section>
          <h2 className={headingStyle}>How to read these results</h2>
          <ul className="mt-5 list-disc space-y-3 pl-5 leading-7 text-slate-700">
            <li>
              These are CertScore.ai bot visits, not representative human
              browsing sessions. Results can vary by time, page, region and
              interaction.
            </li>
            <li>
              Observation is bounded and detection depends on recognized
              services and retained evidence. “Not observed” does not mean “not
              installed.”
            </li>
            <li>
              A service signal does not prove recording or collection of field
              values. A form on the same page is context, not evidence of
              capture.
            </li>
            <li>
              Results are descriptive. They establish neither legal compliance
              nor non-compliance.
            </li>
          </ul>
        </section>
        <aside
          id="scan"
          className="scroll-mt-24 rounded-2xl border border-sky-200 bg-sky-50 p-5 sm:p-8"
        >
          <h2 className={headingStyle}>Scan your website</h2>
          <p className="mb-5 mt-4 leading-7 text-slate-700">
            See the cookies, trackers, consent behavior, session-replay signals
            and other privacy evidence CertScore.ai can observe from the public
            web.
          </p>
          <Suspense
            fallback={
              <p className="text-sm text-slate-600">Loading scan form…</p>
            }
          >
            <DomainScanForm
              mode="full"
              variant="homepage-hero"
              scanSource="unknown"
              buttonLabel="Scan now"
              inputLabel="Website URL"
              inputPlaceholder="https://your-website.com"
            />
          </Suspense>
          <p className="mt-4 text-sm leading-6 text-slate-600">
            Start with a free scan of one public page. Results describe the
            scan’s conditions and coverage.
          </p>
          <div className="mt-6 flex flex-wrap gap-x-5 gap-y-3 text-sm">
            <Link
              href="/findings/session_recording_services_detected"
              className={linkStyle}
            >
              Finding reference
            </Link>
            <Link href="/guides/session-replay-risk" className={linkStyle}>
              Session replay review guide
            </Link>
            <Link href="/guides/website-form-scanning" className={linkStyle}>
              Forms and fields
            </Link>
            <Link
              href="/guides/third-party-cookie-checker"
              className={linkStyle}
            >
              Cookies and trackers
            </Link>
            <Link href="/methodology" className={linkStyle}>
              Scanning methodology
            </Link>
          </div>
        </aside>
      </div>
    </article>
  );
}
