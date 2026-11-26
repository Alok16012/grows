import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer"

// The 8D report for one NCR — built in the browser when "Download 8D" is clicked.
const s = StyleSheet.create({
    page: { padding: 32, fontSize: 9.5, fontFamily: "Helvetica", color: "#1f2937" },
    head: { flexDirection: "row", justifyContent: "space-between", borderBottom: "1pt solid #e5e7eb", paddingBottom: 8, marginBottom: 10 },
    title: { fontSize: 15, fontFamily: "Helvetica-Bold" },
    sub: { fontSize: 9, color: "#6b7280", marginTop: 2 },
    grid: { flexDirection: "row", flexWrap: "wrap", border: "0.5pt solid #e5e7eb", marginBottom: 10 },
    cell: { width: "33.33%", padding: 6, borderRight: "0.5pt solid #e5e7eb", borderBottom: "0.5pt solid #e5e7eb" },
    k: { fontSize: 7.5, color: "#6b7280", textTransform: "uppercase", marginBottom: 2 },
    v: { fontSize: 9.5 },
    step: { marginBottom: 8, border: "0.5pt solid #e5e7eb", borderRadius: 4 },
    stepHead: { backgroundColor: "#f3f4f6", paddingVertical: 4, paddingHorizontal: 6, fontFamily: "Helvetica-Bold", fontSize: 9.5 },
    stepBody: { padding: 6, lineHeight: 1.4 },
    muted: { color: "#9ca3af" },
    foot: { position: "absolute", bottom: 20, left: 32, right: 32, fontSize: 7.5, color: "#9ca3af", flexDirection: "row", justifyContent: "space-between" },
})

const d = (v?: string | null) => (v ? new Date(v).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—")

function Step({ n, title, text, extra }: { n: string; title: string; text?: string | null; extra?: string | null }) {
    return (
        <View style={s.step} wrap={false}>
            <Text style={s.stepHead}>{n}  {title}</Text>
            <View style={s.stepBody}>
                {text ? <Text>{text}</Text> : <Text style={s.muted}>Not filled</Text>}
                {extra ? <Text style={{ marginTop: 3, color: "#4b5563" }}>{extra}</Text> : null}
            </View>
        </View>
    )
}

export function NcrPDF({ ncr, company }: { ncr: any; company: string }) {
    const whys: string[] = Array.isArray(ncr.d4Whys) ? ncr.d4Whys.filter((w: string) => w?.trim()) : []
    const facts: [string, string][] = [
        ["Project", ncr.project?.name ?? "—"], ["Site", ncr.project?.site?.name ?? "—"], ["Part", ncr.partName ?? "—"],
        ["Lot / batch", ncr.lotNumber ?? "—"], ["Pieces inspected", ncr.qtyInspected != null ? String(ncr.qtyInspected) : "—"], ["Pieces affected", ncr.qtyAffected != null ? String(ncr.qtyAffected) : "—"],
        ["Severity", ncr.severity], ["Defect", ncr.defect ? `${ncr.defect.code} ${ncr.defect.name}` : "—"], ["Owner", ncr.ownerName ?? "—"],
        ["Opened", d(ncr.createdAt)], ["Due", d(ncr.dueDate)], ["Status", ncr.status + (ncr.closedAt ? ` (${d(ncr.closedAt)})` : "")],
    ]
    return (
        <Document title={`${ncr.code} 8D report`}>
            <Page size="A4" style={s.page}>
                <View style={s.head}>
                    <View>
                        <Text style={s.title}>8D Report — {ncr.code}</Text>
                        <Text style={s.sub}>{ncr.title}</Text>
                    </View>
                    <Text style={s.sub}>{company}</Text>
                </View>
                <View style={s.grid}>
                    {facts.map(([k, v]) => (
                        <View key={k} style={s.cell}><Text style={s.k}>{k}</Text><Text style={s.v}>{v}</Text></View>
                    ))}
                </View>
                <Step n="D1" title="Team" text={ncr.d1Team} />
                <Step n="D2" title="Problem description" text={ncr.d2Problem} />
                <Step n="D3" title="Containment action" text={ncr.d3Containment} extra={ncr.d3Date ? `Contained on ${d(ncr.d3Date)}` : null} />
                <Step n="D4" title="Root cause" text={ncr.d4RootCause} extra={whys.length ? whys.map((w, i) => `Why ${i + 1}: ${w}`).join("\n") : null} />
                <Step n="D5" title="Permanent corrective action" text={ncr.d5Action} />
                <Step n="D6" title="Implementation" text={ncr.d6Implemented} extra={ncr.d6Date ? `Implemented on ${d(ncr.d6Date)}` : null} />
                <Step n="D7" title="Prevent recurrence / verification" text={ncr.d7Prevention}
                    extra={ncr.effective === true ? "Effectiveness confirmed" : ncr.effective === false ? "Not effective yet" : null} />
                <Step n="D8" title="Closure and team recognition" text={ncr.d8Closure} extra={ncr.closedAt ? `Closed by ${ncr.closedByName ?? "—"} on ${d(ncr.closedAt)}` : null} />
                <View style={s.foot} fixed>
                    <Text>{ncr.code} · generated {d(new Date().toISOString())}</Text>
                    <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} / ${totalPages}`} />
                </View>
            </Page>
        </Document>
    )
}
