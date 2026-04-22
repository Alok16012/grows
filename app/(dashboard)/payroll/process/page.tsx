"use client"

import { useState, useEffect, useCallback } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { 
    Loader2, ArrowLeft, Search, Filter, 
    Download, FileSpreadsheet, Play, 
    RefreshCw, Eye, CheckCircle2, AlertCircle,
    ChevronRight, Wallet, ClipboardList,
    FileText, ShieldCheck, Lock, Users
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"

const STEPS = [
    { id: 1, name: "Attendance Upload", icon: ClipboardList },
    { id: 2, name: "Process Payroll", icon: Play },
    { id: 3, name: "Site Wise Wage Sheet", icon: FileSpreadsheet },
    { id: 4, name: "Select Sites (Multi Select)", icon: Wallet },
    { id: 5, name: "Final Payroll Preview", icon: Eye },
    { id: 6, name: "Compliance Reports", icon: ShieldCheck },
    { id: 7, name: "Final Save / Lock", icon: Lock },
]

export default function ProcessPayrollPage() {
    const { data: session } = useSession()
    const router = useRouter()
    
    // --- State ---
    const [month, setMonth] = useState(String(new Date().getMonth() + 1))
    const [year, setYear] = useState(String(new Date().getFullYear()))
    const [siteId, setSiteId] = useState("")
    const [sites, setSites] = useState<any[]>([])
    const [employees, setEmployees] = useState<any[]>([])
    const [salaryStructure, setSalaryStructure] = useState("All")
    const [loading, setLoading] = useState(false)
    const [processing, setProcessing] = useState(false)
    const [search, setSearch] = useState("")

    // --- Fetch Sites ---
    useEffect(() => {
        const fetchSites = async () => {
            try {
                const res = await fetch("/api/sites?isActive=true")
                if (res.ok) {
                    const data = await res.json()
                    setSites(data)
                    if (data.length > 0) setSiteId(data[0].id)
                }
            } catch (err) {
                console.error("Failed to fetch sites", err)
            }
        }
        fetchSites()
    }, [])

    // --- Fetch Employees & Preview Calculation ---
    const fetchData = async () => {
        if (!siteId) {
            toast.error("Please select a site")
            return
        }
        setLoading(true)
        try {
            // First fetch employees for the site to show the list
            const empRes = await fetch(`/api/employees?siteId=${siteId}&status=ACTIVE`)
            if (empRes.ok) {
                const empData = await empRes.json()
                setEmployees(empData)
            }
        } catch (err) {
            toast.error("Failed to fetch data")
        } finally {
            setLoading(false)
        }
    }

    const handleProcess = async () => {
        if (!siteId || employees.length === 0) {
            toast.error("No employees to process")
            return
        }
        setProcessing(true)
        try {
            const res = await fetch("/api/payroll/calculate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    branchId: siteId, // Site ID used as site identifier
                    month: parseInt(month),
                    year: parseInt(year),
                    attendance: [] // In real scenario, this would be empty or mapped from attendance records
                })
            })
            if (res.ok) {
                toast.success(`Payroll processed for ${employees.length} employees!`)
            } else {
                toast.error("Failed to process payroll")
            }
        } catch (err) {
            toast.error("Process failed")
        } finally {
            setProcessing(false)
        }
    }

    return (
        <div className="space-y-6 max-w-screen-2xl mx-auto pb-12">
            {/* Header */}
            <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2 text-[10.5px] text-[var(--text3)] uppercase tracking-[0.8px] font-bold">
                    <span>Payroll</span>
                    <ChevronRight size={12} className="text-[var(--text3)] opacity-40" />
                    <span>Process Payroll</span>
                </div>
                <h1 className="text-[22px] font-extrabold tracking-tight text-[var(--text)] mt-1">Process Payroll (Site Wise)</h1>
                <p className="text-[13.5px] text-[var(--text3)] font-medium">Process payroll for each site based on uploaded attendance and salary structure.</p>
            </div>

            {/* Stepper */}
            <div className="bg-white border border-[var(--border)] rounded-2xl p-5 shadow-sm">
                <div className="flex items-center justify-between gap-2 overflow-x-auto no-scrollbar">
                    {STEPS.map((s, idx) => {
                        const Icon = s.icon
                        const isActive = s.id === 2
                        return (
                            <div key={s.id} className="flex items-center gap-2 shrink-0">
                                <div className={`flex items-center gap-3 px-4 py-2.5 rounded-xl border transition-all ${isActive ? "bg-[var(--accent-light)] border-[var(--accent)]/20 text-[var(--accent-text)] font-bold shadow-sm" : "border-transparent text-[var(--text3)] hover:bg-[var(--surface2)]"}`}>
                                    <div className={`h-7 w-7 rounded-lg flex items-center justify-center border text-[11px] ${isActive ? "bg-[var(--accent)] border-[var(--accent)] text-white" : "border-[var(--border)] bg-white"}`}>
                                        <Icon size={14} />
                                    </div>
                                    <span className="text-[13px] whitespace-nowrap">{s.id}. {s.name}</span>
                                </div>
                                {idx < STEPS.length - 1 && <ChevronRight size={14} className="text-[var(--text3)] opacity-20 mx-1" />}
                            </div>
                        )
                    })}
                </div>
            </div>

            {/* Selection & Stats */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Selection Form */}
                <div className="lg:col-span-2 bg-white border border-[var(--border)] rounded-2xl p-7 shadow-sm flex flex-col gap-7">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                        <div>
                            <label className="text-[10.5px] font-bold text-[var(--text3)] uppercase tracking-[0.4px] mb-2 block">Month/Year <span className="text-red-500">*</span></label>
                            <div className="flex gap-2">
                                <select value={month} onChange={(e) => setMonth(e.target.value)} className="flex-1 h-10 border border-[var(--border)] rounded-xl px-3 text-[13px] font-medium outline-none focus:border-[var(--accent)] bg-white shadow-sm transition-all">
                                    {Array.from({ length: 12 }, (_, i) => (
                                        <option key={i+1} value={i+1}>{new Date(2000, i).toLocaleString('default', { month: 'long' })}</option>
                                    ))}
                                </select>
                                <select value={year} onChange={(e) => setYear(e.target.value)} className="w-[100px] h-10 border border-[var(--border)] rounded-xl px-3 text-[13px] font-medium outline-none focus:border-[var(--accent)] bg-white shadow-sm transition-all">
                                    {[2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
                                </select>
                            </div>
                        </div>
                        <div>
                            <label className="text-[10.5px] font-bold text-[var(--text3)] uppercase tracking-[0.4px] mb-2 block">Site <span className="text-red-500">*</span></label>
                            <select value={siteId} onChange={(e) => setSiteId(e.target.value)} className="w-full h-10 border border-[var(--border)] rounded-xl px-3 text-[13px] font-bold outline-none focus:border-[var(--accent)] bg-white shadow-sm transition-all">
                                <option value="">Select Site</option>
                                {sites.map(s => <option key={s.id} value={s.id}>{s.name} ({s.code || '--'})</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="text-[10.5px] font-bold text-[var(--text3)] uppercase tracking-[0.4px] mb-2 block">Salary Structure</label>
                            <select value={salaryStructure} onChange={(e) => setSalaryStructure(e.target.value)} className="w-full h-10 border border-[var(--border)] rounded-xl px-3 text-[13px] font-medium outline-none focus:border-[var(--accent)] bg-white shadow-sm transition-all">
                                <option>All Structures</option>
                                <option>Standard</option>
                                <option>Minimum Wage</option>
                            </select>
                        </div>
                    </div>
                    <div className="flex gap-4">
                        <Button onClick={fetchData} disabled={loading} className="h-10 px-8 bg-[var(--accent)] hover:opacity-90 text-white rounded-xl shadow-lg shadow-[var(--accent)]/10 font-bold transition-all flex items-center gap-2">
                            {loading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />} Fetch Records
                        </Button>
                    </div>
                </div>

                {/* Info Box */}
                <div className="bg-white border border-[var(--border)] rounded-2xl p-7 shadow-sm">
                    <h3 className="text-[14px] font-bold text-[var(--text)] mb-5 flex items-center gap-2">
                        <div className="h-5 w-1 bg-[var(--accent)] rounded-full" />
                        Processing Guide
                    </h3>
                    <div className="space-y-4">
                        {[
                            "Select target Month and Site.",
                            "Fetch Data to sync existing records.",
                            "System calculates from attendance.",
                            "Review line items carefully.",
                            "Apply 'Process Payroll' to finalize."
                        ].map((step, i) => (
                            <div key={i} className="flex items-start gap-4">
                                <div className="h-5 w-5 rounded-full bg-[var(--accent)] text-white flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">{i+1}</div>
                                <span className="text-[12.5px] text-[var(--text2)] font-medium">{step}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                {[
                    { label: "Total Employees", value: employees.length.toString(), icon: Users, color: "blue" },
                    { label: "Attendance Ready", value: employees.length > 0 ? "Yes" : "No", icon: CheckCircle2, color: "green" },
                    { label: "Processed", value: employees.filter(e => e.status === 'PROCESSED').length.toString(), icon: FileText, color: "amber" },
                    { label: "Not Processed", value: employees.filter(e => e.status !== 'PROCESSED').length.toString(), icon: FileText, color: "red" },
                    { label: "Warnings", value: "0", icon: AlertCircle, color: "red" },
                ].map((card, i) => (
                    <div key={i} className="bg-white border border-[var(--border)] rounded-2xl p-5 shadow-sm relative overflow-hidden group hover:border-[var(--accent)]/30 transition-all">
                        <p className="text-[10px] font-bold text-[var(--text3)] uppercase tracking-[0.8px] mb-3">{card.label}</p>
                        <div className="flex items-end justify-between">
                            <p className={`text-[24px] font-extrabold tracking-tight ${card.color === "green" ? "text-[var(--accent)]" : card.color === "blue" ? "text-blue-600" : "text-[var(--text)]"}`}>{card.value}</p>
                            <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${card.color === "blue" ? "bg-blue-50 text-blue-500" : card.color === "green" ? "bg-[var(--accent-light)] text-[var(--accent)]" : card.color === "amber" ? "bg-amber-50 text-amber-500" : "bg-red-50 text-red-500"}`}>
                                <card.icon size={20} />
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Employee List Table */}
            <div className="bg-white border border-[var(--border)] rounded-2xl shadow-sm overflow-hidden border-b-4 border-b-[var(--accent)]/20">
                <div className="px-6 py-5 border-b border-[var(--border)] flex flex-col xl:flex-row xl:items-center justify-between gap-4 bg-gray-50/20">
                    <div className="flex flex-wrap items-center gap-3">
                        <h2 className="text-[15px] font-bold text-[var(--text)] mr-2">Employees Breakdown</h2>
                        <Button variant="default" size="sm" onClick={handleProcess} disabled={processing || employees.length === 0} className="bg-[#1a9e6e] hover:bg-[#15805a] text-white h-9 px-5 gap-2 rounded-xl shadow-md shadow-emerald-100">
                            {processing ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />} Process Payroll
                        </Button>
                        <Button variant="outline" size="sm" className="h-9 gap-2 border-[var(--border)] bg-white text-[var(--text2)] rounded-xl hover:bg-[var(--surface2)]">
                            <RefreshCw size={14} className="text-purple-600" /> Recalculate
                        </Button>
                        <Button variant="outline" size="sm" className="h-9 gap-2 border-[var(--border)] bg-white text-blue-600 rounded-xl hover:bg-blue-50/50">
                            <Download size={14} /> Summary
                        </Button>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                        <div className="relative w-64">
                            <Search className="absolute left-3 top-2.5 text-[var(--text3)]" size={14} />
                            <Input placeholder="Search Employee..." className="pl-9 h-9 text-[12.5px] bg-white border-[var(--border)] rounded-xl" value={search} onChange={e => setSearch(e.target.value)} />
                        </div>
                        <Button variant="outline" size="sm" className="h-9 gap-2 bg-white text-[var(--text2)] border-[var(--border)] rounded-xl"><Filter size={14} /> Filters</Button>
                        <Button variant="outline" size="sm" className="h-9 gap-2 bg-emerald-50/50 text-emerald-700 border-emerald-100 rounded-xl hover:bg-emerald-50"><FileSpreadsheet size={14} /> Export</Button>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left text-[13px] border-collapse lg:table-fixed">
                        <thead className="bg-[#fcfcfd] border-b border-[var(--border)]">
                            <tr className="uppercase text-[9.5px] font-extrabold tracking-[1.2px] text-[var(--text3)]">
                                <th className="px-4 py-4 w-10 text-center"><input type="checkbox" className="rounded-sm border-[var(--border)]" /></th>
                                <th className="px-4 py-4 w-14 text-center">S.No.</th>
                                <th className="px-4 py-4 w-28">Emp. ID</th>
                                <th className="px-4 py-4 w-48">Employee Name</th>
                                <th className="px-4 py-4 w-36">Designation</th>
                                <th className="px-2 py-4 text-center bg-blue-50/30">P.Days</th>
                                <th className="px-2 py-4 text-center bg-blue-50/30">Pay.Days</th>
                                <th className="px-3 py-4 text-right">Basic</th>
                                <th className="px-3 py-4 text-right">HRA</th>
                                <th className="px-3 py-4 text-right">Other</th>
                                <th className="px-3 py-4 text-right font-bold text-blue-800">Gross</th>
                                <th className="px-3 py-4 text-right">PF</th>
                                <th className="px-3 py-4 text-right">ESIC</th>
                                <th className="px-3 py-4 text-right font-bold text-[#1a9e6e] bg-emerald-50/10">Net Pay</th>
                                <th className="px-4 py-4 text-center w-28">Status</th>
                                <th className="px-4 py-4 w-16 text-center">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--border)]">
                            {employees.length > 0 ? employees.map((emp, i) => (
                                <tr key={emp.id} className="hover:bg-blue-50/10 transition-colors group">
                                    <td className="px-4 py-4 text-center"><input type="checkbox" className="rounded-sm border-[var(--border)]" /></td>
                                    <td className="px-4 py-4 text-[var(--text3)] font-medium text-center">{i + 1}</td>
                                    <td className="px-4 py-4 font-bold text-blue-600 tracking-tight">{emp.employeeId || emp.id.slice(0,8)}</td>
                                    <td className="px-4 py-4">
                                        <div className="font-bold text-[var(--text)] tracking-tight">{emp.firstName} {emp.lastName}</div>
                                    </td>
                                    <td className="px-4 py-4 text-[var(--text2)] font-medium">{emp.designation || 'Security Guard'}</td>
                                    <td className="px-2 py-4 text-center font-extrabold text-[var(--text)] bg-blue-50/20">{emp.presentDays || 26}</td>
                                    <td className="px-2 py-4 text-center font-extrabold text-[var(--text)] bg-blue-50/20">{emp.payableDays || 26}</td>
                                    <td className="px-3 py-4 text-right font-medium text-[var(--text2)]">₹{(emp.employeeSalary?.basic || 0).toLocaleString()}</td>
                                    <td className="px-3 py-4 text-right font-medium text-[var(--text2)]">₹{(emp.employeeSalary?.hra || 0).toLocaleString()}</td>
                                    <td className="px-3 py-4 text-right font-medium text-[var(--text2)]">₹{(emp.employeeSalary?.otherAllowance || 0).toLocaleString()}</td>
                                    <td className="px-3 py-4 text-right font-extrabold text-blue-900 bg-blue-50/5">₹{(emp.employeeSalary?.gross || 0).toLocaleString()}</td>
                                    <td className="px-3 py-4 text-right font-medium text-red-700/70">₹{(emp.employeeSalary?.pf || 0).toLocaleString()}</td>
                                    <td className="px-3 py-4 text-right font-medium text-red-700/70">₹{(emp.employeeSalary?.esic || 0).toLocaleString()}</td>
                                    <td className="px-3 py-4 text-right font-black text-[#1a9e6e] bg-emerald-50/20">₹{(emp.employeeSalary?.net || 0).toLocaleString()}</td>
                                    <td className="px-4 py-4 text-center">
                                        <span className={`px-2.5 py-1 rounded-md text-[9.5px] font-black uppercase tracking-wider ${
                                            emp.status === "ACTIVE" ? "bg-emerald-100/60 text-[#1a9e6e]" : 
                                            emp.status === "INACTIVE" ? "bg-gray-100 text-gray-500" : 
                                            "bg-amber-100 text-amber-700"
                                        }`}>
                                            {emp.status}
                                        </span>
                                    </td>
                                    <td className="px-4 py-4 text-center">
                                        <Button variant="ghost" size="icon" className="h-8 w-8 text-blue-500 hover:bg-blue-50 hover:text-blue-700 rounded-lg"><Eye size={15} /></Button>
                                    </td>
                                </tr>
                            )) : (
                                <tr>
                                    <td colSpan={16} className="px-6 py-20 text-center text-[var(--text3)] font-medium italic">
                                        No active employees found for the selected site. Click &quot;Fetch Records&quot; to load data.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                        {employees.length > 0 && (
                            <tfoot className="bg-gray-50/50 font-black border-t-2 border-[var(--border)] text-[var(--text)]">
                                <tr className="text-[13px]">
                                    <td colSpan={5} className="px-4 py-5 text-right uppercase text-[10px] tracking-[2px] text-[var(--text3)] font-extrabold">Total Site Summary</td>
                                    <td className="px-2 py-5 text-center bg-blue-50/40">124</td>
                                    <td className="px-2 py-5 text-center bg-blue-50/40">124</td>
                                    <td className="px-3 py-5 text-right text-gray-600 font-bold">₹93,700</td>
                                    <td className="px-3 py-5 text-right text-gray-600 font-bold">₹28,200</td>
                                    <td className="px-3 py-5 text-right text-gray-600 font-bold">₹12,500</td>
                                    <td className="px-3 py-5 text-right text-blue-900 font-black decoration-2 underline underline-offset-4 decoration-blue-200">₹1,34,400</td>
                                    <td className="px-3 py-5 text-right text-red-800">₹10,000</td>
                                    <td className="px-3 py-5 text-right text-red-800">₹2,706</td>
                                    <td className="px-3 py-5 text-right text-[#1a9e6e] text-[15px] bg-emerald-50/30">₹1,20,094</td>
                                    <td colSpan={2} className="bg-gray-100/10"></td>
                                </tr>
                            </tfoot>
                        )}
                    </table>
                </div>
            </div>

            {/* Note */}
            <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 flex items-start gap-3">
                <AlertCircle className="text-blue-500 mt-0.5" size={16} />
                <p className="text-[11px] text-blue-700 leading-relaxed">
                    <b>Note</b>: Please ensure attendance is uploaded before processing payroll. System will calculate payroll based on salary structure and attendance.
                </p>
            </div>
        </div>
    )
}

function cn(...classes: any[]) {
    return classes.filter(Boolean).join(" ")
}
