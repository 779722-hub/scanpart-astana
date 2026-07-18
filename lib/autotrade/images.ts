import { autotradeApi, autotradeConfigured } from "./session";

const norm = (s: string) => s.toUpperCase().replace(/[\s-]/g, "");

interface AtItem {
  article?: string | number;
  brand_name?: string;
  photo?: string;
}

/**
 * Чистый (без вотермарка) URL фото товара из Autotrade по артикулу.
 *
 * Autotrade в ответе getItemsByQuery отдаёт `photo` вида
 * `.../nomenclature/wm/b/<hash>.jpg`, где `wm` — версия с вотермарком
 * «АВТОТРЕЙД». Тот же файл без сегмента `/wm/` — чистый и в лучшем качестве
 * (проверено). Так что снимать вотермарк не нужно: берём чистый URL.
 *
 * Фото — товара самого Autotrade по его же артикулу, поэтому оно корректное
 * (в отличие от подбора по чужому каталогу). Бренд на картинке —
 * производителя (VMPAUTO/…), надписей поставщика нет.
 */
export async function resolveAutotradePhotoUrl(
  article: string,
  brand?: string
): Promise<string | null> {
  if (!autotradeConfigured()) return null;
  const q = await autotradeApi("getItemsByQuery", {
    q: article,
    brand: "",
    mode: 1,
    strict: 1,
    page: 1,
    limit: 20,
    cross: 0,
    replace: 0,
    bycross: 0,
    related: 0,
  }).catch(() => null);
  const items = (q?.items as AtItem[] | undefined) ?? [];
  if (!items.length) return null;

  const na = norm(article);
  const exact = items.filter((it) => norm(String(it.article ?? "")) === na);
  const withPhoto = (exact.length ? exact : items).filter(
    (it) => typeof it.photo === "string" && it.photo.length > 0
  );
  if (!withPhoto.length) return null;

  const pick =
    (brand ? withPhoto.find((it) => norm(it.brand_name ?? "") === norm(brand)) : undefined) ??
    withPhoto[0];
  const photo = pick.photo!;
  return photo.replace("/nomenclature/wm/", "/nomenclature/");
}
