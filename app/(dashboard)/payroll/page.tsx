"use client"

import { useState, useEffect } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import {
    Calculator, FileSpreadsheet, Download, RefreshCw, 
    TrendingUp, Banknote, ShieldCheck, PlayCircle, Loader2, Search, Users
} from "lucide-react"

export default function PayrollDashboard() {
    const { data: session, status } = useSession()
    const router = useRouter()
    const [month, setMonth] = useState(new Date().getMonth() + 1)
    const [year, setYear] = useState(new Date().getFullYear())
    const [branches, setBranches] = useState<any[]>([])
    const [selectedBranch, setSelectedBranch] = useState("")
    const [loading, setLoading] = useState(true)

    // Example Static Mocks - In real scenario fetch from /api/payroll/analytics route
    const analytics = {
        totalGross: "₹ 12,45,000",
        totalNet: "₹ 11,10,000",
        pfLiability: "₹ 1,49,400",
        esiLiability: "₹ 31,125",
        marginEarned: "₹ 1,50,000"
    }

    const downloadReport = async (type: "combined" | "bank-sheet") => {
        const url = `/api/payroll/reports/${type}?month=${month}&year=${year}${selectedBranch ? `&siteId=${selectedBranch}` : ""}`
        try {
            const res = await fetch(url)
            if (!res.ok) throw new Error(await res.text())
            const data = await res.json()
            
            // Simple json-to-csv downloader
            const csvRows = []
            const headers = Object.keys(data[0])
            csvRows.push(headers.join(","))
            
            for (const row of data) {
                const values = headers.map(header => {
                    const val = row[header]
                    return `"${val}"`
                })
                csvRows.push(values.join(","))
            }
            
            const blob = new Blob([csvRows.join("\n")], { type: "text/csv" })
            const a = document.createElement("a")
            a.href = URL.createObjectURL(blob)
            a.download = `Payroll_${type}_${month}_${year}.csv`
            a.click()
        } catch (e) {
            console.error(e)
            alert("Failed to download report. Make sure payroll is processed for this period.")
        }
    }

    useEffect(() => {
        if (status === "unauthenticated") {
            router.push("/login")
        } else if (status === "authenticated") {
            fetch("/api/branches")
                .then(res => res.json())
                .then(data => setBranches(data))
                .catch(err => console.error(err))
                .finally(() => setLoading(false))
        }
    }, [status, router])

    if (loading) {
        return <div className="flex h-[50vh] items-center justify-center"><Loader2 className="animate-spin text-[var(--accent)]" /></div>
    }

    if (session?.user?.role !== "ADMIN" && session?.user?.role !== "MANAGER") {
        return <div className="p-8 text-center text-red-500">Access Denied</div>
    }

    return (
        <div className="space-y-6 max-w-7xl mx-auto pb-10">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-[24px] font-semibold tracking-[-0.4px] text-[var(--text)]">Payroll Command Center</h1>
                    <p className="text-[13px] text-[var(--text3)] mt-0.5">Manage computations, billing, and statutory compliances</p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-2 bg-white border border-[var(--border)] rounded-[10px] px-3 py-2">
                        <Users size={16} className="text-[var(--text3)]" />
                        <select 
                            value={selectedBranch}
                            onChange={(e) => setSelectedBranch(e.target.value)}
                            className="bg-transparent text-[13px] font-medium outline-none min-w-[140px]"
                        >
                            <option value="">All Sites (Consolidated)</option>
                            {branches.map(b => (
                                <option key={b.id} value={b.id}>{b.name}</option>
                            ))}
                        </select>
                    </div>
                    <button onClick={() => router.push("/payroll/compliance")} className="inline-flex items-center gap-2 bg-white border border-[var(--border)] text-[var(--text)] rounded-[10px] text-[13px] font-medium px-4 py-2 hover:bg-[var(--surface2)] transition-colors">
                        <ShieldCheck size={16} className="text-green-600" />
                        Statutory Hub
                    </button>
                    <button onClick={() => router.push("/payroll/process")} className="inline-flex items-center gap-2 bg-[var(--accent)] text-white rounded-[10px] text-[13px] font-medium px-4 py-2 hover:opacity-90 transition-opacity">
                        <PlayCircle size={16} />
                        Run Payroll Wizard
                    </button>
                </div>
            </div>

            {/* Analytics Cards */}
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                <div className="bg-white border border-[var(--border)] p-4 rounded-xl">
                    <div className="flex items-center gap-2 text-[var(--text3)] mb-2"><Banknote size={16} /><span className="text-[12px] font-medium">Monthly Gross</span></div>
                    <div className="text-[22px] font-bold text-[var(--text)]">{analytics.totalGross}</div>
                </div>
                <div className="bg-white border border-[var(--border)] p-4 rounded-xl">
                    <div className="flex items-center gap-2 text-[var(--text3)] mb-2"><Calculator size={16} /><span className="text-[12px] font-medium">Total Net Pay</span></div>
                    <div className="text-[22px] font-bold text-[var(--text)]">{analytics.totalNet}</div>
                </div>
                <div className="bg-white border border-[var(--border)] p-4 rounded-xl">
                    <div className="flex items-center gap-2 text-blue-600 mb-2"><ShieldCheck size={16} /><span className="text-[12px] font-medium">PF Liability</span></div>
                    <div className="text-[22px] font-bold text-[var(--text)]">{analytics.pfLiability}</div>
                </div>
                <div className="bg-white border border-[var(--border)] p-4 rounded-xl">
                    <div className="flex items-center gap-2 text-orange-600 mb-2"><ShieldCheck size={16} /><span className="text-[12px] font-medium">ESI Liability</span></div>
                    <div className="text-[22px] font-bold text-[var(--text)]">{analytics.esiLiability}</div>
                </div>
                <div className="bg-[var(--surface)] border border-[var(--accent)] p-4 rounded-xl shadow-sm">
                    <div className="flex items-center gap-2 text-[var(--accent)] mb-2"><TrendingUp size={16} /><span className="text-[12px] font-semibold">Margin Earned</span></div>
                    <div className="text-[22px] font-bold text-[var(--text)]">{analytics.marginEarned}</div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Recent Payroll Runs */}
                <div className="bg-white border border-[var(--border)] rounded-xl overflow-hidden">
                    <div className="px-5 py-4 border-b border-[var(--border)] flex items-center justify-between">
                        <h2 className="text-[15px] font-semibold text-[var(--text)]">Recent Payroll Runs</h2>
                        <button className="text-[12px] text-[var(--accent)] hover:underline">View All</button>
                    </div>
                    <div className="divide-y divide-[var(--border)]">
                        {[1, 2, 3].map((_, i) => (
                            <div key={i} className="px-5 py-4 flex items-center justify-between hover:bg-[var(--surface2)] cursor-pointer">
                                <div>
                                    <p className="text-[13px] font-medium text-[var(--text)]">April 2026 Batch</p>
                                    <p className="text-[11px] text-[var(--text3)] mt-0.5">Processed 450 Employees</p>
                                </div>
                                <div className="text-right">
                                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-green-100 text-green-700">APPROVED</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Quick Actions */}
                <div className="bg-white border border-[var(--border)] rounded-xl p-5">
                    <h2 className="text-[15px] font-semibold text-[var(--text)] mb-4">Quick Links & Exports</h2>
                    <div className="grid grid-cols-2 gap-3">
                        <button 
                            onClick={() => downloadReport("combined")}
                            className="flex flex-col items-start gap-2 p-4 border border-[var(--border)] rounded-lg hover:border-[var(--accent)] hover:bg-[var(--surface2)] transition-colors text-left"
                        >
                            <FileSpreadsheet size={20} className="text-green-600" />
                            <div>
                                <p className="text-[13px] font-medium">Export Combined Sheet</p>
                                <p className="text-[11px] text-[var(--text3)] mt-1">Universal Wage Register + PF/ESI</p>
                            </div>
                        </button>
                        <button 
                            onClick={() => downloadReport("bank-sheet")}
                            className="flex flex-col items-start gap-2 p-4 border border-[var(--border)] rounded-lg hover:border-[var(--accent)] hover:bg-[var(--surface2)] transition-colors text-left"
                        >
                            <Banknote size={20} className="text-blue-600" />
                            <div>
                                <p className="text-[13px] font-medium">Generate Bank File</p>
                                <p className="text-[11px] text-[var(--text3)] mt-1">Industrial Bulk Transfer format</p>
                            </div>
                        </button>
                        <button className="flex flex-col items-start gap-2 p-4 border border-[var(--border)] rounded-lg hover:border-[var(--accent)] hover:bg-[var(--surface2)] transition-colors text-left">
                            <Download size={20} className="text-red-500" />
                            <div>
                                <p className="text-[13px] font-medium">Bulk Download Payslips</p>
                                <p className="text-[11px] text-[var(--text3)] mt-1">Zip file of all PDFs</p>
                            </div>
                        </button>
                        <button className="flex flex-col items-start gap-2 p-4 border border-[var(--border)] rounded-lg hover:border-[var(--accent)] hover:bg-[var(--surface2)] transition-colors text-left">
                            <RefreshCw size={20} className="text-orange-500" />
                            <div>
                                <p className="text-[13px] font-medium">Sync Latest Attendance</p>
                                <p className="text-[11px] text-[var(--text3)] mt-1">Mapping for {selectedBranch ? "this Site" : "All Sites"}</p>
                            </div>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}
