import Image, { type ImageProps } from "next/image";
import { cldUrl } from "@/lib/cloudinary-url";

type Props = Omit<ImageProps, "src"> & {
  publicId: string;
};

export function CldImage({ publicId, alt, width, height, ...rest }: Props) {
  const w = typeof width === "number" ? width : undefined;
  return (
    <Image
      src={cldUrl(publicId, { width: w })}
      alt={alt}
      width={width}
      height={height}
      {...rest}
    />
  );
}
