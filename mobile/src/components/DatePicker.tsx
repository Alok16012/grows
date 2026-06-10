import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable, Modal } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, font, radius, spacing, shadow } from "@/theme";

const WEEK = ["S", "M", "T", "W", "T", "F", "S"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function toISODate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * A self-contained calendar field — opens a modal month grid. No native
 * date-picker dependency, so it behaves identically on iOS and Android.
 * `value` / `onChange` use ISO `YYYY-MM-DD` strings.
 */
export function DateField({
  label,
  value,
  onChange,
  minDate,
  placeholder = "Select date",
}: {
  label?: string;
  value: string | null;
  onChange: (iso: string) => void;
  minDate?: string;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const initial = value ? new Date(value) : new Date();
  const [view, setView] = useState(new Date(initial.getFullYear(), initial.getMonth(), 1));

  const min = minDate ? new Date(minDate + "T00:00:00") : null;
  const display = value
    ? new Date(value).toLocaleDateString("en-US", { day: "2-digit", month: "short", year: "numeric" })
    : placeholder;

  const year = view.getFullYear();
  const month = view.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array.from({ length: firstDay }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  function pick(day: number) {
    const d = new Date(year, month, day);
    onChange(toISODate(d));
    setOpen(false);
  }

  function shiftMonth(delta: number) {
    setView(new Date(year, month + delta, 1));
  }

  return (
    <View style={{ marginBottom: spacing.lg }}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <Pressable style={styles.field} onPress={() => setOpen(true)}>
        <Ionicons name="calendar-outline" size={18} color={colors.textSecondary} />
        <Text style={[styles.fieldText, !value && { color: colors.textMuted }]}>{display}</Text>
        <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.calHeader}>
              <Pressable onPress={() => shiftMonth(-1)} hitSlop={10} style={styles.navBtn}>
                <Ionicons name="chevron-back" size={20} color={colors.navy} />
              </Pressable>
              <Text style={styles.calTitle}>
                {MONTHS[month]} {year}
              </Text>
              <Pressable onPress={() => shiftMonth(1)} hitSlop={10} style={styles.navBtn}>
                <Ionicons name="chevron-forward" size={20} color={colors.navy} />
              </Pressable>
            </View>

            <View style={styles.weekRow}>
              {WEEK.map((w, i) => (
                <Text key={i} style={styles.weekLabel}>
                  {w}
                </Text>
              ))}
            </View>

            <View style={styles.grid}>
              {cells.map((day, i) => {
                if (day === null) return <View key={i} style={styles.cell} />;
                const d = new Date(year, month, day);
                const isSelected = value === toISODate(d);
                const isToday = toISODate(d) === toISODate(new Date());
                const disabled = !!min && d < min;
                return (
                  <Pressable
                    key={i}
                    style={styles.cell}
                    disabled={disabled}
                    onPress={() => pick(day)}
                  >
                    <View
                      style={[
                        styles.cellInner,
                        isSelected && { backgroundColor: colors.navy },
                        !isSelected && isToday && { borderWidth: 1, borderColor: colors.brand },
                      ]}
                    >
                      <Text
                        style={[
                          styles.cellText,
                          isSelected && { color: colors.white, fontWeight: font.weight.bold },
                          disabled && { color: colors.textMuted, opacity: 0.4 },
                        ]}
                      >
                        {day}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: font.size.sm, fontWeight: font.weight.semibold, color: colors.textSecondary, marginBottom: 6 },
  field: {
    height: 52,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    backgroundColor: colors.surfaceAlt,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  fieldText: { flex: 1, fontSize: font.size.md, color: colors.text },
  backdrop: { flex: 1, backgroundColor: "rgba(15,39,71,0.45)", alignItems: "center", justifyContent: "center", padding: spacing.xl },
  sheet: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.lg,
    ...shadow.raised,
  },
  calHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.md },
  navBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surfaceAlt, alignItems: "center", justifyContent: "center" },
  calTitle: { fontSize: font.size.lg, fontWeight: font.weight.bold, color: colors.text },
  weekRow: { flexDirection: "row", marginBottom: spacing.xs },
  weekLabel: { flex: 1, textAlign: "center", fontSize: font.size.xs, color: colors.textMuted, fontWeight: font.weight.semibold },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  cell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: "center", justifyContent: "center" },
  cellInner: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  cellText: { fontSize: font.size.md, color: colors.text },
});

export { toISODate };
