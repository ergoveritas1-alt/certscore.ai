import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** @type {import('next').NextConfig} */
const nextConfig = {
  devIndicators: false,
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, "../.."),
  async headers() {
    return [
      {
        source: "/api/v1/:path*",
        headers: [
          {
            key: "X-Robots-Tag",
            value: "noindex, nofollow"
          }
        ]
      },
      {
        source: "/api-pulse-agent-guide.txt",
        headers: [
          {
            key: "X-Robots-Tag",
            value: "noindex"
          }
        ]
      },
      {
        source: "/llms.txt",
        headers: [
          {
            key: "X-Robots-Tag",
            value: "noindex"
          }
        ]
      },
      {
        source: "/mcp/light",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400"
          }
        ]
      },
      {
        source: "/.well-known/certscore-pulse",
        headers: [
          {
            key: "X-Robots-Tag",
            value: "noindex"
          }
        ]
      }
    ];
  },
  async redirects() {
    return [
      {
        source: "/preview",
        destination: "/",
        permanent: true
      },
      {
        source: "/contact",
        destination: "/contact-sales",
        permanent: true
      },
      {
        source: "/guides/findings",
        destination: "/findings",
        permanent: true
      },
      {
        source: "/guides/findings/:findingId",
        destination: "/findings/:findingId",
        permanent: true
      },
      {
        source: "/:path*",
        has: [
          {
            type: "host",
            value: "www.certscore.ai"
          }
        ],
        destination: "https://certscore.ai/:path*",
        permanent: true
      }
    ];
  },
  webpack(config) {
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias ?? {}),
      ".js": [".ts", ".tsx", ".js"]
    };
    return config;
  },
  turbopack: {
    resolveAlias: {
      "@certscore/api-contracts": "../../packages/certscore-api-contracts/src/index.ts",
      "./api-v2.js": "../../packages/certscore-api-contracts/src/api-v2.ts",
      "./mcp.js": "../../packages/certscore-api-contracts/src/mcp.ts",
      "./openapi.js": "../../packages/certscore-api-contracts/src/openapi.ts",
      "./openapi-chatgpt.js":
        "../../packages/certscore-api-contracts/src/openapi-chatgpt.ts",
      "./openapi-v2.js": "../../packages/certscore-api-contracts/src/openapi-v2.ts",
      "./pulse-v1.js": "../../packages/certscore-api-contracts/src/pulse-v1.ts",
      "./scan-no-go.js": "../../packages/certscore-api-contracts/src/scan-no-go.ts"
    }
  },
  transpilePackages: [
    "@certscore/api-contracts",
    "@website-signal-risk-scanner/shared",
    "@website-signal-risk-scanner/ui",
    "@website-signal-risk-scanner/db"
  ]
};

export default nextConfig;
