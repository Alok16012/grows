"use client"
import { Suspense, useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Loader2, RefreshCw, ChevronRight, MapPin, Building2, Search, FileSpreadsheet, FileDown, Lock } from "lucide-react"
import * as XLSX from "xlsx"

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"]
const fmt  = (n: number) => n ? "₹" + Math.round(n).toLocaleString("en-IN") : "—"
const fmtN = (n: number) => Math.round(n).toLocaleString("en-IN")

type Site    = { id: string; name: string; code?: string }
type SiteStatus = { siteId: string | null; processedCount: number }
type Payroll = {
    id: string; month: number; year: number; status: string
    basicSalary: number; da: number; hra: number; washing: number; conveyance: number
    lwwEarned: number; bonus: number; overtimePay: number; overtimeHrs: number; grossSalary: number
    pfEmployee: number; esiEmployee: number; pt: number; lwf: number
    canteen: number; penalty: number; advance: number; otherDeductions: number
    totalDeductions: number; netSalary: number
    workingDays: number | null; presentDays: number | null
    employee: {
        employeeId: string; firstName: string; lastName: string; designation: string | null
        bankAccountNumber?: string | null; bankIFSC?: string | null
    }
}

function WageSheetInner() {
    const router = useRouter()
    const [month,   setMonth]   = useState(String(new Date().getMonth() + 1))
    const [year,    setYear]    = useState(String(new Date().getFullYear()))
    const [sites,   setSites]   = useState<Site[]>([])
    const [status,  setStatus]  = useState<SiteStatus[]>([])
    const [selId,      setSelId]      = useState("")
    const [data,       setData]       = useState<Payroll[]>([])
    const [search,     setSearch]     = useState("")
    const [ldSites,    setLdSites]    = useState(true)
    const [ldData,     setLdData]     = useState(false)
    const [activeView,       setActiveView]       = useState<"wagesheet" | "neft" | "statement">("wagesheet")
    const [neftEmail,        setNeftEmail]        = useState("")
    const [hdfcAccNo,        setHdfcAccNo]        = useState("")
    const [hdfcGenBy,        setHdfcGenBy]        = useState("")
    const [selectedIds,      setSelectedIds]      = useState<Set<string>>(new Set())
    const [locking,          setLocking]          = useState(false)
    const [selectedSiteIds,  setSelectedSiteIds]  = useState<Set<string>>(new Set())
    const [lockingSites,     setLockingSites]     = useState(false)
    const [dlCombined,       setDlCombined]       = useState(false)

    useEffect(() => {
        fetch("/api/sites?isActive=true").then(r => r.json())
            .then(d => { if (Array.isArray(d)) setSites(d) })
            .finally(() => setLdSites(false))
    }, [])

    const fetchStatus = useCallback(async () => {
        try {
            const r = await fetch(`/api/payroll/sites-status?month=${month}&year=${year}`)
            if (r.ok) { const d = await r.json(); if (Array.isArray(d)) setStatus(d) }
        } catch {}
    }, [month, year])

    useEffect(() => { fetchStatus() }, [fetchStatus])

    const fetchData = useCallback(async (siteId: string) => {
        setLdData(true); setData([])
        try {
            const r = await fetch(`/api/payroll?siteId=${siteId}&month=${month}&year=${year}`)
            if (!r.ok) throw new Error(await r.text())
            const d = await r.json()
            setData(Array.isArray(d) ? d : [])
        } catch (e: unknown) { toast.error(e instanceof Error ? e.message : "Failed") }
        finally { setLdData(false) }
    }, [month, year])

    const selectSite = (id: string) => {
        setSelId(id); setSearch(""); setSelectedIds(new Set())
        if (id) fetchData(id); else setData([])
    }

    const toggleSelect = (id: string) =>
        setSelectedIds(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })

    const toggleAll = (rows: Payroll[]) =>
        setSelectedIds(prev => prev.size === rows.length ? new Set() : new Set(rows.map(p => p.id)))

    const handleLock = async () => {
        if (!selectedIds.size) { toast.error("Select employees to lock"); return }
        setLocking(true)
        try {
            const res = await fetch("/api/payroll/final/lock", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    month: parseInt(month), year: parseInt(year),
                    payrollIds: [...selectedIds],
                }),
            })
            if (!res.ok) throw new Error(await res.text())
            const d = await res.json()
            toast.success(`${d.count} employee(s) locked — sending to Compliance`)
            setSelectedIds(new Set())
            await fetchData(selId)
            router.push(`/payroll/compliance?month=${month}&year=${year}`)
        } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : "Lock failed")
        } finally { setLocking(false) }
    }

    const toggleSiteSelect = (id: string, e: React.MouseEvent) => {
        e.stopPropagation()
        setSelectedSiteIds(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
    }

    const handleLockSites = async () => {
        if (!selectedSiteIds.size) return
        setLockingSites(true)
        try {
            const res = await fetch("/api/payroll/final/lock", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    month: parseInt(month), year: parseInt(year),
                    siteIds: [...selectedSiteIds],
                }),
            })
            if (!res.ok) throw new Error(await res.text())
            const d = await res.json()
            toast.success(`${d.count} employee(s) locked from ${selectedSiteIds.size} site(s)`)
            setSelectedSiteIds(new Set())
            if (selId) await fetchData(selId)
            await fetchStatus()
            router.push(`/payroll/compliance?month=${month}&year=${year}`)
        } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : "Lock failed")
        } finally { setLockingSites(false) }
    }

    const buildFormIIAoa = (rows: Payroll[], siteName: string, m: number, y: number) => {
        const monthName = MONTHS[m - 1].toUpperCase()
        const headers = [
            "Sr.No", "Emp Code", "Employee Name", "IFSC CODE", "ACCOUNT NO.",
            "Days Paid", "OT Hrs",
            "Basic_R", "DA_R", "HRA_R", "Conv_R", "Washing_R", "Leave_R", "Bonus_R", "",
            "BASIC", "DA", "HRA", "CONVEYANCE ALLOWANCE", "WASHING ALLOW", "LEAVE AMT", "BONUS AMT",
            "OT Amt", "Gross Earning",
            "PF", "ESIC", "PT", "LWF", "CANTEEN", "OTHER DED", "ADVANCE", "Tot Ded", "Net Pay", "Signature",
        ]
        const dataRows = rows.map((p, i) => [
            i + 1, p.employee.employeeId,
            `${p.employee.firstName} ${p.employee.lastName}`,
            p.employee.bankIFSC ?? "", p.employee.bankAccountNumber ?? "",
            p.presentDays ?? p.workingDays ?? 0, p.overtimeHrs ?? 0,
            Math.round(p.basicSalary), Math.round(p.da), Math.round(p.hra),
            Math.round(p.conveyance), Math.round(p.washing),
            Math.round(p.lwwEarned), Math.round(p.bonus), "",
            Math.round(p.basicSalary), Math.round(p.da), Math.round(p.hra),
            Math.round(p.conveyance), Math.round(p.washing),
            Math.round(p.lwwEarned), Math.round(p.bonus),
            Math.round(p.overtimePay), Math.round(p.grossSalary),
            Math.round(p.pfEmployee), Math.round(p.esiEmployee),
            Math.round(p.pt), Math.round(p.lwf), Math.round(p.canteen),
            Math.round(p.otherDeductions), Math.round(p.advance),
            Math.round(p.totalDeductions), Math.round(p.netSalary), "",
        ])
        const sum = (fn: (p: Payroll) => number) => Math.round(rows.reduce((s, p) => s + fn(p), 0))
        const totRow = [
            "", "", "TOTAL", "", "",
            sum(p => p.presentDays ?? p.workingDays ?? 0), "",
            ...Array(8).fill(""),
            sum(p => p.basicSalary), sum(p => p.da), sum(p => p.hra),
            sum(p => p.conveyance), sum(p => p.washing),
            sum(p => p.lwwEarned), sum(p => p.bonus),
            sum(p => p.overtimePay), sum(p => p.grossSalary),
            sum(p => p.pfEmployee), sum(p => p.esiEmployee),
            sum(p => p.pt), sum(p => p.lwf), sum(p => p.canteen),
            sum(p => p.otherDeductions), sum(p => p.advance),
            sum(p => p.totalDeductions), sum(p => p.netSalary), "",
        ]
        return [
            [`FORM (II) M.W. RULES Rule (27)(1)`],
            [`SALARIES / WAGES REGISTER FOR THE MONTH OF ${monthName} ${y}`],
            [`SITE: ${siteName}`, "", "", "", "", "", "", "", "", "", "",
             "PF CODE: PUPUN2450654000", "", "", "ESIC CODE: 33000891430000999"],
            headers,
            ...dataRows,
            totRow,
        ]
    }

    const handleExportCombined = async () => {
        if (!selectedSiteIds.size) return
        setDlCombined(true)
        try {
            const wb = XLSX.utils.book_new()
            const m = parseInt(month); const y = parseInt(year)
            let sheetsAdded = 0
            for (const siteId of selectedSiteIds) {
                const site = sites.find(s => s.id === siteId)
                const r = await fetch(`/api/payroll?siteId=${siteId}&month=${month}&year=${year}`)
                if (!r.ok) continue
                const rows: Payroll[] = await r.json()
                if (!rows.length) continue
                const aoa = buildFormIIAoa(rows, site?.name ?? siteId, m, y)
                const ws = XLSX.utils.aoa_to_sheet(aoa)
                const colWidths = [6,12,26,14,18,10,8, 10,8,8,10,10,10,10,4, 10,8,8,14,12,10,10, 10,14, 8,8,6,6,8,10,10,12,10,12]
                ws["!cols"] = colWidths.map(w => ({ wch: w }))
                const sheetName = (site?.name ?? siteId).replace(/[^a-zA-Z0-9 ]/g, "").trim().slice(0, 31) || `Site${sheetsAdded+1}`
                XLSX.utils.book_append_sheet(wb, ws, sheetName)
                sheetsAdded++
            }
            if (!sheetsAdded) { toast.error("No payroll data found for selected sites"); return }
            XLSX.writeFile(wb, `FormII_Combined_${MONTHS[m-1]}_${y}.xlsx`)
            toast.success(`Downloaded Form II for ${sheetsAdded} site(s)`)
        } catch { toast.error("Download failed") }
        finally { setDlCombined(false) }
    }

    const handleNEFT = () => {
        const exportRows = selectedIds.size > 0 ? data.filter(p => selectedIds.has(p.id)) : data
        if (!exportRows.length) return
        const site = sites.find(s => s.id === selId)
        const siteShort = (site?.code || site?.name || "SITE").toUpperCase().replace(/\s+/g, "").slice(0, 8)
        const m = parseInt(month); const y = parseInt(year)
        const caption = `Salary ${MONTHS[m - 1].slice(0, 3)} ${String(y).slice(-2)}`
        const today = new Date()
        const payDate = `${String(today.getDate()).padStart(2,"0")}/${String(today.getMonth()+1).padStart(2,"0")}/${today.getFullYear()}`

        const rows = exportRows.map(p => [
            "N",                                                    // 1 Transaction Type
            "",                                                     // 2 Blank
            p.employee.bankAccountNumber || "",                     // 3 Account Number
            Math.round(p.netSalary),                               // 4 Net Salary
            `${p.employee.firstName} ${p.employee.lastName}`.toUpperCase(), // 5 Name (CAPS)
            "", "", "", "", "", "",                                 // 6-11 Blank (6)
            caption,                                               // 12 Caption 1
            caption,                                               // 13 Caption 2
            siteShort,                                             // 14 Site Name
            "", "", "", "", "", "",                                 // 15-20 Blank (6)
            payDate,                                               // 21 Payment Date
            "",                                                    // 22 Blank
            p.employee.bankIFSC || "",                             // 23 IFSC
            "", "",                                                // 24-25 Blank (2)
            neftEmail,                                             // 26 Email
        ])

        const wb = XLSX.utils.book_new()
        const ws = XLSX.utils.aoa_to_sheet(rows)
        ws["!cols"] = Array(26).fill({ wch: 20 })
        XLSX.utils.book_append_sheet(wb, ws, "NEFT")
        XLSX.writeFile(wb, `NEFT_${site?.name ?? "Site"}_${MONTHS[m-1]}_${y}.xlsx`)
    }

    const handleStatementExcel = () => {
        const exportRows = selectedIds.size > 0 ? data.filter(p => selectedIds.has(p.id)) : data
        if (!exportRows.length) return
        const site = sites.find(s => s.id === selId)
        const m = parseInt(month); const y = parseInt(year)
        const caption = `Salary ${MONTHS[m - 1].slice(0, 3)} ${String(y).slice(-2)}`
        const today = new Date()
        const genOn  = `${String(today.getDate()).padStart(2,"0")}/${String(today.getMonth()+1).padStart(2,"0")}/${today.getFullYear()} ${String(today.getHours()).padStart(2,"0")}:${String(today.getMinutes()).padStart(2,"0")}:${String(today.getSeconds()).padStart(2,"0")}`
        const valueDate = `${String(today.getDate()).padStart(2,"0")}/${String(today.getMonth()+1).padStart(2,"0")}/${today.getFullYear()}`

        const aoa: unknown[][] = [
            ["", "", "File Transactions"],
            [], [],
            ["", hdfcGenBy || "ADMIN", "Generated By   :   ", site?.name ?? ""],
            ["", `Generated On   :   `, genOn],
            [], [],
            ["", "Account Number", "Beneficiary", "Beneficiary Account No.", "IFSC Code",
             "User Reference Number", "Value date", "Transfer Type", "Amount", "Status"],
            ...exportRows.map(p => [
                "",
                hdfcAccNo || "XXXXXXXXXXXXXXXXX",
                `${p.employee.firstName} ${p.employee.lastName}`.toUpperCase(),
                p.employee.bankAccountNumber || "",
                p.employee.bankIFSC || "",
                caption,
                valueDate,
                "NEFT",
                Math.round(p.netSalary),
                "Processed",
            ]),
            [],
            ["", `Total Search Results  :  `, exportRows.length],
        ]

        const wb = XLSX.utils.book_new()
        const ws = XLSX.utils.aoa_to_sheet(aoa)
        ws["!cols"] = [4, 18, 30, 20, 14, 20, 12, 14, 12, 12].map(w => ({ wch: w }))
        XLSX.utils.book_append_sheet(wb, ws, "File Transactions")
        XLSX.writeFile(wb, `HDFC_Statement_${site?.name ?? "Site"}_${MONTHS[m-1]}_${y}.xlsx`)
    }

    const handleStatementPDF = () => {
        const exportRows = selectedIds.size > 0 ? data.filter(p => selectedIds.has(p.id)) : data
        if (!exportRows.length) return
        const site = sites.find(s => s.id === selId)
        const m = parseInt(month); const y = parseInt(year)
        const caption = `Salary ${MONTHS[m - 1].slice(0, 3)} ${String(y).slice(-2)}`
        const today = new Date()
        const genOn = today.toLocaleString("en-IN")
        const valueDate = today.toLocaleDateString("en-IN")
        const totalAmt = exportRows.reduce((s, p) => s + Math.round(p.netSalary), 0)

        const rows = exportRows.map((p, i) => `
            <tr style="background:${i%2===0?"#fff":"#f8fafc"}">
                <td>${i+1}</td>
                <td>${hdfcAccNo || "XXXXXXXXXXXXXXXXX"}</td>
                <td style="text-align:left;font-weight:600">${`${p.employee.firstName} ${p.employee.lastName}`.toUpperCase()}</td>
                <td>${p.employee.bankAccountNumber || "<span style='color:#dc2626'>Missing</span>"}</td>
                <td>${p.employee.bankIFSC || "<span style='color:#dc2626'>Missing</span>"}</td>
                <td>${caption}</td>
                <td>${valueDate}</td>
                <td>NEFT</td>
                <td style="text-align:right;font-weight:700">₹${Math.round(p.netSalary).toLocaleString("en-IN")}</td>
                <td style="color:#16a34a;font-weight:600">Processed</td>
            </tr>`).join("")

        const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"/>
        <title>HDFC Bank Statement - ${site?.name ?? ""}</title>
        <style>
            *{margin:0;padding:0;box-sizing:border-box}
            body{font-family:Arial,sans-serif;font-size:11px;color:#1a1a1a;padding:20px}
            .header{display:flex;align-items:center;justify-content:space-between;border-bottom:3px solid #004C8F;padding-bottom:12px;margin-bottom:16px}
            .logo-block{display:flex;flex-direction:column}
            .logo-text{font-size:26px;font-weight:900;color:#004C8F;letter-spacing:-0.5px}
            .logo-sub{font-size:9px;color:#004C8F;letter-spacing:1px;margin-top:1px}
            .logo-tag{font-size:8px;color:#e4002b;font-style:italic;margin-top:2px}
            .bank-info{text-align:right;font-size:10px;color:#555}
            .title-bar{background:#004C8F;color:#fff;padding:8px 14px;border-radius:4px;margin-bottom:14px}
            .title-bar h2{font-size:14px;font-weight:700;letter-spacing:0.5px}
            .meta{display:grid;grid-template-columns:1fr 1fr;gap:6px 20px;background:#f0f4f8;border:1px solid #dce5ef;border-radius:4px;padding:10px 14px;margin-bottom:14px;font-size:10px}
            .meta span{color:#555}.meta b{color:#004C8F}
            table{width:100%;border-collapse:collapse;font-size:10px}
            th{background:#004C8F;color:#fff;padding:7px 8px;text-align:center;white-space:nowrap;font-weight:700}
            td{padding:5px 8px;border-bottom:1px solid #e5e7eb;text-align:center;white-space:nowrap}
            .footer{margin-top:14px;display:flex;justify-content:space-between;align-items:center;border-top:2px solid #004C8F;padding-top:10px}
            .footer-total{background:#004C8F;color:#fff;padding:6px 16px;border-radius:4px;font-weight:700;font-size:12px}
            .footer-note{font-size:9px;color:#888}
            @media print{body{padding:10px}.no-print{display:none}}
        </style></head><body>
        <div class="header">
            <div class="logo-block">
                <div class="logo-text">HDFC BANK</div>
                <div class="logo-sub">WE UNDERSTAND YOUR WORLD</div>
                <div class="logo-tag">India's Most Trusted Private Bank</div>
            </div>
            <div class="bank-info">
                <div><b>Statement Type:</b> File Transactions</div>
                <div><b>Site:</b> ${site?.name ?? "—"} ${site?.code ? `(${site.code})` : ""}</div>
                <div><b>Period:</b> ${MONTHS[m-1]} ${y}</div>
            </div>
        </div>
        <div class="title-bar"><h2>File Transactions — Salary Payment Statement</h2></div>
        <div class="meta">
            <span><b>User ID</b>: ${hdfcGenBy || "ADMIN"}</span>
            <span><b>Generated On</b>: ${genOn}</span>
            <span><b>Company Account</b>: ${hdfcAccNo || "XXXXXXXXXXXXXXXXX"}</span>
            <span><b>Transfer Type</b>: NEFT</span>
            <span><b>Value Date</b>: ${valueDate}</span>
            <span><b>Reference</b>: ${caption}</span>
        </div>
        <table>
            <thead><tr>
                <th>#</th><th>Account Number</th><th>Beneficiary</th>
                <th>Beneficiary A/C No.</th><th>IFSC Code</th>
                <th>User Reference</th><th>Value Date</th>
                <th>Transfer Type</th><th>Amount (₹)</th><th>Status</th>
            </tr></thead>
            <tbody>${rows}</tbody>
            <tfoot><tr style="background:#eff6ff;font-weight:700">
                <td colspan="8" style="text-align:right;color:#004C8F">Total (${exportRows.length} records)</td>
                <td style="text-align:right;color:#004C8F">₹${totalAmt.toLocaleString("en-IN")}</td>
                <td></td>
            </tr></tfoot>
        </table>
        <div class="footer">
            <div class="footer-note">This is a computer generated statement. No signature required.<br/>HDFC Bank Ltd. — Payroll File Transactions</div>
            <div class="footer-total">Total Payable: ₹${totalAmt.toLocaleString("en-IN")}</div>
        </div>
        </body></html>`

        const iframe = document.createElement("iframe")
        iframe.style.cssText = "position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;border:none"
        document.body.appendChild(iframe)
        const doc = iframe.contentDocument || iframe.contentWindow?.document
        if (!doc) { toast.error("Could not generate PDF"); document.body.removeChild(iframe); return }
        doc.open(); doc.write(html); doc.close()
        iframe.contentWindow?.focus()
        setTimeout(() => {
            iframe.contentWindow?.print()
            setTimeout(() => document.body.removeChild(iframe), 3000)
        }, 500)
    }

    const handleExport = () => {
        const exportRows = selectedIds.size > 0 ? data.filter(p => selectedIds.has(p.id)) : data
        if (!exportRows.length) return
        const site = sites.find(s => s.id === selId)
        const m = parseInt(month); const y = parseInt(year)
        const aoa = buildFormIIAoa(exportRows, site?.name ?? "All Sites", m, y)
        const wb = XLSX.utils.book_new()
        const ws = XLSX.utils.aoa_to_sheet(aoa)
        const colWidths = [6,12,26,14,18,10,8, 10,8,8,10,10,10,10,4, 10,8,8,14,12,10,10, 10,14, 8,8,6,6,8,10,10,12,10,12]
        ws["!cols"] = colWidths.map(w => ({ wch: w }))
        const sheetName = (site?.name ?? "All Sites").replace(/[^a-zA-Z0-9 ]/g, "").slice(0, 31)
        XLSX.utils.book_append_sheet(wb, ws, sheetName)
        XLSX.writeFile(wb, `FormII_WageSheet_${site?.name ?? "All"}_${MONTHS[m-1]}_${y}.xlsx`)
    }

    const selectedCount = selectedIds.size
    const filtered      = data.filter(p => !search ||
        `${p.employee.firstName} ${p.employee.lastName} ${p.employee.employeeId}`.toLowerCase().includes(search.toLowerCase()))
    const selSite       = sites.find(s => s.id === selId)
    const getSt         = (id: string) => status.find(s => s.siteId === id)
    const done          = status.filter(s => (s.processedCount ?? 0) > 0).length
    const processedSites = sites.filter(s => (getSt(s.id)?.processedCount ?? 0) > 0)

    const totals = {
        gross: data.reduce((s, p) => s + p.grossSalary, 0),
        net:   data.reduce((s, p) => s + p.netSalary,   0),
        ded:   data.reduce((s, p) => s + p.totalDeductions, 0),
        pf:    data.reduce((s, p) => s + p.pfEmployee,  0),
        esi:   data.reduce((s, p) => s + p.esiEmployee, 0),
    }

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, paddingBottom: 32 }}>
            {/* Breadcrumb */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--text3)" }}>
                <span style={{ cursor: "pointer", textDecoration: "underline" }} onClick={() => router.push("/payroll")}>Payroll</span>
                <ChevronRight size={11} />
                <span style={{ fontWeight: 600, color: "var(--text2)" }}>Wage Sheet</span>
            </div>

            {/* Title */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <h1 style={{ fontSize: 20, fontWeight: 800, color: "var(--text)", margin: 0 }}>Site Wise Wage Sheet</h1>
                <span style={{ fontSize: 11, color: "var(--text3)" }}>{done}/{sites.length} sites processed</span>
            </div>

            {/* Stepper */}
            <div style={{ display: "flex", alignItems: "center", gap: 4, overflowX: "auto", whiteSpace: "nowrap", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "10px 14px" }}>
                {["Upload Attendance","Process Payroll","Wage Sheet","Compliance","Lock Payroll"].map((s, i) => (
                    <div key={s} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 7,
                            background: i === 2 ? "var(--accent-light)" : "transparent",
                            color: i === 2 ? "var(--accent)" : "var(--text3)", fontSize: 12, fontWeight: i === 2 ? 700 : 400 }}>
                            <div style={{ width: 18, height: 18, borderRadius: 4, background: i === 2 ? "var(--accent)" : "var(--border)",
                                display: "flex", alignItems: "center", justifyContent: "center",
                                color: i === 2 ? "#fff" : "var(--text3)", fontSize: 10, fontWeight: 700 }}>{i+1}</div>
                            {s}
                        </div>
                        {i < 4 && <ChevronRight size={11} style={{ color: "var(--text3)", opacity: 0.3 }} />}
                    </div>
                ))}
            </div>

            {/* Month/Year */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "11px 16px" }}>
                <span style={lbl}>Month</span>
                <select value={month} onChange={e => { setMonth(e.target.value); setSelId(""); setData([]) }} style={sel}>
                    {MONTHS.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
                </select>
                <span style={lbl}>Year</span>
                <select value={year} onChange={e => { setYear(e.target.value); setSelId(""); setData([]) }} style={sel}>
                    {[2024,2025,2026].map(y => <option key={y} value={y}>{y}</option>)}
                </select>
                <button onClick={fetchStatus} style={{ marginLeft: "auto", display: "flex", padding: "4px 8px", borderRadius: 6, border: "1px solid var(--border)", background: "none", cursor: "pointer" }}>
                    <RefreshCw size={12} style={{ color: "var(--text3)" }} />
                </button>
            </div>

            {/* Two-panel */}
            <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                {/* LEFT */}
                <div style={{ width: 256, flexShrink: 0, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden", display: "flex", flexDirection: "column" }}>
                    <div style={{ padding: "11px 14px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <input type="checkbox"
                                checked={processedSites.length > 0 && processedSites.every(s => selectedSiteIds.has(s.id))}
                                onChange={e => setSelectedSiteIds(e.target.checked ? new Set(processedSites.map(s => s.id)) : new Set())}
                                style={{ cursor: "pointer", accentColor: "var(--accent)" }} />
                            <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text2)" }}>Sites</span>
                        </div>
                        <span style={{ fontSize: 10, color: "var(--text3)", background: "var(--surface2)", borderRadius: 10, padding: "2px 7px" }}>{processedSites.length}</span>
                    </div>
                    <div style={{ overflowY: "auto", flex: 1, maxHeight: 460 }}>
                        {ldSites ? <div style={{ padding: 24, textAlign: "center" }}><Loader2 size={16} className="animate-spin" style={{ color: "var(--accent)", margin: "0 auto" }} /></div> : (
                            <>
                                <div onClick={() => selectSite("")}
                                    style={{ padding: "10px 14px", cursor: "pointer", borderBottom: "1px solid var(--border)",
                                        background: !selId ? "var(--accent-light)" : "transparent",
                                        borderLeft: !selId ? "3px solid var(--accent)" : "3px solid transparent" }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                                        <Building2 size={13} style={{ color: !selId ? "var(--accent)" : "var(--text3)" }} />
                                        <span style={{ fontSize: 12, fontWeight: 700, color: !selId ? "var(--accent)" : "var(--text2)" }}>All Sites</span>
                                    </div>
                                    <div style={{ fontSize: 10, color: "var(--text3)", marginTop: 2, marginLeft: 20 }}>{done}/{processedSites.length} processed</div>
                                </div>
                                {processedSites.map(site => {
                                    const st = getSt(site.id); const isDone = (st?.processedCount ?? 0) > 0
                                    const isSel = selId === site.id; const isSiteChecked = selectedSiteIds.has(site.id)
                                    return (
                                        <div key={site.id} onClick={() => selectSite(site.id)}
                                            style={{ padding: "10px 14px", cursor: "pointer", borderBottom: "1px solid var(--border)",
                                                background: isSiteChecked ? "#f5f3ff" : isSel ? "var(--accent-light)" : "transparent",
                                                borderLeft: isSiteChecked ? "3px solid #7c3aed" : isSel ? "3px solid var(--accent)" : "3px solid transparent" }}>
                                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
                                                <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                                                    <input type="checkbox" checked={isSiteChecked}
                                                        onClick={e => toggleSiteSelect(site.id, e)}
                                                        onChange={() => {}}
                                                        style={{ cursor: "pointer", accentColor: "#7c3aed", flexShrink: 0 }} />
                                                    <span style={{ fontSize: 12, fontWeight: 600, color: isSiteChecked ? "#7c3aed" : isSel ? "var(--accent)" : "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{site.name}</span>
                                                </div>
                                                <span style={{ padding: "1px 6px", borderRadius: 20, fontSize: 9, fontWeight: 700, whiteSpace: "nowrap",
                                                    background: isDone ? "#dcfce7" : "#fef9c3", color: isDone ? "#15803d" : "#854d0e" }}>
                                                    {isDone ? `${st!.processedCount}` : "—"}
                                                </span>
                                            </div>
                                            {site.code && <div style={{ fontSize: 10, color: "var(--text3)", marginTop: 2, marginLeft: 22 }}>{site.code}</div>}
                                        </div>
                                    )
                                })}
                            </>
                        )}
                    </div>
                    {/* Multi-site action footer */}
                    {selectedSiteIds.size > 0 && (
                        <div style={{ padding: "10px 14px", borderTop: "2px solid #7c3aed", background: "#f5f3ff" }}>
                            <div style={{ fontSize: 11, color: "#7c3aed", fontWeight: 700, marginBottom: 8 }}>
                                {selectedSiteIds.size} site{selectedSiteIds.size > 1 ? "s" : ""} selected
                            </div>
                            <button onClick={handleExportCombined} disabled={dlCombined}
                                style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                                    padding: "7px 12px", borderRadius: 8, border: "1px solid #7c3aed",
                                    background: "#fff", color: "#7c3aed",
                                    fontSize: 12, fontWeight: 700, cursor: dlCombined ? "not-allowed" : "pointer", marginBottom: 6 }}>
                                {dlCombined ? <Loader2 size={13} className="animate-spin" /> : <FileSpreadsheet size={13} />}
                                {dlCombined ? "Downloading…" : "Download Form II (Combined)"}
                            </button>
                            <button onClick={handleLockSites} disabled={lockingSites}
                                style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                                    padding: "8px 12px", borderRadius: 8, border: "none",
                                    background: lockingSites ? "#a78bfa" : "#7c3aed", color: "#fff",
                                    fontSize: 12, fontWeight: 700, cursor: lockingSites ? "not-allowed" : "pointer" }}>
                                {lockingSites ? <Loader2 size={13} className="animate-spin" /> : <Lock size={13} />}
                                {lockingSites ? "Locking…" : "Lock & Go to Compliance"}
                            </button>
                        </div>
                    )}
                </div>

                {/* RIGHT */}
                <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 10 }}>
                    {!selId ? (
                        <>
                            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "14px 16px" }}>
                                <p style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", margin: "0 0 3px 0" }}>{MONTHS[parseInt(month)-1]} {year} — Wage Sheet Overview</p>
                                <p style={{ fontSize: 12, color: "var(--text3)", margin: 0 }}>Select a site to view its wage sheet and export to Excel.</p>
                            </div>
                            {processedSites.length === 0 ? (
                                <div style={{ padding: 40, textAlign: "center", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12 }}>
                                    <MapPin size={28} style={{ color: "var(--text3)", opacity: 0.3, margin: "0 auto 8px" }} />
                                    <p style={{ fontSize: 13, color: "var(--text3)", margin: 0 }}>No payroll processed for this period yet</p>
                                </div>
                            ) : (
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10 }}>
                                {processedSites.map(site => {
                                    const st = getSt(site.id); const isDone = (st?.processedCount ?? 0) > 0
                                    return (
                                        <div key={site.id} onClick={() => selectSite(site.id)}
                                            style={{ padding: "14px 16px", borderRadius: 10, cursor: "pointer",
                                                border: `1px solid ${isDone ? "#86efac" : "var(--border)"}`,
                                                background: isDone ? "#f0fdf4" : "var(--surface)" }}
                                            onMouseEnter={e => (e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.07)")}
                                            onMouseLeave={e => (e.currentTarget.style.boxShadow = "none")}>
                                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 6 }}>
                                                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                                    <MapPin size={13} style={{ color: isDone ? "#16a34a" : "var(--accent)", flexShrink: 0 }} />
                                                    <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>{site.name}</span>
                                                </div>
                                                <span style={{ padding: "2px 7px", borderRadius: 20, fontSize: 9, fontWeight: 700, background: isDone ? "#dcfce7" : "#fef9c3", color: isDone ? "#15803d" : "#854d0e", whiteSpace: "nowrap" }}>
                                                    {isDone ? "✓ Done" : "No Data"}
                                                </span>
                                            </div>
                                            <div style={{ marginTop: 10, fontSize: 11, color: isDone ? "#15803d" : "var(--text3)", fontWeight: isDone ? 600 : 400 }}>
                                                {isDone ? `${st!.processedCount} employees` : "Not yet processed"}
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                            )}
                        </>
                    ) : (
                        <>
                            {/* Site header */}
                            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "11px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                    <MapPin size={15} style={{ color: "var(--accent)" }} />
                                    <span style={{ fontSize: 14, fontWeight: 800, color: "var(--text)" }}>{selSite?.name}</span>
                                    {selSite?.code && <span style={{ fontSize: 11, color: "var(--text3)" }}>{selSite.code}</span>}
                                </div>
                                {/* View tabs */}
                                <div style={{ display: "flex", background: "var(--surface2)", borderRadius: 8, padding: 3, gap: 2 }}>
                                    {([
                                        { key: "wagesheet",  label: "Wage Sheet" },
                                        { key: "neft",       label: "NEFT File" },
                                        { key: "statement",  label: "Bank Statement" },
                                    ] as const).map(v => (
                                        <button key={v.key} onClick={() => setActiveView(v.key)}
                                            style={{ padding: "5px 14px", borderRadius: 6, border: "none", fontSize: 12, fontWeight: 600, cursor: "pointer",
                                                background: activeView === v.key ? "var(--accent)" : "transparent",
                                                color: activeView === v.key ? "#fff" : "var(--text3)" }}>
                                            {v.label}
                                        </button>
                                    ))}
                                </div>
                                <div style={{ display: "flex", gap: 8 }}>
                                    <button onClick={() => fetchData(selId)} disabled={ldData}
                                        style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "none", fontSize: 12, color: "var(--text2)", cursor: "pointer" }}>
                                        <RefreshCw size={12} className={ldData ? "animate-spin" : ""} /> Refresh
                                    </button>
                                    {activeView === "wagesheet" && (
                                        <button onClick={handleExport} disabled={!data.length}
                                            style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 8, border: "none", background: "#16a34a", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", opacity: !data.length ? 0.5 : 1 }}>
                                            <FileSpreadsheet size={13} />
                                            {selectedCount > 0 ? `Form II (${selectedCount} selected)` : "Form II Excel"}
                                        </button>
                                    )}
                                    {activeView === "neft" && (
                                        <button onClick={handleNEFT} disabled={!data.length}
                                            style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 8, border: "none", background: "#0369a1", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", opacity: !data.length ? 0.5 : 1 }}>
                                            <FileDown size={13} />
                                            {selectedCount > 0 ? `Download NEFT (${selectedCount})` : "Download NEFT"}
                                        </button>
                                    )}
                                    {activeView === "statement" && (
                                        <>
                                            <button onClick={handleStatementExcel} disabled={!data.length}
                                                style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 8, border: "none", background: "#16a34a", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", opacity: !data.length ? 0.5 : 1 }}>
                                                <FileSpreadsheet size={13} /> Excel
                                            </button>
                                            <button onClick={handleStatementPDF} disabled={!data.length}
                                                style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 8, border: "none", background: "#dc2626", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", opacity: !data.length ? 0.5 : 1 }}>
                                                <FileDown size={13} /> PDF
                                            </button>
                                        </>
                                    )}
                                    {selectedCount > 0 && (
                                        <button onClick={handleLock} disabled={locking}
                                            style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 8, border: "none", background: "#7c3aed", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", opacity: locking ? 0.6 : 1 }}>
                                            {locking ? <Loader2 size={13} className="animate-spin" /> : <Lock size={13} />}
                                            Lock & Send to Compliance ({selectedCount})
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Bank Statement inputs */}
                            {activeView === "statement" && (
                                <div style={{ background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 10, padding: "12px 16px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                        <span style={{ fontSize: 22, fontWeight: 900, color: "#004C8F", letterSpacing: "-0.5px" }}>HDFC</span>
                                        <span style={{ fontSize: 10, color: "#004C8F", fontWeight: 700 }}>BANK</span>
                                    </div>
                                    <div style={{ width: 1, height: 28, background: "#fed7aa" }} />
                                    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                                        <span style={{ fontSize: 10, fontWeight: 700, color: "#c2410c" }}>Company A/C No.</span>
                                        <input value={hdfcAccNo} onChange={e => setHdfcAccNo(e.target.value)}
                                            placeholder="e.g. 50200061320551"
                                            style={{ width: 180, padding: "5px 8px", borderRadius: 6, border: "1px solid #fdba74", fontSize: 12, outline: "none", background: "#fff", color: "var(--text)" }} />
                                    </div>
                                    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                                        <span style={{ fontSize: 10, fontWeight: 700, color: "#c2410c" }}>Generated By (User ID)</span>
                                        <input value={hdfcGenBy} onChange={e => setHdfcGenBy(e.target.value)}
                                            placeholder="e.g. GROAUCX"
                                            style={{ width: 160, padding: "5px 8px", borderRadius: 6, border: "1px solid #fdba74", fontSize: 12, outline: "none", background: "#fff", color: "var(--text)" }} />
                                    </div>
                                    <span style={{ fontSize: 11, color: "#ea580c", marginLeft: "auto" }}>
                                        PDF opens print dialog · Excel downloads instantly
                                    </span>
                                </div>
                            )}

                            {/* NEFT email input */}
                            {activeView === "neft" && (
                                <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 10, padding: "12px 16px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                                    <span style={{ fontSize: 12, fontWeight: 700, color: "#1d4ed8", whiteSpace: "nowrap" }}>Authorized Email (col 26)</span>
                                    <input value={neftEmail} onChange={e => setNeftEmail(e.target.value)}
                                        placeholder="accounts@yourcompany.com"
                                        style={{ flex: 1, minWidth: 220, padding: "6px 10px", borderRadius: 7, border: "1px solid #93c5fd", fontSize: 12, outline: "none", background: "#fff", color: "var(--text)" }} />
                                    <span style={{ fontSize: 11, color: "#3b82f6" }}>Site short name: <b>{(selSite?.code || selSite?.name || "").toUpperCase().replace(/\s+/g,"").slice(0,8)}</b></span>
                                </div>
                            )}

                            {/* Stat cards */}
                            {data.length > 0 && (
                                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
                                    {[
                                        { label: "Employees",    value: String(data.length),  color: "#3b82f6" },
                                        { label: "Total Gross",  value: fmt(totals.gross),    color: "#0369a1" },
                                        { label: "Deductions",   value: fmt(totals.ded),      color: "#dc2626" },
                                        { label: "Net Payable",  value: fmt(totals.net),      color: "#16a34a" },
                                    ].map(s => (
                                        <div key={s.label} style={{ padding: "9px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)" }}>
                                            <p style={{ fontSize: 9, color: "var(--text3)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.4px", margin: 0 }}>{s.label}</p>
                                            <p style={{ fontSize: 14, fontWeight: 700, color: s.color, margin: "2px 0 0 0" }}>{s.value}</p>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* NEFT Preview Table */}
                            {activeView === "neft" && (
                                <div style={{ background: "var(--surface)", border: "1px solid #bfdbfe", borderRadius: 12, overflow: "hidden" }}>
                                    <div style={{ padding: "9px 14px", borderBottom: "1px solid #bfdbfe", background: "#eff6ff", display: "flex", alignItems: "center", gap: 8 }}>
                                        <FileDown size={13} style={{ color: "#1d4ed8" }} />
                                        <span style={{ fontSize: 12, fontWeight: 700, color: "#1d4ed8" }}>NEFT File Preview — {data.length} rows</span>
                                        <span style={{ fontSize: 11, color: "#3b82f6", marginLeft: "auto" }}>26 columns as per bank format</span>
                                    </div>
                                    <div style={{ overflowX: "auto" }}>
                                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                                            <thead>
                                                <tr style={{ background: "#dbeafe", borderBottom: "1px solid #bfdbfe" }}>
                                                    {["#","Type","Blank","Acct No","Net Salary","Name (CAPS)","[6-11]","Caption 1","Caption 2","Site","[15-20]","Pay Date","Blank","IFSC","[24-25]","Email"].map(h => (
                                                        <th key={h} style={{ padding: "6px 10px", fontWeight: 700, color: "#1e40af", whiteSpace: "nowrap", textAlign: "center", fontSize: 10 }}>{h}</th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {data.slice(0, 5).map((p, i) => {
                                                    const siteShort = (selSite?.code || selSite?.name || "SITE").toUpperCase().replace(/\s+/g,"").slice(0,8)
                                                    const m = parseInt(month)
                                                    const caption = `Salary ${MONTHS[m-1].slice(0,3)} ${String(parseInt(year)).slice(-2)}`
                                                    const today = new Date()
                                                    const payDate = `${String(today.getDate()).padStart(2,"0")}/${String(today.getMonth()+1).padStart(2,"0")}/${today.getFullYear()}`
                                                    return (
                                                        <tr key={p.id} style={{ borderBottom: "1px solid #e0f2fe", background: i%2===0?"#fff":"#f0f9ff" }}>
                                                            <td style={{ ...td, fontSize: 10 }}>{i+1}</td>
                                                            <td style={{ ...td, fontWeight: 700, color: "#0369a1" }}>N</td>
                                                            <td style={td}></td>
                                                            <td style={{ ...td, color: "#0369a1" }}>{p.employee.bankAccountNumber || <span style={{color:"#f59e0b"}}>Missing</span>}</td>
                                                            <td style={{ ...td, fontWeight: 700 }}>{Math.round(p.netSalary)}</td>
                                                            <td style={{ ...td, textAlign: "left" }}>{`${p.employee.firstName} ${p.employee.lastName}`.toUpperCase()}</td>
                                                            <td style={{ ...td, color: "var(--text3)", fontSize: 9 }}>——</td>
                                                            <td style={td}>{caption}</td>
                                                            <td style={td}>{caption}</td>
                                                            <td style={{ ...td, fontWeight: 700, color: "#0369a1" }}>{siteShort}</td>
                                                            <td style={{ ...td, color: "var(--text3)", fontSize: 9 }}>——</td>
                                                            <td style={td}>{payDate}</td>
                                                            <td style={td}></td>
                                                            <td style={{ ...td, color: "#0369a1" }}>{p.employee.bankIFSC || <span style={{color:"#f59e0b"}}>Missing</span>}</td>
                                                            <td style={{ ...td, color: "var(--text3)", fontSize: 9 }}>——</td>
                                                            <td style={{ ...td, color: "#6b7280" }}>{neftEmail || "—"}</td>
                                                        </tr>
                                                    )
                                                })}
                                                {data.length > 5 && (
                                                    <tr><td colSpan={16} style={{ padding: "8px 14px", textAlign: "center", fontSize: 11, color: "var(--text3)", background: "#f0f9ff" }}>
                                                        + {data.length - 5} more rows in downloaded file
                                                    </td></tr>
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}

                            {/* Wage Sheet Table */}
                            {activeView === "wagesheet" && <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
                                <div style={{ padding: "9px 14px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 8 }}>
                                    <Search size={13} style={{ color: "var(--text3)", flexShrink: 0 }} />
                                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search employees…"
                                        style={{ flex: 1, border: "none", outline: "none", fontSize: 12, background: "transparent", color: "var(--text)" }} />
                                    {selectedCount > 0 && (
                                        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--accent)", whiteSpace: "nowrap", background: "var(--accent-light)", padding: "2px 8px", borderRadius: 20 }}>
                                            {selectedCount} selected
                                        </span>
                                    )}
                                    <span style={{ fontSize: 11, color: "var(--text3)", whiteSpace: "nowrap" }}>{filtered.length}/{data.length}</span>
                                </div>
                                <div style={{ overflowX: "auto" }}>
                                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                                        <thead>
                                            <tr style={{ background: "var(--surface2)", borderBottom: "1px solid var(--border)" }}>
                                                <th style={th} rowSpan={2}>
                                                    <input type="checkbox"
                                                        checked={filtered.length > 0 && filtered.every(p => selectedIds.has(p.id))}
                                                        onChange={() => toggleAll(filtered)}
                                                        style={{ cursor: "pointer", accentColor: "var(--accent)" }} />
                                                </th>
                                                <th style={th} rowSpan={2}>#</th>
                                                <th style={th} rowSpan={2}>Emp ID</th>
                                                <th style={{ ...th, textAlign: "left" }} rowSpan={2}>Name</th>
                                                <th style={th} rowSpan={2}>Desig.</th>
                                                <th style={th} rowSpan={2}>P.Days</th>
                                                <th style={{ ...th, background: "#eff6ff", color: "#1d4ed8" }} colSpan={6}>Earnings (₹)</th>
                                                <th style={{ ...th, background: "#fef2f2", color: "#dc2626" }} colSpan={7}>Deductions (₹)</th>
                                                <th style={{ ...th, background: "#f0fdf4", color: "#16a34a" }} rowSpan={2}>Net Pay</th>
                                            </tr>
                                            <tr style={{ background: "var(--surface2)", borderBottom: "2px solid var(--border)" }}>
                                                {["Basic","DA","Wash","Conv.","OT","Gross"].map(h => <th key={h} style={{ ...th, background: "#eff6ff" }}>{h}</th>)}
                                                {["PF","ESI","PT","LWF","Canteen","Penalty","Adv."].map(h => <th key={h} style={{ ...th, background: "#fef2f2" }}>{h}</th>)}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {ldData ? (
                                                <tr><td colSpan={20} style={{ padding: "40px 0", textAlign: "center" }}>
                                                    <Loader2 size={20} className="animate-spin" style={{ color: "var(--accent)", margin: "0 auto" }} />
                                                </td></tr>
                                            ) : filtered.length === 0 ? (
                                                <tr><td colSpan={20} style={{ padding: "30px", textAlign: "center", color: "var(--text3)", fontSize: 12 }}>
                                                    {data.length === 0 ? "No processed payroll records found for this site and period" : "No results match your search"}
                                                </td></tr>
                                            ) : filtered.map((p, i) => (
                                                <tr key={p.id} onClick={() => toggleSelect(p.id)}
                                                    style={{ borderBottom: "1px solid var(--border)", cursor: "pointer",
                                                        background: selectedIds.has(p.id) ? "var(--accent-light)" : i % 2 === 0 ? "var(--surface)" : "var(--surface2)" }}>
                                                    <td style={td} onClick={e => e.stopPropagation()}>
                                                        <input type="checkbox" checked={selectedIds.has(p.id)} onChange={() => toggleSelect(p.id)}
                                                            style={{ cursor: "pointer", accentColor: "var(--accent)" }} />
                                                    </td>
                                                    <td style={td}>{i+1}</td>
                                                    <td style={{ ...td, color: "var(--accent)", fontWeight: 700 }}>{p.employee.employeeId}</td>
                                                    <td style={{ ...td, textAlign: "left", fontWeight: 600 }}>{p.employee.firstName} {p.employee.lastName}</td>
                                                    <td style={{ ...td, fontSize: 10, color: "var(--text3)" }}>{p.employee.designation || "—"}</td>
                                                    <td style={td}>{p.presentDays ?? "—"}</td>
                                                    <td style={{ ...td, background: "#eff6ff" }}>{fmtN(p.basicSalary)}</td>
                                                    <td style={{ ...td, background: "#eff6ff" }}>{fmtN(p.da)}</td>
                                                    <td style={{ ...td, background: "#eff6ff" }}>{fmtN(p.washing)}</td>
                                                    <td style={{ ...td, background: "#eff6ff" }}>{fmtN(p.conveyance)}</td>
                                                    <td style={{ ...td, background: "#eff6ff" }}>{fmtN(p.overtimePay)}</td>
                                                    <td style={{ ...td, background: "#eff6ff", fontWeight: 700, color: "#1d4ed8" }}>{fmtN(p.grossSalary)}</td>
                                                    <td style={{ ...td, background: "#fef2f2" }}>{fmtN(p.pfEmployee)}</td>
                                                    <td style={{ ...td, background: "#fef2f2" }}>{fmtN(p.esiEmployee)}</td>
                                                    <td style={{ ...td, background: "#fef2f2" }}>{fmtN(p.pt)}</td>
                                                    <td style={{ ...td, background: "#fef2f2" }}>{fmtN(p.lwf)}</td>
                                                    <td style={{ ...td, background: "#fef2f2" }}>{fmtN(p.canteen)}</td>
                                                    <td style={{ ...td, background: "#fef2f2" }}>{fmtN(p.penalty)}</td>
                                                    <td style={{ ...td, background: "#fef2f2" }}>{fmtN(p.advance)}</td>
                                                    <td style={{ ...td, background: "#f0fdf4", fontWeight: 700, color: "#16a34a" }}>{fmtN(p.netSalary)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                        {data.length > 0 && (
                                            <tfoot>
                                                <tr style={{ background: "var(--surface2)", borderTop: "2px solid var(--border)", fontWeight: 700 }}>
                                                    <td colSpan={6} style={{ ...td, textAlign: "right", fontSize: 10, color: "var(--text3)", textTransform: "uppercase" }}>Total ({selectedCount > 0 ? `${selectedCount} selected` : data.length})</td>
                                                    <td style={{ ...td, background: "#eff6ff" }}>{fmt(data.reduce((s,p)=>s+p.basicSalary,0))}</td>
                                                    <td style={{ ...td, background: "#eff6ff" }}>{fmt(data.reduce((s,p)=>s+p.da,0))}</td>
                                                    <td style={{ ...td, background: "#eff6ff" }}>{fmt(data.reduce((s,p)=>s+p.washing,0))}</td>
                                                    <td style={{ ...td, background: "#eff6ff" }}>{fmt(data.reduce((s,p)=>s+p.conveyance,0))}</td>
                                                    <td style={{ ...td, background: "#eff6ff" }}>{fmt(data.reduce((s,p)=>s+p.overtimePay,0))}</td>
                                                    <td style={{ ...td, background: "#eff6ff", color: "#1d4ed8" }}>{fmt(totals.gross)}</td>
                                                    <td style={{ ...td, background: "#fef2f2" }}>{fmt(totals.pf)}</td>
                                                    <td style={{ ...td, background: "#fef2f2" }}>{fmt(totals.esi)}</td>
                                                    <td style={{ ...td, background: "#fef2f2" }}>{fmt(data.reduce((s,p)=>s+p.pt,0))}</td>
                                                    <td style={{ ...td, background: "#fef2f2" }}>{fmt(data.reduce((s,p)=>s+p.lwf,0))}</td>
                                                    <td style={{ ...td, background: "#fef2f2" }}>{fmt(data.reduce((s,p)=>s+p.canteen,0))}</td>
                                                    <td style={{ ...td, background: "#fef2f2" }}>{fmt(data.reduce((s,p)=>s+p.penalty,0))}</td>
                                                    <td style={{ ...td, background: "#fef2f2" }}>{fmt(data.reduce((s,p)=>s+p.advance,0))}</td>
                                                    <td style={{ ...td, background: "#f0fdf4", color: "#16a34a" }}>{fmt(totals.net)}</td>
                                                </tr>
                                            </tfoot>
                                        )}
                                    </table>
                                </div>
                            </div>}
                        </>
                    )}
                </div>
            </div>
        </div>
    )
}

export default function WageSheetPage() {
    return <Suspense><WageSheetInner /></Suspense>
}

const lbl: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: "var(--text3)", whiteSpace: "nowrap" }
const sel: React.CSSProperties = { padding: "6px 10px", borderRadius: 7, border: "1px solid var(--border)", fontSize: 12, background: "var(--surface)", color: "var(--text)", outline: "none" }
const th:  React.CSSProperties = { padding: "7px 9px", fontSize: 10, fontWeight: 700, color: "var(--text3)", textTransform: "uppercase", letterSpacing: "0.4px", textAlign: "center", whiteSpace: "nowrap" }
const td:  React.CSSProperties = { padding: "5px 9px", textAlign: "center", color: "var(--text)", whiteSpace: "nowrap" }
