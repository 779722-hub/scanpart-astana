import Constants from "expo-constants";

const extra = (Constants.expoConfig?.extra ?? {}) as {
  apiBaseUrl?: string;
  twogisMapKey?: string;
};

/** Backend base URL (the live Next.js site). Override in app.json → extra. */
export const API_BASE = extra.apiBaseUrl || "https://scanpart.kz";

/** 2GIS MapGL JS key — set in app.json → extra.twogisMapKey to enable the map. */
export const TWOGIS_KEY = extra.twogisMapKey || "";
