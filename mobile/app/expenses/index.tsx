import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, RefreshControl } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { ScreenHeader } from "@/components/ScreenHeader";
import { api } from "@/api";
import { Card, Button, StatusPill, EmptyState, Loading } from "@/components/ui";
import { colors, font, radius, spacing, tiles } from "@/theme";
import { inr, shortDate, titleCase } from "@/format";
import type { Expense } from "@/types";

const CAT_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  TRAVEL: "airplane",
  TRANSPORTATION: "bus",
  FUEL: "car",
  FOOD: "restaurant",
  HOTEL: "bed",
  ACCOMMODATION: "bed",
  MOBILE_RECHARGE: "phone-portrait",
  MEDICAL: "medkit",
  OFFICE_SUPPLIES: "briefcase",
  COMMUNICATION: "call",
  OTHER: "pricetag",
};

export default function ExpensesScreen() {
  const router = useRouter();
  const [items, setItems] = useState<Expense[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api<Expense[]>("/api/expenses");
      setItems(Array.isArray(res) ? res : []);
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

  const approved = items.filter((e) => e.status === "APPROVED" || e.status === "PAID").reduce((s, e) => s + e.amount, 0);
  const pending = items.filter((e) => e.status === "SUBMITTED" || e.status === "PENDING").reduce((s, e) => s + e.amount, 0);

  return (
    <View style={styles.root}>
      <ScreenHeader title="Expense Claims" subtitle={`${items.length} claim${items.length !== 1 ? "s" : ""}`} />
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.navy} />}
      >
        <View style={styles.summary}>
          <View style={[styles.sumCard, { backgroundColor: tiles.green.bg }]}>
            <Text style={[styles.sumVal, { color: tiles.green.fg }]}>{inr(approved)}</Text>
            <Text style={styles.sumLabel}>Approved / Paid</Text>
          </View>
          <View style={[styles.sumCard, { backgroundColor: tiles.amber.bg }]}>
            <Text style={[styles.sumVal, { color: tiles.amber.fg }]}>{inr(pending)}</Text>
            <Text style={styles.sumLabel}>Pending</Text>
          </View>
        </View>

        <Button label="New Claim" icon="add-circle-outline" onPress={() => router.push("/expenses/new")} style={{ marginTop: spacing.lg }} />

        <Text style={styles.heading}>Claim History</Text>
        {!loaded ? (
          <Loading />
        ) : items.length === 0 ? (
          <Card>
            <EmptyState icon="receipt-outline" title="No expense claims" subtitle="Raise a new claim and track its approval here." />
          </Card>
        ) : (
          <Card padded={false}>
            {items.map((e, i) => (
              <View key={e.id}>
                {i > 0 ? <View style={styles.divider} /> : null}
                <View style={styles.row}>
                  <View style={styles.rowIcon}>
                    <Ionicons name={CAT_ICON[e.category] ?? "pricetag"} size={18} color={colors.navy} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle} numberOfLines={1}>{e.title || titleCase(e.category)}</Text>
                    <Text style={styles.rowSub}>{titleCase(e.category)} · {shortDate(e.date)}</Text>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={styles.rowAmount}>{inr(e.amount)}</Text>
                    <View style={{ marginTop: 4 }}>
                      <StatusPill status={e.status} />
                    </View>
                  </View>
                </View>
              </View>
            ))}
          </Card>
        )}
        <View style={{ height: spacing.xxl }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  summary: { flexDirection: "row", gap: spacing.md },
  sumCard: { flex: 1, borderRadius: radius.lg, padding: spacing.lg },
  sumVal: { fontSize: font.size.xl, fontWeight: font.weight.heavy },
  sumLabel: { fontSize: font.size.sm, color: colors.textSecondary, fontWeight: font.weight.semibold, marginTop: 2 },
  heading: { fontSize: font.size.lg, fontWeight: font.weight.bold, color: colors.text, marginTop: spacing.xl, marginBottom: spacing.md },
  divider: { height: 1, backgroundColor: colors.border, marginLeft: spacing.lg + 46 },
  row: { flexDirection: "row", alignItems: "center", padding: spacing.lg },
  rowIcon: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.surfaceAlt, alignItems: "center", justifyContent: "center", marginRight: spacing.md },
  rowTitle: { fontSize: font.size.md, fontWeight: font.weight.semibold, color: colors.text },
  rowSub: { fontSize: font.size.sm, color: colors.textSecondary, marginTop: 2 },
  rowAmount: { fontSize: font.size.md, fontWeight: font.weight.bold, color: colors.text },
});
