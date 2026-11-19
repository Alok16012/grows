"use client"

// Form building blocks shared by the Announcements page and its Polls /
// Surveys tabs: the side drawer, labelled fields, the save/cancel footer and
// the site/role audience picker.

import { X, Loader2, Users } from "lucide-react"

export type Site = { id: string; name: string }
export type Role = { id: string; name: string }

export const inputClass =
    "w-full rounded-[8px] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[13px] text-[var(--text)] outline-none focus:border-[var(--accent)] transition-colors"

export function Drawer({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
    return (
        <>
            <div className="fixed inset-0 z-40 bg-black/20" onClick={onClose} />
            <div role="dialog" aria-modal="true" aria-label={title}
                className={`fixed top-0 right-0 h-full ${wide ? "w-[560px]" : "w-[420px]"} max-w-full z-50 bg-[var(--surface)] border-l border-[var(--border)] shadow-2xl flex flex-col`}>
                <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)] shrink-0">
                    <h2 className="text-[15px] font-semibold text-[var(--text)]">{title}</h2>
                    <button onClick={onClose} aria-label="Close" className="p-2 md:p-1 text-[var(--text3)] hover:text-[var(--text)] rounded-md hover:bg-[var(--surface2)]"><X size={18} /></button>
                </div>
                <div className="flex-1 overflow-y-auto p-5">{children}</div>
            </div>
        </>
    )
}

// Audience targeting picker — choose which sites/roles a notice, holiday,
// poll or survey is limited to. Nothing selected on a dimension = everyone.
export function AudiencePicker({
    sites, roles, siteIds, roleIds, setSiteIds, setRoleIds,
}: {
    sites: Site[]; roles: Role[]
    siteIds: string[]; roleIds: string[]
    setSiteIds: (v: string[]) => void; setRoleIds: (v: string[]) => void
}) {
    const toggle = (arr: string[], id: string, set: (v: string[]) => void) =>
        set(arr.includes(id) ? arr.filter(x => x !== id) : [...arr, id])

    const Group = ({ label, items, selected, set }: { label: string; items: { id: string; name: string }[]; selected: string[]; set: (v: string[]) => void }) => (
        <Field label={`${label} ${selected.length ? `(${selected.length})` : "— Everyone"}`}>
            {items.length === 0 ? (
                <p className="text-[12px] text-[var(--text3)]">None available</p>
            ) : (
                <div className="max-h-[140px] overflow-y-auto rounded-[8px] border border-[var(--border)] bg-[var(--surface)] divide-y divide-[var(--border)]">
                    {items.map(it => (
                        <label key={it.id} className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-[var(--surface2)]">
                            <input type="checkbox" checked={selected.includes(it.id)} onChange={() => toggle(selected, it.id, set)} className="accent-[var(--accent)]" />
                            <span className="text-[13px] text-[var(--text2)]">{it.name}</span>
                        </label>
                    ))}
                </div>
            )}
        </Field>
    )

    return (
        <div className="space-y-4 pt-2 mt-2 border-t border-[var(--border)]">
            <div className="flex items-center gap-1.5 text-[12px] font-medium text-[var(--text2)]">
                <Users size={13} /> Audience <span className="font-normal text-[var(--text3)]">— leave blank for everyone</span>
            </div>
            <Group label="Sites" items={sites} selected={siteIds} set={setSiteIds} />
            <Group label="Roles" items={roles} selected={roleIds} set={setRoleIds} />
        </div>
    )
}

export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
    return (
        <div className="space-y-1.5">
            <label className="block text-[12px] text-[var(--text2)]">{label}</label>
            {children}
            {hint && <p className="text-[11.5px] text-[var(--text3)]">{hint}</p>}
        </div>
    )
}

export function FormFooter({ saving, onClose, onSubmit, label, secondary }: {
    saving: boolean; onClose: () => void; onSubmit: () => void; label: string
    /** Optional extra action between Cancel and the main button (e.g. "Save draft"). */
    secondary?: { label: string; onClick: () => void }
}) {
    return (
        <div className="flex gap-2 mt-6">
            <button onClick={onClose} disabled={saving}
                className="flex-1 py-2.5 rounded-[8px] border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] text-[13px] font-medium hover:bg-[var(--surface2)] transition-colors">
                Cancel
            </button>
            {secondary && (
                <button onClick={secondary.onClick} disabled={saving}
                    className="flex-1 py-2.5 rounded-[8px] border border-[var(--accent)] text-[var(--accent)] bg-[var(--surface)] text-[13px] font-medium hover:bg-[var(--accent-light)] transition-colors disabled:opacity-60">
                    {secondary.label}
                </button>
            )}
            <button onClick={onSubmit} disabled={saving}
                className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 rounded-[8px] bg-[var(--accent)] text-white text-[13px] font-medium hover:opacity-90 transition-opacity disabled:opacity-60">
                {saving ? <Loader2 size={14} className="animate-spin" /> : null} {label}
            </button>
        </div>
    )
}

/** "in 3 days", "closed 19 Nov" style deadline label. */
export function deadlineLabel(closesAt: string | null, open: boolean): string | null {
    if (!closesAt) return null
    const d = new Date(closesAt)
    const date = d.toLocaleDateString("en-IN", { day: "numeric", month: "short" })
    if (!open) return `Closed ${date}`
    const days = Math.ceil((d.getTime() - Date.now()) / 86_400_000)
    return days <= 0 ? "Closes today" : days === 1 ? "Closes tomorrow" : `Closes ${date}`
}

export function StatusPill({ status }: { status: string }) {
    const map: Record<string, { label: string; cls: string }> = {
        ACTIVE: { label: "Open", cls: "bg-[var(--success-light)] text-[var(--success)] border-[var(--success-border)]" },
        CLOSED: { label: "Closed", cls: "bg-[var(--surface2)] text-[var(--text2)] border-[var(--border)]" },
        DRAFT: { label: "Draft", cls: "bg-[var(--gold-light)] text-[var(--gold-dark)] border-[#fde3a7]" },
    }
    const s = map[status] ?? map.CLOSED
    return <span className={`inline-flex items-center px-2 py-[2px] rounded-full text-[11px] font-semibold border ${s.cls}`}>{s.label}</span>
}

export function EmptyState({ icon, title, hint }: { icon: React.ReactNode; title: string; hint?: string }) {
    return (
        <div className="rounded-[12px] border border-dashed border-[var(--border)] py-12 px-4 text-center">
            <div className="mx-auto mb-2 w-fit text-[var(--text3)]">{icon}</div>
            <p className="text-[13px] font-medium text-[var(--text2)]">{title}</p>
            {hint && <p className="text-[12.5px] text-[var(--text3)] mt-1">{hint}</p>}
        </div>
    )
}
