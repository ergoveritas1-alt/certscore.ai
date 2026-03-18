/** @type {import('next').NextConfig} */
const nextConfig = {
  devIndicators: false,
  transpilePackages: [
    "@website-signal-risk-scanner/shared",
    "@website-signal-risk-scanner/ui",
    "@website-signal-risk-scanner/db"
  ]
};

export default nextConfig;
