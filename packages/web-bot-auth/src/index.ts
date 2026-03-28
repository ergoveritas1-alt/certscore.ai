import {
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign,
  type KeyObject
} from "node:crypto";

const DIRECTORY_CONTENT_TYPE = "application/http-message-signatures-directory+json";
const DIRECTORY_TAG = "http-message-signatures-directory";
const REQUEST_TAG = "web-bot-auth";
const DEFAULT_LABEL = "sig1";
const DEFAULT_EXPIRES_SECONDS = 300;

type SignatureComponent = {
  id: string;
  value: string;
  params?: string[];
};

export type WebBotAuthKeyMaterial = {
  jwk: WebBotAuthPublicJwk;
  jwks: { keys: WebBotAuthPublicJwk[] };
  privateKey: KeyObject;
  publicKey: KeyObject;
  thumbprint: string;
};

export type WebBotAuthPublicJwk = {
  alg: "EdDSA";
  crv: "Ed25519";
  kid: string;
  kty: "OKP";
  use: "sig";
  x: string;
};

export type WebBotAuthRequestSignatureResult = {
  created: number;
  expires: number;
  headers: Record<string, string>;
  keyId: string;
  nonce: string | null;
  signatureBase: string;
};

export type HttpMessageSignaturesDirectoryResult = {
  body: string;
  contentType: string;
  created: number;
  expires: number;
  headers: Record<string, string>;
  jwks: { keys: WebBotAuthPublicJwk[] };
  keyId: string;
  signatureBase: string;
};

function assertAscii(value: string, label: string) {
  if (!/^[\x20-\x7E]*$/.test(value)) {
    throw new Error(`${label} must be ASCII-safe.`);
  }
}

function escapeStructuredFieldString(value: string) {
  assertAscii(value, "Structured field value");
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function serializeStructuredFieldString(value: string) {
  return `"${escapeStructuredFieldString(value)}"`;
}

function normalizePem(value: string) {
  return value.trim().replace(/\\n/g, "\n");
}

function normalizeAuthority(url: URL) {
  return url.host.toLowerCase();
}

function normalizeExpiresInSeconds(value: number | undefined) {
  if (!value) {
    return DEFAULT_EXPIRES_SECONDS;
  }

  if (!Number.isInteger(value) || value <= 0) {
    throw new Error("Web Bot Auth expiry must be a positive integer.");
  }

  return value;
}

function buildPublicJwkFromKeyObject(publicKey: KeyObject, thumbprint: string): WebBotAuthPublicJwk {
  const exported = publicKey.export({ format: "jwk" }) as JsonWebKey;

  if (exported.kty !== "OKP" || exported.crv !== "Ed25519" || typeof exported.x !== "string") {
    throw new Error("Expected an Ed25519 public key.");
  }

  return {
    alg: "EdDSA",
    crv: "Ed25519",
    kid: thumbprint,
    kty: "OKP",
    use: "sig",
    x: exported.x
  };
}

function signatureComponentIdentifier(component: SignatureComponent) {
  const params = component.params?.length ? component.params.map((param) => `;${param}`).join("") : "";
  return `"${component.id}"${params}`;
}

function buildSignatureBase(components: SignatureComponent[], params: string) {
  return `${components.map((component) => `${signatureComponentIdentifier(component)}: ${component.value}`).join("\n")}\n"@signature-params": ${params}`;
}

function buildSignatureInputParams(params: {
  components: Array<{ id: string; params?: string[] }>;
  created: number;
  expires: number;
  keyId: string;
  nonce?: string;
  tag: string;
}) {
  const innerList = `(${params.components
    .map((component) => signatureComponentIdentifier({ id: component.id, value: "", params: component.params }))
    .join(" ")})`;

  const parts = [
    innerList,
    `created=${params.created}`,
    `expires=${params.expires}`,
    `keyid=${serializeStructuredFieldString(params.keyId)}`,
    `tag=${serializeStructuredFieldString(params.tag)}`
  ];

  if (params.nonce) {
    parts.push(`nonce=${serializeStructuredFieldString(params.nonce)}`);
  }

  return parts.join(";");
}

function buildSignatureHeaders(input: {
  components: SignatureComponent[];
  created: number;
  expires: number;
  keyId: string;
  label?: string;
  nonce?: string;
  privateKey: KeyObject;
  tag: string;
}) {
  const label = input.label ?? DEFAULT_LABEL;
  const params = buildSignatureInputParams({
    components: input.components.map((component) => ({ id: component.id, params: component.params })),
    created: input.created,
    expires: input.expires,
    keyId: input.keyId,
    nonce: input.nonce,
    tag: input.tag
  });
  const signatureBase = buildSignatureBase(input.components, params);
  const signatureBytes = sign(null, Buffer.from(signatureBase, "utf8"), input.privateKey);

  return {
    headers: {
      Signature: `${label}=:${signatureBytes.toString("base64")}:`,
      "Signature-Input": `${label}=${params}`
    },
    signatureBase
  };
}

export function generateWebBotAuthKeyPair() {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const privateKeyPem = privateKey.export({ format: "pem", type: "pkcs8" }).toString();
  const keyMaterial = createWebBotAuthKeyMaterial(privateKeyPem);

  return {
    ...keyMaterial,
    privateKeyPem,
    publicKeyPem: publicKey.export({ format: "pem", type: "spki" }).toString()
  };
}

export function loadWebBotAuthPrivateKey(privateKeyPem: string) {
  return createPrivateKey({
    format: "pem",
    key: normalizePem(privateKeyPem)
  });
}

export function createWebBotAuthKeyMaterial(privateKeyPem: string): WebBotAuthKeyMaterial {
  const privateKey = loadWebBotAuthPrivateKey(privateKeyPem);
  const publicKey = createPublicKey(privateKey);
  const thumbprint = computeJwkThumbprintFromPublicKey(publicKey);
  const jwk = buildPublicJwkFromKeyObject(publicKey, thumbprint);

  return {
    jwk,
    jwks: { keys: [jwk] },
    privateKey,
    publicKey,
    thumbprint
  };
}

export function computeJwkThumbprint(jwk: Pick<WebBotAuthPublicJwk, "crv" | "kty" | "x">) {
  const canonical = JSON.stringify({
    crv: jwk.crv,
    kty: jwk.kty,
    x: jwk.x
  });

  return createHash("sha256").update(canonical).digest("base64url");
}

export function computeJwkThumbprintFromPublicKey(publicKey: KeyObject) {
  const exported = publicKey.export({ format: "jwk" }) as JsonWebKey;

  if (exported.kty !== "OKP" || exported.crv !== "Ed25519" || typeof exported.x !== "string") {
    throw new Error("Expected an Ed25519 public key.");
  }

  return computeJwkThumbprint({
    crv: "Ed25519",
    kty: "OKP",
    x: exported.x
  });
}

export function getDefaultSignatureAgentUrl(input: { crawlerPublicUrl: string }) {
  return new URL("/.well-known/http-message-signatures-directory", input.crawlerPublicUrl).toString();
}

export function buildHttpMessageSignaturesDirectoryResponse(input: {
  expiresInSeconds?: number;
  keyMaterial: WebBotAuthKeyMaterial;
  label?: string;
  requestUrl: string | URL;
}) : HttpMessageSignaturesDirectoryResult {
  const requestUrl = typeof input.requestUrl === "string" ? new URL(input.requestUrl) : input.requestUrl;
  const created = Math.floor(Date.now() / 1000);
  const expires = created + normalizeExpiresInSeconds(input.expiresInSeconds);
  const body = JSON.stringify(input.keyMaterial.jwks);
  const contentType = DIRECTORY_CONTENT_TYPE;
  const { headers, signatureBase } = buildSignatureHeaders({
    components: [
      {
        id: "@authority",
        params: ["req"],
        value: normalizeAuthority(requestUrl)
      },
      {
        id: "content-type",
        value: contentType
      }
    ],
    created,
    expires,
    keyId: input.keyMaterial.thumbprint,
    label: input.label,
    privateKey: input.keyMaterial.privateKey,
    tag: DIRECTORY_TAG
  });

  return {
    body,
    contentType,
    created,
    expires,
    headers,
    jwks: input.keyMaterial.jwks,
    keyId: input.keyMaterial.thumbprint,
    signatureBase
  };
}

export function buildWebBotAuthRequestHeaders(input: {
  expiresInSeconds?: number;
  keyMaterial: WebBotAuthKeyMaterial;
  label?: string;
  nonce?: string;
  signatureAgentUrl: string;
  url: string | URL;
}) : WebBotAuthRequestSignatureResult {
  const url = typeof input.url === "string" ? new URL(input.url) : input.url;
  const signatureAgentUrl = input.signatureAgentUrl.trim();
  assertAscii(signatureAgentUrl, "Signature-Agent");

  const created = Math.floor(Date.now() / 1000);
  const expires = created + normalizeExpiresInSeconds(input.expiresInSeconds);
  const { headers, signatureBase } = buildSignatureHeaders({
    components: [
      {
        id: "@authority",
        value: normalizeAuthority(url)
      },
      {
        id: "signature-agent",
        value: signatureAgentUrl
      }
    ],
    created,
    expires,
    keyId: input.keyMaterial.thumbprint,
    label: input.label,
    nonce: input.nonce,
    privateKey: input.keyMaterial.privateKey,
    tag: REQUEST_TAG
  });

  return {
    created,
    expires,
    headers: {
      ...headers,
      "Signature-Agent": signatureAgentUrl
    },
    keyId: input.keyMaterial.thumbprint,
    nonce: input.nonce ?? null,
    signatureBase
  };
}

export function getWebBotAuthConstants() {
  return {
    defaultExpiresSeconds: DEFAULT_EXPIRES_SECONDS,
    directoryContentType: DIRECTORY_CONTENT_TYPE,
    directoryTag: DIRECTORY_TAG,
    requestTag: REQUEST_TAG
  };
}
