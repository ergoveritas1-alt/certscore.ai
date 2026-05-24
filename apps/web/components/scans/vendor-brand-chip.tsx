import React from "react";

type VendorBrandMark = {
  initials: string;
  logoPath?: string;
  logoDomain?: string;
  tone: string;
};

const VENDOR_BRAND_MARKS: Array<{ pattern: RegExp; mark: VendorBrandMark }> = [
  { pattern: /google|doubleclick|googletagmanager|googlesyndication|gstatic|googleapis|funding choices/i, mark: { initials: "G", logoPath: "/vendor-logos/google.png", logoDomain: "google.com", tone: "border-blue-200 bg-blue-50 text-blue-700" } },
  { pattern: /meta|facebook/i, mark: { initials: "M", logoPath: "/vendor-logos/facebook.png", logoDomain: "facebook.com", tone: "border-blue-200 bg-blue-50 text-blue-800" } },
  { pattern: /microsoft|bing|clarity/i, mark: { initials: "MS", logoPath: "/vendor-logos/microsoft.png", logoDomain: "microsoft.com", tone: "border-sky-200 bg-sky-50 text-sky-800" } },
  { pattern: /adobe|adobedtm|demdex|launch/i, mark: { initials: "A", logoPath: "/vendor-logos/adobe.png", logoDomain: "adobe.com", tone: "border-red-200 bg-red-50 text-red-700" } },
  { pattern: /amazon/i, mark: { initials: "a", logoPath: "/vendor-logos/amazon.png", logoDomain: "amazon.com", tone: "border-amber-200 bg-amber-50 text-amber-800" } },
  { pattern: /akamai/i, mark: { initials: "A", logoPath: "/vendor-logos/akamai.png", logoDomain: "akamai.com", tone: "border-sky-200 bg-sky-50 text-sky-800" } },
  { pattern: /onetrust|cookielaw|optanon/i, mark: { initials: "OT", logoPath: "/vendor-logos/onetrust.png", logoDomain: "onetrust.com", tone: "border-cyan-200 bg-cyan-50 text-cyan-800" } },
  { pattern: /cookiebot/i, mark: { initials: "CB", logoPath: "/vendor-logos/cookiebot.png", logoDomain: "cookiebot.com", tone: "border-indigo-200 bg-indigo-50 text-indigo-800" } },
  { pattern: /trustarc|truste/i, mark: { initials: "TA", logoPath: "/vendor-logos/trustarc.png", logoDomain: "trustarc.com", tone: "border-emerald-200 bg-emerald-50 text-emerald-800" } },
  { pattern: /usercentrics/i, mark: { initials: "UC", logoPath: "/vendor-logos/usercentrics.png", logoDomain: "usercentrics.com", tone: "border-violet-200 bg-violet-50 text-violet-800" } },
  { pattern: /termly/i, mark: { initials: "T", logoPath: "/vendor-logos/termly.png", logoDomain: "termly.io", tone: "border-teal-200 bg-teal-50 text-teal-800" } },
  { pattern: /didomi/i, mark: { initials: "D", logoPath: "/vendor-logos/didomi.png", logoDomain: "didomi.io", tone: "border-teal-200 bg-teal-50 text-teal-800" } },
  { pattern: /osano/i, mark: { initials: "O", logoPath: "/vendor-logos/osano.png", logoDomain: "osano.com", tone: "border-cyan-200 bg-cyan-50 text-cyan-800" } },
  { pattern: /iubenda/i, mark: { initials: "I", logoPath: "/vendor-logos/iubenda.png", logoDomain: "iubenda.com", tone: "border-emerald-200 bg-emerald-50 text-emerald-800" } },
  { pattern: /cloudflare/i, mark: { initials: "CF", logoPath: "/vendor-logos/cloudflare.png", logoDomain: "cloudflare.com", tone: "border-orange-200 bg-orange-50 text-orange-800" } },
  { pattern: /hcaptcha/i, mark: { initials: "HC", logoPath: "/vendor-logos/hcaptcha.png", logoDomain: "hcaptcha.com", tone: "border-violet-200 bg-violet-50 text-violet-800" } },
  { pattern: /datadome/i, mark: { initials: "DD", logoPath: "/vendor-logos/datadome.png", logoDomain: "datadome.co", tone: "border-slate-300 bg-slate-50 text-slate-800" } },
  { pattern: /human security|perimeterx/i, mark: { initials: "H", logoPath: "/vendor-logos/human-security.png", logoDomain: "humansecurity.com", tone: "border-slate-300 bg-slate-50 text-slate-800" } },
  { pattern: /doubleverify|vtrk\.dv\.tech/i, mark: { initials: "DV", logoPath: "/vendor-logos/doubleverify.png", logoDomain: "doubleverify.com", tone: "border-indigo-200 bg-indigo-50 text-indigo-800" } },
  { pattern: /trade desk|adsrvr/i, mark: { initials: "TD", logoPath: "/vendor-logos/the-trade-desk.png", logoDomain: "thetradedesk.com", tone: "border-slate-300 bg-slate-50 text-slate-800" } },
  { pattern: /criteo/i, mark: { initials: "C", logoPath: "/vendor-logos/criteo.png", logoDomain: "criteo.com", tone: "border-rose-200 bg-rose-50 text-rose-800" } },
  { pattern: /magnite|rubicon|rubiconproject/i, mark: { initials: "M", logoPath: "/vendor-logos/magnite.png", logoDomain: "magnite.com", tone: "border-purple-200 bg-purple-50 text-purple-800" } },
  { pattern: /xandr|adnxs|appnexus/i, mark: { initials: "X", logoPath: "/vendor-logos/xandr.png", logoDomain: "xandr.com", tone: "border-purple-200 bg-purple-50 text-purple-800" } },
  { pattern: /pubmatic/i, mark: { initials: "P", logoPath: "/vendor-logos/pubmatic.png", logoDomain: "pubmatic.com", tone: "border-orange-200 bg-orange-50 text-orange-800" } },
  { pattern: /openx/i, mark: { initials: "OX", logoPath: "/vendor-logos/openx.png", logoDomain: "openx.com", tone: "border-green-200 bg-green-50 text-green-800" } },
  { pattern: /taboola/i, mark: { initials: "T", logoPath: "/vendor-logos/taboola.png", logoDomain: "taboola.com", tone: "border-blue-200 bg-blue-50 text-blue-800" } },
  { pattern: /outbrain/i, mark: { initials: "O", logoPath: "/vendor-logos/outbrain.png", logoDomain: "outbrain.com", tone: "border-blue-200 bg-blue-50 text-blue-800" } },
  { pattern: /teads/i, mark: { initials: "T", logoPath: "/vendor-logos/teads.png", logoDomain: "teads.com", tone: "border-sky-200 bg-sky-50 text-sky-800" } },
  { pattern: /liveramp|rlcdn/i, mark: { initials: "LR", logoPath: "/vendor-logos/liveramp.png", logoDomain: "liveramp.com", tone: "border-red-200 bg-red-50 text-red-800" } },
  { pattern: /\bid5\b|id5-sync/i, mark: { initials: "ID", logoPath: "/vendor-logos/id5.png", logoDomain: "id5.io", tone: "border-indigo-200 bg-indigo-50 text-indigo-800" } },
  { pattern: /index exchange|casale|casalemedia/i, mark: { initials: "IX", logoPath: "/vendor-logos/index-exchange.png", logoDomain: "indexexchange.com", tone: "border-slate-300 bg-slate-50 text-slate-800" } },
  { pattern: /integral ad science|ias/i, mark: { initials: "IAS", logoPath: "/vendor-logos/integral-ad-science.png", logoDomain: "integralads.com", tone: "border-blue-200 bg-blue-50 text-blue-800" } },
  { pattern: /media\.net/i, mark: { initials: "MN", logoPath: "/vendor-logos/media-net.png", logoDomain: "media.net", tone: "border-sky-200 bg-sky-50 text-sky-800" } },
  { pattern: /adform/i, mark: { initials: "AF", logoPath: "/vendor-logos/adform.png", logoDomain: "adform.com", tone: "border-blue-200 bg-blue-50 text-blue-800" } },
  { pattern: /adroll/i, mark: { initials: "AR", logoPath: "/vendor-logos/adroll.png", logoDomain: "adroll.com", tone: "border-red-200 bg-red-50 text-red-800" } },
  { pattern: /stackadapt/i, mark: { initials: "SA", logoPath: "/vendor-logos/stackadapt.png", logoDomain: "stackadapt.com", tone: "border-emerald-200 bg-emerald-50 text-emerald-800" } },
  { pattern: /lotame/i, mark: { initials: "L", logoPath: "/vendor-logos/lotame.png", logoDomain: "lotame.com", tone: "border-cyan-200 bg-cyan-50 text-cyan-800" } },
  { pattern: /quantcast/i, mark: { initials: "Q", logoPath: "/vendor-logos/quantcast.png", logoDomain: "quantcast.com", tone: "border-purple-200 bg-purple-50 text-purple-800" } },
  { pattern: /yahoo|aol|oath/i, mark: { initials: "Y", logoPath: "/vendor-logos/yahoo.png", logoDomain: "yahoo.com", tone: "border-purple-200 bg-purple-50 text-purple-800" } },
  { pattern: /twitter| x ads|^x$/i, mark: { initials: "X", logoPath: "/vendor-logos/x.png", logoDomain: "x.com", tone: "border-zinc-300 bg-zinc-50 text-zinc-800" } },
  { pattern: /snap pixel|snapchat|snap\.com/i, mark: { initials: "S", logoPath: "/vendor-logos/snap.png", logoDomain: "snap.com", tone: "border-yellow-200 bg-yellow-50 text-yellow-800" } },
  { pattern: /jwplayer/i, mark: { initials: "JW", logoPath: "/vendor-logos/jwplayer.png", logoDomain: "jwplayer.com", tone: "border-slate-200 bg-slate-50 text-slate-700" } },
  { pattern: /yandex/i, mark: { initials: "Y", logoPath: "/vendor-logos/yandex.png", logoDomain: "yandex.com", tone: "border-red-200 bg-red-50 text-red-700" } },
  { pattern: /tiktok/i, mark: { initials: "TT", logoPath: "/vendor-logos/tiktok.png", logoDomain: "tiktok.com", tone: "border-zinc-300 bg-zinc-50 text-zinc-800" } },
  { pattern: /linkedin|licdn/i, mark: { initials: "in", logoPath: "/vendor-logos/linkedin.png", logoDomain: "linkedin.com", tone: "border-sky-200 bg-sky-50 text-sky-800" } },
  { pattern: /pinterest/i, mark: { initials: "P", logoPath: "/vendor-logos/pinterest.png", logoDomain: "pinterest.com", tone: "border-red-200 bg-red-50 text-red-800" } },
  { pattern: /reddit/i, mark: { initials: "R", logoPath: "/vendor-logos/reddit.png", logoDomain: "reddit.com", tone: "border-orange-200 bg-orange-50 text-orange-800" } },
  { pattern: /hotjar/i, mark: { initials: "H", logoPath: "/vendor-logos/hotjar.png", logoDomain: "hotjar.com", tone: "border-red-200 bg-red-50 text-red-800" } },
  { pattern: /fullstory/i, mark: { initials: "FS", logoPath: "/vendor-logos/fullstory.png", logoDomain: "fullstory.com", tone: "border-orange-200 bg-orange-50 text-orange-800" } },
  { pattern: /amplitude/i, mark: { initials: "A", logoPath: "/vendor-logos/amplitude.png", logoDomain: "amplitude.com", tone: "border-blue-200 bg-blue-50 text-blue-800" } },
  { pattern: /mixpanel/i, mark: { initials: "M", logoPath: "/vendor-logos/mixpanel.png", logoDomain: "mixpanel.com", tone: "border-purple-200 bg-purple-50 text-purple-800" } },
  { pattern: /heap/i, mark: { initials: "H", logoPath: "/vendor-logos/heap.png", logoDomain: "heap.io", tone: "border-amber-200 bg-amber-50 text-amber-800" } },
  { pattern: /posthog/i, mark: { initials: "PH", logoPath: "/vendor-logos/posthog.png", logoDomain: "posthog.com", tone: "border-yellow-200 bg-yellow-50 text-yellow-800" } },
  { pattern: /segment/i, mark: { initials: "S", logoPath: "/vendor-logos/segment.png", logoDomain: "segment.com", tone: "border-emerald-200 bg-emerald-50 text-emerald-800" } },
  { pattern: /rudderstack/i, mark: { initials: "RS", logoPath: "/vendor-logos/rudderstack.png", logoDomain: "rudderstack.com", tone: "border-slate-300 bg-slate-50 text-slate-800" } },
  { pattern: /logrocket/i, mark: { initials: "LR", logoPath: "/vendor-logos/logrocket.png", logoDomain: "logrocket.com", tone: "border-indigo-200 bg-indigo-50 text-indigo-800" } },
  { pattern: /contentsquare/i, mark: { initials: "CS", logoPath: "/vendor-logos/contentsquare.png", logoDomain: "contentsquare.com", tone: "border-blue-200 bg-blue-50 text-blue-800" } },
  { pattern: /crazy egg/i, mark: { initials: "CE", logoPath: "/vendor-logos/crazy-egg.png", logoDomain: "crazyegg.com", tone: "border-yellow-200 bg-yellow-50 text-yellow-800" } },
  { pattern: /mouseflow/i, mark: { initials: "MF", logoPath: "/vendor-logos/mouseflow.png", logoDomain: "mouseflow.com", tone: "border-red-200 bg-red-50 text-red-800" } },
  { pattern: /glassbox/i, mark: { initials: "G", logoPath: "/vendor-logos/glassbox.png", logoDomain: "glassbox.com", tone: "border-sky-200 bg-sky-50 text-sky-800" } },
  { pattern: /quantum metric/i, mark: { initials: "QM", logoPath: "/vendor-logos/quantum-metric.png", logoDomain: "quantummetric.com", tone: "border-blue-200 bg-blue-50 text-blue-800" } },
  { pattern: /smartlook/i, mark: { initials: "S", logoPath: "/vendor-logos/smartlook.png", logoDomain: "smartlook.com", tone: "border-emerald-200 bg-emerald-50 text-emerald-800" } },
  { pattern: /\bvwo\b|visual website optimizer/i, mark: { initials: "V", logoPath: "/vendor-logos/vwo.png", logoDomain: "vwo.com", tone: "border-violet-200 bg-violet-50 text-violet-800" } },
  { pattern: /optimizely/i, mark: { initials: "O", logoPath: "/vendor-logos/optimizely.png", logoDomain: "optimizely.com", tone: "border-blue-200 bg-blue-50 text-blue-800" } },
  { pattern: /hubspot/i, mark: { initials: "H", logoPath: "/vendor-logos/hubspot.png", logoDomain: "hubspot.com", tone: "border-orange-200 bg-orange-50 text-orange-800" } },
  { pattern: /marketo/i, mark: { initials: "M", logoPath: "/vendor-logos/marketo.png", logoDomain: "marketo.com", tone: "border-red-200 bg-red-50 text-red-800" } },
  { pattern: /klaviyo/i, mark: { initials: "K", logoPath: "/vendor-logos/klaviyo.png", logoDomain: "klaviyo.com", tone: "border-emerald-200 bg-emerald-50 text-emerald-800" } },
  { pattern: /braze/i, mark: { initials: "B", logoPath: "/vendor-logos/braze.png", logoDomain: "braze.com", tone: "border-orange-200 bg-orange-50 text-orange-800" } },
  { pattern: /intercom/i, mark: { initials: "I", logoPath: "/vendor-logos/intercom.png", logoDomain: "intercom.com", tone: "border-blue-200 bg-blue-50 text-blue-800" } },
  { pattern: /drift/i, mark: { initials: "D", logoPath: "/vendor-logos/drift.png", logoDomain: "drift.com", tone: "border-yellow-200 bg-yellow-50 text-yellow-800" } },
  { pattern: /zendesk/i, mark: { initials: "Z", logoPath: "/vendor-logos/zendesk.png", logoDomain: "zendesk.com", tone: "border-emerald-200 bg-emerald-50 text-emerald-800" } },
  { pattern: /qualtrics|siteintercept/i, mark: { initials: "Q", logoPath: "/vendor-logos/qualtrics.png", logoDomain: "qualtrics.com", tone: "border-green-200 bg-green-50 text-green-800" } },
  { pattern: /piano/i, mark: { initials: "P", logoPath: "/vendor-logos/piano.png", logoDomain: "piano.io", tone: "border-slate-300 bg-slate-50 text-slate-800" } },
  { pattern: /onesignal/i, mark: { initials: "OS", logoPath: "/vendor-logos/onesignal.png", logoDomain: "onesignal.com", tone: "border-red-200 bg-red-50 text-red-800" } },
  { pattern: /vudu/i, mark: { initials: "V", logoPath: "/vendor-logos/vudu.png", logoDomain: "vudu.com", tone: "border-slate-200 bg-slate-50 text-slate-700" } }
];

export function getVendorBrandMark(label: string): VendorBrandMark {
  return VENDOR_BRAND_MARKS.find((entry) => entry.pattern.test(label))?.mark ??
    { initials: label.trim().slice(0, 2).toUpperCase() || "?", tone: "border-slate-200 bg-slate-50 text-slate-700" };
}

function getHostLikeLogoDomain(label: string) {
  const normalized = label.trim().toLowerCase().replace(/^https?:\/\//, "").split("/")[0]?.replace(/:\d+$/, "") ?? "";
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(normalized)) {
    return null;
  }
  return normalized;
}

function getVendorLogoUrl(mark: VendorBrandMark, label: string) {
  if (mark.logoPath) {
    return mark.logoPath;
  }
  const domain = mark.logoDomain ?? getHostLikeLogoDomain(label);
  return domain ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64` : null;
}

export function VendorBrandChip(input: {
  category?: string | null;
  className?: string;
  label: string;
  requestCount?: number | null;
  suffix?: string | null;
}) {
  const mark = getVendorBrandMark(input.label);
  const logoUrl = getVendorLogoUrl(mark, input.label);
  const category = input.category ?? "vendor";
  const meta = input.suffix ?? `${category.replaceAll("_", " ")}${typeof input.requestCount === "number" ? ` · ${input.requestCount} req` : ""}`;

  return (
    <span className={`inline-flex max-w-full items-center gap-2 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700 ${input.className ?? ""}`}>
      <span
        aria-hidden="true"
        className={`inline-flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded-full border text-[9px] font-bold leading-none ${mark.tone}`}
      >
        {logoUrl ? (
          <img
            alt=""
            className="h-full w-full rounded-full object-contain"
            loading="lazy"
            referrerPolicy="no-referrer"
            src={logoUrl}
          />
        ) : mark.initials}
      </span>
      <span className="truncate font-medium text-slate-800">{input.label}</span>
      {meta ? <span className="shrink-0 text-slate-500">· {meta}</span> : null}
    </span>
  );
}
