import React from "react";
import { ActivityIndicator, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider, useAuth } from "./src/auth";
import { LoginScreen } from "./src/screens/LoginScreen";
import { RouteScreen } from "./src/screens/RouteScreen";
import { MapScreen } from "./src/screens/MapScreen";

export type Stack = {
  Route: undefined;
  Map: undefined;
};

const Nav = createNativeStackNavigator<Stack>();

function Root() {
  const { courier, loading } = useAuth();
  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator size="large" color="#E10600" />
      </View>
    );
  }
  if (!courier) return <LoginScreen />;
  return (
    <Nav.Navigator screenOptions={{ headerTintColor: "#E10600" }}>
      <Nav.Screen name="Route" component={RouteScreen} options={{ title: "Мой маршрут" }} />
      <Nav.Screen name="Map" component={MapScreen} options={{ title: "Карта" }} />
    </Nav.Navigator>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <NavigationContainer>
          <StatusBar style="auto" />
          <Root />
        </NavigationContainer>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
