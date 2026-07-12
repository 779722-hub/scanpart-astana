import React, { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useAuth } from "../auth";

export function LoginScreen() {
  const { login } = useAuth();
  const [l, setL] = useState("");
  const [p, setP] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function submit() {
    setBusy(true);
    setErr("");
    try {
      await login(l.trim(), p);
    } catch {
      setErr("Неверный логин или пароль");
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={s.wrap}
    >
      <Text style={s.brand}>SCANPART · Курьер</Text>
      <Text style={s.hint}>Вход для курьеров</Text>
      <TextInput
        style={s.input}
        placeholder="Логин"
        autoCapitalize="none"
        value={l}
        onChangeText={setL}
      />
      <TextInput
        style={s.input}
        placeholder="Пароль"
        secureTextEntry
        value={p}
        onChangeText={setP}
      />
      {!!err && <Text style={s.err}>{err}</Text>}
      <TouchableOpacity style={s.btn} onPress={submit} disabled={busy || !l || !p}>
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>Войти</Text>}
      </TouchableOpacity>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, justifyContent: "center", padding: 24, gap: 12, backgroundColor: "#F8F9FB" },
  brand: { fontSize: 26, fontWeight: "800", textAlign: "center", color: "#0B0D10" },
  hint: { textAlign: "center", color: "#6b7280", marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderColor: "#DDE2EA",
    borderRadius: 8,
    padding: 14,
    fontSize: 16,
    backgroundColor: "#fff",
  },
  btn: {
    backgroundColor: "#E10600",
    borderRadius: 8,
    padding: 16,
    alignItems: "center",
    marginTop: 4,
  },
  btnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  err: { color: "#E10600", textAlign: "center" },
});
