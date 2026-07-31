import { notFound } from "next/navigation";
import {
  CONSENT_CONTROL_CANARY_EXPECTATIONS,
  CONSENT_CONTROL_CANARY_LABELS,
  CONSENT_CONTROL_CANARY_VARIANTS,
  isConsentControlCanaryVariant,
} from "../content";

export const dynamic = "force-static";
export const dynamicParams = false;
export const revalidate = false;

export function generateStaticParams() {
  return CONSENT_CONTROL_CANARY_VARIANTS.map((variant) => ({ variant }));
}

function codePoints(value: string): number[] {
  return [...value].map((character) => character.codePointAt(0) ?? 0);
}

function delayedBannerScript(labels: { accept: string; context: string; options: string; reject: string; title: string }, mode: "delayed" | "shadow_dom") {
  const labelCodes = {
    accept: codePoints(labels.accept),
    context: codePoints(labels.context),
    options: codePoints(labels.options),
    reject: codePoints(labels.reject),
    title: codePoints(labels.title),
  };
  const controls = JSON.stringify({
    accept: labelCodes.accept,
    context: labelCodes.context,
    options: labelCodes.options,
    reject: mode === "shadow_dom" ? labelCodes.reject : labelCodes.reject,
    title: labelCodes.title,
  });
  return `
    (() => {
      const data = ${controls};
      const text = (codes) => String.fromCodePoint(...codes);
      const build = (target) => {
        const dialog = document.createElement("section");
        dialog.setAttribute("role", "dialog");
        dialog.setAttribute("aria-modal", "true");
        dialog.setAttribute("aria-label", text(data.title));
        dialog.style.cssText = "position:fixed;left:24px;right:24px;bottom:24px;z-index:9999;max-width:760px;padding:24px;background:#fff;color:#111;border:2px solid #111;box-shadow:0 8px 28px rgba(0,0,0,.2)";
        const paragraph = document.createElement("p");
        paragraph.textContent = text(data.context);
        dialog.appendChild(paragraph);
        for (const codes of [data.reject, data.options, data.accept]) {
          const button = document.createElement("button");
          button.type = "button";
          button.textContent = text(codes);
          button.style.cssText = "margin-right:8px;padding:8px 12px";
          dialog.appendChild(button);
        }
        target.appendChild(dialog);
      };
      setTimeout(() => {
        const host = document.querySelector("[data-consent-canary-root]");
        if (!host) return;
        ${mode === "shadow_dom"
          ? "const shadow = host.attachShadow({ mode: \"open\" }); build(shadow);"
          : "build(host);"}
      }, 1400);
    })();
  `;
}

export default async function ConsentControlCanaryPage({ params }: { params: Promise<{ variant: string }> }) {
  const { variant } = await params;
  if (!isConsentControlCanaryVariant(variant)) notFound();

  const expectation = CONSENT_CONTROL_CANARY_EXPECTATIONS[variant];
  const localized = variant === "localized-de";
  const labels = localized ? CONSENT_CONTROL_CANARY_LABELS.de : CONSENT_CONTROL_CANARY_LABELS.en;
  const isDynamic = expectation.renderMode !== "direct";

  return (
    <main
      lang={expectation.locale}
      data-consent-canary-variant={variant}
      className="min-h-screen bg-slate-50 px-6 py-16 text-slate-950"
    >
      <div className="mx-auto max-w-3xl">
        <p className="text-sm font-medium">CertScore owned consent-control calibration canary.</p>
        <h1 className="mt-4 text-3xl font-semibold">{labels.title}</h1>
        <p className="mt-4 max-w-2xl">{labels.context}</p>
        <p className="mt-4 text-sm text-slate-600">
          This no-index page is a read-only scanner calibration surface. It does not save or process a consent choice.
        </p>
        <div data-consent-canary-root="true" className="mt-12 min-h-24" />
        {!isDynamic && (
          <section
            role="dialog"
            aria-modal="true"
            aria-label={labels.title}
            className="mt-12 rounded-lg border-2 border-slate-950 bg-white p-6 shadow-lg"
          >
            <p>{labels.context}</p>
            <div className="mt-5 flex flex-wrap gap-2">
              {expectation.reject && <button type="button" className="rounded border border-slate-700 px-3 py-2">{labels.reject}</button>}
              <button type="button" className="rounded border border-slate-700 px-3 py-2">{labels.options}</button>
              <button type="button" className="rounded bg-slate-950 px-3 py-2 text-white">{labels.accept}</button>
            </div>
          </section>
        )}
        {isDynamic && (
          <script
            dangerouslySetInnerHTML={{
              __html: delayedBannerScript(
                labels,
                expectation.renderMode === "shadow_dom" ? "shadow_dom" : "delayed",
              ),
            }}
          />
        )}
      </div>
    </main>
  );
}
