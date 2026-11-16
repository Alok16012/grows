import { Document, Page, View, Text, StyleSheet, Image } from "@react-pdf/renderer"
import { COMPANY } from "@/lib/company"

// One colour per quantity, the same in the statistics, the charts and their
// legends (client request, Nov 2026): green = inspected / accepted quantity,
// orange = rework, red = rejected. The charts themselves are captured from
// the reports page, which uses the same three colours.
const C = { green: "#16a34a", orange: "#d97706", red: "#dc2626", line: "#1e3a8a" }

/** 0.77 → "0.77%"; a tiny share keeps enough digits to show it isn't zero (0.0033%). */
function pct(part: number, total: number): string {
    if (!total || !part) return "0.00%"
    const v = (part / total) * 100
    if (v >= 0.01) return `${v.toFixed(2)}%`
    return `${v.toFixed(4).replace(/0+$/, "")}%`
}

const styles = StyleSheet.create({
    page: { fontFamily: "Helvetica", padding: 36, fontSize: 10.5, backgroundColor: "#ffffff" },
    header: { marginBottom: 18, paddingBottom: 14, borderBottomWidth: 1.5, borderBottomColor: "#1a9e6e" },
    headerTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
    headerLeft: { flex: 1 },
    logoImg: { width: 80, height: 40, objectFit: "contain", marginLeft: 12 },
    headerTitle: { fontSize: 18, fontFamily: "Helvetica-Bold", color: "#1a1a18", marginBottom: 3 },
    headerProject: { fontSize: 12, fontFamily: "Helvetica-Bold", color: "#1a9e6e", marginBottom: 4 },
    headerSub: { fontSize: 9.5, color: "#4b5563" },
    headerMeta: { flexDirection: "row", flexWrap: "wrap", marginTop: 8 },
    metaItem: { marginRight: 18, marginBottom: 3 },
    metaLabel: { fontSize: 8, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 1 },
    metaValue: { fontSize: 10.5, fontFamily: "Helvetica-Bold", color: "#1a1a18" },
    sectionTitle: { fontSize: 11.5, fontFamily: "Helvetica-Bold", color: "#1a1a18", marginBottom: 6, marginTop: 13, textTransform: "uppercase", letterSpacing: 0.5, paddingLeft: 8, borderLeftWidth: 3, borderLeftColor: "#1a9e6e" },
    statsGrid: { flexDirection: "row", gap: 6, marginBottom: 5 },
    statCard: { flex: 1, backgroundColor: "#f9f8f5", borderRadius: 5, padding: "9 11", borderWidth: 1, borderColor: "#e8e6e1" },
    statCard3: { flex: 1, backgroundColor: "#f9f8f5", borderRadius: 5, padding: "6 10", borderWidth: 1, borderColor: "#e8e6e1", borderLeftWidth: 3 },
    statLabel: { fontSize: 9.5, fontFamily: "Helvetica-Bold", color: "#1f2937", marginBottom: 3 },
    statValue: { fontSize: 17, fontFamily: "Helvetica-Bold", color: "#1a1a18" },
    statHint: { fontSize: 8, color: "#4b5563", marginTop: 2 },
    statFoot: { fontSize: 9, color: "#374151", marginTop: 1 },
    legend: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", marginTop: 5 },
    legendItem: { flexDirection: "row", alignItems: "center", marginHorizontal: 7, marginBottom: 2 },
    legendSwatch: { width: 9, height: 9, borderRadius: 2, marginRight: 4 },
    legendLine: { width: 14, height: 3, borderRadius: 1, marginRight: 4 },
    legendText: { fontSize: 9, fontFamily: "Helvetica-Bold" },
    legendNote: { fontSize: 8, color: "#4b5563", textAlign: "center", marginTop: 2 },
    chartTitle: { fontSize: 9, fontFamily: "Helvetica-Bold", color: "#1f2937", marginBottom: 4 },
    tableHeaderRow: { flexDirection: "row", backgroundColor: "#f9f8f5", paddingVertical: 5, paddingHorizontal: 8, borderTopLeftRadius: 4, borderTopRightRadius: 4, borderBottomWidth: 1, borderBottomColor: "#e8e6e1" },
    tableRow: { flexDirection: "row", paddingVertical: 5, paddingHorizontal: 8, borderBottomWidth: 0.5, borderBottomColor: "#f0f0f0" },
    tableRowAlt: { backgroundColor: "#f9f8f5" },
    tableTotalRow: { flexDirection: "row", paddingVertical: 6, paddingHorizontal: 8, backgroundColor: "#eef2f7", borderTopWidth: 1, borderTopColor: "#cbd5e1" },
    tdBold: { flex: 1, fontSize: 10, color: "#1a1a18", fontFamily: "Helvetica-Bold" },
    chartCard: { borderWidth: 1, borderColor: "#e8e6e1", borderRadius: 6, padding: 6 },
    th: { flex: 1, fontSize: 8.5, fontFamily: "Helvetica-Bold", color: "#4b5563", textTransform: "uppercase" },
    td: { flex: 1, fontSize: 10, color: "#1a1a18" },
    tdGreen: { flex: 1, fontSize: 10, color: "#16a34a", fontFamily: "Helvetica-Bold" },
    tdOrange: { flex: 1, fontSize: 10, color: "#d97706", fontFamily: "Helvetica-Bold" },
    tdRed: { flex: 1, fontSize: 10, color: "#dc2626", fontFamily: "Helvetica-Bold" },
    defectRow: { flexDirection: "row", alignItems: "center", marginBottom: 5, paddingHorizontal: 4 },
    rankBadge: { width: 19, height: 19, backgroundColor: "#f3f4f6", borderRadius: 9.5, alignItems: "center", justifyContent: "center", marginRight: 8 },
    rankText: { fontSize: 9, fontFamily: "Helvetica-Bold", color: "#374151" },
    defectName: { flex: 1.5, fontSize: 10.5, color: "#1a1a18", fontFamily: "Helvetica-Bold" },
    // Top defects: one bar per defect, orange for its rework quantity and red
    // for its rejected quantity, then the same split as numbers.
    defectHead: { flexDirection: "row", alignItems: "center", paddingHorizontal: 4, marginBottom: 5 },
    defectHeadText: { fontSize: 8.5, fontFamily: "Helvetica-Bold", color: "#4b5563", textTransform: "uppercase" },
    progressTrack: { flex: 1.3, height: 7, flexDirection: "row", backgroundColor: "#f0f0f0", borderRadius: 3, marginLeft: 8, marginRight: 10, overflow: "hidden" },
    colRework: { width: 52, fontSize: 10.5, fontFamily: "Helvetica-Bold", color: "#d97706", textAlign: "right" },
    colRejected: { width: 56, fontSize: 10.5, fontFamily: "Helvetica-Bold", color: "#dc2626", textAlign: "right" },
    colTotal: { width: 44, fontSize: 10.5, fontFamily: "Helvetica-Bold", color: "#1a1a18", textAlign: "right" },
    colShare: { width: 46, fontSize: 9.5, color: "#4b5563", textAlign: "right" },
    footer: { position: "absolute", bottom: 22, left: 36, fontSize: 8.5, color: "#6b7280" },
    pageNum: { position: "absolute", bottom: 22, right: 36, fontSize: 8.5, color: "#6b7280" },
})

type LegendEntry = { label: string; color: string; line?: boolean }

/** Says what each colour stands for: a colour square and the name in the same colour, as in the chart pictures' own keys. */
function ChartLegend({ items, note }: { items: LegendEntry[]; note?: string }) {
    return (
        <View>
            <View style={styles.legend}>
                {items.map(it => (
                    <View key={it.label} style={styles.legendItem}>
                        <View style={[it.line ? styles.legendLine : styles.legendSwatch, { backgroundColor: it.color }]} />
                        <Text style={[styles.legendText, { color: it.color }]}>{it.label}</Text>
                    </View>
                ))}
            </View>
            {note && <Text style={styles.legendNote}>{note}</Text>}
        </View>
    )
}

/** One statistic: what it is, its value, and how to read it. */
function Stat({ label, value, hint, color }: { label: string; value: string; hint: string; color: string }) {
    return (
        <View style={[styles.statCard3, { borderLeftColor: color }]}>
            <Text style={styles.statLabel}>{label}</Text>
            <Text style={[styles.statValue, { color }]}>{value}</Text>
            <Text style={styles.statHint}>{hint}</Text>
        </View>
    )
}

/** Parts / inspectors drawn in the charts. Keep equal to the same names in reports/page.tsx, which captures them. */
const PART_CHART_MAX = 12
const INSPECTOR_CHART_MAX = 15
/** 2026-11-04 -> 04-Nov-2026 */
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
const dayText = (iso: unknown) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? ""))
    return m ? `${m[3]}-${MONTHS[Number(m[2]) - 1] ?? m[2]}-${m[1]}` : String(iso ?? "")
}

export function ReportDocument({ data, companyName, period, project, inspector, logoUrl, chartImages }: {
    data: any, companyName: string, period: string, project: string, inspector: string, logoUrl?: string,
    chartImages?: { pie?: string | null, trend?: string | null, partWise?: string | null, location?: string | null, inspector?: string | null, shift?: string | null, pareto?: string | null, week?: string | null, dayDefects?: string | null }
}) {
    const s = data?.summary
    const total: number = s?.totalInspected || 0
    // Indian digit grouping (1,04,476) everywhere, the same as the labels in the chart pictures.
    const n = (v: unknown) => (Number(v) || 0).toLocaleString("en-IN")
    const sum = (rows: any[], key: string) => rows.reduce((a, r) => a + (Number(r?.[key]) || 0), 0)
    const topDefects: any[] = (data?.topDefects || []).slice(0, 5)
    const dayWise: any[] = data?.dayWise || []
    const partWise: any[] = data?.partWise || []
    const inspectorWise: any[] = data?.inspectorWise || []
    const partNote = partWise.length > PART_CHART_MAX
        ? `Top ${PART_CHART_MAX} of ${partWise.length} parts by inspected quantity; all parts are in the Part-Wise Summary table.`
        : undefined
    const inspectorNote = inspectorWise.length > INSPECTOR_CHART_MAX
        ? `Top ${INSPECTOR_CHART_MAX} of ${inspectorWise.length} inspectors by inspected quantity; all are in the Inspector-Wise Summary table.`
        : undefined
    const split = data?.defectSplit as { exact: number; estimated: number; unclassified: number } | undefined
    const splitTotal = (split?.exact || 0) + (split?.estimated || 0) + (split?.unclassified || 0)

    return (
        <Document>
            {/* Single page — content flows continuously across pages automatically */}
            <Page size="A4" style={styles.page}>
                {/* Header with company name, project, period, logo */}
                <View style={styles.header}>
                    <View style={styles.headerTop}>
                        <View style={styles.headerLeft}>
                            <Text style={styles.headerTitle}>{companyName}</Text>
                            <Text style={styles.headerProject}>{project}</Text>
                            <Text style={styles.headerSub}>Quality Inspection Report</Text>
                            <View style={styles.headerMeta}>
                                <View style={styles.metaItem}>
                                    <Text style={styles.metaLabel}>Period</Text>
                                    <Text style={styles.metaValue}>{period}</Text>
                                </View>
                                <View style={styles.metaItem}>
                                    <Text style={styles.metaLabel}>Inspector</Text>
                                    <Text style={styles.metaValue}>{inspector}</Text>
                                </View>
                                <View style={styles.metaItem}>
                                    <Text style={styles.metaLabel}>Generated</Text>
                                    <Text style={styles.metaValue}>{new Date().toLocaleDateString("en-IN")}</Text>
                                </View>
                            </View>
                        </View>
                        {logoUrl && (
                            <Image src={logoUrl} style={styles.logoImg} />
                        )}
                    </View>
                </View>

                {/* Section 1: Summary Statistics — one row per quantity, each as
                    quantity, rate, PPM. Order fixed by the client. */}
                <Text style={styles.sectionTitle}>Summary Statistics</Text>
                <View style={styles.statsGrid}>
                    <Stat label="Total Inspected" value={n(s?.totalInspected)} hint="Quantity checked (units)" color={C.green} />
                    <Stat label="Total Accepted" value={n(s?.totalAccepted)} hint="Quantity passed (units)" color={C.green} />
                    <Stat label="Acceptance Rate (%)" value={pct(s?.totalAccepted || 0, total)} hint="Accepted / Inspected x 100" color={C.green} />
                </View>
                <View style={styles.statsGrid}>
                    <Stat label="Total Rework" value={n(s?.totalRework)} hint="Quantity sent for rework (units)" color={C.orange} />
                    <Stat label="Rework Rate (%)" value={pct(s?.totalRework || 0, total)} hint="Rework / Inspected x 100" color={C.orange} />
                    <Stat label="Rework PPM" value={n(s?.reworkPPM)} hint="Rework per million inspected" color={C.orange} />
                </View>
                <View style={styles.statsGrid}>
                    <Stat label="Total Rejected" value={n(s?.totalRejected)} hint="Quantity rejected (units)" color={C.red} />
                    <Stat label="Rejected Rate (%)" value={pct(s?.totalRejected || 0, total)} hint="Rejected / Inspected x 100" color={C.red} />
                    <Stat label="Rejected PPM" value={n(s?.rejectionPPM)} hint="Rejected per million inspected" color={C.red} />
                </View>
                <Text style={styles.statFoot}>Overall PPM (rework + rejected, per million inspected): {n(s?.overallPPM)}</Text>

                {/* Section 2: Performance charts, one per row so their labels stay
                    readable. Every picture carries its own data labels and key. */}
                {chartImages?.pie && (
                    <View wrap={false}>
                        <Text style={styles.sectionTitle}>Performance Overview</Text>
                        <View style={[styles.chartCard, { marginBottom: 6 }]}>
                            <Text style={styles.chartTitle}>Overall Quality Status</Text>
                            <Image src={chartImages.pie} style={{ width: "100%" }} />
                        </View>
                    </View>
                )}
                {chartImages?.trend && (
                    <View wrap={false} style={[styles.chartCard, { marginBottom: 8 }]}>
                        <Text style={styles.chartTitle}>Daily Performance Trend</Text>
                        <Image src={chartImages.trend} style={{ width: "100%" }} />
                    </View>
                )}
                {chartImages?.dayDefects && (
                    <View wrap={false} style={[styles.chartCard, { marginBottom: 8 }]}>
                        <Text style={styles.chartTitle}>Daily Rework / Rejected Quantity</Text>
                        <Image src={chartImages.dayDefects} style={{ width: "100%" }} />
                    </View>
                )}

                {/* Top Defects — each defect's quantity split by colour: orange =
                    rework, red = rejected. Sits before the Pareto chart (same data) and
                    fills the rest of page 1, which the taller Pareto no longer fits. */}
                {topDefects.length > 0 && (
                    <View wrap={false}>
                        <Text style={styles.sectionTitle}>Top 5 Defects</Text>
                        <View style={styles.defectHead}>
                            <View style={{ width: 27 }} />
                            <Text style={[styles.defectHeadText, { flex: 1.5 }]}>Defect</Text>
                            <View style={{ flex: 1.3, marginLeft: 8, marginRight: 10 }} />
                            <Text style={[styles.defectHeadText, { width: 52, textAlign: "right", color: C.orange }]}>Rework</Text>
                            <Text style={[styles.defectHeadText, { width: 56, textAlign: "right", color: C.red }]}>Rejected</Text>
                            <Text style={[styles.defectHeadText, { width: 44, textAlign: "right" }]}>Total</Text>
                            <Text style={[styles.defectHeadText, { width: 46, textAlign: "right" }]}>Share</Text>
                        </View>
                        {topDefects.map((d: any, i: number) => {
                            const count = d.count || 0
                            const rejected = d.rejected ?? 0
                            const other = d.unclassified ?? 0
                            const rework = d.rework ?? Math.max(0, count - rejected - other)
                            // Bar length = the defect's share of all defects; a non-zero
                            // part always gets a sliver so 2 rejected in 232 still shows.
                            const len = Math.min(d.percentage, 100)
                            const part = (v: number) => (count > 0 && v > 0 ? Math.max((v / count) * len, 1.5) : 0)
                            return (
                                <View key={i} style={styles.defectRow}>
                                    <View style={styles.rankBadge}>
                                        <Text style={styles.rankText}>{i + 1}</Text>
                                    </View>
                                    <Text style={styles.defectName}>{d.defectName}</Text>
                                    <View style={styles.progressTrack}>
                                        <View style={{ width: `${part(rework)}%`, backgroundColor: C.orange }} />
                                        <View style={{ width: `${part(rejected)}%`, backgroundColor: C.red }} />
                                        <View style={{ width: `${part(other)}%`, backgroundColor: "#9ca3af" }} />
                                    </View>
                                    <Text style={styles.colRework}>{n(rework)}</Text>
                                    <Text style={styles.colRejected}>{n(rejected)}</Text>
                                    <Text style={styles.colTotal}>{n(count)}</Text>
                                    <Text style={styles.colShare}>{d.percentage.toFixed(2)}%</Text>
                                </View>
                            )
                        })}
                        <ChartLegend items={[
                            { label: "Rework defects", color: C.orange },
                            { label: "Rejected defects", color: C.red },
                        ]} note={split && splitTotal > 0 && split.estimated > 0
                            ? `Split follows each inspection's rework and rejected totals. ${pct(split.estimated, splitTotal)} of the defect quantity is from inspections with both, where the split is in proportion.`
                            : "Share = this defect's part of all defects found"} />
                    </View>
                )}

                {/* Section 3: Pareto Analysis */}
                {chartImages?.pareto && (
                    <View wrap={false}>
                        <Text style={styles.sectionTitle}>Pareto Analysis — Defect Frequency</Text>
                        <View style={{ borderWidth: 1, borderColor: "#e8e6e1", borderRadius: 6, padding: 6, marginBottom: 8 }}>
                            <Image src={chartImages.pareto} style={{ width: "100%" }} />
                            <Text style={styles.legendNote}>Bars: quantity of each defect. Line: running share of all defects.</Text>
                        </View>
                    </View>
                )}

                {/* Section 4: Part-wise chart, full width so part names stay readable.
                    The chart shows the busiest parts; the table further down has all. */}
                {chartImages?.partWise && (
                    <View style={{ marginBottom: 8 }} wrap={false}>
                        <Text style={styles.sectionTitle}>Part Wise Comparison</Text>
                        <View style={{ borderWidth: 1, borderColor: "#e8e6e1", borderRadius: 6, padding: 6 }}>
                            <Image src={chartImages.partWise} style={{ width: "100%" }} />
                            {partNote && <Text style={styles.legendNote}>{partNote}</Text>}
                        </View>
                    </View>
                )}

                {/* Section 4-loc: Location-wise chart */}
                {chartImages?.location && (
                    <View style={{ marginBottom: 8 }} wrap={false}>
                        <Text style={styles.sectionTitle}>Location-Wise Analysis</Text>
                        <View style={{ borderWidth: 1, borderColor: "#e8e6e1", borderRadius: 6, padding: 6 }}>
                            <Image src={chartImages.location} style={{ width: "100%" }} />
                        </View>
                    </View>
                )}

                {/* Section 4a: Inspector-wise chart (table below covers the same data) */}
                {chartImages?.inspector && (
                    <View style={{ marginBottom: 8 }} wrap={false}>
                        <Text style={styles.sectionTitle}>Inspector-Wise Analysis</Text>
                        <View style={{ borderWidth: 1, borderColor: "#e8e6e1", borderRadius: 6, padding: 6 }}>
                            <Image src={chartImages.inspector} style={{ width: "100%" }} />
                            {inspectorNote && <Text style={styles.legendNote}>{inspectorNote}</Text>}
                        </View>
                    </View>
                )}

                {/* Section 4b: Shift-wise comparison */}
                {(chartImages as any)?.shift && (
                    <View style={{ marginBottom: 8 }} wrap={false}>
                        <Text style={styles.sectionTitle}>Shift-Wise Analysis</Text>
                        <View style={{ borderWidth: 1, borderColor: "#e8e6e1", borderRadius: 6, padding: 6 }}>
                            <Image src={(chartImages as any).shift} style={{ width: "100%" }} />
                        </View>
                    </View>
                )}

                {/* Tables. The header row repeats on every page a table runs onto, a
                    total row closes it, and a heading is never left alone at the foot
                    of a page. */}
                {dayWise.length > 0 && (
                    <>
                        <Text style={styles.sectionTitle} minPresenceAhead={70}>Day-wise Inspection Log</Text>
                        <View>
                            <View style={styles.tableHeaderRow} fixed>
                                <Text style={[styles.th, { flex: 1.8 }]}>Date</Text>
                                <Text style={styles.th}>Inspected</Text>
                                <Text style={styles.th}>Accepted</Text>
                                <Text style={styles.th}>Rework</Text>
                                <Text style={styles.th}>Rejected</Text>
                                <Text style={styles.th}>Quality %</Text>
                            </View>
                            {dayWise.map((d: any, i: number) => (
                                <View key={i} style={[styles.tableRow, i % 2 !== 0 ? styles.tableRowAlt : {}]} wrap={false}>
                                    <Text style={[styles.td, { flex: 1.8 }]}>{dayText(d.date)}</Text>
                                    <Text style={styles.td}>{n(d.totalInspected)}</Text>
                                    <Text style={styles.tdGreen}>{n(d.totalAccepted)}</Text>
                                    <Text style={styles.tdOrange}>{n(d.totalRework)}</Text>
                                    <Text style={styles.tdRed}>{n(d.totalRejected)}</Text>
                                    <Text style={styles.td}>{d.qualityRate.toFixed(2)}%</Text>
                                </View>
                            ))}
                            <View style={styles.tableTotalRow} wrap={false}>
                                <Text style={[styles.tdBold, { flex: 1.8 }]}>Total</Text>
                                <Text style={styles.tdBold}>{n(sum(dayWise, "totalInspected"))}</Text>
                                <Text style={styles.tdGreen}>{n(sum(dayWise, "totalAccepted"))}</Text>
                                <Text style={styles.tdOrange}>{n(sum(dayWise, "totalRework"))}</Text>
                                <Text style={styles.tdRed}>{n(sum(dayWise, "totalRejected"))}</Text>
                                <Text style={styles.tdBold}>{pct(sum(dayWise, "totalAccepted"), sum(dayWise, "totalInspected"))}</Text>
                            </View>
                        </View>
                    </>
                )}

                {inspectorWise.length > 0 && (
                    <>
                        <Text style={styles.sectionTitle} minPresenceAhead={70}>Inspector-Wise Summary</Text>
                        <View>
                            <View style={styles.tableHeaderRow} fixed>
                                <Text style={[styles.th, { flex: 2 }]}>Inspector</Text>
                                <Text style={styles.th}>Inspected</Text>
                                <Text style={styles.th}>Accepted</Text>
                                <Text style={styles.th}>Rework</Text>
                                <Text style={styles.th}>Rejected</Text>
                                <Text style={styles.th}>Quality %</Text>
                            </View>
                            {inspectorWise.map((d: any, i: number) => (
                                <View key={i} style={[styles.tableRow, i % 2 !== 0 ? styles.tableRowAlt : {}]} wrap={false}>
                                    <Text style={[styles.td, { flex: 2 }]}>{d.inspectorName}</Text>
                                    <Text style={styles.td}>{n(d.totalInspected)}</Text>
                                    <Text style={styles.tdGreen}>{n(d.totalAccepted)}</Text>
                                    <Text style={styles.tdOrange}>{n(d.totalRework)}</Text>
                                    <Text style={styles.tdRed}>{n(d.totalRejected)}</Text>
                                    <Text style={styles.td}>{d.qualityRate.toFixed(2)}%</Text>
                                </View>
                            ))}
                            <View style={styles.tableTotalRow} wrap={false}>
                                <Text style={[styles.tdBold, { flex: 2 }]}>Total</Text>
                                <Text style={styles.tdBold}>{n(sum(inspectorWise, "totalInspected"))}</Text>
                                <Text style={styles.tdGreen}>{n(sum(inspectorWise, "totalAccepted"))}</Text>
                                <Text style={styles.tdOrange}>{n(sum(inspectorWise, "totalRework"))}</Text>
                                <Text style={styles.tdRed}>{n(sum(inspectorWise, "totalRejected"))}</Text>
                                <Text style={styles.tdBold}>{pct(sum(inspectorWise, "totalAccepted"), sum(inspectorWise, "totalInspected"))}</Text>
                            </View>
                        </View>
                    </>
                )}

                {partWise.length > 0 && (
                    <>
                        <Text style={styles.sectionTitle} minPresenceAhead={70}>Part-Wise Summary</Text>
                        <View>
                            <View style={styles.tableHeaderRow} fixed>
                                <Text style={[styles.th, { flex: 2.5 }]}>Part / Component</Text>
                                <Text style={styles.th}>Inspected</Text>
                                <Text style={styles.th}>Accepted</Text>
                                <Text style={styles.th}>Rework</Text>
                                <Text style={styles.th}>Rejected</Text>
                                <Text style={styles.th}>Quality %</Text>
                                <Text style={styles.th}>Rej %</Text>
                            </View>
                            {partWise.map((p: any, i: number) => (
                                <View key={i} style={[styles.tableRow, i % 2 !== 0 ? styles.tableRowAlt : {}]} wrap={false}>
                                    <Text style={[styles.td, { flex: 2.5 }]}>{p.partName}</Text>
                                    <Text style={styles.td}>{n(p.totalInspected)}</Text>
                                    <Text style={styles.tdGreen}>{n(p.totalAccepted)}</Text>
                                    <Text style={styles.tdOrange}>{n(p.totalRework)}</Text>
                                    <Text style={styles.tdRed}>{n(p.totalRejected)}</Text>
                                    <Text style={styles.td}>{p.qualityRate.toFixed(2)}%</Text>
                                    <Text style={styles.tdRed}>{(p.rejectionPercent ?? 0).toFixed(2)}%</Text>
                                </View>
                            ))}
                            <View style={styles.tableTotalRow} wrap={false}>
                                <Text style={[styles.tdBold, { flex: 2.5 }]}>Total</Text>
                                <Text style={styles.tdBold}>{n(sum(partWise, "totalInspected"))}</Text>
                                <Text style={styles.tdGreen}>{n(sum(partWise, "totalAccepted"))}</Text>
                                <Text style={styles.tdOrange}>{n(sum(partWise, "totalRework"))}</Text>
                                <Text style={styles.tdRed}>{n(sum(partWise, "totalRejected"))}</Text>
                                <Text style={styles.tdBold}>{pct(sum(partWise, "totalAccepted"), sum(partWise, "totalInspected"))}</Text>
                                <Text style={styles.tdRed}>{pct(sum(partWise, "totalRejected"), sum(partWise, "totalInspected"))}</Text>
                            </View>
                        </View>
                    </>
                )}

                {/* Footer on every page */}
                <Text style={styles.footer} fixed>Generated: {new Date().toLocaleDateString("en-IN")}  |  {companyName}  |  {COMPANY.name} Quality Report</Text>
                <Text style={styles.pageNum} fixed render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
            </Page>
        </Document>
    )
}
