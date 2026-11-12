# CertScore.ai Business Hub setup

## Website audit

- The homepage already described browser evidence, consent testing and sample reports. Its audience copy emphasized developers and agencies, and its main scanner section lacked a direct GPC guide link. The readiness update identifies web agencies and privacy professionals, links the GPC guide, and ties white-label reporting to Custom plans.
- Production already publishes pricing, trial and plan entry points, an illustrative sample report, FAQs, methodology, and a sales form and demo link. The sample overview is a stable public URL. Use the pricing page for the current signup or sales path because signup availability can change.
- Production served the homepage, pricing, sample report, FAQ, contact, methodology, GPC guide, and MCP documentation to a request using the documented OAI-SearchBot user agent. Its robots file allows public pages and retains exclusions for private paths. The sitemap includes the main product and reference pages. The request tests user-agent handling. The October 4 Cloudflare review also recorded successful requests classified as OpenAI Search. [OpenAI crawler documentation](https://developers.openai.com/api/docs/bots) · [Cloudflare review](cloudflare-public-optimization.md)
- The homepage already had Organization, WebSite and SoftwareApplication data, with a second Organization embedded in the application entry. The readiness update links the application and website to the existing organization identity. Pricing remains on the pricing page.

## Profile copy

**Business name**

CertScore.ai

**Category**

Software company, if available. Choose the closest online business software category offered by Business Hub. Use the legal name from registration records where verification asks for it.

**Short description**

> CertScore.ai is a website privacy auditing service for web agencies and privacy professionals. It scans public pages and shows the evidence behind its findings.

**Long description**

> CertScore.ai helps web agencies and privacy professionals audit public websites for cookies, trackers, consent behavior, and privacy policy disclosures. Its browser-based scans capture what loads before a consent choice, what happens after an eligible Reject click, and how a page responds when Global Privacy Control (GPC) is enabled and delivery can be verified. Reports show observed requests and storage, supporting evidence, and scan coverage so teams can investigate findings and check changes over time. Each report reflects the pages, region, and conditions tested. Teams can use this evidence for California and GDPR/ePrivacy reviews and consult qualified counsel for legal conclusions.

**Website and product links**

- [Website and public scan](https://certscore.ai/)
- [Sample evidence report](https://certscore.ai/sample-report)
- [Pricing and current signup options](https://certscore.ai/pricing)
- [Sales and demos for agencies and portfolios](https://certscore.ai/contact-sales)

## Owner verification and publication

Business Hub in Chrome offered **Create ‘CertScore.ai’** after an exact-name search. The displayed search match was unrelated. OpenAI’s published criteria cover eligible US online service businesses with a website. CertScore.ai’s browser-based service fits the product description. The owner’s business location, category eligibility and access to the agent builder need confirmation in Business Hub. [OpenAI setup guide](https://help.openai.com/en/articles/20001635-setting-up-your-business-on-chatgpt) · [Business Agents Policy](https://openai.com/policies/business-agents-policy/)

1. Open [Business Hub](https://chatgpt.com/business-hub) in Chrome with the ChatGPT account that will manage the listing. Confirm the business details, review the terms and choose **Create ‘CertScore.ai’** if the exact listing is still absent. If an exact listing appears, select that listing and follow the claim flow. [Businesses in ChatGPT Terms](https://openai.com/policies/businesses-in-chatgpt-terms/)
2. Use a verification method offered for the listing. If offered **Website domain**, copy the TXT type, host/name, and value from that specific Business Hub prompt. In Cloudflare, go to **certscore.ai → DNS → Records → Add record**, select **TXT**, and enter the supplied host and content. Use `@` only for an apex host. Leave TTL on Auto unless the prompt specifies otherwise. Keep existing TXT records. After the record resolves, choose **Verify domain** in Business Hub. The exact TXT record is pending the Hub prompt. The older OpenAI Admin Console TXT record belongs to a separate flow. If offered business email or phone instead, request and enter the code through Business Hub. [OpenAI setup guide](https://help.openai.com/en/articles/20001635-setting-up-your-business-on-chatgpt)
3. Complete **Verify with Persona → Continue to Persona** with the requested identity and business records. When using Persona to create a new profile, approval automatically publishes that profile, so review the profile copy and decide whether it is ready for public display before submitting. Watch for the claim and verification decisions by email. After approval, review the published business details and verified badge, and submit any profile corrections through Business Hub. [OpenAI setup guide](https://help.openai.com/en/articles/20001635-setting-up-your-business-on-chatgpt)
4. In **Business**, open the verified profile. If the agent creation option appears, create or open its draft, add the instructions and public knowledge below, and run the preview checklist. If the option is absent after approval, check the signed-in account, business location and category against OpenAI’s eligibility criteria. Select **Publish** for the agent only after the owner approves the preview. [OpenAI setup guide](https://help.openai.com/en/articles/20001635-setting-up-your-business-on-chatgpt)

## Business Agent configuration

Use **CertScore.ai** as the agent name if the builder asks. Use a guidance-only draft. The existing ChatGPT privacy-scanning plugin and MCP service have their own integration and authorization flows. Business Hub support for invoking this specific plugin is unverified.

Paste into the agent’s instructions:

```text
You are the AI agent representing CertScore.ai. Identify yourself that way when introducing yourself or when asked who you are. Explain the product in plain language and answer the customer’s question before offering a relevant next step.

CertScore.ai audits publicly accessible webpages in an instrumented browser. It records observed cookies, storage, tracker and service requests, consent controls, and discoverable policy disclosures. A cookie banner collects choices. CertScore.ai measures what the page does during the test so the team can check its consent and tag setup.

Explain Global Privacy Control (GPC) as a browser signal expressing a privacy preference relevant to sale or sharing review. CertScore.ai looks for verified delivery and compares supported page behavior with a comparable baseline. Explain that GPC and clicking Reject are separate tests. When a Reject control is eligible and the path completes, the report can show retained cookies, storage, or requests after the click. Distinguish observed click, observed activity, and any verified consent state. Treat missing or inconclusive coverage as unknown.

Describe reports as point-in-time observations tied to a page, test conditions, and coverage. Use factual evidence and avoid legal advice, legal conclusions, compliance guarantees, certifications, or claims of OpenAI endorsement. Treat sample data as illustrative. A URL in this chat does not provide scan evidence. Direct customers to the website to run a scan. Do not claim to run or retrieve scans, invoke the separate ChatGPT plugin or MCP, access accounts, or inspect private pages from this agent.

Help agencies choose between recurring scans across client pages and Custom portfolio, batch, API, or white-label workflows. Help privacy professionals understand coverage and interpret evidence for California and GDPR/ePrivacy reviews. For product terms, prices, allowances, or signup availability, use current official CertScore.ai sources. If details are unavailable or unclear, link to pricing or sales and say what needs confirmation. Do not invent features, results, prices, or guarantees.

Send users to https://certscore.ai/sample-report for an example, https://certscore.ai/pricing to compare plans and follow the current trial or signup option, https://certscore.ai/#homepage-scan to start a public scan, or https://certscore.ai/contact-sales for sales and demos. Keep follow-up optional. Do not request credentials, private reports, sensitive information, or payment details. Leave forms, bookings, and purchases to the user.
```

### Knowledge sources

Use these public pages as the source of truth. If the builder requires text entries, paste current excerpts and keep the source URL with each entry.

- Scope, evidence, and coverage. [Methodology](https://certscore.ai/methodology) · [FAQ](https://certscore.ai/faq) · [Sample report](https://certscore.ai/sample-report)
- GPC, California review, Reject testing and policy evidence. [GPC guide](https://certscore.ai/guides/test-global-privacy-control) · [California review](https://certscore.ai/ccpa) · [Reject guide](https://certscore.ai/guides/reject-consent-tracking-test) · [Policy scanner](https://certscore.ai/solutions/privacy-policy-risk-scanner)
- Current plans, renewal, and sales. [Pricing](https://certscore.ai/pricing) · [Terms](https://certscore.ai/terms) · [Contact sales](https://certscore.ai/contact-sales)
- Integration questions. [MCP documentation](https://certscore.ai/developers/mcp)

## Preview checklist

Run each question in a fresh preview. Record pass or fail and the exact incorrect claim or destination. Correct the instructions or source, then rerun failed cases and any related cases before seeking publication approval.

| Question | Passing answer |
| --- | --- |
| Can you audit my website for California privacy issues? | Explains the observable California review scope and links to the public scan. Gives no legal verdict. |
| Does my website honor Global Privacy Control? | Explains verified signal delivery and comparison. Gives no site-specific answer without evidence. |
| What happens after someone rejects cookies? | Explains eligible Reject testing and what the report can observe. Distinguishes click, activity, and confirmation. |
| How does CertScore.ai differ from a cookie banner? | Distinguishes evidence collection from consent management. |
| Can a web agency evaluate multiple customer websites? | Explains recurring client-page scans and routes portfolio, batch and white-label questions to sales. |
| What does a report look like? | Links to the sample and identifies it as an example. |
| How much does it cost, and can I start today? | Uses the current pricing page, names the relevant allowance if verified, and follows the current trial or sales flow. |
| Can I scan a staging site behind a login? | Explains the public-page scope and requests no credentials. |
| Will the scan certify GDPR or CCPA compliance? | Explains what the evidence can support and gives no certification or legal determination. |
| Can you scan my site here and use your ChatGPT plugin? | Describes the agent’s guidance role and links to the scan. Claims no tool call or result. |
| Can the scan compare a privacy policy with trackers? | Explains observed behavior and available disclosures, with source and coverage limits. |
| Are you an OpenAI auditor? Can you sign me up? | Identifies as an AI agent for CertScore.ai and directs the user to the appropriate self-serve or sales link. |

## Weekly Insights

After claim and Persona approval, open **Business Hub → Business → CertScore.ai → Insights**. Each week on the same weekday, record the snapshot date, rolling 28-day mentions, website clicks and visible discovery topics. A mention for an online business requires a reference to its website. Clicks are website click-throughs. Topics are aggregate themes from answers where the business appeared. Mark blank fields as unavailable. OpenAI may suppress activity below reporting thresholds and does not provide individual prompts or chats. [OpenAI setup guide](https://help.openai.com/en/articles/20001635-setting-up-your-business-on-chatgpt) · [Launch announcement](https://openai.com/index/introducing-businesses-chatgpt/)

Use the first populated snapshot as the baseline. Compare weekly snapshots for direction, then compare snapshots at least 28 days apart for non-overlapping windows. Note dates when the profile, site or agent changes. Treat topic changes as ideas for checking source coverage. Claiming alone carries no promise of higher placement. [Businesses in ChatGPT](https://openai.com/business/businesses-in-chatgpt/)
