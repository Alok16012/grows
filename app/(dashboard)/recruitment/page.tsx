"use client"
import { useState, useEffect, useMemo, useCallback, useRef } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { can } from "@/lib/can"
import {
    Plus, Search, Phone, Mail, MapPin, Calendar, Users,
    Target, X, ChevronRight, Briefcase,
    MessageSquare, PhoneCall, Send, Clock, Filter,
    Edit2, Trash2, CheckCircle, Loader2,
    StickyNote, ArrowRight, ArrowUpRight,
    UserCheck, Banknote, Building2, Wrench,
    FileText, GraduationCap, Award, BarChart2,
    Flame, Droplet, Thermometer, Snowflake, CheckSquare, AlertCircle,
    TrendingUp, Download, Upload, Eye,
    Link2, Copy, ExternalLink, UserPlus, ToggleLeft, ToggleRight, Camera
} from "lucide-react"
import { DocumentViewer } from "@/components/DocumentViewer"
import { EmployeeModal, Employee as EmpType } from "@/components/EmployeeModal"
import { format, formatDistanceToNow, parseISO } from "date-fns"
import * as XLSX from "xlsx"
import dynamic from "next/dynamic"
import type { AnalyticsData } from "./RecruitmentAnalytics"

// Charts pull in recharts (~150kB) — only needed on the Analytics tab, so load
// the whole analytics view lazily to keep the candidate list/board bundle lean.
const RecruitmentAnalytics = dynamic(() => import("./RecruitmentAnalytics"), {
    ssr: false,
    loading: () => (
        <div className="flex items-center justify-center py-24">
            <Loader2 size={32} className="animate-spin text-[var(--accent)]" />
        </div>
    ),
})

// ─── Constants ───────────────────────────────────────────────────────────────

const STATUSES = [
    { key: "NEW_LEAD",            label: "New Lead",            color: "#6b7280", bg: "#f9fafb", border: "#e5e7eb" },
    { key: "CONTACTED",           label: "Contacted",           color: "#3b82f6", bg: "#eff6ff", border: "#bfdbfe" },
    { key: "INTERESTED",          label: "Interested",          color: "#8b5cf6", bg: "#f5f3ff", border: "#ddd6fe" },
    { key: "INTERVIEW_SCHEDULED", label: "Interview Scheduled", color: "#f59e0b", bg: "#fffbeb", border: "#fde68a" },
    { key: "INTERVIEW_DONE",      label: "Interview Done",      color: "#06b6d4", bg: "#ecfeff", border: "#a5f3fc" },
    { key: "SELECTED",            label: "Selected",            color: "#1a9e6e", bg: "#e8f7f1", border: "#6ee7b7" },
    { key: "OFFERED",             label: "Offered",             color: "#65a30d", bg: "#f7fee7", border: "#bef264" },
    { key: "JOINED",              label: "Joined ✓",            color: "#047857", bg: "#ecfdf5", border: "#6ee7b7" },
    { key: "ON_SITE_JOINED",      label: "On-site Joined ✓✓",   color: "#0d9488", bg: "#f0fdfa", border: "#5eead4" },
    { key: "REJECTED",            label: "Rejected",            color: "#9ca3af", bg: "#f9fafb", border: "#e5e7eb" },
    { key: "DROPPED",             label: "Dropped",             color: "#9ca3af", bg: "#f3f4f6", border: "#d1d5db" },
]

const PRIORITY_CONFIG: Record<string, { label: string; color: string; dot: string }> = {
    HIGH:   { label: "High",   color: "#dc2626", dot: "bg-[#dc2626]" },
    MEDIUM: { label: "Medium", color: "#f59e0b", dot: "bg-[#f59e0b]" },
    LOW:    { label: "Low",    color: "#1a9e6e", dot: "bg-[#1a9e6e]" },
}

const SCORE_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
    HOT:  { label: "Hot",  color: "#dc2626", bg: "#fef2f2", border: "#fecaca" },
    WARM: { label: "Warm", color: "#ea580c", bg: "#fff7ed", border: "#fdba74" },
    COLD: { label: "Cold", color: "#2563eb", bg: "#eff6ff", border: "#bfdbfe" },
}

const ACTIVITY_TYPES = [
    { key: "note",      label: "Note",      icon: StickyNote,   color: "#6b7280" },
    { key: "call",      label: "Call",      icon: PhoneCall,    color: "#3b82f6" },
    { key: "whatsapp",  label: "WhatsApp",  icon: MessageSquare,color: "#25d366" },
    { key: "email",     label: "Email",     icon: Send,         color: "#8b5cf6" },
    { key: "interview", label: "Interview", icon: UserCheck,    color: "#f59e0b" },
]

// Normalise an Indian phone number for wa.me (digits only, with country code).
function waNumber(phone?: string | null) {
    const d = (phone || "").replace(/\D/g, "")
    if (!d) return ""
    return d.length === 10 ? `91${d}` : d
}

// Open the real Call / WhatsApp / Email channel for a candidate.
function openContactChannel(type: string, phone?: string | null, email?: string | null) {
    if (type === "call" && phone) {
        window.open(`tel:${phone.replace(/\s/g, "")}`)
    } else if (type === "whatsapp") {
        const num = waNumber(phone)
        if (num) window.open(`https://wa.me/${num}`, "_blank", "noopener")
    } else if (type === "email" && email) {
        window.open(`mailto:${email}`)
    }
}

const POSITIONS = [
    "Quality Inspector",
    "Quality Supervisor",
    "QRE",
    "CMM Operator",
    "Designer",
    "Security Guard",
    "Security Supervisor",
    "Driver",
    "Heavy Vehicle Driver",
    "Helper / Labour",
    "Electrician",
    "Plumber",
    "Housekeeping Staff",
    "Peon / Office Boy",
    "Data Entry Operator",
    "HR Recruiter",
    "HR Recruiter TL",
    "HR Executive",
    "HR Manager",
    "Field Recruiter",
    "Payroll Executive",
    "Compliance Executive",
    "Account Executive",
    "MIS Executive",
    "Operations Manager",
    "Operations Head",
    "Other",
]

const SOURCES = ["Walk-in", "LinkedIn", "Naukri", "Indeed", "WorkIndia", "Referral", "WhatsApp", "Agency", "Newspaper Ad", "Other"]
const QUALIFICATIONS = ["8th Pass", "10th Pass", "12th Pass", "ITI", "Diploma", "Graduate", "Post Graduate", "Other"]
const INTERVIEW_MODES = ["In-person", "Phone", "Video Call", "WhatsApp Video"]
const DOC_TYPES = ["RESUME", "AADHAAR", "PAN", "CERTIFICATE", "OTHER"]
const FOLLOWUP_TYPES = ["CALL", "INTERVIEW", "DOCUMENT", "OTHER"]
const PIE_COLORS = ["#3b82f6", "#8b5cf6", "#f59e0b", "#06b6d4", "#1a9e6e", "#dc2626", "#65a30d", "#ea580c", "#6b7280"]

// ─── Types ────────────────────────────────────────────────────────────────────

interface Lead {
    id: string
    candidateName: string
    phone: string
    email?: string
    city?: string
    position: string
    experience?: number
    currentCompany?: string
    qualification?: string
    skills?: string
    expectedSalary?: number
    currentSalary?: number
    interviewDate?: string
    interviewMode?: string
    interviewerId?: string
    interviewFeedback?: string
    interviewResult?: string
    source: string
    status: string
    priority: string
    score: string
    assignedTo?: string
    notes?: string
    nextFollowUp?: string
    locality?: string
    gender?: string
    languages?: string
    age?: number
    course?: string
    specialization?: string
    collegeName?: string
    courseStartYear?: string
    courseEndYear?: string
    previousDesignation?: string
    previousCompany?: string
    resumeUrl?: string
    profileUrl?: string
    englishLevel?: string
    levelOfExperience?: string
    convertedEmployeeId?: string | null
    // Candidate Personal Information Form fields
    altPhone?: string
    dateOfBirth?: string
    tshirtSize?: string
    bloodGroup?: string
    maritalStatus?: string
    nationality?: string
    aadharNumber?: string
    fatherName?: string
    fatherOccupation?: string
    motherName?: string
    motherOccupation?: string
    presentAddress?: string
    permanentAddress?: string
    currentDesignation?: string
    pfEsicNumber?: string
    reasonForLeaving?: string
    hasBike?: boolean
    documentsSubmitted?: string[]
    educationDetails?: { course?: string; stream?: string; institute?: string; year?: string; percentage?: string; location?: string }[]
    createdAt: string
    updatedAt: string
    assignee?: { id: string; name: string; email: string }
    creator?: { id: string; name: string }
    activities?: Activity[]
    documents?: LeadDocument[]
    followUps?: LeadFollowUp[]
    _count?: { activities: number; documents: number; followUps: number }
}

interface Activity {
    id: string
    type: string
    content: string
    createdAt: string
    user: { id: string; name: string }
}

interface LeadDocument {
    id: string
    docType: string
    fileName: string
    url: string
    verified: string
    createdAt: string
    uploader: { id: string; name: string }
}

interface LeadFollowUp {
    id: string
    type: string
    note?: string
    scheduledAt: string
    completedAt?: string
    status: string
    createdAt: string
    creator: { id: string; name: string }
}

interface AppUser {
    id: string
    name: string
    email: string
    role: string
}

// AnalyticsData now lives with the lazy-loaded analytics view (./RecruitmentAnalytics).

interface LeadFormEntry {
    id: string
    title: string
    slug: string
    description?: string | null
    isActive: boolean
    createdAt: string
    creator: { id: string; name: string }
    site?: { id: string; name: string } | null
}

interface SiteOption { id: string; name: string }
interface DeptOption { id: string; name: string }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(date: string | null | undefined) {
    if (!date) return "—"
    try { return format(parseISO(date), "dd MMM yyyy") } catch { return "—" }
}

function fmtSalary(val?: number | null) {
    if (!val) return null
    if (val >= 100000) return `₹${(val / 100000).toFixed(1)}L/yr`
    return `₹${val.toLocaleString("en-IN")}/mo`
}

function StatusBadge({ status }: { status: string }) {
    const s = STATUSES.find(x => x.key === status) ?? STATUSES[0]
    return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border"
            style={{ color: s.color, background: s.bg, borderColor: s.border }}>
            {s.label}
        </span>
    )
}

function ScoreBadge({ score }: { score: string }) {
    const s = SCORE_CONFIG[score] ?? SCORE_CONFIG.WARM
    const icons: Record<string, React.ReactNode> = {
        HOT:  <Flame size={11} />,
        WARM: <Flame size={11} />,
        COLD: <Snowflake size={11} />,
    }
    return (
        <span className="inline-flex items-center gap-1 px-2 py-[3px] rounded-full text-[11px] font-semibold border"
            style={{ color: s.color, background: s.bg, borderColor: s.border }}>
            {icons[score] ?? null}
            {s.label}
        </span>
    )
}

function PriorityDot({ priority }: { priority: string }) {
    const p = PRIORITY_CONFIG[priority] ?? PRIORITY_CONFIG.MEDIUM
    return <span className={`inline-block w-2 h-2 rounded-full ${p.dot}`} title={p.label} />
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function RecruitmentPage() {
    const { data: session, status } = useSession()
    const [leads, setLeads] = useState<Lead[]>([])
    const [users, setUsers] = useState<AppUser[]>([])
    const [loading, setLoading] = useState(true)
    const [activeTab, setActiveTab] = useState<"pipeline" | "analytics" | "documents" | "form-links">("pipeline")
    const router = useRouter()
    const [viewMode, setViewMode] = useState<"kanban" | "list">("kanban")
    const [searchQ, setSearchQ] = useState("")
    const [filterStatus, setFilterStatus] = useState("ALL")
    const [filterPriority, setFilterPriority] = useState("ALL")
    const [filterScore, setFilterScore] = useState("ALL")
    const [filterRecruiter, setFilterRecruiter] = useState("ALL")
    const [filterPosition, setFilterPosition] = useState("ALL")
    const [showForm, setShowForm] = useState(false)
    const [editLead, setEditLead] = useState<Lead | null>(null)
    const [detailLead, setDetailLead] = useState<Lead | null>(null)
    const [saving, setSaving] = useState(false)
    const [activityContent, setActivityContent] = useState("")
    const [activityType, setActivityType] = useState("note")
    const [savingActivity, setSavingActivity] = useState(false)
    const [analytics, setAnalytics] = useState<AnalyticsData | null>(null)
    const [analyticsLoading, setAnalyticsLoading] = useState(false)
    const [duplicateWarning, setDuplicateWarning] = useState("")
    const [showImportModal, setShowImportModal] = useState(false)
    const [importRows, setImportRows] = useState<Record<string, unknown>[]>([])
    const [importLoading, setImportLoading] = useState(false)
    const [importResult, setImportResult] = useState<{ imported: number; skipped: number; errors: { row: number; reason: string }[] } | null>(null)
    const importFileRef = useRef<HTMLInputElement>(null)
    const [previewUrl, setPreviewUrl] = useState<string | null>(null)
    const [previewName, setPreviewName] = useState<string>("")

    // Candidate photo upload
    const [candidatePhoto, setCandidatePhoto] = useState("")
    const [candidatePhotoUploading, setCandidatePhotoUploading] = useState(false)
    const candidatePhotoRef = useRef<HTMLInputElement>(null)
    async function uploadCandidatePhoto(file: File) {
        if (file.size > 2 * 1024 * 1024) { toast.error("Photo must be under 2MB"); return }
        setCandidatePhotoUploading(true)
        try {
            const fd = new FormData()
            fd.append("file", file)
            const res = await fetch("/api/upload", { method: "POST", body: fd })
            const data = await res.json()
            if (data.url) setCandidatePhoto(data.url)
            else toast.error("Photo upload failed")
        } catch { toast.error("Photo upload error") }
        finally { setCandidatePhotoUploading(false) }
    }

    // Form links state
    const [leadForms, setLeadForms] = useState<LeadFormEntry[]>([])
    const [loadingForms, setLoadingForms] = useState(false)
    const [showCreateForm, setShowCreateForm] = useState(false)
    const [createFormData, setCreateFormData] = useState({ title: "", description: "", siteId: "" })
    const [savingForm, setSavingForm] = useState(false)
    const [formSites, setFormSites] = useState<SiteOption[]>([])

    // Convert to employee state
    const [convertLead, setConvertLead] = useState<Lead | null>(null)

    // Onboarding (join) link — the same personalized link the Onboarding module
    // shares, surfaced here so a recruiter can send it without needing access to
    // the Onboarding module itself.
    const [shareOpen, setShareOpen] = useState(false)
    const [shareRole, setShareRole] = useState("")
    const [linkCopied, setLinkCopied] = useState(false)

    // `ref` embeds the logged-in recruiter so the candidate's HR contact is
    // pre-filled and locked; `role` pre-fills their designation.
    const joinLink = `${typeof window !== "undefined" ? window.location.origin : ""}/join`
        + `?ref=${encodeURIComponent((session?.user as { id?: string })?.id || "")}`
        + (shareRole.trim() ? `&role=${encodeURIComponent(shareRole.trim())}` : "")

    const copyJoinLink = () => {
        navigator.clipboard.writeText(joinLink)
        setLinkCopied(true)
        setTimeout(() => setLinkCopied(false), 2500)
        toast.success("Onboarding link copied!")
    }

    // View/edit employee modal
    const [viewEmpOpen, setViewEmpOpen] = useState(false)
    const [viewEmpData, setViewEmpData] = useState<EmpType | null>(null)
    const [viewEmpLoading, setViewEmpLoading] = useState(false)

    const emptyForm = {
        candidateName: "", phone: "", email: "", city: "",
        position: "", experience: "", currentCompany: "", qualification: "",
        skills: "", expectedSalary: "", currentSalary: "",
        interviewDate: "", interviewMode: "", source: "", priority: "MEDIUM",
        score: "WARM", assignedTo: "", notes: "", nextFollowUp: "",
        locality: "", gender: "", languages: "", age: "",
        course: "", specialization: "", collegeName: "",
        courseStartYear: "", courseEndYear: "",
        previousDesignation: "", previousCompany: "",
        resumeUrl: "", profileUrl: "", englishLevel: "", levelOfExperience: "",
        // Candidate Personal Information Form fields
        tshirtSize: "", bloodGroup: "", altPhone: "", dateOfBirth: "",
        fatherName: "", fatherOccupation: "", motherName: "", motherOccupation: "",
        maritalStatus: "", nationality: "Indian", aadharNumber: "",
        presentAddress: "", permanentAddress: "",
        currentDesignation: "", pfEsicNumber: "", reasonForLeaving: "",
        hasBike: "", declarationDate: "", declarationPlace: "",
    }
    const [form, setForm] = useState(emptyForm)

    // ── Export ────────────────────────────────────────────────────────────────
    async function handleExport() {
        try {
            const params = new URLSearchParams()
            if (filterStatus !== "ALL") params.set("status", filterStatus)
            if (filterPriority !== "ALL") params.set("priority", filterPriority)
            if (filterScore !== "ALL") params.set("score", filterScore)
            if (searchQ) params.set("search", searchQ)
            const res = await fetch(`/api/recruitment/export?${params}`)
            if (!res.ok) { toast.error("Export failed"); return }
            const blob = await res.blob()
            const url = URL.createObjectURL(blob)
            const a = document.createElement("a")
            a.href = url
            a.download = `recruitment_export_${new Date().toISOString().split("T")[0]}.xlsx`
            document.body.appendChild(a)
            a.click()
            a.remove()
            URL.revokeObjectURL(url)
        } catch {
            toast.error("Export failed")
        }
    }

    function handleDownloadTemplate() {
        const wb = XLSX.utils.book_new()
        const ws = XLSX.utils.aoa_to_sheet([[
            "Candidate Name", "Phone", "Email", "City", "Locality", "Position", "Source",
            "Experience", "Qualification", "Skills", "Notes",
            "Gender", "Age", "English Level", "Level Of Experience", "Languages Known",
            "Previous Designation", "Previous Company", "Course", "Specialization",
            "College Name", "Course Start Year", "Course End Year",
            "Current Salary", "Resume URL", "Profile URL"
        ]])
        XLSX.utils.book_append_sheet(wb, ws, "Leads")
        XLSX.writeFile(wb, "recruitment_template.xlsx")
    }

    async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0]
        if (!file) return
        try {
            let wb: XLSX.WorkBook
            if (file.name.endsWith(".csv")) {
                const text = await file.text()
                wb = XLSX.read(text, { type: "string" })
            } else {
                const ab = await file.arrayBuffer()
                wb = XLSX.read(ab, { type: "array" })
            }
            const ws = wb.Sheets[wb.SheetNames[0]]
            const rawRows = XLSX.utils.sheet_to_json(ws) as Record<string, unknown>[]
            setImportRows(rawRows)
            setImportResult(null)
        } catch {
            toast.error("Failed to read file")
        }
    }

    async function handleImportSubmit() {
        if (importRows.length === 0) return
        setImportLoading(true)
        try {
            const res = await fetch("/api/recruitment/import", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ rows: importRows }),
            })
            const data = await res.json()
            setImportResult(data)
            if (data.imported > 0) {
                toast.success(`${data.imported} candidate(s) imported`)
                fetchLeads()
            }
        } catch {
            toast.error("Import failed")
        } finally {
            setImportLoading(false)
        }
    }

    // ── Fetch ──────────────────────────────────────────────────────────────────
    async function fetchLeads() {
        setLoading(true)
        try {
            const params = new URLSearchParams()
            if (filterStatus !== "ALL") params.set("status", filterStatus)
            if (filterPriority !== "ALL") params.set("priority", filterPriority)
            if (filterScore !== "ALL") params.set("score", filterScore)
            if (searchQ) params.set("search", searchQ)
            const res = await fetch(`/api/recruitment?${params}`)
            if (!res.ok) throw new Error()
            setLeads(await res.json())
        } catch {
            toast.error("Failed to load candidates")
        } finally { setLoading(false) }
    }

    async function fetchUsers() {
        try {
            const res = await fetch("/api/admin/users")
            if (!res.ok) return
            const data = await res.json()
            setUsers((data.users ?? data).filter((u: AppUser) => u.role === "ADMIN" || u.role === "MANAGER" || u.role === "HR_MANAGER"))
        } catch {}
    }

    async function fetchAnalytics() {
        setAnalyticsLoading(true)
        try {
            const res = await fetch("/api/recruitment/analytics")
            if (!res.ok) throw new Error()
            setAnalytics(await res.json())
        } catch {
            toast.error("Failed to load analytics")
        } finally { setAnalyticsLoading(false) }
    }

    async function fetchFormLinks() {
        setLoadingForms(true)
        try {
            const res = await fetch("/api/lead-forms")
            if (!res.ok) throw new Error()
            setLeadForms(await res.json())
        } catch {
            toast.error("Failed to load form links")
        } finally { setLoadingForms(false) }
    }

    async function fetchSites() {
        try {
            const res = await fetch("/api/sites")
            if (!res.ok) return
            const data = await res.json()
            const arr = Array.isArray(data) ? data : (Array.isArray(data?.sites) ? data.sites : [])
            setFormSites(arr.map((s: any) => ({ id: s.id, name: s.name })))
        } catch {}
    }

    async function handleCreateFormLink(e: React.FormEvent) {
        e.preventDefault()
        if (!createFormData.title.trim()) return
        setSavingForm(true)
        try {
            const res = await fetch("/api/lead-forms", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(createFormData),
            })
            if (!res.ok) throw new Error()
            const form = await res.json()
            setLeadForms(prev => [form, ...prev])
            setCreateFormData({ title: "", description: "", siteId: "" })
            setShowCreateForm(false)
            toast.success("Form link created")
        } catch {
            toast.error("Failed to create form link")
        } finally { setSavingForm(false) }
    }

    async function handleToggleFormActive(form: LeadFormEntry) {
        try {
            const res = await fetch(`/api/lead-forms/${form.slug}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ isActive: !form.isActive }),
            })
            if (!res.ok) throw new Error()
            const updated = await res.json()
            setLeadForms(prev => prev.map(f => f.id === form.id ? { ...f, isActive: updated.isActive } : f))
            toast.success(updated.isActive ? "Form activated" : "Form deactivated")
        } catch {
            toast.error("Failed to update form")
        }
    }

    async function handleDeleteFormLink(form: LeadFormEntry) {
        if (!confirm(`Delete form "${form.title}"? This cannot be undone.`)) return
        try {
            const res = await fetch(`/api/lead-forms/${form.slug}`, { method: "DELETE" })
            if (!res.ok) throw new Error()
            setLeadForms(prev => prev.filter(f => f.id !== form.id))
            toast.success("Form deleted")
        } catch {
            toast.error("Failed to delete form")
        }
    }

    function copyFormLink(slug: string) {
        const url = `${window.location.origin}/apply/${slug}`
        navigator.clipboard.writeText(url).then(() => toast.success("Link copied!")).catch(() => toast.error("Copy failed"))
    }

    const isAuthorized = status === "authenticated" && can(session, "recruitment.view")

    useEffect(() => {
        if (isAuthorized) {
            fetchLeads()
        }
    }, [filterStatus, filterPriority, filterScore, searchQ, isAuthorized])

    useEffect(() => {
        if (isAuthorized) {
            fetchUsers()
            // Load sites up-front so the Site dropdown in the View/Edit
            // Employee modal (and Convert form) is populated even when the
            // user hasn't opened the Form Links tab yet.
            fetchSites()
        }
    }, [isAuthorized])

    useEffect(() => {
        if (activeTab === "analytics" && isAuthorized) {
            fetchAnalytics()
        }
        if (activeTab === "form-links" && isAuthorized) {
            fetchFormLinks()
            fetchSites()
        }
    }, [activeTab, isAuthorized])

    // Duplicate phone check
    const checkDuplicate = useCallback(async (phone: string) => {
        if (phone.length < 6) { setDuplicateWarning(""); return }
        try {
            const res = await fetch(`/api/recruitment?search=${encodeURIComponent(phone)}`)
            if (!res.ok) return
            const results: Lead[] = await res.json()
            const match = results.find(l => l.phone === phone && (!editLead || l.id !== editLead.id))
            if (match) {
                setDuplicateWarning(`Duplicate: ${match.candidateName} already exists with this phone`)
            } else {
                setDuplicateWarning("")
            }
        } catch {}
    }, [editLead])

    // ── Stats ──────────────────────────────────────────────────────────────────
    const stats = useMemo(() => {
        const total = leads.length
        const selected = leads.filter(l => ["SELECTED", "OFFERED", "JOINED"].includes(l.status)).length
        const joined = leads.filter(l => l.status === "JOINED").length
        const interviews = leads.filter(l => ["INTERVIEW_SCHEDULED", "INTERVIEW_DONE"].includes(l.status)).length

        // Real "this month" additions per metric, from createdAt.
        const now = new Date()
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
        const inMonth = (l: Lead) => l.createdAt && new Date(l.createdAt) >= monthStart
        return {
            total, selected, joined, interviews,
            totalMonth:      leads.filter(inMonth).length,
            interviewsMonth: leads.filter(l => inMonth(l) && ["INTERVIEW_SCHEDULED", "INTERVIEW_DONE"].includes(l.status)).length,
            selectedMonth:   leads.filter(l => inMonth(l) && ["SELECTED", "OFFERED", "JOINED"].includes(l.status)).length,
            joinedMonth:     leads.filter(l => inMonth(l) && l.status === "JOINED").length,
        }
    }, [leads])

    // ── Form Handlers ──────────────────────────────────────────────────────────
    function openAddForm() {
        setEditLead(null)
        setForm(emptyForm)
        setCandidatePhoto("")
        setDuplicateWarning("")
        setShowForm(true)
    }

    function openEditForm(lead: Lead) {
        setEditLead(lead)
        setCandidatePhoto(lead.profileUrl ?? "")
        setDuplicateWarning("")
        setForm({
            candidateName: lead.candidateName ?? "",
            phone: lead.phone ?? "",
            email: lead.email ?? "",
            city: lead.city ?? "",
            position: lead.position ?? "",
            experience: lead.experience?.toString() ?? "",
            currentCompany: lead.currentCompany ?? "",
            qualification: lead.qualification ?? "",
            skills: lead.skills ?? "",
            expectedSalary: lead.expectedSalary?.toString() ?? "",
            currentSalary: lead.currentSalary?.toString() ?? "",
            interviewDate: lead.interviewDate ? lead.interviewDate.slice(0, 16) : "",
            interviewMode: lead.interviewMode ?? "",
            source: lead.source ?? "",
            priority: lead.priority ?? "MEDIUM",
            score: lead.score ?? "WARM",
            assignedTo: lead.assignedTo ?? "",
            notes: lead.notes ?? "",
            nextFollowUp: lead.nextFollowUp ? lead.nextFollowUp.slice(0, 10) : "",
            locality: lead.locality ?? "",
            gender: lead.gender ?? "",
            languages: lead.languages ?? "",
            age: lead.age?.toString() ?? "",
            course: lead.course ?? "",
            specialization: lead.specialization ?? "",
            collegeName: lead.collegeName ?? "",
            courseStartYear: lead.courseStartYear ?? "",
            courseEndYear: lead.courseEndYear ?? "",
            previousDesignation: lead.previousDesignation ?? "",
            previousCompany: lead.previousCompany ?? "",
            resumeUrl: lead.resumeUrl ?? "",
            profileUrl: lead.profileUrl ?? "",
            englishLevel: lead.englishLevel ?? "",
            levelOfExperience: lead.levelOfExperience ?? "",
            // Candidate Personal Information Form fields
            tshirtSize: (lead as any).tshirtSize ?? "",
            bloodGroup: (lead as any).bloodGroup ?? "",
            altPhone: (lead as any).altPhone ?? "",
            dateOfBirth: (lead as any).dateOfBirth ? String((lead as any).dateOfBirth).slice(0, 10) : "",
            fatherName: (lead as any).fatherName ?? "",
            fatherOccupation: (lead as any).fatherOccupation ?? "",
            motherName: (lead as any).motherName ?? "",
            motherOccupation: (lead as any).motherOccupation ?? "",
            maritalStatus: (lead as any).maritalStatus ?? "",
            nationality: (lead as any).nationality ?? "Indian",
            aadharNumber: (lead as any).aadharNumber ?? "",
            presentAddress: (lead as any).presentAddress ?? "",
            permanentAddress: (lead as any).permanentAddress ?? "",
            currentDesignation: (lead as any).currentDesignation ?? "",
            pfEsicNumber: (lead as any).pfEsicNumber ?? "",
            reasonForLeaving: (lead as any).reasonForLeaving ?? "",
            hasBike: (lead as any).hasBike === true ? "Yes" : (lead as any).hasBike === false ? "No" : "",
            declarationDate: (lead as any).declarationDate ? String((lead as any).declarationDate).slice(0, 10) : "",
            declarationPlace: (lead as any).declarationPlace ?? "",
        })
        setShowForm(true)
    }

    // ── Validation helpers ──
    const rDigits = (v: string) => v.replace(/\D/g, "")
    const isPhoneOk  = (v: string) => !v || rDigits(v).length === 10
    const isAadharOk = (v: string) => !v || rDigits(v).length === 12
    const isPANOk    = (v: string) => !v || /^[A-Za-z]{5}[0-9]{4}[A-Za-z]$/.test(v.trim())

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        if (!editLead && duplicateWarning) {
            toast.error(duplicateWarning)
            return
        }
        if (form.phone && !isPhoneOk(form.phone)) {
            toast.error("Phone number must be exactly 10 digits")
            return
        }
        setSaving(true)
        try {
            const url = editLead ? `/api/recruitment/${editLead.id}` : "/api/recruitment"
            const method = editLead ? "PATCH" : "POST"
            const res = await fetch(url, {
                method,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ...form, profileUrl: candidatePhoto || form.profileUrl || null })
            })
            if (!res.ok) {
                const err = await res.json()
                throw new Error(err.error ?? "Failed")
            }
            const saved = await res.json()
            if (editLead) {
                setLeads(prev => prev.map(l => l.id === saved.id ? saved : l))
                if (detailLead?.id === saved.id) setDetailLead(saved)
                toast.success("Candidate updated")
            } else {
                setLeads(prev => [saved, ...prev])
                toast.success("Candidate added")
            }
            setShowForm(false)
        } catch (err: any) {
            toast.error(err.message ?? "Error saving")
        } finally { setSaving(false) }
    }

    async function handleStatusChange(leadId: string, newStatus: string) {
        try {
            const res = await fetch(`/api/recruitment/${leadId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: newStatus })
            })
            if (!res.ok) throw new Error()
            const updated = await res.json()
            setLeads(prev => prev.map(l => l.id === leadId ? updated : l))
            if (detailLead?.id === leadId) setDetailLead(updated)
            toast.success("Status updated")
        } catch {
            toast.error("Failed to update status")
        }
    }

    async function handleDelete(leadId: string) {
        if (!confirm("Delete this candidate?")) return
        try {
            const res = await fetch(`/api/recruitment/${leadId}`, { method: "DELETE" })
            if (!res.ok) throw new Error()
            setLeads(prev => prev.filter(l => l.id !== leadId))
            if (detailLead?.id === leadId) setDetailLead(null)
            toast.success("Deleted")
        } catch {
            toast.error("Failed to delete")
        }
    }

    async function handleAddActivity() {
        if (!activityContent.trim() || !detailLead) return
        setSavingActivity(true)
        try {
            const res = await fetch(`/api/recruitment/${detailLead.id}/activities`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ type: activityType, content: activityContent.trim() })
            })
            if (!res.ok) throw new Error()
            const act = await res.json()
            setDetailLead(prev => prev ? { ...prev, activities: [act, ...(prev.activities ?? [])] } : prev)
            setActivityContent("")
            toast.success("Activity logged")
        } catch {
            toast.error("Failed to add activity")
        } finally { setSavingActivity(false) }
    }

    async function openDetail(lead: Lead) {
        try {
            const res = await fetch(`/api/recruitment/${lead.id}`)
            if (!res.ok) throw new Error()
            setDetailLead(await res.json())
        } catch {
            setDetailLead(lead)
        }
    }

    // ── Recruiter + position filter options (derived from loaded leads) ──────────
    const recruiterOptions = useMemo(() => {
        const map = new Map<string, string>()
        leads.forEach(l => { if (l.creator?.id) map.set(l.creator.id, l.creator.name || "—") })
        return Array.from(map, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))
    }, [leads])

    const positionOptions = useMemo(() => {
        const set = new Set<string>()
        leads.forEach(l => { if (l.position?.trim()) set.add(l.position.trim()) })
        return Array.from(set).sort((a, b) => a.localeCompare(b))
    }, [leads])

    // Client-side recruiter + position filtering (stage/priority/score/search
    // are applied server-side in fetchLeads).
    const filteredLeads = useMemo(() => {
        return leads.filter(l => {
            if (filterRecruiter !== "ALL" && l.creator?.id !== filterRecruiter) return false
            if (filterPosition !== "ALL" && (l.position?.trim() || "") !== filterPosition) return false
            return true
        })
    }, [leads, filterRecruiter, filterPosition])

    // ── Kanban grouped leads ────────────────────────────────────────────────────
    const leadsByStatus = useMemo(() => {
        const map: Record<string, Lead[]> = {}
        STATUSES.forEach(s => { map[s.key] = [] })
        filteredLeads.forEach(l => { if (map[l.status]) map[l.status].push(l) })
        return map
    }, [filteredLeads])

    // All documents across all leads for Documents tab
    const allDocuments = useMemo(() => {
        return leads.flatMap(l => (l.documents ?? []).map(d => ({ ...d, lead: l })))
    }, [leads])

    // ─────────────────────────────────────────────────────────────────────────────
    if (status === "loading") {
        return <div className="flex items-center justify-center min-h-[300px]"><Loader2 className="animate-spin text-[var(--text3)]" size={28} /></div>
    }
    if (!isAuthorized) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px] gap-3 text-center">
                <AlertCircle size={40} className="text-red-400" />
                <h2 className="text-lg font-semibold text-[var(--text)]">Access Restricted</h2>
                <p className="text-sm text-[var(--text2)]">You don&apos;t have permission to view the recruitment pipeline.</p>
            </div>
        )
    }

    return (
        <div className="flex flex-col gap-0 min-h-full">

            {/* ── Header ── */}
            <div className="px-4 pt-5 pb-4 lg:px-0 lg:pt-0">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                        <h1 className="text-[22px] font-bold text-[var(--text)] tracking-tight">Candidate Pipeline</h1>
                        <p className="text-[13px] text-[var(--text2)] mt-0.5">Track candidates from lead to joining</p>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <button
                            onClick={() => setShareOpen(true)}
                            title="Share the onboarding form link with a candidate"
                            style={{ display: "flex", alignItems: "center", gap: "6px", height: "36px", padding: "0 14px", background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text)", fontSize: "13px", fontWeight: 500, borderRadius: "8px", cursor: "pointer", whiteSpace: "nowrap" }}
                        >
                            <Link2 size={15} />
                            Onboarding Link
                        </button>
                        <button
                            onClick={handleExport}
                            title="Export to Excel"
                            style={{ display: "flex", alignItems: "center", gap: "6px", height: "36px", padding: "0 14px", background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text)", fontSize: "13px", fontWeight: 500, borderRadius: "8px", cursor: "pointer", whiteSpace: "nowrap" }}
                        >
                            <Download size={15} />
                            Export
                        </button>
                        <button
                            onClick={() => { setShowImportModal(true); setImportRows([]); setImportResult(null); if (importFileRef.current) importFileRef.current.value = "" }}
                            title="Import from Excel"
                            style={{ display: "flex", alignItems: "center", gap: "6px", height: "36px", padding: "0 14px", background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text)", fontSize: "13px", fontWeight: 500, borderRadius: "8px", cursor: "pointer", whiteSpace: "nowrap" }}
                        >
                            <Upload size={15} />
                            Import
                        </button>
                        <button
                            onClick={openAddForm}
                            className="flex items-center gap-2 h-9 px-4 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-[13px] font-semibold rounded-[8px] transition-colors active:scale-95 shrink-0"
                        >
                            <Plus size={16} />
                            Add Candidate
                        </button>
                    </div>
                </div>

                {/* Quick Stats */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
                    {[
                        { label: "TOTAL CANDIDATES",   value: stats.total,     month: stats.totalMonth,      icon: Users,     color: "#3b82f6", bg: "#eff6ff" },
                        { label: "INTERVIEWS",         value: stats.interviews,month: stats.interviewsMonth, icon: Calendar,  color: "#f59e0b", bg: "#fef3c7" },
                        { label: "SELECTED / OFFERED", value: stats.selected,  month: stats.selectedMonth,   icon: UserCheck, color: "#1a9e6e", bg: "#e8f7f1" },
                        { label: "JOINED",             value: stats.joined,    month: stats.joinedMonth,     icon: Award,     color: "#047857", bg: "#ecfdf5" },
                    ].map(s => (
                        <div key={s.label} className="bg-white border border-[var(--border)] rounded-[14px] p-[18px]">
                            <div className="flex items-start gap-3">
                                <div className="w-11 h-11 rounded-[12px] flex items-center justify-center shrink-0" style={{ background: s.bg }}>
                                    <s.icon size={20} style={{ color: s.color }} />
                                </div>
                                <div className="min-w-0">
                                    <p className="text-[10.5px] font-semibold text-[var(--text3)] tracking-wider uppercase whitespace-nowrap">{s.label}</p>
                                    <div className="flex items-baseline gap-2 mt-0.5 flex-wrap">
                                        <span className="text-[28px] font-bold leading-none tabular-nums" style={{ color: s.color }}>{s.value}</span>
                                        {s.month > 0 && (
                                            <span className="inline-flex items-center gap-0.5 text-[11.5px] font-semibold text-[#1a9e6e] whitespace-nowrap">
                                                <ArrowUpRight size={13} className="stroke-[2.5]" />
                                                {s.month} this month
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Tabs */}
                <div className="flex gap-1 mt-4 border-b border-[var(--border)]">
                    {([
                        { key: "pipeline", label: "Pipeline", icon: ArrowRight },
                        { key: "analytics", label: "Analytics", icon: BarChart2 },
                        { key: "documents", label: "Documents", icon: FileText },
                        { key: "form-links", label: "Form Links", icon: Link2 },
                    ] as const).map(tab => {
                        const Icon = tab.icon
                        return (
                            <button
                                key={tab.key}
                                onClick={() => setActiveTab(tab.key)}
                                className={`flex items-center gap-1.5 px-4 py-2.5 text-[13px] font-medium border-b-2 transition-colors -mb-px ${
                                    activeTab === tab.key
                                        ? "border-[var(--accent)] text-[var(--accent)]"
                                        : "border-transparent text-[var(--text2)] hover:text-[var(--text)]"
                                }`}
                            >
                                <Icon size={14} />
                                {tab.label}
                            </button>
                        )
                    })}
                </div>
            </div>

            {/* ── PIPELINE TAB ── */}
            {activeTab === "pipeline" && (
                <>
                    {/* Toolbar */}
                    <div className="px-4 pb-3 lg:px-0 flex flex-col sm:flex-row gap-2 items-start sm:items-center justify-between">
                        <div className="flex items-center gap-2 flex-wrap">
                            {/* View toggle */}
                            <div className="flex bg-[var(--surface2)] rounded-[8px] p-0.5 border border-[var(--border)]">
                                {(["kanban", "list"] as const).map(v => (
                                    <button key={v} onClick={() => setViewMode(v)}
                                        className={`px-3 py-1.5 text-[12px] font-medium rounded-[6px] transition-all capitalize ${viewMode === v ? "bg-white text-[var(--text)] shadow-sm" : "text-[var(--text3)]"}`}>
                                        {v === "kanban" ? "Board" : "List"}
                                    </button>
                                ))}
                            </div>

                            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
                                className="h-8 px-2 text-[12px] border border-[var(--border)] rounded-[7px] bg-white text-[var(--text2)] focus:outline-none">
                                <option value="ALL">All Stages</option>
                                {STATUSES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                            </select>

                            <select value={filterPriority} onChange={e => setFilterPriority(e.target.value)}
                                className="h-8 px-2 text-[12px] border border-[var(--border)] rounded-[7px] bg-white text-[var(--text2)] focus:outline-none">
                                <option value="ALL">All Priority</option>
                                <option value="HIGH">High</option>
                                <option value="MEDIUM">Medium</option>
                                <option value="LOW">Low</option>
                            </select>

                            <select value={filterScore} onChange={e => setFilterScore(e.target.value)}
                                className="h-8 px-2 text-[12px] border border-[var(--border)] rounded-[7px] bg-white text-[var(--text2)] focus:outline-none">
                                <option value="ALL">All Score</option>
                                <option value="HOT">Hot</option>
                                <option value="WARM">Warm</option>
                                <option value="COLD">Cold</option>
                            </select>

                            <select value={filterRecruiter} onChange={e => setFilterRecruiter(e.target.value)}
                                className="h-8 px-2 text-[12px] border border-[var(--border)] rounded-[7px] bg-white text-[var(--text2)] focus:outline-none max-w-[160px]">
                                <option value="ALL">All Recruiters</option>
                                {recruiterOptions.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                            </select>

                            <select value={filterPosition} onChange={e => setFilterPosition(e.target.value)}
                                className="h-8 px-2 text-[12px] border border-[var(--border)] rounded-[7px] bg-white text-[var(--text2)] focus:outline-none max-w-[160px]">
                                <option value="ALL">All Positions</option>
                                {positionOptions.map(p => <option key={p} value={p}>{p}</option>)}
                            </select>
                        </div>

                        <div className="relative w-full sm:w-56">
                            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text3)]" />
                            <input
                                value={searchQ}
                                onChange={e => setSearchQ(e.target.value)}
                                placeholder="Search candidates..."
                                className="w-full h-8 pl-8 pr-3 text-[12px] border border-[var(--border)] rounded-[7px] focus:outline-none focus:ring-1 focus:ring-[var(--accent)] bg-white"
                            />
                        </div>
                    </div>

                    {loading ? (
                        <div className="flex items-center justify-center flex-1 py-24">
                            <Loader2 size={32} className="animate-spin text-[var(--accent)]" />
                        </div>
                    ) : leads.length === 0 ? (
                        <div className="flex flex-col items-center justify-center flex-1 py-24 gap-3">
                            <div className="w-14 h-14 bg-[var(--surface2)] rounded-full flex items-center justify-center">
                                <Users size={24} className="text-[var(--text3)]" />
                            </div>
                            <p className="text-[14px] font-medium text-[var(--text2)]">No candidates yet</p>
                            <button onClick={openAddForm} className="text-[13px] text-[var(--accent)] hover:underline">Add first candidate</button>
                        </div>
                    ) : viewMode === "kanban" ? (
                        <KanbanView leads={leadsByStatus} onCard={openDetail} onStatusChange={handleStatusChange} onAdd={openAddForm} />
                    ) : (
                        <ListView leads={filteredLeads} onCard={openDetail} onEdit={openEditForm} onDelete={handleDelete} session={session} />
                    )}
                </>
            )}

            {/* ── ANALYTICS TAB ── */}
            {activeTab === "analytics" && (
                <div className="px-4 lg:px-0 pb-6">
                    {analyticsLoading ? (
                        <div className="flex items-center justify-center py-24">
                            <Loader2 size={32} className="animate-spin text-[var(--accent)]" />
                        </div>
                    ) : analytics ? (
                        <RecruitmentAnalytics data={analytics} />
                    ) : (
                        <div className="flex items-center justify-center py-24">
                            <p className="text-[14px] text-[var(--text3)]">No analytics data</p>
                        </div>
                    )}
                </div>
            )}

            {/* ── DOCUMENTS TAB ── */}
            {activeTab === "documents" && (
                <div className="px-4 lg:px-0 pb-6">
                    <DocumentsTabView
                        leads={leads}
                        onLeadClick={openDetail}
                        onView={(url, name) => {
                            setPreviewUrl(url)
                            setPreviewName(name)
                        }}
                    />
                </div>
            )}

            {/* ── FORM LINKS TAB ── */}
            {activeTab === "form-links" && (
                <div className="px-4 lg:px-0 pb-6">
                    <div className="flex items-center justify-between mb-4 mt-2">
                        <div>
                            <p className="text-[13px] text-[var(--text2)]">Create shareable application links to float on WhatsApp or social media. Candidates fill a form and auto-appear as leads.</p>
                        </div>
                        <button
                            onClick={() => { setShowCreateForm(true); fetchSites() }}
                            className="flex items-center gap-2 h-9 px-4 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-[13px] font-semibold rounded-[8px] transition-colors shrink-0 ml-4"
                        >
                            <Plus size={15} /> New Form Link
                        </button>
                    </div>

                    {showCreateForm && (
                        <div className="bg-white border border-[var(--border)] rounded-[14px] p-5 mb-5 shadow-sm">
                            <h3 className="text-[14px] font-semibold text-[var(--text)] mb-4">Create New Application Form</h3>
                            <form onSubmit={handleCreateFormLink} className="flex flex-col gap-3">
                                <Field label="Form Title *">
                                    <input required value={createFormData.title} onChange={e => setCreateFormData(p => ({ ...p, title: e.target.value }))}
                                        placeholder="e.g. Security Guard Vacancy - Mumbai" className={inputCls} />
                                </Field>
                                <Field label="Description (shown to candidates)">
                                    <input value={createFormData.description} onChange={e => setCreateFormData(p => ({ ...p, description: e.target.value }))}
                                        placeholder="e.g. Apply for security guard position at our client site in Andheri" className={inputCls} />
                                </Field>
                                <Field label="Target Site (optional)">
                                    <select value={createFormData.siteId} onChange={e => setCreateFormData(p => ({ ...p, siteId: e.target.value }))} className={inputCls}>
                                        <option value="">No specific site</option>
                                        {formSites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                    </select>
                                </Field>
                                <div className="flex gap-2 justify-end pt-1">
                                    <button type="button" onClick={() => setShowCreateForm(false)}
                                        className="h-9 px-4 text-[13px] text-[var(--text2)] border border-[var(--border)] rounded-[7px] hover:bg-[var(--surface2)]">
                                        Cancel
                                    </button>
                                    <button type="submit" disabled={savingForm}
                                        className="h-9 px-5 text-[13px] font-semibold bg-[var(--accent)] text-white rounded-[7px] flex items-center gap-2 disabled:opacity-60">
                                        {savingForm && <Loader2 size={14} className="animate-spin" />}
                                        Create Form
                                    </button>
                                </div>
                            </form>
                        </div>
                    )}

                    {loadingForms ? (
                        <div className="flex items-center justify-center py-16">
                            <Loader2 size={28} className="animate-spin text-[var(--accent)]" />
                        </div>
                    ) : leadForms.length === 0 && !showCreateForm ? (
                        <div className="flex flex-col items-center justify-center py-20 gap-3">
                            <div className="w-14 h-14 bg-[var(--surface2)] rounded-full flex items-center justify-center">
                                <Link2 size={22} className="text-[var(--text3)]" />
                            </div>
                            <p className="text-[14px] font-medium text-[var(--text2)]">No form links yet</p>
                            <button onClick={() => setShowCreateForm(true)} className="text-[13px] text-[var(--accent)] hover:underline">Create your first form</button>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-3">
                            {leadForms.map(form => {
                                const applyUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/apply/${form.slug}`
                                return (
                                    <div key={form.id} className="bg-white border border-[var(--border)] rounded-[14px] p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <p className="text-[14px] font-semibold text-[var(--text)]">{form.title}</p>
                                                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${form.isActive ? "bg-green-50 text-green-700 border-green-200" : "bg-gray-50 text-gray-500 border-gray-200"}`}>
                                                    {form.isActive ? "Active" : "Inactive"}
                                                </span>
                                            </div>
                                            {form.description && <p className="text-[12px] text-[var(--text3)] mt-0.5 truncate">{form.description}</p>}
                                            {form.site && (
                                                <p className="text-[11px] text-[var(--text3)] mt-0.5 flex items-center gap-1">
                                                    <MapPin size={10} />{form.site.name}
                                                </p>
                                            )}
                                            <p className="text-[11px] text-[var(--accent)] mt-1 font-mono truncate">/apply/{form.slug}</p>
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0 flex-wrap">
                                            <button
                                                onClick={() => copyFormLink(form.slug)}
                                                className="flex items-center gap-1.5 h-8 px-3 text-[12px] font-medium border border-[var(--border)] rounded-[7px] hover:bg-[var(--surface2)] text-[var(--text)] transition-colors"
                                            >
                                                <Copy size={13} /> Copy Link
                                            </button>
                                            <a href={`/apply/${form.slug}`} target="_blank" rel="noopener noreferrer"
                                                className="flex items-center gap-1.5 h-8 px-3 text-[12px] font-medium border border-[var(--border)] rounded-[7px] hover:bg-[var(--surface2)] text-[var(--text)] transition-colors no-underline">
                                                <ExternalLink size={13} /> Preview
                                            </a>
                                            <button
                                                onClick={() => handleToggleFormActive(form)}
                                                className={`flex items-center gap-1.5 h-8 px-3 text-[12px] font-medium border rounded-[7px] transition-colors ${form.isActive ? "border-amber-200 text-amber-700 hover:bg-amber-50" : "border-green-200 text-green-700 hover:bg-green-50"}`}
                                            >
                                                {form.isActive ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
                                                {form.isActive ? "Deactivate" : "Activate"}
                                            </button>
                                            <button
                                                onClick={() => handleDeleteFormLink(form)}
                                                className="flex items-center gap-1 h-8 px-2.5 text-[12px] border border-red-100 text-red-500 rounded-[7px] hover:bg-red-50 transition-colors"
                                            >
                                                <Trash2 size={13} />
                                            </button>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* ── Add/Edit Modal ── */}
            {showForm && (
                <Modal onClose={() => setShowForm(false)} title={editLead ? "Edit Candidate" : "Add Candidate"} wide>
                    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                        {/* Photo Upload */}
                        <div className="flex items-center gap-4 p-3 bg-[var(--surface2)] border border-[var(--border)] rounded-[10px]">
                            <div onClick={() => candidatePhotoRef.current?.click()} className="relative cursor-pointer shrink-0">
                                {candidatePhoto ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={candidatePhoto} alt="Candidate" className="w-14 h-14 rounded-full object-cover border-2 border-[var(--accent)]" />
                                ) : (
                                    <div className="w-14 h-14 rounded-full bg-[var(--accent-light)] border-2 border-dashed border-[var(--accent)] flex items-center justify-center">
                                        <Camera size={20} className="text-[var(--accent)]" />
                                    </div>
                                )}
                                {candidatePhotoUploading && (
                                    <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center">
                                        <Loader2 size={16} className="text-white animate-spin" />
                                    </div>
                                )}
                            </div>
                            <div className="flex-1">
                                <p className="text-[12px] font-semibold text-[var(--text)] mb-1">Candidate Photo <span className="font-normal text-[var(--text3)]">(optional)</span></p>
                                <div className="flex items-center gap-2">
                                    <button type="button" onClick={() => candidatePhotoRef.current?.click()} disabled={candidatePhotoUploading}
                                        className="flex items-center gap-1.5 h-7 px-3 text-[11px] font-semibold bg-white border border-[var(--border)] rounded-[6px] hover:bg-[var(--surface)] disabled:opacity-60">
                                        <Camera size={11} />
                                        {candidatePhotoUploading ? "Uploading…" : candidatePhoto ? "Change" : "Upload"}
                                    </button>
                                    {candidatePhoto && (
                                        <button type="button" onClick={() => setCandidatePhoto("")}
                                            className="flex items-center gap-1.5 h-7 px-3 text-[11px] font-semibold text-red-500 border border-red-200 rounded-[6px] hover:bg-red-50">
                                            <Trash2 size={11} /> Remove
                                        </button>
                                    )}
                                </div>
                                <p className="text-[10px] text-[var(--text3)] mt-1">JPG / PNG • max 2MB</p>
                            </div>
                            <input ref={candidatePhotoRef} type="file" accept="image/*" className="hidden"
                                onChange={e => { const f = e.target.files?.[0]; if (f) uploadCandidatePhoto(f); e.target.value = "" }} />
                        </div>

                        {/* Basic Info */}
                        <div>
                            <p className="text-[11px] font-semibold text-[var(--text3)] uppercase tracking-wider mb-2">Basic Info</p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <Field label="Candidate Name *">
                                    <input required value={form.candidateName} onChange={e => setForm(p => ({ ...p, candidateName: e.target.value }))}
                                        placeholder="Full name" className={inputCls} />
                                </Field>
                                <Field label="Phone *">
                                    <div className="flex flex-col gap-1">
                                        <input required value={form.phone} maxLength={10}
                                            onChange={e => {
                                                setForm(p => ({ ...p, phone: e.target.value }))
                                                checkDuplicate(e.target.value)
                                            }}
                                            placeholder="10-digit mobile number"
                                            className={inputCls + (form.phone && !isPhoneOk(form.phone) ? " !border-red-400" : "")} />
                                        {form.phone && !isPhoneOk(form.phone) && (
                                            <p className="text-[11px] text-red-500 flex items-center gap-1">
                                                <AlertCircle size={11} /> Phone must be exactly 10 digits
                                            </p>
                                        )}
                                        {duplicateWarning && isPhoneOk(form.phone) && (
                                            <p className="text-[11px] text-amber-600 flex items-center gap-1">
                                                <AlertCircle size={11} />
                                                {duplicateWarning}
                                            </p>
                                        )}
                                    </div>
                                </Field>
                                <Field label="Email">
                                    <input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                                        placeholder="Email address" className={inputCls} />
                                </Field>
                                <Field label="City">
                                    <input value={form.city} onChange={e => setForm(p => ({ ...p, city: e.target.value }))}
                                        placeholder="City / Location" className={inputCls} />
                                </Field>
                            </div>
                        </div>

                        {/* Job Info */}
                        <div>
                            <p className="text-[11px] font-semibold text-[var(--text3)] uppercase tracking-wider mb-2">Job Details</p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <Field label="Position Applied For *">
                                    <select required value={form.position} onChange={e => setForm(p => ({ ...p, position: e.target.value }))} className={inputCls}>
                                        <option value="">Select position</option>
                                        {POSITIONS.map(pos => <option key={pos} value={pos}>{pos}</option>)}
                                    </select>
                                </Field>
                                <Field label="Experience (Years)">
                                    <input type="number" step="0.5" min="0" value={form.experience} onChange={e => setForm(p => ({ ...p, experience: e.target.value }))}
                                        placeholder="e.g. 2.5" className={inputCls} />
                                </Field>
                                <Field label="Current / Previous Company">
                                    <input value={form.currentCompany} onChange={e => setForm(p => ({ ...p, currentCompany: e.target.value }))}
                                        placeholder="Company name" className={inputCls} />
                                </Field>
                                <Field label="Qualification">
                                    <select value={form.qualification} onChange={e => setForm(p => ({ ...p, qualification: e.target.value }))} className={inputCls}>
                                        <option value="">Select qualification</option>
                                        {QUALIFICATIONS.map(q => <option key={q} value={q}>{q}</option>)}
                                    </select>
                                </Field>
                                <Field label="Skills / Certifications">
                                    <input value={form.skills} onChange={e => setForm(p => ({ ...p, skills: e.target.value }))}
                                        placeholder="e.g. Driving License, Forklift, First Aid" className={inputCls} />
                                </Field>
                                <Field label="Source *">
                                    <select required value={form.source} onChange={e => setForm(p => ({ ...p, source: e.target.value }))} className={inputCls}>
                                        <option value="">How did they apply?</option>
                                        {SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
                                    </select>
                                </Field>
                            </div>
                        </div>

                        {/* Salary & Interview */}
                        <div>
                            <p className="text-[11px] font-semibold text-[var(--text3)] uppercase tracking-wider mb-2">Salary & Interview</p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <Field label="Current Salary (₹)">
                                    <input type="number" min="0" value={form.currentSalary} onChange={e => setForm(p => ({ ...p, currentSalary: e.target.value }))}
                                        placeholder="Monthly / Annual" className={inputCls} />
                                </Field>
                                <Field label="Expected Salary (₹)">
                                    <input type="number" min="0" value={form.expectedSalary} onChange={e => setForm(p => ({ ...p, expectedSalary: e.target.value }))}
                                        placeholder="Monthly / Annual" className={inputCls} />
                                </Field>
                                <Field label="Interview Date & Time">
                                    <input type="datetime-local" value={form.interviewDate} onChange={e => setForm(p => ({ ...p, interviewDate: e.target.value }))}
                                        className={inputCls} />
                                </Field>
                                <Field label="Interview Mode">
                                    <select value={form.interviewMode} onChange={e => setForm(p => ({ ...p, interviewMode: e.target.value }))} className={inputCls}>
                                        <option value="">Select mode</option>
                                        {INTERVIEW_MODES.map(m => <option key={m} value={m}>{m}</option>)}
                                    </select>
                                </Field>
                            </div>
                        </div>

                        {/* Education & Background */}
                        <div>
                            <p className="text-[11px] font-semibold text-[var(--text3)] uppercase tracking-wider mb-2">Education & Background</p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <Field label="Gender">
                                    <select value={form.gender} onChange={e => setForm(p => ({ ...p, gender: e.target.value }))} className={inputCls}>
                                        <option value="">Select gender</option>
                                        <option value="Male">Male</option>
                                        <option value="Female">Female</option>
                                        <option value="Other">Other</option>
                                        <option value="Not Specified">Not Specified</option>
                                    </select>
                                </Field>
                                <Field label="Age">
                                    <input type="number" min="16" max="80" value={form.age} onChange={e => setForm(p => ({ ...p, age: e.target.value }))}
                                        placeholder="e.g. 28" className={inputCls} />
                                </Field>
                                <Field label="English Level">
                                    <select value={form.englishLevel} onChange={e => setForm(p => ({ ...p, englishLevel: e.target.value }))} className={inputCls}>
                                        <option value="">Select level</option>
                                        <option value="Good English">Good English</option>
                                        <option value="Basic English">Basic English</option>
                                        <option value="No English">No English</option>
                                    </select>
                                </Field>
                                <Field label="Level of Experience">
                                    <select value={form.levelOfExperience} onChange={e => setForm(p => ({ ...p, levelOfExperience: e.target.value }))} className={inputCls}>
                                        <option value="">Select level</option>
                                        <option value="Fresher">Fresher</option>
                                        <option value="Experienced">Experienced</option>
                                    </select>
                                </Field>
                                <Field label="Languages Known">
                                    <input value={form.languages} onChange={e => setForm(p => ({ ...p, languages: e.target.value }))}
                                        placeholder="e.g. Hindi, English, Marathi" className={inputCls} />
                                </Field>
                                <Field label="Previous Designation">
                                    <input value={form.previousDesignation} onChange={e => setForm(p => ({ ...p, previousDesignation: e.target.value }))}
                                        placeholder="Last job title" className={inputCls} />
                                </Field>
                                <Field label="Previous Company">
                                    <input value={form.previousCompany} onChange={e => setForm(p => ({ ...p, previousCompany: e.target.value }))}
                                        placeholder="Last employer" className={inputCls} />
                                </Field>
                                <Field label="Course">
                                    <input value={form.course} onChange={e => setForm(p => ({ ...p, course: e.target.value }))}
                                        placeholder="BE / BTech / MBA / ITI" className={inputCls} />
                                </Field>
                                <Field label="Specialization">
                                    <input value={form.specialization} onChange={e => setForm(p => ({ ...p, specialization: e.target.value }))}
                                        placeholder="Mechanical / CS / HR" className={inputCls} />
                                </Field>
                                <Field label="College Name">
                                    <input value={form.collegeName} onChange={e => setForm(p => ({ ...p, collegeName: e.target.value }))}
                                        placeholder="College / University" className={inputCls} />
                                </Field>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                                <Field label="Resume URL">
                                    <input value={form.resumeUrl} onChange={e => setForm(p => ({ ...p, resumeUrl: e.target.value }))}
                                        placeholder="Paste resume link" className={inputCls} />
                                </Field>
                                <Field label="Profile URL">
                                    <input value={form.profileUrl} onChange={e => setForm(p => ({ ...p, profileUrl: e.target.value }))}
                                        placeholder="WorkIndia / LinkedIn URL" className={inputCls} />
                                </Field>
                            </div>
                        </div>

                        {/* Assignment & Score */}
                        <div>
                            <p className="text-[11px] font-semibold text-[var(--text3)] uppercase tracking-wider mb-2">Assignment & Scoring</p>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                <Field label="Priority">
                                    <select value={form.priority} onChange={e => setForm(p => ({ ...p, priority: e.target.value }))} className={inputCls}>
                                        <option value="HIGH">High</option>
                                        <option value="MEDIUM">Medium</option>
                                        <option value="LOW">Low</option>
                                    </select>
                                </Field>
                                <Field label="Lead Score">
                                    <select value={form.score} onChange={e => setForm(p => ({ ...p, score: e.target.value }))} className={inputCls}>
                                        <option value="HOT">🔥 Hot</option>
                                        <option value="WARM">🌡 Warm</option>
                                        <option value="COLD">💧 Cold</option>
                                    </select>
                                </Field>
                                <Field label="Assign To">
                                    <select value={form.assignedTo} onChange={e => setForm(p => ({ ...p, assignedTo: e.target.value }))} className={inputCls}>
                                        <option value="">Unassigned</option>
                                        {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                                    </select>
                                </Field>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                                <Field label="Next Follow-up Date">
                                    <input type="date" value={form.nextFollowUp} onChange={e => setForm(p => ({ ...p, nextFollowUp: e.target.value }))}
                                        className={inputCls} />
                                </Field>
                            </div>
                        </div>

                        {/* Personal Info (Candidate Form) */}
                        <div>
                            <p className="text-[11px] font-semibold text-[var(--text3)] uppercase tracking-wider mb-2">Personal Info</p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                <Field label="T-Shirt Size">
                                    <select value={form.tshirtSize} onChange={e => setForm(p => ({ ...p, tshirtSize: e.target.value }))} className={inputCls}>
                                        <option value="">Select…</option>
                                        {["S", "M", "L", "XL", "XXL"].map(s => <option key={s} value={s}>{s}</option>)}
                                    </select>
                                </Field>
                                <Field label="Blood Group">
                                    <select value={form.bloodGroup} onChange={e => setForm(p => ({ ...p, bloodGroup: e.target.value }))} className={inputCls}>
                                        <option value="">Select…</option>
                                        {["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map(b => <option key={b} value={b}>{b}</option>)}
                                    </select>
                                </Field>
                                <Field label="Alternative Number">
                                    <input value={form.altPhone} onChange={e => setForm(p => ({ ...p, altPhone: e.target.value }))} maxLength={10} className={inputCls} />
                                </Field>
                                <Field label="Date of Birth">
                                    <input type="date" value={form.dateOfBirth} onChange={e => setForm(p => ({ ...p, dateOfBirth: e.target.value }))} className={inputCls} />
                                </Field>
                                <Field label="Marital Status">
                                    <select value={form.maritalStatus} onChange={e => setForm(p => ({ ...p, maritalStatus: e.target.value }))} className={inputCls}>
                                        <option value="">Select…</option>
                                        <option>Single</option><option>Married</option><option>Other</option>
                                    </select>
                                </Field>
                                <Field label="Nationality">
                                    <input value={form.nationality} onChange={e => setForm(p => ({ ...p, nationality: e.target.value }))} className={inputCls} />
                                </Field>
                                <Field label="Father's Name">
                                    <input value={form.fatherName} onChange={e => setForm(p => ({ ...p, fatherName: e.target.value }))} className={inputCls} />
                                </Field>
                                <Field label="Father's Occupation">
                                    <input value={form.fatherOccupation} onChange={e => setForm(p => ({ ...p, fatherOccupation: e.target.value }))} className={inputCls} />
                                </Field>
                                <Field label="Mother's Name">
                                    <input value={form.motherName} onChange={e => setForm(p => ({ ...p, motherName: e.target.value }))} className={inputCls} />
                                </Field>
                                <Field label="Mother's Occupation">
                                    <input value={form.motherOccupation} onChange={e => setForm(p => ({ ...p, motherOccupation: e.target.value }))} className={inputCls} />
                                </Field>
                                <Field label="Aadhar Number">
                                    <input value={form.aadharNumber} onChange={e => setForm(p => ({ ...p, aadharNumber: e.target.value }))} maxLength={14} className={inputCls} />
                                </Field>
                            </div>
                        </div>

                        {/* Address */}
                        <div>
                            <p className="text-[11px] font-semibold text-[var(--text3)] uppercase tracking-wider mb-2">Address</p>
                            <div className="grid grid-cols-1 gap-3">
                                <Field label="Present Address">
                                    <textarea rows={2} value={form.presentAddress} onChange={e => setForm(p => ({ ...p, presentAddress: e.target.value }))} className={`${inputCls} !h-auto resize-none`} />
                                </Field>
                                <Field label="Permanent Address">
                                    <textarea rows={2} value={form.permanentAddress} onChange={e => setForm(p => ({ ...p, permanentAddress: e.target.value }))} className={`${inputCls} !h-auto resize-none`} />
                                </Field>
                            </div>
                        </div>

                        {/* Employment Extras */}
                        <div>
                            <p className="text-[11px] font-semibold text-[var(--text3)] uppercase tracking-wider mb-2">Employment Extras</p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <Field label="Current Designation">
                                    <input value={form.currentDesignation} onChange={e => setForm(p => ({ ...p, currentDesignation: e.target.value }))} className={inputCls} />
                                </Field>
                                <Field label="PF & ESIC Number">
                                    <input value={form.pfEsicNumber} onChange={e => setForm(p => ({ ...p, pfEsicNumber: e.target.value }))} className={inputCls} />
                                </Field>
                                <Field label="Reason for Leaving">
                                    <input value={form.reasonForLeaving} onChange={e => setForm(p => ({ ...p, reasonForLeaving: e.target.value }))} className={inputCls} />
                                </Field>
                                <Field label="Has Bike?">
                                    <select value={form.hasBike} onChange={e => setForm(p => ({ ...p, hasBike: e.target.value }))} className={inputCls}>
                                        <option value="">Select…</option><option>Yes</option><option>No</option>
                                    </select>
                                </Field>
                            </div>
                        </div>

                        <Field label="Notes">
                            <textarea rows={3} value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                                placeholder="Any remarks about the candidate..."
                                className={`${inputCls} !h-auto resize-none`} />
                        </Field>

                        <div className="flex gap-2 justify-end pt-1 border-t border-[var(--border)]">
                            <button type="button" onClick={() => setShowForm(false)}
                                className="h-9 px-4 text-[13px] font-medium text-[var(--text2)] border border-[var(--border)] rounded-[7px] hover:bg-[var(--surface2)] transition-colors">
                                Cancel
                            </button>
                            <button type="submit" disabled={saving}
                                className="h-9 px-5 text-[13px] font-semibold bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white rounded-[7px] transition-colors flex items-center gap-2 disabled:opacity-60">
                                {saving && <Loader2 size={14} className="animate-spin" />}
                                {editLead ? "Save Changes" : "Add Candidate"}
                            </button>
                        </div>
                    </form>
                </Modal>
            )}

            {/* ── Detail Drawer ── */}
            {detailLead && (
                <DetailDrawer
                    lead={detailLead}
                    session={session}
                    users={users}
                    activityContent={activityContent}
                    activityType={activityType}
                    savingActivity={savingActivity}
                    onClose={() => setDetailLead(null)}
                    onEdit={() => { openEditForm(detailLead); setDetailLead(null) }}
                    onDelete={() => handleDelete(detailLead.id)}
                    onStatusChange={(s) => handleStatusChange(detailLead.id, s)}
                    onActivityTypeChange={setActivityType}
                    onActivityContentChange={setActivityContent}
                    onAddActivity={handleAddActivity}
                    onLeadUpdate={(updated) => {
                        setDetailLead(updated)
                        setLeads(prev => prev.map(l => l.id === updated.id ? updated : l))
                    }}
                    onView={(url, name) => {
                        setPreviewUrl(url)
                        setPreviewName(name)
                    }}
                    onConvert={(lead) => { setConvertLead(lead); setDetailLead(null) }}
                    onViewEmployee={async (employeeId) => {
                        setViewEmpLoading(true)
                        try {
                            const r = await fetch(`/api/employees/${employeeId}`)
                            if (r.ok) { setViewEmpData(await r.json()); setViewEmpOpen(true) }
                            else toast.error("Could not load employee")
                        } catch { toast.error("Failed to load employee") }
                        finally { setViewEmpLoading(false) }
                    }}
                />
            )}

            {/* ── Share Onboarding (join) Link ── */}
            {shareOpen && (
                <div onClick={() => setShareOpen(false)}
                    style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,0.4)", backdropFilter: "blur(2px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
                    <div onClick={e => e.stopPropagation()}
                        style={{ background: "var(--surface)", borderRadius: 16, border: "1px solid var(--border)", width: "100%", maxWidth: 480, boxShadow: "0 20px 60px rgba(0,0,0,0.2)", overflow: "hidden" }}>
                        <div style={{ padding: "18px 20px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                <div style={{ width: 36, height: 36, borderRadius: 10, background: "#e8f7f1", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                    <Link2 size={18} style={{ color: "var(--accent)" }} />
                                </div>
                                <h2 style={{ fontSize: 16, fontWeight: 700, color: "var(--text)", margin: 0 }}>Onboarding Link</h2>
                            </div>
                            <button onClick={() => setShareOpen(false)} style={{ border: "none", background: "none", cursor: "pointer", color: "var(--text3)" }}><X size={18} /></button>
                        </div>
                        <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
                            <p style={{ fontSize: 13, color: "var(--text2)", margin: 0, lineHeight: 1.5 }}>
                                Send this link to the candidate. They fill in their own details and documents, with <b>you as their HR contact</b>, and it then arrives in Onboarding for approval.
                            </p>
                            <div>
                                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text2)", display: "block", marginBottom: 6 }}>Role / Designation (optional)</label>
                                <input value={shareRole} onChange={e => setShareRole(e.target.value)}
                                    placeholder="e.g. Quality Inspector"
                                    style={{ width: "100%", height: 42, borderRadius: 10, border: "1px solid var(--border)", padding: "0 12px", fontSize: 13.5, background: "var(--surface)", color: "var(--text)", outline: "none", boxSizing: "border-box" }} />
                                <p style={{ fontSize: 11.5, color: "var(--text3)", margin: "6px 0 0" }}>Fill this in and the designation is pre-filled on the candidate's form.</p>
                            </div>
                            <div>
                                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text2)", display: "block", marginBottom: 6 }}>Your personalized link</label>
                                <div style={{ display: "flex", gap: 8 }}>
                                    <input readOnly value={joinLink}
                                        onFocus={e => e.currentTarget.select()}
                                        style={{ flex: 1, height: 42, borderRadius: 10, border: "1px solid var(--border)", padding: "0 12px", fontSize: 12.5, background: "var(--surface2)", color: "var(--text2)", outline: "none", boxSizing: "border-box" }} />
                                    <button onClick={copyJoinLink}
                                        style={{ display: "flex", alignItems: "center", gap: 6, padding: "0 16px", borderRadius: 10, border: "none", background: "var(--accent)", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>
                                        {linkCopied ? <><CheckCircle size={15} /> Copied</> : <><Copy size={15} /> Copy</>}
                                    </button>
                                </div>
                            </div>
                            <a href={`https://wa.me/?text=${encodeURIComponent(`Hello! Please complete your onboarding for Growus Auto using this link:\n${joinLink}`)}`}
                                target="_blank" rel="noreferrer"
                                style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, height: 42, borderRadius: 10, border: "1px solid #25d366", background: "#25d36612", color: "#128c3e", fontSize: 13, fontWeight: 600, textDecoration: "none" }}>
                                Share on WhatsApp
                            </a>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Convert to Employee Modal ── */}
            {convertLead && (
                <ConvertModal
                    lead={convertLead}
                    onClose={() => setConvertLead(null)}
                    onConverted={(employeeId: string, employeeCode: string) => {
                        setConvertLead(null)
                        setLeads(prev => prev.map(l => l.id === convertLead.id ? { ...l, convertedEmployeeId: employeeId, status: "JOINED" } : l))
                        toast.success(`Employee ${employeeCode} created! Redirecting to Onboarding…`)
                        router.push(`/onboarding`)
                    }}
                />
            )}

            <EmployeeModal
                open={viewEmpOpen}
                onClose={() => { setViewEmpOpen(false); setViewEmpData(null) }}
                onSaved={() => {}}
                employee={viewEmpData}
                allSites={formSites}
            />

            <DocumentViewer 
                url={previewUrl} 
                fileName={previewName} 
                onClose={() => setPreviewUrl(null)} 
            />

            {/* ── Import Modal ── */}
            {showImportModal && (
                <div style={{ position: "fixed", inset: 0, zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.45)" }}>
                    <div style={{ background: "var(--surface)", borderRadius: "14px", width: "min(680px, 96vw)", maxHeight: "88vh", overflowY: "auto", padding: "24px", position: "relative" }}>
                        <button onClick={() => setShowImportModal(false)} style={{ position: "absolute", top: "14px", right: "14px", background: "none", border: "none", cursor: "pointer", color: "var(--text)" }}><X size={18} /></button>
                        <h2 style={{ fontSize: "16px", fontWeight: 600, marginBottom: "16px", color: "var(--text)" }}>Import Candidates</h2>

                        <div style={{ display: "flex", gap: "10px", marginBottom: "16px", flexWrap: "wrap" }}>
                            <label style={{ display: "flex", alignItems: "center", gap: "7px", padding: "8px 14px", border: "1px solid var(--border)", borderRadius: "8px", cursor: "pointer", fontSize: "13px", color: "var(--text)", background: "var(--surface)" }}>
                                <Upload size={14} /> Choose File (.xlsx / .csv)
                                <input ref={importFileRef} type="file" accept=".xlsx,.csv" onChange={handleImportFile} style={{ display: "none" }} />
                            </label>
                            <button onClick={handleDownloadTemplate} style={{ display: "flex", alignItems: "center", gap: "7px", padding: "8px 14px", border: "1px solid var(--border)", borderRadius: "8px", cursor: "pointer", fontSize: "13px", color: "var(--text)", background: "var(--surface)" }}>
                                <Download size={14} /> Download Template
                            </button>
                        </div>

                        {importRows.length > 0 && !importResult && (
                            <>
                                <p style={{ fontSize: "12px", color: "var(--text3)", marginBottom: "8px" }}>Preview (first 5 rows of {importRows.length} total)</p>
                                <div style={{ overflowX: "auto", marginBottom: "16px" }}>
                                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                                        <thead>
                                            <tr style={{ background: "var(--surface)" }}>
                                                {["Candidate Name", "Phone", "Email", "Position", "Source"].map(h => (
                                                    <th key={h} style={{ padding: "6px 10px", textAlign: "left", borderBottom: "1px solid var(--border)", color: "var(--text3)", fontWeight: 600 }}>{h}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {importRows.slice(0, 5).map((r, i) => (
                                                <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                                                    <td style={{ padding: "6px 10px", color: "var(--text)" }}>{String(r.candidateName ?? "")}</td>
                                                    <td style={{ padding: "6px 10px", color: "var(--text)" }}>{String(r.phone ?? "")}</td>
                                                    <td style={{ padding: "6px 10px", color: "var(--text)" }}>{String(r.email ?? "")}</td>
                                                    <td style={{ padding: "6px 10px", color: "var(--text)" }}>{String(r.position ?? "")}</td>
                                                    <td style={{ padding: "6px 10px", color: "var(--text)" }}>{String(r.source ?? "")}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                <button
                                    onClick={handleImportSubmit}
                                    disabled={importLoading}
                                    style={{ display: "flex", alignItems: "center", gap: "7px", padding: "9px 18px", background: "var(--accent)", color: "#fff", border: "none", borderRadius: "8px", fontSize: "13px", fontWeight: 600, cursor: importLoading ? "not-allowed" : "pointer", opacity: importLoading ? 0.7 : 1 }}
                                >
                                    {importLoading && <Loader2 size={14} className="animate-spin" />}
                                    Import {importRows.length} rows
                                </button>
                            </>
                        )}

                        {importResult && (
                            <div style={{ padding: "14px 16px", borderRadius: "10px", background: importResult.imported > 0 ? "#e8f7f1" : "#fef2f2", border: `1px solid ${importResult.imported > 0 ? "#6ee7b7" : "#fecaca"}` }}>
                                <p style={{ fontSize: "14px", fontWeight: 600, color: importResult.imported > 0 ? "#047857" : "#dc2626", marginBottom: "4px" }}>
                                    ✓ {importResult.imported} imported, {importResult.skipped} skipped (duplicates / errors)
                                </p>
                                {importResult.errors.length > 0 && (
                                    <ul style={{ margin: "8px 0 0 0", padding: "0 0 0 16px", fontSize: "12px", color: "#6b7280" }}>
                                        {importResult.errors.slice(0, 5).map((e, i) => <li key={i}>Row {e.row}: {e.reason}</li>)}
                                        {importResult.errors.length > 5 && <li>…and {importResult.errors.length - 5} more</li>}
                                    </ul>
                                )}
                            </div>
                        )}

                        {importRows.length === 0 && !importResult && (
                            <p style={{ fontSize: "13px", color: "var(--text3)" }}>Select an .xlsx or .csv file to preview and import candidates.</p>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}

// ─── Shared CSS ────────────────────────────────────────────────────────────────
const inputCls = "w-full h-9 px-3 text-[13px] border border-[var(--border)] rounded-[7px] focus:outline-none focus:ring-1 focus:ring-[var(--accent)] bg-white text-[var(--text)]"

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="flex flex-col gap-1.5">
            <label className="text-[12px] font-medium text-[var(--text2)]">{label}</label>
            {children}
        </div>
    )
}

function Modal({ children, onClose, title, wide }: { children: React.ReactNode; onClose: () => void; title: string; wide?: boolean }) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
            <div className={`relative bg-white rounded-[16px] shadow-xl w-full max-h-[90vh] overflow-y-auto ${wide ? "max-w-2xl" : "max-w-md"}`}>
                <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)] sticky top-0 bg-white z-10">
                    <h2 className="text-[16px] font-bold text-[var(--text)]">{title}</h2>
                    <button onClick={onClose} className="p-1.5 rounded-[6px] hover:bg-[var(--surface2)] text-[var(--text3)] transition-colors">
                        <X size={18} />
                    </button>
                </div>
                <div className="px-6 py-4">{children}</div>
            </div>
        </div>
    )
}

// ─── Kanban View ──────────────────────────────────────────────────────────────
// Per-candidate colour: each lead gets a stable colour derived from its id,
// so the SAME person is recognisable by colour across every pipeline stage.
const PERSON_COLORS = [
    { bg: "#e0f2fe", fg: "#0369a1" }, // sky
    { bg: "#dcfce7", fg: "#15803d" }, // green
    { bg: "#fef3c7", fg: "#b45309" }, // amber
    { bg: "#ffe4e6", fg: "#be123c" }, // rose
    { bg: "#e0e7ff", fg: "#4338ca" }, // indigo
    { bg: "#ccfbf1", fg: "#0f766e" }, // teal
    { bg: "#f3e8ff", fg: "#7e22ce" }, // purple
    { bg: "#ffedd5", fg: "#c2410c" }, // orange
    { bg: "#fce7f3", fg: "#be185d" }, // pink
    { bg: "#cffafe", fg: "#0e7490" }, // cyan
    { bg: "#ecfccb", fg: "#4d7c0f" }, // lime
    { bg: "#fae8ff", fg: "#a21caf" }, // fuchsia
]
function personColor(key: string) {
    let h = 0
    for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0
    return PERSON_COLORS[h % PERSON_COLORS.length]
}

// How many cards a column renders before "Show more" — keeps the DOM light
// so a stage with hundreds of candidates paints instantly instead of hanging.
const KANBAN_PAGE = 25

function KanbanColumn({ status, colLeads, onCard }: {
    status: any
    colLeads: Lead[]
    onCard: (l: Lead) => void
}) {
    const [visible, setVisible] = useState(KANBAN_PAGE)
    // Reset paging when the column's contents change (filter/search/refresh).
    useEffect(() => { setVisible(KANBAN_PAGE) }, [colLeads.length])
    const shown = colLeads.slice(0, visible)
    const remaining = colLeads.length - shown.length

    return (
        <div className="flex flex-col shrink-0 w-[268px]">
            {/* Filled colored column header */}
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-t-[12px]" style={{ background: status.color }}>
                <span className="w-2 h-2 rounded-full bg-white/80 shrink-0" />
                <span className="text-[13px] font-semibold text-white flex-1 truncate">{status.label}</span>
                <span className="text-[12px] font-bold text-white tabular-nums bg-white/25 px-2 py-0.5 rounded-full min-w-[26px] text-center">
                    {colLeads.length}
                </span>
            </div>
            {/* Column body — cards scroll INTERNALLY so the page height stays
                fixed, and only KANBAN_PAGE cards render at a time. */}
            <div className="flex flex-col bg-[var(--surface2)]/50 border-x border-b border-[var(--border)] rounded-b-[12px]">
                <div className="flex flex-col gap-2.5 p-2.5 overflow-y-auto scrollbar-thin" style={{ maxHeight: "calc(100vh - 300px)", minHeight: 120 }}>
                    {shown.map(lead => (
                        <KanbanCard key={lead.id} lead={lead} onCard={onCard} statusColor={status.color} statusBg={status.bg} />
                    ))}
                    {colLeads.length === 0 && (
                        <div className="flex flex-col items-center justify-center gap-1 py-8 text-center">
                            <p className="text-[12px] font-medium text-[var(--text3)]">No candidates</p>
                            <p className="text-[11px] text-[var(--text3)]/70">Add a new lead here</p>
                        </div>
                    )}
                    {remaining > 0 && (
                        <button
                            onClick={() => setVisible(v => v + KANBAN_PAGE)}
                            className="w-full py-2 rounded-[9px] text-[12px] font-medium text-[var(--text2)] bg-white/70 hover:bg-white border border-[var(--border)] transition-colors"
                        >
                            Show {Math.min(KANBAN_PAGE, remaining)} more · {remaining} left
                        </button>
                    )}
                </div>
            </div>
        </div>
    )
}

function KanbanView({
    leads, onCard, onStatusChange, onAdd
}: {
    leads: Record<string, Lead[]>
    onCard: (l: Lead) => void
    onStatusChange: (id: string, s: string) => void
    onAdd: () => void
}) {
    void onStatusChange
    void onAdd
    return (
        <div className="flex gap-3.5 overflow-x-auto pb-4 px-4 lg:px-0 flex-1">
            {STATUSES.map(status => (
                <KanbanColumn key={status.key} status={status} colLeads={leads[status.key] ?? []} onCard={onCard} />
            ))}
        </div>
    )
}

function KanbanCard({ lead, onCard, statusColor, statusBg }: { lead: Lead; onCard: (l: Lead) => void; statusColor: string; statusBg: string }) {
    const isOnSiteJoin = lead.source === "On-site Join"
    const salary = fmtSalary(lead.expectedSalary)
    const recruiter = lead.assignee?.name || lead.creator?.name
    // Stable per-candidate colour — same person, same colour in every stage.
    const color = personColor(lead.id || lead.candidateName || "")
    return (
        <div onClick={() => onCard(lead)}
            className="bg-white border rounded-[11px] cursor-pointer hover:shadow-md transition-all overflow-hidden shrink-0"
            style={{
                borderColor: isOnSiteJoin ? "#6ee7b7" : "var(--border)",
                borderLeft: `4px solid ${color.fg}`,
                boxShadow: isOnSiteJoin ? "0 0 0 1px #6ee7b7" : undefined,
            }}>
            {/* On-site join top banner */}
            {isOnSiteJoin && (
                <div className="flex items-center gap-1.5 px-3 py-1.5"
                    style={{ background: "linear-gradient(90deg, #ecfdf5 0%, #d1fae5 100%)", borderBottom: "1px solid #a7f3d0" }}>
                    <CheckCircle size={11} style={{ color: "#047857", flexShrink: 0 }} />
                    <span style={{ fontSize: 10, fontWeight: 700, color: "#047857", letterSpacing: "0.4px", textTransform: "uppercase" }}>
                        On-site Join
                    </span>
                </div>
            )}
            <div className="p-3">
                {/* Header: avatar + name / role / city + score pill */}
                <div className="flex items-start justify-between gap-2 mb-2.5">
                    <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 font-bold text-[13px] overflow-hidden" style={{ position: "relative", background: color.bg, color: color.fg }}>
                            {(lead.candidateName || "?").charAt(0).toUpperCase()}
                            {lead.profileUrl && (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={lead.profileUrl} alt={lead.candidateName} className="w-full h-full object-cover"
                                    style={{ position: "absolute", inset: 0 }}
                                    onError={e => (e.currentTarget.style.display = "none")} />
                            )}
                        </div>
                        <div className="min-w-0">
                            <p className="text-[13px] font-semibold text-[var(--text)] leading-tight line-clamp-2 break-words">{lead.candidateName || "Unnamed candidate"}</p>
                            <p className="text-[11.5px] text-[var(--text3)] leading-tight line-clamp-1 mt-0.5">{lead.position}</p>
                            {lead.city && (
                                <p className="flex items-center gap-1 text-[11px] text-[var(--text3)] leading-tight mt-0.5">
                                    <MapPin size={10} className="shrink-0" />
                                    <span className="truncate">{lead.city}</span>
                                </p>
                            )}
                        </div>
                    </div>
                    <ScoreBadge score={lead.score} />
                </div>

                {/* Exp + Salary */}
                {(lead.experience != null || salary) && (
                    <div className="flex items-center gap-3 flex-wrap text-[11.5px] mb-1.5">
                        {lead.experience != null && (
                            <span className="flex items-center gap-1 text-[var(--text2)]">
                                <Briefcase size={11} className="text-[var(--text3)] shrink-0" />{lead.experience} Yrs Exp
                            </span>
                        )}
                        {salary && <span className="font-semibold text-[var(--text)]">{salary}</span>}
                    </div>
                )}

                {/* Phone */}
                {lead.phone && (
                    <div className="flex items-center gap-1.5 text-[11.5px] text-[var(--text2)] mb-1.5">
                        <Phone size={11} className="text-[var(--text3)] shrink-0" />
                        <span>{lead.phone}</span>
                    </div>
                )}

                {/* Added date */}
                <div className="flex items-center gap-1.5 text-[11px] text-[var(--text3)]">
                    <Calendar size={10} className="shrink-0" />
                    <span>Added: {fmt(lead.createdAt)}</span>
                </div>

                {/* Recruiter box + next follow-up */}
                {(recruiter || lead.nextFollowUp) && (
                    <div className="mt-2.5 rounded-[9px] p-2" style={{ background: statusBg }}>
                        {recruiter && (
                            <>
                                <div className="flex items-center gap-1.5 text-[10.5px] font-medium text-[var(--text3)] uppercase tracking-wide">
                                    <UserCheck size={11} className="shrink-0" style={{ color: statusColor }} />
                                    Recruiter
                                </div>
                                <p className="text-[12px] font-semibold leading-tight mt-0.5 truncate" style={{ color: statusColor }}>{recruiter}</p>
                            </>
                        )}
                        {lead.nextFollowUp && (
                            <div className="flex items-center gap-1.5 text-[10.5px] text-[var(--text3)] mt-1.5">
                                <Calendar size={10} className="shrink-0" />
                                <span>Next Follow-up: {fmt(lead.nextFollowUp)}</span>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}

// ─── List View ────────────────────────────────────────────────────────────────
function ListView({ leads, onCard, onEdit, onDelete, session }: {
    leads: Lead[]
    onCard: (l: Lead) => void
    onEdit: (l: Lead) => void
    onDelete: (id: string) => void
    session: any
}) {
    // Excel-style grid: bordered cells, sticky header, hover row highlight.
    const th = "text-left font-semibold text-[var(--text2)] px-3 py-2 border border-[var(--border)] whitespace-nowrap bg-[var(--surface2)]"
    const td = "px-3 py-2 border border-[var(--border)] whitespace-nowrap text-[var(--text)] align-middle"
    return (
        <div className="px-4 lg:px-0">
            <div className="overflow-x-auto border border-[var(--border)] rounded-[10px] bg-white">
                <table className="w-full text-[12.5px]" style={{ borderCollapse: "collapse" }}>
                    <thead className="sticky top-0 z-10">
                        <tr>
                            <th className={th} style={{ width: 44 }}>#</th>
                            <th className={th}>Candidate</th>
                            <th className={th}>Position</th>
                            <th className={th}>Exp</th>
                            <th className={th}>Phone</th>
                            <th className={th}>City</th>
                            <th className={th}>Source</th>
                            <th className={th}>Score</th>
                            <th className={th}>Priority</th>
                            <th className={th}>Status</th>
                            <th className={th}>Interview</th>
                            <th className={th}>Recruited By</th>
                            <th className={th} style={{ textAlign: "center" }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {leads.map((lead, i) => (
                            <tr key={lead.id} onClick={() => onCard(lead)}
                                className="cursor-pointer hover:bg-[var(--accent-light)]/40 transition-colors">
                                <td className={td + " text-[var(--text3)] text-center"}>{i + 1}</td>
                                <td className={td + " font-semibold"}>
                                    <div className="flex items-center gap-2">
                                        <div className="w-7 h-7 rounded-full bg-[var(--accent-light)] flex items-center justify-center shrink-0 text-[var(--accent)] font-bold text-[11px] overflow-hidden" style={{ position: "relative" }}>
                                            {lead.candidateName.charAt(0).toUpperCase()}
                                            {lead.profileUrl && (
                                                // eslint-disable-next-line @next/next/no-img-element
                                                <img src={lead.profileUrl} alt={lead.candidateName} className="w-full h-full object-cover"
                                                    style={{ position: "absolute", inset: 0 }}
                                                    onError={e => (e.currentTarget.style.display = "none")} />
                                            )}
                                        </div>
                                        <span className="truncate">{lead.candidateName}</span>
                                    </div>
                                </td>
                                <td className={td + " text-[var(--text2)]"}>{lead.position}</td>
                                <td className={td + " text-[var(--text2)]"}>{lead.experience != null ? `${lead.experience}y` : "—"}</td>
                                <td className={td + " text-[var(--text2)]"}>{lead.phone || "—"}</td>
                                <td className={td + " text-[var(--text2)]"}>{lead.city || "—"}</td>
                                <td className={td + " text-[var(--text2)]"}>{lead.source}</td>
                                <td className={td}><ScoreBadge score={lead.score} /></td>
                                <td className={td}>
                                    <span className="inline-flex items-center gap-1.5">
                                        <PriorityDot priority={lead.priority} />
                                        <span className="text-[var(--text2)] capitalize">{(lead.priority || "").toLowerCase()}</span>
                                    </span>
                                </td>
                                <td className={td}><StatusBadge status={lead.status} /></td>
                                <td className={td + " text-[var(--text2)]"}>{lead.interviewDate ? fmt(lead.interviewDate) : "—"}</td>
                                <td className={td + " text-[var(--text2)]"}>{lead.creator?.name || "—"}</td>
                                <td className={td} onClick={e => e.stopPropagation()}>
                                    <div className="flex items-center justify-center gap-1">
                                        <button onClick={() => onEdit(lead)} className="p-1.5 rounded-[6px] hover:bg-[var(--surface2)] text-[var(--text3)] transition-colors">
                                            <Edit2 size={13} />
                                        </button>
                                        {can(session, "recruitment.view") && (
                                            <button onClick={() => onDelete(lead.id)} className="p-1.5 rounded-[6px] hover:bg-red-50 text-[var(--text3)] hover:text-red-500 transition-colors">
                                                <Trash2 size={13} />
                                            </button>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    )
}

// ─── Documents Tab View ───────────────────────────────────────────────────────
function DocumentsTabView({ leads, onLeadClick, onView }: { leads: Lead[]; onLeadClick: (l: Lead) => void; onView: (url: string, name: string) => void }) {
    const allDocs = leads.flatMap(l => (l.documents ?? []).map(d => ({ ...d, leadName: l.candidateName, lead: l })))

    const verifiedColor: Record<string, string> = {
        PENDING: "#f59e0b",
        APPROVED: "#1a9e6e",
        REJECTED: "#dc2626",
    }

    if (allDocs.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-24 gap-3">
                <div className="w-14 h-14 bg-[var(--surface2)] rounded-full flex items-center justify-center">
                    <FileText size={24} className="text-[var(--text3)]" />
                </div>
                <p className="text-[14px] font-medium text-[var(--text2)]">No documents yet</p>
                <p className="text-[12px] text-[var(--text3)]">Open a lead and add documents from the Documents tab</p>
            </div>
        )
    }

    return (
        <div className="mt-4 flex flex-col gap-2">
            {allDocs.map(doc => (
                <div key={doc.id} className="bg-white border border-[var(--border)] rounded-[12px] p-4 flex items-center gap-4 hover:shadow-sm transition-all">
                    <div className="w-10 h-10 rounded-[10px] bg-[var(--surface2)] flex items-center justify-center shrink-0">
                        <FileText size={18} className="text-[var(--text3)]" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-semibold text-[var(--text)] truncate">{doc.fileName}</p>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                            <span className="text-[11px] text-[var(--text3)] bg-[var(--surface2)] px-1.5 py-0.5 rounded-full">{doc.docType}</span>
                            <button onClick={() => onLeadClick(doc.lead)} className="text-[11px] text-[var(--accent)] hover:underline">{doc.leadName}</button>
                            <span className="text-[11px] text-[var(--text3)]">by {doc.uploader.name}</span>
                        </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full border"
                            style={{ color: verifiedColor[doc.verified] ?? "#6b7280", borderColor: verifiedColor[doc.verified] ?? "#6b7280", background: (verifiedColor[doc.verified] ?? "#6b7280") + "15" }}>
                            {doc.verified}
                        </span>
                        <button 
                            onClick={(e) => {
                                e.stopPropagation()
                                onView(doc.url, doc.fileName)
                            }}
                            className="text-[12px] text-[var(--accent)] hover:underline"
                        >
                            View
                        </button>
                    </div>
                </div>
            ))}
        </div>
    )
}

// ─── Detail Drawer ────────────────────────────────────────────────────────────
function DetailDrawer({
    lead, session, users, activityContent, activityType, savingActivity,
    onClose, onEdit, onDelete, onStatusChange, onActivityTypeChange, onActivityContentChange, onAddActivity,
    onLeadUpdate, onView, onConvert, onViewEmployee
}: {
    lead: Lead
    session: any
    users: AppUser[]
    activityContent: string
    activityType: string
    savingActivity: boolean
    onClose: () => void
    onEdit: () => void
    onDelete: () => void
    onStatusChange: (s: string) => void
    onActivityTypeChange: (t: string) => void
    onActivityContentChange: (c: string) => void
    onAddActivity: () => void
    onLeadUpdate: (l: Lead) => void
    onView: (url: string, name: string) => void
    onConvert: (lead: Lead) => void
    onViewEmployee: (employeeId: string) => void
}) {
    const [drawerTab, setDrawerTab] = useState<"overview" | "activities" | "interview" | "documents" | "followups">("overview")
    const [interviewForm, setInterviewForm] = useState({
        interviewerId: lead.interviewerId ?? "",
        interviewFeedback: lead.interviewFeedback ?? "",
        interviewResult: lead.interviewResult ?? "",
    })
    const [savingInterview, setSavingInterview] = useState(false)
    const router = useRouter()

    // Document form
    const [showDocForm, setShowDocForm] = useState(false)
    const [docForm, setDocForm] = useState({ docType: "RESUME", fileName: "", url: "" })
    const [savingDoc, setSavingDoc] = useState(false)

    // Follow-up form
    const [showFollowUpForm, setShowFollowUpForm] = useState(false)
    const [followUpForm, setFollowUpForm] = useState({ type: "CALL", note: "", scheduledAt: "" })
    const [savingFollowUp, setSavingFollowUp] = useState(false)

    async function saveInterviewDetails() {
        setSavingInterview(true)
        try {
            const res = await fetch(`/api/recruitment/${lead.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(interviewForm)
            })
            if (!res.ok) throw new Error()
            const updated = await res.json()
            onLeadUpdate(updated)
            toast.success("Interview details saved")
        } catch {
            toast.error("Failed to save interview details")
        } finally { setSavingInterview(false) }
    }

    async function addDocument(e: React.FormEvent) {
        e.preventDefault()
        setSavingDoc(true)
        try {
            const res = await fetch(`/api/recruitment/${lead.id}/documents`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(docForm)
            })
            if (!res.ok) throw new Error()
            const doc = await res.json()
            onLeadUpdate({ ...lead, documents: [doc, ...(lead.documents ?? [])] })
            setDocForm({ docType: "RESUME", fileName: "", url: "" })
            setShowDocForm(false)
            toast.success("Document added")
        } catch {
            toast.error("Failed to add document")
        } finally { setSavingDoc(false) }
    }

    async function updateDocVerification(docId: string, verified: string) {
        try {
            const res = await fetch(`/api/recruitment/${lead.id}/documents`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ docId, verified })
            })
            if (!res.ok) throw new Error()
            const updated = await res.json()
            onLeadUpdate({
                ...lead,
                documents: (lead.documents ?? []).map(d => d.id === docId ? updated : d)
            })
            toast.success("Verification updated")
        } catch {
            toast.error("Failed to update verification")
        }
    }

    async function addFollowUp(e: React.FormEvent) {
        e.preventDefault()
        setSavingFollowUp(true)
        try {
            const res = await fetch(`/api/recruitment/${lead.id}/followups`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(followUpForm)
            })
            if (!res.ok) throw new Error()
            const fu = await res.json()
            onLeadUpdate({ ...lead, followUps: [...(lead.followUps ?? []), fu] })
            setFollowUpForm({ type: "CALL", note: "", scheduledAt: "" })
            setShowFollowUpForm(false)
            toast.success("Follow-up scheduled")
        } catch {
            toast.error("Failed to schedule follow-up")
        } finally { setSavingFollowUp(false) }
    }

    async function updateFollowUpStatus(followUpId: string, status: string) {
        try {
            const res = await fetch(`/api/recruitment/${lead.id}/followups`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ followUpId, status })
            })
            if (!res.ok) throw new Error()
            const updated = await res.json()
            onLeadUpdate({
                ...lead,
                followUps: (lead.followUps ?? []).map(f => f.id === followUpId ? updated : f)
            })
            toast.success("Follow-up updated")
        } catch {
            toast.error("Failed to update follow-up")
        }
    }

    const DRAWER_TABS = [
        { key: "overview" as const,   label: "Overview" },
        { key: "activities" as const, label: "Activities" },
        { key: "interview" as const,  label: "Interview" },
        { key: "documents" as const,  label: `Docs${(lead.documents ?? []).length > 0 ? ` (${lead.documents!.length})` : ""}` },
        { key: "followups" as const,  label: `Follow-ups${(lead.followUps ?? []).length > 0 ? ` (${lead.followUps!.length})` : ""}` },
    ]

    const verifiedBadge = (v: string) => {
        const colors: Record<string, string> = { PENDING: "#f59e0b", APPROVED: "#1a9e6e", REJECTED: "#dc2626" }
        return <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full border"
            style={{ color: colors[v] ?? "#6b7280", borderColor: colors[v] ?? "#6b7280", background: (colors[v] ?? "#6b7280") + "15" }}>
            {v}
        </span>
    }

    return (
        <div className="fixed inset-0 z-50 flex">
            <div className="flex-1 bg-black/40 backdrop-blur-sm" onClick={onClose} />
            <div className="w-full max-w-[480px] bg-white h-full shadow-2xl flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)] sticky top-0 bg-white z-10 shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-[var(--accent-light)] flex items-center justify-center text-[var(--accent)] font-bold text-[15px] overflow-hidden" style={{ position: "relative" }}>
                            {lead.candidateName.charAt(0).toUpperCase()}
                            {lead.profileUrl && (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={lead.profileUrl} alt={lead.candidateName} className="w-full h-full object-cover"
                                    style={{ position: "absolute", inset: 0 }}
                                    onError={e => (e.currentTarget.style.display = "none")} />
                            )}
                        </div>
                        <div>
                            <p className="text-[15px] font-bold text-[var(--text)]">{lead.candidateName}</p>
                            <div className="flex items-center gap-1.5 mt-0.5">
                                <p className="text-[12px] text-[var(--text2)]">{lead.position}</p>
                                <ScoreBadge score={lead.score} />
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <button onClick={onEdit} className="p-1.5 rounded-[7px] hover:bg-[var(--surface2)] text-[var(--text3)] transition-colors">
                            <Edit2 size={15} />
                        </button>
                        {can(session, "recruitment.view") && (
                            <button onClick={onDelete} className="p-1.5 rounded-[7px] hover:bg-red-50 text-[var(--text3)] hover:text-red-500 transition-colors">
                                <Trash2 size={15} />
                            </button>
                        )}
                        <button onClick={onClose} className="p-1.5 rounded-[7px] hover:bg-[var(--surface2)] text-[var(--text3)] transition-colors">
                            <X size={17} />
                        </button>
                    </div>
                </div>

                {/* Stage selector */}
                <div className="px-5 py-3 border-b border-[var(--border)] shrink-0">
                    <div className="flex flex-wrap gap-1.5">
                        {STATUSES.map(s => (
                            <button key={s.key}
                                onClick={() => s.key === "JOINED" && !lead.convertedEmployeeId ? onConvert(lead) : onStatusChange(s.key)}
                                className="px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-all"
                                style={lead.status === s.key
                                    ? { background: s.color, color: "#fff", borderColor: s.color }
                                    : { background: s.bg, color: s.color, borderColor: s.border }
                                }>
                                {s.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Drawer tabs */}
                <div className="flex gap-0 border-b border-[var(--border)] shrink-0 overflow-x-auto">
                    {DRAWER_TABS.map(t => (
                        <button key={t.key} onClick={() => setDrawerTab(t.key)}
                            className={`px-3 py-2.5 text-[12px] font-medium whitespace-nowrap border-b-2 transition-colors ${
                                drawerTab === t.key
                                    ? "border-[var(--accent)] text-[var(--accent)]"
                                    : "border-transparent text-[var(--text3)] hover:text-[var(--text)]"
                            }`}>
                            {t.label}
                        </button>
                    ))}
                </div>

                {/* Tab content */}
                <div className="flex-1 overflow-y-auto">

                    {/* OVERVIEW TAB */}
                    {drawerTab === "overview" && (
                        <div className="px-5 py-4">
                            {/* Convert to Employee banner */}
                            {["SELECTED", "OFFERED", "JOINED"].includes(lead.status) && (
                                <div className={`mb-4 p-3 rounded-[10px] border flex items-center justify-between gap-3 ${lead.convertedEmployeeId ? "bg-green-50 border-green-200" : "bg-[#fffbeb] border-amber-200"}`}>
                                    {lead.convertedEmployeeId ? (
                                        <>
                                            <div className="flex items-center gap-2">
                                                <CheckCircle size={16} className="text-green-600 shrink-0" />
                                                <span className="text-[13px] font-semibold text-green-700">Converted to Employee</span>
                                            </div>
                                            <button
                                                onClick={() => lead.convertedEmployeeId && onViewEmployee(lead.convertedEmployeeId)}
                                                className="flex items-center gap-1.5 h-7 px-3 text-[12px] font-semibold bg-green-600 text-white rounded-[6px] hover:bg-green-700 transition-colors shrink-0"
                                            >
                                                <ExternalLink size={12} /> View Employee
                                            </button>
                                        </>
                                    ) : (
                                        <>
                                            <div className="flex items-center gap-2">
                                                <UserPlus size={16} className="text-amber-600 shrink-0" />
                                                <span className="text-[13px] font-semibold text-amber-700">Ready to onboard</span>
                                            </div>
                                            <button
                                                onClick={() => onConvert(lead)}
                                                className="flex items-center gap-1.5 h-7 px-3 text-[12px] font-semibold bg-[var(--accent)] text-white rounded-[6px] hover:bg-[var(--accent-hover)] transition-colors shrink-0"
                                            >
                                                <UserPlus size={12} /> Convert to Employee
                                            </button>
                                        </>
                                    )}
                                </div>
                            )}

                            {/* Resume / Profile links */}
                            {(lead.resumeUrl || lead.profileUrl) && (
                                <div className="flex gap-2 mb-4 flex-wrap">
                                    {lead.resumeUrl && (
                                        <button 
                                            onClick={() => onView(lead.resumeUrl!, "Resume_" + lead.candidateName)}
                                            style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "6px 14px", background: "var(--accent)", color: "#fff", borderRadius: "7px", fontSize: "12px", fontWeight: 600, border: "none" }}
                                        >
                                            <FileText size={13} /> View Resume
                                        </button>
                                    )}
                                    {lead.profileUrl && (
                                        <a href={lead.profileUrl} target="_blank" rel="noopener noreferrer"
                                            style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "6px 14px", background: "var(--surface2)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: "7px", fontSize: "12px", fontWeight: 600, textDecoration: "none" }}>
                                            <Target size={13} /> View Profile
                                        </a>
                                    )}
                                </div>
                            )}
                            <div className="grid grid-cols-2 gap-y-3 gap-x-4">
                                <InfoRow icon={Phone} label="Phone" value={lead.phone} />
                                {lead.email && <InfoRow icon={Mail} label="Email" value={lead.email} />}
                                {lead.city && <InfoRow icon={MapPin} label="City" value={lead.city} />}
                                {lead.locality && <InfoRow icon={MapPin} label="Locality" value={lead.locality} />}
                                {lead.experience != null && <InfoRow icon={Clock} label="Experience" value={`${lead.experience} years`} />}
                                {lead.levelOfExperience && <InfoRow icon={TrendingUp} label="Level" value={lead.levelOfExperience} />}
                                {lead.currentCompany && <InfoRow icon={Building2} label="Prev Company" value={lead.currentCompany} />}
                                {lead.previousCompany && <InfoRow icon={Building2} label="Prev Company" value={lead.previousCompany} />}
                                {lead.previousDesignation && <InfoRow icon={Briefcase} label="Prev Designation" value={lead.previousDesignation} />}
                                {lead.qualification && <InfoRow icon={GraduationCap} label="Qualification" value={lead.qualification} />}
                                {lead.course && <InfoRow icon={GraduationCap} label="Course" value={`${lead.course}${lead.specialization ? ` · ${lead.specialization}` : ""}`} />}
                                {lead.collegeName && <InfoRow icon={GraduationCap} label="College" value={lead.collegeName} />}
                                {lead.skills && <InfoRow icon={Wrench} label="Skills" value={lead.skills} />}
                                {lead.gender && <InfoRow icon={Users} label="Gender" value={lead.gender} />}
                                {lead.age != null && <InfoRow icon={Clock} label="Age" value={`${lead.age} years`} />}
                                {lead.languages && <InfoRow icon={MessageSquare} label="Languages" value={lead.languages} />}
                                {lead.englishLevel && <InfoRow icon={CheckSquare} label="English" value={lead.englishLevel} />}
                                <InfoRow icon={Target} label="Source" value={lead.source} />
                                {lead.currentSalary && <InfoRow icon={Banknote} label="Current CTC" value={fmtSalary(lead.currentSalary) ?? ""} />}
                                {lead.expectedSalary && <InfoRow icon={Banknote} label="Expected CTC" value={fmtSalary(lead.expectedSalary) ?? ""} />}
                                {lead.interviewDate && <InfoRow icon={Calendar} label="Interview" value={`${fmt(lead.interviewDate)}${lead.interviewMode ? ` · ${lead.interviewMode}` : ""}`} />}
                                {lead.nextFollowUp && <InfoRow icon={Clock} label="Follow-up" value={fmt(lead.nextFollowUp)} />}
                                {lead.assignee && <InfoRow icon={UserCheck} label="Assigned To" value={lead.assignee.name} />}
                                {lead.creator?.name && <InfoRow icon={UserCheck} label="Recruited By" value={lead.creator.name} />}
                                {/* Personal information from the candidate form */}
                                {lead.altPhone && <InfoRow icon={Phone} label="Alt. Number" value={lead.altPhone} />}
                                {lead.dateOfBirth && <InfoRow icon={Calendar} label="Date of Birth" value={fmt(lead.dateOfBirth)} />}
                                {lead.bloodGroup && <InfoRow icon={Users} label="Blood Group" value={lead.bloodGroup} />}
                                {lead.tshirtSize && <InfoRow icon={Users} label="T-Shirt Size" value={lead.tshirtSize} />}
                                {lead.maritalStatus && <InfoRow icon={Users} label="Marital Status" value={lead.maritalStatus} />}
                                {lead.nationality && <InfoRow icon={MapPin} label="Nationality" value={lead.nationality} />}
                                {lead.aadharNumber && <InfoRow icon={FileText} label="Aadhar" value={lead.aadharNumber} />}
                                {lead.currentDesignation && <InfoRow icon={Briefcase} label="Current Designation" value={lead.currentDesignation} />}
                                {lead.pfEsicNumber && <InfoRow icon={FileText} label="PF / ESIC No." value={lead.pfEsicNumber} />}
                                {lead.reasonForLeaving && <InfoRow icon={MessageSquare} label="Reason for Leaving" value={lead.reasonForLeaving} />}
                                {lead.hasBike != null && <InfoRow icon={Target} label="Owns Bike" value={lead.hasBike ? "Yes" : "No"} />}
                            </div>

                            {/* Family details */}
                            {(lead.fatherName || lead.fatherOccupation || lead.motherName || lead.motherOccupation) && (
                                <div className="mt-4">
                                    <p className="text-[11px] font-semibold text-[var(--text3)] uppercase tracking-wider mb-2">Family Details</p>
                                    <div className="grid grid-cols-2 gap-y-3 gap-x-4">
                                        {lead.fatherName && <InfoRow icon={Users} label="Father's Name" value={lead.fatherName} />}
                                        {lead.fatherOccupation && <InfoRow icon={Briefcase} label="Father's Occupation" value={lead.fatherOccupation} />}
                                        {lead.motherName && <InfoRow icon={Users} label="Mother's Name" value={lead.motherName} />}
                                        {lead.motherOccupation && <InfoRow icon={Briefcase} label="Mother's Occupation" value={lead.motherOccupation} />}
                                    </div>
                                </div>
                            )}

                            {/* Address */}
                            {(lead.presentAddress || lead.permanentAddress) && (
                                <div className="mt-4 space-y-2">
                                    <p className="text-[11px] font-semibold text-[var(--text3)] uppercase tracking-wider mb-1">Address</p>
                                    {lead.presentAddress && (
                                        <div className="p-3 bg-[var(--surface2)] rounded-[8px]">
                                            <p className="text-[11px] font-semibold text-[var(--text3)] mb-0.5">Present Address</p>
                                            <p className="text-[12px] text-[var(--text2)]">{lead.presentAddress}</p>
                                        </div>
                                    )}
                                    {lead.permanentAddress && (
                                        <div className="p-3 bg-[var(--surface2)] rounded-[8px]">
                                            <p className="text-[11px] font-semibold text-[var(--text3)] mb-0.5">Permanent Address</p>
                                            <p className="text-[12px] text-[var(--text2)]">{lead.permanentAddress}</p>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Education details table */}
                            {Array.isArray(lead.educationDetails) && lead.educationDetails.length > 0 && (
                                <div className="mt-4">
                                    <p className="text-[11px] font-semibold text-[var(--text3)] uppercase tracking-wider mb-2">Educational Details</p>
                                    <div className="border border-[var(--border)] rounded-[8px] overflow-hidden overflow-x-auto">
                                        <table className="w-full text-[11.5px]">
                                            <thead>
                                                <tr className="bg-[var(--surface2)] text-[var(--text3)]">
                                                    <th className="text-left font-medium px-2.5 py-1.5">Course</th>
                                                    <th className="text-left font-medium px-2.5 py-1.5">Stream</th>
                                                    <th className="text-left font-medium px-2.5 py-1.5">Institute</th>
                                                    <th className="text-left font-medium px-2.5 py-1.5">Year</th>
                                                    <th className="text-left font-medium px-2.5 py-1.5">%/CGPA</th>
                                                    <th className="text-left font-medium px-2.5 py-1.5">Location</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-[var(--border)]">
                                                {lead.educationDetails.filter(e => e && (e.course || e.stream || e.institute || e.year || e.percentage || e.location)).map((e, i) => (
                                                    <tr key={i} className="text-[var(--text2)]">
                                                        <td className="px-2.5 py-1.5">{e.course || "—"}</td>
                                                        <td className="px-2.5 py-1.5">{e.stream || "—"}</td>
                                                        <td className="px-2.5 py-1.5">{e.institute || "—"}</td>
                                                        <td className="px-2.5 py-1.5">{e.year || "—"}</td>
                                                        <td className="px-2.5 py-1.5">{e.percentage || "—"}</td>
                                                        <td className="px-2.5 py-1.5">{e.location || "—"}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}

                            {/* Documents submitted */}
                            {Array.isArray(lead.documentsSubmitted) && lead.documentsSubmitted.length > 0 && (
                                <div className="mt-4">
                                    <p className="text-[11px] font-semibold text-[var(--text3)] uppercase tracking-wider mb-2">Documents Submitted</p>
                                    <div className="flex flex-wrap gap-1.5">
                                        {lead.documentsSubmitted.map((d, i) => (
                                            <span key={i} className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-200">
                                                <CheckSquare size={11} /> {d}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}
                            {lead.notes && (
                                <div className="mt-4 p-3 bg-[var(--surface2)] rounded-[8px]">
                                    <p className="text-[11px] font-semibold text-[var(--text3)] mb-1">Notes</p>
                                    <p className="text-[12px] text-[var(--text2)]">{lead.notes}</p>
                                </div>
                            )}
                        </div>
                    )}

                    {/* ACTIVITIES TAB */}
                    {drawerTab === "activities" && (
                        <div className="px-5 py-4">
                            <div className="border border-[var(--border)] rounded-[10px] p-3 mb-4 bg-[var(--surface2)]">
                                <div className="flex gap-1.5 mb-2 flex-wrap">
                                    {ACTIVITY_TYPES.map(t => {
                                        const Icon = t.icon
                                        return (
                                            <button key={t.key} onClick={() => { onActivityTypeChange(t.key); openContactChannel(t.key, lead.phone, lead.email) }}
                                                className="flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-medium border transition-all"
                                                style={activityType === t.key
                                                    ? { background: t.color, color: "#fff", borderColor: t.color }
                                                    : { background: "#fff", color: t.color, borderColor: t.color + "55" }
                                                }>
                                                <Icon size={10} />
                                                {t.label}
                                            </button>
                                        )
                                    })}
                                </div>
                                <textarea
                                    rows={2}
                                    value={activityContent}
                                    onChange={e => onActivityContentChange(e.target.value)}
                                    placeholder="Add a note, call summary, interview feedback..."
                                    className="w-full text-[12px] border border-[var(--border)] rounded-[7px] px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-[var(--accent)] bg-white"
                                />
                                <div className="flex justify-end mt-2">
                                    <button onClick={onAddActivity} disabled={savingActivity || !activityContent.trim()}
                                        className="flex items-center gap-1.5 h-8 px-3 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-[12px] font-semibold rounded-[6px] disabled:opacity-50 transition-colors">
                                        {savingActivity ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                                        Log
                                    </button>
                                </div>
                            </div>

                            <div className="flex flex-col gap-3">
                                {(lead.activities ?? []).length === 0 && (
                                    <p className="text-[12px] text-[var(--text3)] text-center py-4">No activity yet</p>
                                )}
                                {(lead.activities ?? []).map(act => {
                                    const typeConf = ACTIVITY_TYPES.find(t => t.key === act.type) ?? ACTIVITY_TYPES[0]
                                    const Icon = typeConf.icon
                                    return (
                                        <div key={act.id} className="flex gap-3 items-start">
                                            <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                                                style={{ background: typeConf.color + "20", color: typeConf.color }}>
                                                <Icon size={12} />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-[12px] font-semibold text-[var(--text)]">{act.user.name}</span>
                                                    <span className="text-[10px] text-[var(--text3)]">
                                                        {formatDistanceToNow(parseISO(act.createdAt), { addSuffix: true })}
                                                    </span>
                                                </div>
                                                <p className="text-[12px] text-[var(--text2)] mt-0.5">{act.content}</p>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    )}

                    {/* INTERVIEW TAB */}
                    {drawerTab === "interview" && (
                        <div className="px-5 py-4 flex flex-col gap-4">
                            <p className="text-[11px] font-semibold text-[var(--text3)] uppercase tracking-wider">Interview Details</p>
                            <Field label="Interviewer Name / ID">
                                <input
                                    value={interviewForm.interviewerId}
                                    onChange={e => setInterviewForm(p => ({ ...p, interviewerId: e.target.value }))}
                                    placeholder="Who will conduct the interview"
                                    className={inputCls}
                                />
                            </Field>
                            <Field label="Feedback">
                                <textarea
                                    rows={4}
                                    value={interviewForm.interviewFeedback}
                                    onChange={e => setInterviewForm(p => ({ ...p, interviewFeedback: e.target.value }))}
                                    placeholder="Interview notes and observations..."
                                    className={`${inputCls} !h-auto resize-none`}
                                />
                            </Field>
                            <Field label="Result">
                                <div className="flex gap-2">
                                    {["PASS", "FAIL", "HOLD"].map(r => (
                                        <button key={r} type="button"
                                            onClick={() => setInterviewForm(p => ({ ...p, interviewResult: r }))}
                                            className={`flex-1 h-9 rounded-[7px] text-[13px] font-semibold border transition-all ${
                                                interviewForm.interviewResult === r
                                                    ? r === "PASS" ? "bg-green-500 text-white border-green-500"
                                                    : r === "FAIL" ? "bg-red-500 text-white border-red-500"
                                                    : "bg-amber-500 text-white border-amber-500"
                                                    : "bg-white text-[var(--text2)] border-[var(--border)] hover:bg-[var(--surface2)]"
                                            }`}>
                                            {r}
                                        </button>
                                    ))}
                                </div>
                            </Field>
                            {lead.interviewDate && (
                                <div className="p-3 bg-[var(--surface2)] rounded-[8px] text-[12px] text-[var(--text2)]">
                                    <span className="font-semibold text-[var(--text3)]">Scheduled: </span>
                                    {fmt(lead.interviewDate)}{lead.interviewMode ? ` · ${lead.interviewMode}` : ""}
                                </div>
                            )}
                            <button onClick={saveInterviewDetails} disabled={savingInterview}
                                className="flex items-center justify-center gap-2 h-9 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-[13px] font-semibold rounded-[7px] transition-colors disabled:opacity-60">
                                {savingInterview ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                                Save Interview Details
                            </button>
                        </div>
                    )}

                    {/* DOCUMENTS TAB */}
                    {drawerTab === "documents" && (
                        <div className="px-5 py-4">
                            <div className="flex items-center justify-between mb-4">
                                <p className="text-[11px] font-semibold text-[var(--text3)] uppercase tracking-wider">Documents</p>
                                <button onClick={() => setShowDocForm(v => !v)}
                                    className="flex items-center gap-1 h-7 px-2.5 text-[12px] font-medium text-[var(--accent)] border border-[var(--accent)] rounded-[6px] hover:bg-[var(--accent-light)] transition-colors">
                                    <Plus size={12} />
                                    Add Document
                                </button>
                            </div>

                            {showDocForm && (
                                <form onSubmit={addDocument} className="border border-[var(--border)] rounded-[10px] p-4 mb-4 flex flex-col gap-3 bg-[var(--surface2)]">
                                    <Field label="Document Type">
                                        <select value={docForm.docType} onChange={e => setDocForm(p => ({ ...p, docType: e.target.value }))} className={inputCls}>
                                            {DOC_TYPES.map(d => <option key={d} value={d}>{d}</option>)}
                                        </select>
                                    </Field>
                                    <Field label="File Name">
                                        <input required value={docForm.fileName} onChange={e => setDocForm(p => ({ ...p, fileName: e.target.value }))}
                                            placeholder="e.g. resume_john.pdf" className={inputCls} />
                                    </Field>
                                    <Field label="URL / Link">
                                        <input required value={docForm.url} onChange={e => setDocForm(p => ({ ...p, url: e.target.value }))}
                                            placeholder="https://..." className={inputCls} />
                                    </Field>
                                    <div className="flex gap-2 justify-end">
                                        <button type="button" onClick={() => setShowDocForm(false)}
                                            className="h-8 px-3 text-[12px] text-[var(--text2)] border border-[var(--border)] rounded-[6px] hover:bg-white transition-colors">
                                            Cancel
                                        </button>
                                        <button type="submit" disabled={savingDoc}
                                            className="h-8 px-3 text-[12px] font-semibold bg-[var(--accent)] text-white rounded-[6px] flex items-center gap-1 disabled:opacity-60">
                                            {savingDoc && <Loader2 size={12} className="animate-spin" />}
                                            Save
                                        </button>
                                    </div>
                                </form>
                            )}

                            <div className="flex flex-col gap-2">
                                {(lead.documents ?? []).length === 0 && !showDocForm && (
                                    <p className="text-[12px] text-[var(--text3)] text-center py-8">No documents uploaded</p>
                                )}
                                {(lead.documents ?? []).map(doc => (
                                    <div key={doc.id} className="border border-[var(--border)] rounded-[10px] p-3 flex items-center gap-3 bg-white">
                                        <FileText size={16} className="text-[var(--text3)] shrink-0" />
                                        <div className="flex-1 min-w-0">
                                            <p className="text-[13px] font-medium text-[var(--text)] truncate">{doc.fileName}</p>
                                            <div className="flex items-center gap-2 mt-0.5">
                                                <span className="text-[10px] text-[var(--text3)] bg-[var(--surface2)] px-1.5 py-0.5 rounded-full">{doc.docType}</span>
                                                {verifiedBadge(doc.verified)}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0">
                                            <select
                                                value={doc.verified}
                                                onChange={e => updateDocVerification(doc.id, e.target.value)}
                                                className="h-7 px-1.5 text-[11px] border border-[var(--border)] rounded-[5px] bg-white text-[var(--text2)] focus:outline-none"
                                                onClick={e => e.stopPropagation()}
                                            >
                                                <option value="PENDING">Pending</option>
                                                <option value="APPROVED">Approved</option>
                                                <option value="REJECTED">Rejected</option>
                                            </select>
                                            <button 
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    onView(doc.url, doc.fileName)
                                                }}
                                                className="text-[12px] text-[var(--accent)] hover:underline"
                                            >
                                                View
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* FOLLOW-UPS TAB */}
                    {drawerTab === "followups" && (
                        <div className="px-5 py-4">
                            <div className="flex items-center justify-between mb-4">
                                <p className="text-[11px] font-semibold text-[var(--text3)] uppercase tracking-wider">Follow-ups</p>
                                <button onClick={() => setShowFollowUpForm(v => !v)}
                                    className="flex items-center gap-1 h-7 px-2.5 text-[12px] font-medium text-[var(--accent)] border border-[var(--accent)] rounded-[6px] hover:bg-[var(--accent-light)] transition-colors">
                                    <Plus size={12} />
                                    Add Follow-up
                                </button>
                            </div>

                            {showFollowUpForm && (
                                <form onSubmit={addFollowUp} className="border border-[var(--border)] rounded-[10px] p-4 mb-4 flex flex-col gap-3 bg-[var(--surface2)]">
                                    <Field label="Type">
                                        <select value={followUpForm.type} onChange={e => setFollowUpForm(p => ({ ...p, type: e.target.value }))} className={inputCls}>
                                            {FOLLOWUP_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                                        </select>
                                    </Field>
                                    <Field label="Scheduled At *">
                                        <input required type="datetime-local" value={followUpForm.scheduledAt}
                                            onChange={e => setFollowUpForm(p => ({ ...p, scheduledAt: e.target.value }))}
                                            className={inputCls} />
                                    </Field>
                                    <Field label="Note">
                                        <input value={followUpForm.note} onChange={e => setFollowUpForm(p => ({ ...p, note: e.target.value }))}
                                            placeholder="Optional note..." className={inputCls} />
                                    </Field>
                                    <div className="flex gap-2 justify-end">
                                        <button type="button" onClick={() => setShowFollowUpForm(false)}
                                            className="h-8 px-3 text-[12px] text-[var(--text2)] border border-[var(--border)] rounded-[6px] hover:bg-white transition-colors">
                                            Cancel
                                        </button>
                                        <button type="submit" disabled={savingFollowUp}
                                            className="h-8 px-3 text-[12px] font-semibold bg-[var(--accent)] text-white rounded-[6px] flex items-center gap-1 disabled:opacity-60">
                                            {savingFollowUp && <Loader2 size={12} className="animate-spin" />}
                                            Schedule
                                        </button>
                                    </div>
                                </form>
                            )}

                            <div className="flex flex-col gap-2">
                                {(lead.followUps ?? []).length === 0 && !showFollowUpForm && (
                                    <p className="text-[12px] text-[var(--text3)] text-center py-8">No follow-ups scheduled</p>
                                )}
                                {(lead.followUps ?? []).map(fu => {
                                    const statusColors: Record<string, string> = { PENDING: "#f59e0b", DONE: "#1a9e6e", SNOOZED: "#6b7280" }
                                    return (
                                        <div key={fu.id} className="border border-[var(--border)] rounded-[10px] p-3 bg-white">
                                            <div className="flex items-center justify-between mb-1">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-[12px] font-semibold text-[var(--text)]">{fu.type}</span>
                                                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full border"
                                                        style={{ color: statusColors[fu.status] ?? "#6b7280", borderColor: statusColors[fu.status] ?? "#6b7280", background: (statusColors[fu.status] ?? "#6b7280") + "15" }}>
                                                        {fu.status}
                                                    </span>
                                                </div>
                                                {fu.status === "PENDING" && (
                                                    <div className="flex items-center gap-1">
                                                        <button onClick={() => updateFollowUpStatus(fu.id, "DONE")}
                                                            className="h-6 px-2 text-[11px] bg-green-500 text-white rounded-[5px] hover:bg-green-600 transition-colors flex items-center gap-1">
                                                            <CheckCircle size={10} /> Done
                                                        </button>
                                                        <button onClick={() => updateFollowUpStatus(fu.id, "SNOOZED")}
                                                            className="h-6 px-2 text-[11px] bg-[var(--surface2)] text-[var(--text2)] border border-[var(--border)] rounded-[5px] hover:bg-[var(--border)] transition-colors">
                                                            Snooze
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                            <p className="text-[11px] text-[var(--text3)]">
                                                <Clock size={10} className="inline mr-1" />
                                                {fmt(fu.scheduledAt)}
                                            </p>
                                            {fu.note && <p className="text-[12px] text-[var(--text2)] mt-1">{fu.note}</p>}
                                            <p className="text-[10px] text-[var(--text3)] mt-1">by {fu.creator.name}</p>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

function InfoRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
    return (
        <div className="flex flex-col gap-0.5">
            <span className="text-[10px] text-[var(--text3)] uppercase tracking-wide font-medium">{label}</span>
            <div className="flex items-center gap-1.5 text-[12px] text-[var(--text)]">
                <Icon size={11} className="text-[var(--text3)] shrink-0" />
                <span className="truncate">{value}</span>
            </div>
        </div>
    )
}

// ─── Convert to Employee Modal ────────────────────────────────────────────────
type ConvertForm = {
    firstName: string; middleName: string; lastName: string
    email: string; phone: string; alternatePhone: string
    dateOfBirth: string; gender: string
    aadharNumber: string; panNumber: string
    address: string; city: string; state: string; pincode: string
    permanentAddress: string; permanentCity: string; permanentState: string; permanentPincode: string
    designation: string; departmentId: string; siteId: string; managerId: string
    dateOfJoining: string; employmentType: string; salaryType: string; basicSalary: string
    deployRole: string; deployShift: string; deployStartDate: string
    notes: string
    da: string; washing: string; conveyance: string; leaveWithWages: string
    otherAllowance: string; otRatePerHour: string; canteenRatePerDay: string
    complianceType: string
    bankName: string; bankIFSC: string; bankAccountNumber: string; bankBranch: string
    nameAsPerAadhar: string; fathersName: string; bloodGroup: string
    maritalStatus: string; nationality: string; religion: string; caste: string
    uan: string; pfNumber: string; esiNumber: string; labourCardNo: string
    emergencyContact1Name: string; emergencyContact1Phone: string
    emergencyContact2Name: string; emergencyContact2Phone: string
    safetyGoggles: boolean; safetyGloves: boolean; safetyHelmet: boolean
    safetyMask: boolean; safetyJacket: boolean; safetyEarMuffs: boolean; safetyShoes: boolean
}

function ConvertModal({ lead, onClose, onConverted }: {
    lead: Lead
    onClose: () => void
    onConverted: (employeeId: string, employeeCode: string) => void
}) {
    const [sites, setSites] = useState<SiteOption[]>([])
    const [departments, setDepartments] = useState<DeptOption[]>([])
    const [submitting, setSubmitting] = useState(false)
    const [activeTab, setActiveTab] = useState<"personal" | "employment" | "salary" | "bank" | "compliance" | "safety" | "docs">("personal")
    const [sameAsCurrent, setSameAsCurrent] = useState(false)
    const [pendingDocs, setPendingDocs] = useState<{ type: string; fileName: string; fileUrl: string }[]>([])
    const [docUploading, setDocUploading] = useState(false)
    const [docType, setDocType] = useState("AADHAAR")
    const [previewUrl, setPreviewUrl] = useState<string | null>(null)
    const [previewName, setPreviewName] = useState("")

    const nameParts = lead.candidateName.trim().split(/\s+/)
    const [form, setForm] = useState<ConvertForm>({
        firstName: nameParts[0] || "",
        middleName: "",
        lastName: nameParts.slice(1).join(" ") || "",
        email: lead.email || "",
        phone: lead.phone || "",
        alternatePhone: "",
        dateOfBirth: "",
        gender: lead.gender || "",
        aadharNumber: "",
        panNumber: "",
        address: lead.locality || "",
        city: lead.city || "",
        state: "",
        pincode: "",
        permanentAddress: "",
        permanentCity: "",
        permanentState: "",
        permanentPincode: "",
        designation: lead.position || "",
        departmentId: "",
        siteId: "",
        managerId: "",
        dateOfJoining: new Date().toISOString().slice(0, 10),
        employmentType: "Full-time",
        salaryType: "Monthly",
        basicSalary: lead.expectedSalary?.toString() ?? "",
        deployRole: lead.position || "",
        deployShift: "",
        deployStartDate: "",
        notes: "",
        da: "", washing: "", conveyance: "", leaveWithWages: "",
        otherAllowance: "", otRatePerHour: "170", canteenRatePerDay: "55",
        complianceType: "OR",
        bankName: "", bankIFSC: "", bankAccountNumber: "", bankBranch: "",
        nameAsPerAadhar: lead.candidateName || "",
        fathersName: "", bloodGroup: "", maritalStatus: "",
        nationality: "Indian", religion: "", caste: "",
        uan: "", pfNumber: "", esiNumber: "", labourCardNo: "",
        emergencyContact1Name: "", emergencyContact1Phone: "",
        emergencyContact2Name: "", emergencyContact2Phone: "",
        safetyGoggles: false, safetyGloves: false, safetyHelmet: false,
        safetyMask: false, safetyJacket: false, safetyEarMuffs: false, safetyShoes: false,
    })

    useEffect(() => {
        fetch("/api/sites").then(r => r.json()).then(d => {
            const arr = Array.isArray(d) ? d : (Array.isArray(d?.sites) ? d.sites : [])
            setSites(arr.map((s: any) => ({ id: s.id, name: s.name })))
        }).catch(() => {})
        fetch("/api/departments").then(r => r.json()).then(d => {
            const arr = Array.isArray(d) ? d : (Array.isArray(d?.departments) ? d.departments : [])
            setDepartments(arr.map((dep: any) => ({ id: dep.id, name: dep.name })))
        }).catch(() => {})
    }, [])

    const set = (k: keyof ConvertForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
        setForm(p => ({ ...p, [k]: e.target.value }))
    const setCheck = (k: keyof ConvertForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
        setForm(p => ({ ...p, [k]: e.target.checked }))

    const iCls = "w-full h-9 rounded-[8px] border border-[var(--border)] bg-[var(--surface2)] px-3 text-[13px] text-[var(--text)] outline-none focus:border-[var(--accent)] transition-colors placeholder:text-[var(--text3)]"
    const errCls = (bad: boolean) => iCls + (bad ? " !border-red-400" : "")
    const lCls = "block text-[12px] text-[var(--text2)] mb-1"
    const tabCls = (t: string) => `px-3 py-2.5 text-[12px] font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${activeTab === t ? "border-[var(--accent)] text-[var(--accent)]" : "border-transparent text-[var(--text3)] hover:text-[var(--text)]"}`

    // Validation
    const cDigits = (v: string) => (v || "").replace(/\D/g, "")
    const cPhoneOk  = (v: string) => !v || cDigits(v).length === 10
    const cAadharOk = (v: string) => !v || cDigits(v).length === 12
    const cPANOk    = (v: string) => !v || /^[A-Za-z]{5}[0-9]{4}[A-Za-z]$/.test(v.trim())
    const cErrors = {
        phone:  !cPhoneOk(form.phone),
        alternatePhone: !cPhoneOk((form as any).alternatePhone),
        aadharNumber: !cAadharOk((form as any).aadharNumber),
        panNumber: !cPANOk((form as any).panNumber),
        ec1Phone: !cPhoneOk((form as any).emergencyContact1Phone),
        ec2Phone: !cPhoneOk((form as any).emergencyContact2Phone),
    }
    const cHasErrors = Object.values(cErrors).some(Boolean)

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        if (!form.firstName.trim()) { toast.error("First name is required"); return }
        if (cHasErrors) { toast.error("Please fix validation errors before saving"); return }
        setSubmitting(true)
        try {
            const res = await fetch(`/api/recruitment/${lead.id}/convert`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(form),
            })
            const data = await res.json()
            if (!res.ok) { toast.error(data.error || "Conversion failed"); return }
            if (data.alreadyConverted) { toast.info("Already converted"); onConverted(data.employeeId, "existing"); return }
            // Upload pending docs to the newly created employee
            if (pendingDocs.length > 0) {
                for (const doc of pendingDocs) {
                    try {
                        await fetch(`/api/employees/${data.employeeId}/documents`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify(doc),
                        })
                    } catch { /* silent */ }
                }
            }
            onConverted(data.employeeId, data.employeeCode)
        } catch {
            toast.error("Network error")
        } finally { setSubmitting(false) }
    }

    return (
        <>
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-[var(--surface)] rounded-[18px] shadow-2xl w-full max-w-2xl max-h-[92vh] overflow-hidden flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)] shrink-0">
                    <div>
                        <h2 className="text-[16px] font-bold text-[var(--text)]">Convert to Employee</h2>
                        <p className="text-[12px] text-[var(--text3)] mt-0.5">{lead.candidateName} · {lead.phone}</p>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-[7px] hover:bg-[var(--surface2)] text-[var(--text3)]"><X size={18} /></button>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-[var(--border)] px-6 overflow-x-auto shrink-0">
                    {(["personal", "employment", "salary", "bank", "compliance", "safety", "docs"] as const).map(t => (
                        <button key={t} type="button" onClick={() => setActiveTab(t)} className={tabCls(t)}>
                            {t === "personal" ? "Personal" : t === "employment" ? "Employment" : t === "salary" ? "Salary" : t === "bank" ? "Bank" : t === "compliance" ? "Compliance" : t === "safety" ? "Safety" : `Docs${pendingDocs.length ? ` (${pendingDocs.length})` : ""}`}
                        </button>
                    ))}
                </div>

                <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-4">

                    {/* ── Personal ── */}
                    {activeTab === "personal" && (
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-3">
                                <div><label className={lCls}>First Name *</label><input required value={form.firstName} onChange={set("firstName")} className={iCls} placeholder="First name" /></div>
                                <div><label className={lCls}>Middle Name</label><input value={form.middleName} onChange={set("middleName")} className={iCls} placeholder="Middle name" /></div>
                                <div><label className={lCls}>Last Name</label><input value={form.lastName} onChange={set("lastName")} className={iCls} placeholder="Last name" /></div>
                                <div><label className={lCls}>Father&apos;s Name</label><input value={form.fathersName} onChange={set("fathersName")} className={iCls} placeholder="Father's full name" /></div>
                                <div>
                                    <label className={lCls}>Phone</label>
                                    <input value={form.phone} onChange={set("phone")} maxLength={10} className={errCls(cErrors.phone)} placeholder="10-digit mobile number" />
                                    {cErrors.phone && <p className="text-[11px] text-red-500 mt-0.5">⚠ Must be 10 digits</p>}
                                </div>
                                <div><label className={lCls}>Email</label><input type="email" value={form.email} onChange={set("email")} className={iCls} placeholder="Email address" /></div>
                                <div>
                                    <label className={lCls}>Alternate Phone</label>
                                    <input value={form.alternatePhone} onChange={set("alternatePhone")} maxLength={10} className={errCls(cErrors.alternatePhone)} placeholder="10-digit (optional)" />
                                    {cErrors.alternatePhone && <p className="text-[11px] text-red-500 mt-0.5">⚠ Must be 10 digits</p>}
                                </div>
                                <div><label className={lCls}>Date of Birth</label><input type="date" value={form.dateOfBirth} onChange={set("dateOfBirth")} className={iCls} /></div>
                                <div>
                                    <label className={lCls}>Gender</label>
                                    <select value={form.gender} onChange={set("gender")} className={iCls}>
                                        <option value="">Select</option>
                                        <option value="MALE">Male</option>
                                        <option value="FEMALE">Female</option>
                                        <option value="OTHER">Other</option>
                                    </select>
                                </div>
                                <div>
                                    <label className={lCls}>Aadhar Number</label>
                                    <input value={form.aadharNumber} onChange={set("aadharNumber")} maxLength={12} className={errCls(cErrors.aadharNumber)} placeholder="12-digit Aadhar number" />
                                    {cErrors.aadharNumber && <p className="text-[11px] text-red-500 mt-0.5">⚠ Aadhar must be 12 digits</p>}
                                </div>
                                <div>
                                    <label className={lCls}>PAN Number</label>
                                    <input value={form.panNumber} onChange={e => setForm(p => ({ ...p, panNumber: e.target.value.toUpperCase() }))} maxLength={10} className={errCls(cErrors.panNumber)} placeholder="AAAAA9999A" />
                                    {cErrors.panNumber && <p className="text-[11px] text-red-500 mt-0.5">⚠ PAN format: AAAAA9999A (10 chars)</p>}
                                </div>
                            </div>
                            <p className="text-[11px] font-semibold text-[var(--text3)] tracking-[0.5px] uppercase">Current Address</p>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="col-span-2"><label className={lCls}>Address</label><input value={form.address} onChange={set("address")} className={iCls} placeholder="Street address" /></div>
                                <div><label className={lCls}>City</label><input value={form.city} onChange={set("city")} className={iCls} placeholder="City" /></div>
                                <div><label className={lCls}>State</label><input value={form.state} onChange={set("state")} className={iCls} placeholder="State" /></div>
                                <div><label className={lCls}>Pincode</label><input value={form.pincode} onChange={set("pincode")} className={iCls} placeholder="Pincode" /></div>
                            </div>
                            <p className="text-[11px] font-semibold text-[var(--text3)] tracking-[0.5px] uppercase">Permanent Address</p>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="col-span-2 flex items-center gap-2">
                                    <input type="checkbox" id="cvtSameAddr" checked={sameAsCurrent} onChange={e => {
                                        if (e.target.checked) setForm(f => ({ ...f, permanentAddress: f.address, permanentCity: f.city, permanentState: f.state, permanentPincode: f.pincode }))
                                        setSameAsCurrent(e.target.checked)
                                    }} className="w-4 h-4" />
                                    <label htmlFor="cvtSameAddr" className="text-sm text-[var(--text2)] cursor-pointer">Same as current address</label>
                                </div>
                                <div className="col-span-2"><label className={lCls}>Address</label><input value={form.permanentAddress} onChange={set("permanentAddress")} className={iCls} placeholder="Street address" disabled={sameAsCurrent} /></div>
                                <div><label className={lCls}>City</label><input value={form.permanentCity} onChange={set("permanentCity")} className={iCls} placeholder="City" disabled={sameAsCurrent} /></div>
                                <div><label className={lCls}>State</label><input value={form.permanentState} onChange={set("permanentState")} className={iCls} placeholder="State" disabled={sameAsCurrent} /></div>
                                <div><label className={lCls}>Pincode</label><input value={form.permanentPincode} onChange={set("permanentPincode")} className={iCls} placeholder="Pincode" disabled={sameAsCurrent} /></div>
                            </div>
                        </div>
                    )}

                    {/* ── Employment ── */}
                    {activeTab === "employment" && (
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-3">
                                <div><label className={lCls}>Designation</label><input value={form.designation} onChange={set("designation")} className={iCls} placeholder="e.g. Security Guard" /></div>
                                <div>
                                    <label className={lCls}>Department</label>
                                    <select value={form.departmentId} onChange={set("departmentId")} className={iCls}>
                                        <option value="">No Department</option>
                                        {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                                    </select>
                                </div>
                                <div><label className={lCls}>Date of Joining</label><input type="date" value={form.dateOfJoining} onChange={set("dateOfJoining")} className={iCls} /></div>
                                <div>
                                    <label className={lCls}>Employment Type</label>
                                    <select value={form.employmentType} onChange={set("employmentType")} className={iCls}>
                                        <option>Full-time</option><option>Part-time</option><option>Contract</option><option>Daily Wage</option>
                                    </select>
                                </div>
                                <div>
                                    <label className={lCls}>Salary Type</label>
                                    <select value={form.salaryType} onChange={set("salaryType")} className={iCls}>
                                        <option>Monthly</option><option>Daily</option><option>Hourly</option>
                                    </select>
                                </div>
                                <div><label className={lCls}>Basic Salary (₹)</label><input type="number" min="0" value={form.basicSalary} onChange={set("basicSalary")} className={iCls} placeholder="e.g. 12000" /></div>
                            </div>
                            <div className="border border-[var(--accent)]/30 bg-[var(--accent-light)]/30 rounded-[10px] p-4">
                                <div className="flex items-center gap-2 mb-3">
                                    <MapPin size={14} className="text-[var(--accent)]" />
                                    <span className="text-[13px] font-semibold text-[var(--accent)]">Site Assignment</span>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="col-span-2">
                                        <label className={lCls}>Select Site</label>
                                        <select value={form.siteId} onChange={set("siteId")} className={iCls}>
                                            <option value="">-- No Site (Assign Later) --</option>
                                            {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                        </select>
                                    </div>
                                    {form.siteId && (<>
                                        <div><label className={lCls}>Deployment Role</label><input value={form.deployRole} onChange={set("deployRole")} className={iCls} placeholder="e.g. Security Guard" /></div>
                                        <div>
                                            <label className={lCls}>Shift</label>
                                            <select value={form.deployShift} onChange={set("deployShift")} className={iCls}>
                                                <option value="">Select Shift</option>
                                                <option>Morning</option><option>Evening</option><option>Night</option><option>Rotating</option>
                                            </select>
                                        </div>
                                        <div><label className={lCls}>Deployment Start Date</label><input type="date" value={form.deployStartDate || new Date().toISOString().split("T")[0]} onChange={set("deployStartDate")} className={iCls} /></div>
                                    </>)}
                                </div>
                            </div>
                            <div>
                                <label className={lCls}>Notes</label>
                                <textarea value={form.notes} onChange={set("notes")} className="w-full rounded-[8px] border border-[var(--border)] bg-[var(--surface2)] px-3 py-2 text-[13px] text-[var(--text)] outline-none focus:border-[var(--accent)] resize-none placeholder:text-[var(--text3)]" rows={3} placeholder="Additional notes..." />
                            </div>
                        </div>
                    )}

                    {/* ── Salary ── */}
                    {activeTab === "salary" && (
                        <div className="space-y-4">
                            <div className="flex items-start gap-2 bg-blue-50 border border-blue-100 rounded-[8px] px-3 py-2.5">
                                <span className="text-[12px] text-blue-700">Set the detailed salary structure for payroll calculation.</span>
                            </div>
                            <div>
                                <label className={lCls}>Compliance Type</label>
                                <div className="flex gap-4 mt-1">
                                    <label className="flex items-center gap-2 cursor-pointer text-[13px] text-[var(--text2)]">
                                        <input type="radio" name="cvtCompliance" value="OR" checked={form.complianceType === "OR"} onChange={() => setForm(f => ({ ...f, complianceType: "OR" }))} className="accent-[var(--accent)]" />
                                        <span><strong>OR</strong> — PF + ESIC apply (full-time)</span>
                                    </label>
                                    <label className="flex items-center gap-2 cursor-pointer text-[13px] text-[var(--text2)]">
                                        <input type="radio" name="cvtCompliance" value="CALL" checked={form.complianceType === "CALL"} onChange={() => setForm(f => ({ ...f, complianceType: "CALL" }))} className="accent-orange-500" />
                                        <span><strong>CALL</strong> — No PF / ESIC (contract)</span>
                                    </label>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div><label className={lCls}>Basic Salary (₹)</label><input type="number" value={form.basicSalary} onChange={set("basicSalary")} className={iCls} placeholder="0" min="0" /></div>
                                {form.complianceType !== "CALL" && (<>
                                    <div><label className={lCls}>DA — Dearness Allowance (₹)</label><input type="number" value={form.da} onChange={set("da")} className={iCls} placeholder="0" min="0" /></div>
                                    <div><label className={lCls}>Washing Allowance (₹)</label><input type="number" value={form.washing} onChange={set("washing")} className={iCls} placeholder="0" min="0" /></div>
                                    <div><label className={lCls}>Conveyance Allowance (₹)</label><input type="number" value={form.conveyance} onChange={set("conveyance")} className={iCls} placeholder="0" min="0" /></div>
                                    <div><label className={lCls}>Leave With Wages (₹)</label><input type="number" value={form.leaveWithWages} onChange={set("leaveWithWages")} className={iCls} placeholder="0" min="0" /></div>
                                    <div><label className={lCls}>Other Allowance (₹)</label><input type="number" value={form.otherAllowance} onChange={set("otherAllowance")} className={iCls} placeholder="0" min="0" /></div>
                                    <div><label className={lCls}>OT Rate (₹/hr)</label><input type="number" value={form.otRatePerHour} onChange={set("otRatePerHour")} className={iCls} placeholder="170" min="0" /></div>
                                    <div><label className={lCls}>Canteen (₹/day)</label><input type="number" value={form.canteenRatePerDay} onChange={set("canteenRatePerDay")} className={iCls} placeholder="55" min="0" /></div>
                                </>)}
                            </div>
                        </div>
                    )}

                    {/* ── Bank ── */}
                    {activeTab === "bank" && (
                        <div className="space-y-4">
                            <p className="text-[11px] font-semibold text-[var(--text3)] tracking-[0.5px] uppercase">Bank Details</p>
                            <div className="grid grid-cols-2 gap-3">
                                <div><label className={lCls}>Bank Name</label><input value={form.bankName} onChange={set("bankName")} className={iCls} placeholder="Bank name" /></div>
                                <div><label className={lCls}>IFSC Code</label><input value={form.bankIFSC} onChange={set("bankIFSC")} className={iCls} placeholder="IFSC code" /></div>
                                <div className="col-span-2"><label className={lCls}>Account Number</label><input value={form.bankAccountNumber} onChange={set("bankAccountNumber")} className={iCls} placeholder="Account number" /></div>
                                <div><label className={lCls}>Branch</label><input value={form.bankBranch} onChange={set("bankBranch")} className={iCls} placeholder="Bank branch" /></div>
                            </div>
                        </div>
                    )}

                    {/* ── Compliance ── */}
                    {activeTab === "compliance" && (
                        <div className="space-y-4">
                            <p className="text-[11px] font-semibold text-[var(--text3)] tracking-[0.5px] uppercase">Identity</p>
                            <div className="grid grid-cols-2 gap-3">
                                <div><label className={lCls}>Name as per Aadhar</label><input value={form.nameAsPerAadhar} onChange={set("nameAsPerAadhar")} className={iCls} placeholder="As on Aadhar card" /></div>
                                <div>
                                    <label className={lCls}>Blood Group</label>
                                    <select value={form.bloodGroup} onChange={set("bloodGroup")} className={iCls}>
                                        <option value="">Select</option>
                                        {["A+","A-","B+","B-","AB+","AB-","O+","O-"].map(g => <option key={g} value={g}>{g}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className={lCls}>Marital Status</label>
                                    <select value={form.maritalStatus} onChange={set("maritalStatus")} className={iCls}>
                                        <option value="">Select</option>
                                        <option>Single</option><option>Married</option><option>Divorced</option><option>Widowed</option>
                                    </select>
                                </div>
                                <div><label className={lCls}>Nationality</label><input value={form.nationality} onChange={set("nationality")} className={iCls} placeholder="Nationality" /></div>
                                <div><label className={lCls}>Religion</label><input value={form.religion} onChange={set("religion")} className={iCls} placeholder="Religion" /></div>
                                <div><label className={lCls}>Caste</label><input value={form.caste} onChange={set("caste")} className={iCls} placeholder="Caste category" /></div>
                            </div>
                            <p className="text-[11px] font-semibold text-[var(--text3)] tracking-[0.5px] uppercase mt-2">Statutory Numbers</p>
                            <div className="grid grid-cols-2 gap-3">
                                <div><label className={lCls}>UAN (PF)</label><input value={form.uan} onChange={set("uan")} className={iCls} placeholder="Universal Account Number" /></div>
                                <div><label className={lCls}>PF Number</label><input value={form.pfNumber} onChange={set("pfNumber")} className={iCls} placeholder="PF number" /></div>
                                <div><label className={lCls}>ESIC Number</label><input value={form.esiNumber} onChange={set("esiNumber")} className={iCls} placeholder="ESIC number" /></div>
                                <div><label className={lCls}>Labour Card No.</label><input value={form.labourCardNo} onChange={set("labourCardNo")} className={iCls} placeholder="Labour card number" /></div>
                            </div>
                            <p className="text-[11px] font-semibold text-[var(--text3)] tracking-[0.5px] uppercase mt-2">Emergency Contacts</p>
                            <div className="grid grid-cols-2 gap-3">
                                <div><label className={lCls}>EC1 Name</label><input value={form.emergencyContact1Name} onChange={set("emergencyContact1Name")} className={iCls} placeholder="Contact person name" /></div>
                                <div>
                                    <label className={lCls}>EC1 Phone</label>
                                    <input value={form.emergencyContact1Phone} onChange={set("emergencyContact1Phone")} maxLength={10} className={errCls(cErrors.ec1Phone)} placeholder="10-digit number" />
                                    {cErrors.ec1Phone && <p className="text-[11px] text-red-500 mt-0.5">⚠ Must be 10 digits</p>}
                                </div>
                                <div><label className={lCls}>EC2 Name</label><input value={form.emergencyContact2Name} onChange={set("emergencyContact2Name")} className={iCls} placeholder="Contact person name" /></div>
                                <div>
                                    <label className={lCls}>EC2 Phone</label>
                                    <input value={form.emergencyContact2Phone} onChange={set("emergencyContact2Phone")} maxLength={10} className={errCls(cErrors.ec2Phone)} placeholder="10-digit number" />
                                    {cErrors.ec2Phone && <p className="text-[11px] text-red-500 mt-0.5">⚠ Must be 10 digits</p>}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ── Safety ── */}
                    {activeTab === "safety" && (
                        <div className="space-y-3">
                            <p className="text-[11px] font-semibold text-[var(--text3)] tracking-[0.5px] uppercase">Safety Equipment Issued</p>
                            {([
                                { key: "safetyGoggles", label: "Safety Goggles" },
                                { key: "safetyGloves",  label: "Hand Gloves" },
                                { key: "safetyHelmet",  label: "Helmet" },
                                { key: "safetyMask",    label: "Mask" },
                                { key: "safetyJacket",  label: "Safety Jacket" },
                                { key: "safetyEarMuffs",label: "Ear Muffs" },
                                { key: "safetyShoes",   label: "Safety Shoes" },
                            ] as { key: keyof ConvertForm; label: string }[]).map(item => (
                                <div key={item.key} className="flex items-center gap-3 p-3 rounded-[8px] border border-[var(--border)] bg-[var(--surface2)]/30">
                                    <input type="checkbox" id={`cvt_${item.key}`} checked={!!form[item.key]} onChange={setCheck(item.key)} className="w-4 h-4 accent-[var(--accent)]" />
                                    <label htmlFor={`cvt_${item.key}`} className="text-[13px] text-[var(--text)] cursor-pointer select-none flex-1">{item.label}</label>
                                    {form[item.key] && <span className="text-[11px] text-[#16a34a] font-medium">Issued</span>}
                                </div>
                            ))}
                        </div>
                    )}

                    {/* ── Docs ── */}
                    {activeTab === "docs" && (() => {
                        const CVT_DOC_TYPES = [
                            { key: "AADHAAR",      label: "Aadhaar Card" },
                            { key: "PAN",          label: "PAN Card" },
                            { key: "PHOTO",        label: "Photo" },
                            { key: "BANK_DETAILS", label: "Bank Details" },
                            { key: "CERTIFICATE",  label: "Certificate" },
                            { key: "RESUME",       label: "Resume" },
                            { key: "OFFER_LETTER", label: "Offer Letter" },
                            { key: "OTHER",        label: "Other" },
                        ]
                        const pendingByType: Record<string, { type: string; fileName: string; fileUrl: string }> = {}
                        pendingDocs.forEach(d => { if (!pendingByType[d.type]) pendingByType[d.type] = d })
                        return (
                            <div className="border border-[var(--border)] rounded-[10px] overflow-hidden">
                                <table className="w-full text-[12px]">
                                    <thead>
                                        <tr className="bg-[var(--surface2)] border-b border-[var(--border)]">
                                            <th className="text-left px-3 py-2 text-[11px] font-semibold text-[var(--text3)] uppercase tracking-wide w-[130px]">Document</th>
                                            <th className="text-left px-3 py-2 text-[11px] font-semibold text-[var(--text3)] uppercase tracking-wide">Status / File</th>
                                            <th className="px-3 py-2 text-[11px] font-semibold text-[var(--text3)] uppercase tracking-wide text-right">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {CVT_DOC_TYPES.map(({ key, label }) => {
                                            const pending = pendingByType[key]
                                            const uploading = docUploading && docType === key
                                            const fileInputId = `cvt-doc-${key}`
                                            return (
                                                <tr key={key} className="border-b border-[var(--border)] last:border-0">
                                                    <td className="px-3 py-2.5 font-medium text-[var(--text)]">{label}</td>
                                                    <td className="px-3 py-2.5">
                                                        {pending ? (
                                                            <div className="flex items-center gap-2">
                                                                <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                                                                <span className="truncate max-w-[160px] text-[var(--text)]">{pending.fileName}</span>
                                                                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 shrink-0">Queued</span>
                                                            </div>
                                                        ) : (
                                                            <div className="flex items-center gap-2">
                                                                <span className="w-2 h-2 rounded-full bg-red-400 shrink-0" />
                                                                <span className="text-red-500 text-[11px] font-medium">Not Uploaded</span>
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td className="px-3 py-2.5">
                                                        <div className="flex items-center justify-end gap-1">
                                                            {pending ? (
                                                                <>
                                                                    <button type="button"
                                                                        onClick={() => { setPreviewUrl(pending.fileUrl); setPreviewName(pending.fileName) }}
                                                                        className="inline-flex items-center gap-1 px-2 py-1 rounded-[5px] text-[11px] font-medium bg-blue-50 text-blue-600 hover:bg-blue-100">
                                                                        <Eye size={11} /> View
                                                                    </button>
                                                                    <button type="button"
                                                                        onClick={() => setPendingDocs(prev => prev.filter(d => d.type !== key))}
                                                                        className="inline-flex items-center gap-1 px-2 py-1 rounded-[5px] text-[11px] font-medium bg-red-50 text-red-500 hover:bg-red-100">
                                                                        <X size={11} /> Remove
                                                                    </button>
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <button type="button" disabled={uploading}
                                                                        onClick={() => { setDocType(key); document.getElementById(fileInputId)?.click() }}
                                                                        className="inline-flex items-center gap-1 px-2 py-1 rounded-[5px] text-[11px] font-medium bg-[var(--accent)] text-white hover:opacity-90 disabled:opacity-60">
                                                                        {uploading ? <Loader2 size={11} className="animate-spin" /> : <Upload size={11} />}
                                                                        {uploading ? "Reading…" : "Upload"}
                                                                    </button>
                                                                    <input id={fileInputId} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" className="hidden"
                                                                        onChange={async (ev) => {
                                                                            const file = ev.target.files?.[0]
                                                                            if (!file) return
                                                                            if (file.size > 5 * 1024 * 1024) { toast.error("File too large (max 5MB)"); return }
                                                                            setDocUploading(true)
                                                                            try {
                                                                                const fileUrl = await new Promise<string>((resolve, reject) => {
                                                                                    const reader = new FileReader()
                                                                                    reader.onload = () => resolve(reader.result as string)
                                                                                    reader.onerror = reject
                                                                                    reader.readAsDataURL(file)
                                                                                })
                                                                                setPendingDocs(prev => [...prev.filter(d => d.type !== key), { type: key, fileName: file.name, fileUrl }])
                                                                                toast.success(`${file.name} queued`)
                                                                            } catch { toast.error("Failed to read file") }
                                                                            finally { setDocUploading(false); ev.target.value = "" }
                                                                        }}
                                                                    />
                                                                </>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            )
                                        })}
                                    </tbody>
                                </table>
                                {pendingDocs.length > 0 && (
                                    <div className="px-3 py-2 bg-amber-50 border-t border-amber-200 text-[11px] text-amber-700 font-medium">
                                        {pendingDocs.length} document{pendingDocs.length > 1 ? "s" : ""} queued — will be uploaded after employee is created
                                    </div>
                                )}
                            </div>
                        )
                    })()}

                    <div className="flex gap-2 justify-end pt-2 border-t border-[var(--border)]">
                        <button type="button" onClick={onClose}
                            className="h-9 px-4 text-[13px] font-medium text-[var(--text2)] border border-[var(--border)] rounded-[7px] hover:bg-[var(--surface2)]">
                            Cancel
                        </button>
                        <button type="submit" disabled={submitting}
                            className="h-9 px-5 text-[13px] font-semibold bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white rounded-[7px] flex items-center gap-2 disabled:opacity-60">
                            {submitting ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
                            {submitting ? "Converting…" : "Create Employee"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
        {previewUrl && <DocumentViewer url={previewUrl} fileName={previewName} onClose={() => setPreviewUrl(null)} />}
        </>
    )
}
