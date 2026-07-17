"use client"

import { useState, useEffect, useCallback } from "react"
import { useSession } from "next-auth/react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
    Plus, Loader2, FolderOpen, Search, LayoutTemplate,
    Pencil, Calendar, Building2, FolderKanban
} from "lucide-react"
import { can } from "@/lib/can"

type Project = {
    id: string
    name: string
    description: string | null
    createdAt: string
    company: {
        id: string
        name: string
    }
    site: {
        id: string
        name: string
        code?: string | null
        city?: string | null
    } | null
}

// Group key/label for a project. Projects are organised by their real HR Site.
// Legacy projects with no Site link are bucketed under a single neutral
// "No Site" group instead of their Company — the Site filter must only ever
// list actual sites, never company names.
function groupOf(p: Project): { id: string; name: string; isSite: boolean } {
    if (p.site) return { id: `site:${p.site.id}`, name: p.site.name, isSite: true }
    return { id: "no-site", name: "No Site", isSite: false }
}

export default function ProjectsPage() {
    const { data: session } = useSession()
    const role = session?.user?.role

    const [projects, setProjects] = useState<Project[]>([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState("")
    const [selectedSiteId, setSelectedSiteId] = useState("all")
    const [sites, setSites] = useState<{ id: string; name: string }[]>([])

    const isAdminOrManager = can(session, "projects.view")

    const fetchProjects = useCallback(async () => {
        setLoading(true)
        try {
            const res = await fetch("/api/projects")
            const data = await res.json()
            const list: Project[] = Array.isArray(data) ? data : []
            setProjects(list)

            // Extract unique real sites for the filter dropdown — company /
            // "No Site" buckets are deliberately excluded so only sites show.
            const siteMap = new Map<string, string>()
            list.forEach(p => {
                const g = groupOf(p)
                if (g.isSite) siteMap.set(g.id, g.name)
            })
            setSites(Array.from(siteMap.entries()).map(([id, name]) => ({ id, name })))
        } catch {
            setProjects([])
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        fetchProjects()
    }, [fetchProjects])

    const filtered = projects.filter(p => {
        const g = groupOf(p)
        const matchSearch = p.name.toLowerCase().includes(search.toLowerCase()) ||
            (p.description?.toLowerCase().includes(search.toLowerCase()) ?? false) ||
            g.name.toLowerCase().includes(search.toLowerCase())
        const matchSite = selectedSiteId === "all" || g.id === selectedSiteId
        return matchSearch && matchSite
    })

    // Group by site (falling back to company for legacy projects)
    const grouped = filtered.reduce<Record<string, { site: { id: string; name: string }; projects: Project[] }>>((acc, p) => {
        const g = groupOf(p)
        if (!acc[g.id]) acc[g.id] = { site: g, projects: [] }
        acc[g.id].projects.push(p)
        return acc
    }, {})

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[50vh]">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        )
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
                        <FolderKanban className="h-8 w-8 text-primary" />
                        Projects
                    </h1>
                    <p className="text-muted-foreground text-sm mt-1">
                        {projects.length} project{projects.length !== 1 ? "s" : ""} across {sites.length} site{sites.length !== 1 ? "s" : ""}
                    </p>
                </div>
                {isAdminOrManager && (
                    <Button asChild>
                        <Link href="/projects/create">
                            <Plus className="mr-2 h-4 w-4" />
                            New Project
                        </Link>
                    </Button>
                )}
            </div>

            {/* Filters */}
            <div className="flex flex-wrap gap-3">
                <div className="relative flex-1 min-w-[200px] max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search projects..."
                        className="pl-9"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                </div>
                {sites.length > 1 && (
                    <select
                        className="h-10 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        value={selectedSiteId}
                        onChange={e => setSelectedSiteId(e.target.value)}
                    >
                        <option value="all">All Sites</option>
                        {sites.map(s => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                    </select>
                )}
            </div>

            {/* Content */}
            {filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center min-h-[40vh] gap-4 rounded-xl border-2 border-dashed p-8 text-center">
                    <FolderOpen className="h-12 w-12 text-muted-foreground opacity-40" />
                    <div>
                        <p className="text-lg font-semibold">No projects found</p>
                        <p className="text-sm text-muted-foreground mt-1">
                            {search || selectedSiteId !== "all" ? "Try adjusting your filters." : "Create your first project to get started."}
                        </p>
                    </div>
                    {isAdminOrManager && !search && selectedSiteId === "all" && (
                        <Button asChild>
                            <Link href="/projects/create">
                                <Plus className="mr-2 h-4 w-4" /> Create Project
                            </Link>
                        </Button>
                    )}
                </div>
            ) : (
                <div className="space-y-8">
                    {Object.values(grouped)
                        .sort((a, b) => {
                            // Keep the "No Site" bucket at the very bottom.
                            if (a.site.id === "no-site") return 1
                            if (b.site.id === "no-site") return -1
                            return a.site.name.localeCompare(b.site.name)
                        })
                        .map(group => (
                        <div key={group.site.id} className="space-y-3">
                            {/* Site Group Header */}
                            <div className="flex items-center gap-2">
                                <Building2 className="h-4 w-4 text-muted-foreground" />
                                <span className="text-sm font-semibold text-foreground">
                                    {group.site.name}
                                </span>
                                <Badge variant="secondary" className="text-xs">
                                    {group.projects.length}
                                </Badge>
                            </div>

                            {/* Project Cards */}
                            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                                {group.projects.map(project => (
                                    <Card key={project.id} className="hover:shadow-md transition-shadow">
                                        <CardHeader className="pb-2">
                                            <CardTitle className="text-base leading-tight">{project.name}</CardTitle>
                                            <CardDescription className="line-clamp-2 text-xs">
                                                {project.description || "No description provided"}
                                            </CardDescription>
                                        </CardHeader>
                                        <CardContent>
                                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                                <Calendar className="h-3 w-3" />
                                                Created {new Date(project.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                                            </div>
                                        </CardContent>
                                        {isAdminOrManager && (
                                            <CardFooter className="flex flex-wrap gap-2 pt-0">
                                                <Button variant="outline" size="sm" asChild>
                                                    <Link href={`/projects/${project.id}/form-builder`}>
                                                        <LayoutTemplate className="h-3 w-3 mr-1" /> Form Builder
                                                    </Link>
                                                </Button>
                                                <Button variant="outline" size="sm" asChild>
                                                    <Link href={`/projects/${project.id}/report-config`}>
                                                        ⚙️ Report Config
                                                    </Link>
                                                </Button>
                                                <Button variant="ghost" size="sm" asChild>
                                                    <Link href={`/projects/${project.id}/edit`}>
                                                        <Pencil className="h-3 w-3 mr-1" /> Edit
                                                    </Link>
                                                </Button>
                                            </CardFooter>
                                        )}
                                    </Card>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
