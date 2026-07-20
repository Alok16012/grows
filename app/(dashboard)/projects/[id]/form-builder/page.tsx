
import { getServerSession } from "next-auth"
import { redirect } from "next/navigation"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"
import FormBuilderClient from "./FormBuilderClient"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { ChevronLeft } from "lucide-react"

export default async function FormBuilderPage({ params }: { params: { id: string } }) {
    const session = await getServerSession(authOptions)

    if (!session) redirect("/login")

    // Only ADMIN and MANAGER can access
    if (session.user.role !== "ADMIN" && session.user.role !== "MANAGER") {
        redirect("/")
    }

    const project = await prisma.project.findUnique({
        where: { id: params.id },
        include: { company: true },
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
            companyName={project.company.name}
            companyId={project.companyId}
        />
    )
}
