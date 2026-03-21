import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** @type {import('next').NextConfig} */
const nextConfig = {
  devIndicators: false,
  outputFileTracingRoot: path.join(__dirname, "../.."),
  transpilePackages: [
    "@website-signal-risk-scanner/shared",
    "@website-signal-risk-scanner/ui",
    "@website-signal-risk-scanner/db"
  ]
};

export default nextConfig;
