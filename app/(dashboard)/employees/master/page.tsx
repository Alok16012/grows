"use client"
import { useState, useEffect, useCallback, useMemo } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Search, Loader2, RefreshCw, FileSpreadsheet, Filter, Pencil, X, Save, Trash2, CheckSquare } from "lucide-react"
import * as XLSX from "xlsx"

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
    branch: { id: string; name: string }
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
            { key: "branch",        label: "Branch",        get: e => e.branch?.name || "" },
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

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function EmployeeMasterPage() {
    const { data: session, status } = useSession()
    const router = useRouter()

    const [employees, setEmployees] = useState<Employee[]>([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState("")
    const [branchFilter, setBranchFilter] = useState("")
    const [statusFilter, setStatusFilter] = useState("")
    const [siteFilter, setSiteFilter] = useState("")
    const [sites, setSites] = useState<{id: string, name: string}[]>([])
    const [exporting, setExporting] = useState(false)
    const [visibleGroups, setVisibleGroups] = useState<Set<string>>(
        new Set(COLUMN_GROUPS.map(g => g.group))
    )
    const [colFilters, setColFilters] = useState<Record<string, string>>({})
    const [editEmp, setEditEmp] = useState<Employee | null>(null)
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
    const [deleting, setDeleting] = useState(false)
    const [confirmDelete, setConfirmDelete] = useState(false)

    useEffect(() => {
        if (status === "unauthenticated") router.push("/login")
    }, [status, router])

    const fetchEmployees = useCallback(async () => {
        setLoading(true)
        try {
            const params = new URLSearchParams()
            if (branchFilter) params.set("branchId", branchFilter)
            if (statusFilter) params.set("status", statusFilter)
            if (siteFilter) params.set("siteId", siteFilter)
            if (search) params.set("search", search)
            const res = await fetch(`/api/employees?${params.toString()}`)
            const data = await res.json()
            setEmployees(Array.isArray(data) ? data : [])
        } catch {
            toast.error("Failed to load employees")
        } finally {
            setLoading(false)
        }
    }, [branchFilter, statusFilter, siteFilter, search])

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

    const branches = Array.from(new Map(employees.map(e => [e.branch.id, e.branch])).values())

    const toggleGroup = (group: string) => {
        setVisibleGroups(prev => {
            const next = new Set(prev)
            next.has(group) ? next.delete(group) : next.add(group)
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
        try {
            const headers = ALL_COLS.map(c => c.label)
            const rows = selected.map(emp => ALL_COLS.map(c => c.get(emp)))
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
        setExporting(true)
        try {
            const headers = ALL_COLS.map(c => c.label)
            const rows = filteredEmployees.map(emp => ALL_COLS.map(c => c.get(emp)))
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

            // Branch summary
            const summaryData: string[][] = [["Branch", "Total", "Active", "Inactive", "Terminated"]]
            const byBranch = new Map<string, Employee[]>()
            filteredEmployees.forEach(e => {
                const key = e.branch.name
                if (!byBranch.has(key)) byBranch.set(key, [])
                byBranch.get(key)!.push(e)
            })
            byBranch.forEach((emps, branch) => {
                summaryData.push([
                    branch, String(emps.length),
                    String(emps.filter(e => e.status === "ACTIVE").length),
                    String(emps.filter(e => e.status === "INACTIVE").length),
                    String(emps.filter(e => e.status === "TERMINATED").length),
                ])
            })
            summaryData.push(["TOTAL", String(filteredEmployees.length),
                String(filteredEmployees.filter(e => e.status === "ACTIVE").length),
                String(filteredEmployees.filter(e => e.status === "INACTIVE").length),
                String(filteredEmployees.filter(e => e.status === "TERMINATED").length),
            ])
            const wsSummary = XLSX.utils.aoa_to_sheet(summaryData)
            wsSummary["!cols"] = [{ wch: 24 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 12 }]
            XLSX.utils.book_append_sheet(wb, wsSummary, "Branch Summary")

            const date = new Date().toISOString().slice(0, 10)
            XLSX.writeFile(wb, `Employee_Master_${date}.xlsx`)
            toast.success(`Exported ${filteredEmployees.length} employees`)
        } catch {
            toast.error("Export failed")
        } finally {
            setExporting(false)
        }
    }

    const visibleCols = COLUMN_GROUPS
        .filter(g => visibleGroups.has(g.group))
        .flatMap(g => g.cols.map(c => ({ ...c, groupColor: g.color, groupName: g.group })))

    const isAdmin = session?.user?.role === "ADMIN" || session?.user?.role === "MANAGER" || session?.user?.role === "HR_MANAGER"

    if (!isAdmin) return (
        <div className="flex items-center justify-center h-64 text-[var(--text3)] text-[13px]">Access denied</div>
    )

    return (
        <>
        <div style={{ display: "flex", flexDirection: "column", gap: 16, height: "100%", minHeight: 0 }}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div>
                    <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text)", margin: 0 }}>Employee Master</h1>
                    <p style={{ fontSize: 12, color: "var(--text3)", margin: "2px 0 0 0" }}>
                        Complete employee data — all fields, all employees
                    </p>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    {activeFilterCount > 0 && (
                        <button onClick={() => setColFilters({})}
                            style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 11px", borderRadius: 8, border: "1px solid #f59e0b40", background: "#fef9c3", fontSize: 11, color: "#92400e", cursor: "pointer", fontWeight: 600 }}>
                            <X size={11} /> Clear {activeFilterCount} filter{activeFilterCount > 1 ? "s" : ""}
                        </button>
                    )}
                    <button onClick={fetchEmployees} disabled={loading}
                        style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", fontSize: 12, color: "var(--text2)", cursor: "pointer" }}>
                        <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh
                    </button>
                    <button onClick={handleExport} disabled={exporting || filteredEmployees.length === 0}
                        style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 8, border: "none", background: "#16a34a", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", opacity: (exporting || filteredEmployees.length === 0) ? 0.6 : 1 }}>
                        {exporting ? <Loader2 size={13} className="animate-spin" /> : <FileSpreadsheet size={13} />}
                        {exporting ? "Exporting…" : `Download Excel (${filteredEmployees.length})`}
                    </button>
                </div>
            </div>

            {/* Stats */}
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {[
                    { label: "Total",      value: filteredEmployees.length,                                          color: "#3b82f6" },
                    { label: "Active",     value: filteredEmployees.filter(e => e.status === "ACTIVE").length,      color: "#16a34a" },
                    { label: "Inactive",   value: filteredEmployees.filter(e => e.status === "INACTIVE").length,    color: "#6b7280" },
                    { label: "On Leave",   value: filteredEmployees.filter(e => e.status === "ON_LEAVE").length,    color: "#f59e0b" },
                    { label: "Terminated", value: filteredEmployees.filter(e => e.status === "TERMINATED").length,  color: "#dc2626" },
                ].map(s => (
                    <div key={s.label} style={{ padding: "8px 14px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface)", minWidth: 90 }}>
                        <p style={{ fontSize: 10, color: "var(--text3)", margin: 0, fontWeight: 600, textTransform: "uppercase" }}>{s.label}</p>
                        <p style={{ fontSize: 20, fontWeight: 700, color: s.color, margin: 0, lineHeight: 1.2 }}>{s.value}</p>
                    </div>
                ))}
            </div>

            {/* Filters + Column toggles */}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <div style={{ position: "relative", flex: 1, minWidth: 200, maxWidth: 320 }}>
                    <Search size={13} style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: "var(--text3)" }} />
                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, ID, phone…"
                        style={{ width: "100%", padding: "6px 10px 6px 28px", borderRadius: 8, border: "1px solid var(--border)", fontSize: 12, outline: "none", background: "var(--surface)", color: "var(--text)", boxSizing: "border-box" }} />
                </div>
                <select value={branchFilter} onChange={e => setBranchFilter(e.target.value)}
                    style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid var(--border)", fontSize: 12, background: "var(--surface)", color: "var(--text)", outline: "none" }}>
                    <option value="">All Branches</option>
                    {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
                <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                    style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid var(--border)", fontSize: 12, background: "var(--surface)", color: "var(--text)", outline: "none" }}>
                    <option value="">All Status</option>
                    {["ACTIVE","INACTIVE","ON_LEAVE","TERMINATED","RESIGNED"].map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <select value={siteFilter} onChange={e => setSiteFilter(e.target.value)}
                    style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid var(--border)", fontSize: 12, background: "var(--surface)", color: "var(--text)", outline: "none" }}>
                    <option value="">All Sites</option>
                    {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>

                {(branchFilter || statusFilter || siteFilter || search) && (
                    <button onClick={() => { setBranchFilter(""); setStatusFilter(""); setSiteFilter(""); setSearch(""); }}
                        style={{ display: "flex", alignItems: "center", gap: 4, padding: "6px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "transparent", color: "#ef4444", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
                        <X size={12} /> Clear
                    </button>
                )}

                {/* Column group toggles */}
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
                    <Filter size={12} style={{ color: "var(--text3)" }} />
                    {COLUMN_GROUPS.map(g => (
                        <button key={g.group} onClick={() => toggleGroup(g.group)}
                            style={{ padding: "3px 8px", borderRadius: 20, fontSize: 10, fontWeight: 600, cursor: "pointer", border: `1px solid ${g.color}40`,
                                background: visibleGroups.has(g.group) ? g.color + "22" : "transparent",
                                color: visibleGroups.has(g.group) ? g.color : "var(--text3)",
                                transition: "all 0.15s" }}>
                            {g.group}
                        </button>
                    ))}
                </div>
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
                    <table style={{ borderCollapse: "collapse", width: "max-content", minWidth: "100%", fontSize: 12 }}>
                        <thead>
                            {/* Group header row — colSpan 3 covers checkbox + SL + edit */}
                            <tr style={{ background: "#f8fafc" }}>
                                <th colSpan={3} style={{ position: "sticky", left: 0, zIndex: 3, background: "#f8fafc", padding: "6px 10px", borderBottom: "1px solid var(--border)", borderRight: "2px solid var(--border)", textAlign: "center", fontSize: 10, fontWeight: 700, color: "var(--text3)", whiteSpace: "nowrap" }}>
                                    Actions
                                </th>
                                {COLUMN_GROUPS.filter(g => visibleGroups.has(g.group)).map(g => (
                                    <th key={g.group} colSpan={g.cols.length}
                                        style={{ padding: "6px 12px", borderBottom: "1px solid var(--border)", borderRight: "1px solid " + g.color + "40",
                                            background: g.color + "12", color: g.color, fontSize: 10, fontWeight: 700,
                                            textTransform: "uppercase", letterSpacing: "0.5px", textAlign: "center", whiteSpace: "nowrap" }}>
                                        {g.group}
                                    </th>
                                ))}
                            </tr>
                            {/* Column labels row */}
                            <tr style={{ background: "#f1f5f9" }}>
                                {/* Checkbox — select all */}
                                <th style={{ position: "sticky", left: 0, zIndex: 3, background: "#f1f5f9", padding: "5px 8px", borderBottom: "1px solid var(--border)", borderRight: "1px solid var(--border)", textAlign: "center", whiteSpace: "nowrap", minWidth: 36 }}>
                                    <input type="checkbox" checked={allSelected} ref={el => { if (el) el.indeterminate = someSelected }} onChange={toggleAll}
                                        style={{ width: 14, height: 14, cursor: "pointer", accentColor: "var(--accent)" }} />
                                </th>
                                <th style={{ position: "sticky", left: 36, zIndex: 3, background: "#f1f5f9", padding: "5px 8px", borderBottom: "1px solid var(--border)", borderRight: "1px solid var(--border)", textAlign: "center", fontSize: 10, fontWeight: 700, color: "var(--text3)", whiteSpace: "nowrap", minWidth: 32 }}>
                                    SL
                                </th>
                                <th style={{ position: "sticky", left: 68, zIndex: 3, background: "#f1f5f9", padding: "5px 8px", borderBottom: "1px solid var(--border)", borderRight: "2px solid var(--border)", textAlign: "center", fontSize: 10, fontWeight: 700, color: "var(--text3)", whiteSpace: "nowrap", minWidth: 42 }}>
                                    Edit
                                </th>
                                {visibleCols.map(col => (
                                    <th key={col.key} style={{ padding: "5px 10px", borderBottom: "1px solid var(--border)", borderRight: "1px solid var(--border)", textAlign: "left", fontSize: 10, fontWeight: 700, color: "var(--text3)", whiteSpace: "nowrap", minWidth: 90 }}>
                                        {col.label}
                                    </th>
                                ))}
                            </tr>
                            {/* Column filter row */}
                            <tr style={{ background: "#fff", borderBottom: "2px solid var(--border)" }}>
                                <td colSpan={3} style={{ position: "sticky", left: 0, zIndex: 3, background: "#fff", borderRight: "2px solid var(--border)", padding: "4px 6px" }} />
                                {visibleCols.map(col => (
                                    <td key={col.key} style={{ padding: "3px 6px", borderRight: "1px solid #e2e8f0" }}>
                                        <input
                                            value={colFilters[col.key] || ""}
                                            onChange={e => setColFilter(col.key, e.target.value)}
                                            placeholder="Filter…"
                                            style={{ width: "100%", padding: "3px 6px", borderRadius: 5, border: `1px solid ${colFilters[col.key] ? col.groupColor + "80" : "var(--border)"}`, fontSize: 10, outline: "none", background: colFilters[col.key] ? col.groupColor + "10" : "#fafafa", color: "var(--text)", minWidth: 70, boxSizing: "border-box" }}
                                        />
                                    </td>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {filteredEmployees.map((emp, idx) => {
                                const sc = STATUS_COLOR[emp.status] || { bg: "#f3f4f6", color: "#6b7280" }
                                const isChecked = selectedIds.has(emp.id)
                                return (
                                    <tr key={emp.id} style={{ background: isChecked ? "#eff6ff" : idx % 2 === 0 ? "#fff" : "#f8fafc", borderBottom: "1px solid var(--border)" }}
                                        onMouseEnter={e => { if (!isChecked) e.currentTarget.style.background = "#f0f9ff" }}
                                        onMouseLeave={e => { if (!isChecked) e.currentTarget.style.background = idx % 2 === 0 ? "#fff" : "#f8fafc" }}>
                                        {/* Checkbox */}
                                        <td style={{ position: "sticky", left: 0, zIndex: 2, background: "inherit", padding: "6px 8px", borderRight: "1px solid var(--border)", textAlign: "center", minWidth: 36 }}>
                                            <input type="checkbox" checked={isChecked} onChange={() => toggleOne(emp.id)}
                                                style={{ width: 14, height: 14, cursor: "pointer", accentColor: "var(--accent)" }} />
                                        </td>
                                        {/* SL */}
                                        <td style={{ position: "sticky", left: 36, zIndex: 2, background: "inherit", padding: "6px 8px", borderRight: "1px solid var(--border)", textAlign: "center", fontSize: 11, color: "var(--text3)", fontWeight: 600, whiteSpace: "nowrap", minWidth: 32 }}>
                                            {idx + 1}
                                        </td>
                                        {/* Edit button */}
                                        <td style={{ position: "sticky", left: 68, zIndex: 2, background: "inherit", padding: "4px 6px", borderRight: "2px solid var(--border)", textAlign: "center" }}>
                                            <button onClick={() => setEditEmp(emp)}
                                                title="Edit employee"
                                                style={{ padding: "4px 6px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--surface)", cursor: "pointer", color: "var(--accent)", display: "inline-flex", alignItems: "center" }}>
                                                <Pencil size={12} />
                                            </button>
                                        </td>
                                        {visibleCols.map(col => {
                                            const val = col.get(emp)
                                            const isStatus = col.key === "status"
                                            const filterVal = colFilters[col.key]
                                            const highlighted = filterVal && val.toLowerCase().includes(filterVal.toLowerCase())
                                            return (
                                                <td key={col.key} style={{ padding: "6px 10px", borderRight: "1px solid #e2e8f0", whiteSpace: "nowrap", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", color: "var(--text)", background: highlighted ? col.groupColor + "15" : undefined }}
                                                    title={val}>
                                                    {isStatus ? (
                                                        <span style={{ padding: "2px 8px", borderRadius: 20, fontSize: 10, fontWeight: 700, background: sc.bg, color: sc.color }}>
                                                            {val}
                                                        </span>
                                                    ) : (
                                                        <span style={{ fontSize: 12, color: val ? "var(--text)" : "var(--text3)" }}>
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

            {/* Footer */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 11, color: "var(--text3)" }}>
                <span>
                    Showing {filteredEmployees.length} of {employees.length} employee{employees.length !== 1 ? "s" : ""}
                    {activeFilterCount > 0 && <span style={{ color: "#f59e0b", fontWeight: 600 }}> ({activeFilterCount} column filter{activeFilterCount > 1 ? "s" : ""} active)</span>}
                </span>
                <span>{visibleCols.length} columns visible</span>
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
                {confirmDelete ? (
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
                )}
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
