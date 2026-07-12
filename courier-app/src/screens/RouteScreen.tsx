import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import * as Location from "expo-location";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { Stack } from "../../App";
import { useAuth } from "../auth";
import { api, type Delivery, type RoutePlan } from "../api";

const STATUS_RU: Record<Delivery["status"], string> = {
  assigned: "Назначена",
  picking: "Забор со склада",
  en_route: "В пути к клиенту",
  delivered: "Вручена",
  canceled: "Отменена",
};

function etaClock(min: number): string {
  const d = new Date(Date.now() + min * 60000);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function RouteScreen({ navigation }: NativeStackScreenProps<Stack, "Route">) {
  const { courier, logout } = useAuth();
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [route, setRoute] = useState<RoutePlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [codes, setCodes] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      let loc: { lat: number; lng: number } | undefined;
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status === "granted") {
        const pos = await Location.getCurrentPositionAsync({});
        loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      }
      const r = await api.route(loc);
      setDeliveries(r.deliveries);
      setRoute(r.route);
    } catch (e) {
      Alert.alert("Ошибка", (e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity onPress={() => navigation.navigate("Map")}>
          <Text style={{ color: "#E10600", fontWeight: "700" }}>Карта</Text>
        </TouchableOpacity>
      ),
    });
  }, [load, navigation]);

  async function act(
    d: Delivery,
    action: "start" | "enroute" | "deliver" | "cancel"
  ) {
    try {
      const res = await api.act(d.id, action, codes[d.id]);
      if (action === "enroute" && res.waLink && !res.codeSent) {
        Alert.alert(
          "Код готов",
          "Отправьте код клиенту в WhatsApp.",
          [
            { text: "Отправить", onPress: () => Linking.openURL(res.waLink!) },
            { text: "Позже" },
          ]
        );
      }
      if (action === "enroute" && res.codeSent) {
        Alert.alert("Готово", "Код получения отправлен клиенту в WhatsApp.");
      }
      await load();
    } catch (e) {
      const msg = (e as Error).message;
      Alert.alert("Ошибка", msg === "bad_code" ? "Неверный код от клиента" : msg);
    }
  }

  return (
    <ScrollView
      style={s.wrap}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
    >
      <View style={s.head}>
        <Text style={s.hi}>Курьер: {courier?.name}</Text>
        <TouchableOpacity onPress={logout}>
          <Text style={s.logout}>Выйти</Text>
        </TouchableOpacity>
      </View>

      {route && route.stops.length > 0 && (
        <View style={s.card}>
          <Text style={s.cardTitle}>Маршрут ({route.totalKm} км · {route.totalMinutes} мин)</Text>
          {route.stops.map((st, i) => (
            <View key={i} style={s.stopRow}>
              <Text style={[s.badge, st.kind === "pickup" ? s.badgePick : s.badgeDrop]}>
                {st.kind === "pickup" ? "Склад" : "Клиент"}
              </Text>
              <Text style={s.stopLabel} numberOfLines={1}>{st.label}</Text>
              <Text style={s.stopEta}>~{etaClock(st.etaMinutes)}</Text>
            </View>
          ))}
        </View>
      )}

      {loading && deliveries.length === 0 && (
        <ActivityIndicator style={{ marginTop: 40 }} size="large" color="#E10600" />
      )}
      {!loading && deliveries.length === 0 && (
        <Text style={s.empty}>Назначенных доставок нет.</Text>
      )}

      {deliveries.map((d) => (
        <View key={d.id} style={s.card}>
          <Text style={s.status}>{STATUS_RU[d.status]}</Text>
          <Text style={s.client}>{d.customerName}</Text>
          <Text style={s.line}>{d.items}</Text>
          <Text style={s.dim}>{d.address}</Text>
          <View style={s.actions}>
            {d.phone ? (
              <TouchableOpacity style={s.secondary} onPress={() => Linking.openURL(`tel:${d.phone}`)}>
                <Text style={s.secondaryText}>Позвонить</Text>
              </TouchableOpacity>
            ) : null}

            {d.status === "assigned" && (
              <TouchableOpacity style={s.primary} onPress={() => act(d, "start")}>
                <Text style={s.primaryText}>Начать забор</Text>
              </TouchableOpacity>
            )}
            {d.status === "picking" && (
              <TouchableOpacity style={s.primary} onPress={() => act(d, "enroute")}>
                <Text style={s.primaryText}>В путь к клиенту</Text>
              </TouchableOpacity>
            )}
            {d.status === "en_route" && (
              <View style={{ flex: 1, gap: 8 }}>
                <TextInput
                  style={s.code}
                  placeholder="Код от клиента (4 цифры)"
                  keyboardType="number-pad"
                  maxLength={4}
                  value={codes[d.id] ?? ""}
                  onChangeText={(t) => setCodes((c) => ({ ...c, [d.id]: t.replace(/\D/g, "") }))}
                />
                <TouchableOpacity style={s.primary} onPress={() => act(d, "deliver")}>
                  <Text style={s.primaryText}>Подтвердить выдачу</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      ))}
      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: "#F8F9FB" },
  head: { flexDirection: "row", justifyContent: "space-between", padding: 16, alignItems: "center" },
  hi: { fontWeight: "700", fontSize: 16 },
  logout: { color: "#E10600" },
  card: { backgroundColor: "#fff", margin: 12, marginTop: 0, borderRadius: 10, padding: 14, gap: 4, borderWidth: 1, borderColor: "#EEF1F5" },
  cardTitle: { fontWeight: "800", marginBottom: 6 },
  stopRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 4 },
  badge: { fontSize: 11, fontWeight: "700", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, overflow: "hidden" },
  badgePick: { backgroundColor: "#FEF3C7", color: "#92400E" },
  badgeDrop: { backgroundColor: "#FFE5E4", color: "#E10600" },
  stopLabel: { flex: 1 },
  stopEta: { color: "#6b7280" },
  status: { fontSize: 12, fontWeight: "700", color: "#E10600" },
  client: { fontSize: 18, fontWeight: "800" },
  line: { fontSize: 15 },
  dim: { color: "#6b7280" },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8, alignItems: "center" },
  primary: { backgroundColor: "#E10600", borderRadius: 8, paddingVertical: 12, paddingHorizontal: 16, alignItems: "center", flexGrow: 1 },
  primaryText: { color: "#fff", fontWeight: "700" },
  secondary: { borderWidth: 1, borderColor: "#DDE2EA", borderRadius: 8, paddingVertical: 12, paddingHorizontal: 16, backgroundColor: "#fff" },
  secondaryText: { fontWeight: "700", color: "#0B0D10" },
  code: { borderWidth: 1, borderColor: "#DDE2EA", borderRadius: 8, padding: 12, fontSize: 18, letterSpacing: 6, textAlign: "center", backgroundColor: "#fff" },
  empty: { textAlign: "center", color: "#6b7280", marginTop: 40 },
});
