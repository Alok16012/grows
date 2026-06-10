import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  Modal,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { ScreenHeader } from "@/components/ScreenHeader";
import { DateField, toISODate } from "@/components/DatePicker";
import { Field, Button, Card } from "@/components/ui";
import { api, ApiError } from "@/api";
import { colors, font, radius, spacing } from "@/theme";

const CATEGORIES: { label: string; value: string }[] = [
  { label: "Travel", value: "TRAVEL" },
  { label: "Transportation", value: "TRANSPORTATION" },
  { label: "Fuel", value: "FUEL" },
  { label: "Food", value: "FOOD" },
  { label: "Hotel", value: "HOTEL" },
  { label: "Accommodation", value: "ACCOMMODATION" },
  { label: "Office Supplies", value: "OFFICE_SUPPLIES" },
  { label: "Mobile Recharge", value: "MOBILE_RECHARGE" },
  { label: "Communication", value: "COMMUNICATION" },
  { label: "Medical", value: "MEDICAL" },
  { label: "Other", value: "OTHER" },
];

export default function NewExpenseScreen() {
  const router = useRouter();
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [catOpen, setCatOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState<string | null>(toISODate(new Date()));
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    const amt = parseFloat(amount);
    if (!title.trim()) return Alert.alert("Missing title", "Please add a short title for this expense.");
    if (!amount || isNaN(amt) || amt <= 0) return Alert.alert("Invalid amount", "Please enter a valid amount.");
    if (!date) return Alert.alert("Missing date", "Please select the expense date.");

    setSubmitting(true);
    try {
      // 1. Create as DRAFT
      const created = await api<{ id: string }>("/api/expenses", {
        method: "POST",
        body: { title: title.trim(), category: category.value, amount: amt, date, description: notes.trim() || null },
      });
      // 2. Submit for approval (DRAFT → SUBMITTED)
      if (created?.id) {
        await api(`/api/expenses/${created.id}`, { method: "PUT", body: { action: "SUBMIT" } }).catch(() => {});
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      Alert.alert("Submitted", "Your expense claim has been submitted for approval.", [
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
      <ScreenHeader title="New Expense" />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Card>
            <Text style={styles.label}>Category</Text>
            <Pressable style={styles.select} onPress={() => setCatOpen(true)}>
              <Text style={styles.selectText}>{category.label}</Text>
              <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
            </Pressable>

            <Field
              label="Title"
              placeholder="e.g. Client visit cab fare"
              value={title}
              onChangeText={setTitle}
              style={{ marginTop: spacing.lg }}
            />

            <Field
              label="Amount (₹)"
              placeholder="0"
              value={amount}
              onChangeText={(t) => setAmount(t.replace(/[^0-9.]/g, ""))}
              keyboardType="decimal-pad"
            />

            <DateField label="Date" value={date} onChange={setDate} />

            <Field
              label="Notes (optional)"
              placeholder="Add any details for the approver"
              value={notes}
              onChangeText={setNotes}
              multiline
              style={{ marginBottom: 0 }}
            />
          </Card>

          <View style={styles.hint}>
            <Ionicons name="information-circle-outline" size={15} color={colors.textMuted} />
            <Text style={styles.hintText}>Attach the bill receipt from the web portal after submitting.</Text>
          </View>

          <Button label="Submit Claim" icon="checkmark-circle-outline" onPress={submit} loading={submitting} style={{ marginTop: spacing.md }} />
          <View style={{ height: spacing.xxl }} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Category picker */}
      <Modal visible={catOpen} transparent animationType="slide" onRequestClose={() => setCatOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setCatOpen(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Select Category</Text>
            <ScrollView style={{ maxHeight: 380 }}>
              {CATEGORIES.map((c) => {
                const active = c.value === category.value;
                return (
                  <Pressable
                    key={c.value}
                    style={({ pressed }) => [styles.catRow, pressed && { backgroundColor: colors.surfaceAlt }]}
                    onPress={() => {
                      setCategory(c);
                      setCatOpen(false);
                    }}
                  >
                    <Text style={[styles.catLabel, active && { color: colors.navy, fontWeight: font.weight.bold }]}>{c.label}</Text>
                    {active ? <Ionicons name="checkmark-circle" size={20} color={colors.brand} /> : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: spacing.lg },
  label: { fontSize: font.size.sm, fontWeight: font.weight.semibold, color: colors.textSecondary, marginBottom: 6 },
  select: {
    height: 52,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    backgroundColor: colors.surfaceAlt,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  selectText: { fontSize: font.size.md, color: colors.text },
  hint: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: spacing.lg, paddingHorizontal: spacing.xs },
  hintText: { fontSize: font.size.xs, color: colors.textMuted, flex: 1 },
  backdrop: { flex: 1, backgroundColor: "rgba(15,39,71,0.45)", justifyContent: "flex-end" },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.lg, paddingBottom: spacing.xxl },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong, alignSelf: "center", marginBottom: spacing.md },
  sheetTitle: { fontSize: font.size.lg, fontWeight: font.weight.bold, color: colors.text, marginBottom: spacing.md },
  catRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: spacing.md, paddingHorizontal: spacing.sm },
  catLabel: { fontSize: font.size.md, color: colors.text },
});
