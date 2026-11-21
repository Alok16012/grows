"use client"

// Expense Claims → Policy. Every expense rule the accounts / HR team can change:
// what over-limit claims do, receipts, claim age, travel ₹/km and km limit, and
// per-category limits per claim and per month. The server applies the same
// checks when a claim is submitted (web and mobile).
import { useEffect, useState } from "react"
import Link from "next/link"
import { ArrowLeft, Loader2, Save } from "lucide-react"
import { toast } from "sonner"
import { useSession } from "next-auth/react"
import { can } from "@/lib/can"
import { DEFAULT_EXPENSE_POLICY, type ExpensePolicy } from "@/lib/expense-policy"
import { EXPENSE_CATEGORY_GROUPS } from "@/lib/expense-categories"

const card = "bg-white border border-[var(--border)] rounded-[14px] p-5"
const inp = "h-9 rounded-[9px] border border-[var(--border)] px-2.5 text-[13px] bg-white text-right"

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
    return (
        <div className="flex items-center justify-between gap-4 py-2">
            <div className="min-w-0">
                <p className="text-[13px] text-[var(--text)]">{label}</p>
                {hint && <p className="text-[11.5px] text-[var(--text3)]">{hint}</p>}
            </div>
            <div className="flex items-center gap-1.5 shrink-0">{children}</div>
        </div>
    )
}
const money = (v: string): number | null => { if (v.trim() === "") return null; const n = Number(v); return Number.isFinite(n) && n > 0 ? n : null }

export default function ExpensePolicyPage() {
    const { data: session } = useSession()
    const canManage = can(session, "expenses.manage")
    const [p, setP] = useState<ExpensePolicy>(DEFAULT_EXPENSE_POLICY)
    const [rate2W, setRate2W] = useState("")
    const [rate4W, setRate4W] = useState("")
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [q, setQ] = useState("")

    useEffect(() => {
        Promise.all([
            fetch("/api/expenses/policy").then(r => r.ok ? r.json() : null),
            fetch("/api/settings?key=TRAVEL_PER_KM_RATE_2W").then(r => r.ok ? r.json() : null).catch(() => null),
            fetch("/api/settings?key=TRAVEL_PER_KM_RATE_4W").then(r => r.ok ? r.json() : null).catch(() => null),
        ]).then(([d, r2, r4]) => {
            if (d?.policy) setP(d.policy)
            setRate2W(r2?.value ?? ""); setRate4W(r4?.value ?? "")
        }).finally(() => setLoading(false))
    }, [])

    const setLimit = (cat: string, k: "perClaim" | "perMonth", v: string) => setP(prev => {
        const cur = prev.limits[cat] ?? { perClaim: null, perMonth: null }
        return { ...prev, limits: { ...prev.limits, [cat]: { ...cur, [k]: money(v) } } }
    })

    async function save() {
        setSaving(true)
        try {
            const r = await fetch("/api/expenses/policy", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(p) })
            if (!r.ok) throw new Error((await r.text()) || "Could not save")
            const post = (key: string, value: string) => fetch("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key, value: value || "0" }) })
            await Promise.all([post("TRAVEL_PER_KM_RATE_2W", rate2W), post("TRAVEL_PER_KM_RATE_4W", rate4W), post("TRAVEL_PER_KM_RATE", rate4W)])
            const d = await r.json()
            setP(d.policy)
            toast.success("Expense policy saved")
        } catch (e: any) { toast.error(e.message) } finally { setSaving(false) }
    }

    if (loading) return <div className="p-10 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-[var(--text3)]" /></div>
    const ro = !canManage
    const set = <K extends keyof ExpensePolicy>(k: K, v: ExpensePolicy[K]) => setP(prev => ({ ...prev, [k]: v }))
    const limited = Object.keys(p.limits).length

    return (
        <div className="max-w-4xl mx-auto p-4 md:p-6 space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                    <Link href="/expenses" className="inline-flex items-center gap-1 text-[12.5px] text-[var(--text3)] hover:text-[var(--text)]"><ArrowLeft className="h-3.5 w-3.5" /> Expense Claims</Link>
                    <h1 className="text-[20px] font-bold text-[var(--text)] mt-1">Expense policy</h1>
                    <p className="text-[12.5px] text-[var(--text3)]">Checked when a claim is submitted (web and mobile) and shown to the approver on each claim.</p>
                </div>
                {canManage && (
                    <button onClick={save} disabled={saving} className="inline-flex items-center gap-1.5 h-10 px-5 rounded-[10px] bg-[var(--accent)] text-white text-[13px] font-semibold disabled:opacity-60">
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save policy
                    </button>
                )}
            </div>
            {ro && <p className="text-[12.5px] text-[var(--text3)] bg-[var(--surface2)] rounded-[10px] px-3 py-2">You can view the policy; changing it needs the Manage Expenses permission.</p>}

            <div className={card}>
                <p className="text-[14px] font-semibold text-[var(--text)]">General</p>
                <Row label="When a claim is over a category limit" hint="Warn: it can be submitted, the approver sees the warning. Block: it can't be submitted until corrected.">
                    <select disabled={ro} value={p.overLimit} onChange={e => set("overLimit", e.target.value as ExpensePolicy["overLimit"])} className="h-9 rounded-[9px] border border-[var(--border)] px-2.5 text-[13px] bg-white">
                        <option value="warn">Warn the approver</option>
                        <option value="block">Block the submit</option>
                    </select>
                </Row>
                <Row label="Receipt required above" hint="Per line, for every category except km-based travel. 0 = receipts never required.">
                    <span className="text-[12px] text-[var(--text3)]">₹</span>
                    <input disabled={ro} type="number" min={0} className={`${inp} w-28`} value={p.receiptRequiredAbove} onChange={e => set("receiptRequiredAbove", Number(e.target.value) || 0)} />
                </Row>
                <Row label="Oldest expense that can be claimed" hint="By the expense date. 0 = no limit.">
                    <input disabled={ro} type="number" min={0} className={`${inp} w-24`} value={p.maxAgeDays} onChange={e => set("maxAgeDays", Number(e.target.value) || 0)} />
                    <span className="text-[12px] text-[var(--text3)]">days</span>
                </Row>
            </div>

            <div className={card}>
                <p className="text-[14px] font-semibold text-[var(--text)]">Approval</p>
                <Row label="Approval levels" hint="Two levels: the claimant's reporting manager approves first, then Accounts / HR (Manage Expenses) give final approval. Claimants with no reporting manager go straight to final approval.">
                    <select disabled={ro} value={p.approval.mode} onChange={e => set("approval", { ...p.approval, mode: e.target.value as ExpensePolicy["approval"]["mode"] })} className="h-9 rounded-[9px] border border-[var(--border)] px-2.5 text-[13px] bg-white">
                        <option value="single">One level — Manage Expenses approves</option>
                        <option value="twoLevel">Two levels — manager, then final</option>
                    </select>
                </Row>
                {p.approval.mode === "twoLevel" && (
                    <Row label="Final approval needed above" hint="After the manager approves, claims above this amount also need final approval. 0 = every claim.">
                        <span className="text-[12px] text-[var(--text3)]">₹</span>
                        <input disabled={ro} type="number" min={0} className={`${inp} w-28`} value={p.approval.finalAbove} onChange={e => set("approval", { ...p.approval, finalAbove: Number(e.target.value) || 0 })} />
                    </Row>
                )}
                <Row label="Remind the approver after" hint="Daily reminder to whoever must act on a waiting claim. 0 = no reminders.">
                    <input disabled={ro} type="number" min={0} className={`${inp} w-24`} value={p.approval.remindAfterHours} onChange={e => set("approval", { ...p.approval, remindAfterHours: Number(e.target.value) || 0 })} />
                    <span className="text-[12px] text-[var(--text3)]">hours</span>
                </Row>
                <Row label="Escalate to admins after" hint="0 = never.">
                    <input disabled={ro} type="number" min={0} className={`${inp} w-24`} value={p.approval.escalateAfterHours} onChange={e => set("approval", { ...p.approval, escalateAfterHours: Number(e.target.value) || 0 })} />
                    <span className="text-[12px] text-[var(--text3)]">hours</span>
                </Row>
            </div>

            <div className={card}>
                <p className="text-[14px] font-semibold text-[var(--text)]">Travel (km)</p>
                <Row label="2-wheeler rate" hint="Travel lines are worked out as km × this rate.">
                    <span className="text-[12px] text-[var(--text3)]">₹</span>
                    <input disabled={ro} type="number" min={0} step="0.5" className={`${inp} w-24`} value={rate2W} onChange={e => setRate2W(e.target.value)} />
                    <span className="text-[12px] text-[var(--text3)]">/ km</span>
                </Row>
                <Row label="4-wheeler rate">
                    <span className="text-[12px] text-[var(--text3)]">₹</span>
                    <input disabled={ro} type="number" min={0} step="0.5" className={`${inp} w-24`} value={rate4W} onChange={e => setRate4W(e.target.value)} />
                    <span className="text-[12px] text-[var(--text3)]">/ km</span>
                </Row>
                <Row label="Most km on one travel claim" hint="All journeys of one travel line. 0 = no limit.">
                    <input disabled={ro} type="number" min={0} className={`${inp} w-24`} value={p.maxKmPerClaim} onChange={e => set("maxKmPerClaim", Number(e.target.value) || 0)} />
                    <span className="text-[12px] text-[var(--text3)]">km</span>
                </Row>
            </div>

            <div className={card}>
                <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
                    <div>
                        <p className="text-[14px] font-semibold text-[var(--text)]">Category limits</p>
                        <p className="text-[11.5px] text-[var(--text3)]">Blank = no limit. Per month counts the employee&apos;s submitted, approved and paid claims in that month. {limited} categor{limited === 1 ? "y has" : "ies have"} a limit.</p>
                    </div>
                    <input placeholder="Search category" value={q} onChange={e => setQ(e.target.value)} className="h-9 rounded-[9px] border border-[var(--border)] px-2.5 text-[13px] bg-white w-48" />
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-[13px]">
                        <thead>
                            <tr className="text-[11px] uppercase tracking-wide text-[var(--text3)]">
                                <th className="text-left py-2 font-semibold">Category</th>
                                <th className="text-right py-2 font-semibold w-36">Per claim (₹)</th>
                                <th className="text-right py-2 font-semibold w-36">Per month (₹)</th>
                            </tr>
                        </thead>
                        <tbody>
                            {EXPENSE_CATEGORY_GROUPS.map(g => {
                                const items = g.items.filter(([, l]) => !q.trim() || l.toLowerCase().includes(q.trim().toLowerCase()))
                                if (!items.length) return null
                                return [
                                    <tr key={g.group}><td colSpan={3} className="pt-3 pb-1 text-[11px] font-bold uppercase tracking-wider text-[var(--accent)]">{g.group}</td></tr>,
                                    ...items.map(([cat, l]) => (
                                        <tr key={cat} className="border-t border-[var(--border)]">
                                            <td className="py-1.5 text-[var(--text)]">{l}</td>
                                            <td className="py-1.5 text-right"><input disabled={ro} type="number" min={0} placeholder="No limit" className={`${inp} w-32`} value={p.limits[cat]?.perClaim ?? ""} onChange={e => setLimit(cat, "perClaim", e.target.value)} /></td>
                                            <td className="py-1.5 text-right"><input disabled={ro} type="number" min={0} placeholder="No limit" className={`${inp} w-32`} value={p.limits[cat]?.perMonth ?? ""} onChange={e => setLimit(cat, "perMonth", e.target.value)} /></td>
                                        </tr>
                                    )),
                                ]
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    )
}
