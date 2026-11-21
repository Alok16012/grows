"use client"

// "Applies from" for any salary or compliance change. Offers only the months
// allowed by Payroll → Calculation Settings → Change control (the open payroll
// month and the next, or only the next). Admins also get "Earlier month" with a
// required reason when back-dating is switched on.
import { useEffect, useState } from "react"

export type EffectiveChoice = { effectiveMonth: number; effectiveYear: number; backdateReason?: string }
type Window = { open: { month: number; year: number }; allowed: { month: number; year: number }[]; control: { allowedMonths: string; backdating: string }; isAdmin: boolean }

const MONTHS = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
const label = (p: { month: number; year: number }) => `${MONTHS[p.month]} ${p.year}`

export default function EffectiveMonthPicker({ onChange, compact = false, prefix = "Applies from" }: { onChange: (c: EffectiveChoice | null) => void; compact?: boolean; prefix?: string }) {
    const [w, setW] = useState<Window | null>(null)
    const [pick, setPick] = useState("")
    const [early, setEarly] = useState({ month: 0, year: new Date().getFullYear(), reason: "" })

    useEffect(() => {
        fetch("/api/payroll/change-window").then(r => (r.ok ? r.json() : null)).then((d: Window | null) => {
            if (!d) return
            setW(d)
            const first = d.allowed[0]
            setPick(`${first.year}-${first.month}`)
            onChange({ effectiveMonth: first.month, effectiveYear: first.year })
        }).catch(() => {})
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    useEffect(() => {
        if (!w) return
        if (pick === "early") {
            onChange(early.month && early.reason.trim().length >= 5 ? { effectiveMonth: early.month, effectiveYear: early.year, backdateReason: early.reason.trim() } : null)
        } else if (pick) {
            const [y, m] = pick.split("-").map(Number)
            onChange({ effectiveMonth: m, effectiveYear: y })
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pick, early])

    if (!w) return <span className="text-[12px] text-[var(--text3)]">Loading months…</span>
    const canBackdate = w.isAdmin && w.control.backdating === "adminWithReason"
    const sel = "h-9 rounded-[8px] border border-[var(--border)] bg-white px-2.5 text-[13px] outline-none focus:border-[var(--accent)]"
    return (
        <div className={compact ? "inline-flex flex-wrap items-center gap-2" : "space-y-1.5"}>
            <label className="inline-flex items-center gap-2 text-[12.5px] text-[var(--text2)]">
                <span className="font-medium">{prefix}</span>
                <select className={sel} value={pick} onChange={e => setPick(e.target.value)}>
                    {w.allowed.map(a => (
                        <option key={`${a.year}-${a.month}`} value={`${a.year}-${a.month}`}>
                            {label(a)}{a.month === w.open.month && a.year === w.open.year ? " (open payroll month)" : " (next month)"}
                        </option>
                    ))}
                    {canBackdate && <option value="early">Earlier month (admin, with reason)…</option>}
                </select>
            </label>
            {pick === "early" && (
                <div className="flex flex-wrap items-center gap-2">
                    <select className={sel} value={early.month} onChange={e => setEarly(x => ({ ...x, month: Number(e.target.value) }))}>
                        <option value={0}>Month…</option>
                        {MONTHS.slice(1).map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                    </select>
                    <input type="number" className={`${sel} w-[90px]`} value={early.year} onChange={e => setEarly(x => ({ ...x, year: Number(e.target.value) }))} />
                    <input className={`${sel} min-w-[220px] flex-1`} placeholder="Reason for back-dating (required)" value={early.reason} onChange={e => setEarly(x => ({ ...x, reason: e.target.value }))} />
                </div>
            )}
            {!compact && <p className="text-[11px] text-[var(--text3)]">Months before this keep their old figures. {label(w.open)} is the open payroll month.</p>}
        </div>
    )
}
