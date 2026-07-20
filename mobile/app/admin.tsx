import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Pressable,
  BackHandler,
  Platform,
} from "react-native";
import { WebView, type WebViewNavigation } from "react-native-webview";
import CookieManager from "@react-native-cookies/cookies";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { StatusBar } from "expo-status-bar";
import { useRouter } from "expo-router";
import { useAuth } from "@/auth";
import { API_BASE_URL } from "@/config";
import { colors, font, spacing, gradients, shadow } from "@/theme";

// The admin panel is the full Next.js web app rendered inside a WebView. We
// seed the native cookie store with the NextAuth session cookie (minted at
// mobile login — identical shape to the web session JWT) so the WebView is
// already authenticated and lands on the role's dashboard without a login step.
const isHttps = API_BASE_URL.startsWith("https");
const HOST = API_BASE_URL.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
const SESSION_COOKIE = isHttps ? "__Secure-next-auth.session-token" : "next-auth.session-token";

export default function AdminScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token } = useAuth();
  const webRef = useRef<WebView>(null);

  const [cookieReady, setCookieReady] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const canGoBackRef = useRef(false);

  // Seed the session cookie into the native store before the first load.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!token) {
        setError("Your session has expired. Please log in again.");
        setCookieReady(true);
        return;
      }
      try {
        await CookieManager.set(API_BASE_URL, {
          name: SESSION_COOKIE,
          value: token,
          domain: HOST,
          path: "/",
          version: "1",
          secure: isHttps,
          httpOnly: true,
        });
      } catch {
        // If the native store rejects the cookie the WebView will fall back to
        // the web login form — not fatal, just not seamless.
      } finally {
        if (!cancelled) setCookieReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const goBack = useCallback(() => {
    if (canGoBackRef.current) {
      webRef.current?.goBack();
      return true;
    }
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)");
    return true;
  }, [router]);

  // Hardware back button navigates WebView history first.
  useEffect(() => {
    if (Platform.OS !== "android") return;
    const sub = BackHandler.addEventListener("hardwareBackPress", goBack);
    return () => sub.remove();
  }, [goBack]);

  const onNav = useCallback((nav: WebViewNavigation) => {
    canGoBackRef.current = nav.canGoBack;
  }, []);

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <LinearGradient
        colors={gradients.navy as [string, string]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.header, { paddingTop: insets.top + spacing.sm }]}
      >
        <View style={styles.headerRow}>
          <Pressable onPress={goBack} hitSlop={10} style={styles.iconBtn}>
            <Ionicons name="chevron-back" size={22} color={colors.white} />
          </Pressable>
          <View style={styles.titleWrap}>
            <Text style={styles.title} numberOfLines={1}>
              Admin Panel
            </Text>
            <Text style={styles.subtitle} numberOfLines={1}>
              {HOST}
            </Text>
          </View>
          <Pressable
            onPress={() => {
              setError(null);
              setPageLoading(true);
              webRef.current?.reload();
            }}
            hitSlop={10}
            style={styles.iconBtn}
          >
            <Ionicons name="refresh" size={20} color={colors.white} />
          </Pressable>
        </View>
      </LinearGradient>

      <View style={styles.webWrap}>
        {cookieReady && !error ? (
          <WebView
            ref={webRef}
            source={{ uri: API_BASE_URL + "/" }}
            sharedCookiesEnabled
            thirdPartyCookiesEnabled
            domStorageEnabled
            originWhitelist={["https://*", "http://*"]}
            onNavigationStateChange={onNav}
            onLoadStart={() => setPageLoading(true)}
            onLoadEnd={() => setPageLoading(false)}
            onError={() => {
              setPageLoading(false);
              setError("Couldn't reach the admin panel. Check your connection and try again.");
            }}
            startInLoadingState={false}
            style={{ flex: 1, backgroundColor: colors.bg }}
          />
        ) : null}

        {error ? (
          <View style={styles.center}>
            <View style={styles.errIcon}>
              <Ionicons name="cloud-offline-outline" size={30} color={colors.danger} />
            </View>
            <Text style={styles.errTitle}>Can't load Admin Panel</Text>
            <Text style={styles.errText}>{error}</Text>
            <Pressable
              style={styles.retryBtn}
              onPress={() => {
                setError(null);
                setPageLoading(true);
                webRef.current?.reload();
              }}
            >
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          </View>
        ) : pageLoading ? (
          <View style={styles.center} pointerEvents="none">
            <View style={styles.logoMark}>
              <Text style={styles.logoG}>G</Text>
            </View>
            <ActivityIndicator color={colors.navy} style={{ marginTop: spacing.lg }} />
            <Text style={styles.loadingText}>Loading admin workspace…</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.lg,
    borderBottomLeftRadius: 22,
    borderBottomRightRadius: 22,
    ...shadow.header,
  },
  headerRow: { flexDirection: "row", alignItems: "center", minHeight: 40 },
  iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  titleWrap: { flex: 1, alignItems: "center", paddingHorizontal: spacing.xs },
  title: { color: colors.white, fontSize: font.size.lg, fontWeight: font.weight.bold },
  subtitle: { color: colors.onNavyMuted, fontSize: font.size.xs, marginTop: 2 },
  webWrap: { flex: 1, backgroundColor: colors.bg },
  center: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.bg,
    paddingHorizontal: spacing.xl,
  },
  logoMark: {
    width: 64,
    height: 64,
    borderRadius: 18,
    backgroundColor: colors.brand,
    alignItems: "center",
    justifyContent: "center",
    ...shadow.raised,
  },
  logoG: { color: colors.white, fontSize: 34, fontWeight: font.weight.heavy },
  loadingText: { marginTop: spacing.md, color: colors.textSecondary, fontSize: font.size.sm },
  errIcon: {
    width: 64,
    height: 64,
    borderRadius: 18,
    backgroundColor: colors.dangerTint,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.lg,
  },
  errTitle: { fontSize: font.size.lg, fontWeight: font.weight.bold, color: colors.text },
  errText: {
    fontSize: font.size.sm,
    color: colors.textSecondary,
    textAlign: "center",
    marginTop: spacing.sm,
    lineHeight: 20,
  },
  retryBtn: {
    marginTop: spacing.xl,
    backgroundColor: colors.navy,
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.md,
    borderRadius: 999,
  },
  retryText: { color: colors.white, fontSize: font.size.md, fontWeight: font.weight.semibold },
});
