import * as tls from "node:tls";

type DnsAnswer = {
  data?: string;
  name?: string;
  type?: number;
};

type DnsJsonResponse = {
  Answer?: DnsAnswer[];
  Status?: number;
};

export type TlsMetadata = {
  certificateAuthority: string | null;
  certificateAutoRenewLikely: boolean | null;
  certificateValidDaysRemaining: number | null;
  tlsVersionMinSupported: string | null;
};

export type DomainRegistration = {
  domainPrivacyProtectionEnabled: boolean | null;
  domainRegistrationYear: number | null;
};

export type DnsSignals = {
  dkimRecordDetected: boolean;
  dmarcRecordPresent: boolean;
  dnssecEnabled: boolean;
  spfRecordPresent: boolean;
};

function withTimeout<T>(promiseFactory: () => Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), timeoutMs);

    promiseFactory()
      .then((value) => resolve(value))
      .catch(() => resolve(fallback))
      .finally(() => clearTimeout(timer));
  });
}

async function resolveDnsJson(name: string, type: string): Promise<DnsJsonResponse | null> {
  return withTimeout(
    async () => {
      const response = await fetch(`https://dns.google/resolve?name=${encodeURIComponent(name)}&type=${encodeURIComponent(type)}`, {
        headers: {
          accept: "application/dns-json"
        }
      });

      if (!response.ok) {
        return null;
      }

      return (await response.json()) as DnsJsonResponse;
    },
    4_000,
    null
  );
}

function hasTxtAnswer(json: DnsJsonResponse | null, pattern?: RegExp) {
  if (!json?.Answer?.length) {
    return false;
  }

  return json.Answer.some((answer) => {
    const value = answer.data?.replace(/^"|"$/g, "") ?? "";
    return pattern ? pattern.test(value) : value.length > 0;
  });
}

export async function fetchDnsSignals(domain: string): Promise<DnsSignals> {
  const [dnskey, spf, dmarc, ...dkimResponses] = await Promise.all([
    resolveDnsJson(domain, "DNSKEY"),
    resolveDnsJson(domain, "TXT"),
    resolveDnsJson(`_dmarc.${domain}`, "TXT"),
    ...["default", "selector1", "google", "k1", "dkim", "mail"].map((selector) =>
      resolveDnsJson(`${selector}._domainkey.${domain}`, "TXT")
    )
  ]);

  return {
    dnssecEnabled: Boolean(dnskey?.Answer?.length),
    spfRecordPresent: hasTxtAnswer(spf, /\bv=spf1\b/i),
    dmarcRecordPresent: hasTxtAnswer(dmarc, /\bv=dmarc1\b/i),
    dkimRecordDetected: dkimResponses.some((response) => hasTxtAnswer(response, /\bk=rsa\b|\bv=dkim1\b/i))
  };
}

export async function fetchTlsMetadata(hostname: string): Promise<TlsMetadata> {
  return withTimeout(
    () =>
      new Promise<TlsMetadata>((resolve) => {
        const socket = tls.connect(
          {
            host: hostname,
            port: 443,
            servername: hostname,
            rejectUnauthorized: false
          },
          () => {
            const certificate = socket.getPeerCertificate();
            const validTo = typeof certificate.valid_to === "string" ? Date.parse(certificate.valid_to) : Number.NaN;
            const issuer = certificate.issuer;
            const issuerName =
              typeof issuer === "object" && issuer
                ? [issuer.O, issuer.CN, issuer.OU].filter((value): value is string => typeof value === "string" && value.length > 0)[0] ?? null
                : null;
            const validDays =
              Number.isNaN(validTo) ? null : Math.max(0, Math.ceil((validTo - Date.now()) / (1000 * 60 * 60 * 24)));
            const autoRenewLikely = issuerName ? /let'?s encrypt|google trust services|amazon|cloudflare/i.test(issuerName) : null;

            resolve({
              tlsVersionMinSupported: socket.getProtocol() ?? null,
              certificateAuthority: issuerName,
              certificateValidDaysRemaining: validDays,
              certificateAutoRenewLikely: autoRenewLikely
            });
            socket.end();
          }
        );

        socket.on("error", () => {
          resolve({
            tlsVersionMinSupported: null,
            certificateAuthority: null,
            certificateValidDaysRemaining: null,
            certificateAutoRenewLikely: null
          });
        });
      }),
    4_000,
    {
      tlsVersionMinSupported: null,
      certificateAuthority: null,
      certificateValidDaysRemaining: null,
      certificateAutoRenewLikely: null
    }
  );
}

export async function fetchDomainRegistration(domain: string): Promise<DomainRegistration> {
  return withTimeout(
    async () => {
      const response = await fetch(`https://rdap.org/domain/${encodeURIComponent(domain)}`, {
        headers: {
          accept: "application/rdap+json, application/json"
        }
      });

      if (!response.ok) {
        return {
          domainRegistrationYear: null,
          domainPrivacyProtectionEnabled: null
        };
      }

      const body = (await response.json()) as {
        entities?: Array<{ roles?: string[]; vcardArray?: unknown[] }>;
        events?: Array<{ eventAction?: string; eventDate?: string }>;
      };
      const registrationEvent =
        body.events?.find((event) => /registration/i.test(event.eventAction ?? "")) ??
        body.events?.find((event) => /creation/i.test(event.eventAction ?? ""));
      const registrationYear = registrationEvent?.eventDate ? new Date(registrationEvent.eventDate).getUTCFullYear() : null;
      const privacyEnabled =
        body.entities?.some((entity) => {
          const rolesText = entity.roles?.join(" ").toLowerCase() ?? "";
          const vcardText = JSON.stringify(entity.vcardArray ?? []).toLowerCase();
          return /privacy|proxy|redacted/.test(`${rolesText} ${vcardText}`);
        }) ?? null;

      return {
        domainRegistrationYear: Number.isFinite(registrationYear) ? registrationYear : null,
        domainPrivacyProtectionEnabled: privacyEnabled
      };
    },
    5_000,
    {
      domainRegistrationYear: null,
      domainPrivacyProtectionEnabled: null
    }
  );
}
