import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  RefreshControl,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { StatusBar } from "expo-status-bar";
import { useRouter, useFocusEffect } from "expo-router";
import { useAuth } from "@/auth";
import { api } from "@/api";
import { Avatar, Card } from "@/components/ui";
import { colors, font, radius, spacing, shadow, gradients, tiles } from "@/theme";
import { greeting, inr, hoursLabel } from "@/format";
import type { AttendanceToday, Leave, AppNotification } from "@/types";

type Tile = {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  tint: { fg: string; bg: string };
  href: string;
};

const TILES: Tile[] = [
  { key: "att", label: "Attendance", icon: "finger-print", tint: tiles.green, href: "/(tabs)/attendance" },
  { key: "leave", label: "Leave", icon: "calendar", tint: tiles.amber, href: "/leave" },
  { key: "salary", label: "Salary Slip", icon: "wallet", tint: tiles.blue, href: "/payroll" },
  { key: "expense", label: "Expense Claim", icon: "receipt", tint: tiles.purple, href: "/expenses" },
];

export default function HomeScreen() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [att, setAtt] = useState<AttendanceToday | null>(null);
  const [salary, setSalary] = useState<{ netSalary: number; month: number; year: number } | null>(null);
  const [pendingLeaves, setPendingLeaves] = useState(0);
  const [unread, setUnread] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const [a, p, l, n] = await Promise.allSettled([
      api<AttendanceToday>("/api/me/attendance"),
      api<{ payslips: { netSalary: number; month: number; year: number }[] }>("/api/me/payslip?limit=1"),
      api<Leave[]>("/api/leaves"),
      api<{ unreadCount: number }>("/api/notifications"),
    ]);
    if (a.status === "fulfilled") setAtt(a.value);
    if (p.status === "fulfilled") setSalary(p.value.payslips?.[0] ?? null);
    if (l.status === "fulfilled") setPendingLeaves(l.value.filter((x) => x.status === "PENDING").length);
    if (n.status === "fulfilled") setUnread(n.value.unreadCount ?? 0);
    setLoaded(true);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const today = att?.today;
  const isPresent = !!today?.checkIn;
  const statusText = today?.checkOut
    ? "Checked out"
    : today?.checkIn
      ? "Present · Checked in"
      : "Not marked yet";

  const firstName =
    user?.employee?.firstName || user?.name?.split(" ")[0] || "there";

  return (
    <View style={styles.root}>
      <StatusBar style="light" />

      {/* ---- Navy header ---- */}
      <LinearGradient
        colors={gradients.navy as [string, string]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.header, { paddingTop: insets.top + spacing.md }]}
      >
        <View style={styles.headerRow}>
          <Pressable style={styles.headerUser} onPress={() => router.push("/(tabs)/profile")}>
            <Avatar name={user?.name} uri={user?.photo ?? undefined} size={46} />
            <View style={{ marginLeft: spacing.md }}>
              <Text style={styles.greeting}>{greeting()},</Text>
              <Text style={styles.userName} numberOfLines={1}>
                {firstName}
              </Text>
            </View>
          </Pressable>
          <Pressable style={styles.bell} onPress={() => router.push("/notifications")} hitSlop={8}>
            <Ionicons name="notifications-outline" size={22} color={colors.white} />
            {unread > 0 ? <View style={styles.bellDot} /> : null}
          </Pressable>
        </View>
      </LinearGradient>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.navy} />}
      >
        {/* ---- Quick actions grid (overlaps header) ---- */}
        <View style={styles.grid}>
          {TILES.map((t) => (
            <Pressable
              key={t.key}
              style={({ pressed }) => [styles.tile, pressed && { transform: [{ scale: 0.97 }] }]}
              onPress={() => router.push(t.href as any)}
            >
              <View style={[styles.tileIcon, { backgroundColor: t.tint.bg }]}>
                <Ionicons name={t.icon} size={24} color={t.tint.fg} />
              </View>
              <Text style={styles.tileLabel}>{t.label}</Text>
            </Pressable>
          ))}
        </View>

        {/* ---- Today snapshot ---- */}
        <Card style={styles.section}>
          <View style={styles.snapRow}>
            <View style={[styles.snapDot, { backgroundColor: isPresent ? colors.success : colors.textMuted }]} />
            <View style={{ flex: 1 }}>
              <Text style={styles.snapLabel}>Today's Attendance</Text>
              <Text style={styles.snapValue}>{statusText}</Text>
            </View>
            <Pressable style={styles.snapBtn} onPress={() => router.push("/(tabs)/attendance")}>
              <Text style={styles.snapBtnText}>{today?.checkIn ? "View" : "Check In"}</Text>
              <Ionicons name="arrow-forward" size={14} color={colors.brandDark} />
            </Pressable>
          </View>
          <View style={styles.snapDivider} />
          <View style={styles.snapStats}>
            <View style={styles.snapStat}>
              <Text style={styles.snapStatVal}>{hoursLabel(today?.workingHrs)}</Text>
              <Text style={styles.snapStatLabel}>Hours today</Text>
            </View>
            <View style={styles.snapStat}>
              <Text style={styles.snapStatVal}>{salary ? inr(salary.netSalary) : "—"}</Text>
              <Text style={styles.snapStatLabel}>Last net salary</Text>
            </View>
            <View style={styles.snapStat}>
              <Text style={[styles.snapStatVal, pendingLeaves > 0 && { color: colors.warning }]}>
                {pendingLeaves}
              </Text>
              <Text style={styles.snapStatLabel}>Pending leaves</Text>
            </View>
          </View>
        </Card>

        {/* ---- Quick links ---- */}
        <Text style={styles.heading}>Quick Access</Text>
        <Card padded={false} style={styles.section}>
          <QuickLink icon="megaphone-outline" color={colors.brand} label="Announcements" sub="Company notices & updates" onPress={() => router.push("/announcements")} />
          <Divider />
          <QuickLink icon="document-text-outline" color={colors.info} label="Documents" sub="Offer letter, payslips, KYC" onPress={() => router.push("/documents")} />
          <Divider />
          <QuickLink icon="wallet-outline" color={colors.brand} label="Payroll & Salary Slips" sub="Download monthly payslips" onPress={() => router.push("/payroll")} />
          <Divider />
          <QuickLink icon="receipt-outline" color={colors.purple} label="Expense Claims" sub="Raise & track reimbursements" onPress={() => router.push("/expenses")} />
          <Divider />
          <QuickLink icon="calendar-outline" color={colors.warning} label="Leave Management" sub="Apply & view leave history" onPress={() => router.push("/leave")} />
          <Divider />
          <QuickLink icon="flag-outline" color={colors.info} label="Holiday Calendar" sub="Company holidays this year" onPress={() => router.push("/holidays")} />
        </Card>

        <View style={{ height: spacing.xxl }} />
      </ScrollView>
    </View>
  );
}

function QuickLink({
  icon,
  color,
  label,
  sub,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  label: string;
  sub: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.qlink, pressed && { backgroundColor: colors.surfaceAlt }]}
    >
      <View style={[styles.qlinkIcon, { backgroundColor: color + "18" }]}>
        <Ionicons name={icon} size={20} color={color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.qlinkLabel}>{label}</Text>
        <Text style={styles.qlinkSub}>{sub}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </Pressable>
  );
}

function Divider() {
  return <View style={styles.divider} />;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl + spacing.lg,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  headerUser: { flexDirection: "row", alignItems: "center", flex: 1 },
  greeting: { color: colors.onNavyMuted, fontSize: font.size.sm },
  userName: { color: colors.white, fontSize: font.size.xl, fontWeight: font.weight.bold },
  bell: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  bellDot: {
    position: "absolute",
    top: 11,
    right: 12,
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: colors.warning,
    borderWidth: 1.5,
    borderColor: colors.navy,
  },
  scroll: { paddingHorizontal: spacing.lg },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    marginTop: -spacing.xxl,
  },
  tile: {
    width: "48%",
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.card,
  },
  tileIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.md,
  },
  tileLabel: { fontSize: font.size.md, fontWeight: font.weight.semibold, color: colors.text },
  section: { marginTop: spacing.sm },
  snapRow: { flexDirection: "row", alignItems: "center" },
  snapDot: { width: 10, height: 10, borderRadius: 5, marginRight: spacing.md },
  snapLabel: { fontSize: font.size.xs, color: colors.textSecondary, fontWeight: font.weight.medium },
  snapValue: { fontSize: font.size.md, color: colors.text, fontWeight: font.weight.bold, marginTop: 2 },
  snapBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.brandTint,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.pill,
  },
  snapBtnText: { color: colors.brandDark, fontSize: font.size.sm, fontWeight: font.weight.bold },
  snapDivider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.lg },
  snapStats: { flexDirection: "row", justifyContent: "space-between" },
  snapStat: { flex: 1, alignItems: "center" },
  snapStatVal: { fontSize: font.size.lg, fontWeight: font.weight.bold, color: colors.text },
  snapStatLabel: { fontSize: font.size.xs, color: colors.textSecondary, marginTop: 3, textAlign: "center" },
  heading: {
    fontSize: font.size.lg,
    fontWeight: font.weight.bold,
    color: colors.text,
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },
  qlink: { flexDirection: "row", alignItems: "center", padding: spacing.lg },
  qlinkIcon: {
    width: 42,
    height: 42,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.md,
  },
  qlinkLabel: { fontSize: font.size.md, fontWeight: font.weight.semibold, color: colors.text },
  qlinkSub: { fontSize: font.size.sm, color: colors.textSecondary, marginTop: 2 },
  divider: { height: 1, backgroundColor: colors.border, marginLeft: 70 },
});
