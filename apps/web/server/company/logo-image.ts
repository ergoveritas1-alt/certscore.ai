import sharp from "sharp";

export const MAX_LOGO_UPLOAD_BYTES = 2 * 1024 * 1024;
export const MAX_STORED_LOGO_BYTES = 256 * 1024;
export const LOGO_UPLOAD_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;

/** Decode untrusted uploads and retain only a bounded, metadata-free PNG. */
export async function normalizeCompanyLogo(body: Buffer, contentType: string) {
  if (!body.length || body.length > MAX_LOGO_UPLOAD_BYTES) throw new Error("Choose a logo up to 2 MB.");
  if (!LOGO_UPLOAD_TYPES.includes(contentType as typeof LOGO_UPLOAD_TYPES[number])) {
    throw new Error("Logo must be PNG, JPEG, or WebP.");
  }
  try {
    const image = sharp(body, { limitInputPixels: 4_000_000, animated: false, failOn: "warning" });
    const metadata = await image.metadata();
    const expectedFormat = contentType === "image/jpeg" ? "jpeg" : contentType.split("/")[1];
    if (metadata.format !== expectedFormat || (metadata.pages ?? 1) > 1) throw new Error("Unsupported image.");
    const normalized = await image.rotate().resize({ width: 640, height: 320, fit: "inside", withoutEnlargement: true })
      .png({ compressionLevel: 9 }).toBuffer();
    if (normalized.length > MAX_STORED_LOGO_BYTES) throw new Error("Image is too complex.");
    return normalized;
  } catch {
    throw new Error("Use a valid, still PNG, JPEG, or WebP logo with at most 4 million pixels.");
  }
}

export function isWorkspaceLogoKey(organizationId: string, key: string) {
  return key.startsWith(`company-logos/${organizationId}/`) &&
    /^[a-z0-9-]+\.(png|jpeg|webp|svg)$/i.test(key.slice(`company-logos/${organizationId}/`.length));
}
