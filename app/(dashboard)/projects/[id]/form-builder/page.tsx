
import { getServerSession } from "next-auth"
import { redirect } from "next/navigation"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { checkAccess } from "@/lib/permissions"
import FormBuilderClient from "./FormBuilderClient"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { ChevronLeft } from "lucide-react"

export default async function FormBuilderPage({ params }: { params: { id: string } }) {
    const session = await getServerSession(authOptions)

    if (!session) redirect("/login")

    // Building a project's inspection form is a project-management action: every
    // /api/form-templates write behind this page is gated on `projects.manage`,
    // so the page guard must ask the same question (ADMIN passes implicitly).
    if (!checkAccess(session, [], "projects.manage")) {
        redirect("/")
    }

    const project = await prisma.project.findUnique({
        where: { id: params.id },
        include: { site: { select: { id: true, name: true } } },
    })

    if (!project) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
                <h1 className="text-2xl font-bold">Project not found</h1>
                <Button asChild><Link href="/projects">Go Back</Link></Button>
            </div>
        )
    }

    return (
        <FormBuilderClient
            projectId={params.id}
            projectName={project.name}
            siteName={project.site?.name ?? "No Site"}
        />
    )
}
