"use client"
import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { format } from "date-fns"
import { Download, Loader2, Search, ChevronLeft, ChevronRight, Save, RotateCcw } from "lucide-react"
import { CODE_STYLE, type AttendancePolicy, type RegisterDay, type RegisterTotals } from "@/lib/attendance-policy"

export type RegisterResponse = {
    year: number
    month: number
    days: { key: string; day: number; dow: number; weeklyOff: boolean; holiday: string | null; future: boolean }[]
    rows: { employee: { id: string; firstName: string; lastName: string; employeeId: string; designation?: string | null }; cells: RegisterDay[]; totals: RegisterTotals }[]
    policy: AttendancePolicy
}

const DOW = ["S", "M", "T", "W", "T", "F", "S"]
const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1))
const time = (iso?: string | null) => (iso ? format(new Date(iso), "HH:mm") : "—")

export function cellTitle(c: RegisterDay, dayLabel: string) {
    const parts = [dayLabel, CODE_STYLE[c.code]?.label ?? ""]
    if (c.leaveType) parts.push(c.leaveType)
    if (c.holiday) parts.push(c.holiday)
    if (c.checkIn || c.checkOut) parts.push(`${time(c.checkIn)}–${time(c.checkOut)}`)
    if (c.hours) parts.push(`${c.hours}h`)
    if (c.lateMin) parts.push(`${c.lateMin} min late`)
    if (c.ot) parts.push(`OT ${c.ot}h`)
    return parts.filter(Boolean).join(" · ")
}

export function CodeLegend() {
    return (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11.5px] text-[var(--text2)]">
            {(["P", "LT", "HD", "A", "L", "WO", "H", "-"] as const).map(k => (
                <span key={k} className="inline-flex items-center gap-1.5">
                    <span className="inline-flex items-center justify-center min-w-[24px] h-5 px-1 rounded-[5px] text-[10.5px] font-bold" style={{ color: CODE_STYLE[k].color, background: CODE_STYLE[k].bg, border: k === "-" ? "1px dashed var(--border2)" : undefined }}>{k}</span>
                    {CODE_STYLE[k].label}
                </span>
            ))}
        </div>
    )
}

export function MusterRoll({ month, siteId }: { month: string; siteId: string }) {
    const [data, setData] = useState<RegisterResponse | null>(null)
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState("")
    const [onlyGaps, setOnlyGaps] = useState(false)
    const [page, setPage] = useState(1)
    const perPage = 50

    useEffect(() => {
        setLoading(true)
        const params = new URLSearchParams({ month })
        if (siteId) params.set("siteId", siteId)
        fetch(`/api/attendance/register?${params}`)
            .then(async r => { if (!r.ok) throw new Error(await r.text()); return r.json() })
            .then(setData)
            .catch(e => toast.error(e instanceof Error ? e.message : "Failed to load muster roll"))
            .finally(() => setLoading(false))
    }, [month, siteId])
    useEffect(() => setPage(1), [search, onlyGaps, month, siteId])

    const rows = useMemo(() => {
        if (!data) return []
        const q = search.toLowerCase()
        return data.rows.filter(r =>
            (!q || `${r.employee.firstName} ${r.employee.lastName} ${r.employee.employeeId}`.toLowerCase().includes(q)) &&
            (!onlyGaps || r.totals.unmarked > 0 || r.totals.absent > 0),
        )
    }, [data, search, onlyGaps])

    const totals = useMemo(() => rows.reduce((t, r) => ({
        present: t.present + r.totals.present, absent: t.absent + r.totals.absent, leave: t.leave + r.totals.leave,
        unmarked: t.unmarked + r.totals.unmarked, late: t.late + r.totals.late,
    }), { present: 0, absent: 0, leave: 0, unmarked: 0, late: 0 }), [rows])

    const exportCsv = () => {
        if (!data) return
        const head = ["Emp ID", "Name", ...data.days.map(d => String(d.day)), "Present", "Late", "Half day", "Absent", "Leave", "Paid leave", "Weekly off", "Holiday", "Not marked", "OT hrs", "Payable days"]
        const lines = rows.map(r => [
            r.employee.employeeId, `${r.employee.firstName} ${r.employee.lastName}`,
            ...r.cells.map(c => c.code === "L" && c.leaveType ? c.leaveType : c.code),
            r.totals.present, r.totals.late, r.totals.halfDay, r.totals.absent, r.totals.leave, r.totals.paidLeave,
            r.totals.weeklyOff, r.totals.holiday, r.totals.unmarked, r.totals.otHours, r.totals.payableDays,
        ])
        const csv = [head, ...lines].map(l => l.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n")
        const a = document.createElement("a")
        a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }))
        a.download = `muster_roll_${month}.csv`
        a.click()
        toast.success(`Exported ${rows.length} employees`)
    }

    if (loading) return <div className="flex justify-center py-16"><Loader2 size={26} className="animate-spin text-[var(--accent)]" /></div>
    if (!data) return null

    const totalPages = Math.max(1, Math.ceil(rows.length / perPage))
    const pageRows = rows.slice((page - 1) * perPage, page * perPage)

    return (
        <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
                <div className="relative w-full sm:w-[260px]">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text3)]" />
                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search employee…"
                        className="w-full h-9 rounded-[8px] border border-[var(--border)] bg-[var(--surface)] pl-8 pr-3 text-[13px] text-[var(--text)] outline-none focus:border-[var(--accent)]" />
                </div>
                <label className="flex items-center gap-2 text-[12.5px] text-[var(--text2)] cursor-pointer select-none">
                    <input type="checkbox" checked={onlyGaps} onChange={e => setOnlyGaps(e.target.checked)} className="accent-[var(--accent)] w-4 h-4" />
                    Only rows with absences or unmarked days
                </label>
                <span className="text-[12px] text-[var(--text3)] sm:ml-auto">
                    {rows.length} employees · {totals.present} present-days · {totals.late} late · {totals.absent} absent · {totals.leave} leave · {totals.unmarked} not marked
                </span>
                <button onClick={exportCsv} className="inline-flex items-center gap-2 h-9 px-3 rounded-[9px] border border-[var(--border)] bg-[var(--surface)] text-[12.5px] font-semibold text-[var(--text2)] hover:bg-[var(--surface2)]"><Download size={14} /> Export CSV</button>
            </div>
            <CodeLegend />

            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[12px] overflow-hidden">
                <div className="overflow-auto max-h-[70vh]">
                    <table className="border-separate border-spacing-0 text-[11.5px]" style={{ minWidth: 260 + data.days.length * 30 + 330 }}>
                        <thead className="sticky top-0 z-20">
                            <tr className="bg-[var(--surface2)]">
                                <th className="sticky left-0 z-30 bg-[var(--surface2)] text-left font-semibold text-[var(--text3)] px-3 py-2 min-w-[200px] border-b border-r border-[var(--border)]">Employee</th>
                                {data.days.map(d => (
                                    <th key={d.key} title={d.holiday ?? undefined}
                                        className={`w-[30px] min-w-[30px] text-center font-semibold border-b border-[var(--border)] py-1 ${d.holiday ? "text-[#1d4ed8]" : d.weeklyOff ? "text-[var(--text3)]" : "text-[var(--text2)]"}`}>
                                        <span className="block text-[10px] font-medium">{DOW[d.dow]}</span>{d.day}
                                    </th>
                                ))}
                                {["P", "A", "L", "OT", "Payable"].map(h => (
                                    <th key={h} className="px-2 text-center font-semibold text-[var(--text3)] border-b border-l border-[var(--border)] min-w-[54px]">{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {pageRows.map(r => (
                                <tr key={r.employee.id} className="group">
                                    <td className="sticky left-0 z-10 bg-[var(--surface)] group-hover:bg-[var(--surface2)] px-3 py-1.5 border-b border-r border-[var(--border)]">
                                        <p className="text-[12.5px] font-semibold text-[var(--text)] truncate max-w-[190px]">{r.employee.firstName} {r.employee.lastName}</p>
                                        <p className="text-[10.5px] font-mono text-[var(--text3)]">{r.employee.employeeId}</p>
                                    </td>
                                    {r.cells.map((c, i) => {
                                        const st = CODE_STYLE[c.code]
                                        return (
                                            <td key={i} className="border-b border-[var(--border)] text-center p-0.5 group-hover:bg-[var(--surface2)]" title={c.code ? cellTitle(c, `${data.days[i].day} ${format(new Date(data.year, data.month - 1, 1), "MMM")}`) : undefined}>
                                                {c.code && (
                                                    <span className="inline-flex items-center justify-center w-[26px] h-[22px] rounded-[5px] text-[10px] font-bold"
                                                        style={{ color: st?.color, background: st?.bg, border: c.code === "-" ? "1px dashed var(--border2)" : undefined }}>
                                                        {c.code === "L" && c.leaveType ? c.leaveType.slice(0, 3) : c.code === "-" ? "" : c.code}
                                                    </span>
                                                )}
                                            </td>
                                        )
                                    })}
                                    <td className="text-center font-semibold text-[#15803d] border-b border-l border-[var(--border)]">{fmt(r.totals.present + r.totals.halfDay * 0.5)}</td>
                                    <td className="text-center font-semibold text-[#b91c1c] border-b border-l border-[var(--border)]">{r.totals.absent || ""}</td>
                                    <td className="text-center font-semibold text-[#6d28d9] border-b border-l border-[var(--border)]">{r.totals.leave || ""}</td>
                                    <td className="text-center text-[var(--text2)] border-b border-l border-[var(--border)]">{r.totals.otHours || ""}</td>
                                    <td className="text-center font-bold text-[var(--text)] border-b border-l border-[var(--border)]" title={`Present ${r.totals.present} + half ${r.totals.halfDay}×0.5 + paid leave ${r.totals.paidLeave} + weekly off ${r.totals.weeklyOff} + holiday ${r.totals.holiday}`}>{fmt(r.totals.payableDays)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {rows.length === 0 && <p className="text-center text-[13px] text-[var(--text3)] py-10">No employees match.</p>}
                </div>
                {totalPages > 1 && (
                    <div className="flex items-center justify-between px-4 py-2.5 border-t border-[var(--border)] text-[12.5px] text-[var(--text3)]">
                        <span>Page {page} of {totalPages}</span>
                        <div className="flex gap-1.5">
                            <button disabled={page === 1} onClick={() => setPage(p => p - 1)} aria-label="Previous page" className="w-8 h-8 rounded-[8px] border border-[var(--border)] flex items-center justify-center disabled:opacity-40"><ChevronLeft size={15} /></button>
                            <button disabled={page === totalPages} onClick={() => setPage(p => p + 1)} aria-label="Next page" className="w-8 h-8 rounded-[8px] border border-[var(--border)] flex items-center justify-center disabled:opacity-40"><ChevronRight size={15} /></button>
                        </div>
                    </div>
                )}
            </div>
            <p className="text-[11.5px] text-[var(--text3)]">
                Payable = present + half days × 0.5 + paid leave + weekly offs + holidays. Approved leaves, weekly offs ({data.policy.shiftStart} shift, {data.policy.graceMinutes} min grace) and the holiday calendar are applied automatically. Payroll still uses its own uploaded wage sheet.
            </p>
        </div>
    )
}

export function AttendanceSettings() {
    const [policy, setPolicy] = useState<AttendancePolicy | null>(null)
    const [saved, setSaved] = useState<AttendancePolicy | null>(null)
    const [defaults, setDefaults] = useState<AttendancePolicy | null>(null)
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        fetch("/api/attendance/policy").then(r => r.json()).then(d => { setPolicy(d.policy); setSaved(d.policy); setDefaults(d.defaults) }).catch(() => toast.error("Failed to load settings"))
    }, [])
    if (!policy) return <div className="flex justify-center py-16"><Loader2 size={26} className="animate-spin text-[var(--accent)]" /></div>

    const dirty = JSON.stringify(policy) !== JSON.stringify(saved)
    const save = async () => {
        setSaving(true)
        try {
            const res = await fetch("/api/attendance/policy", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(policy) })
            if (!res.ok) throw new Error(await res.text())
            const d = await res.json()
            setPolicy(d.policy); setSaved(d.policy)
            toast.success("Attendance rules saved")
        } catch (e) { toast.error(e instanceof Error ? e.message : "Failed to save") } finally { setSaving(false) }
    }
    const field = "w-full h-9 rounded-[8px] border border-[var(--border2)] bg-[var(--surface)] px-3 text-[13px] text-[var(--text)] outline-none focus:border-[var(--accent)]"

    return (
        <div className="space-y-4 max-w-3xl">
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[14px] p-5">
                <h3 className="text-[14px] font-semibold text-[var(--text)]">Shift &amp; late marking</h3>
                <p className="text-[12px] text-[var(--text3)] mb-4">Times are IST. A check-in after shift start + grace shows as Late (LT) in the daily view and muster roll.</p>
                <div className="grid gap-4 sm:grid-cols-3">
                    <div><label className="block text-[12px] font-medium text-[var(--text2)] mb-1">Shift starts</label><input type="time" value={policy.shiftStart} onChange={e => setPolicy({ ...policy, shiftStart: e.target.value })} className={field} /></div>
                    <div><label className="block text-[12px] font-medium text-[var(--text2)] mb-1">Shift ends</label><input type="time" value={policy.shiftEnd} onChange={e => setPolicy({ ...policy, shiftEnd: e.target.value })} className={field} /></div>
                    <div><label className="block text-[12px] font-medium text-[var(--text2)] mb-1">Grace (minutes)</label><input type="number" min={0} max={240} value={policy.graceMinutes} onChange={e => setPolicy({ ...policy, graceMinutes: Number(e.target.value) })} className={field} /></div>
                </div>
            </div>
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[14px] p-5">
                <h3 className="text-[14px] font-semibold text-[var(--text)]">Working hours</h3>
                <p className="text-[12px] text-[var(--text3)] mb-4">A completed day (checked in and out) shorter than the half-day threshold counts as a half day.</p>
                <div className="grid gap-4 sm:grid-cols-2">
                    <div><label className="block text-[12px] font-medium text-[var(--text2)] mb-1">Full day (hours)</label><input type="number" min={1} max={24} step={0.5} value={policy.fullDayHours} onChange={e => setPolicy({ ...policy, fullDayHours: Number(e.target.value) })} className={field} /></div>
                    <div><label className="block text-[12px] font-medium text-[var(--text2)] mb-1">Half day below (hours)</label><input type="number" min={0} max={24} step={0.5} value={policy.halfDayBelowHours} onChange={e => setPolicy({ ...policy, halfDayBelowHours: Number(e.target.value) })} className={field} /></div>
                </div>
                <p className="text-[12px] text-[var(--text3)] mt-4">Weekly offs and holidays come from <a href="/leaves" className="text-[var(--accent)] font-medium hover:underline">Leaves → Policy</a> and the holiday calendar, so both modules count days the same way.</p>
            </div>
            <div className="flex justify-end gap-2">
                {defaults && <button onClick={() => setPolicy(defaults)} className="inline-flex items-center gap-1.5 h-10 px-4 rounded-[10px] text-[13px] font-medium text-[var(--text2)] hover:bg-[var(--surface)]"><RotateCcw size={14} /> Defaults</button>}
                <button onClick={save} disabled={!dirty || saving} className="inline-flex items-center gap-2 h-10 px-5 rounded-[10px] bg-[var(--accent)] text-white text-[13px] font-semibold disabled:opacity-50">
                    {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save rules
                </button>
            </div>
        </div>
    )
}
