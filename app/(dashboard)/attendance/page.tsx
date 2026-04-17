"use client"
import { useState, useEffect, useCallback } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
    CheckCircle, XCircle, Clock, Loader2,
    ChevronLeft, ChevronRight, Search,
    Edit2, X, Plus, Users, CalendarDays
} from "lucide-react"
import { format } from "date-fns"

// ─── Types ────────────────────────────────────────────────────────────────────

type AttendanceRecord = {
    id: string
    employeeId: string
    date: string
    checkIn?: string
    checkOut?: string
    workingHrs: number
    status: string
    overtimeHrs: number
    remarks?: string
    employee: {
        id: string
        firstName: string
        lastName: string
        employeeId: string
        designation?: string
        photo?: string
    }
    site?: { id: string; name: string }
}

type Employee = {
    id: string
    firstName: string
    lastName: string
    employeeId: string
    designation?: string
    status: string
    photo?: string
    deployments?: { site: { name: string } }[]
}

type Site = { id: string; name: string }

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, { label: string; color: string; bg: string; border: string }> = {
    PRESENT:  { label: "Present",   color: "#1a9e6e", bg: "#e8f7f1", border: "#6ee7b7" },
    ABSENT:   { label: "Absent",    color: "#dc2626", bg: "#fef2f2", border: "#fecaca" },
    HALF_DAY: { label: "Half Day",  color: "#f59e0b", bg: "#fffbeb", border: "#fde68a" },
    LATE:     { label: "Late",      color: "#f59e0b", bg: "#fffbeb", border: "#fde68a" },
    HOLIDAY:  { label: "Holiday",   color: "#3b82f6", bg: "#eff6ff", border: "#bfdbfe" },
    LEAVE:    { label: "On Leave",  color: "#8b5cf6", bg: "#f5f3ff", border: "#ddd6fe" },
}

const BULK_STATUSES = ["PRESENT", "ABSENT", "HALF_DAY", "LATE", "LEAVE"]

// ─── Avatar ───────────────────────────────────────────────────────────────────

function Avatar({ firstName, lastName, photo, size = 36 }: {
    firstName: string; lastName: string; photo?: string; size?: number
}) {
    const initials = `${firstName[0] || ""}${lastName[0] || ""}`.toUpperCase()
    const colors = ["#1a9e6e", "#3b82f6", "#8b5cf6", "#f59e0b", "#ef4444", "#06b6d4"]
    const bg = colors[(firstName.charCodeAt(0) + lastName.charCodeAt(0)) % colors.length]
    if (photo) return <img src={photo} alt="" style={{ width: size, height: size }} className="rounded-full object-cover shrink-0" />
    return (
        <div style={{ width: size, height: size, background: bg, fontSize: size * 0.33 }}
            className="rounded-full flex items-center justify-center text-white font-semibold shrink-0 select-none">
            {initials}
        </div>
    )
}

function StatusBadge({ status }: { status: string }) {
    const s = STATUS_COLORS[status]
    if (!s) return <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold border bg-[#f9fafb] text-[#6b7280] border-[#e5e7eb]">Not Marked</span>
    return (
        <span style={{ color: s.color, background: s.bg, borderColor: s.border }}
            className="px-2 py-0.5 rounded-full text-[11px] font-semibold border whitespace-nowrap">
            {s.label}
        </span>
    )
}

// ─── Mark Attendance Modal ────────────────────────────────────────────────────

type MarkForm = { status: string; checkIn: string; checkOut: string; overtimeHrs: string; remarks: string }

function MarkAttendanceModal({
    open, onClose, onSaved, employees, date, existing, preselected
}: {
    open: boolean
    onClose: () => void
    onSaved: () => void
    employees: Employee[]
    date: Date
    existing?: AttendanceRecord | null
    preselected?: Employee | null
}) {
    const [loading, setLoading] = useState(false)
    const [selectedEmpId, setSelectedEmpId] = useState("")
    const [form, setForm] = useState<MarkForm>({ status: "PRESENT", checkIn: "", checkOut: "", overtimeHrs: "0", remarks: "" })

    useEffect(() => {
        if (!open) return
        if (preselected) setSelectedEmpId(preselected.id)
        if (existing) {
            setForm({
                status: existing.status,
                checkIn: existing.checkIn ? format(new Date(existing.checkIn), "HH:mm") : "",
                checkOut: existing.checkOut ? format(new Date(existing.checkOut), "HH:mm") : "",
                overtimeHrs: existing.overtimeHrs.toString(),
                remarks: existing.remarks || "",
            })
        } else {
            setForm({ status: "PRESENT", checkIn: "", checkOut: "", overtimeHrs: "0", remarks: "" })
        }
    }, [existing, open, preselected])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        const empId = preselected?.id || selectedEmpId
        if (!empId) return toast.error("Select an employee")
        setLoading(true)
        try {
            const dateStr = format(date, "yyyy-MM-dd")
            const checkInDT = form.checkIn ? `${dateStr}T${form.checkIn}:00` : null
            const checkOutDT = form.checkOut ? `${dateStr}T${form.checkOut}:00` : null

            if (existing) {
                const res = await fetch(`/api/attendance/${existing.id}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ status: form.status, checkIn: checkInDT, checkOut: checkOutDT, overtimeHrs: parseFloat(form.overtimeHrs) || 0, remarks: form.remarks }),
                })
                if (!res.ok) throw new Error(await res.text())
            } else {
                const res = await fetch("/api/attendance", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ employeeId: empId, date: dateStr, checkIn: checkInDT, checkOut: checkOutDT, status: form.status, overtimeHrs: parseFloat(form.overtimeHrs) || 0, remarks: form.remarks }),
                })
                if (!res.ok) throw new Error(await res.text())
            }
            toast.success("Attendance saved!")
            onSaved()
            onClose()
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : "Failed to save")
        } finally {
            setLoading(false)
        }
    }

    if (!open) return null

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <div className="bg-[var(--surface)] rounded-[16px] border border-[var(--border)] w-full max-w-md shadow-xl">
                <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
                    <div>
                        <h2 className="text-[15px] font-semibold text-[var(--text)]">{existing ? "Edit Attendance" : "Mark Attendance"}</h2>
                        <p className="text-[12px] text-[var(--text3)]">{format(date, "dd MMM yyyy")}</p>
                    </div>
                    <button onClick={onClose} className="p-1 text-[var(--text3)] hover:text-[var(--text)] rounded-md hover:bg-[var(--surface2)] transition-colors"><X size={18} /></button>
                </div>
                <form onSubmit={handleSubmit} className="p-5 space-y-4">
                    {!preselected && (
                        <div>
                            <label className="block text-[12px] text-[var(--text2)] mb-1">Employee</label>
                            <select value={selectedEmpId} onChange={e => setSelectedEmpId(e.target.value)} required
                                className="w-full h-9 rounded-[8px] border border-[var(--border)] bg-[var(--surface)] px-3 text-[13px] text-[var(--text)] outline-none focus:border-[var(--accent)] transition-colors">
                                <option value="">Select employee...</option>
                                {employees.map(e => <option key={e.id} value={e.id}>{e.firstName} {e.lastName} ({e.employeeId})</option>)}
                            </select>
                        </div>
                    )}
                    <div>
                        <label className="block text-[12px] text-[var(--text2)] mb-2">Status</label>
                        <div className="grid grid-cols-3 gap-2">
                            {Object.entries(STATUS_COLORS).map(([key, val]) => (
                                <button key={key} type="button"
                                    onClick={() => setForm(f => ({ ...f, status: key }))}
                                    style={form.status === key ? { background: val.bg, color: val.color, borderColor: val.border } : {}}
                                    className={`h-9 rounded-[8px] border text-[12px] font-medium transition-all ${form.status === key ? "border" : "border-[var(--border)] text-[var(--text3)] hover:bg-[var(--surface2)]"}`}>
                                    {val.label}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-[12px] text-[var(--text2)] mb-1">Check In</label>
                            <input type="time" value={form.checkIn} onChange={e => setForm(f => ({ ...f, checkIn: e.target.value }))}
                                className="w-full h-9 rounded-[8px] border border-[var(--border)] bg-[var(--surface)] px-3 text-[13px] text-[var(--text)] outline-none focus:border-[var(--accent)] transition-colors" />
                        </div>
                        <div>
                            <label className="block text-[12px] text-[var(--text2)] mb-1">Check Out</label>
                            <input type="time" value={form.checkOut} onChange={e => setForm(f => ({ ...f, checkOut: e.target.value }))}
                                className="w-full h-9 rounded-[8px] border border-[var(--border)] bg-[var(--surface)] px-3 text-[13px] text-[var(--text)] outline-none focus:border-[var(--accent)] transition-colors" />
                        </div>
                    </div>
                    <div>
                        <label className="block text-[12px] text-[var(--text2)] mb-1">Overtime Hours</label>
                        <input type="number" step="0.5" min="0" value={form.overtimeHrs} onChange={e => setForm(f => ({ ...f, overtimeHrs: e.target.value }))}
                            className="w-full h-9 rounded-[8px] border border-[var(--border)] bg-[var(--surface)] px-3 text-[13px] text-[var(--text)] outline-none focus:border-[var(--accent)] transition-colors" />
                    </div>
                    <div>
                        <label className="block text-[12px] text-[var(--text2)] mb-1">Remarks</label>
                        <input value={form.remarks} onChange={e => setForm(f => ({ ...f, remarks: e.target.value }))}
                            className="w-full h-9 rounded-[8px] border border-[var(--border)] bg-[var(--surface)] px-3 text-[13px] text-[var(--text)] outline-none focus:border-[var(--accent)] transition-colors"
                            placeholder="Optional remarks" />
                    </div>
                    <div className="flex items-center justify-end gap-2 pt-1">
                        <button type="button" onClick={onClose} className="px-4 py-2 text-[13px] font-medium text-[var(--text2)] hover:text-[var(--text)] rounded-[8px] hover:bg-[var(--surface2)] transition-colors">Cancel</button>
                        <button type="submit" disabled={loading}
                            className="inline-flex items-center gap-2 px-5 py-2 bg-[var(--accent)] text-white rounded-[8px] text-[13px] font-medium hover:opacity-90 transition-opacity disabled:opacity-50">
                            {loading && <Loader2 size={14} className="animate-spin" />}
                            Save
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}

// ─── Bulk Mark Modal ──────────────────────────────────────────────────────────

function BulkMarkModal({ open, onClose, onSaved, employees }: {
    open: boolean; onClose: () => void; onSaved: () => void; employees: Employee[]
}) {
    const [loading, setLoading] = useState(false)
    const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"))
    const [statuses, setStatuses] = useState<Record<string, string>>({})

    useEffect(() => {
        if (open) {
            const initial: Record<string, string> = {}
            employees.forEach(e => { initial[e.id] = "PRESENT" })
            setStatuses(initial)
            setDate(format(new Date(), "yyyy-MM-dd"))
        }
    }, [open, employees])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        try {
            const records = Object.entries(statuses).map(([employeeId, status]) => ({ employeeId, status }))
            const res = await fetch("/api/attendance/bulk", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ date, records }),
            })
            if (!res.ok) throw new Error(await res.text())
            toast.success(`Attendance marked for ${records.length} employees`)
            onSaved()
            onClose()
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : "Failed to save bulk attendance")
        } finally {
            setLoading(false)
        }
    }

    if (!open) return null

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <div className="bg-[var(--surface)] rounded-[16px] border border-[var(--border)] w-full max-w-2xl shadow-xl flex flex-col max-h-[90vh]">
                <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)] shrink-0">
                    <div>
                        <h2 className="text-[15px] font-semibold text-[var(--text)]">Bulk Mark Attendance</h2>
                        <p className="text-[12px] text-[var(--text3)]">Mark attendance for all active employees at once</p>
                    </div>
                    <button onClick={onClose} className="p-1 text-[var(--text3)] hover:text-[var(--text)] rounded-md hover:bg-[var(--surface2)] transition-colors"><X size={18} /></button>
                </div>
                <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
                    <div className="px-5 py-3 border-b border-[var(--border)] shrink-0">
                        <div className="flex items-center gap-3">
                            <label className="text-[13px] font-medium text-[var(--text2)]">Date</label>
                            <input type="date" value={date} onChange={e => setDate(e.target.value)}
                                className="h-9 rounded-[8px] border border-[var(--border)] bg-[var(--surface)] px-3 text-[13px] text-[var(--text)] outline-none focus:border-[var(--accent)]" />
                            <div className="flex items-center gap-2 ml-auto">
                                {BULK_STATUSES.map(s => (
                                    <button key={s} type="button"
                                        onClick={() => setStatuses(prev => {
                                            const next = { ...prev }
                                            Object.keys(next).forEach(k => { next[k] = s })
                                            return next
                                        })}
                                        className="px-3 py-1.5 rounded-[7px] border border-[var(--border)] text-[11px] font-medium text-[var(--text2)] hover:bg-[var(--surface2)] transition-colors">
                                        All {STATUS_COLORS[s]?.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                    <div className="flex-1 overflow-y-auto">
                        <table className="w-full">
                            <thead className="sticky top-0">
                                <tr className="border-b border-[var(--border)] bg-[var(--surface2)]/60">
                                    <th className="text-left text-[11px] font-semibold text-[var(--text3)] uppercase tracking-[0.5px] px-5 py-2.5">Employee</th>
                                    <th className="text-left text-[11px] font-semibold text-[var(--text3)] uppercase tracking-[0.5px] px-4 py-2.5">Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {employees.map((emp, i) => (
                                    <tr key={emp.id} className={`border-b border-[var(--border)] ${i === employees.length - 1 ? "border-b-0" : ""}`}>
                                        <td className="px-5 py-2.5">
                                            <div className="flex items-center gap-2.5">
                                                <Avatar firstName={emp.firstName} lastName={emp.lastName} photo={emp.photo} size={30} />
                                                <div>
                                                    <p className="text-[13px] font-medium text-[var(--text)]">{emp.firstName} {emp.lastName}</p>
                                                    <p className="text-[11px] text-[var(--text3)]">{emp.employeeId}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-4 py-2.5">
                                            <div className="flex items-center gap-1.5 flex-wrap">
                                                {BULK_STATUSES.map(s => {
                                                    const sc = STATUS_COLORS[s]
                                                    const active = statuses[emp.id] === s
                                                    return (
                                                        <button key={s} type="button"
                                                            onClick={() => setStatuses(prev => ({ ...prev, [emp.id]: s }))}
                                                            style={active ? { background: sc.bg, color: sc.color, borderColor: sc.border } : {}}
                                                            className={`px-2.5 py-1 rounded-[6px] border text-[11px] font-medium transition-all ${active ? "border" : "border-[var(--border)] text-[var(--text3)] hover:bg-[var(--surface2)]"}`}>
                                                            {sc.label}
                                                        </button>
                                                    )
                                                })}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-[var(--border)] shrink-0">
                        <button type="button" onClick={onClose} className="px-4 py-2 text-[13px] font-medium text-[var(--text2)] hover:text-[var(--text)] rounded-[8px] hover:bg-[var(--surface2)] transition-colors">Cancel</button>
                        <button type="submit" disabled={loading}
                            className="inline-flex items-center gap-2 px-5 py-2 bg-[var(--accent)] text-white rounded-[8px] text-[13px] font-medium hover:opacity-90 disabled:opacity-50">
                            {loading && <Loader2 size={14} className="animate-spin" />}
                            Save Attendance ({employees.length})
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}

// ─── Monthly Summary types & helpers ─────────────────────────────────────────

type MonthlySummary = {
    employee: Employee
    present: number
    absent: number
    late: number
    halfDay: number
    leave: number
    overtimeHrs: number
    attendancePct: number
    totalDays: number
}

function AttendancePct({ pct }: { pct: number }) {
    const color = pct >= 90 ? "#1a9e6e" : pct >= 75 ? "#f59e0b" : "#dc2626"
    const bg = pct >= 90 ? "#e8f7f1" : pct >= 75 ? "#fffbeb" : "#fef2f2"
    const border = pct >= 90 ? "#6ee7b7" : pct >= 75 ? "#fde68a" : "#fecaca"
    return (
        <span style={{ color, background: bg, borderColor: border }}
            className="px-2 py-0.5 rounded-full text-[11px] font-semibold border whitespace-nowrap">
            {pct.toFixed(1)}%
        </span>
    )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AttendancePage() {
    const { data: session, status } = useSession()
    const router = useRouter()

    const [tab, setTab] = useState<"daily" | "monthly">("daily")
    const [selectedDate, setSelectedDate] = useState(new Date())
    const [selectedMonth, setSelectedMonth] = useState(format(new Date(), "yyyy-MM"))
    const [employees, setEmployees] = useState<Employee[]>([])
    const [attendances, setAttendances] = useState<AttendanceRecord[]>([])
    const [monthlyAttendances, setMonthlyAttendances] = useState<AttendanceRecord[]>([])
    const [sites, setSites] = useState<Site[]>([])
    const [siteFilter, setSiteFilter] = useState("")
    const [search, setSearch] = useState("")
    const [loading, setLoading] = useState(true)
    const [markModal, setMarkModal] = useState(false)
    const [bulkModal, setBulkModal] = useState(false)
    const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null)
    const [existingRecord, setExistingRecord] = useState<AttendanceRecord | null>(null)

    useEffect(() => {
        if (status !== "unauthenticated") return
        router.push("/login")
    }, [status, router])

    useEffect(() => {
        fetch("/api/sites").then(r => r.json()).then(d => setSites(Array.isArray(d) ? d : [])).catch(() => {})
    }, [])

    const fetchEmployees = useCallback(async () => {
        try {
            const params = new URLSearchParams({ status: "ACTIVE" })
            if (siteFilter) params.set("siteId", siteFilter)
            const res = await fetch(`/api/employees?${params}`)
            const data = await res.json()
            setEmployees(Array.isArray(data) ? data : [])
        } catch { setEmployees([]) }
    }, [siteFilter])

    const fetchAttendances = useCallback(async () => {
        setLoading(true)
        try {
            const params = new URLSearchParams({ date: format(selectedDate, "yyyy-MM-dd") })
            if (siteFilter) params.set("siteId", siteFilter)
            if (search) params.set("search", search)
            const res = await fetch(`/api/attendance?${params}`)
            const data = await res.json()
            setAttendances(Array.isArray(data) ? data : [])
        } catch {
            toast.error("Failed to load attendance")
        } finally {
            setLoading(false)
        }
    }, [selectedDate, siteFilter, search])

    const fetchMonthlyAttendances = useCallback(async () => {
        setLoading(true)
        try {
            const params = new URLSearchParams({ month: selectedMonth })
            if (siteFilter) params.set("siteId", siteFilter)
            const res = await fetch(`/api/attendance?${params}`)
            const data = await res.json()
            setMonthlyAttendances(Array.isArray(data) ? data : [])
        } catch {
            toast.error("Failed to load monthly attendance")
        } finally {
            setLoading(false)
        }
    }, [selectedMonth, siteFilter])

    useEffect(() => {
        if (status !== "authenticated") return
        fetchEmployees()
    }, [status, fetchEmployees])

    useEffect(() => {
        if (status !== "authenticated") return
        if (tab === "daily") fetchAttendances()
        else fetchMonthlyAttendances()
    }, [status, tab, fetchAttendances, fetchMonthlyAttendances])

    // Stats for daily view
    const attendanceMap = new Map(attendances.map(a => [a.employeeId, a]))
    const filteredEmployees = employees.filter(e =>
        !search || `${e.firstName} ${e.lastName} ${e.employeeId}`.toLowerCase().includes(search.toLowerCase())
    )
    const presentCount = attendances.filter(a => a.status === "PRESENT").length
    const absentCount = filteredEmployees.filter(e => !attendanceMap.has(e.id)).length
    const lateHalfCount = attendances.filter(a => a.status === "LATE" || a.status === "HALF_DAY").length
    const onLeaveCount = attendances.filter(a => a.status === "LEAVE").length

    // Monthly summary computation
    const monthlySummary: MonthlySummary[] = employees.map(emp => {
        const empRecords = monthlyAttendances.filter(a => a.employeeId === emp.id)
        const [yr, mo] = selectedMonth.split("-").map(Number)
        const daysInMonth = new Date(yr, mo, 0).getDate()
        const present = empRecords.filter(a => a.status === "PRESENT").length
        const absent = empRecords.filter(a => a.status === "ABSENT").length
        const late = empRecords.filter(a => a.status === "LATE").length
        const halfDay = empRecords.filter(a => a.status === "HALF_DAY").length
        const leave = empRecords.filter(a => a.status === "LEAVE").length
        const overtimeHrs = empRecords.reduce((s, a) => s + (a.overtimeHrs || 0), 0)
        const attendancePct = daysInMonth > 0 ? (present / daysInMonth) * 100 : 0
        return { employee: emp, present, absent, late, halfDay, leave, overtimeHrs, attendancePct, totalDays: daysInMonth }
    })

    const statsCards = [
        { label: "Present",        value: presentCount,   color: "#1a9e6e", bg: "#e8f7f1", icon: <CheckCircle size={18} /> },
        { label: "Absent",         value: absentCount,    color: "#dc2626", bg: "#fef2f2", icon: <XCircle size={18} /> },
        { label: "Late / Half Day",value: lateHalfCount,  color: "#f59e0b", bg: "#fffbeb", icon: <Clock size={18} /> },
        { label: "On Leave",       value: onLeaveCount,   color: "#8b5cf6", bg: "#f5f3ff", icon: <Users size={18} /> },
    ]

    return (
        <div className="space-y-5">
            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <h1 className="text-[24px] font-semibold tracking-[-0.4px] text-[var(--text)]">Attendance</h1>
                    <p className="text-[13px] text-[var(--text3)] mt-0.5">Track and manage employee attendance</p>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={() => setBulkModal(true)}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-[8px] border border-[var(--border)] bg-white text-[13px] font-medium text-[var(--text2)] hover:bg-[var(--surface2)] transition-colors">
                        <Users size={15} /> Bulk Mark
                    </button>
                    <button onClick={() => { setSelectedEmployee(null); setExistingRecord(null); setMarkModal(true) }}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-[8px] bg-[var(--accent)] text-white text-[13px] font-medium hover:opacity-90 transition-opacity">
                        <Plus size={15} /> Mark Attendance
                    </button>
                </div>
            </div>

            {/* Sub-tabs */}
            <div className="flex items-center gap-1 bg-[var(--surface2)] rounded-[10px] p-1 w-fit">
                {(["daily", "monthly"] as const).map(t => (
                    <button key={t} onClick={() => setTab(t)}
                        className={`px-4 py-1.5 rounded-[7px] text-[13px] font-medium transition-all capitalize ${tab === t ? "bg-white shadow-sm text-[var(--text)]" : "text-[var(--text2)] hover:text-[var(--text)]"}`}>
                        {t === "daily" ? "Daily View" : "Monthly Summary"}
                    </button>
                ))}
            </div>

            {tab === "daily" ? (
                <>
                    {/* Filters */}
                    <div className="flex flex-wrap items-center gap-3">
                        <div className="flex items-center gap-2 bg-[var(--surface)] border border-[var(--border)] rounded-[10px] px-3 py-2">
                            <button onClick={() => setSelectedDate(d => { const n = new Date(d); n.setDate(n.getDate() - 1); return n })}
                                className="p-0.5 text-[var(--text3)] hover:text-[var(--text)] transition-colors"><ChevronLeft size={16} /></button>
                            <input type="date" value={format(selectedDate, "yyyy-MM-dd")}
                                onChange={e => { const d = new Date(e.target.value); if (!isNaN(d.getTime())) setSelectedDate(d) }}
                                className="text-[13px] font-medium text-[var(--text)] outline-none bg-transparent cursor-pointer" />
                            <button onClick={() => setSelectedDate(d => { const n = new Date(d); n.setDate(n.getDate() + 1); return n })}
                                className="p-0.5 text-[var(--text3)] hover:text-[var(--text)] transition-colors"><ChevronRight size={16} /></button>
                        </div>
                        <select value={siteFilter} onChange={e => setSiteFilter(e.target.value)}
                            className="h-9 rounded-[8px] border border-[var(--border)] bg-[var(--surface)] px-3 text-[13px] text-[var(--text)] outline-none focus:border-[var(--accent)] transition-colors">
                            <option value="">All Sites</option>
                            {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                        <div className="relative flex-1 min-w-[200px]">
                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text3)]" />
                            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search employees..."
                                className="w-full h-9 rounded-[8px] border border-[var(--border)] bg-[var(--surface)] pl-8 pr-3 text-[13px] text-[var(--text)] outline-none focus:border-[var(--accent)] transition-colors" />
                        </div>
                    </div>

                    {/* Stats */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {statsCards.map(s => (
                            <div key={s.label} className="bg-[var(--surface)] border border-[var(--border)] rounded-[12px] p-4 flex items-center gap-3">
                                <div style={{ background: s.bg, color: s.color }} className="w-10 h-10 rounded-[10px] flex items-center justify-center shrink-0">{s.icon}</div>
                                <div>
                                    <p className="text-[22px] font-bold text-[var(--text)] leading-tight">{s.value}</p>
                                    <p className="text-[11.5px] text-[var(--text3)]">{s.label}</p>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Table */}
                    {loading ? (
                        <div className="flex items-center justify-center py-16"><Loader2 size={28} className="animate-spin text-[var(--accent)]" /></div>
                    ) : filteredEmployees.length === 0 ? (
                        <div className="flex min-h-[200px] items-center justify-center rounded-[14px] bg-[var(--surface)] border border-dashed border-[var(--border)]">
                            <div className="text-center">
                                <CalendarDays size={32} className="text-[var(--text3)] mx-auto mb-2" />
                                <p className="text-[13px] text-[var(--text3)]">No employees found</p>
                            </div>
                        </div>
                    ) : (
                        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[12px] overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead>
                                        <tr className="border-b border-[var(--border)] bg-[var(--surface2)]/40">
                                            <th className="text-left text-[11px] font-semibold text-[var(--text3)] uppercase tracking-[0.5px] px-5 py-3">Employee</th>
                                            <th className="text-left text-[11px] font-semibold text-[var(--text3)] uppercase tracking-[0.5px] px-4 py-3">Check In</th>
                                            <th className="text-left text-[11px] font-semibold text-[var(--text3)] uppercase tracking-[0.5px] px-4 py-3">Check Out</th>
                                            <th className="text-left text-[11px] font-semibold text-[var(--text3)] uppercase tracking-[0.5px] px-4 py-3">Working Hrs</th>
                                            <th className="text-left text-[11px] font-semibold text-[var(--text3)] uppercase tracking-[0.5px] px-4 py-3">Status</th>
                                            <th className="text-left text-[11px] font-semibold text-[var(--text3)] uppercase tracking-[0.5px] px-4 py-3">OT Hrs</th>
                                            <th className="text-right text-[11px] font-semibold text-[var(--text3)] uppercase tracking-[0.5px] px-5 py-3">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredEmployees.map((emp, i) => {
                                            const att = attendanceMap.get(emp.id)
                                            return (
                                                <tr key={emp.id} className={`border-b border-[var(--border)] hover:bg-[var(--surface2)]/30 transition-colors ${i === filteredEmployees.length - 1 ? "border-b-0" : ""}`}>
                                                    <td className="px-5 py-3">
                                                        <div className="flex items-center gap-3">
                                                            <Avatar firstName={emp.firstName} lastName={emp.lastName} photo={emp.photo} />
                                                            <div>
                                                                <p className="text-[13px] font-semibold text-[var(--text)]">{emp.firstName} {emp.lastName}</p>
                                                                <p className="text-[11px] text-[var(--text3)]">{emp.employeeId} · {emp.designation || "—"}</p>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-3 text-[13px] text-[var(--text2)]">
                                                        {att?.checkIn ? format(new Date(att.checkIn), "HH:mm") : "—"}
                                                    </td>
                                                    <td className="px-4 py-3 text-[13px] text-[var(--text2)]">
                                                        {att?.checkOut ? format(new Date(att.checkOut), "HH:mm") : "—"}
                                                    </td>
                                                    <td className="px-4 py-3 text-[13px] text-[var(--text2)]">
                                                        {att?.workingHrs ? `${att.workingHrs}h` : "—"}
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <StatusBadge status={att?.status || ""} />
                                                    </td>
                                                    <td className="px-4 py-3 text-[13px] text-[var(--text2)]">
                                                        {att?.overtimeHrs ? `${att.overtimeHrs}h` : "0h"}
                                                    </td>
                                                    <td className="px-5 py-3 text-right">
                                                        <button onClick={() => {
                                                            setSelectedEmployee(emp)
                                                            setExistingRecord(att || null)
                                                            setMarkModal(true)
                                                        }}
                                                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[7px] border border-[var(--border)] text-[12px] font-medium text-[var(--text2)] hover:bg-[var(--surface2)] transition-colors">
                                                            {att ? <Edit2 size={12} /> : <Plus size={12} />}
                                                            {att ? "Edit" : "Mark"}
                                                        </button>
                                                    </td>
                                                </tr>
                                            )
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </>
            ) : (
                // ── Monthly Summary Tab ──
                <>
                    <div className="flex flex-wrap items-center gap-3">
                        <input type="month" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)}
                            className="h-9 rounded-[8px] border border-[var(--border)] bg-[var(--surface)] px-3 text-[13px] text-[var(--text)] outline-none focus:border-[var(--accent)] transition-colors" />
                        <select value={siteFilter} onChange={e => setSiteFilter(e.target.value)}
                            className="h-9 rounded-[8px] border border-[var(--border)] bg-[var(--surface)] px-3 text-[13px] text-[var(--text)] outline-none focus:border-[var(--accent)] transition-colors">
                            <option value="">All Sites</option>
                            {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                    </div>

                    {loading ? (
                        <div className="flex items-center justify-center py-16"><Loader2 size={28} className="animate-spin text-[var(--accent)]" /></div>
                    ) : (
                        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[12px] overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead>
                                        <tr className="border-b border-[var(--border)] bg-[var(--surface2)]/40">
                                            <th className="text-left text-[11px] font-semibold text-[var(--text3)] uppercase tracking-[0.5px] px-5 py-3">Employee</th>
                                            <th className="text-center text-[11px] font-semibold text-[var(--text3)] uppercase tracking-[0.5px] px-4 py-3">Present</th>
                                            <th className="text-center text-[11px] font-semibold text-[var(--text3)] uppercase tracking-[0.5px] px-4 py-3">Absent</th>
                                            <th className="text-center text-[11px] font-semibold text-[var(--text3)] uppercase tracking-[0.5px] px-4 py-3">Late</th>
                                            <th className="text-center text-[11px] font-semibold text-[var(--text3)] uppercase tracking-[0.5px] px-4 py-3">Half Day</th>
                                            <th className="text-center text-[11px] font-semibold text-[var(--text3)] uppercase tracking-[0.5px] px-4 py-3">Leave</th>
                                            <th className="text-center text-[11px] font-semibold text-[var(--text3)] uppercase tracking-[0.5px] px-4 py-3">OT Hrs</th>
                                            <th className="text-center text-[11px] font-semibold text-[var(--text3)] uppercase tracking-[0.5px] px-5 py-3">Attendance %</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {monthlySummary.length === 0 ? (
                                            <tr>
                                                <td colSpan={8} className="px-5 py-12 text-center text-[13px] text-[var(--text3)]">
                                                    No attendance data for this month
                                                </td>
                                            </tr>
                                        ) : monthlySummary.map((row, i) => (
                                            <tr key={row.employee.id} className={`border-b border-[var(--border)] hover:bg-[var(--surface2)]/30 transition-colors ${i === monthlySummary.length - 1 ? "border-b-0" : ""}`}>
                                                <td className="px-5 py-3">
                                                    <div className="flex items-center gap-3">
                                                        <Avatar firstName={row.employee.firstName} lastName={row.employee.lastName} photo={row.employee.photo} />
                                                        <div>
                                                            <p className="text-[13px] font-semibold text-[var(--text)]">{row.employee.firstName} {row.employee.lastName}</p>
                                                            <p className="text-[11px] text-[var(--text3)]">{row.employee.employeeId}</p>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3 text-center">
                                                    <span className="text-[13px] font-semibold" style={{ color: "#1a9e6e" }}>{row.present}</span>
                                                </td>
                                                <td className="px-4 py-3 text-center">
                                                    <span className="text-[13px] font-semibold" style={{ color: "#dc2626" }}>{row.absent}</span>
                                                </td>
                                                <td className="px-4 py-3 text-center">
                                                    <span className="text-[13px] font-semibold" style={{ color: "#f59e0b" }}>{row.late}</span>
                                                </td>
                                                <td className="px-4 py-3 text-center">
                                                    <span className="text-[13px] font-semibold" style={{ color: "#f59e0b" }}>{row.halfDay}</span>
                                                </td>
                                                <td className="px-4 py-3 text-center">
                                                    <span className="text-[13px] font-semibold" style={{ color: "#8b5cf6" }}>{row.leave}</span>
                                                </td>
                                                <td className="px-4 py-3 text-center text-[13px] text-[var(--text2)]">
                                                    {row.overtimeHrs.toFixed(1)}h
                                                </td>
                                                <td className="px-5 py-3 text-center">
                                                    <AttendancePct pct={row.attendancePct} />
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </>
            )}

            {/* Modals */}
            <MarkAttendanceModal
                open={markModal}
                onClose={() => { setMarkModal(false); setSelectedEmployee(null); setExistingRecord(null) }}
                onSaved={() => { if (tab === "daily") fetchAttendances(); else fetchMonthlyAttendances() }}
                employees={employees}
                date={selectedDate}
                existing={existingRecord}
                preselected={selectedEmployee}
            />
            <BulkMarkModal
                open={bulkModal}
                onClose={() => setBulkModal(false)}
                onSaved={() => { if (tab === "daily") fetchAttendances(); else fetchMonthlyAttendances() }}
                employees={employees}
            />
        </div>
    )
}
