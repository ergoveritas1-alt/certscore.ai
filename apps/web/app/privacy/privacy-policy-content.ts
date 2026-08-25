export type PrivacyPolicySection = {
  body: string[];
  link?: {
    href: string;
    label: string;
  };
  title: string;
};

export const CERTSCORE_PRIVACY_POLICY_SECTIONS = [
  {
    title: "1. Overview",
    body: [
      "This Privacy Policy describes how CertScore.ai collects, uses, stores, and retains information when you use certscore.ai and the CertScore.ai service.",
      "CertScore.ai is the controller of personal data described in this policy unless this policy states otherwise. Contact the controller at privacy@certscore.ai."
    ]
  },
  {
    title: "2. Account And Submitted Information",
    body: [
      "We may collect information you provide directly, such as your email address, name, authentication details, submitted domains, scan settings, selected plan, and account preferences."
    ]
  },
  {
    title: "3. Usage And Operational Data",
    body: [
      "We may collect technical information needed to operate the service, such as authentication events, usage logs, scan status events, browser metadata, and product interaction data."
    ]
  },
  {
    title: "4. Website Scan Data",
    body: [
      "CertScore.ai analyzes publicly accessible website content using automated systems and rule-based checks. We may retain scan metadata, derived signals, counts, booleans, timestamps, evidence URLs, change history, and limited policy or disclosure excerpts when needed to support analysis, review, remediation, and evidence context. We do not describe the service as an archive of full websites or complete policy text bodies."
    ]
  },
  {
    title: "5. Purposes Of Processing Personal Data",
    body: [
      "Processing purposes: CertScore.ai processes personal data and service data for account administration, authentication, scan and report delivery, monitoring, customer support, billing, security, fraud and abuse prevention, product reliability, optional analytics after consent, legal or business recordkeeping, and responding to privacy requests.",
      "CertScore.ai may process account and submitted information to create and manage accounts, authenticate users, provide scans and reports, manage plans, respond to requests, send service messages, and operate customer support.",
      "CertScore.ai may process usage and operational data to run the service, secure accounts, debug errors, monitor scan status, improve product reliability, measure product usage after optional analytics consent, prevent abuse, and maintain business records.",
      "CertScore.ai may process public website scan data to generate evidence-led reports, support remediation review, preserve limited evidence context, compare changes over time, and operate monitoring or validation workflows requested by users."
    ]
  },
  {
    title: "6. Legal Basis For Processing Personal Data",
    body: [
      "Legal basis for processing personal data: CertScore.ai relies on performance of a contract when processing is needed to create or manage an account, authenticate a user, provide requested scans and reports, administer a paid plan, or respond to service requests.",
      "CertScore.ai relies on legitimate interests to secure the service, prevent fraud and abuse, maintain reliability, diagnose errors, provide customer support, and improve the service, where those interests are not overridden by the rights and interests of affected individuals.",
      "CertScore.ai relies on consent for optional analytics and session-insight tools where consent is requested, and on legal obligations when processing or retaining records is required by applicable law. Consent may be withdrawn through Cookie preferences without affecting processing that occurred before withdrawal."
    ]
  },
  {
    title: "7. Third-Party Service Providers And Recipients",
    body: [
      "Recipients of personal data may include third-party infrastructure and service providers that receive or process information on our behalf. These recipient and provider categories include cloud hosting, PostgreSQL-compatible database hosting, S3-compatible object storage, job processing, email delivery, payment and subscription processing, authentication, analytics, security, and operational monitoring.",
      "Current provider examples include AWS for hosting and infrastructure, Stripe for payment and subscription processing, Gmail SMTP where applicable for email delivery, Google Analytics for optional website analytics, and Microsoft Clarity for optional session-insight analysis. Provider use may vary by feature, account state, and operational configuration.",
      "These providers process data to operate, secure, troubleshoot, measure, bill for, or support the CertScore.ai service. CertScore.ai does not describe service-provider access alone as a sale of personal information."
    ]
  },
  {
    title: "8. Payments And Subscription Records",
    body: [
      "Payment card details are handled by Stripe rather than stored directly by CertScore.ai. CertScore.ai may retain Stripe customer identifiers, subscription identifiers, plan status, invoice or checkout status, billing event metadata, and related operational records needed to provide paid plans, support cancellation, reconcile payments, prevent fraud, and maintain business records."
    ]
  },
  {
    title: "9. Cookies, Analytics, And Session-Insight Tools",
    body: [
      "CertScore.ai uses cookies and similar technologies to operate the service, maintain sessions, remember preferences, protect accounts, and understand usage.",
      "Optional analytics and session-insight tools, including Google Analytics and Microsoft Clarity, are intended to run only after analytics consent is allowed. Microsoft Clarity is configured with masking intended to avoid intentionally collecting sensitive form inputs or private report content.",
      "Users can reject optional analytics from the consent surface and can review, change, or withdraw analytics consent from the Cookie preferences link in the site footer."
    ]
  },
  {
    title: "10. International Transfers Of Personal Data",
    body: [
      "International transfers of personal data may occur because CertScore.ai is operated from the United States and uses service providers that may process information in the United States and other countries.",
      "Where personal information is transferred across borders, CertScore.ai reviews the contractual, security, privacy, and transfer commitments made by the relevant provider. Cross-border processing may occur for hosting, storage, payment processing, email delivery, analytics, support, security, and other operational purposes described in this policy."
    ]
  },
  {
    title: "11. Data Retention",
    body: [
      "We retain personal data only for as long as necessary for the purposes described in this policy. The criteria used to determine a retention period include account status, plan limits, configured retention settings, service-delivery needs, and applicable legal, security, billing, audit, fraud-prevention, and dispute-resolution requirements."
    ]
  },
  {
    title: "12. Your Privacy Rights",
    body: [
      "Depending on where you live, you may request access, correction, deletion, restriction, portability, or objection in relation to your personal data, and may have rights to withdraw consent or exercise certain opt-outs. CertScore.ai provides a public privacy request form at certscore.ai/privacy-request and also accepts requests sent to privacy@certscore.ai."
    ]
  },
  {
    title: "13. Supervisory Authority Complaints",
    body: [
      "Where the GDPR applies, you have the right to lodge a complaint with a supervisory authority, including the competent authority in the country where you live, work, or believe a data-protection infringement occurred.",
      "The European Data Protection Board publishes an official directory of European data-protection supervisory authorities."
    ],
    link: {
      href: "https://www.edpb.europa.eu/about-edpb/our-members_en",
      label: "European Data Protection Board supervisory-authority directory"
    }
  },
  {
    title: "14. Automated Decision-Making And Profiling",
    body: [
      "CertScore.ai uses automated systems and rule-based checks to analyze public websites and generate website risk-signal reports. These reports are not decisions about individuals.",
      "CertScore.ai does not use personal data for profiling or make decisions based solely on automated processing that produce legal or similarly significant effects for individuals."
    ]
  },
  {
    title: "15. Security",
    body: [
      "We use reasonable technical and operational measures to protect account and scan data, but no system can guarantee absolute security."
    ]
  },
  {
    title: "16. Changes To This Policy",
    body: [
      "We may update this Privacy Policy from time to time. Material changes will be reflected on this page with updated content."
    ]
  },
  {
    title: "17. Privacy Contact Point",
    body: [
      "Privacy contact point: for privacy-related questions, data-protection questions, or privacy rights requests, contact CertScore.ai at privacy@certscore.ai or use the privacy request form linked from this policy and the site footer.",
      "This privacy and data-protection contact point handles privacy questions and rights requests for the CertScore.ai service."
    ]
  }
] satisfies PrivacyPolicySection[];

export function getCertScorePrivacyPolicyText() {
  return CERTSCORE_PRIVACY_POLICY_SECTIONS
    .flatMap((section) => [section.title, ...section.body])
    .join(" ");
}
