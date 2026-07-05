import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "../../lib/seo";

export function BaseStructuredData() {
  const schema = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@id": `${SITE_URL}#organization`,
        "@type": "Organization",
        name: SITE_NAME,
        url: SITE_URL,
        logo: `${SITE_URL}/certscore-header-logo.png`
      },
      {
        "@id": `${SITE_URL}#website`,
        "@type": "WebSite",
        name: SITE_NAME,
        url: SITE_URL,
        description: SITE_DESCRIPTION,
        publisher: { "@id": `${SITE_URL}#organization` }
      }
    ]
  };

  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />;
}
