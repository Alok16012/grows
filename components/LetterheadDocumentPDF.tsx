import { Document, Page, View, Text, StyleSheet, Image } from "@react-pdf/renderer"

// Growus Auto India letterhead, recreated digitally (matches Letter head.pdf):
// red framed border, logo + company name header, body content, signature block,
// and a footer with the office address + website.
const RED = "#e23b3b"

const styles = StyleSheet.create({
    page: { fontFamily: "Helvetica", fontSize: 11, color: "#1a1a18", paddingTop: 50, paddingBottom: 70, paddingHorizontal: 54, lineHeight: 1.5 },
    frame: { position: "absolute", top: 14, left: 14, right: 14, bottom: 14, borderWidth: 5, borderColor: RED, borderRadius: 4 },
    header: { flexDirection: "row", alignItems: "center", marginBottom: 6 },
    logo: { width: 46, height: 46, objectFit: "contain", marginRight: 12 },
    company: { fontSize: 20, fontFamily: "Helvetica-Bold", color: "#1a1a18" },
    tagline: { fontSize: 10, fontFamily: "Helvetica-Oblique", color: RED, marginTop: 1 },
    rule: { borderBottomWidth: 1.5, borderBottomColor: RED, marginTop: 8, marginBottom: 16 },
    metaRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 18, fontSize: 10, color: "#444" },
    title: { fontSize: 13, fontFamily: "Helvetica-Bold", textAlign: "center", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 16, textDecoration: "underline" },
    body: { fontSize: 11, textAlign: "justify" },
    sign: { marginTop: 44 },
    signCompany: { fontSize: 11, fontFamily: "Helvetica-Bold" },
    signLabel: { fontSize: 10, color: "#444", marginTop: 34 },
    footer: { position: "absolute", bottom: 30, left: 54, right: 54, textAlign: "center", borderTopWidth: 1, borderTopColor: "#e8e6e1", paddingTop: 8 },
    footerAddr: { fontSize: 7.5, fontFamily: "Helvetica-Bold", color: "#1a1a18" },
    footerWeb: { fontSize: 8, fontFamily: "Helvetica-Bold", color: RED, marginTop: 2 },
})

export function LetterheadDocumentPDF({
    docNumber, typeName, content, dateText, logoDataUrl,
}: {
    docNumber: string
    typeName: string
    content: string
    dateText: string
    logoDataUrl?: string | null
}) {
    return (
        <Document>
            <Page size="A4" style={styles.page}>
                <View style={styles.frame} fixed />

                <View style={styles.header}>
                    {logoDataUrl ? <Image src={logoDataUrl} style={styles.logo} /> : null}
                    <View>
                        <Text style={styles.company}>Growus Auto India Pvt. Ltd.</Text>
                        <Text style={styles.tagline}>Pioneer in outsourcing</Text>
                    </View>
                </View>
                <View style={styles.rule} />

                <View style={styles.metaRow}>
                    <Text>Ref: {docNumber}</Text>
                    <Text>Date: {dateText}</Text>
                </View>

                <Text style={styles.title}>{typeName}</Text>

                <Text style={styles.body}>{content}</Text>

                <View style={styles.sign}>
                    <Text style={styles.signCompany}>For Growus Auto India Pvt. Ltd.</Text>
                    <Text style={styles.signLabel}>Authorised Signatory</Text>
                </View>

                <View style={styles.footer} fixed>
                    <Text style={styles.footerAddr}>OFFICE NO. BR 2/431-432, 4TH FLOOR, JAI GANESH VISION, B WING, AKURDI, PUNE, MH- 411035</Text>
                    <Text style={styles.footerWeb}>www.growusauto.com</Text>
                </View>
            </Page>
        </Document>
    )
}
