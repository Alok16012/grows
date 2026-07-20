import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, RefreshControl, Alert } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { StatusBar } from "expo-status-bar";
import { useRouter, useFocusEffect } from "expo-router";
import { api } from "@/api";
import { Card, StatusPill, EmptyState, Loading } from "@/components/ui";
import { colors, font, radius, spacing, gradients, tiles } from "@/theme";
import { shortDate, titleCase, inr } from "@/format";
import type { Leave, Expense } from "@/types";

type Req = {
  id: string;
  kind: "Leave" | "Expense";
  title: string;
  sub: string;
  status: string;
  date: string;
};

export default function RequestsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [items, setItems] = useState<Req[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const [l, e] = await Promise.allSettled([
      api<Leave[]>("/api/leaves"),
      api<{ expenses?: Expense[] } | Expense[]>("/api/expenses"),
    ]);
    const reqs: Req[] = [];
    if (l.status === "fulfilled") {
      for (const lv of l.value) {
        reqs.push({
          id: "l" + lv.id,
          kind: "Leave",
          title: `${titleCase(lv.type)} Leave`,
          sub: `${shortDate(lv.startDate)} · ${lv.days} day${lv.days > 1 ? "s" : ""}`,
          status: lv.status,
          date: lv.createdAt,
        });
      }
    }
    if (e.status === "fulfilled") {
      const list = Array.isArray(e.value) ? e.value : e.value.expenses ?? [];
      for (const ex of list) {
        reqs.push({
          id: "e" + ex.id,
          kind: "Expense",
          title: ex.title || titleCase(ex.category),
          sub: `${inr(ex.amount)} · ${titleCase(ex.category)}`,
          status: ex.status,
          date: ex.date,
        });
      }
    }
    reqs.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    setItems(reqs);
    setLoaded(true);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.navy} />}
      >
        <LinearGradient colors={gradients.navy as [string, string]} style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
          <Text style={styles.headerTitle}>Requests</Text>
          <Text style={styles.headerSub}>Raise and track your requests</Text>
        </LinearGradient>

        <View style={styles.body}>
        <View style={styles.actions}>
          <ActionTile label="Apply Leave" icon="calendar" tint={tiles.amber} onPress={() => router.push("/leave/apply")} />
          <ActionTile label="New Expense" icon="receipt" tint={tiles.purple} onPress={() => router.push("/expenses/new")} />
          <ActionTile
            label="Letter Request"
            icon="mail"
            tint={tiles.blue}
            onPress={() => Alert.alert("Letter Request", "Please reach out to HR for letter requests. In-app requests are coming soon.")}
          />
          <ActionTile
            label="Missed Punch"
            icon="alarm"
            tint={tiles.green}
            onPress={() => Alert.alert("Missed Punch", "Missed-punch correction requests are coming soon.")}
          />
        </View>

        <Text style={styles.heading}>My Requests</Text>
        {!loaded ? (
          <Loading />
        ) : items.length === 0 ? (
          <Card>
            <EmptyState icon="documents-outline" title="No requests yet" subtitle="Apply for leave or raise an expense to get started." />
          </Card>
        ) : (
          <Card padded={false}>
            {items.map((it, i) => (
              <View key={it.id}>
                {i > 0 ? <View style={styles.divider} /> : null}
                <Pressable
                  style={({ pressed }) => [styles.reqRow, pressed && { backgroundColor: colors.surfaceAlt }]}
                  onPress={() => router.push(it.kind === "Leave" ? "/leave" : "/expenses")}
                >
                  <View style={[styles.reqIcon, { backgroundColor: it.kind === "Leave" ? tiles.amber.bg : tiles.purple.bg }]}>
                    <Ionicons
                      name={it.kind === "Leave" ? "calendar" : "receipt"}
                      size={18}
                      color={it.kind === "Leave" ? tiles.amber.fg : tiles.purple.fg}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.reqTitle} numberOfLines={1}>{it.title}</Text>
                    <Text style={styles.reqSub} numberOfLines={1}>{it.sub}</Text>
                  </View>
                  <StatusPill status={it.status} />
                </Pressable>
              </View>
            ))}
          </Card>
        )}
        <View style={{ height: spacing.xxl }} />
        </View>
      </ScrollView>
    </View>
  );
}

function ActionTile({
  label,
  icon,
  tint,
  onPress,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  tint: { fg: string; bg: string };
  onPress: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.actionTile, pressed && { transform: [{ scale: 0.97 }] }]}
      onPress={onPress}
    >
      <View style={[styles.actionIcon, { backgroundColor: tint.bg }]}>
        <Ionicons name={icon} size={22} color={tint.fg} />
      </View>
      <Text style={styles.actionLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },
  headerTitle: { color: colors.white, fontSize: font.size.xxl, fontWeight: font.weight.bold },
  headerSub: { color: colors.onNavyMuted, fontSize: font.size.sm, marginTop: 4 },
  scroll: { flexGrow: 1 },
  body: { paddingHorizontal: spacing.lg },
  actions: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", marginTop: -spacing.xxl - spacing.xs },
  actionTile: {
    width: "48%",
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  actionIcon: { width: 42, height: 42, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  actionLabel: { fontSize: font.size.sm, fontWeight: font.weight.semibold, color: colors.text, flexShrink: 1 },
  heading: { fontSize: font.size.lg, fontWeight: font.weight.bold, color: colors.text, marginTop: spacing.lg, marginBottom: spacing.md },
  divider: { height: 1, backgroundColor: colors.border, marginLeft: spacing.lg + 46 },
  reqRow: { flexDirection: "row", alignItems: "center", padding: spacing.lg },
  reqIcon: { width: 40, height: 40, borderRadius: radius.md, alignItems: "center", justifyContent: "center", marginRight: spacing.md },
  reqTitle: { fontSize: font.size.md, fontWeight: font.weight.semibold, color: colors.text },
  reqSub: { fontSize: font.size.sm, color: colors.textSecondary, marginTop: 2 },
});
