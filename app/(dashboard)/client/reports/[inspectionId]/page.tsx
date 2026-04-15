
"use client"

import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
    ChevronLeft,
    Download,
    Calendar,
    User,
    Building2,
    FileText,
    CheckCircle2,
    Loader2,
    Check,
    X,
    ExternalLink
} from "lucide-react"
import Link from "next/link"
import { format } from "date-fns"
import { pdf } from '@react-pdf/renderer'
import { InspectionPDF } from "@/components/InspectionPDF"
import { DocumentViewer } from "@/components/DocumentViewer"

export default function ClientReportDetailPage() {
    const params = useParams()
    const router = useRouter()
    const [report, setReport] = useState<any>(null)
    const [loading, setLoading] = useState(true)
    const [downloading, setDownloading] = useState(false)
    const [previewUrl, setPreviewUrl] = useState<string | null>(null)
    const [previewName, setPreviewName] = useState<string>("")

    useEffect(() => {
        const fetchReport = async () => {
            try {
                const res = await fetch(`/api/client/reports/${params.inspectionId}`)
                if (!res.ok) {
                    if (res.status === 403) {
                        alert("Unauthorized to view this report")
                        router.push("/client")
                        return
                    }
                    throw new Error("Failed to fetch report")
                }
                const data = await res.json()
                setReport(data)
            } catch (error) {
                console.error("Error:", error)
                router.push("/client")
            } finally {
                setLoading(false)
            }
        }
        fetchReport()
    }, [params.inspectionId, router])

    const handleDownload = async () => {
        if (!report) return
        setDownloading(true)
        try {
            const doc = <InspectionPDF inspection={report} />
            const blob = await pdf(doc).toBlob()
            const url = URL.createObjectURL(blob)
            const link = document.createElement('a')
            link.href = url
            link.download = `Inspection_${report.assignment.project.name.replace(/\s+/g, '_')}_${format(new Date(), 'yyyyMMdd')}.pdf`
            document.body.appendChild(link)
            link.click()
            document.body.removeChild(link)
            URL.revokeObjectURL(url)
        } catch (error) {
            console.error("PDF Download Error:", error)
            alert("Failed to generate PDF. Please try again.")
        } finally {
            setDownloading(false)
        }
    }

    if (loading) {
        return (
            <div className="flex h-[80vh] items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        )
    }

    if (!report) return null

    return (
        <div className="container py-8 max-w-5xl space-y-8">
            {/* Top Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-2">
                    <Button variant="ghost" size="sm" asChild className="-ml-3 h-8 text-muted-foreground hover:text-foreground">
                        <Link href="/client">
                            <ChevronLeft className="mr-1 h-4 w-4" />
                            Back to My Reports
                        </Link>
                    </Button>
                    <nav className="flex text-sm text-muted-foreground gap-2 items-center">
                        <span className="hover:text-foreground cursor-default text-xs uppercase font-semibold tracking-wider">My Reports</span>
                        <span>/</span>
                        <span className="text-foreground font-bold">{report.assignment.project.name}</span>
                    </nav>
                </div>
                <div className="flex items-center gap-3">
                    <Badge className="bg-green-100 text-green-700 hover:bg-green-100 border-none px-3 py-1 font-bold">
                        <CheckCircle2 className="h-4 w-4 mr-1.5" />
                        Approved Report
                    </Badge>
                    <Button onClick={handleDownload} disabled={downloading} className="shadow-lg">
                        {downloading ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                            <Download className="mr-2 h-4 w-4" />
                        )}
                        Download PDF
                    </Button>
                </div>
            </div>

            {/* Report Header Block */}
            <Card className="border-none shadow-md overflow-hidden">
                <div className="bg-primary p-8 text-primary-foreground">
                    <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                        <div className="space-y-4">
                            <div>
                                <h1 className="text-3xl font-extrabold tracking-tight">{report.assignment.project.company.name}</h1>
                                <p className="text-lg opacity-90 font-medium">{report.assignment.project.name}</p>
                            </div>
                            <div className="flex flex-wrap gap-y-2 gap-x-6 text-sm opacity-90">
                                <div className="flex items-center gap-2">
                                    <FileText className="h-4 w-4" />
                                    <span>Ref: <span className="font-mono font-bold uppercase">INS-{report.id.substring(0, 8)}</span></span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <User className="h-4 w-4" />
                                    <span>Inspector: <span className="font-bold">{report.submitter.name}</span></span>
                                </div>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm bg-white/10 backdrop-blur-sm p-4 rounded-xl border border-white/20">
                            <div className="space-y-0.5">
                                <p className="text-[10px] uppercase font-bold tracking-widest opacity-70">Inspected</p>
                                <p className="font-bold">{format(new Date(report.submittedAt), "MMM d, yyyy")}</p>
                            </div>
                            <div className="space-y-0.5">
                                <p className="text-[10px] uppercase font-bold tracking-widest opacity-70">Approved</p>
                                <p className="font-bold">{format(new Date(report.approvedAt), "MMM d, yyyy")}</p>
                            </div>
                        </div>
                    </div>
                </div>
                <CardContent className="p-6 bg-muted/20">
                    <div className="flex items-center gap-4 text-sm">
                        <Badge variant="outline" className="bg-white/50 border-muted-foreground/20">Status: <span className="text-green-600 ml-1 font-bold">Approved</span></Badge>
                        <div className="flex-1 border-t border-muted/60" />
                    </div>
                </CardContent>
            </Card>

            {/* Responses Section */}
            <div className="space-y-6">
                <div className="flex items-center gap-3 px-1">
                    <div className="h-8 w-1 bg-primary rounded-full" />
                    <h2 className="text-2xl font-bold tracking-tight">Inspection Details</h2>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {report.responses
                        .sort((a: any, b: any) => a.field.displayOrder - b.field.displayOrder)
                        .map((resp: any) => (
                            <Card key={resp.id} className="overflow-hidden border-muted/60 bg-white">
                                <CardHeader className="bg-muted/30 py-3 px-4">
                                    <CardTitle className="text-sm font-semibold flex items-center justify-between uppercase tracking-wider text-muted-foreground">
                                        {resp.field.fieldLabel}
                                        <Badge variant="secondary" className="text-[9px] font-bold opacity-70">
                                            {resp.field.fieldType}
                                        </Badge>
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="p-4">
                                    {resp.field.fieldType === "date" ? (
                                        <div className="flex items-center font-bold text-lg text-foreground">
                                            <Calendar className="mr-2 h-5 w-5 text-primary opacity-70" />
                                            {resp.value ? format(new Date(resp.value), "MMMM d, yyyy") : "Not recorded"}
                                        </div>
                                    ) : resp.field.fieldType === "checkbox" ? (
                                        <div className="flex items-center">
                                            {resp.value === "true" ? (
                                                <Badge className="bg-green-100 text-green-700 border-green-200">
                                                    <Check className="mr-1 h-3 w-3" /> Yes
                                                </Badge>
                                            ) : (
                                                <Badge variant="outline" className="text-muted-foreground">
                                                    <X className="mr-1 h-3 w-3" /> No
                                                </Badge>
                                            )}
                                        </div>
                                    ) : resp.field.fieldType === "dropdown" ? (
                                        <Badge variant="outline" className="text-primary border-primary/30 font-bold bg-primary/5 px-3 py-1">
                                            {resp.value || "Not selected"}
                                        </Badge>
                                    ) : resp.field.fieldType === "file" ? (
                                        <div className="space-y-2">
                                            {resp.value?.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? (
                                                <div className="relative group rounded-lg overflow-hidden border">
                                                    <img
                                                        src={resp.value}
                                                        alt={resp.field.fieldLabel}
                                                        className="w-full h-auto max-h-48 object-cover transition-transform group-hover:scale-105"
                                                    />
                                                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                        <Button 
                                                            variant="secondary" 
                                                            size="sm" 
                                                            type="button"
                                                            onClick={() => {
                                                                setPreviewUrl(resp.value)
                                                                setPreviewName(resp.field.fieldLabel)
                                                            }}
                                                        >
                                                            <ExternalLink className="h-4 w-4 mr-2" /> View Full
                                                        </Button>
                                                    </div>
                                                </div>
                                            ) : resp.value ? (
                                                <Button 
                                                    variant="outline" 
                                                    className="w-full justify-start gap-2" 
                                                    type="button"
                                                    onClick={() => {
                                                        setPreviewUrl(resp.value)
                                                        setPreviewName(resp.field.fieldLabel)
                                                    }}
                                                >
                                                    <ExternalLink className="h-4 w-4" />
                                                    View Attachment
                                                </Button>
                                            ) : (
                                                <p className="text-sm text-muted-foreground italic">No file uploaded</p>
                                            )}
                                        </div>
                                    ) : (
                                        <p className="text-lg font-medium text-foreground whitespace-pre-wrap leading-relaxed">
                                            {resp.value || <span className="text-muted-foreground italic font-normal">Not recorded</span>}
                                        </p>
                                    )}
                                </CardContent>
                            </Card>
                        ))}
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
