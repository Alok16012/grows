"use client"

import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import { useSession } from "next-auth/react"
import { can } from "@/lib/can"
import { ChevronLeft, Save, Bell, FileText, Check, AlertTriangle, Loader2 } from "lucide-react"
import Link from "next/link"
import { toast } from "sonner"

export default function ReportConfigPage() {
    const { id: projectId } = useParams()
    const { data: session, status } = useSession()
    const router = useRouter()

    const [project, setProject] = useState<any>(null)
    const [templates, setTemplates] = useState<any[]>([])
    const [selectedFields, setSelectedFields] = useState<string[]>([])
    const [alertConfig, setAlertConfig] = useState({ defectThreshold: 5.0, notifyManager: true, notifyAdmin: true })
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        if (status === "unauthenticated") router.push("/login")
        if (status === "authenticated" && !can(session, "projects.view")) router.push("/")
    }, [status, session, router])

    useEffect(() => {
        const load = async () => {
            try {
                const [projRes, tempRes, alertRes] = await Promise.all([
                    fetch(`/api/projects/${projectId}`),
                    fetch(`/api/form-templates?projectId=${projectId}`),
                    fetch(`/api/projects/${projectId}/alert-config`)
                ])
                const proj = await projRes.json()
                const temps = await tempRes.json()
                const alert = await alertRes.json()

                setProject(proj)
                setTemplates(Array.isArray(temps) ? temps.sort((a: any, b: any) => a.displayOrder - b.displayOrder) : [])
                setAlertConfig({ defectThreshold: alert.defectThreshold || 5.0, notifyManager: alert.notifyManager ?? true, notifyAdmin: alert.notifyAdmin ?? true })

                // Load existing report config
                if (proj.reportConfig?.fields) {
                    setSelectedFields(proj.reportConfig.fields)
                } else {
                    // Default: all fields selected
                    setSelectedFields(temps.map((t: any) => t.id))
                }
            } catch {
                toast.error("Failed to load configuration")
            } finally {
                setLoading(false)
            }
        }
        load()
    }, [projectId, status])

    const toggleField = (fieldId: string) => {
        setSelectedFields(prev =>
            prev.includes(fieldId) ? prev.filter(id => id !== fieldId) : [...prev, fieldId]
        )
    }

    const handleSave = async () => {
        setSaving(true)
        try {
            const [projRes, alertRes] = await Promise.all([
                fetch(`/api/projects/${projectId}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ reportConfig: { fields: selectedFields } })
                }),
                fetch(`/api/projects/${projectId}/alert-config`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(alertConfig)
                })
            ])

            if (projRes.ok && alertRes.ok) {
                toast.success("Report configuration saved!")
            } else {
                toast.error("Failed to save some settings")
            }
        } catch {
            toast.error("Save failed")
        } finally {
            setSaving(false)
        }
    }

    if (loading) return (
        <div className="min-h-screen bg-[#f5f4f0] flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-[#1a9e6e]" />
        </div>
    )

    return (
        <div className="min-h-screen bg-[#f5f4f0] p-4 lg:p-7 max-w-3xl">
            {/* Header */}
            <div className="flex items-center gap-3 mb-6">
                <Link href={`/projects/${projectId}/form-builder`} className="w-9 h-9 flex items-center justify-center bg-white border border-[#e8e6e1] rounded-[8px] text-[#6b6860] hover:bg-[#f9f8f5] transition-colors">
                    <ChevronLeft className="h-4 w-4" />
                </Link>
                <div>
                    <h1 className="text-[20px] font-semibold text-[#1a1a18]">Report Configuration</h1>
                    <p className="text-[12px] text-[#9e9b95]">{project?.name} — {project?.company?.name}</p>
                </div>
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="ml-auto flex items-center gap-2 bg-[#1a9e6e] text-white px-4 py-2 rounded-[10px] text-[13px] font-medium hover:bg-[#158a5e] transition-colors disabled:opacity-50"
                >
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Save Config
                </button>
            </div>

            {/* PDF Field Selection */}
            <div className="bg-white border border-[#e8e6e1] rounded-[14px] p-5 mb-4">
                <div className="flex items-center gap-2 mb-4">
                    <FileText className="h-4 w-4 text-[#1a9e6e]" />
                    <h2 className="text-[14px] font-semibold text-[#1a1a18]">PDF Report — Field Selection</h2>
                    <span className="ml-auto text-[11px] text-[#9e9b95]">{selectedFields.length}/{templates.length} fields included</span>
                </div>
                <p className="text-[12px] text-[#9e9b95] mb-4">
                    Choose which fields appear in the exported <b>PDF report</b> for this project. This does not
                    change the inspection form itself — to stop a field being asked, hide it in the{" "}
                    <Link href={`/projects/${projectId}/form-builder`} className="text-[#1a9e6e] hover:underline">Form Builder</Link>.
                </p>

                <div className="flex gap-2 mb-4">
                    <button onClick={() => setSelectedFields(templates.map(t => t.id))} className="text-[11px] text-[#1a9e6e] hover:underline">Select All</button>
                    <span className="text-[#e8e6e1]">|</span>
                    <button onClick={() => setSelectedFields([])} className="text-[11px] text-[#9e9b95] hover:underline">Deselect All</button>
                </div>

                <div className="space-y-2">
                    {templates.map(t => (
                        <label key={t.id} className="flex items-center gap-3 p-3 rounded-[8px] hover:bg-[#f9f8f5] cursor-pointer transition-colors border border-transparent hover:border-[#e8e6e1]">
                            <div
                                onClick={() => toggleField(t.id)}
                                className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors cursor-pointer ${
                                    selectedFields.includes(t.id) ? "bg-[#1a9e6e] border-[#1a9e6e]" : "border-[#d4d1ca] bg-white"
                                }`}
                            >
                                {selectedFields.includes(t.id) && <Check className="h-3 w-3 text-white" />}
                            </div>
                            <div className="flex-1 min-w-0">
                                <span className="text-[13px] font-medium text-[#1a1a18]">{t.fieldLabel}</span>
                                <span className={`ml-2 text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                                    t.category === "DEFECT" ? "bg-orange-100 text-orange-700" :
                                    t.category === "AUTO" ? "bg-blue-100 text-blue-700" :
                                    "bg-gray-100 text-gray-600"
                                }`}>{t.category}</span>
                            </div>
                            <span className="text-[10px] text-[#9e9b95] bg-[#f9f8f5] px-2 py-0.5 rounded">{t.fieldType}</span>
                        </label>
                    ))}
                </div>

                {templates.length === 0 && (
                    <div className="text-center py-8 text-[#9e9b95] text-[13px]">
                        No form fields configured for this project yet.
                    </div>
                )}
            </div>

            {/* Alert Configuration */}
            <div className="bg-white border border-[#e8e6e1] rounded-[14px] p-5">
                <div className="flex items-center gap-2 mb-4">
                    <Bell className="h-4 w-4 text-[#d97706]" />
                    <h2 className="text-[14px] font-semibold text-[#1a1a18]">Alert Configuration</h2>
                </div>
                <p className="text-[12px] text-[#9e9b95] mb-4">Set thresholds for automatic risk alerts.</p>

                <div className="space-y-4">
                    <div>
                        <label className="text-[12px] font-semibold text-[#6b6860] uppercase tracking-wide block mb-2">
                            Defect / Rejection Threshold (%)
                        </label>
                        <div className="flex items-center gap-3">
                            <input
                                type="number"
                                min="0" max="100" step="0.5"
                                value={alertConfig.defectThreshold}
                                onChange={e => setAlertConfig(prev => ({ ...prev, defectThreshold: parseFloat(e.target.value) || 5.0 }))}
                                className="w-28 border border-[#e8e6e1] rounded-[8px] px-3 py-2 text-[14px] font-medium text-[#1a1a18] focus:outline-none focus:ring-2 focus:ring-[#1a9e6e]"
                            />
                            <span className="text-[13px] text-[#6b6860]">% rejection rate triggers a risk alert</span>
                        </div>
                        <p className="text-[11px] text-[#9e9b95] mt-1">Alert fires when project rejection rate exceeds this threshold.</p>
                    </div>

                    <div className="flex flex-col gap-3">
                        <label className="flex items-center gap-3 cursor-pointer">
                            <div
                                onClick={() => setAlertConfig(prev => ({ ...prev, notifyManager: !prev.notifyManager }))}
                                className={`w-10 h-6 rounded-full transition-colors cursor-pointer relative ${alertConfig.notifyManager ? "bg-[#1a9e6e]" : "bg-[#d4d1ca]"}`}
                            >
                                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${alertConfig.notifyManager ? "translate-x-5" : "translate-x-1"}`} />
                            </div>
                            <span className="text-[13px] text-[#1a1a18]">Notify Manager</span>
                        </label>
                        <label className="flex items-center gap-3 cursor-pointer">
                            <div
                                onClick={() => setAlertConfig(prev => ({ ...prev, notifyAdmin: !prev.notifyAdmin }))}
                                className={`w-10 h-6 rounded-full transition-colors cursor-pointer relative ${alertConfig.notifyAdmin ? "bg-[#1a9e6e]" : "bg-[#d4d1ca]"}`}
                            >
                                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${alertConfig.notifyAdmin ? "translate-x-5" : "translate-x-1"}`} />
                            </div>
                            <span className="text-[13px] text-[#1a1a18]">Notify Admin</span>
                        </label>
                    </div>

                    <div className="bg-[#fef3c7] border border-[#fbbf24] rounded-[8px] p-3 flex items-start gap-2 text-[12px] text-[#92400e]">
                        <AlertTriangle className="h-4 w-4 text-[#d97706] shrink-0 mt-0.5" />
                        <span>Risk alerts appear in the Manager Dashboard and are sent as in-app notifications. Email notifications can be configured in System Settings.</span>
                    </div>
                </div>
            </div>
        </div>
    )
}
