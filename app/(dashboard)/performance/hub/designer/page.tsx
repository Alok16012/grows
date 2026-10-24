"use client"
// KPI Designer — list of KRA/KPI templates (one family per role, versioned).
import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Plus, Sparkles, Target, Loader2, Copy, Trash2, CheckCircle2, ExternalLink } from "lucide-react"
import { HubShell, useHubPerms } from "../_components/HubNav"
import {
    api, useHub, Card, Loading, Empty, Pill, Modal, Label, inputCls,
    TEMPLATE_STATUS, btnPrimary, btnGhost, btnSmall, btnSmallAccent, thCls, tdCls, fmtDate,
    type TemplateSummary,
} from "../_components/shared"

export default function DesignerListPage() {
    const router = useRouter()
    const { status, canManage } = useHubPerms()
    const { missing, fail } = useHub()
    const [rows, setRows] = useState<TemplateSummary[]>([])
    const [loading, setLoading] = useState(true)
    const [busy, setBusy] = useState<string | null>(null)
    const [creating, setCreating] = useState(false)

    const load = useCallback(async () => {
        setLoading(true)
        try { setRows((await api<{ templates: TemplateSummary[] }>("/templates")).templates ?? []) }
        catch (e) { fail(e, "Could not load templates") }
        finally { setLoading(false) }
    }, [fail])

    useEffect(() => { if (status === "authenticated") load() }, [status, load])

    async function act(id: string, what: "publish" | "new-version" | "delete") {
        if (what === "delete" && !confirm("Delete this draft template?")) return
        if (what === "publish" && !confirm("Publish this template? Published versions are read-only and become assignable.")) return
        setBusy(id + what)
        try {
            if (what === "delete") { await api(`/templates/${id}`, { method: "DELETE" }); toast.success("Draft deleted") }
            else if (what === "publish") { await api(`/templates/${id}/publish`, { method: "POST", body: {} }); toast.success("Template published") }
            else {
                const d = await api<{ template?: { id: string } }>(`/templates/${id}/new-version`, { method: "POST", body: {} })
                toast.success("New draft version created")
                if (d?.template?.id) { router.push(`/performance/hub/designer/${d.template.id}`); return }
            }
            load()
        } catch (e) { fail(e) }
        finally { setBusy(null) }
    }

    async function loadSamples() {
        setBusy("sample")
        try {
            await api("/templates/sample", { method: "POST", body: {} })
            toast.success("Sample templates loaded")
            load()
        } catch (e) { fail(e) }
        finally { setBusy(null) }
    }

    if (status === "authenticated" && !canManage) {
        return (
            <HubShell title="KPI Designer" missing={missing}>
                <Card><Empty icon={<Target size={40} />} title="You don't have access to the KPI Designer" sub="Ask an admin for the performance.manage permission." /></Card>
            </HubShell>
        )
    }

    return (
        <HubShell
            title="KPI Designer"
            subtitle="Design KRA/KPI templates per role. Publish a version to assign it to people."
            missing={missing}
            actions={<>
                <button className={btnGhost} onClick={loadSamples} disabled={busy === "sample"}>
                    {busy === "sample" ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />} Load sample templates
                </button>
                <button className={btnPrimary} onClick={() => setCreating(true)}><Plus size={15} /> New template</button>
            </>}
        >
            <Card>
                {loading ? <Loading /> : rows.length === 0 ? (
                    <Empty icon={<Target size={40} />} title="No templates yet"
                        sub="Start from scratch or load the sample templates to see how KRAs and KPIs fit together."
                        action={<button className={btnPrimary} onClick={() => setCreating(true)}><Plus size={15} /> New template</button>} />
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-[13px]">
                            <thead>
                                <tr>
                                    <th className={thCls}>Template</th>
                                    <th className={thCls}>Role</th>
                                    <th className={thCls}>Version</th>
                                    <th className={thCls}>Status</th>
                                    <th className={`${thCls} text-right`}>KRAs</th>
                                    <th className={`${thCls} text-right`}>KPIs</th>
                                    <th className={`${thCls} text-right`}>Weight</th>
                                    <th className={`${thCls} text-right`}>Assigned</th>
                                    <th className={`${thCls} text-right`}>Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[var(--border)]">
                                {rows.map(t => {
                                    const wOk = Math.round(t.weightTotal) === 100
                                    return (
                                        <tr key={t.id} className="hover:bg-[var(--surface2)]/60">
                                            <td className={tdCls}>
                                                <Link href={`/performance/hub/designer/${t.id}`} className="font-semibold text-[var(--text)] hover:text-[var(--accent)]">{t.name}</Link>
                                                {t.publishedAt && <p className="text-[11px] text-[var(--text3)]">Published {fmtDate(t.publishedAt)}</p>}
                                            </td>
                                            <td className={`${tdCls} text-[var(--text2)]`}>{t.roleLabel || "—"}</td>
                                            <td className={`${tdCls} font-mono`}>v{t.version}</td>
                                            <td className={tdCls}><Pill tone={TEMPLATE_STATUS[t.status]} /></td>
                                            <td className={`${tdCls} text-right font-mono`}>{t.kraCount}</td>
                                            <td className={`${tdCls} text-right font-mono`}>{t.kpiCount}</td>
                                            <td className={`${tdCls} text-right font-mono font-semibold`} style={{ color: wOk ? "var(--success)" : "var(--amber)" }}>{t.weightTotal} / 100</td>
                                            <td className={`${tdCls} text-right font-mono`}>{t.assignedCount}</td>
                                            <td className={`${tdCls} text-right`}>
                                                <div className="inline-flex items-center gap-1.5 justify-end flex-wrap">
                                                    <Link href={`/performance/hub/designer/${t.id}`} className={btnSmall}><ExternalLink size={12} /> Open</Link>
                                                    {t.status === "DRAFT" && (
                                                        <button className={btnSmallAccent} disabled={!!busy || !wOk} title={wOk ? "" : "KRA weights must total 100"} onClick={() => act(t.id, "publish")}>
                                                            {busy === t.id + "publish" ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />} Publish
                                                        </button>
                                                    )}
                                                    {t.status === "PUBLISHED" && (
                                                        <button className={btnSmall} disabled={!!busy} onClick={() => act(t.id, "new-version")}>
                                                            {busy === t.id + "new-version" ? <Loader2 size={12} className="animate-spin" /> : <Copy size={12} />} New version
                                                        </button>
                                                    )}
                                                    {t.status === "DRAFT" && (
                                                        <button className={`${btnSmall} hover:!text-red-600 hover:!border-red-300`} disabled={!!busy} onClick={() => act(t.id, "delete")}>
                                                            <Trash2 size={12} /> Delete draft
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </Card>

            {creating && <NewTemplateModal onClose={() => setCreating(false)} onCreated={id => router.push(`/performance/hub/designer/${id}`)} fail={fail} />}
        </HubShell>
    )
}

function NewTemplateModal({ onClose, onCreated, fail }: { onClose: () => void; onCreated: (id: string) => void; fail: (e: unknown) => void }) {
    const [name, setName] = useState("")
    const [roleLabel, setRoleLabel] = useState("")
    const [saving, setSaving] = useState(false)
    async function save() {
        if (!name.trim()) { toast.error("Template name is required"); return }
        setSaving(true)
        try {
            // The API may answer { template } or the bare template.
            const d = await api<{ template?: { id: string }; id?: string }>("/templates", { method: "POST", body: { name: name.trim(), roleLabel: roleLabel.trim() || undefined } })
            toast.success("Template created")
            const id = d?.template?.id ?? d?.id
            if (id) onCreated(id); else onClose()
        } catch (e) { fail(e) }
        finally { setSaving(false) }
    }
    return (
        <Modal title="New template" subtitle="Creates a draft v1 you can fill with KRAs and KPIs." onClose={onClose}
            footer={<>
                <button className={btnGhost} onClick={onClose}>Cancel</button>
                <button className={btnPrimary} onClick={save} disabled={saving}>{saving && <Loader2 size={14} className="animate-spin" />} Create</button>
            </>}>
            <div className="p-5 space-y-4">
                <div>
                    <Label>Template name *</Label>
                    <input className={inputCls()} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Site Supervisor KRA" autoFocus />
                </div>
                <div>
                    <Label hint="Shown to people and on the team dashboard">Role</Label>
                    <input className={inputCls()} value={roleLabel} onChange={e => setRoleLabel(e.target.value)} placeholder="e.g. Site Supervisor" />
                </div>
            </div>
        </Modal>
    )
}
