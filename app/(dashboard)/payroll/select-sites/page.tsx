"use client"

import { useState, useEffect } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { 
    Search, Filter, CheckCircle2, ChevronRight, 
    Building2, Users, Wallet, RefreshCw,
    ArrowRight, Info
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"


export default function SelectSitesPage() {
    const { data: session } = useSession()
    const router = useRouter()
    const [month, setMonth] = useState(String(new Date().getMonth() + 1))
    const [year, setYear] = useState(String(new Date().getFullYear()))
    const [salaryStructure, setSalaryStructure] = useState("All")
    const [search, setSearch] = useState("")
    const [sites, setSites] = useState<any[]>([])
    const [selectedSites, setSelectedSites] = useState<string[]>([])
    const [loading, setLoading] = useState(true)

    // --- Fetch Sites ---
    useEffect(() => {
        const fetchSites = async () => {
            try {
                const res = await fetch("/api/sites?isActive=true")
                if (res.ok) {
                    const data = await res.json()
                    setSites(data)
                }
            } catch (err) {
                console.error("Failed to fetch sites", err)
            } finally {
                setLoading(false)
            }
        }
        fetchSites()
    }, [])

    const toggleSite = (id: string) => {
        setSelectedSites(prev => 
            prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]
        )
    }

    const filteredSites = sites.filter(s => s.name.toLowerCase().includes(search.toLowerCase()))

    const totalSelectedEmployees = sites
        .filter(s => selectedSites.includes(s.id))
        .reduce((acc, s) => acc + (s.employeeCount || 60), 0) // fallback to 60 for mock

    return (
        <div className="space-y-6 max-w-screen-2xl mx-auto pb-12 font-sans">
            {/* Header */}
            <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2 text-[10.5px] text-[var(--text3)] uppercase tracking-[0.8px] font-bold">
                    <span>Payroll</span>
                    <ChevronRight size={12} className="text-[var(--text3)] opacity-40" />
                    <span>Select Sites (Multi Select)</span>
                </div>
                <h1 className="text-[24px] font-black tracking-tight text-[var(--text)] mt-1">Select Sites (Multi Select)</h1>
                <p className="text-[13.5px] text-[var(--text3)] font-medium">Select multiple sites to generate combined payroll and final wage sheet.</p>
            </div>

            {/* Selection & Summary */}
            <div className="bg-white border border-[var(--border)] rounded-[20px] p-7 shadow-sm flex flex-col xl:flex-row gap-8 items-start border-b-4 border-b-[var(--accent)]/10">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5 w-full xl:w-auto xl:min-w-[450px]">
                    <div>
                        <label className="text-[10.5px] font-bold text-[var(--text3)] uppercase mb-2 tracking-[0.4px]">Processing Month</label>
                        <div className="flex gap-2">
                            <select value={month} onChange={(e) => setMonth(e.target.value)} className="flex-1 h-11 border border-[var(--border)] rounded-xl px-4 text-[13px] font-bold outline-none focus:border-[var(--accent)] bg-white shadow-sm">
                                {Array.from({ length: 12 }, (_, i) => (
                                    <option key={i+1} value={i+1}>{new Date(2000, i).toLocaleString('default', { month: 'long' })}</option>
                                ))}
                            </select>
                            <select value={year} onChange={(e) => setYear(e.target.value)} className="w-[100px] h-11 border border-[var(--border)] rounded-xl px-4 text-[13px] font-bold outline-none focus:border-[var(--accent)] bg-white shadow-sm">
                                {[2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
                            </select>
                        </div>
                    </div>
                    <div>
                        <label className="text-[10.5px] font-bold text-[var(--text3)] uppercase mb-2 tracking-[0.4px]">Salary Structure</label>
                        <select value={salaryStructure} onChange={(e) => setSalaryStructure(e.target.value)} className="w-full h-11 border border-[var(--border)] rounded-xl px-4 text-[13px] font-bold outline-none focus:border-[var(--accent)] bg-white shadow-sm">
                            <option>All Structures</option>
                            <option>Standard</option>
                            <option>Minimum Wage</option>
                        </select>
                    </div>
                </div>

                <div className="flex gap-4 flex-1 w-full overflow-x-auto no-scrollbar">
                    {[
                        { label: "Selected Sites", value: selectedSites.length.toString(), icon: Building2, color: "blue" },
                        { label: "Combined Staff", value: totalSelectedEmployees.toString(), icon: Users, color: "green" },
                        { label: "Est. Total Gross", value: "₹ --", icon: IndianRupee, color: "purple" },
                        { label: "Est. Net Payable", value: "₹ --", icon: Wallet, color: "orange" },
                    ].map((card, i) => (
                        <div key={i} className="flex-1 min-w-[150px] bg-[var(--surface2)]/50 border border-[var(--border)] rounded-2xl p-4 flex flex-col justify-center shadow-inner">
                            <p className="text-[10px] font-bold text-[var(--text3)] uppercase tracking-[0.8px] mb-2">{card.label}</p>
                            <div className="flex items-center justify-between">
                                <span className={`text-[19px] font-black tracking-tight ${card.color === "blue" ? "text-blue-700" : card.color === "green" ? "text-[var(--accent)]" : card.color === "purple" ? "text-purple-700" : "text-amber-600"}`}>{card.value}</span>
                                <div className={`h-8 w-8 rounded-xl flex items-center justify-center shadow-sm border border-white/50 ${card.color === "blue" ? "bg-blue-50 text-blue-500" : card.color === "green" ? "bg-[var(--accent-light)] text-[var(--accent)]" : card.color === "purple" ? "bg-purple-50 text-purple-500" : "bg-amber-50 text-amber-500"}`}>
                                    <card.icon size={16} />
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Sites Grid */}
            <div className="bg-white border border-[var(--border)] rounded-[20px] shadow-sm p-8 border-b-4 border-b-gray-100">
                <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-5">
                    <div className="flex items-center gap-6">
                        <h3 className="text-[16px] font-black text-[var(--text)] tracking-tight">Available Sites</h3>
                        <div className="flex items-center gap-3 px-4 py-2 bg-[var(--surface2)]/80 border border-[var(--border)] rounded-xl shadow-inner group">
                            <input 
                                type="checkbox"
                                id="selectAll" 
                                checked={selectedSites.length === sites.length && sites.length > 0}
                                onChange={(e) => {
                                    if (e.target.checked) setSelectedSites(sites.map(s => s.id))
                                    else setSelectedSites([])
                                }}
                                className="h-5 w-5 rounded-md border-2 border-[var(--border)] accent-[var(--accent)] cursor-pointer"
                            />
                            <label htmlFor="selectAll" className="text-[12.5px] font-bold text-[var(--text2)] cursor-pointer select-none">Select All Sites</label>
                        </div>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="relative w-80">
                            <Search className="absolute left-4 top-3 text-[var(--text3)]" size={15} />
                            <Input placeholder="Filter by site code or name..." className="pl-11 h-10 text-[12.5px] bg-white border-[var(--border)] rounded-xl shadow-sm focus:border-[var(--accent)] transition-all" value={search} onChange={e => setSearch(e.target.value)} />
                        </div>
                        <span className="text-[11px] text-[var(--text3)] font-extrabold uppercase tracking-widest">{selectedSites.length} / {sites.length} Active</span>
                    </div>
                </div>

                {loading ? (
                    <div className="flex flex-col items-center justify-center py-24 gap-4">
                        <RefreshCw className="animate-spin text-[var(--accent)]" size={32} />
                        <p className="text-[14px] font-bold text-[var(--text3)] italic">Syncing site data...</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                        {filteredSites.map((site) => {
                            const isSelected = selectedSites.includes(site.id)
                            return (
                                <div 
                                    key={site.id} 
                                    onClick={() => toggleSite(site.id)}
                                    className={`group p-6 rounded-[22px] border-2 transition-all cursor-pointer relative overflow-hidden shadow-sm ${isSelected ? "border-[var(--accent)] bg-[var(--accent-light)]/20 ring-4 ring-[var(--accent)]/5" : "border-gray-100 bg-white hover:border-gray-200 hover:shadow-md"}`}
                                >
                                    {isSelected && <div className="absolute top-4 right-4 text-[var(--accent)] scale-110 transition-transform"><CheckCircle2 size={24} fill="white" className="text-[var(--accent)]" /></div>}
                                    <div className="flex flex-col gap-1.5 pt-1">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="px-2 py-0.5 bg-blue-50 text-blue-600 rounded-md text-[9px] font-black uppercase tracking-wider border border-blue-100/50">{site.code || 'SITE'}</span>
                                        </div>
                                        <h4 className={`text-[16px] font-black tracking-tight leading-tight ${isSelected ? "text-blue-950" : "text-[var(--text)]"}`}>{site.name}</h4>
                                        <p className="text-[13px] text-[var(--text3)] font-bold">{site.city || 'Location Active'}</p>
                                    </div>
                                    <div className="flex items-center justify-between mt-6">
                                        <div className="flex items-center gap-1.5">
                                            <Users size={14} className="text-[var(--text3)]" />
                                            <span className="text-[12px] font-black text-[var(--text2)]">120 Staff</span>
                                        </div>
                                        < IndianRupee size={16} className={`transition-opacity ${isSelected ? "opacity-100 text-[var(--accent)]" : "opacity-20"}`} />
                                    </div>
                                    <div className={`h-1.5 w-full rounded-full mt-4 bg-gray-100 overflow-hidden`}>
                                        <div className={`h-full rounded-full transition-all duration-700 ease-out ${isSelected ? "bg-[var(--accent)] w-full" : "bg-gray-200 w-1/3 group-hover:w-1/2"}`} />
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                )}

                {/* Footer Totals */}
                <div className="mt-12 pt-8 border-t-2 border-dashed border-gray-100 flex flex-col xl:flex-row xl:items-center justify-between gap-6">
                    <div className="flex flex-wrap items-center gap-10 text-[13.5px]">
                        <div className="flex items-center gap-3"><span className="text-[var(--text3)] font-bold uppercase text-[10px] tracking-widest">Sites:</span><span className="font-black text-[15px] underline underline-offset-4 decoration-[var(--accent)]/30">{selectedSites.length} Selected</span></div>
                        <div className="flex items-center gap-3"><span className="text-[var(--text3)] font-bold uppercase text-[10px] tracking-widest">Est. Staff:</span><span className="font-black text-[15px] text-[#1a9e6e]">{totalSelectedEmployees} Members</span></div>
                        <div className="flex items-center gap-3"><span className="text-[var(--text3)] font-bold uppercase text-[10px] tracking-widest">Lock Status:</span><span className="font-black text-[15px] text-blue-700">Ready to Merge</span></div>
                    </div>
                    <Button 
                        onClick={() => router.push("/payroll/final")}
                        disabled={selectedSites.length === 0}
                        className="h-12 px-10 bg-[var(--accent)] hover:opacity-90 text-white rounded-2xl shadow-xl shadow-[var(--accent)]/20 flex items-center justify-center gap-3 group font-black tracking-tight transition-all active:scale-95 disabled:opacity-50 disabled:grayscale"
                    >
                        Merge & Finalize Preview <ArrowRight size={20} className="group-hover:translate-x-1.5 transition-transform" />
                    </Button>
                </div>
            </div>

            {/* Note */}
            <div className="bg-emerald-50/50 border border-emerald-100 rounded-[20px] p-5 flex items-center gap-4 shadow-sm">
                <div className="h-9 w-9 bg-emerald-100 text-emerald-700 rounded-xl flex items-center justify-center shadow-sm"><Info size={18} /></div>
                <div className="flex flex-col">
                    <h5 className="text-[13px] font-black text-emerald-900">Merge Strategy Active</h5>
                    <p className="text-[12px] text-emerald-700 leading-relaxed font-medium">
                        Selecting multiple sites will initiate a cross-site payroll consolidation. You can review individual site performance in the <b>Final Review</b> step before locking.
                    </p>
                </div>
            </div>
        </div>
    )
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

function cn(...classes: any[]) {
    return classes.filter(Boolean).join(" ")
}
