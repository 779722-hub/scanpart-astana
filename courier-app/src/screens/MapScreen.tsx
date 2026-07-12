import React, { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { WebView } from "react-native-webview";
import { api, type RouteStop } from "../api";
import { TWOGIS_KEY } from "../config";

function buildHtml(stops: RouteStop[], key: string): string {
  const pts = stops.filter((s) => s.lat && s.lng);
  const center = pts[0] ? [pts[0].lng, pts[0].lat] : [71.43, 51.13]; // Astana
  const markers = pts
    .map(
      (s, i) =>
        `new mapgl.Marker(map,{coordinates:[${s.lng},${s.lat}],label:{text:'${i + 1}. ${s.kind === "pickup" ? "Склад" : "Клиент"}'}});`
    )
    .join("\n");
  const line = pts.length > 1
    ? `new mapgl.Polyline(map,{coordinates:[${pts.map((s) => `[${s.lng},${s.lat}]`).join(",")}],width:4,color:'#E10600'});`
    : "";
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"/>
<style>html,body,#map{margin:0;height:100%}</style>
<script src="https://mapgl.2gis.com/api/js/v1"></script></head>
<body><div id="map"></div>
<script>
const map=new mapgl.Map('map',{center:[${center[0]},${center[1]}],zoom:11,key:'${key}'});
${markers}
${line}
</script></body></html>`;
}

export function MapScreen() {
  const [stops, setStops] = useState<RouteStop[] | null>(null);

  useEffect(() => {
    api.route().then((r) => setStops(r.route.stops)).catch(() => setStops([]));
  }, []);

  if (!TWOGIS_KEY) {
    return (
      <View style={s.center}>
        <Text style={s.msg}>
          Карта отключена. Добавьте ключ 2ГИС в app.json → extra.twogisMapKey и пересоберите приложение.
        </Text>
      </View>
    );
  }
  if (!stops) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color="#E10600" />
      </View>
    );
  }
  return (
    <WebView
      originWhitelist={["*"]}
      source={{ html: buildHtml(stops, TWOGIS_KEY) }}
      style={{ flex: 1 }}
    />
  );
}

const s = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  msg: { textAlign: "center", color: "#6b7280" },
});
