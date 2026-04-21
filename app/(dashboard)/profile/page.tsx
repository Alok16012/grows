"use client"
import { useState, useEffect, useRef } from "react"
import { useSession } from "next-auth/react"
import { toast } from "sonner"
import {
    User, Phone, Mail, Save, Loader2, Upload, FileText,
    CheckCircle2, Clock, XCircle, AlertCircle, ChevronDown,
    IndianRupee, Shield, ClipboardList, X, Printer, BookOpen, Download,
    UserCircle2, MapPin, CreditCard, Contact, IdCard
} from "lucide-react"

// ─── Self-service Details Tab ────────────────────────────────────────────────
const DETAILS_FIELDS = [
    "firstName", "middleName", "lastName", "nameAsPerAadhar", "fathersName",
    "dateOfBirth", "gender", "bloodGroup", "maritalStatus", "marriageDate",
    "nationality", "religion", "caste", "phone", "alternatePhone", "email",
    "address", "city", "state", "pincode",
    "permanentAddress", "permanentCity", "permanentState", "permanentPincode",
    "aadharNumber", "panNumber", "uan", "pfNumber", "esiNumber", "labourCardNo",
    "bankAccountNumber", "bankIFSC", "bankName", "bankBranch",
    "emergencyContact1Name", "emergencyContact1Phone",
    "emergencyContact2Name", "emergencyContact2Phone",
] as const
type DetailsKey = typeof DETAILS_FIELDS[number]

function Section({ title, icon: Icon, children }: { title: string; icon: any; children: React.ReactNode }) {
    return (
        <div className="bg-white border border-[var(--border)] rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-4">
                <Icon size={16} className="text-[var(--accent)]" />
                <h3 className="text-[14px] font-semibold text-[var(--text)]">{title}</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{children}</div>
        </div>
    )
}

function Field({ label, value, onChange, type = "text", placeholder, colSpan = 1 }: {
    label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string; colSpan?: 1 | 2
}) {
    return (
        <div className={colSpan === 2 ? "sm:col-span-2" : ""}>
            <label className="text-[11px] font-medium text-[var(--text3)] uppercase tracking-wide block mb-1">{label}</label>
            <input type={type} value={value ?? ""} onChange={e => onChange(e.target.value)} placeholder={placeholder}
                className="w-full px-3 py-2 border border-[var(--border)] rounded-lg text-[13px] outline-none focus:border-[var(--accent)]" />
        </div>
    )
}

function SelectField({ label, value, onChange, options }: {
    label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[]
}) {
    return (
        <div>
            <label className="text-[11px] font-medium text-[var(--text3)] uppercase tracking-wide block mb-1">{label}</label>
            <select value={value ?? ""} onChange={e => onChange(e.target.value)}
                className="w-full px-3 py-2 border border-[var(--border)] rounded-lg text-[13px] outline-none focus:border-[var(--accent)] bg-white">
                <option value="">— Select —</option>
                {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
        </div>
    )
}

function MyDetailsTab() {
    const [data, setData] = useState<Partial<Record<DetailsKey, string>>>({})
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        fetch("/api/me/employee").then(r => r.json()).then(d => {
            if (!d) { setLoading(false); return }
            const normalized: Partial<Record<DetailsKey, string>> = {}
            for (const k of DETAILS_FIELDS) {
                const v = d[k]
                if (v == null) continue
                if (k === "dateOfBirth" || k === "marriageDate") {
                    normalized[k] = String(v).split("T")[0]
                } else {
                    normalized[k] = String(v)
                }
            }
            setData(normalized)
        }).finally(() => setLoading(false))
    }, [])

    const set = (k: DetailsKey) => (v: string) => setData(d => ({ ...d, [k]: v }))

    const save = async () => {
        setSaving(true)
        try {
            const res = await fetch("/api/me/employee", {
                method: "PATCH", headers: { "Content-Type": "application/json" },
                body: JSON.stringify(data),
            })
            if (!res.ok) throw new Error(await res.text())
            toast.success("Details saved!")
        } catch (e) {
            toast.error((e as Error).message || "Save failed")
        } finally { setSaving(false) }
    }

    const filledCount = DETAILS_FIELDS.filter(k => data[k] && String(data[k]).trim()).length
    const pct = Math.round((filledCount / DETAILS_FIELDS.length) * 100)

    if (loading) return <div className="flex justify-center py-12"><Loader2 className="animate-spin text-[var(--accent)]" /></div>

    return (
        <div className="space-y-4">
            {/* Completion bar */}
            <div className="bg-white border border-[var(--border)] rounded-2xl p-4">
                <div className="flex items-center justify-between mb-2">
                    <span className="text-[13px] font-medium text-[var(--text)]">Profile completion</span>
                    <span className="text-[13px] font-semibold text-[var(--accent)]">{pct}%</span>
                </div>
                <div className="w-full h-2 bg-[var(--surface)] rounded-full overflow-hidden">
                    <div className="h-full bg-[var(--accent)] transition-all" style={{ width: `${pct}%` }} />
                </div>
                <p className="text-[11px] text-[var(--text3)] mt-2">
                    {filledCount} of {DETAILS_FIELDS.length} fields filled. Complete your profile for HR verification.
                </p>
            </div>

            <Section title="Personal Information" icon={UserCircle2}>
                <Field label="First Name" value={data.firstName ?? ""} onChange={set("firstName")} />
                <Field label="Middle Name" value={data.middleName ?? ""} onChange={set("middleName")} />
                <Field label="Last Name" value={data.lastName ?? ""} onChange={set("lastName")} />
                <Field label="Name (as per Aadhaar)" value={data.nameAsPerAadhar ?? ""} onChange={set("nameAsPerAadhar")} />
                <Field label="Father's Name" value={data.fathersName ?? ""} onChange={set("fathersName")} />
                <Field label="Date of Birth" type="date" value={data.dateOfBirth ?? ""} onChange={set("dateOfBirth")} />
                <SelectField label="Gender" value={data.gender ?? ""} onChange={set("gender")}
                    options={[{ value: "MALE", label: "Male" }, { value: "FEMALE", label: "Female" }, { value: "OTHER", label: "Other" }]} />
                <SelectField label="Blood Group" value={data.bloodGroup ?? ""} onChange={set("bloodGroup")}
                    options={["A+","A-","B+","B-","AB+","AB-","O+","O-"].map(v => ({ value: v, label: v }))} />
                <SelectField label="Marital Status" value={data.maritalStatus ?? ""} onChange={set("maritalStatus")}
                    options={[{ value: "SINGLE", label: "Single" }, { value: "MARRIED", label: "Married" }, { value: "DIVORCED", label: "Divorced" }, { value: "WIDOWED", label: "Widowed" }]} />
                <Field label="Marriage Date" type="date" value={data.marriageDate ?? ""} onChange={set("marriageDate")} />
                <Field label="Nationality" value={data.nationality ?? ""} onChange={set("nationality")} placeholder="Indian" />
                <Field label="Religion" value={data.religion ?? ""} onChange={set("religion")} />
                <Field label="Caste" value={data.caste ?? ""} onChange={set("caste")} />
                <Field label="Phone" value={data.phone ?? ""} onChange={set("phone")} />
                <Field label="Alternate Phone" value={data.alternatePhone ?? ""} onChange={set("alternatePhone")} />
                <Field label="Email" type="email" value={data.email ?? ""} onChange={set("email")} colSpan={2} />
            </Section>

            <Section title="Current Address" icon={MapPin}>
                <Field label="Address Line" value={data.address ?? ""} onChange={set("address")} colSpan={2} />
                <Field label="City" value={data.city ?? ""} onChange={set("city")} />
                <Field label="State" value={data.state ?? ""} onChange={set("state")} />
                <Field label="Pincode" value={data.pincode ?? ""} onChange={set("pincode")} />
            </Section>

            <Section title="Permanent Address" icon={MapPin}>
                <Field label="Address Line" value={data.permanentAddress ?? ""} onChange={set("permanentAddress")} colSpan={2} />
                <Field label="City" value={data.permanentCity ?? ""} onChange={set("permanentCity")} />
                <Field label="State" value={data.permanentState ?? ""} onChange={set("permanentState")} />
                <Field label="Pincode" value={data.permanentPincode ?? ""} onChange={set("permanentPincode")} />
            </Section>

            <Section title="Identity & Employment IDs" icon={IdCard}>
                <Field label="Aadhaar Number" value={data.aadharNumber ?? ""} onChange={set("aadharNumber")} />
                <Field label="PAN Number" value={data.panNumber ?? ""} onChange={set("panNumber")} />
                <Field label="UAN" value={data.uan ?? ""} onChange={set("uan")} />
                <Field label="PF Number" value={data.pfNumber ?? ""} onChange={set("pfNumber")} />
                <Field label="ESI Number" value={data.esiNumber ?? ""} onChange={set("esiNumber")} />
                <Field label="Labour Card No." value={data.labourCardNo ?? ""} onChange={set("labourCardNo")} />
            </Section>

            <Section title="Bank Details" icon={CreditCard}>
                <Field label="Account Number" value={data.bankAccountNumber ?? ""} onChange={set("bankAccountNumber")} />
                <Field label="IFSC Code" value={data.bankIFSC ?? ""} onChange={set("bankIFSC")} />
                <Field label="Bank Name" value={data.bankName ?? ""} onChange={set("bankName")} />
                <Field label="Branch" value={data.bankBranch ?? ""} onChange={set("bankBranch")} />
            </Section>

            <Section title="Emergency Contacts" icon={Contact}>
                <Field label="Contact 1 – Name" value={data.emergencyContact1Name ?? ""} onChange={set("emergencyContact1Name")} />
                <Field label="Contact 1 – Phone" value={data.emergencyContact1Phone ?? ""} onChange={set("emergencyContact1Phone")} />
                <Field label="Contact 2 – Name" value={data.emergencyContact2Name ?? ""} onChange={set("emergencyContact2Name")} />
                <Field label="Contact 2 – Phone" value={data.emergencyContact2Phone ?? ""} onChange={set("emergencyContact2Phone")} />
            </Section>

            <div className="sticky bottom-4 flex justify-end">
                <button onClick={save} disabled={saving}
                    className="px-5 py-2.5 bg-[var(--accent)] text-white rounded-lg text-[13px] font-semibold flex items-center gap-2 hover:opacity-90 disabled:opacity-60 shadow-md">
                    {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                    Save All Details
                </button>
            </div>
        </div>
    )
}

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]
const DOC_TYPES = ["AADHAAR","PAN","RESUME","PHOTO","CERTIFICATE","BANK_PROOF","OFFER_LETTER","OTHER"]
const DOC_LABELS: Record<string, string> = {
    AADHAAR:"Aadhaar Card", PAN:"PAN Card", RESUME:"Resume / CV",
    PHOTO:"Passport Photo", CERTIFICATE:"Educational Certificate",
    BANK_PROOF:"Bank Proof / Passbook", OFFER_LETTER:"Offer Letter", OTHER:"Other Document"
}

function statusBadge(s: string) {
    if (s === "VERIFIED")  return <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-green-100 text-green-700">Verified ✓</span>
    if (s === "REJECTED")  return <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-red-100 text-red-600">Rejected</span>
    return <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-700">Pending Review</span>
}

function taskStatusIcon(s: string) {
    if (s === "COMPLETED") return <CheckCircle2 size={16} className="text-green-500 shrink-0" />
    if (s === "SKIPPED")   return <XCircle size={16} className="text-gray-400 shrink-0" />
    if (s === "IN_PROGRESS") return <Clock size={16} className="text-blue-500 shrink-0 animate-pulse" />
    return <div className="w-4 h-4 rounded-full border-2 border-[var(--border)] shrink-0" />
}

// Simulate file upload — in production use Supabase Storage / S3
async function uploadFile(file: File): Promise<string> {
    return new Promise(resolve => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.readAsDataURL(file)
    })
}

// ─── Tab: My Documents ────────────────────────────────────────────────────────
function DocsTab() {
    const [docs, setDocs] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [uploading, setUploading] = useState<string | null>(null)
    const fileRefs = useRef<Record<string, HTMLInputElement | null>>({})

    useEffect(() => {
        fetch("/api/me/documents").then(r => r.json()).then(setDocs).finally(() => setLoading(false))
    }, [])

    const upload = async (type: string, file: File) => {
        setUploading(type)
        try {
            const fileUrl = await uploadFile(file)
            const res = await fetch("/api/me/documents", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ type, fileName: file.name, fileUrl })
            })
            if (!res.ok) throw new Error()
            const doc = await res.json()
            setDocs(prev => [...prev.filter(d => d.type !== type), doc])
            toast.success(`${DOC_LABELS[type]} uploaded! Pending HR review.`)
        } catch { toast.error("Upload failed") }
        finally { setUploading(null) }
    }

    if (loading) return <div className="flex justify-center py-12"><Loader2 className="animate-spin text-[var(--accent)]" /></div>

    return (
        <div className="space-y-3">
            <p className="text-[13px] text-[var(--text3)]">Upload your documents. HR will verify them. Rejected documents can be re-uploaded.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {DOC_TYPES.map(type => {
                    const existing = docs.find(d => d.type === type)
                    const isUploading = uploading === type
                    return (
                        <div key={type} className={`border rounded-xl p-4 ${existing?.status === "REJECTED" ? "border-red-200 bg-red-50" : "border-[var(--border)] bg-white"}`}>
                            <div className="flex items-start justify-between gap-3">
                                <div className="flex items-center gap-2.5">
                                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${existing ? "bg-green-100" : "bg-[var(--surface)]"}`}>
                                        <FileText size={15} className={existing ? "text-green-600" : "text-[var(--text3)]"} />
                                    </div>
                                    <div>
                                        <p className="text-[13px] font-medium text-[var(--text)]">{DOC_LABELS[type]}</p>
                                        {existing && <p className="text-[11px] text-[var(--text3)] mt-0.5 truncate max-w-[150px]">{existing.fileName}</p>}
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                    {existing && statusBadge(existing.status)}
                                    <button
                                        onClick={() => fileRefs.current[type]?.click()}
                                        disabled={isUploading}
                                        className="flex items-center gap-1 text-[11px] font-medium text-[var(--accent)] hover:underline disabled:opacity-50">
                                        {isUploading ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
                                        {existing ? "Re-upload" : "Upload"}
                                    </button>
                                    <input ref={el => { fileRefs.current[type] = el }} type="file"
                                        accept=".pdf,.jpg,.jpeg,.png" className="hidden"
                                        onChange={e => { const f = e.target.files?.[0]; if (f) upload(type, f) }} />
                                </div>
                            </div>
                            {existing?.status === "REJECTED" && existing.rejectionReason && (
                                <div className="mt-2 flex items-start gap-1.5 text-[11px] text-red-600">
                                    <AlertCircle size={12} className="mt-0.5 shrink-0" />
                                    <span>{existing.rejectionReason}</span>
                                </div>
                            )}
                        </div>
                    )
                })}
            </div>
        </div>
    )
}

// ─── Tab: My Onboarding ───────────────────────────────────────────────────────
function OnboardingTab() {
    const [data, setData] = useState<any>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        fetch("/api/me/onboarding").then(r => r.json()).then(setData).finally(() => setLoading(false))
    }, [])

    if (loading) return <div className="flex justify-center py-12"><Loader2 className="animate-spin text-[var(--accent)]" /></div>
    if (!data?.onboardingRecord) return (
        <div className="text-center py-12 text-[var(--text3)]">
            <ClipboardList size={36} className="mx-auto mb-3 opacity-30" />
            <p className="text-[14px]">Onboarding not started yet.</p>
        </div>
    )

    const record = data.onboardingRecord
    const tasks: any[] = record.tasks ?? []
    const completed = tasks.filter(t => t.status === "COMPLETED").length
    const pct = tasks.length ? Math.round((completed / tasks.length) * 100) : 0

    // Group tasks by category
    const grouped = tasks.reduce((acc: Record<string, any[]>, t) => {
        acc[t.category] = [...(acc[t.category] ?? []), t]
        return acc
    }, {})

    const statusColors: Record<string, string> = {
        NOT_STARTED: "bg-gray-100 text-gray-600",
        IN_PROGRESS: "bg-blue-100 text-blue-700",
        COMPLETED: "bg-green-100 text-green-700",
        ON_HOLD: "bg-amber-100 text-amber-700",
    }

    return (
        <div className="space-y-4">
            {/* Progress */}
            <div className="bg-white border border-[var(--border)] rounded-xl p-5">
                <div className="flex items-center justify-between mb-3">
                    <div>
                        <p className="text-[14px] font-semibold text-[var(--text)]">Onboarding Progress</p>
                        <p className="text-[12px] text-[var(--text3)] mt-0.5">{completed} of {tasks.length} tasks completed</p>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-[11px] font-semibold ${statusColors[record.status] ?? "bg-gray-100 text-gray-600"}`}>
                        {record.status.replace("_", " ")}
                    </span>
                </div>
                <div className="w-full h-2 bg-[var(--surface)] rounded-full overflow-hidden">
                    <div className="h-full bg-[var(--accent)] rounded-full transition-all" style={{ width: `${pct}%` }} />
                </div>
                <p className="text-right text-[12px] text-[var(--accent)] font-semibold mt-1">{pct}%</p>
            </div>

            {/* Tasks by category */}
            {Object.entries(grouped).map(([cat, catTasks]) => (
                <div key={cat} className="bg-white border border-[var(--border)] rounded-xl overflow-hidden">
                    <div className="px-4 py-3 border-b border-[var(--border)] flex items-center justify-between">
                        <p className="text-[13px] font-semibold text-[var(--text)]">{cat}</p>
                        <p className="text-[11px] text-[var(--text3)]">
                            {catTasks.filter(t => t.status === "COMPLETED").length}/{catTasks.length}
                        </p>
                    </div>
                    <div className="divide-y divide-[var(--border)]">
                        {catTasks.map((task: any) => (
                            <div key={task.id} className="px-4 py-3 flex items-start gap-3">
                                {taskStatusIcon(task.status)}
                                <div className="flex-1 min-w-0">
                                    <p className={`text-[13px] ${task.status === "COMPLETED" ? "line-through text-[var(--text3)]" : "text-[var(--text)]"}`}>
                                        {task.title}
                                    </p>
                                    {task.description && <p className="text-[11px] text-[var(--text3)] mt-0.5">{task.description}</p>}
                                    {task.dueDate && (
                                        <p className="text-[11px] text-amber-600 mt-0.5">
                                            Due: {new Date(task.dueDate).toLocaleDateString("en-IN")}
                                        </p>
                                    )}
                                </div>
                                {task.isRequired && task.status !== "COMPLETED" && (
                                    <span className="text-[10px] text-red-500 font-medium shrink-0">Required</span>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            ))}
        </div>
    )
}

// ─── Tab: My Payslip ─────────────────────────────────────────────────────────
function PayslipTab() {
    const [data, setData] = useState<{ employee: any; payslips: any[] } | null>(null)
    const [loading, setLoading] = useState(true)
    const [selected, setSelected] = useState<any>(null)

    useEffect(() => {
        fetch("/api/me/payslip").then(r => r.json()).then(d => {
            setData(d)
            if (d.payslips?.length) setSelected(d.payslips[0])
        }).finally(() => setLoading(false))
    }, [])

    if (loading) return <div className="flex justify-center py-12"><Loader2 className="animate-spin text-[var(--accent)]" /></div>
    if (!data?.payslips?.length) return (
        <div className="text-center py-12 text-[var(--text3)]">
            <IndianRupee size={36} className="mx-auto mb-3 opacity-30" />
            <p className="text-[14px]">No payslips available yet.</p>
            <p className="text-[12px] mt-1">Payslips will appear here once HR processes your salary.</p>
        </div>
    )

    const p = selected

    return (
        <div className="space-y-4">
            {/* Month selector */}
            <div className="flex gap-2 overflow-x-auto pb-1">
                {data.payslips.map((ps: any) => (
                    <button key={ps.id} onClick={() => setSelected(ps)}
                        className={`shrink-0 px-3 py-1.5 rounded-lg text-[12px] font-medium border transition-colors ${selected?.id === ps.id ? "bg-[var(--accent)] text-white border-[var(--accent)]" : "bg-white border-[var(--border)] text-[var(--text3)]"}`}>
                        {MONTHS[ps.month - 1]} {ps.year}
                    </button>
                ))}
            </div>

            {p && (
                <div className="bg-white border border-[var(--border)] rounded-xl overflow-hidden">
                    {/* Header */}
                    <div className="bg-[var(--accent)] text-white px-6 py-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-[18px] font-bold">{data.employee.firstName} {data.employee.lastName}</p>
                                <p className="text-[12px] opacity-80 mt-0.5">{data.employee.employeeId} · {data.employee.designation}</p>
                            </div>
                            <div className="text-right">
                                <p className="text-[13px] opacity-80">Pay Period</p>
                                <p className="text-[16px] font-bold">{MONTHS[p.month - 1]} {p.year}</p>
                            </div>
                        </div>
                        <div className="mt-4 text-center">
                            <p className="text-[12px] opacity-80">Net Salary</p>
                            <p className="text-[32px] font-bold">₹{Math.round(p.netSalary).toLocaleString("en-IN")}</p>
                        </div>
                    </div>

                    <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-5">
                        {/* Earnings */}
                        <div>
                            <p className="text-[12px] font-semibold text-[var(--text3)] uppercase tracking-wide mb-3">Earnings</p>
                            <div className="space-y-2">
                                {[
                                    ["Basic", p.basicSalary],
                                    ["DA", p.da],
                                    ["HRA", p.hra],
                                    ["Washing", p.washing],
                                    ["Bonus", p.bonus],
                                    ["OT Pay", p.overtimePay],
                                ].filter(([, v]) => Number(v) > 0).map(([label, val]) => (
                                    <div key={label as string} className="flex justify-between text-[13px]">
                                        <span className="text-[var(--text3)]">{label}</span>
                                        <span className="font-medium">₹{Math.round(val as number).toLocaleString("en-IN")}</span>
                                    </div>
                                ))}
                                <div className="flex justify-between text-[13px] border-t border-[var(--border)] pt-2 font-semibold">
                                    <span>Gross Earnings</span>
                                    <span className="text-[var(--accent)]">₹{Math.round(p.grossSalary).toLocaleString("en-IN")}</span>
                                </div>
                            </div>
                        </div>

                        {/* Deductions */}
                        <div>
                            <p className="text-[12px] font-semibold text-[var(--text3)] uppercase tracking-wide mb-3">Deductions</p>
                            <div className="space-y-2">
                                {[
                                    ["PF (Employee)", p.pfEmployee],
                                    ["ESIC (0.75%)", p.esiEmployee],
                                    ["Professional Tax", p.pt],
                                    ["Canteen", p.canteen],
                                    ["Penalty", p.penalty],
                                    ["Advance", p.advance],
                                    ["Other", p.otherDeductions],
                                ].filter(([, v]) => Number(v) > 0).map(([label, val]) => (
                                    <div key={label as string} className="flex justify-between text-[13px]">
                                        <span className="text-[var(--text3)]">{label}</span>
                                        <span className="text-red-600">-₹{Math.round(val as number).toLocaleString("en-IN")}</span>
                                    </div>
                                ))}
                                <div className="flex justify-between text-[13px] border-t border-[var(--border)] pt-2 font-semibold">
                                    <span>Total Deductions</span>
                                    <span className="text-red-600">-₹{Math.round(p.totalDeductions).toLocaleString("en-IN")}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Attendance + Net */}
                    <div className="border-t border-[var(--border)] px-5 py-4 bg-[var(--surface)] grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                        {[
                            ["Working Days", p.workingDays],
                            ["Days Present", p.presentDays],
                            ["LOP Days", p.workingDays - p.presentDays],
                            ["OT Days", p.otDays],
                        ].map(([label, val]) => (
                            <div key={label as string}>
                                <p className="text-[11px] text-[var(--text3)]">{label}</p>
                                <p className="text-[18px] font-bold text-[var(--text)]">{val}</p>
                            </div>
                        ))}
                    </div>

                    {/* CTC row */}
                    <div className="border-t border-[var(--border)] px-5 py-3 flex items-center justify-between text-[12px] text-[var(--text3)]">
                        <span>Employer PF: <b className="text-[var(--text)]">₹{p.pfEmployer}</b></span>
                        <span>Employer ESIC: <b className="text-[var(--text)]">₹{p.esiEmployer}</b></span>
                        <span>CTC: <b className="text-purple-700">₹{Math.round(p.ctc).toLocaleString("en-IN")}</b></span>
                    </div>

                    {/* Download / Print */}
                    <div className="border-t border-[var(--border)] px-5 py-3 flex justify-end gap-2">
                        <button
                            onClick={() => window.print()}
                            className="flex items-center gap-1.5 px-4 py-2 border border-[var(--border)] rounded-lg text-[12px] font-medium text-[var(--text)] hover:bg-[var(--surface)] transition-colors"
                        >
                            <Printer size={14} /> Print Salary Slip
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}

// ─── Tab: My Letters ──────────────────────────────────────────────────────────
function LettersTab() {
    const [letters, setLetters] = useState<any[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        fetch("/api/me/letters").then(r => r.json()).then(d => {
            setLetters(Array.isArray(d) ? d : [])
        }).finally(() => setLoading(false))
    }, [])

    if (loading) return <div className="flex justify-center py-12"><Loader2 className="animate-spin text-[var(--accent)]" /></div>

    if (!letters.length) return (
        <div className="text-center py-12 text-[var(--text3)]">
            <BookOpen size={36} className="mx-auto mb-3 opacity-30" />
            <p className="text-[14px]">No letters issued yet.</p>
            <p className="text-[12px] mt-1">Offer letters, appointment letters and certificates will appear here.</p>
        </div>
    )

    const typeColors: Record<string, string> = {
        "Offer Letter": "#7c3aed", "Appointment Letter": "#1d4ed8",
        "Confirmation Letter": "#0f766e", "Experience Letter": "#b45309",
        "Salary Certificate": "#15803d", "Relieving Letter": "#dc2626",
    }

    return (
        <div className="space-y-3">
            <p className="text-[13px] text-[var(--text3)]">{letters.length} letter{letters.length !== 1 ? "s" : ""} issued to you</p>
            {letters.map((letter: any) => (
                <div key={letter.id} className="bg-white border border-[var(--border)] rounded-xl p-4 flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                        <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                            style={{ background: `${typeColors[letter.type?.name] ?? "#6366f1"}18` }}>
                            <FileText size={16} style={{ color: typeColors[letter.type?.name] ?? "#6366f1" }} />
                        </div>
                        <div>
                            <p className="text-[13.5px] font-semibold text-[var(--text)]">{letter.type?.name ?? "Document"}</p>
                            <p className="text-[11px] text-[var(--text3)] mt-0.5">
                                Doc No: {letter.docNumber}
                                {letter.effectiveDate && ` · ${new Date(letter.effectiveDate).toLocaleDateString("en-IN")}`}
                            </p>
                            {letter.remarks && <p className="text-[11px] text-[var(--text3)] mt-0.5 italic">{letter.remarks}</p>}
                        </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-100 text-blue-700">Issued</span>
                        {letter.content && (
                            <a
                                href={`data:text/plain;charset=utf-8,${encodeURIComponent(letter.content)}`}
                                download={`${letter.type?.name ?? "Document"}-${letter.docNumber}.txt`}
                                className="flex items-center gap-1 text-[11px] font-medium text-[var(--accent)] hover:underline"
                            >
                                <Download size={12} /> Download
                            </a>
                        )}
                    </div>
                </div>
            ))}
        </div>
    )
}

// ─── Main Profile Page ────────────────────────────────────────────────────────
export default function ProfilePage() {
    const { data: session, update } = useSession()
    const [activeTab, setActiveTab] = useState<"profile"|"documents"|"onboarding"|"payslip"|"letters">("profile")
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [formData, setFormData] = useState({ name: "", email: "", phone: "", role: "" })

    const isEmployee = session?.user?.role === "INSPECTION_BOY"

    useEffect(() => {
        fetch("/api/profile").then(r => r.json()).then(d => {
            setFormData({ name: d.name||"", email: d.email||"", phone: d.phone||"", role: d.role||"" })
        }).finally(() => setLoading(false))
    }, [])

    const saveProfile = async (e: React.FormEvent) => {
        e.preventDefault()
        setSaving(true)
        try {
            const res = await fetch("/api/profile", {
                method: "PUT", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: formData.name, phone: formData.phone })
            })
            if (!res.ok) throw new Error()
            await update({ name: formData.name })
            toast.success("Profile updated!")
        } catch { toast.error("Failed to update profile") }
        finally { setSaving(false) }
    }

    if (loading) return <div className="flex h-[50vh] items-center justify-center"><Loader2 className="animate-spin text-[var(--accent)]" /></div>

    const roleBadge: Record<string, { bg: string; color: string }> = {
        ADMIN:          { bg: "#e8f7f1", color: "#0d6b4a" },
        MANAGER:        { bg: "#eff6ff", color: "#1d4ed8" },
        INSPECTION_BOY: { bg: "#fef3c7", color: "#92400e" },
    }
    const badge = roleBadge[formData.role] ?? { bg: "#f9f8f5", color: "#6b6860" }

    const tabs = [
        { key: "profile",    label: "Profile",       icon: User },
        ...(isEmployee ? [
            { key: "documents",  label: "My Documents",  icon: FileText },
            { key: "letters",    label: "My Letters",    icon: BookOpen },
            { key: "onboarding", label: "My Onboarding", icon: ClipboardList },
            { key: "payslip",    label: "My Payslip",    icon: IndianRupee },
        ] : [])
    ] as { key: typeof activeTab; label: string; icon: any }[]

    return (
        <div className="max-w-3xl mx-auto pb-12 space-y-5">
            {/* Header card */}
            <div className="bg-white border border-[var(--border)] rounded-2xl p-6 flex items-center gap-4">
                <div className="w-14 h-14 rounded-full bg-[#1a1a18] text-white flex items-center justify-center text-[22px] font-bold shrink-0">
                    {formData.name.charAt(0).toUpperCase()}
                </div>
                <div>
                    <p className="text-[17px] font-semibold text-[var(--text)]">{formData.name}</p>
                    <p className="text-[12px] text-[var(--text3)] mt-0.5">{formData.email}</p>
                    <span className="inline-block mt-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-semibold tracking-wide"
                        style={{ backgroundColor: badge.bg, color: badge.color }}>
                        {formData.role.replace("_", " ")}
                    </span>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 bg-[var(--surface)] rounded-xl p-1 w-fit">
                {tabs.map(({ key, label, icon: Icon }) => (
                    <button key={key} onClick={() => setActiveTab(key)}
                        className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-[13px] font-medium transition-colors ${activeTab === key ? "bg-white text-[var(--text)] shadow-sm" : "text-[var(--text3)] hover:text-[var(--text)]"}`}>
                        <Icon size={14} />{label}
                    </button>
                ))}
            </div>

            {/* ── Profile tab ── */}
            {activeTab === "profile" && (
                <form onSubmit={saveProfile} className="bg-white border border-[var(--border)] rounded-2xl p-6 space-y-5">
                    <div>
                        <label className="text-[11px] font-medium text-[var(--text3)] uppercase tracking-wide block mb-1.5">Full Name</label>
                        <div className="relative">
                            <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text3)]" />
                            <input value={formData.name} onChange={e => setFormData(f => ({ ...f, name: e.target.value }))}
                                className="w-full pl-9 pr-4 py-2.5 border border-[var(--border)] rounded-lg text-[13px] outline-none focus:border-[var(--accent)]" />
                        </div>
                    </div>
                    <div>
                        <label className="text-[11px] font-medium text-[var(--text3)] uppercase tracking-wide block mb-1.5">Email <span className="normal-case font-normal">(read-only)</span></label>
                        <div className="relative">
                            <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text3)]" />
                            <input value={formData.email} disabled
                                className="w-full pl-9 pr-4 py-2.5 border border-dashed border-[var(--border)] rounded-lg text-[13px] text-[var(--text3)] bg-[var(--surface)] cursor-not-allowed" />
                        </div>
                    </div>
                    <div>
                        <label className="text-[11px] font-medium text-[var(--text3)] uppercase tracking-wide block mb-1.5">Phone</label>
                        <div className="relative">
                            <Phone size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text3)]" />
                            <input value={formData.phone} onChange={e => setFormData(f => ({ ...f, phone: e.target.value }))}
                                className="w-full pl-9 pr-4 py-2.5 border border-[var(--border)] rounded-lg text-[13px] outline-none focus:border-[var(--accent)]" />
                        </div>
                    </div>
                    <button type="submit" disabled={saving}
                        className="w-full py-2.5 bg-[var(--accent)] text-white rounded-lg text-[13px] font-semibold flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-60">
                        {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                        Save Profile
                    </button>
                </form>
            )}

            {activeTab === "documents"  && <DocsTab />}
            {activeTab === "letters"    && <LettersTab />}
            {activeTab === "onboarding" && <OnboardingTab />}
            {activeTab === "payslip"    && <PayslipTab />}
        </div>
    )
}
