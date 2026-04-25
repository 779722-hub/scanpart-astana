import { v2 as cld, type UploadApiResponse } from "cloudinary";

let configured = false;
function ensure(): void {
  if (configured) return;
  const cloud = process.env.CLOUDINARY_CLOUD_NAME;
  const key = process.env.CLOUDINARY_API_KEY;
  const secret = process.env.CLOUDINARY_API_SECRET;
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

/** Re-export pure URL builder (client-safe). */
export { cldUrl } from "./cloudinary-url";
