
"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card"
import { Plus, ChevronLeft, MapPin, User, Phone, Calendar, Pencil, Trash2, Loader2, LayoutTemplate } from "lucide-react"
import { can } from "@/lib/can"

type Project = {
    id: string
    name: string
    description: string | null
    createdAt: string
}

type Company = {
    id: string
    name: string
    address: string | null
    contactPerson: string | null
    contactPhone: string | null
    logoUrl: string | null
    projects: Project[]
}

type Session = {
    user: {
        id: string
        name: string
        role: string
    }
}

export default function CompanyDetailsClient({
    companyId,
    session,
}: {
    companyId: string
    session: Session
}) {
    const router = useRouter()
    const [company, setCompany] = useState<Company | null>(null)
    const [loading, setLoading] = useState(true)
    const [deletingProjectId, setDeletingProjectId] = useState<string | null>(null)
    const [deletingCompany, setDeletingCompany] = useState(false)

    const isAdminOrManager = can(session, "companies.manage")

    const fetchCompany = async () => {
        try {
            const res = await fetch(`/api/companies/${companyId}`)
            if (!res.ok) throw new Error("Not found")
            const data = await res.json()
            setCompany(data)
        } catch {
            setCompany(null)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchCompany()
    }, [companyId])

    const handleDeleteProject = async (projectId: string, projectName: string) => {
        if (!confirm(`WARNING: Are you sure you want to delete project "${projectName}"? This will permanently delete ALL related assignments and inspections. This action CANNOT be undone.`)) return
        setDeletingProjectId(projectId)
        try {
            const res = await fetch(`/api/projects/${projectId}`, { method: "DELETE" })
            if (!res.ok) throw new Error("Failed")
            await fetchCompany()
        } catch {
            alert("Failed to delete project. Please try again.")
        } finally {
            setDeletingProjectId(null)
        }
    }

    const handleDeleteCompany = async () => {
        if (!company) return
        if (!confirm(`WARNING: Are you sure you want to delete "${company.name}"? This will permanently delete ALL related projects, assignments, and inspections. This action CANNOT be undone.`)) return
        setDeletingCompany(true)
        try {
            const res = await fetch(`/api/companies/${companyId}`, { method: "DELETE" })
            if (!res.ok) throw new Error("Failed")
            router.push("/companies")
            router.refresh()
        } catch {
            alert("Failed to delete site. Please try again.")
            setDeletingCompany(false)
        }
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[50vh]">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        )
    }

    if (!company) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
                <h1 className="text-2xl font-bold">Site not found</h1>
                <Button asChild><Link href="/companies">Go Back</Link></Button>
            </div>
        )
    }

    return (
        <div className="min-h-[calc(100vh-54px)] bg-[var(--bg)] p-[22px_26px]">
            {/* Header */}
            <div className="flex items-start justify-between mb-[20px]">
                <div className="flex items-start gap-4">
                    <Link
                        href="/companies"
                        className="w-8 h-8 bg-white border border-[var(--border)] rounded-[8px] flex items-center justify-center text-[var(--text2)] hover:bg-[var(--surface2)] transition-colors shrink-0 mt-0.5"
                    >
                        <ChevronLeft className="h-4 w-4" />
                    </Link>
                    <div>
                        <h1 className="text-[22px] font-semibold tracking-[-0.4px] text-[var(--text)] leading-tight">{company.name}</h1>
                        <div className="flex flex-wrap items-center gap-[16px] mt-1.5">
                            {company.address && (
                                <span className="flex items-center gap-[5px] text-[12.5px] text-[var(--text2)]">
                                    <MapPin className="h-3 w-3 text-[var(--text3)] shrink-0" /> <span className="truncate max-w-[200px]">{company.address}</span>
                                </span>
                            )}
                            {company.contactPerson && (
                                <>
                                    {company.address && <span className="text-[10px] text-[var(--border2)]">•</span>}
                                    <span className="flex items-center gap-[5px] text-[12.5px] text-[var(--text2)]">
                                        <User className="h-3 w-3 text-[var(--text3)] shrink-0" /> <span className="truncate max-w-[150px]">{company.contactPerson}</span>
                                    </span>
                                </>
                            )}
                            {company.contactPhone && (
                                <>
                                    {(company.address || company.contactPerson) && <span className="text-[10px] text-[var(--border2)]">•</span>}
                                    <span className="flex items-center gap-[5px] text-[12.5px] text-[var(--text2)]">
                                        <Phone className="h-3 w-3 text-[var(--text3)] shrink-0" /> {company.contactPhone}
                                    </span>
                                </>
                            )}
                        </div>
                    </div>
                </div>
                {isAdminOrManager && (
                    <div className="flex items-center gap-2">
                        <Link
                            href={`/companies/${companyId}/edit`}
                            className="inline-flex items-center justify-center bg-white border border-[var(--border)] rounded-[9px] text-[12.5px] font-medium text-[var(--text2)] h-[34px] px-3 hover:bg-[var(--surface2)] hover:text-[var(--text)] transition-colors shrink-0"
                        >
                            <Pencil className="mr-1.5 h-3.5 w-3.5" /> Edit
                        </Link>
                        <button
                            onClick={handleDeleteCompany}
                            disabled={deletingCompany}
                            className="inline-flex items-center justify-center bg-[var(--red-light)] border border-[#fca5a5] text-[var(--red)] rounded-[9px] text-[12.5px] font-medium h-[34px] px-3 hover:bg-[#fee2e2] transition-colors shrink-0 disabled:opacity-50"
                        >
                            {deletingCompany ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Trash2 className="mr-1.5 h-3.5 w-3.5" />}
                            Delete Site
                        </button>
                    </div>
                )}
            </div>

            <div className="h-px w-full bg-[var(--border)] my-4"></div>

            {/* Projects Section */}
            <div>
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-[15px] font-semibold text-[var(--text)]">
                        Projects <span className="font-normal text-[var(--text3)]">({company.projects.length})</span>
                    </h2>
                    <Link
                        href={`/projects/create?companyId=${company.id}`}
                        className="inline-flex items-center justify-center bg-[var(--accent)] text-white rounded-[9px] text-[12.5px] font-medium h-[34px] px-3 hover:opacity-90 transition-opacity"
                    >
                        <Plus className="mr-1.5 h-4 w-4" /> Add Project
                    </Link>
                </div>

                {company.projects.length === 0 ? (
                    <div className="flex flex-col items-center justify-center p-8 text-center text-[var(--text2)] border border-dashed border-[var(--border)] rounded-[12px] bg-white">
                        <p className="text-[13px] mb-2">No projects found for this site.</p>
                        <Link
                            href={`/projects/create?companyId=${company.id}`}
                            className="text-[13px] text-[var(--accent-text)] hover:underline font-medium"
                        >
                            Create the first project
                        </Link>
                    </div>
                ) : (
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-[14px]">
                        {company.projects.map((project) => (
                            <div key={project.id} className="bg-white border border-[var(--border)] rounded-[12px] overflow-hidden hover:shadow-[0_3px_14px_rgba(0,0,0,0.07)] hover:border-[var(--border2)] transition-all flex flex-col">
                                <div className="p-[16px_18px] flex-1">
                                    <h3 className="text-[14px] font-semibold text-[var(--text)] mb-1 leading-tight">{project.name}</h3>
                                    <p className="text-[12.5px] text-[var(--text2)] leading-[1.45] mb-3 line-clamp-2">
                                        {project.description || "No description provided."}
                                    </p>
                                    <div className="flex items-center gap-1.5 text-[12px] text-[var(--text3)]">
                                        <Calendar className="h-[11px] w-[11px] shrink-0" />
                                        Created {new Date(project.createdAt).toLocaleDateString()}
                                    </div>
                                </div>
                                {isAdminOrManager && (
                                    <div className="border-t border-[var(--border)] p-[10px_18px] flex items-center flex-wrap gap-2 bg-[var(--surface2)]/30">
                                        <Link
                                            href={`/projects/${project.id}/form-builder`}
                                            className="inline-flex items-center justify-center h-8 bg-[var(--surface2)] border border-[var(--border)] rounded-[7px] text-[12px] font-medium text-[var(--text2)] px-2.5 gap-1.5 hover:bg-[var(--accent-light)] hover:text-[var(--accent-text)] hover:border-[var(--accent)] transition-colors tracking-tight"
                                        >
                                            <LayoutTemplate className="h-[11px] w-[11px]" /> Form Builder
                                        </Link>
                                        <Link
                                            href={`/projects/${project.id}/edit`}
                                            className="inline-flex items-center justify-center h-8 bg-[var(--surface2)] border border-[var(--border)] rounded-[7px] text-[12px] font-medium text-[var(--text2)] px-2.5 gap-1.5 hover:bg-[var(--accent-light)] hover:text-[var(--accent-text)] hover:border-[var(--accent)] transition-colors tracking-tight"
                                        >
                                            <Pencil className="h-[11px] w-[11px]" /> Edit
                                        </Link>
                                        <button
                                            onClick={() => handleDeleteProject(project.id, project.name)}
                                            disabled={deletingProjectId === project.id}
                                            className="inline-flex items-center justify-center h-8 bg-[var(--surface2)] border border-[var(--border)] rounded-[7px] text-[12px] font-medium text-[var(--text2)] px-2.5 gap-1.5 hover:bg-[var(--red-light)] hover:text-[var(--red)] hover:border-[#fca5a5] transition-colors tracking-tight disabled:opacity-50 ml-auto"
                                        >
                                            {deletingProjectId === project.id
                                                ? <Loader2 className="h-[11px] w-[11px] animate-spin" />
                                                : <Trash2 className="h-[11px] w-[11px]" />}
                                            Delete
                                        </button>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}
