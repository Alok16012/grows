import Constants from "expo-constants";

// Base URL of the Growus Next.js backend (the same app deployed on Vercel).
//
// Override without editing code by setting `extra.apiBaseUrl` in app.json, or
// the EXPO_PUBLIC_API_BASE_URL env var when starting Expo. For local testing
// against `next dev`, use your machine's LAN IP, e.g. http://192.168.1.5:3000
// (localhost will NOT work from a physical phone).
const fromEnv = process.env.EXPO_PUBLIC_API_BASE_URL;
const fromExtra = (Constants.expoConfig?.extra as { apiBaseUrl?: string } | undefined)?.apiBaseUrl;

export const API_BASE_URL = (fromEnv || fromExtra || "https://grows-tau.vercel.app").replace(/\/$/, "");

export const TOKEN_KEY = "growus.auth.token";
export const USER_KEY = "growus.auth.user";
