/**
 * Build a Cloudinary CDN URL with on-the-fly format/quality. Pure string
 * builder — safe to import in client components (no `cloudinary` SDK pulled).
 */
export function cldUrl(
  publicId: string,
  opts: { width?: number; cloud?: string } = {}
): string {
  const cloud =
    opts.cloud ?? process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME ?? "demo";
  const tx: string[] = ["f_auto", "q_auto"];
  if (opts.width) tx.push(`w_${opts.width}`);
  return `https://res.cloudinary.com/${cloud}/image/upload/${tx.join(
    ","
  )}/${publicId}`;
}
