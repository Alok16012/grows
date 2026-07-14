
import { getServerSession } from "next-auth"
import Link from "next/link"
import { redirect } from "next/navigation"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card"
import { Plus, Building2, Phone, User } from "lucide-react"

export default async function CompaniesPage() {
    const session = await getServerSession(authOptions)

    if (!session) {
        redirect("/login")
    }

    if (session.user.role === "CLIENT") {
        redirect("/client")
    }

    if (session.user.role === "INSPECTION_BOY") {
        redirect("/inspection")
    }

    let companies = []
    try {
        companies = await prisma.company.findMany({
            include: {
                _count: {
                    select: { projects: true },
                },
            },
            orderBy: {
                createdAt: "desc",
            },
        })
    } catch (error) {
        console.error("Failed to fetch companies:", error)
        return (
            <div className="flex min-h-[400px] flex-col items-center justify-center rounded-lg border border-dashed shadow-sm">
                <div className="flex flex-col items-center gap-2 text-center px-4">
                    <Building2 className="h-10 w-10 text-destructive" />
                    <h3 className="text-xl font-bold tracking-tight">
                        Database Connection Error
                    </h3>
                    <p className="text-sm text-muted-foreground max-w-sm">
                        Could not connect to the database to retrieve companies. This might be due to a configuration issue on Netlify.
                    </p>
                    <Button asChild className="mt-4">
                        <Link href="/">Back to Dashboard</Link>
                    </Button>
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-[24px] font-semibold tracking-[-0.4px] text-[var(--text)]">Companies</h1>
                <Link
                    href="/companies/create"
                    className="inline-flex items-center justify-center bg-[var(--accent)] text-white rounded-[10px] text-[13px] font-medium px-4 py-2 hover:opacity-90 transition-opacity"
                >
                    <Plus className="mr-1.5 h-4 w-4" /> Add Company
                </Link>
            </div>

            {companies.length === 0 ? (
                <div className="flex min-h-[400px] flex-col items-center justify-center rounded-[14px] bg-white border border-dashed border-[var(--border2)] shadow-sm">
                    <div className="flex flex-col items-center gap-1 text-center">
                        <h3 className="text-xl font-semibold tracking-tight text-[var(--text)]">
                            No companies added
                        </h3>
                        <p className="text-[13px] text-[var(--text2)]">
                            You can start by adding a new company.
                        </p>
                        <Link
                            href="/companies/create"
                            className="mt-4 inline-flex items-center justify-center bg-[var(--accent)] text-white rounded-[10px] text-[13px] font-medium px-4 py-2 hover:opacity-90 transition-opacity"
                        >
                            Add Company
                        </Link>
                    </div>
                </div>
            ) : (
                <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-4">
                    {companies.map((company) => (
                        <div key={company.id} className="bg-white border border-[var(--border)] rounded-[14px] overflow-hidden hover:shadow-[0_3px_14px_rgba(0,0,0,0.05)] hover:border-[var(--border2)] transition-all flex flex-col">
                            <div className="p-[18px_20px] flex-1">
                                <div className="flex items-start gap-3 mb-4">
                                    <div className="w-[38px] h-[38px] bg-[var(--accent-light)] rounded-[9px] flex items-center justify-center shrink-0">
                                        <Building2 className="h-5 w-5 text-[var(--accent)]" strokeWidth={2.5} />
                                    </div>
                                    <div className="flex-1 min-w-0 pt-0.5">
                                        <h3 className="text-[15px] font-semibold text-[var(--text)] leading-tight truncate">{company.name}</h3>
                                        <p className="text-[12px] text-[var(--text3)] mt-0.5 truncate">{company.address || "No address provided"}</p>
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <div className="flex items-center gap-2 text-[13px] text-[var(--text2)]">
                                        <User className="h-[14px] w-[14px] text-[var(--text3)] shrink-0" />
                                        <span className="truncate">{company.contactPerson || "N/A"}</span>
                                    </div>
                                    <div className="flex items-center gap-2 text-[13px] text-[var(--text2)]">
                                        <Phone className="h-[14px] w-[14px] text-[var(--text3)] shrink-0" />
                                        <span className="truncate">{company.contactPhone || "N/A"}</span>
                                    </div>
                                </div>
                            </div>
                            <div className="border-t border-[var(--border)] px-[20px] py-[12px] flex items-center justify-between bg-[var(--surface2)]/30">
                                <span className="text-[12px] text-[var(--text3)] font-medium">
                                    {company._count.projects} Project{company._count.projects !== 1 ? 's' : ''}
                                </span>
                                <Link
                                    href={`/companies/${company.id}`}
                                    className="text-[12.5px] font-semibold text-[var(--accent-text)] hover:text-[var(--accent)] transition-colors flex items-center gap-1"
                                >
                                    View Details <span>&rarr;</span>
                                </Link>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
