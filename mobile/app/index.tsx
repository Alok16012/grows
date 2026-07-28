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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { API_BASE_URL } from "@/config";
import { colors, font, spacing, shadow } from "@/theme";

// The whole app is the Growus ERP website rendered in a WebView. Everything —
// login, employee self-service, admin panel — comes from the live site, so any
// web deploy shows up immediately without shipping a new APK. A new build is
// only needed for native shell changes (app name, icon, permissions).
//
// Android WebView treats an off-screen `position: fixed` element as scrollable
// page width, which shifts the whole page sideways. The site never needs
// document-level horizontal scroll (wide tables scroll in their own container),
// so clamp it permanently for every page.
const CLAMP_HORIZONTAL_SCROLL = `
(function () {
  var ID = '__growus_no_hscroll__';
  function apply() {
    if (document.getElementById(ID) || !document.head) return;
    var s = document.createElement('style');
    s.id = ID;
    s.textContent = 'html,body{overflow-x:hidden !important;max-width:100% !important;}';
    document.head.appendChild(s);
  }
  apply();
  new MutationObserver(apply).observe(document.documentElement, { childList: true, subtree: true });
})();
true;
`;

export default function AppShell() {
  const insets = useSafeAreaInsets();
  const webRef = useRef<WebView>(null);
  const canGoBackRef = useRef(false);

  const [firstLoadDone, setFirstLoadDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    setError(null);
    webRef.current?.reload();
  }, []);

  // Hardware back walks the site's history instead of closing the app.
  useEffect(() => {
    if (Platform.OS !== "android") return;
    const onBack = () => {
      if (canGoBackRef.current) {
        webRef.current?.goBack();
        return true;
      }
      return false; // let Android exit the app
    };
    const sub = BackHandler.addEventListener("hardwareBackPress", onBack);
    return () => sub.remove();
  }, []);

  const onNav = useCallback((nav: WebViewNavigation) => {
    canGoBackRef.current = nav.canGoBack;
  }, []);

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      {/* Branded strip behind the status bar so the site starts below it. */}
      <View style={{ height: insets.top, backgroundColor: colors.navyDark }} />

      <View style={styles.webWrap}>
        {!error ? (
          <WebView
            ref={webRef}
            source={{ uri: API_BASE_URL }}
            originWhitelist={["*"]}
            // Session cookies persist so the user stays logged in across restarts.
            sharedCookiesEnabled
            thirdPartyCookiesEnabled
            domStorageEnabled
            javaScriptEnabled
            // GPS attendance / inspection check-ins run inside the page.
            geolocationEnabled
            // Document uploads from the site.
            allowFileAccess
            // Keep every link inside the app instead of spawning blank windows.
            setSupportMultipleWindows={false}
            allowsBackForwardNavigationGestures
            pullToRefreshEnabled
            injectedJavaScript={CLAMP_HORIZONTAL_SCROLL}
            onNavigationStateChange={onNav}
            onLoadEnd={() => setFirstLoadDone(true)}
            onError={() => {
              setFirstLoadDone(true);
              setError("Couldn't reach Growus ERP. Check your internet connection and try again.");
            }}
            onContentProcessDidTerminate={() => webRef.current?.reload()}
            style={styles.web}
          />
        ) : null}

        {/* Branded first-load splash — only until the site paints once, so
            in-app navigation never flashes an overlay. */}
        {!firstLoadDone && !error ? (
          <View style={styles.center} pointerEvents="none">
            <View style={styles.logoMark}>
              <Text style={styles.logoG}>G</Text>
            </View>
            <Text style={styles.logoWord}>
              GROWUS <Text style={{ color: colors.brand }}>ERP</Text>
            </Text>
            <ActivityIndicator color={colors.onNavyMuted} style={{ marginTop: spacing.xl }} />
          </View>
        ) : null}

        {error ? (
          <View style={styles.center}>
            <View style={styles.errIcon}>
              <Ionicons name="cloud-offline-outline" size={30} color={colors.danger} />
            </View>
            <Text style={styles.errTitle}>No connection</Text>
            <Text style={styles.errText}>{error}</Text>
            <Pressable style={styles.retryBtn} onPress={reload}>
              <Text style={styles.retryText}>Try Again</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.navyDark },
  webWrap: { flex: 1, backgroundColor: colors.bg },
  web: { flex: 1, backgroundColor: colors.bg },
  center: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.navyDark,
    paddingHorizontal: spacing.xl,
  },
  logoMark: {
    width: 78,
    height: 78,
    borderRadius: 22,
    backgroundColor: colors.brand,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
    ...shadow.raised,
  },
  logoG: { color: colors.white, fontSize: 44, fontWeight: font.weight.heavy },
  logoWord: {
    color: colors.white,
    fontSize: font.size.xxl,
    fontWeight: font.weight.heavy,
    letterSpacing: 1,
  },
  errIcon: {
    width: 64,
    height: 64,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.lg,
  },
  errTitle: { fontSize: font.size.lg, fontWeight: font.weight.bold, color: colors.white },
  errText: {
    fontSize: font.size.sm,
    color: colors.onNavyMuted,
    textAlign: "center",
    marginTop: spacing.sm,
    lineHeight: 20,
  },
  retryBtn: {
    marginTop: spacing.xl,
    backgroundColor: colors.brand,
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.md,
    borderRadius: 999,
  },
  retryText: { color: colors.white, fontSize: font.size.md, fontWeight: font.weight.semibold },
});
