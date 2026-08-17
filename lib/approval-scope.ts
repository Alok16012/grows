import prisma from "./prisma"

// Who may approve WHAT.
//
// Holding approvals.manage says you are an approver; it does not say you approve
// everybody's work. Every approval surface used to check the permission and stop
// there, so any approver saw — and could sign off — every pending inspection in
// the company, including projects they have nothing to do with.
//
// The authority is the project's manager list (ProjectManager, set on the
// project's Team step): you review the projects you were put in charge of. ADMIN
// stays unrestricted, as everywhere else in this codebase.

export type ApproverSession = { user: { id?: string | null; role: string } } | null | undefined

/** True when this caller may act on every project. */
export function approvesEverything(session: ApproverSession): boolean {
    return session?.user?.role === "ADMIN"
}

/** Project ids this caller manages. Empty array = manages nothing. */
export async function managedProjectIds(session: ApproverSession): Promise<string[]> {
    const userId = session?.user?.id
    if (!userId) return []
    const rows = await prisma.projectManager.findMany({
        where: { managerId: userId },
        select: { projectId: true },
    })
    return rows.map(r => r.projectId)
}

/**
 * Prisma `where` fragment to AND into an Inspection query so it only covers
 * projects this caller manages. Returns null for ADMIN (no restriction).
 *
 * An approver who manages no project gets `projectId: { in: [] }` — an empty
 * queue rather than everyone's, which is the point.
 */
export async function inspectionScopeForApprover(
    session: ApproverSession,
): Promise<{ assignment: { projectId: { in: string[] } } } | null> {
    if (approvesEverything(session)) return null
    const ids = await managedProjectIds(session)
    return { assignment: { projectId: { in: ids } } }
}

/** Whether this caller may review one specific project. */
export async function canApproveProject(
    session: ApproverSession,
    projectId: string | null | undefined,
): Promise<boolean> {
    if (approvesEverything(session)) return true
    if (!projectId) return false
    const ids = await managedProjectIds(session)
    return ids.includes(projectId)
}
