"use client"

// Settings → Company profile: the company's own details (registrations, tax and
// statutory numbers, addresses, directors, bank) and a document library with
// categories, expiry dates, versions and who-can-see.
import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { Copy, Download, History, Loader2, Plus, Trash2, Upload, X } from "lucide-react"
import { VISIBILITY, type CompanyProfile, type CompanySettings, type Visibility } from "@/lib/company-profile"

type Can = { view: boolean; edit: boolean; upload: boolean; delete: boolean }
type Doc = { id: string; category: string; title: string; docNumber: string | null; issuedOn: string | null; expiresOn: string | null; fileUrl: string; fileName: string; notes: string | null; visibility: Visibility; version: number; replacesId: string | null; isArchived: boolean; uploadedByName: string | null; createdAt: string }
const box = "h-9 rounded-[9px] border border-[var(--border)] px-2.5 text-[13px] bg-white w-full"
const btn = "h-9 px-4 rounded-[9px] bg-[var(--accent)] text-white text-[13px] font-semibold disabled:opacity-50 inline-flex items-center gap-1.5"
const btn2 = "h-8 px-3 rounded-[8px] border border-[var(--border)] bg-white text-[12px] font-semibold text-[var(--text2)] inline-flex items-center gap-1 disabled:opacity-50"
const lbl = "block text-[11px] font-semibold uppercase text-[var(--text3)]"
const day = (s: string | null) => s ? new Date(s).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—"
const daysTo = (s: string | null) => s ? Math.ceil((new Date(s).getTime() - Date.now()) / 86_400_000) : null

export default function CompanyPage() {
    const [tab, setTab] = useState<"profile" | "documents" | "settings">("profile")
    const [d, setD] = useState<{ profile: Partial<CompanyProfile>; settings: CompanySettings; can: Can } | null>(null)
    const load = useCallback(() => { fetch("/api/company").then(r => r.json()).then(setD).catch(() => toast.error("Couldn't load")) }, [])
    useEffect(() => { load(); const t = new URLSearchParams(window.location.search).get("tab"); if (t === "documents" || t === "settings") setTab(t) }, [load])
    if (!d) return <div className="p-10 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-[var(--text3)]" /></div>
    return (
        <div className="max-w-[1150px] mx-auto p-4 md:p-6 space-y-4">
            <div>
                <h1 className="text-[22px] font-bold text-[var(--text)]">{d.profile.legalName || "Company profile"}</h1>
                <p className="text-[12.5px] text-[var(--text3)]">Company details and documents in one place — registrations, licences, contracts and certificates, ready when someone needs them.</p>
            </div>
            <div className="flex gap-1 border-b border-[var(--border)]">
                {([["profile", "Profile"], ["documents", "Documents"], ...(d.can.edit ? [["settings", "Settings"]] : [])] as [string, string][]).map(([k, l]) => (
                    <button key={k} onClick={() => setTab(k as any)} className={`px-3 py-2 text-[13px] font-semibold border-b-2 -mb-px ${tab === k ? "border-[var(--accent)] text-[var(--accent)]" : "border-transparent text-[var(--text3)]"}`}>{l}</button>
                ))}
            </div>
            {tab === "profile" ? <Profile p={d.profile} can={d.can} onSaved={load} /> : tab === "documents" ? <Documents can={d.can} categories={d.settings.categories} /> : <Settings s={d.settings} onSaved={load} />}
        </div>
    )
}

function Field({ label, value }: { label: string; value?: string }) {
    if (!value) return null
    return (
        <div className="flex items-start justify-between gap-2 py-1.5 border-b border-[var(--border)] last:border-0">
            <span className="text-[12px] text-[var(--text3)] min-w-[140px]">{label}</span>
            <span className="text-[13px] text-right flex-1 break-words">{value}</span>
            <button onClick={() => { navigator.clipboard.writeText(value).catch(() => {}); toast.success("Copied") }} aria-label={`Copy ${label}`} className="text-[var(--text3)] hover:text-[var(--accent)]"><Copy size={13} /></button>
        </div>
    )
}

function Profile({ p, can, onSaved }: { p: Partial<CompanyProfile>; can: Can; onSaved: () => void }) {
    const [edit, setEdit] = useState(false)
    if (edit) return <ProfileForm p={p as CompanyProfile} onClose={() => setEdit(false)} onSaved={() => { setEdit(false); onSaved() }} />
    const card = "bg-white border border-[var(--border)] rounded-[12px] p-4"
    return (
        <div className="space-y-3">
            {can.edit && <div className="flex justify-end"><button onClick={() => setEdit(true)} className={btn}>Edit profile</button></div>}
            {p.publicNote && <div className="rounded-[12px] bg-[var(--accent-light,#eef2ff)] px-4 py-3 text-[13px] whitespace-pre-wrap">{p.publicNote}</div>}
            <div className="grid md:grid-cols-2 gap-3">
                <div className={card}><p className="text-[13px] font-semibold mb-1">Company</p>
                    <Field label="Legal name" value={p.legalName} /><Field label="Brand" value={p.brandName} /><Field label="Incorporated on" value={p.incorporatedOn} /><Field label="CIN" value={p.cin} /><Field label="MSME / Udyam" value={p.msme} />
                </div>
                <div className={card}><p className="text-[13px] font-semibold mb-1">Contact</p>
                    <Field label="Registered address" value={p.registeredAddress} /><Field label="Corporate address" value={p.corporateAddress} /><Field label="Phone" value={p.phone} /><Field label="Email" value={p.email} /><Field label="Website" value={p.website} />
                </div>
                {can.view && <div className={card}><p className="text-[13px] font-semibold mb-1">Tax & statutory</p>
                    <Field label="PAN" value={p.pan} /><Field label="TAN" value={p.tan} />{(p.gstins ?? []).map((g, i) => <Field key={i} label={`GSTIN${g.state ? ` · ${g.state}` : ""}`} value={g.gstin} />)}
                    <Field label="PF establishment code" value={p.pfCode} /><Field label="ESIC code" value={p.esicCode} /><Field label="PT registration" value={p.ptReg} /><Field label="LWF registration" value={p.lwfReg} /><Field label="CLRA licence" value={p.clraLicence} />
                </div>}
                {can.view && <div className={card}><p className="text-[13px] font-semibold mb-1">Directors & bank</p>
                    {(p.directors ?? []).map((x, i) => <Field key={i} label={x.role || "Director"} value={`${x.name}${x.din ? ` · DIN ${x.din}` : ""}`} />)}
                    <Field label="Account name" value={p.bank?.accountName} /><Field label="Bank" value={[p.bank?.bankName, p.bank?.branch].filter(Boolean).join(", ")} /><Field label="Account no." value={p.bank?.accountNumber} /><Field label="IFSC" value={p.bank?.ifsc} />
                </div>}
            </div>
            {!can.view && <p className="text-[12px] text-[var(--text3)]">Registration and statutory numbers are shown to staff with Company profile access.</p>}
        </div>
    )
}

function ProfileForm({ p: initial, onClose, onSaved }: { p: CompanyProfile; onClose: () => void; onSaved: () => void }) {
    const [p, setP] = useState<CompanyProfile>({ ...initial, gstins: initial.gstins ?? [], directors: initial.directors ?? [], bank: initial.bank ?? { accountName: "", bankName: "", branch: "", accountNumber: "", ifsc: "" } })
    const [busy, setBusy] = useState(false)
    const set = (k: keyof CompanyProfile, v: any) => setP(x => ({ ...x, [k]: v }))
    const t = (k: keyof CompanyProfile, label: string, ph = "") => <label className={lbl}>{label}<input value={(p[k] as string) ?? ""} onChange={e => set(k, e.target.value)} placeholder={ph} className={box} /></label>
    async function save() {
        setBusy(true)
        try { const r = await fetch("/api/company", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ profile: p }) }); if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error || "Could not save"); toast.success("Company profile saved"); onSaved() }
        catch (e: any) { toast.error(e.message) } finally { setBusy(false) }
    }
    const card = "bg-white border border-[var(--border)] rounded-[12px] p-4 space-y-2"
    return (
        <div className="space-y-3">
            <div className={card}><p className="text-[13px] font-semibold">Company</p>
                <div className="grid sm:grid-cols-2 gap-2">{t("legalName", "Legal name")}{t("brandName", "Brand name")}{t("incorporatedOn", "Incorporated on", "e.g. 12 March 2015")}{t("cin", "CIN")}{t("msme", "MSME / Udyam no.")}</div>
            </div>
            <div className={card}><p className="text-[13px] font-semibold">Contact</p>
                <div className="grid sm:grid-cols-2 gap-2">{t("registeredAddress", "Registered address")}{t("corporateAddress", "Corporate address")}{t("phone", "Phone")}{t("email", "Email")}{t("website", "Website")}</div>
            </div>
            <div className={card}><p className="text-[13px] font-semibold">Tax & statutory</p>
                <div className="grid sm:grid-cols-3 gap-2">{t("pan", "PAN")}{t("tan", "TAN")}{t("pfCode", "PF establishment code")}{t("esicCode", "ESIC code")}{t("ptReg", "PT registration")}{t("lwfReg", "LWF registration")}{t("clraLicence", "CLRA licence")}</div>
                <p className={lbl}>GSTIN by state</p>
                {p.gstins.map((g, i) => <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2"><input value={g.state} onChange={e => set("gstins", p.gstins.map((x, j) => j === i ? { ...x, state: e.target.value } : x))} placeholder="State" className={box} /><input value={g.gstin} onChange={e => set("gstins", p.gstins.map((x, j) => j === i ? { ...x, gstin: e.target.value } : x))} placeholder="GSTIN" className={box} /><button onClick={() => set("gstins", p.gstins.filter((_, j) => j !== i))} aria-label="Remove GSTIN" className="text-red-600 px-1"><Trash2 size={14} /></button></div>)}
                <button onClick={() => set("gstins", [...p.gstins, { state: "", gstin: "" }])} className={btn2}><Plus size={12} /> Add GSTIN</button>
            </div>
            <div className={card}><p className="text-[13px] font-semibold">Directors</p>
                {p.directors.map((x, i) => <div key={i} className="grid grid-cols-[1fr_120px_1fr_auto] gap-2"><input value={x.name} onChange={e => set("directors", p.directors.map((y, j) => j === i ? { ...y, name: e.target.value } : y))} placeholder="Name" className={box} /><input value={x.din} onChange={e => set("directors", p.directors.map((y, j) => j === i ? { ...y, din: e.target.value } : y))} placeholder="DIN" className={box} /><input value={x.role} onChange={e => set("directors", p.directors.map((y, j) => j === i ? { ...y, role: e.target.value } : y))} placeholder="Role (e.g. Managing Director)" className={box} /><button onClick={() => set("directors", p.directors.filter((_, j) => j !== i))} aria-label="Remove director" className="text-red-600 px-1"><Trash2 size={14} /></button></div>)}
                <button onClick={() => set("directors", [...p.directors, { name: "", din: "", role: "" }])} className={btn2}><Plus size={12} /> Add director</button>
            </div>
            <div className={card}><p className="text-[13px] font-semibold">Bank <span className="font-normal text-[12px] text-[var(--text3)]">— full account number shown only to editors</span></p>
                <div className="grid sm:grid-cols-3 gap-2">{(["accountName", "bankName", "branch", "accountNumber", "ifsc"] as const).map(k => <label key={k} className={lbl}>{({ accountName: "Account name", bankName: "Bank", branch: "Branch", accountNumber: "Account no.", ifsc: "IFSC" })[k]}<input value={p.bank[k]} onChange={e => set("bank", { ...p.bank, [k]: e.target.value })} className={box} /></label>)}</div>
            </div>
            <div className={card}><label className={lbl}>Note for everyone (shown to every login)<textarea value={p.publicNote} onChange={e => set("publicNote", e.target.value)} rows={2} className="w-full rounded-[9px] border border-[var(--border)] px-2.5 py-1.5 text-[13px]" placeholder="e.g. Office hours, HR helpline" /></label></div>
            <div className="flex justify-end gap-2"><button onClick={onClose} className={btn2}>Cancel</button><button onClick={save} disabled={busy} className={btn}>{busy && <Loader2 size={14} className="animate-spin" />}Save profile</button></div>
        </div>
    )
}

function Documents({ can, categories }: { can: Can; categories: string[] }) {
    const [docs, setDocs] = useState<Doc[] | null>(null)
    const [q, setQ] = useState(""), [cat, setCat] = useState(""), [showArchived, setShowArchived] = useState(false), [onlyExpiring, setOnlyExpiring] = useState(false)
    const [upload, setUpload] = useState<{ replaces?: Doc } | null>(null)
    const [hist, setHist] = useState<Doc | null>(null)
    const load = useCallback(() => { fetch(`/api/company/documents${showArchived ? "?archived=1" : ""}`).then(r => r.json()).then(j => setDocs(j.documents ?? [])).catch(() => toast.error("Couldn't load")) }, [showArchived])
    useEffect(() => { load() }, [load])
    const list = useMemo(() => (docs ?? []).filter(d => (!cat || d.category === cat) && (!onlyExpiring || (d.expiresOn && (daysTo(d.expiresOn) ?? 999) <= 60)) && (!q.trim() || `${d.title} ${d.docNumber ?? ""} ${d.notes ?? ""} ${d.fileName}`.toLowerCase().includes(q.trim().toLowerCase()))), [docs, cat, q, onlyExpiring])
    const groups = useMemo(() => { const m = new Map<string, Doc[]>(); for (const d of list) m.set(d.category, [...(m.get(d.category) ?? []), d]); return Array.from(m.entries()) }, [list])
    const expiring = (docs ?? []).filter(d => !d.isArchived && d.expiresOn && (daysTo(d.expiresOn) ?? 999) <= 60).length
    async function act(d: Doc, body: any, ok: string) {
        const r = await fetch("/api/company/documents", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: d.id, ...body }) })
        if (!r.ok) toast.error((await r.json().catch(() => ({})))?.error || "Could not save"); else { toast.success(ok); load() }
    }
    async function del(d: Doc) {
        if (!confirm(`Delete "${d.title}" (v${d.version}) for good? Archiving keeps it out of the way but recoverable.`)) return
        const r = await fetch(`/api/company/documents?id=${d.id}`, { method: "DELETE" })
        if (!r.ok) toast.error((await r.json().catch(() => ({})))?.error || "Could not delete"); else { toast.success("Deleted"); load() }
    }
    if (!docs) return <div className="p-10 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-[var(--text3)]" /></div>
    return (
        <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
                <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search name, number, note" className={`${box} !w-auto min-w-[200px] flex-1`} />
                <select value={cat} onChange={e => setCat(e.target.value)} className={`${box} !w-auto`} aria-label="Category"><option value="">All categories</option>{categories.map(c => <option key={c}>{c}</option>)}</select>
                <label className="flex items-center gap-1.5 text-[12.5px]"><input type="checkbox" checked={onlyExpiring} onChange={e => setOnlyExpiring(e.target.checked)} /> Expiring in 60 days ({expiring})</label>
                {can.edit && <label className="flex items-center gap-1.5 text-[12.5px]"><input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} /> Show archived</label>}
                {can.upload && <button onClick={() => setUpload({})} className={btn}><Upload size={14} /> Upload document</button>}
            </div>
            {!groups.length && <p className="text-[13px] text-[var(--text3)] bg-white border border-[var(--border)] rounded-[12px] p-6 text-center">{docs.length ? "Nothing matches these filters." : can.upload ? "No documents yet — upload the company's registrations, licences and contracts." : "No documents shared with you yet."}</p>}
            {groups.map(([g, items]) => (
                <div key={g} className="bg-white border border-[var(--border)] rounded-[12px] overflow-x-auto">
                    <p className="px-4 pt-3 pb-1 text-[13px] font-semibold">{g} <span className="text-[var(--text3)] font-normal">({items.length})</span></p>
                    <table className="w-full min-w-[760px]">
                        <tbody>{items.map(d => { const left = daysTo(d.expiresOn); return (
                            <tr key={d.id} className={d.isArchived ? "opacity-50" : ""}>
                                <td className="px-4 py-2 border-t border-[var(--border)] text-[13px]"><b>{d.title}</b>{d.version > 1 && <span className="ml-1 text-[11px] text-[var(--text3)]">v{d.version}</span>}{d.docNumber && <span className="block text-[11.5px] text-[var(--text3)] font-mono">{d.docNumber}</span>}{d.notes && <span className="block text-[11.5px] text-[var(--text3)]">{d.notes}</span>}</td>
                                <td className="px-3 py-2 border-t border-[var(--border)] text-[12px] whitespace-nowrap">{d.issuedOn && <span className="block text-[var(--text3)]">Issued {day(d.issuedOn)}</span>}{d.expiresOn ? <span className={left !== null && left < 0 ? "text-red-600 font-semibold" : left !== null && left <= 60 ? "text-amber-700 font-semibold" : ""}>{left !== null && left < 0 ? "Expired" : "Valid till"} {day(d.expiresOn)}</span> : <span className="text-[var(--text3)]">No expiry</span>}</td>
                                <td className="px-3 py-2 border-t border-[var(--border)] text-[11.5px] text-[var(--text3)]">{VISIBILITY[d.visibility]}<span className="block">{d.uploadedByName ?? ""} · {day(d.createdAt)}</span></td>
                                <td className="px-3 py-2 border-t border-[var(--border)] text-right whitespace-nowrap space-x-1">
                                    <a href={d.fileUrl} target="_blank" rel="noreferrer" className={btn2}><Download size={12} /> Open</a>
                                    {d.version > 1 && <button onClick={() => setHist(d)} className={btn2} aria-label="Older versions"><History size={12} /></button>}
                                    {can.upload && !d.isArchived && <button onClick={() => setUpload({ replaces: d })} className={btn2}>New version</button>}
                                    {can.edit && <button onClick={() => act(d, { isArchived: !d.isArchived }, d.isArchived ? "Restored" : "Archived")} className={btn2}>{d.isArchived ? "Restore" : "Archive"}</button>}
                                    {can.delete && <button onClick={() => del(d)} className="text-red-600 px-1 align-middle" aria-label={`Delete ${d.title}`}><Trash2 size={14} /></button>}
                                </td>
                            </tr>
                        ) })}</tbody>
                    </table>
                </div>
            ))}
            {upload && <UploadModal categories={categories} can={can} replaces={upload.replaces} onClose={() => setUpload(null)} onSaved={() => { setUpload(null); load() }} />}
            {hist && <HistoryModal doc={hist} onClose={() => setHist(null)} />}
        </div>
    )
}

function UploadModal({ categories, can, replaces, onClose, onSaved }: { categories: string[]; can: Can; replaces?: Doc; onClose: () => void; onSaved: () => void }) {
    const [f, setF] = useState({ category: replaces?.category ?? categories[0] ?? "Other", title: replaces?.title ?? "", docNumber: replaces?.docNumber ?? "", issuedOn: "", expiresOn: "", notes: replaces?.notes ?? "", visibility: (replaces?.visibility ?? "STAFF") as Visibility })
    const [file, setFile] = useState<File | null>(null)
    const [busy, setBusy] = useState(false)
    useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }; document.addEventListener("keydown", k); return () => document.removeEventListener("keydown", k) }, [onClose])
    async function save() {
        if (!file) return toast.error("Choose the file")
        setBusy(true)
        try {
            const fd = new FormData(); fd.append("file", file); fd.append("kind", "document")
            const up = await fetch("/api/upload", { method: "POST", body: fd }); const u = await up.json().catch(() => ({}))
            if (!up.ok || !u.url) throw new Error(u.error || "Upload failed (max 5 MB)")
            const r = await fetch("/api/company/documents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...f, fileUrl: u.url, fileName: file.name, replacesId: replaces?.id }) })
            const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j?.error || "Could not save")
            toast.success(replaces ? "New version saved" : "Document saved"); onSaved()
        } catch (e: any) { toast.error(e.message) } finally { setBusy(false) }
    }
    return (
        <div onMouseDown={e => { if (e.target === e.currentTarget) onClose() }} className="fixed inset-0 z-[1000] bg-black/40 flex items-center justify-center p-4">
            <div role="dialog" aria-modal="true" aria-label="Upload document" className="w-full max-w-lg max-h-[92vh] overflow-y-auto bg-white rounded-[14px] border border-[var(--border)] shadow-xl">
                <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-[var(--border)]"><h3 className="text-[15px] font-semibold">{replaces ? `New version — ${replaces.title}` : "Upload company document"}</h3><button onClick={onClose} aria-label="Close" className="p-1 text-[var(--text3)]"><X size={18} /></button></div>
                <div className="p-5 space-y-3">
                    <label className={lbl}>File (PDF / image, max 5 MB)<input type="file" accept=".pdf,image/*,.doc,.docx,.xls,.xlsx" onChange={e => setFile(e.target.files?.[0] ?? null)} className="block text-[12.5px] mt-1" /></label>
                    <div className="grid sm:grid-cols-2 gap-3">
                        <label className={lbl}>Document name<input value={f.title} onChange={e => setF(x => ({ ...x, title: e.target.value }))} placeholder="e.g. GST registration certificate" className={box} /></label>
                        <label className={lbl}>Category<select value={f.category} onChange={e => setF(x => ({ ...x, category: e.target.value }))} className={box}>{categories.map(c => <option key={c}>{c}</option>)}</select></label>
                        <label className={lbl}>Number (optional)<input value={f.docNumber} onChange={e => setF(x => ({ ...x, docNumber: e.target.value }))} placeholder="Registration / licence no." className={box} /></label>
                        <label className={lbl}>Who can see it<select value={f.visibility} onChange={e => setF(x => ({ ...x, visibility: e.target.value as Visibility }))} className={box}>{(Object.keys(VISIBILITY) as Visibility[]).filter(v => v !== "RESTRICTED" || can.edit).map(v => <option key={v} value={v}>{VISIBILITY[v]}</option>)}</select></label>
                        <label className={lbl}>Issued on<input type="date" value={f.issuedOn} onChange={e => setF(x => ({ ...x, issuedOn: e.target.value }))} className={box} /></label>
                        <label className={lbl}>Valid till (for a reminder)<input type="date" value={f.expiresOn} onChange={e => setF(x => ({ ...x, expiresOn: e.target.value }))} className={box} /></label>
                    </div>
                    <label className={lbl}>Note<input value={f.notes} onChange={e => setF(x => ({ ...x, notes: e.target.value }))} className={box} /></label>
                    <div className="flex justify-end gap-2"><button onClick={onClose} className={btn2}>Cancel</button><button onClick={save} disabled={busy || !f.title.trim() || !file} className={btn}>{busy && <Loader2 size={14} className="animate-spin" />}Save</button></div>
                </div>
            </div>
        </div>
    )
}

function HistoryModal({ doc, onClose }: { doc: Doc; onClose: () => void }) {
    const [v, setV] = useState<Doc[] | null>(null)
    useEffect(() => { fetch(`/api/company/documents?history=${doc.id}`).then(r => r.json()).then(j => setV(j.versions ?? [])).catch(() => setV([])) }, [doc.id])
    return (
        <div onMouseDown={e => { if (e.target === e.currentTarget) onClose() }} className="fixed inset-0 z-[1000] bg-black/40 flex items-center justify-center p-4">
            <div role="dialog" aria-modal="true" aria-label="Versions" className="w-full max-w-md bg-white rounded-[14px] border border-[var(--border)] shadow-xl p-5 space-y-2">
                <div className="flex items-center justify-between"><h3 className="text-[15px] font-semibold">{doc.title} — versions</h3><button onClick={onClose} aria-label="Close" className="p-1 text-[var(--text3)]"><X size={18} /></button></div>
                {!v ? <Loader2 className="h-5 w-5 animate-spin text-[var(--text3)]" /> : v.map(x => <div key={x.id} className="flex justify-between items-center text-[13px] border-b border-[var(--border)] py-1.5"><span>v{x.version} · {day(x.createdAt)}{x.expiresOn ? ` · valid till ${day(x.expiresOn)}` : ""}</span><a href={x.fileUrl} target="_blank" rel="noreferrer" className="text-[var(--accent)] text-[12px] font-semibold">Open</a></div>)}
            </div>
        </div>
    )
}

function Settings({ s: initial, onSaved }: { s: CompanySettings; onSaved: () => void }) {
    const [s, setS] = useState(initial)
    const [busy, setBusy] = useState(false)
    async function save() {
        setBusy(true)
        try { const r = await fetch("/api/company", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ settings: s }) }); if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error || "Could not save"); toast.success("Saved"); onSaved() }
        catch (e: any) { toast.error(e.message) } finally { setBusy(false) }
    }
    return (
        <div className="bg-white border border-[var(--border)] rounded-[12px] p-4 space-y-3 max-w-xl text-[13px]">
            <p className="font-semibold">Document categories</p>
            {s.categories.map((c, i) => <div key={i} className="flex gap-2"><input value={c} onChange={e => setS(x => ({ ...x, categories: x.categories.map((y, j) => j === i ? e.target.value : y) }))} className={box} /><button onClick={() => setS(x => ({ ...x, categories: x.categories.filter((_, j) => j !== i) }))} aria-label={`Remove ${c}`} className="text-red-600 px-1"><Trash2 size={14} /></button></div>)}
            <button onClick={() => setS(x => ({ ...x, categories: [...x.categories, "New category"] }))} className={btn2}><Plus size={12} /> Add category</button>
            <label className="flex items-center gap-2 pt-2">Remind editors<input type="number" min={0} max={365} value={s.expiryRemindDays} onChange={e => setS(x => ({ ...x, expiryRemindDays: Number(e.target.value) }))} className={`${box} !w-20`} />days before a document expires (0 = off)</label>
            <div className="flex justify-end"><button onClick={save} disabled={busy} className={btn}>{busy && <Loader2 size={14} className="animate-spin" />}Save</button></div>
        </div>
    )
}
