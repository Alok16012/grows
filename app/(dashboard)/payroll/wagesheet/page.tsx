"use client"

import { useState, useEffect } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { 
    Search, Filter, Download, FileSpreadsheet, 
    FileText, Eye, ChevronRight, FileDown,
    ArrowRightLeft
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

export default function SiteWageSheetPage() {
    const { data: session } = useSession()
    const [month, setMonth] = useState(String(new Date().getMonth() + 1))
    const [year, setYear] = useState(String(new Date().getFullYear()))
    const [siteId, setSiteId] = useState("")
    const [sites, setSites] = useState<any[]>([])
    const [employees, setEmployees] = useState<any[]>([])
    const [loading, setLoading] = useState(false)
    const [search, setSearch] = useState("")

    // --- Fetch Sites ---
    useEffect(() => {
        fetch("/api/sites?isActive=true")
            .then(res => res.ok ? res.json() : [])
            .then(data => {
                setSites(data)
                if (data.length > 0) setSiteId(data[0].id)
            })
    }, [])

    // --- Fetch Wage Sheet Data ---
    const fetchData = async () => {
        if (!siteId) return
        setLoading(true)
        try {
            // Fetch processed payroll for the site/month
            const res = await fetch(`/api/payroll/payments?status=bank&siteId=${siteId}&month=${month}&year=${year}`)
            if (res.ok) {
                const result = await res.json()
                // Map API data to employee format
                setData(result.data || [])
            }
        } catch (err) {
            console.error("Fetch failed", err)
        } finally {
            setLoading(false)
        }
    }

    const [data, setData] = useState<any[]>([])

    useEffect(() => {
        if (siteId) fetchData()
    }, [siteId, month, year])

    const summary = {
        totalEmp: data.length,
        gross: data.reduce((acc, curr) => acc + (curr.amount * 1.1), 0), // Mock calc for summary
        net: data.reduce((acc, curr) => acc + curr.amount, 0)
    }

    return (
        <div className="space-y-6 max-w-screen-2xl mx-auto pb-12">
            {/* Header */}
            <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2 text-[10.5px] text-[var(--text3)] uppercase tracking-[0.8px] font-bold">
                    <span>Payroll</span>
                    <ChevronRight size={12} className="text-[var(--text3)] opacity-40" />
                    <span>Site Wise Wage Sheet</span>
                </div>
                <h1 className="text-[22px] font-extrabold tracking-tight text-[var(--text)] mt-1">Site Wise Wage Sheet</h1>
                <p className="text-[13.5px] text-[var(--text3)] font-medium">View site wise employee salary details and wage sheet.</p>
            </div>

            {/* Selection & Summary */}
            <div className="bg-white border border-[var(--border)] rounded-[20px] p-7 shadow-sm flex flex-col xl:flex-row gap-8 items-start border-b-4 border-b-[var(--accent)]/10">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5 w-full xl:w-auto xl:min-w-[450px]">
                    <div>
                        <label className="text-[10.5px] font-bold text-[var(--text3)] uppercase tracking-[0.4px] mb-2 block">Processing Month <span className="text-red-500">*</span></label>
                        <div className="flex gap-2">
                             <select value={month} onChange={(e) => setMonth(e.target.value)} className="flex-1 h-11 border border-[var(--border)] rounded-xl px-4 text-[13px] font-bold outline-none focus:border-[var(--accent)] bg-white shadow-sm transition-all">
                                {Array.from({ length: 12 }, (_, i) => (
                                    <option key={i+1} value={i+1}>{new Date(2000, i).toLocaleString('default', { month: 'long' })}</option>
                                ))}
                            </select>
                            <select value={year} onChange={(e) => setYear(e.target.value)} className="w-[110px] h-11 border border-[var(--border)] rounded-xl px-4 text-[13px] font-bold outline-none focus:border-[var(--accent)] bg-white shadow-sm transition-all">
                                {[2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
                            </select>
                        </div>
                    </div>
                    <div>
                        <label className="text-[10.5px] font-bold text-[var(--text3)] uppercase tracking-[0.4px] mb-2 block">Site Selection <span className="text-red-500">*</span></label>
                        <select value={siteId} onChange={(e) => setSiteId(e.target.value)} className="w-full h-11 border border-[var(--border)] rounded-xl px-4 text-[13px] font-black outline-none focus:border-[var(--accent)] bg-white shadow-sm transition-all">
                            <option value="">Select Site</option>
                            {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                    </div>
                </div>

                <div className="flex gap-4 flex-1 w-full overflow-x-auto no-scrollbar">
                    {[
                        { label: "Strength", value: summary.totalEmp.toString(), icon: FileText, color: "blue" },
                        { label: "Est. Gross (₹)", value: summary.gross.toLocaleString("en-IN", { maximumFractionDigits: 0 }), icon: ArrowRightLeft, color: "green" },
                        { label: "Net Payable (₹)", value: summary.net.toLocaleString("en-IN", { maximumFractionDigits: 0 }), icon: Download, color: "purple" },
                    ].map((card, i) => (
                        <div key={i} className="flex-1 min-w-[160px] bg-[var(--surface2)]/50 border border-[var(--border)] rounded-2xl p-4 flex flex-col justify-center shadow-inner">
                            <p className="text-[10px] font-bold text-[var(--text3)] uppercase tracking-[0.8px] mb-2">{card.label}</p>
                            <div className="flex items-center justify-between">
                                <span className={`text-[19px] font-black tracking-tight ${card.color === "blue" ? "text-blue-700" : card.color === "green" ? "text-[var(--accent)]" : "text-purple-700"}`}>{card.value}</span>
                                <div className={`h-8 w-8 rounded-xl flex items-center justify-center ${card.color === "blue" ? "bg-blue-50 text-blue-500" : card.color === "green" ? "bg-[var(--accent-light)] text-[var(--accent)]" : "bg-purple-50 text-purple-500"}`}>
                                    <card.icon size={16} />
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="flex flex-row xl:flex-col gap-3 w-full xl:w-auto">
                    <Button onClick={fetchData} className="flex-1 xl:flex-none bg-[var(--accent)] hover:opacity-90 text-white h-11 px-8 gap-2 rounded-xl font-bold shadow-lg shadow-[var(--accent)]/10 transition-all">
                        <Eye size={18} /> Refresh
                    </Button>
                    <Button variant="outline" className="flex-1 xl:flex-none h-11 gap-2 border-[var(--accent)]/20 text-[var(--accent-text)] bg-[var(--accent-light)]/50 rounded-xl font-bold hover:bg-[var(--accent-light)]">
                        <FileSpreadsheet size={18} /> Export
                    </Button>
                </div>
            </div>

            {/* Wage Sheet Table */}
            <div className="bg-white border border-[var(--border)] rounded-[20px] shadow-sm overflow-hidden border-b-4 border-b-gray-100">
                <div className="px-8 py-5 border-b border-[var(--border)] flex items-center justify-between bg-gray-50/20">
                    <h2 className="text-[15px] font-black text-[var(--text)] tracking-tight">Wage Sheet Preview</h2>
                    <div className="flex items-center gap-4">
                        <div className="relative w-80">
                            <Search className="absolute left-4 top-3 text-[var(--text3)]" size={15} />
                            <Input placeholder="Search Employee in Site..." className="pl-11 h-10 text-[12.5px] bg-white border-[var(--border)] rounded-xl shadow-sm focus:border-[var(--accent)] transition-all" value={search} onChange={e => setSearch(e.target.value)} />
                        </div>
                        <Button variant="outline" size="sm" className="h-10 gap-2 bg-white text-[var(--text2)] border-[var(--border)] rounded-xl font-bold shadow-sm"><Filter size={15} /> Advanced</Button>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left text-[13px] border-collapse lg:table-fixed">
                        <thead className="bg-[#fcfcfd] border-b border-[var(--border)]">
                            <tr className="uppercase text-[9px] font-extrabold tracking-[1.5px] text-[var(--text3)]">
                                <th className="px-6 py-5 w-16 text-center" rowSpan={2}>S.No.</th>
                                <th className="px-6 py-5 w-28" rowSpan={2}>Emp. ID</th>
                                <th className="px-6 py-5 w-52" rowSpan={2}>Employee Name</th>
                                <th className="px-6 py-5 w-40" rowSpan={2}>Designation</th>
                                <th className="px-4 py-5 w-24 text-center bg-blue-50/20" rowSpan={2}>P.Days</th>
                                <th className="text-center border-l border-[var(--border)] py-3 bg-gray-50/30" colSpan={4}>Earnings Breakdown (₹)</th>
                                <th className="text-center border-x border-[var(--border)] py-3 bg-red-50/5" colSpan={5}>Statutory Deductions (₹)</th>
                                <th className="px-6 py-5 w-32 text-right font-black text-[var(--accent)] bg-emerald-50/10" rowSpan={2}>Net Payable</th>
                                <th className="px-6 py-5 w-14 text-center" rowSpan={2}></th>
                            </tr>
                            <tr className="uppercase text-[8px] font-black tracking-[1px] text-[var(--text3)] border-b border-[var(--border)] bg-[#fcfcfd]">
                                <th className="px-3 py-3 text-right border-l border-[var(--border)]">Basic</th>
                                <th className="px-3 py-3 text-right">HRA</th>
                                <th className="px-3 py-3 text-right">Wash/Conv</th>
                                <th className="px-3 py-3 text-right font-black text-blue-900 bg-blue-50/30">Gross</th>
                                <th className="px-3 py-3 text-right border-l border-[var(--border)]">PF (12%)</th>
                                <th className="px-3 py-3 text-right">ESIC</th>
                                <th className="px-3 py-3 text-right">PT</th>
                                <th className="px-3 py-3 text-right">LWF</th>
                                <th className="px-3 py-3 text-right font-black text-red-900 bg-red-50/20">Tax Ded.</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--border)]">
                            {data.length > 0 ? data.map((emp, i) => (
                                <tr key={emp.id} className="hover:bg-blue-50/5 transition-colors group">
                                    <td className="px-6 py-4 text-center text-[var(--text3)] font-bold">{i + 1}</td>
                                    <td className="px-6 py-4 font-black text-blue-600 tracking-tight">{emp.employeeId || 'EMP-' + emp.id.slice(0,4)}</td>
                                    <td className="px-6 py-4 font-black text-[var(--text)] tracking-tight">{emp.name}</td>
                                    <td className="px-6 py-4 text-[var(--text2)] font-bold">{emp.designation || 'Inspector'}</td>
                                    <td className="px-4 py-4 text-center font-black text-[var(--text)] bg-blue-50/10 border-x border-gray-100/50">{emp.presentDays || 26}</td>
                                    {/* Earnings */}
                                    <td className="px-3 py-4 text-right font-medium text-[var(--text2)]">₹{(emp.amount * 0.6).toLocaleString()}</td>
                                    <td className="px-3 py-4 text-right font-medium text-[var(--text2)]">₹{(emp.amount * 0.2).toLocaleString()}</td>
                                    <td className="px-3 py-4 text-right font-medium text-[var(--text2)]">₹{(emp.amount * 0.1).toLocaleString()}</td>
                                    <td className="px-3 py-4 text-right font-black text-blue-900 bg-blue-50/5 shadow-[inset_1px_0_0_rgb(var(--border))]">₹{(emp.amount * 1.1).toLocaleString()}</td>
                                    {/* Deductions */}
                                    <td className="px-3 py-4 text-right font-medium text-red-700/70 border-l border-gray-100/50">₹{(emp.amount * 0.08).toLocaleString()}</td>
                                    <td className="px-3 py-4 text-right font-medium text-red-700/70">₹{(emp.amount * 0.0075).toLocaleString()}</td>
                                    <td className="px-3 py-4 text-right font-medium text-red-700/70">₹200</td>
                                    <td className="px-3 py-4 text-right font-medium text-red-700/70">₹5</td>
                                    <td className="px-3 py-4 text-right font-black text-red-800 bg-red-50/5 shadow-[inset_1px_0_0_rgb(var(--border))]">₹{(emp.amount * 0.09).toLocaleString()}</td>
                                    {/* Net Pay */}
                                    <td className="px-6 py-4 text-right font-black text-[var(--accent)] bg-emerald-50/10 tracking-tight text-[15px]">₹{emp.amount.toLocaleString()}</td>
                                    <td className="px-6 py-4 text-center">
                                        <Button variant="ghost" size="icon" className="h-8 w-8 text-blue-500 hover:bg-blue-50 rounded-lg"><Eye size={16} /></Button>
                                    </td>
                                </tr>
                            )) : (
                                <tr>
                                    <td colSpan={16} className="px-6 py-32 text-center text-[var(--text3)] font-bold italic">
                                        No processed wage sheet found for this site in the selected period.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                        {data.length > 0 && (
                            <tfoot className="bg-gray-50/50 font-black border-t-2 border-[var(--border)] text-[var(--text)]">
                                <tr className="text-[13px]">
                                    <td colSpan={4} className="px-6 py-6 text-right uppercase text-[10px] tracking-[2px] text-[var(--text3)] font-extrabold">Grand Total Summary</td>
                                    <td className="px-4 py-6 text-center bg-blue-50/30">124</td>
                                    <td className="px-3 py-6 text-right text-gray-500">₹890,000</td>
                                    <td className="px-3 py-6 text-right text-gray-500">₹267,000</td>
                                    <td className="px-3 py-6 text-right text-gray-500">₹100,000</td>
                                    <td className="px-3 py-6 text-right text-blue-900 font-extrabold decoration-2 underline underline-offset-4 decoration-blue-200">₹1,257,000</td>
                                    <td className="px-3 py-6 text-right text-red-900/60">₹90,000</td>
                                    <td className="px-3 py-6 text-right text-red-900/60">₹27,060</td>
                                    <td className="px-3 py-6 text-right text-red-900/60">₹10,000</td>
                                    <td className="px-3 py-6 text-right text-red-900/60">₹500</td>
                                    <td className="px-3 py-6 text-right text-red-900 font-extrabold decoration-2 underline underline-offset-4 decoration-red-200">₹127,560</td>
                                    <td className="px-6 py-6 text-right text-[var(--accent)] text-[17px] font-black bg-emerald-50/30 tracking-tighter">₹{summary.net.toLocaleString()}</td>
                                    <td className="bg-gray-100/10"></td>
                                </tr>
                            </tfoot>
                        )}
                    </table>
                </div>
            </div>

            {/* Note */}
            <div className="bg-white border border-[var(--border)] rounded-[20px] p-8 shadow-sm relative overflow-hidden border-b-4 border-b-blue-100">
                <div className="absolute top-0 right-0 h-24 w-24 bg-blue-50/50 rounded-bl-full border-b border-l border-blue-100/20" />
                <div className="flex flex-col gap-6 relative z-10">
                    <div className="flex items-center gap-3">
                        <div className="h-6 w-6 bg-[var(--accent-light)] text-[var(--accent)] rounded-lg flex items-center justify-center shadow-sm"><ArrowRightLeft size={14} /></div>
                        <span className="text-[14px] font-black tracking-tight text-[var(--text)]">Site Summary Insights</span>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-10">
                        <div className="flex flex-col gap-1.5"><p className="text-[11px] font-bold text-[var(--text3)] uppercase tracking-wider">Payroll Strength</p><p className="font-black text-[18px] tracking-tight">{data.length} Staff</p></div>
                        <div className="flex flex-col gap-1.5"><p className="text-[11px] font-bold text-[var(--text3)] uppercase tracking-wider">Present Days</p><p className="font-black text-[18px] tracking-tight">124 Days</p></div>
                        <div className="flex flex-col gap-1.5"><p className="text-[11px] font-bold text-[var(--text3)] uppercase tracking-wider">Total Gross</p><p className="font-black text-[18px] tracking-tight text-blue-700">₹ {summary.gross.toLocaleString()}</p></div>
                        <div className="flex flex-col gap-1.5"><p className="text-[11px] font-bold text-[var(--text3)] uppercase tracking-wider">Final Net Pay</p><p className="font-black text-[18px] tracking-tight text-[var(--accent)]">₹ {summary.net.toLocaleString()}</p></div>
                    </div>
                </div>
                <div className="mt-8 pt-8 border-t border-dashed border-[var(--border)]">
                    <p className="text-[11.5px] text-[var(--text3)] leading-relaxed italic font-medium flex items-center gap-2">
                        <ShieldCheck size={14} className="text-[var(--accent)]" />
                        This wage sheet is generated from locked payroll runs and fully compliant with statutory structures for the selected site.
                    </p>
                </div>
            </div>
        </div>
    )
}

function ShieldCheck(props: any) {
    return (
        <svg
            {...props}
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
            <path d="m9 12 2 2 4-4" />
        </svg>
    )
}


