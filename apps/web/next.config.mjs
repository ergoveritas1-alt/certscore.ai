import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** @type {import('next').NextConfig} */
const nextConfig = {
  devIndicators: false,
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, "../.."),
  async redirects() {
    return [
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
