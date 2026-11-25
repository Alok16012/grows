"use client"

// Desktop home, top section (soft theme, laid out like the client reference):
//   col 1 — today's timer card, quick-action tiles, my tasks
//   col 2 — events & announcements: calendar, then Events / New joiners / News feed
//   col 3 — my attendance ring, my leaves ring, my performance
// The photo, name and Check-in / Check-out sit at the top of the sidebar
// (components/SidebarProfile). The last card of each column grows to the row
// height, so the columns end level with no blank space. People without an
// employee record (e.g. Admin) get tiles + tasks and events.
import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import {
    BookOpen, CalendarDays, ChevronDown, ChevronLeft, ChevronRight, Clock, FileText, GraduationCap, IndianRupee,
    LifeBuoy, ListChecks, Loader2, Plus, Receipt, Umbrella,
} from "lucide-react"
import { useMeHome, type MeHome } from "@/lib/useMeHome"
import { TodoWidget } from "@/components/todo/TodoWidget"

type Task = { id: string; taskNo: string; title: string; status: string; dueAt: string | null }

const card = "bg-white rounded-[22px] shadow-[var(--shadow-card)] p-5"
const IST = 330 * 60_000
const istDay = (d: Date | string) => new Date(new Date(d).getTime() + IST).toISOString().slice(0, 10)
const hm = (s: string | null | undefined) => s ? new Date(s).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "—"

export function MyDay() {
    const { data: d } = useMeHome()
    if (!d) return null
    if (!d.employee) return (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] items-stretch">
            <div className="min-w-0 flex flex-col gap-4"><QuickTiles /><TodoWidget /><MyTasks grow /></div>
            <div className="min-w-0 flex flex-col"><EventsCard d={d} grow /></div>
        </div>
    )
    return (
        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)_minmax(0,0.85fr)] items-stretch">
            <div className="min-w-0 flex flex-col gap-4">
                <TimerCard today={d.today} />
                <QuickTiles />
                <TodoWidget />
                <MyTasks grow />
            </div>
            <div className="min-w-0 flex flex-col"><EventsCard d={d} grow /></div>
            <div className="min-w-0 flex flex-col gap-4 lg:col-span-2 xl:col-span-1 lg:grid lg:grid-cols-3 xl:flex">
                <AttendanceRing m={d.month} />
                <LeaveRing leave={d.leave} />
                <PerformanceCard d={d} grow />
            </div>
        </div>
    )
}

// ── Today's timer (blue card) ────────────────────────────────────────────────
function TimerCard({ today }: { today: MeHome["today"] }) {
    const [now, setNow] = useState(() => new Date())
    useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t) }, [])
    const inAt = today?.checkIn ? new Date(today.checkIn) : null
    const outAt = today?.checkOut ? new Date(today.checkOut) : null
    const workedMs = inAt ? ((outAt ?? now).getTime() - inAt.getTime()) : 0
    const worked = `${Math.floor(workedMs / 3_600_000)}h ${Math.floor((workedMs % 3_600_000) / 60_000)}m`
    const pct = Math.min(100, Math.round(workedMs / (8 * 3_600_000) * 100))
    const [hh, mm, ss] = now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).split(":")
    return (
        <div className="relative overflow-hidden rounded-[22px] p-5 text-white" style={{ background: "#3d6ff5", boxShadow: "0 12px 28px rgba(61,111,245,0.28)" }}>
            <Clock aria-hidden className="absolute -right-6 -top-6 h-36 w-36 text-white/10" strokeWidth={1.5} />
            <p className="text-[34px] font-bold leading-none tabular-nums tracking-tight">{hh}:{mm}<span className="text-white/50">:{ss}</span></p>
            <p className="mt-2 text-[13px] text-white/90">
                {!inAt ? "Not checked in yet — use Check-in under your photo" : outAt ? `Day complete · ${worked} worked` : `Checked in at ${hm(today?.checkIn)} · ${worked} so far`}
            </p>
            <div className="mt-4 h-2 rounded-full bg-[#1f46c8]/60 overflow-hidden" title={inAt ? `${worked} of an 8h day` : undefined}>
                <div className="h-full rounded-full bg-white/90" style={{ width: `${pct}%` }} />
            </div>
        </div>
    )
}

// ── Quick actions ────────────────────────────────────────────────────────────
const TILES = [
    { href: "/leaves", label: "Leave", icon: Umbrella },
    { href: "/attendance", label: "Attendance", icon: CalendarDays },
    { href: "/profile?tab=payslip", label: "Payslips", icon: IndianRupee },
    { href: "/expenses", label: "Expenses", icon: Receipt },
    { href: "/tasks", label: "Tasks", icon: ListChecks },
    { href: "/helpdesk", label: "Support", icon: LifeBuoy },
    { href: "/profile?tab=letters", label: "Letters", icon: FileText },
    { href: "/lms/learn", label: "Learning", icon: GraduationCap },
]
function QuickTiles() {
    return (
        <div className="grid grid-cols-4 gap-3">
            {TILES.map((t, i) => (
                <Link key={t.href} href={t.href}
                    className={`rounded-[18px] py-4 px-2 flex flex-col items-center justify-center gap-2 text-[13px] font-medium transition-transform hover:-translate-y-0.5 ${i === 0 ? "text-white" : "bg-white text-[var(--text)] shadow-[var(--shadow-card)]"}`}
                    style={i === 0 ? { background: "var(--violet)", boxShadow: "0 10px 22px rgba(139,108,246,0.30)" } : undefined}>
                    <t.icon size={24} strokeWidth={1.6} className={i === 0 ? "text-white" : "text-[var(--accent)]"} />
                    {t.label}
                </Link>
            ))}
        </div>
    )
}

// ── My tasks ─────────────────────────────────────────────────────────────────
function MyTasks({ grow }: { grow?: boolean }) {
    const [f, setF] = useState<"all" | "open" | "done">("open")
    const [rows, setRows] = useState<Task[] | null>(null)
    const load = useCallback(() => {
        setRows(null)
        fetch(`/api/tasks?view=mine&status=${f}`).then(r => r.ok ? r.json() : { tasks: [] }).then(j => setRows((j.tasks ?? []).slice(0, 6))).catch(() => setRows([]))
    }, [f])
    useEffect(() => { load() }, [load])
    async function complete(t: Task) {
        const r = await fetch(`/api/tasks/${t.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "complete" }) })
        const j = await r.json().catch(() => ({}))
        if (!r.ok) { toast.error(j?.error || "Couldn't update the task"); return }
        toast.success(`${t.taskNo} marked done`); load()
    }
    const chip = (k: typeof f, l: string) => (
        <button onClick={() => setF(k)} className={`h-7 px-3 rounded-full text-[12px] font-medium border ${f === k ? "bg-[var(--accent-light)] text-[var(--accent)] border-transparent" : "border-[var(--border2)] text-[var(--text2)]"}`}>{l}</button>
    )
    return (
        <div className={`${card} flex flex-col ${grow ? "flex-1" : ""}`}>
            <div className="flex items-center justify-between gap-2 mb-3">
                <p className="text-[16px] font-semibold text-[var(--text)]">My tasks</p>
                <div className="flex gap-1.5">{chip("all", "All")}{chip("open", "Pending")}{chip("done", "Done")}</div>
            </div>
            {!rows ? <div className="py-6 flex justify-center"><Loader2 size={18} className="animate-spin text-[var(--text3)]" /></div>
                : !rows.length ? <p className="text-[13px] text-[var(--text3)] py-4">{f === "done" ? "No finished tasks yet." : "Nothing pending — you're all caught up."}</p>
                    : (
                        <ul className="divide-y divide-[var(--border)]">
                            {rows.map(t => {
                                const done = t.status === "DONE"
                                const overdue = !done && t.dueAt && new Date(t.dueAt) < new Date()
                                return (
                                    <li key={t.id} className="py-2.5 flex items-center gap-3">
                                        <input type="checkbox" aria-label={`Mark ${t.title} done`} checked={done} disabled={done || t.status === "AWAITING_APPROVAL"} onChange={() => complete(t)} className="h-4 w-4 accent-[var(--accent)]" />
                                        <Link href="/tasks" className={`flex-1 min-w-0 truncate text-[14px] ${done ? "line-through text-[var(--text3)]" : "text-[var(--text)] hover:text-[var(--accent)]"}`}>{t.title}</Link>
                                        {t.status === "AWAITING_APPROVAL" ? <span className="text-[11px] text-[var(--amber)] shrink-0">Awaiting approval</span>
                                            : t.dueAt && <span className={`text-[11px] shrink-0 ${overdue ? "text-[var(--red)] font-semibold" : "text-[var(--text3)]"}`}>{new Date(t.dueAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}</span>}
                                    </li>
                                )
                            })}
                        </ul>
                    )}
            <Link href="/tasks" className="mt-auto pt-3 inline-flex items-center gap-1 text-[12.5px] text-[var(--text3)] hover:text-[var(--accent)]"><Plus size={14} /> New task</Link>
        </div>
    )
}

// ── Events & announcements ───────────────────────────────────────────────────
function EventsCard({ d, grow }: { d: MeHome; grow?: boolean }) {
    const [offset, setOffset] = useState(0)
    const [open, setOpen] = useState<"events" | "joiners" | "news">("news")
    const todayStr = istDay(new Date())
    const base = new Date(todayStr + "T00:00:00Z")
    const view = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + offset, 1))
    const y = view.getUTCFullYear(), m = view.getUTCMonth()
    const days = new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
    const lead = new Date(Date.UTC(y, m, 1)).getUTCDay()
    const holidays = useMemo(() => new Map((d.monthHolidays ?? []).map(h => [istDay(h.date), h.name])), [d.monthHolidays])
    const cells: (number | null)[] = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)]
    const key = (n: number) => `${y}-${String(m + 1).padStart(2, "0")}-${String(n).padStart(2, "0")}`
    const upcoming = (d.monthHolidays ?? []).filter(h => istDay(h.date) >= todayStr)
    const joiners = d.newJoiners ?? []
    const section = (k: typeof open, label: string, tint: string, count: number, body: React.ReactNode) => (
        <div className="rounded-[14px] overflow-hidden border border-[var(--border)]" style={{ background: open === k ? "#fff" : tint }}>
            <button onClick={() => setOpen(k)} className="w-full flex items-center justify-between px-4 py-2.5 text-[12.5px] font-semibold tracking-wide text-[var(--text2)]">
                <span>{label}{count ? <span className="ml-1.5 text-[var(--text3)] font-normal">{count}</span> : null}</span>
                <ChevronDown size={15} className={`transition-transform ${open === k ? "rotate-180" : ""}`} />
            </button>
            {open === k && <div className="px-4 pb-3">{body}</div>}
        </div>
    )
    const empty = (t: string) => <p className="text-[12.5px] text-[var(--text3)] py-1">{t}</p>
    return (
        <div className={`${card} min-w-0 flex flex-col ${grow ? "flex-1" : ""}`}>
            <p className="text-[16px] font-semibold text-[var(--text)] mb-3">Events &amp; announcements</p>
            <div className="flex items-center justify-center gap-3 mb-2 text-[14px] font-medium text-[var(--text)]">
                <button onClick={() => setOffset(o => o - 1)} aria-label="Previous month" className="p-1 text-[var(--text3)] hover:text-[var(--text)]"><ChevronLeft size={16} /></button>
                <span className="w-36 text-center">{view.toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" })}</span>
                <button onClick={() => setOffset(o => o + 1)} aria-label="Next month" className="p-1 text-[var(--text3)] hover:text-[var(--text)]"><ChevronRight size={16} /></button>
            </div>
            <div className="grid grid-cols-7 text-center text-[12px] text-[var(--text3)] mb-1">{["sun", "mon", "tue", "wed", "thu", "fri", "sat"].map(w => <span key={w}>{w}</span>)}</div>
            <div className="grid grid-cols-7 gap-y-1.5 text-center text-[14px]">
                {cells.map((n, i) => {
                    if (!n) return <span key={i} />
                    const k = key(n), isToday = k === todayStr, hol = offset === 0 ? holidays.get(k) : undefined
                    const weekend = (i % 7 === 0) || (i % 7 === 6)
                    return (
                        <span key={i} title={hol} className={`mx-auto h-9 w-9 flex items-center justify-center rounded-full ${isToday ? "bg-[var(--accent)] text-white font-semibold" : hol ? "ring-1 ring-[var(--violet)] text-[var(--violet)] font-medium" : weekend ? "text-[var(--text3)]" : "text-[var(--text)]"}`}>{n}</span>
                    )
                })}
            </div>
            {upcoming.length > 0 && (
                <div className="mt-3 space-y-1.5">
                    {upcoming.slice(0, 3).map(h => (
                        <div key={h.date + h.name} className="flex items-center gap-2.5 rounded-[12px] px-2.5 py-2 bg-[var(--violet-light)]">
                            <span className="h-6 w-6 rounded-full bg-white text-[11px] font-semibold flex items-center justify-center text-[var(--violet)] shrink-0">{new Date(new Date(h.date).getTime() + IST).getUTCDate()}</span>
                            <span className="text-[13px] text-[var(--text)] truncate">{h.name}</span>
                        </div>
                    ))}
                </div>
            )}
            <div className="mt-auto pt-4 space-y-2">
                {section("events", "EVENTS", "#eef9f1", d.celebrations.length, d.celebrations.length ? d.celebrations.slice(0, 6).map((c, i) => (
                    <p key={i} className="py-1 text-[13px] text-[var(--text)] truncate">{c.kind === "birthday" ? "🎂" : "🎉"} {c.name} — {c.kind === "birthday" ? "birthday today" : `${c.years} year${c.years === 1 ? "" : "s"} with us`}</p>
                )) : empty("No birthdays or work anniversaries today."))}
                {d.newJoiners !== null && section("joiners", "NEW JOINERS", "#ecf7fb", joiners.length, joiners.length ? joiners.map((j, i) => (
                    <p key={i} className="py-1 text-[13px] text-[var(--text)] truncate">{j.name}<span className="text-[var(--text3)]"> · {[j.designation, j.site].filter(Boolean).join(" · ")}</span></p>
                )) : empty("Nobody joined in the last 30 days."))}
                {section("news", "NEWS FEED", "#f6f7fc", d.announcements.length, d.announcements.length ? d.announcements.map(a => (
                    <Link key={a.id} href="/announcements" className="flex items-center gap-2 py-1.5 text-[13px] text-[var(--text2)] hover:text-[var(--accent)] border-b border-[var(--border)] last:border-0">
                        <BookOpen size={13} className="shrink-0 text-[var(--text3)]" /><span className="truncate">{a.title}</span>
                    </Link>
                )) : empty("No announcements yet."))}
            </div>
        </div>
    )
}

// ── Rings and performance ────────────────────────────────────────────────────
function Ring({ parts, center, sub }: { parts: { value: number; color: string }[]; center: string; sub?: string }) {
    const total = parts.reduce((s, p) => s + p.value, 0)
    const R = 52, C = 2 * Math.PI * R
    let acc = 0
    return (
        <div className="relative h-[150px] w-[150px] mx-auto">
            <svg viewBox="0 0 128 128" className="h-full w-full -rotate-90">
                <circle cx="64" cy="64" r={R} fill="none" stroke="#eceef6" strokeWidth="11" />
                {total > 0 && parts.filter(p => p.value > 0).map((p, i) => {
                    const len = (p.value / total) * C
                    const el = <circle key={i} cx="64" cy="64" r={R} fill="none" stroke={p.color} strokeWidth="11" strokeLinecap="round" strokeDasharray={`${Math.max(0, len - 3)} ${C}`} strokeDashoffset={-acc} />
                    acc += len
                    return el
                })}
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className="text-[26px] font-bold text-[var(--text)] leading-none">{center}</span>
                {sub && <span className="text-[11.5px] text-[var(--text3)] mt-1">{sub}</span>}
            </div>
        </div>
    )
}
const Legend = ({ items }: { items: { label: string; color: string; value?: number }[] }) => (
    <div className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1">
        {items.map(i => <span key={i.label} className="inline-flex items-center gap-1.5 text-[12.5px] text-[var(--text2)]"><span className="h-2.5 w-2.5 rounded-full" style={{ background: i.color }} />{i.label}{i.value !== undefined ? ` ${i.value}` : ""}</span>)}
    </div>
)
function AttendanceRing({ m }: { m: MeHome["month"] }) {
    // Out of every working day so far — days nobody marked count against the %,
    // so 4 marked days of 20 no longer shows 100%.
    const unmarked = m.unmarked ?? 0
    const total = m.present + m.absent + m.leave + unmarked
    const pct = total ? Math.round((m.present / total) * 100) : 0
    return (
        <div className={card}>
            <p className="text-[16px] font-semibold text-[var(--text)] mb-3">My attendance <span className="text-[12px] font-normal text-[var(--text3)]">this month</span></p>
            <Ring center={total ? `${pct}%` : "—"} sub={total ? `present · ${total} working day${total === 1 ? "" : "s"}` : "no days yet"} parts={[{ value: m.present, color: "#22c55e" }, { value: m.leave, color: "#8b6cf6" }, { value: m.absent, color: "#f43f5e" }, { value: unmarked, color: "#d5dae8" }]} />
            <Legend items={[{ label: "Present", color: "#22c55e", value: m.present }, { label: "Leave", color: "#8b6cf6", value: m.leave }, { label: "Absent", color: "#f43f5e", value: m.absent }, ...(unmarked ? [{ label: "Not marked", color: "#c3c9d9", value: unmarked }] : [])]} />
        </div>
    )
}
const LEAVE_COLORS = ["#f5b52e", "#8b6cf6", "#3d6ff5", "#22c55e", "#f43f5e", "#14b8a6"]
function LeaveRing({ leave }: { leave: MeHome["leave"] }) {
    const items = (leave?.items ?? []).filter(i => i.available > 0)
    return (
        <div className={card}>
            <div className="flex items-center justify-between mb-3">
                <p className="text-[16px] font-semibold text-[var(--text)]">My leaves</p>
                <Link href="/leaves" className="text-[12.5px] text-[var(--accent)] font-medium">Apply</Link>
            </div>
            {!leave ? <p className="text-[13px] text-[var(--text3)] py-6 text-center">No leave balance set up.</p> : (
                <>
                    <Ring center={`${Math.round(leave.total * 10) / 10}`} sub="days left" parts={items.map((i, k) => ({ value: i.available, color: i.color || LEAVE_COLORS[k % LEAVE_COLORS.length] }))} />
                    <Legend items={items.map((i, k) => ({ label: i.name, color: i.color || LEAVE_COLORS[k % LEAVE_COLORS.length], value: Math.round(i.available * 10) / 10 }))} />
                </>
            )}
        </div>
    )
}
function PerformanceCard({ d, grow }: { d: MeHome; grow?: boolean }) {
    const total = d.month.present + d.month.absent + d.month.leave + (d.month.unmarked ?? 0)
    const att = total ? Math.round((d.month.present / total) * 100) : null
    const rows = [
        { label: "Attendance this month", value: att === null ? "—" : `${att}%`, pct: att ?? 0, color: "#22c55e" },
        { label: "Tasks done this month", value: String(d.tasks.doneThisMonth ?? 0), pct: Math.min(100, ((d.tasks.doneThisMonth ?? 0) / Math.max(1, (d.tasks.doneThisMonth ?? 0) + d.tasks.myOpen)) * 100), color: "#3d6ff5" },
        { label: "Tasks open", value: String(d.tasks.myOpen), pct: Math.min(100, (d.tasks.myOpen / Math.max(1, (d.tasks.doneThisMonth ?? 0) + d.tasks.myOpen)) * 100), color: "#f5b52e" },
    ]
    return (
        <div className={`${card} flex flex-col ${grow ? "flex-1" : ""}`}>
            <p className="text-[16px] font-semibold text-[var(--text)] mb-3">My performance <span className="text-[12px] font-normal text-[var(--text3)]">this month</span></p>
            <div className="space-y-3">
                {rows.map(r => (
                    <div key={r.label}>
                        <div className="flex items-center justify-between text-[13px]"><span className="text-[var(--text2)]">{r.label}</span><span className="font-semibold text-[var(--text)] tabular-nums">{r.value}</span></div>
                        <div className="mt-1 h-1.5 rounded-full bg-[#eceef6] overflow-hidden"><div className="h-full rounded-full" style={{ width: `${r.pct}%`, background: r.color }} /></div>
                    </div>
                ))}
                {d.tasks.myOverdue > 0 && <p className="text-[12px] text-[var(--red)]">{d.tasks.myOverdue} task{d.tasks.myOverdue === 1 ? "" : "s"} overdue</p>}
            </div>
            <Link href="/tasks" className="mt-auto pt-3 text-[12.5px] text-[var(--accent)] font-medium">Open my tasks →</Link>
        </div>
    )
}
