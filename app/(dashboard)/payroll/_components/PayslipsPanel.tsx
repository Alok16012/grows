"use client"
import { payrollYears, payrollMonths, currentPayrollMonth, currentPayrollYear } from "./payroll-years"
import { useState, useEffect, useCallback } from "react"
import { useSession } from "next-auth/react"
import { toast } from "sonner"
import { can } from "@/lib/can"
import { Loader2, Search, Printer, Eye, CheckCircle2, RefreshCw, MapPin, Building2, Clock, FileText, IndianRupee, X, Send, CheckCheck } from "lucide-react"
import { printHTML } from "@/lib/print-html"
import { slipPageHTML } from "@/lib/payslip-html"
import PayslipViewerModal from "./PayslipViewerModal"
import { SendPayslipsPanel } from "@/components/payroll/SendPayslipsPanel"

const MONTHS_LONG = ["January","February","March","April","May","June","July","August","September","October","November","December"]


type Site = { id: string; name: string; code?: string }
type SiteStatus = { siteId: string|null; processedCount: number }
type PayrollRecord = {
    id: string; month: number; year: number; status: string
    basicSalary: number; da: number; hra: number; washing: number; conveyance: number
    lwwEarned: number; bonus: number; overtimePay: number; grossSalary: number
    allowances: number; productionIncentive: number; tds: number
    pfEmployee: number; esiEmployee: number; pt: number; lwf: number
    canteen: number; penalty: number; advance: number; otherDeductions: number
    totalDeductions: number; netSalary: number
    /** Approved arrears from earlier months paid with this payroll (included in netSalary). */
    arrears?: number
    /** Expense claims paid with this salary (included in netSalary, not in gross). */
    reimbursement?: number
    workingDays: number|null; presentDays: number|null; overtimeHrs?: number
    pfEmployer: number; esiEmployer: number; ctc?: number
    employee: {
        id: string; employeeId: string; firstName: string; lastName: string; designation: string|null
        uan?: string|null; pfNumber?: string|null; esiNumber?: string|null
        dateOfBirth?: string|null; dateOfJoining?: string|null
        deployments?: {site:{name:string}}[]
    }
}

const lbl: React.CSSProperties = { fontSize:11, fontWeight:700, color:"var(--text3)", whiteSpace:"nowrap" }
const sel: React.CSSProperties = { padding:"6px 10px", borderRadius:7, border:"1px solid var(--border)", fontSize:12, background:"var(--surface)", color:"var(--text)", outline:"none" }

// `latest`: the newest created month; the pickers stop there (see lib/payroll-period).
export default function PayslipsPanel({ onClose, initialMonth, initialYear, latest }: { onClose: () => void; initialMonth?: number; initialYear?: number; latest?: { month: number; year: number } }) {
    const { data: session } = useSession()
    const canManage = can(session, "payroll.edit")

    // The hub passes the history row's month/year so "Slips" on August opens August.
    const [month,    setMonth]    = useState(initialMonth ?? currentPayrollMonth())
    const [year,     setYear]     = useState(initialYear  ?? currentPayrollYear())
    const [sites,    setSites]    = useState<Site[]>([])
    const [status,   setStatus]   = useState<SiteStatus[]>([])
    const [selSiteId,setSelSiteId]= useState("")
    const [records,  setRecords]  = useState<PayrollRecord[]>([])
    const [search,   setSearch]   = useState("")
    const [selected, setSelected] = useState<PayrollRecord|null>(null)
    // The slip open in the full preview. Separate from `selected`, which
    // drives the summary card beside the list.
    const [viewing,  setViewing]  = useState<PayrollRecord|null>(null)
    const [ldSites,  setLdSites]  = useState(true)
    // Payslips to employees: who can already see their payslip, and a Send per payslip.
    const canSend = can(session, ["payroll.edit", "payroll.markPaid", "payroll.lock"])
    const [sendInfo, setSendInfo] = useState<Map<string, { visible: boolean; sentBy: string | null }>>(new Map())
    const [sending,  setSending]  = useState<string | null>(null)
    const [sendTick, setSendTick] = useState(0)
    const [barKey,   setBarKey]   = useState(0)   // reload the send bar after a send from a row
    const [loading,  setLoading]  = useState(false)
    const [actLoad,  setActLoad]  = useState<string|null>(null)

    useEffect(()=>{ fetch("/api/sites?isActive=true").then(r=>r.json()).then(d=>{if(Array.isArray(d))setSites(d)}).finally(()=>setLdSites(false)) },[])

    const fetchStatus = useCallback(async ()=>{
        try { const r=await fetch(`/api/payroll/sites-status?month=${month}&year=${year}`); if(r.ok){const d=await r.json();if(Array.isArray(d))setStatus(d)} } catch {}
    },[month,year])

    useEffect(()=>{ fetchStatus() },[fetchStatus])

    const fetchSlips = useCallback(async (siteId: string)=>{
        setLoading(true); setRecords([]); setSelected(null); setViewing(null)
        try {
            const url=siteId?`/api/payroll?siteId=${siteId}&month=${month}&year=${year}`:`/api/payroll?month=${month}&year=${year}`
            const r=await fetch(url)
            if (!r.ok) throw new Error(await r.text())
            const d=await r.json(); setRecords(Array.isArray(d)?d:[])
        } catch(e: unknown) { toast.error(e instanceof Error?e.message:"Failed") }
        finally { setLoading(false) }
    },[month,year])

    const selectSite = (id: string) => { setSelSiteId(id); setSearch(""); setSelected(null); fetchSlips(id) }

    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(()=>{ fetchSlips(selSiteId) },[month,year])
    useEffect(() => {
        fetch(`/api/payroll/payslips/send?month=${month}&year=${year}&employees=1`).then(r => r.ok ? r.json() : null)
            .then(j => setSendInfo(new Map((j?.employees ?? []).map((e: any) => [e.employeeId, { visible: e.visible, sentBy: e.sentBy }])))).catch(() => {})
    }, [month, year, sendTick])
    async function sendOne(r: PayrollRecord) {
        if (r.status === "DRAFT") { toast.error("This payslip is still a draft — lock payroll first, then send it."); return }
        if (!confirm(`Send the ${MONTHS_LONG[r.month - 1]} ${r.year} payslip to ${r.employee.firstName} ${r.employee.lastName}? It appears in their My Profile → Payslips and in the app.`)) return
        setSending(r.id)
        try {
            const res = await fetch("/api/payroll/payslips/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "sendEmployees", month: r.month, year: r.year, employeeIds: [r.employee.id] }) })
            const j = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(j?.error || "Could not send")
            toast.success(`Payslip sent to ${r.employee.firstName}`); setSendTick(t => t + 1); setBarKey(k => k + 1)
        } catch (e: any) { toast.error(e.message) } finally { setSending(null) }
    }
    const SendBtn = ({ r, big }: { r: PayrollRecord; big?: boolean }) => {
        const info = sendInfo.get(r.employee.id)
        if (info?.visible) return big
            ? <span style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "8px", borderRadius: 8, fontSize: 12, fontWeight: 600, color: "#15803d", background: "#dcfce7" }}><CheckCheck size={13} /> Sent</span>
            : <span title={info.sentBy === "auto" ? "Employee can see it (automatic)" : "Sent — employee can see it"} style={{ width: 28, height: 28, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", color: "#15803d", background: "#dcfce7" }}><CheckCheck size={13} /></span>
        if (!canSend) return null
        const draft = r.status === "DRAFT"
        return big
            ? <button onClick={() => sendOne(r)} disabled={sending === r.id} title={draft ? "Draft — lock payroll first" : "Send this payslip to the employee"} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "8px", border: "none", borderRadius: 8, fontSize: 12, fontWeight: 600, color: "#fff", cursor: "pointer", background: draft ? "#94a3b8" : "var(--accent)" }}>{sending === r.id ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />} Send</button>
            : <button onClick={e => { e.stopPropagation(); sendOne(r) }} disabled={sending === r.id} title={draft ? "Draft — lock payroll first" : "Send this payslip to the employee"} style={{ width: 28, height: 28, borderRadius: 6, border: "1px solid var(--border)", background: draft ? "var(--surface2)" : "var(--accent-light)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: draft ? "var(--text3)" : "var(--accent)", opacity: draft ? 0.6 : 1 }}>{sending === r.id ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}</button>
    }

    const handleMarkPaid = async (id: string)=>{
        setActLoad(id)
        try {
            const r=await fetch(`/api/payroll/${id}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({status:"PAID"})})
            if (!r.ok) throw new Error(await r.text())
            toast.success("Marked as credited"); fetchSlips(selSiteId); setSelected(null)
        } catch(e: unknown) { toast.error(e instanceof Error?e.message:"Failed") }
        finally { setActLoad(null) }
    }



    const printSlip = (p: PayrollRecord) => printHTML(slipPageHTML([p]))
    const printAllSlips = () => { if(filtered.length) printHTML(slipPageHTML(filtered)) }

    const filtered  = records.filter(r=>!search||`${r.employee.firstName} ${r.employee.lastName} ${r.employee.employeeId}`.toLowerCase().includes(search.toLowerCase()))
    const getSt     = (id: string) => status.find(s=>s.siteId===id)
    const paid      = records.filter(r=>r.status==="PAID").length
    const processed = records.filter(r=>r.status==="PROCESSED").length
    const draft     = records.filter(r=>r.status==="DRAFT").length
    const done      = status.filter(s=>(s.processedCount??0)>0).length

    return (
        <div style={{ display:"flex", flexDirection:"column", gap:12, paddingBottom:32 }}>
            {/* Panel Header */}
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:10, padding:"14px 20px", background:"var(--surface)", border:"1px solid var(--border)", borderRadius:12 }}>
                <div>
                    <p style={{ fontSize:16, fontWeight:800, color:"var(--text)", margin:0 }}>Payslip Generation</p>
                    <div style={{ display:"flex", alignItems:"center", gap:12, fontSize:11, marginTop:4, flexWrap:"wrap" }}>
                        <span style={{ display:"flex", alignItems:"center", gap:4, color:"#15803d" }}><CheckCircle2 size={12}/> {paid} Credited</span>
                        <span style={{ display:"flex", alignItems:"center", gap:4, color:"#2f5be0" }}><Clock size={12}/> {processed} Ready</span>
                        <span style={{ display:"flex", alignItems:"center", gap:4, color:"var(--text3)" }}><FileText size={12}/> {draft} Draft</span>
                    </div>
                </div>
                <button onClick={onClose} style={{ width:32, height:32, borderRadius:8, border:"1px solid var(--border)", background:"var(--surface2)", display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", color:"var(--text3)" }}>
                    <X size={16} />
                </button>
            </div>

            {/* Month/Year */}
            <div style={{ display:"flex", alignItems:"center", gap:10, flexWrap:"wrap", background:"var(--surface)", border:"1px solid var(--border)", borderRadius:10, padding:"11px 16px" }}>
                <span style={lbl}>Month</span>
                <select value={month} onChange={e=>setMonth(Number(e.target.value))} style={sel}>
                    {payrollMonths(year, latest).map(m=><option key={m} value={m}>{MONTHS_LONG[m-1]}</option>)}
                </select>
                <span style={lbl}>Year</span>
                <select value={year} onChange={e=>{const y=Number(e.target.value);setYear(y);if(!payrollMonths(y,latest).includes(month))setMonth(latest!.month)}} style={sel}>
                    {payrollYears(latest).map(y=><option key={y} value={y}>{y}</option>)}
                </select>
                <button onClick={()=>fetchSlips(selSiteId)} style={{ marginLeft:"auto", display:"flex", padding:"4px 8px", borderRadius:6, border:"1px solid var(--border)", background:"none", cursor:"pointer" }}>
                    <RefreshCw size={12} style={{ color:"var(--text3)" }} />
                </button>
            </div>

            {/* Send payslips to employees — whole site or chosen employees; ⚙ manual / automatic. */}
            <SendPayslipsPanel key={`send-${barKey}`} month={month} year={year} focusSiteId={selSiteId || undefined} onSent={() => setSendTick(t => t + 1)} />

            {/* Two-panel — the site rail stacks above the list on mobile */}
            <div className="flex flex-col md:flex-row items-stretch md:items-start" style={{ gap:12 }}>
                {/* LEFT: Site list */}
                <div className="w-full md:w-[220px] md:shrink-0" style={{ background:"var(--surface)", border:"1px solid var(--border)", borderRadius:12, overflow:"hidden" }}>
                    <div style={{ padding:"11px 14px", borderBottom:"1px solid var(--border)", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                        <span style={{ fontSize:12, fontWeight:700, color:"var(--text2)" }}>Filter by Site</span>
                    </div>
                    <div style={{ overflowY:"auto", maxHeight:480 }}>
                        {ldSites ? <div style={{ padding:20, textAlign:"center" }}><Loader2 size={14} className="animate-spin" style={{ color:"var(--accent)", margin:"0 auto" }} /></div> : (
                            <>
                                <div onClick={()=>selectSite("")}
                                    style={{ padding:"10px 14px", cursor:"pointer", borderBottom:"1px solid var(--border)", background:!selSiteId?"var(--accent-light)":"transparent", borderLeft:!selSiteId?"3px solid var(--accent)":"3px solid transparent" }}>
                                    <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                                        <Building2 size={12} style={{ color:!selSiteId?"var(--accent)":"var(--text3)" }} />
                                        <span style={{ fontSize:12, fontWeight:700, color:!selSiteId?"var(--accent)":"var(--text2)" }}>All Sites</span>
                                    </div>
                                    <div style={{ fontSize:10, color:"var(--text3)", marginTop:2, marginLeft:18 }}>{done}/{sites.length} processed</div>
                                </div>
                                {sites.map(site=>{
                                    const st=getSt(site.id); const isDone=(st?.processedCount??0)>0; const isSel=selSiteId===site.id
                                    return (
                                        <div key={site.id} onClick={()=>selectSite(site.id)}
                                            style={{ padding:"10px 14px", cursor:"pointer", borderBottom:"1px solid var(--border)", background:isSel?"var(--accent-light)":"transparent", borderLeft:isSel?"3px solid var(--accent)":"3px solid transparent" }}>
                                            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                                                <div style={{ display:"flex", alignItems:"center", gap:6, minWidth:0 }}>
                                                    <MapPin size={11} style={{ color:isSel?"var(--accent)":"var(--text3)", flexShrink:0 }} />
                                                    <span style={{ fontSize:11, fontWeight:600, color:isSel?"var(--accent)":"var(--text)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{site.name}</span>
                                                </div>
                                                {isDone && <span style={{ fontSize:9, color:"#16a34a", fontWeight:700, flexShrink:0 }}>✓</span>}
                                            </div>
                                        </div>
                                    )
                                })}
                            </>
                        )}
                    </div>
                </div>

                {/* RIGHT: Employee list + slip preview */}
                <div className="flex flex-col lg:flex-row items-stretch lg:items-start" style={{ flex:1, minWidth:0, gap:12 }}>
                    <div style={{ flex:1, minWidth:0, background:"var(--surface)", border:"1px solid var(--border)", borderRadius:12, overflow:"hidden" }}>
                        <div style={{ padding:"10px 14px", borderBottom:"1px solid var(--border)", display:"flex", alignItems:"center", gap:8 }}>
                            <Search size={13} style={{ color:"var(--text3)", flexShrink:0 }} />
                            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search employee…"
                                style={{ flex:1, border:"none", outline:"none", fontSize:12, background:"transparent", color:"var(--text)" }} />
                            <span style={{ fontSize:11, color:"var(--text3)", whiteSpace:"nowrap" }}>{filtered.length}</span>
                            {filtered.length>0 && (
                                <button onClick={printAllSlips}
                                    style={{ display:"flex", alignItems:"center", gap:5, padding:"4px 10px", borderRadius:6, border:"none", background:"#6d4fe0", color:"#fff", fontSize:11, fontWeight:700, cursor:"pointer", whiteSpace:"nowrap" }}>
                                    <Printer size={11} /> Print All ({filtered.length})
                                </button>
                            )}
                        </div>
                        {/* Narrower fixed columns on phones so the employee
                            name still gets usable width. */}
                        <div className="grid grid-cols-[1fr_72px_70px_104px] sm:grid-cols-[1fr_90px_100px_110px]" style={{ padding:"8px 16px", background:"var(--surface2)", borderBottom:"1px solid var(--border)" }}>
                            {["Employee","Net Salary","Status","Actions"].map(h=>(
                                <span key={h} style={{ fontSize:10, fontWeight:700, color:"var(--text3)", textTransform:"uppercase", letterSpacing:"0.5px" }}>{h}</span>
                            ))}
                        </div>
                        <div style={{ overflowY:"auto", maxHeight:500 }}>
                            {loading ? (
                                <div style={{ display:"flex", justifyContent:"center", padding:"40px 0" }}>
                                    <Loader2 size={20} className="animate-spin" style={{ color:"var(--accent)" }} />
                                </div>
                            ) : filtered.length===0 ? (
                                <div style={{ display:"flex", flexDirection:"column", alignItems:"center", padding:"40px 16px", gap:8, color:"var(--text3)" }}>
                                    <IndianRupee size={32} style={{ opacity:0.2 }} />
                                    <p style={{ fontSize:13, margin:0 }}>No payroll records for {MONTHS_LONG[month-1]} {year}</p>
                                    <p style={{ fontSize:11, margin:0 }}>Process payroll first</p>
                                </div>
                            ) : filtered.map((r,idx)=>{
                                const statusColor=r.status==="PAID"?"#15803d":r.status==="PROCESSED"?"#2f5be0":"#555c72"
                                const statusBg=r.status==="PAID"?"#dcfce7":r.status==="PROCESSED"?"#e3ebff":"#f6f7fc"
                                return (
                                    <div key={r.id} onClick={()=>setSelected(r)}
                                        className="grid grid-cols-[1fr_72px_70px_104px] sm:grid-cols-[1fr_90px_100px_110px]"
                                        style={{ alignItems:"center", padding:"10px 16px", cursor:"pointer",
                                            background:selected?.id===r.id?"#f0fdf4":idx%2===0?"var(--surface)":"var(--surface2)", borderBottom:"1px solid var(--border)" }}>
                                        <div>
                                            <p style={{ fontSize:13, fontWeight:600, color:"var(--text)", margin:0 }}>{r.employee.firstName} {r.employee.lastName}</p>
                                            <p style={{ fontSize:10, color:"var(--text3)", margin:"1px 0 0 0" }}>{r.employee.employeeId} · {r.employee.deployments?.[0]?.site?.name||"—"}</p>
                                        </div>
                                        <span style={{ fontSize:13, fontWeight:600, color:"var(--text)" }}>₹{Math.round(r.netSalary).toLocaleString("en-IN")}</span>
                                        <span style={{ padding:"2px 7px", borderRadius:20, fontSize:9, fontWeight:700, width:"fit-content", color:statusColor, background:statusBg }}>{r.status}</span>
                                        <div style={{ display:"flex", justifyContent:"flex-end", gap:6 }}>
                                            <button onClick={e=>{e.stopPropagation();setSelected(r);setViewing(r)}} title="View payslip"
                                                style={{ width:28, height:28, borderRadius:6, border:"1px solid var(--border)", background:"var(--surface2)", display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", color:"var(--text3)" }}>
                                                <Eye size={12} />
                                            </button>
                                            <button onClick={e=>{e.stopPropagation();printSlip(r)}} title="Print payslip"
                                                style={{ width:28, height:28, borderRadius:6, border:"1px solid var(--border)", background:"var(--surface2)", display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", color:"var(--text3)" }}>
                                                <Printer size={12} />
                                            </button>
                                            <SendBtn r={r} />
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </div>

                    {/* Slip Preview */}
                    {selected && (
                        <div className="w-full lg:w-[310px] lg:shrink-0" style={{ background:"var(--surface)", border:"1px solid var(--border)", borderRadius:12, overflow:"hidden", alignSelf:"flex-start", position:"sticky", top:16 }}>
                            <div style={{ background:"#3d6ff5", color:"#fff", padding:"14px 16px" }}>
                                <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between" }}>
                                    <div>
                                        <p style={{ fontSize:14, fontWeight:700, margin:0 }}>{selected.employee.firstName} {selected.employee.lastName}</p>
                                        <p style={{ fontSize:11, opacity:0.8, margin:"2px 0 0 0" }}>{selected.employee.employeeId} · {selected.employee.designation}</p>
                                    </div>
                                    <button onClick={()=>setSelected(null)} style={{ background:"none", border:"none", color:"rgba(255,255,255,0.7)", cursor:"pointer", fontSize:16 }}>✕</button>
                                </div>
                                <div style={{ textAlign:"center", marginTop:12 }}>
                                    <p style={{ fontSize:11, opacity:0.8, margin:0 }}>Net Salary — {MONTHS_LONG[selected.month-1]} {selected.year}</p>
                                    <p style={{ fontSize:26, fontWeight:800, margin:"2px 0 0 0" }}>₹{Math.round(selected.netSalary).toLocaleString("en-IN")}</p>
                                </div>
                            </div>
                            <div style={{ padding:"14px 16px", display:"flex", flexDirection:"column", gap:12, fontSize:12 }}>
                                <div>
                                    <p style={{ fontSize:10, fontWeight:700, color:"var(--text3)", textTransform:"uppercase", letterSpacing:"0.5px", margin:"0 0 8px 0" }}>Earnings</p>
                                    {[["Basic",selected.basicSalary],["DA",selected.da],["Washing",selected.washing],["Conveyance",selected.conveyance],["OT Pay",selected.overtimePay]]
                                        .filter(([,v])=>Number(v)>0).map(([l,v])=>(
                                        <div key={l as string} style={{ display:"flex", justifyContent:"space-between", padding:"3px 0", borderBottom:"1px solid var(--border)" }}>
                                            <span style={{ color:"var(--text3)" }}>{l}</span>
                                            <span style={{ fontWeight:600 }}>₹{Math.round(Number(v)).toLocaleString("en-IN")}</span>
                                        </div>
                                    ))}
                                    <div style={{ display:"flex", justifyContent:"space-between", paddingTop:6, fontWeight:700 }}>
                                        <span>Gross</span><span style={{ color:"#3d6ff5" }}>₹{Math.round(selected.grossSalary).toLocaleString("en-IN")}</span>
                                    </div>
                                </div>
                                <div>
                                    <p style={{ fontSize:10, fontWeight:700, color:"var(--text3)", textTransform:"uppercase", letterSpacing:"0.5px", margin:"0 0 8px 0" }}>Deductions</p>
                                    {[["PF",selected.pfEmployee],["ESIC",selected.esiEmployee],["PT",selected.pt],["Canteen",selected.canteen],["Penalty",selected.penalty],["Advance",selected.advance]]
                                        .filter(([,v])=>Number(v)>0).map(([l,v])=>(
                                        <div key={l as string} style={{ display:"flex", justifyContent:"space-between", padding:"3px 0", borderBottom:"1px solid var(--border)" }}>
                                            <span style={{ color:"var(--text3)" }}>{l}</span>
                                            <span style={{ color:"#dc2626" }}>-₹{Math.round(Number(v)).toLocaleString("en-IN")}</span>
                                        </div>
                                    ))}
                                    <div style={{ display:"flex", justifyContent:"space-between", paddingTop:6, fontWeight:700 }}>
                                        <span>Total Deductions</span><span style={{ color:"#dc2626" }}>-₹{Math.round(selected.totalDeductions).toLocaleString("en-IN")}</span>
                                    </div>
                                </div>
                                <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(150px, 1fr))", gap:8, background:"var(--surface2)", borderRadius:8, padding:"10px", textAlign:"center" }}>
                                    {[["Days",selected.workingDays??0],["Present",selected.presentDays??0],["LOP",(selected.workingDays??0)-(selected.presentDays??0)],["OT Hrs",selected.overtimeHrs??0]]
                                        .map(([l,v])=>(
                                        <div key={l as string}>
                                            <p style={{ fontSize:14, fontWeight:800, color:"var(--text)", margin:0 }}>{v}</p>
                                            <p style={{ fontSize:9, color:"var(--text3)", margin:"2px 0 0 0" }}>{l}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <div style={{ padding:"0 16px 14px", display:"flex", gap:8, flexWrap:"wrap" }}>
                                <button onClick={()=>setViewing(selected)}
                                    style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", gap:6, padding:"8px", border:"1px solid var(--border)", borderRadius:8, fontSize:12, fontWeight:600, color:"var(--text2)", cursor:"pointer", background:"none" }}>
                                    <Eye size={13} /> View
                                </button>
                                <button onClick={()=>printSlip(selected)}
                                    style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", gap:6, padding:"8px", border:"1px solid var(--border)", borderRadius:8, fontSize:12, fontWeight:600, color:"var(--text2)", cursor:"pointer", background:"none" }}>
                                    <Printer size={13} /> Print
                                </button>
                                <SendBtn r={selected} big />
                                {selected.status!=="PAID" && (
                                    <button onClick={()=>handleMarkPaid(selected.id)} disabled={!!actLoad || !canManage} title={canManage ? undefined : "Requires payroll manage permission"}
                                        style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", gap:6, padding:"8px", border:"none", borderRadius:8, fontSize:12, fontWeight:600, color:"#fff", cursor:"pointer", background:"#16a34a", opacity:actLoad?0.6:1 }}>
                                        {actLoad===selected.id ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
                                        Mark Credited
                                    </button>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {viewing && (
                <PayslipViewerModal
                    title={`${viewing.employee.firstName} ${viewing.employee.lastName} — ${MONTHS_LONG[viewing.month-1]} ${viewing.year}`}
                    html={slipPageHTML([viewing], false)}
                    onPrint={()=>printSlip(viewing)}
                    onClose={()=>setViewing(null)}
                />
            )}
        </div>
    )
}
