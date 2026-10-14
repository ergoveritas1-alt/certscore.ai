// Self-contained republication of the October 12, 2026 AI Lab Privacy Leaderboard.
// Preserve the historical article and report links; hosting metadata belongs to certscore.ai.
// Visible FAQ answers and structured data share the same editorial source.
export const AI_LAB_PRIVACY_STUDY_FAQ = [
  {
    "question": "Which AI company has the best privacy posture on its own website?",
    "answer": "Hugging Face scored highest in this ten-site sample, at 92, with a single minor pre-consent storage observation. The report describes that item as an AWS WAF token, likely security-related. This ranking reflects the public starting page and capture window, rather than a full-site audit or a legal compliance assessment."
  },
  {
    "question": "What happens after you click Reject on AI company websites?",
    "answer": "On 2 of the 10 sites, tracking requests kept firing after a confirmed Reject click: eight non-essential Google requests on one site and two tracking requests on another. The linked reports retain the observations. These results describe the recorded visits and do not establish how every visitor or later visit will behave."
  },
  {
    "question": "How does CertScore.ai scan a website?",
    "answer": "CertScore.ai runs an automated browser scan of a website's public starting page. It observes pre-consent cookies and storage, tracker requests, consent-control behavior, including eligible Accept and Reject clicks, and policy surfaces. No account is needed. The linked report shows the retained observations and any limits on what the scan could assess."
  },
  {
    "question": "Are these findings legal determinations?",
    "answer": "No. The findings are automated observations of public pages, not legal advice, certification, or a compliance determination. A flagged signal identifies something to review against the retained evidence and its context. The scans cover a starting page and a bounded visit, so they do not establish a website's complete behavior."
  },
  {
    "question": "What is CertScore.ai MCP Light?",
    "answer": "CertScore.ai MCP Light is a free, no-auth MCP endpoint that lets AI agents run public website privacy scans from a compatible MCP client, with no OAuth required. You can also run the same type of scan manually in your browser at certscore.ai. Each report shows the observed signals, evidence and coverage limits."
  }
] as const;

const canonicalUrl = "https://certscore.ai/insights/ai-lab-privacy-leaderboard-2026";
const socialImage = "https://certscore.ai/images/social/website-privacy-scanner.png";
const description = "CertScore.ai scanned the public websites of 10 AI companies for privacy signals: pre-consent cookies, trackers, and what happens after Reject. Hugging Face scored highest at 92.";
const schemas = [
  {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: "Privacy signals on 10 AI companies' websites",
    description,
    url: canonicalUrl,
    mainEntityOfPage: { "@type": "WebPage", "@id": canonicalUrl },
    image: [socialImage],
    author: { "@type": "Organization", name: "CertScore.ai", url: "https://certscore.ai" },
    publisher: { "@type": "Organization", name: "CertScore.ai", url: "https://certscore.ai" },
    datePublished: "2026-10-12",
    dateModified: "2026-10-14",
    inLanguage: "en"
  },
  {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: AI_LAB_PRIVACY_STUDY_FAQ.map(({ question, answer }) => ({
      "@type": "Question",
      name: question,
      acceptedAnswer: { "@type": "Answer", text: answer }
    }))
  }
];
const structuredData = schemas.map((schema) =>
  `<script type="application/ld+json">${JSON.stringify(schema).replace(/</g, "\\u003c")}</script>`
).join("\n");
const faqMarkup = AI_LAB_PRIVACY_STUDY_FAQ.map(({ question, answer }) =>
  `<article><h3>${question}</h3><p>${answer}</p></article>`
).join("\n");

export const AI_LAB_PRIVACY_STUDY_HTML = String.raw`<!doctype html>
<html lang="en"><head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="color-scheme" content="light dark">
  <link rel="icon" href="/favicon.png">
  <title>AI Lab Privacy Leaderboard: We Scanned 10 AI Companies' Websites for Privacy Signals | CertScore.ai</title>
  <meta name="description" content="${description}">
  <link rel="canonical" href="https://certscore.ai/insights/ai-lab-privacy-leaderboard-2026">
  <meta property="og:type" content="article">
  <meta property="og:site_name" content="CertScore.ai">
  <meta property="og:url" content="https://certscore.ai/insights/ai-lab-privacy-leaderboard-2026">
  <meta property="og:title" content="AI Lab Privacy Leaderboard: Privacy signals on 10 AI companies' websites | CertScore.ai">
  <meta property="og:description" content="${description}">
  <meta property="og:image" content="https://certscore.ai/images/social/website-privacy-scanner.png">
  <meta property="og:image:type" content="image/png">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="CertScore.ai: website privacy evidence and consent testing">
  <meta property="article:published_time" content="2026-10-12">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="AI Lab Privacy Leaderboard: Privacy signals on 10 AI companies' websites | CertScore.ai">
  <meta name="twitter:description" content="${description}">
  <meta name="twitter:image" content="https://certscore.ai/images/social/website-privacy-scanner.png">
  <meta name="twitter:image:alt" content="CertScore.ai: website privacy evidence and consent testing">
  ${structuredData}
  <style>

    :root {
      --paper: #f4f2ed;
      --surface: #ffffff;
      --ink: #171715;
      --muted: #625f58;
      --line: #d4d0c6;
      --strong-line: #9b978f;
      --accent: #e24a2d;
      --accent-ink: #a42815;
      --blue: #167090;
      --green: #1d7451;
      --amber: #9a6110;
      --soft-red: #f8ded7;
      --soft-green: #d9eee2;
      --soft-blue: #dcecf1;
      --soft-amber: #f1e5c9;
      --shadow: rgba(27, 25, 20, .12);
    }

    @media (prefers-color-scheme: dark) {
      :root {
        --paper: #121311;
        --surface: #1b1d1a;
        --ink: #f2f0ea;
        --muted: #b6b2a8;
        --line: #3a3c37;
        --strong-line: #706f68;
        --accent: #ff765c;
        --accent-ink: #ff9a87;
        --blue: #72c2dd;
        --green: #79cfa6;
        --amber: #e7b966;
        --soft-red: #4a2923;
        --soft-green: #223b2e;
        --soft-blue: #203740;
        --soft-amber: #433620;
        --shadow: rgba(0, 0, 0, .35);
      }
    }

    * { box-sizing: border-box; }
    html { scroll-behavior: smooth; }
    body {
      margin: 0;
      background: var(--paper);
      color: var(--ink);
      font-family: "Libre Franklin", sans-serif;
      line-height: 1.55;
      -webkit-font-smoothing: antialiased;
    }
    a { color: inherit; }
    a:focus-visible, button:focus-visible { outline: 3px solid var(--blue); outline-offset: 3px; }
    .wrap { width: min(1180px, calc(100% - 40px)); margin: 0 auto; }

    .mast {
      padding: 26px 0 22px;
      border-bottom: 1px solid var(--line);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 20px;
    }
    .date, .source-label {
      font-family: "IBM Plex Mono", monospace;
      font-size: 12px;
      letter-spacing: .02em;
      color: var(--muted);
    }
    .source-label strong { color: var(--ink); font-weight: 500; }
    .mini-nav { display: flex; gap: 22px; font-size: 13px; font-weight: 600; }
    .mini-nav a { text-decoration: none; }
    .mini-nav a:hover { color: var(--accent); }

    .hero {
      padding: 70px 0 56px;
      display: grid;
      grid-template-columns: minmax(0, 1.45fr) minmax(250px, .55fr);
      gap: 76px;
      align-items: end;
    }
    .kicker {
      margin: 0 0 20px;
      color: var(--accent-ink);
      font-weight: 700;
      font-size: 14px;
    }
    h1 {
      margin: 0;
      max-width: 820px;
      font-family: "Newsreader", serif;
      font-size: clamp(54px, 8.2vw, 108px);
      font-weight: 650;
      line-height: .89;
      letter-spacing: -.045em;
    }
    .dek {
      margin: 30px 0 0;
      max-width: 720px;
      color: var(--muted);
      font-family: "Newsreader", serif;
      font-size: clamp(22px, 2.7vw, 34px);
      line-height: 1.16;
      letter-spacing: -.015em;
    }
    .hero-note {
      border-top: 3px solid var(--ink);
      padding-top: 17px;
      font-size: 14px;
      color: var(--muted);
    }
    .hero-note strong { color: var(--ink); display: block; font-size: 20px; margin-bottom: 7px; }

    .scoreboard { border-top: 1px solid var(--strong-line); }
    .score-head {
      padding: 18px 0 14px;
      display: grid;
      grid-template-columns: 52px minmax(160px, 1fr) minmax(300px, 2.2fr) 76px 90px;
      gap: 18px;
      color: var(--muted);
      font: 500 11px/1.2 "IBM Plex Mono", monospace;
      letter-spacing: .06em;
      text-transform: uppercase;
      border-bottom: 1px solid var(--strong-line);
    }
    .row {
      display: grid;
      grid-template-columns: 52px minmax(160px, 1fr) minmax(300px, 2.2fr) 76px 90px;
      gap: 18px;
      align-items: center;
      padding: 21px 0;
      border-bottom: 1px solid var(--line);
      text-decoration: none;
      position: relative;
      transition: color .18s ease, background-color .18s ease;
    }
    .row::before {
      content: "";
      position: absolute;
      inset: 0 -14px;
      background: var(--surface);
      opacity: 0;
      z-index: -1;
      transition: opacity .18s ease;
    }
    .row:hover::before { opacity: 1; }
    .rank { font: 500 17px "IBM Plex Mono", monospace; color: var(--muted); }
    .lab { font-size: 19px; font-weight: 700; }
    .domain { display: block; color: var(--muted); font: 12px "IBM Plex Mono", monospace; margin-top: 2px; }
    .finding { color: var(--muted); font-size: 14px; line-height: 1.38; }
    .finding strong { color: var(--ink); font-weight: 650; }
    .bar { height: 8px; background: var(--line); overflow: hidden; }
    .bar span { display: block; height: 100%; background: var(--green); width: var(--w); }
    .row[data-band="watch"] .bar span { background: var(--amber); }
    .row[data-band="concern"] .bar span { background: var(--accent); }
    .score { text-align: right; font: 500 34px/1 "IBM Plex Mono", monospace; letter-spacing: -.06em; }
    .open { grid-column: 2 / -1; text-align: right; font: 12px "IBM Plex Mono", monospace; color: var(--accent-ink); }
    .unscored .score { font-size: 17px; color: var(--muted); letter-spacing: 0; }
    .unscored .bar { background: repeating-linear-gradient(90deg, var(--line), var(--line) 4px, transparent 4px, transparent 8px); }

    .section { padding: 94px 0; border-bottom: 1px solid var(--line); }
    .section-grid { display: grid; grid-template-columns: minmax(220px, .55fr) minmax(0, 1.45fr); gap: 90px; }
    .section h2 {
      margin: 0;
      font-family: "Newsreader", serif;
      font-size: clamp(38px, 5vw, 64px);
      line-height: .96;
      letter-spacing: -.035em;
    }
    .section-intro { color: var(--muted); margin: 18px 0 0; max-width: 280px; font-size: 14px; }
    .story-list { display: grid; }
    .story {
      display: grid;
      grid-template-columns: 54px 1fr;
      gap: 22px;
      padding: 0 0 34px;
      margin-bottom: 34px;
      border-bottom: 1px solid var(--line);
    }
    .story:last-child { margin: 0; border: 0; padding: 0; }
    .story-no { font: 500 14px "IBM Plex Mono", monospace; color: var(--accent-ink); padding-top: 5px; }
    .story h3 { margin: 0 0 9px; font: 650 clamp(23px, 2.8vw, 32px)/1.08 "Newsreader", serif; letter-spacing: -.018em; }
    .story p { margin: 0; color: var(--muted); font-size: 16px; max-width: 700px; }
    .story strong { color: var(--ink); }

    .validation { background: var(--ink); color: var(--paper); padding: 88px 0; }
    .validation .section-grid { align-items: start; }
    .validation h2 { color: var(--paper); }
    .validation .section-intro { color: color-mix(in srgb, var(--paper) 68%, transparent); }
    .proofs { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1px; background: var(--strong-line); border: 1px solid var(--strong-line); }
    .proof { background: var(--ink); padding: 26px; }
    .proof .mark { display: block; font: 500 12px "IBM Plex Mono", monospace; color: #93d5b4; margin-bottom: 32px; }
    .proof h3 { margin: 0 0 8px; font-size: 18px; }
    .proof p { margin: 0; color: color-mix(in srgb, var(--paper) 70%, transparent); font-size: 14px; }
    .proof.limit .mark { color: #f2c475; }

    .method { display: grid; grid-template-columns: 1fr 1fr; gap: 72px; }
    .method h3 { margin: 0 0 18px; font-size: 18px; }
    .method ol { margin: 0; padding: 0; list-style: none; counter-reset: step; }
    .method li { counter-increment: step; position: relative; padding: 0 0 20px 42px; color: var(--muted); }
    .method li::before { content: "0" counter(step); position: absolute; left: 0; top: 1px; font: 500 12px "IBM Plex Mono", monospace; color: var(--accent-ink); }
    .caution { border-top: 3px solid var(--accent); padding-top: 18px; color: var(--muted); }
    .caution strong { color: var(--ink); }

    .cta {
      padding: 86px 0 96px;
      display: grid;
      grid-template-columns: minmax(0, 1.35fr) minmax(280px, .65fr);
      gap: 70px;
      align-items: end;
    }
    .cta h2 { margin: 0; font: 650 clamp(42px, 6vw, 76px)/.98 "Newsreader", serif; letter-spacing: -.035em; }
    .cta p { margin: 20px 0 0; color: var(--muted); max-width: 680px; }
    .button {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 20px;
      padding: 20px 22px;
      background: var(--accent);
      color: #fff;
      text-decoration: none;
      font-weight: 700;
      box-shadow: 0 7px 0 color-mix(in srgb, var(--accent) 70%, #000);
      transition: transform .15s ease, box-shadow .15s ease;
    }
    .button:hover { transform: translateY(2px); box-shadow: 0 5px 0 color-mix(in srgb, var(--accent) 70%, #000); }
    .button span:last-child { font-size: 22px; }
    footer { padding: 28px 0 38px; border-top: 1px solid var(--line); color: var(--muted); font-size: 12px; display: flex; justify-content: space-between; gap: 20px; }

    .hero.article-hero { grid-template-columns: 1fr; gap: 0; align-items: start; max-width: 980px; }
    .leaderboard-heading { margin: 0; padding: 34px 0 18px; font: 650 clamp(36px, 4.5vw, 58px)/1 "Newsreader", serif; letter-spacing: -.03em; border-bottom: 1px solid var(--strong-line); }
    .article-hero h1 { max-width: 970px; font-size: clamp(48px, 7vw, 88px); line-height: .94; }
    .article-hero .kicker { font-style: italic; font-weight: 500; color: var(--muted); }
    .article-hero .dek { max-width: 900px; font-family: "Libre Franklin", sans-serif; font-size: clamp(18px, 2vw, 23px); line-height: 1.48; }
    .method-copy { color: var(--muted); }
    .method-copy p { margin: 0 0 22px; }
    .method-copy ul { margin: 0; padding-left: 22px; }
    .method-copy li { margin: 0 0 15px; padding-left: 5px; }
    .method-copy strong, .method-copy code { color: var(--ink); }
    .fine-print { border-top: 3px solid var(--accent); padding-top: 20px; }
    .fine-print p { margin: 0; color: var(--muted); }
    .fine-print strong { color: var(--ink); }
    .run-grid { display: grid; grid-template-columns: minmax(230px, .55fr) minmax(0, 1.45fr); gap: 90px; }
    .run-copy > p { margin: 0 0 24px; color: var(--muted); }
    .run-links { margin: 0 0 34px; padding-left: 22px; }
    .run-links li { margin-bottom: 10px; }
    .run-links a, .report-list a { color: var(--accent-ink); text-underline-offset: 3px; }
    .report-heading { margin: 0 0 15px; font: italic 500 17px "Newsreader", serif; }
    .report-list { columns: 2; column-gap: 46px; margin: 0; padding-left: 22px; }
    .report-list li { break-inside: avoid; margin: 0 0 12px; color: var(--muted); }

    .key-findings { margin-top: 32px; padding: 24px; border: 1px solid var(--line); background: var(--surface); }
    .key-findings h2 { margin: 0 0 14px; font-size: 22px; line-height: 1.3; }
    .key-findings ul { margin: 0; padding-left: 22px; }
    .key-findings li { padding-left: 4px; margin: 0 0 10px; }
    .key-findings li:last-child { margin-bottom: 0; }
    .run-copy .button { margin: 0 0 28px; background: var(--ink); color: var(--paper); box-shadow: none; }
    .run-copy .button:hover { box-shadow: none; }
    .faq-list { display: grid; gap: 30px; min-width: 0; }
    .faq-list h3 { margin: 0 0 10px; font-size: 20px; line-height: 1.35; }
    .faq-list p { margin: 0; color: var(--muted); font-size: 16px; }

    @media (max-width: 820px) {
      .wrap { width: min(100% - 28px, 680px); }
      .mini-nav { display: none; }
      .mast { padding-top: 18px; }
      .hero { grid-template-columns: 1fr; gap: 38px; padding: 50px 0 44px; }
      h1 { font-size: clamp(54px, 18vw, 82px); }
      .hero-note { max-width: 380px; }
      .score-head { display: none; }
      .row {
        grid-template-columns: 42px 1fr auto;
        gap: 12px;
        padding: 20px 0;
      }
      .lab { grid-column: 2; }
      .score { grid-column: 3; grid-row: 1; }
      .finding { grid-column: 2 / 4; }
      .bar { grid-column: 2 / 4; }
      .open { grid-column: 2 / 4; text-align: left; }
      .rank { grid-row: 1 / 5; align-self: start; padding-top: 3px; }
      .section { padding: 70px 0; }
      .section-grid { grid-template-columns: 1fr; gap: 44px; }
      .section-intro { max-width: 520px; }
      .validation { padding: 70px 0; }
      .method { grid-template-columns: 1fr; gap: 48px; }
      .cta { grid-template-columns: 1fr; gap: 42px; padding: 72px 0 84px; }
      footer { flex-direction: column; }
      .run-grid { grid-template-columns: 1fr; gap: 44px; }
      .report-list { columns: 1; }
    }

    @media (max-width: 520px) {
      .source-label { max-width: 190px; }
      .dek { font-size: 23px; }
      .story { grid-template-columns: 1fr; gap: 8px; }
      .proofs { grid-template-columns: 1fr; }
      .proof .mark { margin-bottom: 20px; }
      .row::before { inset: 0 -7px; }
    }

    @media (prefers-reduced-motion: reduce) {
      html { scroll-behavior: auto; }
      *, *::before, *::after { transition: none !important; }
    }
  </style>
</head>
<body>
  <main>
    <div class="wrap">
      <header class="mast">
        <div class="source-label"><strong>CertScore.ai</strong> · Public website scan</div>
        <nav class="mini-nav" aria-label="Page sections">
          <a href="#leaderboard">Leaderboard</a>
          <a href="#findings">Findings</a>
          <a href="#method">Methodology</a>
          <a href="#validation">Validation</a>
        </nav>
        <div class="date">12 OCT 2026</div>
      </header>

      <section class="hero article-hero">
        <div>
          <p class="kicker">Run with CertScore.ai MCP Light · October 12, 2026</p>
          <h1>Privacy signals on 10 AI companies' websites</h1>
          <p class="dek">We scanned the public starting pages of ten AI companies: OpenAI, Anthropic, Google DeepMind, Meta AI, xAI, Mistral, Perplexity, Cohere, Groq, and Hugging Face. The reports cover cookies and storage set before consent, tracking requests, and activity after a visitor clicks “Reject.” The scores below summarize the observations from those visits.</p>
          <section class="key-findings" aria-labelledby="key-findings-title">
            <h2 id="key-findings-title">Key findings</h2>
            <ul>
              <li>Hugging Face scored highest at 92, with a single minor pre-consent storage observation.</li>
              <li>On 2 of 10 sites, tracking requests kept firing after a confirmed Reject click: 8 non-essential Google requests on one site, 2 on another.</li>
              <li>Pre-consent tracking was common: Google Analytics on Mistral before any click, YouTube cookies on DeepMind via embeds, a Reddit pixel on Groq.</li>
              <li>Findings are automated observations of public pages, not legal advice or compliance determinations.</li>
            </ul>
          </section>
        </div>
      </section>

      <section class="scoreboard" id="leaderboard" aria-labelledby="leaderboard-title">
        <h2 class="leaderboard-heading" id="leaderboard-title">The leaderboard</h2>
        <div class="score-head" aria-hidden="true">
          <span>Rank</span><span>Site</span><span>Signal</span><span>CertScore.ai</span><span></span>
        </div>

        <a class="row" data-band="good" href="https://certscore.ai/scan/cfe74173-c90a-48a7-859d-740b6c823180" target="_blank" rel="noopener">
          <span class="rank">01</span><span class="lab">huggingface.co<span class="domain">Hugging Face</span></span>
          <span class="finding">Only flag: a pre-consent storage item (AWS WAF token, likely security-related)</span>
          <span class="bar" aria-hidden="true"><span style="--w:92%"></span></span><span class="score">92</span><span class="open">View report ↗</span>
        </a>
        <a class="row" data-band="good" href="https://certscore.ai/scan/e3e7cb02-84dc-48fb-974a-ef63fb965e8b" target="_blank" rel="noopener">
          <span class="rank">02</span><span class="lab">meta.ai<span class="domain">Meta AI</span></span>
          <span class="finding">Pre-consent storage flag; otherwise clean</span>
          <span class="bar" aria-hidden="true"><span style="--w:89%"></span></span><span class="score">89</span><span class="open">View report ↗</span>
        </a>
        <a class="row" data-band="good" href="https://certscore.ai/scan/358ac0fd-afba-4d17-aa0e-dc8817f9543e" target="_blank" rel="noopener">
          <span class="rank">03</span><span class="lab">anthropic.com<span class="domain">Anthropic</span></span>
          <span class="finding">Decline/reject control only partially supported in testing</span>
          <span class="bar" aria-hidden="true"><span style="--w:81%"></span></span><span class="score">81</span><span class="open">View report ↗</span>
        </a>
        <a class="row" data-band="watch" href="https://certscore.ai/scan/91cbeb92-2d29-474b-b60c-86d767f5caeb" target="_blank" rel="noopener">
          <span class="rank">04</span><span class="lab">x.ai<span class="domain">xAI</span></span>
          <span class="finding">Pre-consent storage; uses OneTrust consent tooling</span>
          <span class="bar" aria-hidden="true"><span style="--w:80%"></span></span><span class="score">80</span><span class="open">View report ↗</span>
        </a>
        <a class="row" data-band="watch" href="https://certscore.ai/scan/1f05c7e0-6ade-4448-a965-4e1de903cace" target="_blank" rel="noopener">
          <span class="rank">05</span><span class="lab">cohere.com<span class="domain">Cohere</span></span>
          <span class="finding"><strong>8 non-essential Google requests fired 7+ seconds after a confirmed Reject</strong></span>
          <span class="bar" aria-hidden="true"><span style="--w:77%"></span></span><span class="score">77</span><span class="open">View report ↗</span>
        </a>
        <a class="row" data-band="watch" href="https://certscore.ai/scan/14324058-98b5-4981-9f9c-cf5a76fb78d8" target="_blank" rel="noopener">
          <span class="rank">06</span><span class="lab">openai.com<span class="domain">OpenAI</span></span>
          <span class="finding"><strong>2 tracking requests (incl. Cloudflare) began after the Reject click</strong></span>
          <span class="bar" aria-hidden="true"><span style="--w:75%"></span></span><span class="score">75</span><span class="open">View report ↗</span>
        </a>
        <a class="row" data-band="watch" href="https://certscore.ai/scan/9b1badef-048a-494e-88f5-0827d2a5e529" target="_blank" rel="noopener">
          <span class="rank">07</span><span class="lab">groq.com<span class="domain">Groq</span></span>
          <span class="finding">Pre-consent tracking incl. Reddit pixel and PostHog</span>
          <span class="bar" aria-hidden="true"><span style="--w:71%"></span></span><span class="score">71</span><span class="open">View report ↗</span>
        </a>
        <a class="row" data-band="concern" href="https://certscore.ai/scan/4ae8cca1-0b70-46b6-9ece-8f5d1dc8fb53" target="_blank" rel="noopener">
          <span class="rank">08</span><span class="lab">mistral.ai<span class="domain">Mistral</span></span>
          <span class="finding">Google Analytics fired pre-consent; no reject option on the first consent layer</span>
          <span class="bar" aria-hidden="true"><span style="--w:62%"></span></span><span class="score">62</span><span class="open">View report ↗</span>
        </a>
        <a class="row" data-band="concern" href="https://certscore.ai/scan/860c6f2d-7f46-4c66-8451-51e3f7405658" target="_blank" rel="noopener">
          <span class="rank">09</span><span class="lab">deepmind.google<span class="domain">Google DeepMind</span></span>
          <span class="finding">YouTube embeds set cookies pre-consent; heaviest deduction set in the group</span>
          <span class="bar" aria-hidden="true"><span style="--w:59%"></span></span><span class="score">59</span><span class="open">View report ↗</span>
        </a>
        <a class="row unscored" href="https://certscore.ai/scan/a9992491-9bf5-480a-a999-f85017d65f13" target="_blank" rel="noopener">
          <span class="rank">n/a</span><span class="lab">Perplexity, not scored.<span class="domain">perplexity.ai</span></span>
          <span class="finding">Limited coverage on this run, no score produced.</span>
          <span class="bar" aria-hidden="true"></span><span class="score" aria-hidden="true"></span><span class="open">View report ↗</span>
        </a>
      </section>

      <section class="section" id="findings">
        <div class="section-grid">
          <div>
            <h2>Findings</h2>
          </div>
          <div class="story-list">
            <article class="story"><span class="story-no">01</span><div><h3>Hugging Face had the highest score.</h3><p>Hugging Face scored 92. Its report flagged one pre-consent storage item, an AWS WAF token described as likely security-related.</p></div></article>
            <article class="story"><span class="story-no">02</span><div><h3>Tracking requests after Reject clicks.</h3><p>On cohere.com, eight non-essential Google requests were observed more than seven seconds <em>after</em> a confirmed Reject click. On openai.com, two tracking requests began just under a second after Reject. Under GDPR/ePrivacy logic, a refusal should suppress optional tracking. The reports describe both as “partial concern” / “potential gap” findings. These are observations from the recorded visits, not legal verdicts.</p></div></article>
            <article class="story"><span class="story-no">03</span><div><h3>Pre-consent tracking.</h3><p>Mistral's site fired Google Analytics before any consent interaction, and its banner didn't offer reject on the first layer. DeepMind's pages set YouTube cookies (<code>__Secure-ROLLOUT_TOKEN</code>) before consent via embeds. Groq's pre-consent inventory included a Reddit pixel.</p></div></article>
            <article class="story"><span class="story-no">04</span><div><h3>All nine scored sites had review notes.</h3><p>Scores ranged from 59 to 92. All nine scored sites had something flagged for review, mostly storage set before consent where essentiality could not be confirmed.</p></div></article>
          </div>
        </div>
      </section>

      <section class="section" id="method">
        <div class="section-grid">
          <div><h2>Methodology</h2></div>
          <div class="method-copy">
            <ul>
              <li>Each site was scanned with <strong>CertScore.ai MCP Light</strong> (free, no-auth endpoint), <code>tracking_check</code> purpose, on October 12, 2026, from the EU-IE region.</li>
              <li>Scans cover the public starting page: pre-consent cookies/storage, tracker requests, consent-control behavior including eligible Accept/Reject click observations, and policy surfaces.</li>
              <li>Scores follow CertScore.ai's <code>overall-posture</code> scoring policy (base 100 minus policy deductions). Most runs completed with <strong>partial coverage</strong> (<code>completed_limited</code>), automated single-page scans, not full-site audits.</li>
              <li>Perplexity.ai could not be scored on this run due to limited coverage; that's a measurement limitation, not a judgment.</li>
            </ul>
          </div>
        </div>
      </section>
    </div>

    <section class="validation" id="validation">
      <div class="wrap section-grid">
        <div>
          <h2>HTTP cross-check</h2>
          <p class="section-intro">To check the scanner's work, we re-verified the headline signals without touching CertScore.ai: fresh, cookie-less HTTP fetches of each homepage (no JavaScript, no consent interaction), inspecting response <code>Set-Cookie</code> headers and the raw HTML for tracker/CMP signatures.</p>
        </div>
        <div class="proofs">
          <article class="proof"><span class="mark">7 OF 10</span><h3>Vendor presence confirmed</h3><p>The HTML shows YouTube embeds on deepmind.google, Axeptio on mistral.ai, OneTrust on x.ai, CookieYes on cohere.com, PostHog on groq.com, Stripe on huggingface.co, and Webflow + CloudFront on anthropic.com, matching the vendors CertScore.ai reported.</p></article>
          <article class="proof"><span class="mark">EXACT COOKIE MATCH</span><h3>x.ai</h3><p><code>gb_anon_id</code> is set on the very first HTTP response, before any consent is possible, the same cookie CertScore.ai flagged as its first retained pre-consent item.</p></article>
          <article class="proof"><span class="mark">MECHANISM CHECK</span><h3>JavaScript timing</h3><p>Most flagged cookies don't appear in response headers at all; they're set by JavaScript seconds after load, consistent with CertScore.ai's “first observed N seconds after scan start” timings.</p></article>
          <article class="proof limit"><span class="mark">LIMITS</span><h3>Post-Reject behavior</h3><p>Post-Reject behavior (the cohere.com and openai.com findings) can't be validated without driving consent clicks in a real browser, so that part rests on CertScore.ai's evidence alone. openai.com and meta.ai block plain-HTTP fetching with bot challenges, so their HTML couldn't be independently inspected either.</p></article>
        </div>
      </div>
    </section>

    <div class="wrap">
      <section class="section">
        <div class="section-grid">
          <div><h2>Reading the results</h2><p class="section-intro">Please keep this attached to any republication.</p></div>
          <div class="fine-print"><p>These are <strong>automated observations of public web pages</strong>, not legal advice, certification, or a determination of compliance. A flagged signal means “worth a human look,” not “violation.” Sites change constantly. Rescan before citing.</p></div>
        </div>
      </section>

      <section class="section" id="run-your-own">
        <div class="run-grid">
          <div><h2>Run your own</h2></div>
          <div class="run-copy">
            <a class="button" href="https://certscore.ai">Put your own site on the scanner. Check your privacy posture.</a>
            <p>Every scan above links to a full evidence report. You can request the same check for a public website without an account:</p>
            <ul class="run-links">
              <li><strong>Scan your site:</strong> <a href="https://certscore.ai" target="_blank" rel="noopener">https://certscore.ai</a></li>
              <li><strong>For AI agents:</strong> <a href="https://certscore.ai/mcp/light">CertScore.ai MCP Light</a> works with any MCP client, no OAuth required.</li>
            </ul>
            <h3 class="report-heading">Individual scan reports:</h3>
            <ul class="report-list">
              <li><a href="https://certscore.ai/scan/cfe74173-c90a-48a7-859d-740b6c823180" target="_blank" rel="noopener">Hugging Face (92)</a></li>
              <li><a href="https://certscore.ai/scan/e3e7cb02-84dc-48fb-974a-ef63fb965e8b" target="_blank" rel="noopener">Meta AI (89)</a></li>
              <li><a href="https://certscore.ai/scan/358ac0fd-afba-4d17-aa0e-dc8817f9543e" target="_blank" rel="noopener">Anthropic (81)</a></li>
              <li><a href="https://certscore.ai/scan/91cbeb92-2d29-474b-b60c-86d767f5caeb" target="_blank" rel="noopener">xAI (80)</a></li>
              <li><a href="https://certscore.ai/scan/1f05c7e0-6ade-4448-a965-4e1de903cace" target="_blank" rel="noopener">Cohere (77)</a></li>
              <li><a href="https://certscore.ai/scan/14324058-98b5-4981-9f9c-cf5a76fb78d8" target="_blank" rel="noopener">OpenAI (75)</a></li>
              <li><a href="https://certscore.ai/scan/9b1badef-048a-494e-88f5-0827d2a5e529" target="_blank" rel="noopener">Groq (71)</a></li>
              <li><a href="https://certscore.ai/scan/4ae8cca1-0b70-46b6-9ece-8f5d1dc8fb53" target="_blank" rel="noopener">Mistral (62)</a></li>
              <li><a href="https://certscore.ai/scan/860c6f2d-7f46-4c66-8451-51e3f7405658" target="_blank" rel="noopener">DeepMind (59)</a></li>
              <li><a href="https://certscore.ai/scan/a9992491-9bf5-480a-a999-f85017d65f13" target="_blank" rel="noopener">Perplexity (not scored)</a></li>
            </ul>
          </div>
        </div>
      </section>

      <section class="section" id="faq" aria-labelledby="faq-title">
        <div class="section-grid">
          <div><h2 id="faq-title">FAQ</h2></div>
          <div class="faq-list">
            ${faqMarkup}
          </div>
        </div>
      </section>

      <footer>
        <span>Run with CertScore.ai MCP Light · October 12, 2026</span>
        <span>Republishing &amp; other inquiries: <a href="mailto:support@certscore.ai">support@certscore.ai</a></span>
        <span>10 public websites · 9 scored · 1 limited</span>
      </footer>
    </div>
  </main>


</body></html>`;
