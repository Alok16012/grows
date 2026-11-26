import prisma from "@/lib/prisma"

// Form versioning. Editing a project's form used to change how every past
// report reads (a renamed field showed its new name on old reports). Now:
//  - each Form Builder change raises Project.formVersion by one;
//  - a submitted inspection keeps the version and a snapshot of its fields;
//  - report screens read old reports through that snapshot.

export type SnapField = { l: string; t: string; c: string; r: string | null; o: number }
export type FormSnapshot = Record<string, SnapField>

/** Raise a project's form version after a Form Builder change. Never throws. */
export async function bumpFormVersion(projectId: string | null | undefined): Promise<void> {
    if (!projectId) return
    try { await prisma.project.update({ where: { id: projectId }, data: { formVersion: { increment: 1 } } }) }
    catch (e) { console.error("[FORM_VERSION_BUMP]", e) }
}

/** The project's fields as they are now, in snapshot form. */
export async function currentSnapshot(projectId: string): Promise<FormSnapshot> {
    const fields = await prisma.formTemplate.findMany({
        where: { projectId },
        select: { id: true, fieldLabel: true, fieldType: true, category: true, reportRole: true, displayOrder: true },
    })
    const snap: FormSnapshot = {}
    for (const f of fields) snap[f.id] = { l: f.fieldLabel, t: f.fieldType, c: f.category, r: f.reportRole ?? null, o: f.displayOrder }
    return snap
}

/** Store the form version + snapshot on an inspection when it is submitted. Never throws. */
export async function snapshotForm(inspectionId: string): Promise<void> {
    try {
        const i = await prisma.inspection.findUnique({
            where: { id: inspectionId },
            select: { assignment: { select: { project: { select: { id: true, formVersion: true } } } } },
        })
        const p = i?.assignment.project
        if (!p) return
        await prisma.inspection.update({ where: { id: inspectionId }, data: { formVersion: p.formVersion, formSnapshot: await currentSnapshot(p.id) } })
    } catch (e) {
        console.error("[FORM_SNAPSHOT]", e)
    }
}

type FieldLike = { fieldLabel?: string; fieldType?: string; category?: string | null; reportRole?: string | null; displayOrder?: number | null }

/**
 * Read a report through its snapshot: each answer's field shows the name,
 * type, category and role it had when the report was submitted. Reports
 * without a snapshot (never submitted) read the live form, as before.
 */
export function withSnapshot<R extends { fieldId: string; field: FieldLike | null }>(responses: R[], snapshot: unknown): R[] {
    if (!snapshot || typeof snapshot !== "object") return responses
    const snap = snapshot as FormSnapshot
    return responses.map(r => {
        const s = snap[r.fieldId]
        if (!s || !r.field) return r
        const field = { ...r.field } as FieldLike
        if ("fieldLabel" in field || s.l) field.fieldLabel = s.l
        if (s.t) field.fieldType = s.t
        if (s.c) field.category = s.c
        if ("reportRole" in field) field.reportRole = s.r
        if ("displayOrder" in field && typeof s.o === "number") field.displayOrder = s.o
        return { ...r, field: field as R["field"] }
    })
}
