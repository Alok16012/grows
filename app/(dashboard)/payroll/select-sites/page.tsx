"use client"

import { useState } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { 
    Search, Filter, CheckCircle2, ChevronRight, 
    Building2, Users, IndianRupee, Wallet, 
    ArrowRight, Info
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"

export default function SelectSitesPage() {
    const { data: session } = useSession()
    const router = useRouter()
    const [month, setMonth] = useState("May-2025")
    const [salaryStructure, setSalaryStructure] = useState("All")
    const [search, setSearch] = useState("")
    const [selectedSites, setSelectedSites] = useState<string[]>(["Site A", "Site B", "Site C", "Site E"])

    // Mock Sites Data
    const sites = [
        { id: "S1", name: "Site A", employees: 120 },
        { id: "S2", name: "Site B", employees: 98 },
        { id: "S3", name: "Site C", employees: 110 },
        { id: "S4", name: "Site D", employees: 132 },
        { id: "S5", name: "Site E", employees: 95 },
        { id: "S6", name: "Site F", employees: 75 },
        { id: "S7", name: "Site G", employees: 88 },
        { id: "S8", name: "Site H", employees: 65 },
        { id: "S9", name: "Site I", employees: 90 },
        { id: "S10", name: "Site J", employees: 55 },
        { id: "S11", name: "Site K", employees: 60 },
        { id: "S12", name: "Site L", employees: 60 },
    ]

    const toggleSite = (name: string) => {
        setSelectedSites(prev => 
            prev.includes(name) ? prev.filter(s => s !== name) : [...prev, name]
        )
    }

    const filteredSites = sites.filter(s => s.name.toLowerCase().includes(search.toLowerCase()))

    return (
        <div className="space-y-6 max-w-screen-2xl mx-auto pb-12">
            {/* Header */}
            <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2 text-[11px] text-[var(--text3)] uppercase tracking-wider font-medium">
                    <span>Payroll</span>
                    <ChevronRight size={12} />
                    <span>Select Sites (Multi Select)</span>
                </div>
                <h1 className="text-[22px] font-bold tracking-tight text-[var(--text)] mt-1">Select Sites (Multi Select)</h1>
                <p className="text-[13px] text-[var(--text3)]">Select multiple sites to generate combined payroll and final wage sheet.</p>
            </div>

            {/* Selection & Summary */}
            <div className="bg-white border border-[var(--border)] rounded-2xl p-6 shadow-sm flex flex-col md:flex-row gap-6 items-start">
                <div className="grid grid-cols-2 gap-4 w-full md:w-auto md:min-w-[400px]">
                    <div>
                        <label className="text-[11px] font-bold text-[var(--text3)] uppercase mb-2 block">Month</label>
                        <select value={month} onChange={(e) => setMonth(e.target.value)} className="w-full h-10 border border-[var(--border)] rounded-xl px-3 text-[13px] outline-none focus:border-blue-500 bg-white">
                            <option>May-2025</option>
                            <option>April-2025</option>
                        </select>
                    </div>
                    <div>
                        <label className="text-[11px] font-bold text-[var(--text3)] uppercase mb-2 block">Salary Structure</label>
                        <select value={salaryStructure} onChange={(e) => setSalaryStructure(e.target.value)} className="w-full h-10 border border-[var(--border)] rounded-xl px-3 text-[13px] outline-none focus:border-blue-500 bg-white">
                            <option>All</option>
                            <option>Standard</option>
                        </select>
                    </div>
                </div>

                <div className="flex gap-4 flex-1">
                    {[
                        { label: "Selected Sites", value: selectedSites.length.toString(), icon: Building2, color: "blue" },
                        { label: "Total Employees", value: "535", icon: Users, color: "green" },
                        { label: "Total Gross Pay (₹)", value: "1,04,65,500", icon: IndianRupee, color: "purple" },
                        { label: "Total Net Pay (₹)", value: "95,15,200", icon: Wallet, color: "orange" },
                    ].map((card, i) => (
                        <div key={i} className="flex-1 min-w-[120px] border border-[var(--border)] rounded-xl p-3 flex flex-col justify-center">
                            <p className="text-[10px] font-bold text-[var(--text3)] uppercase tracking-wider mb-1">{card.label}</p>
                            <div className="flex items-center justify-between">
                                <span className={`text-[16px] font-extrabold ${card.color === "blue" ? "text-blue-600" : card.color === "green" ? "text-green-600" : card.color === "purple" ? "text-purple-600" : "text-amber-600"}`}>{card.value}</span>
                                <div className={`h-6 w-6 rounded-lg flex items-center justify-center ${card.color === "blue" ? "bg-blue-50 text-blue-500" : card.color === "green" ? "bg-green-50 text-green-500" : card.color === "purple" ? "bg-purple-50 text-purple-500" : "bg-amber-50 text-amber-500"}`}>
                                    <card.icon size={12} />
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Sites Grid */}
            <div className="bg-white border border-[var(--border)] rounded-2xl shadow-sm p-6">
                <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-4">
                        <h3 className="text-[15px] font-bold">Select Sites</h3>
                        <div className="flex items-center gap-2 px-3 py-1 bg-[var(--surface)] border border-[var(--border)] rounded-lg">
                            <Checkbox id="selectAll" />
                            <label htmlFor="selectAll" className="text-[12px] font-medium cursor-pointer">Select All</label>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="relative w-72">
                            <Search className="absolute left-3 top-2.5 text-[var(--text3)]" size={14} />
                            <Input placeholder="Search Site..." className="pl-9 h-9 text-[12px] bg-white border-[var(--border)]" value={search} onChange={e => setSearch(e.target.value)} />
                        </div>
                        <span className="text-[12px] text-[var(--text3)] font-medium">{selectedSites.length} of {sites.length} selected</span>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {filteredSites.map((site) => {
                        const isSelected = selectedSites.includes(site.name)
                        return (
                            <div 
                                key={site.id} 
                                onClick={() => toggleSite(site.name)}
                                className={`group p-5 rounded-2xl border-2 transition-all cursor-pointer relative overflow-hidden ${isSelected ? "border-blue-600 bg-blue-50/50" : "border-[var(--border)] hover:border-blue-200"}`}
                            >
                                {isSelected && <div className="absolute top-3 right-3 text-blue-600"><CheckCircle2 size={18} fill="currentColor" className="text-white fill-blue-600" /></div>}
                                <div className="flex flex-col gap-1">
                                    <h4 className={`text-[15px] font-bold ${isSelected ? "text-blue-900" : "text-[var(--text)]"}`}>{site.name}</h4>
                                    <p className="text-[12px] text-[var(--text3)] font-medium">{site.employees} Employees</p>
                                </div>
                                <div className={`h-1.5 w-full rounded-full mt-4 bg-gray-100 overflow-hidden`}>
                                    <div className={`h-full rounded-full transition-all duration-500 ${isSelected ? "bg-blue-600 w-full" : "bg-gray-300 w-1/4 group-hover:w-1/3"}`} />
                                </div>
                            </div>
                        )
                    })}
                </div>

                {/* Footer Totals */}
                <div className="mt-10 pt-8 border-t border-dashed border-[var(--border)] flex items-center justify-between">
                    <div className="flex items-center gap-12 text-[13px]">
                        <div className="flex items-center gap-2"><span className="text-[var(--text3)]">Total Selected Sites:</span><span className="font-bold underline underline-offset-4 decoration-blue-200">{selectedSites.length}</span></div>
                        <div className="flex items-center gap-2"><span className="text-[var(--text3)]">Total Employees:</span><span className="font-bold text-green-600">{selectedSites.reduce((acc, name) => acc + (sites.find(s => s.name === name)?.employees || 0), 0)}</span></div>
                        <div className="flex items-center gap-2"><span className="text-[var(--text3)]">Total Gross Pay (₹):</span><span className="font-bold text-blue-600">1,04,65,500</span></div>
                        <div className="flex items-center gap-2"><span className="text-[var(--text3)]">Total Net Pay (₹):</span><span className="font-bold text-green-700">95,15,200</span></div>
                    </div>
                    <Button 
                        onClick={() => router.push("/payroll/final")}
                        className="h-11 px-8 bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-lg shadow-blue-200 flex items-center gap-2 group"
                    >
                        Generate Final Payroll <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
                    </Button>
                </div>
            </div>

            {/* Note */}
            <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 flex items-center gap-3">
                <Info className="text-blue-500" size={16} />
                <p className="text-[11px] text-blue-700 leading-relaxed font-medium">
                    <b>Note</b>: After generating final payroll, data will be available in <b>Final Payroll Preview</b>.
                </p>
            </div>
        </div>
    )
}

function cn(...classes: any[]) {
    return classes.filter(Boolean).join(" ")
}
