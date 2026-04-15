"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useRouter, useParams } from "next/navigation"
import { useSession } from "next-auth/react"
import { Textarea } from "@/components/ui/textarea"
import {
    ChevronLeft, CheckCircle2, XCircle, Loader2, Calendar,
    User as UserIcon, Building2, FileText, ExternalLink,
    Check, X, Clock, CornerUpLeft, Share2, Copy, PenTool,
    Trash2, MapPin, AlertCircle, Inbox
} from "lucide-react"
import Link from "next/link"
import { toast } from "sonner"
import { DocumentViewer } from "@/components/DocumentViewer"

export default function ReviewInspectionPage() {
    const { data: session, status: authStatus } = useSession()
    const router = useRouter()
    const { id: inspectionId } = useParams()
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const isDrawingRef = useRef(false)

    const [inspection, setInspection] = useState<any>(null)
    const [loading, setLoading] = useState(true)
    const [actionLoading, setActionLoading] = useState(false)
    const [reviewerNotes, setReviewerNotes] = useState("")
    const [shareToken, setShareToken] = useState<string | null>(null)
    const [sharing, setSharing] = useState(false)
    const [showSignature, setShowSignature] = useState(false)
    const [hasSig, setHasSig] = useState(false)
    const [previewUrl, setPreviewUrl] = useState<string | null>(null)
    const [previewName, setPreviewName] = useState<string>("")

    useEffect(() => {
        if (authStatus === "unauthenticated") router.push("/login")
        else if (authStatus === "authenticated" && session?.user?.role === "INSPECTION_BOY") router.push("/")
    }, [authStatus, session, router])

    const fetchInspection = useCallback(async () => {
        setLoading(true)
        try {
            const res = await fetch(`/api/approvals/${inspectionId}`)
            if (res.ok) {
                const data = await res.json()
                setInspection(data)
                setReviewerNotes(data.reviewerNotes || "")
                if (data.shareableLink) setShareToken(data.shareableLink.token)
            } else {
                router.push("/approvals")
            }
        } catch {
            console.error("Failed to fetch")
        } finally {
            setLoading(false)
        }
    }, [inspectionId, router])

    useEffect(() => {
        if (authStatus === "authenticated") fetchInspection()
    }, [authStatus, fetchInspection])

    const handleAction = async (action: "approve" | "reject" | "send_back") => {
        if ((action === "reject" || action === "send_back") && !reviewerNotes.trim()) {
            toast.error("Please provide a reason in the notes field.")
            return
        }
        const msgs = { approve: "Approve this inspection?", reject: "Reject this inspection?", send_back: "Send back for corrections?" }
        if (!confirm(msgs[action])) return
        setActionLoading(true)
        try {
            const res = await fetch(`/api/approvals/${inspectionId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action, reviewerNotes })
            })
            if (res.ok) {
                const labels = { approve: "approved", reject: "rejected", send_back: "sent back" }
                toast.success(`Inspection ${labels[action]} successfully!`)
                setTimeout(() => router.push("/approvals"), 1200)
            } else {
                const err = await res.json()
                toast.error(err.error || "Action failed")
            }
        } catch {
            toast.error("An error occurred")
        } finally {
            setActionLoading(false)
        }
    }

    const handleShare = async () => {
        setSharing(true)
        try {
            if (shareToken) {
                await navigator.clipboard.writeText(`${window.location.origin}/share/${shareToken}`)
                toast.success("Share link copied!")
            } else {
                const res = await fetch(`/api/inspections/${inspectionId}/share`, { method: "POST" })
                if (res.ok) {
                    const { token } = await res.json()
                    setShareToken(token)
                    await navigator.clipboard.writeText(`${window.location.origin}/share/${token}`)
                    toast.success("Share link created and copied!")
                }
            }
        } catch {
            toast.error("Failed to create share link")
        } finally {
            setSharing(false)
        }
    }

    const startDraw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
        isDrawingRef.current = true
        const canvas = canvasRef.current; if (!canvas) return
        const ctx = canvas.getContext("2d"); if (!ctx) return
        const rect = canvas.getBoundingClientRect()
        const x = "touches" in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left
        const y = "touches" in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top
        ctx.beginPath(); ctx.moveTo(x, y)
    }
    const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
        if (!isDrawingRef.current) return
        const canvas = canvasRef.current; if (!canvas) return
        const ctx = canvas.getContext("2d"); if (!ctx) return
        const rect = canvas.getBoundingClientRect()
        const x = "touches" in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left
        const y = "touches" in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top
        ctx.lineTo(x, y); ctx.strokeStyle = "#1a9e6e"; ctx.lineWidth = 2; ctx.lineCap = "round"; ctx.stroke()
        setHasSig(true)
    }
    const stopDraw = () => { isDrawingRef.current = false }
    const clearSig = () => {
        const canvas = canvasRef.current; if (!canvas) return
        canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height); setHasSig(false)
    }
    const submitSignature = async () => {
        const canvas = canvasRef.current; if (!canvas || !hasSig) return
        const sig = canvas.toDataURL("image/png")
        await fetch(`/api/inspections/${inspectionId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ signature: sig }) })
        toast.success("Signature saved!"); setShowSignature(false); fetchInspection()
    }

    if (loading || authStatus === "loading") {
        return (
            <div className="min-h-screen bg-[#f5f4f0] flex items-center justify-center">
                <div className="flex flex-col items-center gap-3">
                    <div className="w-9 h-9 border-2 border-[#1a9e6e] border-t-transparent rounded-full animate-spin" />
                    <p className="text-[13px] text-[#9e9b95]">Loading inspection...</p>
                </div>
            </div>
        )
    }

    if (!inspection) return null

    const statusConfig: Record<string, { label: string; bg: string; color: string; dot: string }> = {
        pending:  { label: "Awaiting Review", bg: "#fefce8", color: "#92400e", dot: "#f59e0b" },
        approved: { label: "Approved",        bg: "#f0fdf4", color: "#166534", dot: "#16a34a" },
        rejected: { label: "Rejected",        bg: "#fef2f2", color: "#991b1b", dot: "#ef4444" },
        draft:    { label: "Sent Back",       bg: "#fff7ed", color: "#9a3412", dot: "#f97316" },
    }
    const sc = statusConfig[inspection.status] || statusConfig.pending

    const fillDuration = inspection.startedAt && inspection.submittedAt
        ? Math.round((new Date(inspection.submittedAt).getTime() - new Date(inspection.startedAt).getTime()) / 60000)
        : null

    let gps: { lat: number; lng: number } | null = null
    try { if (inspection.gpsLocation) gps = JSON.parse(inspection.gpsLocation) } catch {}

    const renderFieldValue = (field: any, value: string) => {
        if (!value) return <p className="text-[13px] text-[#d4d1ca] italic">Not filled</p>

        if (field.fieldType === "checkbox") {
            return (
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] font-medium ${value === "true" ? "bg-[#dcfce7] text-[#166534]" : "bg-[#f5f4f0] text-[#6b6860]"}`}>
                    {value === "true" ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                    {value === "true" ? "Yes" : "No"}
                </span>
            )
        }

        if (field.fieldType === "dropdown" || field.fieldType === "select") {
            return (
                <span className="inline-flex items-center px-3 py-1 rounded-full text-[12px] font-semibold bg-[#e8f7f1] text-[#0d6b4a] border border-[#b6e8d5]">
                    {value}
                </span>
            )
        }

        if (field.fieldType === "file") {
            return (
                <div className="space-y-2">
                    {value.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? (
                        <img src={value} alt="evidence" className="w-full h-36 object-cover rounded-[8px] border border-[#e8e6e1]" />
                    ) : (
                        <div className="h-20 flex items-center justify-center rounded-[8px] bg-[#f5f4f0] border border-[#e8e6e1]">
                            <FileText className="h-6 w-6 text-[#d4d1ca]" />
                        </div>
                    )}
                    <button
                        type="button"
                        onClick={() => {
                            setPreviewUrl(value)
                            setPreviewName(field.fieldLabel)
                        }}
                        className="inline-flex items-center gap-1 text-[12px] text-[#1a9e6e] hover:underline"
                    >
                        <ExternalLink className="h-3 w-3" /> View File
                    </button>
                </div>
            )
        }

        if (field.fieldType === "number") {
            return <p className="text-[18px] font-bold text-[#1a1a18] tabular-nums">{value}</p>
        }

        if (field.fieldType === "date") {
            try {
                return <p className="text-[13px] text-[#1a1a18] font-medium">{new Date(value).toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" })}</p>
            } catch {
                return <p className="text-[13px] text-[#1a1a18]">{value}</p>
            }
        }

        return <p className="text-[13px] text-[#1a1a18] leading-relaxed whitespace-pre-wrap">{value}</p>
    }

    return (
        <div className="min-h-screen bg-[#f5f4f0] p-5 lg:p-7">

            {/* Signature Modal */}
            {showSignature && (
                <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-[18px] shadow-2xl p-6 max-w-md w-full">
                        <div className="flex items-center justify-between mb-4">
                            <div>
                                <h3 className="text-[15px] font-semibold text-[#1a1a18]">Digital Signature</h3>
                                <p className="text-[11px] text-[#9e9b95]">Reviewer authorization signature</p>
                            </div>
                            <button onClick={() => setShowSignature(false)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-[#f5f4f0] transition-colors">
                                <X className="h-4 w-4 text-[#6b6860]" />
                            </button>
                        </div>
                        {inspection.signature ? (
                            <div className="space-y-3">
                                <img src={inspection.signature} alt="signature" className="border border-[#e8e6e1] rounded-[10px] w-full bg-[#f9f8f5]" />
                                <button onClick={async () => {
                                    await fetch(`/api/inspections/${inspectionId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ signature: null }) })
                                    toast.success("Signature removed"); setShowSignature(false); fetchInspection()
                                }} className="flex items-center gap-1.5 text-[12px] text-red-500 hover:text-red-600 mt-1">
                                    <Trash2 className="h-3.5 w-3.5" /> Remove Signature
                                </button>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                <canvas ref={canvasRef} width={400} height={160}
                                    className="border-2 border-dashed border-[#e8e6e1] rounded-[10px] w-full touch-none bg-[#f9f8f5] cursor-crosshair"
                                    onMouseDown={startDraw} onMouseMove={draw} onMouseUp={stopDraw} onMouseLeave={stopDraw}
                                    onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={stopDraw}
                                />
                                <p className="text-[11px] text-[#9e9b95] text-center">Draw your signature above</p>
                                <div className="flex gap-2">
                                    <button onClick={clearSig} className="flex items-center gap-1.5 px-3 py-2 border border-[#e8e6e1] rounded-[8px] text-[12px] text-[#6b6860] hover:bg-[#f5f4f0]">
                                        <Trash2 className="h-3.5 w-3.5" /> Clear
                                    </button>
                                    <button onClick={submitSignature} disabled={!hasSig}
                                        className="flex-1 flex items-center justify-center gap-1.5 bg-[#1a9e6e] text-white rounded-[8px] py-2 text-[13px] font-medium hover:bg-[#158a5e] disabled:opacity-40 transition-colors">
                                        Save Signature
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Header */}
            <div className="mb-6">
                <Link href="/approvals" className="inline-flex items-center gap-1 text-[12px] text-[#9e9b95] hover:text-[#1a1a18] transition-colors mb-4">
                    <ChevronLeft className="h-3.5 w-3.5" /> Back to Approvals
                </Link>

                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <p className="text-[12px] text-[#9e9b95] mb-1">
                            {inspection.assignment?.project?.company?.name}
                            <span className="mx-1.5 opacity-40">/</span>
                            {inspection.assignment?.project?.name}
                        </p>
                        <h1 className="text-[22px] font-semibold text-[#1a1a18] tracking-[-0.4px]">Review Inspection</h1>
                        <div className="flex items-center gap-2 mt-1">
                            <span className="text-[11px] font-mono text-[#9e9b95] bg-[#f0ede8] px-2 py-0.5 rounded">
                                INS-{inspection.id.substring(0, 8).toUpperCase()}
                            </span>
                            {inspection.sentBackCount > 0 && (
                                <span className="text-[11px] bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-medium">
                                    Sent back {inspection.sentBackCount}×
                                </span>
                            )}
                        </div>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                        {inspection.status === "approved" && (
                            <>
                                <button onClick={handleShare} disabled={sharing}
                                    className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white border border-[#e8e6e1] rounded-[9px] text-[12.5px] text-[#1a9e6e] font-medium hover:bg-[#f0faf6] hover:border-[#1a9e6e]/30 transition-colors shadow-sm">
                                    {sharing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Share2 className="h-3.5 w-3.5" />}
                                    {shareToken ? "Copy Link" : "Share Report"}
                                </button>
                                <button onClick={() => setShowSignature(true)}
                                    className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white border border-[#e8e6e1] rounded-[9px] text-[12.5px] text-[#6b6860] font-medium hover:bg-[#f5f4f0] transition-colors shadow-sm">
                                    <PenTool className="h-3.5 w-3.5" />
                                    {inspection.signature ? "View Signature" : "Add Signature"}
                                </button>
                            </>
                        )}
                        <span className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-[9px] text-[12.5px] font-semibold shadow-sm"
                            style={{ backgroundColor: sc.bg, color: sc.color }}>
                            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: sc.dot }} />
                            {sc.label}
                        </span>
                    </div>
                </div>
            </div>

            {/* Body */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

                {/* LEFT — Responses */}
                <div className="lg:col-span-2 space-y-4">

                    {/* GPS */}
                    {gps && (
                        <div className="bg-white border border-[#e8e6e1] rounded-[12px] px-4 py-3 flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
                                <MapPin className="h-4 w-4 text-blue-500" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-[10px] text-[#9e9b95] uppercase tracking-[0.5px] mb-0.5">GPS Location Captured</p>
                                <p className="text-[13px] text-[#1a1a18] font-medium tabular-nums">{gps.lat.toFixed(6)}, {gps.lng.toFixed(6)}</p>
                            </div>
                            <a href={`https://maps.google.com?q=${gps.lat},${gps.lng}`} target="_blank" rel="noopener noreferrer"
                                className="shrink-0 inline-flex items-center gap-1 text-[12px] text-blue-600 hover:text-blue-700 font-medium">
                                <ExternalLink className="h-3 w-3" /> Open Maps
                            </a>
                        </div>
                    )}

                    {/* Responses header */}
                    <div className="flex items-center justify-between px-0.5">
                        <h2 className="text-[14px] font-semibold text-[#1a1a18]">Inspection Responses</h2>
                        <span className="text-[12px] text-[#9e9b95] bg-[#f0ede8] px-2.5 py-1 rounded-full">
                            {inspection.responses.length} fields
                        </span>
                    </div>

                    {inspection.responses.length === 0 ? (
                        <div className="bg-white border border-[#e8e6e1] rounded-[14px] py-20 flex flex-col items-center gap-3 text-center">
                            <div className="w-12 h-12 rounded-full bg-[#f5f4f0] flex items-center justify-center">
                                <Inbox className="h-5 w-5 text-[#d4d1ca]" />
                            </div>
                            <p className="text-[13px] text-[#9e9b95]">No responses recorded</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {inspection.responses
                                .sort((a: any, b: any) => a.field.displayOrder - b.field.displayOrder)
                                .map((resp: any) => (
                                    <div key={resp.id} className="bg-white border border-[#e8e6e1] rounded-[12px] p-4 hover:border-[#d4d1ca] transition-colors">
                                        <div className="flex items-center justify-between gap-2 mb-3">
                                            <p className="text-[10px] font-semibold text-[#9e9b95] uppercase tracking-[0.6px] leading-tight">
                                                {resp.field.fieldLabel}
                                            </p>
                                            <span className="text-[9.5px] text-[#c4c1bb] bg-[#f5f4f0] px-1.5 py-0.5 rounded shrink-0 uppercase tracking-[0.3px]">
                                                {resp.field.fieldType}
                                            </span>
                                        </div>
                                        <div>
                                            {renderFieldValue(resp.field, resp.value)}
                                        </div>
                                    </div>
                                ))}
                        </div>
                    )}
                </div>

                {/* RIGHT — Info + Actions */}
                <div className="space-y-4 lg:sticky lg:top-5 lg:self-start">

                    {/* Inspection Details */}
                    <div className="bg-white border border-[#e8e6e1] rounded-[14px] overflow-hidden">
                        <div className="px-5 py-4 border-b border-[#f0ede8]">
                            <h3 className="text-[13px] font-semibold text-[#1a1a18]">Inspection Details</h3>
                        </div>
                        <div className="p-5 space-y-4">
                            <div className="flex items-start gap-3">
                                <div className="w-8 h-8 rounded-full bg-[#f5f4f0] flex items-center justify-center shrink-0">
                                    <UserIcon className="h-3.5 w-3.5 text-[#9e9b95]" />
                                </div>
                                <div>
                                    <p className="text-[10px] text-[#9e9b95] uppercase tracking-[0.5px] mb-0.5">Inspector</p>
                                    <p className="text-[13px] font-semibold text-[#1a1a18]">{inspection.submitter?.name}</p>
                                    <p className="text-[11px] text-[#9e9b95]">{inspection.submitter?.email}</p>
                                </div>
                            </div>
                            <div className="h-px bg-[#f5f4f0]" />
                            <div className="flex items-start gap-3">
                                <div className="w-8 h-8 rounded-full bg-[#f5f4f0] flex items-center justify-center shrink-0">
                                    <Building2 className="h-3.5 w-3.5 text-[#9e9b95]" />
                                </div>
                                <div>
                                    <p className="text-[10px] text-[#9e9b95] uppercase tracking-[0.5px] mb-0.5">Client / Project</p>
                                    <p className="text-[13px] font-semibold text-[#1a1a18]">{inspection.assignment?.project?.company?.name}</p>
                                    <p className="text-[11px] text-[#9e9b95]">{inspection.assignment?.project?.name}</p>
                                </div>
                            </div>
                            <div className="h-px bg-[#f5f4f0]" />
                            <div className="flex items-start gap-3">
                                <div className="w-8 h-8 rounded-full bg-[#f5f4f0] flex items-center justify-center shrink-0">
                                    <Calendar className="h-3.5 w-3.5 text-[#9e9b95]" />
                                </div>
                                <div>
                                    <p className="text-[10px] text-[#9e9b95] uppercase tracking-[0.5px] mb-0.5">Submitted</p>
                                    <p className="text-[13px] font-semibold text-[#1a1a18]">
                                        {inspection.submittedAt
                                            ? new Date(inspection.submittedAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
                                            : "N/A"}
                                    </p>
                                    {inspection.submittedAt && (
                                        <p className="text-[11px] text-[#9e9b95]">
                                            {new Date(inspection.submittedAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                                        </p>
                                    )}
                                </div>
                            </div>
                            {fillDuration !== null && (
                                <>
                                    <div className="h-px bg-[#f5f4f0]" />
                                    <div className="flex items-start gap-3">
                                        <div className="w-8 h-8 rounded-full bg-[#f5f4f0] flex items-center justify-center shrink-0">
                                            <Clock className="h-3.5 w-3.5 text-[#9e9b95]" />
                                        </div>
                                        <div>
                                            <p className="text-[10px] text-[#9e9b95] uppercase tracking-[0.5px] mb-0.5">Fill Duration</p>
                                            <p className="text-[13px] font-semibold text-[#1a1a18]">{fillDuration} min</p>
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>

                    {/* Share Link Active */}
                    {shareToken && (
                        <div className="bg-[#f0faf6] border border-[#b6e8d5] rounded-[14px] p-4">
                            <div className="flex items-center gap-2 mb-2">
                                <Share2 className="h-3.5 w-3.5 text-[#1a9e6e]" />
                                <p className="text-[12px] font-semibold text-[#0d6b4a]">Share Link Active</p>
                            </div>
                            <p className="text-[11px] text-[#6b6860] break-all leading-relaxed mb-2.5">
                                {typeof window !== "undefined" ? `${window.location.origin}/share/${shareToken}` : ""}
                            </p>
                            <button onClick={() => navigator.clipboard.writeText(`${window.location.origin}/share/${shareToken}`).then(() => toast.success("Copied!"))}
                                className="inline-flex items-center gap-1.5 text-[12px] text-[#1a9e6e] hover:text-[#158a5e] font-medium transition-colors">
                                <Copy className="h-3 w-3" /> Copy link
                            </button>
                        </div>
                    )}

                    {/* Decision Panel */}
                    <div className="bg-white border border-[#e8e6e1] rounded-[14px] overflow-hidden">
                        <div className={`px-5 py-4 border-b ${
                            inspection.status === "approved" ? "border-green-100 bg-[#f0fdf4]" :
                            inspection.status === "rejected" ? "border-red-100 bg-[#fef2f2]" :
                            inspection.status === "draft"    ? "border-orange-100 bg-[#fff7ed]" :
                            "border-[#f0ede8] bg-white"
                        }`}>
                            <h3 className="text-[13px] font-semibold text-[#1a1a18]">
                                {inspection.status === "pending" ? "Review Decision" : "Final Decision"}
                            </h3>
                        </div>

                        <div className="p-5">
                            {inspection.status === "pending" ? (
                                <div className="space-y-3">
                                    <div>
                                        <label className="text-[10px] text-[#9e9b95] uppercase tracking-[0.5px] block mb-1.5">
                                            Reviewer Notes
                                        </label>
                                        <Textarea
                                            placeholder="Add feedback, corrections, or approval notes..."
                                            className="bg-[#f9f8f5] border-[#e8e6e1] text-[13px] min-h-[90px] resize-none focus-visible:ring-0 focus-visible:border-[#1a9e6e] rounded-[10px]"
                                            value={reviewerNotes}
                                            onChange={(e) => setReviewerNotes(e.target.value)}
                                        />
                                        <p className="text-[10.5px] text-[#c4c1bb] mt-1.5">Required for rejection and send-back actions</p>
                                    </div>

                                    <div className="space-y-2 pt-1">
                                        <button onClick={() => handleAction("approve")} disabled={actionLoading}
                                            className="w-full flex items-center justify-center gap-2 bg-[#1a9e6e] hover:bg-[#158a5e] text-white rounded-[10px] py-[11px] text-[13px] font-semibold transition-colors disabled:opacity-50 shadow-sm">
                                            {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                                            Approve Inspection
                                        </button>
                                        <button onClick={() => handleAction("send_back")} disabled={actionLoading}
                                            className="w-full flex items-center justify-center gap-2 bg-orange-50 hover:bg-orange-100 text-orange-700 border border-orange-200 rounded-[10px] py-[11px] text-[13px] font-semibold transition-colors disabled:opacity-50">
                                            {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CornerUpLeft className="h-4 w-4" />}
                                            Send Back for Corrections
                                        </button>
                                        <button onClick={() => handleAction("reject")} disabled={actionLoading}
                                            className="w-full flex items-center justify-center gap-2 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 rounded-[10px] py-[11px] text-[13px] font-semibold transition-colors disabled:opacity-50">
                                            {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                                            Reject Inspection
                                        </button>
                                        {session?.user?.role === "ADMIN" && (
                                            <Link href={`/inspection/${inspection.assignment?.id}/form`}
                                                className="w-full flex items-center justify-center gap-2 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-[10px] py-[11px] text-[13px] font-semibold transition-colors">
                                                <ExternalLink className="h-4 w-4" /> Edit Form (Admin)
                                            </Link>
                                        )}
                                    </div>

                                    <div className="flex items-start gap-2 pt-1">
                                        <AlertCircle className="h-3.5 w-3.5 text-[#c4c1bb] shrink-0 mt-0.5" />
                                        <p className="text-[11px] text-[#c4c1bb] leading-relaxed">
                                            Send Back returns to inspector without permanently rejecting the inspection.
                                        </p>
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    <div className={`flex items-center gap-3 p-3.5 rounded-[10px] ${
                                        inspection.status === "approved" ? "bg-[#f0fdf4]" :
                                        inspection.status === "rejected" ? "bg-[#fef2f2]" : "bg-[#fff7ed]"
                                    }`}>
                                        {inspection.status === "approved"
                                            ? <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
                                            : inspection.status === "rejected"
                                            ? <XCircle className="h-5 w-5 text-red-500 shrink-0" />
                                            : <CornerUpLeft className="h-5 w-5 text-orange-500 shrink-0" />}
                                        <div>
                                            <p className={`text-[13px] font-semibold ${
                                                inspection.status === "approved" ? "text-green-800" :
                                                inspection.status === "rejected" ? "text-red-800" : "text-orange-800"
                                            }`}>
                                                Inspection {inspection.status === "draft" ? "Sent Back" : inspection.status.charAt(0).toUpperCase() + inspection.status.slice(1)}
                                            </p>
                                            <p className="text-[11px] text-[#9e9b95]">
                                                {new Date(inspection.approvedAt || inspection.sentBackAt || inspection.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                                            </p>
                                        </div>
                                    </div>

                                    {inspection.reviewerNotes && (
                                        <div className="bg-[#f9f8f5] border border-[#f0ede8] rounded-[10px] p-3.5">
                                            <p className="text-[10px] text-[#9e9b95] uppercase tracking-[0.5px] mb-1.5">Reviewer Notes</p>
                                            <p className="text-[13px] text-[#1a1a18] leading-relaxed">"{inspection.reviewerNotes}"</p>
                                        </div>
                                    )}

                                    {session?.user?.role === "ADMIN" && (
                                        <Link href={`/inspection/${inspection.assignment?.id}/form`}
                                            className="w-full flex items-center justify-center gap-2 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-[10px] py-[11px] text-[13px] font-semibold transition-colors">
                                            <ExternalLink className="h-4 w-4" /> Edit Form (Admin)
                                        </Link>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
            <DocumentViewer 
                url={previewUrl} 
                fileName={previewName} 
                onClose={() => setPreviewUrl(null)} 
            />
        </div>
    )
}
