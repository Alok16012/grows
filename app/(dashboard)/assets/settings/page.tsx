"use client"

// Assets → Settings. Every limit of the asset workflow, editable by asset
// managers (Manage Assets). Nothing about it is fixed in code.
import { useEffect, useState } from "react"
import Link from "next/link"
import { ArrowLeft, Loader2, Play, Save } from "lucide-react"
import { toast } from "sonner"
import { useSession } from "next-auth/react"
import { can } from "@/lib/can"
import { DEFAULT_ASSET_SETTINGS, type AssetSettings } from "@/lib/asset-settings-shared"

const card = "bg-white border border-[var(--border)] rounded-[14px] p-5"
const inp = "h-9 w-24 rounded-[9px] border border-[var(--border)] px-2.5 text-[13px] bg-white text-right"

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

export default function AssetSettingsPage() {
    const { data: session } = useSession()
    const canManage = can(session, "assets.edit")
    const [s, setS] = useState<AssetSettings>(DEFAULT_ASSET_SETTINGS)
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [running, setRunning] = useState(false)

    useEffect(() => {
        fetch("/api/assets/settings").then(r => r.ok ? r.json() : null).then(d => { if (d?.settings) setS(d.settings) }).finally(() => setLoading(false))
    }, [])

    async function save() {
        setSaving(true)
        try {
            const r = await fetch("/api/assets/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(s) })
            if (!r.ok) throw new Error((await r.text()) || "Could not save")
            setS((await r.json()).settings)
            toast.success("Asset settings saved")
        } catch (e: any) { toast.error(e.message) } finally { setSaving(false) }
    }
    async function runNow() {
        setRunning(true)
        try {
            const r = await fetch("/api/cron/asset-daily", { method: "POST" })
            const d = await r.json()
            if (!r.ok) throw new Error(d?.error || "Could not run")
            toast.success(`Reminders sent to ${d.reminded} employee(s); ${d.overdue} receipt(s) overdue; ${d.lowStock ?? 0} item(s) low on stock`)
        } catch (e: any) { toast.error(e.message) } finally { setRunning(false) }
    }

    if (loading) return <div className="p-10 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-[var(--text3)]" /></div>
    const ro = !canManage
    const setAck = (k: keyof AssetSettings["acknowledgement"], v: number) => setS(p => ({ ...p, acknowledgement: { ...p.acknowledgement, [k]: v } }))

    return (
        <div className="max-w-3xl mx-auto p-4 md:p-6 space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                    <Link href="/assets" className="inline-flex items-center gap-1 text-[12.5px] text-[var(--text3)] hover:text-[var(--text)]"><ArrowLeft className="h-3.5 w-3.5" /> Assets</Link>
                    <h1 className="text-[20px] font-bold text-[var(--text)] mt-1">Asset settings</h1>
                </div>
                {canManage && (
                    <button onClick={save} disabled={saving} className="inline-flex items-center gap-1.5 h-10 px-5 rounded-[10px] bg-[var(--accent)] text-white text-[13px] font-semibold disabled:opacity-60">
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save
                    </button>
                )}
            </div>
            {ro && <p className="text-[12.5px] text-[var(--text3)] bg-[var(--surface2)] rounded-[10px] px-3 py-2">You can view these; changing them needs the Manage Assets permission.</p>}

            <div className={card}>
                <p className="text-[14px] font-semibold text-[var(--text)]">Receipt confirmation</p>
                <p className="text-[12px] text-[var(--text3)]">Employees confirm in My Profile → Assets (or the mobile app) that they received what was issued.</p>
                <Row label="Remind the employee after" hint="Daily until they confirm. 0 = no reminders.">
                    <input disabled={ro} type="number" min={0} className={inp} value={s.acknowledgement.remindAfterDays} onChange={e => setAck("remindAfterDays", Number(e.target.value) || 0)} />
                    <span className="text-[12px] text-[var(--text3)]">days</span>
                </Row>
                <Row label="Tell the issuers after" hint="A daily count of receipts still not confirmed. 0 = never.">
                    <input disabled={ro} type="number" min={0} className={inp} value={s.acknowledgement.tellIssuersAfterDays} onChange={e => setAck("tellIssuersAfterDays", Number(e.target.value) || 0)} />
                    <span className="text-[12px] text-[var(--text3)]">days</span>
                </Row>
                <Row label="Show new joiners needing a kit for" hint="Kits & sizes → Issue kit → New joiners.">
                    <input disabled={ro} type="number" min={0} className={inp} value={s.kits.joinerWindowDays} onChange={e => setS(p => ({ ...p, kits: { joinerWindowDays: Number(e.target.value) || 0 } }))} />
                    <span className="text-[12px] text-[var(--text3)]">days</span>
                </Row>
                <Row label="Warranty-ending message" hint="Daily message to asset managers about warranties ending within this many days (Register). 0 = none.">
                    <input disabled={ro} type="number" min={0} className={inp} value={s.register.warrantyAlertDays} onChange={e => setS(p => ({ ...p, register: { warrantyAlertDays: Number(e.target.value) || 0 } }))} />
                    <span className="text-[12px] text-[var(--text3)]">days</span>
                </Row>
                <Row label="Low-stock message" hint="Daily message to issuers when a size is at or below its reorder level (Kits & sizes → Item groups).">
                    <input disabled={ro} type="checkbox" checked={s.stock.lowStockAlert} onChange={e => setS(p => ({ ...p, stock: { lowStockAlert: e.target.checked } }))} />
                </Row>
                {canManage && (
                    <button onClick={runNow} disabled={running} className="mt-2 inline-flex items-center gap-1.5 h-9 px-4 rounded-[9px] border border-[var(--border)] bg-white text-[13px] font-medium text-[var(--text2)] disabled:opacity-60">
                        {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Send reminders now
                    </button>
                )}
            </div>

            <div className={card}>
                <p className="text-[14px] font-semibold text-[var(--text)]">Recovery (lost / damaged / not returned)</p>
                <p className="text-[12px] text-[var(--text3)]">Charges are listed under Assets → Recoveries and deducted from salary or in the F&amp;F.</p>
                <Row label="Charge items at" hint="Each falls back to the other when not set. The recovery cost is set per asset in Assets → Register → Edit.">
                    <select disabled={ro} value={s.recovery.basis} onChange={e => setS(p => ({ ...p, recovery: { ...p.recovery, basis: e.target.value as AssetSettings["recovery"]["basis"] } }))} className="h-9 rounded-[9px] border border-[var(--border)] px-2.5 text-[13px] bg-white">
                        <option value="purchaseCost">Purchase cost</option>
                        <option value="recoveryCost">Recovery cost set on the asset</option>
                    </select>
                </Row>
                <Row label="Less, for every year it was with the employee" hint="0 = full value.">
                    <input disabled={ro} type="number" min={0} max={100} className={inp} value={s.recovery.depreciationPctPerYear} onChange={e => setS(p => ({ ...p, recovery: { ...p.recovery, depreciationPctPerYear: Number(e.target.value) || 0 } }))} />
                    <span className="text-[12px] text-[var(--text3)]">% / year</span>
                </Row>
                <Row label="Create a charge when an item is marked Lost / Damaged" hint="You still decide: salary, F&F, cash or waive.">
                    <input disabled={ro} type="checkbox" checked={s.recovery.autoChargeLostDamaged} onChange={e => setS(p => ({ ...p, recovery: { ...p.recovery, autoChargeLostDamaged: e.target.checked } }))} />
                </Row>
            </div>
        </div>
    )
}
