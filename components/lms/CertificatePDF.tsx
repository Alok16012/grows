import { Document, Page, Text, View, Image, StyleSheet } from "@react-pdf/renderer"

// Training certificate (A4 landscape) with a QR code to the public check page.
// Built in the browser when the learner clicks "Download PDF".
const s = StyleSheet.create({
    page: { padding: 28, fontFamily: "Helvetica", color: "#1f2937" },
    frame: { flex: 1, border: "3pt solid #1d4ed8", padding: 6 },
    inner: { flex: 1, border: "0.8pt solid #93c5fd", paddingVertical: 34, paddingHorizontal: 48, alignItems: "center" },
    org: { fontSize: 13, fontFamily: "Helvetica-Bold", color: "#1d4ed8", letterSpacing: 1 },
    title: { fontSize: 30, fontFamily: "Helvetica-Bold", marginTop: 18 },
    sub: { fontSize: 12, color: "#6b7280", marginTop: 14 },
    name: { fontSize: 26, fontFamily: "Helvetica-Bold", marginTop: 8, color: "#111827" },
    course: { fontSize: 18, fontFamily: "Helvetica-Bold", marginTop: 8, color: "#1d4ed8", textAlign: "center" },
    meta: { fontSize: 10.5, color: "#4b5563", marginTop: 14 },
    foot: { marginTop: "auto", width: "100%", flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
    small: { fontSize: 9, color: "#6b7280" },
    sign: { borderTop: "0.8pt solid #9ca3af", paddingTop: 4, width: 170, fontSize: 9.5, color: "#374151", textAlign: "center" },
})
const d = (v?: string | null) => (v ? new Date(v).toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" }) : "")

export function CertificatePDF({ c, company, logo, qr }: { c: any; company: string; logo: string | null; qr: string }) {
    return (
        <Document title={`${c.certificate} ${c.course}`}>
            <Page size="A4" orientation="landscape" style={s.page}>
                <View style={s.frame}><View style={s.inner}>
                    {logo ? <Image src={logo} style={{ height: 36, marginBottom: 6 }} /> : null}
                    <Text style={s.org}>{company.toUpperCase()}</Text>
                    <Text style={s.title}>Certificate of Completion</Text>
                    <Text style={s.sub}>This certifies that</Text>
                    <Text style={s.name}>{c.name}</Text>
                    <Text style={s.small}>{c.employeeCode}</Text>
                    <Text style={s.sub}>has successfully completed the training</Text>
                    <Text style={s.course}>{c.course}</Text>
                    <Text style={s.meta}>
                        {c.courseCode}{c.hours ? ` · ${c.hours} h` : ""}{c.score != null ? ` · score ${Math.round(c.score)}%` : ""} · issued {d(c.issuedAt)}{c.validUntil ? ` · valid until ${d(c.validUntil)}` : ""}
                    </Text>
                    <View style={s.foot}>
                        <View><Text style={s.sign}>Training & Development</Text></View>
                        <View style={{ alignItems: "center" }}>
                            <Image src={qr} style={{ width: 78, height: 78 }} />
                            <Text style={s.small}>Scan to verify · {c.certificate}</Text>
                        </View>
                    </View>
                </View></View>
            </Page>
        </Document>
    )
}
