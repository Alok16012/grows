"use client"

// Desktop home, top section (soft theme, client reference Nov 2026):
//   col 1 — check-in card with a live clock, quick-action tiles, my tasks
//   col 2 — events & announcements: this month's calendar + what's coming
//   col 3 — profile card (photo, name, designation, Check-in / Check-out),
//           my attendance ring (this month) and my leave balance ring
// Data: /api/me/home (one call) and /api/tasks?view=mine. People without an
// employee record (e.g. Admin) get the tiles, events and tasks only.
import { useCallback, useEffect, useMemo, useState } from "react"
import { useSession } from "next-auth/react"
import Link from "next/link"
import { toast } from "sonner"
import {
    ArrowLeft, ArrowRight, BookOpen, CalendarDays, ChevronLeft, ChevronRight, Clock, FileText, GraduationCap, IndianRupee,
    LifeBuoy, ListChecks, Loader2, Plus, Receipt, Umbrella,
} from "lucide-react"

type Home = {
    employee: { firstName: string; name?: string; photo?: string | null; code: string; designation: string | null; site: string | null } | null
    today: { checkIn: string | null; checkOut: string | null; status: string | null; workingHrs: number | null } | null
    month: { present: number; leave: number; absent: number }
    leave: { total: number; items: { code: string; name: string; available: number; color?: string | null }[] } | null
    tasks: { myOpen: number; myOverdue: number; awaitingMine: number }
    holiday: { name: string; date: string } | null
    monthHolidays?: { name: string; date: string; type?: string | null }[]
    announcements: { id: string; title: string; category: string; publishedAt: string }[]
    celebrations: { name: string; kind: string; years: number | null }[]
}
type Task = { id: string; taskNo: string; title: string; status: string; dueAt: string | null }

const card = "bg-white rounded-[22px] shadow-[var(--shadow-card)] p-5"
const IST = 330 * 60_000
const istDay = (d: Date | string) => new Date(new Date(d).getTime() + IST).toISOString().slice(0, 10)
const hm = (s: string | null | undefined) => s ? new Date(s).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "—"

export function MyDay() {
    const [d, setD] = useState<Home | null>(null)
    const load = useCallback(() => { fetch("/api/me/home").then(r => r.ok ? r.json() : null).then(j => j && !j.error && setD(j)).catch(() => {}) }, [])
    useEffect(() => { load() }, [load])
    if (!d) return null
    const isEmp = !!d.employee
    return (
        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,0.85fr)] items-start">
            <div className="flex flex-col gap-4 min-w-0">
                {isEmp && <TimerCard today={d.today} />}
                <QuickTiles />
                <MyTasks />
            </div>
            {/* Two-column screens: the profile card sits at the top of the right column. */}
            <div className="flex flex-col gap-4 min-w-0">
                {isEmp && <div className="xl:hidden"><ProfileCheckCard emp={d.employee!} today={d.today} onDone={load} /></div>}
                <EventsCard d={d} />
            </div>
            {isEmp && (
                <div className="flex flex-col gap-4 min-w-0 lg:col-span-2 xl:col-span-1 lg:grid lg:grid-cols-2 xl:flex">
                    <div className="hidden xl:block"><ProfileCheckCard emp={d.employee!} today={d.today} onDone={load} /></div>
                    <AttendanceRing m={d.month} />
                    <LeaveRing leave={d.leave} />
                </div>
            )}
        </div>
    )
}

// ── Check-in / check-out (shared by the profile card) ───────────────────────
async function punch(action: "in" | "out") {
    const loc = await new Promise<{ lat: number; lng: number } | null>(res => {
        if (!navigator.geolocation) return res(null)
        navigator.geolocation.getCurrentPosition(p => res({ lat: p.coords.latitude, lng: p.coords.longitude }), () => res(null), { timeout: 5000 })
    })
    const r = await fetch("/api/me/attendance", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...(loc ?? {}) }) })
    if (!r.ok) throw new Error((await r.text()) || "Couldn't save")
}

// ── Profile card: photo, name, designation, Check-in / Check-out ─────────────
function ProfileCheckCard({ emp, today, onDone }: { emp: NonNullable<Home["employee"]>; today: Home["today"]; onDone: () => void }) {
    const { data: session } = useSession()
    const [busy, setBusy] = useState<"in" | "out" | null>(null)
    const photo = emp.photo || (session?.user as any)?.image || null
    const name = emp.name || emp.firstName
    const inAt = today?.checkIn, outAt = today?.checkOut
    async function go(action: "in" | "out") {
        setBusy(action)
        try { await punch(action); toast.success(action === "in" ? "Checked in" : "Checked out"); onDone() }
        catch (e: any) { toast.error(e.message) } finally { setBusy(null) }
    }
    const initials = name.split(/\s+/).map(w => w[0]).slice(0, 2).join("").toUpperCase()
    return (
        <div className={`${card} flex flex-col items-center text-center`}>
            <div className="h-24 w-24 rounded-[22px] overflow-hidden bg-[var(--accent-light)] shadow-[0_10px_24px_rgba(40,48,100,0.14)] flex items-center justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {photo ? <img src={photo} alt={name} className="h-full w-full object-cover" /> : <span className="text-[28px] font-bold text-[var(--accent)]">{initials}</span>}
            </div>
            <p className="mt-3 text-[17px] font-bold text-[var(--text)] leading-tight">{name}</p>
            <p className="text-[13px] text-[var(--text2)]">{emp.designation || emp.code}</p>
            <div className="mt-4 w-full grid grid-cols-2 gap-1 p-1.5 rounded-[18px] bg-white border border-[var(--border)]">
                <button onClick={() => go("in")} disabled={!!inAt || !!busy}
                    className={`h-[72px] rounded-[14px] flex flex-col items-center justify-center gap-1.5 text-[11px] font-semibold tracking-wide transition-colors ${!inAt ? "bg-[#3ecf8e] text-white shadow-[0_8px_18px_rgba(62,207,142,0.35)]" : "text-[var(--text3)]"}`}>
                    {busy === "in" ? <Loader2 size={20} className="animate-spin" /> : <ArrowRight size={20} />}
                    {inAt ? `IN ${hm(inAt)}` : "CHECK-IN"}
                </button>
                <button onClick={() => go("out")} disabled={!inAt || !!outAt || !!busy}
                    className={`h-[72px] rounded-[14px] flex flex-col items-center justify-center gap-1.5 text-[11px] font-semibold tracking-wide transition-colors ${inAt && !outAt ? "bg-[#f05252] text-white shadow-[0_8px_18px_rgba(240,82,82,0.30)]" : "text-[var(--text3)]"}`}>
                    {busy === "out" ? <Loader2 size={20} className="animate-spin" />
                        : <span className={`h-7 w-7 rounded-[8px] flex items-center justify-center ${inAt && !outAt ? "bg-white/25" : "bg-[#fde2e2] text-[#e02424]"}`}><ArrowLeft size={16} /></span>}
                    {outAt ? `OUT ${hm(outAt)}` : "CHECK-OUT"}
                </button>
            </div>
        </div>
    )
}

// ── Today's timer (blue card) ────────────────────────────────────────────────
function TimerCard({ today }: { today: Home["today"] }) {
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
                {!inAt ? "You haven't checked in today — use Check-in on your profile card" : outAt ? `Day complete · ${worked} worked` : `Checked in at ${hm(today?.checkIn)} · ${worked} so far`}
            </p>
            {inAt && (
                <div className="mt-4 h-2 rounded-full bg-[#1f46c8]/60 overflow-hidden" title={`${worked} of an 8h day`}>
                    <div className="h-full rounded-full bg-white/90" style={{ width: `${pct}%` }} />
                </div>
            )}
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
                    className={`rounded-[18px] py-3.5 px-2 flex flex-col items-center gap-1.5 text-[12.5px] font-medium transition-transform hover:-translate-y-0.5 ${i === 0 ? "text-white" : "bg-white text-[var(--text)] shadow-[var(--shadow-card)]"}`}
                    style={i === 0 ? { background: "var(--violet)", boxShadow: "0 10px 22px rgba(139,108,246,0.30)" } : undefined}>
                    <t.icon size={22} strokeWidth={1.7} className={i === 0 ? "text-white" : "text-[var(--accent)]"} />
                    {t.label}
                </Link>
            ))}
        </div>
    )
}

// ── My tasks ─────────────────────────────────────────────────────────────────
function MyTasks() {
    const [f, setF] = useState<"all" | "open" | "done">("open")
    const [rows, setRows] = useState<Task[] | null>(null)
    const load = useCallback(() => {
        setRows(null)
        fetch(`/api/tasks?view=mine&status=${f}`).then(r => r.ok ? r.json() : { tasks: [] }).then(j => setRows((j.tasks ?? []).slice(0, 5))).catch(() => setRows([]))
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
        <div className={card}>
            <div className="flex items-center justify-between gap-2 mb-3">
                <p className="text-[15px] font-semibold text-[var(--text)]">My tasks</p>
                <div className="flex gap-1.5">{chip("all", "All")}{chip("open", "Pending")}{chip("done", "Done")}</div>
            </div>
            {!rows ? <div className="py-6 flex justify-center"><Loader2 size={18} className="animate-spin text-[var(--text3)]" /></div>
                : !rows.length ? <p className="text-[12.5px] text-[var(--text3)] py-4">{f === "done" ? "No finished tasks yet." : "Nothing pending — you're all caught up."}</p>
                    : (
                        <ul className="divide-y divide-[var(--border)]">
                            {rows.map(t => {
                                const done = t.status === "DONE"
                                const overdue = !done && t.dueAt && new Date(t.dueAt) < new Date()
                                return (
                                    <li key={t.id} className="py-2.5 flex items-center gap-3">
                                        <input type="checkbox" aria-label={`Mark ${t.title} done`} checked={done} disabled={done || t.status === "AWAITING_APPROVAL"} onChange={() => complete(t)} className="h-4 w-4 accent-[var(--accent)]" />
                                        <Link href="/tasks" className={`flex-1 min-w-0 truncate text-[13.5px] ${done ? "line-through text-[var(--text3)]" : "text-[var(--text)] hover:text-[var(--accent)]"}`}>{t.title}</Link>
                                        {t.status === "AWAITING_APPROVAL" ? <span className="text-[11px] text-[var(--amber)] shrink-0">Awaiting approval</span>
                                            : t.dueAt && <span className={`text-[11px] shrink-0 ${overdue ? "text-[var(--red)] font-semibold" : "text-[var(--text3)]"}`}>{new Date(t.dueAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}</span>}
                                    </li>
                                )
                            })}
                        </ul>
                    )}
            <Link href="/tasks" className="mt-3 inline-flex items-center gap-1 text-[12.5px] text-[var(--text3)] hover:text-[var(--accent)]"><Plus size={14} /> All tasks</Link>
        </div>
    )
}

// ── Events & announcements ───────────────────────────────────────────────────
function EventsCard({ d }: { d: Home }) {
    const [offset, setOffset] = useState(0)
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
    return (
        <div className={`${card} min-w-0`}>
            <p className="text-[15px] font-semibold text-[var(--text)] mb-3">Events &amp; announcements</p>
            <div className="flex items-center justify-center gap-3 mb-2 text-[13px] font-medium text-[var(--text)]">
                <button onClick={() => setOffset(o => o - 1)} aria-label="Previous month" className="p-1 text-[var(--text3)] hover:text-[var(--text)]"><ChevronLeft size={16} /></button>
                <span className="w-32 text-center">{view.toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" })}</span>
                <button onClick={() => setOffset(o => o + 1)} aria-label="Next month" className="p-1 text-[var(--text3)] hover:text-[var(--text)]"><ChevronRight size={16} /></button>
            </div>
            <div className="grid grid-cols-7 text-center text-[11.5px] text-[var(--text3)] mb-1">{["sun", "mon", "tue", "wed", "thu", "fri", "sat"].map(w => <span key={w}>{w}</span>)}</div>
            <div className="grid grid-cols-7 gap-y-1 text-center text-[13px]">
                {cells.map((n, i) => {
                    if (!n) return <span key={i} />
                    const k = key(n), isToday = k === todayStr, hol = offset === 0 ? holidays.get(k) : undefined
                    const weekend = (i % 7 === 0) || (i % 7 === 6)
                    return (
                        <span key={i} title={hol} className={`mx-auto h-8 w-8 flex items-center justify-center rounded-full relative ${isToday ? "bg-[var(--accent)] text-white font-semibold" : hol ? "ring-1 ring-[var(--violet)] text-[var(--violet)] font-medium" : weekend ? "text-[var(--text3)]" : "text-[var(--text)]"}`}>
                            {n}
                        </span>
                    )
                })}
            </div>
            <div className="mt-4 space-y-1.5">
                {upcoming.slice(0, 3).map(h => (
                    <div key={h.date + h.name} className="flex items-center gap-2.5 rounded-[12px] px-2.5 py-2 bg-[var(--violet-light)]">
                        <span className="h-6 w-6 rounded-full bg-white text-[11px] font-semibold flex items-center justify-center text-[var(--violet)] shrink-0">{new Date(new Date(h.date).getTime() + IST).getUTCDate()}</span>
                        <span className="text-[13px] text-[var(--text)] truncate">{h.name}</span>
                    </div>
                ))}
                {d.celebrations.slice(0, 3).map((c, i) => (
                    <div key={i} className="flex items-center gap-2.5 px-2.5 py-1.5 text-[13px] text-[var(--text)]">
                        <span aria-hidden>{c.kind === "birthday" ? "🎂" : "🎉"}</span>
                        <span className="truncate">{c.name} — {c.kind === "birthday" ? "birthday today" : `${c.years} year${c.years === 1 ? "" : "s"} with us`}</span>
                    </div>
                ))}
            </div>
            {d.announcements.length > 0 && (
                <div className="mt-4 pt-3 border-t border-[var(--border)]">
                    <p className="text-[11.5px] font-semibold uppercase tracking-wide text-[var(--text3)] mb-1.5">Announcements</p>
                    {d.announcements.slice(0, 4).map(a => (
                        <Link key={a.id} href="/announcements" className="flex items-center gap-2 py-1.5 text-[13px] text-[var(--text2)] hover:text-[var(--accent)]">
                            <BookOpen size={13} className="shrink-0 text-[var(--text3)]" /><span className="truncate">{a.title}</span>
                        </Link>
                    ))}
                </div>
            )}
            {!upcoming.length && !d.celebrations.length && !d.announcements.length && <p className="mt-3 text-[12.5px] text-[var(--text3)]">Nothing coming up this month.</p>}
        </div>
    )
}

// ── Rings ────────────────────────────────────────────────────────────────────
function Ring({ parts, center, sub }: { parts: { value: number; color: string }[]; center: string; sub?: string }) {
    const total = parts.reduce((s, p) => s + p.value, 0)
    const R = 52, C = 2 * Math.PI * R
    let acc = 0
    return (
        <div className="relative h-[140px] w-[140px] mx-auto">
            <svg viewBox="0 0 128 128" className="h-full w-full -rotate-90">
                <circle cx="64" cy="64" r={R} fill="none" stroke="#eceef6" strokeWidth="12" />
                {total > 0 && parts.filter(p => p.value > 0).map((p, i) => {
                    const len = (p.value / total) * C
                    const el = <circle key={i} cx="64" cy="64" r={R} fill="none" stroke={p.color} strokeWidth="12" strokeLinecap="round" strokeDasharray={`${Math.max(0, len - 3)} ${C}`} strokeDashoffset={-acc} />
                    acc += len
                    return el
                })}
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className="text-[24px] font-bold text-[var(--text)] leading-none">{center}</span>
                {sub && <span className="text-[11px] text-[var(--text3)] mt-1">{sub}</span>}
            </div>
        </div>
    )
}
const Legend = ({ items }: { items: { label: string; color: string; value?: number }[] }) => (
    <div className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1">
        {items.map(i => <span key={i.label} className="inline-flex items-center gap-1.5 text-[12px] text-[var(--text2)]"><span className="h-2.5 w-2.5 rounded-full" style={{ background: i.color }} />{i.label}{i.value !== undefined ? ` ${i.value}` : ""}</span>)}
    </div>
)
function AttendanceRing({ m }: { m: Home["month"] }) {
    const total = m.present + m.absent + m.leave
    const pct = total ? Math.round((m.present / total) * 100) : 0
    return (
        <div className={card}>
            <p className="text-[15px] font-semibold text-[var(--text)] mb-3">My attendance <span className="text-[12px] font-normal text-[var(--text3)]">this month</span></p>
            <Ring center={total ? `${pct}%` : "—"} sub={total ? "present" : "no days yet"} parts={[{ value: m.present, color: "#22c55e" }, { value: m.leave, color: "#8b6cf6" }, { value: m.absent, color: "#f43f5e" }]} />
            <Legend items={[{ label: "Present", color: "#22c55e", value: m.present }, { label: "Leave", color: "#8b6cf6", value: m.leave }, { label: "Absent", color: "#f43f5e", value: m.absent }]} />
        </div>
    )
}
const LEAVE_COLORS = ["#f5b52e", "#8b6cf6", "#3d6ff5", "#22c55e", "#f43f5e", "#14b8a6"]
function LeaveRing({ leave }: { leave: Home["leave"] }) {
    const items = (leave?.items ?? []).filter(i => i.available > 0)
    return (
        <div className={card}>
            <div className="flex items-center justify-between mb-3">
                <p className="text-[15px] font-semibold text-[var(--text)]">My leaves</p>
                <Link href="/leaves" className="text-[12px] text-[var(--accent)] font-medium">Apply</Link>
            </div>
            {!leave ? <p className="text-[12.5px] text-[var(--text3)] py-6 text-center">No leave balance set up.</p> : (
                <>
                    <Ring center={`${Math.round(leave.total * 10) / 10}`} sub="days left" parts={items.map((i, k) => ({ value: i.available, color: i.color || LEAVE_COLORS[k % LEAVE_COLORS.length] }))} />
                    <Legend items={items.map((i, k) => ({ label: i.name, color: i.color || LEAVE_COLORS[k % LEAVE_COLORS.length], value: Math.round(i.available * 10) / 10 }))} />
                </>
            )}
        </div>
    )
}
