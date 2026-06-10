import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, RefreshControl } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { ScreenHeader } from "@/components/ScreenHeader";
import { api } from "@/api";
import { Card, EmptyState, Loading } from "@/components/ui";
import { colors, font, radius, spacing } from "@/theme";
import { shortDate, titleCase } from "@/format";
import type { Announcement } from "@/types";

const CAT: Record<string, { color: string; bg: string; icon: keyof typeof Ionicons.glyphMap }> = {
  URGENT: { color: colors.danger, bg: colors.dangerTint, icon: "alert-circle" },
  EVENT: { color: colors.info, bg: colors.infoTint, icon: "calendar" },
  POLICY: { color: colors.purple, bg: colors.purpleTint, icon: "document-text" },
  NOTICE: { color: colors.brand, bg: colors.brandTint, icon: "megaphone" },
};

export default function AnnouncementsScreen() {
  const [items, setItems] = useState<Announcement[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api<Announcement[]>("/api/announcements");
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

  return (
    <View style={styles.root}>
      <ScreenHeader title="Announcements" subtitle={`${items.length} notice${items.length !== 1 ? "s" : ""}`} />
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.navy} />}
      >
        {!loaded ? (
          <Loading />
        ) : items.length === 0 ? (
          <Card>
            <EmptyState icon="megaphone-outline" title="No announcements" subtitle="Company notices will appear here." />
          </Card>
        ) : (
          items.map((a) => {
            const c = CAT[(a.category || "NOTICE").toUpperCase()] ?? CAT.NOTICE;
            return (
              <View key={a.id} style={[styles.card, a.pinned && styles.pinned]}>
                <View style={styles.head}>
                  <View style={[styles.icon, { backgroundColor: c.bg }]}>
                    <Ionicons name={c.icon} size={18} color={c.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.title}>{a.title}</Text>
                    <Text style={styles.meta}>
                      {titleCase(a.category)} · {shortDate(a.publishedAt)}
                    </Text>
                  </View>
                  {a.pinned ? <Ionicons name="pin" size={16} color={colors.warning} /> : null}
                </View>
                <Text style={styles.body}>{a.body}</Text>
              </View>
            );
          })
        )}
        <View style={{ height: spacing.xxl }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pinned: { borderColor: colors.warning + "55", backgroundColor: "#FFFDF8" },
  head: { flexDirection: "row", alignItems: "center", marginBottom: spacing.md },
  icon: { width: 40, height: 40, borderRadius: radius.md, alignItems: "center", justifyContent: "center", marginRight: spacing.md },
  title: { fontSize: font.size.md, fontWeight: font.weight.bold, color: colors.text },
  meta: { fontSize: font.size.xs, color: colors.textMuted, marginTop: 2 },
  body: { fontSize: font.size.sm, color: colors.textSecondary, lineHeight: 21 },
});
