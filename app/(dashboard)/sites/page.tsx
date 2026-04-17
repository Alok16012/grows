"use client"
import { useState, useEffect, useCallback, useRef } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
    Plus, Search, MapPin, Loader2, X, Users, Edit2,
    MoreVertical, Trash2, Phone, Building2, ChevronDown,
    CheckCircle, XCircle, UserCheck, AlertTriangle, Navigation,
    Shield, Home, Wrench, Layers, Clock, User, CalendarDays,
} from "lucide-react"
import { format } from "date-fns"

// ─── Types ────────────────────────────────────────────────────────────────────

type DeployedEmployee = {
    id: string
    employeeId: string
    firstName: string
    lastName: string
    designation?: string
    phone: string
    photo?: string
}

type Deployment = {
    id: string
    employeeId: string
    siteId: string
    startDate: string
    endDate?: string
    shift?: string
    role?: string
    isActive: boolean
    relievedAt?: string
    notes?: string
    employee: DeployedEmployee
}

type Site = {
    id: string
    name: string
    code?: string
    address: string
    city?: string
    state?: string
    pincode?: string
    clientName?: string
    branchId: string
    latitude?: number
    longitude?: number
    radius: number
    manpowerRequired: number
    contactPerson?: string
    contactPhone?: string
    siteType?: string
    shift?: string
    isActive: boolean
    createdAt: string
    branch: { id: string; name: string }
    deployments?: Deployment[]
    _count: { deployments: number; attendances: number }
}

type Employee = {
    id: string
    employeeId: string
    firstName: string
    lastName: string
    designation?: string
    photo?: string
}

type Branch = { id: string; name: string }

// ─── Constants ────────────────────────────────────────────────────────────────

const SITE_TYPES = ["Security", "Housekeeping", "Facility", "Mixed"]
const SHIFTS = ["Day", "Night", "24x7", "Rotating"]
const DEPLOY_SHIFTS = ["Morning", "Evening", "Night", "Rotating"]
const AVATAR_COLORS = ["#1a9e6e", "#3b82f6", "#8b5cf6", "#f59e0b", "#ef4444", "#06b6d4", "#f97316"]

function getAvatarColor(name: string) {
    const idx = (name.charCodeAt(0) || 0) % AVATAR_COLORS.length
    return AVATAR_COLORS[idx]
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

function Avatar({ firstName, lastName, photo, size = 32 }: {
    firstName: string; lastName: string; photo?: string; size?: number
}) {
    const initials = `${firstName[0] || ""}${lastName[0] || ""}`.toUpperCase()
    const bg = getAvatarColor(firstName)
    if (photo) {
        return (
            <img src={photo} alt={`${firstName} ${lastName}`}
                style={{ width: size, height: size }}
                className="rounded-full object-cover shrink-0" />
        )
    }
    return (
        <div style={{ width: size, height: size, background: bg, fontSize: size * 0.33 }}
            className="rounded-full flex items-center justify-center text-white font-semibold shrink-0 select-none">
            {initials}
        </div>
    )
}

// ─── Site Type Icon ───────────────────────────────────────────────────────────

function SiteTypeIcon({ type }: { type?: string }) {
    switch (type) {
        case "Security": return <Shield size={13} />
        case "Housekeeping": return <Home size={13} />
        case "Facility": return <Wrench size={13} />
        case "Mixed": return <Layers size={13} />
        default: return <MapPin size={13} />
    }
}

// ─── Site Type Badge ──────────────────────────────────────────────────────────

const TYPE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
    Security: { bg: "#eff6ff", text: "#1d4ed8", border: "#bfdbfe" },
    Housekeeping: { bg: "#f0fdf4", text: "#16a34a", border: "#bbf7d0" },
    Facility: { bg: "#fefce8", text: "#b45309", border: "#fde68a" },
    Mixed: { bg: "#f5f3ff", text: "#7c3aed", border: "#ddd6fe" },
}

function TypeBadge({ type }: { type?: string }) {
    if (!type) return null
    const c = TYPE_COLORS[type] || { bg: "#f9fafb", text: "#6b7280", border: "#e5e7eb" }
    return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-semibold border"
            style={{ background: c.bg, color: c.text, borderColor: c.border }}>
            <SiteTypeIcon type={type} />
            {type}
        </span>
    )
}

function ShiftBadge({ shift }: { shift?: string }) {
    if (!shift) return null
    return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-semibold border bg-[var(--surface2)] text-[var(--text2)] border-[var(--border)]">
            <Clock size={10} />
            {shift}
        </span>
    )
}

// ─── Input ─────────────────────────────────────────────────────────────────

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
    return (
        <div>
            <label className="block text-[12px] text-[var(--text2)] mb-1 font-medium">
                {label}{required && <span className="text-[var(--red)] ml-0.5">*</span>}
            </label>
            {children}
        </div>
    )
}

const inputCls = "w-full h-9 rounded-[8px] border border-[var(--border)] bg-white px-3 text-[13px] text-[var(--text)] outline-none focus:border-[var(--accent)] transition-colors placeholder:text-[var(--text3)]"
const selectCls = "w-full h-9 rounded-[8px] border border-[var(--border)] bg-white px-3 text-[13px] text-[var(--text)] outline-none focus:border-[var(--accent)] transition-colors"

// ─── Add Site Modal ───────────────────────────────────────────────────────────

function AddSiteModal({
    open, onClose, onSaved, branches, site,
}: {
    open: boolean; onClose: () => void; onSaved: () => void; branches: Branch[]; site?: Site | null
}) {
    const [tab, setTab] = useState<"info" | "geo">("info")
    const [loading, setLoading] = useState(false)
    const [form, setForm] = useState({
        name: "", address: "", city: "", state: "", pincode: "",
        clientName: "", contactPerson: "", contactPhone: "",
        branchId: "", siteType: "", shift: "", manpowerRequired: "1",
        latitude: "", longitude: "", radius: "100",
    })

    useEffect(() => {
        if (!open) return
        if (site) {
            setForm({
                name: site.name,
                address: site.address || "",
                city: site.city || "",
                state: site.state || "",
                pincode: site.pincode || "",
                clientName: site.clientName || "",
                contactPerson: site.contactPerson || "",
                contactPhone: site.contactPhone || "",
                branchId: site.branchId,
                siteType: site.siteType || "",
                shift: site.shift || "",
                manpowerRequired: site.manpowerRequired?.toString() || "1",
                latitude: site.latitude?.toString() || "",
                longitude: site.longitude?.toString() || "",
                radius: site.radius?.toString() || "100",
            })
        } else {
            setForm({
                name: "", address: "", city: "", state: "", pincode: "",
                clientName: "", contactPerson: "", contactPhone: "",
                branchId: branches[0]?.id || "", siteType: "", shift: "", manpowerRequired: "1",
                latitude: "", longitude: "", radius: "100",
            })
        }
        setTab("info")
    }, [open, site, branches])

    const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!form.name || !form.address || !form.branchId) {
            toast.error("Site Name, Address and Branch are required")
            return
        }
        setLoading(true)
        try {
            const url = site ? `/api/sites/${site.id}` : "/api/sites"
            const method = site ? "PUT" : "POST"
            const res = await fetch(url, {
                method,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(form),
            })
            if (!res.ok) throw new Error(await res.text())
            toast.success(site ? "Site updated!" : "Site created!")
            onSaved()
            onClose()
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : "Failed to save")
        } finally {
            setLoading(false)
        }
    }

    if (!open) return null
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <div className="bg-white rounded-[16px] border border-[var(--border)] w-full max-w-lg shadow-xl flex flex-col max-h-[90vh]">
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)] shrink-0">
                    <h2 className="text-[15px] font-semibold text-[var(--text)]">
                        {site ? "Edit Site" : "Add New Site"}
                    </h2>
                    <button onClick={onClose} className="p-1 text-[var(--text3)] hover:text-[var(--text)] rounded-md hover:bg-[var(--surface2)] transition-colors">
                        <X size={18} />
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-[var(--border)] shrink-0 px-5">
                    {(["info", "geo"] as const).map(t => (
                        <button key={t} onClick={() => setTab(t)}
                            className={`px-4 py-3 text-[13px] font-medium border-b-2 transition-colors -mb-px ${
                                tab === t
                                    ? "border-[var(--accent)] text-[var(--accent)]"
                                    : "border-transparent text-[var(--text2)] hover:text-[var(--text)]"
                            }`}>
                            {t === "info" ? "Site Info" : "Geofencing"}
                        </button>
                    ))}
                </div>

                {/* Body */}
                <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
                    <div className="flex-1 overflow-y-auto p-5 space-y-4">
                        {tab === "info" ? (
                            <>
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="col-span-2">
                                        <Field label="Site Name" required>
                                            <input value={form.name} onChange={e => set("name", e.target.value)}
                                                className={inputCls} placeholder="e.g. ABC Corporate HQ" required />
                                        </Field>
                                    </div>
                                    <div className="col-span-2">
                                        <Field label="Address" required>
                                            <input value={form.address} onChange={e => set("address", e.target.value)}
                                                className={inputCls} placeholder="Full address" required />
                                        </Field>
                                    </div>
                                    <Field label="City">
                                        <input value={form.city} onChange={e => set("city", e.target.value)}
                                            className={inputCls} placeholder="City" />
                                    </Field>
                                    <Field label="State">
                                        <input value={form.state} onChange={e => set("state", e.target.value)}
                                            className={inputCls} placeholder="State" />
                                    </Field>
                                    <Field label="Pincode">
                                        <input value={form.pincode} onChange={e => set("pincode", e.target.value)}
                                            className={inputCls} placeholder="Pincode" />
                                    </Field>
                                    {/* Branch field removed as per user request to simplify site creation */}
                                    <Field label="Site Type">
                                        <select value={form.siteType} onChange={e => set("siteType", e.target.value)} className={selectCls}>
                                            <option value="">Select Type</option>
                                            {SITE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                                        </select>
                                    </Field>
                                    <Field label="Shift">
                                        <select value={form.shift} onChange={e => set("shift", e.target.value)} className={selectCls}>
                                            <option value="">Select Shift</option>
                                            {SHIFTS.map(s => <option key={s} value={s}>{s}</option>)}
                                        </select>
                                    </Field>
                                    <div className="col-span-2">
                                        <Field label="Client / Company Name">
                                            <input value={form.clientName} onChange={e => set("clientName", e.target.value)}
                                                className={inputCls} placeholder="Client company name" />
                                        </Field>
                                    </div>
                                    <Field label="Contact Person">
                                        <input value={form.contactPerson} onChange={e => set("contactPerson", e.target.value)}
                                            className={inputCls} placeholder="Contact name" />
                                    </Field>
                                    <Field label="Contact Phone">
                                        <input value={form.contactPhone} onChange={e => set("contactPhone", e.target.value)}
                                            className={inputCls} placeholder="+91 XXXXX XXXXX" />
                                    </Field>
                                    <Field label="Manpower Required">
                                        <input type="number" min="1" value={form.manpowerRequired} onChange={e => set("manpowerRequired", e.target.value)}
                                            className={inputCls} placeholder="1" />
                                    </Field>
                                </div>
                            </>
                        ) : (
                            <>
                                <div className="bg-[var(--accent-light)] border border-[#6ee7b7]/40 rounded-[10px] p-3">
                                    <p className="text-[12.5px] text-[var(--accent)] font-medium flex items-center gap-1.5">
                                        <Navigation size={13} />
                                        Enter coordinates for GPS attendance geofencing
                                    </p>
                                    <p className="text-[11.5px] text-[var(--text2)] mt-1">
                                        Employees must check in within <strong>{form.radius || 100}m</strong> of these coordinates
                                    </p>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <Field label="Latitude">
                                        <input type="number" step="any" value={form.latitude} onChange={e => set("latitude", e.target.value)}
                                            className={inputCls} placeholder="e.g. 28.6139" />
                                    </Field>
                                    <Field label="Longitude">
                                        <input type="number" step="any" value={form.longitude} onChange={e => set("longitude", e.target.value)}
                                            className={inputCls} placeholder="e.g. 77.2090" />
                                    </Field>
                                </div>
                                <Field label="Geofence Radius (meters)">
                                    <input type="number" min="10" value={form.radius} onChange={e => set("radius", e.target.value)}
                                        className={inputCls} placeholder="100" />
                                </Field>
                                {form.latitude && form.longitude && (
                                    <div className="bg-[var(--surface2)] border border-[var(--border)] rounded-[10px] p-3 text-[12px] text-[var(--text2)]">
                                        <p className="font-medium text-[var(--text)] flex items-center gap-1.5 mb-1">
                                            <MapPin size={12} className="text-[var(--accent)]" />
                                            {form.name || "Site"} — Preview
                                        </p>
                                        <p>Lat: {form.latitude}, Lng: {form.longitude}, Radius: {form.radius || 100}m</p>
                                    </div>
                                )}
                                {!form.latitude && !form.longitude && (
                                    <div className="border border-dashed border-[var(--border)] rounded-[10px] p-6 text-center">
                                        <MapPin size={28} className="text-[var(--text3)] mx-auto mb-2" />
                                        <p className="text-[12px] text-[var(--text3)]">No coordinates set — geofencing disabled</p>
                                    </div>
                                )}
                            </>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="flex items-center justify-between px-5 py-4 border-t border-[var(--border)] shrink-0 bg-[var(--surface2)]/30">
                        <div className="flex gap-1">
                            {(["info", "geo"] as const).map(t => (
                                <div key={t} className={`h-1.5 w-6 rounded-full transition-colors ${tab === t ? "bg-[var(--accent)]" : "bg-[var(--border)]"}`} />
                            ))}
                        </div>
                        <div className="flex items-center gap-2">
                            <button type="button" onClick={onClose}
                                className="px-4 py-2 text-[13px] font-medium text-[var(--text2)] hover:text-[var(--text)] rounded-[8px] hover:bg-[var(--surface2)] transition-colors">
                                Cancel
                            </button>
                            {tab === "info" ? (
                                <button type="button" onClick={() => setTab("geo")}
                                    className="inline-flex items-center gap-2 px-5 py-2 bg-[var(--accent)] text-white rounded-[8px] text-[13px] font-medium hover:opacity-90 transition-opacity">
                                    Next: Geofencing
                                </button>
                            ) : (
                                <button type="submit" disabled={loading}
                                    className="inline-flex items-center gap-2 px-5 py-2 bg-[var(--accent)] text-white rounded-[8px] text-[13px] font-medium hover:opacity-90 transition-opacity disabled:opacity-50">
                                    {loading && <Loader2 size={14} className="animate-spin" />}
                                    {site ? "Save Changes" : "Create Site"}
                                </button>
                            )}
                        </div>
                    </div>
                </form>
            </div>
        </div>
    )
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, color, bg, icon }: {
    label: string; value: number; sub?: string; color: string; bg: string; icon: React.ReactNode
}) {
    return (
        <div className="bg-white border border-[var(--border)] rounded-[14px] p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-[10px] flex items-center justify-center shrink-0" style={{ background: bg, color }}>
                {icon}
            </div>
            <div>
                <p className="text-[22px] font-bold leading-none" style={{ color }}>{value}</p>
                <p className="text-[12px] text-[var(--text3)] mt-0.5">{label}</p>
                {sub && <p className="text-[11px] text-[var(--text3)] mt-0.5">{sub}</p>}
            </div>
        </div>
    )
}

// ─── Three-dot Menu ───────────────────────────────────────────────────────────

function SiteMenu({ site, onEdit, onDeploy, onToggle, onDelete, role }: {
    site: Site
    onEdit: () => void
    onDeploy: () => void
    onToggle: () => void
    onDelete: () => void
    role?: string
}) {
    const [open, setOpen] = useState(false)
    const ref = useRef<HTMLDivElement>(null)

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
        }
        document.addEventListener("mousedown", handler)
        return () => document.removeEventListener("mousedown", handler)
    }, [])

    return (
        <div className="relative" ref={ref}>
            <button onClick={() => setOpen(o => !o)}
                className="p-1.5 rounded-[6px] hover:bg-[var(--surface2)] text-[var(--text3)] hover:text-[var(--text)] transition-colors">
                <MoreVertical size={15} />
            </button>
            {open && (
                <div className="absolute right-0 top-full mt-1 w-44 bg-white border border-[var(--border)] rounded-[10px] shadow-lg z-20 py-1 overflow-hidden">
                    <button onClick={() => { onEdit(); setOpen(false) }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-[12.5px] text-[var(--text2)] hover:bg-[var(--surface2)] hover:text-[var(--text)] transition-colors">
                        <Edit2 size={13} /> Edit Site
                    </button>
                    <button onClick={() => { onDeploy(); setOpen(false) }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-[12.5px] text-[var(--text2)] hover:bg-[var(--surface2)] hover:text-[var(--text)] transition-colors">
                        <UserCheck size={13} /> Manage Deployments
                    </button>
                    <button onClick={() => { onToggle(); setOpen(false) }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-[12.5px] text-[var(--text2)] hover:bg-[var(--surface2)] hover:text-[var(--text)] transition-colors">
                        {site.isActive ? <XCircle size={13} /> : <CheckCircle size={13} />}
                        {site.isActive ? "Deactivate" : "Activate"}
                    </button>
                    {role === "ADMIN" && (
                        <>
                            <div className="my-1 border-t border-[var(--border)]" />
                            <button onClick={() => { onDelete(); setOpen(false) }}
                                className="w-full flex items-center gap-2 px-3 py-2 text-[12.5px] text-[var(--red)] hover:bg-red-50 transition-colors">
                                <Trash2 size={13} /> Delete Site
                            </button>
                        </>
                    )}
                </div>
            )}
        </div>
    )
}

// ─── Site Card ────────────────────────────────────────────────────────────────

function SiteCard({ site, onView, onEdit, onDeploy, onToggle, onDelete, role }: {
    site: Site
    onView: () => void
    onEdit: () => void
    onDeploy: () => void
    onToggle: () => void
    onDelete: () => void
    role?: string
}) {
    const deployed = site._count.deployments
    const required = site.manpowerRequired
    const understaffed = deployed < required
    const hasGeo = !!(site.latitude && site.longitude)
    const strengthPct = required > 0 ? Math.min((deployed / required) * 100, 100) : 0

    return (
        <div className="bg-white border border-[var(--border)] rounded-[14px] overflow-hidden hover:shadow-[0_4px_18px_rgba(0,0,0,0.06)] hover:border-[var(--accent)]/20 transition-all flex flex-col">
            <div className="p-5 flex-1">
                {/* Header Row */}
                <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="flex items-start gap-2.5 min-w-0">
                        <div className="w-9 h-9 bg-[var(--accent-light)] rounded-[9px] flex items-center justify-center shrink-0">
                            <MapPin size={16} className="text-[var(--accent)]" />
                        </div>
                        <div className="min-w-0">
                            {site.code && (
                                <p className="font-mono text-[10.5px] text-[var(--accent)] font-semibold tracking-wide mb-0.5">{site.code}</p>
                            )}
                            <h3 className="text-[14px] font-semibold text-[var(--text)] leading-tight truncate">{site.name}</h3>
                            {site.clientName && (
                                <p className="text-[11.5px] text-[var(--text3)] mt-0.5 truncate">{site.clientName}</p>
                            )}
                        </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                        <span className={`px-2 py-0.5 rounded-full text-[10.5px] font-semibold border ${
                            site.isActive
                                ? "bg-[#e8f7f1] text-[#1a9e6e] border-[#6ee7b7]"
                                : "bg-[#f9fafb] text-[#6b7280] border-[#e5e7eb]"
                        }`}>
                            {site.isActive ? "Active" : "Inactive"}
                        </span>
                        <SiteMenu site={site} onEdit={onEdit} onDeploy={onDeploy} onToggle={onToggle} onDelete={onDelete} role={role} />
                    </div>
                </div>

                {/* Address */}
                {(site.city || site.state || site.address) && (
                    <p className="text-[12px] text-[var(--text2)] mb-3 flex items-start gap-1.5">
                        <MapPin size={12} className="text-[var(--text3)] mt-0.5 shrink-0" />
                        <span className="truncate">{[site.address, site.city, site.state].filter(Boolean).join(", ")}</span>
                    </p>
                )}

                {/* Badges */}
                <div className="flex flex-wrap items-center gap-1.5 mb-3">
                    <TypeBadge type={site.siteType} />
                    <ShiftBadge shift={site.shift} />
                    {hasGeo ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-semibold border bg-[#e8f7f1] text-[#1a9e6e] border-[#6ee7b7]">
                            <Navigation size={10} /> Geofenced
                        </span>
                    ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-semibold border bg-[var(--surface2)] text-[var(--text3)] border-[var(--border)]">
                            <MapPin size={10} /> No Geofence
                        </span>
                    )}
                </div>

                {/* Strength Indicator */}
                <div className="mb-3">
                    <div className="flex items-center justify-between mb-1">
                        <span className="text-[11.5px] text-[var(--text2)] flex items-center gap-1">
                            <Users size={12} className="text-[var(--text3)]" />
                            Deployed Strength
                        </span>
                        <span className={`text-[12px] font-semibold ${understaffed ? "text-[var(--red)]" : "text-[var(--accent)]"}`}>
                            {deployed}/{required}
                            {understaffed && <AlertTriangle size={11} className="inline ml-1" />}
                        </span>
                    </div>
                    <div className="h-1.5 bg-[var(--surface2)] rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all"
                            style={{
                                width: `${strengthPct}%`,
                                background: understaffed ? "var(--red)" : "var(--accent)"
                            }} />
                    </div>
                </div>

                {/* Contact */}
                {(site.contactPerson || site.contactPhone) && (
                    <div className="text-[11.5px] text-[var(--text2)] flex items-center gap-1.5">
                        <Phone size={11} className="text-[var(--text3)]" />
                        {site.contactPerson && <span>{site.contactPerson}</span>}
                        {site.contactPhone && <span className="text-[var(--text3)]">· {site.contactPhone}</span>}
                    </div>
                )}
            </div>

            {/* Footer */}
            <div className="border-t border-[var(--border)] px-5 py-3 flex items-center justify-between bg-[var(--surface2)]/30">
                <span className="text-[11px] text-[var(--text3)]">
                    {/* Branch name hidden as per simplified view request */}
                </span>
                <button onClick={onView}
                    className="inline-flex items-center gap-1 text-[12px] font-semibold text-[var(--accent)] hover:opacity-80 transition-opacity">
                    View Details <ChevronDown size={13} className="-rotate-90" />
                </button>
            </div>
        </div>
    )
}

// ─── Assign Employee Form ─────────────────────────────────────────────────────

function AssignForm({ siteId, onAssigned, onCancel }: {
    siteId: string; onAssigned: () => void; onCancel: () => void
}) {
    const [employees, setEmployees] = useState<Employee[]>([])
    const [loading, setLoading] = useState(false)
    const [fetching, setFetching] = useState(true)
    const [form, setForm] = useState({
        employeeId: "", role: "", shift: "", startDate: format(new Date(), "yyyy-MM-dd"),
    })

    useEffect(() => {
        setFetching(true)
        fetch("/api/employees?status=ACTIVE")
            .then(r => r.json())
            .then(async (all: Employee[]) => {
                // filter out already deployed employees
                const depsRes = await fetch("/api/deployments?isActive=true")
                const deps: Deployment[] = await depsRes.json()
                const deployedIds = new Set(deps.map(d => d.employeeId))
                setEmployees(all.filter(e => !deployedIds.has(e.id)))
            })
            .catch(() => setEmployees([]))
            .finally(() => setFetching(false))
    }, [])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!form.employeeId) { toast.error("Select an employee"); return }
        setLoading(true)
        try {
            const res = await fetch("/api/deployments", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ...form, siteId }),
            })
            if (!res.ok) throw new Error(await res.text())
            toast.success("Employee assigned!")
            onAssigned()
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : "Failed to assign")
        } finally {
            setLoading(false)
        }
    }

    return (
        <form onSubmit={handleSubmit} className="bg-[var(--surface2)]/50 border border-[var(--border)] rounded-[12px] p-4 space-y-3 mt-3">
            <p className="text-[12.5px] font-semibold text-[var(--text)]">Assign Employee</p>
            <div className="grid grid-cols-2 gap-2">
                <div className="col-span-2">
                    <select value={form.employeeId} onChange={e => setForm(f => ({ ...f, employeeId: e.target.value }))}
                        className={selectCls} required disabled={fetching}>
                        <option value="">{fetching ? "Loading..." : "Select Employee"}</option>
                        {employees.map(emp => (
                            <option key={emp.id} value={emp.id}>
                                {emp.firstName} {emp.lastName} ({emp.employeeId})
                            </option>
                        ))}
                    </select>
                </div>
                <input value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
                    className={inputCls} placeholder="Role (e.g. Guard)" />
                <select value={form.shift} onChange={e => setForm(f => ({ ...f, shift: e.target.value }))} className={selectCls}>
                    <option value="">Shift</option>
                    {DEPLOY_SHIFTS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <div className="col-span-2">
                    <input type="date" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))}
                        className={inputCls} required />
                </div>
            </div>
            <div className="flex items-center justify-end gap-2">
                <button type="button" onClick={onCancel}
                    className="px-3 py-1.5 text-[12px] font-medium text-[var(--text2)] hover:text-[var(--text)] rounded-[7px] hover:bg-[var(--surface2)] transition-colors">
                    Cancel
                </button>
                <button type="submit" disabled={loading}
                    className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-[var(--accent)] text-white rounded-[7px] text-[12px] font-medium hover:opacity-90 disabled:opacity-50 transition-opacity">
                    {loading && <Loader2 size={12} className="animate-spin" />}
                    Assign
                </button>
            </div>
        </form>
    )
}

// ─── Relieve Dialog ───────────────────────────────────────────────────────────

function RelieveDialog({ deployment, onRelieved, onCancel }: {
    deployment: Deployment; onRelieved: () => void; onCancel: () => void
}) {
    const [loading, setLoading] = useState(false)
    const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"))

    const handleRelieve = async () => {
        setLoading(true)
        try {
            const res = await fetch(`/api/deployments/${deployment.id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ relievedAt: date }),
            })
            if (!res.ok) throw new Error(await res.text())
            toast.success("Employee relieved")
            onRelieved()
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : "Failed")
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="bg-red-50 border border-red-200 rounded-[10px] p-3 mt-2">
            <p className="text-[12px] font-medium text-red-700 mb-2">
                Relieve {deployment.employee.firstName} {deployment.employee.lastName}?
            </p>
            <div className="flex items-center gap-2">
                <input type="date" value={date} onChange={e => setDate(e.target.value)}
                    className="flex-1 h-8 rounded-[7px] border border-red-200 bg-white px-2 text-[12px] outline-none focus:border-red-400 transition-colors" />
                <button onClick={onCancel}
                    className="px-3 py-1.5 text-[12px] text-[var(--text2)] hover:text-[var(--text)] rounded-[7px] hover:bg-white transition-colors">
                    Cancel
                </button>
                <button onClick={handleRelieve} disabled={loading}
                    className="inline-flex items-center gap-1 px-3 py-1.5 bg-[var(--red)] text-white rounded-[7px] text-[12px] font-medium hover:opacity-90 disabled:opacity-50 transition-opacity">
                    {loading && <Loader2 size={11} className="animate-spin" />}
                    Confirm
                </button>
            </div>
        </div>
    )
}

// ─── Site Detail Drawer ───────────────────────────────────────────────────────

function SiteDrawer({ site, onClose, onRefresh, role }: {
    site: Site; onClose: () => void; onRefresh: () => void; role?: string
}) {
    const [detailedSite, setDetailedSite] = useState<Site | null>(null)
    const [loadingDetail, setLoadingDetail] = useState(false)
    const [showAssign, setShowAssign] = useState(false)
    const [relieveTarget, setRelieveTarget] = useState<Deployment | null>(null)

    const fetchDetail = useCallback(async () => {
        setLoadingDetail(true)
        try {
            const res = await fetch(`/api/sites/${site.id}`)
            const data = await res.json()
            setDetailedSite(data)
        } catch {
            toast.error("Failed to load site details")
        } finally {
            setLoadingDetail(false)
        }
    }, [site.id])

    useEffect(() => {
        fetchDetail()
    }, [fetchDetail])

    const s = detailedSite || site
    const deployments = detailedSite?.deployments || []
    const deployed = deployments.filter(d => d.isActive)
    const required = s.manpowerRequired
    const strengthPct = required > 0 ? Math.min((deployed.length / required) * 100, 100) : 0
    const understaffed = deployed.length < required
    const hasGeo = !!(s.latitude && s.longitude)

    return (
        <div className="fixed inset-0 z-40 flex justify-end">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px]" onClick={onClose} />

            {/* Panel */}
            <div className="relative w-full max-w-[520px] bg-white border-l border-[var(--border)] flex flex-col h-full shadow-2xl overflow-hidden">
                {/* Header */}
                <div className="flex items-start justify-between px-5 py-4 border-b border-[var(--border)] shrink-0 bg-[var(--surface)]">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            {s.code && (
                                <span className="font-mono text-[11px] text-[var(--accent)] font-bold bg-[var(--accent-light)] px-2 py-0.5 rounded">{s.code}</span>
                            )}
                            <span className={`px-2 py-0.5 rounded-full text-[10.5px] font-semibold border ${
                                s.isActive ? "bg-[#e8f7f1] text-[#1a9e6e] border-[#6ee7b7]" : "bg-[#f9fafb] text-[#6b7280] border-[#e5e7eb]"
                            }`}>
                                {s.isActive ? "Active" : "Inactive"}
                            </span>
                        </div>
                        <h2 className="text-[17px] font-semibold text-[var(--text)] leading-tight">{s.name}</h2>
                        <div className="flex items-center gap-1.5 mt-1">
                            <TypeBadge type={s.siteType} />
                            <ShiftBadge shift={s.shift} />
                        </div>
                    </div>
                    <button onClick={onClose} className="p-1.5 text-[var(--text3)] hover:text-[var(--text)] rounded-[8px] hover:bg-[var(--surface2)] transition-colors">
                        <X size={18} />
                    </button>
                </div>

                {/* Scrollable Body */}
                <div className="flex-1 overflow-y-auto">
                    {loadingDetail && (
                        <div className="flex items-center justify-center py-8">
                            <Loader2 size={22} className="animate-spin text-[var(--accent)]" />
                        </div>
                    )}

                    {/* Info Grid */}
                    <div className="p-5 border-b border-[var(--border)]">
                        <h3 className="text-[11px] font-semibold text-[var(--text3)] uppercase tracking-[0.5px] mb-3">Site Information</h3>
                        <div className="grid grid-cols-2 gap-2">
                            {[
                                { label: "Client", value: s.clientName || "—" },
                                { label: "Address", value: [s.address, s.city, s.state, s.pincode].filter(Boolean).join(", ") || "—" },
                                { label: "Contact", value: s.contactPerson || "—" },
                                { label: "Phone", value: s.contactPhone || "—" },
                                { label: "Manpower Req.", value: `${required} employees` },
                                { label: "Shift", value: s.shift || "—" },
                                { label: "Geofence", value: hasGeo ? `${s.radius}m radius` : "Not configured" },
                            ].map(({ label, value }) => (
                                <div key={label} className="bg-[var(--surface2)]/50 border border-[var(--border)] rounded-[9px] p-2.5">
                                    <p className="text-[10px] text-[var(--text3)] font-semibold uppercase tracking-[0.4px]">{label}</p>
                                    <p className="text-[12.5px] text-[var(--text)] font-medium mt-0.5 truncate">{value}</p>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Deployed Employees */}
                    <div className="p-5 border-b border-[var(--border)]">
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="text-[11px] font-semibold text-[var(--text3)] uppercase tracking-[0.5px]">
                                Current Deployment
                            </h3>
                            <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold border ${
                                understaffed
                                    ? "bg-red-50 text-[var(--red)] border-red-200"
                                    : "bg-[#e8f7f1] text-[#1a9e6e] border-[#6ee7b7]"
                            }`}>
                                {deployed.length}/{required}
                            </span>
                        </div>

                        {/* Strength Bar */}
                        <div className="mb-4">
                            <div className="flex items-center justify-between mb-1">
                                <span className="text-[11px] text-[var(--text3)]">
                                    {deployed.length} of {required} deployed
                                </span>
                                <span className="text-[11px] text-[var(--text3)]">{Math.round(strengthPct)}%</span>
                            </div>
                            <div className="h-2 bg-[var(--surface2)] rounded-full overflow-hidden">
                                <div className="h-full rounded-full transition-all"
                                    style={{ width: `${strengthPct}%`, background: understaffed ? "var(--red)" : "var(--accent)" }} />
                            </div>
                        </div>

                        {/* Employees Table */}
                        {deployed.length > 0 ? (
                            <div className="space-y-2">
                                {deployed.map(dep => (
                                    <div key={dep.id}>
                                        <div className="flex items-center gap-3 p-3 bg-[var(--surface2)]/40 border border-[var(--border)] rounded-[10px]">
                                            <Avatar
                                                firstName={dep.employee.firstName}
                                                lastName={dep.employee.lastName}
                                                photo={dep.employee.photo}
                                                size={34}
                                            />
                                            <div className="flex-1 min-w-0">
                                                <p className="text-[13px] font-semibold text-[var(--text)] truncate">
                                                    {dep.employee.firstName} {dep.employee.lastName}
                                                </p>
                                                <p className="text-[11px] text-[var(--text3)]">
                                                    {dep.employee.employeeId}
                                                    {dep.role && ` · ${dep.role}`}
                                                </p>
                                            </div>
                                            <div className="text-right shrink-0">
                                                {dep.shift && (
                                                    <span className="block text-[10.5px] text-[var(--text2)] bg-[var(--surface2)] border border-[var(--border)] px-1.5 py-0.5 rounded text-center mb-1">
                                                        {dep.shift}
                                                    </span>
                                                )}
                                                <p className="text-[10px] text-[var(--text3)]">
                                                    <CalendarDays size={9} className="inline mr-0.5" />
                                                    {format(new Date(dep.startDate), "dd MMM yy")}
                                                </p>
                                            </div>
                                            <button
                                                onClick={() => setRelieveTarget(dep)}
                                                className="px-2.5 py-1.5 text-[11px] font-medium text-[var(--red)] bg-red-50 border border-red-200 rounded-[7px] hover:bg-red-100 transition-colors shrink-0">
                                                Relieve
                                            </button>
                                        </div>
                                        {relieveTarget?.id === dep.id && (
                                            <RelieveDialog
                                                deployment={dep}
                                                onRelieved={() => { setRelieveTarget(null); fetchDetail(); onRefresh() }}
                                                onCancel={() => setRelieveTarget(null)}
                                            />
                                        )}
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="text-center py-6 border border-dashed border-[var(--border)] rounded-[10px]">
                                <Users size={24} className="text-[var(--text3)] mx-auto mb-1.5" />
                                <p className="text-[12px] text-[var(--text3)]">No employees deployed</p>
                            </div>
                        )}

                        {/* Assign Button / Form */}
                        {(role === "ADMIN" || role === "MANAGER") && !showAssign && (
                            <button
                                onClick={() => setShowAssign(true)}
                                className="mt-3 w-full flex items-center justify-center gap-2 h-9 border border-dashed border-[var(--accent)]/50 rounded-[9px] text-[13px] font-medium text-[var(--accent)] hover:bg-[var(--accent-light)] transition-colors">
                                <Plus size={15} /> Assign Employee
                            </button>
                        )}
                        {showAssign && (
                            <AssignForm
                                siteId={site.id}
                                onAssigned={() => { setShowAssign(false); fetchDetail(); onRefresh() }}
                                onCancel={() => setShowAssign(false)}
                            />
                        )}
                    </div>

                    {/* Geofence Section */}
                    {hasGeo && (
                        <div className="p-5">
                            <h3 className="text-[11px] font-semibold text-[var(--text3)] uppercase tracking-[0.5px] mb-3">
                                Geofence Configuration
                            </h3>
                            <div className="bg-[var(--accent-light)] border border-[#6ee7b7]/40 rounded-[12px] p-4">
                                <div className="flex items-center gap-2 mb-3">
                                    <Navigation size={14} className="text-[var(--accent)]" />
                                    <span className="text-[13px] font-semibold text-[var(--accent)]">GPS Geofencing Active</span>
                                </div>
                                <div className="grid grid-cols-3 gap-2">
                                    {[
                                        { label: "Latitude", value: s.latitude?.toFixed(6) || "—" },
                                        { label: "Longitude", value: s.longitude?.toFixed(6) || "—" },
                                        { label: "Radius", value: `${s.radius}m` },
                                    ].map(({ label, value }) => (
                                        <div key={label} className="bg-white/70 rounded-[8px] p-2 text-center">
                                            <p className="text-[10px] text-[var(--text3)] font-medium uppercase tracking-[0.3px]">{label}</p>
                                            <p className="text-[12.5px] font-bold text-[var(--text)] mt-0.5">{value}</p>
                                        </div>
                                    ))}
                                </div>
                                <div className="mt-3 border border-[#6ee7b7]/40 rounded-[9px] p-3 bg-white/50 text-center">
                                    <p className="text-[11.5px] text-[var(--text2)]">
                                        <MapPin size={11} className="inline mr-1 text-[var(--accent)]" />
                                        <strong>{s.name}</strong> — Lat: {s.latitude?.toFixed(4)}, Lng: {s.longitude?.toFixed(4)}, Radius: {s.radius}m
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}
                    {!hasGeo && (
                        <div className="p-5">
                            <h3 className="text-[11px] font-semibold text-[var(--text3)] uppercase tracking-[0.5px] mb-3">
                                Geofence Configuration
                            </h3>
                            <div className="border border-dashed border-[var(--border)] rounded-[12px] p-6 text-center">
                                <MapPin size={28} className="text-[var(--text3)] mx-auto mb-2" />
                                <p className="text-[13px] font-medium text-[var(--text2)]">No Geofence Configured</p>
                                <p className="text-[11.5px] text-[var(--text3)] mt-1">Edit site to add GPS coordinates for attendance tracking</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SitesPage() {
    const { data: session, status } = useSession()
    const router = useRouter()
    const role = session?.user?.role

    const [sites, setSites] = useState<Site[]>([])
    const [branches, setBranches] = useState<Branch[]>([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState("")
    const [statusFilter, setStatusFilter] = useState<"" | "true" | "false">("")
    const [typeFilter, setTypeFilter] = useState("")
    const [showModal, setShowModal] = useState(false)
    const [editSite, setEditSite] = useState<Site | null>(null)
    const [detailSite, setDetailSite] = useState<Site | null>(null)

    useEffect(() => {
        if (status !== "unauthenticated") return
        router.push("/login")
    }, [status, router])

    useEffect(() => {
        fetch("/api/branches")
            .then(r => r.json())
            .then(d => setBranches(Array.isArray(d) ? d : []))
            .catch(() => {})
    }, [])

    const fetchSites = useCallback(async () => {
        setLoading(true)
        try {
            const params = new URLSearchParams()
            if (statusFilter !== "") params.set("isActive", statusFilter)
            if (typeFilter) params.set("siteType", typeFilter)
            if (search) params.set("search", search)
            const res = await fetch(`/api/sites?${params}`)
            const data = await res.json()
            setSites(Array.isArray(data) ? data : [])
        } catch {
            toast.error("Failed to load sites")
        } finally {
            setLoading(false)
        }
    }, [statusFilter, typeFilter, search])

    useEffect(() => {
        if (status === "authenticated") fetchSites()
    }, [status, fetchSites])

    // Stats
    const totalSites = sites.length
    const activeSites = sites.filter(s => s.isActive).length
    const totalDeployed = sites.reduce((acc, s) => acc + s._count.deployments, 0)
    const understaffedSites = sites.filter(s => s._count.deployments < s.manpowerRequired).length

    const handleToggle = async (site: Site) => {
        try {
            const res = await fetch(`/api/sites/${site.id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ isActive: !site.isActive }),
            })
            if (!res.ok) throw new Error(await res.text())
            toast.success(site.isActive ? "Site deactivated" : "Site activated")
            fetchSites()
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : "Failed")
        }
    }

    const handleDelete = async (site: Site) => {
        if (!confirm(`Delete site "${site.name}"? This cannot be undone.`)) return
        try {
            const res = await fetch(`/api/sites/${site.id}`, { method: "DELETE" })
            if (!res.ok) throw new Error(await res.text())
            toast.success("Site deleted")
            fetchSites()
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : "Failed")
        }
    }

    return (
        <div className="space-y-5 pb-8">
            {/* Page Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-[24px] font-semibold tracking-[-0.4px] text-[var(--text)]">Sites</h1>
                    <p className="text-[13px] text-[var(--text3)] mt-0.5">Manage client sites and employee deployments</p>
                </div>
                <button
                    onClick={() => { setEditSite(null); setShowModal(true) }}
                    className="inline-flex items-center gap-2 bg-[var(--accent)] text-white rounded-[10px] text-[13px] font-medium px-4 py-2 hover:opacity-90 transition-opacity">
                    <Plus size={16} /> Add Site
                </button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <StatCard label="Total Sites" value={totalSites} color="#3b82f6" bg="#eff6ff"
                    icon={<Building2 size={18} />} />
                <StatCard label="Active Sites" value={activeSites} color="#1a9e6e" bg="#e8f7f1"
                    icon={<CheckCircle size={18} />} />
                <StatCard label="Total Deployed" value={totalDeployed} color="#1a9e6e" bg="#e8f7f1"
                    icon={<Users size={18} />} sub="active deployments" />
                <StatCard label="Understaffed" value={understaffedSites} color="#dc2626" bg="#fef2f2"
                    icon={<AlertTriangle size={18} />} sub="below required strength" />
            </div>

            {/* Filters */}
            <div className="bg-white border border-[var(--border)] rounded-[12px] p-3 flex flex-wrap items-center gap-2.5">
                {/* Status Pills */}
                <div className="flex items-center gap-1 bg-[var(--surface2)] rounded-[8px] p-1">
                    {([["", "All"], ["true", "Active"], ["false", "Inactive"]] as const).map(([val, label]) => (
                        <button key={val} onClick={() => setStatusFilter(val)}
                            className={`px-3 py-1 rounded-[6px] text-[12px] font-medium transition-colors ${
                                statusFilter === val
                                    ? "bg-white text-[var(--text)] shadow-sm border border-[var(--border)]"
                                    : "text-[var(--text2)] hover:text-[var(--text)]"
                            }`}>
                            {label}
                        </button>
                    ))}
                </div>

                {/* Site Type Filter */}
                <div className="flex items-center gap-1 bg-[var(--surface2)] rounded-[8px] p-1">
                    {([["", "All Types"], ...SITE_TYPES.map(t => [t, t])] as [string, string][]).map(([val, label]) => (
                        <button key={val} onClick={() => setTypeFilter(val)}
                            className={`px-3 py-1 rounded-[6px] text-[12px] font-medium transition-colors ${
                                typeFilter === val
                                    ? "bg-white text-[var(--text)] shadow-sm border border-[var(--border)]"
                                    : "text-[var(--text2)] hover:text-[var(--text)]"
                            }`}>
                            {label}
                        </button>
                    ))}
                </div>

                {/* Search */}
                <div className="relative flex-1 min-w-[180px]">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text3)]" />
                    <input
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Search by name, code, client..."
                        className="w-full h-9 rounded-[8px] border border-[var(--border)] bg-[var(--surface2)]/30 pl-8 pr-3 text-[13px] text-[var(--text)] outline-none focus:border-[var(--accent)] transition-colors placeholder:text-[var(--text3)]"
                    />
                </div>
            </div>

            {/* Site Grid */}
            {loading ? (
                <div className="flex items-center justify-center py-16">
                    <Loader2 size={28} className="animate-spin text-[var(--accent)]" />
                </div>
            ) : sites.length === 0 ? (
                <div className="flex min-h-[280px] flex-col items-center justify-center rounded-[14px] bg-white border border-dashed border-[var(--border)]">
                    <MapPin size={40} className="text-[var(--text3)] mb-3" />
                    <p className="text-[15px] font-semibold text-[var(--text)]">No sites found</p>
                    <p className="text-[13px] text-[var(--text3)] mt-1">
                        {search || statusFilter || typeFilter
                            ? "Try adjusting your filters"
                            : "Add your first client site to get started"}
                    </p>
                    {!search && !statusFilter && !typeFilter && (
                        <button
                            onClick={() => { setEditSite(null); setShowModal(true) }}
                            className="mt-4 inline-flex items-center gap-2 bg-[var(--accent)] text-white rounded-[10px] text-[13px] font-medium px-4 py-2 hover:opacity-90 transition-opacity">
                            <Plus size={15} /> Add First Site
                        </button>
                    )}
                </div>
            ) : (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                    {sites.map(site => (
                        <SiteCard
                            key={site.id}
                            site={site}
                            role={role}
                            onView={() => setDetailSite(site)}
                            onEdit={() => { setEditSite(site); setShowModal(true) }}
                            onDeploy={() => setDetailSite(site)}
                            onToggle={() => handleToggle(site)}
                            onDelete={() => handleDelete(site)}
                        />
                    ))}
                </div>
            )}

            {/* Add/Edit Site Modal */}
            <AddSiteModal
                open={showModal}
                onClose={() => { setShowModal(false); setEditSite(null) }}
                onSaved={fetchSites}
                branches={branches}
                site={editSite}
            />

            {/* Site Detail Drawer */}
            {detailSite && (
                <SiteDrawer
                    site={detailSite}
                    role={role}
                    onClose={() => setDetailSite(null)}
                    onRefresh={fetchSites}
                />
            )}
        </div>
    )
}
