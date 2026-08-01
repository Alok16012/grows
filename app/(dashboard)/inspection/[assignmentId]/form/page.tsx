"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter, useParams } from "next/navigation"
import { useSession } from "next-auth/react"
import {
    ChevronLeft,
    Save,
    Send,
    Loader2,
    CheckCircle2,
    Upload,
    ExternalLink,
    Camera,
    MapPin,
    Timer,
    ClipboardList,
    ArrowRight,
    X
} from "lucide-react"
import { cn } from "@/lib/utils"
import CameraCapture from "@/components/CameraCapture"
import { DocumentViewer } from "@/components/DocumentViewer"

export default function InspectionFormPage() {
    const { data: session, status: authStatus } = useSession()
    const router = useRouter()
    const { assignmentId } = useParams()

    const [assignment, setAssignment] = useState<any>(null)
    const [templates, setTemplates] = useState<any[]>([])
    const [inspection, setInspection] = useState<any>(null)
    const [responses, setResponses] = useState<Record<string, string>>({})
    const [errors, setErrors] = useState<Record<string, string>>({})
    const [previewUrl, setPreviewUrl] = useState<string | null>(null)
    const [previewName, setPreviewName] = useState<string>("")

    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [lastSaved, setLastSaved] = useState<Date | null>(null)
    const [isDirty, setIsDirty] = useState(false)
    const [cameraFieldId, setCameraFieldId] = useState<string | null>(null)
    const [currentStep, setCurrentStep] = useState(0)
    const [gpsLocation, setGpsLocation] = useState<{ lat: number; lng: number; accuracy: number } | null>(null)
    const [gpsStatus, setGpsStatus] = useState<"idle" | "loading" | "ok" | "denied">("idle")
    const [startedAt] = useState<Date>(new Date())
    const [elapsed, setElapsed] = useState(0)

    const isAdmin = session?.user?.role === "ADMIN"
    const canEdit = inspection?.status === "draft" || isAdmin

    // Other assignments of this inspector that still need filling — powers the
    // "which project do you want to fill?" chooser and the pending banner.
    const [otherPending, setOtherPending] = useState<any[]>([])
    const [showChooser, setShowChooser] = useState(false)

    useEffect(() => {
        if (authStatus !== "authenticated" || session?.user?.role !== "INSPECTION_BOY") return
        fetch("/api/assignments?status=all")
            .then(r => (r.ok ? r.json() : []))
            .then((list: any[]) => {
                if (!Array.isArray(list)) return
                const pending = list.filter(a =>
                    a.id !== assignmentId &&
                    a.status === "active" &&
                    (!a.inspection || a.inspection.status === "draft")
                )
                setOtherPending(pending)
                // Ask which form to fill — once per browser session, and only
                // when there genuinely is a choice to make.
                if (pending.length > 0 && !sessionStorage.getItem("insp-chooser-seen")) {
                    setShowChooser(true)
                }
            })
            .catch(() => { /* non-fatal */ })
    }, [authStatus, session?.user?.role, assignmentId])

    const dismissChooser = () => {
        sessionStorage.setItem("insp-chooser-seen", "1")
        setShowChooser(false)
    }

    const switchToAssignment = (id: string) => {
        sessionStorage.setItem("insp-chooser-seen", "1")
        setShowChooser(false)
        router.push(`/inspection/${id}/form`)
    }

    // Work timer
    useEffect(() => {
        if (canEdit) {
            const timer = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt.getTime()) / 1000)), 1000)
            return () => clearInterval(timer)
        }
    }, [canEdit, startedAt])

    // GPS capture on form load
    useEffect(() => {
        if (canEdit && "geolocation" in navigator) {
            setGpsStatus("loading")
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    setGpsLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy })
                    setGpsStatus("ok")
                },
                () => setGpsStatus("denied"),
                { enableHighAccuracy: true, timeout: 10000 }
            )
        }
    }, [canEdit])

    useEffect(() => {
        if (authStatus === "unauthenticated") {
            router.push("/login")
        } else if (authStatus === "authenticated" && session?.user?.role !== "INSPECTION_BOY" && session?.user?.role !== "ADMIN") {
            router.push("/")
        }
    }, [authStatus, session, router])

    const fetchPageData = useCallback(async () => {
        setLoading(true)
        try {
            const assRes = await fetch(`/api/assignments/${assignmentId}`)
            if (!assRes.ok) {
                console.error("Assignment fetch failed")
                router.push("/inspection")
                return
            }
            const currentAss = await assRes.json()
            setAssignment(currentAss)

            const targetProjectId = currentAss.projectId || currentAss.project?.id
            const [tempRes, inspRes] = await Promise.all([
                fetch(`/api/form-templates?projectId=${targetProjectId}`),
                fetch(`/api/inspections?assignmentId=${assignmentId}`)
            ])

            const tempData = await tempRes.json()
            setTemplates(Array.isArray(tempData) ? tempData.sort((a: any, b: any) => a.displayOrder - b.displayOrder) : [])

            let inspData = await inspRes.json()

            if (!inspData || inspData.error || (Array.isArray(inspData) && inspData.length === 0)) {
                const createRes = await fetch("/api/inspections", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ assignmentId })
                })
                inspData = await createRes.json()
            }

            setInspection(inspData)

            const initialResponses: Record<string, string> = {}
            if (inspData.responses) {
                inspData.responses.forEach((r: any) => {
                    initialResponses[r.fieldId] = r.value || ""
                })
            }
            if (inspData.paperFormPhoto) {
                initialResponses["paperFormPhoto"] = inspData.paperFormPhoto;
            }

            const todayStr = new Date().toISOString().split('T')[0]
            tempData.forEach((t: any) => {
                if (t.fieldType === "date" && !initialResponses[t.id]) {
                    initialResponses[t.id] = todayStr
                }
            })

            setResponses(initialResponses)
            if (inspData.submittedAt) {
                const d = new Date(inspData.submittedAt)
                if (!isNaN(d.getTime())) setLastSaved(d)
            } else if (inspData.status === "draft") {
                setLastSaved(new Date())
            }

        } catch (error) {
            console.error("Failed to fetch page data", error)
        } finally {
            setLoading(false)
        }
    }, [assignmentId, router])

    useEffect(() => {
        if (authStatus === "authenticated") {
            fetchPageData()
        }
    }, [authStatus, fetchPageData])

    useEffect(() => {
        const timer = setInterval(() => {
            if (isDirty && inspection?.status === "draft") {
                saveForm("draft", true)
            }
        }, 30000)
        return () => clearInterval(timer)
    }, [isDirty, inspection, responses])

    useEffect(() => {
        if ((!canEdit) || templates.length === 0) return

        const fieldMap: Record<string, string> = {}
        const defectIds: string[] = []

        templates.forEach(t => {
            const label = t.fieldLabel.toUpperCase().trim()
            fieldMap[label] = t.id
            if (t.category === "DEFECT") defectIds.push(t.id)
        })

        const getVal = (label: string) => parseFloat(responses[fieldMap[label]] || "0") || 0

        const totalDefects = defectIds.reduce((sum, id) => sum + (parseFloat(responses[id] || "0") || 0), 0)

        const inspectedQty = getVal("INSPECTED QTY")
        const reworkQty = getVal("REWORK QTY")

        const rejectedQty = Math.max(0, totalDefects - reworkQty)

        const acceptedQty = Math.max(0, inspectedQty - reworkQty - rejectedQty)

        let reworkPct = 0, rejectedPct = 0, reworkPpm = 0, rejectionPpm = 0
        if (inspectedQty > 0) {
            reworkPct = (reworkQty / inspectedQty) * 100
            rejectedPct = (rejectedQty / inspectedQty) * 100
            reworkPpm = (reworkQty / inspectedQty) * 1000000
            rejectionPpm = (rejectedQty / inspectedQty) * 1000000
        }

        const difference = totalDefects - reworkQty - rejectedQty

        let updates: Record<string, string> = {}
        const setIfChanged = (label: string, value: string | number) => {
            const id = fieldMap[label]
            const valStr = value.toString()
            if (id && responses[id] !== valStr) updates[id] = valStr
        }

        setIfChanged("TOTAL DEFECTS", totalDefects)
        setIfChanged("REJECTED QTY", rejectedQty)
        setIfChanged("ACCEPTED QTY", acceptedQty)
        setIfChanged("REWORK %", reworkPct.toFixed(2))
        setIfChanged("REJECTED %", rejectedPct.toFixed(2))
        setIfChanged("REWORK PPM", Math.round(reworkPpm))
        setIfChanged("REJECTION PPM", Math.round(rejectionPpm))
        setIfChanged("DIFFERENCE", difference)

        if (fieldMap["INSPECTOR NAME"] && !responses[fieldMap["INSPECTOR NAME"]] && session?.user?.name) {
            updates[fieldMap["INSPECTOR NAME"]] = session.user.name
        }

        if (Object.keys(updates).length > 0) {
            setResponses(prev => ({ ...prev, ...updates }))
            setIsDirty(true)
        }
    }, [responses, templates, inspection?.status, session])

    const handleFieldChange = (fieldId: string, value: string) => {
        if (!canEdit) return
        setResponses(prev => ({ ...prev, [fieldId]: value }))
        setIsDirty(true)

        if (errors[fieldId]) {
            setErrors(prev => {
                const newErrors = { ...prev }
                delete newErrors[fieldId]
                return newErrors
            })
        }
    }

    const validateForm = () => {
        const newErrors: Record<string, string> = {}
        templates.forEach(t => {
            if (t.isRequired && !responses[t.id]) {
                newErrors[t.id] = "This field is required"
            }
        })
        setErrors(newErrors)

        if (Object.keys(newErrors).length > 0) {
            const firstErrorId = Object.keys(newErrors)[0]
            const element = document.getElementById(`field-${firstErrorId}`)
            element?.scrollIntoView({ behavior: "smooth", block: "center" })
            return false
        }
        return true
    }

    const fixedFields = templates.filter(t => t.category === "FIXED")
    const defectFields = templates.filter(t => t.category === "DEFECT")
    const autoFields = templates.filter(t => t.category === "AUTO")

    // ── Step-wise wizard (payroll-style) ──────────────────────────────────────
    // Steps are built dynamically so empty sections (no defects / no auto fields)
    // are skipped instead of showing a blank step.
    const steps: { key: string; label: string; fields: any[] }[] = [
        { key: "basic", label: "Basic Info", fields: fixedFields },
    ]
    if (defectFields.length > 0) steps.push({ key: "defect", label: "Defect Entry", fields: defectFields })
    if (autoFields.length > 0) steps.push({ key: "review", label: "Review", fields: [] })
    steps.push({ key: "attach", label: "Attachments", fields: [] })
    const totalSteps = steps.length
    const stepIndex = Math.min(currentStep, totalSteps - 1)
    const currentStepDef = steps[stepIndex]

    const validateCurrentStep = () => {
        const currentFields = steps[stepIndex]?.fields ?? []

        let hasError = false
        const newErrors: Record<string, string> = {}
        currentFields.forEach(t => {
            if (t.isRequired && !responses[t.id]) {
                newErrors[t.id] = "This field is required"
                hasError = true
            }
        })
        if (hasError) {
            setErrors(prev => ({ ...prev, ...newErrors }))
            const firstErrorId = currentFields.find(t => t.isRequired && !responses[t.id])?.id
            if (firstErrorId) {
                const el = document.getElementById(`field-${firstErrorId}`)
                el?.scrollIntoView({ behavior: "smooth", block: "center" })
            }
            return false
        }
        return true
    }

    const handleNextStep = () => {
        if (validateCurrentStep()) {
            setCurrentStep(Math.min(stepIndex + 1, totalSteps - 1))
            window.scrollTo({ top: 0, behavior: "smooth" })
            saveForm("draft", true)
        }
    }

    const handlePrevStep = () => {
        setCurrentStep(Math.max(stepIndex - 1, 0))
        window.scrollTo({ top: 0, behavior: "smooth" })
        saveForm("draft", true)
    }

    // Jump to a specific step. Going back is free; going forward validates the
    // current step first (mirrors the Next button).
    const goToStep = (target: number) => {
        if (target === stepIndex) return
        if (target < stepIndex) {
            setCurrentStep(target)
            window.scrollTo({ top: 0, behavior: "smooth" })
            if (canEdit) saveForm("draft", true)
        } else if (validateCurrentStep()) {
            setCurrentStep(target)
            window.scrollTo({ top: 0, behavior: "smooth" })
            if (canEdit) saveForm("draft", true)
        }
    }

    const saveForm = async (status: string = "draft", holdsSilent = false) => {
        if (!inspection || !canEdit) return
        // Admin editing submitted inspection — preserve the current status, never downgrade
        const effectiveStatus = isAdmin && inspection.status !== "draft" ? inspection.status : status

        if (!holdsSilent) setSaving(true)

        try {
            const resData = Object.entries(responses).map(([fieldId, value]) => ({
                fieldId,
                value
            }))

            const body: any = {
                responses: resData,
                status: effectiveStatus,
                startedAt: startedAt.toISOString()
            }
            if (gpsLocation && effectiveStatus === "pending") {
                body.gpsLocation = JSON.stringify(gpsLocation)
            }

            const res = await fetch(`/api/inspections/${inspection.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body)
            })

            if (res.ok) {
                const updated = await res.json()
                setInspection(updated)
                setIsDirty(false)
                setLastSaved(new Date())
                if (effectiveStatus === "pending") {
                    router.push("/inspection")
                }
            } else {
                const errorData = await res.json().catch(() => ({}))
                const errorMsg = errorData.details || errorData.error || "Failed to save inspection"
                if (!holdsSilent) alert(`Save Failed: ${errorMsg}`)
            }
        } catch (error: any) {
            console.error("Save error", error)
            if (!holdsSilent) alert(`An error occurred while saving: ${error.message || error}`)
        } finally {
            if (!holdsSilent) setSaving(false)
        }
    }

    const handleSubmit = () => {
        if (validateForm()) {
            saveForm("pending")
        }
    }

    const handleFileUpload = async (fieldId: string, file: File) => {
        if (!canEdit) return

        const formData = new FormData()
        formData.append("file", file)

        try {
            setSaving(true)
            const res = await fetch("/api/upload", {
                method: "POST",
                body: formData
            })
            const data = await res.json()
            if (data.url) {
                handleFieldChange(fieldId, data.url)
            } else {
                alert("Upload failed")
            }
        } catch (error) {
            alert("Upload failed")
        } finally {
            setSaving(false)
        }
    }

    const renderBasicField = (template: any) => {
        const value = responses[template.id] || ""
        const error = errors[template.id]
        const readOnly = !canEdit

        // ── Checkbox fieldType ─────────────────────────────────────────────────
        if (template.fieldType === "checkbox") {
            const isChecked = value === "true"
            return (
                <div key={template.id} id={`field-${template.id}`}
                    className={`bg-white border ${error ? "border-[#dc2626]" : isChecked ? "border-[#1a9e6e]" : "border-[#e8e6e1]"} rounded-[10px] mb-[8px] transition-all duration-150 ${isChecked ? "bg-[#f0fdf4]" : ""}`}>
                    <button
                        type="button"
                        disabled={readOnly}
                        onClick={() => handleFieldChange(template.id, isChecked ? "false" : "true")}
                        className="w-full flex items-center justify-between p-[14px_16px] cursor-pointer disabled:cursor-default"
                    >
                        <div className="flex items-center gap-3 text-left">
                            {/* Big tick circle */}
                            <div className={`w-[28px] h-[28px] rounded-full flex items-center justify-center flex-shrink-0 border-2 transition-all duration-200 ${isChecked ? "bg-[#1a9e6e] border-[#1a9e6e]" : "bg-white border-[#d4d1ca]"}`}>
                                {isChecked && (
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                        <polyline points="20 6 9 17 4 12" />
                                    </svg>
                                )}
                            </div>
                            <div>
                                <p className={`text-[13px] font-[600] transition-colors ${isChecked ? "text-[#0d6b4a]" : "text-[#1a1a18]"}`}>
                                    {template.fieldLabel}
                                    {template.isRequired && <span className="text-[#dc2626] ml-1">*</span>}
                                </p>
                                {template.options && (
                                    <p className="text-[11px] text-[#9e9b95] mt-[1px]">{template.options}</p>
                                )}
                            </div>
                        </div>
                        <div className={`text-[12px] font-[700] px-[10px] py-[4px] rounded-[20px] flex-shrink-0 ml-3 transition-all ${isChecked ? "bg-[#dcfce7] text-[#15803d]" : "bg-[#f3f4f6] text-[#9ca3af]"}`}>
                            {isChecked ? "✓ Done" : "Pending"}
                        </div>
                    </button>
                    {error && <p className="text-[11px] font-medium text-[#dc2626] px-[16px] pb-[10px]">{error}</p>}
                </div>
            )
        }

        // ── OK / NG fieldType (pass / fail) ───────────────────────────────────
        if (template.fieldType === "ok_ng" || template.fieldType === "pass_fail") {
            const isOK = value === "OK" || value === "PASS"
            const isNG = value === "NG" || value === "FAIL"
            const okLabel  = template.fieldType === "pass_fail" ? "PASS" : "OK"
            const ngLabel  = template.fieldType === "pass_fail" ? "FAIL" : "NG"
            return (
                <div key={template.id} id={`field-${template.id}`}
                    className={`bg-white border ${error ? "border-[#dc2626]" : isOK ? "border-[#1a9e6e]" : isNG ? "border-[#dc2626]" : "border-[#e8e6e1]"} rounded-[10px] mb-[8px] p-[12px_14px] transition-all duration-150`}>
                    <div className="flex items-center justify-between mb-[10px]">
                        <div className="text-[11px] font-[600] text-[#6b6860] uppercase tracking-[0.4px]">
                            {template.fieldLabel}
                            {template.isRequired && <span className="text-[#dc2626] ml-1">*</span>}
                        </div>
                        <div className="text-[10px] font-[500] px-[8px] py-[2px] rounded-[20px] bg-[#f5f3ff] text-[#7c3aed]">INSPECTION</div>
                    </div>
                    <div className="grid grid-cols-2 gap-[8px]">
                        <button type="button" disabled={readOnly}
                            onClick={() => handleFieldChange(template.id, okLabel)}
                            className={`py-[12px] rounded-[10px] text-[14px] font-[700] border-2 transition-all duration-200 disabled:opacity-60 disabled:cursor-default flex items-center justify-center gap-2 ${isOK ? "bg-[#1a9e6e] border-[#1a9e6e] text-white shadow-sm" : "bg-white border-[#e8e6e1] text-[#6b6860] hover:border-[#1a9e6e] hover:text-[#1a9e6e]"}`}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                            {okLabel}
                        </button>
                        <button type="button" disabled={readOnly}
                            onClick={() => handleFieldChange(template.id, ngLabel)}
                            className={`py-[12px] rounded-[10px] text-[14px] font-[700] border-2 transition-all duration-200 disabled:opacity-60 disabled:cursor-default flex items-center justify-center gap-2 ${isNG ? "bg-[#dc2626] border-[#dc2626] text-white shadow-sm" : "bg-white border-[#e8e6e1] text-[#6b6860] hover:border-[#dc2626] hover:text-[#dc2626]"}`}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                            {ngLabel}
                        </button>
                    </div>
                    {error && <p className="text-[11px] font-medium text-[#dc2626] mt-2">{error}</p>}
                </div>
            )
        }

        // ── Rating (1-5 stars) ─────────────────────────────────────────────────
        if (template.fieldType === "rating") {
            const rating = parseInt(value) || 0
            return (
                <div key={template.id} id={`field-${template.id}`}
                    className={`bg-white border ${error ? "border-[#dc2626]" : "border-[#e8e6e1]"} rounded-[10px] mb-[8px] p-[12px_14px] transition-all duration-150`}>
                    <div className="flex items-center justify-between mb-[10px]">
                        <div className="text-[11px] font-[600] text-[#6b6860] uppercase tracking-[0.4px]">
                            {template.fieldLabel}
                            {template.isRequired && <span className="text-[#dc2626] ml-1">*</span>}
                        </div>
                        <div className="text-[10px] font-[500] px-[8px] py-[2px] rounded-[20px] bg-[#fef3c7] text-[#d97706]">RATING</div>
                    </div>
                    <div className="flex gap-[8px]">
                        {[1,2,3,4,5].map(star => (
                            <button key={star} type="button" disabled={readOnly}
                                onClick={() => handleFieldChange(template.id, String(rating === star ? 0 : star))}
                                className="text-[28px] transition-transform hover:scale-110 disabled:cursor-default">
                                {star <= rating ? "⭐" : "☆"}
                            </button>
                        ))}
                        {rating > 0 && <span className="text-[12px] font-[600] text-[#d97706] self-center ml-1">{rating}/5</span>}
                    </div>
                    {error && <p className="text-[11px] font-medium text-[#dc2626] mt-2">{error}</p>}
                </div>
            )
        }

        // ── Default fields (text, number, date, textarea, dropdown) ───────────
        let pillClass = ""
        let pillText = template.fieldType.toUpperCase()
        if (template.fieldType === "date") pillClass = "bg-[#eff6ff] text-[#3b82f6]"
        else if (template.fieldType === "dropdown") pillClass = "bg-[#f5f3ff] text-[#7c3aed]"
        else if (template.fieldType === "number") pillClass = "bg-[#fef3c7] text-[#d97706]"
        else pillClass = "bg-[#f9f8f5] text-[#9e9b95] border border-[#e8e6e1]"

        const dropdownBg = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239e9b95' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='9 18 15 12 9 6'/%3E%3C/svg%3E")`

        return (
            <div key={template.id} id={`field-${template.id}`} className={`bg-white border ${error ? 'border-[#dc2626]' : 'border-[#e8e6e1]'} rounded-[10px] mb-[8px] focus-within:border-[#1a9e6e] focus-within:shadow-[0_0_0_3px_rgba(26,158,110,0.06)] transition-all duration-150`}>
                <div className="flex justify-between items-center p-[10px_14px_0]">
                    <div className="text-[11px] font-[600] text-[#6b6860] uppercase tracking-[0.4px]">
                        {template.fieldLabel}
                        {template.isRequired && <span className="text-[#dc2626] ml-1">*</span>}
                    </div>
                    <div className={`text-[10px] font-[500] px-[8px] py-[2px] rounded-[20px] ${pillClass}`}>
                        {pillText}
                    </div>
                </div>
                <div className="p-[4px_12px_10px]">
                    {template.fieldType === "dropdown" ? (
                        <select
                            value={value}
                            onChange={(e) => handleFieldChange(template.id, e.target.value)}
                            disabled={readOnly}
                            className="w-full bg-transparent border-none outline-none text-[14px] font-[500] text-[#1a1a18] appearance-none"
                            style={{ backgroundImage: dropdownBg, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 10px center' }}
                        >
                            <option value="" disabled className="text-[#9e9b95]">Select option...</option>
                            {template.options?.split(",").map((opt: string) => (
                                <option key={opt.trim()} value={opt.trim()}>{opt.trim()}</option>
                            ))}
                        </select>
                    ) : template.fieldType === "textarea" ? (
                        <textarea
                            value={value}
                            onChange={(e) => handleFieldChange(template.id, e.target.value)}
                            disabled={readOnly}
                            rows={3}
                            placeholder={`Enter ${template.fieldLabel.toLowerCase()}...`}
                            className="w-full bg-transparent border-none outline-none text-[14px] font-[500] text-[#1a1a18] placeholder:text-[#9e9b95] resize-y"
                        />
                    ) : (
                        <input
                            type={template.fieldType}
                            value={value}
                            onChange={(e) => handleFieldChange(template.id, e.target.value)}
                            disabled={readOnly}
                            placeholder={template.fieldType === 'number' ? '0' : `Enter ${template.fieldLabel.toLowerCase()}...`}
                            className="w-full bg-transparent border-none outline-none text-[14px] font-[500] text-[#1a1a18] placeholder:text-[#9e9b95]"
                            style={{ fontFamily: template.fieldType === "date" ? "Inter" : "inherit" }}
                        />
                    )}
                    {error && <p className="text-[11px] font-medium text-[#dc2626] mt-1">{error}</p>}
                </div>
            </div>
        )
    }

    if (loading || authStatus === "loading") {
        return (
            <div className="flex flex-col items-center justify-center min-h-[100vh] bg-[#f5f4f0] space-y-4">
                <Loader2 className="h-10 w-10 animate-spin text-[#9e9b95]" />
            </div>
        )
    }

    const isSubmitted = inspection?.status !== "draft"

    const getAutoColor = (label: string, value: number) => {
        if (label === "ACCEPTED QTY") return "text-[#1a9e6e]"
        if (label === "TOTAL DEFECTS") return "text-[#1a1a18]"
        if (label === "REJECTED QTY" || label === "REJECTED %" || label === "REJECTION PPM") return "text-[#dc2626]"
        if (label === "REWORK %" || label === "REWORK PPM") return "text-[#d97706]"
        if (label === "DIFFERENCE") return value === 0 ? "text-[#1a9e6e]" : "text-[#dc2626]"
        return "text-[#1a1a18]"
    }

    const renderAutoSection = () => {
        const inspectorField = autoFields.find(t => t.fieldLabel.toUpperCase() === "INSPECTOR NAME")
        const otherAutoFields = autoFields.filter(t => t.fieldLabel.toUpperCase() !== "INSPECTOR NAME")

        return (
            <>
                <div className="text-[10.5px] font-[600] text-[#9e9b95] uppercase tracking-[1px] border-b-[1.5px] border-[#e8e6e1] pb-[8px] mb-[14px] mt-[24px]">
                    Calculated (Auto)
                </div>
                <div className="grid grid-cols-2 gap-[8px]">
                    {otherAutoFields.map(t => {
                        const valNum = parseFloat(responses[t.id] || "0")
                        let formulaDesc = ""
                        if (t.fieldLabel.toUpperCase() === "REJECTED QTY") formulaDesc = "Total Defects − Rework"
                        else if (t.fieldLabel.toUpperCase() === "ACCEPTED QTY") formulaDesc = "Inspected − Rework − Rejected"
                        else if (t.fieldLabel.toUpperCase() === "REWORK %") formulaDesc = "Rework / Inspected × 100"
                        else if (t.fieldLabel.toUpperCase() === "REJECTED %") formulaDesc = "Rejected / Inspected × 100"
                        else if (t.fieldLabel.toUpperCase() === "REWORK PPM") formulaDesc = "Rework / Inspected × 1M"
                        else if (t.fieldLabel.toUpperCase() === "REJECTION PPM") formulaDesc = "Rejected / Inspected × 1M"
                        else if (t.fieldLabel.toUpperCase() === "DIFFERENCE") formulaDesc = "Should be 0"

                        return (
                            <div key={t.id} className="bg-[#f9f8f5] border-[1.5px] border-dashed border-[#d4d1ca] rounded-[9px] p-[11px_13px]">
                                <div className="text-[10px] font-[500] text-[#9e9b95] uppercase">{t.fieldLabel}</div>
                                <div className={`text-[20px] font-[700] font-mono tracking-[-0.5px] ${getAutoColor(t.fieldLabel.toUpperCase(), valNum)}`}>
                                    {responses[t.id] || "0"}
                                </div>
                                {formulaDesc && <div className="text-[10px] text-[#9e9b95] mt-[2px]">{formulaDesc}</div>}
                            </div>
                        )
                    })}
                    {inspectorField && (
                        <div className="col-span-2 bg-[#f0fdf4] border border-[rgba(26,158,110,0.2)] rounded-[9px] p-[11px_13px] flex items-center gap-[10px]">
                            <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" className="text-[#1a9e6e]"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                            <span className="text-[13px] font-[600] text-[#0d6b4a]">{responses[inspectorField.id] || session?.user?.name || "Pending Inspector"}</span>
                        </div>
                    )}
                </div>
            </>
        )
    }

    return (
        <div className="flex flex-col min-h-[100vh] bg-[#f5f4f0] p-0">

            {/* INNER HEADER */}
            <div className="bg-white border-b border-[#e8e6e1] p-[12px_16px] sm:p-[12px_24px] flex justify-between items-center gap-2 sticky top-0 z-40">
                <div className="flex items-center min-w-0">
                    <button
                        onClick={() => router.push(isAdmin ? "/approvals" : "/inspection")}
                        className="w-[38px] h-[38px] sm:w-[30px] sm:h-[30px] shrink-0 border border-[#e8e6e1] bg-white rounded-[8px] flex items-center justify-center text-[#6b6860] hover:bg-[#f9f8f5] transition-colors"
                    >
                        <ChevronLeft size={16} />
                    </button>
                    <span className="text-[14px] font-[600] text-[#1a1a18] ml-[10px] truncate">{assignment?.project?.name}</span>
                    <span className="text-[#9e9b95] mx-[8px] shrink-0">•</span>
                    <span className="text-[13px] text-[#6b6860] truncate">{assignment?.project?.site?.name}</span>
                </div>

                {!isSubmitted && (
                    <div className="flex items-center gap-[10px]">
                        {/* GPS indicator */}
                        <div className={cn(
                            "hidden sm:flex items-center gap-1 text-[11px] px-2 py-1 rounded-full",
                            gpsStatus === "ok" ? "bg-green-100 text-green-700" :
                            gpsStatus === "loading" ? "bg-blue-50 text-blue-500" :
                            gpsStatus === "denied" ? "bg-gray-100 text-gray-500" : "hidden"
                        )}>
                            <MapPin className="h-3 w-3" />
                            {gpsStatus === "ok" ? "GPS" : gpsStatus === "loading" ? "Locating..." : "No GPS"}
                        </div>
                        {/* Timer */}
                        <div className="hidden sm:flex items-center gap-1 text-[11px] bg-[#f9f8f5] border border-[#e8e6e1] px-2 py-1 rounded-full text-[#6b6860]">
                            <Timer className="h-3 w-3" />
                            {Math.floor(elapsed / 3600) > 0 && `${Math.floor(elapsed / 3600)}h `}
                            {Math.floor((elapsed % 3600) / 60).toString().padStart(2, "0")}:{(elapsed % 60).toString().padStart(2, "0")}
                        </div>
                        {saving ? (
                            <>
                                <span className="relative flex h-[8px] w-[8px]">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#3b82f6] opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-[8px] w-[8px] bg-[#3b82f6]"></span>
                                </span>
                                <span className="text-[12.5px] text-[#6b6860] hidden sm:inline">Saving...</span>
                            </>
                        ) : isDirty ? (
                            <>
                                <div className="h-[8px] w-[8px] rounded-full bg-[#d97706]"></div>
                                <span className="text-[12.5px] text-[#d97706] hidden sm:inline">Unsaved changes</span>
                            </>
                        ) : (
                            <>
                                <div className="h-[8px] w-[8px] rounded-full bg-[#1a9e6e]"></div>
                                <span className="text-[12.5px] text-[#6b6860] hidden sm:inline">
                                    {lastSaved && !isNaN(lastSaved.getTime()) ? `Saved ${lastSaved.toLocaleTimeString([], { hour12: false })}` : 'Saved'}
                                </span>
                            </>
                        )}
                    </div>
                )}
            </div>

            {/* FORM CONTENT */}
            <div className="w-full max-w-[660px] mx-auto p-[20px_20px_100px]">

                {/* Other pending inspections banner */}
                {!isAdmin && otherPending.length > 0 && (
                    <div className="bg-[#fef3c7] border border-[#fde68a] rounded-[12px] p-[12px_16px] mb-[20px]">
                        <p className="text-[12.5px] font-semibold text-[#92400e] flex items-center gap-1.5 mb-2">
                            <ClipboardList size={14} />
                            {otherPending.length} more inspection{otherPending.length > 1 ? "s" : ""} pending after this one
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                            {otherPending.slice(0, 4).map((a: any) => (
                                <button key={a.id} onClick={() => switchToAssignment(a.id)}
                                    className="inline-flex items-center gap-1 bg-white border border-[#fde68a] text-[#92400e] rounded-full px-2.5 py-1 text-[11.5px] font-medium hover:bg-[#fffbeb] transition-colors">
                                    {a.project?.name} <ArrowRight size={10} />
                                </button>
                            ))}
                            {otherPending.length > 4 && (
                                <span className="text-[11.5px] text-[#92400e] self-center">+{otherPending.length - 4} more</span>
                            )}
                        </div>
                    </div>
                )}

                {/* Reviewer sent-back notice */}
                {inspection?.sentBackCount > 0 && inspection?.reviewerNotes && (
                    <div className="bg-orange-50 border border-orange-200 rounded-[12px] p-[14px_18px] mb-[20px]">
                        <div className="flex items-center gap-2 mb-2">
                            <span className="text-[11px] font-bold uppercase tracking-wider text-orange-600 bg-orange-100 px-2 py-0.5 rounded">Sent Back for Corrections</span>
                            <span className="text-[11px] text-orange-500 ml-auto">{inspection.sentBackCount}x</span>
                        </div>
                        <p className="text-[13px] text-orange-800 italic">"{inspection.reviewerNotes}"</p>
                    </div>
                )}

                {isSubmitted && !isAdmin && (
                    <div className="bg-[#f0fdf4] border border-[rgba(26,158,110,0.25)] rounded-[12px] p-[14px_18px] flex items-center gap-[12px] mb-[24px]">
                        <CheckCircle2 className="h-[20px] w-[20px] text-[#1a9e6e] shrink-0" />
                        <span className="text-[13px] font-[500] text-[#0d6b4a] flex-1">
                            This form has been submitted and is {inspection?.status === "approved" ? "approved" : "pending approval"}.
                        </span>
                    </div>
                )}
                {isAdmin && isSubmitted && (
                    <div className="bg-[#eff6ff] border border-[rgba(59,130,246,0.25)] rounded-[12px] p-[14px_18px] flex items-center gap-[12px] mb-[24px]">
                        <CheckCircle2 className="h-[20px] w-[20px] text-[#3b82f6] shrink-0" />
                        <span className="text-[13px] font-[500] text-[#1d4ed8] flex-1">
                            Admin edit mode — you can modify and save this {inspection?.status} inspection.
                        </span>
                    </div>
                )}

                {/* ── STEPPER RAIL (payroll-style) ── */}
                <div className="bg-white border border-[#e8e6e1] rounded-[12px] p-[14px_16px] mb-[20px]">
                    <div className="flex items-center justify-between mb-[10px]">
                        <span className="text-[12px] font-[600] text-[#1a1a18]">
                            Step {stepIndex + 1} of {totalSteps} — {currentStepDef?.label}
                        </span>
                        <span className="text-[11px] font-[500] text-[#9e9b95]">
                            {Math.round((stepIndex / (totalSteps - 1 || 1)) * 100)}%
                        </span>
                    </div>
                    <div className="flex items-center">
                        {steps.map((s, i) => {
                            const isDone = i < stepIndex
                            const isActive = i === stepIndex
                            return (
                                <div key={s.key} className="flex items-center flex-1 last:flex-none">
                                    <button
                                        type="button"
                                        onClick={() => goToStep(i)}
                                        className="flex flex-col items-center gap-[5px] shrink-0 focus:outline-none"
                                    >
                                        <span className={cn(
                                            "flex items-center justify-center w-[26px] h-[26px] rounded-full text-[12px] font-[700] border-[1.5px] transition-colors",
                                            isActive ? "bg-[#1a9e6e] border-[#1a9e6e] text-white" :
                                            isDone ? "bg-[#e8f7f1] border-[#1a9e6e] text-[#0d6b4a]" :
                                            "bg-white border-[#e8e6e1] text-[#9e9b95]"
                                        )}>
                                            {isDone ? <CheckCircle2 className="h-[15px] w-[15px]" /> : i + 1}
                                        </span>
                                        <span className={cn(
                                            "text-[10.5px] font-[500] whitespace-nowrap",
                                            isActive ? "text-[#1a1a18]" : "text-[#9e9b95]"
                                        )}>{s.label}</span>
                                    </button>
                                    {i < steps.length - 1 && (
                                        <span className={cn(
                                            "h-[2px] flex-1 mx-[6px] mb-[18px] rounded-full transition-colors",
                                            i < stepIndex ? "bg-[#1a9e6e]" : "bg-[#e8e6e1]"
                                        )} />
                                    )}
                                </div>
                            )
                        })}
                    </div>
                </div>

                {currentStepDef?.key === "basic" && (<>
                <div className="text-[10.5px] font-[600] text-[#9e9b95] uppercase tracking-[1px] border-b-[1.5px] border-[#e8e6e1] pb-[8px] mb-[14px]">
                    Basic Info
                </div>
                {fixedFields.map(t => renderBasicField(t))}
                </>)}

                {currentStepDef?.key === "defect" && defectFields.length > 0 && (
                    <>
                        <div className="text-[10.5px] font-[600] text-[#9e9b95] uppercase tracking-[1px] border-b-[1.5px] border-[#e8e6e1] pb-[8px] mb-[14px] mt-[24px]">
                            Defect Entry
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-[8px]">
                            {defectFields.map(t => (
                                <div key={t.id} id={`field-${t.id}`} className="bg-white border border-[#e8e6e1] rounded-[9px] p-[9px_10px] focus-within:border-[#d97706] focus-within:shadow-[0_0_0_3px_rgba(217,119,6,0.06)] transition-all">
                                    <div className="text-[10px] font-[500] text-[#9e9b95] uppercase leading-[1.3] mb-[5px] truncate" title={t.fieldLabel}>
                                        {t.fieldLabel}
                                    </div>
                                    <input
                                        type="number"
                                        min="0"
                                        value={responses[t.id] || ""}
                                        onChange={(e) => handleFieldChange(t.id, e.target.value)}
                                        disabled={!canEdit}
                                        placeholder="0"
                                        className="w-full bg-[#f9f8f5] border border-[#e8e6e1] rounded-[6px] p-[7px] text-[15px] font-[700] font-mono text-center outline-none focus:border-[#d97706] focus:bg-white transition-colors"
                                    />
                                    {errors[t.id] && <div className="text-[10px] text-[#dc2626] text-center mt-1">Required</div>}
                                </div>
                            ))}
                        </div>
                    </>
                )}

                {currentStepDef?.key === "review" && autoFields.length > 0 && renderAutoSection()}

                {currentStepDef?.key === "attach" && (<>
                <div className="text-[10.5px] font-[600] text-[#9e9b95] uppercase tracking-[1px] border-b-[1.5px] border-[#e8e6e1] pb-[8px] mb-[14px] mt-[24px]">
                    Attachments & Paper Form
                </div>
                <div className="bg-white border border-[#e8e6e1] rounded-[10px] p-[16px]">
                    {responses["paperFormPhoto"] ? (
                        <div className="flex flex-col sm:flex-row items-center gap-[14px]">
                            <div className="relative h-[120px] w-full sm:w-[120px] rounded-[8px] border border-[#e8e6e1] overflow-hidden bg-[#f9f8f5]">
                                <img src={responses["paperFormPhoto"]} alt="Paper form" className="h-[120px] w-full sm:w-[120px] object-cover" />
                            </div>
                            <div className="flex-1 text-center sm:text-left">
                                <p className="text-[13px] font-[600] text-[#1a1a18] mb-[4px]">Paper form uploaded</p>
                                <div className="flex gap-[8px] justify-center sm:justify-start mt-[10px]">
                                    <button 
                                        type="button"
                                        onClick={() => {
                                            setPreviewUrl(responses["paperFormPhoto"])
                                            setPreviewName("Paper Form Photo")
                                        }}
                                        className="inline-flex items-center justify-center bg-[#f9f8f5] border border-[#e8e6e1] text-[#6b6860] rounded-[6px] text-[11px] font-medium px-[12px] py-[6px] hover:bg-white"
                                    >
                                        <ExternalLink size={12} className="mr-[6px]" /> View Image
                                    </button>
                                    {canEdit && (
                                        <button type="button" onClick={() => handleFieldChange("paperFormPhoto", "")} className="inline-flex items-center justify-center bg-[#fef2f2] border border-[#e8e6e1] text-[#dc2626] rounded-[6px] text-[11px] font-medium px-[12px] py-[6px] hover:bg-white border-transparent">
                                            Remove
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    ) : canEdit ? (
                        <div className="space-y-[12px]">
                            <label className="flex flex-col items-center justify-center w-full h-[100px] border-[1.5px] border-dashed border-[#d4d1ca] rounded-[8px] cursor-pointer bg-[#f9f8f5] hover:bg-[#f5f4f0] transition-colors">
                                <div className="flex flex-col items-center justify-center">
                                    <Upload className="w-[20px] h-[20px] mb-[8px] text-[#9e9b95]" />
                                    <p className="text-[12px] font-[500] text-[#6b6860]">Click or drag to upload photo</p>
                                </div>
                                <input
                                    type="file"
                                    className="hidden"
                                    accept="image/*"
                                    onChange={(e) => {
                                        const file = e.target.files?.[0]
                                        if (file) handleFileUpload("paperFormPhoto", file)
                                    }}
                                />
                            </label>
                            <button
                                type="button"
                                className="w-full inline-flex items-center justify-center bg-[#f9f8f5] border border-[#e8e6e1] text-[#6b6860] rounded-[8px] text-[12px] font-medium px-[16px] py-[10px] hover:bg-white"
                                onClick={() => setCameraFieldId("paperFormPhoto")}
                            >
                                <Camera className="h-[14px] w-[14px] mr-[8px]" />
                                Use Camera Instead
                            </button>
                        </div>
                    ) : (
                        <div className="h-[80px] flex items-center justify-center text-[12px] text-[#9e9b95] italic bg-[#f9f8f5] rounded-[8px] border border-dashed border-[#e8e6e1]">
                            No paper form attached
                        </div>
                    )}
                </div>
                </>)}

            </div>

            {/* STICKY BOTTOM BAR — wizard navigation + actions */}
            <div className="fixed bottom-0 md:left-[220px] left-0 right-0 bg-white border-t border-[#e8e6e1] p-[12px_16px] sm:p-[12px_24px] flex justify-between items-center gap-2 z-50">
                {/* Left: Back + save status */}
                <div className="flex items-center gap-[10px] flex-shrink-0">
                    <button
                        type="button"
                        onClick={handlePrevStep}
                        disabled={stepIndex === 0}
                        className="bg-white border border-[#e8e6e1] text-[#6b6860] rounded-[9px] text-[13px] font-[500] px-[16px] py-[9px] hover:bg-[#f9f8f5] disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-[6px]"
                    >
                        <ChevronLeft size={15} /> <span className="hidden sm:inline">Back</span>
                    </button>
                    {(!isSubmitted || isAdmin) && (
                        <div className="hidden sm:flex items-center gap-[8px]">
                            {saving ? (
                                <>
                                    <span className="relative flex h-[8px] w-[8px]">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#3b82f6] opacity-75"></span>
                                        <span className="relative inline-flex rounded-full h-[8px] w-[8px] bg-[#3b82f6]"></span>
                                    </span>
                                    <span className="text-[12.5px] text-[#6b6860]">Saving...</span>
                                </>
                            ) : isDirty ? (
                                <>
                                    <div className="h-[8px] w-[8px] rounded-full bg-[#d97706]"></div>
                                    <span className="text-[12.5px] text-[#d97706]">Unsaved changes</span>
                                </>
                            ) : (
                                <>
                                    <div className="h-[8px] w-[8px] rounded-full bg-[#1a9e6e]"></div>
                                    <span className="text-[12.5px] text-[#6b6860]">
                                        {lastSaved && !isNaN(lastSaved.getTime()) ? `Saved ${lastSaved.toLocaleTimeString([], { hour12: false })}` : 'Saved'}
                                    </span>
                                </>
                            )}
                        </div>
                    )}
                </div>

                {/* Right: Next, or final-step actions */}
                <div className="flex items-center gap-[10px]">
                    {stepIndex < totalSteps - 1 ? (
                        <button
                            type="button"
                            onClick={handleNextStep}
                            className="bg-[#1a9e6e] text-white border-none rounded-[9px] text-[13px] font-[500] px-[20px] py-[9px] hover:bg-[#158a5e] flex items-center gap-[6px] transition-colors shadow-sm"
                        >
                            Next <ChevronLeft size={15} className="rotate-180" />
                        </button>
                    ) : isAdmin && isSubmitted ? (
                        <button
                            type="button"
                            onClick={() => saveForm(inspection?.status || "approved")}
                            disabled={saving}
                            className="bg-[#3b82f6] text-white border-none rounded-[9px] text-[13px] font-[500] px-[20px] py-[9px] hover:bg-[#2563eb] disabled:opacity-50 disabled:cursor-not-allowed flex items-center transition-colors shadow-sm"
                        >
                            {saving ? "Saving..." : isDirty ? "Save Admin Changes" : "Saved ✓"}
                        </button>
                    ) : (!isSubmitted || isAdmin) ? (
                        <>
                            <button
                                type="button"
                                onClick={() => saveForm("draft")}
                                disabled={saving || !isDirty}
                                className="bg-white border border-[#e8e6e1] text-[#6b6860] rounded-[9px] text-[13px] font-[500] px-[16px] py-[9px] hover:bg-[#f9f8f5] disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                            >
                                <span className="hidden sm:inline">Force Save</span>
                                <span className="sm:hidden inline">Save</span>
                            </button>
                            <button
                                type="button"
                                onClick={handleSubmit}
                                disabled={saving}
                                className="bg-[#1a9e6e] text-white border-none rounded-[9px] text-[13px] font-[500] px-[20px] py-[9px] hover:bg-[#158a5e] disabled:opacity-50 disabled:cursor-not-allowed flex items-center transition-colors shadow-sm"
                            >
                                <span className="hidden sm:inline">Complete Inspection & Submit</span>
                                <span className="sm:hidden inline">Complete</span>
                            </button>
                        </>
                    ) : null}
                </div>
            </div>

            {cameraFieldId && (
                <CameraCapture
                    onCapture={(file) => {
                        if (cameraFieldId) {
                            handleFileUpload(cameraFieldId, file)
                        }
                        setCameraFieldId(null)
                    }}
                    onClose={() => setCameraFieldId(null)}
                />
            )}
            <DocumentViewer
                url={previewUrl}
                fileName={previewName}
                onClose={() => setPreviewUrl(null)}
            />

            {/* Project chooser — inspector has multiple pending inspections */}
            {showChooser && !isAdmin && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                    <div className="bg-white rounded-[16px] border border-[#e8e6e1] w-full max-w-md shadow-xl overflow-hidden">
                        <div className="flex items-center justify-between px-5 py-4 border-b border-[#e8e6e1]">
                            <div>
                                <h2 className="text-[15px] font-semibold text-[#1a1a18] flex items-center gap-2">
                                    <ClipboardList size={15} className="text-[#1a9e6e]" /> Which inspection do you want to fill?
                                </h2>
                                <p className="text-[12px] text-[#9e9b95] mt-0.5">You have {otherPending.length + 1} pending inspections.</p>
                            </div>
                            <button onClick={dismissChooser} className="p-2 sm:p-1 shrink-0 text-[#9e9b95] hover:text-[#1a1a18] rounded-md hover:bg-[#f9f8f5] transition-colors">
                                <X size={17} />
                            </button>
                        </div>
                        <div className="p-4 space-y-2 max-h-[55vh] overflow-y-auto">
                            {/* Current form — continue */}
                            <button onClick={dismissChooser}
                                className="w-full flex items-center gap-3 p-3 rounded-[12px] border-[1.5px] border-[#1a9e6e] bg-[#f0fdf4] text-left hover:bg-[#e8f7f1] transition-colors">
                                <span className="w-9 h-9 rounded-[9px] bg-[#1a9e6e] flex items-center justify-center shrink-0">
                                    <CheckCircle2 size={16} className="text-white" />
                                </span>
                                <span className="min-w-0 flex-1">
                                    <span className="block text-[13px] font-semibold text-[#1a1a18] truncate">{assignment?.project?.name}</span>
                                    <span className="block text-[11.5px] text-[#6b6860] truncate">
                                        {assignment?.project?.site?.name} · This form
                                    </span>
                                </span>
                                <span className="text-[11.5px] font-semibold text-[#1a9e6e] shrink-0">Continue →</span>
                            </button>

                            {/* Other pending forms */}
                            {otherPending.map((a: any) => (
                                <button key={a.id} onClick={() => switchToAssignment(a.id)}
                                    className="w-full flex items-center gap-3 p-3 rounded-[12px] border border-[#e8e6e1] bg-white text-left hover:border-[#1a9e6e]/50 hover:bg-[#f9f8f5] transition-colors">
                                    <span className="w-9 h-9 rounded-[9px] bg-[#fef3c7] flex items-center justify-center shrink-0">
                                        <ClipboardList size={15} className="text-[#d97706]" />
                                    </span>
                                    <span className="min-w-0 flex-1">
                                        <span className="block text-[13px] font-semibold text-[#1a1a18] truncate">{a.project?.name}</span>
                                        <span className="block text-[11.5px] text-[#6b6860] truncate">
                                            {a.project?.site?.name}
                                            {a.inspection?.status === "draft" ? " · Draft saved" : " · Not started"}
                                        </span>
                                    </span>
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-[#fef3c7] text-[#92400e] text-[10.5px] font-semibold shrink-0">Pending</span>
                                </button>
                            ))}
                        </div>
                        <div className="px-5 py-3.5 border-t border-[#e8e6e1] bg-[#f9f8f5]/60">
                            <p className="text-[11.5px] text-[#9e9b95]">Baaki pending forms upar banner me bhi dikhte rahenge.</p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
