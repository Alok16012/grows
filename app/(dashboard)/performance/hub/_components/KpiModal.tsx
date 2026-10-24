"use client"
// Add / edit one KPI of a KRA (KPI Designer).
import { useEffect, useMemo, useState } from "react"
import type React from "react"
import { toast } from "sonner"
import { Loader2, PenLine, Database, Cpu } from "lucide-react"
import {
    api, Modal, Label, inputCls, btnPrimary, btnGhost,
    type KPI, type Register, type Frequency, type ValueType, type Direction, type Rollup, type SourceType, type Aggregate, type Fail,
} from "./shared"

export type SystemMetric = { key: string; label: string; unit: string | null }

const ROLLUP_HINT: Record<Rollup, string> = {
    AVG: "Average of the period values",
    SUM: "Total of the period values",
    LAST: "Latest period value",
    MIN: "Lowest period value",
    MAX: "Highest period value",
}

const AGG_LABEL: Record<Aggregate, string> = {
    SUM: "Sum", AVG: "Average", COUNT: "Count of entries", LAST: "Last entry", MAX: "Maximum", MIN: "Minimum",
}

type Form = {
    name: string; code: string; frequency: Frequency; measurable: string; valueType: ValueType; direction: Direction
    target: string; targetLabel: string; weightage: string; rollup: Rollup; greenAt: string; amberAt: string
    evidenceRequired: boolean; sourceType: SourceType; registerId: string; registerMode: "SINGLE" | "RATIO"
    valueField: string; numeratorField: string; denominatorField: string; aggregate: Aggregate; systemMetric: string
}

function toForm(k?: Partial<KPI> | null): Form {
    return {
        name: k?.name ?? "", code: k?.code ?? "", frequency: k?.frequency ?? "DAILY", measurable: k?.measurable ?? "",
        valueType: k?.valueType ?? "COUNT", direction: k?.direction ?? "HIGHER",
        target: k?.target === null || k?.target === undefined ? "" : String(k.target), targetLabel: k?.targetLabel ?? "",
        weightage: k?.weightage === undefined ? "10" : String(k.weightage), rollup: k?.rollup ?? "AVG",
        greenAt: String(k?.greenAt ?? 90), amberAt: String(k?.amberAt ?? 70), evidenceRequired: !!k?.evidenceRequired,
        sourceType: k?.sourceType ?? "MANUAL", registerId: k?.registerId ?? "", registerMode: k?.registerMode ?? "SINGLE",
        valueField: k?.valueField ?? "", numeratorField: k?.numeratorField ?? "", denominatorField: k?.denominatorField ?? "",
        aggregate: k?.aggregate ?? "SUM", systemMetric: k?.systemMetric ?? "",
    }
}

export function KpiModal({ kraId, kpi, registers, metrics, onClose, onSaved, fail }: {
    kraId: string; kpi: KPI | null; registers: Register[]; metrics: SystemMetric[]
    onClose: () => void; onSaved: () => void; fail: Fail
}) {
    const [f, setF] = useState<Form>(() => toForm(kpi))
    const [saving, setSaving] = useState(false)
    const set = <K extends keyof Form>(k: K, v: Form[K]) => setF(p => ({ ...p, [k]: v }))

    const register = registers.find(r => r.id === f.registerId) ?? null
    const numericFields = useMemo(() => (register?.fields ?? []).filter(x => x.type === "number" || x.type === "yesno"), [register])

    // Ratio KPIs are percentages; default the value type when switching.
    useEffect(() => {
        if (f.sourceType === "REGISTER" && f.registerMode === "RATIO" && f.valueType !== "PERCENT") set("valueType", "PERCENT")
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [f.sourceType, f.registerMode])

    async function save() {
        if (!f.name.trim()) { toast.error("KPI name is required"); return }
        if (f.valueType !== "YESNO" && f.target.trim() === "") { toast.error("Target is required"); return }
        const target = f.valueType === "YESNO" && f.target.trim() === "" ? 1 : Number(f.target)
        if (isNaN(target)) { toast.error("Target must be a number"); return }
        const green = Number(f.greenAt), amber = Number(f.amberAt)
        if (isNaN(green) || isNaN(amber) || amber > green) { toast.error("AMBER threshold must be at or below GREEN"); return }
        if (f.sourceType === "REGISTER") {
            if (!f.registerId) { toast.error("Pick a register"); return }
            if (f.registerMode === "SINGLE" && f.aggregate !== "COUNT" && !f.valueField) { toast.error("Pick the value field"); return }
            if (f.registerMode === "RATIO" && (!f.numeratorField || !f.denominatorField)) { toast.error("Pick numerator and denominator fields"); return }
        }
        if (f.sourceType === "SYSTEM" && !f.systemMetric) { toast.error("Pick a Growus metric"); return }

        const isReg = f.sourceType === "REGISTER"
        const body = {
            name: f.name.trim(), code: f.code.trim() || null, frequency: f.frequency, measurable: f.measurable.trim() || null,
            valueType: f.valueType, direction: f.direction, target, targetLabel: f.targetLabel.trim() || null,
            weightage: Number(f.weightage) || 0, rollup: f.rollup, greenAt: green, amberAt: amber,
            evidenceRequired: f.evidenceRequired, sourceType: f.sourceType,
            registerId: isReg ? f.registerId : null,
            registerMode: isReg ? f.registerMode : null,
            valueField: isReg && f.registerMode === "SINGLE" ? (f.valueField || null) : null,
            aggregate: isReg && f.registerMode === "SINGLE" ? f.aggregate : null,
            numeratorField: isReg && f.registerMode === "RATIO" ? f.numeratorField : null,
            denominatorField: isReg && f.registerMode === "RATIO" ? f.denominatorField : null,
            systemMetric: f.sourceType === "SYSTEM" ? f.systemMetric : null,
        }
        setSaving(true)
        try {
            if (kpi) await api(`/kpis/${kpi.id}`, { method: "PUT", body })
            else await api(`/kras/${kraId}/kpis`, { method: "POST", body })
            toast.success(kpi ? "KPI updated" : "KPI added")
            onSaved()
        } catch (e) { fail(e) }
        finally { setSaving(false) }
    }

    const sel = inputCls()
    const sources: { key: SourceType; label: string; icon: React.ReactNode }[] = [
        { key: "MANUAL", label: "Employee enters the value", icon: <PenLine size={13} /> },
        { key: "REGISTER", label: "Calculate from a register", icon: <Database size={13} /> },
        { key: "SYSTEM", label: "From Growus data", icon: <Cpu size={13} /> },
    ]

    return (
        <Modal wide title={kpi ? "Edit KPI" : "Add KPI"} onClose={onClose}
            footer={<>
                <button className={btnGhost} onClick={onClose}>Cancel</button>
                <button className={btnPrimary} onClick={save} disabled={saving}>{saving && <Loader2 size={14} className="animate-spin" />} Save KPI</button>
            </>}>
            <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3.5">
                <div className="sm:col-span-2 grid grid-cols-1 sm:grid-cols-[1fr_160px] gap-4">
                    <div>
                        <Label>KPI name *</Label>
                        <input className={inputCls()} value={f.name} onChange={e => set("name", e.target.value)} placeholder="e.g. Guard attendance at post" autoFocus />
                    </div>
                    <div>
                        <Label>Code</Label>
                        <input className={inputCls("font-mono uppercase")} value={f.code} onChange={e => set("code", e.target.value.toUpperCase())} placeholder="ATT-01" />
                    </div>
                </div>
                <div>
                    <Label hint="How often the employee reports it">Frequency</Label>
                    <select className={sel} value={f.frequency} onChange={e => set("frequency", e.target.value as Frequency)}>
                        <option value="DAILY">Daily</option><option value="WEEKLY">Weekly</option><option value="MONTHLY">Monthly</option>
                    </select>
                </div>
                <div>
                    <Label hint="Shown under the KPI name">Measurable / how it is measured</Label>
                    <input className={sel} value={f.measurable} onChange={e => set("measurable", e.target.value)} placeholder="e.g. Guards present ÷ guards rostered" />
                </div>
                <div>
                    <Label>Value type</Label>
                    <select className={sel} value={f.valueType} onChange={e => set("valueType", e.target.value as ValueType)}>
                        <option value="COUNT">Count</option><option value="PERCENT">Percent</option><option value="NUMBER">Number</option>
                        <option value="CURRENCY">Currency (₹)</option><option value="YESNO">Yes / No</option>
                    </select>
                </div>
                <div>
                    <Label>Direction</Label>
                    <select className={sel} value={f.direction} onChange={e => set("direction", e.target.value as Direction)} disabled={f.valueType === "YESNO"}>
                        <option value="HIGHER">Higher is better</option><option value="LOWER">Lower is better</option>
                    </select>
                </div>
                <div>
                    <Label hint={f.valueType === "YESNO" ? "1 = Yes" : undefined}>Target *</Label>
                    <input className={inputCls("font-mono")} inputMode="decimal" value={f.target} onChange={e => set("target", e.target.value)} placeholder={f.valueType === "YESNO" ? "1" : "95"} />
                </div>
                <div>
                    <Label hint="Shown to user, e.g. >=95%">Target label</Label>
                    <input className={inputCls("font-mono")} value={f.targetLabel} onChange={e => set("targetLabel", e.target.value)} placeholder=">=95%" />
                </div>
                <div>
                    <Label hint="Points of 100 — a KRA's KPIs add up to its weight">Weightage</Label>
                    <input className={inputCls("font-mono")} inputMode="decimal" value={f.weightage} onChange={e => set("weightage", e.target.value)} />
                </div>
                <div>
                    <Label hint={ROLLUP_HINT[f.rollup]}>Monthly roll-up</Label>
                    <select className={sel} value={f.rollup} onChange={e => set("rollup", e.target.value as Rollup)}>
                        <option value="AVG">Average</option><option value="SUM">Sum</option><option value="LAST">Last</option>
                        <option value="MIN">Minimum</option><option value="MAX">Maximum</option>
                    </select>
                </div>
                <div>
                    <Label>GREEN at achievement ≥ %</Label>
                    <input className={inputCls("font-mono")} inputMode="decimal" value={f.greenAt} onChange={e => set("greenAt", e.target.value)} />
                </div>
                <div>
                    <Label>AMBER at achievement ≥ %</Label>
                    <input className={inputCls("font-mono")} inputMode="decimal" value={f.amberAt} onChange={e => set("amberAt", e.target.value)} />
                </div>
                <label className="sm:col-span-2 flex items-center gap-2 text-[13px] text-[var(--text)] cursor-pointer select-none">
                    <input type="checkbox" checked={f.evidenceRequired} onChange={e => set("evidenceRequired", e.target.checked)} className="accent-[var(--accent)] w-4 h-4" />
                    Evidence link required
                </label>

                {/* Source */}
                <div className="sm:col-span-2 pt-2 border-t border-[var(--border)]">
                    <Label>Where the value comes from</Label>
                    <div className="z-tabs-wrap"><div className="z-tabs z-tabs--inset" role="tablist">
                        {sources.map(s => (
                            <button key={s.key} type="button" role="tab" aria-selected={f.sourceType === s.key}
                                className={`z-tab ${f.sourceType === s.key ? "is-active" : ""}`} onClick={() => set("sourceType", s.key)}>
                                {s.icon} {s.label}
                            </button>
                        ))}
                    </div></div>
                </div>

                {f.sourceType === "MANUAL" && (
                    <p className="sm:col-span-2 text-[12px] text-[var(--text3)] -mt-1">The employee types the actual value in their report.</p>
                )}

                {f.sourceType === "REGISTER" && (
                    <div className="sm:col-span-2 rounded-xl border border-[var(--border)] bg-[var(--surface2)]/60 p-3.5 grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                        <div className="sm:col-span-2">
                            <Label>Register</Label>
                            <select className={inputCls("!bg-white")} value={f.registerId}
                                onChange={e => setF(p => ({ ...p, registerId: e.target.value, valueField: "", numeratorField: "", denominatorField: "" }))}>
                                <option value="">Select a register…</option>
                                {registers.filter(r => r.isActive || r.id === f.registerId).map(r => <option key={r.id} value={r.id}>{r.name} ({r.code})</option>)}
                            </select>
                            {registers.length === 0 && <p className="text-[11px] text-[var(--amber)] mt-1">No registers yet — create one in Register Designer.</p>}
                        </div>
                        <div className="sm:col-span-2">
                            <div className="z-tabs-wrap"><div className="z-tabs" role="tablist">
                                <button type="button" className={`z-tab ${f.registerMode === "SINGLE" ? "is-active" : ""}`} onClick={() => set("registerMode", "SINGLE")}>Single value</button>
                                <button type="button" className={`z-tab ${f.registerMode === "RATIO" ? "is-active" : ""}`} onClick={() => set("registerMode", "RATIO")}>Ratio / percentage</button>
                            </div></div>
                        </div>
                        {register && numericFields.length === 0 && (
                            <p className="sm:col-span-2 text-[11.5px] text-[var(--amber)]">This register has no number or yes/no fields to calculate from.</p>
                        )}
                        {f.registerMode === "SINGLE" ? (<>
                            <div>
                                <Label>Value field</Label>
                                <select className={inputCls("!bg-white")} value={f.valueField} onChange={e => set("valueField", e.target.value)} disabled={!register}>
                                    <option value="">{f.aggregate === "COUNT" ? "(any entry)" : "Select field…"}</option>
                                    {numericFields.map(x => <option key={x.key} value={x.key}>{x.label}</option>)}
                                </select>
                            </div>
                            <div>
                                <Label hint="How the period's entries are combined">Aggregate</Label>
                                <select className={inputCls("!bg-white")} value={f.aggregate} onChange={e => set("aggregate", e.target.value as Aggregate)}>
                                    {(Object.keys(AGG_LABEL) as Aggregate[]).map(a => <option key={a} value={a}>{AGG_LABEL[a]}</option>)}
                                </select>
                            </div>
                        </>) : (<>
                            <div>
                                <Label hint="Summed over the period">Numerator field</Label>
                                <select className={inputCls("!bg-white")} value={f.numeratorField} onChange={e => set("numeratorField", e.target.value)} disabled={!register}>
                                    <option value="">Select field…</option>
                                    {numericFields.map(x => <option key={x.key} value={x.key}>{x.label}</option>)}
                                </select>
                            </div>
                            <div>
                                <Label hint="Value = numerator ÷ denominator × 100">Denominator field</Label>
                                <select className={inputCls("!bg-white")} value={f.denominatorField} onChange={e => set("denominatorField", e.target.value)} disabled={!register}>
                                    <option value="">Select field…</option>
                                    {numericFields.map(x => <option key={x.key} value={x.key}>{x.label}</option>)}
                                </select>
                            </div>
                        </>)}
                    </div>
                )}

                {f.sourceType === "SYSTEM" && (
                    <div className="sm:col-span-2 rounded-xl border border-[var(--border)] bg-[var(--surface2)]/60 p-3.5">
                        <Label hint="Calculated from attendance, field tasks, inspections and other Growus records">Growus metric</Label>
                        <select className={inputCls("!bg-white")} value={f.systemMetric} onChange={e => set("systemMetric", e.target.value)}>
                            <option value="">Select a metric…</option>
                            {metrics.map(m => <option key={m.key} value={m.key}>{m.label}{m.unit ? ` (${m.unit})` : ""}</option>)}
                        </select>
                    </div>
                )}
            </div>
        </Modal>
    )
}
