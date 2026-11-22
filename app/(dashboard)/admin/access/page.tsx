"use client"

// Admin → Access centre: who actually uses their login, login problems with
// one-click fixes, failed sign-ins and locks, and a periodic access review.
import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { Download, Loader2, Settings2, X } from "lucide-react"
import type { AccessCentreSettings } from "@/lib/access-centre"

type Tab = "activity" | "health" | "security" | "review"
const th = "text-left px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--text3)] border-b border-[var(--border)] bg-[var(--surface2)] whitespace-nowrap"
const td = "px-3 py-2 border-b border-[var(--border)] text-[12.5px] align-top"
const box = "h-9 rounded-[9px] border border-[var(--border)] px-2.5 text-[13px] bg-white"
const btn = "h-9 px-4 rounded-[9px] bg-[var(--accent)] text-white text-[13px] font-semibold disabled:opacity-50 inline-flex items-center gap-1.5"
const btn2 = "h-8 px-3 rounded-[8px] border border-[var(--border)] bg-white text-[12px] font-semibold text-[var(--text2)] inline-flex items-center gap-1 disabled:opacity-50"
const ago = (s: string | null) => { if (!s) return "never"; const d = Math.floor((Date.now() - new Date(s).getTime()) / 86_400_000); return d <= 0 ? "today" : d === 1 ? "yesterday" : `${d} days ago` }
const when = (s: string | null) => s ? new Date(s).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—"

async function post(body: any) {
    const r = await fetch("/api/admin/access", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(j?.error || "Could not save")
    return j
}

function Card({ label, value, sub, warn, onClick, active }: { label: string; value: number | string; sub?: string; warn?: boolean; onClick?: () => void; active?: boolean }) {
    return (
        <button onClick={onClick} disabled={!onClick} className={`text-left bg-white border rounded-[12px] p-3 ${active ? "border-[var(--accent)]" : "border-[var(--border)]"} ${onClick ? "hover:border-[var(--accent)]" : "cursor-default"}`}>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text3)]">{label}</p>
            <p className={`text-[22px] font-bold tabular-nums ${warn ? "text-red-600" : "text-[var(--text)]"}`}>{value}</p>
            {sub && <p className="text-[11px] text-[var(--text3)]">{sub}</p>}
        </button>
    )
}

export default function AccessCentrePage() {
    const [tab, setTab] = useState<Tab>("activity")
    const [d, setD] = useState<any>(null)
    const [settingsOpen, setSettingsOpen] = useState(false)
    useEffect(() => { const t = new URLSearchParams(window.location.search).get("tab"); if (t && ["activity", "health", "security", "review"].includes(t)) setTab(t as Tab) }, [])
    const load = useCallback(() => { setD(null); fetch(`/api/admin/access?tab=${tab}`).then(r => r.json()).then(setD).catch(() => toast.error("Couldn't load")) }, [tab])
    useEffect(() => { load() }, [load])
    return (
        <div className="max-w-[1300px] mx-auto p-4 md:p-6 space-y-4">
            <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                    <h1 className="text-[22px] font-bold text-[var(--text)]">Access centre</h1>
                    <p className="text-[12.5px] text-[var(--text3)]">Who uses their login, what needs fixing, who is being locked out, and who holds which access.</p>
                </div>
                {d?.canManage && <button onClick={() => setSettingsOpen(true)} className="h-10 px-4 rounded-[10px] border border-[var(--border)] bg-white text-[13px] font-semibold text-[var(--text2)] inline-flex items-center gap-1.5"><Settings2 size={15} /> Settings</button>}
            </div>
            <div className="flex gap-1 border-b border-[var(--border)] overflow-x-auto">
                {([["activity", "Activity"], ["health", "Login health"], ["security", "Security"], ["review", "Access review"]] as const).map(([k, l]) => (
                    <button key={k} onClick={() => setTab(k)} className={`px-3 py-2 text-[13px] font-semibold border-b-2 -mb-px whitespace-nowrap ${tab === k ? "border-[var(--accent)] text-[var(--accent)]" : "border-transparent text-[var(--text3)]"}`}>{l}</button>
                ))}
            </div>
            {!d ? <div className="p-10 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-[var(--text3)]" /></div>
                : tab === "activity" ? <Activity d={d} />
                    : tab === "health" ? <Health d={d} reload={load} />
                        : tab === "security" ? <Security d={d} reload={load} />
                            : <Review d={d} reload={load} />}
            {settingsOpen && d && <SettingsModal s={d.settings} roles={d.roles} onClose={() => setSettingsOpen(false)} onSaved={() => { setSettingsOpen(false); load() }} />}
        </div>
    )
}

function Activity({ d }: { d: any }) {
    const [f, setF] = useState<string>(""), [q, setQ] = useState(""), [role, setRole] = useState("")
    const s = d.summary
    const rows = useMemo(() => (d.rows as any[]).filter(r =>
        (!f || (f === "never" ? r.neverSeen : f === "7" ? !r.neverSeen && r.idleDays < 7 : f === "30" ? !r.neverSeen && r.idleDays >= 7 && r.idleDays < 30 : f === "90" ? !r.neverSeen && r.idleDays >= 30 && r.idleDays < 90 : f === "90+" ? !r.neverSeen && r.idleDays >= 90 : true))
        && (!role || r.role === role) && (!q.trim() || `${r.name} ${r.loginId} ${r.code ?? ""}`.toLowerCase().includes(q.trim().toLowerCase()))), [d.rows, f, q, role])
    const roles = Array.from(new Set((d.rows as any[]).map(r => r.role))).sort()
    async function exportXlsx() {
        const mod: any = await import("exceljs"); const ExcelJS = mod.default ?? mod
        const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet("Login activity")
        ws.columns = [{ header: "Name", key: "n", width: 26 }, { header: "Login id", key: "l", width: 28 }, { header: "Emp Code", key: "c", width: 16 }, { header: "Role", key: "r", width: 18 }, { header: "Site", key: "s", width: 20 }, { header: "Last used", key: "u", width: 18 }, { header: "Via", key: "v", width: 8 }, { header: "Idle days", key: "i", width: 10 }]
        for (const r of rows) ws.addRow({ n: r.name, l: r.loginId, c: r.code ?? "", r: r.role, s: r.site ?? "", u: r.lastSeen ? r.lastSeen.slice(0, 10) : "never", v: r.via ?? "", i: r.idleDays })
        ws.getRow(1).font = { bold: true }
        const buf = await wb.xlsx.writeBuffer(); const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([buf])); a.download = `Login_Activity_${new Date().toISOString().slice(0, 10)}.xlsx`; a.click()
    }
    return (
        <div className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
                <Card label="Used this week" value={s.last7} onClick={() => setF(f === "7" ? "" : "7")} active={f === "7"} />
                <Card label="7–30 days ago" value={s.d7to30} onClick={() => setF(f === "30" ? "" : "30")} active={f === "30"} />
                <Card label="30–90 days ago" value={s.d30to90} onClick={() => setF(f === "90" ? "" : "90")} active={f === "90"} />
                <Card label="Over 90 days" value={s.over90} warn={s.over90 > 0} onClick={() => setF(f === "90+" ? "" : "90+")} active={f === "90+"} />
                <Card label="Not used yet" value={s.neverSeen} sub={`since ${d.trackingSince}`} onClick={() => setF(f === "never" ? "" : "never")} active={f === "never"} />
                <Card label="Active logins" value={s.logins} sub={`app ${s.app} · web ${s.web}`} />
            </div>
            <p className="text-[12px] text-[var(--text3)]">Every page or app request now records “last used” (at most every 5 minutes per person), so these numbers fill in over the coming days. {d.settings.idleDisableDays ? `Logins idle ${d.settings.idleDisableDays}+ days are disabled automatically (not Admins or exempt roles).` : "Idle logins are not disabled automatically (Settings)."}</p>
            <div className="flex flex-wrap items-center gap-2">
                <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search name, login or code" className={`${box} min-w-[200px]`} />
                <select value={role} onChange={e => setRole(e.target.value)} className={box} aria-label="Role"><option value="">All roles</option>{roles.map(r => <option key={r}>{r}</option>)}</select>
                <button onClick={exportXlsx} className={btn2}><Download size={13} /> Excel</button>
                <span className="text-[12px] text-[var(--text3)]">{rows.length} login(s)</span>
            </div>
            <div className="bg-white border border-[var(--border)] rounded-[12px] overflow-x-auto">
                <table className="w-full min-w-[820px]">
                    <thead><tr><th className={th}>Login</th><th className={th}>Role</th><th className={th}>Site</th><th className={th}>Last used</th><th className={th}>Via</th></tr></thead>
                    <tbody>{rows.slice(0, 500).map(r => (
                        <tr key={r.userId}>
                            <td className={td}><Link href={`/admin/users/${r.userId}`} className="font-semibold hover:text-[var(--accent)]">{r.name}</Link><span className="block text-[11px] text-[var(--text3)]">{r.loginId}{r.code ? ` · ${r.code}` : ""}</span></td>
                            <td className={td}>{r.role}</td>
                            <td className={`${td} text-[var(--text2)]`}>{r.site ?? "—"}</td>
                            <td className={td}><span className={r.idleDays >= 90 ? "text-red-600 font-semibold" : ""}>{ago(r.lastSeen)}</span></td>
                            <td className={td}>{r.via ?? "—"}</td>
                        </tr>
                    ))}</tbody>
                </table>
                {rows.length > 500 && <p className="p-3 text-[12px] text-[var(--text3)]">Showing 500 of {rows.length} — filter or use Excel.</p>}
            </div>
        </div>
    )
}

const HEALTH_LABEL: Record<string, string> = { NO_LOGIN: "No login", DISABLED: "Employed but disabled", NO_ROLE: "No role", PHONE: "Phone mismatch", NO_ACCESS: "Login settings missing", ORPHAN: "No employee behind it", SHARED_PHONE: "Shared phone" }
const FIX_LABEL: Record<string, string> = { createLogin: "Create login", enable: "Enable", autoRole: "Give designation's role", syncPhone: "Use employee's phone", addAccess: "Add OTP sign-in" }

function Health({ d, reload }: { d: any; reload: () => void }) {
    const [kind, setKind] = useState("")
    const [busy, setBusy] = useState(false)
    const issues = (d.issues as any[]).filter(i => !kind || i.kind === kind)
    async function fix(list: any[]) {
        const items = list.filter(i => i.fix).map(i => ({ kind: i.fix, employeeId: i.employeeId, userId: i.userId }))
        if (!items.length) return
        if (items.length > 1 && !confirm(`Apply "${FIX_LABEL[items[0].kind] ?? "fix"}" to ${items.length} login(s)?`)) return
        setBusy(true)
        try { const j = await post({ action: "fix", items }); toast.success(`${j.done} fixed`); if (j.errors?.length) toast.error(j.errors.join(" · ")); reload() }
        catch (e: any) { toast.error(e.message) } finally { setBusy(false) }
    }
    const fixable = issues.filter(i => i.fix)
    const sameFix = fixable.length > 0 && fixable.every(i => i.fix === fixable[0].fix)
    return (
        <div className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-2">
                {Object.keys(HEALTH_LABEL).map(k => <Card key={k} label={HEALTH_LABEL[k]} value={d.counts[k] ?? 0} warn={(d.counts[k] ?? 0) > 0 && ["DISABLED", "NO_ROLE", "ORPHAN", "SHARED_PHONE"].includes(k)} onClick={() => setKind(kind === k ? "" : k)} active={kind === k} />)}
            </div>
            {d.canManage && kind && sameFix && <button onClick={() => fix(fixable)} disabled={busy} className={btn}>{busy && <Loader2 size={14} className="animate-spin" />}{FIX_LABEL[fixable[0].fix]} — all {fixable.length}</button>}
            {!issues.length ? <p className="text-[13px] text-[var(--text3)] bg-white border border-[var(--border)] rounded-[12px] p-6 text-center">No login problems{kind ? " of this kind" : ""}.</p> : (
                <div className="bg-white border border-[var(--border)] rounded-[12px] overflow-x-auto">
                    <table className="w-full min-w-[760px]">
                        <thead><tr><th className={th}>Person</th><th className={th}>Problem</th><th className={th}>Detail</th><th className={th}></th></tr></thead>
                        <tbody>{issues.slice(0, 500).map((i, k) => (
                            <tr key={k}>
                                <td className={td}><b>{i.name}</b>{i.code && <span className="block text-[11px] text-[var(--text3)]">{i.code}</span>}</td>
                                <td className={td}>{i.label}</td>
                                <td className={`${td} text-[var(--text2)]`}>{i.detail}</td>
                                <td className={`${td} text-right whitespace-nowrap`}>
                                    {d.canManage && i.fix && <button onClick={() => fix([i])} disabled={busy} className={btn2}>{FIX_LABEL[i.fix]}</button>}
                                    {i.userId && <Link href={`/admin/users/${i.userId}`} className="ml-2 text-[12px] text-[var(--accent)]">Open</Link>}
                                </td>
                            </tr>
                        ))}</tbody>
                    </table>
                </div>
            )}
        </div>
    )
}

function Security({ d, reload }: { d: any; reload: () => void }) {
    const [q, setQ] = useState("")
    const [found, setFound] = useState<{ id: string; name: string; email: string }[]>([])
    useEffect(() => {
        if (q.trim().length < 2) { setFound([]); return }
        const t = setTimeout(() => fetch(`/api/admin/users?${new URLSearchParams({ q, page: "1" })}`).then(r => r.json()).then(j => setFound((j.rows ?? j.users ?? []).slice(0, 8).map((u: any) => ({ id: u.id, name: u.name, email: u.email })))).catch(() => {}), 300)
        return () => clearTimeout(t)
    }, [q])
    async function act(action: string, userId: string, label: string) {
        if (!confirm(label)) return
        try { await post({ action, userId }); toast.success("Done"); reload() } catch (e: any) { toast.error(e.message) }
    }
    const s = d.summary
    const Groups = ({ title, rows }: { title: string; rows: any[] }) => (
        <div className="bg-white border border-[var(--border)] rounded-[12px] overflow-x-auto">
            <p className="px-3 pt-3 text-[13px] font-semibold">{title}</p>
            <table className="w-full min-w-[520px]">
                <thead><tr><th className={th}>Who</th><th className={th}>Last 24 h</th><th className={th}>30 days</th><th className={th}>Why</th><th className={th}>Last</th></tr></thead>
                <tbody>{rows.length ? rows.slice(0, 15).map(r => (
                    <tr key={r.key}><td className={`${td} font-mono text-[12px]`}>{r.key}</td><td className={`${td} ${r.n1 >= d.settings.alertAfterFailures && d.settings.alertAfterFailures ? "text-red-600 font-bold" : ""}`}>{r.n1}</td><td className={td}>{r.n30}</td><td className={`${td} text-[11.5px] text-[var(--text2)]`}>{Object.entries(r.reasons).map(([k, v]) => `${k.toLowerCase().replace(/_/g, " ")} ${v}`).join(", ")}</td><td className={td}>{when(r.last)}</td></tr>
                )) : <tr><td colSpan={5} className={`${td} text-center text-[var(--text3)]`}>None</td></tr>}</tbody>
            </table>
        </div>
    )
    return (
        <div className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <Card label="Failed sign-ins (24 h)" value={s.failed24h} warn={s.failed24h > 0} />
                <Card label="Failed (30 days)" value={s.failed30} sub={`${s.ok30} successful`} />
                <Card label="Locked now" value={s.lockedNow} warn={s.lockedNow > 0} />
                <Card label="Lock rule" value={`${d.settings.lockAfterFailures} tries`} sub={`locked ${d.settings.lockMinutes} min`} />
            </div>
            {d.locks.length > 0 && (
                <div className="bg-white border border-[var(--border)] rounded-[12px] p-3 space-y-1">
                    <p className="text-[13px] font-semibold">Locked logins</p>
                    {d.locks.map((l: any) => <div key={l.userId} className="flex justify-between items-center text-[12.5px]"><span><b>{l.name}</b> <span className="text-[var(--text3)]">{l.loginId} · until {when(l.until)}</span></span>{d.canManage && <button className={btn2} onClick={() => act("unlock", l.userId, `Unlock ${l.name} now?`)}>Unlock</button>}</div>)}
                </div>
            )}
            {d.canManage && (
                <div className="bg-white border border-[var(--border)] rounded-[12px] p-3 space-y-2">
                    <p className="text-[13px] font-semibold">Sign a login out of every device</p>
                    <p className="text-[12px] text-[var(--text3)]">For a lost phone or a shared password: every open session (web and app) ends on its next request. The person can sign in again.</p>
                    <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search name or login id" className={`${box} w-full max-w-md`} />
                    {found.map(u => <div key={u.id} className="flex justify-between items-center text-[12.5px] max-w-md"><span><b>{u.name}</b> <span className="text-[var(--text3)]">{u.email}</span></span><button className={btn2} onClick={() => act("signout", u.id, `Sign ${u.name} out of every device?`)}>Sign out everywhere</button></div>)}
                </div>
            )}
            <div className="grid lg:grid-cols-2 gap-3"><Groups title="By login id" rows={d.byLogin} /><Groups title="By IP address" rows={d.byIp} /></div>
        </div>
    )
}

function Review({ d, reload }: { d: any; reload: () => void }) {
    const [note, setNote] = useState("")
    const [busy, setBusy] = useState(false)
    async function signOff() {
        if (!confirm("Sign off that you have checked who holds which role and site access?")) return
        setBusy(true)
        try { await post({ action: "review", note }); toast.success("Access review signed off"); setNote(""); reload() } catch (e: any) { toast.error(e.message) } finally { setBusy(false) }
    }
    const overdue = d.nextDue && new Date(d.nextDue) <= new Date()
    return (
        <div className="space-y-3">
            <div className={`rounded-[12px] border p-3 text-[13px] ${overdue ? "bg-amber-50 border-amber-200" : "bg-white border-[var(--border)]"}`}>
                {d.reviews.length ? <>Last reviewed <b>{when(d.reviews[0].at)}</b> by <b>{d.reviews[0].by}</b>{d.reviews[0].note ? ` — “${d.reviews[0].note}”` : ""}.</> : <>Access has not been reviewed yet.</>}
                {d.reviewEveryDays > 0 && <> Next review {overdue ? <b className="text-amber-800">is due now</b> : <>due {when(d.nextDue)}</>} (every {d.reviewEveryDays} days).</>}
            </div>
            <div className="bg-white border border-[var(--border)] rounded-[12px] p-3">
                <p className="text-[13px] font-semibold mb-1">Admins ({d.admins.length}) — full access to everything</p>
                <div className="flex flex-wrap gap-2">{d.admins.map((a: any) => <Link key={a.id} href={`/admin/users/${a.id}`} className="px-2 py-1 rounded-full bg-red-50 text-red-700 text-[12px] font-semibold">{a.name} <span className="font-normal">{a.email}</span></Link>)}</div>
            </div>
            <div className="bg-white border border-[var(--border)] rounded-[12px] overflow-x-auto">
                <table className="w-full min-w-[760px]">
                    <thead><tr><th className={th}>Role</th><th className={th}>People</th><th className={th}>Permissions</th><th className={th}>Powerful permissions</th><th className={th}>Limited to sites</th><th className={th}></th></tr></thead>
                    <tbody>{d.roles.map((r: any) => (
                        <tr key={r.id} className={r.isActive ? "" : "opacity-60"}>
                            <td className={td}><b>{r.name}</b>{!r.isActive && <span className="ml-1 text-[11px] text-[var(--text3)]">(off)</span>}</td>
                            <td className={`${td} tabular-nums`}>{r.holders}</td>
                            <td className={`${td} tabular-nums`}>{r.permissions}</td>
                            <td className={`${td} text-[11.5px] ${r.power.length ? "text-red-700" : "text-[var(--text3)]"}`}>{r.power.length ? r.power.join(", ") : "—"}</td>
                            <td className={`${td} tabular-nums`}>{r.siteLimited} of {r.holders}</td>
                            <td className={`${td} text-right whitespace-nowrap`}><Link href={`/admin/users?role=${r.id}`} className="text-[12px] text-[var(--accent)]">People</Link> · <Link href={`/admin/roles/${r.id}`} className="text-[12px] text-[var(--accent)]">Role</Link></td>
                        </tr>
                    ))}</tbody>
                </table>
            </div>
            {d.canManage && (
                <div className="bg-white border border-[var(--border)] rounded-[12px] p-3 flex flex-wrap items-center gap-2">
                    <input value={note} onChange={e => setNote(e.target.value)} placeholder="Note (optional), e.g. removed 3 old HR logins" className={`${box} flex-1 min-w-[240px]`} />
                    <button onClick={signOff} disabled={busy} className={btn}>{busy && <Loader2 size={14} className="animate-spin" />}I have reviewed access — sign off</button>
                </div>
            )}
            {d.reviews.length > 1 && <div className="text-[12px] text-[var(--text3)]">Earlier: {d.reviews.slice(1).map((r: any) => `${when(r.at)} by ${r.by}`).join(" · ")}</div>}
        </div>
    )
}

function SettingsModal({ s: initial, roles, onClose, onSaved }: { s: AccessCentreSettings; roles: { id: string; name: string }[]; onClose: () => void; onSaved: () => void }) {
    const [s, setS] = useState(initial)
    const [busy, setBusy] = useState(false)
    useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }; document.addEventListener("keydown", k); return () => document.removeEventListener("keydown", k) }, [onClose])
    async function save() {
        setBusy(true)
        try { const r = await fetch("/api/admin/access", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(s) }); if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error || "Could not save"); toast.success("Settings saved"); onSaved() }
        catch (e: any) { toast.error(e.message) } finally { setBusy(false) }
    }
    const num = (k: keyof AccessCentreSettings, label: string, suffix: string) => <label className="flex items-center gap-2 text-[13px]">{label}<input type="number" min={0} value={s[k] as number} onChange={e => setS(x => ({ ...x, [k]: Number(e.target.value) }))} className={`${box} w-24`} />{suffix}</label>
    return (
        <div onMouseDown={e => { if (e.target === e.currentTarget) onClose() }} className="fixed inset-0 z-[1000] bg-black/40 flex items-center justify-center p-4">
            <div role="dialog" aria-modal="true" aria-label="Access centre settings" className="w-full max-w-lg max-h-[92vh] overflow-y-auto bg-white rounded-[14px] border border-[var(--border)] shadow-xl">
                <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-[var(--border)]"><h3 className="text-[15px] font-semibold">Access centre settings</h3><button onClick={onClose} aria-label="Close" className="p-1 text-[var(--text3)]"><X size={18} /></button></div>
                <div className="p-5 space-y-3">
                    {num("idleDisableDays", "Disable logins not used for", "days (0 = never)")}
                    <div className="text-[13px]"><p className="mb-1">Never disable these roles for being idle (Admins are never disabled):</p><div className="flex flex-wrap gap-x-4 gap-y-1">{roles.map(r => <label key={r.id} className="flex items-center gap-1.5 text-[12.5px]"><input type="checkbox" checked={s.idleExemptRoleIds.includes(r.id)} onChange={e => setS(x => ({ ...x, idleExemptRoleIds: e.target.checked ? [...x.idleExemptRoleIds, r.id] : x.idleExemptRoleIds.filter(y => y !== r.id) }))} /> {r.name}</label>)}</div></div>
                    {num("lockAfterFailures", "Lock a login after", "wrong attempts")}
                    {num("lockMinutes", "Keep it locked for", "minutes")}
                    {num("alertAfterFailures", "Tell Admins when a login or IP fails", "times in a day (0 = off)")}
                    {num("reviewEveryDays", "Ask for an access review every", "days (0 = off)")}
                    <div className="flex justify-end gap-2"><button onClick={onClose} className={btn2}>Cancel</button><button onClick={save} disabled={busy} className={btn}>{busy && <Loader2 size={14} className="animate-spin" />}Save</button></div>
                </div>
            </div>
        </div>
    )
}
