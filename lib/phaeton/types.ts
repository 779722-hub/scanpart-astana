/**
 * Types modelled after the public Phaeton DC API docs:
 * https://api.phaeton.kz/Help/Search  (article → brands → prices)
 * https://api.phaeton.kz/Help/Orders  (dictionary, warehouses)
 *
 * Field names mirror PascalCase from the documentation.
 */

export interface PhaetonBrandItem {
  Brand: string;
  Article: string;
  Name: string;
}

export interface PhaetonBrandsResponse {
  Items: PhaetonBrandItem[];
  IsError: boolean;
  ErrorMessage?: string | null;
}

export interface PhaetonPriceItem {
  Brand: string;
  Article: string;
  CleanArticle?: string;
  Name?: string;
  Price: number;
  CurrencyCode?: string;
  AvailableCount?: number;
  Presence?: string;
  WarehouseId?: string;
  Warehouse?: string;
  ItemId?: string;
  SupplierId?: number | null;
  ExpectedDelivery?: number;
  GuaranteedDelivery?: number;
  ExpectedShipmentDays?: number;
  GuaranteedShipmentDays?: number;
  DeliveryProbability?: number;
  Using?: string;
  // Any additional unknown fields are accepted silently.
}

export interface PhaetonPricesResponse {
  Items: PhaetonPriceItem[];
  IsError: boolean;
  ErrorMessage?: string | null;
}

export interface PhaetonWarehouse {
  WarehouseId: string;
  Name: string;
  City?: string;
  Address?: string;
}

export interface PhaetonDictionaryResponse {
  Warehouses?: PhaetonWarehouse[];
  IsError?: boolean;
  ErrorMessage?: string | null;
  // The actual shape of the Dictionary endpoint is flexible; we keep it loose.
  [key: string]: unknown;
}

/** Vehicle-compatibility hint computed by name-matching against the VIN-decoded vehicle. */
export type CompatHint = "match" | "unknown";

/** Normalized cross-layer part item used by our API + UI. */
export interface PartOffer {
  id: string; // stable key for React lists
  brand: string;
  article: string;
  name: string;
  priceRaw: number; // raw price from Phaeton, in KZT
  priceFinal: number; // after markup
  quantity: number;
  warehouse?: string;
  isOriginal: boolean;
  compat?: CompatHint;
  compatReason?: string;
  // Filter flags — populated server-side and used by the relax-ladder.
  atAstana: boolean;
  inStockNow: boolean;
  matchesAllWords: boolean;
  shipmentDays: number;
  /** Article originally came from autodoc.ru catalog lookup, not Phaeton text search. */
  fromCatalog?: boolean;
}

export type RelaxLevel =
  | "exact"            // all filters applied
  | "no-make"          // dropped strict-compat (no make match required)
  | "no-words"         // dropped query-words AND
  | "with-delivery"    // allow non-zero delivery to Astana
  | "any-warehouse";   // allow other cities
