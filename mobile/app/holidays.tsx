import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, RefreshControl } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { ScreenHeader } from "@/components/ScreenHeader";
import { api } from "@/api";
import { Card, EmptyState, Loading } from "@/components/ui";
import { colors, font, radius, spacing, tiles } from "@/theme";
import { titleCase } from "@/format";
import type { Holiday } from "@/types";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export default function HolidaysScreen() {
  const year = new Date().getFullYear();
  const [items, setItems] = useState<Holiday[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api<Holiday[]>(`/api/holidays?year=${year}`);
      setItems(Array.isArray(res) ? res : []);
    } catch {
      /* ignore */
    } finally {
      setLoaded(true);
    }
  }, [year]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const upcoming = items.filter((h) => new Date(h.date) >= today).length;

  return (
    <View style={styles.root}>
      <ScreenHeader title="Holidays" subtitle={`${year} · ${upcoming} upcoming`} />
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.navy} />}
      >
        {!loaded ? (
          <Loading />
        ) : items.length === 0 ? (
          <Card>
            <EmptyState icon="calendar-clear-outline" title="No holidays listed" subtitle={`The ${year} holiday calendar hasn't been published yet.`} />
          </Card>
        ) : (
          <Card padded={false}>
            {items.map((h, i) => {
              const d = new Date(h.date);
              const isPast = d < today;
              return (
                <View key={h.id}>
                  {i > 0 ? <View style={styles.divider} /> : null}
                  <View style={[styles.row, isPast && { opacity: 0.5 }]}>
                    <View style={styles.dateBox}>
                      <Text style={styles.dateDay}>{d.getDate()}</Text>
                      <Text style={styles.dateMon}>{MONTHS[d.getMonth()]}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.name}>{h.name}</Text>
                      <Text style={styles.weekday}>{d.toLocaleDateString("en-US", { weekday: "long" })}</Text>
                    </View>
                    <View style={[styles.typePill, { backgroundColor: tiles.amber.bg }]}>
                      <Text style={[styles.typeText, { color: tiles.amber.fg }]}>{titleCase(h.type)}</Text>
                    </View>
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

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  divider: { height: 1, backgroundColor: colors.border, marginLeft: spacing.lg + 60 },
  row: { flexDirection: "row", alignItems: "center", padding: spacing.lg },
  dateBox: {
    width: 52,
    height: 52,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.md,
  },
  dateDay: { fontSize: font.size.xl, fontWeight: font.weight.heavy, color: colors.navy },
  dateMon: { fontSize: font.size.xs, color: colors.textSecondary, textTransform: "uppercase" },
  name: { fontSize: font.size.md, fontWeight: font.weight.semibold, color: colors.text },
  weekday: { fontSize: font.size.sm, color: colors.textSecondary, marginTop: 2 },
  typePill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill },
  typeText: { fontSize: font.size.xs, fontWeight: font.weight.bold },
});
