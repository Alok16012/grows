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

    // In a real app, we'd fetch this data based on the tab
    const currentData = MOCK_DATA[activeTab as keyof typeof MOCK_DATA] || []

    return (
        <div className="space-y-6 max-w-screen-2xl mx-auto pb-12">
            {/* Breadcrumb & Header */}
            <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2 text-[11px] text-[var(--text3)] uppercase tracking-wider font-medium">
                    <span>Payroll</span>
                    <ChevronRight size={12} />
                    <span>Payments Dashboard</span>
                </div>
                <div className="flex items-center justify-between mt-1">
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center">
                            <FileText size={20} />
                        </div>
                        <h1 className="text-[22px] font-bold tracking-tight text-[var(--text)]">Payments</h1>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" className="bg-white border-[var(--border)] text-[12px] h-9 gap-2">
                            <ArrowRightLeft size={14} className="text-blue-600" /> Transfer
                        </Button>
                        <Button variant="outline" size="sm" className="bg-white border-[var(--border)] text-[12px] h-9 gap-2">
                            Initiate <MoreHorizontal size={14} />
                        </Button>
                        <Button variant="outline" size="sm" className="bg-white border-[var(--border)] text-[12px] h-9 gap-2">
                            View <MoreHorizontal size={14} />
                        </Button>
                    </div>
                </div>
            </div>

            {/* Main Tabs Container */}
            <div className="bg-white border border-[var(--border)] rounded-2xl overflow-hidden shadow-sm">
                <Tabs defaultValue="progress" className="w-full" onValueChange={setActiveTab}>
                    <div className="px-6 border-b border-[var(--border)] bg-gray-50/30">
                        <TabsList className="bg-transparent h-14 p-0 gap-8 justify-start">
                            <TabsTrigger value="progress" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-blue-600 data-[state=active]:text-blue-600 rounded-none px-0 h-full text-[13px] font-medium border-b-2 border-transparent transition-all">
                                Transfers in Progress
                            </TabsTrigger>
                            <TabsTrigger value="fla" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-blue-600 data-[state=active]:text-blue-600 rounded-none px-0 h-full text-[13px] font-medium border-b-2 border-transparent transition-all">
                                Files in Progress-FLA
                            </TabsTrigger>
                            <TabsTrigger value="tla" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-blue-600 data-[state=active]:text-blue-600 rounded-none px-0 h-full text-[13px] font-medium border-b-2 border-transparent transition-all">
                                Files in Progress-TLA
                            </TabsTrigger>
                            <TabsTrigger value="bank" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-blue-600 data-[state=active]:text-blue-600 rounded-none px-0 h-full text-[13px] font-medium border-b-2 border-transparent transition-all">
                                Sent to Bank
                            </TabsTrigger>
                        </TabsList>
                    </div>

                    <div className="p-6">
                        {/* Filters Row */}
                        <div className="flex items-center justify-between mb-6">
                            <div className="flex items-center gap-3">
                                <div className="flex items-center gap-2 bg-[var(--surface)] p-1 rounded-lg border border-[var(--border)]">
                                    <Button variant="ghost" size="icon" className="h-7 w-7 bg-white shadow-sm"><TableIcon size={14} /></Button>
                                    <Button variant="ghost" size="icon" className="h-7 w-7"><LayoutGrid size={14} /></Button>
                                    <Button variant="ghost" size="icon" className="h-7 w-7"><RefreshCw size={14} /></Button>
                                    <Button variant="ghost" size="icon" className="h-7 w-7 text-[var(--text3)]"><MoreHorizontal size={14} /></Button>
                                </div>
                                <div className="h-8 w-px bg-[var(--border)] mx-1" />
                                <div className="flex items-center gap-2">
                                    <select className="bg-white border border-[var(--border)] rounded-lg px-3 py-1.5 text-[12px] h-9 outline-none">
                                        <option>View by Status</option>
                                    </select>
                                    <select className="bg-white border border-[var(--border)] rounded-lg px-3 py-1.5 text-[12px] h-9 outline-none">
                                        <option>All Status</option>
                                    </select>
                                </div>
                            </div>

                            <div className="flex items-center gap-3">
                                <span className="text-[11px] text-[var(--text3)] italic">Last 4 Days data displayed. Use Advance Filter for more data.</span>
                                <div className="relative w-64">
                                    <Search className="absolute left-3 top-2.5 text-[var(--text3)]" size={14} />
                                    <Input 
                                        placeholder="Reference number / Search..." 
                                        className="pl-9 text-[12px] h-9 bg-white border-[var(--border)]"
                                        value={search}
                                        onChange={(e) => setSearch(e.target.value)}
                                    />
                                </div>
                                <Button variant="outline" size="icon" className="h-9 w-9 bg-blue-50 border-blue-100 text-blue-600">
                                    <Filter size={14} />
                                </Button>
                            </div>
                        </div>

                        {/* Table */}
                        <div className="border border-[var(--border)] rounded-xl overflow-hidden">
                            <table className="w-full text-left text-[13px] border-collapse">
                                <thead className="bg-gray-50/50 border-b border-[var(--border)]">
                                    <tr className="uppercase text-[10px] font-bold tracking-wider text-[var(--text3)]">
                                        <th className="px-5 py-4 flex items-center gap-2">Beneficiary Account No. <ArrowRightLeft size={10} className="rotate-90" /></th>
                                        <th className="px-5 py-4 gap-2">Beneficiary Name</th>
                                        <th className="px-5 py-4 text-center">No. Of Txn.</th>
                                        <th className="px-5 py-4 text-right">Amount (₹)</th>
                                        <th className="px-5 py-4 text-center">Status</th>
                                        <th className="px-5 py-4">File Name</th>
                                        <th className="px-5 py-4 text-right">Created On</th>
                                        <th className="px-5 py-4 w-10"></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-[var(--border)] bg-gray-50/5">
                                    {currentData.length > 0 ? (
                                        currentData.map((row) => (
                                            <tr key={row.id} className="hover:bg-gray-50/30 transition-colors group">
                                                <td className="px-5 py-4 font-mono text-[12px] text-blue-600">{row.account}</td>
                                                <td className="px-5 py-4 font-medium">{row.name}</td>
                                                <td className="px-5 py-4 text-center">{row.txn}</td>
                                                <td className="px-5 py-4 text-right font-semibold">₹{row.amount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                                                <td className="px-5 py-4 text-center">
                                                    <span className={cn(
                                                        "px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider",
                                                        row.status === "Processed" ? "bg-green-100 text-green-700 border border-green-200" :
                                                        row.status === "Completed" ? "bg-emerald-100 text-emerald-700 border border-emerald-200" :
                                                        row.status === "Processing" ? "bg-amber-100 text-amber-700 border border-amber-200 animate-pulse" :
                                                        "bg-gray-100 text-gray-700"
                                                    )}>
                                                        {row.status}
                                                    </span>
                                                </td>
                                                <td className="px-5 py-4 text-[12px] text-[var(--text3)] italic">{row.file}</td>
                                                <td className="px-5 py-4 text-right text-[12px] text-[var(--text3)]">{row.date}</td>
                                                <td className="px-5 py-4 text-right">
                                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-[var(--text3)] hover:text-[var(--text)]">
                                                        <MoreVertical size={14} />
                                                    </Button>
                                                </td>
                                            </tr>
                                        ))
                                    ) : (
                                        <tr>
                                            <td colSpan={8} className="px-5 py-12 text-center text-[var(--text3)]">
                                                <div className="flex flex-col items-center gap-2">
                                                    <Clock size={32} className="opacity-20" />
                                                    <span>No records found for the selected view.</span>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>

                        {/* Footer / Pagination */}
                        <div className="flex items-center justify-between mt-6">
                            <span className="text-[12px] text-[var(--text3)] font-medium">Total Records: {currentData.length}</span>
                            <div className="flex items-center gap-4">
                                <div className="flex items-center gap-2">
                                    <span className="text-[12px] text-[var(--text3)]">10 / page</span>
                                    <ChevronDown size={14} className="text-[var(--text3)]" />
                                </div>
                                <div className="flex items-center gap-1">
                                    <Button variant="outline" size="icon" className="h-8 w-8 border-[var(--border)]"><ChevronLeft size={14} /></Button>
                                    <Button variant="default" size="icon" className="h-8 w-8 bg-blue-600">1</Button>
                                    <Button variant="outline" size="icon" className="h-8 w-8 border-[var(--border)]"><ChevronRight size={14} /></Button>
                                </div>
                            </div>
                        </div>
                    </div>
                </Tabs>
            </div>
        </div>
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
