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
  Name?: string;
  Price: number;
  Count: number;
  WarehouseId?: string;
  WarehouseName?: string;
  IsAnalog?: boolean;
  SupplierId?: number;
  ExpectedDelivery?: number;
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
}
