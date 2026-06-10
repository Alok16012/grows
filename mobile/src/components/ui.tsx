import React from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  StyleSheet,
  ViewStyle,
  TextStyle,
  StyleProp,
  TextInputProps,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { colors, font, radius, spacing, shadow } from "@/theme";

/* ---------------- Card ---------------- */
export function Card({
  children,
  style,
  padded = true,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  padded?: boolean;
}) {
  return <View style={[styles.card, padded && { padding: spacing.lg }, style]}>{children}</View>;
}

/* ---------------- Typography ---------------- */
export function SectionTitle({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[styles.sectionTitle, style]}>{children}</Text>;
}

export function Muted({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[styles.muted, style]}>{children}</Text>;
}

/* ---------------- Button ---------------- */
type ButtonVariant = "primary" | "success" | "danger" | "outline" | "ghost";
export function Button({
  label,
  onPress,
  variant = "primary",
  icon,
  loading,
  disabled,
  style,
  fullWidth = true,
}: {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  icon?: keyof typeof Ionicons.glyphMap;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  fullWidth?: boolean;
}) {
  const isDisabled = disabled || loading;
  const palette: Record<ButtonVariant, { bg: string; fg: string; border?: string }> = {
    primary: { bg: colors.navy, fg: colors.white },
    success: { bg: colors.brand, fg: colors.white },
    danger: { bg: colors.danger, fg: colors.white },
    outline: { bg: "transparent", fg: colors.navy, border: colors.borderStrong },
    ghost: { bg: colors.surfaceAlt, fg: colors.navy },
  };
  const p = palette[variant];
  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.btn,
        fullWidth && { alignSelf: "stretch" },
        {
          backgroundColor: p.bg,
          borderColor: p.border ?? "transparent",
          borderWidth: p.border ? 1.5 : 0,
          opacity: isDisabled ? 0.55 : pressed ? 0.88 : 1,
          transform: [{ scale: pressed && !isDisabled ? 0.985 : 1 }],
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={p.fg} />
      ) : (
        <View style={styles.btnInner}>
          {icon && <Ionicons name={icon} size={18} color={p.fg} style={{ marginRight: 8 }} />}
          <Text style={[styles.btnLabel, { color: p.fg }]}>{label}</Text>
        </View>
      )}
    </Pressable>
  );
}

/* ---------------- StatusPill ---------------- */
export function StatusPill({ status }: { status: string }) {
  const s = (status || "").toUpperCase();
  const map: Record<string, { fg: string; bg: string }> = {
    APPROVED: { fg: colors.brandDark, bg: colors.successTint },
    PRESENT: { fg: colors.brandDark, bg: colors.successTint },
    PAID: { fg: colors.brandDark, bg: colors.successTint },
    PENDING: { fg: "#9A6206", bg: colors.warningTint },
    SUBMITTED: { fg: "#9A6206", bg: colors.warningTint },
    PROCESSING: { fg: "#9A6206", bg: colors.warningTint },
    REJECTED: { fg: "#B0322D", bg: colors.dangerTint },
    ABSENT: { fg: "#B0322D", bg: colors.dangerTint },
    CANCELLED: { fg: colors.textSecondary, bg: colors.surfaceAlt },
  };
  const c = map[s] ?? { fg: colors.textSecondary, bg: colors.surfaceAlt };
  return (
    <View style={[styles.pill, { backgroundColor: c.bg }]}>
      <Text style={[styles.pillText, { color: c.fg }]}>{s ? s[0] + s.slice(1).toLowerCase() : "—"}</Text>
    </View>
  );
}

/* ---------------- Avatar ---------------- */
export function Avatar({
  name,
  uri,
  size = 44,
}: {
  name?: string | null;
  uri?: string | null;
  size?: number;
}) {
  const initials = (name || "")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.surfaceAlt }}
        contentFit="cover"
      />
    );
  }
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: colors.brandTint,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text style={{ color: colors.brandDark, fontWeight: font.weight.bold, fontSize: size * 0.36 }}>
        {initials || "?"}
      </Text>
    </View>
  );
}

/* ---------------- Field ---------------- */
export function Field({
  label,
  error,
  style,
  ...props
}: TextInputProps & { label?: string; error?: string; style?: StyleProp<ViewStyle> }) {
  const [focused, setFocused] = React.useState(false);
  return (
    <View style={[{ marginBottom: spacing.lg }, style]}>
      {label && <Text style={styles.fieldLabel}>{label}</Text>}
      <TextInput
        placeholderTextColor={colors.textMuted}
        {...props}
        onFocus={(e) => {
          setFocused(true);
          props.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          props.onBlur?.(e);
        }}
        style={[
          styles.input,
          focused && { borderColor: colors.navy, backgroundColor: colors.white },
          error && { borderColor: colors.danger },
          props.multiline && { height: 96, textAlignVertical: "top", paddingTop: 12 },
        ]}
      />
      {error ? <Text style={styles.fieldError}>{error}</Text> : null}
    </View>
  );
}

/* ---------------- EmptyState ---------------- */
export function EmptyState({
  icon = "file-tray-outline",
  title,
  subtitle,
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
}) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Ionicons name={icon} size={28} color={colors.textMuted} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      {subtitle ? <Text style={styles.emptySub}>{subtitle}</Text> : null}
    </View>
  );
}

/* ---------------- Loading ---------------- */
export function Loading({ label }: { label?: string }) {
  return (
    <View style={styles.loading}>
      <ActivityIndicator color={colors.navy} size="large" />
      {label ? <Text style={styles.loadingLabel}>{label}</Text> : null}
    </View>
  );
}

/* ---------------- ListRow ---------------- */
export function ListRow({
  icon,
  iconColor = colors.navy,
  iconBg = colors.surfaceAlt,
  title,
  subtitle,
  right,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
  iconBg?: string;
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && onPress ? { backgroundColor: colors.surfaceAlt } : null]}
    >
      <View style={[styles.rowIcon, { backgroundColor: iconBg }]}>
        <Ionicons name={icon} size={20} color={iconColor} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>{title}</Text>
        {subtitle ? <Text style={styles.rowSub}>{subtitle}</Text> : null}
      </View>
      {right ?? (onPress ? <Ionicons name="chevron-forward" size={18} color={colors.textMuted} /> : null)}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.card,
  },
  sectionTitle: {
    fontSize: font.size.lg,
    fontWeight: font.weight.bold,
    color: colors.text,
  },
  muted: { fontSize: font.size.sm, color: colors.textSecondary },
  btn: {
    height: 52,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
  },
  btnInner: { flexDirection: "row", alignItems: "center" },
  btnLabel: { fontSize: font.size.md, fontWeight: font.weight.semibold },
  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, alignSelf: "flex-start" },
  pillText: { fontSize: font.size.xs, fontWeight: font.weight.bold, letterSpacing: 0.2 },
  fieldLabel: {
    fontSize: font.size.sm,
    fontWeight: font.weight.semibold,
    color: colors.textSecondary,
    marginBottom: 6,
  },
  input: {
    height: 52,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    fontSize: font.size.md,
    color: colors.text,
    backgroundColor: colors.surfaceAlt,
  },
  fieldError: { color: colors.danger, fontSize: font.size.xs, marginTop: 4 },
  empty: { alignItems: "center", paddingVertical: spacing.xxl, paddingHorizontal: spacing.xl },
  emptyIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.md,
  },
  emptyTitle: { fontSize: font.size.md, fontWeight: font.weight.semibold, color: colors.text },
  emptySub: { fontSize: font.size.sm, color: colors.textSecondary, marginTop: 4, textAlign: "center" },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl },
  loadingLabel: { marginTop: spacing.md, color: colors.textSecondary, fontSize: font.size.sm },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xs,
  },
  rowIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.md,
  },
  rowTitle: { fontSize: font.size.md, fontWeight: font.weight.semibold, color: colors.text },
  rowSub: { fontSize: font.size.sm, color: colors.textSecondary, marginTop: 2 },
});
