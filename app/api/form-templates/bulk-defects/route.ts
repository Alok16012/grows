import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma, { ensureProjectSchema } from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { checkAccess } from "@/lib/permissions"
import { readDefectSettings, settingsChanges } from "@/lib/defect-import"

// POST /api/form-templates/bulk-defects
//   { projectId, items: { label, fieldType?, options?, reportRole?, defaultValue?, isRequired?, isHidden? }[] }
//   (or { projectId, labels: string[] } — names only, default settings)
//
// Form Builder → Import Excel. For each row:
//   - a new name is added as a defect column with the row's settings (blank
//     settings take the defect default: Number, reports Auto, 0, not required,
//     shown);
//   - a defect column already in the form is updated to the row's settings,
//     or skipped when nothing differs. Its name is never changed. A name used
//     by more than one field, or by a field that isn't a defect column, is
//     skipped — the import can't tell which to change;
//   - repeats within the list and rows with an invalid setting are skipped.
// Everything is written in one transaction, so a failure changes nothing.

const MAX_ITEMS = 300
const MAX_LABEL_LENGTH = 100

/** Trimmed, inner whitespace collapsed — how a defect name is stored. */
const clean = (s: string) => s.trim().replace(/\s+/g, " ")
/** Two names are the same defect when they match ignoring case and spacing. */
const key = (s: string) => clean(s).toUpperCase()

type Settings = ReturnType<typeof readDefectSettings>["settings"]

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions)
        if (!checkAccess(session, ["MANAGER", "HR_MANAGER"], "projects.manage")) {
            return new NextResponse("Forbidden", { status: 403 })
        }

        const body = await req.json().catch(() => null)
        const projectId: unknown = body?.projectId
        const rawItems: unknown[] | null = Array.isArray(body?.items) ? body.items
            : Array.isArray(body?.labels) ? body.labels.map((label: unknown) => ({ label })) : null
        if (typeof projectId !== "string" || !projectId) return new NextResponse("projectId is required", { status: 400 })
        if (!rawItems || rawItems.length === 0) return new NextResponse("items must be a non-empty list", { status: 400 })
        if (rawItems.length > MAX_ITEMS) return new NextResponse(`At most ${MAX_ITEMS} defects per import`, { status: 400 })

        const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } })
        if (!project) return new NextResponse("Project not found", { status: 404 })

        await ensureProjectSchema()
        const existing = await prisma.formTemplate.findMany({
            where: { projectId },
            select: {
                id: true, fieldLabel: true, category: true, fieldType: true, options: true, reportRole: true,
                defaultValue: true, isRequired: true, isHidden: true, displayOrder: true,
            },
        })
        const byKey = new Map<string, typeof existing>()
        for (const f of existing) byKey.set(key(f.fieldLabel), [...(byKey.get(key(f.fieldLabel)) ?? []), f])

        const toAdd: ({ label: string } & Settings)[] = []
        const toUpdate: { id: string; label: string; settings: Settings; changes: string[] }[] = []
        const skipped: { label: string; reason: string }[] = []
        const seen = new Set<string>()
        for (const raw of rawItems) {
            const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>
            const label = typeof r.label === "string" ? clean(r.label) : ""
            if (!label) { skipped.push({ label: String(r.label ?? ""), reason: "Empty name" }); continue }
            if (label.length > MAX_LABEL_LENGTH) { skipped.push({ label, reason: `Longer than ${MAX_LABEL_LENGTH} characters` }); continue }
            // Booleans may arrive as true/false (the Form Builder) or as sheet text.
            const { settings, problems } = readDefectSettings({
                fieldType: r.fieldType, options: r.options, reportRole: r.reportRole, defaultValue: r.defaultValue,
                isRequired: typeof r.isRequired === "boolean" ? (r.isRequired ? "Yes" : "No") : r.isRequired,
                isHidden: typeof r.isHidden === "boolean" ? (r.isHidden ? "Yes" : "No") : r.isHidden,
            })
            if (problems.length) { skipped.push({ label, reason: problems.join("; ") }); continue }
            const k = key(label)
            if (seen.has(k)) { skipped.push({ label, reason: "Repeated in the file" }); continue }
            seen.add(k)
            const matches = byKey.get(k) ?? []
            if (matches.length === 0) { toAdd.push({ label, ...settings }); continue }
            if (matches.length > 1) { skipped.push({ label, reason: `${matches.length} fields in the form have this name — change them in the editor` }); continue }
            const f = matches[0]
            if (f.category !== "DEFECT") { skipped.push({ label, reason: "Not a defect column — change it in the editor" }); continue }
            const changes = settingsChanges(f, settings)
            if (!changes.length) { skipped.push({ label, reason: "No change" }); continue }
            toUpdate.push({ id: f.id, label: f.fieldLabel, settings, changes })
        }

        // New columns go after everything already in the form, in file order.
        const start = existing.reduce((m, f) => Math.max(m, f.displayOrder ?? 0), -1) + 1
        const writes = [
            ...toAdd.map((it, i) => prisma.formTemplate.create({
                data: {
                    projectId, fieldLabel: it.label, category: "DEFECT",
                    fieldType: it.fieldType, options: it.options, reportRole: it.reportRole,
                    defaultValue: it.defaultValue, isRequired: it.isRequired, isHidden: it.isHidden,
                    displayOrder: start + i,
                },
            })),
            ...toUpdate.map(u => prisma.formTemplate.update({
                where: { id: u.id },
                data: {
                    fieldType: u.settings.fieldType, options: u.settings.options, reportRole: u.settings.reportRole,
                    defaultValue: u.settings.defaultValue, isRequired: u.settings.isRequired, isHidden: u.settings.isHidden,
                },
            })),
        ]
        if (writes.length) await prisma.$transaction(writes)

        return NextResponse.json({
            added: toAdd.map(i => i.label),
            updated: toUpdate.map(u => ({ label: u.label, changes: u.changes })),
            skipped,
        })
    } catch (error) {
        console.error("[FORM_TEMPLATES_BULK_DEFECTS]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
