import Constants from "expo-constants";

export const RELAY_SERVER_URL =
  Constants.expoConfig?.extra?.relayServerUrl ??
  process.env.EXPO_PUBLIC_RELAY_SERVER_URL ??
  "http://localhost:8000";

export const RELAY_WS_URL = RELAY_SERVER_URL.replace(/^http/, "ws");
