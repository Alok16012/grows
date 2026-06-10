import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, RefreshControl, LayoutAnimation, Platform, UIManager } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { ScreenHeader } from "@/components/ScreenHeader";
import { api } from "@/api";
import { Card, StatusPill, EmptyState, Loading } from "@/components/ui";
import { colors, font, radius, spacing, gradients, shadow } from "@/theme";
import { inr, monthName } from "@/format";
import type { Payslip } from "@/types";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export default function PayrollScreen() {
  const [slips, setSlips] = useState<Payslip[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api<{ payslips: Payslip[] }>("/api/me/payslip?limit=12");
      setSlips(res.payslips ?? []);
    } catch {
      /* ignore */
    } finally {
      setLoaded(true);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const latest = slips[0];
  const rest = slips.slice(1);

  function toggle(id: string) {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpenId((cur) => (cur === id ? null : id));
  }

  return (
    <View style={styles.root}>
      <ScreenHeader title="Payroll" subtitle="Salary slips" />
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.navy} />}
      >
        {!loaded ? (
          <Loading />
        ) : slips.length === 0 ? (
          <Card>
            <EmptyState icon="wallet-outline" title="No payslips yet" subtitle="Your monthly salary slips will appear here once processed." />
          </Card>
        ) : (
          <>
            {/* Latest slip — hero card */}
            {latest ? (
              <LinearGradient colors={gradients.salary as [string, string]} style={styles.hero}>
                <View style={styles.heroTop}>
                  <View>
                    <Text style={styles.heroLabel}>Latest Salary Slip</Text>
                    <Text style={styles.heroMonth}>
                      {monthName(latest.month)} {latest.year}
                    </Text>
                  </View>
                  <StatusPill status={latest.status} />
                </View>
                <Text style={styles.heroNet}>{inr(latest.netSalary)}</Text>
                <Text style={styles.heroNetLabel}>Net Pay</Text>
                <View style={styles.heroStats}>
                  <HeroStat label="Earnings" value={inr(latest.grossSalary)} />
                  <View style={styles.heroDivider} />
                  <HeroStat label="Deductions" value={inr(latest.totalDeductions)} />
                  <View style={styles.heroDivider} />
                  <HeroStat label="Present" value={`${latest.presentDays}/${latest.workingDays}`} />
                </View>
              </LinearGradient>
            ) : null}

            <Text style={styles.heading}>All Payslips</Text>
            <Card padded={false}>
              {slips.map((s, i) => {
                const open = openId === s.id;
                return (
                  <View key={s.id}>
                    {i > 0 ? <View style={styles.divider} /> : null}
                    <Pressable
                      style={({ pressed }) => [styles.slipRow, pressed && { backgroundColor: colors.surfaceAlt }]}
                      onPress={() => toggle(s.id)}
                    >
                      <View style={styles.slipIcon}>
                        <Ionicons name="document-text-outline" size={20} color={colors.navy} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.slipMonth}>
                          {monthName(s.month)} {s.year}
                        </Text>
                        <Text style={styles.slipNet}>{inr(s.netSalary)} net</Text>
                      </View>
                      <StatusPill status={s.status} />
                      <Ionicons name={open ? "chevron-up" : "chevron-down"} size={18} color={colors.textMuted} style={{ marginLeft: 8 }} />
                    </Pressable>
                    {open ? (
                      <View style={styles.breakdown}>
                        <BreakRow label="Basic" value={inr(s.basicSalary)} />
                        <BreakRow label="HRA" value={inr(s.hra)} />
                        <BreakRow label="DA" value={inr(s.da)} />
                        <BreakRow label="Gross Earnings" value={inr(s.grossSalary)} strong />
                        <BreakRow label="Total Deductions" value={"- " + inr(s.totalDeductions)} danger />
                        <View style={styles.breakDivider} />
                        <BreakRow label="Net Salary" value={inr(s.netSalary)} strong accent />
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </Card>
          </>
        )}
        <View style={{ height: spacing.xxl }} />
      </ScrollView>
    </View>
  );
}

function HeroStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.heroStat}>
      <Text style={styles.heroStatVal}>{value}</Text>
      <Text style={styles.heroStatLabel}>{label}</Text>
    </View>
  );
}

function BreakRow({
  label,
  value,
  strong,
  danger,
  accent,
}: {
  label: string;
  value: string;
  strong?: boolean;
  danger?: boolean;
  accent?: boolean;
}) {
  return (
    <View style={styles.breakRow}>
      <Text style={[styles.breakLabel, strong && { fontWeight: font.weight.bold, color: colors.text }]}>{label}</Text>
      <Text
        style={[
          styles.breakValue,
          strong && { fontWeight: font.weight.bold },
          danger && { color: colors.danger },
          accent && { color: colors.brandDark },
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  hero: { borderRadius: radius.xl, padding: spacing.xl, ...shadow.raised },
  heroTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  heroLabel: { color: "rgba(255,255,255,0.8)", fontSize: font.size.sm },
  heroMonth: { color: colors.white, fontSize: font.size.lg, fontWeight: font.weight.bold, marginTop: 2 },
  heroNet: { color: colors.white, fontSize: 38, fontWeight: font.weight.heavy, marginTop: spacing.lg },
  heroNetLabel: { color: "rgba(255,255,255,0.8)", fontSize: font.size.sm },
  heroStats: { flexDirection: "row", alignItems: "center", marginTop: spacing.lg, backgroundColor: "rgba(255,255,255,0.12)", borderRadius: radius.md, paddingVertical: spacing.md },
  heroStat: { flex: 1, alignItems: "center" },
  heroStatVal: { color: colors.white, fontSize: font.size.md, fontWeight: font.weight.bold },
  heroStatLabel: { color: "rgba(255,255,255,0.75)", fontSize: font.size.xs, marginTop: 2 },
  heroDivider: { width: 1, height: 28, backgroundColor: "rgba(255,255,255,0.25)" },
  heading: { fontSize: font.size.lg, fontWeight: font.weight.bold, color: colors.text, marginTop: spacing.xl, marginBottom: spacing.md },
  divider: { height: 1, backgroundColor: colors.border, marginLeft: spacing.lg + 46 },
  slipRow: { flexDirection: "row", alignItems: "center", padding: spacing.lg },
  slipIcon: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.surfaceAlt, alignItems: "center", justifyContent: "center", marginRight: spacing.md },
  slipMonth: { fontSize: font.size.md, fontWeight: font.weight.semibold, color: colors.text },
  slipNet: { fontSize: font.size.sm, color: colors.textSecondary, marginTop: 2 },
  breakdown: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, backgroundColor: colors.surfaceAlt },
  breakRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6 },
  breakLabel: { fontSize: font.size.sm, color: colors.textSecondary },
  breakValue: { fontSize: font.size.sm, color: colors.text, fontWeight: font.weight.medium },
  breakDivider: { height: 1, backgroundColor: colors.border, marginVertical: 6 },
});
