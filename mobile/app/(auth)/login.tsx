import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Pressable,
  Keyboard,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { StatusBar } from "expo-status-bar";
import * as Haptics from "expo-haptics";
import { useAuth } from "@/auth";
import { ApiError } from "@/api";
import { Button, Field } from "@/components/ui";
import { colors, font, radius, spacing, shadow, gradients } from "@/theme";

export default function LoginScreen() {
  const { signIn } = useAuth();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit() {
    Keyboard.dismiss();
    if (!identifier.trim() || !password) {
      setError("Please enter your Employee ID / email and password.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await signIn(identifier.trim(), password);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (e) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      setError(e instanceof ApiError ? e.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <LinearGradient colors={gradients.navy as [string, string]} style={styles.hero}>
        <View style={styles.logoMark}>
          <Text style={styles.logoG}>G</Text>
        </View>
        <Text style={styles.brand}>Growus</Text>
        <Text style={styles.tagline}>Employee Self-Service</Text>
      </LinearGradient>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.card}>
            <Text style={styles.welcome}>Welcome back 👋</Text>
            <Text style={styles.sub}>Sign in to continue to your dashboard</Text>

            <View style={{ height: spacing.xl }} />

            <Field
              label="Employee ID / Email / Phone"
              placeholder="e.g. EMP1024 or you@company.com"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              value={identifier}
              onChangeText={setIdentifier}
              returnKeyType="next"
            />

            <View style={styles.pwWrap}>
              <Field
                label="Password"
                placeholder="Enter your password"
                secureTextEntry={!showPw}
                value={password}
                onChangeText={setPassword}
                returnKeyType="go"
                onSubmitEditing={onSubmit}
                style={{ marginBottom: 0 }}
              />
              <Pressable onPress={() => setShowPw((s) => !s)} hitSlop={10} style={styles.eye}>
                <Ionicons name={showPw ? "eye-off-outline" : "eye-outline"} size={20} color={colors.textMuted} />
              </Pressable>
            </View>

            {error ? (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle" size={16} color={colors.danger} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : (
              <View style={{ height: spacing.lg }} />
            )}

            <Button label="Log In" onPress={onSubmit} loading={loading} icon="log-in-outline" />

            <Pressable style={styles.forgot} hitSlop={8}>
              <Text style={styles.forgotText}>Forgot Password?</Text>
            </Pressable>
          </View>

          <Text style={styles.footer}>Powered by Growus · Secure Login</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  hero: {
    paddingTop: 84,
    paddingBottom: 64,
    alignItems: "center",
    borderBottomLeftRadius: 36,
    borderBottomRightRadius: 36,
  },
  logoMark: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: colors.brand,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
    ...shadow.raised,
  },
  logoG: { color: colors.white, fontSize: 40, fontWeight: font.weight.heavy },
  brand: { color: colors.white, fontSize: font.size.xxl, fontWeight: font.weight.bold, letterSpacing: 0.5 },
  tagline: { color: colors.onNavyMuted, fontSize: font.size.sm, marginTop: 4 },
  scroll: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.xl,
    marginTop: -36,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.raised,
  },
  welcome: { fontSize: font.size.xl, fontWeight: font.weight.bold, color: colors.text },
  sub: { fontSize: font.size.sm, color: colors.textSecondary, marginTop: 4 },
  pwWrap: { position: "relative", marginBottom: spacing.lg },
  eye: { position: "absolute", right: 12, top: 36, padding: 4 },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.dangerTint,
    borderRadius: radius.sm,
    padding: spacing.md,
    marginVertical: spacing.md,
  },
  errorText: { flex: 1, color: colors.danger, fontSize: font.size.sm, fontWeight: font.weight.medium },
  forgot: { alignSelf: "center", marginTop: spacing.lg, padding: spacing.xs },
  forgotText: { color: colors.navy, fontSize: font.size.sm, fontWeight: font.weight.semibold },
  footer: { textAlign: "center", color: colors.textMuted, fontSize: font.size.xs, marginTop: spacing.xxl },
});
