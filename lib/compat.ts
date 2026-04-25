/**
 * Vehicle / part-name compatibility heuristic.
 *
 * Given the make/model/year decoded from the customer's VIN, look at the
 * raw part description that came back from Phaeton and decide whether the
 * part is likely compatible.
 *
 * - "match"   — make (or one of its synonyms) is mentioned in the description
 *               AND, if a year range like "(88-97)" or "94-2002" is present,
 *               the customer's year falls inside it.
 * - "unknown" — no positive signal, no negative signal — show as neutral.
 *
 * The heuristic is intentionally conservative: we never report "mismatch"
 * to avoid hiding universal parts. The UI shows a green ✓ on "match" and
 * neutral on "unknown".
 */

const MAKE_SYNONYMS: Record<string, string[]> = {
  toyota: ["toyota", "тойота"],
  lexus: ["lexus", "лексус"],
  nissan: ["nissan", "ниссан", "datsun", "датсун"],
  infiniti: ["infiniti", "инфинити"],
  honda: ["honda", "хонда", "acura", "акура"],
  mazda: ["mazda", "мазда"],
  mitsubishi: ["mitsubishi", "митсубиси", "mitsu"],
  subaru: ["subaru", "субару"],
  suzuki: ["suzuki", "сузуки"],
  hyundai: ["hyundai", "хёндай", "хундай"],
  kia: ["kia", "киа", "kia motors"],
  bmw: ["bmw", "бмв", "mini", "мини"],
  audi: ["audi", "ауди"],
  volkswagen: ["volkswagen", "vw", "фольксваген"],
  porsche: ["porsche", "порше"],
  skoda: ["skoda", "škoda", "шкода"],
  seat: ["seat", "сеат", "сеат"],
  "mercedes-benz": ["mercedes", "мерседес", "benz", "бенц", "amg"],
  ford: ["ford", "форд"],
  chevrolet: ["chevrolet", "chevy", "шевроле"],
  cadillac: ["cadillac", "кадиллак"],
  buick: ["buick", "бьюик"],
  gmc: ["gmc"],
  jeep: ["jeep", "джип"],
  dodge: ["dodge", "додж"],
  chrysler: ["chrysler", "крайслер"],
  ram: ["ram"],
  lincoln: ["lincoln", "линкольн"],
  renault: ["renault", "рено"],
  peugeot: ["peugeot", "пежо"],
  citroen: ["citroen", "ситроен", "citroën"],
  fiat: ["fiat", "фиат"],
  alfa: ["alfa", "альфа", "alfa romeo"],
  volvo: ["volvo", "вольво"],
  saab: ["saab", "сааб"],
  jaguar: ["jaguar", "ягуар"],
  "land rover": ["land rover", "ленд ровер", "range rover", "ленд-ровер"],
  mini: ["mini"],
  smart: ["smart"],
  opel: ["opel", "опель", "vauxhall"],
  lada: ["lada", "лада", "ваз", "vaz"],
  uaz: ["uaz", "уаз"],
  gaz: ["gaz", "газ"],
  daewoo: ["daewoo", "дэу"],
  chery: ["chery", "чери"],
  geely: ["geely", "джили", "джилли"],
  byd: ["byd"],
  haval: ["haval", "хавал"],
  great_wall: ["great wall", "грейт уолл"],
};

function normalize(s: string): string {
  return s.toLowerCase().trim();
}

function makeMatches(make: string, name: string): boolean {
  const m = normalize(make);
  const n = normalize(name);
  const synonyms = MAKE_SYNONYMS[m] ?? [m];
  return synonyms.some((syn) => n.includes(syn));
}

/** Try to extract a year range from the part description. */
function extractYearRange(name: string): { from: number; to: number } | null {
  // Patterns: (88-97), 88-97, (1988-1997), 88-, 88->...
  // We only handle the most common 2 patterns to stay conservative.
  const re = /\b(\d{2,4})\s*[-–—]\s*(\d{2,4})\b/g;
  let best: { from: number; to: number } | null = null;
  let match: RegExpExecArray | null;
  while ((match = re.exec(name)) !== null) {
    const a = expandYear(match[1]);
    const b = expandYear(match[2]);
    if (a && b && a <= b && b - a < 60) {
      best = { from: a, to: b };
    }
  }
  return best;
}

function expandYear(s: string): number | null {
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  if (n >= 1900 && n <= 2099) return n;
  if (n >= 0 && n <= 30) return 2000 + n; // 00..30 → 2000..2030
  if (n >= 31 && n <= 99) return 1900 + n; // 31..99 → 1931..1999
  return null;
}

export interface CompatVehicle {
  make: string;
  model?: string;
  year?: string | number;
}

export function classifyCompat(
  name: string,
  vehicle: CompatVehicle | undefined
): { compat: "match" | "unknown"; reason?: string } {
  if (!vehicle?.make) return { compat: "unknown" };

  const makeOk = makeMatches(vehicle.make, name);
  if (!makeOk) return { compat: "unknown" };

  // If we have a year, try to narrow with year-range hint.
  if (vehicle.year) {
    const y = Number(vehicle.year);
    const range = extractYearRange(name);
    if (range && Number.isFinite(y) && (y < range.from || y > range.to)) {
      // Make matches but year falls outside an explicit range — still show as
      // unknown rather than reject; not all listings carry accurate ranges.
      return { compat: "unknown", reason: `год ${y} вне диапазона ${range.from}–${range.to}` };
    }
    if (range) {
      return { compat: "match", reason: `${vehicle.make} ${range.from}–${range.to}` };
    }
  }
  return { compat: "match", reason: vehicle.make };
}
