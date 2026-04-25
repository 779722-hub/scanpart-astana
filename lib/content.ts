import { unstable_cache } from "next/cache";
import {
  readContent,
  readImages,
  readTheme,
  type ContentRow,
  type ImageRow,
} from "@/lib/sheets/client";

export const CONTENT_TAG = "content";
export const THEME_TAG = "theme";
export const IMAGES_TAG = "images";

type Locale = "ru" | "kk" | "en";

/** Cached read of all CMS content. Tag-revalidated on admin write. */
export const getContentRows = unstable_cache(
  async (): Promise<ContentRow[]> => {
    try {
      return await readContent();
    } catch {
      return [];
    }
  },
  ["sheets-content"],
  { tags: [CONTENT_TAG], revalidate: 60 }
);

export const getImageRows = unstable_cache(
  async (): Promise<ImageRow[]> => {
    try {
      return await readImages();
    } catch {
      return [];
    }
  },
  ["sheets-images"],
  { tags: [IMAGES_TAG], revalidate: 60 }
);

export const getThemeMap = unstable_cache(
  async (): Promise<Record<string, string>> => {
    try {
      return await readTheme();
    } catch {
      return {};
    }
  },
  ["sheets-theme"],
  { tags: [THEME_TAG], revalidate: 60 }
);

/**
 * Convert flat key/value content rows for one locale into a deeply-nested
 * object compatible with next-intl messages. Keys use dot notation,
 * e.g. `home.title` → `{ home: { title } }`.
 */
function inflate(flat: Record<string, string>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(flat)) {
    if (!value) continue;
    const path = key.split(".");
    let cursor = out;
    for (let i = 0; i < path.length - 1; i++) {
      const seg = path[i];
      if (typeof cursor[seg] !== "object" || cursor[seg] === null) {
        cursor[seg] = {};
      }
      cursor = cursor[seg] as Record<string, unknown>;
    }
    cursor[path[path.length - 1]] = value;
  }
  return out;
}

/** Deep merge: `over` takes precedence over `base`. Arrays in `over` replace base. */
export function deepMerge<T extends Record<string, unknown>>(
  base: T,
  over: Record<string, unknown>
): T {
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(over)) {
    if (
      v &&
      typeof v === "object" &&
      !Array.isArray(v) &&
      out[k] &&
      typeof out[k] === "object" &&
      !Array.isArray(out[k])
    ) {
      out[k] = deepMerge(out[k] as Record<string, unknown>, v as Record<string, unknown>);
    } else if (v !== undefined && v !== "") {
      out[k] = v;
    }
  }
  return out as T;
}

export async function getOverridesForLocale(
  locale: Locale
): Promise<Record<string, unknown>> {
  const rows = await getContentRows();
  const flat: Record<string, string> = {};
  for (const r of rows) {
    const v = r[locale];
    if (v) flat[r.key] = v;
  }
  return inflate(flat);
}

export async function getImageSlot(slot: string): Promise<ImageRow | null> {
  const all = await getImageRows();
  return all.find((i) => i.slot === slot) ?? null;
}
