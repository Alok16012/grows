"use client"

// Charts (recharts) are heavy (~150kB). This view lives in its own module so the
// main recruitment page can lazy-load it via next/dynamic — the candidate
// list/board no longer ships the charting library on first load.
import { Target, Users, TrendingUp } from "lucide-react"
import {
    BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
    PieChart, Pie, Cell, Legend
} from "recharts"

const PIE_COLORS = ["#3b82f6", "#8b5cf6", "#f59e0b", "#06b6d4", "#1a9e6e", "#dc2626", "#65a30d", "#ea580c", "#6b7280"]

export interface AnalyticsData {
    summary: {
        total: number
        todayLeads: number
        activeLeads: number
        interviews: number
        offers: number
        joinings: number
        dropped: number
    }
    funnelData: { stage: string; count: number; conversion: number }[]
    sourceBreakdown: { name: string; value: number }[]
    recruiterPerformance: { id: string; name: string; leads: number; interviews: number; joinings: number; conversion: number }[]
}

export default function RecruitmentAnalytics({ data }: { data: AnalyticsData }) {
    const { summary, funnelData, sourceBreakdown, recruiterPerformance } = data
    const summaryCards = [
        { label: "Total Leads", value: summary.total, color: "#3b82f6" },
        { label: "Today's Leads", value: summary.todayLeads, color: "#8b5cf6" },
        { label: "Active Leads", value: summary.activeLeads, color: "#f59e0b" },
        { label: "Interviews", value: summary.interviews, color: "#06b6d4" },
        { label: "Offers", value: summary.offers, color: "#65a30d" },
        { label: "Joinings", value: summary.joinings, color: "#047857" },
        { label: "Dropped", value: summary.dropped, color: "#9ca3af" },
    ]

    const stageLabels: Record<string, string> = {
        NEW_LEAD: "New", CONTACTED: "Contacted", INTERESTED: "Interested",
        INTERVIEW_SCHEDULED: "Scheduled", INTERVIEW_DONE: "Done",
        SELECTED: "Selected", OFFERED: "Offered", JOINED: "Joined",
        ON_SITE_JOINED: "On-site Joined",
        REJECTED: "Rejected", DROPPED: "Dropped",
    }

    return (
        <div className="flex flex-col gap-6 mt-4">
            {/* Summary cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
                {summaryCards.map(c => (
                    <div key={c.label} className="bg-white border border-[var(--border)] rounded-[12px] p-4">
                        <p className="text-[10px] font-semibold text-[var(--text3)] uppercase tracking-wide">{c.label}</p>
                        <p className="text-[24px] font-bold mt-1" style={{ color: c.color }}>{c.value}</p>
                    </div>
                ))}
            </div>

            {/* Funnel + Source */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Funnel */}
                <div className="bg-white border border-[var(--border)] rounded-[14px] p-5">
                    <h3 className="text-[14px] font-bold text-[var(--text)] mb-4 flex items-center gap-2">
                        <TrendingUp size={16} className="text-[var(--accent)]" />
                        Recruitment Funnel
                    </h3>
                    <ResponsiveContainer width="100%" height={280}>
                        <BarChart data={funnelData.filter(d => d.count > 0 || ["NEW_LEAD","CONTACTED","INTERESTED"].includes(d.stage))} layout="vertical"
                            margin={{ left: 10, right: 40, top: 0, bottom: 0 }}>
                            <XAxis type="number" tick={{ fontSize: 11 }} />
                            <YAxis type="category" dataKey="stage" width={90}
                                tickFormatter={(v: string) => stageLabels[v] ?? v}
                                tick={{ fontSize: 11 }} />
                            <Tooltip
                                formatter={(val: number | string | undefined) => [val ?? 0, "Count"]}
                                labelFormatter={(label: any) => stageLabels[String(label)] ?? String(label)}
                            />
                            <Bar dataKey="count" fill="var(--accent)" radius={[0, 4, 4, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>

                {/* Source pie */}
                <div className="bg-white border border-[var(--border)] rounded-[14px] p-5">
                    <h3 className="text-[14px] font-bold text-[var(--text)] mb-4 flex items-center gap-2">
                        <Target size={16} className="text-[var(--accent)]" />
                        Source Breakdown
                    </h3>
                    {sourceBreakdown.length > 0 ? (
                        <ResponsiveContainer width="100%" height={280}>
                            <PieChart>
                                <Pie data={sourceBreakdown} cx="50%" cy="50%" outerRadius={100}
                                    dataKey="value" nameKey="name" label={({ name, percent }: { name?: string; percent?: number }) => `${name ?? ""} (${((percent ?? 0) * 100).toFixed(0)}%)`}
                                    labelLine={false}>
                                    {sourceBreakdown.map((_, i) => (
                                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip />
                                <Legend />
                            </PieChart>
                        </ResponsiveContainer>
                    ) : (
                        <p className="text-[13px] text-[var(--text3)] text-center py-16">No source data</p>
                    )}
                </div>
            </div>

            {/* Recruiter performance */}
            <div className="bg-white border border-[var(--border)] rounded-[14px] p-5">
                <h3 className="text-[14px] font-bold text-[var(--text)] mb-4 flex items-center gap-2">
                    <Users size={16} className="text-[var(--accent)]" />
                    Recruiter Performance
                </h3>
                {recruiterPerformance.length > 0 ? (
                    <div className="overflow-x-auto">
                        <table className="w-full text-[13px]">
                            <thead>
                                <tr className="border-b border-[var(--border)]">
                                    {["Recruiter", "Leads", "Interviews", "Joinings", "Conversion"].map(h => (
                                        <th key={h} className="text-left pb-2 pr-4 text-[11px] font-semibold text-[var(--text3)] uppercase tracking-wide">{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {recruiterPerformance.map(r => (
                                    <tr key={r.id} className="border-b border-[var(--border)] last:border-0">
                                        <td className="py-2.5 pr-4 font-medium text-[var(--text)]">{r.name}</td>
                                        <td className="py-2.5 pr-4 text-[var(--text2)]">{r.leads}</td>
                                        <td className="py-2.5 pr-4 text-[var(--text2)]">{r.interviews}</td>
                                        <td className="py-2.5 pr-4 text-[var(--text2)]">{r.joinings}</td>
                                        <td className="py-2.5">
                                            <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${r.conversion >= 50 ? "bg-green-100 text-green-700" : r.conversion >= 20 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"}`}>
                                                {r.conversion}%
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <p className="text-[13px] text-[var(--text3)] text-center py-8">No recruiter data — assign leads to recruiters to see performance</p>
                )}
            </div>
        </div>
    )
}
