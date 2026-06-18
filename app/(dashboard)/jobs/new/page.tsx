"use client"

import { Suspense, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useSession } from "next-auth/react"
import { toast } from "sonner"
import { can } from "@/lib/can"
import {
    ArrowLeft, ArrowRight, Check, Loader2, Plus, Trash2, ChevronLeft, ImagePlus,
} from "lucide-react"
import { ChipInput } from "@/components/jobs/ChipInput"
import { JobPreview } from "@/components/jobs/JobPreview"
import {
    WIZARD_STEPS, EXPERIENCE_YEARS, QUALIFICATIONS, GENDER_OPTIONS,
    EMPLOYMENT_TYPES, PERK_SUGGESTIONS, LANGUAGE_SUGGESTIONS, SKILL_SUGGESTIONS,
    SUGGESTED_QUESTIONS, CALL_DAYS_OPTIONS, ScreeningQuestion,
    SHIFT_OPTIONS, WEEKLY_OFF_OPTIONS, INSPECTION_TYPE_SUGGESTIONS,
    QUALITY_STANDARD_SUGGESTIONS, MATERIAL_SUGGESTIONS, JobPosting,
} from "@/components/jobs/constants"

type Form = {
    title: string
    workExpMin: string
    workExpMax: string
    freshersAllowed: boolean
    salaryMin: string
    salaryMax: string
    perks: string[]
    department: string
    jobRole: string
    jobLocation: string
    qualifications: string[]
    educationDegree: string
    genderPreference: string
    skills: string[]
    candidateIndustry: string
    languages: string[]
    screeningQuestions: ScreeningQuestion[]
    description: string
    companyName: string
    employmentType: string
    industryType: string
    roleCategory: string
    openings: string
    allowCalls: boolean
    contactName: string
    contactPhone: string
    callStartTime: string
    callEndTime: string
    callDays: string
    // Sample / inspection part
    partSectionLabel: string
    partName: string
    partMaterial: string
    partPhotoUrl: string
    inspectionType: string
    qualityStandard: string
    // Customer & plant location
    customerName: string
    plantLocation: string
    plantAddress: string
    mapUrl: string
    // Facility / amenities
    shiftType: string
    weeklyOff: string
    overtimePolicy: string
    canteenAvailable: boolean
    transportAvailable: boolean
    accommodationAvailable: boolean
    busFacility: boolean
    // Priority / deadline / target site
    priority: string
    deadline: string
    siteId: string
    siteName: string
}

const initialForm: Form = {
    title: "", workExpMin: "", workExpMax: "", freshersAllowed: false,
    salaryMin: "", salaryMax: "", perks: [],
    department: "", jobRole: "", jobLocation: "", qualifications: [],
    educationDegree: "", genderPreference: "Any", skills: [], candidateIndustry: "", languages: [],
    screeningQuestions: [], description: "", companyName: "Growus Auto India",
    employmentType: "Full Time, Permanent", industryType: "", roleCategory: "", openings: "1",
    allowCalls: false, contactName: "", contactPhone: "", callStartTime: "09:30",
    callEndTime: "18:30", callDays: "Everyday",
    partSectionLabel: "", partName: "", partMaterial: "", partPhotoUrl: "",
    inspectionType: "", qualityStandard: "",
    customerName: "", plantLocation: "", plantAddress: "", mapUrl: "",
    shiftType: "Rotational", weeklyOff: "Sunday", overtimePolicy: "",
    canteenAvailable: false, transportAvailable: false, accommodationAvailable: false, busFacility: false,
    priority: "MEDIUM", deadline: "", siteId: "", siteName: "",
}

const uid = () => Math.random().toString(36).slice(2, 9)

const s = (v: string | null | undefined) => v ?? ""
const n = (v: number | null | undefined) => (v == null ? "" : String(v))

// Map a saved job back into the editable wizard form (for Edit / Duplicate).
function jobToForm(j: JobPosting): Form {
    return {
        title: s(j.title),
        workExpMin: n(j.workExpMin), workExpMax: n(j.workExpMax), freshersAllowed: !!j.freshersAllowed,
        salaryMin: n(j.salaryMin), salaryMax: n(j.salaryMax), perks: j.perks ?? [],
        department: s(j.department), jobRole: s(j.jobRole), jobLocation: s(j.jobLocation),
        qualifications: j.qualifications ?? [], educationDegree: s(j.educationDegree),
        genderPreference: s(j.genderPreference) || "Any", skills: j.skills ?? [],
        candidateIndustry: s(j.candidateIndustry), languages: j.languages ?? [],
        screeningQuestions: (j.screeningQuestions ?? []).map((q) => ({
            id: q.id || uid(), question: q.question || "", mandatory: q.mandatory ?? true,
            type: q.type || "text", options: q.options ?? [], preferredAnswer: q.preferredAnswer ?? null,
        })),
        description: s(j.description), companyName: s(j.companyName) || "Growus Auto India",
        employmentType: s(j.employmentType) || "Full Time, Permanent",
        industryType: s(j.industryType), roleCategory: s(j.roleCategory), openings: n(j.openings) || "1",
        allowCalls: !!j.allowCalls, contactName: s(j.contactName), contactPhone: s(j.contactPhone),
        callStartTime: s(j.callStartTime) || "09:30", callEndTime: s(j.callEndTime) || "18:30",
        callDays: s(j.callDays) || "Everyday",
        partSectionLabel: s(j.partSectionLabel), partName: s(j.partName), partMaterial: s(j.partMaterial),
        partPhotoUrl: s(j.partPhotoUrl), inspectionType: s(j.inspectionType), qualityStandard: s(j.qualityStandard),
        customerName: s(j.customerName), plantLocation: s(j.plantLocation), plantAddress: s(j.plantAddress),
        mapUrl: s(j.mapUrl),
        shiftType: s(j.shiftType) || "Rotational", weeklyOff: s(j.weeklyOff) || "Sunday",
        overtimePolicy: s(j.overtimePolicy), canteenAvailable: !!j.canteenAvailable,
        transportAvailable: !!j.transportAvailable, accommodationAvailable: !!j.accommodationAvailable,
        busFacility: !!j.busFacility,
        priority: s(j.priority) || "MEDIUM",
        deadline: j.deadline ? String(j.deadline).slice(0, 10) : "",
        siteId: s(j.siteId), siteName: s(j.siteName),
    }
}

export default function NewJobPage() {
    return (
        <Suspense fallback={<div className="flex items-center justify-center py-24 text-[var(--text3)]"><Loader2 className="animate-spin" /></div>}>
            <NewJobWizard />
        </Suspense>
    )
}

function NewJobWizard() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const editId = searchParams.get("id")
    const dupId = searchParams.get("duplicate")
    const mode: "create" | "edit" | "duplicate" = editId ? "edit" : dupId ? "duplicate" : "create"
    const { data: session } = useSession()
    const allowed = can(session, "jobs.manage")

    const [step, setStep] = useState(0)
    const [form, setForm] = useState<Form>(initialForm)
    const [saving, setSaving] = useState(false)
    const [loadingJob, setLoadingJob] = useState<boolean>(!!(editId || dupId))

    // Prefill the wizard when editing or duplicating an existing job.
    useEffect(() => {
        const srcId = editId || dupId
        if (!srcId) return
        let cancelled = false
        ;(async () => {
            try {
                const res = await fetch(`/api/jobs/${srcId}`)
                if (!res.ok) throw new Error()
                const j = (await res.json()) as JobPosting
                if (cancelled) return
                const f = jobToForm(j)
                if (dupId) f.title = `${f.title} (Copy)`.trim()
                setForm(f)
            } catch {
                if (!cancelled) toast.error(`Couldn't load the job to ${editId ? "edit" : "duplicate"}`)
            } finally {
                if (!cancelled) setLoadingJob(false)
            }
        })()
        return () => { cancelled = true }
    }, [editId, dupId])

    const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }))

    if (!allowed) {
        return (
            <div className="p-8 text-center text-[var(--text2)]">
                You don&apos;t have permission to post jobs.
            </div>
        )
    }

    if (loadingJob) {
        return <div className="flex items-center justify-center py-24 text-[var(--text3)]"><Loader2 className="animate-spin" /></div>
    }

    const toggleArray = (key: "qualifications", v: string) => {
        const cur = form[key]
        set(key, cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v])
    }

    // ── Screening questions ──
    const addQuestion = (text = "") => {
        const q: ScreeningQuestion = { id: uid(), question: text, mandatory: true, type: "text", options: [] }
        set("screeningQuestions", [...form.screeningQuestions, q])
    }
    const updateQuestion = (id: string, patch: Partial<ScreeningQuestion>) =>
        set("screeningQuestions", form.screeningQuestions.map((q) => (q.id === id ? { ...q, ...patch } : q)))
    const removeQuestion = (id: string) =>
        set("screeningQuestions", form.screeningQuestions.filter((q) => q.id !== id))

    const validateStep = (s: number): string | null => {
        if (s === 0 && !form.title.trim()) return "Job title is required"
        if (s === 0 && form.workExpMin && form.workExpMax && +form.workExpMin > +form.workExpMax)
            return "Min experience cannot be greater than max"
        if (s === 0 && form.salaryMin && form.salaryMax && +form.salaryMin > +form.salaryMax)
            return "Min salary cannot be greater than max"
        return null
    }

    const next = () => {
        const err = validateStep(step)
        if (err) { toast.error(err); return }
        setStep((s) => Math.min(s + 1, WIZARD_STEPS.length - 1))
    }
    const back = () => setStep((s) => Math.max(s - 1, 0))

    // status === undefined → keep the existing status (edit mode "Save changes").
    const submit = async (status?: "DRAFT" | "PUBLISHED") => {
        const err = validateStep(0)
        if (err) { toast.error(err); setStep(0); return }
        setSaving(true)
        try {
            const payload: any = {
                ...form,
                screeningQuestions: form.screeningQuestions.filter((q) => q.question.trim()),
            }
            if (mode === "edit") {
                if (status) payload.status = status   // only change status when explicitly publishing
                const res = await fetch(`/api/jobs/${editId}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                })
                const data = await res.json()
                if (!res.ok) throw new Error(data.error || "Failed to save changes")
                toast.success(status === "PUBLISHED" ? "Job published" : "Changes saved")
                router.push(`/jobs/${editId}`)
            } else {
                payload.status = status || "DRAFT"
                const res = await fetch("/api/jobs", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                })
                const data = await res.json()
                if (!res.ok) throw new Error(data.error || "Failed to create job")
                toast.success(payload.status === "PUBLISHED" ? "Job published" : "Draft saved")
                router.push("/jobs")
            }
        } catch (e: any) {
            toast.error(e.message || "Failed to save job")
        } finally {
            setSaving(false)
        }
    }

    // Build a preview-shaped object from the form
    const previewJob = {
        ...form,
        workExpMin: form.workExpMin ? +form.workExpMin : null,
        workExpMax: form.workExpMax ? +form.workExpMax : null,
        salaryMin: form.salaryMin ? +form.salaryMin : null,
        salaryMax: form.salaryMax ? +form.salaryMax : null,
        openings: form.openings ? +form.openings : 1,
        salaryPeriod: "month",
    }

    return (
        <div className="p-4 lg:p-0">
            <button
                onClick={() => router.push("/jobs")}
                className="inline-flex items-center gap-1.5 text-[13px] text-[var(--text2)] hover:text-[var(--text)] mb-4"
            >
                <ChevronLeft size={16} /> Back to Jobs
            </button>

            <div className="flex items-center gap-3 mb-6">
                <h1 className="text-2xl font-bold text-[var(--text)]">
                    {mode === "edit" ? "Edit job" : mode === "duplicate" ? "Duplicate job" : "Post a job"}
                </h1>
                <span className="text-[12px] font-medium px-2 py-0.5 rounded bg-emerald-100 text-emerald-700">Internal</span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[230px_1fr_360px] gap-8">
                {/* ── Stepper ── */}
                <ol className="hidden lg:flex flex-col gap-0 sticky top-4 self-start">
                    {WIZARD_STEPS.map((label, i) => {
                        const done = i < step
                        const active = i === step
                        return (
                            <li key={label} className="flex items-start gap-3">
                                <div className="flex flex-col items-center">
                                    <button
                                        onClick={() => i <= step && setStep(i)}
                                        className={`h-6 w-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 transition-colors ${
                                            done ? "bg-emerald-500 text-white"
                                            : active ? "bg-[var(--accent)] text-white"
                                            : "bg-[var(--surface2)] text-[var(--text3)]"
                                        }`}
                                    >
                                        {done ? <Check size={13} /> : i + 1}
                                    </button>
                                    {i < WIZARD_STEPS.length - 1 && <div className="w-px h-8 bg-[var(--border)]" />}
                                </div>
                                <span className={`text-[13px] pt-0.5 ${active ? "font-semibold text-[var(--text)]" : "text-[var(--text2)]"}`}>
                                    {label}
                                </span>
                            </li>
                        )
                    })}
                </ol>

                {/* ── Step body ── */}
                <div className="min-w-0">
                    <div className="lg:hidden mb-4 text-[13px] text-[var(--text3)]">
                        Step {step + 1} of {WIZARD_STEPS.length} · <b className="text-[var(--text)]">{WIZARD_STEPS[step]}</b>
                    </div>

                    {step === 0 && <StepJobDetails form={form} set={set} />}
                    {step === 1 && <StepCustomerSite form={form} set={set} />}
                    {step === 2 && <StepCandidate form={form} set={set} toggleArray={toggleArray} />}
                    {step === 3 && (
                        <StepScreening
                            form={form}
                            addQuestion={addQuestion}
                            updateQuestion={updateQuestion}
                            removeQuestion={removeQuestion}
                        />
                    )}
                    {step === 4 && <StepDescription form={form} set={set} />}
                    {step === 5 && <StepCommunication form={form} set={set} />}

                    {/* ── Nav buttons ── */}
                    <div className="flex items-center justify-between mt-8 pt-4 border-t border-[var(--border)]">
                        <button
                            onClick={back}
                            disabled={step === 0}
                            className="inline-flex items-center gap-1.5 text-[13px] text-[var(--text2)] hover:text-[var(--text)] disabled:opacity-40"
                        >
                            <ArrowLeft size={15} /> Back
                        </button>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => (mode === "edit" ? submit() : submit("DRAFT"))}
                                disabled={saving}
                                className="px-4 py-2 rounded-lg border border-[var(--border)] text-[13px] font-medium text-[var(--text2)] hover:bg-[var(--surface2)] disabled:opacity-50"
                            >
                                {mode === "edit" ? "Save changes" : "Save draft"}
                            </button>
                            {step < WIZARD_STEPS.length - 1 ? (
                                <button
                                    onClick={next}
                                    className="inline-flex items-center gap-1.5 px-5 py-2 rounded-lg bg-[var(--accent)] text-white text-[13px] font-medium hover:opacity-90"
                                >
                                    Next <ArrowRight size={15} />
                                </button>
                            ) : (
                                <button
                                    onClick={() => submit("PUBLISHED")}
                                    disabled={saving}
                                    className="inline-flex items-center gap-1.5 px-5 py-2 rounded-lg bg-emerald-600 text-white text-[13px] font-medium hover:opacity-90 disabled:opacity-50"
                                >
                                    {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
                                    {mode === "edit" ? "Save & publish" : "Publish job"}
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {/* ── Live preview ── */}
                <div className="hidden lg:block sticky top-4 self-start">
                    <p className="text-[11px] uppercase tracking-wide text-[var(--text3)] mb-2 font-semibold">Live preview</p>
                    <JobPreview job={previewJob} />
                </div>
            </div>
        </div>
    )
}

// ─── Small shared field primitives ──────────────────────────────────────────
function FieldLabel({ children, optional }: { children: React.ReactNode; optional?: boolean }) {
    return (
        <label className="block text-sm font-semibold text-[var(--text)] mb-1.5">
            {children} {optional && <span className="text-[var(--text3)] font-normal">(Optional)</span>}
        </label>
    )
}
const inputCls =
    "w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-[13px] text-[var(--text)] outline-none focus:ring-2 focus:ring-[var(--accent)]/30 placeholder:text-[var(--text3)]"

function TextField({ label, value, onChange, placeholder, optional, prefix }: {
    label: string; value: string; onChange: (v: string) => void; placeholder?: string; optional?: boolean; prefix?: string
}) {
    return (
        <div>
            <FieldLabel optional={optional}>{label}</FieldLabel>
            <div className="relative">
                {prefix && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-[var(--text3)]">{prefix}</span>}
                <input
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder={placeholder}
                    className={`${inputCls} ${prefix ? "pl-7" : ""}`}
                />
            </div>
        </div>
    )
}

// ─── Step 1: Job details ─────────────────────────────────────────────────────
function StepJobDetails({ form, set }: { form: Form; set: <K extends keyof Form>(k: K, v: Form[K]) => void }) {
    return (
        <div className="space-y-6">
            <TextField label="Job title" value={form.title} onChange={(v) => set("title", v)} placeholder="e.g. Human Resource Recruiter" />

            <div>
                <FieldLabel>Work experience</FieldLabel>
                <div className="flex items-center gap-3">
                    <select value={form.workExpMin} onChange={(e) => set("workExpMin", e.target.value)} className={inputCls}>
                        <option value="">Min</option>
                        {EXPERIENCE_YEARS.map((y) => <option key={y} value={y}>{y === 1 ? "1 year" : `${y} years`}</option>)}
                    </select>
                    <span className="text-[13px] text-[var(--text3)]">to</span>
                    <select value={form.workExpMax} onChange={(e) => set("workExpMax", e.target.value)} className={inputCls}>
                        <option value="">Max</option>
                        {EXPERIENCE_YEARS.map((y) => <option key={y} value={y}>{y === 1 ? "1 year" : `${y} years`}</option>)}
                    </select>
                </div>
                <label className="flex items-center gap-2 mt-2.5 text-[13px] text-[var(--text2)] cursor-pointer">
                    <input type="checkbox" checked={form.freshersAllowed} onChange={(e) => set("freshersAllowed", e.target.checked)} className="accent-[var(--accent)]" />
                    Freshers can also apply
                </label>
            </div>

            <div>
                <FieldLabel>Salary per month</FieldLabel>
                <div className="flex items-center gap-3">
                    <TextOnlyNumber value={form.salaryMin} onChange={(v) => set("salaryMin", v)} placeholder="15,000" />
                    <span className="text-[13px] text-[var(--text3)]">to</span>
                    <TextOnlyNumber value={form.salaryMax} onChange={(v) => set("salaryMax", v)} placeholder="25,000" />
                </div>
            </div>

            <ChipInput label="Perks and benefits" optional value={form.perks} onChange={(v) => set("perks", v)} suggestions={PERK_SUGGESTIONS} placeholder="Search for perks and benefits" />

            <div className="grid grid-cols-2 gap-4">
                <div>
                    <FieldLabel>Employment type</FieldLabel>
                    <select value={form.employmentType} onChange={(e) => set("employmentType", e.target.value)} className={inputCls}>
                        {EMPLOYMENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                </div>
                <TextField label="No. of openings" value={form.openings} onChange={(v) => set("openings", v.replace(/\D/g, ""))} placeholder="1" />
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div>
                    <FieldLabel>Priority</FieldLabel>
                    <select value={form.priority} onChange={(e) => set("priority", e.target.value)} className={inputCls}>
                        <option value="HIGH">🔴 High</option>
                        <option value="MEDIUM">🟡 Medium</option>
                        <option value="LOW">🟢 Low</option>
                    </select>
                </div>
                <div>
                    <FieldLabel optional>Application deadline</FieldLabel>
                    <input type="date" value={form.deadline} onChange={(e) => set("deadline", e.target.value)} className={inputCls} />
                    <p className="text-[11px] text-[var(--text3)] mt-1">Last date this opening stays open.</p>
                </div>
            </div>
        </div>
    )
}

function TextOnlyNumber({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
    return (
        <div className="relative flex-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-[var(--text3)]">₹</span>
            <input
                value={value}
                onChange={(e) => onChange(e.target.value.replace(/[^\d]/g, ""))}
                placeholder={placeholder}
                inputMode="numeric"
                className={`${inputCls} pl-7`}
            />
        </div>
    )
}

// ─── Step 2: Customer & site details ─────────────────────────────────────────
function StepCustomerSite({ form, set }: { form: Form; set: <K extends keyof Form>(k: K, v: Form[K]) => void }) {
    const [sites, setSites] = useState<{ id: string; name: string; code?: string }[]>([])
    useEffect(() => {
        fetch("/api/sites?isActive=true")
            .then(r => r.ok ? r.json() : [])
            .then(d => setSites(Array.isArray(d) ? d : []))
            .catch(() => {})
    }, [])

    return (
        <div className="space-y-7">
            {/* Target site — where this job goes live */}
            <div className="space-y-2">
                <h3 className="text-[13px] font-bold uppercase tracking-wide text-[var(--accent-text)]">Target site</h3>
                <FieldLabel optional>Site this opening is for</FieldLabel>
                <select
                    value={form.siteId}
                    onChange={(e) => {
                        const id = e.target.value
                        set("siteId", id)
                        set("siteName", sites.find(s => s.id === id)?.name || "")
                    }}
                    className={inputCls}
                >
                    <option value="">— No specific site —</option>
                    {sites.map(s => <option key={s.id} value={s.id}>{s.name}{s.code ? ` (${s.code})` : ""}</option>)}
                </select>
                <p className="text-[11px] text-[var(--text3)]">Selected when the job goes live, so applicants/recruiters know the deployment site.</p>
            </div>

            {/* Sample / inspection part */}
            <div className="space-y-4">
                <h3 className="text-[13px] font-bold uppercase tracking-wide text-[var(--accent-text)]">Work sample / part</h3>
                <PartPhotoUpload value={form.partPhotoUrl} onChange={(v) => set("partPhotoUrl", v)} />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <TextField label="Section heading" value={form.partSectionLabel} onChange={(v) => set("partSectionLabel", v)} placeholder="Inspection Part (Sample)" optional />
                    <TextField label="Part / sample name" value={form.partName} onChange={(v) => set("partName", v)} placeholder="e.g. Door Inner Panel" optional />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <DatalistField label="Material" value={form.partMaterial} onChange={(v) => set("partMaterial", v)} options={MATERIAL_SUGGESTIONS} placeholder="e.g. Sheet Metal" />
                    <DatalistField label="Inspection type" value={form.inspectionType} onChange={(v) => set("inspectionType", v)} options={INSPECTION_TYPE_SUGGESTIONS} placeholder="e.g. Visual & Dimension" />
                </div>
                <DatalistField label="Quality standard" value={form.qualityStandard} onChange={(v) => set("qualityStandard", v)} options={QUALITY_STANDARD_SUGGESTIONS} placeholder="e.g. OEM" />
            </div>

            {/* Customer & location */}
            <div className="space-y-4 border-t border-[var(--border)] pt-6">
                <h3 className="text-[13px] font-bold uppercase tracking-wide text-[var(--accent-text)]">Customer & location</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <TextField label="Customer name" value={form.customerName} onChange={(v) => set("customerName", v)} placeholder="e.g. Tata Motors" optional />
                    <TextField label="Plant location" value={form.plantLocation} onChange={(v) => set("plantLocation", v)} placeholder="e.g. Chakan, Pune" optional />
                </div>
                <div>
                    <FieldLabel optional>Plant address</FieldLabel>
                    <textarea
                        value={form.plantAddress}
                        onChange={(e) => set("plantAddress", e.target.value)}
                        rows={2}
                        placeholder="e.g. Tata Motors Plant, Chakan MIDC, Pune, Maharashtra 410501"
                        className={`${inputCls} resize-y`}
                    />
                    <p className="text-[11px] text-[var(--text3)] mt-1">Used to show the location map on the job page.</p>
                </div>
                <div>
                    <FieldLabel optional>Google Maps link</FieldLabel>
                    <input
                        value={form.mapUrl}
                        onChange={(e) => set("mapUrl", e.target.value)}
                        placeholder="Paste a Google Maps link (e.g. https://maps.app.goo.gl/…)"
                        className={inputCls}
                    />
                    <p className="text-[11px] text-[var(--text3)] mt-1">Paste a direct link for the exact pin. The “Open in Google Maps” button uses this; if it contains coordinates the map shows that exact spot.</p>
                </div>
            </div>

            {/* Facility */}
            <div className="space-y-4 border-t border-[var(--border)] pt-6">
                <h3 className="text-[13px] font-bold uppercase tracking-wide text-[var(--accent-text)]">Facility details</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <FieldLabel optional>Shift timing</FieldLabel>
                        <select value={form.shiftType} onChange={(e) => set("shiftType", e.target.value)} className={inputCls}>
                            {SHIFT_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
                    </div>
                    <div>
                        <FieldLabel optional>Weekly off</FieldLabel>
                        <select value={form.weeklyOff} onChange={(e) => set("weeklyOff", e.target.value)} className={inputCls}>
                            {WEEKLY_OFF_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
                    </div>
                </div>
                <TextField label="Overtime policy" value={form.overtimePolicy} onChange={(v) => set("overtimePolicy", v)} placeholder="e.g. As per Company Policy" optional />
                <div className="grid grid-cols-2 gap-2.5">
                    <ToggleRow label="Bus / transport facility" on={form.busFacility} onChange={(v) => set("busFacility", v)} />
                    <ToggleRow label="Canteen available" on={form.canteenAvailable} onChange={(v) => set("canteenAvailable", v)} />
                    <ToggleRow label="Pick & drop (transportation)" on={form.transportAvailable} onChange={(v) => set("transportAvailable", v)} />
                    <ToggleRow label="Accommodation available" on={form.accommodationAvailable} onChange={(v) => set("accommodationAvailable", v)} />
                </div>
            </div>
        </div>
    )
}

function DatalistField({ label, value, onChange, options, placeholder }: {
    label: string; value: string; onChange: (v: string) => void; options: string[]; placeholder?: string
}) {
    const listId = `dl-${label.replace(/\s+/g, "-").toLowerCase()}`
    return (
        <div>
            <FieldLabel optional>{label}</FieldLabel>
            <input
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
                list={listId}
                className={inputCls}
            />
            <datalist id={listId}>
                {options.map((o) => <option key={o} value={o} />)}
            </datalist>
        </div>
    )
}

function ToggleRow({ label, on, onChange }: { label: string; on: boolean; onChange: (v: boolean) => void }) {
    return (
        <label className={`flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-[13px] cursor-pointer transition-colors ${
            on ? "border-[var(--accent)] bg-[var(--accent-light)] text-[var(--accent-text)] font-medium" : "border-[var(--border)] text-[var(--text2)]"
        }`}>
            <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} className="accent-[var(--accent)]" />
            {label}
        </label>
    )
}

function PartPhotoUpload({ value, onChange }: { value: string; onChange: (v: string) => void }) {
    const [uploading, setUploading] = useState(false)

    const upload = async (file: File) => {
        if (file.size > 5 * 1024 * 1024) { toast.error("Image too large (max 5 MB)"); return }
        setUploading(true)
        try {
            const fd = new FormData()
            fd.append("file", file)
            const res = await fetch("/api/upload", { method: "POST", body: fd })
            const data = await res.json()
            if (!res.ok || !data.url) throw new Error(data.error || "Upload failed")
            onChange(data.url)
        } catch (e: any) {
            toast.error(e.message || "Upload failed")
        } finally {
            setUploading(false)
        }
    }

    return (
        <div>
            <FieldLabel optional>Part / sample photo</FieldLabel>
            <div className="flex items-center gap-4">
                <div className="h-24 w-32 shrink-0 rounded-lg border border-[var(--border)] bg-[var(--surface2)] overflow-hidden flex items-center justify-center">
                    {value
                        ? <img src={value} alt="Part" className="h-full w-full object-cover" />
                        : <span className="text-[11px] text-[var(--text3)]">No photo</span>}
                </div>
                <div className="space-y-2">
                    <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--border)] text-[12px] font-medium text-[var(--text2)] hover:bg-[var(--surface2)] cursor-pointer">
                        {uploading ? <Loader2 size={14} className="animate-spin" /> : <ImagePlus size={14} />}
                        {value ? "Replace photo" : "Upload photo"}
                        <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = "" }} />
                    </label>
                    {value && (
                        <button type="button" onClick={() => onChange("")} className="block text-[12px] text-red-600 hover:underline">Remove</button>
                    )}
                </div>
            </div>
        </div>
    )
}

// ─── Step 3: Candidate preferences ───────────────────────────────────────────
function StepCandidate({ form, set, toggleArray }: {
    form: Form; set: <K extends keyof Form>(k: K, v: Form[K]) => void; toggleArray: (k: "qualifications", v: string) => void
}) {
    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <TextField label="Department" value={form.department} onChange={(v) => set("department", v)} placeholder="e.g. Recruitment & Talent Acquisition" />
                <TextField label="Job role" value={form.jobRole} onChange={(v) => set("jobRole", v)} placeholder="e.g. Non IT Recruiter" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <TextField label="Job location" value={form.jobLocation} onChange={(v) => set("jobLocation", v)} placeholder="e.g. Akurdi, Pune" />
                <TextField label="Industry type" value={form.industryType} onChange={(v) => set("industryType", v)} placeholder="e.g. Auto Components" optional />
            </div>

            <div>
                <FieldLabel>Candidate&apos;s qualification</FieldLabel>
                <div className="flex flex-wrap gap-2">
                    {QUALIFICATIONS.map((q) => {
                        const on = form.qualifications.includes(q)
                        return (
                            <button
                                key={q}
                                type="button"
                                onClick={() => toggleArray("qualifications", q)}
                                className={`px-3 py-1.5 rounded-full border text-[13px] transition-colors ${
                                    on ? "border-[var(--accent)] bg-[var(--accent-light)] text-[var(--accent-text)] font-medium"
                                       : "border-[var(--border)] text-[var(--text2)] hover:border-[var(--accent)]"
                                }`}
                            >
                                {q}
                            </button>
                        )
                    })}
                </div>
            </div>

            <TextField label="Educational degree candidates should have" value={form.educationDegree} onChange={(v) => set("educationDegree", v)} placeholder="Search for degree" optional />

            <div>
                <FieldLabel>Gender preference</FieldLabel>
                <div className="flex gap-2">
                    {GENDER_OPTIONS.map((g) => {
                        const on = form.genderPreference === g
                        return (
                            <button
                                key={g}
                                type="button"
                                onClick={() => set("genderPreference", g)}
                                className={`px-4 py-1.5 rounded-full border text-[13px] transition-colors ${
                                    on ? "border-[var(--accent)] bg-[var(--accent-light)] text-[var(--accent-text)] font-medium"
                                       : "border-[var(--border)] text-[var(--text2)] hover:border-[var(--accent)]"
                                }`}
                            >
                                {g}
                            </button>
                        )
                    })}
                </div>
            </div>

            <ChipInput label="Add skills" value={form.skills} onChange={(v) => set("skills", v)} suggestions={SKILL_SUGGESTIONS} placeholder="Type skill" />
            <TextField label="Candidate's industry you want to hire from" value={form.candidateIndustry} onChange={(v) => set("candidateIndustry", v)} placeholder="e.g. Any Industry" optional />
            <ChipInput label="Languages known" optional value={form.languages} onChange={(v) => set("languages", v)} suggestions={LANGUAGE_SUGGESTIONS} placeholder="Add a language" />
        </div>
    )
}

// ─── Step 3: Screening questions ─────────────────────────────────────────────
function StepScreening({ form, addQuestion, updateQuestion, removeQuestion }: {
    form: Form
    addQuestion: (text?: string) => void
    updateQuestion: (id: string, patch: Partial<ScreeningQuestion>) => void
    removeQuestion: (id: string) => void
}) {
    const used = new Set(form.screeningQuestions.map((q) => q.question.toLowerCase()))
    return (
        <div className="space-y-4">
            <p className="text-[13px] text-[var(--text2)]">
                Add questions candidates must answer when they apply. Mark the important ones as mandatory.
            </p>

            {form.screeningQuestions.map((q, i) => (
                <div key={q.id} className="rounded-lg border border-[var(--border)] p-3.5">
                    <div className="flex items-start gap-2">
                        <span className="text-[13px] font-semibold text-[var(--text2)] pt-2">{i + 1}.</span>
                        <input
                            value={q.question}
                            onChange={(e) => updateQuestion(q.id, { question: e.target.value })}
                            placeholder="Type your question"
                            className={inputCls}
                        />
                        <button type="button" onClick={() => removeQuestion(q.id)} className="p-2 text-[var(--text3)] hover:text-red-500">
                            <Trash2 size={15} />
                        </button>
                    </div>
                    <label className="flex items-center gap-2 mt-2.5 ml-6 text-[12px] text-[var(--text2)] cursor-pointer">
                        <input type="checkbox" checked={q.mandatory} onChange={(e) => updateQuestion(q.id, { mandatory: e.target.checked })} className="accent-[var(--accent)]" />
                        Mandatory
                    </label>
                </div>
            ))}

            <button
                type="button"
                onClick={() => addQuestion()}
                className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-[var(--accent)] text-[var(--accent-text)] py-2.5 text-[13px] font-medium hover:bg-[var(--accent-light)]"
            >
                <Plus size={15} /> Add a question
            </button>

            <div>
                <p className="text-[12px] text-[var(--text3)] mb-2">Suggested questions:</p>
                <div className="flex flex-wrap gap-2">
                    {SUGGESTED_QUESTIONS.filter((s) => !used.has(s.toLowerCase())).map((s) => (
                        <button
                            key={s}
                            type="button"
                            onClick={() => addQuestion(s)}
                            className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] px-3 py-1.5 text-[12px] text-[var(--text2)] hover:border-[var(--accent)] hover:text-[var(--accent-text)]"
                        >
                            <Plus size={12} /> {s}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    )
}

// ─── Step 4: Job description ─────────────────────────────────────────────────
function StepDescription({ form, set }: { form: Form; set: <K extends keyof Form>(k: K, v: Form[K]) => void }) {
    return (
        <div className="space-y-6">
            <div>
                <FieldLabel>Job description</FieldLabel>
                <textarea
                    value={form.description}
                    onChange={(e) => set("description", e.target.value)}
                    rows={10}
                    placeholder={"Responsibilities:\n• Manage end-to-end recruitment from sourcing to offer acceptance.\n• Source and screen candidates through various channels.\n• Coordinate interviews and hiring processes."}
                    className={`${inputCls} resize-y leading-relaxed`}
                />
                <p className="text-[11px] text-[var(--text3)] mt-1 text-right">{form.description.length} characters</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <TextField label="About your company" value={form.companyName} onChange={(v) => set("companyName", v)} placeholder="Growus Auto India" />
                <TextField label="Role category" value={form.roleCategory} onChange={(v) => set("roleCategory", v)} placeholder="e.g. Recruitment & Talent Acquisition" optional />
            </div>
        </div>
    )
}

// ─── Step 5: Communication preferences ───────────────────────────────────────
function StepCommunication({ form, set }: { form: Form; set: <K extends keyof Form>(k: K, v: Form[K]) => void }) {
    return (
        <div className="space-y-6">
            <div>
                <FieldLabel>Allow candidates to call you directly for this job?</FieldLabel>
                <div className="flex gap-2">
                    <button
                        type="button"
                        onClick={() => set("allowCalls", true)}
                        className={`px-5 py-1.5 rounded-full border text-[13px] ${form.allowCalls ? "border-[var(--accent)] bg-[var(--accent-light)] text-[var(--accent-text)] font-medium" : "border-[var(--border)] text-[var(--text2)]"}`}
                    >
                        Yes
                    </button>
                    <button
                        type="button"
                        onClick={() => set("allowCalls", false)}
                        className={`px-5 py-1.5 rounded-full border text-[13px] ${!form.allowCalls ? "border-[var(--accent)] bg-[var(--accent-light)] text-[var(--accent-text)] font-medium" : "border-[var(--border)] text-[var(--text2)]"}`}
                    >
                        No calls
                    </button>
                </div>
            </div>

            {form.allowCalls && (
                <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <TextField label="Contact person" value={form.contactName} onChange={(v) => set("contactName", v)} placeholder="e.g. SB Suryawanshi" />
                        <TextField label="Contact number" value={form.contactPhone} onChange={(v) => set("contactPhone", v.replace(/[^\d+]/g, ""))} placeholder="+91 9XXXXXXXXX" prefix="" />
                    </div>
                    <div>
                        <FieldLabel>Receive calls between</FieldLabel>
                        <div className="flex items-center gap-3">
                            <input type="time" value={form.callStartTime} onChange={(e) => set("callStartTime", e.target.value)} className={inputCls} />
                            <span className="text-[13px] text-[var(--text3)]">to</span>
                            <input type="time" value={form.callEndTime} onChange={(e) => set("callEndTime", e.target.value)} className={inputCls} />
                        </div>
                    </div>
                    <div>
                        <FieldLabel>Days</FieldLabel>
                        <select value={form.callDays} onChange={(e) => set("callDays", e.target.value)} className={inputCls}>
                            {CALL_DAYS_OPTIONS.map((d) => <option key={d} value={d}>{d}</option>)}
                        </select>
                    </div>
                </>
            )}

            <div className="rounded-lg bg-[var(--surface2)] p-3.5 text-[12px] text-[var(--text2)]">
                Review the live preview on the right, then click <b>Publish job</b> to make this opening visible, or <b>Save draft</b> to finish later.
            </div>
        </div>
    )
}
