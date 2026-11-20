import { Document, Page, View, Text, StyleSheet, Image } from "@react-pdf/renderer"

// Salary slip as a PDF — the same layout as the printed slip in Payroll →
// Pay & slips (PayslipsPanel), for sending as a WhatsApp document.

export type PayslipData = {
    month: number; year: number
    basicSalary: number; da: number; hra: number; washing: number; conveyance: number
    lwwEarned: number; bonus: number; overtimePay: number; grossSalary: number
    allowances: number; productionIncentive: number; tds: number
    pfEmployee: number; esiEmployee: number; pt: number; lwf: number
    canteen: number; advance: number; otherDeductions: number
    totalDeductions: number; netSalary: number
    workingDays: number | null; presentDays: number | null; overtimeHrs: number | null
    employee: {
        employeeId: string; firstName: string; lastName: string | null; designation: string | null
        uan: string | null; pfNumber: string | null; esiNumber: string | null
        dateOfBirth: Date | null; dateOfJoining: Date | null
    }
    site: string
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]

export function rupeesInWords(n: number): string {
    n = Math.round(Math.abs(n))
    if (n === 0) return "Rupees Zero Only"
    const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"]
    const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"]
    const w = (x: number): string => {
        if (x === 0) return ""
        if (x < 20) return ones[x] + " "
        if (x < 100) return tens[Math.floor(x / 10)] + (x % 10 ? " " + ones[x % 10] : "") + " "
        if (x < 1000) return ones[Math.floor(x / 100)] + " Hundred " + w(x % 100)
        if (x < 100000) return w(Math.floor(x / 1000)) + "Thousand " + w(x % 1000)
        if (x < 10000000) return w(Math.floor(x / 100000)) + "Lakh " + w(x % 100000)
        return w(Math.floor(x / 10000000)) + "Crore " + w(x % 10000000)
    }
    return "Rupees " + w(n).trim().replace(/\s+/g, " ") + " Only"
}

const B = "#999"
const s = StyleSheet.create({
    page: { fontFamily: "Helvetica", fontSize: 8.5, color: "#111", padding: 28 },
    header: { borderBottomWidth: 1, borderBottomColor: "#333", paddingBottom: 6, marginBottom: 4, alignItems: "center", position: "relative", minHeight: 50 },
    logo: { position: "absolute", left: 0, top: 0, height: 42, width: 42, objectFit: "contain" },
    co: { fontSize: 13, fontFamily: "Helvetica-BoldOblique" },
    addr: { fontSize: 8, fontFamily: "Helvetica-Oblique", marginTop: 3, textAlign: "center", paddingHorizontal: 50 },
    site: { fontSize: 9, fontFamily: "Helvetica-Bold", marginVertical: 5 },
    box: { borderWidth: 1, borderColor: "#555" },
    month: { textAlign: "center", fontSize: 10, fontFamily: "Helvetica-Bold", backgroundColor: "#f0f0f0", padding: 4, borderBottomWidth: 1, borderBottomColor: B },
    row: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: B },
    cell: { padding: 3, borderRightWidth: 1, borderRightColor: B },
    il: { width: "20%", fontFamily: "Helvetica-Bold", color: "#333" },
    iv: { width: "30%", fontFamily: "Helvetica-Oblique" },
    th: { fontFamily: "Helvetica-Bold", backgroundColor: "#f5f5f5" },
    num: { textAlign: "right" },
    c1: { width: "28%" }, c2: { width: "16%" }, c3: { width: "18%", borderRightWidth: 2, borderRightColor: "#888" }, c4: { width: "22%" }, c5: { width: "16%", borderRightWidth: 0 },
    total: { fontFamily: "Helvetica-Bold", backgroundColor: "#f0f0f0" },
    net: { fontFamily: "Helvetica-Bold", backgroundColor: "#e8f5e9" },
    words: { padding: 4 },
    foot: { marginTop: 8, fontSize: 8.5 },
    gen: { marginTop: 8, textAlign: "center", fontSize: 8, color: "#555" },
})

const r = (n: number) => Math.round(n || 0).toLocaleString("en-IN")
const dt = (d: Date | null) => (d ? d.toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Asia/Kolkata" }) : "")

export function PayslipPDF({ p, logo, companyName, companyAddress }: { p: PayslipData; logo?: string | null; companyName: string; companyAddress: string }) {
    const wDays = p.workingDays ?? 26
    const pDays = p.presentDays ?? wDays
    const rate = (amt: number) => (pDays > 0 ? Math.round(amt * wDays / pDays) : amt)
    const earnings = [
        ["Basic", rate(p.basicSalary), p.basicSalary],
        ["DA", rate(p.da), p.da],
        ["HRA", rate(p.hra), p.hra],
        ["Conveyance Allow.", rate(p.conveyance), p.conveyance],
        ["Other Allowance", rate(p.allowances || 0), p.allowances || 0],
        ["Washing Allowance", rate(p.washing), p.washing],
        ["Leave with Wages", rate(p.lwwEarned), p.lwwEarned],
        ["Bonus", rate(p.bonus), p.bonus],
        ["O.T.", 0, p.overtimePay],
        ["Performance Allow.", 0, p.productionIncentive || 0],
    ] as [string, number, number][]
    const deductions = [
        ["PF", p.pfEmployee], ["P.Tax", p.pt], ["ESI", p.esiEmployee], ["Salary Advance", p.advance],
        ["TDS", p.tds || 0], ["Other Deduction", p.otherDeductions], ["Canteen Ded", p.canteen], ["MLWF", p.lwf],
    ] as [string, number][]
    const grossRate = earnings.reduce((t, e) => t + e[1], 0)
    const e = p.employee
    const info: [string, string, string, string][] = [
        ["Employee Name", `${e.firstName} ${e.lastName ?? ""}`.trim(), "Designation", e.designation ?? ""],
        ["Employee Number", e.employeeId, "Date Of Joining", dt(e.dateOfJoining)],
        ["Date of Birth", dt(e.dateOfBirth), "Days Paid", String(pDays)],
        ["UAN No.", e.uan ?? "", "OT Hrs", String(p.overtimeHrs ?? 0)],
        ["PF No.", e.pfNumber ?? "", "Location", "PUNE"],
        ["ESIC No.", e.esiNumber ?? "", "", ""],
    ]

    return (
        <Document title={`Salary Slip ${MONTHS[p.month - 1]} ${p.year} - ${e.employeeId}`} author={companyName}>
            <Page size="A4" style={s.page}>
                <View style={s.header}>
                    {/* eslint-disable-next-line jsx-a11y/alt-text */}
                    {logo ? <Image style={s.logo} src={logo} /> : null}
                    <Text style={s.co}>{companyName.toUpperCase()}</Text>
                    <Text style={s.addr}>{companyAddress}</Text>
                </View>
                <Text style={s.site}>SITE: {p.site.toUpperCase()}</Text>

                <View style={s.box}>
                    <Text style={s.month}>PAYSLIP FOR THE MONTH {MONTHS[p.month - 1].toUpperCase()} {p.year}</Text>
                    {info.map((row, i) => (
                        <View key={i} style={s.row}>
                            <Text style={[s.cell, s.il]}>{row[0]}</Text>
                            <Text style={[s.cell, s.iv]}>{row[1]}</Text>
                            <Text style={[s.cell, s.il]}>{row[2]}</Text>
                            <Text style={[s.cell, s.iv, { borderRightWidth: 0 }]}>{row[3]}</Text>
                        </View>
                    ))}
                    <View style={s.row}>
                        <Text style={[s.cell, s.th, s.c1]}>Earnings</Text>
                        <Text style={[s.cell, s.th, s.c2, s.num]}>Salary Rate</Text>
                        <Text style={[s.cell, s.th, s.c3, s.num]}>Salary Amt (Rs.)</Text>
                        <Text style={[s.cell, s.th, s.c4]}>Deductions</Text>
                        <Text style={[s.cell, s.th, s.c5, s.num]}>Amount (Rs.)</Text>
                    </View>
                    {earnings.map((er, i) => {
                        const d = deductions[i]
                        return (
                            <View key={er[0]} style={s.row}>
                                <Text style={[s.cell, s.c1]}>{er[0]}</Text>
                                <Text style={[s.cell, s.c2, s.num]}>{er[1] > 0 ? r(er[1]) : ""}</Text>
                                <Text style={[s.cell, s.c3, s.num]}>{er[2] > 0 ? r(er[2]) : "0"}</Text>
                                <Text style={[s.cell, s.c4]}>{d ? d[0] : ""}</Text>
                                <Text style={[s.cell, s.c5, s.num]}>{d ? (d[1] > 0 ? r(d[1]) : "0") : ""}</Text>
                            </View>
                        )
                    })}
                    <View style={[s.row, s.total]}>
                        <Text style={[s.cell, s.c1]}>Gross Earnings (A)</Text>
                        <Text style={[s.cell, s.c2, s.num]}>{r(grossRate)}</Text>
                        <Text style={[s.cell, s.c3, s.num]}>{r(p.grossSalary)}</Text>
                        <Text style={[s.cell, s.c4]}>Total Deduction (B)</Text>
                        <Text style={[s.cell, s.c5, s.num]}>{r(p.totalDeductions)}</Text>
                    </View>
                    <View style={[s.row, s.net]}>
                        <Text style={[s.cell, { width: "44%" }]}>Net Pay (A) - (B)</Text>
                        <Text style={[s.cell, s.c3, s.num]}>{r(p.netSalary)}</Text>
                        <Text style={[s.cell, { width: "38%", borderRightWidth: 0 }]}> </Text>
                    </View>
                    <Text style={s.words}>Amount in words: {rupeesInWords(p.netSalary)}</Text>
                </View>
                <Text style={s.foot}>Place: Pune</Text>
                <Text style={s.gen}>This is a Computer Generated Slip and does not require signature</Text>
            </Page>
        </Document>
    )
}
