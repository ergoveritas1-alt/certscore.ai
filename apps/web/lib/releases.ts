import { SESSION_REPLAY_STUDY_LINK } from "./marketing/research-links";
import { EDITORIAL_AUTHOR } from "./marketing/editorial-metadata";
import type { Metadata } from "next";
import { absoluteUrl, createPageMetadata, SITE_NAME, SITE_URL } from "./seo";
import { AUTHENTIC_SAMPLE_REPORT_URL } from "./marketing/sample-report";

export type ReleaseLink = {
  href: string;
  label: string;
};

export type ReleaseSection = {
  example?: "session-replay";
  image?: { path: string; alt: string; width: number; height: number; caption: string };
  bullets?: readonly string[];
  heading: string;
  id: string;
  paragraphs?: readonly string[];
  sourceLinks?: readonly ReleaseLink[];
  steps?: readonly string[];
};

export type ProductRelease = {
  scanForm?: boolean;
  researchLink?: ReleaseLink;
  body: readonly string[];
  cardImage?: {
    alt: string;
    height: number;
    path: string;
    width: number;
  };
  category: string;
  ctaDescription: string;
  ctaHeading: string;
  headline: string;
  metaDescription: string;
  modifiedDate?: string;
  primaryCta: ReleaseLink;
  publicationDate: string;
  resourceLinks?: readonly ReleaseLink[];
  sections: readonly ReleaseSection[];
  seoTitle: string;
  shortDescription: string;
  slug: string;
  socialImage: {
    alt: string;
    height: number;
    path: string;
    width: number;
  };
};

const releases: readonly ProductRelease[] = [
{
  "slug": "session-replay-detection",
  "scanForm": true,
  researchLink: SESSION_REPLAY_STUDY_LINK,
  modifiedDate: "2026-10-04",
  "cardImage": { "path": "/images/releases/session-replay-social-card.png", "alt": "12.0%: 383 of 3,199 analyzed domains showed a session-replay service signal", "width": 1200, "height": 630 },
  "headline": "See when session-replay technology appears on a website",
  "shortDescription": "Identify observable session-replay service signals, inspect the retained evidence, and give your privacy review a clearer starting point.",
  "publicationDate": "2026-10-03",
  "category": "Scanner capability",
  "ctaHeading": "See what appears on your website",
  "ctaDescription": "Explore the cookies, trackers, consent behavior, session-replay signals and other privacy evidence CertScore.ai can observe from the public web.",
  "seoTitle": "Session replay detection and evidence",
  "metaDescription": "Identify session-replay service signals with CertScore.ai. Explore our study of 5,000 scans, the observed services and the evidence behind the findings.",
  "primaryCta": {
    "href": "/",
    "label": "Scan your website"
  },
  "body": [
    "Session-replay tools can help teams understand website journeys. Privacy reviewers need to know where these services appear and what the evidence actually shows.",
    "CertScore.ai surfaces observable session-replay service signals and preserves supporting page, service and request context where available. A recognized service is a starting point for review; it does not prove that visitor sessions or field values were recorded."
  ],
  "socialImage": {
    "path": "/images/releases/session-replay-social-card.png",
    "alt": "12.0%: 383 of 3,199 analyzed domains showed an observable session-replay service signal.",
    "width": 1200,
    "height": 630
  },
  "sections": [
    {
      "id": "research",
      "heading": "Nearly 1 in 8 analyzed websites showed a replay-service signal",
      "paragraphs": [
        "Across 5,000 selected production scans, 3,199 distinct destination domains had usable evidence. CertScore.ai observed a session-replay service signal on 383 of them \u2014 12.0%. Microsoft Clarity appeared on 265 of the 383 replay-positive domains (69.2%).",
        "This is a production convenience sample, not a measure of the entire web. The 1,756 executions with unknown or insufficient evidence were excluded, not counted as negatives."
      ],
      "sourceLinks": [
        {
          "href": "/insights/session-replay-study-2026",
          "label": "Read the original study and methodology"
        }
      ]
    },
    {
      "id": "evidence",
      "heading": "Start with the observed evidence",
      "paragraphs": [
        "Review the recognized service and its retained evidence in the scan report. Known product-specific requests may include a library download; a request alone does not establish recording or successful transmission."
      ],
      "example": "session-replay"
    },
    {
      "id": "forms",
      "heading": "Put form context beside the service signal",
      "paragraphs": [
        "In the study, 191 of 380 replay-positive domains with evaluable form evidence had a form or input surface on the same measured page (50.3%). The corresponding figure among evaluable domains without an observed replay signal was 1,331 of 2,781 (47.9%).",
        "These descriptive results do not establish an unusual association. Co-presence does not establish that field values were entered, transmitted to the replay service or recorded."
      ]
    },
    {
      "id": "review",
      "heading": "A practical review workflow",
      "steps": [
        "Run a public website scan and review the observed services and retained evidence.",
        "Check the page context and any available Forms & fields evidence. Keep separate visits and pages distinct.",
        "Ask the site owner to verify replay configuration, masking, consent settings and relevant disclosures. Retest after configuration changes."
      ],
      "paragraphs": [
        "A bounded scan can miss services that load later, require interaction or are not recognized. \u201cNot observed\u201d does not mean \u201cnot installed.\u201d Findings guide review; they do not determine legal compliance."
      ]
    }
  ],
  "resourceLinks": [
    {
      "href": "/insights/session-replay-study-2026",
      "label": "Session replay study: 5,000 production scans"
    },
    {
      "href": "/guides/session-replay-risk",
      "label": "Session replay review guide"
    },
    {
      "href": "/guides/website-form-scanning",
      "label": "Forms and field evidence"
    },
    {
      "href": "/guides/third-party-cookie-checker",
      "label": "Review cookies and trackers"
    },
    {
      "href": "/methodology",
      "label": "Scanning methodology"
    }
  ]
},
{
  "slug": "forms-capture",
  "headline": "See the forms on your website—and the privacy questions they raise",
  "shortDescription": "Find observed forms and fields, open available form screenshots, and give your next website privacy review a clearer starting point.",
  "publicationDate": "2026-09-21",
  "category": "Scanner capability",
  "ctaHeading": "Take a closer look at your forms",
  "ctaDescription": "Run a public website scan, then open Forms & fields in the completed report.",
  "seoTitle": "Website form scanning and form screenshots",
  "metaDescription": "See forms and fields on scanned public pages, open available form screenshots, and investigate data collection with evidence-backed privacy context.",
  "body": [
    "A contact form asks for an email address. A booking enquiry adds a date of birth. A newsletter checkbox arrives already selected. Before a team can review data collection, it needs to see what the website is asking visitors to provide.",
    "CertScore.ai brings observed forms, retained field details and available form screenshots into your website report. Developers can locate the form, agencies can explain it to a client, and privacy reviewers can start with the captured evidence."
  ],
  "sections": [
    {
      "id": "whats-new",
      "heading": "A clearer view of data collection",
      "paragraphs": [
        "Our September forms capture updates bring a dedicated Forms & fields inventory to single-page and full-site reports, with verified, masked form crops when screenshot capture succeeds. Today’s announcement introduces the combined workflow; these capabilities began rolling out earlier in September.",
        "Form detection, screenshot capture and privacy assessment each answer a different question: what was observed, what can be shown, and what the retained evidence supports. A detected form is not automatically a privacy concern."
      ]
    },
    {
      "id": "what-you-can-see",
      "heading": "From a form to the details that matter",
      "bullets": [
        "Find the captured page and review each form’s type, fields and configured action. The action describes its setup, not an observed data transfer.",
        "Expand a form to inspect labels, field types, required states, checkbox or toggle states and evidence references.",
        "Choose View form to open its cropped screenshot when capture and safety review succeed. Input values are masked.",
        "Use field-review indicators to prioritize questions about personal data, sensitive-looking fields and selected marketing controls."
      ],
      "paragraphs": [
        "The screenshot adds visual context to the structured inventory: which fields sit together, how they are labelled and what the visitor is shown. Unavailable images remain clearly marked, while retained field details stay available for review."
      ]
    },
    {
      "id": "privacy-review",
      "heading": "Turn visual evidence into better questions",
      "paragraphs": [
        "Imagine handing a developer a review request with the page, field labels and captured form attached. Instead of “check the forms,” the conversation can be specific: Why is this field required? Does the privacy notice explain its purpose? Should this marketing choice start selected?",
        "Field-review indicators help route that conversation. They are not privacy findings and do not affect the score by themselves; read them alongside the report’s separately supported findings.",
        "For teams reviewing GDPR risk signals, form evidence is a practical starting point for checking data collection against privacy notices and intended implementation. Human review remains essential."
      ]
    },
    {
      "id": "verified-example",
      "heading": "A real capture from our owned test page",
      "image": { "path": "/images/releases/forms-capture-contact-example.jpg", "alt": "Verified Contact enquiry form crop showing Full name, Email address, Enquiry and opt-in labels, with controls masked.", "width": 610, "height": 421, "caption": "Actual production capture, September 21, 2026. Owned test fixture; no visitor data. The structured inventory separately records the opt-in as unchecked." },
      "paragraphs": [
        "On September 21, 2026, a production scan of our owned ErgoVeritas contact-form fixture retained four fields: Full name, Email address, Enquiry and an unchecked opt-in control. The report recorded the email field as required and retained a matching, masked form screenshot.",
        "The report surfaced no privacy findings. Its field-review cues identify personal-contact, identity and free-text fields worth checking—a concrete starting point for review."
      ]
    },
    {
      "id": "how-to-use",
      "heading": "Try it in your next review",
      "steps": [
        "Scan an eligible public website or open a recent completed report.",
        "Find Forms & fields below Services & Resources and expand a form.",
        "Open View form where available, check the source page and evidence references, and read any coverage limitations.",
        "Review the relevant Detailed evidence and share a precise follow-up with the developer or privacy owner."
      ],
      "paragraphs": [
        "You can copy the forms table as JSON. API v2 report-evidence exports and MCP report-evidence retrieval also carry retained form details, coverage and snapshot links, subject to the report’s access rules. Images remain separate downloads."
      ]
    },
    {
      "id": "availability",
      "heading": "Availability and limits",
      "paragraphs": [
        "Forms capture is available in supported public single-page scans and on inventoried pages of full-site scans, within your existing access and crawl limits.",
        "CertScore.ai does not fill or submit forms. Coverage is bounded; see the Forms & fields guide below for capture details and exclusions. Automated observations, not legal advice."
      ]
    }
  ],
  "primaryCta": {
    "href": "/",
    "label": "Scan your website"
  },
  "resourceLinks": [
    { "href": "https://certscore.ai/scan/63b87ff5-07c5-4c7b-895a-028ea6bb43c9#report-forms", "label": "View the real forms example" },
    {
      "href": "/guides/website-form-scanning",
      "label": "Forms & fields guide"
    },
    {
      "href": "/developers/mcp#forms-evidence",
      "label": "Use forms evidence with your agent"
    },
    {
      "href": "/releases/mcp-hosted-oauth",
      "label": "Connect Hosted MCP OAuth"
    }
  ],
  "cardImage": { "alt": "See the fields. Review the evidence. CertScore.ai forms capture.", "height": 630, "width": 1200, "path": "/images/releases/forms-capture-social-card.png" },
  "socialImage": {
    "alt": "CertScore.ai forms capture: see the fields, review the evidence.",
    "width": 1200,
    "height": 630,
    "path": "/images/releases/forms-capture-social-card.png"
  }
},
  {
  "slug": "mcp-hosted-oauth",
  "headline": "Connect your agent to your CertScore.ai workspace with Hosted MCP OAuth",
  "shortDescription": "Connect an MCP-capable agent to your CertScore.ai workspace to scan public websites, retrieve reports, and access previous scans.",
  "publicationDate": "2026-09-14",
  "category": "Developer tools",
  "ctaHeading": "Connect your workspace",
  "ctaDescription": "Follow the Hosted OAuth setup guide to connect your agent and start a website review.",
  "seoTitle": "Connect your workspace with Hosted MCP OAuth",
  "metaDescription": "Connect an MCP-capable agent to your CertScore.ai workspace to scan public websites, retrieve reports, and access previous scans.",
  "body": [
    "MCP Light gave agents account-free access to CertScore.ai public-website scanning. Accept and Reject Path testing expanded the evidence CertScore.ai can collect around visitor consent choices. Hosted MCP now connects an agent securely to your CertScore.ai workspace for an authenticated, continuing workflow.",
    "You can ask an agent to scan a public website, retrieve the resulting report, and return to previous scans through your workspace connection. OAuth enables that access without manually copying an API key into the agent’s configuration."
  ],
  "sections": [
    {
      "id": "whats-new",
      "heading": "What is new",
      "paragraphs": [
        "Hosted MCP brings your CertScore.ai workspace into your agent workflow. Connect from an OAuth-capable MCP client, sign in to CertScore.ai when prompted, and use your authorized workspace access for public website reviews.",
        "The connection gives the agent a way to work with your reports across review sessions. You can return to a prior result, inspect its findings and evidence references, or request another scan when you need fresh observations."
      ]
    },
    {
      "id": "why-workspace-access-matters",
      "heading": "Why workspace access matters",
      "paragraphs": [
        "A website review rarely ends with one answer. A developer may need to revisit evidence before a release. A privacy reviewer may want to inspect the basis for a finding. An agency may need to return to a report while discussing next steps with a client.",
        "Hosted MCP keeps those requests connected to your authorized workspace. Ask the agent to access previous scans instead of treating every question as a reason to start new work. The agent should identify when it is using an existing result and keep its timestamp and coverage limitations visible."
      ]
    },
    {
      "id": "agent-workflow",
      "heading": "What an agent can do through Hosted MCP",
      "bullets": [
        "Start a scan of an eligible public website or reuse a suitable completed result.",
        "Check progress while a scan is active, then retrieve its completed findings bundle.",
        "Access previous scans available to your workspace.",
        "Review findings alongside supporting evidence references, coverage limitations and the full report link."
      ],
      "paragraphs": [
        "For example: “Use CertScore.ai to review this public website. Reuse a suitable previous scan if available, then summarize the findings, evidence, limitations and report link.”",
        "The connection carries existing CertScore.ai results into your workflow. It does not change the scanner’s methodology, finding policy or scoring. Ask the agent to preserve the distinction between observed evidence and anything that remains unknown."
      ]
    },
    {
      "id": "hosted-and-light",
      "heading": "Hosted OAuth versus MCP Light",
      "paragraphs": [
        "MCP Light remains the anonymous, account-free entry point for low-volume public website scanning. It is useful when you want to try the workflow without connecting a workspace.",
        "Choose Hosted OAuth when you want an authenticated connection to your CertScore.ai workspace and access to previous scans available there. Both routes scan eligible public websites; signing in to CertScore.ai does not allow the scanner to sign in to login-protected target websites."
      ]
    },
    {
      "id": "how-to-connect",
      "heading": "How to connect",
      "steps": [
        "Open the Hosted OAuth setup guide and add the hosted endpoint to your MCP client.",
        "Start the client’s connection flow and sign in to your CertScore.ai account if prompted. Follow any connection or tool-approval prompts shown by your client.",
        "Ask the agent to review a public URL, follow an active scan to completion, and retrieve the findings with their report link."
      ],
      "paragraphs": [
        "Use your existing connector when returning to the workflow. The setup guide explains access requirements, reconnecting and what to do when permissions or usage limits prevent a request."
      ]
    },
    {
      "id": "availability",
      "heading": "Availability and limitations",
      "paragraphs": [
        "Hosted OAuth requires a CertScore.ai account. Members of active workspaces can receive scan creation access through registered OAuth clients across workspace plans, without a manual CertScore access grant. Existing usage limits, authorized workspace boundaries and public-target restrictions continue to apply. Consult the current setup guide for verified client availability.",
        "Reports describe automated public-web observations for human and agentic review. Findings and evidence depend on the captured result, and incomplete or unavailable observations remain limited coverage. They are not legal advice, certification or a compliance determination."
      ]
    }
  ],
  "primaryCta": {
    "href": "/developers/mcp#hosted-oauth-start",
    "label": "Connect Hosted OAuth"
  },
  "resourceLinks": [
    {
      "href": "/mcp/light",
      "label": "Try account-free MCP Light"
    },
    {
      "href": "/releases/mcp-light",
      "label": "Read the MCP Light release"
    },
    {
      "href": "/releases/accept-and-reject-path-testing",
      "label": "Read the Accept and Reject Path release"
    }
  ],
  "socialImage": {
    "alt": "Your workspace. Your agent. CertScore.ai. Hosted MCP with OAuth",
    "height": 630,
    "width": 1200,
    "path": "/images/releases/mcp-hosted-oauth-social-card.png"
  }
},
  {
    slug: "accept-and-reject-path-testing",
    headline: "CertScore.ai now tests what happens after a visitor accepts or refuses",
    shortDescription: "Evidence-based cookie consent testing: on eligible sites, CertScore.ai compares website behavior before a choice, after a confirmed Accept, and after a confirmed Reject.",
    publicationDate: "2026-09-03",
    category: "Scanner capability",
    ctaHeading: "See choice-path evidence in a real report",
    ctaDescription: "Run a scan, review the method, or inspect an authentic report from our owned deterministic sample page.",
    seoTitle: "Cookie consent testing after Accept and Reject",
    metaDescription: "CertScore.ai tests a site after confirmed Accept or Reject—cookies, storage, trackers, and network activity. Evidence for GDPR and ePrivacy consent review.",
    body: [
      "A cookie banner shows a visitor a choice. Whether that choice changes anything is decided somewhere else—in the tags that fire afterward, the cookies and storage that get written, and the consent state the site keeps.",
      "CertScore.ai now observes that directly. Where a site presents an eligible consent control that can be actioned safely, Reject and Accept Path observers each perform one bounded, deterministic interaction in a clean browser session and retain the activity that follows.",
      "Reports show which activity is consent-dependent, whether qualifying non-essential activity followed a confirmed refusal-state transition, and whether retained consent state contradicts the choice. Unavailable, unsupported, unsuccessful, stale, or unverifiable observations remain explicit and score-neutral; they are never presented as clean results."
    ],
    modifiedDate: "2026-09-14",
    sections: [
{
      "id": "september-2026-update",
      "heading": "September 14, 2026 update",
      "paragraphs": [
            "These release notes describe the September 3 launch. Current choice-path results also distinguish bounded after-click observations from confirmed registration, including the separately verified Reject-click tracking review policy. Use the current developer contract for interpretation. Hosted MCP OAuth now connects agents to their CertScore.ai workspace to access these reports and previous scans."
      ],
      "sourceLinks": [
            {
                  "href": "/developers/mcp",
                  "label": "Current MCP documentation"
            },
            {
                  "href": "/releases/mcp-hosted-oauth",
                  "label": "Hosted MCP OAuth release"
            }
      ]
},
      {
        id: "whats-new",
        heading: "What’s new",
        bullets: [
          "Confirmed refusal, not just a click: a Reject Path finding requires a verified refusal-state transition plus qualifying retained activity afterward.",
          "Separate sessions: Accept and Reject cannot contaminate one another and are each compared with the pre-consent baseline.",
          "Accept is a score-neutral comparison baseline; ordinary activity after acceptance is expected and does not create a negative finding.",
          "Unavailable, unsupported, unsuccessful, stale, timed-out, and unverifiable outcomes remain explicit, score-neutral coverage limitations.",
          "Typed results are available through API v2, Pulse, the TypeScript SDK, and hosted, local, and Light MCP."
        ]
      },
      {
        id: "how-it-works",
        heading: "How it works",
        paragraphs: [
          "Each path runs in a fresh browser session. CertScore.ai locates the first-layer consent surface and performs one bounded Accept, Reject, or necessary-only-equivalent interaction only when the control can be identified and actioned safely.",
          "On the Reject Path, observation is anchored to a confirmed refusal-state transition. Activity already in flight at confirmation is excluded, and the bounded observer may stop deliberately after retaining qualifying evidence. A completed clean observation is distinct from a path that could not be observed."
        ]
      },
      {
        id: "evidence-and-coverage",
        heading: "Evidence and coverage",
        paragraphs: [
          "These are automated observations from one tested region, session, and point in time. A clean Reject observation means no qualifying activity was retained during that completed window; it does not prove that a site always honors refusal. Unchanged stored values alone are review signals, not proof of active use. Limited coverage is not a pass.",
          "CertScore.ai is not a legal certification or compliance-determination product and does not establish compliance, noncompliance, illegality, or a legal violation."
        ]
      },
      {
        id: "regulatory-relevance",
        heading: "Why this matters for privacy review",
        paragraphs: [
          "A cookie banner’s appearance does not establish what a website actually does after someone makes a choice. On eligible sites, CertScore.ai tests the resulting browser behavior—cookies, storage, trackers, and relevant network activity—after a confirmed Accept and after a confirmed Reject.",
          "For GDPR and ePrivacy review, this evidence can help teams investigate whether consent-dependent activity reflects the visitor’s choice and whether non-essential storage or access continues after a confirmed refusal. The ePrivacy Directive specifically addresses storing information on, or gaining access to information stored in, a user’s terminal equipment, subject to limited exceptions; GDPR requirements govern consent and its withdrawal. The two ask different questions of the same evidence.",
          "For CCPA and CPRA review, the evidence may be relevant where the tested control governs the sale or sharing of personal information, including sharing for cross-context behavioral advertising. An ordinary cookie-banner Reject action is not automatically a statutory CCPA/CPRA opt-out, so CertScore.ai reports the observed behavior without making that legal conclusion. This relevance depends on the specific mechanism observed, not on the presence of a Reject control.",
          "Where a choice cannot be confirmed, the report records limited coverage rather than a result."
        ],
        sourceLinks: [
          { href: "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX%3A32016R0679", label: "GDPR (Regulation 2016/679)" },
          { href: "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX%3A02002L0058-20091219", label: "Consolidated ePrivacy Directive" },
          { href: "https://oag.ca.gov/privacy/ccpa", label: "California Attorney General CCPA guidance" }
        ]
      },
      {
        id: "developer-availability",
        heading: "Developer availability",
        paragraphs: [
          "Typed choice-path results are available on API v2 scan resources and Pulse projections as postAcceptObservation, postRefusalObservation, and gpcResponse. Install @certscore/sdk@0.2.10 or newer. Hosted MCP, local MCP, and MCP Light are at 0.2.20. Read the verdict rather than reconstructing an outcome from evidence rows, and treat non-confirmed statuses as limited coverage rather than a pass."
        ]
      }
    ],
    primaryCta: { href: "/", label: "Run a free scan" },
    resourceLinks: [
      { href: AUTHENTIC_SAMPLE_REPORT_URL, label: "See the completed choice-path example" },
      { href: "/guides/consent-enforcement-testing", label: "Learn how choice-path testing works" },
      { href: "/developers/reference", label: "Read the typed result contract" },
      { href: "/findings/reject_tracking_persists_after_reject", label: "Review the Reject Path finding method" }
    ],
    socialImage: {
      alt: "CertScore.ai choice-path report showing consent observations",
      height: 1190,
      path: "/marketing/hero/scan-report-dashboard-with-privacy-details.jpg",
      width: 1438
    },
    cardImage: {
      alt: "CertScore.ai choice-path report showing consent observations",
      height: 1190,
      path: "/marketing/hero/scan-report-dashboard-with-privacy-details.jpg",
      width: 1438
    }
  },
  {
    slug: "mcp-light",
    headline: "CertScore.ai MCP Light is now available",
    shortDescription:
      "CertScore.ai website privacy scanning is now available directly to AI agents — with no account, API key, or OAuth required.",
    publicationDate: "2026-08-26",
    category: "Developer tools",
    ctaHeading: "Start with MCP Light",
    ctaDescription:
      "Connect the public endpoint, review the three-tool workflow, and run a low-volume public website scan.",
    seoTitle: "MCP Light is now available for AI agents",
    metaDescription:
      "CertScore.ai MCP Light gives MCP-capable agents a simple, no-account interface for evidence-backed public website privacy scans.",
    body: [
      "MCP Light is a deliberately simple public MCP interface for low-volume website privacy scanning. It makes CertScore.ai’s evidence-backed public website observations available inside agent workflows without requiring credential setup.",
      "The launch keeps the workflow focused: start or reuse a scan, check its status when work is still active, then retrieve a bounded result bundle with findings, evidence references, limitations, and the full CertScore.ai report URL where available."
    ],
    modifiedDate: "2026-09-14",
    sections: [
{
      "id": "september-2026-update",
      "heading": "September 14, 2026 update",
      "paragraphs": [
            "MCP Light now also provides paginated report evidence alongside its original scan, status and bundle workflow. Hosted MCP OAuth adds an authenticated workspace connection. See the current developer documentation for availability and setup."
      ],
      "sourceLinks": [
            {
                  "href": "/developers/mcp",
                  "label": "Current MCP documentation"
            },
            {
                  "href": "/releases/mcp-hosted-oauth",
                  "label": "Hosted MCP OAuth release"
            }
      ]
},
      {
        id: "whats-new",
        heading: "What’s new",
        bullets: [
          "No account, API key, or OAuth is required.",
          "A public Streamable HTTP MCP endpoint works with MCP-capable agents and clients.",
          "Three focused tools cover scan creation, active-status checks, and result retrieval.",
          "Eligible recent scans can be reused instead of starting unnecessary new work.",
          "Results link back to the full CertScore.ai report when a report is available."
        ]
      },
      {
        id: "why-it-matters",
        heading: "Why it matters",
        paragraphs: [
          "Agents can bring public website privacy observations into a review workflow without asking a user to create credentials first. That makes MCP Light useful for evaluation, discovery, and occasional evidence gathering.",
          "The output remains grounded in CertScore.ai’s existing product posture: automated observations for human and agentic review, not legal advice, certification, or a compliance determination."
        ]
      },
      {
        id: "how-it-works",
        heading: "How it works",
        steps: [
          "Call certscore_scan_site with a public HTTP or HTTPS URL.",
          "If the scan is still active and a scanId was returned, call certscore_get_scan_status with that scanId.",
          "After a terminal result, call certscore_get_scan_bundle for the canonical bounded result."
        ],
        paragraphs: [
          "Depending on the retained evidence, observations can include cookies and browser storage, trackers and vendors, consent or CMP behavior, privacy-policy surfaces, and related public website signals. Coverage limitations travel with the result and should be reviewed with the evidence."
        ]
      }
    ],
    primaryCta: {
      href: "/mcp/light",
      label: "Try MCP Light"
    },
    resourceLinks: [
      { href: "/developers/mcp", label: "Read the MCP developer documentation" },
      { href: "/releases", label: "Browse all releases" }
    ],
    socialImage: {
      alt: "CertScore.ai MCP Light — website privacy scanning for AI agents",
      height: 630,
      path: "/images/releases/mcp-light-social-card.png",
      width: 1200
    },
    cardImage: {
      alt: "CertScore.ai MCP Light — website privacy scanning for AI agents",
      height: 630,
      path: "/images/releases/mcp-light-social-card.png",
      width: 1200
    }
  }
] as const;

export function getPublishedReleases() {
  return [...releases].sort((left, right) => right.publicationDate.localeCompare(left.publicationDate));
}

export function getPublishedRelease(slug: string) {
  return getPublishedReleases().find((release) => release.slug === slug) ?? null;
}

export function releasePath(release: Pick<ProductRelease, "slug">) {
  return `/releases/${release.slug}`;
}

export function formatReleaseDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "long",
    timeZone: "UTC"
  }).format(new Date(`${value}T00:00:00.000Z`));
}

export function createReleaseMetadata(release: ProductRelease): Metadata {
  const path = releasePath(release);
  const url = absoluteUrl(path);
  const imageUrl = absoluteUrl(release.socialImage.path);
  const base = createPageMetadata({
    description: release.metaDescription,
    path,
    socialImage: release.socialImage,
    title: release.seoTitle
  });

  return {
    ...base,
    openGraph: {
      ...base.openGraph,
      type: "article",
      publishedTime: release.publicationDate,
      ...(release.modifiedDate ? { modifiedTime: release.modifiedDate } : {}),
      url,
      images: [
        {
          alt: release.socialImage.alt,
          height: release.socialImage.height,
          url: imageUrl,
          width: release.socialImage.width
        }
      ]
    },
    twitter: {
      ...base.twitter,
      images: [imageUrl]
    }
  };
}

export function createReleaseArticleSchema(release: ProductRelease) {
  const url = absoluteUrl(releasePath(release));

  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: release.headline,
    author: EDITORIAL_AUTHOR,
    description: release.shortDescription,
    datePublished: release.publicationDate,
    ...(release.modifiedDate ? { dateModified: release.modifiedDate } : {}),
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": url
    },
    url,
    image: absoluteUrl(release.socialImage.path),
    publisher: {
      "@type": "Organization",
      name: SITE_NAME,
      url: SITE_URL,
      logo: {
        "@type": "ImageObject",
        url: absoluteUrl("/certscore-header-logo.png")
      }
    }
  };
}
