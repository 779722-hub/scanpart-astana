import { getThemeMap } from "@/lib/content";

const DEFAULTS = {
  brand: "225 6 0",
  brandDark: "255 50 42",
  ink: "11 13 16",
};

function hexToRgb(hex: string): string | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const v = parseInt(m[1], 16);
  return `${(v >> 16) & 255} ${(v >> 8) & 255} ${v & 255}`;
}

/**
 * Server component — injects a tiny <style> with CSS variables read live from
 * the `Theme` sheet. Tailwind's brand/ink colors resolve via these variables.
 */
export async function ThemeStyle() {
  const map = await getThemeMap().catch(() => ({} as Record<string, string>));
  const brand = hexToRgb(map.brand_color ?? "") ?? DEFAULTS.brand;
  const brandDark =
    hexToRgb(map.brand_color_dark ?? "") ?? DEFAULTS.brandDark;
  const ink = hexToRgb(map.accent_color ?? "") ?? DEFAULTS.ink;

  const css = `:root{--c-brand:${brand};--c-brand-dark:${brandDark};--c-ink:${ink};}`;
  return <style dangerouslySetInnerHTML={{ __html: css }} />;
}
