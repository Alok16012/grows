"use client"

import { useState, useRef, useEffect } from "react"
// xlsx is lazy-loaded — only needed when a sheet is actually read or written.
// Eager import adds ~430KB to this page's initial bundle.
const loadXLSX = () => import("xlsx")
import {
    Dialog,
    DialogContent,
    DialogTrigger,
} from "@/components/ui/dialog"
import { toast } from "sonner"

interface InspectorData {
    Name?: string
    Email?: string
    Phone?: string
    name?: string
    email?: string
    phone?: string
}

interface CreatedInspector {
    name: string
    email: string
    id: string
    tempPassword: string
    phone?: string
}

interface FailedInspector {
    name: string
    email: string
    error: string
}

interface SiteOption {
    id: string
    name: string
}

interface ProjectOption {
    id: string
    name: string
}

interface ManagerOption {
    id: string
    name: string
    email: string
}

interface BulkImportInspectorsProps {
    onImportComplete?: () => void
}

export default function BulkImportInspectors({ onImportComplete }: BulkImportInspectorsProps) {
    const [open, setOpen] = useState(false)
    const [step, setStep] = useState<"template" | "upload" | "preview" | "importing" | "results">("template")
    const [file, setFile] = useState<File | null>(null)
    const [parsedData, setParsedData] = useState<InspectorData[]>([])
    const [importing, setImporting] = useState(false)
    const [results, setResults] = useState<{ created: CreatedInspector[]; failed: FailedInspector[]; projectAssigned?: boolean } | null>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)

    // Group assignment state
    const [sites, setSites] = useState<SiteOption[]>([])
    const [projects, setProjects] = useState<ProjectOption[]>([])
    const [managers, setManagers] = useState<ManagerOption[]>([])
    const [selectedSiteId, setSelectedSiteId] = useState("")
    const [selectedProjectId, setSelectedProjectId] = useState("")
    const [selectedManagerIds, setSelectedManagerIds] = useState<string[]>([])

    useEffect(() => {
        if (open) {
            fetchSitesAndManagers()
        }
    }, [open])

    useEffect(() => {
        if (selectedSiteId) {
            fetchProjects(selectedSiteId)
        } else {
            setProjects([])
            setSelectedProjectId("")
        }
    }, [selectedSiteId])

    const fetchSitesAndManagers = async () => {
        try {
            const [siteRes, mgrRes] = await Promise.all([
                fetch("/api/sites?isActive=true"),
                fetch("/api/users?role=MANAGER")
            ])
            if (siteRes.ok) setSites(await siteRes.json())
            if (mgrRes.ok) setManagers(await mgrRes.json())
        } catch (error) {
            console.error("Failed to fetch sites/managers", error)
        }
    }

    const fetchProjects = async (siteId: string) => {
        try {
            const res = await fetch(`/api/projects?siteId=${siteId}`)
            if (res.ok) {
                const data = await res.json()
                setProjects(Array.isArray(data) ? data : [])
            }
        } catch (error) {
            console.error("Failed to fetch projects", error)
        }
    }

    const downloadTemplate = async () => {
        const XLSX = await loadXLSX()
        const ws = XLSX.utils.json_to_sheet([
            { Name: "John Doe", Email: "john@example.com", Phone: "1234567890" },
            { Name: "Jane Smith", Email: "jane@example.com", Phone: "9876543210" }
        ])
        const wb = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(wb, ws, "Inspectors")
        XLSX.writeFile(wb, "inspectors_template.xlsx")
    }

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files?.[0]
        if (!selectedFile) return

        setFile(selectedFile)

        const reader = new FileReader()
        reader.onload = async (event) => {
            try {
                const XLSX = await loadXLSX()
                const data = new Uint8Array(event.target?.result as ArrayBuffer)
                const workbook = XLSX.read(data, { type: "array" })
                const firstSheet = workbook.Sheets[workbook.SheetNames[0]]
                const json = XLSX.utils.sheet_to_json<InspectorData>(firstSheet)

                const validData = json
                    .filter(row => row.Name && row.Email)
                    .map(row => ({
                        name: String(row.Name).trim(),
                        email: String(row.Email).trim().toLowerCase(),
                        phone: row.Phone ? String(row.Phone).trim() : ""
                    }))

                if (validData.length === 0) {
                    toast.error("No valid rows found in the file")
                    return
                }

                setParsedData(validData)
                setStep("preview")
            } catch (error) {
                toast.error("Failed to parse Excel file")
                console.error(error)
            }
        }
        reader.readAsArrayBuffer(selectedFile)
    }

    const handleImport = async () => {
        if (parsedData.length === 0) return

        setImporting(true)
        setStep("importing")

        try {
            const requestBody: any = { inspectors: parsedData }

            // Include group assignment data if project selected
            if (selectedProjectId) {
                requestBody.projectId = selectedProjectId
            }
            if (selectedManagerIds.length > 0) {
                requestBody.managerIds = selectedManagerIds
            }

            const res = await fetch("/api/admin/inspectors/bulk", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(requestBody)
            })

            const data = await res.json()

            if (!res.ok) {
                throw new Error(data.error || "Import failed")
            }

            setResults(data)
            setStep("results")

            const groupMsg = data.projectAssigned ? " and assigned to group" : ""
            toast.success(`Successfully imported ${data.created.length} inspectors${groupMsg}`)
            onImportComplete?.()
        } catch (error: any) {
            toast.error(error.message || "Import failed")
            setStep("preview")
        } finally {
            setImporting(false)
        }
    }

    const exportResults = async () => {
        if (!results) return
        const XLSX = await loadXLSX()

        const exportData = [
            ...results.created.map(c => ({
                Status: "Success",
                Name: c.name,
                Email: c.email,
                ID: c.id,
                "Temp Password": c.tempPassword,
                Phone: c.phone || ""
            })),
            ...results.failed.map(f => ({
                Status: "Failed",
                Name: f.name,
                Email: f.email,
                ID: "",
                "Temp Password": "",
                Error: f.error
            }))
        ]

        const ws = XLSX.utils.json_to_sheet(exportData)
        const wb = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(wb, ws, "Import Results")
        XLSX.writeFile(wb, "inspectors_import_results.xlsx")
    }

    const resetDialog = () => {
        setStep("template")
        setFile(null)
        setParsedData([])
        setResults(null)
        setSelectedSiteId("")
        setSelectedProjectId("")
        setSelectedManagerIds([])
    }

    const handleOpenChange = (isOpen: boolean) => {
        setOpen(isOpen)
        if (!isOpen) {
            setTimeout(resetDialog, 300)
        }
    }

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogTrigger asChild>
                <button className="inline-flex items-center justify-center bg-white border border-[#e8e6e1] text-[#6b6860] px-3 rounded-[9px] text-[13px] font-medium hover:bg-[#f9f8f5] transition-colors">
                    <svg className="h-4 w-4 mr-2" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                        <circle cx="9" cy="7" r="4" />
                        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                    </svg>
                    Bulk Import
                </button>
            </DialogTrigger>
            <DialogContent className="bg-white rounded-[16px] w-[520px] max-w-[90vw] p-7" style={{ boxShadow: "0 20px 60px rgba(0,0,0,0.12)" }}>
                <div className="flex items-start justify-between mb-5">
                    <div>
                        <h2 className="text-[17px] font-semibold text-[#1a1a18]">Bulk Import Inspectors</h2>
                        <p className="text-[13px] text-[#6b6860] mt-1">Import multiple inspectors from an Excel file and optionally assign to a group</p>
                    </div>
                    <button
                        onClick={() => handleOpenChange(false)}
                        className="w-[30px] h-[30px] rounded-[8px] bg-[#f9f8f5] border border-[#e8e6e1] flex items-center justify-center hover:bg-red-50 hover:border-red-200 transition-colors"
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                </div>

                {step === "template" && (
                    <div className="space-y-4">
                        <div className="bg-[#f9f8f5] border border-[#e8e6e1] rounded-[12px] p-4">
                            <div className="flex items-center gap-2 mb-1">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1a9e6e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
                                    <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
                                </svg>
                                <span className="text-[13.5px] font-semibold text-[#1a1a18]">Assign to Group (Optional)</span>
                            </div>
                            <p className="text-[12.5px] text-[#6b6860] mb-3">Select a project to auto-assign imported inspectors</p>
                            <div className="space-y-2">
                                <label className="text-[11.5px] font-medium text-[#9e9b95] uppercase tracking-[0.5px]">Site</label>
                                <select
                                    className="w-full bg-white border border-[#e8e6e1] rounded-[9px] px-[14px] py-[10px] text-[13px] text-[#1a1a18] focus:border-[#1a9e6e] focus:ring-[3px] focus:ring-[rgba(26,158,110,0.08)] focus:outline-none transition-all cursor-pointer"
                                    value={selectedSiteId}
                                    onChange={(e) => setSelectedSiteId(e.target.value)}
                                >
                                    <option value="">Select Site (Optional)</option>
                                    {sites.map((c) => (
                                        <option key={c.id} value={c.id}>{c.name}</option>
                                    ))}
                                </select>
                            </div>

                            {selectedSiteId && (
                                <div className="space-y-2 mt-3">
                                    <label className="text-[11.5px] font-medium text-[#9e9b95] uppercase tracking-[0.5px]">Project</label>
                                    <select
                                        className="w-full bg-white border border-[#e8e6e1] rounded-[9px] px-[14px] py-[10px] text-[13px] text-[#1a1a18] focus:border-[#1a9e6e] focus:ring-[3px] focus:ring-[rgba(26,158,110,0.08)] focus:outline-none transition-all cursor-pointer"
                                        value={selectedProjectId}
                                        onChange={(e) => setSelectedProjectId(e.target.value)}
                                    >
                                        <option value="">Select Project</option>
                                        {projects.map((p) => (
                                            <option key={p.id} value={p.id}>{p.name}</option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            {selectedProjectId && managers.length > 0 && (
                                <div className="space-y-2 mt-3">
                                    <label className="text-[11.5px] font-medium text-[#9e9b95] uppercase tracking-[0.5px]">Assign Managers (Optional)</label>
                                    <div className="border border-[#e8e6e1] rounded-[9px] max-h-[100px] overflow-y-auto bg-white">
                                        {managers.map((m) => (
                                            <label key={m.id} className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-[#f9f8f5] transition-colors border-b border-[#e8e6e1] last:border-b-0">
                                                <input
                                                    type="checkbox"
                                                    checked={selectedManagerIds.includes(m.id)}
                                                    onChange={(e) => {
                                                        if (e.target.checked) {
                                                            setSelectedManagerIds([...selectedManagerIds, m.id])
                                                        } else {
                                                            setSelectedManagerIds(selectedManagerIds.filter(id => id !== m.id))
                                                        }
                                                    }}
                                                    className="rounded border-[#d4d1ca]"
                                                />
                                                <span className="text-[13px] text-[#1a1a18]">{m.name}</span>
                                                <span className="text-[12px] text-[#9e9b95]">({m.email})</span>
                                            </label>
                                        ))}
                                    </div>
                                    {selectedManagerIds.length > 0 && (
                                        <p className="text-[12px] text-[#6b6860]">{selectedManagerIds.length} manager(s) selected</p>
                                    )}
                                </div>
                            )}

                            {selectedProjectId && (
                                <div className="flex items-center gap-2 text-[12px] text-[#0d6b4a] bg-[#e8f7f1] rounded-[6px] p-2 mt-3">
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                                        <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
                                    </svg>
                                    <span>Inspectors will be auto-assigned to this project after import</span>
                                </div>
                            )}
                        </div>

                        <div className="bg-white border border-[#e8e6e1] rounded-[12px] p-5">
                            <div className="flex items-center gap-2 mb-1">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1a9e6e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                    <polyline points="14 2 14 8 20 8" />
                                    <line x1="8" y1="13" x2="16" y2="13" />
                                    <line x1="8" y1="17" x2="16" y2="17" />
                                </svg>
                                <span className="text-[15px] font-semibold text-[#1a1a18]">Step 1: Download Template</span>
                            </div>
                            <p className="text-[12.5px] text-[#6b6860] mb-4">Download the Excel template and fill in inspector details</p>
                            <button
                                onClick={downloadTemplate}
                                className="w-full bg-white border border-[1.5px] border-[#1a9e6e] text-[#0d6b4a] rounded-[9px] py-[10px] px-6 text-[13px] font-medium hover:bg-[#e8f7f1] transition-colors flex items-center justify-center gap-2"
                            >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                    <polyline points="7 10 12 15 17 10" />
                                    <line x1="12" y1="15" x2="12" y2="3" />
                                </svg>
                                Download Excel Template
                            </button>
                            <p className="text-[12px] text-[#9e9b95] bg-[#f9f8f5] border border-[#e8e6e1] rounded-[6px] p-2 text-center mt-3">
                                Template contains columns: Name, Email, Phone
                            </p>
                        </div>

                        <div className="flex items-center gap-3">
                            <div className="flex-1 h-px bg-[#e8e6e1]"></div>
                            <span className="text-[12.5px] text-[#6b6860] whitespace-nowrap">After filling the template, upload it below</span>
                            <div className="flex-1 h-px bg-[#e8e6e1]"></div>
                        </div>

                        <button
                            onClick={() => fileInputRef.current?.click()}
                            className="w-full bg-[#1a9e6e] text-white rounded-[9px] py-[10px] px-7 text-[13px] font-medium hover:bg-[#158a5e] transition-colors flex items-center justify-center gap-2"
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                <polyline points="17 8 12 3 7 8" />
                                <line x1="12" y1="3" x2="12" y2="15" />
                            </svg>
                            Upload Filled Template
                        </button>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".xlsx,.xls"
                            className="hidden"
                            onChange={handleFileChange}
                        />
                    </div>
                )}

                {step === "preview" && (
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="text-[13.5px] font-semibold text-[#1a1a18]">Preview</h3>
                            <div className="flex items-center gap-2">
                                <span className="bg-[#f9f8f5] border border-[#e8e6e1] rounded-[20px] px-[10px] py-[2px] text-[11.5px] font-medium text-[#6b6860]">{parsedData.length} inspectors</span>
                                {selectedProjectId && (
                                    <span className="bg-[#e8f7f1] border border-[rgba(26,158,110,0.3)] rounded-[20px] px-[10px] py-[2px] text-[11.5px] font-medium text-[#0d6b4a] flex items-center gap-1">
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                                            <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
                                        </svg>
                                        + Group Assign
                                    </span>
                                )}
                            </div>
                        </div>

                        <div className="border border-[#e8e6e1] rounded-[10px] overflow-hidden max-h-[200px] overflow-y-auto">
                            <table className="w-full text-[13px]">
                                <thead className="bg-[#f9f8f5]">
                                    <tr>
                                        <th className="px-4 py-2.5 text-left font-medium text-[#6b6860]">Name</th>
                                        <th className="px-4 py-2.5 text-left font-medium text-[#6b6860]">Email</th>
                                        <th className="px-4 py-2.5 text-left font-medium text-[#6b6860]">Phone</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {parsedData.map((row, idx) => (
                                        <tr key={idx} className="border-t border-[#e8e6e1]">
                                            <td className="px-4 py-2.5 text-[#1a1a18]">{row.name}</td>
                                            <td className="px-4 py-2.5 text-[#6b6860]">{row.email}</td>
                                            <td className="px-4 py-2.5 text-[#9e9b95]">{row.phone || "-"}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <div className="flex gap-3">
                            <button
                                onClick={() => { setStep("template"); setFile(null); }}
                                className="flex-1 bg-white border border-[#e8e6e1] text-[#6b6860] rounded-[9px] py-[10px] px-4 text-[13px] font-medium hover:bg-[#f9f8f5] transition-colors"
                            >
                                Back
                            </button>
                            <button
                                onClick={handleImport}
                                className="flex-1 bg-[#1a9e6e] text-white rounded-[9px] py-[10px] px-4 text-[13px] font-medium hover:bg-[#158a5e] transition-colors"
                            >
                                Import {parsedData.length} Inspectors{selectedProjectId ? " + Assign to Group" : ""}
                            </button>
                        </div>
                    </div>
                )}

                {step === "importing" && (
                    <div className="py-12 text-center">
                        <svg className="h-12 w-12 animate-spin mx-auto text-[#1a9e6e]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                        </svg>
                        <p className="text-[13px] text-[#6b6860] mt-4">
                            Importing inspectors{selectedProjectId ? " and assigning to group" : ""}...
                        </p>
                    </div>
                )}

                {step === "results" && results && (
                    <div className="space-y-4">
                        <div className="flex items-center gap-4">
                            <div className="flex items-center gap-2 text-[#0d6b4a]">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                                    <polyline points="22 4 12 14.01 9 11.01" />
                                </svg>
                                <span className="text-[13px] font-medium">{results.created.length} created</span>
                            </div>
                            {results.failed.length > 0 && (
                                <div className="flex items-center gap-2 text-[#dc2626]">
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <circle cx="12" cy="12" r="10" />
                                        <line x1="15" y1="9" x2="9" y2="15" />
                                        <line x1="9" y1="9" x2="15" y2="15" />
                                    </svg>
                                    <span className="text-[13px] font-medium">{results.failed.length} failed</span>
                                </div>
                            )}
                            {results.projectAssigned && (
                                <span className="bg-[#e8f7f1] border border-[rgba(26,158,110,0.3)] rounded-[20px] px-[10px] py-[2px] text-[11.5px] font-medium text-[#0d6b4a] flex items-center gap-1">
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                                        <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
                                    </svg>
                                    Group Assigned
                                </span>
                            )}
                        </div>

                        {results.created.length > 0 && (
                            <div className="border border-[#e8e6e1] rounded-[10px] overflow-hidden max-h-[180px] overflow-y-auto">
                                <table className="w-full text-[13px]">
                                    <thead className="bg-[#f9f8f5]">
                                        <tr>
                                            <th className="px-4 py-2.5 text-left font-medium text-[#6b6860]">Name</th>
                                            <th className="px-4 py-2.5 text-left font-medium text-[#6b6860]">Email</th>
                                            <th className="px-4 py-2.5 text-left font-medium text-[#6b6860]">Temp Password</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {results.created.map((row, idx) => (
                                            <tr key={idx} className="border-t border-[#e8e6e1] bg-[#f0fdf4]">
                                                <td className="px-4 py-2.5 text-[#1a1a18]">{row.name}</td>
                                                <td className="px-4 py-2.5 text-[#6b6860]">{row.email}</td>
                                                <td className="px-4 py-2.5 font-mono text-[12px] text-[#1a1a18]">{row.tempPassword}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {results.failed.length > 0 && (
                            <div className="border border-[#e8e6e1] rounded-[10px] overflow-hidden max-h-[120px] overflow-y-auto">
                                <table className="w-full text-[13px]">
                                    <thead className="bg-[#f9f8f5]">
                                        <tr>
                                            <th className="px-4 py-2.5 text-left font-medium text-[#6b6860]">Name</th>
                                            <th className="px-4 py-2.5 text-left font-medium text-[#6b6860]">Email</th>
                                            <th className="px-4 py-2.5 text-left font-medium text-[#6b6860]">Error</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {results.failed.map((row, idx) => (
                                            <tr key={idx} className="border-t border-[#e8e6e1] bg-[#fef2f2]">
                                                <td className="px-4 py-2.5 text-[#1a1a18]">{row.name}</td>
                                                <td className="px-4 py-2.5 text-[#6b6860]">{row.email}</td>
                                                <td className="px-4 py-2.5 text-[#dc2626] text-[12px]">{row.error}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        <div className="flex gap-3 pt-2">
                            <button
                                onClick={exportResults}
                                className="bg-white border border-[#e8e6e1] text-[#6b6860] rounded-[9px] py-[10px] px-4 text-[13px] font-medium hover:bg-[#f9f8f5] transition-colors flex items-center gap-2"
                            >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                    <polyline points="7 10 12 15 17 10" />
                                    <line x1="12" y1="15" x2="12" y2="3" />
                                </svg>
                                Export Results
                            </button>
                            <button
                                onClick={() => handleOpenChange(false)}
                                className="flex-1 bg-[#1a9e6e] text-white rounded-[9px] py-[10px] px-4 text-[13px] font-medium hover:bg-[#158a5e] transition-colors"
                            >
                                Done
                            </button>
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    )
}
