import { notFound } from "next/navigation";
import { GDPR_TRANSPARENCY_CANARY_COPY, isGdprTransparencyCanaryLocale } from "../content";

export default async function GdprTransparencyCanaryLanding({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isGdprTransparencyCanaryLocale(locale)) notFound();
  const copy = GDPR_TRANSPARENCY_CANARY_COPY[locale];

  return (
    <main lang={copy.language} dir={locale === "ar" ? "rtl" : "ltr"} className="mx-auto max-w-3xl px-6 py-16">
      <p>CertScore owned GDPR Transparency calibration canary.</p>
      <h1 className="mt-4 text-3xl font-semibold">{copy.title}</h1>
      <p className="mt-6">
        <a className="underline" href={`/calibration/gdpr-transparency/${locale}/privacy`}>{copy.privacyLabel}</a>
      </p>
    </main>
  );
}
