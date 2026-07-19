"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";
import type * as L from "leaflet";

declare global {
  interface Window {
    mapgl?: any;
  }
}

export interface MapCourier {
  id: string;
  name: string;
  lat: number;
  lng: number;
  stale: boolean;
}
export interface MapPoint {
  id: string;
  name: string;
  lat: number;
  lng: number;
  color?: string; // custom marker colour (hex); falls back to the kind default
}
export type MarkerShape = "circle" | "square" | "triangle" | "diamond";

export interface DeliveryMapProps {
  couriers: MapCourier[];
  warehouses: MapPoint[];
  drops: MapPoint[];
  office?: MapPoint | null; // pickup/office point (Республика 68), shown green
  routeGeometry?: [number, number][] | null;
  courierColor?: string;
  courierShape?: MarkerShape;
  clientColor?: string;
  clientShape?: MarkerShape;
  className?: string;
}

const RED = "#E10600";
const AMBER = "#F59E0B";
const BLUE = "#2563EB";
const GRAY = "#9CA3AF";
const GREEN = "#16A34A";
const ASTANA = { lat: 51.13, lng: 71.43, zoom: 11 };
const MAPGL_SRC = "https://mapgl.2gis.com/api/js/v1";

interface Pin {
  lat: number;
  lng: number;
  name: string;
  color: string;
  hint: string;
  size: number;
  permanent: boolean; // keep the label always visible (warehouses / office)
  shape: MarkerShape;
}

function buildPins(props: DeliveryMapProps): Pin[] {
  const courierColor = props.courierColor || RED;
  const courierShape = props.courierShape || "circle";
  const clientColor = props.clientColor || BLUE;
  const clientShape = props.clientShape || "circle";
  const pins: Pin[] = [];
  for (const c of props.couriers) {
    // Courier is the point managers look for → big, always labelled.
    pins.push({ lat: c.lat, lng: c.lng, name: c.name, color: c.stale ? GRAY : courierColor, hint: "Курьер", size: 22, permanent: true, shape: courierShape });
  }
  for (const w of props.warehouses) {
    pins.push({ lat: w.lat, lng: w.lng, name: w.name, color: w.color || AMBER, hint: "Склад", size: 22, permanent: true, shape: "circle" });
  }
  if (props.office) {
    pins.push({ lat: props.office.lat, lng: props.office.lng, name: props.office.name, color: props.office.color || GREEN, hint: "Офис", size: 24, permanent: true, shape: "circle" });
  }
  for (const d of props.drops) {
    pins.push({ lat: d.lat, lng: d.lng, name: d.name, color: d.color || clientColor, hint: "Клиент", size: 16, permanent: false, shape: clientShape });
  }
  return pins;
}

/** Inline HTML for a coloured marker of the given shape. */
function markerHtml(color: string, size: number, shape: MarkerShape): string {
  const border = "border:2px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,.35)";
  if (shape === "triangle") {
    // SVG-треугольник с белой обводкой и тёмной тенью — как у кружков, иначе
    // жёлтый треугольник теряется на карте.
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" style="display:block;filter:drop-shadow(0 0 1px rgba(0,0,0,.55))"><polygon points="12,2.5 22,21.5 2,21.5" fill="${color}" stroke="#fff" stroke-width="2.5" stroke-linejoin="round"/></svg>`;
  }
  const radius = shape === "circle" ? "50%" : "3px";
  const transform = shape === "diamond" ? "transform:rotate(45deg);" : "";
  return `<div style="width:${size}px;height:${size}px;background:${color};border-radius:${radius};${transform}${border}"></div>`;
}

function loadMapgl(): Promise<any> {
  return new Promise((resolve, reject) => {
    if (window.mapgl) {
      resolve(window.mapgl);
      return;
    }
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${MAPGL_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve(window.mapgl));
      existing.addEventListener("error", reject);
      return;
    }
    const script = document.createElement("script");
    script.src = MAPGL_SRC;
    script.async = true;
    script.onload = () => resolve(window.mapgl);
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

export function DeliveryMap(props: DeliveryMapProps): JSX.Element {
  const twogisKey = process.env.NEXT_PUBLIC_TWOGIS_KEY;
  const containerRef = useRef<HTMLDivElement>(null);
  const initedRef = useRef(false);
  const fittedRef = useRef(false); // fit bounds only once, so polling doesn't reset the manager's pan/zoom

  // Latest props for the async init effect, without re-running it.
  const propsRef = useRef(props);
  propsRef.current = props;

  // Leaflet handles
  const leafletRef = useRef<typeof L | null>(null);
  const lMapRef = useRef<L.Map | null>(null);
  const lLayerRef = useRef<L.LayerGroup | null>(null);

  // 2GIS handles
  const gisMapRef = useRef<any>(null);
  const gisObjectsRef = useRef<any[]>([]);

  // Create map once (guarded against StrictMode double-invoke).
  useEffect(() => {
    if (initedRef.current) return;
    initedRef.current = true;
    let cancelled = false;

    if (twogisKey) {
      loadMapgl().then((mapgl) => {
        if (cancelled || !containerRef.current) return;
        gisMapRef.current = new mapgl.Map(containerRef.current, {
          center: [ASTANA.lng, ASTANA.lat],
          zoom: ASTANA.zoom,
          key: twogisKey,
        });
        drawGis(propsRef.current);
      }).catch(() => {});
    } else {
      import("leaflet").then((mod) => {
        if (cancelled || !containerRef.current) return;
        const leaflet = mod.default;
        leafletRef.current = leaflet;
        const map = leaflet.map(containerRef.current).setView([ASTANA.lat, ASTANA.lng], ASTANA.zoom);
        // Мы работаем в Казахстане — убираем украинский флажок из стандартной
        // подписи Leaflet, ставим казахстанский.
        map.attributionControl.setPrefix('🇰🇿 Leaflet');
        leaflet.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: "© OpenStreetMap",
          maxZoom: 19,
        }).addTo(map);
        lMapRef.current = map;
        lLayerRef.current = leaflet.layerGroup().addTo(map);
        drawLeaflet(propsRef.current);
      });
    }

    return () => {
      cancelled = true;
      if (lMapRef.current) {
        lMapRef.current.remove();
        lMapRef.current = null;
      }
      if (gisMapRef.current) {
        gisMapRef.current.destroy();
        gisMapRef.current = null;
      }
      initedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [twogisKey]);

  // Redraw on data change.
  useEffect(() => {
    if (twogisKey) drawGis(props);
    else drawLeaflet(props);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.couriers, props.warehouses, props.drops, props.office, props.routeGeometry]);

  // Keep the map sized to its container (fullscreen toggle, responsive).
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      lMapRef.current?.invalidateSize();
      gisMapRef.current?.invalidateSize?.();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  function drawLeaflet(data: DeliveryMapProps) {
    const leaflet = leafletRef.current;
    const map = lMapRef.current;
    const layer = lLayerRef.current;
    if (!leaflet || !map || !layer) return;
    layer.clearLayers();

    const pins = buildPins(data);
    for (const p of pins) {
      const half = p.size / 2;
      const icon = leaflet.divIcon({
        className: "",
        iconSize: [p.size, p.size],
        iconAnchor: [half, half],
        html: markerHtml(p.color, p.size, p.shape),
      });
      const marker = leaflet.marker([p.lat, p.lng], { icon });
      if (p.permanent) {
        marker.bindTooltip(p.name, { permanent: true, direction: "top", offset: [0, -half], className: "font-semibold" });
      } else {
        marker.bindTooltip(p.name);
      }
      marker.addTo(layer);
    }

    if (data.routeGeometry && data.routeGeometry.length > 1) {
      const latlngs = data.routeGeometry.map(([lng, lat]) => [lat, lng] as [number, number]);
      leaflet.polyline(latlngs, { color: RED, weight: 4 }).addTo(layer);
    }

    if (pins.length > 0 && !fittedRef.current) {
      const bounds = leaflet.latLngBounds(pins.map((p) => [p.lat, p.lng] as [number, number]));
      map.fitBounds(bounds, { padding: [40, 40] });
      fittedRef.current = true;
    }
  }

  function drawGis(data: DeliveryMapProps) {
    const map = gisMapRef.current;
    const mapgl = window.mapgl;
    if (!map || !mapgl) return;
    for (const obj of gisObjectsRef.current) obj.destroy();
    gisObjectsRef.current = [];

    const pins = buildPins(data);
    for (const p of pins) {
      const marker = new mapgl.Marker(map, {
        coordinates: [p.lng, p.lat],
        label: { text: `${p.hint}: ${p.name}` },
      });
      gisObjectsRef.current.push(marker);
    }

    if (data.routeGeometry && data.routeGeometry.length > 1) {
      const line = new mapgl.Polyline(map, {
        coordinates: data.routeGeometry,
        width: 4,
        color: RED,
      });
      gisObjectsRef.current.push(line);
    }

    if (pins.length > 0 && !fittedRef.current) {
      map.fitBounds({
        southWest: [
          Math.min(...pins.map((p) => p.lng)),
          Math.min(...pins.map((p) => p.lat)),
        ],
        northEast: [
          Math.max(...pins.map((p) => p.lng)),
          Math.max(...pins.map((p) => p.lat)),
        ],
      });
      fittedRef.current = true;
    }
  }

  return (
    <div className={props.className ?? "h-80 w-full overflow-hidden rounded-2xl"}>
      <div ref={containerRef} style={{ height: "100%", width: "100%" }} />
    </div>
  );
}
