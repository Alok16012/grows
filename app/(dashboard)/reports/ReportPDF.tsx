import { Document, Page, View, Text, StyleSheet, Image } from "@react-pdf/renderer"

const styles = StyleSheet.create({
    page: { fontFamily: "Helvetica", padding: 36, fontSize: 10, backgroundColor: "#ffffff" },
    header: { marginBottom: 18, paddingBottom: 14, borderBottomWidth: 1.5, borderBottomColor: "#1a9e6e" },
    headerTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
    headerLeft: { flex: 1 },
    logoImg: { width: 80, height: 40, objectFit: "contain", marginLeft: 12 },
    headerTitle: { fontSize: 18, fontFamily: "Helvetica-Bold", color: "#1a1a18", marginBottom: 3 },
    headerProject: { fontSize: 11, fontFamily: "Helvetica-Bold", color: "#1a9e6e", marginBottom: 4 },
    headerSub: { fontSize: 8, color: "#6b6860" },
    headerMeta: { flexDirection: "row", flexWrap: "wrap", marginTop: 8 },
    metaItem: { marginRight: 18, marginBottom: 3 },
    metaLabel: { fontSize: 7, color: "#9e9b95", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 1 },
    metaValue: { fontSize: 9, fontFamily: "Helvetica-Bold", color: "#1a1a18" },
    sectionTitle: { fontSize: 10, fontFamily: "Helvetica-Bold", color: "#1a1a18", marginBottom: 6, marginTop: 18, textTransform: "uppercase", letterSpacing: 0.5, paddingLeft: 8, borderLeftWidth: 3, borderLeftColor: "#1a9e6e" },
    statsGrid: { flexDirection: "row", gap: 6, marginBottom: 6 },
    statCard: { flex: 1, backgroundColor: "#f9f8f5", borderRadius: 5, padding: "9 11", borderWidth: 1, borderColor: "#e8e6e1" },
    statLabel: { fontSize: 7.5, color: "#9e9b95", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 4 },
    statValue: { fontSize: 15, fontFamily: "Helvetica-Bold", color: "#1a1a18" },
    tableHeaderRow: { flexDirection: "row", backgroundColor: "#f9f8f5", paddingVertical: 5, paddingHorizontal: 8, borderTopLeftRadius: 4, borderTopRightRadius: 4, borderBottomWidth: 1, borderBottomColor: "#e8e6e1" },
    tableRow: { flexDirection: "row", paddingVertical: 5, paddingHorizontal: 8, borderBottomWidth: 0.5, borderBottomColor: "#f0f0f0" },
    tableRowAlt: { backgroundColor: "#f9f8f5" },
    th: { flex: 1, fontSize: 7.5, fontFamily: "Helvetica-Bold", color: "#9e9b95", textTransform: "uppercase" },
    td: { flex: 1, fontSize: 9, color: "#1a1a18" },
    tdGreen: { flex: 1, fontSize: 9, color: "#1a9e6e", fontFamily: "Helvetica-Bold" },
    tdOrange: { flex: 1, fontSize: 9, color: "#d97706", fontFamily: "Helvetica-Bold" },
    tdRed: { flex: 1, fontSize: 9, color: "#dc2626", fontFamily: "Helvetica-Bold" },
    defectRow: { flexDirection: "row", alignItems: "center", marginBottom: 7, paddingHorizontal: 4 },
    rankBadge: { width: 18, height: 18, backgroundColor: "#fef2f2", borderRadius: 9, alignItems: "center", justifyContent: "center", marginRight: 8 },
    rankText: { fontSize: 8, fontFamily: "Helvetica-Bold", color: "#dc2626" },
    defectName: { flex: 1, fontSize: 9.5, color: "#1a1a18", fontFamily: "Helvetica-Bold" },
    defectCount: { fontSize: 9.5, color: "#dc2626", fontFamily: "Helvetica-Bold", marginRight: 5 },
    defectPct: { fontSize: 8.5, color: "#9e9b95" },
    progressTrack: { flex: 1.2, height: 4, backgroundColor: "#f0f0f0", borderRadius: 2, marginLeft: 10, marginRight: 8 },
    progressFill: { height: 4, backgroundColor: "#dc2626", borderRadius: 2 },
    footer: { position: "absolute", bottom: 22, left: 36, fontSize: 8, color: "#9e9b95" },
    pageNum: { position: "absolute", bottom: 22, right: 36, fontSize: 8, color: "#9e9b95" },
})

export function ReportDocument({ data, companyName, period, project, inspector, logoUrl }: {
    data: any, companyName: string, period: string, project: string, inspector: string, logoUrl?: string
}) {
    const s = data?.summary
    const topDefects: any[] = (data?.topDefects || []).slice(0, 5)
    const dayWise: any[] = data?.dayWise || []
    const partWise: any[] = data?.partWise || []
    const inspectorWise: any[] = data?.inspectorWise || []

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

                {/* Section 1: Summary Statistics */}
                <Text style={styles.sectionTitle}>Summary Statistics</Text>
                <View style={styles.statsGrid}>
                    <View style={styles.statCard}>
                        <Text style={styles.statLabel}>Total Inspected</Text>
                        <Text style={styles.statValue}>{(s?.totalInspected || 0).toLocaleString()}</Text>
                    </View>
                    <View style={styles.statCard}>
                        <Text style={styles.statLabel}>Total Accepted</Text>
                        <Text style={[styles.statValue, { color: "#1a9e6e" }]}>{(s?.totalAccepted || 0).toLocaleString()}</Text>
                    </View>
                    <View style={styles.statCard}>
                        <Text style={styles.statLabel}>Total Rework</Text>
                        <Text style={[styles.statValue, { color: "#d97706" }]}>{(s?.totalRework || 0).toLocaleString()}</Text>
                    </View>
                </View>
                <View style={styles.statsGrid}>
                    <View style={styles.statCard}>
                        <Text style={styles.statLabel}>Total Rejected</Text>
                        <Text style={[styles.statValue, { color: "#dc2626" }]}>{(s?.totalRejected || 0).toLocaleString()}</Text>
                    </View>
                    <View style={styles.statCard}>
                        <Text style={styles.statLabel}>Rework PPM</Text>
                        <Text style={[styles.statValue, { color: "#d97706" }]}>{(s?.reworkPPM || 0).toLocaleString()}</Text>
                    </View>
                    <View style={styles.statCard}>
                        <Text style={styles.statLabel}>Rejection PPM</Text>
                        <Text style={[styles.statValue, { color: "#dc2626" }]}>{(s?.rejectionPPM || 0).toLocaleString()}</Text>
                    </View>
                </View>
                <View style={styles.statsGrid}>
                    <View style={[styles.statCard, { flex: 1 }]}>
                        <Text style={styles.statLabel}>Acceptance Rate</Text>
                        <Text style={[styles.statValue, { color: "#1a9e6e" }]}>{(s?.acceptanceRate || 0).toFixed(2)}%</Text>
                    </View>
                    <View style={[styles.statCard, { flex: 1 }]}>
                        <Text style={styles.statLabel}>Rework Rate</Text>
                        <Text style={[styles.statValue, { color: "#d97706" }]}>{(s?.reworkRate || 0).toFixed(2)}%</Text>
                    </View>
                    <View style={[styles.statCard, { flex: 1 }]}>
                        <Text style={styles.statLabel}>Overall PPM</Text>
                        <Text style={[styles.statValue, { color: "#dc2626" }]}>{(s?.overallPPM || 0).toLocaleString()}</Text>
                    </View>
                </View>

                {/* Section 2: Top Defects */}
                {topDefects.length > 0 && (
                    <>
                        <Text style={styles.sectionTitle}>Top 5 Defects</Text>
                        {topDefects.map((d: any, i: number) => (
                            <View key={i} style={styles.defectRow}>
                                <View style={styles.rankBadge}>
                                    <Text style={styles.rankText}>{i + 1}</Text>
                                </View>
                                <Text style={styles.defectName}>{d.defectName}</Text>
                                <View style={styles.progressTrack}>
                                    <View style={[styles.progressFill, { width: `${Math.min(d.percentage, 100)}%` }]} />
                                </View>
                                <Text style={styles.defectCount}>{d.count}</Text>
                                <Text style={styles.defectPct}>({d.percentage.toFixed(1)}%)</Text>
                            </View>
                        ))}
                    </>
                )}

                {/* Section 3: Day-wise Inspection Log */}
                {dayWise.length > 0 && (
                    <>
                        <Text style={styles.sectionTitle}>Day-wise Inspection Log</Text>
                        <View style={styles.tableHeaderRow}>
                            <Text style={[styles.th, { flex: 1.8 }]}>Date</Text>
                            <Text style={styles.th}>Inspected</Text>
                            <Text style={styles.th}>Accepted</Text>
                            <Text style={styles.th}>Rework</Text>
                            <Text style={styles.th}>Rejected</Text>
                            <Text style={styles.th}>Quality %</Text>
                        </View>
                        {dayWise.map((d: any, i: number) => (
                            <View key={i} style={[styles.tableRow, i % 2 !== 0 ? styles.tableRowAlt : {}]} wrap={false}>
                                <Text style={[styles.td, { flex: 1.8 }]}>{d.date}</Text>
                                <Text style={styles.td}>{d.totalInspected.toLocaleString()}</Text>
                                <Text style={styles.tdGreen}>{d.totalAccepted.toLocaleString()}</Text>
                                <Text style={styles.tdOrange}>{d.totalRework.toLocaleString()}</Text>
                                <Text style={styles.tdRed}>{d.totalRejected.toLocaleString()}</Text>
                                <Text style={styles.td}>{d.qualityRate.toFixed(1)}%</Text>
                            </View>
                        ))}
                    </>
                )}

                {/* Section 4: Inspector-wise Summary */}
                {inspectorWise.length > 0 && (
                    <>
                        <Text style={styles.sectionTitle}>Inspector-wise Summary</Text>
                        <View style={styles.tableHeaderRow}>
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
                                <Text style={styles.td}>{d.totalInspected.toLocaleString()}</Text>
                                <Text style={styles.tdGreen}>{d.totalAccepted.toLocaleString()}</Text>
                                <Text style={styles.tdOrange}>{d.totalRework.toLocaleString()}</Text>
                                <Text style={styles.tdRed}>{d.totalRejected.toLocaleString()}</Text>
                                <Text style={styles.td}>{d.qualityRate.toFixed(1)}%</Text>
                            </View>
                        ))}
                    </>
                )}

                {/* Section 5: Part-wise Analysis */}
                {partWise.length > 0 && (
                    <>
                        <Text style={styles.sectionTitle}>Part-wise Performance</Text>
                        <View style={styles.tableHeaderRow}>
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
                                <Text style={styles.td}>{p.totalInspected.toLocaleString()}</Text>
                                <Text style={styles.tdGreen}>{p.totalAccepted.toLocaleString()}</Text>
                                <Text style={styles.tdOrange}>{p.totalRework.toLocaleString()}</Text>
                                <Text style={styles.tdRed}>{p.totalRejected.toLocaleString()}</Text>
                                <Text style={styles.td}>{p.qualityRate.toFixed(1)}%</Text>
                                <Text style={styles.tdRed}>{p.rejectionPercent?.toFixed(1) || "0.0"}%</Text>
                            </View>
                        ))}
                    </>
                )}

                {/* Footer on every page */}
                <Text style={styles.footer} fixed>Generated: {new Date().toLocaleDateString("en-IN")}  |  {companyName}  |  CIMS Quality Report</Text>
                <Text style={styles.pageNum} fixed render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
            </Page>
        </Document>
    )
}
