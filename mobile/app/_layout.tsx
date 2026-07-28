import { useEffect } from "react";
import { Text as RNText, TextInput as RNTextInput } from "react-native";
import { Stack } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import * as SplashScreen from "expo-splash-screen";
import { colors } from "@/theme";

SplashScreen.preventAutoHideAsync().catch(() => {});

// Cap system font scaling so XL device font/display settings can't blow up
// fixed layouts. `defaultProps` on function components is legacy and
// unsupported in newer React — wrapped so a throw here can NEVER take the whole
// app down at startup (a blank launch is far worse than uncapped scaling).
try {
  // @ts-expect-error defaultProps is legacy
  RNText.defaultProps = { ...(RNText.defaultProps || {}), maxFontSizeMultiplier: 1.15 };
  // @ts-expect-error same for inputs
  RNTextInput.defaultProps = { ...(RNTextInput.defaultProps || {}), maxFontSizeMultiplier: 1.15 };
} catch { /* non-fatal */ }

export default function RootLayout() {
  // The app is a single WebView shell (app/index.tsx) — there is no native auth
  // or routing to wait for, so drop the native splash as soon as we mount and
  // let the shell show its own branded loader.
  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.navyDark },
          }}
        />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
