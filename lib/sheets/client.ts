import { google, sheets_v4 } from "googleapis";
import { parseCoord, normalizeColor, parseMarkup, type Warehouse } from "@/lib/delivery/warehouse";
import type { Courier, Delivery, DeliveryStatus } from "@/lib/delivery/types";

const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];
const SETTINGS_RANGE = "Settings!A:B";
const ORDERS_SHEET = "Orders";
const USERS_SHEET = "Users";
const CONTENT_SHEET = "Content";
const IMAGES_SHEET = "ContentImages";
const THEME_SHEET = "Theme";
const CUSTOMERS_SHEET = "Customers";
const ALIASES_SHEET = "NameAliases";
const SEARCH_LOG_SHEET = "SearchLog";
const WAREHOUSES_SHEET = "Warehouses";
const COURIERS_SHEET = "Couriers";
const DELIVERIES_SHEET = "Deliveries";
const COURIER_LOC_SHEET = "CourierLocations";

export interface OrderRow {
  date: string;
  telegramId: string;
  clientName: string;
  vin: string;
  vehicle: string;
  partName: string;
  partArticle: string;
  brand: string;
  price: number;
  quantity: number;
  orderType: "Экспресс" | "Самовывоз";
  address: string;
  phone: string;
  whatsapp: string;
  status: string;
  /** Opaque supplier code (Р1/М2) — internal; used to auto-pick the warehouse. */
  source?: string;
}

export interface UserRow {
  email: string;
  passwordHash: string;
  role: "owner" | "manager";
  createdAt: string;
  active: boolean;
  rowNumber: number;
}

export interface ContentRow {
  key: string;
  ru: string;
  kk: string;
  en: string;
  where?: string;
}

export interface CustomerRow {
  email: string;
  passwordHash: string;
  name: string;
  phone: string;
  whatsapp: string;
  vins: string[]; // stored as JSON in the cell
  createdAt: string;
  rowNumber: number;
}

export interface ImageRow {
  slot: string;
  publicId: string;
  altRu: string;
  altKk: string;
  altEn: string;
}

/**
 * Словарь синонимов для поиска по названию. Phaeton не умеет искать
 * по словам — здесь админ вручную сопоставляет «колодки передние» →
 * перечень «BRAND|ARTICLE» парт-номеров, которые Phaeton уже понимает.
 */
export interface AliasRow {
  rowNumber: number;
  query: string;
  make: string;
  /** raw "BRAND|ARTICLE,BRAND|ARTICLE,…" текст из ячейки */
  articles: string;
  updatedAt: string;
  updatedBy: string;
}

export interface SearchLogRow {
  rowNumber: number;
  timestamp: string;
  query: string;
  make: string;
  model: string;
  vin: string;
  offersCount: number;
  customerEmail: string;
}

let _sheets: sheets_v4.Sheets | null = null;

function sheetsClient(): sheets_v4.Sheets {
  if (_sheets) return _sheets;
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64;
  if (!raw) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON_BASE64 is not set");
  const creds = JSON.parse(Buffer.from(raw, "base64").toString("utf8"));
  const auth = new google.auth.JWT(creds.client_email, undefined, creds.private_key, SCOPES);
  _sheets = google.sheets({ version: "v4", auth });
  return _sheets;
}

function spreadsheetId(): string {
  const id = process.env.SHEETS_SPREADSHEET_ID;
  if (!id) throw new Error("SHEETS_SPREADSHEET_ID is not set");
  return id;
}

// --- Settings ---------------------------------------------------------------

export async function readSetting(): Promise<Record<string, string>> {
  const sheets = sheetsClient();
  const { data } = await sheets.spreadsheets.values.get({
    spreadsheetId: spreadsheetId(),
    range: SETTINGS_RANGE,
  });
  const map: Record<string, string> = {};
  for (const row of data.values ?? []) {
    const [k, v] = row;
    if (typeof k === "string" && k && v != null) map[k] = String(v);
  }
  return map;
}

export async function writeSetting(key: string, value: string): Promise<void> {
  const sheets = sheetsClient();
  const id = spreadsheetId();
  const { data } = await sheets.spreadsheets.values.get({
    spreadsheetId: id,
    range: "Settings!A:A",
  });
  const rows = data.values ?? [];
  const rowIdx = rows.findIndex((r) => r[0] === key);
  if (rowIdx === -1) {
    await sheets.spreadsheets.values.append({
      spreadsheetId: id,
      range: "Settings!A:B",
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [[key, value]] },
    });
    return;
  }
  await sheets.spreadsheets.values.update({
    spreadsheetId: id,
    range: `Settings!B${rowIdx + 1}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [[value]] },
  });
}

// --- Orders -----------------------------------------------------------------

export async function appendOrder(row: OrderRow): Promise<number | null> {
  const sheets = sheetsClient();
  const values = [
    [
      row.date,
      row.telegramId,
      row.clientName,
      row.vin,
      row.vehicle,
      row.partName,
      row.partArticle,
      row.brand,
      row.price,
      row.quantity,
      row.orderType,
      row.address,
      row.phone,
      row.whatsapp,
      row.status,
      row.source ?? "",
    ],
  ];
  const res = await sheets.spreadsheets.values.append({
    spreadsheetId: spreadsheetId(),
    range: `${ORDERS_SHEET}!A:P`,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values },
  });
  const updatedRange = res.data.updates?.updatedRange;
  const match = updatedRange?.match(/!A(\d+):/);
  return match ? Number(match[1]) : null;
}

export interface OrderListItem extends OrderRow {
  rowNumber: number;
}

export async function listOrders(limit = 200): Promise<OrderListItem[]> {
  const sheets = sheetsClient();
  const { data } = await sheets.spreadsheets.values.get({
    spreadsheetId: spreadsheetId(),
    range: `${ORDERS_SHEET}!A2:P`,
  });
  const rows = data.values ?? [];
  return rows.slice(-limit).map((r, i) => ({
    rowNumber: rows.length - limit + i + 2 > 1 ? rows.length - (rows.length - i - 1) + 1 : i + 2,
    date: String(r[0] ?? ""),
    telegramId: String(r[1] ?? ""),
    clientName: String(r[2] ?? ""),
    vin: String(r[3] ?? ""),
    vehicle: String(r[4] ?? ""),
    partName: String(r[5] ?? ""),
    partArticle: String(r[6] ?? ""),
    brand: String(r[7] ?? ""),
    price: Number(r[8] ?? 0),
    quantity: Number(r[9] ?? 0),
    orderType: (String(r[10] ?? "Экспресс") as OrderRow["orderType"]),
    address: String(r[11] ?? ""),
    phone: String(r[12] ?? ""),
    whatsapp: String(r[13] ?? ""),
    status: String(r[14] ?? "Новый"),
    source: String(r[15] ?? ""),
  }));
}

export async function setOrderStatus(rowNumber: number, status: string): Promise<void> {
  const sheets = sheetsClient();
  await sheets.spreadsheets.values.update({
    spreadsheetId: spreadsheetId(),
    range: `${ORDERS_SHEET}!O${rowNumber}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [[status]] },
  });
}

/** Update the fulfilment type (col K) and/or delivery address (col L). */
export async function updateOrderFulfilment(
  rowNumber: number,
  patch: { orderType?: string; address?: string }
): Promise<void> {
  const sheets = sheetsClient();
  const id = spreadsheetId();
  const updates: { range: string; values: string[][] }[] = [];
  if (patch.orderType !== undefined)
    updates.push({ range: `${ORDERS_SHEET}!K${rowNumber}`, values: [[patch.orderType]] });
  if (patch.address !== undefined)
    updates.push({ range: `${ORDERS_SHEET}!L${rowNumber}`, values: [[patch.address]] });
  if (!updates.length) return;
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: id,
    requestBody: { valueInputOption: "USER_ENTERED", data: updates },
  });
}

export async function deleteOrder(rowNumber: number): Promise<void> {
  await deleteSheetRow(ORDERS_SHEET, rowNumber);
}

// --- Users ------------------------------------------------------------------

export async function listUsers(): Promise<UserRow[]> {
  const sheets = sheetsClient();
  const { data } = await sheets.spreadsheets.values.get({
    spreadsheetId: spreadsheetId(),
    range: `${USERS_SHEET}!A2:E`,
  });
  return (data.values ?? []).map((r, i) => ({
    rowNumber: i + 2,
    email: String(r[0] ?? "").toLowerCase(),
    passwordHash: String(r[1] ?? ""),
    role: (String(r[2] ?? "manager") as UserRow["role"]) || "manager",
    createdAt: String(r[3] ?? ""),
    active: String(r[4] ?? "TRUE").toUpperCase() !== "FALSE",
  })).filter((u) => u.email);
}

export async function findUser(email: string): Promise<UserRow | null> {
  const all = await listUsers();
  return all.find((u) => u.email === email.toLowerCase()) ?? null;
}

export async function appendUser(input: Omit<UserRow, "rowNumber">): Promise<void> {
  const sheets = sheetsClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId: spreadsheetId(),
    range: `${USERS_SHEET}!A:E`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [
        [
          input.email.toLowerCase(),
          input.passwordHash,
          input.role,
          input.createdAt,
          input.active ? "TRUE" : "FALSE",
        ],
      ],
    },
  });
}

export async function updateUser(
  rowNumber: number,
  patch: Partial<Pick<UserRow, "passwordHash" | "role" | "active">>
): Promise<void> {
  const sheets = sheetsClient();
  const id = spreadsheetId();
  if (patch.passwordHash !== undefined) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: id,
      range: `${USERS_SHEET}!B${rowNumber}`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [[patch.passwordHash]] },
    });
  }
  if (patch.role !== undefined) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: id,
      range: `${USERS_SHEET}!C${rowNumber}`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [[patch.role]] },
    });
  }
  if (patch.active !== undefined) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: id,
      range: `${USERS_SHEET}!E${rowNumber}`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [[patch.active ? "TRUE" : "FALSE"]] },
    });
  }
}

// --- Content (i18n CMS) ------------------------------------------------------

export async function readContent(): Promise<ContentRow[]> {
  const sheets = sheetsClient();
  const { data } = await sheets.spreadsheets.values.get({
    spreadsheetId: spreadsheetId(),
    range: `${CONTENT_SHEET}!A2:G`,
  });
  return (data.values ?? [])
    .map((r) => ({
      key: String(r[0] ?? "").trim(),
      ru: String(r[1] ?? ""),
      kk: String(r[2] ?? ""),
      en: String(r[3] ?? ""),
      where: String(r[6] ?? ""),
    }))
    .filter((c) => c.key);
}

export async function writeContentWhere(key: string, where: string): Promise<void> {
  const sheets = sheetsClient();
  const id = spreadsheetId();
  const { data } = await sheets.spreadsheets.values.get({
    spreadsheetId: id,
    range: `${CONTENT_SHEET}!A:A`,
  });
  const rows = data.values ?? [];
  const rowIdx = rows.findIndex((r) => r[0] === key);
  if (rowIdx === -1) return;
  await sheets.spreadsheets.values.update({
    spreadsheetId: id,
    range: `${CONTENT_SHEET}!G${rowIdx + 1}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [[where]] },
  });
}

export async function writeContent(
  key: string,
  locale: "ru" | "kk" | "en",
  value: string,
  by: string
): Promise<void> {
  const sheets = sheetsClient();
  const id = spreadsheetId();
  const { data } = await sheets.spreadsheets.values.get({
    spreadsheetId: id,
    range: `${CONTENT_SHEET}!A:A`,
  });
  const rows = data.values ?? [];
  const rowIdx = rows.findIndex((r) => r[0] === key);
  const col = { ru: "B", kk: "C", en: "D" }[locale];
  if (rowIdx === -1) {
    const fresh: string[] = [key, "", "", "", new Date().toISOString(), by];
    fresh[{ ru: 1, kk: 2, en: 3 }[locale]] = value;
    await sheets.spreadsheets.values.append({
      spreadsheetId: id,
      range: `${CONTENT_SHEET}!A:F`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [fresh] },
    });
    return;
  }
  const rowNumber = rowIdx + 1;
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: id,
    requestBody: {
      valueInputOption: "USER_ENTERED",
      data: [
        { range: `${CONTENT_SHEET}!${col}${rowNumber}`, values: [[value]] },
        {
          range: `${CONTENT_SHEET}!E${rowNumber}:F${rowNumber}`,
          values: [[new Date().toISOString(), by]],
        },
      ],
    },
  });
}

/** Replace the entire Content sheet body in a single batch call. */
export async function bulkWriteContent(rows: ContentRow[]): Promise<void> {
  const sheets = sheetsClient();
  const id = spreadsheetId();
  const now = new Date().toISOString();
  const values: (string | number)[][] = rows.map((r) => [
    r.key,
    r.ru,
    r.kk,
    r.en,
    now,
    "setup",
  ]);
  // Clear existing rows below the header, then write all at once.
  await sheets.spreadsheets.values.clear({
    spreadsheetId: id,
    range: `${CONTENT_SHEET}!A2:F`,
  });
  if (values.length === 0) return;
  await sheets.spreadsheets.values.update({
    spreadsheetId: id,
    range: `${CONTENT_SHEET}!A2:F${1 + values.length}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values },
  });
}

/** Replace the entire Settings sheet body in one call. */
export async function bulkWriteSettings(map: Record<string, string>): Promise<void> {
  const sheets = sheetsClient();
  const id = spreadsheetId();
  const values = Object.entries(map);
  await sheets.spreadsheets.values.clear({
    spreadsheetId: id,
    range: `Settings!A2:B`,
  });
  if (values.length === 0) return;
  await sheets.spreadsheets.values.update({
    spreadsheetId: id,
    range: `Settings!A2:B${1 + values.length}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values },
  });
}

/** Replace the entire Theme sheet body in one call. */
export async function bulkWriteTheme(map: Record<string, string>): Promise<void> {
  const sheets = sheetsClient();
  const id = spreadsheetId();
  const values = Object.entries(map);
  await sheets.spreadsheets.values.clear({
    spreadsheetId: id,
    range: `${THEME_SHEET}!A2:B`,
  });
  if (values.length === 0) return;
  await sheets.spreadsheets.values.update({
    spreadsheetId: id,
    range: `${THEME_SHEET}!A2:B${1 + values.length}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values },
  });
}

// --- ContentImages -----------------------------------------------------------

export async function readImages(): Promise<ImageRow[]> {
  const sheets = sheetsClient();
  const { data } = await sheets.spreadsheets.values.get({
    spreadsheetId: spreadsheetId(),
    range: `${IMAGES_SHEET}!A2:E`,
  });
  return (data.values ?? [])
    .map((r) => ({
      slot: String(r[0] ?? "").trim(),
      publicId: String(r[1] ?? ""),
      altRu: String(r[2] ?? ""),
      altKk: String(r[3] ?? ""),
      altEn: String(r[4] ?? ""),
    }))
    .filter((i) => i.slot);
}

export async function writeImage(
  slot: string,
  patch: { publicId?: string; altRu?: string; altKk?: string; altEn?: string }
): Promise<void> {
  const sheets = sheetsClient();
  const id = spreadsheetId();
  const { data } = await sheets.spreadsheets.values.get({
    spreadsheetId: id,
    range: `${IMAGES_SHEET}!A:A`,
  });
  const rows = data.values ?? [];
  const rowIdx = rows.findIndex((r) => r[0] === slot);
  if (rowIdx === -1) {
    await sheets.spreadsheets.values.append({
      spreadsheetId: id,
      range: `${IMAGES_SHEET}!A:F`,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [
          [
            slot,
            patch.publicId ?? "",
            patch.altRu ?? "",
            patch.altKk ?? "",
            patch.altEn ?? "",
            new Date().toISOString(),
          ],
        ],
      },
    });
    return;
  }
  const rowNumber = rowIdx + 1;
  const updates: { range: string; values: string[][] }[] = [];
  if (patch.publicId !== undefined)
    updates.push({ range: `${IMAGES_SHEET}!B${rowNumber}`, values: [[patch.publicId]] });
  if (patch.altRu !== undefined)
    updates.push({ range: `${IMAGES_SHEET}!C${rowNumber}`, values: [[patch.altRu]] });
  if (patch.altKk !== undefined)
    updates.push({ range: `${IMAGES_SHEET}!D${rowNumber}`, values: [[patch.altKk]] });
  if (patch.altEn !== undefined)
    updates.push({ range: `${IMAGES_SHEET}!E${rowNumber}`, values: [[patch.altEn]] });
  updates.push({
    range: `${IMAGES_SHEET}!F${rowNumber}`,
    values: [[new Date().toISOString()]],
  });
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: id,
    requestBody: { valueInputOption: "USER_ENTERED", data: updates },
  });
}

// --- Theme -------------------------------------------------------------------

export async function readTheme(): Promise<Record<string, string>> {
  const sheets = sheetsClient();
  const { data } = await sheets.spreadsheets.values.get({
    spreadsheetId: spreadsheetId(),
    range: `${THEME_SHEET}!A:B`,
  });
  const map: Record<string, string> = {};
  for (const row of data.values ?? []) {
    const [k, v] = row;
    if (typeof k === "string" && k && v != null) map[k] = String(v);
  }
  return map;
}

export async function writeTheme(key: string, value: string): Promise<void> {
  const sheets = sheetsClient();
  const id = spreadsheetId();
  const { data } = await sheets.spreadsheets.values.get({
    spreadsheetId: id,
    range: `${THEME_SHEET}!A:A`,
  });
  const rows = data.values ?? [];
  const rowIdx = rows.findIndex((r) => r[0] === key);
  if (rowIdx === -1) {
    await sheets.spreadsheets.values.append({
      spreadsheetId: id,
      range: `${THEME_SHEET}!A:B`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [[key, value]] },
    });
    return;
  }
  await sheets.spreadsheets.values.update({
    spreadsheetId: id,
    range: `${THEME_SHEET}!B${rowIdx + 1}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [[value]] },
  });
}

// --- Bootstrap (create all sheets + headers) ---------------------------------

// --- Warehouses --------------------------------------------------------------

export async function readWarehouses(): Promise<Warehouse[]> {
  const sheets = sheetsClient();
  const { data } = await sheets.spreadsheets.values.get({
    spreadsheetId: spreadsheetId(),
    range: `${WAREHOUSES_SHEET}!A2:K`,
  });
  return (data.values ?? [])
    .map((r) => ({
      id: String(r[0] ?? "").trim(),
      name: String(r[1] ?? "").trim(),
      address: String(r[2] ?? ""),
      lat: parseCoord(r[3] as string | number | null),
      lng: parseCoord(r[4] as string | number | null),
      pickupMinutes: Number(r[5] ?? 0) || 0,
      active: String(r[6] ?? "").toLowerCase() !== "false",
      sourceCode: String(r[8] ?? "").trim(),
      color: normalizeColor(String(r[9] ?? "")),
      markup: parseMarkup(r[10] as string | number | null),
    }))
    .filter((w) => w.id);
}

/** Create or update a warehouse (matched by id). */
export async function upsertWarehouse(w: Warehouse): Promise<void> {
  const sheets = sheetsClient();
  const id = spreadsheetId();
  const row = [
    w.id,
    w.name,
    w.address,
    w.lat ?? "",
    w.lng ?? "",
    w.pickupMinutes,
    w.active ? "true" : "false",
    new Date().toISOString(),
    w.sourceCode ?? "",
    w.color ?? "",
    w.markup ?? "",
  ];
  const { data } = await sheets.spreadsheets.values.get({
    spreadsheetId: id,
    range: `${WAREHOUSES_SHEET}!A:A`,
  });
  const rowIdx = (data.values ?? []).findIndex((r) => r[0] === w.id);
  if (rowIdx === -1) {
    await sheets.spreadsheets.values.append({
      spreadsheetId: id,
      range: `${WAREHOUSES_SHEET}!A:K`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [row] },
    });
    return;
  }
  await sheets.spreadsheets.values.update({
    spreadsheetId: id,
    range: `${WAREHOUSES_SHEET}!A${rowIdx + 1}:K${rowIdx + 1}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [row] },
  });
}

export async function deleteWarehouse(warehouseId: string): Promise<void> {
  const sheets = sheetsClient();
  const { data } = await sheets.spreadsheets.values.get({
    spreadsheetId: spreadsheetId(),
    range: `${WAREHOUSES_SHEET}!A:A`,
  });
  const rowIdx = (data.values ?? []).findIndex((r) => r[0] === warehouseId);
  if (rowIdx === -1) return;
  await deleteSheetRow(WAREHOUSES_SHEET, rowIdx + 1);
}

// --- Couriers ----------------------------------------------------------------

export async function readCouriers(): Promise<Courier[]> {
  const sheets = sheetsClient();
  const { data } = await sheets.spreadsheets.values.get({
    spreadsheetId: spreadsheetId(),
    range: `${COURIERS_SHEET}!A2:I`,
  });
  const rate = (v: unknown) => {
    const n = Number(String(v ?? "").trim().replace(",", "."));
    return Number.isFinite(n) ? n : 0;
  };
  return (data.values ?? [])
    .map((r) => ({
      id: String(r[0] ?? "").trim(),
      name: String(r[1] ?? "").trim(),
      phone: String(r[2] ?? "").trim(),
      login: String(r[3] ?? "").trim(),
      passwordHash: String(r[4] ?? ""),
      active: String(r[5] ?? "").toLowerCase() !== "false",
      whatsapp: String(r[7] ?? "").trim(),
      ratePerTrip: rate(r[8]),
    }))
    .filter((c) => c.id);
}

export async function findCourierByLogin(login: string): Promise<Courier | null> {
  const all = await readCouriers();
  const l = login.trim().toLowerCase();
  return all.find((c) => c.login.toLowerCase() === l) ?? null;
}

/** Create/update a courier. `passwordHash` empty on update keeps the old one. */
export async function upsertCourier(c: Courier): Promise<void> {
  const sheets = sheetsClient();
  const id = spreadsheetId();
  const { data } = await sheets.spreadsheets.values.get({
    spreadsheetId: id,
    range: `${COURIERS_SHEET}!A:A`,
  });
  const rows = data.values ?? [];
  const rowIdx = rows.findIndex((r) => r[0] === c.id);
  if (rowIdx === -1) {
    await sheets.spreadsheets.values.append({
      spreadsheetId: id,
      range: `${COURIERS_SHEET}!A:I`,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [
          [c.id, c.name, c.phone, c.login, c.passwordHash, c.active ? "true" : "false", new Date().toISOString(), c.whatsapp ?? "", String(c.ratePerTrip ?? 0)],
        ],
      },
    });
    return;
  }
  const rowNumber = rowIdx + 1;
  const updates: { range: string; values: string[][] }[] = [
    { range: `${COURIERS_SHEET}!B${rowNumber}`, values: [[c.name]] },
    { range: `${COURIERS_SHEET}!C${rowNumber}`, values: [[c.phone]] },
    { range: `${COURIERS_SHEET}!D${rowNumber}`, values: [[c.login]] },
    { range: `${COURIERS_SHEET}!F${rowNumber}`, values: [[c.active ? "true" : "false"]] },
    { range: `${COURIERS_SHEET}!H${rowNumber}`, values: [[c.whatsapp ?? ""]] },
    { range: `${COURIERS_SHEET}!I${rowNumber}`, values: [[String(c.ratePerTrip ?? 0)]] },
  ];
  if (c.passwordHash) updates.push({ range: `${COURIERS_SHEET}!E${rowNumber}`, values: [[c.passwordHash]] });
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: id,
    requestBody: { valueInputOption: "USER_ENTERED", data: updates },
  });
}

export async function deleteCourier(courierId: string): Promise<void> {
  const sheets = sheetsClient();
  const { data } = await sheets.spreadsheets.values.get({
    spreadsheetId: spreadsheetId(),
    range: `${COURIERS_SHEET}!A:A`,
  });
  const rowIdx = (data.values ?? []).findIndex((r) => r[0] === courierId);
  if (rowIdx === -1) return;
  await deleteSheetRow(COURIERS_SHEET, rowIdx + 1);
}

// --- Courier live locations (latest position per courier) --------------------

export interface CourierLocation {
  courierId: string;
  lat: number;
  lng: number;
  updatedAt: string;
}

export async function readCourierLocations(): Promise<CourierLocation[]> {
  const sheets = sheetsClient();
  // Читаем с A1 (а не A2): если у листа нет строки-заголовка, локации лежат с
  // первой строки. Строка-заголовок (если есть) отфильтруется — lat="lat"→NaN.
  const { data } = await sheets.spreadsheets.values.get({
    spreadsheetId: spreadsheetId(),
    range: `${COURIER_LOC_SHEET}!A1:D`,
  });
  // Локаль таблицы пишет дробную часть через запятую («51,1345»), а Number()
  // такое не парсит → координаты терялись. Меняем запятую на точку.
  const num = (v: unknown) => Number(String(v ?? "").trim().replace(",", "."));
  return (data.values ?? [])
    .map((r) => ({
      courierId: String(r[0] ?? "").trim(),
      lat: num(r[1]),
      lng: num(r[2]),
      updatedAt: String(r[3] ?? ""),
    }))
    .filter((l) => l.courierId && Number.isFinite(l.lat) && Number.isFinite(l.lng));
}

export async function upsertCourierLocation(
  courierId: string,
  lat: number,
  lng: number
): Promise<void> {
  const sheets = sheetsClient();
  const id = spreadsheetId();
  const row = [courierId, lat, lng, new Date().toISOString()];
  const { data } = await sheets.spreadsheets.values.get({
    spreadsheetId: id,
    range: `${COURIER_LOC_SHEET}!A:A`,
  });
  const rowIdx = (data.values ?? []).findIndex((r) => r[0] === courierId);
  if (rowIdx === -1) {
    await sheets.spreadsheets.values.append({
      spreadsheetId: id,
      range: `${COURIER_LOC_SHEET}!A:D`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [row] },
    });
    return;
  }
  await sheets.spreadsheets.values.update({
    spreadsheetId: id,
    range: `${COURIER_LOC_SHEET}!A${rowIdx + 1}:D${rowIdx + 1}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [row] },
  });
}

// --- Deliveries --------------------------------------------------------------

function rowToDelivery(r: unknown[]): Delivery {
  return {
    id: String(r[0] ?? "").trim(),
    createdAt: String(r[1] ?? ""),
    customerName: String(r[2] ?? ""),
    phone: String(r[3] ?? ""),
    whatsapp: String(r[4] ?? ""),
    address: String(r[5] ?? ""),
    lat: parseCoord(r[6] as string | number | null),
    lng: parseCoord(r[7] as string | number | null),
    items: String(r[8] ?? ""),
    warehouseIds: String(r[9] ?? "").split(",").map((s) => s.trim()).filter(Boolean),
    courierId: String(r[10] ?? "").trim(),
    status: (String(r[11] ?? "new").trim() || "new") as DeliveryStatus,
    handoverCode: String(r[12] ?? ""),
    deliveredAt: String(r[13] ?? ""),
  };
}

function deliveryToRow(d: Delivery): (string | number)[] {
  return [
    d.id,
    d.createdAt,
    d.customerName,
    d.phone,
    d.whatsapp,
    d.address,
    d.lat ?? "",
    d.lng ?? "",
    d.items,
    d.warehouseIds.join(","),
    d.courierId,
    d.status,
    d.handoverCode,
    d.deliveredAt,
  ];
}

export async function readDeliveries(): Promise<Delivery[]> {
  const sheets = sheetsClient();
  const { data } = await sheets.spreadsheets.values.get({
    spreadsheetId: spreadsheetId(),
    range: `${DELIVERIES_SHEET}!A2:N`,
  });
  return (data.values ?? []).map(rowToDelivery).filter((d) => d.id);
}

export async function upsertDelivery(d: Delivery): Promise<void> {
  const sheets = sheetsClient();
  const id = spreadsheetId();
  const { data } = await sheets.spreadsheets.values.get({
    spreadsheetId: id,
    range: `${DELIVERIES_SHEET}!A:A`,
  });
  const rowIdx = (data.values ?? []).findIndex((r) => r[0] === d.id);
  if (rowIdx === -1) {
    await sheets.spreadsheets.values.append({
      spreadsheetId: id,
      range: `${DELIVERIES_SHEET}!A:N`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [deliveryToRow(d)] },
    });
    return;
  }
  await sheets.spreadsheets.values.update({
    spreadsheetId: id,
    range: `${DELIVERIES_SHEET}!A${rowIdx + 1}:N${rowIdx + 1}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [deliveryToRow(d)] },
  });
}

export async function getDelivery(deliveryId: string): Promise<Delivery | null> {
  const all = await readDeliveries();
  return all.find((d) => d.id === deliveryId) ?? null;
}

export async function deleteDelivery(deliveryId: string): Promise<void> {
  const sheets = sheetsClient();
  const { data } = await sheets.spreadsheets.values.get({
    spreadsheetId: spreadsheetId(),
    range: `${DELIVERIES_SHEET}!A:A`,
  });
  const rowIdx = (data.values ?? []).findIndex((r) => r[0] === deliveryId);
  if (rowIdx === -1) return;
  await deleteSheetRow(DELIVERIES_SHEET, rowIdx + 1);
}

const SHEET_HEADERS: Record<string, string[]> = {
  Settings: ["key", "value"],
  SaleCache: ["brand", "article", "name", "applicability", "make", "priceRaw", "oldPrice", "delivery", "available"],
  Orders: [
    "Date",
    "Telegram ID",
    "Имя клиента",
    "VIN",
    "Марка авто",
    "Запчасть",
    "Парт-номер",
    "Бренд",
    "Цена",
    "Количество",
    "Тип получения",
    "Адрес",
    "Телефон",
    "WhatsApp",
    "Статус",
    "Склад (источник)",
  ],
  Users: ["email", "password_hash", "role", "created_at", "active"],
  Content: ["key", "ru", "kk", "en", "updated_at", "updated_by", "where"],
  ContentImages: ["slot", "public_id", "alt_ru", "alt_kk", "alt_en", "updated_at"],
  Theme: ["key", "value"],
  Customers: [
    "email",
    "password_hash",
    "name",
    "phone",
    "whatsapp",
    "vins",
    "created_at",
  ],
  NameAliases: ["query", "make", "articles", "updated_at", "updated_by"],
  SearchLog: [
    "timestamp",
    "query",
    "make",
    "model",
    "vin",
    "offers_count",
    "customer_email",
  ],
  Warehouses: [
    "id",
    "name",
    "address",
    "lat",
    "lng",
    "pickup_minutes",
    "active",
    "updated_at",
    "source_code",
    "color",
    "markup",
  ],
  Couriers: ["id", "name", "phone", "login", "password_hash", "active", "created_at", "whatsapp", "rate_per_trip"],
  CourierLocations: ["courier_id", "lat", "lng", "updated_at"],
  Deliveries: [
    "id",
    "created_at",
    "customer_name",
    "phone",
    "whatsapp",
    "address",
    "lat",
    "lng",
    "items",
    "warehouse_ids",
    "courier_id",
    "status",
    "handover_code",
    "delivered_at",
  ],
};

// --- Sale cache (накопитель распродажи, пишется синком, читается /api/sale) ---
const SALE_SHEET = "SaleCache";

export async function readSaleCache(): Promise<string[][]> {
  const sheets = sheetsClient();
  try {
    const { data } = await sheets.spreadsheets.values.get({
      spreadsheetId: spreadsheetId(),
      range: `${SALE_SHEET}!A2:I`,
    });
    return (data.values ?? []) as string[][];
  } catch {
    return [];
  }
}

export async function clearSaleCache(): Promise<void> {
  const sheets = sheetsClient();
  await sheets.spreadsheets.values.clear({
    spreadsheetId: spreadsheetId(),
    range: `${SALE_SHEET}!A2:I`,
  });
}

export async function appendSaleCache(rows: (string | number)[][]): Promise<void> {
  if (!rows.length) return;
  const sheets = sheetsClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId: spreadsheetId(),
    range: `${SALE_SHEET}!A:I`,
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: rows },
  });
}

export async function ensureSheetStructure(): Promise<void> {
  const sheets = sheetsClient();
  const id = spreadsheetId();
  const { data } = await sheets.spreadsheets.get({ spreadsheetId: id });
  const have = new Set(
    (data.sheets ?? [])
      .map((s) => s.properties?.title)
      .filter(Boolean) as string[]
  );

  const requests: sheets_v4.Schema$Request[] = [];
  for (const title of Object.keys(SHEET_HEADERS)) {
    if (!have.has(title)) {
      requests.push({ addSheet: { properties: { title } } });
    }
  }
  if (requests.length) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: id,
      requestBody: { requests },
    });
  }
  // Write headers (idempotent — overwrites row 1 only)
  const dataUpdates = Object.entries(SHEET_HEADERS).map(([title, hdr]) => ({
    range: `${title}!A1:${String.fromCharCode(64 + hdr.length)}1`,
    values: [hdr],
  }));
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: id,
    requestBody: { valueInputOption: "RAW", data: dataUpdates },
  });
}

// --- Customers (storefront accounts) ----------------------------------------

function parseVins(raw: string | undefined): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((s) => typeof s === "string") : [];
  } catch {
    return raw
      .split(/[,\s]+/)
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);
  }
}

export async function listCustomers(): Promise<CustomerRow[]> {
  const sheets = sheetsClient();
  const { data } = await sheets.spreadsheets.values.get({
    spreadsheetId: spreadsheetId(),
    range: `${CUSTOMERS_SHEET}!A2:G`,
  });
  return (data.values ?? [])
    .map((r, i) => ({
      rowNumber: i + 2,
      email: String(r[0] ?? "").toLowerCase(),
      passwordHash: String(r[1] ?? ""),
      name: String(r[2] ?? ""),
      phone: String(r[3] ?? ""),
      whatsapp: String(r[4] ?? ""),
      vins: parseVins(String(r[5] ?? "")),
      createdAt: String(r[6] ?? ""),
    }))
    .filter((c) => c.email);
}

export async function findCustomer(email: string): Promise<CustomerRow | null> {
  const all = await listCustomers();
  return all.find((c) => c.email === email.toLowerCase()) ?? null;
}

export async function appendCustomer(
  input: Omit<CustomerRow, "rowNumber">
): Promise<void> {
  const sheets = sheetsClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId: spreadsheetId(),
    range: `${CUSTOMERS_SHEET}!A:G`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [
        [
          input.email.toLowerCase(),
          input.passwordHash,
          input.name,
          input.phone,
          input.whatsapp ?? "",
          JSON.stringify(input.vins ?? []),
          input.createdAt,
        ],
      ],
    },
  });
}

export async function updateCustomerVins(
  email: string,
  vins: string[]
): Promise<void> {
  const sheets = sheetsClient();
  const id = spreadsheetId();
  const cur = await findCustomer(email);
  if (!cur) return;
  await sheets.spreadsheets.values.update({
    spreadsheetId: id,
    range: `${CUSTOMERS_SHEET}!F${cur.rowNumber}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [[JSON.stringify(vins)]] },
  });
}

export async function updateCustomerProfile(
  email: string,
  patch: Partial<Pick<CustomerRow, "name" | "phone" | "whatsapp" | "passwordHash">>
): Promise<void> {
  const sheets = sheetsClient();
  const id = spreadsheetId();
  const cur = await findCustomer(email);
  if (!cur) return;
  const cells: { range: string; values: string[][] }[] = [];
  if (patch.passwordHash !== undefined)
    cells.push({
      range: `${CUSTOMERS_SHEET}!B${cur.rowNumber}`,
      values: [[patch.passwordHash]],
    });
  if (patch.name !== undefined)
    cells.push({
      range: `${CUSTOMERS_SHEET}!C${cur.rowNumber}`,
      values: [[patch.name]],
    });
  if (patch.phone !== undefined)
    cells.push({
      range: `${CUSTOMERS_SHEET}!D${cur.rowNumber}`,
      values: [[patch.phone]],
    });
  if (patch.whatsapp !== undefined)
    cells.push({
      range: `${CUSTOMERS_SHEET}!E${cur.rowNumber}`,
      values: [[patch.whatsapp]],
    });
  if (cells.length === 0) return;
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: id,
    requestBody: { valueInputOption: "USER_ENTERED", data: cells },
  });
}

/** Filter Orders by Telegram-ID column (we reuse it to store customer email). */
export async function listOrdersByCustomer(email: string): Promise<OrderListItem[]> {
  const all = await listOrders(500);
  const target = email.toLowerCase();
  return all.filter((o) => o.telegramId.toLowerCase() === target);
}

// --- NameAliases (manual dictionary for name → part-numbers) -----------------

export async function listAliases(): Promise<AliasRow[]> {
  const sheets = sheetsClient();
  const { data } = await sheets.spreadsheets.values.get({
    spreadsheetId: spreadsheetId(),
    range: `${ALIASES_SHEET}!A2:E`,
  });
  return (data.values ?? [])
    .map((r, i) => ({
      rowNumber: i + 2,
      query: String(r[0] ?? "").trim(),
      make: String(r[1] ?? "").trim(),
      articles: String(r[2] ?? "").trim(),
      updatedAt: String(r[3] ?? ""),
      updatedBy: String(r[4] ?? ""),
    }))
    .filter((a) => a.query);
}

export async function appendAlias(input: {
  query: string;
  make: string;
  articles: string;
  by: string;
}): Promise<void> {
  const sheets = sheetsClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId: spreadsheetId(),
    range: `${ALIASES_SHEET}!A:E`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [[input.query, input.make, input.articles, new Date().toISOString(), input.by]],
    },
  });
}

export async function updateAlias(
  rowNumber: number,
  patch: { query?: string; make?: string; articles?: string; by: string }
): Promise<void> {
  const sheets = sheetsClient();
  const id = spreadsheetId();
  const cells: { range: string; values: string[][] }[] = [];
  if (patch.query !== undefined)
    cells.push({ range: `${ALIASES_SHEET}!A${rowNumber}`, values: [[patch.query]] });
  if (patch.make !== undefined)
    cells.push({ range: `${ALIASES_SHEET}!B${rowNumber}`, values: [[patch.make]] });
  if (patch.articles !== undefined)
    cells.push({ range: `${ALIASES_SHEET}!C${rowNumber}`, values: [[patch.articles]] });
  cells.push({
    range: `${ALIASES_SHEET}!D${rowNumber}:E${rowNumber}`,
    values: [[new Date().toISOString(), patch.by]],
  });
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: id,
    requestBody: { valueInputOption: "USER_ENTERED", data: cells },
  });
}

export async function deleteAlias(rowNumber: number): Promise<void> {
  await deleteSheetRow(ALIASES_SHEET, rowNumber);
}

/** Bulk-append aliases — used by the CSV/TSV importer. */
export async function bulkAppendAliases(
  rows: Array<{ query: string; make: string; articles: string }>,
  by: string
): Promise<number> {
  if (!rows.length) return 0;
  const sheets = sheetsClient();
  const now = new Date().toISOString();
  await sheets.spreadsheets.values.append({
    spreadsheetId: spreadsheetId(),
    range: `${ALIASES_SHEET}!A:E`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: rows.map((r) => [r.query, r.make, r.articles, now, by]),
    },
  });
  return rows.length;
}

// --- SearchLog (failed name-search queries) ---------------------------------

export async function appendSearchLog(row: Omit<SearchLogRow, "rowNumber">): Promise<void> {
  const sheets = sheetsClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId: spreadsheetId(),
    range: `${SEARCH_LOG_SHEET}!A:G`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [
        [
          row.timestamp,
          row.query,
          row.make,
          row.model,
          row.vin,
          row.offersCount,
          row.customerEmail,
        ],
      ],
    },
  });
}

export async function listSearchLog(limit = 1000): Promise<SearchLogRow[]> {
  const sheets = sheetsClient();
  const { data } = await sheets.spreadsheets.values.get({
    spreadsheetId: spreadsheetId(),
    range: `${SEARCH_LOG_SHEET}!A2:G`,
  });
  const rows = data.values ?? [];
  const start = Math.max(0, rows.length - limit);
  return rows.slice(start).map((r, i) => ({
    rowNumber: start + i + 2,
    timestamp: String(r[0] ?? ""),
    query: String(r[1] ?? ""),
    make: String(r[2] ?? ""),
    model: String(r[3] ?? ""),
    vin: String(r[4] ?? ""),
    offersCount: Number(r[5] ?? 0),
    customerEmail: String(r[6] ?? ""),
  }));
}

export async function clearSearchLog(): Promise<void> {
  const sheets = sheetsClient();
  await sheets.spreadsheets.values.clear({
    spreadsheetId: spreadsheetId(),
    range: `${SEARCH_LOG_SHEET}!A2:G`,
  });
}

// --- Internal helper --------------------------------------------------------

async function deleteSheetRow(sheetTitle: string, rowNumber: number): Promise<void> {
  const sheets = sheetsClient();
  const id = spreadsheetId();
  const meta = await sheets.spreadsheets.get({ spreadsheetId: id });
  const tab = (meta.data.sheets ?? []).find((s) => s.properties?.title === sheetTitle);
  const sheetId = tab?.properties?.sheetId;
  if (sheetId == null) return;
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: id,
    requestBody: {
      requests: [
        {
          deleteDimension: {
            range: {
              sheetId,
              dimension: "ROWS",
              startIndex: rowNumber - 1,
              endIndex: rowNumber,
            },
          },
        },
      ],
    },
  });
}
