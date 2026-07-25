import { useEffect } from "react";
import { View, Text, ActivityIndicator, StyleSheet, Text as RNText, TextInput as RNTextInput } from "react-native";
import { Stack, useRouter, useSegments } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { useFonts } from "expo-font";
import { Ionicons } from "@expo/vector-icons";
import { AuthProvider, useAuth } from "@/auth";
import { colors, font } from "@/theme";

SplashScreen.preventAutoHideAsync().catch(() => {});

// Cap system font scaling so XL device font/display settings can't blow up
// fixed layouts (overlapping text, uneven card sizes). 1.15 keeps things
// accessible without breaking the design.
//
// `defaultProps` on function components is legacy and unsupported in newer
// React — wrapped so a throw here can NEVER take the whole app down at
// startup (a blank-screen launch is far worse than uncapped font scaling).
try {
  // @ts-expect-error defaultProps is legacy
  RNText.defaultProps = { ...(RNText.defaultProps || {}), maxFontSizeMultiplier: 1.15 };
  // @ts-expect-error same for inputs
  RNTextInput.defaultProps = { ...(RNTextInput.defaultProps || {}), maxFontSizeMultiplier: 1.15 };
} catch { /* non-fatal */ }

function BrandSplash() {
  return (
    <View style={styles.splash}>
      <View style={styles.logoMark}>
        <Text style={styles.logoG}>G</Text>
      </View>
      <Text style={styles.logoWord}>GROWUS <Text style={{ color: colors.brand }}>ERP</Text></Text>
      <Text style={styles.logoTag}>Enterprise Resource Planning</Text>
      <ActivityIndicator color={colors.onNavyMuted} style={{ marginTop: 28 }} />
    </View>
  );
}

function RootNavigator() {
  const { user, bootstrapping } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  // Best-effort font preload — DON'T gate the app on it. In release builds the
  // async font load can fail/stall, and gating render on `fontsLoaded` left the
  // app stuck on a blank splash forever. Icons are also bundled natively
  // (android assets/fonts/Ionicons.ttf), so they render regardless of this.
  useFonts({ ...Ionicons.font });
  const ready = !bootstrapping;

  useEffect(() => {
    if (!ready) return;
    SplashScreen.hideAsync().catch(() => {});
    const inAuthGroup = segments[0] === "(auth)";
    if (!user && !inAuthGroup) {
      router.replace("/(auth)/login");
    } else if (user && inAuthGroup) {
      router.replace("/(tabs)");
    }
  }, [user, ready, segments, router]);

  // Hard failsafe: never let the native splash linger. Hide it shortly after
  // mount even if something above is delayed.
  useEffect(() => {
    const t = setTimeout(() => { SplashScreen.hideAsync().catch(() => {}); }, 1200);
    return () => clearTimeout(t);
  }, []);

  if (!ready) return <BrandSplash />;

  return (
    <Stack screenOptions={{ headerShown: false, animation: "slide_from_right", contentStyle: { backgroundColor: colors.bg } }}>
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="leave/index" options={{ presentation: "card" }} />
      <Stack.Screen name="leave/apply" options={{ presentation: "modal" }} />
      <Stack.Screen name="expenses/index" />
      <Stack.Screen name="expenses/new" options={{ presentation: "modal" }} />
      <Stack.Screen name="payroll" />
      <Stack.Screen name="documents" />
      <Stack.Screen name="notifications" />
      <Stack.Screen name="holidays" />
      <Stack.Screen name="announcements" />
      <Stack.Screen name="admin" options={{ animation: "slide_from_bottom" }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <StatusBar style="dark" />
          <RootNavigator />
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    backgroundColor: colors.navyDark,
    alignItems: "center",
    justifyContent: "center",
  },
  logoMark: {
    width: 78,
    height: 78,
    borderRadius: 22,
    backgroundColor: colors.brand,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
  },
  logoG: { color: colors.white, fontSize: 44, fontWeight: font.weight.heavy },
  logoWord: { color: colors.white, fontSize: font.size.xxl, fontWeight: font.weight.heavy, letterSpacing: 1 },
  logoTag: { color: colors.onNavyMuted, fontSize: font.size.xs, marginTop: 6, letterSpacing: 1.5, textTransform: "uppercase" },
});
