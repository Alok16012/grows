"use client"
// KPI Designer — one template: KRA cards with their KPI tables.
import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Plus, Pencil, Trash2, X, CheckCircle2, Copy, Loader2, Lock, Target } from "lucide-react"
import { HubShell, useHubPerms } from "../../_components/HubNav"
import { KpiModal, type SystemMetric } from "../../_components/KpiModal"
import {
    api, useHub, Card, CardHead, Loading, Empty, Pill, Modal, Label, inputCls,
    TEMPLATE_STATUS, SOURCE_TONE, FREQ_LABEL, KRA_COLORS, btnPrimary, btnGhost, btnSmall, btnSmallAccent, btnIcon, thCls, tdCls, fmtNum,
    type Template, type KRA, type KPI, type Register,
} from "../../_components/shared"

export default function TemplateEditorPage({ params }: { params: { id: string } }) {
    const router = useRouter()
    const { status, canManage } = useHubPerms()
    const { missing, fail } = useHub()
    const [tpl, setTpl] = useState<Template | null>(null)
    const [loading, setLoading] = useState(true)
    const [registers, setRegisters] = useState<Register[]>([])
    const [metrics, setMetrics] = useState<SystemMetric[]>([])
    const [busy, setBusy] = useState<string | null>(null)
    const [kpiEdit, setKpiEdit] = useState<{ kraId: string; kpi: KPI | null } | null>(null)
    const [kraEdit, setKraEdit] = useState<KRA | "new" | null>(null)
    const [detailsOpen, setDetailsOpen] = useState(false)

    const load = useCallback(async () => {
        try { setTpl((await api<{ template: Template }>(`/templates/${params.id}`)).template) }
        catch (e) { fail(e, "Could not load template") }
        finally { setLoading(false) }
    }, [params.id, fail])

    useEffect(() => {
        if (status !== "authenticated") return
        load()
        api<{ registers: Register[] }>("/registers").then(d => setRegisters(d.registers ?? [])).catch(() => { })
        api<{ metrics: SystemMetric[] }>("/system-metrics").then(d => setMetrics(d.metrics ?? [])).catch(() => { })
    }, [status, load])

    const editable = tpl?.status === "DRAFT" && canManage
    const kras = useMemo(() => [...(tpl?.kras ?? [])].sort((a, b) => a.sortOrder - b.sortOrder), [tpl])
    const kraPts = (k: KRA) => k.kpis.reduce((s, p) => s + (Number(p.weightage) || 0), 0)
    // Server rule (publish): KRA weights total 100, and each KRA's KPI weightages add up to its weight.
    const near = (a: number, b: number) => Math.abs(a - b) < 0.01
    const total = kras.reduce((s, k) => s + (Number(k.weight) || 0), 0)
    const totalOk = near(total, 100)
    const kraMismatch = kras.filter(k => !near(kraPts(k), Number(k.weight) || 0))
    const publishable = totalOk && kras.length > 0 && kraMismatch.length === 0 && kras.every(k => k.kpis.length > 0)

    async function publish() {
        if (!tpl) return
        if (!confirm("Publish this template? It becomes read-only and can be assigned to people.")) return
        setBusy("publish")
        try { await api(`/templates/${tpl.id}/publish`, { method: "POST", body: {} }); toast.success("Template published"); load() }
        catch (e) { fail(e) } finally { setBusy(null) }
    }

    async function newVersion() {
        if (!tpl) return
        setBusy("version")
        try {
            const d = await api<{ template?: { id: string } }>(`/templates/${tpl.id}/new-version`, { method: "POST", body: {} })
            toast.success("New draft version created")
            if (d?.template?.id) router.push(`/performance/hub/designer/${d.template.id}`)
        } catch (e) { fail(e) } finally { setBusy(null) }
    }

    async function deleteKra(k: KRA) {
        if (!confirm(`Delete KRA "${k.title}" and its ${k.kpis.length} KPI(s)?`)) return
        try { await api(`/kras/${k.id}`, { method: "DELETE" }); toast.success("KRA deleted"); load() } catch (e) { fail(e) }
    }

    async function deleteKpi(p: KPI) {
        if (!confirm(`Delete KPI "${p.name}"?`)) return
        try { await api(`/kpis/${p.id}`, { method: "DELETE" }); toast.success("KPI deleted"); load() } catch (e) { fail(e) }
    }

    const back = { href: "/performance/hub/designer", label: "All templates" }

    if (loading) return <HubShell title="KPI Designer" back={back} missing={missing}><Card><Loading /></Card></HubShell>
    if (!tpl) return <HubShell title="KPI Designer" back={back} missing={missing}><Card><Empty icon={<Target size={40} />} title="Template not found" /></Card></HubShell>

    return (
        <HubShell
            back={back}
            missing={missing}
            title={<span className="flex items-center gap-2.5 flex-wrap">{tpl.name}<Pill tone={TEMPLATE_STATUS[tpl.status]} /></span>}
            subtitle={<span>{tpl.roleLabel || "No role set"} · <span className="font-mono">v{tpl.version}</span></span>}
            actions={canManage ? <>
                {editable && <button className={btnGhost} onClick={() => setDetailsOpen(true)}><Pencil size={14} /> Edit details</button>}
                {tpl.status === "DRAFT" && (
                    <button className={btnPrimary} onClick={publish} disabled={!!busy || !publishable} title={publishable ? "" : "Fix the weights first"}>
                        {busy === "publish" ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={15} />} Publish
                    </button>
                )}
                {tpl.status === "PUBLISHED" && (
                    <button className={btnPrimary} onClick={newVersion} disabled={!!busy}>
                        {busy === "version" ? <Loader2 size={14} className="animate-spin" /> : <Copy size={14} />} New version
                    </button>
                )}
            </> : undefined}
        >
            {/* Weight bar */}
            <Card className="mb-4 p-4">
                <div className="flex items-center justify-between gap-3 mb-2">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.5px] text-[var(--text3)]">Weight</span>
                    <span className="font-mono text-[13px] font-bold" style={{ color: totalOk ? "var(--success)" : "var(--amber)" }}>{fmtNum(total)} / 100</span>
                </div>
                <div className="h-2.5 rounded-full bg-[var(--surface2)] overflow-hidden flex">
                    {kras.map((k, i) => {
                        const w = Number(k.weight) || 0
                        return w > 0 ? <div key={k.id} title={`${k.title}: ${fmtNum(w)}`} style={{ width: `${Math.min(100, w)}%`, background: KRA_COLORS[i % KRA_COLORS.length] }} /> : null
                    })}
                </div>
                {kras.length > 0 && (
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2.5">
                        {kras.map((k, i) => (
                            <span key={k.id} className="inline-flex items-center gap-1.5 text-[11.5px] text-[var(--text2)]">
                                <span className="w-2.5 h-2.5 rounded-sm" style={{ background: KRA_COLORS[i % KRA_COLORS.length] }} />
                                {k.title} <span className="font-mono text-[var(--text3)]">{fmtNum(k.weight)}</span>
                            </span>
                        ))}
                    </div>
                )}
                {!totalOk && kras.length > 0 && <p className="text-[11.5px] text-[var(--amber)] mt-2">KRA weights must add up to 100 before you can publish.</p>}
                {kraMismatch.map(k => (
                    <p key={k.id} className="text-[11.5px] text-[var(--amber)] mt-1">KPI weightages in “{k.title}” total {fmtNum(kraPts(k))} — must equal the KRA weight {fmtNum(k.weight)}.</p>
                ))}
            </Card>

            {tpl.status !== "DRAFT" && (
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--border)] bg-[var(--accent-light)] px-4 py-3 text-[13px] text-[var(--accent-text)]">
                    <span className="flex items-center gap-2"><Lock size={14} /> This version is {tpl.status.toLowerCase()} and read-only. Create a new version to make changes.</span>
                    {canManage && tpl.status === "PUBLISHED" && (
                        <button className={btnSmallAccent} onClick={newVersion} disabled={!!busy}><Copy size={12} /> New version</button>
                    )}
                </div>
            )}

            <div className="space-y-4">
                {kras.length === 0 && (
                    <Card><Empty icon={<Target size={40} />} title="No KRAs yet" sub="A KRA (key result area) groups the KPIs that measure it." /></Card>
                )}
                {kras.map((k, i) => {
                    const kpis = [...k.kpis].sort((a, b) => a.sortOrder - b.sortOrder)
                    return (
                        <Card key={k.id}>
                            <CardHead
                                accent={KRA_COLORS[i % KRA_COLORS.length]}
                                title={k.title}
                                sub={<span>Weight <span className="font-mono">{fmtNum(k.weight)}</span> · KPI pts <span className="font-mono font-semibold" style={{ color: Math.abs(kraPts(k) - (Number(k.weight) || 0)) < 0.01 ? "var(--success)" : "var(--amber)" }}>{fmtNum(kraPts(k))} / {fmtNum(k.weight)}</span> · {kpis.length} KPI{kpis.length === 1 ? "" : "s"}</span>}
                                right={editable ? <>
                                    <button className={btnSmall} onClick={() => setKraEdit(k)}><Pencil size={12} /> Rename</button>
                                    <button className={`${btnSmall} hover:!text-red-600 hover:!border-red-300`} onClick={() => deleteKra(k)}><Trash2 size={12} /> Delete</button>
                                    <button className={btnSmallAccent} onClick={() => setKpiEdit({ kraId: k.id, kpi: null })}><Plus size={12} /> KPI</button>
                                </> : undefined}
                            />
                            {kpis.length === 0 ? (
                                <p className="px-4 py-5 text-[12.5px] text-[var(--text3)]">No KPIs in this KRA yet.</p>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-[13px]">
                                        <thead>
                                            <tr>
                                                <th className={thCls}>KPI</th>
                                                <th className={thCls}>Code</th>
                                                <th className={thCls}>Freq</th>
                                                <th className={thCls}>Target</th>
                                                <th className={`${thCls} text-right`}>Weight</th>
                                                <th className={thCls}>Source</th>
                                                {editable && <th className={`${thCls} w-[90px]`} />}
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-[var(--border)]">
                                            {kpis.map(p => (
                                                <tr key={p.id} className="hover:bg-[var(--surface2)]/60">
                                                    <td className={tdCls}>
                                                        <p className="font-medium text-[var(--text)]">{p.name}</p>
                                                        {p.measurable && <p className="text-[11.5px] text-[var(--text3)]">{p.measurable}</p>}
                                                    </td>
                                                    <td className={`${tdCls} font-mono text-[12px] text-[var(--text2)]`}>{p.code || "—"}</td>
                                                    <td className={`${tdCls} text-[12px]`}>{FREQ_LABEL[p.frequency]}</td>
                                                    <td className={`${tdCls} font-mono text-[12px]`}>{p.targetLabel || fmtNum(Number(p.target))}</td>
                                                    <td className={`${tdCls} text-right font-mono font-semibold`}>{fmtNum(p.weightage)}</td>
                                                    <td className={tdCls}><Pill tone={SOURCE_TONE[p.sourceType]} /></td>
                                                    {editable && (
                                                        <td className={`${tdCls} text-right whitespace-nowrap`}>
                                                            <button className={btnSmall} onClick={() => setKpiEdit({ kraId: k.id, kpi: p })}>Edit</button>
                                                            <button className={`${btnIcon} ml-1 hover:!text-red-600`} aria-label="Delete KPI" onClick={() => deleteKpi(p)}><X size={14} /></button>
                                                        </td>
                                                    )}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </Card>
                    )
                })}
                {editable && (
                    <button onClick={() => setKraEdit("new")}
                        className="w-full rounded-2xl border-2 border-dashed border-[var(--border2)] py-4 text-[13px] font-semibold text-[var(--text2)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors inline-flex items-center justify-center gap-2">
                        <Plus size={15} /> Add KRA
                    </button>
                )}
            </div>

            {kpiEdit && (
                <KpiModal kraId={kpiEdit.kraId} kpi={kpiEdit.kpi} registers={registers} metrics={metrics} fail={fail}
                    onClose={() => setKpiEdit(null)} onSaved={() => { setKpiEdit(null); load() }} />
            )}
            {kraEdit && (
                <KraModal templateId={tpl.id} kra={kraEdit === "new" ? null : kraEdit} fail={fail}
                    onClose={() => setKraEdit(null)} onSaved={() => { setKraEdit(null); load() }} />
            )}
            {detailsOpen && (
                <DetailsModal tpl={tpl} fail={fail} onClose={() => setDetailsOpen(false)} onSaved={() => { setDetailsOpen(false); load() }} />
            )}
        </HubShell>
    )
}

function KraModal({ templateId, kra, onClose, onSaved, fail }: {
    templateId: string; kra: KRA | null; onClose: () => void; onSaved: () => void; fail: (e: unknown) => void
}) {
    const [title, setTitle] = useState(kra?.title ?? "")
    const [weight, setWeight] = useState(String(kra?.weight ?? 0))
    const [saving, setSaving] = useState(false)
    async function save() {
        if (!title.trim()) { toast.error("KRA title is required"); return }
        setSaving(true)
        try {
            const body = { title: title.trim(), weight: Number(weight) || 0 }
            if (kra) await api(`/kras/${kra.id}`, { method: "PUT", body })
            else await api(`/templates/${templateId}/kras`, { method: "POST", body })
            toast.success(kra ? "KRA updated" : "KRA added")
            onSaved()
        } catch (e) { fail(e) } finally { setSaving(false) }
    }
    return (
        <Modal title={kra ? "Rename KRA" : "Add KRA"} onClose={onClose}
            footer={<>
                <button className={btnGhost} onClick={onClose}>Cancel</button>
                <button className={btnPrimary} onClick={save} disabled={saving}>{saving && <Loader2 size={14} className="animate-spin" />} Save</button>
            </>}>
            <div className="p-5 grid grid-cols-1 sm:grid-cols-[1fr_120px] gap-4">
                <div>
                    <Label>KRA title *</Label>
                    <input className={inputCls()} value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Manpower & attendance" autoFocus />
                </div>
                <div>
                    <Label hint="Points of 100">Weight</Label>
                    <input className={inputCls("font-mono")} inputMode="decimal" value={weight} onChange={e => setWeight(e.target.value)} />
                </div>
            </div>
        </Modal>
    )
}

function DetailsModal({ tpl, onClose, onSaved, fail }: { tpl: Template; onClose: () => void; onSaved: () => void; fail: (e: unknown) => void }) {
    const [name, setName] = useState(tpl.name)
    const [roleLabel, setRoleLabel] = useState(tpl.roleLabel ?? "")
    const [saving, setSaving] = useState(false)
    async function save() {
        if (!name.trim()) { toast.error("Template name is required"); return }
        setSaving(true)
        try {
            await api(`/templates/${tpl.id}`, { method: "PUT", body: { name: name.trim(), roleLabel: roleLabel.trim() || null } })
            toast.success("Template updated")
            onSaved()
        } catch (e) { fail(e) } finally { setSaving(false) }
    }
    return (
        <Modal title="Template details" onClose={onClose}
            footer={<>
                <button className={btnGhost} onClick={onClose}>Cancel</button>
                <button className={btnPrimary} onClick={save} disabled={saving}>{saving && <Loader2 size={14} className="animate-spin" />} Save</button>
            </>}>
            <div className="p-5 space-y-4">
                <div><Label>Template name *</Label><input className={inputCls()} value={name} onChange={e => setName(e.target.value)} /></div>
                <div><Label>Role</Label><input className={inputCls()} value={roleLabel} onChange={e => setRoleLabel(e.target.value)} /></div>
            </div>
        </Modal>
    )
}
