import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { ScreenHeader } from "@/components/ScreenHeader";
import { DateField } from "@/components/DatePicker";
import { Field, Button, Card } from "@/components/ui";
import { api, ApiError } from "@/api";
import { colors, font, radius, spacing } from "@/theme";

const TYPES = ["Casual", "Sick", "Earned", "Unpaid"];

function daysBetween(a: string, b: string) {
  const d1 = new Date(a + "T00:00:00");
  const d2 = new Date(b + "T00:00:00");
  const diff = Math.round((d2.getTime() - d1.getTime()) / 86400000);
  return diff >= 0 ? diff + 1 : 0;
}

export default function ApplyLeaveScreen() {
  const router = useRouter();
  const [type, setType] = useState("Casual");
  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const days = from && to ? daysBetween(from, to) : 0;

  async function submit() {
    if (!from || !to) {
      Alert.alert("Missing dates", "Please choose both start and end dates.");
      return;
    }
    if (days <= 0) {
      Alert.alert("Invalid range", "End date must be on or after the start date.");
      return;
    }
    setSubmitting(true);
    try {
      await api("/api/leaves", {
        method: "POST",
        body: { type, startDate: from, endDate: to, days, reason: reason.trim() || null },
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      Alert.alert("Submitted", "Your leave request has been submitted for approval.", [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch (e) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      Alert.alert("Could not submit", e instanceof ApiError ? e.message : "Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={styles.root}>
      <ScreenHeader title="Apply Leave" />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Card>
            <Text style={styles.label}>Leave Type</Text>
            <View style={styles.chips}>
              {TYPES.map((t) => {
                const active = type === t;
                return (
                  <Pressable
                    key={t}
                    onPress={() => setType(t)}
                    style={[styles.chip, active && styles.chipActive]}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{t}</Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={{ height: spacing.lg }} />

            <DateField label="From Date" value={from} onChange={setFrom} minDate={undefined} />
            <DateField label="To Date" value={to} onChange={setTo} minDate={from ?? undefined} />

            {days > 0 ? (
              <View style={styles.daysBadge}>
                <Text style={styles.daysText}>{days} day{days > 1 ? "s" : ""} requested</Text>
              </View>
            ) : null}

            <Field
              label="Reason (optional)"
              placeholder="Add a short reason for your leave"
              value={reason}
              onChangeText={setReason}
              multiline
              style={{ marginTop: spacing.lg, marginBottom: 0 }}
            />
          </Card>

          <Button label="Submit Request" icon="checkmark-circle-outline" onPress={submit} loading={submitting} style={{ marginTop: spacing.xl }} />
          <View style={{ height: spacing.xxl }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: spacing.lg },
  label: { fontSize: font.size.sm, fontWeight: font.weight.semibold, color: colors.textSecondary, marginBottom: spacing.sm },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.navy, borderColor: colors.navy },
  chipText: { fontSize: font.size.sm, fontWeight: font.weight.semibold, color: colors.textSecondary },
  chipTextActive: { color: colors.white },
  daysBadge: {
    alignSelf: "flex-start",
    backgroundColor: colors.brandTint,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    marginTop: spacing.xs,
  },
  daysText: { color: colors.brandDark, fontSize: font.size.sm, fontWeight: font.weight.bold },
});
