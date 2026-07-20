import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { StatusBar } from "expo-status-bar";
import { useFocusEffect } from "expo-router";
import * as Location from "expo-location";
import * as Haptics from "expo-haptics";
import { api, ApiError } from "@/api";
import { Card, StatusPill, EmptyState } from "@/components/ui";
import { colors, font, radius, spacing, shadow, gradients } from "@/theme";
import { hoursLabel, timeOf, shortDate } from "@/format";
import type { AttendanceToday, AttendanceRecord } from "@/types";

const DAYS = ["S", "M", "T", "W", "T", "F", "S"];

export default function AttendanceScreen() {
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<AttendanceToday | null>(null);
  const [now, setNow] = useState(new Date());
  const [busy, setBusy] = useState<"in" | "out" | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Live clock
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await api<AttendanceToday>("/api/me/attendance");
      setData(res);
    } catch {
      // keep prior state
    } finally {
      setLoaded(true);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  async function punch(action: "in" | "out") {
    setBusy(action);
    let lat: number | null = null;
    let lng: number | null = null;
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === "granted") {
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        lat = pos.coords.latitude;
        lng = pos.coords.longitude;
      }
    } catch {
      // Location optional — proceed without it.
    }
    try {
      await api("/api/me/attendance", { method: "POST", body: { action, lat, lng } });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      await load();
    } catch (e) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      Alert.alert("Could not record", e instanceof ApiError ? e.message : "Please try again.");
    } finally {
      setBusy(null);
    }
  }

  const today = data?.today;
  const checkedIn = !!today?.checkIn;
  const checkedOut = !!today?.checkOut;
  const recent = data?.recent ?? [];

  // Build this week's present/absent map
  const weekMap = buildWeek(recent);

  const clock = now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  const dateLabel = now.toLocaleDateString("en-US", { weekday: "long", day: "numeric", month: "long" });

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.navy} />}
      >
        <LinearGradient
          colors={gradients.navy as [string, string]}
          style={[styles.header, { paddingTop: insets.top + spacing.md }]}
        >
          <Text style={styles.headerTitle}>Attendance</Text>
          <Text style={styles.clock}>{clock}</Text>
          <Text style={styles.date}>{dateLabel}</Text>
        </LinearGradient>

        <View style={styles.body}>
        {/* Punch card */}
        <Card style={styles.punchCard}>
          <View style={styles.punchTimes}>
            <View style={styles.punchTime}>
              <Ionicons name="log-in-outline" size={18} color={colors.success} />
              <Text style={styles.punchTimeLabel}>Check In</Text>
              <Text style={styles.punchTimeVal}>{timeOf(today?.checkIn)}</Text>
            </View>
            <View style={styles.punchSep} />
            <View style={styles.punchTime}>
              <Ionicons name="log-out-outline" size={18} color={colors.danger} />
              <Text style={styles.punchTimeLabel}>Check Out</Text>
              <Text style={styles.punchTimeVal}>{timeOf(today?.checkOut)}</Text>
            </View>
          </View>

          <View style={styles.punchButtons}>
            <PunchButton
              label="Check In"
              icon="finger-print"
              color={colors.success}
              disabled={checkedIn}
              loading={busy === "in"}
              onPress={() => punch("in")}
            />
            <PunchButton
              label="Check Out"
              icon="exit-outline"
              color={colors.danger}
              disabled={!checkedIn || checkedOut}
              loading={busy === "out"}
              onPress={() => punch("out")}
            />
          </View>

          <View style={styles.hoursRow}>
            <Ionicons name="time-outline" size={16} color={colors.textSecondary} />
            <Text style={styles.hoursText}>
              Worked today: <Text style={styles.hoursStrong}>{hoursLabel(today?.workingHrs)}</Text>
            </Text>
            <View style={{ flex: 1 }} />
            {today ? <StatusPill status={today.status} /> : null}
          </View>
        </Card>

        {/* Weekly summary */}
        <Text style={styles.heading}>This Week</Text>
        <Card style={styles.weekCard}>
          <View style={styles.weekRow}>
            {weekMap.map((d, i) => (
              <View key={i} style={styles.weekDay}>
                <View
                  style={[
                    styles.weekDot,
                    d.state === "present" && { backgroundColor: colors.success },
                    d.state === "absent" && { backgroundColor: colors.dangerTint, borderColor: colors.danger, borderWidth: 1 },
                    d.state === "future" && { backgroundColor: colors.surfaceAlt, borderColor: colors.border, borderWidth: 1 },
                    d.isToday && { transform: [{ scale: 1.12 }] },
                  ]}
                >
                  {d.state === "present" ? <Ionicons name="checkmark" size={14} color={colors.white} /> : null}
                </View>
                <Text style={[styles.weekLabel, d.isToday && { color: colors.navy, fontWeight: font.weight.bold }]}>
                  {DAYS[i]}
                </Text>
              </View>
            ))}
          </View>
        </Card>

        {/* History */}
        <Text style={styles.heading}>Recent History</Text>
        {!loaded ? (
          <ActivityIndicator color={colors.navy} style={{ marginTop: spacing.xl }} />
        ) : recent.length === 0 ? (
          <Card>
            <EmptyState icon="calendar-outline" title="No attendance yet" subtitle="Your check-ins will appear here." />
          </Card>
        ) : (
          <Card padded={false}>
            {recent.map((r, i) => (
              <View key={r.id}>
                {i > 0 ? <View style={styles.histDivider} /> : null}
                <HistoryRow rec={r} />
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

function PunchButton({
  label,
  icon,
  color,
  disabled,
  loading,
  onPress,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  disabled?: boolean;
  loading?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.punchBtn,
        { backgroundColor: disabled ? colors.surfaceAlt : color },
        pressed && !disabled && { transform: [{ scale: 0.97 }] },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={disabled ? colors.textMuted : colors.white} />
      ) : (
        <>
          <Ionicons name={icon} size={22} color={disabled ? colors.textMuted : colors.white} />
          <Text style={[styles.punchBtnText, { color: disabled ? colors.textMuted : colors.white }]}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

function HistoryRow({ rec }: { rec: AttendanceRecord }) {
  return (
    <View style={styles.histRow}>
      <View style={styles.histDate}>
        <Text style={styles.histDay}>{new Date(rec.date).getDate()}</Text>
        <Text style={styles.histMon}>
          {new Date(rec.date).toLocaleDateString("en-US", { month: "short" })}
        </Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.histTime}>
          {timeOf(rec.checkIn)} → {timeOf(rec.checkOut)}
        </Text>
        <Text style={styles.histSub}>{hoursLabel(rec.workingHrs)} worked</Text>
      </View>
      <StatusPill status={rec.status} />
    </View>
  );
}

function buildWeek(recent: AttendanceRecord[]) {
  const today = new Date();
  const start = new Date(today);
  start.setDate(today.getDate() - today.getDay()); // Sunday
  const present = new Set(
    recent
      .filter((r) => !!r.checkIn)
      .map((r) => new Date(r.date).toDateString())
  );
  return Array.from({ length: 7 }).map((_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const isToday = d.toDateString() === today.toDateString();
    const isFuture = d > today && !isToday;
    let state: "present" | "absent" | "future" = "absent";
    if (isFuture) state = "future";
    else if (present.has(d.toDateString())) state = "present";
    return { isToday, state };
  });
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl + spacing.lg,
    alignItems: "center",
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },
  headerTitle: { color: colors.onNavyMuted, fontSize: font.size.md, fontWeight: font.weight.semibold },
  clock: { color: colors.white, fontSize: 44, fontWeight: font.weight.heavy, marginTop: spacing.xs, letterSpacing: 0.5 },
  date: { color: colors.onNavyMuted, fontSize: font.size.sm, marginTop: 2 },
  scroll: { flexGrow: 1 },
  body: { paddingHorizontal: spacing.lg },
  punchCard: { marginTop: -spacing.xxl },
  punchTimes: { flexDirection: "row", alignItems: "center" },
  punchTime: { flex: 1, alignItems: "center" },
  punchSep: { width: 1, height: 44, backgroundColor: colors.border },
  punchTimeLabel: { fontSize: font.size.xs, color: colors.textSecondary, marginTop: 4 },
  punchTimeVal: { fontSize: font.size.lg, fontWeight: font.weight.bold, color: colors.text, marginTop: 2 },
  punchButtons: { flexDirection: "row", gap: spacing.md, marginTop: spacing.lg },
  punchBtn: {
    flex: 1,
    height: 56,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  punchBtnText: { fontSize: font.size.md, fontWeight: font.weight.bold },
  hoursRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: spacing.lg },
  hoursText: { fontSize: font.size.sm, color: colors.textSecondary },
  hoursStrong: { color: colors.text, fontWeight: font.weight.bold },
  heading: {
    fontSize: font.size.lg,
    fontWeight: font.weight.bold,
    color: colors.text,
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },
  weekCard: {},
  weekRow: { flexDirection: "row", justifyContent: "space-between" },
  weekDay: { alignItems: "center", flex: 1 },
  weekDot: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  weekLabel: { fontSize: font.size.xs, color: colors.textSecondary, marginTop: 6 },
  histDivider: { height: 1, backgroundColor: colors.border, marginLeft: spacing.lg + 48 },
  histRow: { flexDirection: "row", alignItems: "center", padding: spacing.lg },
  histDate: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.md,
  },
  histDay: { fontSize: font.size.lg, fontWeight: font.weight.bold, color: colors.navy },
  histMon: { fontSize: font.size.xs, color: colors.textSecondary, textTransform: "uppercase" },
  histTime: { fontSize: font.size.md, fontWeight: font.weight.semibold, color: colors.text },
  histSub: { fontSize: font.size.sm, color: colors.textSecondary, marginTop: 2 },
});
