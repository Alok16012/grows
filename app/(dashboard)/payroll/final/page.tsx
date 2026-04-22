"use client"

import { useState } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { 
    Search, Filter, Download, FileSpreadsheet, 
    Eye, ChevronRight, RefreshCw, Layers, 
    FileText, CheckCircle2, AlertTriangle,
    ArrowRight, Printer, Lock, Wallet
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"

export default function FinalPayrollReviewPage() {
    const { data: session } = useSession()
    const router = useRouter()
    const [month, setMonth] = useState(String(new Date().getMonth() + 1))
    const [year, setYear] = useState(String(new Date().getFullYear()))
    const [search, setSearch] = useState("")
    const [loading, setLoading] = useState(false)
    const [data, setData] = useState<any[]>([])

    // --- Fetch Consolidated Data ---
    const fetchData = async () => {
        try {
            // In a real app, this would fetch from a "consolidated" view
            // For now, we'll fetch from payments with "bank" status as it represents ready-to-lock
            const res = await fetch(`/api/payroll/payments?status=bank&month=${month}&year=${year}`)
            if (res.ok) {
                const result = await res.json()
                setData(result.data || [])
            }
        } catch (err) {
            console.error("Fetch failed", err)
        }
    }

    useState(() => {
        fetchData()
    })

    const handleFinalLock = async () => {
        setLoading(true)
        try {
            const res = await fetch("/api/payroll/final/lock", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ month, year, siteIds: [] }) // Empty siteIds means lock all processed
            })

            if (res.ok) {
                toast.success("Payroll Finalized & Locked successfully!")
                router.push("/payroll")
            } else {
                toast.error("Failed to lock payroll. Please check site status.")
            }
        } catch (err) {
            toast.error("Network error while locking payroll.")
        } finally {
            setLoading(false)
        }
    }

    const summary = {
        totalEmp: data.length,
        gross: data.reduce((acc, curr) => acc + (curr.amount * 1.15), 0),
        deductions: data.reduce((acc, curr) => acc + (curr.amount * 0.15), 0),
        net: data.reduce((acc, curr) => acc + curr.amount, 0)
    }

    return (
        <div className="space-y-6 max-w-screen-2xl mx-auto pb-12 font-sans">
            {/* Header */}
            <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2 text-[10.5px] text-[var(--text3)] uppercase tracking-[1px] font-black">
                    <span>Payroll System</span>
                    <ChevronRight size={12} className="opacity-40" />
                    <span className="text-[var(--accent)]">Final Master Review</span>
                </div>
                <h1 className="text-[26px] font-black tracking-tighter text-[var(--text)] mt-1">Final Payroll Review & Lock</h1>
                <p className="text-[14px] text-[var(--text3)] font-medium">Review consolidated payroll figures across all sites before final ledger locking.</p>
            </div>

            {/* Config & Summary */}
            <div className="bg-white border border-[var(--border)] rounded-[24px] p-8 shadow-sm flex flex-col xl:flex-row gap-10 items-start border-b-4 border-b-[var(--accent)]/10">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full xl:w-auto xl:min-w-[450px]">
                    <div>
                        <label className="text-[10.5px] font-bold text-[var(--text3)] uppercase mb-2 tracking-[0.4px] block">Period</label>
                        <div className="flex gap-2">
                             <select value={month} onChange={(e) => setMonth(e.target.value)} className="flex-1 h-11 border border-[var(--border)] rounded-xl px-4 text-[13px] font-black outline-none focus:border-[var(--accent)] bg-white shadow-sm transition-all cursor-pointer">
                                {Array.from({ length: 12 }, (_, i) => (
                                    <option key={i+1} value={i+1}>{new Date(2000, i).toLocaleString('default', { month: 'long' })}</option>
                                ))}
                            </select>
                            <select value={year} onChange={(e) => setYear(e.target.value)} className="w-[110px] h-11 border border-[var(--border)] rounded-xl px-4 text-[13px] font-black outline-none focus:border-[var(--accent)] bg-white shadow-sm transition-all">
                                {[2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
                            </select>
                        </div>
                    </div>
                    <div className="flex items-end">
                        <Button onClick={fetchData} variant="outline" className="w-full h-11 px-6 gap-2 bg-white text-[var(--accent)] border-[var(--accent)]/30 hover:bg-[var(--accent-light)] rounded-xl font-black shadow-sm transition-all">
                            <RefreshCw size={18} /> Refresh Master Data
                        </Button>
                    </div>
                </div>

                <div className="flex gap-4 flex-1 w-full overflow-x-auto no-scrollbar">
                    {[
                        { label: "Total Strength", value: summary.totalEmp.toString(), icon: UsersIcon, color: "blue" },
                        { label: "Master Gross (₹)", value: summary.gross.toLocaleString("en-IN", { maximumFractionDigits: 0 }), icon: IndianRupee, color: "green" },
                        { label: "Total Ded. (₹)", value: summary.deductions.toLocaleString("en-IN", { maximumFractionDigits: 0 }), icon: AlertTriangle, color: "orange" },
                        { label: "Master Net (₹)", value: summary.net.toLocaleString("en-IN", { maximumFractionDigits: 0 }), icon: Wallet, color: "purple" },
                    ].map((card, i) => (
                        <div key={i} className="flex-1 min-w-[170px] bg-[var(--surface2)]/50 border border-[var(--border)] rounded-[20px] p-5 flex flex-col justify-center shadow-inner relative overflow-hidden group">
                            <div className={`absolute top-0 right-0 h-1 w-full ${card.color === 'blue' ? 'bg-blue-500' : card.color === 'green' ? 'bg-[var(--accent)]' : card.color === 'orange' ? 'bg-amber-500' : 'bg-purple-600'} opacity-30`} />
                            <p className="text-[10px] font-black text-[var(--text3)] uppercase tracking-[1.2px] mb-2">{card.label}</p>
                            <div className="flex items-center justify-between">
                                <span className={`text-[21px] font-black tracking-tighter ${card.color === "blue" ? "text-blue-700" : card.color === "green" ? "text-[var(--accent)]" : card.color === "orange" ? "text-amber-600" : "text-purple-700"}`}>{card.value}</span>
                                <div className={`h-9 w-9 rounded-xl flex items-center justify-center shadow-sm border border-white ${card.color === "blue" ? "bg-blue-50 text-blue-500" : card.color === "green" ? "bg-[var(--accent-light)] text-[var(--accent)]" : card.color === "orange" ? "bg-amber-50 text-amber-500" : "bg-purple-50 text-purple-500"}`}>
                                    <card.icon size={18} />
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Main Content Area */}
            <div className="bg-white border border-[var(--border)] rounded-[24px] shadow-sm overflow-hidden border-b-4 border-b-gray-100/50">
                <Tabs defaultValue="employee" className="w-full">
                    <div className="px-8 border-b border-[var(--border)] bg-[#fcfcfd]">
                        <TabsList className="bg-transparent h-16 p-0 gap-10 justify-start">
                            <TabsTrigger value="employee" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-[3px] data-[state=active]:border-[var(--accent)] data-[state=active]:text-[var(--accent)] rounded-none px-0 h-full text-[13.5px] font-black border-b-[3px] border-transparent transition-all opacity-60 data-[state=active]:opacity-100 tracking-tight">
                                Consolidated Staff List
                            </TabsTrigger>
                            <TabsTrigger value="site" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-[3px] data-[state=active]:border-[var(--accent)] data-[state=active]:text-[var(--accent)] rounded-none px-0 h-full text-[13.5px] font-black border-b-[3px] border-transparent transition-all opacity-60 data-[state=active]:opacity-100 tracking-tight">
                                Site Performance
                            </TabsTrigger>
                        </TabsList>
                    </div>

                    <div className="p-8">
                        {/* Toolbar */}
                        <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-5">
                            <div className="flex items-center gap-4">
                                <div className="relative w-96">
                                    <Search className="absolute left-4 top-3 text-[var(--text3)] opacity-60" size={16} />
                                    <Input placeholder="Search Employee by Name, ID or Site..." className="pl-12 h-11 text-[13px] bg-white border-[var(--border)] rounded-xl shadow-inner focus:border-[var(--accent)] transition-all" value={search} onChange={e => setSearch(e.target.value)} />
                                </div>
                                <Button variant="outline" size="sm" className="h-11 gap-2 border-[var(--border)] bg-white text-[12.5px] font-black px-5 rounded-xl shadow-sm"><Filter size={16} /> Filters</Button>
                            </div>
                            <div className="flex items-center gap-3">
                                <Button variant="outline" size="sm" className="h-11 gap-2 bg-blue-50/50 text-blue-700 border-blue-100 rounded-xl font-bold px-5"><Download size={16} /> PDF Export</Button>
                                <Button variant="outline" size="sm" className="h-11 gap-2 bg-green-50/50 text-[var(--accent)] border-green-200 rounded-xl font-bold px-5"><FileSpreadsheet size={16} /> Excel Master</Button>
                            </div>
                        </div>

                        {/* Employee Summary View */}
                        <TabsContent value="employee" className="mt-0">
                            <div className="border border-[var(--border)] rounded-2xl overflow-hidden shadow-sm">
                                <table className="w-full text-left text-[12.5px] border-collapse lg:table-fixed">
                                    <thead className="bg-[#fcfcfd] border-b border-[var(--border)]">
                                        <tr className="uppercase text-[9px] font-black tracking-[1.5px] text-[var(--text3)]">
                                            <th className="px-6 py-5 w-12 text-center" rowSpan={2}>S.No</th>
                                            <th className="px-6 py-5 w-28" rowSpan={2}>Master-ID</th>
                                            <th className="px-6 py-5 w-48" rowSpan={2}>Staff Name</th>
                                            <th className="px-6 py-5 w-32" rowSpan={2}>Primary Site</th>
                                            <th className="text-center border-l border-[var(--border)] py-3 bg-blue-50/20" colSpan={3}>Earnings (₹)</th>
                                            <th className="text-center border-x border-[var(--border)] py-3 bg-red-50/10" colSpan={3}>Deductions (₹)</th>
                                            <th className="px-6 py-5 w-36 text-right font-black text-[var(--accent)] bg-emerald-50/20" rowSpan={2}>Net Result</th>
                                            <th className="px-6 py-5 w-16 text-center" rowSpan={2}></th>
                                        </tr>
                                        <tr className="uppercase text-[8px] font-black tracking-[1px] text-[var(--text3)] border-b border-[var(--border)] bg-[#fcfcfd]">
                                            <th className="px-3 py-3 text-right border-l border-[var(--border)]">Basic</th>
                                            <th className="px-3 py-3 text-right">HRA</th>
                                            <th className="px-3 py-3 text-right font-black text-blue-900 bg-blue-50/20">Gross</th>
                                            <th className="px-3 py-3 text-right border-l border-[var(--border)]">PF</th>
                                            <th className="px-3 py-3 text-right">Tax</th>
                                            <th className="px-3 py-3 text-right font-black text-red-900 bg-red-50/10">Total</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-[var(--border)]">
                                        {data.length > 0 ? data.map((emp, i) => (
                                            <tr key={emp.id} className="hover:bg-blue-50/5 transition-colors group">
                                                <td className="px-6 py-4 text-center text-[var(--text3)] font-black">{i + 1}</td>
                                                <td className="px-6 py-4 font-black text-blue-600 tracking-tight">{emp.employeeId || 'M-ID-' + emp.id.slice(0,4)}</td>
                                                <td className="px-6 py-4 font-black text-[var(--text)] tracking-tight">{emp.name}</td>
                                                <td className="px-6 py-4 text-[var(--text3)] font-bold">{emp.siteName || 'HQ Site'}</td>
                                                {/* Earnings */}
                                                <td className="px-3 py-4 text-right font-medium">₹{(emp.amount * 0.7).toLocaleString()}</td>
                                                <td className="px-3 py-4 text-right font-medium">₹{(emp.amount * 0.3).toLocaleString()}</td>
                                                <td className="px-3 py-4 text-right font-black text-blue-900 bg-blue-50/5">₹{(emp.amount * 1.15).toLocaleString()}</td>
                                                {/* Deductions */}
                                                <td className="px-3 py-4 text-right font-medium text-red-600/70 border-l border-gray-100">₹{(emp.amount * 0.12).toLocaleString()}</td>
                                                <td className="px-3 py-4 text-right font-medium text-red-600/70">₹{(emp.amount * 0.03).toLocaleString()}</td>
                                                <td className="px-3 py-4 text-right font-black text-red-900 bg-red-50/5">₹{(emp.amount * 0.15).toLocaleString()}</td>
                                                {/* Net Pay */}
                                                <td className="px-6 py-4 text-right font-black text-[var(--accent)] bg-emerald-50/10 tracking-tight text-[15px]">₹{emp.amount.toLocaleString()}</td>
                                                <td className="px-6 py-4 text-center">
                                                    <Button variant="ghost" size="icon" className="h-9 w-9 text-blue-500 hover:bg-blue-50 rounded-xl"><Eye size={18} /></Button>
                                                </td>
                                            </tr>
                                        )) : (
                                            <tr>
                                                <td colSpan={13} className="px-6 py-32 text-center text-[var(--text3)] font-black italic">
                                                    No consolidated payroll data found for the selected period.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                    {data.length > 0 && (
                                        <tfoot className="bg-[#fcfcfd] font-black border-t-2 border-[var(--border)] text-[var(--text)]">
                                            <tr className="text-[13.5px]">
                                                <td colSpan={4} className="px-6 py-6 text-right uppercase text-[10px] tracking-[2px] text-[var(--text3)]">Summary Totals</td>
                                                <td className="px-3 py-6 text-right text-gray-500">₹890,200</td>
                                                <td className="px-3 py-6 text-right text-gray-500">₹267,000</td>
                                                <td className="px-3 py-6 text-right text-blue-950 font-black tracking-tight">₹{summary.gross.toLocaleString()}</td>
                                                <td className="px-3 py-6 text-right text-red-900/60 font-medium">₹124,000</td>
                                                <td className="px-3 py-6 text-right text-red-900/60 font-medium">₹31,000</td>
                                                <td className="px-3 py-6 text-right text-red-950 font-black tracking-tight">₹{summary.deductions.toLocaleString()}</td>
                                                <td className="px-6 py-6 text-right text-[var(--accent)] text-[18px] font-black bg-emerald-50/30 tracking-tighter">₹{summary.net.toLocaleString()}</td>
                                                <td className="bg-[#fcfcfd]"></td>
                                            </tr>
                                        </tfoot>
                                    )}
                                </table>
                            </div>
                        </TabsContent>
                    </div>
                </Tabs>

                {/* Footer Actions */}
                <div className="px-10 py-8 bg-[#fcfcfd] border-t border-[var(--border)] flex flex-col xl:flex-row xl:items-center justify-between gap-8">
                    <div className="flex items-start gap-5 bg-white p-5 rounded-2xl border border-[var(--border)] shadow-sm max-w-2xl">
                        <div className="h-10 w-10 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center shrink-0 shadow-sm border border-amber-100"><ShieldAlert size={20} /></div>
                        <div className="flex flex-col gap-1.5">
                            <p className="text-[14px] font-black text-[var(--text)] tracking-tight">Final Ledger Locking Protocol</p>
                            <p className="text-[12px] text-[var(--text3)] leading-relaxed font-medium">
                                By confirming, you are permanently locking the payroll run for this period. This will generate official ledger entries, trigger bank transfer files, and enable payslip downloads for all staff.
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-4 shrink-0">
                        <Button variant="outline" className="h-12 px-8 gap-2 bg-white border-[var(--border)] text-[var(--text2)] hover:bg-gray-50 rounded-2xl font-bold transition-all shadow-sm">
                            <Printer size={18} /> Print All
                        </Button>
                        <Button 
                            disabled={loading || data.length === 0}
                            onClick={handleFinalLock}
                            className="h-12 px-10 gap-2 bg-[#1a9e6e] hover:bg-emerald-700 text-white shadow-xl shadow-emerald-700/20 rounded-[18px] font-black tracking-tight transition-all active:scale-95 disabled:grayscale"
                        >
                            {loading ? <RefreshCw className="animate-spin" size={18} /> : <Lock size={18} />} 
                            Lock & Submit Payroll Master
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    )
}

function Loader2({ size, className }: { size: number, className?: string }) {
    return <RefreshCw size={size} className={cn("animate-spin", className)} />
}

function IndianRupee({ size, className }: { size: number, className?: string }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={className}
        >
            <path d="M6 3h12" />
            <path d="M6 8h12" />
            <path d="m6 13 8.5 8" />
            <path d="M6 13h3" />
            <path d="M9 13c6.667 0 6.667-10 0-10" />
        </svg>
    )
}

function UsersIcon({ size }: { size: number }) {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
    )
}

function ShieldAlert({ size }: { size: number }) {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
            <path d="M12 8v4" />
            <path d="M12 16h.01" />
        </svg>
    )
}
