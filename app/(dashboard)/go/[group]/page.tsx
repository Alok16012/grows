"use client"

// Sidebar entry for a merged area (/go/access, /go/masters, /go/onboarding):
// opens the first tab of that area the signed-in person may see.
import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useSession } from "next-auth/react"
import { Loader2 } from "lucide-react"
import { can } from "@/lib/can"
import { MODULE_GROUPS, type ModuleGroup } from "@/components/ModuleTabs"

export default function GoToArea({ params }: { params: { group: string } }) {
    const router = useRouter()
    const { data: session, status } = useSession()
    useEffect(() => {
        if (status === "loading") return
        const g = (MODULE_GROUPS as Record<string, ModuleGroup>)[params.group]
        const isAdmin = (session?.user as any)?.role === "ADMIN"
        const first = g?.tabs.find(t => t.adminOnly ? isAdmin : !t.perms || can(session, t.perms))
        router.replace(first?.href ?? "/dashboard")
    }, [status, session, params.group, router])
    return <div className="flex h-[50vh] items-center justify-center"><Loader2 className="animate-spin text-[var(--accent)]" /></div>
}
