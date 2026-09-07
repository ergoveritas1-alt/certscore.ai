import sharp from 'sharp';
import { fileURLToPath } from 'node:url';

const directory = fileURLToPath(new URL('../../apps/web/public/marketing/hero/', import.meta.url));
// Flatten the existing screen-blended dashboard into the shield so there is
// only one request and no separately loading or breakpoint-hidden interior.
const dashboard = await sharp(`${directory}scan-report-dashboard-with-privacy-details.jpg`)
  .resize({ width: 310 }).blur(0.5).ensureAlpha(0.51).toBuffer();
await sharp(`${directory}futuristic-tech-shield-and-network-fast.jpg`)
  .composite([{ input: dashboard, left: 620, top: 155, blend: 'screen' }])
  .png({ palette: true, colours: 256, dither: 1, compressionLevel: 9, effort: 10 })
  .toFile(`${directory}shield-report-compact.png`);
