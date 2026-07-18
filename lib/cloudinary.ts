import { v2 as cld, type UploadApiResponse } from "cloudinary";

/**
 * Parse a CLOUDINARY_URL connection string of the form:
 *   cloudinary://<api_key>:<api_secret>@<cloud_name>
 * Returns null if the input doesn't match.
 */
function parseConnectionUrl(
  url: string | undefined
): { cloud: string; key: string; secret: string } | null {
  if (!url) return null;
  const m = /^cloudinary:\/\/([^:]+):([^@]+)@(.+)$/.exec(url.trim());
  if (!m) return null;
  return {
    key: decodeURIComponent(m[1]),
    secret: decodeURIComponent(m[2]),
    cloud: m[3].split("/")[0], // strip optional /folder
  };
}

let configured = false;
function ensure(): void {
  if (configured) return;
  const fromUrl = parseConnectionUrl(process.env.CLOUDINARY_URL);
  const cloud = process.env.CLOUDINARY_CLOUD_NAME ?? fromUrl?.cloud;
  const key = process.env.CLOUDINARY_API_KEY ?? fromUrl?.key;
  const secret = process.env.CLOUDINARY_API_SECRET ?? fromUrl?.secret;
  if (!cloud || !key || !secret) {
    throw new Error("Cloudinary env vars missing");
  }
  cld.config({
    cloud_name: cloud,
    api_key: key,
    api_secret: secret,
    secure: true,
  });
  configured = true;
}

/** Resolve cloud name from any of the supported env shapes. */
export function resolveCloudName(): string | null {
  return (
    process.env.CLOUDINARY_CLOUD_NAME ||
    parseConnectionUrl(process.env.CLOUDINARY_URL)?.cloud ||
    null
  );
}

export const FOLDER = process.env.CLOUDINARY_FOLDER || "scanpart";

export interface UploadedImage {
  publicId: string;
  secureUrl: string;
  width: number;
  height: number;
  bytes: number;
  format: string;
}

export async function uploadBuffer(
  buf: Buffer,
  opts: { filename?: string; folder?: string } = {}
): Promise<UploadedImage> {
  ensure();
  const folder = opts.folder ?? FOLDER;
  return new Promise<UploadedImage>((resolve, reject) => {
    const stream = cld.uploader.upload_stream(
      {
        folder,
        resource_type: "image",
        unique_filename: true,
        overwrite: false,
        use_filename: Boolean(opts.filename),
        filename_override: opts.filename,
      },
      (err, res) => {
        if (err) return reject(err);
        if (!res) return reject(new Error("Cloudinary returned no response"));
        const r = res as UploadApiResponse;
        resolve({
          publicId: r.public_id,
          secureUrl: r.secure_url,
          width: r.width,
          height: r.height,
          bytes: r.bytes,
          format: r.format,
        });
      }
    );
    stream.end(buf);
  });
}

export async function destroy(publicId: string): Promise<void> {
  ensure();
  await cld.uploader.destroy(publicId, { resource_type: "image" });
}

/**
 * Подписанный Cloudinary fetch-URL: тянет удалённую картинку через Cloudinary
 * с ресайзом (w, c_limit — не увеличивает) + f_auto/q_auto, кэширует на их CDN.
 * Подпись обходит «strict transformations». Возвращает null, если Cloudinary
 * не настроен. Требует, чтобы в аккаунте была разрешена доставка fetch.
 */
export function signedFetchUrl(remoteUrl: string, width: number): string | null {
  try {
    ensure();
    return cld.url(remoteUrl, {
      type: "fetch",
      sign_url: true,
      secure: true,
      transformation: [{ width, crop: "limit", fetch_format: "auto", quality: "auto" }],
    });
  } catch {
    return null;
  }
}

/** Re-export pure URL builder (client-safe). */
export { cldUrl } from "./cloudinary-url";
