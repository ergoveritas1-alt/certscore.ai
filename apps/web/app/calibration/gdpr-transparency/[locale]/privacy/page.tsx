import { notFound } from "next/navigation";
import {
  buildGdprTransparencyCanaryPolicyParagraphs,
  GDPR_TRANSPARENCY_CANARY_COPY,
  isGdprTransparencyCanaryLocale,
} from "../../content";

export default async function GdprTransparencyCanaryPolicy({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isGdprTransparencyCanaryLocale(locale)) notFound();
  const copy = GDPR_TRANSPARENCY_CANARY_COPY[locale];

  return (
    <main lang={copy.language} dir={locale === "ar" ? "rtl" : "ltr"} className="mx-auto max-w-3xl px-6 py-16">
      <p>CertScore owned GDPR Transparency calibration canary.</p>
      <h1 className="mt-4 text-3xl font-semibold">{copy.title}</h1>
      <article className="mt-8 space-y-6 text-base leading-8">
        {buildGdprTransparencyCanaryPolicyParagraphs(locale).map((paragraph, index) => (
          <p key={`${index}-${paragraph.slice(0, 24)}`}>{paragraph}</p>
        ))}
      </article>
    </main>
  );
}
