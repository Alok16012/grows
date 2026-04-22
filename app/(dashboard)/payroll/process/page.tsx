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
    FileText, ShieldCheck, Lock
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
    const [month, setMonth] = useState("May-2025")
    const [site, setSite] = useState("Site A")
    const [salaryStructure, setSalaryStructure] = useState("All")
    const [loading, setLoading] = useState(false)
    const [processing, setProcessing] = useState(false)
    const [search, setSearch] = useState("")

    // Mock Data
    const employees = [
        { id: "EMP001", name: "Raj Kumar", designation: "Inspector", presentDays: 26, payableDays: 26, basic: 18000, hra: 5400, other: 2000, gross: 25400, pf: 1800, esic: 541, pt: 200, otherDed: 0, net: 22859, status: "Processed" },
        { id: "EMP002", name: "Suresh Yadav", designation: "Inspector", presentDays: 24, payableDays: 24, basic: 17000, hra: 5100, other: 2000, gross: 24100, pf: 1800, esic: 541, pt: 200, otherDed: 0, net: 21559, status: "Processed" },
        { id: "EMP003", name: "Mohan Singh", designation: "Sr. Inspector", presentDays: 26, payableDays: 26, basic: 20000, hra: 6000, other: 2500, gross: 28500, pf: 1800, esic: 541, pt: 200, otherDed: 0, net: 25959, status: "Processed" },
        { id: "EMP004", name: "Pooja Sharma", designation: "Executive", presentDays: 22, payableDays: 22, basic: 16000, hra: 4800, other: 1500, gross: 22300, pf: 1800, esic: 541, pt: 200, otherDed: 0, net: 19759, status: "Processed" },
        { id: "EMP005", name: "Ramesh Patel", designation: "Inspector", presentDays: 26, payableDays: 26, basic: 18000, hra: 5400, other: 2000, gross: 25400, pf: 1800, esic: 541, pt: 200, otherDed: 0, net: 22859, status: "Processed" },
        { id: "EMP006", name: "Vijay Kumar", designation: "Assistant", presentDays: 20, payableDays: 20, basic: 12000, hra: 3600, other: 1000, gross: 16600, pf: 1200, esic: 541, pt: 200, otherDed: 0, net: 14659, status: "Not Processed" },
        { id: "EMP007", name: "Amit Verma", designation: "Inspector", presentDays: 18, payableDays: 18, basic: 15000, hra: 4500, other: 1500, gross: 21000, pf: 1800, esic: 541, pt: 200, otherDed: 0, net: 18459, status: "Not Processed" },
        { id: "EMP008", name: "Sanjay Patel", designation: "Sr. Inspector", presentDays: 0, payableDays: 0, basic: 18000, hra: 5400, other: 2000, gross: 25400, pf: 0, esic: 0, pt: 0, otherDed: 0, net: 25400, status: "No Attendance" },
    ]

    const handleProcess = () => {
        setProcessing(true)
        setTimeout(() => {
            setProcessing(false)
            toast.success("Payroll processed successfully for Site A!")
        }, 1500)
    }

    return (
        <div className="space-y-6 max-w-screen-2xl mx-auto pb-12">
            {/* Header */}
            <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2 text-[11px] text-[var(--text3)] uppercase tracking-wider font-medium">
                    <span>Payroll</span>
                    <ChevronRight size={12} />
                    <span>Process Payroll</span>
                </div>
                <h1 className="text-[22px] font-bold tracking-tight text-[var(--text)] mt-1">Process Payroll (Site Wise)</h1>
                <p className="text-[13px] text-[var(--text3)]">Process payroll for each site based on uploaded attendance and salary structure.</p>
            </div>

            {/* Stepper */}
            <div className="bg-white border border-[var(--border)] rounded-2xl p-4 shadow-sm">
                <div className="flex items-center justify-between gap-2 overflow-x-auto no-scrollbar">
                    {STEPS.map((s, idx) => {
                        const Icon = s.icon
                        const isActive = s.id === 2
                        return (
                            <div key={s.id} className="flex items-center gap-2 shrink-0">
                                <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-all ${isActive ? "bg-blue-50 border-blue-200 text-blue-700 font-semibold" : "border-transparent text-[var(--text3)] hover:bg-[var(--surface)]"}`}>
                                    <div className={`h-6 w-6 rounded-md flex items-center justify-center border text-[11px] ${isActive ? "bg-blue-600 border-blue-600 text-white" : "border-[var(--border)]"}`}>
                                        <Icon size={14} />
                                    </div>
                                    <span className="text-[12px] whitespace-nowrap">{s.id}. {s.name}</span>
                                </div>
                                {idx < STEPS.length - 1 && <ChevronRight size={14} className="text-gray-300 mx-1" />}
                            </div>
                        )
                    })}
                </div>
            </div>

            {/* Selection & Stats */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Selection Form */}
                <div className="lg:col-span-2 bg-white border border-[var(--border)] rounded-2xl p-6 shadow-sm flex flex-col gap-6">
                    <div className="grid grid-cols-3 gap-4">
                        <div>
                            <label className="text-[11px] font-bold text-[var(--text3)] uppercase mb-2 block">Month <span className="text-red-500">*</span></label>
                            <select value={month} onChange={(e) => setMonth(e.target.value)} className="w-full h-10 border border-[var(--border)] rounded-xl px-3 text-[13px] outline-none focus:border-blue-500 bg-white shadow-sm">
                                <option>May-2025</option>
                                <option>April-2025</option>
                            </select>
                        </div>
                        <div>
                            <label className="text-[11px] font-bold text-[var(--text3)] uppercase mb-2 block">Site <span className="text-red-500">*</span></label>
                            <select value={site} onChange={(e) => setSite(e.target.value)} className="w-full h-10 border border-[var(--border)] rounded-xl px-3 text-[13px] outline-none focus:border-blue-500 bg-white shadow-sm">
                                <option>Site A</option>
                                <option>Site B</option>
                            </select>
                        </div>
                        <div>
                            <label className="text-[11px] font-bold text-[var(--text3)] uppercase mb-2 block">Salary Structure</label>
                            <select value={salaryStructure} onChange={(e) => setSalaryStructure(e.target.value)} className="w-full h-10 border border-[var(--border)] rounded-xl px-3 text-[13px] outline-none focus:border-blue-500 bg-white shadow-sm">
                                <option>All</option>
                                <option>Standard</option>
                            </select>
                        </div>
                    </div>
                    <div className="flex gap-3">
                        <Button className="h-10 px-6 bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2">
                            <Search size={16} /> Fetch Data
                        </Button>
                    </div>
                </div>

                {/* Info Box */}
                <div className="bg-white border border-[var(--border)] rounded-2xl p-6 shadow-sm">
                    <h3 className="text-[14px] font-bold mb-4">Process Steps</h3>
                    <div className="space-y-3">
                        {[
                            "Select Month and Site.",
                            "Click on Fetch Data to load employees.",
                            "System will calculate payroll automatically.",
                            "Review and click on Process Payroll.",
                            "Data will be available in Site Wise Wage Sheet."
                        ].map((step, i) => (
                            <div key={i} className="flex items-start gap-3">
                                <div className="h-5 w-5 rounded-full bg-green-500 text-white flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">{i+1}</div>
                                <span className="text-[12px] text-[var(--text2)]">{step}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                {[
                    { label: "Total Employees", value: "120", icon: Wallet, color: "blue" },
                    { label: "Attendance Uploaded", value: "Yes", icon: CheckCircle2, color: "green" },
                    { label: "Processed", value: "98", icon: FileText, color: "amber" },
                    { label: "Not Processed", value: "22", icon: FileText, color: "red" },
                    { label: "Errors", value: "0", icon: AlertCircle, color: "red" },
                ].map((card, i) => (
                    <div key={i} className="bg-white border border-[var(--border)] rounded-2xl p-4 shadow-sm relative overflow-hidden group hover:border-blue-200 transition-all">
                        <p className="text-[11px] font-bold text-[var(--text3)] uppercase tracking-wider mb-2">{card.label}</p>
                        <div className="flex items-end justify-between">
                            <p className={`text-[24px] font-extrabold ${card.color === "green" ? "text-green-600" : card.color === "blue" ? "text-blue-600" : "text-[var(--text)]"}`}>{card.value}</p>
                            <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${card.color === "blue" ? "bg-blue-50 text-blue-500" : card.color === "green" ? "bg-green-50 text-green-500" : card.color === "amber" ? "bg-amber-50 text-amber-500" : "bg-red-50 text-red-500"}`}>
                                <card.icon size={20} />
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Employee List Table */}
            <div className="bg-white border border-[var(--border)] rounded-2xl shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-[var(--border)] flex items-center justify-between bg-gray-50/30">
                    <div className="flex items-center gap-4">
                        <h2 className="text-[15px] font-bold">Employees List</h2>
                        <Button variant="default" size="sm" onClick={handleProcess} disabled={processing} className="bg-green-600 hover:bg-green-700 text-white h-8 gap-2">
                            {processing ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />} Process Payroll
                        </Button>
                        <Button variant="outline" size="sm" className="h-8 gap-2 border-[var(--border)] bg-white">
                            <RefreshCw size={14} className="text-purple-600" /> Recalculate
                        </Button>
                        <Button variant="outline" size="sm" className="h-8 gap-2 border-[var(--border)] bg-white text-blue-600">
                            <Download size={14} /> Download Summary
                        </Button>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="relative w-64">
                            <Search className="absolute left-3 top-2 text-[var(--text3)]" size={14} />
                            <Input placeholder="Search Employee..." className="pl-9 h-8 text-[12px] bg-white" value={search} onChange={e => setSearch(e.target.value)} />
                        </div>
                        <Button variant="outline" size="sm" className="h-8 gap-2 bg-white"><Filter size={14} /> Filters</Button>
                        <Button variant="outline" size="sm" className="h-8 gap-2 bg-green-50 text-green-700 border-green-200"><FileSpreadsheet size={14} /> Export Excel</Button>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left text-[12px] border-collapse lg:table-fixed">
                        <thead className="bg-blue-50/50 border-b border-[var(--border)]">
                            <tr className="uppercase text-[9px] font-extrabold tracking-widest text-blue-900/60">
                                <th className="px-4 py-4 w-10"><input type="checkbox" className="rounded" /></th>
                                <th className="px-4 py-4 w-12">S.No.</th>
                                <th className="px-4 py-4 w-28">Emp. ID</th>
                                <th className="px-4 py-4 w-40">Employee Name</th>
                                <th className="px-4 py-4 w-32 font-medium">Designation</th>
                                <th className="px-2 py-4 text-center bg-blue-100/30">Present Days</th>
                                <th className="px-2 py-4 text-center bg-blue-100/30">Payable Days</th>
                                <th className="px-3 py-4 text-right">Basic</th>
                                <th className="px-3 py-4 text-right">HRA</th>
                                <th className="px-3 py-4 text-right">Other</th>
                                <th className="px-3 py-4 text-right font-bold text-blue-700">Gross</th>
                                <th className="px-3 py-4 text-right">PF</th>
                                <th className="px-3 py-4 text-right">ESIC</th>
                                <th className="px-3 py-4 text-right">PT</th>
                                <th className="px-3 py-4 text-right font-bold text-green-700">Net Pay</th>
                                <th className="px-4 py-4 text-center">Status</th>
                                <th className="px-4 py-4 text-center">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--border)]">
                            {employees.map((emp, i) => (
                                <tr key={emp.id} className="hover:bg-blue-50/20 transition-colors">
                                    <td className="px-4 py-3"><input type="checkbox" className="rounded" /></td>
                                    <td className="px-4 py-3 text-[var(--text3)] font-medium">{i + 1}</td>
                                    <td className="px-4 py-3 font-semibold text-blue-600">{emp.id}</td>
                                    <td className="px-4 py-3">
                                        <div className="font-bold text-[var(--text)]">{emp.name}</div>
                                    </td>
                                    <td className="px-4 py-3 text-[var(--text3)]">{emp.designation}</td>
                                    <td className="px-2 py-3 text-center font-bold bg-blue-50/50">{emp.presentDays}</td>
                                    <td className="px-2 py-3 text-center font-bold bg-blue-50/50">{emp.payableDays}</td>
                                    <td className="px-3 py-3 text-right">₹{emp.basic.toLocaleString()}</td>
                                    <td className="px-3 py-3 text-right">₹{emp.hra.toLocaleString()}</td>
                                    <td className="px-3 py-3 text-right">₹{emp.other.toLocaleString()}</td>
                                    <td className="px-3 py-3 text-right font-bold text-blue-800">₹{emp.gross.toLocaleString()}</td>
                                    <td className="px-3 py-3 text-right">₹{emp.pf.toLocaleString()}</td>
                                    <td className="px-3 py-3 text-right">₹{emp.esic.toLocaleString()}</td>
                                    <td className="px-3 py-3 text-right">₹{emp.pt.toLocaleString()}</td>
                                    <td className="px-3 py-3 text-right font-bold text-green-700">₹{emp.net.toLocaleString()}</td>
                                    <td className="px-4 py-3 text-center">
                                        <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${
                                            emp.status === "Processed" ? "bg-green-100 text-green-700" : 
                                            emp.status === "Not Processed" ? "bg-amber-100 text-amber-700" : 
                                            "bg-red-100 text-red-700"
                                        }`}>
                                            {emp.status}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                        <Button variant="ghost" size="icon" className="h-7 w-7 text-blue-500"><Eye size={14} /></Button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                        <tfoot className="bg-gray-50 font-bold border-t border-[var(--border)]">
                            <tr>
                                <td colSpan={5} className="px-4 py-3 text-right uppercase text-[10px] tracking-widest text-[var(--text3)]">Total</td>
                                <td className="px-2 py-3 text-center">124</td>
                                <td className="px-2 py-3 text-center">124</td>
                                <td className="px-3 py-3 text-right text-blue-800">₹93,700</td>
                                <td className="px-3 py-3 text-right text-blue-800">₹28,200</td>
                                <td className="px-3 py-3 text-right text-blue-800">₹12,500</td>
                                <td className="px-3 py-3 text-right text-blue-900 underline underline-offset-4">₹1,34,400</td>
                                <td className="px-3 py-3 text-right text-red-700">₹10,000</td>
                                <td className="px-3 py-3 text-right text-red-700">₹2,706</td>
                                <td className="px-3 py-3 text-right text-red-700">₹1,600</td>
                                <td className="px-3 py-3 text-right text-green-800 text-[14px]">₹1,20,094</td>
                                <td colSpan={2}></td>
                            </tr>
                        </tfoot>
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
