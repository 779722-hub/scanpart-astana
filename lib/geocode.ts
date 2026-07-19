/**
 * Address → coordinates via the free OpenStreetMap Nominatim geocoder.
 * Server-side only. Returns null on any failure (caller decides the fallback).
 * Biased to Kazakhstan.
 */
// We only operate in Astana — pin geocoding to the city so ambiguous addresses
// don't resolve to Almaty or elsewhere.
const ASTANA_VIEWBOX = "71.20,51.35,71.70,51.00"; // lon1,lat1,lon2,lat2
const ASTANA_RE = /астан|astana|нур-?султан|nur-?sultan|целиноград/i;

/** True when a coordinate is within (a slightly padded) Astana bounding box. */
export function isInAstana(lat: number | null, lng: number | null): boolean {
  if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  return lat >= 50.95 && lat <= 51.40 && lng >= 71.10 && lng <= 71.80;
}

/**
 * Приводим «человеческий» адрес к форме, понятной Nominatim: убираем «д.», «дом»,
 * «кв.»/номер квартиры, раскрываем «пр./ул./мкр.», нормализуем пробелы и запятые.
 * «проспект Республики , д.9» → «проспект Республики 9».
 */
function cleanAddress(q: string): string {
  return q
    .replace(/^\s*(?:г\.|гор\.|город\b)\s*/i, "") // «г. Астана» / «г.Астана» → убрать префикс города
    .replace(/\bкв\.?\s*\d+[а-я]?/gi, "") // квартиру Nominatim не находит — убираем
    .replace(/\bквартира\s*\d+[а-я]?/gi, "")
    .replace(/\bдом\s+/gi, "")
    .replace(/\bд\.?\s*(?=\d)/gi, "") // «д.9» / «д 9» → «9»
    .replace(/\bпр-?кт\.?\s/gi, "проспект ")
    .replace(/\bпр\.?\s/gi, "проспект ")
    .replace(/\bул\.?\s/gi, "улица ")
    .replace(/\bмкр\.?\s/gi, "микрорайон ")
    .replace(/,/g, " ") // запятые → пробелы: Nominatim так надёжнее находит дом
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * Яндекс.Геокодер — лучшее качество для русских адресов Казахстана. Работает
 * только если задан ключ YANDEX_GEOCODER_KEY (бесплатно ~1000 запросов/сутки).
 * Ограничиваем область Астаной (bbox + rspn=1).
 */
async function yandexGeocode(
  query: string
): Promise<{ lat: number; lng: number; display: string } | null> {
  const key = (process.env.YANDEX_GEOCODER_KEY ?? "").trim();
  if (!key) return null;
  const url =
    `https://geocode-maps.yandex.ru/1.x/?format=json&lang=ru_RU&results=1` +
    `&bbox=71.10,50.95~71.80,51.40&rspn=1` +
    `&apikey=${encodeURIComponent(key)}&geocode=${encodeURIComponent(query)}`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 6000);
  try {
    const res = await fetch(url, { signal: ctrl.signal, cache: "no-store" });
    if (!res.ok) return null;
    const j = await res.json();
    const member = j?.response?.GeoObjectCollection?.featureMember?.[0]?.GeoObject;
    const pos = member?.Point?.pos as string | undefined; // "lon lat"
    if (!pos) return null;
    const [lonS, latS] = pos.split(" ");
    const lat = Number(latS);
    const lng = Number(lonS);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return {
      lat: Math.round(lat * 1e6) / 1e6,
      lng: Math.round(lng * 1e6) / 1e6,
      display: member?.metaDataProperty?.GeocoderMetaData?.text ?? "",
    };
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

// Nominatim просит не чаще 1 запроса/сек. Наш каскад делает несколько попыток
// подряд — без задержки они упираются в лимит, и точный (house-level) результат
// теряется, оставляя грубый street-level. Разносим вызовы во времени.
let _lastNominatim = 0;
async function throttleNominatim(): Promise<void> {
  const wait = Math.max(0, 1100 - (Date.now() - _lastNominatim));
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  _lastNominatim = Date.now();
}

async function nominatim(
  query: string,
  bounded: boolean
): Promise<{ lat: number; lng: number; display: string } | null> {
  await throttleNominatim();
  const url =
    `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1` +
    `&countrycodes=kz&accept-language=ru` +
    `&viewbox=${ASTANA_VIEWBOX}${bounded ? "&bounded=1" : ""}` +
    `&q=${encodeURIComponent(query)}`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 6000);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      cache: "no-store",
      headers: {
        "User-Agent": "scanpart-astana/1.0 (https://scanpart.kz)",
        Accept: "application/json",
      },
    });
    if (!res.ok) return null;
    const arr = (await res.json()) as Array<{ lat?: string; lon?: string; display_name?: string }>;
    const hit = arr?.[0];
    const lat = hit?.lat ? Number(hit.lat) : NaN;
    const lng = hit?.lon ? Number(hit.lon) : NaN;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return {
      lat: Math.round(lat * 1e6) / 1e6,
      lng: Math.round(lng * 1e6) / 1e6,
      display: hit?.display_name ?? "",
    };
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

export async function geocodeAddress(
  q: string
): Promise<{ lat: number; lng: number; display: string } | null> {
  const base = cleanAddress((q ?? "").trim());
  if (base.length < 3) return null;
  // Город в запрос (через пробел, без запятой — Nominatim так надёжнее), если
  // менеджер его не указал.
  const withCity = ASTANA_RE.test(base) ? base : `Астана ${base}`;
  // Без названия города: bounded-поиск и так ограничен Астаной, а лишний токен
  // «Астана» иногда мешает Nominatim найти дом (эмпирически «проспект
  // Республики 68» находится, а «Астана проспект Республики 68» — нет).
  const cityStripped = withCity.replace(/^\s*(?:астан[аеуы]?|нур-?султан[ае]?|целиноград[ае]?)\s*/i, "").trim();
  // Улица без номера дома — запасной вариант, если точный дом не находится.
  const streetOnly = withCity.replace(/\s+\d+[а-я]?$/i, "").trim();

  // Пробуем по очереди: точный адрес строго в Астане → он же без жёсткой рамки
  // (на случай кривой рамки OSM) → только улица. Первый результат внутри Астаны
  // побеждает; всё вне города отбрасываем (мы работаем только в Астане).
  // 1) Яндекс (если есть ключ) — самое точное по русским адресам КЗ.
  const y = await yandexGeocode(withCity);
  if (y && isInAstana(y.lat, y.lng)) return y;

  // 2) Бесплатный Nominatim: точный адрес строго в Астане → он же без жёсткой
  // рамки → только улица. Первый результат внутри Астаны побеждает.
  const attempts: Array<[string, boolean]> = [];
  if (cityStripped && cityStripped !== withCity) attempts.push([cityStripped, true]);
  attempts.push([withCity, true], [withCity, false]);
  if (streetOnly && streetOnly !== withCity) attempts.push([streetOnly, true]);

  for (const [query, bounded] of attempts) {
    const hit = await nominatim(query, bounded);
    if (hit && isInAstana(hit.lat, hit.lng)) return hit;
  }
  return null;
}
