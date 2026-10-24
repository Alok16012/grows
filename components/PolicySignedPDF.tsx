import { Document, Page, View, Text, StyleSheet, Image } from "@react-pdf/renderer"
import { COMPANY } from "@/lib/company"
import { policyBlocks } from "@/lib/policy-text"

// Signed policy record: the exact version text an employee read, stamped with
// the signature and the evidence that ties it to that text (version number,
// SHA-256 of the content, read-to-end and sign times, IP, device).
// Built on demand from immutable rows, so it never goes stale or out of sync.
const ACCENT = "#e23b3b"

const s = StyleSheet.create({
    page: { fontFamily: "Helvetica", fontSize: 10.5, color: "#1a1a18", paddingTop: 42, paddingBottom: 64, paddingHorizontal: 48, lineHeight: 1.45 },
    header: { flexDirection: "row", alignItems: "center", marginBottom: 6 },
    logo: { width: 36, height: 36, objectFit: "contain", marginRight: 10 },
    company: { fontSize: 15, fontFamily: "Helvetica-Bold" },
    sub: { fontSize: 9, color: "#555" },
    rule: { borderBottomWidth: 1.2, borderBottomColor: ACCENT, marginTop: 6, marginBottom: 14 },
    title: { fontSize: 14, fontFamily: "Helvetica-Bold", marginBottom: 2 },
    meta: { fontSize: 9, color: "#555", marginBottom: 12 },
    h: { fontSize: 11.5, fontFamily: "Helvetica-Bold", marginTop: 8, marginBottom: 3 },
    p: { marginBottom: 6, textAlign: "justify" },
    li: { flexDirection: "row", marginBottom: 3, paddingLeft: 6 },
    liMark: { width: 16 },
    liText: { flex: 1 },
    box: { marginTop: 18, borderWidth: 1, borderColor: "#d6d3cd", borderRadius: 4, padding: 12 },
    boxTitle: { fontSize: 11, fontFamily: "Helvetica-Bold", marginBottom: 8, color: ACCENT },
    row: { flexDirection: "row", marginBottom: 3 },
    k: { width: 130, color: "#555", fontSize: 9.5 },
    v: { flex: 1, fontSize: 9.5 },
    mono: { flex: 1, fontSize: 8, fontFamily: "Courier" },
    sig: { width: 160, height: 50, objectFit: "contain", objectPositionX: 0, marginBottom: 4 },
    typed: { fontSize: 16, fontFamily: "Times-Italic", marginBottom: 4 },
    stmt: { fontSize: 9.5, marginBottom: 10 },
    footer: { position: "absolute", bottom: 26, left: 48, right: 48, fontSize: 7.5, color: "#777", textAlign: "center", borderTopWidth: 0.6, borderTopColor: "#ddd", paddingTop: 6 },
})

export type PolicySignedPDFProps = {
    logoDataUrl: string | null
    policyTitle: string
    category: string | null
    versionNo: number
    effectiveFrom: string | null
    publishedAt: string
    content: string
    attachmentUrl: string | null
    contentHash: string
    employeeName: string
    employeeCode: string
    designation: string | null
    typedName: string
    signatureImage: string | null
    scrolledAt: string
    signedAt: string
    ipAddress: string | null
    userAgent: string | null
    channel: string | null
    ackId: string
    generatedAt: string
}

// The built-in PDF fonts have no ₹ glyph (it prints as "¹"). Only the printed
// copy changes — the stored text and its hash stay exactly as signed.
const pdfText = (s: string) => s.replace(/₹\s?/g, "Rs. ")

const ist = (iso: string) => new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true }) + " IST"

export function PolicySignedPDF(p: PolicySignedPDFProps) {
    const blocks = policyBlocks(pdfText(p.content))
    const Row = ({ k, v, mono }: { k: string; v: string | null | undefined; mono?: boolean }) => (
        <View style={s.row}><Text style={s.k}>{k}</Text><Text style={mono ? s.mono : s.v}>{v || "—"}</Text></View>
    )
    return (
        <Document title={`${p.policyTitle} — signed by ${p.employeeName}`} author={COMPANY.legalName}>
            <Page size="A4" style={s.page}>
                <View style={s.header}>
                    {p.logoDataUrl ? <Image src={p.logoDataUrl} style={s.logo} /> : null}
                    <View>
                        <Text style={s.company}>{COMPANY.legalName}</Text>
                        <Text style={s.sub}>Policy acknowledgement record</Text>
                    </View>
                </View>
                <View style={s.rule} />

                <Text style={s.title}>{pdfText(p.policyTitle)}</Text>
                <Text style={s.meta}>
                    Version {p.versionNo}{p.category ? ` · ${p.category}` : ""}{p.effectiveFrom ? ` · Effective ${new Date(p.effectiveFrom).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}` : ""} · Published {new Date(p.publishedAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                </Text>

                {blocks.map((b, i) => {
                    if (b.kind === "heading") return <Text key={i} style={s.h}>{b.text}</Text>
                    if (b.kind === "bullet") return <View key={i} style={s.li}><Text style={s.liMark}>•</Text><Text style={s.liText}>{b.text}</Text></View>
                    if (b.kind === "numbered") return <View key={i} style={s.li}><Text style={s.liMark}>{b.n}.</Text><Text style={s.liText}>{b.text}</Text></View>
                    return <Text key={i} style={s.p}>{b.text}</Text>
                })}
                {p.attachmentUrl ? <Text style={[s.p, { fontSize: 9, color: "#555" }]}>Attachment: {p.attachmentUrl}</Text> : null}

                <View style={s.box} wrap={false}>
                    <Text style={s.boxTitle}>Employee acknowledgement</Text>
                    <Text style={s.stmt}>
                        I, {p.employeeName}, confirm that I have read this policy (version {p.versionNo}) to the end, understood it and agree to follow it.
                    </Text>
                    {p.signatureImage ? <Image src={p.signatureImage} style={s.sig} /> : null}
                    <Text style={s.typed}>{p.typedName}</Text>
                    <Row k="Employee" v={`${p.employeeName} (${p.employeeCode})`} />
                    <Row k="Designation" v={p.designation} />
                    <Row k="Signature" v={p.signatureImage ? "Drawn signature + typed name" : "Typed name"} />
                    <Row k="Read to the end" v={ist(p.scrolledAt)} />
                    <Row k="Signed" v={`${ist(p.signedAt)} (${new Date(p.signedAt).toISOString()})`} />
                    <Row k="IP address" v={p.ipAddress} />
                    <Row k="Device" v={p.userAgent} />
                    <Row k="Signed via" v={p.channel === "ONBOARDING_LINK" ? "Joining form (onboarding link)" : p.channel === "SELF_SERVICE" ? "Employee self-service" : p.channel} />
                    <Row k="Content SHA-256" v={p.contentHash} mono />
                    <Row k="Record ID" v={p.ackId} mono />
                </View>

                <Text style={s.footer} fixed render={({ pageNumber, totalPages }) =>
                    `${COMPANY.name} · generated ${ist(p.generatedAt)} · page ${pageNumber} of ${totalPages} · the SHA-256 above identifies the exact policy text that was signed`} />
            </Page>
        </Document>
    )
}
