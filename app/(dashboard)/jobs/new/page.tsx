"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useSession } from "next-auth/react"
import { toast } from "sonner"
import { can } from "@/lib/can"
import {
    ArrowLeft, ArrowRight, Check, Loader2, Plus, Trash2, ChevronLeft,
} from "lucide-react"
import { ChipInput } from "@/components/jobs/ChipInput"
import { JobPreview } from "@/components/jobs/JobPreview"
import {
    WIZARD_STEPS, EXPERIENCE_YEARS, QUALIFICATIONS, GENDER_OPTIONS,
    EMPLOYMENT_TYPES, PERK_SUGGESTIONS, LANGUAGE_SUGGESTIONS, SKILL_SUGGESTIONS,
    SUGGESTED_QUESTIONS, CALL_DAYS_OPTIONS, ScreeningQuestion,
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
}

const uid = () => Math.random().toString(36).slice(2, 9)

export default function NewJobPage() {
    const router = useRouter()
    const { data: session } = useSession()
    const allowed = can(session, "jobs.manage")

    const [step, setStep] = useState(0)
    const [form, setForm] = useState<Form>(initialForm)
    const [saving, setSaving] = useState(false)

    const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }))

    if (!allowed) {
        return (
            <div className="p-8 text-center text-[var(--text2)]">
                You don&apos;t have permission to post jobs.
            </div>
        )
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

    const submit = async (status: "DRAFT" | "PUBLISHED") => {
        const err = validateStep(0)
        if (err) { toast.error(err); setStep(0); return }
        setSaving(true)
        try {
            const payload = {
                ...form,
                screeningQuestions: form.screeningQuestions.filter((q) => q.question.trim()),
                status,
            }
            const res = await fetch("/api/jobs", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error || "Failed to create job")
            toast.success(status === "PUBLISHED" ? "Job published" : "Draft saved")
            router.push("/jobs")
        } catch (e: any) {
            toast.error(e.message || "Failed to create job")
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
                <h1 className="text-2xl font-bold text-[var(--text)]">Post a job</h1>
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
                    {step === 1 && <StepCandidate form={form} set={set} toggleArray={toggleArray} />}
                    {step === 2 && (
                        <StepScreening
                            form={form}
                            addQuestion={addQuestion}
                            updateQuestion={updateQuestion}
                            removeQuestion={removeQuestion}
                        />
                    )}
                    {step === 3 && <StepDescription form={form} set={set} />}
                    {step === 4 && <StepCommunication form={form} set={set} />}

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
                                onClick={() => submit("DRAFT")}
                                disabled={saving}
                                className="px-4 py-2 rounded-lg border border-[var(--border)] text-[13px] font-medium text-[var(--text2)] hover:bg-[var(--surface2)] disabled:opacity-50"
                            >
                                Save draft
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
                                    Publish job
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

// ─── Step 2: Candidate preferences ───────────────────────────────────────────
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
