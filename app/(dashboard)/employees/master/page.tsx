"use client"
import { useState, useEffect, useCallback, useMemo } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
    Search, Loader2, RefreshCw, FileSpreadsheet, Pencil, X, Save, Trash2, CheckSquare,
    Users, UserCheck, UserX, CalendarOff, UserMinus,
    ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
} from "lucide-react"
import * as XLSX from "xlsx"
import { can } from "@/lib/can"

// ─── Types ────────────────────────────────────────────────────────────────────
type Employee = {
    id: string
    employeeId: string
    firstName: string
    middleName?: string
    lastName: string
    email?: string
    phone: string
    alternatePhone?: string
    dateOfBirth?: string
    gender?: string
    address?: string
    city?: string
    state?: string
    pincode?: string
    permanentAddress?: string
    permanentCity?: string
    permanentState?: string
    permanentPincode?: string
    aadharNumber?: string
    panNumber?: string
    bankAccountNumber?: string
    bankIFSC?: string
    bankName?: string
    bankBranch?: string
    designation?: string
    status: string
    employmentType: string
    salaryType?: string
    basicSalary: number
    dateOfJoining?: string
    dateOfLeaving?: string
    nameAsPerAadhar?: string
    fathersName?: string
    bloodGroup?: string
    maritalStatus?: string
    nationality?: string
    religion?: string
    caste?: string
    uan?: string
    pfNumber?: string
    esiNumber?: string
    labourCardNo?: string
    labourCardExpDate?: string
    contractFrom?: string
    contractPeriodDays?: number
    contractorCode?: string
    workOrderNumber?: string
    workOrderFrom?: string
    workOrderTo?: string
    workSkill?: string
    natureOfWork?: string
    emergencyContact1Name?: string
    emergencyContact1Phone?: string
    emergencyContact2Name?: string
    emergencyContact2Phone?: string
    isBackgroundChecked?: boolean
    backgroundCheckRemark?: string
    isMedicalDone?: boolean
    medicalRemark?: string
    safetyGoggles?: boolean
    safetyGloves?: boolean
    safetyHelmet?: boolean
    safetyMask?: boolean
    safetyJacket?: boolean
    safetyEarMuffs?: boolean
    safetyShoes?: boolean
    notes?: string
    createdAt: string
    branch?: { id: string; name: string }
    department?: { id: string; name: string } | null
    employeeSalary?: { ctcAnnual?: number; basicSalary?: number } | null
    user?: { role: string; customRole?: { name: string } | null } | null
    deployments?: { site: { name: string }; role?: string | null }[]
}

type EditForm = {
    firstName: string; middleName: string; lastName: string
    email: string; phone: string; alternatePhone: string
    dateOfBirth: string; gender: string; bloodGroup: string
    maritalStatus: string; nationality: string; religion: string; caste: string
    fathersName: string; nameAsPerAadhar: string
    address: string; city: string; state: string; pincode: string
    permanentAddress: string; permanentCity: string; permanentState: string; permanentPincode: string
    aadharNumber: string; panNumber: string; uan: string; pfNumber: string; esiNumber: string
    labourCardNo: string; labourCardExpDate: string
    bankAccountNumber: string; bankIFSC: string; bankName: string; bankBranch: string
    designation: string; status: string; employmentType: string; basicSalary: string
    dateOfJoining: string; dateOfLeaving: string; notes: string
    workSkill: string; natureOfWork: string; contractorCode: string
    workOrderNumber: string; workOrderFrom: string; workOrderTo: string
    contractFrom: string; contractPeriodDays: string
    emergencyContact1Name: string; emergencyContact1Phone: string
    emergencyContact2Name: string; emergencyContact2Phone: string
    isBackgroundChecked: boolean; backgroundCheckRemark: string
    isMedicalDone: boolean; medicalRemark: string
    safetyGoggles: boolean; safetyGloves: boolean; safetyHelmet: boolean
    safetyMask: boolean; safetyJacket: boolean; safetyEarMuffs: boolean; safetyShoes: boolean
}

function toDateInput(val?: string | null): string {
    if (!val) return ""
    try { return new Date(val).toISOString().slice(0, 10) } catch { return "" }
}

function empToForm(emp: Employee): EditForm {
    return {
        firstName: emp.firstName || "", middleName: emp.middleName || "", lastName: emp.lastName || "",
        email: emp.email || "", phone: emp.phone || "", alternatePhone: emp.alternatePhone || "",
        dateOfBirth: toDateInput(emp.dateOfBirth), gender: emp.gender || "",
        bloodGroup: emp.bloodGroup || "", maritalStatus: emp.maritalStatus || "",
        nationality: emp.nationality || "", religion: emp.religion || "", caste: emp.caste || "",
        fathersName: emp.fathersName || "", nameAsPerAadhar: emp.nameAsPerAadhar || "",
        address: emp.address || "", city: emp.city || "", state: emp.state || "", pincode: emp.pincode || "",
        permanentAddress: emp.permanentAddress || "", permanentCity: emp.permanentCity || "",
        permanentState: emp.permanentState || "", permanentPincode: emp.permanentPincode || "",
        aadharNumber: emp.aadharNumber || "", panNumber: emp.panNumber || "",
        uan: emp.uan || "", pfNumber: emp.pfNumber || "", esiNumber: emp.esiNumber || "",
        labourCardNo: emp.labourCardNo || "", labourCardExpDate: toDateInput(emp.labourCardExpDate),
        bankAccountNumber: emp.bankAccountNumber || "", bankIFSC: emp.bankIFSC || "",
        bankName: emp.bankName || "", bankBranch: emp.bankBranch || "",
        designation: emp.designation || "", status: emp.status || "ACTIVE",
        employmentType: emp.employmentType || "Full-time",
        basicSalary: emp.basicSalary ? String(emp.basicSalary) : "0",
        dateOfJoining: toDateInput(emp.dateOfJoining), dateOfLeaving: toDateInput(emp.dateOfLeaving),
        notes: emp.notes || "",
        workSkill: emp.workSkill || "", natureOfWork: emp.natureOfWork || "",
        contractorCode: emp.contractorCode || "", workOrderNumber: emp.workOrderNumber || "",
        workOrderFrom: toDateInput(emp.workOrderFrom), workOrderTo: toDateInput(emp.workOrderTo),
        contractFrom: toDateInput(emp.contractFrom),
        contractPeriodDays: emp.contractPeriodDays ? String(emp.contractPeriodDays) : "",
        emergencyContact1Name: emp.emergencyContact1Name || "",
        emergencyContact1Phone: emp.emergencyContact1Phone || "",
        emergencyContact2Name: emp.emergencyContact2Name || "",
        emergencyContact2Phone: emp.emergencyContact2Phone || "",
        isBackgroundChecked: emp.isBackgroundChecked ?? false,
        backgroundCheckRemark: emp.backgroundCheckRemark || "",
        isMedicalDone: emp.isMedicalDone ?? false, medicalRemark: emp.medicalRemark || "",
        safetyGoggles: emp.safetyGoggles ?? false, safetyGloves: emp.safetyGloves ?? false,
        safetyHelmet: emp.safetyHelmet ?? false, safetyMask: emp.safetyMask ?? false,
        safetyJacket: emp.safetyJacket ?? false, safetyEarMuffs: emp.safetyEarMuffs ?? false,
        safetyShoes: emp.safetyShoes ?? false,
    }
}

// ─── Column groups ────────────────────────────────────────────────────────────
type ColDef = { key: string; label: string; get: (e: Employee) => string }

const COLUMN_GROUPS: { group: string; color: string; cols: ColDef[] }[] = [
    {
        group: "Basic Info", color: "#3b82f6",
        cols: [
            { key: "employeeId",    label: "Emp ID",        get: e => e.employeeId },
            { key: "fullName",      label: "Full Name",     get: e => [e.firstName, e.middleName, e.lastName].filter(Boolean).join(" ") },
            { key: "status",        label: "Status",        get: e => e.status },
            { key: "employmentType",label: "Emp Type",      get: e => e.employmentType },
            { key: "designation",   label: "Designation",   get: e => e.designation || "" },
            { key: "department",    label: "Department",    get: e => e.department?.name || "" },
            { key: "role",          label: "Role",          get: e => e.user?.customRole?.name || e.user?.role || "" },
            { key: "assignment",    label: "Assignment",    get: e => e.deployments?.[0]?.site?.name || "" },
            { key: "dateOfJoining", label: "Joining Date",  get: e => e.dateOfJoining ? new Date(e.dateOfJoining).toLocaleDateString("en-IN") : "" },
            { key: "dateOfLeaving", label: "Leaving Date",  get: e => e.dateOfLeaving ? new Date(e.dateOfLeaving).toLocaleDateString("en-IN") : "" },
        ]
    },
    {
        group: "Personal", color: "#8b5cf6",
        cols: [
            { key: "dob",           label: "Date of Birth",    get: e => e.dateOfBirth ? new Date(e.dateOfBirth).toLocaleDateString("en-IN") : "" },
            { key: "gender",        label: "Gender",           get: e => e.gender || "" },
            { key: "bloodGroup",    label: "Blood Group",      get: e => e.bloodGroup || "" },
            { key: "maritalStatus", label: "Marital Status",   get: e => e.maritalStatus || "" },
            { key: "nationality",   label: "Nationality",      get: e => e.nationality || "" },
            { key: "religion",      label: "Religion",         get: e => e.religion || "" },
            { key: "caste",         label: "Caste",            get: e => e.caste || "" },
            { key: "fathersName",   label: "Father's Name",    get: e => e.fathersName || "" },
            { key: "nameAsPerAadhar",label:"Name on Aadhaar",  get: e => e.nameAsPerAadhar || "" },
        ]
    },
    {
        group: "Contact", color: "#0891b2",
        cols: [
            { key: "phone",         label: "Phone",            get: e => e.phone },
            { key: "altPhone",      label: "Alt Phone",        get: e => e.alternatePhone || "" },
            { key: "email",         label: "Email",            get: e => e.email || "" },
            { key: "ec1",           label: "Emergency 1",      get: e => e.emergencyContact1Name ? `${e.emergencyContact1Name} (${e.emergencyContact1Phone})` : "" },
            { key: "ec2",           label: "Emergency 2",      get: e => e.emergencyContact2Name ? `${e.emergencyContact2Name} (${e.emergencyContact2Phone})` : "" },
        ]
    },
    {
        group: "Current Address", color: "#059669",
        cols: [
            { key: "address",       label: "Address",          get: e => e.address || "" },
            { key: "city",          label: "City",             get: e => e.city || "" },
            { key: "state",         label: "State",            get: e => e.state || "" },
            { key: "pincode",       label: "Pincode",          get: e => e.pincode || "" },
        ]
    },
    {
        group: "Permanent Address", color: "#d97706",
        cols: [
            { key: "permAddress",   label: "P. Address",       get: e => e.permanentAddress || "" },
            { key: "permCity",      label: "P. City",          get: e => e.permanentCity || "" },
            { key: "permState",     label: "P. State",         get: e => e.permanentState || "" },
            { key: "permPincode",   label: "P. Pincode",       get: e => e.permanentPincode || "" },
        ]
    },
    {
        group: "Statutory / KYC", color: "#dc2626",
        cols: [
            { key: "aadhar",        label: "Aadhaar No.",      get: e => e.aadharNumber || "" },
            { key: "pan",           label: "PAN No.",          get: e => e.panNumber || "" },
            { key: "uan",           label: "UAN",              get: e => e.uan || "" },
            { key: "pf",            label: "PF Number",        get: e => e.pfNumber || "" },
            { key: "esi",           label: "ESIC Number",      get: e => e.esiNumber || "" },
            { key: "labourCard",    label: "Labour Card No.",  get: e => e.labourCardNo || "" },
            { key: "labourExp",     label: "Labour Card Exp",  get: e => e.labourCardExpDate ? new Date(e.labourCardExpDate).toLocaleDateString("en-IN") : "" },
        ]
    },
    {
        group: "Bank Details", color: "#0369a1",
        cols: [
            { key: "bankAccount",   label: "Account No.",      get: e => e.bankAccountNumber || "" },
            { key: "bankIFSC",      label: "IFSC",             get: e => e.bankIFSC || "" },
            { key: "bankName",      label: "Bank Name",        get: e => e.bankName || "" },
            { key: "bankBranch",    label: "Bank Branch",      get: e => e.bankBranch || "" },
        ]
    },
    {
        group: "Salary", color: "#65a30d",
        cols: [
            { key: "basicSalary",   label: "Basic Salary",     get: e => e.basicSalary ? String(e.basicSalary) : "" },
            { key: "ctc",           label: "CTC Annual",       get: e => e.employeeSalary?.ctcAnnual ? String(e.employeeSalary.ctcAnnual) : "" },
            { key: "salaryType",    label: "Salary Type",      get: e => e.salaryType || "" },
        ]
    },
    {
        group: "Contract", color: "#7c3aed",
        cols: [
            { key: "workSkill",     label: "Work Skill",       get: e => e.workSkill || "" },
            { key: "natureOfWork",  label: "Nature of Work",   get: e => e.natureOfWork || "" },
            { key: "contractorCode",label: "Contractor Code",  get: e => e.contractorCode || "" },
            { key: "workOrder",     label: "Work Order No.",   get: e => e.workOrderNumber || "" },
            { key: "workFrom",      label: "Work Order From",  get: e => e.workOrderFrom ? new Date(e.workOrderFrom).toLocaleDateString("en-IN") : "" },
            { key: "workTo",        label: "Work Order To",    get: e => e.workOrderTo ? new Date(e.workOrderTo).toLocaleDateString("en-IN") : "" },
            { key: "contractFrom",  label: "Contract From",    get: e => e.contractFrom ? new Date(e.contractFrom).toLocaleDateString("en-IN") : "" },
            { key: "contractDays",  label: "Contract Days",    get: e => e.contractPeriodDays ? String(e.contractPeriodDays) : "" },
        ]
    },
    {
        group: "Safety", color: "#f59e0b",
        cols: [
            { key: "sGoggles",      label: "Goggles",          get: e => e.safetyGoggles ? "Yes" : "No" },
            { key: "sGloves",       label: "Gloves",           get: e => e.safetyGloves ? "Yes" : "No" },
            { key: "sHelmet",       label: "Helmet",           get: e => e.safetyHelmet ? "Yes" : "No" },
            { key: "sMask",         label: "Mask",             get: e => e.safetyMask ? "Yes" : "No" },
            { key: "sJacket",       label: "Jacket",           get: e => e.safetyJacket ? "Yes" : "No" },
            { key: "sEarMuffs",     label: "Ear Muffs",        get: e => e.safetyEarMuffs ? "Yes" : "No" },
            { key: "sShoes",        label: "Shoes",            get: e => e.safetyShoes ? "Yes" : "No" },
        ]
    },
    {
        group: "Background / Medical", color: "#6b7280",
        cols: [
            { key: "bgCheck",       label: "BG Checked",       get: e => e.isBackgroundChecked ? "Yes" : "No" },
            { key: "bgRemark",      label: "BG Remark",        get: e => e.backgroundCheckRemark || "" },
            { key: "medical",       label: "Medical Done",     get: e => e.isMedicalDone ? "Yes" : "No" },
            { key: "medRemark",     label: "Medical Remark",   get: e => e.medicalRemark || "" },
        ]
    },
]

const ALL_COLS = COLUMN_GROUPS.flatMap(g => g.cols)

const STATUS_COLOR: Record<string, { bg: string; color: string }> = {
    ACTIVE:     { bg: "#dcfce7", color: "#16a34a" },
    INACTIVE:   { bg: "#f3f4f6", color: "#6b7280" },
    ON_LEAVE:   { bg: "#fef9c3", color: "#ca8a04" },
    TERMINATED: { bg: "#fee2e2", color: "#dc2626" },
    RESIGNED:   { bg: "#ede9fe", color: "#7c3aed" },
}

// ─── Field helpers ────────────────────────────────────────────────────────────
const inputStyle: React.CSSProperties = {
    width: "100%", padding: "6px 9px", borderRadius: 7, border: "1px solid var(--border)",
    fontSize: 12, outline: "none", background: "var(--surface)", color: "var(--text)", boxSizing: "border-box"
}
const labelStyle: React.CSSProperties = {
    fontSize: 11, fontWeight: 600, color: "var(--text3)", marginBottom: 3, display: "block"
}
const sectionHeadStyle = (color: string): React.CSSProperties => ({
    fontSize: 11, fontWeight: 700, color, textTransform: "uppercase", letterSpacing: "0.6px",
    padding: "8px 0 6px", borderBottom: `1px solid ${color}30`, marginBottom: 10
})

function Field({ label, value, onChange, type = "text", options }: {
    label: string; value: string; onChange: (v: string) => void
    type?: "text" | "date" | "number" | "email" | "tel" | "select" | "textarea"
    options?: string[]
}) {
    return (
        <div style={{ marginBottom: 10 }}>
            <label style={labelStyle}>{label}</label>
            {type === "select" && options ? (
                <select value={value} onChange={e => onChange(e.target.value)} style={inputStyle}>
                    <option value="">— Select —</option>
                    {options.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
            ) : type === "textarea" ? (
                <textarea value={value} onChange={e => onChange(e.target.value)}
                    style={{ ...inputStyle, resize: "vertical", minHeight: 56 }} />
            ) : (
                <input type={type} value={value} onChange={e => onChange(e.target.value)} style={inputStyle} />
            )}
        </div>
    )
}

function CheckField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
    return (
        <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, color: "var(--text)", cursor: "pointer", marginBottom: 8 }}>
            <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)}
                style={{ width: 14, height: 14, accentColor: "var(--accent)" }} />
            {label}
        </label>
    )
}

// ─── Edit Drawer ──────────────────────────────────────────────────────────────
function EditDrawer({ emp, onClose, onSaved }: { emp: Employee; onClose: () => void; onSaved: () => void }) {
    const [form, setForm] = useState<EditForm>(() => empToForm(emp))
    const [saving, setSaving] = useState(false)
    const [section, setSection] = useState("basic")

    const set = (key: keyof EditForm) => (val: string | boolean) =>
        setForm(prev => ({ ...prev, [key]: val }))

    const save = async () => {
        setSaving(true)
        try {
            const res = await fetch(`/api/employees/${emp.id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    ...form,
                    basicSalary: parseFloat(form.basicSalary) || 0,
                    contractPeriodDays: form.contractPeriodDays ? parseInt(form.contractPeriodDays) : null,
                })
            })
            if (!res.ok) throw new Error(await res.text())
            toast.success("Employee updated")
            onSaved()
            onClose()
        } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : "Save failed")
        } finally {
            setSaving(false)
        }
    }

    const sections = [
        { id: "basic",    label: "Basic Info",         color: "#3b82f6" },
        { id: "personal", label: "Personal",           color: "#8b5cf6" },
        { id: "contact",  label: "Contact & Address",  color: "#0891b2" },
        { id: "statutory",label: "Statutory / Bank",   color: "#dc2626" },
        { id: "contract", label: "Contract / Work",    color: "#7c3aed" },
        { id: "safety",   label: "Safety & Medical",   color: "#f59e0b" },
    ]

    return (
        <>
            {/* Backdrop */}
            <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 50 }} />

            {/* Drawer */}
            <div style={{
                position: "fixed", top: 0, right: 0, bottom: 0, width: "min(560px, 96vw)",
                background: "var(--surface)", boxShadow: "-4px 0 32px rgba(0,0,0,0.18)",
                zIndex: 51, display: "flex", flexDirection: "column"
            }}>
                {/* Header */}
                <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexShrink: 0 }}>
                    <div>
                        <p style={{ fontSize: 15, fontWeight: 700, color: "var(--text)", margin: 0 }}>
                            Edit Employee
                        </p>
                        <p style={{ fontSize: 11, color: "var(--text3)", margin: "2px 0 0 0" }}>
                            {emp.employeeId} · {emp.firstName} {emp.lastName}
                        </p>
                    </div>
                    <button onClick={onClose} style={{ padding: 6, borderRadius: 8, border: "1px solid var(--border)", background: "none", cursor: "pointer", color: "var(--text3)", display: "flex" }}>
                        <X size={16} />
                    </button>
                </div>

                {/* Section tabs */}
                <div style={{ display: "flex", gap: 4, padding: "8px 12px", borderBottom: "1px solid var(--border)", flexWrap: "wrap", flexShrink: 0 }}>
                    {sections.map(s => (
                        <button key={s.id} onClick={() => setSection(s.id)}
                            style={{ padding: "4px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: "pointer",
                                border: `1px solid ${s.color}40`,
                                background: section === s.id ? s.color + "22" : "transparent",
                                color: section === s.id ? s.color : "var(--text3)",
                                transition: "all 0.12s" }}>
                            {s.label}
                        </button>
                    ))}
                </div>

                {/* Body */}
                <div style={{ flex: 1, overflowY: "auto", padding: "14px 18px" }}>

                    {section === "basic" && (
                        <>
                            <p style={sectionHeadStyle("#3b82f6")}>Basic Info</p>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 12px" }}>
                                <Field label="First Name"     value={form.firstName}     onChange={set("firstName")} />
                                <Field label="Middle Name"    value={form.middleName}    onChange={set("middleName")} />
                                <Field label="Last Name"      value={form.lastName}      onChange={set("lastName")} />
                                <Field label="Designation"    value={form.designation}   onChange={set("designation")} />
                                <Field label="Status" type="select" value={form.status} onChange={set("status")}
                                    options={["ACTIVE","INACTIVE","ON_LEAVE","TERMINATED","RESIGNED"]} />
                                <Field label="Employment Type" type="select" value={form.employmentType} onChange={set("employmentType")}
                                    options={["Full-time","Part-time","Contract","Intern","Temporary"]} />
                                <Field label="Basic Salary"   type="number" value={form.basicSalary}  onChange={set("basicSalary")} />
                                <Field label="Date of Joining" type="date" value={form.dateOfJoining} onChange={set("dateOfJoining")} />
                                <Field label="Date of Leaving" type="date" value={form.dateOfLeaving} onChange={set("dateOfLeaving")} />
                            </div>
                            <Field label="Notes" type="textarea" value={form.notes} onChange={set("notes")} />
                        </>
                    )}

                    {section === "personal" && (
                        <>
                            <p style={sectionHeadStyle("#8b5cf6")}>Personal</p>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 12px" }}>
                                <Field label="Date of Birth"   type="date" value={form.dateOfBirth}     onChange={set("dateOfBirth")} />
                                <Field label="Gender" type="select" value={form.gender} onChange={set("gender")}
                                    options={["Male","Female","Other"]} />
                                <Field label="Blood Group"     value={form.bloodGroup}     onChange={set("bloodGroup")} />
                                <Field label="Marital Status" type="select" value={form.maritalStatus} onChange={set("maritalStatus")}
                                    options={["Single","Married","Divorced","Widowed"]} />
                                <Field label="Nationality"     value={form.nationality}    onChange={set("nationality")} />
                                <Field label="Religion"        value={form.religion}       onChange={set("religion")} />
                                <Field label="Caste"           value={form.caste}          onChange={set("caste")} />
                                <Field label="Father's Name"   value={form.fathersName}    onChange={set("fathersName")} />
                                <div style={{ gridColumn: "1/-1" }}>
                                    <Field label="Name as per Aadhaar" value={form.nameAsPerAadhar} onChange={set("nameAsPerAadhar")} />
                                </div>
                            </div>
                        </>
                    )}

                    {section === "contact" && (
                        <>
                            <p style={sectionHeadStyle("#0891b2")}>Contact</p>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 12px" }}>
                                <Field label="Phone"       type="tel"   value={form.phone}          onChange={set("phone")} />
                                <Field label="Alt Phone"   type="tel"   value={form.alternatePhone} onChange={set("alternatePhone")} />
                                <div style={{ gridColumn: "1/-1" }}>
                                    <Field label="Email"   type="email" value={form.email}          onChange={set("email")} />
                                </div>
                                <Field label="Emergency 1 Name"  value={form.emergencyContact1Name}  onChange={set("emergencyContact1Name")} />
                                <Field label="Emergency 1 Phone" type="tel" value={form.emergencyContact1Phone} onChange={set("emergencyContact1Phone")} />
                                <Field label="Emergency 2 Name"  value={form.emergencyContact2Name}  onChange={set("emergencyContact2Name")} />
                                <Field label="Emergency 2 Phone" type="tel" value={form.emergencyContact2Phone} onChange={set("emergencyContact2Phone")} />
                            </div>
                            <p style={{ ...sectionHeadStyle("#059669"), marginTop: 12 }}>Current Address</p>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 12px" }}>
                                <div style={{ gridColumn: "1/-1" }}>
                                    <Field label="Address" value={form.address}  onChange={set("address")} />
                                </div>
                                <Field label="City"    value={form.city}     onChange={set("city")} />
                                <Field label="State"   value={form.state}    onChange={set("state")} />
                                <Field label="Pincode" value={form.pincode}  onChange={set("pincode")} />
                            </div>
                            <p style={{ ...sectionHeadStyle("#d97706"), marginTop: 12 }}>Permanent Address</p>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 12px" }}>
                                <div style={{ gridColumn: "1/-1" }}>
                                    <Field label="Address" value={form.permanentAddress}  onChange={set("permanentAddress")} />
                                </div>
                                <Field label="City"    value={form.permanentCity}     onChange={set("permanentCity")} />
                                <Field label="State"   value={form.permanentState}    onChange={set("permanentState")} />
                                <Field label="Pincode" value={form.permanentPincode}  onChange={set("permanentPincode")} />
                            </div>
                        </>
                    )}

                    {section === "statutory" && (
                        <>
                            <p style={sectionHeadStyle("#dc2626")}>Statutory / KYC</p>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 12px" }}>
                                <Field label="Aadhaar No."    value={form.aadharNumber}     onChange={set("aadharNumber")} />
                                <Field label="PAN No."        value={form.panNumber}        onChange={set("panNumber")} />
                                <Field label="UAN"            value={form.uan}              onChange={set("uan")} />
                                <Field label="PF Number"      value={form.pfNumber}         onChange={set("pfNumber")} />
                                <Field label="ESIC Number"    value={form.esiNumber}        onChange={set("esiNumber")} />
                                <Field label="Labour Card No." value={form.labourCardNo}    onChange={set("labourCardNo")} />
                                <Field label="Labour Card Exp" type="date" value={form.labourCardExpDate} onChange={set("labourCardExpDate")} />
                            </div>
                            <p style={{ ...sectionHeadStyle("#0369a1"), marginTop: 12 }}>Bank Details</p>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 12px" }}>
                                <div style={{ gridColumn: "1/-1" }}>
                                    <Field label="Account Number" value={form.bankAccountNumber} onChange={set("bankAccountNumber")} />
                                </div>
                                <Field label="IFSC Code"   value={form.bankIFSC}    onChange={set("bankIFSC")} />
                                <Field label="Bank Name"   value={form.bankName}    onChange={set("bankName")} />
                                <div style={{ gridColumn: "1/-1" }}>
                                    <Field label="Bank Branch" value={form.bankBranch} onChange={set("bankBranch")} />
                                </div>
                            </div>
                        </>
                    )}

                    {section === "contract" && (
                        <>
                            <p style={sectionHeadStyle("#7c3aed")}>Contract / Work</p>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 12px" }}>
                                <Field label="Work Skill"       value={form.workSkill}       onChange={set("workSkill")} />
                                <Field label="Nature of Work"   value={form.natureOfWork}    onChange={set("natureOfWork")} />
                                <Field label="Contractor Code"  value={form.contractorCode}  onChange={set("contractorCode")} />
                                <Field label="Work Order No."   value={form.workOrderNumber} onChange={set("workOrderNumber")} />
                                <Field label="Work Order From"  type="date" value={form.workOrderFrom} onChange={set("workOrderFrom")} />
                                <Field label="Work Order To"    type="date" value={form.workOrderTo}   onChange={set("workOrderTo")} />
                                <Field label="Contract From"    type="date" value={form.contractFrom}  onChange={set("contractFrom")} />
                                <Field label="Contract Period (days)" type="number" value={form.contractPeriodDays} onChange={set("contractPeriodDays")} />
                            </div>
                        </>
                    )}

                    {section === "safety" && (
                        <>
                            <p style={sectionHeadStyle("#f59e0b")}>Safety Equipment</p>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr" }}>
                                <CheckField label="Goggles"   checked={form.safetyGoggles}  onChange={set("safetyGoggles") as (v: boolean) => void} />
                                <CheckField label="Gloves"    checked={form.safetyGloves}   onChange={set("safetyGloves") as (v: boolean) => void} />
                                <CheckField label="Helmet"    checked={form.safetyHelmet}   onChange={set("safetyHelmet") as (v: boolean) => void} />
                                <CheckField label="Mask"      checked={form.safetyMask}     onChange={set("safetyMask") as (v: boolean) => void} />
                                <CheckField label="Jacket"    checked={form.safetyJacket}   onChange={set("safetyJacket") as (v: boolean) => void} />
                                <CheckField label="Ear Muffs" checked={form.safetyEarMuffs} onChange={set("safetyEarMuffs") as (v: boolean) => void} />
                                <CheckField label="Shoes"     checked={form.safetyShoes}    onChange={set("safetyShoes") as (v: boolean) => void} />
                            </div>
                            <p style={{ ...sectionHeadStyle("#6b7280"), marginTop: 14 }}>Background &amp; Medical</p>
                            <CheckField label="Background Check Done" checked={form.isBackgroundChecked} onChange={set("isBackgroundChecked") as (v: boolean) => void} />
                            <Field label="BG Remark" type="textarea" value={form.backgroundCheckRemark} onChange={set("backgroundCheckRemark")} />
                            <CheckField label="Medical Done" checked={form.isMedicalDone} onChange={set("isMedicalDone") as (v: boolean) => void} />
                            <Field label="Medical Remark" type="textarea" value={form.medicalRemark} onChange={set("medicalRemark")} />
                        </>
                    )}
                </div>

                {/* Footer */}
                <div style={{ padding: "12px 18px", borderTop: "1px solid var(--border)", display: "flex", gap: 8, justifyContent: "flex-end", flexShrink: 0 }}>
                    <button onClick={onClose} disabled={saving}
                        style={{ padding: "7px 16px", borderRadius: 8, border: "1px solid var(--border)", background: "none", fontSize: 12, color: "var(--text2)", cursor: "pointer" }}>
                        Cancel
                    </button>
                    <button onClick={save} disabled={saving}
                        style={{ padding: "7px 16px", borderRadius: 8, border: "none", background: "var(--accent)", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, opacity: saving ? 0.7 : 1 }}>
                        {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                        {saving ? "Saving…" : "Save Changes"}
                    </button>
                </div>
            </div>
        </>
    )
}

// Small square pagination arrow button used in the table footer.
function PageBtn({ onClick, disabled, children }: { onClick: () => void; disabled: boolean; children: React.ReactNode }) {
    return (
        <button onClick={onClick} disabled={disabled}
            style={{
                width: 30, height: 30, borderRadius: 8, border: "1px solid var(--border)",
                background: "var(--surface)", color: "var(--text2)", cursor: disabled ? "default" : "pointer",
                opacity: disabled ? 0.4 : 1, display: "inline-flex", alignItems: "center", justifyContent: "center",
            }}>
            {children}
        </button>
    )
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function EmployeeMasterPage() {
    const { data: session, status } = useSession()
    const router = useRouter()

    const [employees, setEmployees] = useState<Employee[]>([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState("")
    const [statusFilter, setStatusFilter] = useState("")
    const [siteFilter, setSiteFilter] = useState("")
    const [sites, setSites] = useState<{id: string, name: string}[]>([])
    const [exporting, setExporting] = useState(false)
    // Which column-group tab is active — the table shows the pinned identity
    // columns plus this group's columns (mockup-style tab strip).
    const [activeGroup, setActiveGroup] = useState<string>(COLUMN_GROUPS[0].group)
    const [colFilters, setColFilters] = useState<Record<string, string>>({})
    const [editEmp, setEditEmp] = useState<Employee | null>(null)
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
    const [deleting, setDeleting] = useState(false)
    const [confirmDelete, setConfirmDelete] = useState(false)
    // Individual columns the user has unchecked (within visible groups). Export
    // and the table both honor this so you download exactly the columns you pick.
    const [hiddenColKeys, setHiddenColKeys] = useState<Set<string>>(new Set())
    const [showColPicker, setShowColPicker] = useState(false)

    useEffect(() => {
        if (status === "unauthenticated") router.push("/login")
    }, [status, router])

    const fetchEmployees = useCallback(async () => {
        setLoading(true)
        try {
            const params = new URLSearchParams()
            if (statusFilter) params.set("status", statusFilter)
            if (siteFilter) params.set("siteId", siteFilter)
            if (search) params.set("search", search)
            params.set("pageSize", "500")
            // Master grid never renders avatars — skip the heavy base64 photo
            // payload so the list loads fast (was ~15s with photos inlined).
            params.set("lite", "1")
            const res = await fetch(`/api/employees?${params.toString()}`)
            const data = await res.json()
            setEmployees(Array.isArray(data) ? data : (data.employees ?? []))
        } catch {
            toast.error("Failed to load employees")
        } finally {
            setLoading(false)
        }
    }, [statusFilter, siteFilter, search])

    useEffect(() => {
        if (status !== "unauthenticated") {
            fetchEmployees()
        }
    }, [status, fetchEmployees])

    useEffect(() => {
        const fetchSites = async () => {
            try {
                const res = await fetch("/api/sites")
                const data = await res.json()
                if (Array.isArray(data)) setSites(data)
            } catch (error) {
                console.error("Failed to fetch sites", error)
            }
        }
        if (status === "authenticated") fetchSites()
    }, [status])

    // Removed branches derivation

    const toggleCol = (key: string) => {
        setHiddenColKeys(prev => {
            const next = new Set(prev)
            next.has(key) ? next.delete(key) : next.add(key)
            return next
        })
    }

    const setColFilter = (key: string, val: string) =>
        setColFilters(prev => ({ ...prev, [key]: val }))

    // Client-side column filtering
    const filteredEmployees = useMemo(() => {
        const activeColFilters = Object.entries(colFilters).filter(([, v]) => v.trim())
        if (activeColFilters.length === 0) return employees
        return employees.filter(emp => {
            for (const [key, val] of activeColFilters) {
                const col = ALL_COLS.find(c => c.key === key)
                if (!col) continue
                if (!col.get(emp).toLowerCase().includes(val.toLowerCase())) return false
            }
            return true
        })
    }, [employees, colFilters])

    const activeFilterCount = Object.values(colFilters).filter(v => v.trim()).length

    // ── Render pagination ─────────────────────────────────────────────────────
    // Only one page of rows is in the DOM at a time; export/selection still
    // operate on the full filtered set.
    const [rowsPerPage, setRowsPerPage] = useState(25)
    const [renderPage, setRenderPage] = useState(1)
    useEffect(() => { setRenderPage(1) }, [statusFilter, siteFilter, search, colFilters, rowsPerPage])
    const renderTotalPages = Math.max(1, Math.ceil(filteredEmployees.length / rowsPerPage))
    const pagedEmployees = filteredEmployees.slice((renderPage - 1) * rowsPerPage, renderPage * rowsPerPage)

    // ── Selection helpers ─────────────────────────────────────────────────────
    const allSelected = filteredEmployees.length > 0 && filteredEmployees.every(e => selectedIds.has(e.id))
    const someSelected = !allSelected && filteredEmployees.some(e => selectedIds.has(e.id))

    const toggleAll = () => {
        if (allSelected) {
            setSelectedIds(prev => {
                const next = new Set(prev)
                filteredEmployees.forEach(e => next.delete(e.id))
                return next
            })
        } else {
            setSelectedIds(prev => {
                const next = new Set(prev)
                filteredEmployees.forEach(e => next.add(e.id))
                return next
            })
        }
    }

    const toggleOne = (id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev)
            next.has(id) ? next.delete(id) : next.add(id)
            return next
        })
    }

    // ── Bulk download selected ────────────────────────────────────────────────
    const handleDownloadSelected = () => {
        const selected = filteredEmployees.filter(e => selectedIds.has(e.id))
        if (!selected.length) return
        if (visibleCols.length === 0) { toast.error("Pick at least one column to export"); return }
        try {
            // Export exactly the columns currently visible (group + column picker),
            // which already excludes salary for users without permission.
            const exportCols = visibleCols
            const headers = exportCols.map(c => c.label)
            const rows = selected.map(emp => exportCols.map(c => c.get(emp)))
            const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
            ws["!cols"] = headers.map((h, i) => ({
                wch: Math.max(h.length, ...rows.map(r => String(r[i] || "").length), 10)
            }))
            const wb = XLSX.utils.book_new()
            XLSX.utils.book_append_sheet(wb, ws, "Selected Employees")
            XLSX.writeFile(wb, `Selected_Employees_${new Date().toISOString().slice(0,10)}.xlsx`)
            toast.success(`Downloaded ${selected.length} employees`)
        } catch {
            toast.error("Download failed")
        }
    }

    // ── Bulk delete selected ──────────────────────────────────────────────────
    const handleBulkDelete = async () => {
        if (!confirmDelete) { setConfirmDelete(true); return }
        setDeleting(true)
        setConfirmDelete(false)
        const ids = Array.from(selectedIds)
        const results = await Promise.allSettled(
            ids.map(id => fetch(`/api/employees/${id}`, { method: "DELETE" }))
        )
        const succeeded = results.filter(r => r.status === "fulfilled").length
        const failed    = results.filter(r => r.status === "rejected").length
        setDeleting(false)
        setSelectedIds(new Set())
        if (succeeded > 0) toast.success(`${succeeded} employee${succeeded > 1 ? "s" : ""} deleted`)
        if (failed    > 0) toast.error(`${failed} deletion${failed > 1 ? "s" : ""} failed`)
        fetchEmployees()
    }

    // ── Excel export ──────────────────────────────────────────────────────────
    const handleExport = () => {
        if (visibleCols.length === 0) { toast.error("Pick at least one column to export"); return }
        setExporting(true)
        try {
            // Honor the column selection — export only the visible columns.
            const headers = visibleCols.map(c => c.label)
            const rows = filteredEmployees.map(emp => visibleCols.map(c => c.get(emp)))
            const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
            ws["!cols"] = headers.map((h, i) => ({
                wch: Math.max(h.length, ...rows.map(r => String(r[i] || "").length), 10)
            }))
            headers.forEach((_, i) => {
                const cellRef = XLSX.utils.encode_cell({ r: 0, c: i })
                if (ws[cellRef]) ws[cellRef].s = { font: { bold: true }, fill: { fgColor: { rgb: "E2E8F0" } } }
            })
            const wb = XLSX.utils.book_new()
            XLSX.utils.book_append_sheet(wb, ws, "Employee Master")

            // Removed branch summary

            const date = new Date().toISOString().slice(0, 10)
            XLSX.writeFile(wb, `Employee_Master_${date}.xlsx`)
            toast.success(`Exported ${filteredEmployees.length} employees`)
        } catch {
            toast.error("Export failed")
        } finally {
            setExporting(false)
        }
    }

    const canViewSalary = can(session, "employees.viewSalary")
    const canDelete = can(session, "employees.delete")
    // Salary is sensitive — drop the whole Salary column group (Basic Salary,
    // CTC Annual, Salary Type) for anyone without the dedicated permission.
    // The /api/employees response also nulls these fields server-side.
    const columnGroups = canViewSalary ? COLUMN_GROUPS : COLUMN_GROUPS.filter(g => g.group !== "Salary")

    // Export columns: every permitted group's columns minus any the user
    // unticked in the Columns picker (independent of which tab is active).
    const visibleCols = columnGroups
        .flatMap(g => g.cols
            .filter(c => !hiddenColKeys.has(c.key))
            .map(c => ({ ...c, groupColor: g.color, groupName: g.group })))

    // Table columns: pinned identity columns + the active tab's columns.
    const PINNED_KEYS = ["employeeId", "fullName", "status"]
    const basicGroup = columnGroups[0]
    const activeGroupDef = columnGroups.find(g => g.group === activeGroup) ?? basicGroup
    const tableCols = [
        ...basicGroup.cols.filter(c => PINNED_KEYS.includes(c.key)).map(c => ({ ...c, groupColor: basicGroup.color })),
        ...activeGroupDef.cols.filter(c => !PINNED_KEYS.includes(c.key)).map(c => ({ ...c, groupColor: activeGroupDef.color })),
    ]

    const isAdmin = can(session, "employees.view")

    if (!isAdmin) return (
        <div className="flex items-center justify-center h-64 text-[var(--text3)] text-[13px]">Access denied</div>
    )

    return (
        <>
        <div style={{ display: "flex", flexDirection: "column", gap: 16, height: "100%", minHeight: 0 }}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                    <div style={{ width: 38, height: 38, borderRadius: 10, background: "var(--accent-light, #e8f7f1)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 2 }}>
                        <Users size={19} style={{ color: "var(--accent)" }} />
                    </div>
                    <div>
                        <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--text)", margin: 0, letterSpacing: "-0.3px" }}>Employee Master</h1>
                        <p style={{ fontSize: 12.5, color: "var(--text3)", margin: "2px 0 0 0" }}>
                            Complete employee data for all employees
                        </p>
                    </div>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    {activeFilterCount > 0 && (
                        <button onClick={() => setColFilters({})}
                            style={{ display: "flex", alignItems: "center", gap: 5, padding: "8px 12px", borderRadius: 9, border: "1px solid #f59e0b40", background: "#fef9c3", fontSize: 12, color: "#92400e", cursor: "pointer", fontWeight: 600 }}>
                            <X size={12} /> Clear {activeFilterCount} filter{activeFilterCount > 1 ? "s" : ""}
                        </button>
                    )}
                    <button onClick={fetchEmployees} disabled={loading}
                        style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 15px", borderRadius: 9, border: "1px solid var(--border)", background: "var(--surface)", fontSize: 12.5, fontWeight: 600, color: "var(--text2)", cursor: "pointer" }}>
                        <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh
                    </button>
                    <button onClick={selectedIds.size > 0 ? handleDownloadSelected : handleExport} disabled={exporting || filteredEmployees.length === 0}
                        title={selectedIds.size > 0 ? "Downloads only the selected rows, with the columns you've picked" : "Downloads all rows, with the columns you've picked"}
                        style={{ display: "flex", alignItems: "center", gap: 7, padding: "9px 17px", borderRadius: 9, border: "none", background: "var(--accent, #1a9e6e)", color: "#fff", fontSize: 12.5, fontWeight: 600, cursor: "pointer", opacity: (exporting || filteredEmployees.length === 0) ? 0.6 : 1, boxShadow: "0 1px 3px rgba(26,158,110,0.35)" }}>
                        {exporting ? <Loader2 size={14} className="animate-spin" /> : <FileSpreadsheet size={14} />}
                        {exporting ? "Exporting…" : selectedIds.size > 0 ? `Download Excel (${selectedIds.size})` : "Download Excel"}
                    </button>
                </div>
            </div>

            {/* KPI cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(175px, 1fr))", gap: 12 }}>
                {[
                    { label: "Total Employees", value: filteredEmployees.length,                                         color: "#3b82f6", bg: "#eff6ff", icon: Users },
                    { label: "Active",          value: filteredEmployees.filter(e => e.status === "ACTIVE").length,     color: "#16a34a", bg: "#e8f7f1", icon: UserCheck },
                    { label: "Inactive",        value: filteredEmployees.filter(e => e.status === "INACTIVE").length,   color: "#6b7280", bg: "#f3f4f6", icon: UserX },
                    { label: "On Leave",        value: filteredEmployees.filter(e => e.status === "ON_LEAVE").length,   color: "#d97706", bg: "#fef3c7", icon: CalendarOff },
                    { label: "Terminated",      value: filteredEmployees.filter(e => e.status === "TERMINATED").length, color: "#dc2626", bg: "#fef2f2", icon: UserMinus },
                ].map(s => (
                    <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 12, padding: "16px 18px", borderRadius: 14, border: "1px solid var(--border)", background: "var(--surface)" }}>
                        <div style={{ width: 42, height: 42, borderRadius: 11, background: s.bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                            <s.icon size={20} style={{ color: s.color }} />
                        </div>
                        <div style={{ minWidth: 0 }}>
                            <p style={{ fontSize: 12, color: "var(--text3)", margin: 0, fontWeight: 500, whiteSpace: "nowrap" }}>{s.label}</p>
                            <p style={{ fontSize: 24, fontWeight: 700, color: s.color, margin: 0, lineHeight: 1.25, fontVariantNumeric: "tabular-nums" }}>{s.value.toLocaleString("en-IN")}</p>
                        </div>
                    </div>
                ))}
            </div>

            {/* Search + filters */}
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                <div style={{ position: "relative", flex: 1, minWidth: 240, maxWidth: 440 }}>
                    <Search size={15} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text3)" }} />
                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name, employee ID, phone, email…"
                        style={{ width: "100%", height: 38, padding: "0 12px 0 36px", borderRadius: 10, border: "1px solid var(--border)", fontSize: 13, outline: "none", background: "var(--surface)", color: "var(--text)", boxSizing: "border-box" }} />
                </div>
                <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                    style={{ height: 38, padding: "0 12px", borderRadius: 10, border: "1px solid var(--border)", fontSize: 13, background: "var(--surface)", color: "var(--text)", outline: "none", cursor: "pointer" }}>
                    <option value="">All Status</option>
                    {["ACTIVE","INACTIVE","ON_LEAVE","TERMINATED","RESIGNED"].map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <select value={siteFilter} onChange={e => setSiteFilter(e.target.value)}
                    style={{ height: 38, padding: "0 12px", borderRadius: 10, border: "1px solid var(--border)", fontSize: 13, background: "var(--surface)", color: "var(--text)", outline: "none", cursor: "pointer", maxWidth: 200 }}>
                    <option value="">All Sites</option>
                    {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>

                {(statusFilter || siteFilter || search) && (
                    <button onClick={() => { setStatusFilter(""); setSiteFilter(""); setSearch(""); }}
                        style={{ display: "flex", alignItems: "center", gap: 4, height: 38, padding: "0 12px", borderRadius: 10, border: "1px solid var(--border)", background: "transparent", color: "#ef4444", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                        <X size={13} /> Clear
                    </button>
                )}

                <div style={{ flex: 1 }} />

                {/* Columns picker (controls the Excel export) */}
                <div style={{ position: "relative" }}>
                    <button onClick={() => setShowColPicker(v => !v)}
                        style={{ display: "flex", alignItems: "center", gap: 6, height: 38, padding: "0 14px", borderRadius: 10, border: "1px solid var(--border)", background: showColPicker ? "var(--surface2)" : "var(--surface)", color: "var(--text2)", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
                        <CheckSquare size={14} /> Columns ({visibleCols.length})
                    </button>
                    {showColPicker && (
                        <>
                            <div onClick={() => setShowColPicker(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
                            <div style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 50, width: 280, maxHeight: 420, overflowY: "auto", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, boxShadow: "0 12px 40px rgba(11,27,51,0.18)", padding: 12 }}>
                                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                                    <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text)" }}>Choose columns to export</span>
                                </div>
                                <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
                                    <button onClick={() => setHiddenColKeys(new Set())}
                                        style={{ flex: 1, padding: "5px 0", borderRadius: 7, border: "1px solid var(--border)", background: "transparent", color: "var(--accent-text)", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>Select all</button>
                                    <button onClick={() => setHiddenColKeys(new Set(columnGroups.flatMap(g => g.cols.map(c => c.key))))}
                                        style={{ flex: 1, padding: "5px 0", borderRadius: 7, border: "1px solid var(--border)", background: "transparent", color: "var(--text3)", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>Clear all</button>
                                </div>
                                {columnGroups.map(g => (
                                    <div key={g.group} style={{ marginBottom: 10 }}>
                                        <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, color: g.color, marginBottom: 4 }}>{g.group}</div>
                                        {g.cols.map(c => (
                                            <label key={c.key} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 2px", cursor: "pointer", fontSize: 12.5, color: "var(--text2)" }}>
                                                <input type="checkbox" checked={!hiddenColKeys.has(c.key)} onChange={() => toggleCol(c.key)} style={{ accentColor: "var(--accent)" }} />
                                                {c.label}
                                            </label>
                                        ))}
                                    </div>
                                ))}
                                <p style={{ fontSize: 10.5, color: "var(--text3)", marginTop: 4, paddingTop: 8, borderTop: "1px solid var(--border)" }}>
                                    Excel downloads exactly these {visibleCols.length} columns.
                                </p>
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* Column-group tabs */}
            <div style={{ display: "flex", gap: 4, overflowX: "auto", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "6px 8px" }}>
                {columnGroups.map(g => {
                    const active = activeGroupDef.group === g.group
                    return (
                        <button key={g.group} onClick={() => setActiveGroup(g.group)}
                            style={{
                                display: "flex", alignItems: "center", gap: 7, padding: "8px 14px", borderRadius: 9,
                                border: "none", cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0,
                                fontSize: 12.5, fontWeight: 600, transition: "all 0.15s",
                                background: active ? g.color + "14" : "transparent",
                                color: active ? g.color : "var(--text3)",
                                boxShadow: active ? `inset 0 -2px 0 ${g.color}` : "none",
                            }}>
                            <span style={{ width: 7, height: 7, borderRadius: 4, background: active ? g.color : "var(--border)", flexShrink: 0 }} />
                            {g.group}
                        </button>
                    )
                })}
            </div>

            {/* Table */}
            <div style={{ flex: 1, minHeight: 0, overflow: "auto", border: "1px solid var(--border)", borderRadius: 12 }}>
                {loading ? (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 60, gap: 10 }}>
                        <Loader2 size={22} className="animate-spin" style={{ color: "var(--accent)" }} />
                        <span style={{ fontSize: 13, color: "var(--text3)" }}>Loading employees…</span>
                    </div>
                ) : filteredEmployees.length === 0 ? (
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 60, gap: 8 }}>
                        <span style={{ fontSize: 13, color: "var(--text3)" }}>No employees found</span>
                        {activeFilterCount > 0 && (
                            <button onClick={() => setColFilters({})} style={{ fontSize: 11, color: "var(--accent)", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>
                                Clear column filters
                            </button>
                        )}
                    </div>
                ) : (
                    <table style={{ borderCollapse: "collapse", width: "max-content", minWidth: "100%", fontSize: 12.5 }}>
                        <thead>
                            {/* Column labels row */}
                            <tr style={{ background: "#f8fafc" }}>
                                <th style={{ position: "sticky", left: 0, top: 0, zIndex: 3, background: "#f8fafc", padding: "10px 10px", borderBottom: "1px solid var(--border)", textAlign: "center", whiteSpace: "nowrap", minWidth: 40 }}>
                                    <input type="checkbox" checked={allSelected} ref={el => { if (el) el.indeterminate = someSelected }} onChange={toggleAll}
                                        style={{ width: 14, height: 14, cursor: "pointer", accentColor: "var(--accent)" }} />
                                </th>
                                <th style={{ position: "sticky", left: 40, top: 0, zIndex: 3, background: "#f8fafc", padding: "10px 8px", borderBottom: "1px solid var(--border)", textAlign: "center", fontSize: 11, fontWeight: 600, color: "var(--text3)", whiteSpace: "nowrap", minWidth: 34 }}>
                                    #
                                </th>
                                <th style={{ position: "sticky", left: 74, top: 0, zIndex: 3, background: "#f8fafc", padding: "10px 8px", borderBottom: "1px solid var(--border)", borderRight: "1px solid var(--border)", textAlign: "center", fontSize: 11, fontWeight: 600, color: "var(--text3)", whiteSpace: "nowrap", minWidth: 46 }}>
                                    Edit
                                </th>
                                {tableCols.map(col => (
                                    <th key={col.key} style={{ position: "sticky", top: 0, zIndex: 2, background: "#f8fafc", padding: "10px 12px", borderBottom: "1px solid var(--border)", textAlign: "left", fontSize: 11.5, fontWeight: 600, color: "var(--text2)", whiteSpace: "nowrap", minWidth: 110 }}>
                                        {col.label}
                                    </th>
                                ))}
                            </tr>
                            {/* Column search row */}
                            <tr style={{ background: "#fff" }}>
                                <td colSpan={3} style={{ position: "sticky", left: 0, zIndex: 3, background: "#fff", borderBottom: "1px solid var(--border)", borderRight: "1px solid var(--border)", padding: "5px 8px" }} />
                                {tableCols.map(col => (
                                    <td key={col.key} style={{ padding: "5px 8px", borderBottom: "1px solid var(--border)" }}>
                                        <input
                                            value={colFilters[col.key] || ""}
                                            onChange={e => setColFilter(col.key, e.target.value)}
                                            placeholder={`Search ${col.label.toLowerCase()}…`}
                                            style={{ width: "100%", padding: "5px 8px", borderRadius: 7, border: `1px solid ${colFilters[col.key] ? col.groupColor + "80" : "var(--border)"}`, fontSize: 11, outline: "none", background: colFilters[col.key] ? col.groupColor + "10" : "#fafafa", color: "var(--text)", minWidth: 90, boxSizing: "border-box" }}
                                        />
                                    </td>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {pagedEmployees.map((emp, idx) => {
                                const sc = STATUS_COLOR[emp.status] || { bg: "#f3f4f6", color: "#6b7280" }
                                const isChecked = selectedIds.has(emp.id)
                                return (
                                    <tr key={emp.id} style={{ background: isChecked ? "#eff6ff" : "#fff", borderBottom: "1px solid #eef0f3" }}
                                        onMouseEnter={e => { if (!isChecked) e.currentTarget.style.background = "#f9fafb" }}
                                        onMouseLeave={e => { if (!isChecked) e.currentTarget.style.background = "#fff" }}>
                                        <td style={{ position: "sticky", left: 0, zIndex: 2, background: "inherit", padding: "9px 10px", textAlign: "center", minWidth: 40 }}>
                                            <input type="checkbox" checked={isChecked} onChange={() => toggleOne(emp.id)}
                                                style={{ width: 14, height: 14, cursor: "pointer", accentColor: "var(--accent)" }} />
                                        </td>
                                        <td style={{ position: "sticky", left: 40, zIndex: 2, background: "inherit", padding: "9px 8px", textAlign: "center", fontSize: 11.5, color: "var(--text3)", fontWeight: 500, whiteSpace: "nowrap", minWidth: 34 }}>
                                            {(renderPage - 1) * rowsPerPage + idx + 1}
                                        </td>
                                        <td style={{ position: "sticky", left: 74, zIndex: 2, background: "inherit", padding: "7px 8px", borderRight: "1px solid var(--border)", textAlign: "center", minWidth: 46 }}>
                                            <button onClick={() => setEditEmp(emp)}
                                                title="Edit employee"
                                                style={{ padding: "5px 7px", borderRadius: 7, border: "1px solid var(--border)", background: "var(--surface)", cursor: "pointer", color: "var(--text3)", display: "inline-flex", alignItems: "center" }}>
                                                <Pencil size={12} />
                                            </button>
                                        </td>
                                        {tableCols.map(col => {
                                            const val = col.get(emp)
                                            const isStatus = col.key === "status"
                                            const isId = col.key === "employeeId"
                                            const isName = col.key === "fullName"
                                            return (
                                                <td key={col.key} style={{ padding: "9px 12px", whiteSpace: "nowrap", maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis" }}
                                                    title={val}>
                                                    {isStatus ? (
                                                        <span style={{ padding: "3px 10px", borderRadius: 20, fontSize: 10.5, fontWeight: 700, background: sc.bg, color: sc.color, letterSpacing: "0.3px" }}>
                                                            {val}
                                                        </span>
                                                    ) : (
                                                        <span style={{ fontSize: 12.5, fontWeight: isId || isName ? 600 : 400, color: val ? "var(--text)" : "var(--text3)" }}>
                                                            {val || "—"}
                                                        </span>
                                                    )}
                                                </td>
                                            )
                                        })}
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Footer — showing count · rows per page · numbered pagination */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12.5, color: "var(--text3)", flexWrap: "wrap", gap: 10 }}>
                <span>
                    Showing {filteredEmployees.length === 0 ? 0 : (renderPage - 1) * rowsPerPage + 1} to {(renderPage - 1) * rowsPerPage + pagedEmployees.length} of {filteredEmployees.length} employees
                    {activeFilterCount > 0 && <span style={{ color: "#f59e0b", fontWeight: 600 }}> ({activeFilterCount} filter{activeFilterCount > 1 ? "s" : ""})</span>}
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        Rows per page
                        <select value={rowsPerPage} onChange={e => setRowsPerPage(Number(e.target.value))}
                            style={{ padding: "5px 8px", borderRadius: 8, border: "1px solid var(--border)", fontSize: 12, background: "var(--surface)", color: "var(--text)", outline: "none", cursor: "pointer" }}>
                            {[25, 50, 100, 200].map(n => <option key={n} value={n}>{n}</option>)}
                        </select>
                    </span>
                    {renderTotalPages > 1 && (
                        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                            <PageBtn onClick={() => setRenderPage(1)} disabled={renderPage === 1}><ChevronsLeft size={14} /></PageBtn>
                            <PageBtn onClick={() => setRenderPage(p => Math.max(1, p - 1))} disabled={renderPage === 1}><ChevronLeft size={14} /></PageBtn>
                            {Array.from({ length: Math.min(5, renderTotalPages) }, (_, i) => {
                                const start = Math.max(1, Math.min(renderTotalPages - 4, renderPage - 2))
                                const p = start + i
                                if (p > renderTotalPages) return null
                                return (
                                    <button key={p} onClick={() => setRenderPage(p)}
                                        style={{
                                            minWidth: 30, height: 30, borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer",
                                            border: p === renderPage ? "1px solid var(--accent)" : "1px solid var(--border)",
                                            background: p === renderPage ? "var(--accent)" : "var(--surface)",
                                            color: p === renderPage ? "#fff" : "var(--text2)",
                                        }}>
                                        {p}
                                    </button>
                                )
                            })}
                            <PageBtn onClick={() => setRenderPage(p => Math.min(renderTotalPages, p + 1))} disabled={renderPage === renderTotalPages}><ChevronRight size={14} /></PageBtn>
                            <PageBtn onClick={() => setRenderPage(renderTotalPages)} disabled={renderPage === renderTotalPages}><ChevronsRight size={14} /></PageBtn>
                        </span>
                    )}
                </span>
            </div>
        </div>

        {/* ── Bulk action bar ─────────────────────────────────────────────────── */}
        {selectedIds.size > 0 && (
            <div style={{
                position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)",
                background: "#1e293b", color: "#fff", borderRadius: 14, padding: "10px 16px",
                display: "flex", alignItems: "center", gap: 10, zIndex: 60,
                boxShadow: "0 8px 32px rgba(0,0,0,0.28)", minWidth: 340
            }}>
                <CheckSquare size={15} style={{ color: "#60a5fa", flexShrink: 0 }} />
                <span style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>
                    {selectedIds.size} employee{selectedIds.size > 1 ? "s" : ""} selected
                </span>
                <button onClick={() => setSelectedIds(new Set())}
                    style={{ padding: "5px 10px", borderRadius: 8, border: "1px solid #475569", background: "transparent", color: "#94a3b8", fontSize: 11, cursor: "pointer" }}>
                    Deselect
                </button>
                <button onClick={handleDownloadSelected}
                    style={{ padding: "5px 12px", borderRadius: 8, border: "none", background: "#16a34a", color: "#fff", fontSize: 11, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}>
                    <FileSpreadsheet size={12} /> Download
                </button>
                {canDelete && (confirmDelete ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontSize: 11, color: "#fca5a5" }}>Sure? This cannot be undone.</span>
                        <button onClick={handleBulkDelete} disabled={deleting}
                            style={{ padding: "5px 12px", borderRadius: 8, border: "none", background: "#dc2626", color: "#fff", fontSize: 11, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}>
                            {deleting ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
                            {deleting ? "Deleting…" : "Confirm Delete"}
                        </button>
                        <button onClick={() => setConfirmDelete(false)}
                            style={{ padding: "5px 8px", borderRadius: 8, border: "1px solid #475569", background: "transparent", color: "#94a3b8", fontSize: 11, cursor: "pointer" }}>
                            Cancel
                        </button>
                    </div>
                ) : (
                    <button onClick={() => setConfirmDelete(true)}
                        style={{ padding: "5px 12px", borderRadius: 8, border: "none", background: "#dc2626", color: "#fff", fontSize: 11, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}>
                        <Trash2 size={11} /> Delete
                    </button>
                ))}
            </div>
        )}

        {/* Edit Drawer */}
        {editEmp && (
            <EditDrawer
                emp={editEmp}
                onClose={() => setEditEmp(null)}
                onSaved={fetchEmployees}
            />
        )}
        </>
    )
}
