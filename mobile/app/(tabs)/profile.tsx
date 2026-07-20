import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, RefreshControl, Alert } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { StatusBar } from "expo-status-bar";
import { useRouter, useFocusEffect } from "expo-router";
import { useAuth } from "@/auth";
import { api } from "@/api";
import { canAccessAdmin } from "@/access";
import { Avatar, Card, Button } from "@/components/ui";
import { colors, font, radius, spacing, gradients, shadow } from "@/theme";
import { shortDate } from "@/format";
import type { EmployeeProfile } from "@/types";

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, signOut } = useAuth();
  const [emp, setEmp] = useState<EmployeeProfile | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api<EmployeeProfile | null>("/api/me/employee");
      setEmp(res);
    } catch {
      /* ignore */
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const name = emp ? `${emp.firstName} ${emp.lastName}` : user?.name ?? "—";
  const photo = emp?.photo ?? user?.photo ?? undefined;

  function confirmLogout() {
    Alert.alert("Log out", "Are you sure you want to log out?", [
      { text: "Cancel", style: "cancel" },
      { text: "Log Out", style: "destructive", onPress: () => signOut() },
    ]);
  }

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.navy} />}
      >
        <LinearGradient colors={gradients.navy as [string, string]} style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
          <Text style={styles.headerTitle}>Profile</Text>
        </LinearGradient>

        <View style={styles.body}>
        <Card style={styles.idCard}>
          <Avatar name={name} uri={photo} size={84} />
          <Text style={styles.name}>{name}</Text>
          <Text style={styles.designation}>{emp?.designation || user?.role || "Employee"}</Text>
          {emp?.employeeId ? (
            <View style={styles.idTag}>
              <Ionicons name="id-card-outline" size={13} color={colors.brandDark} />
              <Text style={styles.idTagText}>{emp.employeeId}</Text>
            </View>
          ) : null}
        </Card>

        <Section title="Contact">
          <InfoRow icon="call-outline" label="Phone" value={emp?.phone} />
          <InfoRow icon="mail-outline" label="Email" value={emp?.email || user?.email} />
          <InfoRow
            icon="location-outline"
            label="Address"
            value={[emp?.city, emp?.state].filter(Boolean).join(", ") || emp?.address}
            last
          />
        </Section>

        <Section title="Employment">
          <InfoRow icon="briefcase-outline" label="Designation" value={emp?.designation} />
          <InfoRow icon="calendar-outline" label="Date of Joining" value={emp?.dateOfJoining ? shortDate(emp.dateOfJoining) : undefined} last />
        </Section>

        <Section title="Bank Details">
          <InfoRow icon="business-outline" label="Bank" value={emp?.bankName} />
          <InfoRow icon="card-outline" label="Account No." value={maskAccount(emp?.bankAccountNumber)} />
          <InfoRow icon="git-branch-outline" label="IFSC" value={emp?.bankIFSC} last />
        </Section>

        {canAccessAdmin(user) ? (
          <Pressable
            onPress={() => router.push("/admin" as any)}
            style={({ pressed }) => [styles.adminCard, pressed && { opacity: 0.9 }]}
          >
            <LinearGradient
              colors={gradients.navy as [string, string]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.adminGrad}
            >
              <View style={styles.adminIcon}>
                <Ionicons name="grid" size={22} color={colors.white} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.adminTitle}>Admin Workspace</Text>
                <Text style={styles.adminSub}>Open the full management panel</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.onNavyMuted} />
            </LinearGradient>
          </Pressable>
        ) : null}

        <Card padded={false} style={{ marginTop: spacing.md }}>
          <NavRow icon="document-text-outline" label="My Documents" onPress={() => router.push("/documents")} />
          <View style={styles.navDivider} />
          <NavRow icon="notifications-outline" label="Notifications" onPress={() => router.push("/notifications")} />
          <View style={styles.navDivider} />
          <NavRow icon="wallet-outline" label="Payroll & Salary" onPress={() => router.push("/payroll")} />
        </Card>

        <Button label="Log Out" variant="danger" icon="log-out-outline" onPress={confirmLogout} style={{ marginTop: spacing.xl }} />
        <Text style={styles.version}>Growus · v1.0.0</Text>
        <View style={{ height: spacing.xxl }} />
        </View>
      </ScrollView>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ marginTop: spacing.lg }}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Card padded={false}>{children}</Card>
    </View>
  );
}

function InfoRow({
  icon,
  label,
  value,
  last,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value?: string | null;
  last?: boolean;
}) {
  return (
    <View style={[styles.infoRow, !last && styles.infoBorder]}>
      <Ionicons name={icon} size={18} color={colors.textSecondary} style={{ width: 26 }} />
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue} numberOfLines={1}>
        {value || "—"}
      </Text>
    </View>
  );
}

function NavRow({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  return (
    <Pressable style={({ pressed }) => [styles.navRow, pressed && { backgroundColor: colors.surfaceAlt }]} onPress={onPress}>
      <Ionicons name={icon} size={20} color={colors.navy} style={{ width: 30 }} />
      <Text style={styles.navLabel}>{label}</Text>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </Pressable>
  );
}

function maskAccount(acc?: string | null) {
  if (!acc) return undefined;
  const s = String(acc);
  return s.length > 4 ? "•••• " + s.slice(-4) : s;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl + spacing.lg,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },
  headerTitle: { color: colors.white, fontSize: font.size.xxl, fontWeight: font.weight.bold },
  scroll: { flexGrow: 1 },
  body: { paddingHorizontal: spacing.lg },
  idCard: { alignItems: "center", marginTop: -spacing.xxl, paddingVertical: spacing.xl },
  name: { fontSize: font.size.xl, fontWeight: font.weight.bold, color: colors.text, marginTop: spacing.md },
  designation: { fontSize: font.size.sm, color: colors.textSecondary, marginTop: 2 },
  idTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: colors.brandTint,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: radius.pill,
    marginTop: spacing.md,
  },
  idTagText: { color: colors.brandDark, fontSize: font.size.sm, fontWeight: font.weight.bold },
  sectionTitle: {
    fontSize: font.size.sm,
    fontWeight: font.weight.bold,
    color: colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
    marginLeft: spacing.xs,
  },
  infoRow: { flexDirection: "row", alignItems: "center", paddingVertical: spacing.md, paddingHorizontal: spacing.lg },
  infoBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  infoLabel: { fontSize: font.size.md, color: colors.textSecondary, flex: 1 },
  infoValue: { fontSize: font.size.md, color: colors.text, fontWeight: font.weight.medium, maxWidth: "55%" },
  adminCard: { marginTop: spacing.lg, borderRadius: radius.lg, overflow: "hidden", ...shadow.card },
  adminGrad: { flexDirection: "row", alignItems: "center", padding: spacing.lg, gap: spacing.md },
  adminIcon: {
    width: 42,
    height: 42,
    borderRadius: radius.md,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  adminTitle: { color: colors.white, fontSize: font.size.md, fontWeight: font.weight.bold },
  adminSub: { color: colors.onNavyMuted, fontSize: font.size.xs, marginTop: 2 },
  navDivider: { height: 1, backgroundColor: colors.border, marginLeft: spacing.lg + 30 },
  navRow: { flexDirection: "row", alignItems: "center", padding: spacing.lg },
  navLabel: { flex: 1, fontSize: font.size.md, fontWeight: font.weight.semibold, color: colors.text },
  version: { textAlign: "center", color: colors.textMuted, fontSize: font.size.xs, marginTop: spacing.lg },
});
