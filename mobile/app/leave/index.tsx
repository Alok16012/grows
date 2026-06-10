import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, RefreshControl } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { ScreenHeader } from "@/components/ScreenHeader";
import { api } from "@/api";
import { Card, Button, StatusPill, EmptyState, Loading } from "@/components/ui";
import { colors, font, radius, spacing, tiles } from "@/theme";
import { shortDate, titleCase } from "@/format";
import type { Leave } from "@/types";

const TYPE_TINTS: Record<string, { fg: string; bg: string }> = {
  casual: tiles.green,
  sick: tiles.amber,
  earned: tiles.blue,
  unpaid: tiles.purple,
};

export default function LeaveScreen() {
  const router = useRouter();
  const [leaves, setLeaves] = useState<Leave[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api<Leave[]>("/api/leaves");
      setLeaves(Array.isArray(res) ? res : []);
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

  // Days taken this year, by type (approved only)
  const year = new Date().getFullYear();
  const taken: Record<string, number> = {};
  for (const l of leaves) {
    if (l.status !== "APPROVED") continue;
    if (new Date(l.startDate).getFullYear() !== year) continue;
    const key = l.type.toLowerCase();
    taken[key] = (taken[key] ?? 0) + l.days;
  }
  const pending = leaves.filter((l) => l.status === "PENDING").length;

  return (
    <View style={styles.root}>
      <ScreenHeader title="Leave Management" subtitle={`${year} · ${pending} pending`} />
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.navy} />}
      >
        <View style={styles.summary}>
          <SummaryTile label="Casual" days={taken.casual ?? 0} tint={tiles.green} />
          <SummaryTile label="Sick" days={taken.sick ?? 0} tint={tiles.amber} />
          <SummaryTile label="Earned" days={taken.earned ?? 0} tint={tiles.blue} />
        </View>
        <Text style={styles.summaryNote}>Days taken this year</Text>

        <Button label="Apply for Leave" icon="add-circle-outline" onPress={() => router.push("/leave/apply")} style={{ marginTop: spacing.lg }} />

        <Text style={styles.heading}>Leave History</Text>
        {!loaded ? (
          <Loading />
        ) : leaves.length === 0 ? (
          <Card>
            <EmptyState icon="calendar-outline" title="No leave records" subtitle="Apply for leave and it will show up here." />
          </Card>
        ) : (
          <Card padded={false}>
            {leaves.map((l, i) => {
              const tint = TYPE_TINTS[l.type.toLowerCase()] ?? tiles.navy;
              return (
                <View key={l.id}>
                  {i > 0 ? <View style={styles.divider} /> : null}
                  <View style={styles.row}>
                    <View style={[styles.rowIcon, { backgroundColor: tint.bg }]}>
                      <Ionicons name="calendar" size={18} color={tint.fg} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowTitle}>{titleCase(l.type)} Leave</Text>
                      <Text style={styles.rowSub}>
                        {shortDate(l.startDate)} → {shortDate(l.endDate)} · {l.days}d
                      </Text>
                      {l.reason ? (
                        <Text style={styles.rowReason} numberOfLines={1}>
                          {l.reason}
                        </Text>
                      ) : null}
                    </View>
                    <StatusPill status={l.status} />
                  </View>
                </View>
              );
            })}
          </Card>
        )}
        <View style={{ height: spacing.xxl }} />
      </ScrollView>
    </View>
  );
}

function SummaryTile({ label, days, tint }: { label: string; days: number; tint: { fg: string; bg: string } }) {
  return (
    <View style={[styles.sumTile, { backgroundColor: tint.bg }]}>
      <Text style={[styles.sumDays, { color: tint.fg }]}>{days}</Text>
      <Text style={styles.sumLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  summary: { flexDirection: "row", gap: spacing.md },
  sumTile: { flex: 1, borderRadius: radius.lg, paddingVertical: spacing.lg, alignItems: "center" },
  sumDays: { fontSize: font.size.xxl, fontWeight: font.weight.heavy },
  sumLabel: { fontSize: font.size.sm, color: colors.textSecondary, fontWeight: font.weight.semibold, marginTop: 2 },
  summaryNote: { fontSize: font.size.xs, color: colors.textMuted, textAlign: "center", marginTop: spacing.sm },
  heading: { fontSize: font.size.lg, fontWeight: font.weight.bold, color: colors.text, marginTop: spacing.xl, marginBottom: spacing.md },
  divider: { height: 1, backgroundColor: colors.border, marginLeft: spacing.lg + 46 },
  row: { flexDirection: "row", alignItems: "center", padding: spacing.lg },
  rowIcon: { width: 40, height: 40, borderRadius: radius.md, alignItems: "center", justifyContent: "center", marginRight: spacing.md },
  rowTitle: { fontSize: font.size.md, fontWeight: font.weight.semibold, color: colors.text },
  rowSub: { fontSize: font.size.sm, color: colors.textSecondary, marginTop: 2 },
  rowReason: { fontSize: font.size.xs, color: colors.textMuted, marginTop: 2, fontStyle: "italic" },
});
