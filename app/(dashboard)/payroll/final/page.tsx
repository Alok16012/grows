"use client"

import { useState } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { 
    Search, Filter, Download, FileSpreadsheet, 
    Eye, ChevronRight, RefreshCw, Layers, 
    FileText, CheckCircle2, AlertTriangle,
    ArrowRight, Printer, Lock
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"

export default function FinalPayrollReviewPage() {
    const { data: session } = useSession()
    const router = useRouter()
    const [month, setMonth] = useState("May-2025")
    const [search, setSearch] = useState("")
    const [loading, setLoading] = useState(false)

    // Mock Data
    const employees = [
        { id: "EMP001", name: "Raj Kumar", site: "Site A", designation: "Inspector", basic: 18000, hra: 5400, other: 2000, gross: 25400, pf: 1800, esic: 541, pt: 200, otherDed: 0, totalDed: 2541, net: 22859, status: "Verified" },
        { id: "EMP002", name: "Suresh Yadav", site: "Site B", designation: "Inspector", basic: 17000, hra: 5100, other: 2000, gross: 24100, pf: 1800, esic: 541, pt: 200, otherDed: 0, totalDed: 2541, net: 21559, status: "Verified" },
        { id: "EMP003", name: "Mohan Singh", site: "Site A", designation: "Sr. Inspector", basic: 20000, hra: 6000, other: 2500, gross: 28500, pf: 1800, esic: 541, pt: 200, otherDed: 0, totalDed: 2541, net: 25959, status: "Verified" },
        { id: "EMP004", name: "Pooja Sharma", site: "Site C", designation: "Executive", basic: 16000, hra: 4800, other: 1500, gross: 22300, pf: 1800, esic: 541, pt: 200, otherDed: 0, totalDed: 2541, net: 19759, status: "Verified" },
        { id: "EMP005", name: "Ramesh Patel", site: "Site D", designation: "Inspector", basic: 18000, hra: 5400, other: 2000, gross: 25400, pf: 1800, esic: 541, pt: 200, otherDed: 0, totalDed: 2541, net: 22859, status: "Verified" },
        { id: "EMP006", name: "Vijay Kumar", site: "Site E", designation: "Assistant", basic: 12000, hra: 3600, other: 1000, gross: 16600, pf: 1200, esic: 541, pt: 200, otherDed: 0, totalDed: 1941, net: 14659, status: "Verified" },
        { id: "EMP007", name: "Amit Verma", site: "Site B", designation: "Inspector", basic: 15000, hra: 4500, other: 1500, gross: 21000, pf: 1800, esic: 541, pt: 200, otherDed: 0, totalDed: 2541, net: 18459, status: "Warning" },
        { id: "EMP008", name: "Sanjay Patel", site: "Site C", designation: "Sr. Inspector", basic: 18000, hra: 5400, other: 2000, gross: 25400, pf: 0, esic: 200, pt: 200, otherDed: 0, totalDed: 400, net: 25000, status: "Warning" },
    ]

    const handleFinalLock = () => {
        setLoading(true)
        setTimeout(() => {
            setLoading(false)
            toast.success("Payroll Finalized & Locked successfully!")
            router.push("/payroll")
        }, 2000)
    }

    return (
        <div className="space-y-6 max-w-screen-2xl mx-auto pb-12">
            {/* Header */}
            <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2 text-[11px] text-[var(--text3)] uppercase tracking-wider font-medium">
                    <span>Payroll</span>
                    <ChevronRight size={12} />
                    <span>Final Payroll Review</span>
                </div>
                <h1 className="text-[22px] font-bold tracking-tight text-[var(--text)] mt-1">Final Payroll Review</h1>
                <p className="text-[13px] text-[var(--text3)]">Review and lock the final payroll before generating payslips and export files.</p>
            </div>

            {/* Config & Summary */}
            <div className="bg-white border border-[var(--border)] rounded-2xl p-6 shadow-sm flex flex-col xl:flex-row gap-6 items-start">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 w-full xl:w-auto xl:min-w-[700px]">
                    <div>
                        <label className="text-[11px] font-bold text-[var(--text3)] uppercase mb-2 block">Month</label>
                        <select value={month} onChange={(e) => setMonth(e.target.value)} className="w-full h-10 border border-[var(--border)] rounded-xl px-3 text-[13px] outline-none focus:border-blue-500 bg-white">
                            <option>May-2025</option>
                            <option>April-2025</option>
                        </select>
                    </div>
                    <div>
                        <label className="text-[11px] font-bold text-[var(--text3)] uppercase mb-2 block">Salary Structure</label>
                        <select className="w-full h-10 border border-[var(--border)] rounded-xl px-3 text-[13px] outline-none focus:border-blue-500 bg-white">
                            <option>All</option>
                        </select>
                    </div>
                    <div>
                        <label className="text-[11px] font-bold text-[var(--text3)] uppercase mb-2 block">Selected Sites</label>
                        <select className="w-full h-10 border border-[var(--border)] rounded-xl px-3 text-[13px] outline-none focus:border-blue-500 bg-white">
                            <option>5 Sites Selected</option>
                        </select>
                    </div>
                    <div className="flex items-end">
                        <Button variant="outline" className="h-10 px-6 gap-2 bg-white text-blue-600 border-blue-100 hover:bg-blue-50">
                            <Eye size={16} /> View
                        </Button>
                    </div>
                </div>

                <div className="flex gap-4 flex-1 w-full overflow-x-auto no-scrollbar">
                    {[
                        { label: "Total Employees", value: "535", icon: Users, color: "blue" },
                        { label: "Total Gross Pay (₹)", value: "1,04,65,500", icon: IndianRupee, color: "green" },
                        { label: "Total Deductions (₹)", value: "9,50,300", icon: AlertTriangle, color: "orange" },
                        { label: "Total Net Pay (₹)", value: "95,15,200", icon: Wallet, color: "purple" },
                    ].map((card, i) => (
                        <div key={i} className="flex-1 min-w-[150px] border border-[var(--border)] rounded-xl p-3 flex flex-col justify-center">
                            <p className="text-[10px] font-bold text-[var(--text3)] uppercase tracking-wider mb-1">{card.label}</p>
                            <div className="flex items-center justify-between">
                                <span className={`text-[18px] font-extrabold ${card.color === "blue" ? "text-blue-600" : card.color === "green" ? "text-green-600" : card.color === "orange" ? "text-amber-600" : "text-purple-600"}`}>{card.value}</span>
                                <div className={`h-7 w-7 rounded-lg flex items-center justify-center ${card.color === "blue" ? "bg-blue-50 text-blue-500" : card.color === "green" ? "bg-green-50 text-green-500" : card.color === "orange" ? "bg-amber-50 text-amber-500" : "bg-purple-50 text-purple-500"}`}>
                                    <card.icon size={14} />
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Main Content Area */}
            <div className="bg-white border border-[var(--border)] rounded-2xl shadow-sm overflow-hidden">
                <Tabs defaultValue="employee" className="w-full">
                    <div className="px-6 border-b border-[var(--border)] bg-gray-50/20">
                        <TabsList className="bg-transparent h-14 p-0 gap-8 justify-start">
                            <TabsTrigger value="employee" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-blue-600 data-[state=active]:text-blue-600 rounded-none px-0 h-full text-[13px] font-semibold border-b-2 border-transparent transition-all">
                                Employee Summary
                            </TabsTrigger>
                            <TabsTrigger value="site" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-blue-600 data-[state=active]:text-blue-600 rounded-none px-0 h-full text-[13px] font-semibold border-b-2 border-transparent transition-all">
                                Site Summary
                            </TabsTrigger>
                            <TabsTrigger value="department" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-blue-600 data-[state=active]:text-blue-600 rounded-none px-0 h-full text-[13px] font-semibold border-b-2 border-transparent transition-all">
                                Department Summary
                            </TabsTrigger>
                            <TabsTrigger value="deduction" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-blue-600 data-[state=active]:text-blue-600 rounded-none px-0 h-full text-[13px] font-semibold border-b-2 border-transparent transition-all">
                                Deduction Summary
                            </TabsTrigger>
                        </TabsList>
                    </div>

                    <div className="p-6">
                        {/* Toolbar */}
                        <div className="flex items-center justify-between mb-6">
                            <div className="flex items-center gap-3">
                                <Button variant="outline" size="sm" className="h-9 gap-2 border-[var(--border)] bg-white text-[12px] px-4"><Filter size={14} /> Filters</Button>
                                <Button variant="outline" size="sm" className="h-9 gap-2 border-[var(--border)] bg-white text-[12px] px-4"><Layers size={14} /> Columns</Button>
                                <Button variant="outline" size="sm" className="h-9 gap-2 border-[var(--border)] bg-white text-[12px] px-4 text-purple-600"><RefreshCw size={14} /> Recalculate</Button>
                            </div>
                            <div className="flex items-center gap-3">
                                <div className="relative w-72">
                                    <Search className="absolute left-3 top-2.5 text-[var(--text3)]" size={14} />
                                    <Input placeholder="Search Employee..." className="pl-9 h-9 text-[12px] bg-white border-[var(--border)] shadow-none" value={search} onChange={e => setSearch(e.target.value)} />
                                </div>
                                <Button variant="outline" size="sm" className="h-9 gap-2 bg-blue-50 text-blue-700 border-blue-100"><Download size={14} /> Download Summary</Button>
                                <Button variant="outline" size="sm" className="h-9 gap-2 bg-green-50 text-green-700 border-green-200"><FileSpreadsheet size={14} /> Export Excel</Button>
                            </div>
                        </div>

                        {/* Employee Summary View */}
                        <TabsContent value="employee" className="mt-0">
                            <div className="border border-[var(--border)] rounded-xl overflow-hidden">
                                <table className="w-full text-left text-[11px] border-collapse lg:table-fixed">
                                    <thead className="bg-[#f8faff] border-b border-[var(--border)]">
                                        <tr className="uppercase text-[9px] font-extrabold tracking-widest text-[#475467]">
                                            <th className="px-3 py-4 w-10"><input type="checkbox" className="rounded" /></th>
                                            <th className="px-3 py-4 w-12 text-center">S.No.</th>
                                            <th className="px-3 py-4 w-24">Emp. ID</th>
                                            <th className="px-3 py-4 w-40">Employee Name</th>
                                            <th className="px-3 py-4 w-20">Site</th>
                                            <th className="px-3 py-4 w-32">Designation</th>
                                            <th className="px-2 py-4 text-right bg-blue-50/40">Basic</th>
                                            <th className="px-2 py-4 text-right bg-blue-50/40">HRA</th>
                                            <th className="px-2 py-4 text-right bg-blue-50/40">Other</th>
                                            <th className="px-2 py-4 text-right bg-blue-50/40 font-bold">Gross Pay</th>
                                            <th className="px-2 py-4 text-right bg-red-50/20">PF</th>
                                            <th className="px-2 py-4 text-right bg-red-50/20">ESIC</th>
                                            <th className="px-2 py-4 text-right bg-red-50/20">PT</th>
                                            <th className="px-2 py-4 text-right bg-red-50/20">Other</th>
                                            <th className="px-2 py-4 text-right bg-red-50/20 font-bold">Total Ded.</th>
                                            <th className="px-4 py-4 text-right font-extrabold text-green-700 bg-green-100/20">Net Pay</th>
                                            <th className="px-3 py-4 text-center">Status</th>
                                            <th className="px-2 py-4 text-center">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-[var(--border)]">
                                        {employees.map((emp, i) => (
                                            <tr key={emp.id} className="hover:bg-blue-50/10 transition-colors">
                                                <td className="px-3 py-3"><input type="checkbox" className="rounded shadow-sm" /></td>
                                                <td className="px-3 py-3 text-center text-[var(--text3)]">{i + 1}</td>
                                                <td className="px-3 py-3 font-semibold text-blue-600">{emp.id}</td>
                                                <td className="px-3 py-3 font-bold">{emp.name}</td>
                                                <td className="px-3 py-3 text-[var(--text3)]">{emp.site}</td>
                                                <td className="px-3 py-3 text-[var(--text3)]">{emp.designation}</td>
                                                {/* Earnings */}
                                                <td className="px-2 py-3 text-right">₹{emp.basic.toLocaleString()}</td>
                                                <td className="px-2 py-3 text-right">₹{emp.hra.toLocaleString()}</td>
                                                <td className="px-2 py-3 text-right">₹{emp.other.toLocaleString()}</td>
                                                <td className="px-2 py-3 text-right font-bold text-blue-800">₹{emp.gross.toLocaleString()}</td>
                                                {/* Deductions */}
                                                <td className="px-2 py-3 text-right">₹{emp.pf.toLocaleString()}</td>
                                                <td className="px-2 py-3 text-right">₹{emp.esic.toLocaleString()}</td>
                                                <td className="px-2 py-3 text-right">₹{emp.pt.toLocaleString()}</td>
                                                <td className="px-2 py-3 text-right">₹{emp.otherDed.toLocaleString()}</td>
                                                <td className="px-2 py-3 text-right font-bold text-red-800">₹{emp.totalDed.toLocaleString()}</td>
                                                {/* Net Pay */}
                                                <td className="px-4 py-3 text-right font-extrabold text-green-700">₹{emp.net.toLocaleString()}</td>
                                                <td className="px-3 py-3 text-center">
                                                    <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${
                                                        emp.status === "Verified" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
                                                    }`}>
                                                        {emp.status}
                                                    </span>
                                                </td>
                                                <td className="px-2 py-3 text-center">
                                                    <Button variant="ghost" size="icon" className="h-7 w-7 text-blue-500"><Eye size={12} /></Button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                    <tfoot className="bg-gray-50/50 font-bold border-t border-[var(--border)]">
                                        <tr className="text-[11px]">
                                            <td colSpan={6} className="px-4 py-4 text-right uppercase text-[9px] tracking-widest text-[var(--text3)]">Total</td>
                                            <td className="px-2 py-4 text-right text-blue-900">₹1,93,700</td>
                                            <td className="px-2 py-4 text-right text-blue-900">₹58,200</td>
                                            <td className="px-2 py-4 text-right text-blue-900">₹12,500</td>
                                            <td className="px-2 py-4 text-right text-blue-900 underline underline-offset-4 decoration-2 decoration-blue-200">₹2,64,400</td>
                                            <td className="px-2 py-4 text-right text-red-800">₹18,000</td>
                                            <td className="px-2 py-4 text-right text-red-800">₹2,706</td>
                                            <td className="px-2 py-4 text-right text-red-800">₹1,600</td>
                                            <td className="px-2 py-4 text-right text-red-800">₹0</td>
                                            <td className="px-2 py-4 text-right text-red-800 underline underline-offset-4 decoration-2 decoration-red-200">₹24,306</td>
                                            <td className="px-4 py-4 text-right text-green-800 text-[13px] font-extrabold">₹2,40,094</td>
                                            <td colSpan={2}></td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>

                            {/* Pagination */}
                            <div className="flex items-center justify-between mt-6">
                                <span className="text-[12px] text-[var(--text3)]">Total Records: 535</span>
                                <div className="flex items-center gap-4">
                                    <div className="flex items-center gap-2">
                                        <span className="text-[12px] text-[var(--text3)] font-medium">10 / page</span>
                                        <ChevronDown size={14} className="text-[var(--text3)]" />
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <Button variant="outline" size="icon" className="h-8 w-8 border-[var(--border)]"><ChevronLeft size={14} /></Button>
                                        <Button variant="default" size="icon" className="h-8 w-8 bg-blue-600">1</Button>
                                        <Button variant="outline" size="icon" className="h-8 w-8 border-[var(--border)]">2</Button>
                                        <Button variant="outline" size="icon" className="h-8 w-8 border-[var(--border)]">3</Button>
                                        <span className="px-2 text-[var(--text3)] text-[12px]">...</span>
                                        <Button variant="outline" size="icon" className="h-8 w-8 border-[var(--border)]">54</Button>
                                        <Button variant="outline" size="icon" className="h-8 w-8 border-[var(--border)]"><ChevronRight size={14} /></Button>
                                    </div>
                                </div>
                            </div>
                        </TabsContent>
                    </div>
                </Tabs>

                {/* Footer Actions */}
                <div className="px-6 py-6 bg-gray-50 border-t border-[var(--border)] flex items-center justify-between">
                    <div className="flex items-start gap-4">
                        <div className="h-6 w-6 bg-blue-100 text-blue-600 rounded flex items-center justify-center mt-1"><Info size={14} /></div>
                        <div className="flex flex-col gap-1">
                            <p className="text-[13px] font-bold text-[var(--text)]">Note:</p>
                            <p className="text-[11px] text-[var(--text3)] max-w-lg leading-relaxed">
                                Please review all employee payroll details carefully before final lock. Once locked, data cannot be changed. Finalizing will generate official ledger entries and move data to bank export stage.
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <Button variant="outline" className="h-10 px-6 gap-2 bg-white border-blue-100 text-blue-700 hover:bg-blue-50">
                            <Printer size={16} /> Preview Payslip
                        </Button>
                        <Button variant="outline" className="h-10 px-6 gap-2 bg-white border-green-100 text-green-700 hover:bg-green-50">
                            <FileSpreadsheet size={16} /> Download Payroll Report
                        </Button>
                        <Button 
                            disabled={loading}
                            onClick={handleFinalLock}
                            className="h-10 px-8 gap-2 bg-[#1a9e6e] hover:bg-emerald-700 text-white shadow-lg shadow-emerald-100 rounded-xl"
                        >
                            {loading ? <Loader2 size={16} className="animate-spin" /> : <Lock size={16} />} 
                            Final Lock & Confirm Payroll
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    )
}

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

function cn(...classes: any[]) {
    return classes.filter(Boolean).join(" ")
}

function Users({ size }: { size: number }) {
    return <Layers size={size} />
}
