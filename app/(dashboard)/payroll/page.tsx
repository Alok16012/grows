"use client"

import { useState, useEffect } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { 
    Search, Filter, Download, MoreVertical, 
    ArrowRightLeft, FileCheck, Send, Clock, 
    ChevronRight, MoreHorizontal, LayoutGrid,
    List, RefreshCw, FileText
} from "lucide-react"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

// --- Mock Data ---
const MOCK_DATA = {
    progress: [
        { id: "1", account: "110219393375", name: "AKSHAY BALU PADWAL", txn: 1, amount: 21948, status: "Processed", file: "--", date: "20-May-2025 10:30 AM" },
        { id: "2", account: "Multiple", name: "Multiple", txn: 8, amount: 125614, status: "Completed", file: "Pricoltvssal110426.csv", date: "20-May-2025 10:45 AM" },
    ],
    fla: [
        { id: "3", account: "Multiple", name: "Multiple", txn: 13, amount: 258918, status: "Completed", file: "VARROSBSAL150426.csv", date: "20-May-2025 11:00 AM" },
    ],
    tla: [
        { id: "4", account: "Multiple", name: "Multiple", txn: 15, amount: 247591, status: "Completed", file: "MOTHERSAL150426.csv", date: "20-May-2025 11:20 AM" },
    ],
    bank: [
        { id: "5", account: "Multiple", name: "Multiple", txn: 37, amount: 738474, status: "Processing", file: "JBMSANSAL150426.csv", date: "20-May-2025 12:15 PM" },
        { id: "6", account: "Multiple", name: "Multiple", txn: 13, amount: 219426, status: "Completed", file: "JBMNASHLOTSAL130426.csv", date: "20-May-2025 01:05 PM" },
    ]
}

export default function PayrollDashboard() {
    const { data: session } = useSession()
    const router = useRouter()
    const [search, setSearch] = useState("")
    const [activeTab, setActiveTab] = useState("progress")
    const [loading, setLoading] = useState(false)
    const [data, setData] = useState<any[]>([])

    // --- Fetch Data ---
    const fetchData = async () => {
        setLoading(true)
        try {
            const res = await fetch(`/api/payroll/payments?status=${activeTab}&search=${search}`)
            if (res.ok) {
                const result = await res.json()
                setData(result.data || [])
            }
        } catch (err) {
            console.error("Failed to fetch payments", err)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchData()
    }, [activeTab])

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault()
        fetchData()
    }

    return (
        <div className="space-y-6 max-w-screen-2xl mx-auto pb-12">
            {/* Breadcrumb & Header */}
            <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2 text-[10.5px] text-[var(--text3)] uppercase tracking-[0.8px] font-bold">
                    <span>Payroll</span>
                    <ChevronRight size={12} className="text-[var(--text3)] opacity-40" />
                    <span>Payments Dashboard</span>
                </div>
                <div className="flex items-center justify-between mt-1">
                    <div className="flex items-center gap-4">
                        <div className="h-11 w-11 bg-[var(--accent-light)] text-[var(--accent)] rounded-2xl flex items-center justify-center shadow-sm border border-[var(--accent)]/10">
                            <FileText size={22} />
                        </div>
                        <div>
                            <h1 className="text-[24px] font-black tracking-tight text-[var(--text)]">Payments</h1>
                            <p className="text-[13px] text-[var(--text3)] font-medium">Monitor and manage all payroll disbursement cycles.</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <Button variant="outline" size="sm" className="bg-white border-[var(--border)] text-[12.5px] h-10 px-4 gap-2 rounded-xl font-bold shadow-sm hover:bg-[var(--surface2)]">
                            <ArrowRightLeft size={14} className="text-[var(--accent)]" /> Quick Transfer
                        </Button>
                        <Button variant="outline" size="sm" className="bg-white border-[var(--border)] text-[12.5px] h-10 px-4 gap-2 rounded-xl font-bold shadow-sm hover:bg-[var(--surface2)]">
                            Batch Actions <MoreHorizontal size={14} />
                        </Button>
                    </div>
                </div>
            </div>

            {/* Main Tabs Container */}
            <div className="bg-white border border-[var(--border)] rounded-[20px] overflow-hidden shadow-sm border-b-4 border-b-[var(--accent)]/10">
                <Tabs defaultValue="progress" className="w-full" onValueChange={setActiveTab}>
                    <div className="px-8 border-b border-[var(--border)] bg-gray-50/20">
                        <TabsList className="bg-transparent h-16 p-0 gap-10 justify-start">
                            <TabsTrigger value="progress" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-[var(--accent)] data-[state=active]:text-[var(--accent-text)] rounded-none px-0 h-full text-[13.5px] font-bold border-b-2 border-transparent transition-all tracking-tight opacity-70 data-[state=active]:opacity-100">
                                Transfers in Progress
                            </TabsTrigger>
                            <TabsTrigger value="fla" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-[var(--accent)] data-[state=active]:text-[var(--accent-text)] rounded-none px-0 h-full text-[13.5px] font-bold border-b-2 border-transparent transition-all tracking-tight opacity-70 data-[state=active]:opacity-100">
                                Files Progress-FLA
                            </TabsTrigger>
                            <TabsTrigger value="tla" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-[var(--accent)] data-[state=active]:text-[var(--accent-text)] rounded-none px-0 h-full text-[13.5px] font-bold border-b-2 border-transparent transition-all tracking-tight opacity-70 data-[state=active]:opacity-100">
                                Files Progress-TLA
                            </TabsTrigger>
                            <TabsTrigger value="bank" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-[var(--accent)] data-[state=active]:text-[var(--accent-text)] rounded-none px-0 h-full text-[13.5px] font-bold border-b-2 border-transparent transition-all tracking-tight opacity-70 data-[state=active]:opacity-100">
                                Sent to Bank
                            </TabsTrigger>
                        </TabsList>
                    </div>

                    <div className="p-8">
                        {/* Filters Row */}
                        <div className="flex flex-col xl:flex-row xl:items-center justify-between mb-8 gap-4">
                            <div className="flex items-center gap-4 flex-wrap">
                                <div className="flex items-center gap-2 bg-[var(--surface2)] p-1.5 rounded-xl border border-[var(--border)] shadow-inner">
                                    <Button variant="ghost" size="icon" className="h-8 w-8 bg-white shadow-sm ring-1 ring-black/5"><TableIcon size={15} /></Button>
                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-[var(--text3)]"><LayoutGrid size={15} /></Button>
                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-[var(--accent)]" onClick={fetchData}><RefreshCw size={15} /></Button>
                                </div>
                                <div className="h-8 w-px bg-[var(--border)] mx-1" />
                                <div className="flex items-center gap-2">
                                    <select className="bg-white border border-[var(--border)] rounded-xl px-4 py-1.5 text-[12.5px] font-bold h-10 outline-none focus:border-[var(--accent)] shadow-sm">
                                        <option>View by Status</option>
                                    </select>
                                    <select className="bg-white border border-[var(--border)] rounded-xl px-4 py-1.5 text-[12.5px] font-bold h-10 outline-none focus:border-[var(--accent)] shadow-sm">
                                        <option>All Dates</option>
                                    </select>
                                </div>
                            </div>

                            <form onSubmit={handleSearch} className="flex flex-wrap items-center gap-4">
                                <div className="relative w-80">
                                    <Search className="absolute left-4 top-3 text-[var(--text3)]" size={15} />
                                    <Input 
                                        placeholder="Beneficiary or Ref No..." 
                                        className="pl-11 pr-4 text-[13px] font-medium h-10 bg-white border-[var(--border)] rounded-xl shadow-sm focus:border-[var(--accent)] transition-all"
                                        value={search}
                                        onChange={(e) => setSearch(e.target.value)}
                                    />
                                </div>
                                <Button type="submit" variant="outline" className="h-10 px-5 gap-2 bg-[var(--accent-light)] border-[var(--accent)]/20 text-[var(--accent-text)] rounded-xl font-bold hover:bg-[var(--accent)] hover:text-white transition-all shadow-sm">
                                    <Filter size={15} /> Advanced
                                </Button>
                                <Button variant="outline" className="h-10 px-5 gap-2 bg-white text-[var(--text2)] border-[var(--border)] rounded-xl font-bold hover:bg-[var(--surface2)] shadow-sm">
                                    <Download size={15} /> Export
                                </Button>
                            </form>
                        </div>

                        {/* Table */}
                        <div className="border border-[var(--border)] rounded-2xl overflow-hidden shadow-sm relative border-b-4 border-b-gray-100">
                            {loading && (
                                <div className="absolute inset-0 bg-white/60 backdrop-blur-[2px] z-10 flex items-center justify-center">
                                    <Loader2 className="animate-spin text-[var(--accent)]" size={24} />
                                </div>
                            )}
                            <table className="w-full text-left text-[13.5px] border-collapse lg:table-fixed">
                                <thead className="bg-[#fcfcfd] border-b border-[var(--border)]">
                                    <tr className="uppercase text-[10px] font-extrabold tracking-[1.2px] text-[var(--text3)]">
                                        <th className="px-6 py-5 flex items-center gap-2">Beneficiary Account <ArrowRightLeft size={10} className="rotate-90 opacity-40" /></th>
                                        <th className="px-6 py-5">Beneficiary Name</th>
                                        <th className="px-6 py-5 text-center w-32">Txns</th>
                                        <th className="px-6 py-5 text-right w-40">Amount (₹)</th>
                                        <th className="px-6 py-5 text-center w-36">Status</th>
                                        <th className="px-6 py-5">Remarks</th>
                                        <th className="px-6 py-5 text-right w-44 tracking-tight">Timestamp</th>
                                        <th className="px-6 py-5 w-14"></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-[var(--border)] bg-white">
                                    {data.length > 0 ? (
                                        data.map((row) => (
                                            <tr key={row.id} className="hover:bg-blue-50/10 transition-colors group">
                                                <td className="px-6 py-5 font-bold font-mono text-[13px] text-blue-600 tracking-tight">{row.account}</td>
                                                <td className="px-6 py-5 font-black text-[var(--text)]">{row.name}</td>
                                                <td className="px-6 py-5 text-center font-bold text-[var(--text2)]">{row.txn}</td>
                                                <td className="px-6 py-5 text-right font-black text-[var(--text)] tracking-tight">₹{row.amount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                                                <td className="px-6 py-5 text-center">
                                                    <span className={cn(
                                                        "px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider shadow-sm border",
                                                        row.status === "PROCESSED" || row.status === "Processed" ? "bg-emerald-50 text-[#1a9e6e] border-emerald-100" :
                                                        row.status === "PAID" || row.status === "Completed" ? "bg-blue-50 text-blue-700 border-blue-100" :
                                                        row.status === "DRAFT" || row.status === "Processing" ? "bg-amber-50 text-amber-700 border-amber-100" :
                                                        "bg-gray-50 text-gray-700 border-gray-100"
                                                    )}>
                                                        {row.status}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-5 text-[12.5px] text-[var(--text3)] font-medium italic break-words">{row.file}</td>
                                                <td className="px-6 py-5 text-right text-[12px] text-[var(--text3)] font-bold">{row.date}</td>
                                                <td className="px-6 py-5 text-right">
                                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-[var(--text3)] hover:text-[var(--text)] rounded-lg hover:bg-[var(--surface2)]">
                                                        <MoreVertical size={16} />
                                                    </Button>
                                                </td>
                                            </tr>
                                        ))
                                    ) : (
                                        <tr>
                                            <td colSpan={8} className="px-6 py-24 text-center text-[var(--text3)]">
                                                <div className="flex flex-col items-center gap-4">
                                                    <Clock size={40} className="opacity-10" />
                                                    <div className="space-y-1">
                                                        <p className="font-bold text-[15px] text-[var(--text2)]">No disbursements found</p>
                                                        <p className="text-[13px] font-medium italic">Adjust filters or search criteria to view records.</p>
                                                    </div>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>

                        {/* Footer / Pagination */}
                        <div className="flex flex-col md:flex-row items-center justify-between mt-10 gap-4">
                            <div className="flex items-center gap-10">
                                <span className="text-[12.5px] text-[var(--text3)] font-bold uppercase tracking-widest">Total Records: {data.length}</span>
                                <div className="flex items-center gap-3">
                                    <span className="text-[12.5px] font-bold text-[var(--text2)]">10 / Session</span>
                                    <ChevronDown size={14} className="text-[var(--text3)]" />
                                </div>
                            </div>
                            <div className="flex items-center gap-1.5 p-1.5 bg-gray-50 rounded-2xl shadow-inner border border-[var(--border)]">
                                <Button variant="ghost" size="icon" className="h-9 w-9 text-[var(--text3)] hover:bg-white hover:text-[var(--text)] shadow-sm transition-all"><ChevronLeft size={16} /></Button>
                                <Button variant="ghost" className="h-9 min-w-[36px] bg-white text-[var(--accent)] font-black text-[13px] shadow-sm ring-1 ring-black/5 rounded-xl">1</Button>
                                <Button variant="ghost" size="icon" className="h-9 w-9 text-[var(--text3)] hover:bg-white hover:text-[var(--text)] shadow-sm transition-all"><ChevronRight size={16} /></Button>
                            </div>
                        </div>
                    </div>
                </Tabs>
            </div>
        </div>
    )
}

function Loader2(props: any) {
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
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
        </svg>
    )
}

// Helper icons
function TableIcon({ size }: { size: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <line x1="3" y1="9" x2="21" y2="9" />
            <line x1="3" y1="15" x2="21" y2="15" />
            <line x1="9" y1="3" x2="9" y2="21" />
            <line x1="15" y1="3" x2="15" y2="21" />
        </svg>
    )
}

function ChevronLeft({ size }: { size: number }) {
    return <ChevronRight size={size} className="rotate-180" />
}

function ChevronDown({ size, className }: { size: number, className?: string }) {
    return <ChevronRight size={size} className={cn("rotate-90", className)} />
}
