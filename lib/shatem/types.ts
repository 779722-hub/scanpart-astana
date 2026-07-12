/**
 * Types for Shate-M WebApi.  Docs: https://api-doc.shate-m.kz/
 * Shapes below are confirmed against LIVE responses via scripts/shatem-probe.ts.
 * Shate-M uses camelCase JSON.
 */

/** POST /api/v1/auth/loginByapiKey — token envelope. */
export interface ShatemAuthResponse {
  access_token: string;
  expires_in: number; // seconds (live: 1800)
  token_type: string; // "Bearer"
  refresh_token?: string;
  scope?: string;
}

/** GET /api/v1/locations — warehouse directory (used to find Astana). */
export interface ShatemLocation {
  code: string; // e.g. "SHATE-A01"
  name: string; // e.g. "Центральный склад Астана"
  city?: string; // e.g. "Астана"
}

/** GET /api/v1/customer/agreements — active contracts. */
export interface ShatemAgreement {
  code: string; // e.g. "KSAGR00898"
  agreementGroup?: string;
  description?: string;
  locationCode?: string;
  currencyCode?: string;
  isActive?: boolean;
  isEnabledPickup?: boolean;
  isEnabledDelivery?: boolean;
}

/** GET /api/v1/delivery/addresses — delivery points. */
export interface ShatemDeliveryAddress {
  code: string; // e.g. "Д1"
  city?: string;
  address?: string;
  deliveryZoneCode?: string;
}

/** Article info (nested inside search + with_article_info responses). */
export interface ShatemArticle {
  id: number; // internal articleId used by prices/search
  code: string;
  tradeMarkName?: string; // brand
  name?: string;
  description?: string;
  unitOfMeasure?: string;
  isRepaired?: boolean;
}

/** GET /api/v1/articles/search/{code} — hits are wrapped in { article }. */
export interface ShatemArticleHit {
  article: ShatemArticle;
}

/** One price/stock offer (POST /api/v1/prices/search item). */
export interface ShatemPriceItem {
  id: string; // priceId — needed to add to Shate-M cart / order
  articleId: number;
  locationCode?: string; // e.g. "SHATE-A01"
  locationCodeReal?: string;
  agreementCode?: string;
  type?: string; // "Internal"
  isRepaired?: boolean;
  price: {
    value: number;
    valueWithMargin?: number;
    valueRecommended?: number | null;
    currencyCode?: string; // "KZT"
    priceMax?: number | null;
  };
  quantity: {
    available: number;
    availableType?: string; // "MoreThan" | "Exact" | ...
    multiplicity?: number;
    minimum?: number;
    maximum?: number | null;
  };
  addInfo?: {
    city?: string; // "Астана"
    isSale?: boolean;
    comment?: string;
    isReturnAllowed?: boolean;
    warningText?: string;
  };
  priority?: number;
  deliveryDateTimes?: Array<Record<string, unknown>>;
  shippingDateTime?: string;
  isImport?: boolean | null;
  isFree?: boolean;
}

/** POST /api/v1/prices/search/with_article_info — article grouped with its offers. */
export interface ShatemArticlePrices {
  article: ShatemArticle;
  prices: ShatemPriceItem[];
}

/** One key in the prices/search request array (ArticlePriceFilterKey). */
export interface ShatemPriceFilterKey {
  articleId: number;
  agreementCode?: string;
  deliveryAddressCode?: string;
  includeAnalogs?: boolean;
}

// --- Catalog (Laximo) — cookie-session web API under /vin/api/v1/laximoExtended ---

/** GET AutoByVin?vin= → identified vehicle(s). */
export interface ShatemVehicle {
  vehicleId: number;
  brand: string;
  name: string;
  catalog: string; // e.g. "NISSAN201809"
  ssd: string; // opaque state token, threaded into every deeper call
  model?: string;
  engine?: string;
  date?: string;
  market?: string;
  attributes?: Array<{ key: string; name: string; value: string }>;
}

export interface ShatemAutoByVinResponse {
  success: boolean;
  isWizard?: boolean;
  vehicles?: ShatemVehicle[];
}

/** GET GetCatalogs → manufacturer catalogs (for the by-model wizard). */
export interface ShatemCatalogItem {
  code: string; // catalogId, e.g. "INFINITI201809"
  brand: string; // "INFINITI"
  name: string; // "Infiniti"
  supportVinSearch?: boolean;
  supportParameterIdentification?: boolean; // wizard-capable
  supportquickgroups?: boolean;
}
export interface ShatemCatalogsResponse {
  success: boolean;
  items?: ShatemCatalogItem[];
}

/** One wizard step field (GET Parameters → fields[]). */
export interface ShatemWizardField {
  name: string; // "Рынок" | "Модель" | "Год" | "Привод" | "Двигатель" | …
  determined: boolean; // already chosen
  automatic: boolean; // auto-filled (single option) — no user input needed
  allowListVehicles: boolean; // AutoBySsd is callable at this point
  value?: string; // chosen value (when determined)
  ssd?: string; // per-field ssd (when determined)
  options: Array<{ key: string; value: string }>; // key = the ssd to pick this option
}
export interface ShatemParametersResponse {
  success: boolean;
  fields?: ShatemWizardField[];
}

/** GET AutoBySsd → matching modifications (each carries the {vehicleId,catalog,ssd} triple). */
export interface ShatemAutoBySsdResponse {
  success: boolean;
  vehicles?: ShatemVehicle[];
}

/** A node in the quick-group tree (GetVinGroups.treeData). */
export interface ShatemGroupNode {
  quickGroupId: number;
  name: string;
  isLink: boolean; // true → a leaf that has details
  childs?: ShatemGroupNode[];
}

export interface ShatemVinGroupsResponse {
  treeData?: ShatemGroupNode[];
  ssd?: string;
  success?: boolean;
}

/** A single part inside a unit (GetDetailsInGroup → categories → units → details). */
export interface ShatemDetail {
  oem: string; // OEM article number
  name: string;
  codeOnImage?: string;
  match?: string; // "t" when it matches the name filter
  innerAttributes?: Array<{ key: string; name: string; value: string }>;
}

export interface ShatemUnit {
  unitId: number;
  code?: string;
  name?: string;
  imageUrl?: string;
  details?: ShatemDetail[];
}

export interface ShatemDetailCategory {
  categoryId: number;
  name: string;
  units?: ShatemUnit[];
}

/** GetDetailsInGroup response is an object keyed by numeric index → category. */
export type ShatemDetailsInGroupResponse = Record<string, ShatemDetailCategory>;
