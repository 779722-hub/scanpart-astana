import type { MetadataRoute } from "next";
import { SITE_NAME } from "@/lib/site";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${SITE_NAME} — автозапчасти в Астане`,
    short_name: "SCANPART",
    description:
      "Быстрый поиск автозапчастей в Астане по VIN, номеру и названию.",
    start_url: "/",
    display: "standalone",
    background_color: "#F8F9FB",
    theme_color: "#E10600",
    icons: [
      { src: "/favicon.svg", sizes: "any", type: "image/svg+xml" },
    ],
  };
}
