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
  transpilePackages: [
    "@website-signal-risk-scanner/shared",
    "@website-signal-risk-scanner/ui",
    "@website-signal-risk-scanner/db"
  ]
};

export default nextConfig;
