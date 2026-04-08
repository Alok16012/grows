"use client"
import { useState, useEffect, useCallback, useRef } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
    Plus, Loader2, X, Star, Search,
    ChevronDown, Trash2, TrendingUp, CheckCircle2,
    Clock, AlertCircle, Send, Users, Award,
    BarChart2, Settings, FileText, Target,
    ChevronRight, Check, AlertTriangle, Edit2, RefreshCw
} from "lucide-react"
import { format } from "date-fns"
import {
    BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
    LineChart, Line, CartesianGrid, Legend
} from "recharts"

// ─── Types ─────────────────────────────────────────────────────────────────────

type ReviewStatus = "DRAFT" | "SUBMITTED" | "ACKNOWLEDGED" | "COMPLETED"
type ReviewCycle = "MONTHLY" | "QUARTERLY" | "HALF_YEARLY" | "ANNUAL"

type KPI = {
    id: string
    reviewId: string
    kraId?: string | null
    title: string
    description?: string | null
    target: string
    actual?: string | null
    weightage: number
    rating?: number | null
    remarks?: string | null
}

type KRA = {
    id: string
    reviewId: string
    title: string
    description?: string | null
    weightage: number
    kpis: KPI[]
}

type PIP = {
    id: string
    reviewId: string
    employeeId: string
    startDate: string
    endDate: string
    goals: string
    status: string
    managerNotes?: string | null
}

type PerformanceReview = {
    id: string
    employeeId: string
    reviewerId: string
    cycle: ReviewCycle
    periodStart: string
    periodEnd: string
    status: ReviewStatus
    overallRating?: number | null
    strengths?: string | null
    improvements?: string | null
    managerComments?: string | null
    employeeComments?: string | null
    selfRating?: number | null
    selfComments?: string | null
    promotionRecommended: boolean
    incrementPercent?: number | null
    bonusPercent?: number | null
    performanceRank?: string | null
    pipRequired: boolean
    hrApprovedAt?: string | null
    hrApprovedBy?: string | null
    submittedAt?: string | null
    acknowledgedAt?: string | null
    completedAt?: string | null
    createdAt: string
    updatedAt: string
    employee: {
        id: string
        firstName: string
        lastName: string
        employeeId: string
        designation?: string | null
        photo?: string | null
        branch: { name: string }
    }
    kpis: KPI[]
    kras: KRA[]
    pip?: PIP | null
}

type EmployeeOption = {
    id: string
    firstName: string
    lastName: string
    employeeId: string
    designation?: string | null
}

type DashboardData = {
    summary: { total: number; pending: number; completed: number; avgScore: number }
    rankDistrib: Record<string, number>
    topPerformers: {
        id: string
        overallRating: number | null
        performanceRank: string | null
        employee: { firstName: string; lastName: string; designation: string | null; employeeId: string }
    }[]
    roleAvgScores: { role: string; avgScore: number; count: number }[]
    monthlyTrend: { month: string; avgScore: number; count: number }[]
}

type KPITemplate = {
    id: string
    role: string
    kraTitle: string
    kpiTitle: string
    targetHint?: string | null
    weightage: number
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const AVATAR_COLORS = ["#1a9e6e", "#3b82f6", "#8b5cf6", "#f59e0b", "#ef4444", "#06b6d4", "#f97316"]

const STATUS_CONFIG: Record<ReviewStatus, { label: string; color: string; bg: string }> = {
    DRAFT:        { label: "Draft",        color: "#6b7280", bg: "#f3f4f6" },
    SUBMITTED:    { label: "Submitted",    color: "#d97706", bg: "#fef3c7" },
    ACKNOWLEDGED: { label: "Acknowledged", color: "#2563eb", bg: "#eff6ff" },
    COMPLETED:    { label: "Completed",    color: "#1a9e6e", bg: "#e8f7f1" },
}

const CYCLE_CONFIG: Record<ReviewCycle, { label: string; color: string; bg: string }> = {
    MONTHLY:     { label: "Monthly",    color: "#7c3aed", bg: "#f5f3ff" },
    QUARTERLY:   { label: "Quarterly",  color: "#2563eb", bg: "#eff6ff" },
    HALF_YEARLY: { label: "Half-Yearly", color: "#0891b2", bg: "#ecfeff" },
    ANNUAL:      { label: "Annual",     color: "#1a9e6e", bg: "#e8f7f1" },
}

const RANK_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
    TOP_PERFORMER:  { label: "Top Performer",  color: "#1a9e6e", bg: "#e8f7f1" },
    HIGH_PERFORMER: { label: "High Performer", color: "#2563eb", bg: "#eff6ff" },
    AVERAGE:        { label: "Average",        color: "#d97706", bg: "#fef3c7" },
    LOW_PERFORMER:  { label: "Low Performer",  color: "#ef4444", bg: "#fee2e2" },
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getAvatarColor(first: string, last: string) {
    return AVATAR_COLORS[(first.charCodeAt(0) + (last.charCodeAt(0) || 0)) % AVATAR_COLORS.length]
}

function fmtDate(d?: string | null) {
    if (!d) return "—"
    try { return format(new Date(d), "MMM yyyy") } catch { return "—" }
}

function fmtDateFull(d?: string | null) {
    if (!d) return "—"
    try { return format(new Date(d), "dd MMM yyyy") } catch { return "—" }
}

function calcRank(score: number): string {
    if (score >= 4.5) return "TOP_PERFORMER"
    if (score >= 3.5) return "HIGH_PERFORMER"
    if (score >= 2.8) return "AVERAGE"
    return "LOW_PERFORMER"
}

function calcOverallScore(kras: KRA[]): number | null {
    if (!kras.length) return null
    let weightedSum = 0
    let totalWeight = 0
    for (const kra of kras) {
        if (!kra.kpis.length) continue
        let kraScore = 0
        let kraKpiWeightSum = 0
        for (const kpi of kra.kpis) {
            const targetNum = Number(kpi.target) || 0
            const actualNum = Number(kpi.actual) || 0
            const weight = kpi.weightage
            
            // Formula: Achievement % = (Actual/Target) * 100
            // Score (1-5) = (Achievement/100) * 5
            if (targetNum > 0) {
                const achievement = (actualNum / targetNum)
                const score1to5 = Math.min(achievement * 5, 5) // Cap at 5
                kraScore += score1to5 * weight
            } else {
                // Fallback to manual rating if target is 0
                kraScore += (kpi.rating ?? 3) * weight
            }
            kraKpiWeightSum += weight
        }
        if (kraKpiWeightSum > 0) {
            const kraFinalScore = (kraScore / kraKpiWeightSum) 
            weightedSum += kraFinalScore * kra.weightage
            totalWeight += kra.weightage
        }
    }
    if (totalWeight === 0) return null
    return Math.round((weightedSum / totalWeight) * 100) / 100
}

// ─── StarRating ───────────────────────────────────────────────────────────────

function StarRating({
    value,
    onChange,
    readonly = false,
    size = 16,
}: {
    value?: number | null
    onChange?: (v: number) => void
    readonly?: boolean
    size?: number
}) {
    const [hover, setHover] = useState<number | null>(null)
    const labels: Record<number, string> = {
        5: "उत्कृष्ट (Outstanding)",
        4: "Exceeds Expectations",
        3: "Meets Expectations",
        2: "Needs Improvement",
        1: "Poor"
    }
    
    return (
        <span style={{ display: "inline-flex", gap: 2, alignItems: "center" }}>
            {[1, 2, 3, 4, 5].map(n => (
                <Star
                    key={n}
                    size={size}
                    style={{
                        cursor: readonly ? "default" : "pointer",
                        fill: (hover ?? value ?? 0) >= n ? "#f59e0b" : "transparent",
                        color: (hover ?? value ?? 0) >= n ? "#f59e0b" : "#d1d5db",
                    }}
                    onMouseEnter={() => !readonly && setHover(n)}
                    onMouseLeave={() => !readonly && setHover(null)}
                    onClick={() => !readonly && onChange?.(n)}
                />
            ))}
            {(hover || value) && (
                <span style={{ fontSize: 10, color: "#6b7280", marginLeft: 6 }}>
                    {labels[Math.round(hover ?? value ?? 1)]}
                </span>
            )}
        </span>
    )
}

// ─── Badge ────────────────────────────────────────────────────────────────────

function Badge({ label, color, bg }: { label: string; color: string; bg: string }) {
    return (
        <span style={{
            display: "inline-block",
            padding: "2px 10px",
            borderRadius: 99,
            fontSize: 11,
            fontWeight: 600,
            color,
            background: bg,
            letterSpacing: 0.2,
        }}>
            {label}
        </span>
    )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function PerformancePage() {
    const { data: session, status } = useSession()
    const router = useRouter()

    const [activeTab, setActiveTab] = useState<"dashboard" | "reviews" | "templates">("dashboard")

    // Reviews state
    const [reviews, setReviews] = useState<PerformanceReview[]>([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState("")
    const [filterCycle, setFilterCycle] = useState("ALL")
    const [filterStatus, setFilterStatus] = useState("ALL")

    // Selected review for drawer
    const [selectedReview, setSelectedReview] = useState<PerformanceReview | null>(null)
    const [drawerTab, setDrawerTab] = useState<"overview" | "self" | "kra" | "manager" | "hr" | "pip">("overview")

    // Create modal
    const [showCreateModal, setShowCreateModal] = useState(false)
    const [employees, setEmployees] = useState<EmployeeOption[]>([])
    const [creating, setCreating] = useState(false)
    const [createForm, setCreateForm] = useState({
        employeeId: "",
        cycle: "QUARTERLY" as ReviewCycle,
        periodStart: "",
        periodEnd: "",
    })

    // Dashboard
    const [dashboard, setDashboard] = useState<DashboardData | null>(null)
    const [dashLoading, setDashLoading] = useState(true)

    // Templates
    const [templates, setTemplates] = useState<KPITemplate[]>([])
    const [templatesLoading, setTemplatesLoading] = useState(false)

    const isAdminOrManager =
        session?.user?.role === "ADMIN" || session?.user?.role === "MANAGER"

    const fetchReviews = useCallback(async () => {
        setLoading(true)
        try {
            const params = new URLSearchParams()
            if (search) params.set("search", search)
            if (filterCycle !== "ALL") params.set("cycle", filterCycle)
            if (filterStatus !== "ALL") params.set("status", filterStatus)
            const res = await fetch(`/api/performance?${params}`)
            if (res.ok) setReviews(await res.json())
        } finally {
            setLoading(false)
        }
    }, [search, filterCycle, filterStatus])

    const fetchDashboard = useCallback(async () => {
        setDashLoading(true)
        try {
            const res = await fetch("/api/performance/dashboard")
            if (res.ok) setDashboard(await res.json())
        } finally {
            setDashLoading(false)
        }
    }, [])

    const fetchTemplates = useCallback(async () => {
        setTemplatesLoading(true)
        try {
            const res = await fetch("/api/performance/templates")
            if (res.ok) setTemplates(await res.json())
        } finally {
            setTemplatesLoading(false)
        }
    }, [])

    const fetchEmployees = useCallback(async () => {
        const res = await fetch("/api/employees?limit=500")
        if (res.ok) {
            const data = await res.json()
            setEmployees(data.employees || data)
        }
    }, [])

    useEffect(() => {
        if (status !== "unauthenticated") {
            fetchReviews()
            fetchDashboard()
        }
    }, [status, fetchReviews, fetchDashboard])

    useEffect(() => {
        if (activeTab === "templates" && templates.length === 0) {
            fetchTemplates()
        }
    }, [activeTab, templates.length, fetchTemplates])

    useEffect(() => {
        if (showCreateModal && employees.length === 0) fetchEmployees()
    }, [showCreateModal, employees.length, fetchEmployees])

    const handleCreateReview = async () => {
        if (!createForm.employeeId || !createForm.periodStart || !createForm.periodEnd) {
            toast.error("Please fill in all required fields")
            return
        }
        setCreating(true)
        try {
            const res = await fetch("/api/performance", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(createForm),
            })
            if (!res.ok) throw new Error(await res.text())
            toast.success("Review created")
            setShowCreateModal(false)
            setCreateForm({ employeeId: "", cycle: "QUARTERLY", periodStart: "", periodEnd: "" })
            fetchReviews()
        } catch (e) {
            toast.error(String(e))
        } finally {
            setCreating(false)
        }
    }

    const openDrawer = async (review: PerformanceReview) => {
        // Fetch full detail with kras/pip
        const res = await fetch(`/api/performance/${review.id}`)
        if (res.ok) {
            const full = await res.json()
            setSelectedReview(full)
        } else {
            setSelectedReview(review)
        }
        setDrawerTab("overview")
    }

    const refreshSelected = async () => {
        if (!selectedReview) return
        const res = await fetch(`/api/performance/${selectedReview.id}`)
        if (res.ok) {
            const full = await res.json()
            setSelectedReview(full)
            setReviews(prev => prev.map(r => r.id === full.id ? full : r))
        }
    }

    // ─── Tabs ──────────────────────────────────────────────────────────────────
    const tabStyle = (active: boolean) => ({
        padding: "10px 20px",
        border: "none",
        background: "none",
        cursor: "pointer",
        fontWeight: active ? 700 : 500,
        fontSize: 14,
        color: active ? "var(--accent)" : "var(--text)",
        borderBottom: active ? "2px solid var(--accent)" : "2px solid transparent",
        transition: "all 0.15s",
    })

    return (
        <div style={{ padding: "24px 28px", minHeight: "100vh", background: "var(--surface)" }}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
                <div>
                    <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: "var(--text)" }}>
                        Performance Management
                    </h1>
                    <p style={{ fontSize: 13, color: "#6b7280", margin: "2px 0 0" }}>
                        Track, review, and improve employee performance
                    </p>
                </div>
                {isAdminOrManager && activeTab === "reviews" && (
                    <button
                        onClick={() => setShowCreateModal(true)}
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                            padding: "9px 18px",
                            background: "var(--accent)",
                            color: "#fff",
                            border: "none",
                            borderRadius: 8,
                            fontWeight: 600,
                            fontSize: 14,
                            cursor: "pointer",
                        }}
                    >
                        <Plus size={16} />
                        New Review
                    </button>
                )}
            </div>

            {/* Tab Bar */}
            <div style={{
                display: "flex",
                borderBottom: "1px solid var(--border)",
                marginBottom: 24,
                gap: 0,
            }}>
                <button style={tabStyle(activeTab === "dashboard")} onClick={() => setActiveTab("dashboard")}>
                    <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <BarChart2 size={14} /> Dashboard
                    </span>
                </button>
                <button style={tabStyle(activeTab === "reviews")} onClick={() => setActiveTab("reviews")}>
                    <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <FileText size={14} /> Reviews
                    </span>
                </button>
                <button style={tabStyle(activeTab === "templates")} onClick={() => setActiveTab("templates")}>
                    <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <Settings size={14} /> Templates
                    </span>
                </button>
            </div>

            {/* ─── DASHBOARD TAB ─────────────────────────────────────────────── */}
            {activeTab === "dashboard" && (
                <DashboardTab data={dashboard} loading={dashLoading} />
            )}

            {/* ─── REVIEWS TAB ───────────────────────────────────────────────── */}
            {activeTab === "reviews" && (
                <ReviewsTab
                    reviews={reviews}
                    loading={loading}
                    search={search}
                    setSearch={setSearch}
                    filterCycle={filterCycle}
                    setFilterCycle={setFilterCycle}
                    filterStatus={filterStatus}
                    setFilterStatus={setFilterStatus}
                    onCardClick={openDrawer}
                    isAdminOrManager={isAdminOrManager}
                    onCreateClick={() => setShowCreateModal(true)}
                />
            )}

            {/* ─── TEMPLATES TAB ─────────────────────────────────────────────── */}
            {activeTab === "templates" && (
                <TemplatesTab templates={templates} loading={templatesLoading} />
            )}

            {/* ─── REVIEW DRAWER ─────────────────────────────────────────────── */}
            {selectedReview && (
                <ReviewDrawer
                    review={selectedReview}
                    tab={drawerTab}
                    setTab={setDrawerTab}
                    onClose={() => setSelectedReview(null)}
                    onRefresh={refreshSelected}
                    isAdminOrManager={isAdminOrManager}
                    session={session}
                    templates={templates}
                    fetchTemplates={fetchTemplates}
                />
            )}

            {/* ─── CREATE MODAL ──────────────────────────────────────────────── */}
            {showCreateModal && (
                <CreateReviewModal
                    employees={employees}
                    form={createForm}
                    setForm={setCreateForm}
                    onClose={() => setShowCreateModal(false)}
                    onSubmit={handleCreateReview}
                    creating={creating}
                />
            )}
        </div>
    )
}

// ─── DashboardTab ─────────────────────────────────────────────────────────────

function DashboardTab({ data, loading }: { data: DashboardData | null; loading: boolean }) {
    if (loading) {
        return (
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: 200 }}>
                <Loader2 size={28} style={{ animation: "spin 1s linear infinite", color: "var(--accent)" }} />
            </div>
        )
    }

    if (!data) return null

    const { summary, rankDistrib, topPerformers, roleAvgScores, monthlyTrend } = data

    const summaryCards = [
        { label: "Total Reviews", value: summary.total, icon: FileText, color: "#3b82f6", bg: "#eff6ff" },
        { label: "Pending Reviews", value: summary.pending, icon: Clock, color: "#d97706", bg: "#fef3c7" },
        { label: "Completed", value: summary.completed, icon: CheckCircle2, color: "#1a9e6e", bg: "#e8f7f1" },
        { label: "Avg Score", value: summary.avgScore.toFixed(2), icon: TrendingUp, color: "#8b5cf6", bg: "#f5f3ff" },
    ]

    const rankCards = [
        { key: "TOP_PERFORMER", label: "Top Performers", color: "#1a9e6e", bg: "#e8f7f1" },
        { key: "HIGH_PERFORMER", label: "High Performers", color: "#2563eb", bg: "#eff6ff" },
        { key: "AVERAGE", label: "Average", color: "#d97706", bg: "#fef3c7" },
        { key: "LOW_PERFORMER", label: "Low Performers", color: "#ef4444", bg: "#fee2e2" },
    ]

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            {/* Summary Cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
                {summaryCards.map(c => (
                    <div key={c.label} style={{
                        background: "#fff",
                        border: "1px solid var(--border)",
                        borderRadius: 12,
                        padding: "18px 20px",
                        display: "flex",
                        alignItems: "center",
                        gap: 14,
                    }}>
                        <div style={{
                            width: 44, height: 44, borderRadius: "50%",
                            background: c.bg, display: "flex", alignItems: "center", justifyContent: "center",
                            flexShrink: 0,
                        }}>
                            <c.icon size={20} color={c.color} />
                        </div>
                        <div>
                            <div style={{ fontSize: 22, fontWeight: 700, color: "var(--text)" }}>{c.value}</div>
                            <div style={{ fontSize: 12, color: "#6b7280" }}>{c.label}</div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Ranking & Actions Ribbons */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div style={{ background: "linear-gradient(135deg, #f0fdf4 0%, #e8f7f1 100%)", borderRadius: 12, padding: 18, border: "1px solid #bbf7d0", display: "flex", alignItems: "center", gap: 14 }}>
                    <div style={{ width: 40, height: 40, background: "#1a9e6e", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center" }}><Award color="#fff" size={20} /></div>
                    <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: "#166534" }}>Performance Rewards Active</div>
                        <div style={{ fontSize: 11, color: "#15803d" }}>Top 10% eligible for quarterly performance bonus</div>
                    </div>
                </div>
                <div style={{ background: "linear-gradient(135deg, #fff1f2 0%, #fff 100%)", borderRadius: 12, padding: 18, border: "1px solid #fecaca", display: "flex", alignItems: "center", gap: 14 }}>
                    <div style={{ width: 40, height: 40, background: "#ef4444", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center" }}><AlertTriangle color="#fff" size={20} /></div>
                    <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: "#991b1b" }}>PIP Mandatory Action</div>
                        <div style={{ fontSize: 11, color: "#b91c1c" }}>{"Score < 2.8 requires Performance Improvement Plan"}</div>
                    </div>
                </div>
            </div>

            {/* Ranking Strip */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
                {rankCards.map(r => (
                    <div key={r.key} style={{
                        background: r.bg,
                        borderRadius: 10,
                        padding: "14px 18px",
                        textAlign: "center",
                        border: `1px solid ${r.color}30`,
                        position: "relative",
                        overflow: "hidden"
                    }}>
                        <div style={{ position: "absolute", right: -5, top: -5, opacity: 0.1 }}><Award size={40} color={r.color} /></div>
                        <div style={{ fontSize: 28, fontWeight: 800, color: r.color }}>
                            {rankDistrib[r.key] ?? 0}
                        </div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: r.color }}>{r.label}</div>
                    </div>
                ))}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr", gap: 20 }}>
                {/* Top 5 Performers */}
                <div style={{
                    background: "#fff",
                    borderRadius: 12,
                    border: "1px solid var(--border)",
                    padding: "18px 20px",
                }}>
                    <h3 style={{ margin: "0 0 14px", fontSize: 14, fontWeight: 700, color: "var(--text)" }}>
                        Top 5 Performers
                    </h3>
                    {topPerformers.length === 0 && (
                        <p style={{ color: "#9ca3af", fontSize: 13 }}>No rated reviews yet</p>
                    )}
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        {topPerformers.map((p, i) => (
                            <div key={p.id} style={{
                                display: "flex", alignItems: "center", gap: 10,
                                padding: "8px 0", borderBottom: i < topPerformers.length - 1 ? "1px solid var(--border)" : "none",
                            }}>
                                <div style={{
                                    width: 24, height: 24, borderRadius: "50%",
                                    background: i === 0 ? "#f59e0b" : i === 1 ? "#9ca3af" : i === 2 ? "#b45309" : "#e5e7eb",
                                    display: "flex", alignItems: "center", justifyContent: "center",
                                    fontSize: 11, fontWeight: 700, color: "#fff",
                                }}>
                                    {i + 1}
                                </div>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>
                                        {p.employee.firstName} {p.employee.lastName}
                                    </div>
                                    <div style={{ fontSize: 11, color: "#6b7280" }}>{p.employee.designation || "—"}</div>
                                </div>
                                <div style={{ textAlign: "right" }}>
                                    <div style={{ fontSize: 13, fontWeight: 700, color: "#1a9e6e" }}>
                                        {p.overallRating?.toFixed(1) ?? "—"}
                                    </div>
                                    {p.performanceRank && (
                                        <Badge
                                            label={RANK_CONFIG[p.performanceRank]?.label ?? p.performanceRank}
                                            color={RANK_CONFIG[p.performanceRank]?.color ?? "#6b7280"}
                                            bg={RANK_CONFIG[p.performanceRank]?.bg ?? "#f3f4f6"}
                                        />
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Monthly Trend */}
                <div style={{
                    background: "#fff",
                    borderRadius: 12,
                    border: "1px solid var(--border)",
                    padding: "18px 20px",
                }}>
                    <h3 style={{ margin: "0 0 14px", fontSize: 14, fontWeight: 700, color: "var(--text)" }}>
                        Monthly Score Trend (Last 6 Months)
                    </h3>
                    <ResponsiveContainer width="100%" height={180}>
                        <LineChart data={monthlyTrend}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                            <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                            <YAxis domain={[0, 5]} tick={{ fontSize: 11 }} />
                            <Tooltip />
                            <Line type="monotone" dataKey="avgScore" stroke="var(--accent)" strokeWidth={2} dot={{ r: 4 }} name="Avg Score" />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Role-wise Avg Score */}
            {roleAvgScores.length > 0 && (
                <div style={{
                    background: "#fff",
                    borderRadius: 12,
                    border: "1px solid var(--border)",
                    padding: "18px 20px",
                }}>
                    <h3 style={{ margin: "0 0 14px", fontSize: 14, fontWeight: 700, color: "var(--text)" }}>
                        Role-wise Avg Score
                    </h3>
                    <ResponsiveContainer width="100%" height={Math.max(120, roleAvgScores.length * 36)}>
                        <BarChart data={roleAvgScores} layout="vertical">
                            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                            <XAxis type="number" domain={[0, 5]} tick={{ fontSize: 11 }} />
                            <YAxis type="category" dataKey="role" width={130} tick={{ fontSize: 11 }} />
                            <Tooltip />
                            <Bar dataKey="avgScore" fill="var(--accent)" radius={[0, 4, 4, 0]} name="Avg Score" />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            )}
        </div>
    )
}

// ─── ReviewsTab ───────────────────────────────────────────────────────────────

function ReviewsTab({
    reviews, loading, search, setSearch,
    filterCycle, setFilterCycle, filterStatus, setFilterStatus,
    onCardClick, isAdminOrManager, onCreateClick,
}: {
    reviews: PerformanceReview[]
    loading: boolean
    search: string
    setSearch: (v: string) => void
    filterCycle: string
    setFilterCycle: (v: string) => void
    filterStatus: string
    setFilterStatus: (v: string) => void
    onCardClick: (r: PerformanceReview) => void
    isAdminOrManager: boolean
    onCreateClick: () => void
}) {
    return (
        <div>
            {/* Toolbar */}
            <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap", alignItems: "center" }}>
                <div style={{ position: "relative", flex: 1, minWidth: 180 }}>
                    <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#9ca3af" }} />
                    <input
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Search employee..."
                        style={{
                            width: "100%", paddingLeft: 32, paddingRight: 10, height: 36,
                            border: "1px solid var(--border)", borderRadius: 8, fontSize: 13,
                            background: "#fff", color: "var(--text)", boxSizing: "border-box",
                        }}
                    />
                </div>
                <select
                    value={filterCycle}
                    onChange={e => setFilterCycle(e.target.value)}
                    style={{
                        height: 36, padding: "0 10px", border: "1px solid var(--border)",
                        borderRadius: 8, fontSize: 13, background: "#fff", color: "var(--text)",
                    }}
                >
                    <option value="ALL">All Cycles</option>
                    {(["MONTHLY", "QUARTERLY", "HALF_YEARLY", "ANNUAL"] as ReviewCycle[]).map(c => (
                        <option key={c} value={c}>{CYCLE_CONFIG[c].label}</option>
                    ))}
                </select>
                <select
                    value={filterStatus}
                    onChange={e => setFilterStatus(e.target.value)}
                    style={{
                        height: 36, padding: "0 10px", border: "1px solid var(--border)",
                        borderRadius: 8, fontSize: 13, background: "#fff", color: "var(--text)",
                    }}
                >
                    <option value="ALL">All Status</option>
                    {(["DRAFT", "SUBMITTED", "ACKNOWLEDGED", "COMPLETED"] as ReviewStatus[]).map(s => (
                        <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>
                    ))}
                </select>
            </div>

            {loading ? (
                <div style={{ display: "flex", justifyContent: "center", padding: 60 }}>
                    <Loader2 size={28} style={{ animation: "spin 1s linear infinite", color: "var(--accent)" }} />
                </div>
            ) : reviews.length === 0 ? (
                <div style={{
                    textAlign: "center", padding: "60px 20px",
                    color: "#9ca3af", fontSize: 14,
                    background: "#fff", borderRadius: 12, border: "1px solid var(--border)",
                }}>
                    <FileText size={36} style={{ margin: "0 auto 12px", display: "block", color: "#d1d5db" }} />
                    No reviews found
                </div>
            ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
                    {reviews.map(r => (
                        <ReviewCard key={r.id} review={r} onClick={() => onCardClick(r)} />
                    ))}
                </div>
            )}
        </div>
    )
}

// ─── ReviewCard ───────────────────────────────────────────────────────────────

function ReviewCard({ review, onClick }: { review: PerformanceReview; onClick: () => void }) {
    const emp = review.employee
    const name = `${emp.firstName} ${emp.lastName}`
    const initials = `${emp.firstName[0]}${emp.lastName[0]}`.toUpperCase()
    const avatarColor = getAvatarColor(emp.firstName, emp.lastName)
    const statusCfg = STATUS_CONFIG[review.status]
    const cycleCfg = CYCLE_CONFIG[review.cycle]
    const rankCfg = review.performanceRank ? RANK_CONFIG[review.performanceRank] : null

    return (
        <div
            onClick={onClick}
            style={{
                background: "#fff",
                border: "1px solid var(--border)",
                borderRadius: 12,
                padding: "16px 18px",
                cursor: "pointer",
                transition: "box-shadow 0.15s, border-color 0.15s",
            }}
            onMouseEnter={e => {
                (e.currentTarget as HTMLDivElement).style.boxShadow = "0 4px 16px rgba(0,0,0,0.10)"
                ;(e.currentTarget as HTMLDivElement).style.borderColor = "var(--accent)"
            }}
            onMouseLeave={e => {
                (e.currentTarget as HTMLDivElement).style.boxShadow = "none"
                ;(e.currentTarget as HTMLDivElement).style.borderColor = "var(--border)"
            }}
        >
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                <div style={{
                    width: 42, height: 42, borderRadius: "50%",
                    background: avatarColor, display: "flex", alignItems: "center",
                    justifyContent: "center", fontWeight: 700, fontSize: 15, color: "#fff",
                    flexShrink: 0,
                }}>
                    {initials}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {name}
                    </div>
                    <div style={{ fontSize: 12, color: "#6b7280" }}>{emp.designation || "—"}</div>
                </div>
                <Badge label={statusCfg.label} color={statusCfg.color} bg={statusCfg.bg} />
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                <Badge label={cycleCfg.label} color={cycleCfg.color} bg={cycleCfg.bg} />
                <span style={{ fontSize: 12, color: "#9ca3af" }}>
                    {fmtDate(review.periodStart)} – {fmtDate(review.periodEnd)}
                </span>
            </div>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <StarRating value={review.overallRating} readonly size={14} />
                    {review.overallRating && (
                        <span style={{ fontSize: 13, fontWeight: 700, color: "#f59e0b" }}>
                            {review.overallRating.toFixed(1)}
                        </span>
                    )}
                </div>
                {rankCfg && (
                    <Badge label={rankCfg.label} color={rankCfg.color} bg={rankCfg.bg} />
                )}
            </div>
        </div>
    )
}

// ─── ReviewDrawer ─────────────────────────────────────────────────────────────

function ReviewDrawer({
    review, tab, setTab, onClose, onRefresh,
    isAdminOrManager, session, templates, fetchTemplates,
}: {
    review: PerformanceReview
    tab: string
    setTab: (t: "overview" | "self" | "kra" | "manager" | "hr" | "pip") => void
    onClose: () => void
    onRefresh: () => void
    isAdminOrManager: boolean
    session: ReturnType<typeof useSession>["data"]
    templates: KPITemplate[]
    fetchTemplates: () => void
}) {
    const drawerTabs = [
        { id: "overview", label: "Overview" },
        { id: "self", label: "Self Review" },
        { id: "kra", label: "KRA / KPI" },
        { id: "manager", label: "Manager Review" },
        { id: "hr", label: "HR Approval" },
        { id: "pip", label: "PIP" },
    ]

    return (
        <div style={{
            position: "fixed", right: 0, top: 0, bottom: 0,
            width: 640, background: "#fff",
            boxShadow: "-4px 0 24px rgba(0,0,0,0.12)",
            zIndex: 1000, display: "flex", flexDirection: "column",
            borderLeft: "1px solid var(--border)",
        }}>
            {/* Drawer Header */}
            <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "16px 20px", borderBottom: "1px solid var(--border)",
            }}>
                <div>
                    <div style={{ fontWeight: 700, fontSize: 15, color: "var(--text)" }}>
                        {review.employee.firstName} {review.employee.lastName}
                    </div>
                    <div style={{ fontSize: 12, color: "#6b7280" }}>
                        {review.employee.designation || "—"} · {CYCLE_CONFIG[review.cycle]?.label}
                    </div>
                </div>
                <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}>
                    <X size={20} color="#6b7280" />
                </button>
            </div>

            {/* Sub-tabs */}
            <div style={{
                display: "flex", borderBottom: "1px solid var(--border)",
                overflowX: "auto", flexShrink: 0,
            }}>
                {drawerTabs.map(t => (
                    <button
                        key={t.id}
                        onClick={() => setTab(t.id as "overview" | "self" | "kra" | "manager" | "hr" | "pip")}
                        style={{
                            padding: "10px 16px", border: "none", background: "none", cursor: "pointer",
                            fontWeight: tab === t.id ? 700 : 500, fontSize: 13,
                            color: tab === t.id ? "var(--accent)" : "#6b7280",
                            borderBottom: tab === t.id ? "2px solid var(--accent)" : "2px solid transparent",
                            whiteSpace: "nowrap",
                        }}
                    >
                        {t.label}
                    </button>
                ))}
            </div>

            {/* Drawer Content */}
            <div style={{ flex: 1, overflowY: "auto", padding: "20px" }}>
                {tab === "overview" && <DrawerOverview review={review} />}
                {tab === "self" && (
                    <DrawerSelfReview review={review} onRefresh={onRefresh} isAdminOrManager={isAdminOrManager} />
                )}
                {tab === "kra" && (
                    <DrawerKRAKPI
                        review={review}
                        onRefresh={onRefresh}
                        isAdminOrManager={isAdminOrManager}
                        templates={templates}
                        fetchTemplates={fetchTemplates}
                    />
                )}
                {tab === "manager" && (
                    <DrawerManagerReview review={review} onRefresh={onRefresh} isAdminOrManager={isAdminOrManager} />
                )}
                {tab === "hr" && (
                    <DrawerHRApproval review={review} onRefresh={onRefresh} session={session} />
                )}
                {tab === "pip" && (
                    <DrawerPIP review={review} onRefresh={onRefresh} isAdminOrManager={isAdminOrManager} />
                )}
            </div>
        </div>
    )
}

// ─── DrawerOverview ───────────────────────────────────────────────────────────

function DrawerOverview({ review }: { review: PerformanceReview }) {
    const emp = review.employee
    const statusCfg = STATUS_CONFIG[review.status]
    const rankCfg = review.performanceRank ? RANK_CONFIG[review.performanceRank] : null

    const rows: [string, React.ReactNode][] = [
        ["Employee ID", emp.employeeId],
        ["Branch", emp.branch.name],
        ["Designation", emp.designation || "—"],
        ["Review Cycle", CYCLE_CONFIG[review.cycle]?.label],
        ["Period", `${fmtDateFull(review.periodStart)} — ${fmtDateFull(review.periodEnd)}`],
        ["Status", <Badge key="s" label={statusCfg.label} color={statusCfg.color} bg={statusCfg.bg} />],
        ["Overall Rating", review.overallRating != null ? (
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <StarRating value={review.overallRating} readonly size={14} />
                <strong>{review.overallRating.toFixed(1)}</strong>
            </span>
        ) : "—"],
        ["Performance Rank", rankCfg ? <Badge key="r" label={rankCfg.label} color={rankCfg.color} bg={rankCfg.bg} /> : "—"],
        ["Promotion Recommended", review.promotionRecommended ? "Yes" : "No"],
        ["Increment %", review.incrementPercent != null ? `${review.incrementPercent}%` : "—"],
        ["Bonus %", review.bonusPercent != null ? `${review.bonusPercent}%` : "—"],
        ["Submitted", fmtDateFull(review.submittedAt)],
        ["Acknowledged", fmtDateFull(review.acknowledgedAt)],
        ["Completed", fmtDateFull(review.completedAt)],
        ["HR Approved", review.hrApprovedAt ? fmtDateFull(review.hrApprovedAt) : "—"],
    ]

    return (
        <div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <tbody>
                    {rows.map(([label, val]) => (
                        <tr key={label} style={{ borderBottom: "1px solid var(--border)" }}>
                            <td style={{ padding: "9px 0", color: "#6b7280", width: "44%" }}>{label}</td>
                            <td style={{ padding: "9px 0", color: "var(--text)", fontWeight: 500 }}>{val}</td>
                        </tr>
                    ))}
                </tbody>
            </table>

            {review.strengths && (
                <div style={{ marginTop: 16 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>Strengths</div>
                    <div style={{ fontSize: 13, color: "#374151", lineHeight: 1.6 }}>{review.strengths}</div>
                </div>
            )}
            {review.improvements && (
                <div style={{ marginTop: 12 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>Areas of Improvement</div>
                    <div style={{ fontSize: 13, color: "#374151", lineHeight: 1.6 }}>{review.improvements}</div>
                </div>
            )}
        </div>
    )
}

// ─── DrawerSelfReview ─────────────────────────────────────────────────────────

function DrawerSelfReview({
    review, onRefresh, isAdminOrManager,
}: {
    review: PerformanceReview
    onRefresh: () => void
    isAdminOrManager: boolean
}) {
    const [selfRating, setSelfRating] = useState<number>(review.selfRating ?? 0)
    const [selfComments, setSelfComments] = useState(review.selfComments ?? "")
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        setSelfRating(review.selfRating ?? 0)
        setSelfComments(review.selfComments ?? "")
    }, [review.selfRating, review.selfComments])

    const handleSave = async () => {
        setSaving(true)
        try {
            const res = await fetch(`/api/performance/${review.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ selfRating, selfComments }),
            })
            if (!res.ok) throw new Error(await res.text())
            toast.success("Self review saved")
            onRefresh()
        } catch (e) {
            toast.error(String(e))
        } finally {
            setSaving(false)
        }
    }

    const ratingLabels: Record<number, string> = {
        1: "Poor", 2: "Needs Improvement", 3: "Meets Expectations",
        4: "Exceeds Expectations", 5: "Outstanding",
    }

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <div>
                <label style={{ fontWeight: 600, fontSize: 13, display: "block", marginBottom: 8 }}>
                    Self Rating (1–5 Stars)
                </label>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <StarRating value={selfRating} onChange={setSelfRating} size={22} />
                    {selfRating > 0 && (
                        <span style={{ fontSize: 13, color: "#6b7280" }}>{ratingLabels[selfRating]}</span>
                    )}
                </div>
            </div>

            <div>
                <label style={{ fontWeight: 600, fontSize: 13, display: "block", marginBottom: 6 }}>
                    Self Assessment Comments
                </label>
                <textarea
                    value={selfComments}
                    onChange={e => setSelfComments(e.target.value)}
                    rows={6}
                    placeholder="Describe your performance, achievements, and challenges..."
                    style={{
                        width: "100%", padding: "10px 12px", border: "1px solid var(--border)",
                        borderRadius: 8, fontSize: 13, resize: "vertical", color: "var(--text)",
                        boxSizing: "border-box",
                    }}
                />
            </div>

            <button
                onClick={handleSave}
                disabled={saving}
                style={{
                    display: "flex", alignItems: "center", gap: 6, padding: "9px 18px",
                    background: "var(--accent)", color: "#fff", border: "none", borderRadius: 8,
                    fontWeight: 600, fontSize: 13, cursor: saving ? "not-allowed" : "pointer",
                    alignSelf: "flex-start", opacity: saving ? 0.7 : 1,
                }}
            >
                {saving ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <Check size={14} />}
                Save Self Review
            </button>
        </div>
    )
}

// ─── DrawerKRAKPI ─────────────────────────────────────────────────────────────

function DrawerKRAKPI({
    review, onRefresh, isAdminOrManager, templates, fetchTemplates,
}: {
    review: PerformanceReview
    onRefresh: () => void
    isAdminOrManager: boolean
    templates: KPITemplate[]
    fetchTemplates: () => void
}) {
    const [showAddKRA, setShowAddKRA] = useState(false)
    const [newKRATitle, setNewKRATitle] = useState("")
    const [newKRAWeight, setNewKRAWeight] = useState(25)
    const [addingKRA, setAddingKRA] = useState(false)
    const [showTemplateLoad, setShowTemplateLoad] = useState(false)
    const [isSyncing, setIsSyncing] = useState(false)

    const handleSync = async () => {
        setIsSyncing(true)
        try {
            const res = await fetch(`/api/performance/${review.id}/sync`, { method: "POST" })
            if (!res.ok) throw new Error(await res.text())
            toast.success("KPI data synced from other modules")
            onRefresh()
        } catch (e) {
            toast.error(String(e))
        } finally {
            setIsSyncing(false)
        }
    }

    const kras = review.kras ?? []
    const loosekpis = review.kpis?.filter(k => !k.kraId) ?? []

    const calcScore = calcOverallScore(kras)

    const handleAddKRA = async () => {
        if (!newKRATitle) return
        setAddingKRA(true)
        try {
            const res = await fetch(`/api/performance/${review.id}/kras`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ title: newKRATitle, weightage: newKRAWeight }),
            })
            if (!res.ok) throw new Error(await res.text())
            toast.success("KRA added")
            setNewKRATitle("")
            setNewKRAWeight(25)
            setShowAddKRA(false)
            onRefresh()
        } catch (e) {
            toast.error(String(e))
        } finally {
            setAddingKRA(false)
        }
    }

    const handleLoadTemplate = async (role: string) => {
        if (templates.length === 0) await fetchTemplates()
        const roleTemplates = templates.filter(t => t.role === role)
        if (!roleTemplates.length) {
            toast.error("No templates for this role")
            return
        }
        // Group by kraTitle
        const kraMap: Record<string, KPITemplate[]> = {}
        for (const t of roleTemplates) {
            if (!kraMap[t.kraTitle]) kraMap[t.kraTitle] = []
            kraMap[t.kraTitle].push(t)
        }
        for (const [kraTitle, kpis] of Object.entries(kraMap)) {
            const res = await fetch(`/api/performance/${review.id}/kras`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    title: kraTitle,
                    weightage: 25,
                    kpis: kpis.map(k => ({
                        title: k.kpiTitle,
                        target: k.targetHint || "—",
                        weightage: k.weightage,
                    })),
                }),
            })
            if (!res.ok) toast.error(`Failed to add KRA: ${kraTitle}`)
        }
        toast.success("Template loaded")
        setShowTemplateLoad(false)
        onRefresh()
    }

    return (
        <div>
            {/* Score summary */}
            {calcScore !== null && (
                <div style={{
                    background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 10,
                    padding: "12px 16px", marginBottom: 16, display: "flex", alignItems: "center", gap: 12,
                }}>
                    <TrendingUp size={18} color="#1a9e6e" />
                    <div>
                        <div style={{ fontSize: 13, color: "#166534" }}>
                            <strong>Calculated Overall Score:</strong> {calcScore.toFixed(2)} / 5
                        </div>
                        <div style={{ fontSize: 12, color: "#15803d" }}>
                            Rank: {RANK_CONFIG[calcRank(calcScore)]?.label}
                        </div>
                    </div>
                </div>
            )}

            {/* Toolbar */}
            {isAdminOrManager && (
                <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                    <button
                        onClick={() => setShowAddKRA(v => !v)}
                        style={{
                            display: "flex", alignItems: "center", gap: 6, padding: "7px 14px",
                            background: "var(--accent)", color: "#fff", border: "none",
                            borderRadius: 7, fontSize: 13, cursor: "pointer", fontWeight: 600,
                        }}
                    >
                        <Plus size={14} /> Add KRA
                    </button>
                    <button
                        onClick={() => {
                            if (templates.length === 0) fetchTemplates()
                            setShowTemplateLoad(v => !v)
                        }}
                        style={{
                            display: "flex", alignItems: "center", gap: 6, padding: "7px 14px",
                            background: "#fff", color: "var(--accent)", border: "1px solid var(--accent)",
                            borderRadius: 7, fontSize: 13, cursor: "pointer", fontWeight: 600,
                        }}
                    >
                        <Settings size={14} /> Load Template
                    </button>
                    <button
                        onClick={handleSync}
                        disabled={isSyncing}
                        style={{
                            display: "flex", alignItems: "center", gap: 6, padding: "7px 14px",
                            background: "#fff", color: "#1a9e6e", border: "1px solid #1a9e6e",
                            borderRadius: 7, fontSize: 13, cursor: isSyncing ? "not-allowed" : "pointer", fontWeight: 600,
                            marginLeft: "auto"
                        }}
                    >
                        {isSyncing ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <RefreshCw size={14} />}
                        Sync Automation
                    </button>
                </div>
            )}

            {/* Load template dropdown */}
            {showTemplateLoad && (
                <div style={{
                    background: "#fff", border: "1px solid var(--border)", borderRadius: 8,
                    padding: 14, marginBottom: 14,
                }}>
                    <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>Select role to load template</div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {["INSPECTOR", "HR_RECRUITER", "HR_MANAGER", "PAYROLL_MANAGER"].map(r => (
                            <button
                                key={r}
                                onClick={() => handleLoadTemplate(r)}
                                style={{
                                    padding: "6px 12px", borderRadius: 6, border: "1px solid var(--border)",
                                    background: "#f9fafb", cursor: "pointer", fontSize: 12, fontWeight: 600,
                                    color: "var(--text)",
                                }}
                            >
                                {r.replace(/_/g, " ")}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Add KRA Form */}
            {showAddKRA && (
                <div style={{
                    background: "#f9fafb", border: "1px solid var(--border)", borderRadius: 8,
                    padding: 14, marginBottom: 14,
                }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
                        <div style={{ flex: 1 }}>
                            <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>KRA Title</label>
                            <input
                                value={newKRATitle}
                                onChange={e => setNewKRATitle(e.target.value)}
                                placeholder="e.g. Inspection Accuracy"
                                style={{ width: "100%", padding: "7px 10px", border: "1px solid var(--border)", borderRadius: 6, fontSize: 13, boxSizing: "border-box" }}
                            />
                        </div>
                        <div style={{ width: 80 }}>
                            <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>Weight %</label>
                            <input
                                type="number"
                                value={newKRAWeight}
                                onChange={e => setNewKRAWeight(Number(e.target.value))}
                                style={{ width: "100%", padding: "7px 10px", border: "1px solid var(--border)", borderRadius: 6, fontSize: 13 }}
                            />
                        </div>
                        <button
                            onClick={handleAddKRA}
                            disabled={addingKRA}
                            style={{
                                padding: "7px 14px", background: "var(--accent)", color: "#fff",
                                border: "none", borderRadius: 6, cursor: "pointer", fontWeight: 600, fontSize: 13,
                            }}
                        >
                            {addingKRA ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : "Add"}
                        </button>
                    </div>
                </div>
            )}

            {/* KRAs */}
            {kras.length === 0 && loosekpis.length === 0 && (
                <div style={{ color: "#9ca3af", fontSize: 13, padding: "20px 0", textAlign: "center" }}>
                    No KRAs or KPIs yet. Add a KRA or load a template.
                </div>
            )}

            {kras.map(kra => (
                <KRABlock key={kra.id} kra={kra} reviewId={review.id} onRefresh={onRefresh} isAdminOrManager={isAdminOrManager} />
            ))}

            {/* Loose KPIs (no KRA) */}
            {loosekpis.length > 0 && (
                <div style={{ marginTop: 16 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: "#6b7280", marginBottom: 8 }}>KPIs (ungrouped)</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {loosekpis.map(kpi => (
                            <KPIRow key={kpi.id} kpi={kpi} onRefresh={onRefresh} isAdminOrManager={isAdminOrManager} />
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}

// ─── KRABlock ─────────────────────────────────────────────────────────────────

function KRABlock({
    kra, reviewId, onRefresh, isAdminOrManager,
}: {
    kra: KRA
    reviewId: string
    onRefresh: () => void
    isAdminOrManager: boolean
}) {
    const [showAddKPI, setShowAddKPI] = useState(false)
    const [newKPITitle, setNewKPITitle] = useState("")
    const [newKPITarget, setNewKPITarget] = useState("")
    const [newKPIWeight, setNewKPIWeight] = useState(10)
    const [addingKPI, setAddingKPI] = useState(false)

    // KRA score calc
    let kraScore: number | null = null
    if (kra.kpis.length > 0) {
        let sum = 0, wSum = 0
        for (const kpi of kra.kpis) {
            const rating = kpi.rating ?? 3
            sum += rating * kpi.weightage
            wSum += kpi.weightage
        }
        if (wSum > 0) kraScore = Math.round((sum / wSum) * 100) / 100
    }

    const handleAddKPI = async () => {
        if (!newKPITitle || !newKPITarget) return
        setAddingKPI(true)
        try {
            const res = await fetch(`/api/performance/${reviewId}/kpis`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    title: newKPITitle,
                    target: newKPITarget,
                    weightage: newKPIWeight,
                    kraId: kra.id,
                }),
            })
            if (!res.ok) throw new Error(await res.text())
            toast.success("KPI added")
            setNewKPITitle(""); setNewKPITarget(""); setNewKPIWeight(10)
            setShowAddKPI(false)
            onRefresh()
        } catch (e) {
            toast.error(String(e))
        } finally {
            setAddingKPI(false)
        }
    }

    return (
        <div style={{
            border: "1px solid var(--border)", borderRadius: 10,
            marginBottom: 14, overflow: "hidden",
        }}>
            <div style={{
                background: "#f8fafc", padding: "10px 14px",
                display: "flex", alignItems: "center", justifyContent: "space-between",
            }}>
                <div>
                    <span style={{ fontWeight: 700, fontSize: 13, color: "var(--text)" }}>{kra.title}</span>
                    <span style={{ fontSize: 12, color: "#6b7280", marginLeft: 8 }}>Weight: {kra.weightage}%</span>
                    {kraScore !== null && (
                        <span style={{ fontSize: 12, color: "#1a9e6e", marginLeft: 8, fontWeight: 600 }}>
                            Score: {kraScore.toFixed(2)}
                        </span>
                    )}
                </div>
                {isAdminOrManager && (
                    <button
                        onClick={() => setShowAddKPI(v => !v)}
                        style={{
                            display: "flex", alignItems: "center", gap: 4, padding: "4px 10px",
                            background: "var(--accent)", color: "#fff", border: "none",
                            borderRadius: 5, fontSize: 11, cursor: "pointer", fontWeight: 600,
                        }}
                    >
                        <Plus size={11} /> KPI
                    </button>
                )}
            </div>

            {showAddKPI && (
                <div style={{ padding: "10px 14px", background: "#fafbff", borderBottom: "1px solid var(--border)" }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
                        <input
                            value={newKPITitle}
                            onChange={e => setNewKPITitle(e.target.value)}
                            placeholder="KPI Title"
                            style={{ flex: 2, padding: "6px 8px", border: "1px solid var(--border)", borderRadius: 5, fontSize: 12 }}
                        />
                        <input
                            value={newKPITarget}
                            onChange={e => setNewKPITarget(e.target.value)}
                            placeholder="Target"
                            style={{ flex: 1, padding: "6px 8px", border: "1px solid var(--border)", borderRadius: 5, fontSize: 12 }}
                        />
                        <input
                            type="number"
                            value={newKPIWeight}
                            onChange={e => setNewKPIWeight(Number(e.target.value))}
                            placeholder="Weight"
                            style={{ width: 60, padding: "6px 8px", border: "1px solid var(--border)", borderRadius: 5, fontSize: 12 }}
                        />
                        <button
                            onClick={handleAddKPI}
                            disabled={addingKPI}
                            style={{
                                padding: "6px 12px", background: "var(--accent)", color: "#fff",
                                border: "none", borderRadius: 5, cursor: "pointer", fontWeight: 600, fontSize: 12,
                            }}
                        >
                            Add
                        </button>
                    </div>
                </div>
            )}

            <div style={{ padding: "0 14px" }}>
                {kra.kpis.length === 0 && (
                    <div style={{ padding: "12px 0", color: "#9ca3af", fontSize: 12 }}>No KPIs yet</div>
                )}
                {kra.kpis.map(kpi => (
                    <KPIRow key={kpi.id} kpi={kpi} onRefresh={onRefresh} isAdminOrManager={isAdminOrManager} />
                ))}
            </div>
        </div>
    )
}

// ─── KPIRow ───────────────────────────────────────────────────────────────────

function KPIRow({
    kpi, onRefresh, isAdminOrManager,
}: {
    kpi: KPI
    onRefresh: () => void
    isAdminOrManager: boolean
}) {
    const [actual, setActual] = useState(kpi.actual ?? "")
    const [rating, setRating] = useState<number>(kpi.rating ?? 0)
    const [saving, setSaving] = useState(false)
    const dirty = useRef(false)

    useEffect(() => {
        setActual(kpi.actual ?? "")
        setRating(kpi.rating ?? 0)
    }, [kpi.actual, kpi.rating])

    const handleSave = async () => {
        setSaving(true)
        try {
            const res = await fetch(`/api/performance/${kpi.reviewId}/kpis/${kpi.id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ actual, rating }),
            })
            if (!res.ok) throw new Error(await res.text())
            onRefresh()
        } catch (e) {
            toast.error(String(e))
        } finally {
            setSaving(false)
            dirty.current = false
        }
    }

    const targetNum = parseFloat(kpi.target)
    const actualNum = parseFloat(actual)
    let weightedScore: number | null = null
    if (!isNaN(targetNum) && !isNaN(actualNum) && targetNum > 0 && rating > 0) {
        weightedScore = Math.round((actualNum / targetNum) * rating * kpi.weightage * 100) / 100
    }

    return (
        <div style={{
            display: "grid",
            gridTemplateColumns: "1fr 80px 80px 100px 60px 36px",
            gap: 8, padding: "10px 0", borderBottom: "1px solid var(--border)",
            alignItems: "center", fontSize: 12,
        }}>
            <div>
                <div style={{ fontWeight: 600, color: "var(--text)", fontSize: 13 }}>{kpi.title}</div>
                <div style={{ color: "#6b7280" }}>Target: {kpi.target} · Weight: {kpi.weightage}%</div>
            </div>
            <input
                value={actual}
                onChange={e => { setActual(e.target.value); dirty.current = true }}
                placeholder="Actual"
                style={{
                    padding: "5px 7px", border: "1px solid var(--border)", borderRadius: 5,
                    fontSize: 12, width: "100%", boxSizing: "border-box",
                }}
            />
            <div>
                <StarRating value={rating} onChange={v => { setRating(v); dirty.current = true }} size={13} />
            </div>
            <div style={{ fontSize: 11, color: "#6b7280" }}>
                {weightedScore !== null ? `Score: ${weightedScore}` : "—"}
            </div>
            <div style={{ fontSize: 11, color: "#9ca3af" }}>w={kpi.weightage}</div>
            <button
                onClick={handleSave}
                disabled={saving}
                title="Save"
                style={{
                    background: "none", border: "1px solid var(--border)", borderRadius: 5,
                    cursor: "pointer", padding: 4, display: "flex", alignItems: "center", justifyContent: "center",
                }}
            >
                {saving
                    ? <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} />
                    : <Check size={12} color="#1a9e6e" />
                }
            </button>
        </div>
    )
}

// ─── DrawerManagerReview ──────────────────────────────────────────────────────

function DrawerManagerReview({
    review, onRefresh, isAdminOrManager,
}: {
    review: PerformanceReview
    onRefresh: () => void
    isAdminOrManager: boolean
}) {
    const [form, setForm] = useState({
        overallRating: review.overallRating ?? 0,
        managerComments: review.managerComments ?? "",
        strengths: review.strengths ?? "",
        improvements: review.improvements ?? "",
        promotionRecommended: review.promotionRecommended,
        incrementPercent: review.incrementPercent ?? "",
        bonusPercent: review.bonusPercent ?? "",
        performanceRank: review.performanceRank ?? "",
        pipRequired: review.pipRequired,
    })
    const [saving, setSaving] = useState(false)
    const [submitting, setSubmitting] = useState(false)

    useEffect(() => {
        setForm({
            overallRating: review.overallRating ?? 0,
            managerComments: review.managerComments ?? "",
            strengths: review.strengths ?? "",
            improvements: review.improvements ?? "",
            promotionRecommended: review.promotionRecommended,
            incrementPercent: review.incrementPercent ?? "",
            bonusPercent: review.bonusPercent ?? "",
            performanceRank: review.performanceRank ?? "",
            pipRequired: review.pipRequired,
        })
    }, [review])

    // Auto-suggest rank from rating
    useEffect(() => {
        if (form.overallRating > 0 && !form.performanceRank) {
            setForm(f => ({ ...f, performanceRank: calcRank(f.overallRating) }))
        }
    }, [form.overallRating]) // eslint-disable-line react-hooks/exhaustive-deps

    const handleSave = async () => {
        setSaving(true)
        try {
            const res = await fetch(`/api/performance/${review.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    overallRating: form.overallRating || null,
                    managerComments: form.managerComments,
                    strengths: form.strengths,
                    improvements: form.improvements,
                    promotionRecommended: form.promotionRecommended,
                    incrementPercent: form.incrementPercent !== "" ? Number(form.incrementPercent) : null,
                    bonusPercent: form.bonusPercent !== "" ? Number(form.bonusPercent) : null,
                    performanceRank: form.performanceRank || null,
                    pipRequired: form.pipRequired,
                }),
            })
            if (!res.ok) throw new Error(await res.text())
            toast.success("Review saved")
            onRefresh()
        } catch (e) {
            toast.error(String(e))
        } finally {
            setSaving(false)
        }
    }

    const handleSubmit = async () => {
        setSubmitting(true)
        try {
            await handleSave()
            const res = await fetch(`/api/performance/${review.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: "SUBMITTED" }),
            })
            if (!res.ok) throw new Error(await res.text())
            toast.success("Review submitted")
            onRefresh()
        } catch (e) {
            toast.error(String(e))
        } finally {
            setSubmitting(false)
        }
    }

    if (!isAdminOrManager) {
        return (
            <div style={{ fontSize: 13, color: "#6b7280" }}>
                <p>Manager review details:</p>
                <p><strong>Rating:</strong> {review.overallRating ?? "—"}</p>
                <p><strong>Comments:</strong> {review.managerComments || "—"}</p>
                <p><strong>Strengths:</strong> {review.strengths || "—"}</p>
                <p><strong>Improvements:</strong> {review.improvements || "—"}</p>
            </div>
        )
    }

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
                <label style={{ fontWeight: 600, fontSize: 13, display: "block", marginBottom: 6 }}>Overall Rating</label>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <StarRating value={form.overallRating} onChange={v => setForm(f => ({ ...f, overallRating: v }))} size={22} />
                    {form.overallRating > 0 && (
                        <span style={{ fontSize: 13, color: "#6b7280" }}>
                            {["", "Poor", "Needs Improvement", "Meets Expectations", "Exceeds Expectations", "Outstanding"][form.overallRating]}
                        </span>
                    )}
                </div>
            </div>

            <div>
                <label style={{ fontWeight: 600, fontSize: 13, display: "block", marginBottom: 4 }}>Manager Comments</label>
                <textarea
                    value={form.managerComments}
                    onChange={e => setForm(f => ({ ...f, managerComments: e.target.value }))}
                    rows={3}
                    style={{ width: "100%", padding: "8px 10px", border: "1px solid var(--border)", borderRadius: 7, fontSize: 13, resize: "vertical", boxSizing: "border-box" }}
                />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                    <label style={{ fontWeight: 600, fontSize: 13, display: "block", marginBottom: 4 }}>Strengths</label>
                    <textarea
                        value={form.strengths}
                        onChange={e => setForm(f => ({ ...f, strengths: e.target.value }))}
                        rows={3}
                        style={{ width: "100%", padding: "8px 10px", border: "1px solid var(--border)", borderRadius: 7, fontSize: 13, resize: "vertical", boxSizing: "border-box" }}
                    />
                </div>
                <div>
                    <label style={{ fontWeight: 600, fontSize: 13, display: "block", marginBottom: 4 }}>Areas of Improvement</label>
                    <textarea
                        value={form.improvements}
                        onChange={e => setForm(f => ({ ...f, improvements: e.target.value }))}
                        rows={3}
                        style={{ width: "100%", padding: "8px 10px", border: "1px solid var(--border)", borderRadius: 7, fontSize: 13, resize: "vertical", boxSizing: "border-box" }}
                    />
                </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                <div>
                    <label style={{ fontWeight: 600, fontSize: 13, display: "block", marginBottom: 4 }}>Increment %</label>
                    <input
                        type="number"
                        value={form.incrementPercent}
                        onChange={e => setForm(f => ({ ...f, incrementPercent: e.target.value }))}
                        style={{ width: "100%", padding: "7px 10px", border: "1px solid var(--border)", borderRadius: 7, fontSize: 13, boxSizing: "border-box" }}
                    />
                </div>
                <div>
                    <label style={{ fontWeight: 600, fontSize: 13, display: "block", marginBottom: 4 }}>Bonus %</label>
                    <input
                        type="number"
                        value={form.bonusPercent}
                        onChange={e => setForm(f => ({ ...f, bonusPercent: e.target.value }))}
                        style={{ width: "100%", padding: "7px 10px", border: "1px solid var(--border)", borderRadius: 7, fontSize: 13, boxSizing: "border-box" }}
                    />
                </div>
                <div>
                    <label style={{ fontWeight: 600, fontSize: 13, display: "block", marginBottom: 4 }}>Performance Rank</label>
                    <select
                        value={form.performanceRank}
                        onChange={e => setForm(f => ({ ...f, performanceRank: e.target.value }))}
                        style={{ width: "100%", padding: "7px 10px", border: "1px solid var(--border)", borderRadius: 7, fontSize: 13, background: "#fff" }}
                    >
                        <option value="">— Select —</option>
                        <option value="TOP_PERFORMER">Top Performer</option>
                        <option value="HIGH_PERFORMER">High Performer</option>
                        <option value="AVERAGE">Average</option>
                        <option value="LOW_PERFORMER">Low Performer</option>
                    </select>
                </div>
            </div>

            <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                    <input
                        type="checkbox"
                        checked={form.promotionRecommended}
                        onChange={e => setForm(f => ({ ...f, promotionRecommended: e.target.checked }))}
                    />
                    Promotion Recommended
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                    <input
                        type="checkbox"
                        checked={form.pipRequired}
                        onChange={e => setForm(f => ({ ...f, pipRequired: e.target.checked }))}
                    />
                    PIP Required
                </label>
            </div>

            <div style={{ display: "flex", gap: 10 }}>
                <button
                    onClick={handleSave}
                    disabled={saving}
                    style={{
                        display: "flex", alignItems: "center", gap: 6, padding: "9px 18px",
                        background: "#fff", color: "var(--accent)", border: "1px solid var(--accent)",
                        borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: saving ? "not-allowed" : "pointer",
                    }}
                >
                    {saving ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <Check size={14} />}
                    Save
                </button>
                {review.status === "DRAFT" && (
                    <button
                        onClick={handleSubmit}
                        disabled={submitting}
                        style={{
                            display: "flex", alignItems: "center", gap: 6, padding: "9px 18px",
                            background: "var(--accent)", color: "#fff", border: "none",
                            borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: submitting ? "not-allowed" : "pointer",
                        }}
                    >
                        {submitting ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <Send size={14} />}
                        Submit Review
                    </button>
                )}
            </div>
        </div>
    )
}

// ─── DrawerHRApproval ─────────────────────────────────────────────────────────

function DrawerHRApproval({
    review, onRefresh, session,
}: {
    review: PerformanceReview
    onRefresh: () => void
    session: ReturnType<typeof useSession>["data"]
}) {
    const [notes, setNotes] = useState(review.managerComments ?? "")
    const [approving, setApproving] = useState(false)

    const isHR = session?.user?.role === "ADMIN" || session?.user?.role === "MANAGER"

    const handleApprove = async () => {
        setApproving(true)
        try {
            const res = await fetch(`/api/performance/${review.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    hrApprovedAt: new Date().toISOString(),
                    hrApprovedBy: session?.user?.id,
                    status: "COMPLETED",
                }),
            })
            if (!res.ok) throw new Error(await res.text())
            toast.success("Review approved and completed")
            onRefresh()
        } catch (e) {
            toast.error(String(e))
        } finally {
            setApproving(false)
        }
    }

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{
                background: review.hrApprovedAt ? "#e8f7f1" : "#fef3c7",
                border: `1px solid ${review.hrApprovedAt ? "#86efac" : "#fde68a"}`,
                borderRadius: 8, padding: "10px 14px", fontSize: 13,
            }}>
                <strong>Status:</strong>{" "}
                {review.hrApprovedAt
                    ? `Approved on ${fmtDateFull(review.hrApprovedAt)}`
                    : "Pending HR Approval"}
            </div>

            <div>
                <label style={{ fontWeight: 600, fontSize: 13, display: "block", marginBottom: 4 }}>Review Summary</label>
                <div style={{ fontSize: 13, color: "#374151", lineHeight: 1.7 }}>
                    <div><strong>Overall Rating:</strong> {review.overallRating ?? "—"} / 5</div>
                    <div><strong>Rank:</strong> {review.performanceRank ? RANK_CONFIG[review.performanceRank]?.label : "—"}</div>
                    <div><strong>Promotion:</strong> {review.promotionRecommended ? "Yes" : "No"}</div>
                    <div><strong>Increment:</strong> {review.incrementPercent != null ? `${review.incrementPercent}%` : "—"}</div>
                    <div><strong>Bonus:</strong> {review.bonusPercent != null ? `${review.bonusPercent}%` : "—"}</div>
                    <div><strong>PIP Required:</strong> {review.pipRequired ? "Yes" : "No"}</div>
                </div>
            </div>

            {review.strengths && (
                <div>
                    <label style={{ fontWeight: 600, fontSize: 13, display: "block", marginBottom: 4 }}>Strengths</label>
                    <p style={{ fontSize: 13, color: "#374151", margin: 0 }}>{review.strengths}</p>
                </div>
            )}
            {review.improvements && (
                <div>
                    <label style={{ fontWeight: 600, fontSize: 13, display: "block", marginBottom: 4 }}>Areas of Improvement</label>
                    <p style={{ fontSize: 13, color: "#374151", margin: 0 }}>{review.improvements}</p>
                </div>
            )}

            {isHR && !review.hrApprovedAt && review.status === "SUBMITTED" && (
                <button
                    onClick={handleApprove}
                    disabled={approving}
                    style={{
                        display: "flex", alignItems: "center", gap: 6, padding: "9px 18px",
                        background: "#1a9e6e", color: "#fff", border: "none",
                        borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: approving ? "not-allowed" : "pointer",
                        alignSelf: "flex-start",
                    }}
                >
                    {approving ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <Check size={14} />}
                    Approve & Complete
                </button>
            )}
        </div>
    )
}

// ─── DrawerPIP ────────────────────────────────────────────────────────────────

type PIPGoal = { goal: string; metric: string; targetDate: string }

function DrawerPIP({
    review, onRefresh, isAdminOrManager,
}: {
    review: PerformanceReview
    onRefresh: () => void
    isAdminOrManager: boolean
}) {
    const pip = review.pip
    const [form, setForm] = useState({
        startDate: pip?.startDate ? pip.startDate.split("T")[0] : "",
        endDate: pip?.endDate ? pip.endDate.split("T")[0] : "",
        managerNotes: pip?.managerNotes ?? "",
        status: pip?.status ?? "ACTIVE",
    })
    const [goals, setGoals] = useState<PIPGoal[]>(
        pip ? (() => { try { return JSON.parse(pip.goals) } catch { return [{ goal: pip.goals, metric: "", targetDate: "" }] } })()
            : [{ goal: "", metric: "", targetDate: "" }]
    )
    const [saving, setSaving] = useState(false)

    const handleSave = async () => {
        if (!form.startDate || !form.endDate) {
            toast.error("Start and end date are required")
            return
        }
        setSaving(true)
        try {
            const body = {
                startDate: form.startDate,
                endDate: form.endDate,
                goals: JSON.stringify(goals),
                managerNotes: form.managerNotes,
                status: form.status,
            }
            const method = pip ? "PATCH" : "POST"
            const res = await fetch(`/api/performance/${review.id}/pip`, {
                method,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            })
            if (!res.ok) throw new Error(await res.text())
            toast.success(pip ? "PIP updated" : "PIP created")
            onRefresh()
        } catch (e) {
            toast.error(String(e))
        } finally {
            setSaving(false)
        }
    }

    const addGoal = () => setGoals(g => [...g, { goal: "", metric: "", targetDate: "" }])
    const removeGoal = (i: number) => setGoals(g => g.filter((_, idx) => idx !== i))
    const updateGoal = (i: number, field: keyof PIPGoal, val: string) => {
        setGoals(g => g.map((item, idx) => idx === i ? { ...item, [field]: val } : item))
    }

    const showForm = review.pipRequired || (review.performanceRank === "LOW_PERFORMER") || !!pip

    if (!showForm && !isAdminOrManager) {
        return (
            <div style={{ color: "#6b7280", fontSize: 13, padding: "20px 0" }}>
                No PIP required for this employee.
            </div>
        )
    }

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {!pip && !review.pipRequired && isAdminOrManager && (
                <div style={{
                    background: "#fef9c3", border: "1px solid #fde68a", borderRadius: 8,
                    padding: "10px 14px", fontSize: 13, color: "#92400e",
                    display: "flex", alignItems: "center", gap: 8,
                }}>
                    <AlertTriangle size={14} />
                    Create a PIP plan for this employee if performance improvement is needed.
                </div>
            )}

            {pip && (
                <div style={{
                    background: pip.status === "ACTIVE" ? "#fff7ed" : pip.status === "COMPLETED" ? "#e8f7f1" : "#f3f4f6",
                    border: "1px solid var(--border)", borderRadius: 8,
                    padding: "10px 14px", fontSize: 13,
                }}>
                    <strong>PIP Status:</strong> {pip.status}
                    {isAdminOrManager && (
                        <select
                            value={form.status}
                            onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                            style={{ marginLeft: 12, padding: "3px 8px", border: "1px solid var(--border)", borderRadius: 5, fontSize: 12, background: "#fff" }}
                        >
                            <option value="ACTIVE">Active</option>
                            <option value="COMPLETED">Completed</option>
                            <option value="CANCELLED">Cancelled</option>
                        </select>
                    )}
                </div>
            )}

            {isAdminOrManager && (
                <>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                        <div>
                            <label style={{ fontWeight: 600, fontSize: 13, display: "block", marginBottom: 4 }}>Start Date</label>
                            <input
                                type="date"
                                value={form.startDate}
                                onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))}
                                style={{ width: "100%", padding: "7px 10px", border: "1px solid var(--border)", borderRadius: 7, fontSize: 13, boxSizing: "border-box" }}
                            />
                        </div>
                        <div>
                            <label style={{ fontWeight: 600, fontSize: 13, display: "block", marginBottom: 4 }}>End Date</label>
                            <input
                                type="date"
                                value={form.endDate}
                                onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))}
                                style={{ width: "100%", padding: "7px 10px", border: "1px solid var(--border)", borderRadius: 7, fontSize: 13, boxSizing: "border-box" }}
                            />
                        </div>
                    </div>

                    <div>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                            <label style={{ fontWeight: 600, fontSize: 13 }}>PIP Goals</label>
                            <button
                                onClick={addGoal}
                                style={{
                                    display: "flex", alignItems: "center", gap: 4, padding: "4px 10px",
                                    background: "var(--accent)", color: "#fff", border: "none",
                                    borderRadius: 5, fontSize: 11, cursor: "pointer", fontWeight: 600,
                                }}
                            >
                                <Plus size={11} /> Add Goal
                            </button>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                            {goals.map((g, i) => (
                                <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 80px 110px 28px", gap: 6, alignItems: "center" }}>
                                    <input
                                        value={g.goal}
                                        onChange={e => updateGoal(i, "goal", e.target.value)}
                                        placeholder="Goal description"
                                        style={{ padding: "6px 8px", border: "1px solid var(--border)", borderRadius: 5, fontSize: 12 }}
                                    />
                                    <input
                                        value={g.metric}
                                        onChange={e => updateGoal(i, "metric", e.target.value)}
                                        placeholder="Metric"
                                        style={{ padding: "6px 8px", border: "1px solid var(--border)", borderRadius: 5, fontSize: 12 }}
                                    />
                                    <input
                                        type="date"
                                        value={g.targetDate}
                                        onChange={e => updateGoal(i, "targetDate", e.target.value)}
                                        style={{ padding: "6px 8px", border: "1px solid var(--border)", borderRadius: 5, fontSize: 12 }}
                                    />
                                    <button onClick={() => removeGoal(i)} style={{ background: "none", border: "none", cursor: "pointer", padding: 2 }}>
                                        <X size={12} color="#ef4444" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div>
                        <label style={{ fontWeight: 600, fontSize: 13, display: "block", marginBottom: 4 }}>Manager Notes</label>
                        <textarea
                            value={form.managerNotes}
                            onChange={e => setForm(f => ({ ...f, managerNotes: e.target.value }))}
                            rows={3}
                            style={{ width: "100%", padding: "8px 10px", border: "1px solid var(--border)", borderRadius: 7, fontSize: 13, resize: "vertical", boxSizing: "border-box" }}
                        />
                    </div>

                    <button
                        onClick={handleSave}
                        disabled={saving}
                        style={{
                            display: "flex", alignItems: "center", gap: 6, padding: "9px 18px",
                            background: "var(--accent)", color: "#fff", border: "none",
                            borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: saving ? "not-allowed" : "pointer",
                            alignSelf: "flex-start",
                        }}
                    >
                        {saving ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <Check size={14} />}
                        {pip ? "Update PIP" : "Create PIP"}
                    </button>
                </>
            )}

            {/* Read-only display for non-admins */}
            {!isAdminOrManager && pip && (
                <div style={{ fontSize: 13, color: "#374151" }}>
                    <p><strong>Period:</strong> {fmtDateFull(pip.startDate)} — {fmtDateFull(pip.endDate)}</p>
                    <p><strong>Status:</strong> {pip.status}</p>
                    <p><strong>Goals:</strong></p>
                    <ul style={{ paddingLeft: 18, margin: 0 }}>
                        {goals.map((g, i) => (
                            <li key={i}>{g.goal} {g.metric && `(${g.metric})`} {g.targetDate && `— by ${fmtDateFull(g.targetDate)}`}</li>
                        ))}
                    </ul>
                    {pip.managerNotes && <p><strong>Notes:</strong> {pip.managerNotes}</p>}
                </div>
            )}
        </div>
    )
}

// ─── TemplatesTab ─────────────────────────────────────────────────────────────

function TemplatesTab({ templates, loading }: { templates: KPITemplate[]; loading: boolean }) {
    if (loading) {
        return (
            <div style={{ display: "flex", justifyContent: "center", padding: 60 }}>
                <Loader2 size={28} style={{ animation: "spin 1s linear infinite", color: "var(--accent)" }} />
            </div>
        )
    }

    if (templates.length === 0) {
        return (
            <div style={{ textAlign: "center", padding: 60, color: "#9ca3af", fontSize: 14 }}>
                No templates found
            </div>
        )
    }

    // Group by role, then by kraTitle
    const roleMap: Record<string, Record<string, KPITemplate[]>> = {}
    for (const t of templates) {
        if (!roleMap[t.role]) roleMap[t.role] = {}
        if (!roleMap[t.role][t.kraTitle]) roleMap[t.role][t.kraTitle] = []
        roleMap[t.role][t.kraTitle].push(t)
    }

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {Object.entries(roleMap).map(([role, kras]) => (
                <div key={role} style={{
                    background: "#fff", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden",
                }}>
                    <div style={{
                        padding: "14px 18px", background: "#f8fafc",
                        borderBottom: "1px solid var(--border)",
                        display: "flex", alignItems: "center", gap: 10,
                    }}>
                        <Award size={16} color="var(--accent)" />
                        <span style={{ fontWeight: 700, fontSize: 14, color: "var(--text)" }}>
                            {role.replace(/_/g, " ")}
                        </span>
                    </div>

                    <div style={{ padding: "14px 18px" }}>
                        {Object.entries(kras).map(([kraTitle, kpis]) => (
                            <div key={kraTitle} style={{ marginBottom: 16 }}>
                                <div style={{ fontWeight: 600, fontSize: 13, color: "var(--text)", marginBottom: 8 }}>
                                    KRA: {kraTitle}
                                </div>
                                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                                    <thead>
                                        <tr style={{ background: "#f9fafb" }}>
                                            <th style={{ padding: "6px 10px", textAlign: "left", color: "#6b7280", fontWeight: 600, border: "1px solid var(--border)" }}>KPI Title</th>
                                            <th style={{ padding: "6px 10px", textAlign: "left", color: "#6b7280", fontWeight: 600, border: "1px solid var(--border)" }}>Target Hint</th>
                                            <th style={{ padding: "6px 10px", textAlign: "center", color: "#6b7280", fontWeight: 600, border: "1px solid var(--border)", width: 80 }}>Weight %</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {kpis.map(k => (
                                            <tr key={k.id}>
                                                <td style={{ padding: "6px 10px", border: "1px solid var(--border)", color: "var(--text)" }}>{k.kpiTitle}</td>
                                                <td style={{ padding: "6px 10px", border: "1px solid var(--border)", color: "#6b7280" }}>{k.targetHint ?? "—"}</td>
                                                <td style={{ padding: "6px 10px", border: "1px solid var(--border)", color: "var(--text)", textAlign: "center" }}>{k.weightage}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ))}
                    </div>
                </div>
            ))}
        </div>
    )
}

// ─── CreateReviewModal ────────────────────────────────────────────────────────

function CreateReviewModal({
    employees, form, setForm, onClose, onSubmit, creating,
}: {
    employees: EmployeeOption[]
    form: { employeeId: string; cycle: ReviewCycle; periodStart: string; periodEnd: string }
    setForm: React.Dispatch<React.SetStateAction<{ employeeId: string; cycle: ReviewCycle; periodStart: string; periodEnd: string }>>
    onClose: () => void
    onSubmit: () => void
    creating: boolean
}) {
    return (
        <div style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)",
            display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2000,
        }}>
            <div style={{
                background: "#fff", borderRadius: 14, width: 480,
                padding: 28, boxShadow: "0 8px 40px rgba(0,0,0,0.18)",
            }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
                    <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "var(--text)" }}>Create Performance Review</h2>
                    <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer" }}>
                        <X size={20} color="#6b7280" />
                    </button>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                    <div>
                        <label style={{ fontWeight: 600, fontSize: 13, display: "block", marginBottom: 5 }}>Employee *</label>
                        <select
                            value={form.employeeId}
                            onChange={e => setForm(f => ({ ...f, employeeId: e.target.value }))}
                            style={{
                                width: "100%", padding: "8px 10px", border: "1px solid var(--border)",
                                borderRadius: 8, fontSize: 13, background: "#fff", color: "var(--text)",
                            }}
                        >
                            <option value="">— Select Employee —</option>
                            {employees.map(e => (
                                <option key={e.id} value={e.id}>
                                    {e.firstName} {e.lastName} ({e.employeeId}){e.designation ? ` — ${e.designation}` : ""}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label style={{ fontWeight: 600, fontSize: 13, display: "block", marginBottom: 5 }}>Review Cycle *</label>
                        <select
                            value={form.cycle}
                            onChange={e => setForm(f => ({ ...f, cycle: e.target.value as ReviewCycle }))}
                            style={{
                                width: "100%", padding: "8px 10px", border: "1px solid var(--border)",
                                borderRadius: 8, fontSize: 13, background: "#fff", color: "var(--text)",
                            }}
                        >
                            {(["MONTHLY", "QUARTERLY", "HALF_YEARLY", "ANNUAL"] as ReviewCycle[]).map(c => (
                                <option key={c} value={c}>{CYCLE_CONFIG[c].label}</option>
                            ))}
                        </select>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                        <div>
                            <label style={{ fontWeight: 600, fontSize: 13, display: "block", marginBottom: 5 }}>Period Start *</label>
                            <input
                                type="date"
                                value={form.periodStart}
                                onChange={e => setForm(f => ({ ...f, periodStart: e.target.value }))}
                                style={{
                                    width: "100%", padding: "8px 10px", border: "1px solid var(--border)",
                                    borderRadius: 8, fontSize: 13, boxSizing: "border-box",
                                }}
                            />
                        </div>
                        <div>
                            <label style={{ fontWeight: 600, fontSize: 13, display: "block", marginBottom: 5 }}>Period End *</label>
                            <input
                                type="date"
                                value={form.periodEnd}
                                onChange={e => setForm(f => ({ ...f, periodEnd: e.target.value }))}
                                style={{
                                    width: "100%", padding: "8px 10px", border: "1px solid var(--border)",
                                    borderRadius: 8, fontSize: 13, boxSizing: "border-box",
                                }}
                            />
                        </div>
                    </div>
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 22 }}>
                    <button
                        onClick={onClose}
                        style={{
                            padding: "9px 18px", background: "#fff", color: "#6b7280",
                            border: "1px solid var(--border)", borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: "pointer",
                        }}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={onSubmit}
                        disabled={creating}
                        style={{
                            display: "flex", alignItems: "center", gap: 6, padding: "9px 18px",
                            background: "var(--accent)", color: "#fff", border: "none",
                            borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: creating ? "not-allowed" : "pointer",
                            opacity: creating ? 0.7 : 1,
                        }}
                    >
                        {creating ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <Plus size={14} />}
                        Create Review
                    </button>
                </div>
            </div>
        </div>
    )
}
