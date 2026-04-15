"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { Loader2, CheckCircle2, AlertCircle, Building2, Calendar, User, Eye, Download } from "lucide-react"
import dynamic from "next/dynamic"
import { DocumentViewer } from "@/components/DocumentViewer"

const PDFDownloadLink = dynamic(
    () => import("@react-pdf/renderer").then(mod => mod.PDFDownloadLink),
    { ssr: false }
)

const InspectionPDF = dynamic(
    () => import("@/components/InspectionPDF").then(mod => mod.InspectionPDF),
    { ssr: false }
)

export default function SharePage() {
    const { token } = useParams()
    const [data, setData] = useState<any>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [previewUrl, setPreviewUrl] = useState<string | null>(null)
    const [previewName, setPreviewName] = useState<string>("")

    useEffect(() => {
        fetch(`/api/share/${token}`)
            .then(r => r.json())
            .then(d => {
                if (d.error) setError(d.error)
                else setData(d)
            })
            .catch(() => setError("Failed to load report"))
            .finally(() => setLoading(false))
    }, [token])

    if (loading) return (
        <div className="min-h-screen bg-[#f5f4f0] flex items-center justify-center">
            <div className="flex flex-col items-center gap-3">
                <Loader2 className="h-10 w-10 animate-spin text-[#1a9e6e]" />
                <p className="text-[#6b6860] text-sm">Loading shared report...</p>
            </div>
        </div>
    )

    if (error) return (
        <div className="min-h-screen bg-[#f5f4f0] flex items-center justify-center p-6">
            <div className="bg-white rounded-[16px] border border-[#e8e6e1] p-8 text-center max-w-sm">
                <AlertCircle className="h-12 w-12 text-red-400 mx-auto mb-3" />
                <h2 className="text-[17px] font-bold text-[#1a1a18] mb-2">Report Unavailable</h2>
                <p className="text-[13px] text-[#6b6860]">{error}</p>
            </div>
        </div>
    )

    const inspection = data.inspection
    const company = inspection?.assignment?.project?.company
    const project = inspection?.assignment?.project
    const responses = (inspection?.responses || []).sort((a: any, b: any) => a.field.displayOrder - b.field.displayOrder)

    return (
        <div className="min-h-screen bg-[#f5f4f0]">
            {/* Header banner */}
            <div className="bg-gradient-to-br from-[#1a9e6e] to-[#0d6b4a] text-white px-6 py-8">
                <div className="max-w-3xl mx-auto">
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <p className="text-[11px] font-semibold uppercase tracking-widest opacity-70 mb-1">Quality Inspection Report</p>
                            <h1 className="text-[22px] font-bold">{company?.name || "Company"}</h1>
                            <p className="text-[14px] opacity-80 mt-1">{project?.name || "Project"}</p>
                        </div>
                        <div className="flex items-center gap-1.5 bg-white/20 rounded-full px-3 py-1.5 text-[11px]">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            <span>Approved Report</span>
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-4 mt-5 text-[12px]">
                        <div className="flex items-center gap-1.5 opacity-80">
                            <User className="h-3.5 w-3.5" />
                            <span>Inspector: {inspection.submitter?.name}</span>
                        </div>
                        <div className="flex items-center gap-1.5 opacity-80">
                            <Calendar className="h-3.5 w-3.5" />
                            <span>Approved: {inspection.approvedAt ? new Date(inspection.approvedAt).toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" }) : "N/A"}</span>
                        </div>
                        <div className="flex items-center gap-1.5 opacity-80">
                            <Eye className="h-3.5 w-3.5" />
                            <span>{data.viewCount} view{data.viewCount !== 1 ? "s" : ""}</span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
                {/* Download Button */}
                {typeof window !== "undefined" && (
                    <div className="flex justify-end">
                        <PDFDownloadLink
                            document={<InspectionPDF inspection={inspection} />}
                            fileName={`inspection-report-${inspection.id.substring(0, 8)}.pdf`}
                        >
                            {({ loading: pdfLoading }: { loading: boolean }) => (
                                <button className="flex items-center gap-2 bg-[#1a9e6e] text-white px-4 py-2.5 rounded-[10px] text-[13px] font-medium hover:bg-[#158a5e] transition-colors" disabled={pdfLoading}>
                                    {pdfLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                                    {pdfLoading ? "Preparing PDF..." : "Download PDF"}
                                </button>
                            )}
                        </PDFDownloadLink>
                    </div>
                )}

                {/* GPS Location */}
                {inspection.gpsLocation && (() => {
                    try {
                        const gps = JSON.parse(inspection.gpsLocation)
                        return (
                            <div className="bg-white border border-[#e8e6e1] rounded-[12px] p-4 flex items-center gap-3">
                                <span className="text-lg">📍</span>
                                <div>
                                    <p className="text-[12px] font-semibold text-[#1a1a18]">Inspection Location</p>
                                    <a href={`https://maps.google.com?q=${gps.lat},${gps.lng}`} target="_blank" rel="noopener noreferrer" className="text-[12px] text-[#1a9e6e] hover:underline">
                                        {gps.lat.toFixed(5)}, {gps.lng.toFixed(5)} — Open in Maps
                                    </a>
                                </div>
                            </div>
                        )
                    } catch { return null }
                })()}

                {/* Responses */}
                <div className="bg-white border border-[#e8e6e1] rounded-[14px] overflow-hidden">
                    <div className="px-5 py-4 border-b border-[#e8e6e1]">
                        <h2 className="text-[14px] font-semibold text-[#1a1a18]">Inspection Details</h2>
                        <p className="text-[12px] text-[#9e9b95] mt-0.5">{responses.length} fields recorded</p>
                    </div>
                    <div className="divide-y divide-[#f0f0f0]">
                        {responses.map((resp: any) => (
                            <div key={resp.id} className="px-5 py-4">
                                <p className="text-[10px] font-bold uppercase tracking-wider text-[#9e9b95] mb-1">{resp.field.fieldLabel}</p>
                                {resp.field.fieldType === "file" ? (
                                    resp.value?.match(/\.(jpg|jpeg|png|gif|pdf)(\?|$)|data:image|data:application\/pdf/i) ? (
                                        <div className="space-y-2">
                                            {resp.value.match(/\.(jpg|jpeg|png|gif)(\?|$)|data:image/i) && (
                                                <img 
                                                    src={resp.value} 
                                                    alt={resp.field.fieldLabel} 
                                                    className="max-h-40 rounded-lg border cursor-pointer hover:opacity-90 transition-opacity" 
                                                    onClick={() => {
                                                        setPreviewUrl(resp.value)
                                                        setPreviewName(resp.field.fieldLabel)
                                                    }}
                                                />
                                            )}
                                            <button 
                                                onClick={() => {
                                                    setPreviewUrl(resp.value)
                                                    setPreviewName(resp.field.fieldLabel)
                                                }}
                                                className="flex items-center gap-1.5 text-[12px] text-[#1a9e6e] font-medium hover:underline"
                                            >
                                                <Eye size={14} /> View Document
                                            </button>
                                        </div>
                                    ) : (
                                        <span className="text-[13px] text-[#6b6860] italic">(No valid attachment)</span>
                                    )
                                ) : (
                                    resp.field.fieldType === "checkbox" ? (
                                        <span className={`inline-block text-[12px] px-3 py-0.5 rounded-full font-medium ${resp.value === "true" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}`}>
                                            {resp.value === "true" ? "Yes" : "No"}
                                        </span>
                                    ) : (
                                        <p className="text-[13px] text-[#1a1a18] whitespace-pre-wrap">{resp.value || <span className="text-[#9e9b95] italic">Not recorded</span>}</p>
                                    )
                                )}
                            </div>
                        ))}
                    </div>
                </div>

                {/* Signature */}
                {inspection.signature && (
                    <div className="bg-white border border-[#e8e6e1] rounded-[14px] p-5">
                        <p className="text-[12px] font-semibold text-[#9e9b95] uppercase tracking-wider mb-3">Digital Signature</p>
                        <img src={inspection.signature} alt="signature" className="max-h-24 border rounded" />
                    </div>
                )}

                {/* Footer */}
                <div className="text-center py-4 text-[11px] text-[#9e9b95]">
                    <p>This report was shared via CIMS — Quality Inspection Management System</p>
                    <p className="mt-0.5">Shared on {new Date(data.createdAt).toLocaleDateString("en-IN")}</p>
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
