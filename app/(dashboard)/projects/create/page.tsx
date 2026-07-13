
"use client"

import { Suspense, useState, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { ChevronLeft, Loader2 } from "lucide-react"

type Company = {
    id: string
    name: string
}

function CreateProjectForm() {
    const router = useRouter()
    const searchParams = useSearchParams()

    // Fix hydration mismatch: wait for mount to safely read searchParams
    const [isMounted, setIsMounted] = useState(false)
    useEffect(() => {
        setIsMounted(true)
    }, [])

    const initialCompanyId = searchParams.get("companyId") || ""

    const [loading, setLoading] = useState(false)
    const [companies, setCompanies] = useState<Company[]>([])
    const [loadingCompanies, setLoadingCompanies] = useState(true)
    const [error, setError] = useState("")

    // We only want to set the initial company ID if it's available and we just mounted
    const [selectedCompanyId, setSelectedCompanyId] = useState("")

    useEffect(() => {
        if (isMounted && initialCompanyId && !selectedCompanyId) {
            setSelectedCompanyId(initialCompanyId)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isMounted, initialCompanyId])

    useEffect(() => {
        const fetchCompanies = async () => {
            try {
                const res = await fetch("/api/companies")
                const data = await res.json()
                setCompanies(data)
            } catch {
                setError("Failed to load sites")
            } finally {
                setLoadingCompanies(false)
            }
        }
        fetchCompanies()
    }, [])

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault()
        setLoading(true)
        setError("")

        const formData = new FormData(e.currentTarget)
        const data = {
            name: formData.get("name"),
            description: formData.get("description"),
            companyId: selectedCompanyId,
        }

        try {
            const res = await fetch("/api/projects", {
                method: "POST",
                body: JSON.stringify(data),
                headers: { "Content-Type": "application/json" },
            })

            if (!res.ok) throw new Error("Failed to create project")

            router.push(selectedCompanyId ? `/companies/${selectedCompanyId}` : "/companies")
            router.refresh()
        } catch {
            setError("Something went wrong. Please try again.")
        } finally {
            setLoading(false)
        }
    }

    const inputClasses = "w-full p-[10px_14px] bg-[var(--surface2)] border border-[var(--border)] rounded-[9px] text-[13px] text-[var(--text)] outline-none transition-all placeholder:text-[var(--text3)] focus:border-[var(--accent)] focus:bg-white focus:shadow-[0_0_0_3px_rgba(26,158,110,0.08)]"

    const backLink = isMounted && initialCompanyId ? `/companies/${initialCompanyId}` : "/companies"

    return (
        <div className="min-h-[calc(100vh-54px)] bg-[var(--bg)] py-[28px] px-[24px]">
            <div className="max-w-[520px] mx-auto w-full">
                {/* Header Row */}
                <div className="flex items-center gap-[14px] mb-[28px]">
                    <Link
                        href={backLink}
                        className="w-[32px] h-[32px] bg-white border border-[var(--border)] rounded-[8px] flex items-center justify-center shrink-0 hover:bg-[var(--surface2)] transition-colors"
                    >
                        <ChevronLeft className="h-4 w-4 text-[var(--text2)]" />
                    </Link>
                    <h1 className="text-[22px] font-semibold tracking-[-0.4px] text-[var(--text)]">
                        Create Project
                    </h1>
                </div>

                {/* Form Card */}
                <div className="bg-white border border-[var(--border)] rounded-[14px] p-[28px] shadow-none">
                    <form onSubmit={handleSubmit}>
                        {/* Card Header */}
                        <div className="mb-[24px]">
                            <h2 className="text-[16px] font-semibold text-[var(--text)] mb-1">
                                Project Details
                            </h2>
                            <p className="text-[13px] text-[var(--text2)] leading-[1.5]">
                                Enter the information for the new project.
                            </p>
                        </div>

                        <div className="flex flex-col gap-[18px]">
                            {error && (
                                <div className="p-3 text-[13px] text-[var(--red)] bg-[var(--red-light)] border border-[#fca5a5] rounded-[9px]">
                                    {error}
                                </div>
                            )}

                            {/* Field: Name */}
                            <div className="flex flex-col gap-[6px]">
                                <label htmlFor="name" className="text-[13px] font-medium text-[var(--text)] block">
                                    Project Name <span className="text-[var(--red)] ml-[2px]">*</span>
                                </label>
                                <input
                                    id="name"
                                    name="name"
                                    required
                                    placeholder="Project Alpha"
                                    className={inputClasses}
                                />
                            </div>

                            {/* Field: Description */}
                            <div className="flex flex-col gap-[6px]">
                                <label htmlFor="description" className="text-[13px] font-medium text-[var(--text)] block">
                                    Description
                                </label>
                                <textarea
                                    id="description"
                                    name="description"
                                    placeholder="Brief description of the project..."
                                    className={`${inputClasses} min-h-[90px] resize-y`}
                                />
                            </div>

                            {/* Field: Site Select */}
                            <div className="flex flex-col gap-[6px]">
                                <label htmlFor="companyId" className="text-[13px] font-medium text-[var(--text)] block">
                                    Site <span className="text-[var(--red)] ml-[2px]">*</span>
                                </label>
                                {loadingCompanies ? (
                                    <div className="flex items-center gap-2 text-[13px] text-[var(--text3)] h-[44px] px-[14px] rounded-[9px] border border-[var(--border)] bg-[var(--surface2)]">
                                        <Loader2 className="h-4 w-4 animate-spin" /> Loading sites...
                                    </div>
                                ) : (
                                    <select
                                        id="companyId"
                                        value={selectedCompanyId}
                                        onChange={(e) => setSelectedCompanyId(e.target.value)}
                                        required
                                        className={`${inputClasses} appearance-none bg-no-repeat bg-[position:right_14px_center] pr-[36px] cursor-pointer`}
                                        style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239e9b95' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E\")" }}
                                    >
                                        <option value="">Select a site...</option>
                                        {companies.map((c) => (
                                            <option key={c.id} value={c.id}>{c.name}</option>
                                        ))}
                                    </select>
                                )}
                            </div>

                            {/* Divider & Actions */}
                            <div className="border-t border-[var(--border)] mt-[8px] pt-[20px] flex justify-end gap-[10px]">
                                <Link
                                    href={backLink}
                                    className="inline-flex items-center justify-center bg-white border border-[var(--border)] text-[var(--text2)] px-[20px] py-[9px] rounded-[9px] text-[13px] font-medium cursor-pointer hover:bg-[var(--surface2)] hover:text-[var(--text)] transition-colors"
                                >
                                    Cancel
                                </Link>
                                <button
                                    type="submit"
                                    disabled={loading || !selectedCompanyId}
                                    className="inline-flex items-center justify-center bg-[var(--accent)] text-white border-0 px-[20px] py-[9px] rounded-[9px] text-[13px] font-medium cursor-pointer hover:bg-[#158a5e] disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                                >
                                    {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    Create Project
                                </button>
                            </div>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    )
}

export default function CreateProjectPage() {
    return (
        <Suspense fallback={
            <div className="flex items-center justify-center min-h-[50vh]">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        }>
            <CreateProjectForm />
        </Suspense>
    )
}
