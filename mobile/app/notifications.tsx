import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, RefreshControl } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { ScreenHeader } from "@/components/ScreenHeader";
import { api } from "@/api";
import { Card, EmptyState, Loading } from "@/components/ui";
import { colors, font, radius, spacing } from "@/theme";
import type { AppNotification } from "@/types";

const TYPE_STYLE: Record<string, { icon: keyof typeof Ionicons.glyphMap; color: string; bg: string }> = {
  SALARY: { icon: "wallet", color: colors.brand, bg: colors.brandTint },
  LEAVE: { icon: "calendar", color: colors.warning, bg: colors.warningTint },
  EXPENSE: { icon: "receipt", color: colors.purple, bg: colors.purpleTint },
  ANNOUNCEMENT: { icon: "megaphone", color: colors.info, bg: colors.infoTint },
  DEFAULT: { icon: "notifications", color: colors.navy, bg: "#E6ECF5" },
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "Just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { day: "numeric", month: "short" });
}

function styleFor(type?: string | null) {
  const key = (type || "").toUpperCase();
  for (const k of Object.keys(TYPE_STYLE)) {
    if (key.includes(k)) return TYPE_STYLE[k];
  }
  return TYPE_STYLE.DEFAULT;
}

export default function NotificationsScreen() {
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api<{ notifications: AppNotification[] }>("/api/notifications");
      setItems(res.notifications ?? []);
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

  async function markRead(id: string) {
    setItems((cur) => cur.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
    await api("/api/notifications", { method: "PATCH", body: { id } }).catch(() => {});
  }

  async function markAll() {
    setItems((cur) => cur.map((n) => ({ ...n, isRead: true })));
    await api("/api/notifications", { method: "PATCH", body: { markAllRead: true } }).catch(() => {});
  }

  const unread = items.filter((n) => !n.isRead).length;

  return (
    <View style={styles.root}>
      <ScreenHeader
        title="Notifications"
        subtitle={unread > 0 ? `${unread} unread` : "All caught up"}
        right={
          unread > 0 ? (
            <Pressable onPress={markAll} hitSlop={8}>
              <Ionicons name="checkmark-done" size={22} color={colors.white} />
            </Pressable>
          ) : null
        }
      />
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.navy} />}
      >
        {!loaded ? (
          <Loading />
        ) : items.length === 0 ? (
          <Card>
            <EmptyState icon="notifications-off-outline" title="No notifications" subtitle="You're all caught up." />
          </Card>
        ) : (
          items.map((n) => {
            const s = styleFor(n.type);
            return (
              <Pressable
                key={n.id}
                onPress={() => !n.isRead && markRead(n.id)}
                style={({ pressed }) => [
                  styles.card,
                  !n.isRead && styles.cardUnread,
                  pressed && { opacity: 0.85 },
                ]}
              >
                <View style={[styles.icon, { backgroundColor: s.bg }]}>
                  <Ionicons name={s.icon} size={20} color={s.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={styles.titleRow}>
                    <Text style={styles.title} numberOfLines={1}>{n.title}</Text>
                    {!n.isRead ? <View style={styles.dot} /> : null}
                  </View>
                  <Text style={styles.message} numberOfLines={2}>{n.message}</Text>
                  <Text style={styles.time}>{timeAgo(n.createdAt)}</Text>
                </View>
              </Pressable>
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
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardUnread: { borderColor: colors.brand + "55", backgroundColor: "#FBFEFC" },
  icon: { width: 42, height: 42, borderRadius: radius.md, alignItems: "center", justifyContent: "center", marginRight: spacing.md },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  title: { flex: 1, fontSize: font.size.md, fontWeight: font.weight.bold, color: colors.text },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.brand },
  message: { fontSize: font.size.sm, color: colors.textSecondary, marginTop: 3, lineHeight: 19 },
  time: { fontSize: font.size.xs, color: colors.textMuted, marginTop: 6 },
});
