"use client"

// Home page work panels: the profile's own to-do counts and actions
// (recruiter, payroll, inspector, HR, approver, inspection reviewer).
// Admins (Roles → Edit) choose per role which panels show, and in what order.
import { useEffect, useState } from "react"
import { useCachedFetch } from "@/lib/useCachedFetch"
import Link from "next/link"
import { createPortal } from "react-dom"
import { toast } from "sonner"
import { ArrowDown, ArrowUp, ArrowRight, ClipboardCheck, Loader2, Settings2, Target, UserPlus, Wallet, CheckSquare, SearchCheck, X } from "lucide-react"

type Stat = { label: string; value: number | string; href?: string; tone?: "red" | "amber" | "green" | "blue" | "grey" }
type Panel = { key: string; title: string; subtitle?: string; stats: Stat[]; list?: { title: string; sub?: string; href?: string }[]; actions: { label: string; href: string; primary?: boolean }[] }

const ICON: Record<string, any> = { inspector: SearchCheck, recruiter: Target, hr: UserPlus, payroll: Wallet, approvals: CheckSquare, inspectionReview: ClipboardCheck }
const TINT: Record<string, [string, string]> = {
    inspector: ["#e0f2fe", "#0369a1"], recruiter: ["#f5f3ff", "#7c3aed"], hr: ["#e8effe", "#0847c7"],
    payroll: ["#ecfdf5", "#047857"], approvals: ["#fef3c7", "#b45309"], inspectionReview: ["#f0fdfa", "#0f766e"],
}
const TONE: Record<string, string> = { red: "#dc2626", amber: "#d97706", green: "#16a34a", blue: "#2563eb", grey: "var(--text)" }

export function WorkPanels({ compact = false }: { compact?: boolean }) {
    // Cached: the last snapshot paints at once and refreshes in the background.
    const { data: d } = useCachedFetch<{ panels: Panel[]; canEdit: boolean }>("/api/dashboard/work")
    const [setup, setSetup] = useState(false)
    const load = () => { try { sessionStorage.removeItem("swr:/api/dashboard/work") } catch { /* ignore */ } window.location.reload() }

    if (!d) return <div className="h-24 rounded-[14px] bg-[var(--surface)] border border-[var(--border)] animate-pulse" />
    if (!d.panels.length && !d.canEdit) return null
    return (
        <section className="space-y-3">
            <div className="flex items-center justify-between gap-2">
                <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text3)]">Your work</p>
                    {!compact && <p className="text-[12.5px] text-[var(--text3)]">What needs you today, based on your role</p>}
                </div>
                {d.canEdit && !compact && <button onClick={() => setSetup(true)} className="h-8 px-3 rounded-[8px] border border-[var(--border)] bg-[var(--surface)] text-[12px] font-semibold text-[var(--text2)] inline-flex items-center gap-1.5"><Settings2 size={13} /> Panels per role</button>}
            </div>
            {d.panels.length === 0 ? <p className="text-[12.5px] text-[var(--text3)]">No panels for your role. Use “Panels per role” to choose them.</p> : (
                <div className={compact ? "space-y-3" : "grid gap-[14px] md:grid-cols-2 xl:grid-cols-3"}>
                    {d.panels.map(p => <PanelCard key={p.key} p={p} compact={compact} />)}
                </div>
            )}
            {setup && <LayoutModal onClose={() => setSetup(false)} onSaved={() => { setSetup(false); load() }} />}
        </section>
    )
}

function PanelCard({ p, compact }: { p: Panel; compact: boolean }) {
    const Icon = ICON[p.key] ?? ClipboardCheck
    const [bg, fg] = TINT[p.key] ?? ["#f3f4f6", "#374151"]
    return (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[14px] p-4 flex flex-col">
            <div className="flex items-center gap-2.5 mb-3">
                <span className="w-9 h-9 rounded-[10px] flex items-center justify-center shrink-0" style={{ background: bg, color: fg }}><Icon size={18} /></span>
                <div className="min-w-0">
                    <h3 className="text-[14px] font-semibold text-[var(--text)] truncate">{p.title}</h3>
                    {p.subtitle && <p className="text-[11.5px] text-[var(--text3)] truncate">{p.subtitle}</p>}
                </div>
            </div>
            <div className={`grid gap-2 ${compact ? "grid-cols-3" : "grid-cols-2"}`}>
                {p.stats.map(st => {
                    const inner = (
                        <>
                            <span className="text-[19px] font-bold tabular-nums leading-tight" style={{ color: TONE[st.tone ?? "grey"] }}>{typeof st.value === "number" ? st.value.toLocaleString("en-IN") : st.value}</span>
                            <span className="text-[11px] text-[var(--text3)] leading-snug">{st.label}</span>
                        </>
                    )
                    const cls = "flex flex-col gap-0.5 rounded-[10px] bg-[var(--surface2)] px-2.5 py-2 min-w-0"
                    return st.href ? <Link key={st.label} href={st.href} className={`${cls} hover:ring-1 hover:ring-[var(--accent)]`}>{inner}</Link> : <div key={st.label} className={cls}>{inner}</div>
                })}
            </div>
            {!!p.list?.length && (
                <ul className="mt-3 divide-y divide-[var(--border)] border border-[var(--border)] rounded-[10px]">
                    {p.list.map((l, i) => (
                        <li key={i}><Link href={l.href ?? "#"} className="flex items-center justify-between gap-2 px-3 py-2 text-[12.5px] hover:bg-[var(--surface2)]">
                            <span className="truncate font-medium text-[var(--text)]">{l.title}</span><span className="text-[var(--text3)] shrink-0">{l.sub}</span>
                        </Link></li>
                    ))}
                </ul>
            )}
            <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-[var(--border)]">
                {p.actions.map(a => (
                    <Link key={a.label} href={a.href} className={a.primary
                        ? "h-8 px-3 rounded-[8px] bg-[var(--accent)] text-white text-[12px] font-semibold inline-flex items-center gap-1"
                        : "h-8 px-3 rounded-[8px] border border-[var(--border)] text-[12px] font-semibold text-[var(--text2)] inline-flex items-center hover:bg-[var(--surface2)]"}>
                        {a.label}{a.primary && <ArrowRight size={13} />}
                    </Link>
                ))}
            </div>
        </div>
    )
}

type Setup = { layout: { byRole: Record<string, string[]> }; catalogue: { key: string; label: string }[]; roles: { id: string; name: string }[]; eligible: Record<string, string[]> }

function LayoutModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
    const [d, setD] = useState<Setup | null>(null)
    const [byRole, setByRole] = useState<Record<string, string[]>>({})
    const [role, setRole] = useState("ADMIN")
    const [busy, setBusy] = useState(false)
    useEffect(() => { fetch("/api/dashboard/work?settings=1").then(r => r.json()).then((j: Setup) => { setD(j); setByRole(j.layout?.byRole ?? {}) }).catch(() => toast.error("Couldn't load")) }, [])
    if (!d) return null
    const eligible = d.eligible[role] ?? []
    const custom = byRole[role]
    const order = custom ?? eligible
    const label = (k: string) => d.catalogue.find(c => c.key === k)?.label ?? k
    const set = (list: string[] | undefined) => setByRole(b => { const x = { ...b }; if (list) x[role] = list; else delete x[role]; return x })
    const toggle = (k: string, on: boolean) => set(on ? [...order, k] : order.filter(x => x !== k))
    const move = (k: string, dir: -1 | 1) => { const l = [...order]; const i = l.indexOf(k), j = i + dir; if (j < 0 || j >= l.length) return; [l[i], l[j]] = [l[j], l[i]]; set(l) }
    async function save() {
        setBusy(true)
        try { const r = await fetch("/api/dashboard/work", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ byRole }) }); if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error || "Could not save"); toast.success("Home page panels saved"); onSaved() }
        catch (e: any) { toast.error(e.message) } finally { setBusy(false) }
    }
    return createPortal(
        <div className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-white rounded-[14px] w-full max-w-xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
                    <h2 className="text-[16px] font-semibold">Home page panels per role</h2>
                    <button onClick={onClose} aria-label="Close"><X size={18} /></button>
                </div>
                <div className="p-5 space-y-4">
                    <label className="block text-[12px] font-semibold text-[var(--text2)]">Role
                        <select value={role} onChange={e => setRole(e.target.value)} className="mt-1 w-full h-9 rounded-[9px] border border-[var(--border)] px-2.5 text-[13px] bg-white">
                            {d.roles.map(r => <option key={r.id} value={r.id}>{r.name}{byRole[r.id] ? " (custom)" : ""}</option>)}
                        </select>
                    </label>
                    <p className="text-[12px] text-[var(--text3)]">{custom ? "Custom list for this role." : "Not set: the role sees every panel its rights allow, in this order."} A panel only shows to people who hold its rights.</p>
                    <div className="space-y-1.5">
                        {[...order.filter(k => d.catalogue.some(c => c.key === k)), ...d.catalogue.map(c => c.key).filter(k => !order.includes(k))].map(k => {
                            const on = order.includes(k), allowed = eligible.includes(k)
                            return (
                                <div key={k} className={`flex items-center gap-2 border border-[var(--border)] rounded-[9px] px-3 py-2 ${allowed ? "" : "opacity-50"}`}>
                                    <input type="checkbox" checked={on && allowed} disabled={!allowed} onChange={e => toggle(k, e.target.checked)} />
                                    <span className="flex-1 text-[13px]">{label(k)}{!allowed && <span className="text-[11px] text-[var(--text3)]"> — role lacks the rights</span>}</span>
                                    {on && allowed && <>
                                        <button onClick={() => move(k, -1)} aria-label="Move up" className="p-1 rounded hover:bg-[var(--surface2)]"><ArrowUp size={14} /></button>
                                        <button onClick={() => move(k, 1)} aria-label="Move down" className="p-1 rounded hover:bg-[var(--surface2)]"><ArrowDown size={14} /></button>
                                    </>}
                                </div>
                            )
                        })}
                    </div>
                    <div className="flex justify-between gap-2">
                        <button onClick={() => set(undefined)} disabled={!custom} className="h-9 px-3 rounded-[9px] border border-[var(--border)] text-[12.5px] disabled:opacity-40">Reset to default</button>
                        <button onClick={save} disabled={busy} className="h-9 px-4 rounded-[9px] bg-[var(--accent)] text-white text-[13px] font-semibold inline-flex items-center gap-1.5 disabled:opacity-50">{busy && <Loader2 size={14} className="animate-spin" />}Save</button>
                    </div>
                </div>
            </div>
        </div>, document.body)
}
