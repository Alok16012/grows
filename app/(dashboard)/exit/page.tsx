"use client"
import { useState, useEffect, useCallback } from "react"
import { fetchEmployeeOptions } from "@/lib/fetch-all-employees"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { can } from "@/lib/can"
import { StatCard, statGridClass } from "@/components/StatCard"
import {
  Plus, Loader2, X, Search, MoreVertical,
  LogOut, CheckCircle2, Clock, AlertCircle,
  ChevronRight, ChevronDown, Check, Eye,
  Trash2, Calendar, IndianRupee,
} from "lucide-react"
import { format, isWithinInterval, addDays } from "date-fns"

// ─── Types ────────────────────────────────────────────────────────────────────

type ExitType = "RESIGNATION" | "TERMINATION" | "RETIREMENT" | "CONTRACT_END" | "ABSCONDING"
type ExitStatus = "INITIATED" | "NOTICE_PERIOD" | "CLEARANCE_PENDING" | "FULL_FINAL_PENDING" | "COMPLETED" | "CANCELLED"

type ClearanceTask = {
  id: string
  exitId: string
  title: string
  department: string
  status: string
  dueDate?: string | null
  completedAt?: string | null
  completedBy?: string | null
  remarks?: string | null
  order: number
}

type ExitRequest = {
  id: string
  employeeId: string
  exitType: ExitType
  status: ExitStatus
  resignationDate: string
  lastWorkingDate?: string | null
  noticePeriodDays: number
  reason?: string | null
  hrComments?: string | null
  fnfAmount?: number | null
  fnfPaidAt?: string | null
  fnfPaidBy?: string | null
  initiatedBy: string
  approvedBy?: string | null
  approvedAt?: string | null
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
    basicSalary?: number
    department?: { name: string } | null
    deployments?: { site: { name: string } }[]
  }
  clearanceTasks: ClearanceTask[]
}

type EmployeeOption = { id: string; firstName: string; lastName: string; employeeId: string }

// ─── Constants ────────────────────────────────────────────────────────────────

const AVATAR_COLORS = ["#16a34a", "#3b82f6", "#8b5cf6", "#f59e0b", "#ef4444", "#06b6d4", "#f97316"]

const STATUS_CONFIG: Record<ExitStatus, { label: string; color: string; bg: string }> = {
  INITIATED:          { label: "Initiated",       color: "#f59e0b", bg: "#fffbeb" },
  NOTICE_PERIOD:      { label: "Notice Period",    color: "#3b82f6", bg: "#eff6ff" },
  CLEARANCE_PENDING:  { label: "Clearance",        color: "#f97316", bg: "#fff7ed" },
  FULL_FINAL_PENDING: { label: "F&F Pending",      color: "#ef4444", bg: "#fef2f2" },
  COMPLETED:          { label: "Completed",        color: "#16a34a", bg: "#dcfce7" },
  CANCELLED:          { label: "Cancelled",        color: "#6b7280", bg: "#f3f4f6" },
}

const EXIT_TYPE_CONFIG: Record<ExitType, { label: string; color: string; bg: string }> = {
  RESIGNATION:  { label: "Resignation",  color: "#d97706", bg: "#fffbeb" },
  TERMINATION:  { label: "Termination",  color: "#ef4444", bg: "#fef2f2" },
  RETIREMENT:   { label: "Retirement",   color: "#3b82f6", bg: "#eff6ff" },
  CONTRACT_END: { label: "Contract End", color: "#6b7280", bg: "#f3f4f6" },
  ABSCONDING:   { label: "Absconding",   color: "#dc2626", bg: "#fef2f2" },
}

const DEPT_COLORS: Record<string, string> = {
  HR: "#0b5cff",
  IT: "#3b82f6",
  Finance: "#8b5cf6",
  Operations: "#f97316",
  Admin: "#6b7280",
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getAvatarColor(name: string) {
  return AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length]
}

function getInitials(first: string, last: string) {
  return `${first[0] || ""}${last[0] || ""}`.toUpperCase()
}

function fmtDate(d?: string | null) {
  if (!d) return null
  try { return format(new Date(d), "dd MMM yyyy") } catch { return null }
}

function fmtINR(amount?: number | null) {
  if (amount == null) return "—"
  return "₹" + amount.toLocaleString("en-IN")
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

function Avatar({ first, last, photo, size = 38 }: { first: string; last: string; photo?: string | null; size?: number }) {
  const [imgErr, setImgErr] = useState(false)
  if (photo && !imgErr) {
    return (
      <img src={photo} alt={`${first} ${last}`}
        style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }}
        onError={() => setImgErr(true)} />
    )
  }
  const color = getAvatarColor(first)
  return (
    <div
      style={{
        width: size, height: size, borderRadius: "50%",
        background: color, color: "#fff",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: size * 0.36, fontWeight: 700, flexShrink: 0,
      }}
    >
      {getInitials(first, last)}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ExitPage() {
  const { data: session, status } = useSession()
  const router = useRouter()

  const [exits, setExits] = useState<ExitRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState("ALL")
  const [filterType, setFilterType] = useState("ALL")
  const [search, setSearch] = useState("")
  const [showInitModal, setShowInitModal] = useState(false)
  const [selectedExit, setSelectedExit] = useState<ExitRequest | null>(null)
  const [drawerTab, setDrawerTab] = useState<"timeline" | "clearance" | "fnf">("timeline")
  const [openMenu, setOpenMenu] = useState<string | null>(null)

  useEffect(() => {
    if (status !== "unauthenticated") return
    router.push("/login")
  }, [status, router])

  const fetchExits = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (filterStatus !== "ALL") params.set("status", filterStatus)
      if (filterType !== "ALL") params.set("exitType", filterType)
      if (search) params.set("search", search)
      const res = await fetch(`/api/exit?${params}`)
      if (!res.ok) return
      const data = await res.json()
      setExits(data)
    } catch {
      toast.error("Failed to load exits")
    } finally {
      setLoading(false)
    }
  }, [filterStatus, filterType, search])

  useEffect(() => { fetchExits() }, [fetchExits])

  // ── Stats ────────────────────────────────────────────────────────────────

  const activeCount = exits.filter(e =>
    ["INITIATED", "NOTICE_PERIOD", "CLEARANCE_PENDING"].includes(e.status)
  ).length

  const fnfPendingCount = exits.filter(e => e.status === "FULL_FINAL_PENDING").length

  const now = new Date()
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const completedThisMonth = exits.filter(e =>
    e.status === "COMPLETED" && e.completedAt && new Date(e.completedAt) >= firstOfMonth
  ).length

  const noticePeriodEndingThisWeek = exits.filter(e => {
    if (e.status !== "NOTICE_PERIOD") return false
    if (!e.lastWorkingDate) return false
    const lwd = new Date(e.lastWorkingDate)
    return isWithinInterval(lwd, { start: now, end: addDays(now, 7) })
  }).length

  // ── Status Update ────────────────────────────────────────────────────────

  const handleStatusChange = async (exitId: string, newStatus: string) => {
    try {
      const res = await fetch(`/api/exit/${exitId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      })
      if (!res.ok) { toast.error((await res.text()) || "Failed to update status"); return }
      toast.success("Status updated")
      fetchExits()
      if (selectedExit?.id === exitId) {
        const updated = await res.json()
        setSelectedExit(updated)
      }
    } catch {
      toast.error("Failed to update status")
    }
  }

  const handleDelete = async (exitId: string) => {
    if (!confirm("Delete this exit request?")) return
    try {
      const res = await fetch(`/api/exit/${exitId}`, { method: "DELETE" })
      if (!res.ok) { toast.error("Cannot delete (only INITIATED exits)"); return }
      toast.success("Exit request deleted")
      setSelectedExit(null)
      fetchExits()
    } catch {
      toast.error("Delete failed")
    }
  }

  const openDrawer = async (exitId: string) => {
    try {
      const res = await fetch(`/api/exit/${exitId}`)
      if (!res.ok) return
      const data = await res.json()
      setSelectedExit(data)
      setDrawerTab("timeline")
    } catch {
      toast.error("Failed to load exit details")
    }
  }

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "60vh" }}>
        <Loader2 size={32} className="animate-spin" style={{ color: "var(--accent)" }} />
      </div>
    )
  }

  return (
    <div className="p-4 sm:px-7 sm:py-6 lg:p-0">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between" style={{ marginBottom: 24 }}>
        <div className="min-w-0">
          <h1 style={{ fontSize: 26, fontWeight: 700, color: "var(--text)", margin: 0, letterSpacing: "-0.5px" }}>Exit Management</h1>
          <p style={{ fontSize: 13.5, color: "var(--text3)", marginTop: 4 }}>Manage employee exits, clearance &amp; F&amp;F settlements.</p>
        </div>
        <div className="page-actions">
        <button
          onClick={() => setShowInitModal(true)}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
            background: "var(--accent)", color: "#fff",
            border: "none", borderRadius: 10, height: 42, padding: "0 18px",
            fontSize: 13, fontWeight: 600, cursor: "pointer",
            boxShadow: "0 1px 3px rgba(26,158,110,0.35)",
          }}
        >
          <Plus size={16} /> Initiate Exit
        </button>
        </div>
      </div>

      {/* Stats */}
      <div className={statGridClass(4)} style={{ marginBottom: 24 }}>
        <StatCard label="Active Exits" value={activeCount} tone="amber" icon={<LogOut size={20} />} seed={0} />
        <StatCard label="Pending F&F" value={fnfPendingCount} tone="rose" icon={<IndianRupee size={20} />} seed={1} />
        <StatCard label="Completed This Month" value={completedThisMonth} tone="teal" icon={<CheckCircle2 size={20} />} seed={2} />
        <StatCard label="Notice Ending This Week" value={noticePeriodEndingThisWeek} tone="blue" icon={<Clock size={20} />} seed={3} />
      </div>

      {/* Filters */}
      <div className="filter-bar sm:gap-3" style={{
        background: "var(--surface)", border: "1px solid var(--border)",
        borderRadius: 12, padding: "14px 16px", marginBottom: 20,
      }}>
        {/* Status Pills */}
        <div className="filter-full flex overflow-x-auto no-scrollbar sm:flex-wrap" style={{ gap: 6 }}>
          {[
            { val: "ALL", label: "All" },
            { val: "INITIATED", label: "Initiated" },
            { val: "NOTICE_PERIOD", label: "Notice Period" },
            { val: "CLEARANCE_PENDING", label: "Clearance" },
            { val: "FULL_FINAL_PENDING", label: "F&F Pending" },
            { val: "COMPLETED", label: "Completed" },
            { val: "CANCELLED", label: "Cancelled" },
          ].map(s => (
            <button
              key={s.val}
              onClick={() => setFilterStatus(s.val)}
              style={{
                padding: "5px 12px", borderRadius: 20, fontSize: 12, fontWeight: 500,
                border: `1px solid ${filterStatus === s.val ? "var(--accent)" : "var(--border)"}`,
                background: filterStatus === s.val ? "var(--accent-light)" : "transparent",
                color: filterStatus === s.val ? "var(--accent)" : "var(--text2)",
                cursor: "pointer", flexShrink: 0, whiteSpace: "nowrap",
              }}
            >
              {s.label}
            </button>
          ))}
        </div>

          {/* Exit Type dropdown */}
          <select
            value={filterType}
            onChange={e => setFilterType(e.target.value)}
            className="w-full sm:w-auto sm:ml-auto"
            style={{
              border: "1px solid var(--border)", borderRadius: 8, padding: "6px 10px",
              fontSize: 13, color: "var(--text)", background: "var(--surface)", cursor: "pointer",
            }}
          >
            <option value="ALL">All Types</option>
            <option value="RESIGNATION">Resignation</option>
            <option value="TERMINATION">Termination</option>
            <option value="RETIREMENT">Retirement</option>
            <option value="CONTRACT_END">Contract End</option>
            <option value="ABSCONDING">Absconding</option>
          </select>

          {/* Search */}
          <div className="filter-search" style={{ position: "relative" }}>
            <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text3)" }} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search employee..."
              className="w-full sm:w-[200px]"
              style={{
                border: "1px solid var(--border)", borderRadius: 8, padding: "6px 10px 6px 30px",
                fontSize: 13, color: "var(--text)", background: "var(--surface)",
              }}
            />
          </div>
      </div>

      {/* Exit List */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {exits.length === 0 && (
          <div style={{
            textAlign: "center", padding: "60px 20px",
            background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12,
          }}>
            <LogOut size={40} style={{ color: "var(--text3)", margin: "0 auto 12px" }} />
            <p style={{ fontSize: 15, fontWeight: 600, color: "var(--text)" }}>No exit requests found</p>
            <p style={{ fontSize: 13, color: "var(--text2)", marginTop: 4 }}>Initiate an exit request to get started</p>
          </div>
        )}

        {exits.map(exit => {
          const emp = exit.employee
          const stCfg = STATUS_CONFIG[exit.status] || STATUS_CONFIG.INITIATED
          const typeCfg = EXIT_TYPE_CONFIG[exit.exitType] || EXIT_TYPE_CONFIG.RESIGNATION
          const total = exit.clearanceTasks?.length || 12
          const done = exit.clearanceTasks?.filter(t => t.status === "COMPLETED" || t.status === "WAIVED").length || 0
          const pct = total > 0 ? Math.round((done / total) * 100) : 0

          return (
            <div
              key={exit.id}
              style={{
                background: "var(--surface)", border: "1px solid var(--border)",
                borderRadius: 12, padding: "14px 16px",
                display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap",
                cursor: "pointer", transition: "border-color 0.15s",
              }}
              onClick={() => openDrawer(exit.id)}
            >
              <Avatar first={emp.firstName} last={emp.lastName} photo={emp.photo} />

              <div style={{ flex: 1, minWidth: 160 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2, flexWrap: "wrap" }}>
                  <span style={{ fontWeight: 600, fontSize: 14, color: "var(--text)" }}>
                    {emp.firstName} {emp.lastName}
                  </span>
                  <span style={{ fontSize: 11, color: "var(--text3)" }}>{emp.employeeId}</span>
                </div>
                <div style={{ fontSize: 12, color: "var(--text2)" }}>
                  {emp.designation || "—"} {emp.department?.name ? `· ${emp.department.name}` : ""}
                </div>
              </div>

              {/* Exit Type badge */}
              <span style={{
                padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600,
                color: typeCfg.color, background: typeCfg.bg, whiteSpace: "nowrap",
              }}>
                {typeCfg.label}
              </span>

              {/* Dates */}
              <div style={{ fontSize: 12, color: "var(--text2)", textAlign: "center", minWidth: 90 }}>
                <div style={{ fontWeight: 500 }}>{fmtDate(exit.resignationDate)}</div>
                <div style={{ color: "var(--text3)" }}>Resign date</div>
              </div>

              <div style={{ fontSize: 12, color: "var(--text2)", textAlign: "center", minWidth: 90 }}>
                <div style={{ fontWeight: 500 }}>{fmtDate(exit.lastWorkingDate) || "TBD"}</div>
                <div style={{ color: "var(--text3)" }}>Last day</div>
              </div>

              <div style={{ fontSize: 12, color: "var(--text2)", textAlign: "center", minWidth: 60 }}>
                <div style={{ fontWeight: 500 }}>{exit.noticePeriodDays}d</div>
                <div style={{ color: "var(--text3)" }}>Notice</div>
              </div>

              {/* Clearance progress */}
              <div style={{ width: 80 }}>
                <div style={{ fontSize: 11, color: "var(--text2)", marginBottom: 3, textAlign: "right" }}>
                  {done}/{total} done
                </div>
                <div style={{ height: 5, background: "var(--border)", borderRadius: 3, overflow: "hidden" }}>
                  <div style={{ height: "100%", background: "var(--accent)", width: `${pct}%`, borderRadius: 3 }} />
                </div>
              </div>

              {/* Status badge */}
              <span style={{
                padding: "4px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600,
                color: stCfg.color, background: stCfg.bg, whiteSpace: "nowrap",
              }}>
                {stCfg.label}
              </span>

              {/* 3-dot menu */}
              <div
                style={{ position: "relative" }}
                onClick={e => e.stopPropagation()}
              >
                <button
                  onClick={() => setOpenMenu(openMenu === exit.id ? null : exit.id)}
                  style={{
                    background: "none", border: "none", cursor: "pointer",
                    padding: 6, borderRadius: 6, color: "var(--text3)",
                  }}
                >
                  <MoreVertical size={16} />
                </button>
                {openMenu === exit.id && (
                  <div style={{
                    position: "absolute", right: 0, top: "100%", zIndex: 50,
                    background: "var(--surface)", border: "1px solid var(--border)",
                    borderRadius: 8, padding: "6px 0", minWidth: 150, boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
                  }}>
                    {[
                      { label: "View Details", action: () => { openDrawer(exit.id); setOpenMenu(null) } },
                      exit.status === "INITIATED" ? { label: "Start Notice Period", action: () => { handleStatusChange(exit.id, "NOTICE_PERIOD"); setOpenMenu(null) } } : null,
                      exit.status === "NOTICE_PERIOD" ? { label: "Move to Clearance", action: () => { handleStatusChange(exit.id, "CLEARANCE_PENDING"); setOpenMenu(null) } } : null,
                      exit.status === "FULL_FINAL_PENDING" ? { label: "Mark Completed", action: () => { handleStatusChange(exit.id, "COMPLETED"); setOpenMenu(null) } } : null,
                      exit.status !== "COMPLETED" && exit.status !== "CANCELLED" ? { label: "Cancel", action: () => { handleStatusChange(exit.id, "CANCELLED"); setOpenMenu(null) } } : null,
                      exit.status === "INITIATED" && session?.user?.role === "ADMIN" ? { label: "Delete", action: () => { handleDelete(exit.id); setOpenMenu(null) }, danger: true } : null,
                    ].filter(Boolean).map((item, i) => item && (
                      <button
                        key={i}
                        onClick={item.action}
                        style={{
                          display: "block", width: "100%", textAlign: "left",
                          padding: "8px 14px", fontSize: 13,
                          color: (item as { danger?: boolean }).danger ? "var(--red)" : "var(--text)",
                          background: "none", border: "none", cursor: "pointer",
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = "var(--surface2)")}
                        onMouseLeave={e => (e.currentTarget.style.background = "none")}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Initiate Exit Modal */}
      {showInitModal && (
        <InitiateExitModal
          onClose={() => setShowInitModal(false)}
          onCreated={() => { setShowInitModal(false); fetchExits() }}
        />
      )}

      {/* Detail Drawer */}
      {selectedExit && (
        <ExitDrawer
          exit={selectedExit}
          tab={drawerTab}
          onTabChange={setDrawerTab}
          onClose={() => setSelectedExit(null)}
          onRefresh={async () => {
            await fetchExits()
            const res = await fetch(`/api/exit/${selectedExit.id}`)
            if (res.ok) setSelectedExit(await res.json())
          }}
          session={session}
        />
      )}

      {/* Close menu on outside click */}
      {openMenu && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 40 }}
          onClick={() => setOpenMenu(null)}
        />
      )}
    </div>
  )
}

// ─── Initiate Exit Modal ──────────────────────────────────────────────────────

function InitiateExitModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [employees, setEmployees] = useState<EmployeeOption[]>([])
  const [form, setForm] = useState({
    employeeId: "",
    exitType: "RESIGNATION",
    resignationDate: format(new Date(), "yyyy-MM-dd"),
    lastWorkingDate: "",
    noticePeriodDays: 30,
    reason: "",
  })
  const [saving, setSaving] = useState(false)
  const [empSearch, setEmpSearch] = useState("")

  useEffect(() => {
    fetchEmployeeOptions({ status: "ACTIVE" })
      .then(d => setEmployees(d.employees as any))
      .catch(() => {})
  }, [])

  const filteredEmps = employees.filter(e => {
    const q = empSearch.toLowerCase()
    return (
      e.firstName.toLowerCase().includes(q) ||
      e.lastName.toLowerCase().includes(q) ||
      e.employeeId.toLowerCase().includes(q)
    )
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.employeeId) { toast.error("Select an employee"); return }
    setSaving(true)
    try {
      const res = await fetch("/api/exit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      if (!res.ok) {
        const msg = await res.text()
        toast.error(msg || "Failed to create exit")
        return
      }
      toast.success("Exit request initiated")
      onCreated()
    } catch {
      toast.error("Failed to create exit")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 100, background: "rgba(0,0,0,0.45)",
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <div style={{
        background: "var(--surface)", borderRadius: 16, width: 520, maxWidth: "95vw",
        maxHeight: "90vh", overflow: "auto", padding: 28,
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "var(--text)" }}>Initiate Exit Request</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text3)" }}>
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Employee Select */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text2)", display: "block", marginBottom: 6 }}>Employee *</label>
            <input
              placeholder="Search employee..."
              value={empSearch}
              onChange={e => setEmpSearch(e.target.value)}
              style={{
                width: "100%", border: "1px solid var(--border)", borderRadius: 8,
                padding: "8px 12px", fontSize: 13, color: "var(--text)", background: "var(--surface)",
                marginBottom: 6, boxSizing: "border-box",
              }}
            />
            <select
              required
              value={form.employeeId}
              onChange={e => setForm(f => ({ ...f, employeeId: e.target.value }))}
              size={5}
              style={{
                width: "100%", border: "1px solid var(--border)", borderRadius: 8,
                padding: "4px 0", fontSize: 13, color: "var(--text)", background: "var(--surface)",
                boxSizing: "border-box",
              }}
            >
              {filteredEmps.map(e => (
                <option key={e.id} value={e.id}>
                  {e.firstName} {e.lastName} ({e.employeeId})
                </option>
              ))}
            </select>
          </div>

          {/* Exit Type */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text2)", display: "block", marginBottom: 6 }}>Exit Type *</label>
            <select
              value={form.exitType}
              onChange={e => setForm(f => ({ ...f, exitType: e.target.value }))}
              style={{
                width: "100%", border: "1px solid var(--border)", borderRadius: 8,
                padding: "8px 12px", fontSize: 13, color: "var(--text)", background: "var(--surface)",
                boxSizing: "border-box",
              }}
            >
              <option value="RESIGNATION">Resignation</option>
              <option value="TERMINATION">Termination</option>
              <option value="RETIREMENT">Retirement</option>
              <option value="CONTRACT_END">Contract End</option>
              <option value="ABSCONDING">Absconding</option>
            </select>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text2)", display: "block", marginBottom: 6 }}>Resignation Date *</label>
              <input
                type="date"
                required
                value={form.resignationDate}
                onChange={e => setForm(f => ({ ...f, resignationDate: e.target.value }))}
                style={{
                  width: "100%", border: "1px solid var(--border)", borderRadius: 8,
                  padding: "8px 12px", fontSize: 13, color: "var(--text)", background: "var(--surface)", boxSizing: "border-box",
                }}
              />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text2)", display: "block", marginBottom: 6 }}>Last Working Date</label>
              <input
                type="date"
                value={form.lastWorkingDate}
                onChange={e => setForm(f => ({ ...f, lastWorkingDate: e.target.value }))}
                style={{
                  width: "100%", border: "1px solid var(--border)", borderRadius: 8,
                  padding: "8px 12px", fontSize: 13, color: "var(--text)", background: "var(--surface)", boxSizing: "border-box",
                }}
              />
            </div>
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text2)", display: "block", marginBottom: 6 }}>Notice Period (days)</label>
            <input
              type="number"
              min={0}
              value={form.noticePeriodDays}
              onChange={e => setForm(f => ({ ...f, noticePeriodDays: parseInt(e.target.value) || 30 }))}
              style={{
                width: "100%", border: "1px solid var(--border)", borderRadius: 8,
                padding: "8px 12px", fontSize: 13, color: "var(--text)", background: "var(--surface)", boxSizing: "border-box",
              }}
            />
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text2)", display: "block", marginBottom: 6 }}>Reason</label>
            <textarea
              value={form.reason}
              onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
              rows={3}
              placeholder="Optional reason..."
              style={{
                width: "100%", border: "1px solid var(--border)", borderRadius: 8,
                padding: "8px 12px", fontSize: 13, color: "var(--text)", background: "var(--surface)",
                resize: "vertical", fontFamily: "inherit", boxSizing: "border-box",
              }}
            />
          </div>

          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 4 }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: "9px 18px", borderRadius: 8, border: "1px solid var(--border)",
                background: "none", fontSize: 13, color: "var(--text)", cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              style={{
                padding: "9px 18px", borderRadius: 8, border: "none",
                background: "var(--accent)", color: "#fff",
                fontSize: 13, fontWeight: 600, cursor: saving ? "not-allowed" : "pointer",
                display: "flex", alignItems: "center", gap: 6, opacity: saving ? 0.7 : 1,
              }}
            >
              {saving && <Loader2 size={14} className="animate-spin" />}
              Initiate Exit
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Exit Drawer ─────────────────────────────────────────────────────────────

function ExitDrawer({
  exit,
  tab,
  onTabChange,
  onClose,
  onRefresh,
  session,
}: {
  exit: ExitRequest
  tab: "timeline" | "clearance" | "fnf"
  onTabChange: (t: "timeline" | "clearance" | "fnf") => void
  onClose: () => void
  onRefresh: () => void
  session: ReturnType<typeof useSession>["data"]
}) {
  const emp = exit.employee
  const stCfg = STATUS_CONFIG[exit.status] || STATUS_CONFIG.INITIATED
  const typeCfg = EXIT_TYPE_CONFIG[exit.exitType] || EXIT_TYPE_CONFIG.RESIGNATION

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.35)" }}
      />
      {/* Panel */}
      <div style={{
        position: "fixed", right: 0, top: 0, bottom: 0, zIndex: 201,
        width: 680, maxWidth: "98vw",
        background: "var(--surface)", borderLeft: "1px solid var(--border)",
        display: "flex", flexDirection: "column", overflowY: "auto",
      }}>
        {/* Header */}
        <div style={{
          padding: "18px 24px", borderBottom: "1px solid var(--border)",
          display: "flex", alignItems: "center", gap: 14, flexShrink: 0,
        }}>
          <Avatar first={emp.firstName} last={emp.lastName} photo={emp.photo} size={44} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span style={{ fontSize: 17, fontWeight: 700, color: "var(--text)" }}>
                {emp.firstName} {emp.lastName}
              </span>
              <span style={{ fontSize: 12, color: "var(--text3)" }}>{emp.employeeId}</span>
              <span style={{
                padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600,
                color: stCfg.color, background: stCfg.bg,
              }}>
                {stCfg.label}
              </span>
            </div>
            <div style={{ display: "flex", gap: 14, marginTop: 6, flexWrap: "wrap" }}>
              <span style={{
                padding: "2px 8px", borderRadius: 20, fontSize: 11, fontWeight: 600,
                color: typeCfg.color, background: typeCfg.bg,
              }}>
                {typeCfg.label}
              </span>
              <span style={{ fontSize: 12, color: "var(--text2)" }}>
                Resign: <b>{fmtDate(exit.resignationDate)}</b>
              </span>
              <span style={{ fontSize: 12, color: "var(--text2)" }}>
                Last Day: <b>{fmtDate(exit.lastWorkingDate) || "TBD"}</b>
              </span>
              <span style={{ fontSize: 12, color: "var(--text2)" }}>
                Notice: <b>{exit.noticePeriodDays} days</b>
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text3)", padding: 4 }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div className="overflow-x-auto max-w-full" style={{
          display: "flex", gap: 0, borderBottom: "1px solid var(--border)",
          padding: "0 24px", flexShrink: 0,
        }}>
          {(["timeline", "clearance", "fnf"] as const).map(t => (
            <button
              key={t}
              onClick={() => onTabChange(t)}
              style={{
                padding: "11px 16px", border: "none", background: "none",
                fontSize: 13, fontWeight: tab === t ? 600 : 400,
                color: tab === t ? "var(--accent)" : "var(--text2)",
                borderBottom: `2px solid ${tab === t ? "var(--accent)" : "transparent"}`,
                cursor: "pointer", textTransform: "capitalize",
                whiteSpace: "nowrap", flexShrink: 0,
              }}
            >
              {t === "timeline" ? "Timeline" : t === "clearance" ? "Clearance Checklist" : "F&F Settlement"}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div style={{ flex: 1, padding: "20px 24px", overflowY: "auto" }}>
          {tab === "timeline" && (
            <TimelineTab exit={exit} onRefresh={onRefresh} session={session} />
          )}
          {tab === "clearance" && (
            <ClearanceTab exit={exit} onRefresh={onRefresh} />
          )}
          {tab === "fnf" && (
            <FnFTab exit={exit} onRefresh={onRefresh} session={session} />
          )}
        </div>
      </div>
    </>
  )
}

// ─── Timeline Tab ─────────────────────────────────────────────────────────────

function TimelineTab({
  exit,
  onRefresh,
  session,
}: {
  exit: ExitRequest
  onRefresh: () => void
  session: ReturnType<typeof useSession>["data"]
}) {
  const [hrComments, setHrComments] = useState(exit.hrComments || "")
  const [saving, setSaving] = useState(false)
  const [statusLoading, setStatusLoading] = useState(false)

  const statusOrder: ExitStatus[] = ["INITIATED", "NOTICE_PERIOD", "CLEARANCE_PENDING", "FULL_FINAL_PENDING", "COMPLETED"]
  const currentIdx = statusOrder.indexOf(exit.status)

  const steps = [
    { status: "INITIATED" as ExitStatus, label: "Exit Initiated", date: exit.createdAt, sub: `By ${exit.initiatedBy}` },
    { status: "NOTICE_PERIOD" as ExitStatus, label: "Notice Period Started", date: null, sub: `${exit.noticePeriodDays} days notice` },
    { status: "CLEARANCE_PENDING" as ExitStatus, label: "Clearance In Progress", date: null, sub: `${exit.clearanceTasks?.length || 0} tasks` },
    { status: "FULL_FINAL_PENDING" as ExitStatus, label: "F&F Pending", date: null, sub: exit.fnfAmount ? fmtINR(exit.fnfAmount) : "Amount not set" },
    { status: "COMPLETED" as ExitStatus, label: "Exit Completed", date: exit.completedAt, sub: "" },
  ]

  const handleSaveComments = async () => {
    setSaving(true)
    try {
      const res = await fetch(`/api/exit/${exit.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hrComments }),
      })
      if (res.ok) { toast.success("Comments saved"); onRefresh() }
      else toast.error("Failed to save")
    } finally {
      setSaving(false)
    }
  }

  const handleStatusAction = async (newStatus: ExitStatus) => {
    setStatusLoading(true)
    try {
      const res = await fetch(`/api/exit/${exit.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      })
      if (res.ok) { toast.success("Status updated"); onRefresh() }
      else toast.error((await res.text()) || "Failed to update status")
    } finally {
      setStatusLoading(false)
    }
  }

  const total = exit.clearanceTasks?.length || 12
  const done = exit.clearanceTasks?.filter(t => t.status === "COMPLETED" || t.status === "WAIVED").length || 0
  const clearancePct = total > 0 ? Math.round((done / total) * 100) : 0

  return (
    <div>
      {/* Timeline */}
      <div style={{ position: "relative", paddingLeft: 32, marginBottom: 28 }}>
        {/* vertical line */}
        <div style={{
          position: "absolute", left: 11, top: 10, bottom: 10,
          width: 2, background: "var(--border)",
        }} />

        {steps.map((step, i) => {
          const stepIdx = statusOrder.indexOf(step.status)
          const isPast = stepIdx <= currentIdx
          const isCurrent = step.status === exit.status
          const isCancelled = exit.status === "CANCELLED"

          return (
            <div key={step.status} style={{ position: "relative", marginBottom: 24 }}>
              {/* dot */}
              <div style={{
                position: "absolute", left: -26, top: 2,
                width: 18, height: 18, borderRadius: "50%",
                background: isCancelled ? "#6b7280" : isPast ? "var(--accent)" : "var(--border)",
                border: `2px solid ${isCancelled ? "#6b7280" : isPast ? "var(--accent)" : "var(--border)"}`,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                {isPast && !isCancelled && <Check size={10} color="#fff" />}
              </div>

              <div style={{
                padding: "10px 14px", borderRadius: 10,
                background: isCurrent && !isCancelled ? "var(--accent-light)" : "var(--surface2)",
                border: `1px solid ${isCurrent && !isCancelled ? "var(--accent)" : "var(--border)"}`,
              }}>
                <div style={{
                  fontWeight: 600, fontSize: 13,
                  color: isCurrent && !isCancelled ? "var(--accent)" : isPast ? "var(--text)" : "var(--text3)",
                }}>
                  {step.label}
                  {isCurrent && !isCancelled && (
                    <span style={{
                      marginLeft: 8, fontSize: 10, fontWeight: 600,
                      background: "var(--accent)", color: "#fff",
                      padding: "1px 7px", borderRadius: 10,
                    }}>CURRENT</span>
                  )}
                </div>
                {step.date && (
                  <div style={{ fontSize: 11, color: "var(--text2)", marginTop: 2 }}>
                    {fmtDate(step.date)}
                  </div>
                )}
                {step.sub && (
                  <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 1 }}>{step.sub}</div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* HR Comments */}
      <div style={{ marginBottom: 20 }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text2)", display: "block", marginBottom: 6 }}>
          HR Comments
        </label>
        <textarea
          value={hrComments}
          onChange={e => setHrComments(e.target.value)}
          rows={4}
          placeholder="Add HR comments..."
          style={{
            width: "100%", border: "1px solid var(--border)", borderRadius: 8,
            padding: "10px 12px", fontSize: 13, color: "var(--text)", background: "var(--surface)",
            resize: "vertical", fontFamily: "inherit", boxSizing: "border-box",
          }}
        />
        <button
          onClick={handleSaveComments}
          disabled={saving}
          style={{
            marginTop: 8, padding: "7px 16px", borderRadius: 8, border: "none",
            background: "var(--accent)", color: "#fff", fontSize: 12, fontWeight: 600,
            cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.7 : 1,
          }}
        >
          {saving ? "Saving..." : "Save Comments"}
        </button>
      </div>

      {/* Status Action Buttons */}
      {exit.status !== "COMPLETED" && exit.status !== "CANCELLED" && (
        <div style={{
          padding: "14px", background: "var(--surface2)", borderRadius: 10,
          border: "1px solid var(--border)",
        }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text2)", marginBottom: 10 }}>Actions</div>

          {exit.status === "INITIATED" && (
            <button
              onClick={() => handleStatusAction("NOTICE_PERIOD")}
              disabled={statusLoading}
              style={{
                padding: "8px 18px", borderRadius: 8, border: "none",
                background: "#3b82f6", color: "#fff", fontSize: 13, fontWeight: 600,
                cursor: statusLoading ? "not-allowed" : "pointer",
              }}
            >
              {statusLoading ? "..." : "Start Notice Period"}
            </button>
          )}

          {exit.status === "NOTICE_PERIOD" && (
            <button
              onClick={() => handleStatusAction("CLEARANCE_PENDING")}
              disabled={statusLoading}
              style={{
                padding: "8px 18px", borderRadius: 8, border: "none",
                background: "#f97316", color: "#fff", fontSize: 13, fontWeight: 600,
                cursor: statusLoading ? "not-allowed" : "pointer",
              }}
            >
              {statusLoading ? "..." : "Move to Clearance"}
            </button>
          )}

          {exit.status === "CLEARANCE_PENDING" && (
            <div>
              <div style={{ fontSize: 13, color: "var(--text2)", marginBottom: 8 }}>
                Clearance Progress: {done}/{total} ({clearancePct}%)
              </div>
              <div style={{ height: 6, background: "var(--border)", borderRadius: 4, overflow: "hidden" }}>
                <div style={{ height: "100%", background: "var(--accent)", width: `${clearancePct}%` }} />
              </div>
              <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 6 }}>
                Complete all clearance tasks to auto-advance to F&F
              </div>
            </div>
          )}

          {exit.status === "FULL_FINAL_PENDING" && (
            <button
              onClick={() => handleStatusAction("COMPLETED")}
              disabled={statusLoading}
              style={{
                padding: "8px 18px", borderRadius: 8, border: "none",
                background: "var(--accent)", color: "#fff", fontSize: 13, fontWeight: 600,
                cursor: statusLoading ? "not-allowed" : "pointer",
              }}
            >
              {statusLoading ? "..." : "Mark Exit Completed"}
            </button>
          )}
        </div>
      )}

      {exit.status === "COMPLETED" && exit.completedAt && (
        <div style={{
          padding: 14, background: "#dcfce7", borderRadius: 10, border: "1px solid #bbf7d0",
          display: "flex", alignItems: "center", gap: 10,
        }}>
          <CheckCircle2 size={20} color="var(--accent)" />
          <div>
            <div style={{ fontWeight: 600, fontSize: 13, color: "var(--accent)" }}>Exit Completed</div>
            <div style={{ fontSize: 12, color: "#065f46" }}>{fmtDate(exit.completedAt)}</div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Clearance Tab ────────────────────────────────────────────────────────────

function ClearanceTab({ exit, onRefresh }: { exit: ExitRequest; onRefresh: () => void }) {
  const [tasks, setTasks] = useState<ClearanceTask[]>(exit.clearanceTasks || [])
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [remarksMap, setRemarksMap] = useState<Record<string, string>>(
    Object.fromEntries((exit.clearanceTasks || []).map(t => [t.id, t.remarks || ""]))
  )

  useEffect(() => {
    setTasks(exit.clearanceTasks || [])
    setRemarksMap(Object.fromEntries((exit.clearanceTasks || []).map(t => [t.id, t.remarks || ""])))
  }, [exit.clearanceTasks])

  const total = tasks.length
  const done = tasks.filter(t => t.status === "COMPLETED" || t.status === "WAIVED").length
  const pct = total > 0 ? Math.round((done / total) * 100) : 0

  const handleTaskUpdate = async (taskId: string, status: string, remarks?: string) => {
    setUpdatingId(taskId)
    try {
      const res = await fetch(`/api/exit/${exit.id}/clearance/${taskId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, remarks }),
      })
      if (res.ok) {
        const updated = await res.json()
        setTasks(prev => prev.map(t => t.id === taskId ? updated : t))
        onRefresh()
      } else {
        toast.error((await res.text()) || "Failed to update task")
      }
    } catch {
      toast.error("Failed to update task")
    } finally {
      setUpdatingId(null)
    }
  }

  // Group by department — the fixed five first, then any others (asset-return
  // tasks are added under "Assets" when clearance starts).
  const departments = Array.from(new Set(["HR", "IT", "Finance", "Operations", "Admin", ...tasks.map(t => t.department)]))
  const grouped = departments.reduce((acc, dept) => {
    acc[dept] = tasks.filter(t => t.department === dept)
    return acc
  }, {} as Record<string, ClearanceTask[]>)

  return (
    <div>
      {/* Progress bar */}
      <div style={{
        padding: "12px 16px", background: "var(--surface2)", borderRadius: 10,
        border: "1px solid var(--border)", marginBottom: 20,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>Overall Progress</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--accent)" }}>{done}/{total} done ({pct}%)</span>
        </div>
        <div style={{ height: 8, background: "var(--border)", borderRadius: 4, overflow: "hidden" }}>
          <div style={{ height: "100%", background: "var(--accent)", width: `${pct}%`, borderRadius: 4, transition: "width 0.3s" }} />
        </div>
      </div>

      {departments.map(dept => {
        const deptTasks = grouped[dept]
        if (!deptTasks || deptTasks.length === 0) return null
        const deptColor = DEPT_COLORS[dept] || "#6b7280"

        return (
          <div key={dept} style={{ marginBottom: 20 }}>
            <div style={{
              display: "flex", alignItems: "center", gap: 8, marginBottom: 10,
            }}>
              <div style={{
                width: 8, height: 8, borderRadius: "50%", background: deptColor,
              }} />
              <span style={{ fontSize: 12, fontWeight: 700, color: deptColor, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                {dept}
              </span>
              <span style={{ fontSize: 11, color: "var(--text3)" }}>
                ({deptTasks.filter(t => t.status === "COMPLETED" || t.status === "WAIVED").length}/{deptTasks.length})
              </span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {deptTasks.map(task => {
                const isCompleted = task.status === "COMPLETED"
                const isWaived = task.status === "WAIVED"
                const isPending = task.status === "PENDING"

                return (
                  <div
                    key={task.id}
                    style={{
                      padding: "12px 14px", borderRadius: 10,
                      background: isWaived ? "var(--surface2)" : "var(--surface)",
                      border: `1px solid ${isCompleted ? "#bbf7d0" : isWaived ? "var(--border)" : "var(--border)"}`,
                      opacity: isWaived ? 0.7 : 1,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                      {/* Checkbox */}
                      <button
                        onClick={() => handleTaskUpdate(task.id, isCompleted ? "PENDING" : "COMPLETED", remarksMap[task.id])}
                        disabled={updatingId === task.id}
                        style={{
                          width: 20, height: 20, borderRadius: 5, flexShrink: 0, marginTop: 1,
                          border: `2px solid ${isCompleted ? "var(--accent)" : "var(--border)"}`,
                          background: isCompleted ? "var(--accent)" : "transparent",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          cursor: "pointer",
                        }}
                      >
                        {isCompleted && <Check size={11} color="#fff" />}
                        {updatingId === task.id && <Loader2 size={11} className="animate-spin" color="var(--accent)" />}
                      </button>

                      <div style={{ flex: 1 }}>
                        <span style={{
                          fontSize: 13, fontWeight: 500,
                          color: isWaived ? "var(--text3)" : "var(--text)",
                          fontStyle: isWaived ? "italic" : "normal",
                          textDecoration: isCompleted ? "line-through" : "none",
                        }}>
                          {task.title}
                        </span>

                        <div style={{ display: "flex", gap: 8, marginTop: 4, alignItems: "center" }}>
                          <span style={{
                            fontSize: 11, fontWeight: 600,
                            color: deptColor, padding: "1px 7px", borderRadius: 10,
                            background: `${deptColor}15`,
                          }}>
                            {task.department}
                          </span>
                          {isCompleted && task.completedBy && (
                            <span style={{ fontSize: 11, color: "var(--text3)" }}>by {task.completedBy}</span>
                          )}
                          {isWaived && (
                            <span style={{
                              fontSize: 11, fontWeight: 600,
                              color: "#6b7280", background: "#f3f4f6",
                              padding: "1px 7px", borderRadius: 10,
                            }}>Waived</span>
                          )}
                        </div>

                        {/* Status dropdown & remarks */}
                        <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center" }}>
                          <select
                            value={task.status}
                            onChange={e => handleTaskUpdate(task.id, e.target.value, remarksMap[task.id])}
                            style={{
                              border: "1px solid var(--border)", borderRadius: 6, padding: "4px 8px",
                              fontSize: 12, color: "var(--text)", background: "var(--surface)", cursor: "pointer",
                            }}
                          >
                            <option value="PENDING">Pending</option>
                            <option value="COMPLETED">Completed</option>
                            <option value="WAIVED">Waived</option>
                          </select>
                          <input
                            placeholder="Remarks..."
                            value={remarksMap[task.id] || ""}
                            onChange={e => setRemarksMap(prev => ({ ...prev, [task.id]: e.target.value }))}
                            onBlur={() => {
                              if (remarksMap[task.id] !== (task.remarks || "")) {
                                handleTaskUpdate(task.id, task.status, remarksMap[task.id])
                              }
                            }}
                            style={{
                              flex: 1, border: "1px solid var(--border)", borderRadius: 6,
                              padding: "4px 8px", fontSize: 12, color: "var(--text)",
                              background: "var(--surface)",
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── F&F Settlement Tab ───────────────────────────────────────────────────────

type FnfLine = { key: string; label: string; amount: number; note: string; kind: "earning" | "deduction"; auto: boolean; excluded?: boolean }
type Settlement = {
  lastWorkingDate: string; monthlyGross: number; basicDa: number; salarySource: string; noticeServedDays: number
  lines: FnfLine[]; earnings: number; deductions: number; net: number
  record: { adjustments: { label: string; amount: number; kind: "earning" | "deduction" }[]; paymentMode?: string; reference?: string; excluded?: string[] }
  warnings: string[]
}

function FnFTab({
  exit,
  onRefresh,
  session,
}: {
  exit: ExitRequest
  onRefresh: () => void
  session: ReturnType<typeof useSession>["data"]
}) {
  const [data, setData] = useState<Settlement | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [adj, setAdj] = useState<{ label: string; amount: string; kind: "earning" | "deduction" }>({ label: "", amount: "", kind: "earning" })
  const [pay, setPay] = useState({
    fnfAmount: exit.fnfAmount != null ? String(exit.fnfAmount) : "",
    fnfPaidAt: exit.fnfPaidAt ? format(new Date(exit.fnfPaidAt), "yyyy-MM-dd") : "",
    fnfPaidBy: exit.fnfPaidBy || "",
    paymentMode: "NEFT",
    reference: "",
  })
  const canEdit = can(session, "exit.manage")
  const paid = !!exit.fnfPaidAt

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/exit/${exit.id}/settlement`)
      if (!res.ok) throw new Error(await res.text())
      const d: Settlement = await res.json()
      setData(d)
      setPay(p => ({ ...p, paymentMode: d.record.paymentMode || p.paymentMode, reference: d.record.reference || "", fnfAmount: p.fnfAmount || String(d.net) }))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to work out settlement")
    } finally { setLoading(false) }
  }, [exit.id])
  useEffect(() => { load() }, [load])

  const saveRecord = async (patch: Record<string, unknown>) => {
    setSaving(true)
    try {
      const res = await fetch(`/api/exit/${exit.id}/settlement`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) })
      if (!res.ok) throw new Error(await res.text())
      const d: Settlement = await res.json()
      setData(d)
      if (!paid) setPay(p => ({ ...p, fnfAmount: String(d.net) }))
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed to save") } finally { setSaving(false) }
  }

  const toggleLine = (key: string) => {
    if (!data) return
    const ex = new Set(data.record.excluded ?? [])
    if (ex.has(key)) ex.delete(key); else ex.add(key)
    saveRecord({ excluded: Array.from(ex) })
  }
  const addAdjustment = () => {
    if (!data || !adj.label.trim() || !(Number(adj.amount) > 0)) return toast.error("Enter a label and an amount")
    saveRecord({ adjustments: [...data.record.adjustments, { label: adj.label, amount: Number(adj.amount), kind: adj.kind }] })
    setAdj({ label: "", amount: "", kind: adj.kind })
  }
  const removeAdjustment = (i: number) => data && saveRecord({ adjustments: data.record.adjustments.filter((_, j) => j !== i) })

  const recordPayment = async () => {
    if (!pay.fnfAmount || !pay.fnfPaidAt) return toast.error("Amount and payment date are required")
    setSaving(true)
    try {
      await fetch(`/api/exit/${exit.id}/settlement`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ paymentMode: pay.paymentMode, reference: pay.reference }) })
      const res = await fetch(`/api/exit/${exit.id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fnfAmount: parseFloat(pay.fnfAmount), fnfPaidAt: pay.fnfPaidAt, fnfPaidBy: pay.fnfPaidBy || session?.user?.name || "" }),
      })
      if (!res.ok) throw new Error(await res.text())
      toast.success("F&F payment recorded")
      onRefresh()
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed to record payment") } finally { setSaving(false) }
  }

  const printStatement = () => {
    if (!data) return
    const w = window.open("", "_blank")
    if (!w) return
    // Names, notes and references are typed by people — escape them before
    // they go into the printed page.
    const esc = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!))
    const row = (l: FnfLine) => `<tr><td>${esc(l.label)}<div class="n">${esc(l.note)}</div></td><td class="r">${l.kind === "deduction" ? "−" : ""}${fmtINR(l.amount)}</td></tr>`
    const live = data.lines.filter(l => !l.excluded)
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>F&amp;F — ${esc(exit.employee.firstName)} ${esc(exit.employee.lastName)}</title>
      <style>body{font-family:system-ui,sans-serif;max-width:720px;margin:32px auto;color:#0f1729;padding:0 16px}h1{font-size:20px;margin:0}table{width:100%;border-collapse:collapse;margin-top:12px}td{padding:8px 4px;border-bottom:1px solid #e6eaf5;font-size:13px;vertical-align:top}.r{text-align:right;white-space:nowrap}.n{color:#98a1b5;font-size:11px}h2{font-size:13px;margin:20px 0 0;text-transform:uppercase;letter-spacing:.5px;color:#5b6478}.t td{font-weight:700;font-size:15px;border-bottom:0}.meta{color:#5b6478;font-size:13px;margin-top:4px}.sig{display:flex;justify-content:space-between;margin-top:64px;font-size:12px;color:#5b6478}</style></head><body>
      <h1>Full &amp; Final Settlement Statement</h1>
      <div class="meta">${esc(exit.employee.firstName)} ${esc(exit.employee.lastName)} · ${esc(exit.employee.employeeId)} · ${esc(exit.employee.designation)}</div>
      <div class="meta">Exit type: ${exit.exitType.replace(/_/g, " ")} · Resigned/notified ${fmtDate(exit.resignationDate)} · Last working day ${fmtDate(data.lastWorkingDate)}</div>
      <div class="meta">Monthly gross ${fmtINR(data.monthlyGross)} · Basic + DA ${fmtINR(data.basicDa)}</div>
      <h2>Earnings</h2><table>${live.filter(l => l.kind === "earning").map(row).join("")}<tr class="t"><td>Total earnings</td><td class="r">${fmtINR(data.earnings)}</td></tr></table>
      <h2>Deductions</h2><table>${live.filter(l => l.kind === "deduction").map(row).join("") || '<tr><td class="n">None</td><td></td></tr>'}<tr class="t"><td>Total deductions</td><td class="r">${fmtINR(data.deductions)}</td></tr></table>
      <table><tr class="t"><td>Net ${data.net >= 0 ? "payable to employee" : "recoverable from employee"}</td><td class="r">${fmtINR(Math.abs(data.net))}</td></tr></table>
      ${exit.fnfPaidAt ? `<div class="meta">Paid ${fmtINR(exit.fnfAmount)} on ${fmtDate(exit.fnfPaidAt)}${data.record.paymentMode ? ` via ${esc(data.record.paymentMode)}` : ""}${data.record.reference ? ` · Ref ${esc(data.record.reference)}` : ""}</div>` : ""}
      <div class="sig"><span>Prepared by (HR)</span><span>Approved by (Finance)</span><span>Employee signature</span></div>
      <script>window.print()</script></body></html>`)
    w.document.close()
  }

  const field: React.CSSProperties = { width: "100%", border: "1px solid var(--border2)", borderRadius: 8, padding: "8px 12px", fontSize: 13, color: "var(--text)", background: "var(--surface)", boxSizing: "border-box" }
  const lbl: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: "var(--text2)", display: "block", marginBottom: 5 }

  if (loading) return <div style={{ display: "flex", justifyContent: "center", padding: 40 }}><Loader2 size={24} className="animate-spin" color="var(--accent)" /></div>
  if (!data) return null

  const section = (kind: "earning" | "deduction") => {
    const list = data.lines.filter(l => l.kind === kind)
    return (
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: kind === "earning" ? "#15803d" : "#b91c1c", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 6 }}>
          {kind === "earning" ? "Earnings" : "Deductions"}
        </div>
        {list.length === 0 && <div style={{ fontSize: 12, color: "var(--text3)", padding: "6px 0" }}>None</div>}
        {list.map(l => {
          const adjIndex = l.auto ? -1 : Number(l.key.replace("adj-", ""))
          return (
            <div key={l.key} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "8px 0", borderBottom: "1px solid var(--border)", opacity: l.excluded ? 0.45 : 1 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, color: "var(--text)", textDecoration: l.excluded ? "line-through" : "none" }}>{l.label}</div>
                <div style={{ fontSize: 11, color: "var(--text3)" }}>{l.note}</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>{kind === "deduction" && l.amount ? "−" : ""}{fmtINR(l.amount)}</span>
                {canEdit && !paid && (l.auto
                  ? <button onClick={() => toggleLine(l.key)} disabled={saving} title={l.excluded ? "Include" : "Exclude"} style={{ fontSize: 11, color: "var(--text3)", background: "none", border: "1px solid var(--border)", borderRadius: 6, padding: "2px 6px", cursor: "pointer" }}>{l.excluded ? "Include" : "Exclude"}</button>
                  : <button onClick={() => removeAdjustment(adjIndex)} disabled={saving} title="Remove" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text3)" }}><X size={14} /></button>)}
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div>
      {paid && (
        <div style={{ padding: 14, background: "#dcfce7", borderRadius: 10, border: "1px solid #bbf7d0", marginBottom: 16, display: "flex", gap: 12, alignItems: "flex-start" }}>
          <CheckCircle2 size={20} color="#15803d" style={{ marginTop: 2 }} />
          <div>
            <div style={{ fontWeight: 600, fontSize: 14, color: "#15803d" }}>F&F settlement paid</div>
            <div style={{ fontSize: 13, color: "#065f46", marginTop: 2 }}>
              {fmtINR(exit.fnfAmount)} on {fmtDate(exit.fnfPaidAt)}{data.record.paymentMode && <> via {data.record.paymentMode}</>}{data.record.reference && <> · Ref {data.record.reference}</>}{exit.fnfPaidBy && <> · by {exit.fnfPaidBy}</>}
            </div>
          </div>
        </div>
      )}

      {data.warnings.map(w => (
        <div key={w} style={{ display: "flex", gap: 8, padding: "10px 12px", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 10, fontSize: 12.5, color: "#92400e", marginBottom: 10 }}>
          <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 1 }} /> {w}
        </div>
      ))}

      <div style={{ padding: 16, background: "var(--surface2)", borderRadius: 12, border: "1px solid var(--border)", marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12, gap: 8, flexWrap: "wrap" }}>
          <div style={{ fontWeight: 600, fontSize: 13, color: "var(--text)" }}>Settlement working</div>
          <div style={{ fontSize: 11.5, color: "var(--text3)" }}>LWD {fmtDate(data.lastWorkingDate)} · gross {fmtINR(data.monthlyGross)}/mo · notice served {data.noticeServedDays}d</div>
        </div>
        {section("earning")}
        {section("deduction")}
        <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 4 }}>
          <span style={{ fontWeight: 700, fontSize: 14, color: "var(--text)" }}>Net {data.net >= 0 ? "payable" : "recoverable"}</span>
          <span style={{ fontWeight: 700, fontSize: 16, color: data.net >= 0 ? "var(--accent)" : "var(--red)" }}>{fmtINR(Math.abs(data.net))}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
          <button onClick={printStatement} style={{ fontSize: 12.5, fontWeight: 600, color: "var(--accent)", background: "none", border: "1px solid var(--border)", borderRadius: 8, padding: "6px 12px", cursor: "pointer" }}>Print statement</button>
        </div>
      </div>

      {canEdit && !paid && (
        <div style={{ padding: 16, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, marginBottom: 16 }}>
          <div style={{ fontWeight: 600, fontSize: 13, color: "var(--text)", marginBottom: 10 }}>Add a line</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 110px 120px auto", gap: 8 }}>
            <input value={adj.label} onChange={e => setAdj(a => ({ ...a, label: e.target.value }))} placeholder="e.g. Performance bonus, damage recovery" style={field} />
            <input type="number" min={0} value={adj.amount} onChange={e => setAdj(a => ({ ...a, amount: e.target.value }))} placeholder="₹" style={field} />
            <select value={adj.kind} onChange={e => setAdj(a => ({ ...a, kind: e.target.value as "earning" | "deduction" }))} style={field}>
              <option value="earning">Earning</option>
              <option value="deduction">Deduction</option>
            </select>
            <button onClick={addAdjustment} disabled={saving} style={{ padding: "0 14px", borderRadius: 8, border: "none", background: "var(--accent)", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Add</button>
          </div>
        </div>
      )}

      {canEdit && !paid && (
        <div style={{ padding: 16, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12 }}>
          <div style={{ fontWeight: 600, fontSize: 13, color: "var(--text)", marginBottom: 14 }}>Record payment</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div><label style={lbl}>Amount paid (₹)</label><input type="number" value={pay.fnfAmount} onChange={e => setPay(f => ({ ...f, fnfAmount: e.target.value }))} style={field} /></div>
            <div><label style={lbl}>Payment date</label><input type="date" value={pay.fnfPaidAt} onChange={e => setPay(f => ({ ...f, fnfPaidAt: e.target.value }))} style={field} /></div>
            <div><label style={lbl}>Mode</label>
              <select value={pay.paymentMode} onChange={e => setPay(f => ({ ...f, paymentMode: e.target.value }))} style={field}>
                {["NEFT", "IMPS", "RTGS", "Cheque", "Cash", "UPI"].map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div><label style={lbl}>UTR / cheque no.</label><input value={pay.reference} onChange={e => setPay(f => ({ ...f, reference: e.target.value }))} style={field} /></div>
            <div style={{ gridColumn: "1 / -1" }}><label style={lbl}>Paid by</label><input value={pay.fnfPaidBy} onChange={e => setPay(f => ({ ...f, fnfPaidBy: e.target.value }))} placeholder={session?.user?.name || "Name"} style={field} /></div>
          </div>
          {Number(pay.fnfAmount) !== data.net && pay.fnfAmount && (
            <div style={{ fontSize: 12, color: "#b45309", marginBottom: 10 }}>Amount differs from the worked-out net of {fmtINR(data.net)}.</div>
          )}
          <button onClick={recordPayment} disabled={saving} style={{ padding: "9px 20px", borderRadius: 8, border: "none", background: "var(--accent)", color: "#fff", fontSize: 13, fontWeight: 600, cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.7 : 1, display: "flex", alignItems: "center", gap: 6 }}>
            {saving && <Loader2 size={14} className="animate-spin" />} Record F&F payment
          </button>
        </div>
      )}
    </div>
  )
}
