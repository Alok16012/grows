"use client"

import { useState, useEffect, useCallback } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import {
    Navigation,
    RefreshCw,
    Plus,
    ChevronDown,
    X,
    CheckCircle2,
    Clock,
    AlertTriangle,
    Users,
    MoreHorizontal,
    Play,
    Check,
    Trash2,
    Eye,
    MapPin,
} from "lucide-react"
import { formatDistanceToNow } from "date-fns"

// ─── Types ─────────────────────────────────────────────────────────────────────

type TaskPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT"
type FieldTaskStatus = "ASSIGNED" | "IN_PROGRESS" | "COMPLETED" | "MISSED" | "CANCELLED"

interface FieldTask {
    id: string
    taskNo: string
    title: string
    description: string | null
    employeeId: string
    siteId: string | null
    siteName: string | null
    priority: TaskPriority
    status: FieldTaskStatus
    dueDate: string
    dueTime: string | null
    completedAt: string | null
    completedNote: string | null
    assignedBy: string
    createdAt: string
    employee: {
        id: string
        employeeId: string
        firstName: string
        lastName: string
        photo: string | null
        designation: string | null
    }
}

interface EmployeeOption {
    id: string
    employeeId: string
    firstName: string
    lastName: string
    designation: string | null
}

interface SiteOption {
    id: string
    name: string
}

interface CheckIn {
    id: string
    employeeId: string
    siteId: string | null
    siteName: string | null
    latitude: number
    longitude: number
    accuracy: number | null
    checkedInAt: string
    notes: string | null
    isGeofenced: boolean
    distanceFromSite: number | null
    employee: {
        id: string
        employeeId: string
        firstName: string
        lastName: string
        photo: string | null
        designation: string | null
    }
}

interface LatestCheckIn {
    employee: {
        id: string
        employeeId: string
        firstName: string
        lastName: string
        photo: string | null
        designation: string | null
    }
    lastCheckIn: (CheckIn & { siteName: string | null }) | null
    checkedInToday: boolean
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function getInitials(first: string, last: string) {
    return `${first[0] ?? ""}${last[0] ?? ""}`.toUpperCase()
}

function formatDate(dateStr: string) {
    const d = new Date(dateStr)
    return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
}

function formatTime(dateStr: string) {
    const d = new Date(dateStr)
    return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })
}

function todayISO() {
    return new Date().toISOString().split("T")[0]
}

const PRIORITY_STYLES: Record<TaskPriority, string> = {
    URGENT: "bg-red-100 text-red-700",
    HIGH: "bg-orange-100 text-orange-700",
    MEDIUM: "bg-blue-100 text-blue-700",
    LOW: "bg-gray-100 text-gray-600",
}

const STATUS_STYLES: Record<FieldTaskStatus, string> = {
    ASSIGNED: "bg-[var(--surface2)] text-[var(--text2)]",
    IN_PROGRESS: "bg-blue-100 text-blue-700",
    COMPLETED: "bg-green-100 text-green-700",
    MISSED: "bg-red-100 text-red-700",
    CANCELLED: "bg-gray-100 text-gray-500",
}

// ─── Avatar ────────────────────────────────────────────────────────────────────

function Avatar({ photo, firstName, lastName, size = 32 }: { photo: string | null; firstName: string; lastName: string; size?: number }) {
    if (photo) {
        return (
            <img
                src={photo}
                alt={`${firstName} ${lastName}`}
                style={{ width: size, height: size }}
                className="rounded-full object-cover shrink-0"
            />
        )
    }
    return (
        <div
            style={{ width: size, height: size, fontSize: size * 0.35 }}
            className="rounded-full bg-[var(--accent-light)] text-[var(--accent)] font-semibold flex items-center justify-center shrink-0"
        >
            {getInitials(firstName, lastName)}
        </div>
    )
}

// ─── Assign Task Modal ─────────────────────────────────────────────────────────

function AssignTaskModal({
    employees,
    sites,
    onClose,
    onCreated,
}: {
    employees: EmployeeOption[]
    sites: SiteOption[]
    onClose: () => void
    onCreated: () => void
}) {
    const [form, setForm] = useState({
        title: "",
        description: "",
        employeeId: "",
        siteId: "",
        priority: "MEDIUM" as TaskPriority,
        dueDate: todayISO(),
        dueTime: "",
    })
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState("")

    const set = (key: string, val: string) => setForm((f) => ({ ...f, [key]: val }))

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        if (!form.title || !form.employeeId || !form.dueDate) {
            setError("Title, employee and due date are required")
            return
        }
        setSaving(true)
        setError("")
        try {
            const res = await fetch("/api/field/tasks", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    ...form,
                    siteId: form.siteId || null,
                    dueTime: form.dueTime || null,
                }),
            })
            if (!res.ok) {
                const msg = await res.text()
                setError(msg || "Failed to create task")
                return
            }
            onCreated()
            onClose()
        } catch {
            setError("Network error")
        } finally {
            setSaving(false)
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="bg-[var(--surface)] rounded-[16px] border border-[var(--border)] shadow-xl w-full max-w-lg mx-4 overflow-hidden">
                <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)]">
                    <h2 className="font-semibold text-[var(--text)] text-[16px]">Assign Field Task</h2>
                    <button onClick={onClose} className="p-1 rounded-md hover:bg-[var(--surface2)] text-[var(--text3)]">
                        <X size={18} />
                    </button>
                </div>
                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    {error && (
                        <div className="text-[13px] text-red-600 bg-red-50 border border-red-200 rounded-[8px] px-3 py-2">{error}</div>
                    )}
                    <div>
                        <label className="block text-[12px] font-medium text-[var(--text2)] mb-1">Title *</label>
                        <input
                            value={form.title}
                            onChange={(e) => set("title", e.target.value)}
                            className="w-full h-9 px-3 rounded-[8px] border border-[var(--border)] bg-[var(--surface)] text-[13px] text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                            placeholder="Task title"
                        />
                    </div>
                    <div>
                        <label className="block text-[12px] font-medium text-[var(--text2)] mb-1">Description</label>
                        <textarea
                            value={form.description}
                            onChange={(e) => set("description", e.target.value)}
                            rows={2}
                            className="w-full px-3 py-2 rounded-[8px] border border-[var(--border)] bg-[var(--surface)] text-[13px] text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] resize-none"
                            placeholder="Optional description"
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-[12px] font-medium text-[var(--text2)] mb-1">Employee *</label>
                            <div className="relative">
                                <select
                                    value={form.employeeId}
                                    onChange={(e) => set("employeeId", e.target.value)}
                                    className="w-full h-9 px-3 pr-8 rounded-[8px] border border-[var(--border)] bg-[var(--surface)] text-[13px] text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] appearance-none"
                                >
                                    <option value="">Select employee</option>
                                    {employees.map((emp) => (
                                        <option key={emp.id} value={emp.id}>
                                            {emp.firstName} {emp.lastName} ({emp.employeeId})
                                        </option>
                                    ))}
                                </select>
                                <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text3)] pointer-events-none" />
                            </div>
                        </div>
                        <div>
                            <label className="block text-[12px] font-medium text-[var(--text2)] mb-1">Site (optional)</label>
                            <div className="relative">
                                <select
                                    value={form.siteId}
                                    onChange={(e) => set("siteId", e.target.value)}
                                    className="w-full h-9 px-3 pr-8 rounded-[8px] border border-[var(--border)] bg-[var(--surface)] text-[13px] text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] appearance-none"
                                >
                                    <option value="">No site</option>
                                    {sites.map((s) => (
                                        <option key={s.id} value={s.id}>{s.name}</option>
                                    ))}
                                </select>
                                <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text3)] pointer-events-none" />
                            </div>
                        </div>
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                        <div>
                            <label className="block text-[12px] font-medium text-[var(--text2)] mb-1">Priority</label>
                            <div className="relative">
                                <select
                                    value={form.priority}
                                    onChange={(e) => set("priority", e.target.value)}
                                    className="w-full h-9 px-3 pr-8 rounded-[8px] border border-[var(--border)] bg-[var(--surface)] text-[13px] text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] appearance-none"
                                >
                                    <option value="LOW">Low</option>
                                    <option value="MEDIUM">Medium</option>
                                    <option value="HIGH">High</option>
                                    <option value="URGENT">Urgent</option>
                                </select>
                                <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text3)] pointer-events-none" />
                            </div>
                        </div>
                        <div>
                            <label className="block text-[12px] font-medium text-[var(--text2)] mb-1">Due Date *</label>
                            <input
                                type="date"
                                value={form.dueDate}
                                onChange={(e) => set("dueDate", e.target.value)}
                                className="w-full h-9 px-3 rounded-[8px] border border-[var(--border)] bg-[var(--surface)] text-[13px] text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                            />
                        </div>
                        <div>
                            <label className="block text-[12px] font-medium text-[var(--text2)] mb-1">Due Time</label>
                            <input
                                type="time"
                                value={form.dueTime}
                                onChange={(e) => set("dueTime", e.target.value)}
                                className="w-full h-9 px-3 rounded-[8px] border border-[var(--border)] bg-[var(--surface)] text-[13px] text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                            />
                        </div>
                    </div>
                    <div className="flex justify-end gap-3 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="h-9 px-4 rounded-[8px] border border-[var(--border)] text-[13px] text-[var(--text2)] hover:bg-[var(--surface2)]"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={saving}
                            className="h-9 px-4 rounded-[8px] bg-[var(--accent)] text-white text-[13px] font-medium hover:opacity-90 disabled:opacity-50"
                        >
                            {saving ? "Saving..." : "Assign Task"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}

// ─── Task Detail Drawer ────────────────────────────────────────────────────────

function TaskDrawer({
    task,
    onClose,
    onUpdated,
}: {
    task: FieldTask
    onClose: () => void
    onUpdated: () => void
}) {
    const [completionNote, setCompletionNote] = useState("")
    const [saving, setSaving] = useState(false)

    async function updateStatus(status: FieldTaskStatus) {
        setSaving(true)
        try {
            await fetch(`/api/field/tasks/${task.id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status, completedNote: completionNote || undefined }),
            })
            onUpdated()
            onClose()
        } finally {
            setSaving(false)
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex justify-end">
            <div className="absolute inset-0 bg-black/30" onClick={onClose} />
            <div className="relative z-10 w-full max-w-md bg-[var(--surface)] h-full overflow-y-auto shadow-2xl border-l border-[var(--border)] flex flex-col">
                <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)] shrink-0">
                    <div className="flex items-center gap-2">
                        <span className="font-mono text-[13px] text-[var(--accent)] font-semibold">{task.taskNo}</span>
                        <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${STATUS_STYLES[task.status]}`}>
                            {task.status.replace("_", " ")}
                        </span>
                    </div>
                    <button onClick={onClose} className="p-1 rounded-md hover:bg-[var(--surface2)] text-[var(--text3)]">
                        <X size={18} />
                    </button>
                </div>

                <div className="p-6 space-y-5 flex-1">
                    <div>
                        <h3 className="text-[17px] font-semibold text-[var(--text)] leading-tight">{task.title}</h3>
                        {task.description && (
                            <p className="text-[13px] text-[var(--text2)] mt-1.5 leading-relaxed">{task.description}</p>
                        )}
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="bg-[var(--surface2)] rounded-[10px] p-3">
                            <p className="text-[11px] text-[var(--text3)] font-medium mb-1">PRIORITY</p>
                            <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${PRIORITY_STYLES[task.priority]}`}>
                                {task.priority}
                            </span>
                        </div>
                        <div className="bg-[var(--surface2)] rounded-[10px] p-3">
                            <p className="text-[11px] text-[var(--text3)] font-medium mb-1">DUE</p>
                            <p className="text-[13px] text-[var(--text)] font-medium">
                                {formatDate(task.dueDate)}
                                {task.dueTime && <span className="text-[var(--text2)]"> · {task.dueTime}</span>}
                            </p>
                        </div>
                    </div>

                    <div className="bg-[var(--surface2)] rounded-[10px] p-4">
                        <p className="text-[11px] text-[var(--text3)] font-medium mb-2">ASSIGNED TO</p>
                        <div className="flex items-center gap-3">
                            <Avatar photo={task.employee.photo} firstName={task.employee.firstName} lastName={task.employee.lastName} size={36} />
                            <div>
                                <p className="text-[13px] font-medium text-[var(--text)]">
                                    {task.employee.firstName} {task.employee.lastName}
                                </p>
                                <p className="text-[11px] text-[var(--text3)]">{task.employee.employeeId}</p>
                                {task.employee.designation && (
                                    <p className="text-[11px] text-[var(--text3)]">{task.employee.designation}</p>
                                )}
                            </div>
                        </div>
                    </div>

                    {task.siteName && (
                        <div className="bg-[var(--surface2)] rounded-[10px] p-3 flex items-center gap-2">
                            <MapPin size={14} className="text-[var(--accent)]" />
                            <div>
                                <p className="text-[11px] text-[var(--text3)]">Site</p>
                                <p className="text-[13px] font-medium text-[var(--text)]">{task.siteName}</p>
                            </div>
                        </div>
                    )}

                    {task.status === "COMPLETED" && (
                        <div className="bg-green-50 border border-green-200 rounded-[10px] p-4">
                            <p className="text-[11px] text-green-600 font-medium mb-1">COMPLETED</p>
                            <p className="text-[13px] text-green-800">{task.completedAt ? formatDate(task.completedAt) : ""}</p>
                            {task.completedNote && (
                                <p className="text-[12px] text-green-700 mt-1">{task.completedNote}</p>
                            )}
                        </div>
                    )}

                    {task.status === "MISSED" && (
                        <div className="bg-red-50 border border-red-200 rounded-[10px] p-3">
                            <p className="text-[12px] text-red-700 font-medium">Task was missed</p>
                        </div>
                    )}

                    {task.status === "ASSIGNED" && (
                        <div className="pt-2">
                            <button
                                onClick={() => updateStatus("IN_PROGRESS")}
                                disabled={saving}
                                className="w-full h-10 rounded-[8px] bg-blue-600 text-white text-[13px] font-medium flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-50"
                            >
                                <Play size={14} />
                                Start Task
                            </button>
                        </div>
                    )}

                    {task.status === "IN_PROGRESS" && (
                        <div className="space-y-3 pt-2">
                            <div>
                                <label className="block text-[12px] font-medium text-[var(--text2)] mb-1">Completion Note</label>
                                <textarea
                                    value={completionNote}
                                    onChange={(e) => setCompletionNote(e.target.value)}
                                    rows={3}
                                    className="w-full px-3 py-2 rounded-[8px] border border-[var(--border)] bg-[var(--surface)] text-[13px] text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] resize-none"
                                    placeholder="Optional note on completion..."
                                />
                            </div>
                            <button
                                onClick={() => updateStatus("COMPLETED")}
                                disabled={saving}
                                className="w-full h-10 rounded-[8px] bg-[var(--accent)] text-white text-[13px] font-medium flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-50"
                            >
                                <Check size={14} />
                                Mark Complete
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

// ─── Task Row Menu ─────────────────────────────────────────────────────────────

function TaskMenu({
    task,
    onView,
    onStatusChange,
    onDelete,
}: {
    task: FieldTask
    onView: () => void
    onStatusChange: (status: FieldTaskStatus) => void
    onDelete: () => void
}) {
    const [open, setOpen] = useState(false)

    return (
        <div className="relative">
            <button
                onClick={() => setOpen((o) => !o)}
                className="p-1.5 rounded-md hover:bg-[var(--surface2)] text-[var(--text3)]"
            >
                <MoreHorizontal size={16} />
            </button>
            {open && (
                <>
                    <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
                    <div className="absolute right-0 top-8 z-20 bg-[var(--surface)] border border-[var(--border)] rounded-[10px] shadow-lg py-1 w-48 text-[13px]">
                        <button
                            onClick={() => { onView(); setOpen(false) }}
                            className="flex items-center gap-2.5 w-full px-3 py-2 text-[var(--text2)] hover:bg-[var(--surface2)] hover:text-[var(--text)]"
                        >
                            <Eye size={14} /> View / Edit
                        </button>
                        {task.status === "ASSIGNED" && (
                            <button
                                onClick={() => { onStatusChange("IN_PROGRESS"); setOpen(false) }}
                                className="flex items-center gap-2.5 w-full px-3 py-2 text-[var(--text2)] hover:bg-[var(--surface2)] hover:text-[var(--text)]"
                            >
                                <Play size={14} /> Mark In Progress
                            </button>
                        )}
                        {task.status === "IN_PROGRESS" && (
                            <button
                                onClick={() => { onStatusChange("COMPLETED"); setOpen(false) }}
                                className="flex items-center gap-2.5 w-full px-3 py-2 text-[var(--text2)] hover:bg-[var(--surface2)] hover:text-[var(--text)]"
                            >
                                <CheckCircle2 size={14} /> Mark Completed
                            </button>
                        )}
                        {task.status === "ASSIGNED" && (
                            <button
                                onClick={() => { onDelete(); setOpen(false) }}
                                className="flex items-center gap-2.5 w-full px-3 py-2 text-red-600 hover:bg-red-50"
                            >
                                <Trash2 size={14} /> Delete
                            </button>
                        )}
                    </div>
                </>
            )}
        </div>
    )
}

// ─── Main Page ──────────────────────────────────────────────────────────────────

export default function FieldPage() {
    const { data: session, status } = useSession()
    const router = useRouter()

    const [activeTab, setActiveTab] = useState<"tasks" | "activity">("tasks")

    // Stats
    const [stats, setStats] = useState({ dueTodayCount: 0, completedToday: 0, overdue: 0, activeField: 0 })

    // Tasks tab state
    const [tasks, setTasks] = useState<FieldTask[]>([])
    const [tasksLoading, setTasksLoading] = useState(true)
    const [statusFilter, setStatusFilter] = useState<string>("ALL")
    const [priorityFilter, setPriorityFilter] = useState<string>("ALL")
    const [dateFilter, setDateFilter] = useState(todayISO())
    const [searchFilter, setSearchFilter] = useState("")
    const [showAssignModal, setShowAssignModal] = useState(false)
    const [selectedTask, setSelectedTask] = useState<FieldTask | null>(null)
    const [employees, setEmployees] = useState<EmployeeOption[]>([])
    const [sites, setSites] = useState<SiteOption[]>([])

    // Activity tab state
    const [latestCheckIns, setLatestCheckIns] = useState<LatestCheckIn[]>([])
    const [checkInsLoading, setCheckInsLoading] = useState(false)
    const [historyDate, setHistoryDate] = useState(todayISO())
    const [historyCheckIns, setHistoryCheckIns] = useState<CheckIn[]>([])
    const [historyLoading, setHistoryLoading] = useState(false)

    useEffect(() => {
        if (status !== "unauthenticated") return
        router.push("/login")
    }, [status, router])

    useEffect(() => {
        if (!session) return
        fetchEmployees()
        fetchSites()
        fetchStats()
    }, [session])

    useEffect(() => {
        if (!session) return
        fetchTasks()
    }, [session, statusFilter, priorityFilter, dateFilter, searchFilter])

    useEffect(() => {
        if (activeTab === "activity" && session) {
            fetchLatestCheckIns()
            fetchHistoryCheckIns()
        }
    }, [activeTab, session])

    useEffect(() => {
        if (activeTab === "activity" && session) {
            fetchHistoryCheckIns()
        }
    }, [historyDate])

    const fetchEmployees = useCallback(async () => {
        try {
            const res = await fetch("/api/employees?status=ACTIVE&limit=500")
            if (res.ok) {
                const data = await res.json()
                setEmployees(Array.isArray(data) ? data : (data.employees ?? []))
            }
        } catch {
            // ignore
        }
    }, [])

    const fetchSites = useCallback(async () => {
        try {
            const res = await fetch("/api/sites?isActive=true")
            if (res.ok) {
                const data = await res.json()
                setSites(Array.isArray(data) ? data : [])
            }
        } catch {
            // ignore
        }
    }, [])

    const fetchStats = useCallback(async () => {
        try {
            const today = todayISO()
            const [dueTodayRes, completedRes, overdueRes, checkinsRes] = await Promise.all([
                fetch(`/api/field/tasks?date=${today}`),
                fetch(`/api/field/tasks?date=${today}&status=COMPLETED`),
                fetch(`/api/field/tasks?status=MISSED`),
                fetch(`/api/field/checkins/latest`),
            ])

            const dueToday = dueTodayRes.ok ? await dueTodayRes.json() : []
            const completed = completedRes.ok ? await completedRes.json() : []
            const overdue = overdueRes.ok ? await overdueRes.json() : []
            const checkInData: LatestCheckIn[] = checkinsRes.ok ? await checkinsRes.json() : []

            const activeField = checkInData.filter((c) => c.checkedInToday).length

            setStats({
                dueTodayCount: Array.isArray(dueToday) ? dueToday.length : 0,
                completedToday: Array.isArray(completed) ? completed.length : 0,
                overdue: Array.isArray(overdue) ? overdue.length : 0,
                activeField,
            })
        } catch {
            // ignore
        }
    }, [])

    const fetchTasks = useCallback(async () => {
        setTasksLoading(true)
        try {
            const params = new URLSearchParams()
            if (statusFilter !== "ALL") params.set("status", statusFilter)
            if (priorityFilter !== "ALL") params.set("priority", priorityFilter)
            if (dateFilter) params.set("date", dateFilter)
            if (searchFilter) params.set("search", searchFilter)

            const res = await fetch(`/api/field/tasks?${params}`)
            if (res.ok) {
                const data = await res.json()
                setTasks(Array.isArray(data) ? data : [])
            }
        } finally {
            setTasksLoading(false)
        }
    }, [statusFilter, priorityFilter, dateFilter, searchFilter])

    const fetchLatestCheckIns = useCallback(async () => {
        setCheckInsLoading(true)
        try {
            const res = await fetch("/api/field/checkins/latest")
            if (res.ok) {
                const data = await res.json()
                setLatestCheckIns(Array.isArray(data) ? data : [])
            }
        } finally {
            setCheckInsLoading(false)
        }
    }, [])

    const fetchHistoryCheckIns = useCallback(async () => {
        setHistoryLoading(true)
        try {
            const res = await fetch(`/api/field/checkins?date=${historyDate}`)
            if (res.ok) {
                const data = await res.json()
                setHistoryCheckIns(Array.isArray(data) ? data : [])
            }
        } finally {
            setHistoryLoading(false)
        }
    }, [historyDate])

    async function handleStatusChange(taskId: string, newStatus: FieldTaskStatus) {
        await fetch(`/api/field/tasks/${taskId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: newStatus }),
        })
        fetchTasks()
        fetchStats()
    }

    async function handleDeleteTask(taskId: string) {
        if (!confirm("Delete this task? This cannot be undone.")) return
        await fetch(`/api/field/tasks/${taskId}`, { method: "DELETE" })
        fetchTasks()
        fetchStats()
    }

    const fieldPerms: string[] = (session?.user as any)?.permissions || []
    const isAdminOrManager = session?.user?.role === "ADMIN" || session?.user?.role === "MANAGER"
        || fieldPerms.includes("field.view")

    return (
        <div className="flex-1 flex flex-col min-h-0">
            {/* Header */}
            <div className="px-6 pt-6 pb-0 shrink-0">
                <div className="flex items-center justify-between mb-5">
                    <div className="flex items-center gap-2.5">
                        <div className="h-9 w-9 rounded-[10px] bg-[var(--accent-light)] flex items-center justify-center">
                            <Navigation size={18} className="text-[var(--accent)]" />
                        </div>
                        <div>
                            <h1 className="text-[18px] font-bold text-[var(--text)] leading-tight">Field Workforce</h1>
                            <p className="text-[12px] text-[var(--text3)]">Track field tasks and employee locations</p>
                        </div>
                    </div>
                    {isAdminOrManager && activeTab === "tasks" && (
                        <button
                            onClick={() => setShowAssignModal(true)}
                            className="h-9 px-4 rounded-[8px] bg-[var(--accent)] text-white text-[13px] font-medium flex items-center gap-2 hover:opacity-90"
                        >
                            <Plus size={15} />
                            Assign Task
                        </button>
                    )}
                </div>

                {/* Stats */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
                    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[12px] p-4">
                        <div className="flex items-center gap-2 mb-2">
                            <Clock size={15} className="text-amber-500" />
                            <span className="text-[11px] font-medium text-[var(--text3)] uppercase tracking-wide">Due Today</span>
                        </div>
                        <p className="text-[24px] font-bold text-amber-600">{stats.dueTodayCount}</p>
                    </div>
                    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[12px] p-4">
                        <div className="flex items-center gap-2 mb-2">
                            <CheckCircle2 size={15} className="text-[var(--accent)]" />
                            <span className="text-[11px] font-medium text-[var(--text3)] uppercase tracking-wide">Completed Today</span>
                        </div>
                        <p className="text-[24px] font-bold text-[var(--accent)]">{stats.completedToday}</p>
                    </div>
                    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[12px] p-4">
                        <div className="flex items-center gap-2 mb-2">
                            <AlertTriangle size={15} className="text-red-500" />
                            <span className="text-[11px] font-medium text-[var(--text3)] uppercase tracking-wide">Missed</span>
                        </div>
                        <p className="text-[24px] font-bold text-red-600">{stats.overdue}</p>
                    </div>
                    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[12px] p-4">
                        <div className="flex items-center gap-2 mb-2">
                            <Users size={15} className="text-blue-500" />
                            <span className="text-[11px] font-medium text-[var(--text3)] uppercase tracking-wide">Active Today</span>
                        </div>
                        <p className="text-[24px] font-bold text-blue-600">{stats.activeField}</p>
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex gap-1 border-b border-[var(--border)]">
                    {(["tasks", "activity"] as const).map((tab) => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={`px-4 py-2.5 text-[13px] font-medium capitalize border-b-2 transition-colors ${
                                activeTab === tab
                                    ? "border-[var(--accent)] text-[var(--accent)]"
                                    : "border-transparent text-[var(--text2)] hover:text-[var(--text)]"
                            }`}
                        >
                            {tab === "tasks" ? "Tasks" : "Field Activity"}
                        </button>
                    ))}
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-6 py-5">
                {activeTab === "tasks" && (
                    <div className="space-y-4">
                        {/* Filters */}
                        <div className="flex flex-wrap gap-3 items-center">
                            {/* Status pills */}
                            <div className="flex gap-1 flex-wrap">
                                {["ALL", "ASSIGNED", "IN_PROGRESS", "COMPLETED", "MISSED", "CANCELLED"].map((s) => (
                                    <button
                                        key={s}
                                        onClick={() => setStatusFilter(s)}
                                        className={`h-7 px-3 rounded-full text-[12px] font-medium transition-colors ${
                                            statusFilter === s
                                                ? "bg-[var(--accent)] text-white"
                                                : "bg-[var(--surface2)] text-[var(--text2)] hover:text-[var(--text)]"
                                        }`}
                                    >
                                        {s === "ALL" ? "All" : s.replace("_", " ")}
                                    </button>
                                ))}
                            </div>

                            <div className="flex gap-2 ml-auto flex-wrap">
                                {/* Priority */}
                                <div className="relative">
                                    <select
                                        value={priorityFilter}
                                        onChange={(e) => setPriorityFilter(e.target.value)}
                                        className="h-8 pl-3 pr-7 rounded-[8px] border border-[var(--border)] bg-[var(--surface)] text-[12px] text-[var(--text2)] focus:outline-none appearance-none"
                                    >
                                        <option value="ALL">All Priority</option>
                                        <option value="LOW">Low</option>
                                        <option value="MEDIUM">Medium</option>
                                        <option value="HIGH">High</option>
                                        <option value="URGENT">Urgent</option>
                                    </select>
                                    <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text3)] pointer-events-none" />
                                </div>

                                {/* Date */}
                                <input
                                    type="date"
                                    value={dateFilter}
                                    onChange={(e) => setDateFilter(e.target.value)}
                                    className="h-8 px-3 rounded-[8px] border border-[var(--border)] bg-[var(--surface)] text-[12px] text-[var(--text2)] focus:outline-none"
                                />

                                {/* Search */}
                                <input
                                    type="text"
                                    value={searchFilter}
                                    onChange={(e) => setSearchFilter(e.target.value)}
                                    placeholder="Search tasks..."
                                    className="h-8 px-3 rounded-[8px] border border-[var(--border)] bg-[var(--surface)] text-[12px] text-[var(--text)] focus:outline-none w-40"
                                />
                            </div>
                        </div>

                        {/* Task Table */}
                        {tasksLoading ? (
                            <div className="text-center py-16 text-[var(--text3)] text-[14px]">Loading tasks...</div>
                        ) : tasks.length === 0 ? (
                            <div className="text-center py-16">
                                <Navigation size={32} className="mx-auto text-[var(--text3)] mb-3 opacity-40" />
                                <p className="text-[14px] text-[var(--text3)]">No tasks found</p>
                                {isAdminOrManager && (
                                    <button
                                        onClick={() => setShowAssignModal(true)}
                                        className="mt-4 h-9 px-4 rounded-[8px] bg-[var(--accent)] text-white text-[13px] font-medium"
                                    >
                                        Assign Task
                                    </button>
                                )}
                            </div>
                        ) : (
                            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[12px] overflow-hidden">
                                <table className="w-full">
                                    <thead>
                                        <tr className="border-b border-[var(--border)] bg-[var(--surface2)]">
                                            <th className="text-left px-4 py-3 text-[11px] font-semibold text-[var(--text3)] uppercase tracking-wide">Task</th>
                                            <th className="text-left px-4 py-3 text-[11px] font-semibold text-[var(--text3)] uppercase tracking-wide">Employee</th>
                                            <th className="text-left px-4 py-3 text-[11px] font-semibold text-[var(--text3)] uppercase tracking-wide hidden md:table-cell">Site</th>
                                            <th className="text-left px-4 py-3 text-[11px] font-semibold text-[var(--text3)] uppercase tracking-wide hidden lg:table-cell">Priority</th>
                                            <th className="text-left px-4 py-3 text-[11px] font-semibold text-[var(--text3)] uppercase tracking-wide">Due</th>
                                            <th className="text-left px-4 py-3 text-[11px] font-semibold text-[var(--text3)] uppercase tracking-wide">Status</th>
                                            <th className="px-4 py-3 w-10"></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {tasks.map((task) => (
                                            <tr
                                                key={task.id}
                                                className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--surface2)] transition-colors"
                                            >
                                                <td className="px-4 py-3">
                                                    <div>
                                                        <span className="font-mono text-[12px] text-[var(--accent)] font-semibold">{task.taskNo}</span>
                                                        <p className="text-[13px] font-medium text-[var(--text)] mt-0.5 line-clamp-1">{task.title}</p>
                                                        {task.description && (
                                                            <p className="text-[12px] text-[var(--text3)] line-clamp-1 mt-0.5">{task.description}</p>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center gap-2">
                                                        <Avatar
                                                            photo={task.employee.photo}
                                                            firstName={task.employee.firstName}
                                                            lastName={task.employee.lastName}
                                                            size={28}
                                                        />
                                                        <div>
                                                            <p className="text-[13px] text-[var(--text)] font-medium leading-tight">
                                                                {task.employee.firstName} {task.employee.lastName}
                                                            </p>
                                                            <p className="text-[11px] text-[var(--text3)]">{task.employee.employeeId}</p>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3 hidden md:table-cell">
                                                    {task.siteName ? (
                                                        <span className="text-[13px] text-[var(--text2)]">{task.siteName}</span>
                                                    ) : (
                                                        <span className="text-[12px] text-[var(--text3)]">—</span>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3 hidden lg:table-cell">
                                                    <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${PRIORITY_STYLES[task.priority]}`}>
                                                        {task.priority}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <p className="text-[13px] text-[var(--text)]">{formatDate(task.dueDate)}</p>
                                                    {task.dueTime && (
                                                        <p className="text-[11px] text-[var(--text3)]">{task.dueTime}</p>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${STATUS_STYLES[task.status]}`}>
                                                        {task.status.replace("_", " ")}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <TaskMenu
                                                        task={task}
                                                        onView={() => setSelectedTask(task)}
                                                        onStatusChange={(s) => handleStatusChange(task.id, s)}
                                                        onDelete={() => handleDeleteTask(task.id)}
                                                    />
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}

                {activeTab === "activity" && (
                    <div className="space-y-6">
                        {/* Last Known Locations */}
                        <div>
                            <div className="flex items-center justify-between mb-3">
                                <h2 className="text-[15px] font-semibold text-[var(--text)]">Last Known Locations</h2>
                                <button
                                    onClick={fetchLatestCheckIns}
                                    disabled={checkInsLoading}
                                    className="h-8 px-3 rounded-[8px] border border-[var(--border)] text-[12px] text-[var(--text2)] flex items-center gap-1.5 hover:bg-[var(--surface2)] disabled:opacity-50"
                                >
                                    <RefreshCw size={13} className={checkInsLoading ? "animate-spin" : ""} />
                                    Refresh
                                </button>
                            </div>

                            {checkInsLoading ? (
                                <div className="text-center py-10 text-[var(--text3)] text-[14px]">Loading...</div>
                            ) : latestCheckIns.length === 0 ? (
                                <div className="text-center py-10 text-[var(--text3)] text-[14px]">No employees found</div>
                            ) : (
                                <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[12px] overflow-hidden">
                                    <table className="w-full">
                                        <thead>
                                            <tr className="border-b border-[var(--border)] bg-[var(--surface2)]">
                                                <th className="text-left px-4 py-3 text-[11px] font-semibold text-[var(--text3)] uppercase tracking-wide">Employee</th>
                                                <th className="text-left px-4 py-3 text-[11px] font-semibold text-[var(--text3)] uppercase tracking-wide hidden md:table-cell">Site</th>
                                                <th className="text-left px-4 py-3 text-[11px] font-semibold text-[var(--text3)] uppercase tracking-wide">Last Check-In</th>
                                                <th className="text-left px-4 py-3 text-[11px] font-semibold text-[var(--text3)] uppercase tracking-wide hidden lg:table-cell">Coordinates</th>
                                                <th className="text-left px-4 py-3 text-[11px] font-semibold text-[var(--text3)] uppercase tracking-wide">Geofence</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {latestCheckIns.map(({ employee, lastCheckIn, checkedInToday }) => (
                                                <tr
                                                    key={employee.id}
                                                    className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--surface2)] transition-colors"
                                                >
                                                    <td className="px-4 py-3">
                                                        <div className="flex items-center gap-2">
                                                            <Avatar
                                                                photo={employee.photo}
                                                                firstName={employee.firstName}
                                                                lastName={employee.lastName}
                                                                size={30}
                                                            />
                                                            <div>
                                                                <p className="text-[13px] font-medium text-[var(--text)]">
                                                                    {employee.firstName} {employee.lastName}
                                                                </p>
                                                                <p className="text-[11px] text-[var(--text3)]">{employee.employeeId}</p>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-3 hidden md:table-cell">
                                                        <span className="text-[13px] text-[var(--text2)]">
                                                            {lastCheckIn?.siteName || "—"}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        {lastCheckIn ? (
                                                            <div>
                                                                <p className="text-[13px] text-[var(--text)]">
                                                                    {formatDistanceToNow(new Date(lastCheckIn.checkedInAt), { addSuffix: true })}
                                                                </p>
                                                                <p className="text-[11px] text-[var(--text3)]">
                                                                    {formatDate(lastCheckIn.checkedInAt)} {formatTime(lastCheckIn.checkedInAt)}
                                                                </p>
                                                                {!checkedInToday && (
                                                                    <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-medium mt-1 inline-block">
                                                                        Not today
                                                                    </span>
                                                                )}
                                                            </div>
                                                        ) : (
                                                            <span className="text-[12px] text-[var(--text3)]">No check-in</span>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-3 hidden lg:table-cell">
                                                        {lastCheckIn ? (
                                                            <div className="font-mono text-[12px] text-[var(--text2)]">
                                                                <p>Lat: {lastCheckIn.latitude.toFixed(4)}</p>
                                                                <p>Lng: {lastCheckIn.longitude.toFixed(4)}</p>
                                                            </div>
                                                        ) : (
                                                            <span className="text-[12px] text-[var(--text3)]">—</span>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        {lastCheckIn ? (
                                                            <div className="space-y-1">
                                                                {lastCheckIn.isGeofenced ? (
                                                                    <span className="inline-flex items-center gap-1 text-[11px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                                                                        <Check size={10} /> In Zone
                                                                    </span>
                                                                ) : (
                                                                    <span className="inline-flex items-center gap-1 text-[11px] bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">
                                                                        <X size={10} /> Out of Zone
                                                                    </span>
                                                                )}
                                                                {lastCheckIn.distanceFromSite !== null && (
                                                                    <p className="text-[11px] text-[var(--text3)]">
                                                                        {Math.round(lastCheckIn.distanceFromSite)}m from site
                                                                    </p>
                                                                )}
                                                            </div>
                                                        ) : (
                                                            <span className="text-[11px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">No check-in today</span>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>

                        {/* Check-In History */}
                        <div>
                            <div className="flex items-center justify-between mb-3">
                                <h2 className="text-[15px] font-semibold text-[var(--text)]">Check-In History</h2>
                                <input
                                    type="date"
                                    value={historyDate}
                                    onChange={(e) => setHistoryDate(e.target.value)}
                                    className="h-8 px-3 rounded-[8px] border border-[var(--border)] bg-[var(--surface)] text-[12px] text-[var(--text2)] focus:outline-none"
                                />
                            </div>

                            {historyLoading ? (
                                <div className="text-center py-8 text-[var(--text3)] text-[14px]">Loading...</div>
                            ) : historyCheckIns.length === 0 ? (
                                <div className="text-center py-8 text-[var(--text3)] text-[14px]">No check-ins for this date</div>
                            ) : (
                                <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[12px] overflow-hidden">
                                    <table className="w-full">
                                        <thead>
                                            <tr className="border-b border-[var(--border)] bg-[var(--surface2)]">
                                                <th className="text-left px-4 py-3 text-[11px] font-semibold text-[var(--text3)] uppercase tracking-wide">Employee</th>
                                                <th className="text-left px-4 py-3 text-[11px] font-semibold text-[var(--text3)] uppercase tracking-wide">Time</th>
                                                <th className="text-left px-4 py-3 text-[11px] font-semibold text-[var(--text3)] uppercase tracking-wide hidden md:table-cell">Site</th>
                                                <th className="text-left px-4 py-3 text-[11px] font-semibold text-[var(--text3)] uppercase tracking-wide hidden lg:table-cell">Coordinates</th>
                                                <th className="text-left px-4 py-3 text-[11px] font-semibold text-[var(--text3)] uppercase tracking-wide">Geofenced</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {historyCheckIns.map((ci) => (
                                                <tr
                                                    key={ci.id}
                                                    className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--surface2)] transition-colors"
                                                >
                                                    <td className="px-4 py-3">
                                                        <div className="flex items-center gap-2">
                                                            <Avatar
                                                                photo={ci.employee.photo}
                                                                firstName={ci.employee.firstName}
                                                                lastName={ci.employee.lastName}
                                                                size={28}
                                                            />
                                                            <div>
                                                                <p className="text-[13px] font-medium text-[var(--text)]">
                                                                    {ci.employee.firstName} {ci.employee.lastName}
                                                                </p>
                                                                <p className="text-[11px] text-[var(--text3)]">{ci.employee.employeeId}</p>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <p className="text-[13px] text-[var(--text)]">{formatTime(ci.checkedInAt)}</p>
                                                        <p className="text-[11px] text-[var(--text3)]">{formatDate(ci.checkedInAt)}</p>
                                                    </td>
                                                    <td className="px-4 py-3 hidden md:table-cell">
                                                        <span className="text-[13px] text-[var(--text2)]">{ci.siteName || "—"}</span>
                                                    </td>
                                                    <td className="px-4 py-3 hidden lg:table-cell">
                                                        <div className="font-mono text-[12px] text-[var(--text2)]">
                                                            <p>Lat: {ci.latitude.toFixed(4)}</p>
                                                            <p>Lng: {ci.longitude.toFixed(4)}</p>
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        {ci.isGeofenced ? (
                                                            <span className="inline-flex items-center gap-1 text-[11px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                                                                <Check size={10} /> In Zone
                                                            </span>
                                                        ) : (
                                                            <span className="inline-flex items-center gap-1 text-[11px] bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">
                                                                <X size={10} /> Out of Zone
                                                            </span>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Modals */}
            {showAssignModal && (
                <AssignTaskModal
                    employees={employees}
                    sites={sites}
                    onClose={() => setShowAssignModal(false)}
                    onCreated={() => { fetchTasks(); fetchStats() }}
                />
            )}

            {selectedTask && (
                <TaskDrawer
                    task={selectedTask}
                    onClose={() => setSelectedTask(null)}
                    onUpdated={() => { fetchTasks(); fetchStats() }}
                />
            )}
        </div>
    )
}
