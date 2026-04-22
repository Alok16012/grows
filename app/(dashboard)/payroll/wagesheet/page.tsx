"use client"

import { useState } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { 
    Search, Filter, Download, FileSpreadsheet, 
    FileText, Eye, ChevronRight, FileDown,
    ArrowRightLeft
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export default function SiteWageSheetPage() {
    const { data: session } = useSession()
    const [month, setMonth] = useState("May-2025")
    const [site, setSite] = useState("Site A")
    const [search, setSearch] = useState("")

    // Mock Data
    const employees = [
        { id: "EMP001", name: "Raj Kumar", designation: "Inspector", presentDays: 26, basic: 18000, hra: 5400, other: 2000, gross: 25400, pf: 1800, esic: 541, pt: 200, otherDed: 0, totalDed: 2541, net: 22859, status: "Processed" },
        { id: "EMP002", name: "Suresh Yadav", designation: "Inspector", presentDays: 24, basic: 17000, hra: 5100, other: 2000, gross: 24100, pf: 1800, esic: 541, pt: 200, otherDed: 0, totalDed: 2541, net: 21559, status: "Processed" },
        { id: "EMP003", name: "Mohan Singh", designation: "Sr. Inspector", presentDays: 26, basic: 20000, hra: 6000, other: 2500, gross: 28500, pf: 1800, esic: 541, pt: 200, otherDed: 0, totalDed: 2541, net: 25959, status: "Processed" },
        { id: "EMP004", name: "Pooja Sharma", designation: "Executive", presentDays: 22, basic: 16000, hra: 4800, other: 1500, gross: 22300, pf: 1800, esic: 541, pt: 200, otherDed: 0, totalDed: 2541, net: 19759, status: "Processed" },
        { id: "EMP005", name: "Ramesh Patel", designation: "Inspector", presentDays: 26, basic: 18000, hra: 5400, other: 2000, gross: 25400, pf: 1800, esic: 541, pt: 200, otherDed: 0, totalDed: 2541, net: 22859, status: "Processed" },
    ]

    return (
        <div className="space-y-6 max-w-screen-2xl mx-auto pb-12">
            {/* Header */}
            <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2 text-[11px] text-[var(--text3)] uppercase tracking-wider font-medium">
                    <span>Payroll</span>
                    <ChevronRight size={12} />
                    <span>Site Wise Wage Sheet</span>
                </div>
                <h1 className="text-[22px] font-bold tracking-tight text-[var(--text)] mt-1">Site Wise Wage Sheet</h1>
                <p className="text-[13px] text-[var(--text3)]">View site wise employee salary details and wage sheet.</p>
            </div>

            {/* Selection & Summary */}
            <div className="bg-white border border-[var(--border)] rounded-2xl p-6 shadow-sm flex flex-col md:flex-row gap-6 items-start">
                <div className="grid grid-cols-2 gap-4 w-full md:w-auto md:min-w-[400px]">
                    <div>
                        <label className="text-[11px] font-bold text-[var(--text3)] uppercase mb-2 block">Month <span className="text-red-500">*</span></label>
                        <select value={month} onChange={(e) => setMonth(e.target.value)} className="w-full h-10 border border-[var(--border)] rounded-xl px-3 text-[13px] outline-none focus:border-blue-500 bg-white">
                            <option>May-2025</option>
                            <option>April-2025</option>
                        </select>
                    </div>
                    <div>
                        <label className="text-[11px] font-bold text-[var(--text3)] uppercase mb-2 block">Site <span className="text-red-500">*</span></label>
                        <select value={site} onChange={(e) => setSite(e.target.value)} className="w-full h-10 border border-[var(--border)] rounded-xl px-3 text-[13px] outline-none focus:border-blue-500 bg-white">
                            <option>Site A</option>
                            <option>Site B</option>
                        </select>
                    </div>
                </div>

                <div className="flex gap-4 flex-1">
                    {[
                        { label: "Total Employees", value: "120", icon: FileText, color: "blue" },
                        { label: "Total Gross Pay (₹)", value: "93,700", icon: ArrowRightLeft, color: "green" },
                        { label: "Total Net Pay (₹)", value: "81,195", icon: Download, color: "purple" },
                    ].map((card, i) => (
                        <div key={i} className="flex-1 min-w-[140px] border border-[var(--border)] rounded-xl p-3 flex flex-col justify-center">
                            <p className="text-[10px] font-bold text-[var(--text3)] uppercase tracking-wider mb-1">{card.label}</p>
                            <div className="flex items-center justify-between">
                                <span className={`text-[18px] font-extrabold ${card.color === "blue" ? "text-blue-600" : card.color === "green" ? "text-green-600" : "text-purple-600"}`}>{card.value}</span>
                                <div className={`h-7 w-7 rounded-lg flex items-center justify-center ${card.color === "blue" ? "bg-blue-50 text-blue-500" : card.color === "green" ? "bg-green-50 text-green-500" : "bg-purple-50 text-purple-500"}`}>
                                    <card.icon size={14} />
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="flex flex-col gap-2 w-full md:w-auto">
                    <Button className="bg-blue-600 hover:bg-blue-700 text-white h-9 px-8 gap-2">
                        <Eye size={16} /> View
                    </Button>
                    <Button variant="outline" className="h-9 gap-2 border-green-200 text-green-700 bg-green-50">
                        <FileSpreadsheet size={16} /> Export Excel
                    </Button>
                    <Button variant="outline" className="h-9 gap-2 border-blue-200 text-blue-700 bg-blue-50">
                        <FileDown size={16} /> Download PDF
                    </Button>
                </div>
            </div>

            {/* Wage Sheet Table */}
            <div className="bg-white border border-[var(--border)] rounded-2xl shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-[var(--border)] flex items-center justify-between bg-gray-50/30">
                    <h2 className="text-[15px] font-bold">Wage Sheet - {site} ({month})</h2>
                    <div className="flex items-center gap-3">
                        <div className="relative w-64">
                            <Search className="absolute left-3 top-2 text-[var(--text3)]" size={14} />
                            <Input placeholder="Search Employee..." className="pl-9 h-8 text-[12px] bg-white border-[var(--border)]" value={search} onChange={e => setSearch(e.target.value)} />
                        </div>
                        <Button variant="outline" size="sm" className="h-8 gap-2 bg-white"><Filter size={14} /> Filters</Button>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left text-[12px] border-collapse lg:table-fixed">
                        <thead className="bg-[var(--surface)] border-b border-[var(--border)]">
                            <tr className="uppercase text-[9px] font-extrabold tracking-widest text-[var(--text3)]">
                                <th className="px-4 py-4 w-12 text-center" rowSpan={2}>S.No.</th>
                                <th className="px-4 py-4 w-24" rowSpan={2}>Emp. ID</th>
                                <th className="px-4 py-4 w-40" rowSpan={2}>Employee Name</th>
                                <th className="px-4 py-4 w-32" rowSpan={2}>Designation</th>
                                <th className="px-2 py-4 w-20 text-center" rowSpan={2}>Present Days</th>
                                <th className="text-center border-l border-[var(--border)] py-2" colSpan={4}>Earnings (₹)</th>
                                <th className="text-center border-x border-[var(--border)] py-2" colSpan={5}>Deductions (₹)</th>
                                <th className="px-4 py-4 w-28 text-right font-bold text-green-700" rowSpan={2}>Net Pay (₹)</th>
                                <th className="px-4 py-4 w-24 text-center" rowSpan={2}>Status</th>
                                <th className="px-4 py-4 w-20 text-center" rowSpan={2}>Action</th>
                            </tr>
                            <tr className="uppercase text-[8px] font-extrabold tracking-widest text-[var(--text3)] border-b border-[var(--border)]">
                                <th className="px-2 py-2 text-right border-l border-[var(--border)]">Basic</th>
                                <th className="px-2 py-2 text-right">HRA</th>
                                <th className="px-2 py-2 text-right">Other</th>
                                <th className="px-2 py-2 text-right font-bold">Gross Pay</th>
                                <th className="px-2 py-2 text-right border-l border-[var(--border)]">PF</th>
                                <th className="px-2 py-2 text-right">ESIC</th>
                                <th className="px-2 py-2 text-right">PT</th>
                                <th className="px-2 py-2 text-right">Other</th>
                                <th className="px-2 py-2 text-right font-bold">Total Deduction</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--border)]">
                            {employees.map((emp, i) => (
                                <tr key={emp.id} className="hover:bg-gray-50/50 transition-colors">
                                    <td className="px-4 py-3 text-center text-[var(--text3)]">{i + 1}</td>
                                    <td className="px-4 py-3 font-semibold text-blue-600">{emp.id}</td>
                                    <td className="px-4 py-3 font-bold">{emp.name}</td>
                                    <td className="px-4 py-3 text-[var(--text3)]">{emp.designation}</td>
                                    <td className="px-2 py-3 text-center font-bold bg-blue-50/30">{emp.presentDays}</td>
                                    {/* Earnings */}
                                    <td className="px-2 py-3 text-right bg-blue-50/10">₹{emp.basic.toLocaleString()}</td>
                                    <td className="px-2 py-3 text-right bg-blue-50/10">₹{emp.hra.toLocaleString()}</td>
                                    <td className="px-2 py-3 text-right bg-blue-50/10">₹{emp.other.toLocaleString()}</td>
                                    <td className="px-2 py-3 text-right font-bold text-blue-800 bg-blue-50/20 shadow-[inset_1px_0_0_rgb(var(--border))]">₹{emp.gross.toLocaleString()}</td>
                                    {/* Deductions */}
                                    <td className="px-2 py-3 text-right bg-red-50/10">₹{emp.pf.toLocaleString()}</td>
                                    <td className="px-2 py-3 text-right bg-red-50/10">₹{emp.esic.toLocaleString()}</td>
                                    <td className="px-2 py-3 text-right bg-red-50/10">₹{emp.pt.toLocaleString()}</td>
                                    <td className="px-2 py-3 text-right bg-red-50/10">₹{emp.otherDed.toLocaleString()}</td>
                                    <td className="px-2 py-3 text-right font-bold text-red-800 bg-red-50/20 shadow-[inset_1px_0_0_rgb(var(--border)),inset_-1px_0_0_rgb(var(--border))]">₹{emp.totalDed.toLocaleString()}</td>
                                    {/* Net Pay */}
                                    <td className="px-4 py-3 text-right font-bold text-green-700 bg-green-50/30">₹{emp.net.toLocaleString()}</td>
                                    <td className="px-4 py-3 text-center">
                                        <span className="px-2 py-0.5 rounded bg-green-100 text-green-700 text-[10px] font-bold uppercase tracking-wider">{emp.status}</span>
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                        <Button variant="ghost" size="icon" className="h-7 w-7 text-blue-500 hover:bg-blue-50"><Eye size={14} /></Button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                        <tfoot className="bg-gray-50/80 font-bold border-t border-[var(--border)]">
                            <tr className="text-[12px]">
                                <td colSpan={4} className="px-4 py-3 text-right uppercase text-[10px] tracking-widest text-[var(--text3)]">Total</td>
                                <td className="px-2 py-3 text-center">124</td>
                                <td className="px-2 py-3 text-right">₹89,000</td>
                                <td className="px-2 py-3 text-right">₹26,700</td>
                                <td className="px-2 py-3 text-right">₹10,000</td>
                                <td className="px-2 py-3 text-right text-blue-800 font-extrabold underline underline-offset-4 decoration-2 decoration-blue-200">₹1,25,700</td>
                                <td className="px-2 py-3 text-right">₹9,000</td>
                                <td className="px-2 py-3 text-right">₹2,706</td>
                                <td className="px-2 py-3 text-right">₹1,000</td>
                                <td className="px-2 py-3 text-right text-red-700">₹0</td>
                                <td className="px-2 py-3 text-right text-red-800 font-extrabold underline underline-offset-4 decoration-2 decoration-red-200">₹12,706</td>
                                <td className="px-4 py-3 text-right text-green-800 text-[14px] font-extrabold">₹1,12,995</td>
                                <td colSpan={2}></td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>

            {/* Note */}
            <div className="bg-white border border-[var(--border)] rounded-2xl p-6 shadow-sm">
                <div className="flex flex-col gap-4">
                    <div className="flex items-center gap-2">
                        <div className="h-5 w-5 bg-blue-50 text-blue-600 rounded flex items-center justify-center"><ArrowRightLeft size={12} /></div>
                        <span className="text-[13px] font-bold">Summary - {site} ({month})</span>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-[12px]">
                        <div><p className="text-[var(--text3)] mb-1">Total Employees</p><p className="font-bold text-[14px]">120</p></div>
                        <div><p className="text-[var(--text3)] mb-1">Total Present Days</p><p className="font-bold text-[14px]">124</p></div>
                        <div><p className="text-[var(--text3)] mb-1">Total Gross Pay</p><p className="font-bold text-[14px] text-blue-700">₹ 1,25,700</p></div>
                        <div><p className="text-[var(--text3)] mb-1">Total Net Pay</p><p className="font-bold text-[14px] text-green-700">₹ 1,12,995</p></div>
                    </div>
                </div>
                <div className="mt-6 pt-6 border-t border-dashed border-[var(--border)]">
                    <p className="text-[11px] text-[var(--text3)] leading-relaxed italic">
                        * This wage sheet is site wise and based on processed payroll data.
                        <br />
                        * Use Filters to view employees by Designation, Department, or Status.
                    </p>
                </div>
            </div>
        </div>
    )
}

function cn(...classes: any[]) {
    return classes.filter(Boolean).join(" ")
}
