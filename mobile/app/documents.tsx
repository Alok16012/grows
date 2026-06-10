import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, RefreshControl, Linking, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { ScreenHeader } from "@/components/ScreenHeader";
import { api } from "@/api";
import { Card, StatusPill, EmptyState, Loading } from "@/components/ui";
import { colors, font, radius, spacing, tiles } from "@/theme";
import { shortDate, titleCase } from "@/format";
import type { EmployeeDoc } from "@/types";

const DOC_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  PHOTO: "person-circle",
  AADHAR: "card",
  PAN: "card",
  OFFER_LETTER: "document-text",
  APPOINTMENT_LETTER: "document-text",
  RESUME: "document",
  BANK: "business",
};

export default function DocumentsScreen() {
  const [docs, setDocs] = useState<EmployeeDoc[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api<EmployeeDoc[]>("/api/me/documents");
      setDocs(Array.isArray(res) ? res : []);
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

  async function open(url: string) {
    try {
      const ok = await Linking.canOpenURL(url);
      if (ok) Linking.openURL(url);
      else Alert.alert("Cannot open", "This document link could not be opened.");
    } catch {
      Alert.alert("Cannot open", "This document link could not be opened.");
    }
  }

  return (
    <View style={styles.root}>
      <ScreenHeader title="Documents" subtitle={`${docs.length} file${docs.length !== 1 ? "s" : ""}`} />
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.navy} />}
      >
        {!loaded ? (
          <Loading />
        ) : docs.length === 0 ? (
          <Card>
            <EmptyState icon="folder-open-outline" title="No documents" subtitle="Your offer letter, KYC and other documents will appear here." />
          </Card>
        ) : (
          <Card padded={false}>
            {docs.map((d, i) => (
              <View key={d.id}>
                {i > 0 ? <View style={styles.divider} /> : null}
                <Pressable
                  style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surfaceAlt }]}
                  onPress={() => open(d.fileUrl)}
                >
                  <View style={[styles.icon, { backgroundColor: tiles.blue.bg }]}>
                    <Ionicons name={DOC_ICON[d.type] ?? "document-text"} size={20} color={tiles.blue.fg} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.title} numberOfLines={1}>{titleCase(d.type)}</Text>
                    <Text style={styles.sub} numberOfLines={1}>{d.fileName} · {shortDate(d.uploadedAt)}</Text>
                  </View>
                  <View style={{ alignItems: "flex-end", gap: 6 }}>
                    <StatusPill status={d.status} />
                    <Ionicons name="download-outline" size={18} color={colors.navy} />
                  </View>
                </Pressable>
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
  divider: { height: 1, backgroundColor: colors.border, marginLeft: spacing.lg + 46 },
  row: { flexDirection: "row", alignItems: "center", padding: spacing.lg },
  icon: { width: 40, height: 40, borderRadius: radius.md, alignItems: "center", justifyContent: "center", marginRight: spacing.md },
  title: { fontSize: font.size.md, fontWeight: font.weight.semibold, color: colors.text },
  sub: { fontSize: font.size.sm, color: colors.textSecondary, marginTop: 2 },
});
