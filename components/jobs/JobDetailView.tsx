"use client"

import {
    Briefcase, MapPin, IndianRupee, Users, Building2, Bus, UtensilsCrossed,
    Home, Clock, ExternalLink, Send, Layers, ShieldCheck,
    Languages as LanguagesIcon, Sparkles, CheckCircle2,
} from "lucide-react"
import { JobPosting, STATUS_META, formatExperience, formatSalary } from "./constants"

const yn = (v: boolean) => (v ? "Available" : "Not Available")

function mapEmbedSrc(q: string) {
    return `https://maps.google.com/maps?q=${encodeURIComponent(q)}&z=14&output=embed`
}
function mapLink(q: string) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`
}
// Pull lat,lng out of a pasted Google Maps URL so the embed lands on the exact
// pin. Handles the common URL shapes; returns null when no coords are present.
function coordsFromMapUrl(url: string): string | null {
    if (!url) return null
    const patterns = [
        /@(-?\d+\.\d+),(-?\d+\.\d+)/,                 // .../@18.59,73.74,15z
        /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/,             // ...!3d18.59!4d73.74
        /[?&](?:q|query|ll|center)=(-?\d+\.\d+),\s*(-?\d+\.\d+)/, // ?q=18.59,73.74
    ]
    for (const re of patterns) {
        const m = url.match(re)
        if (m) return `${m[1]},${m[2]}`
    }
    return null
}

export function JobDetailView({ job, onApply }: { job: JobPosting; onApply?: () => void }) {
    const meta = STATUS_META[job.status]
    const company = job.companyName || "Growus Auto India"
    const partLabel = job.partSectionLabel || "Inspection Part (Sample)"
    const mapQuery = job.plantAddress || job.plantLocation || ""
    // Prefer the exact pin from a pasted Google Maps link; fall back to address text.
    const mapUrl = job.mapUrl || ""
    const mapCoords = coordsFromMapUrl(mapUrl)
    const embedSrc = mapCoords ? mapEmbedSrc(mapCoords) : (mapQuery ? mapEmbedSrc(mapQuery) : "")
    const openMapHref = mapUrl || (mapQuery ? mapLink(mapQuery) : "")
    const hasMap = !!(embedSrc || openMapHref)

    const hasPart = !!(job.partPhotoUrl || job.partName || job.partMaterial || job.inspectionType || job.qualityStandard)
    const hasCustomer = !!(job.customerName || job.plantLocation || job.plantAddress || job.mapUrl || job.shiftType ||
        job.canteenAvailable || job.transportAvailable || job.accommodationAvailable)
    const hasFacility = !!(job.busFacility || job.canteenAvailable || job.accommodationAvailable ||
        job.shiftType || job.weeklyOff || job.overtimePolicy)

    return (
        <div className="rounded-2xl border border-[var(--border)] bg-white overflow-hidden">
            {/* ── Header ── */}
            <div className="p-6 border-b border-[var(--border)]">
                <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                        <div className="flex items-center gap-2.5 flex-wrap">
                            <h1 className="text-2xl font-bold text-[var(--text)]">{job.title}</h1>
                            <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${meta.cls}`}>{meta.label}</span>
                        </div>
                        <p className="text-[15px] text-[var(--text2)] mt-1">{company}</p>
                        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 mt-4 text-[13px] text-[var(--text2)]">
                            <span className="inline-flex items-center gap-1.5">
                                <Briefcase size={15} className="text-[var(--text3)]" />
                                {formatExperience(job.workExpMin, job.workExpMax, job.freshersAllowed)}
                            </span>
                            <span className="inline-flex items-center gap-1.5">
                                <IndianRupee size={15} className="text-[var(--text3)]" />
                                {formatSalary(job.salaryMin, job.salaryMax, job.salaryPeriod)}
                            </span>
                            {(job.jobLocation || job.plantLocation) && (
                                <span className="inline-flex items-center gap-1.5">
                                    <MapPin size={15} className="text-[var(--text3)]" />
                                    {job.jobLocation || job.plantLocation}
                                </span>
                            )}
                        </div>
                        <div className="mt-3 text-[13px] text-[var(--text2)] inline-flex items-center gap-1.5">
                            <Users size={14} className="text-[var(--text3)]" /> Openings: <b className="text-[var(--text)]">{job.openings}</b>
                        </div>
                    </div>
                    <div className="h-12 w-12 shrink-0 rounded-xl bg-violet-100 text-violet-600 flex items-center justify-center font-bold text-lg">
                        {company.charAt(0).toUpperCase()}
                    </div>
                </div>
            </div>

            <div className="p-6 space-y-6">
                {/* ── Sample part + Customer location ── */}
                {(hasPart || hasMap) && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {(job.partPhotoUrl || job.partName) && (
                            <div>
                                <SectionTitle>{partLabel}</SectionTitle>
                                <div className="rounded-xl border border-[var(--border)] overflow-hidden">
                                    {job.partPhotoUrl
                                        ? <img src={job.partPhotoUrl} alt={job.partName || "Part"} className="w-full h-64 object-cover bg-[var(--surface2)]" />
                                        : <div className="w-full h-64 bg-[var(--surface2)] flex items-center justify-center text-[var(--text3)] text-[13px]">No photo</div>}
                                    {(job.partName || job.partMaterial) && (
                                        <div className="bg-emerald-50 px-4 py-2.5 text-[12px] text-emerald-900 flex flex-wrap items-center gap-x-3 gap-y-1">
                                            {job.partName && <span><b>Part Name:</b> {job.partName}</span>}
                                            {job.partName && job.partMaterial && <span className="text-emerald-300">|</span>}
                                            {job.partMaterial && <span><b>Material:</b> {job.partMaterial}</span>}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {hasMap && (
                            <div>
                                <SectionTitle>Customer Location</SectionTitle>
                                <div className="rounded-xl border border-[var(--border)] overflow-hidden">
                                    {embedSrc ? (
                                        <iframe
                                            title="Customer location"
                                            src={embedSrc}
                                            className="w-full h-64 border-0"
                                            loading="lazy"
                                            referrerPolicy="no-referrer-when-downgrade"
                                        />
                                    ) : (
                                        <div className="w-full h-64 bg-[var(--surface2)] flex items-center justify-center text-[var(--text3)] text-[13px]">
                                            Map preview unavailable — open the link below
                                        </div>
                                    )}
                                    <div className="bg-emerald-50 px-4 py-2.5 flex items-center justify-between gap-3">
                                        <span className="text-[12px] text-emerald-900 inline-flex items-center gap-1.5 min-w-0">
                                            <MapPin size={13} className="shrink-0" /> <span className="truncate">{job.plantAddress || job.plantLocation || "Customer location"}</span>
                                        </span>
                                        {openMapHref && (
                                            <a href={openMapHref} target="_blank" rel="noopener noreferrer"
                                                className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[var(--border)] bg-white text-[12px] font-medium text-[var(--text2)] hover:bg-[var(--surface2)]">
                                                Open in Google Maps <ExternalLink size={12} />
                                            </a>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* ── Customer details ── */}
                {hasCustomer && (
                    <Card icon={<Building2 size={16} />} title="Customer Details">
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-4">
                            {job.customerName && <Field icon={<Building2 size={14} />} label="Customer Name" value={job.customerName} accent />}
                            {job.shiftType && <Field icon={<Clock size={14} />} label="Shift" value={job.shiftType} />}
                            <Field icon={<UtensilsCrossed size={14} />} label="Canteen" value={yn(job.canteenAvailable)} />
                            {job.plantAddress && <Field icon={<MapPin size={14} />} label="Plant Address" value={job.plantAddress} />}
                            {job.plantLocation && <Field icon={<MapPin size={14} />} label="Plant Location" value={job.plantLocation} />}
                            <Field icon={<Bus size={14} />} label="Transportation" value={yn(job.transportAvailable)} />
                            <Field icon={<Home size={14} />} label="Accommodation" value={yn(job.accommodationAvailable)} />
                            {openMapHref && (
                                <div className="flex items-start gap-2">
                                    <span className="text-[var(--text3)] mt-0.5"><MapPin size={14} /></span>
                                    <div>
                                        <p className="text-[12px] text-[var(--text3)]">Google Map</p>
                                        <a href={openMapHref} target="_blank" rel="noopener noreferrer" className="text-[13px] text-[var(--accent-text)] hover:underline">View Location</a>
                                    </div>
                                </div>
                            )}
                        </div>
                    </Card>
                )}

                {/* ── Part / Job / Facility detail cards ── */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {hasPart && (
                        <Card icon={<Layers size={16} />} title="Part Details" compact>
                            <Stack>
                                {job.partName && <KV label="Part Name" value={job.partName} />}
                                {job.partMaterial && <KV label="Material" value={job.partMaterial} />}
                                {job.inspectionType && <KV label="Inspection Type" value={job.inspectionType} />}
                                {job.qualityStandard && <KV label="Quality Standard" value={job.qualityStandard} />}
                            </Stack>
                            {job.partPhotoUrl && <img src={job.partPhotoUrl} alt="" className="mt-3 rounded-lg w-full h-28 object-cover border border-[var(--border)]" />}
                        </Card>
                    )}

                    <Card icon={<Briefcase size={16} />} title="Job Details" compact>
                        <Stack>
                            {job.jobRole && <KV label="Role" value={job.jobRole} />}
                            <KV label="Experience" value={formatExperience(job.workExpMin, job.workExpMax, job.freshersAllowed)} />
                            <KV label="Openings" value={String(job.openings)} />
                            {job.employmentType && <KV label="Employment Type" value={job.employmentType} />}
                            {job.department && <KV label="Department" value={job.department} />}
                            {job.genderPreference && job.genderPreference !== "Any" && <KV label="Gender Preference" value={job.genderPreference} />}
                        </Stack>
                    </Card>

                    {hasFacility && (
                        <Card icon={<ShieldCheck size={16} />} title="Facility Details" compact>
                            <Stack>
                                <KVIcon ok={job.busFacility} label="Bus Facility" value={yn(job.busFacility)} />
                                <KVIcon ok={job.canteenAvailable} label="Canteen" value={yn(job.canteenAvailable)} />
                                <KVIcon ok={job.accommodationAvailable} label="Accommodation" value={yn(job.accommodationAvailable)} />
                                {job.shiftType && <KV label="Shift Timing" value={job.shiftType} />}
                                {job.weeklyOff && <KV label="Weekly Off" value={job.weeklyOff} />}
                                {job.overtimePolicy && <KV label="Overtime" value={job.overtimePolicy} />}
                            </Stack>
                        </Card>
                    )}
                </div>

                {/* ── Description ── */}
                {job.description && (
                    <Card icon={<Briefcase size={16} />} title="Job Description">
                        <div className="text-[13px] text-[var(--text2)] whitespace-pre-wrap leading-relaxed">{job.description}</div>
                    </Card>
                )}

                {/* ── Skills + Languages ── */}
                {(job.skills.length > 0 || job.languages.length > 0) && (
                    <Card icon={<Sparkles size={16} />} title="Skills & Languages">
                        {job.skills.length > 0 && (
                            <div className="mb-4">
                                <p className="text-[12px] font-semibold text-[var(--text3)] uppercase tracking-wide mb-2">Key Skills</p>
                                <Chips items={job.skills} />
                            </div>
                        )}
                        {job.languages.length > 0 && (
                            <div>
                                <p className="text-[12px] font-semibold text-[var(--text3)] uppercase tracking-wide mb-2 inline-flex items-center gap-1.5">
                                    <LanguagesIcon size={13} /> Languages
                                </p>
                                <Chips items={job.languages} />
                            </div>
                        )}
                    </Card>
                )}

                {/* ── Apply ── */}
                <button
                    onClick={onApply}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 text-white py-3.5 text-[15px] font-semibold hover:bg-emerald-700 transition-colors"
                >
                    <Send size={17} /> Apply for this Job
                </button>
            </div>
        </div>
    )
}

// ─── Primitives ──────────────────────────────────────────────────────────────
function SectionTitle({ children }: { children: React.ReactNode }) {
    return <h3 className="text-[12px] font-bold uppercase tracking-wide text-emerald-700 mb-2.5">{children}</h3>
}

function Card({ icon, title, children, compact }: { icon: React.ReactNode; title: string; children: React.ReactNode; compact?: boolean }) {
    return (
        <div className={`rounded-xl border border-[var(--border)] ${compact ? "p-4" : "p-5"} bg-white`}>
            <div className="flex items-center gap-2 mb-4 text-emerald-700">
                {icon}
                <h3 className="text-[13px] font-bold uppercase tracking-wide">{title}</h3>
            </div>
            {children}
        </div>
    )
}

function Stack({ children }: { children: React.ReactNode }) {
    return <div className="space-y-3">{children}</div>
}

function Field({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: string; accent?: boolean }) {
    return (
        <div className="flex items-start gap-2">
            <span className="text-[var(--text3)] mt-0.5">{icon}</span>
            <div className="min-w-0">
                <p className="text-[12px] text-[var(--text3)]">{label}</p>
                <p className={`text-[13px] ${accent ? "text-[var(--accent-text)] font-medium" : "text-[var(--text)]"}`}>{value}</p>
            </div>
        </div>
    )
}

function KV({ label, value }: { label: string; value: string }) {
    return (
        <div>
            <p className="text-[12px] text-[var(--text3)]">{label}</p>
            <p className="text-[13px] text-[var(--accent-text)] font-medium">{value}</p>
        </div>
    )
}

function KVIcon({ ok, label, value }: { ok: boolean; label: string; value: string }) {
    return (
        <div className="flex items-start gap-2">
            <CheckCircle2 size={15} className={`mt-0.5 ${ok ? "text-emerald-600" : "text-[var(--text3)]"}`} />
            <div>
                <p className="text-[12px] text-[var(--text3)]">{label}</p>
                <p className="text-[13px] text-[var(--text)]">{value}</p>
            </div>
        </div>
    )
}

function Chips({ items }: { items: string[] }) {
    return (
        <div className="flex flex-wrap gap-2">
            {items.map((s) => (
                <span key={s} className="px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-800 text-[12px] font-medium">{s}</span>
            ))}
        </div>
    )
}
