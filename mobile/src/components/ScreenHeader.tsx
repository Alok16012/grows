import React from "react";
import { View, Text, Pressable, StyleSheet, StyleProp, ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { colors, font, spacing, gradients, shadow } from "@/theme";

/**
 * The deep-navy gradient header used at the top of every detail screen —
 * matches the Employee App UI reference (back chevron + centered title + optional
 * trailing action). Sits flush under the status bar via safe-area insets.
 */
export function ScreenHeader({
  title,
  subtitle,
  onBack,
  right,
  style,
}: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  right?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const back = onBack ?? (() => (router.canGoBack() ? router.back() : router.replace("/(tabs)")));

  return (
    <LinearGradient
      colors={gradients.navy as [string, string]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.wrap, { paddingTop: insets.top + spacing.sm }, style]}
    >
      <View style={styles.row}>
        <Pressable onPress={back} hitSlop={10} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={22} color={colors.white} />
        </Pressable>
        <View style={styles.titleWrap}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={styles.subtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        <View style={styles.iconBtn}>{right}</View>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.lg,
    borderBottomLeftRadius: 22,
    borderBottomRightRadius: 22,
    ...shadow.header,
  },
  row: { flexDirection: "row", alignItems: "center", minHeight: 40 },
  iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  titleWrap: { flex: 1, alignItems: "center", paddingHorizontal: spacing.xs },
  title: { color: colors.white, fontSize: font.size.lg, fontWeight: font.weight.bold },
  subtitle: { color: colors.onNavyMuted, fontSize: font.size.xs, marginTop: 2 },
});
