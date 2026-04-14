"use client"
import { useState, useEffect } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
    IndianRupee, Search, Loader2, CheckCircle2, Clock,
    FileText, ChevronDown, Printer, Users, Download
} from "lucide-react"

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]

type PayrollRecord = {
    id: string
    month: number
    year: number
    status: string
    basicSalary: number
    grossSalary: number
    totalDeductions: number
    netSalary: number
    workingDays: number
    presentDays: number
    otDays: number
    pfEmployee: number
    esiEmployee: number
    pt: number
    canteen: number
    penalty: number
    advance: number
    otherDeductions: number
    paidAt: string | null
    da: number
    hra: number
    washing: number
    bonus: number
    overtimePay: number
    pfEmployer: number
    esiEmployer: number
    ctc: number
    employee: {
        id: string
        employeeId: string
        firstName: string
        lastName: string
        designation: string
        branch: { name: string }
        department?: { name: string } | null
    }
}

export default function SalarySlipsPage() {
    const { data: session, status } = useSession()
    const router = useRouter()
    const [records, setRecords] = useState<PayrollRecord[]>([])
    const [loading, setLoading] = useState(true)
    const [month, setMonth] = useState(new Date().getMonth() + 1)
    const [year, setYear] = useState(new Date().getFullYear())
    const [search, setSearch] = useState("")
    const [selected, setSelected] = useState<PayrollRecord | null>(null)
    const [actionLoading, setActionLoading] = useState<string | null>(null)

    useEffect(() => {
        if (status === "unauthenticated") router.push("/login")
    }, [status, router])

    const fetchSlips = async () => {
        setLoading(true)
        setSelected(null)
        try {
            const res = await fetch(`/api/payroll?month=${month}&year=${year}`)
            if (res.ok) {
                const data = await res.json()
                setRecords(Array.isArray(data) ? data : [])
            }
        } catch { toast.error("Failed to load salary slips") }
        finally { setLoading(false) }
    }

    useEffect(() => { fetchSlips() }, [month, year])

    const handleMarkPaid = async (id: string) => {
        setActionLoading(id)
        try {
            const res = await fetch(`/api/payroll/${id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: "PAID" }),
            })
            if (res.ok) {
                toast.success("Marked as paid — salary slip now visible to employee")
                fetchSlips()
                setSelected(null)
            } else toast.error(await res.text())
        } catch { toast.error("Failed") }
        finally { setActionLoading(null) }
    }

    const filtered = records.filter(r => {
        if (!search) return true
        const name = `${r.employee.firstName} ${r.employee.lastName}`.toLowerCase()
        return name.includes(search.toLowerCase()) || r.employee.employeeId.toLowerCase().includes(search.toLowerCase())
    })

    const years = Array.from({ length: 4 }, (_, i) => new Date().getFullYear() - i)
    const paid = records.filter(r => r.status === "PAID").length
    const processed = records.filter(r => r.status === "PROCESSED").length
    const draft = records.filter(r => r.status === "DRAFT").length

    const printSlip = (p: PayrollRecord) => {
        const w = window.open("", "_blank")
        if (!w) return
        w.document.write(`
<!DOCTYPE html><html><head>
<title>Salary Slip - ${p.employee.firstName} ${p.employee.lastName} - ${MONTHS[p.month-1]} ${p.year}</title>
<style>
  body { font-family: Arial, sans-serif; margin: 0; padding: 20px; color: #1a1a18; font-size: 13px; }
  .header { background: #1a9e6e; color: white; padding: 20px 24px; border-radius: 10px 10px 0 0; display: flex; justify-content: space-between; align-items: center; }
  .header h1 { margin: 0; font-size: 20px; } .header p { margin: 2px 0; font-size: 11px; opacity: 0.85; }
  .net { text-align: center; padding: 16px; background: #e8f7f1; border-bottom: 1px solid #c6e8da; }
  .net span { font-size: 28px; font-weight: 800; color: #1a9e6e; }
  .body { border: 1px solid #e8e6e1; border-top: none; padding: 20px; border-radius: 0 0 10px 10px; }
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
  h3 { font-size: 11px; font-weight: 700; color: #6b6860; text-transform: uppercase; letter-spacing: 0.5px; margin: 0 0 12px 0; }
  .row { display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid #f3f4f6; }
  .total { font-weight: 700; border-top: 2px solid #e8e6e1 !important; border-bottom: none !important; margin-top: 4px; padding-top: 8px; }
  .att { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; background: #f9f8f5; padding: 14px; border-radius: 8px; text-align: center; margin-top: 16px; }
  .att p { margin: 0; } .att .v { font-size: 20px; font-weight: 800; }  .att .l { font-size: 10px; color: #6b6860; margin-top: 2px; }
  .footer { margin-top: 12px; padding-top: 10px; border-top: 1px solid #e8e6e1; display: flex; justify-content: space-between; font-size: 11px; color: #6b6860; }
  @media print { body { padding: 10px; } }
</style></head><body>
<div class="header">
  <div><h1>${p.employee.firstName} ${p.employee.lastName}</h1>
  <p>${p.employee.employeeId} · ${p.employee.designation ?? ""}</p>
  <p>${p.employee.branch?.name ?? ""}</p></div>
  <div style="text-align:right"><p style="font-size:13px;font-weight:700">Pay Period</p>
  <p style="font-size:17px;font-weight:800">${MONTHS[p.month-1]} ${p.year}</p>
  <p style="font-size:10px;margin-top:4px">Status: ${p.status}</p></div>
</div>
<div class="net"><p style="margin:0;font-size:11px;color:#666">Net Salary</p><span>₹${Math.round(p.netSalary).toLocaleString("en-IN")}</span></div>
<div class="body">
<div class="grid2">
  <div><h3>Earnings</h3>
    ${[["Basic Salary", p.basicSalary],["DA", p.da],["HRA", p.hra],["Washing", p.washing],["Bonus", p.bonus],["OT Pay", p.overtimePay]].filter(([,v])=>Number(v)>0).map(([l,v])=>`<div class="row"><span>${l}</span><span>₹${Math.round(Number(v)).toLocaleString("en-IN")}</span></div>`).join("")}
    <div class="row total"><span>Gross Earnings</span><span style="color:#1a9e6e">₹${Math.round(p.grossSalary).toLocaleString("en-IN")}</span></div>
  </div>
  <div><h3>Deductions</h3>
    ${[["PF (Employee)", p.pfEmployee],["ESIC", p.esiEmployee],["Professional Tax", p.pt],["Canteen", p.canteen],["Penalty", p.penalty],["Advance", p.advance],["Other", p.otherDeductions]].filter(([,v])=>Number(v)>0).map(([l,v])=>`<div class="row"><span>${l}</span><span style="color:#dc2626">-₹${Math.round(Number(v)).toLocaleString("en-IN")}</span></div>`).join("")}
    <div class="row total"><span>Total Deductions</span><span style="color:#dc2626">-₹${Math.round(p.totalDeductions).toLocaleString("en-IN")}</span></div>
  </div>
</div>
<div class="att">
  <div><p class="v">${p.workingDays}</p><p class="l">Working Days</p></div>
  <div><p class="v">${p.presentDays}</p><p class="l">Days Present</p></div>
  <div><p class="v">${p.workingDays - p.presentDays}</p><p class="l">LOP Days</p></div>
  <div><p class="v">${p.otDays}</p><p class="l">OT Days</p></div>
</div>
<div class="footer">
  <span>Employer PF: ₹${Math.round(p.pfEmployer).toLocaleString("en-IN")} &nbsp;|&nbsp; Employer ESIC: ₹${Math.round(p.esiEmployer).toLocaleString("en-IN")}</span>
  <span>CTC: ₹${Math.round(p.ctc).toLocaleString("en-IN")}</span>
</div>
</div>
<script>window.onload=()=>{window.print()}</script>
</body></html>`)
        w.document.close()
    }

    return (
        <div className="p-6 lg:p-7">
            <div className="mb-6">
                <h1 className="text-[22px] font-semibold tracking-tight text-[#1a1a18]">Salary Slips</h1>
                <p className="text-[13px] text-[#6b6860] mt-[3px]">Generate and manage monthly salary slips for all employees</p>
            </div>

            {/* Month / Year selector */}
            <div className="flex items-center gap-3 mb-5 flex-wrap">
                <select value={month} onChange={e => setMonth(Number(e.target.value))}
                    className="px-3 py-2 bg-white border border-[#e8e6e1] rounded-[9px] text-[13px] text-[#1a1a18] focus:outline-none focus:border-[#1a9e6e] appearance-none cursor-pointer">
                    {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                </select>
                <select value={year} onChange={e => setYear(Number(e.target.value))}
                    className="px-3 py-2 bg-white border border-[#e8e6e1] rounded-[9px] text-[13px] text-[#1a1a18] focus:outline-none focus:border-[#1a9e6e] appearance-none cursor-pointer">
                    {years.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
                <div className="h-8 w-px bg-[#e8e6e1]" />
                <div className="flex items-center gap-4 text-[13px]">
                    <span className="flex items-center gap-1.5 text-[#14532d] font-medium"><CheckCircle2 size={14} /> {paid} Credited</span>
                    <span className="flex items-center gap-1.5 text-[#1d4ed8] font-medium"><Clock size={14} /> {processed} Processed</span>
                    <span className="flex items-center gap-1.5 text-[#6b7280] font-medium"><FileText size={14} /> {draft} Draft</span>
                </div>
            </div>

            {/* Search */}
            <div className="relative max-w-[360px] mb-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-[14px] w-[14px] text-[#9e9b95]" />
                <input placeholder="Search employee…" value={search} onChange={e => setSearch(e.target.value)}
                    className="w-full pl-9 pr-4 py-[9px] bg-white border border-[#e8e6e1] rounded-[9px] text-[13px] placeholder:text-[#9e9b95] focus:outline-none focus:border-[#1a9e6e]" />
            </div>

            <div className="flex gap-5">
                {/* List */}
                <div className="flex-1 bg-white border border-[#e8e6e1] rounded-[14px] overflow-hidden">
                    <div className="grid grid-cols-[1fr_100px_120px_100px] px-5 py-2.5 bg-[#f9f8f5] border-b border-[#e8e6e1] text-[11px] font-semibold text-[#6b6860] uppercase tracking-wide">
                        <span>Employee</span><span>Net Salary</span><span>Status</span><span className="text-right">Action</span>
                    </div>
                    {loading ? (
                        <div className="flex justify-center py-16"><Loader2 className="animate-spin text-[#1a9e6e]" size={26} /></div>
                    ) : filtered.length === 0 ? (
                        <div className="flex flex-col items-center py-16 gap-3 text-[#9e9b95]">
                            <IndianRupee size={36} className="opacity-30" />
                            <p className="text-[13px]">No payroll records for {MONTHS[month-1]} {year}</p>
                            <p className="text-[12px]">Process payroll first from Attendance Upload</p>
                        </div>
                    ) : filtered.map((r, idx) => {
                        const statusColor = r.status === "PAID" ? "#14532d" : r.status === "PROCESSED" ? "#1d4ed8" : "#6b7280"
                        const statusBg = r.status === "PAID" ? "#dcfce7" : r.status === "PROCESSED" ? "#dbeafe" : "#f3f4f6"
                        return (
                            <div key={r.id}
                                onClick={() => setSelected(r)}
                                className={`grid grid-cols-[1fr_100px_120px_100px] items-center px-5 py-3.5 cursor-pointer transition-colors ${selected?.id === r.id ? "bg-[#f0fdf4]" : "hover:bg-[#f9f8f5]"} ${idx !== filtered.length - 1 ? "border-b border-[#e8e6e1]" : ""}`}
                            >
                                <div>
                                    <p className="text-[13px] font-medium text-[#1a1a18]">{r.employee.firstName} {r.employee.lastName}</p>
                                    <p className="text-[11px] text-[#9e9b95]">{r.employee.employeeId} · {r.employee.branch?.name}</p>
                                </div>
                                <span className="text-[13px] font-semibold text-[#1a1a18]">₹{Math.round(r.netSalary).toLocaleString("en-IN")}</span>
                                <span className="inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-full w-fit"
                                    style={{ color: statusColor, background: statusBg }}>
                                    {r.status}
                                </span>
                                <div className="flex justify-end gap-1">
                                    <button onClick={e => { e.stopPropagation(); printSlip(r) }}
                                        className="h-7 w-7 rounded-[6px] bg-[#f9f8f5] border border-[#e8e6e1] flex items-center justify-center hover:bg-[#e8f7f1] text-[#6b6860] hover:text-[#1a9e6e] transition-colors"
                                        title="Print Slip"><Printer size={13} /></button>
                                </div>
                            </div>
                        )
                    })}
                </div>

                {/* Slip Preview Panel */}
                {selected && (
                    <div className="w-[340px] shrink-0 bg-white border border-[#e8e6e1] rounded-[14px] overflow-hidden h-fit sticky top-6">
                        <div className="bg-[#1a9e6e] text-white px-5 py-4">
                            <div className="flex items-start justify-between">
                                <div>
                                    <p className="text-[15px] font-bold">{selected.employee.firstName} {selected.employee.lastName}</p>
                                    <p className="text-[11px] opacity-80 mt-0.5">{selected.employee.employeeId} · {selected.employee.designation}</p>
                                </div>
                                <button onClick={() => setSelected(null)} className="text-white/70 hover:text-white text-lg">✕</button>
                            </div>
                            <div className="mt-3 text-center">
                                <p className="text-[11px] opacity-80">Net Salary — {MONTHS[selected.month-1]} {selected.year}</p>
                                <p className="text-[28px] font-bold">₹{Math.round(selected.netSalary).toLocaleString("en-IN")}</p>
                            </div>
                        </div>

                        <div className="p-4 space-y-3 text-[12px]">
                            <div>
                                <p className="text-[10.5px] font-semibold text-[#6b6860] uppercase tracking-wide mb-2">Earnings</p>
                                {[["Basic", selected.basicSalary],["DA", selected.da],["HRA", selected.hra],["Bonus", selected.bonus],["OT Pay", selected.overtimePay]]
                                    .filter(([,v])=>Number(v)>0).map(([l,v])=>(
                                    <div key={l as string} className="flex justify-between py-1 border-b border-[#f3f4f6]">
                                        <span className="text-[#6b6860]">{l}</span>
                                        <span className="font-medium">₹{Math.round(Number(v)).toLocaleString("en-IN")}</span>
                                    </div>
                                ))}
                                <div className="flex justify-between pt-2 font-semibold">
                                    <span>Gross</span><span className="text-[#1a9e6e]">₹{Math.round(selected.grossSalary).toLocaleString("en-IN")}</span>
                                </div>
                            </div>
                            <div>
                                <p className="text-[10.5px] font-semibold text-[#6b6860] uppercase tracking-wide mb-2">Deductions</p>
                                {[["PF", selected.pfEmployee],["ESIC", selected.esiEmployee],["PT", selected.pt],["Canteen", selected.canteen],["Penalty", selected.penalty],["Advance", selected.advance]]
                                    .filter(([,v])=>Number(v)>0).map(([l,v])=>(
                                    <div key={l as string} className="flex justify-between py-1 border-b border-[#f3f4f6]">
                                        <span className="text-[#6b6860]">{l}</span>
                                        <span className="text-red-600">-₹{Math.round(Number(v)).toLocaleString("en-IN")}</span>
                                    </div>
                                ))}
                                <div className="flex justify-between pt-2 font-semibold">
                                    <span>Total Deductions</span><span className="text-red-600">-₹{Math.round(selected.totalDeductions).toLocaleString("en-IN")}</span>
                                </div>
                            </div>
                            <div className="grid grid-cols-4 gap-2 bg-[#f9f8f5] rounded-lg p-3 text-center">
                                {[["Days",selected.workingDays],["Present",selected.presentDays],["LOP",selected.workingDays-selected.presentDays],["OT",selected.otDays]].map(([l,v])=>(
                                    <div key={l as string}><p className="text-[14px] font-bold text-[#1a1a18]">{v}</p><p className="text-[9.5px] text-[#6b6860]">{l}</p></div>
                                ))}
                            </div>
                        </div>

                        <div className="px-4 pb-4 flex gap-2">
                            <button onClick={() => printSlip(selected)}
                                className="flex-1 flex items-center justify-center gap-1.5 py-2 border border-[#e8e6e1] rounded-[8px] text-[12px] font-medium text-[#6b6860] hover:bg-[#f9f8f5] transition-colors">
                                <Printer size={13} /> Print
                            </button>
                            {selected.status !== "PAID" && (
                                <button
                                    onClick={() => handleMarkPaid(selected.id)}
                                    disabled={!!actionLoading}
                                    className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-[#1a9e6e] text-white rounded-[8px] text-[12px] font-semibold hover:bg-[#158a5e] transition-colors disabled:opacity-60">
                                    {actionLoading === selected.id ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                                    Mark as Credited
                                </button>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
