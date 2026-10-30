import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma, { ensureProjectSchema } from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { checkAccess } from "@/lib/permissions"
import { readDefectSettings } from "@/lib/defect-import"

// POST /api/form-templates/bulk-defects
//   { projectId, items: { label, fieldType?, options?, reportRole?, defaultValue?, isRequired?, isHidden? }[] }
//   (or { projectId, labels: string[] } — names only, default settings)
//
// Adds many defect columns at once (Form Builder → Import Excel), with the same
// settings the field editor offers. A blank setting takes the defect default:
// Number, reports Auto, default 0, not required, shown. Names already in the
// form — hidden ones included — are left exactly as they are, and repeats
// within the list are skipped; both are reported back, as are rows with an
// invalid setting. The rest are added in one transaction, so a failure adds
// nothing.

const MAX_ITEMS = 300
const MAX_LABEL_LENGTH = 100

/** Trimmed, inner whitespace collapsed — how a defect name is stored. */
const clean = (s: string) => s.trim().replace(/\s+/g, " ")
/** Two names are the same defect when they match ignoring case and spacing. */
const key = (s: string) => clean(s).toUpperCase()

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
            select: { fieldLabel: true, isHidden: true, displayOrder: true },
        })
        // Name → "every field with this name is hidden" (a form can hold a name twice).
        const inForm = new Map<string, boolean>()
        for (const f of existing) inForm.set(key(f.fieldLabel), (inForm.get(key(f.fieldLabel)) ?? true) && f.isHidden)

        const toAdd: ({ label: string } & ReturnType<typeof readDefectSettings>["settings"])[] = []
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
            if (inForm.has(k)) { skipped.push({ label, reason: inForm.get(k) ? "Already in the form (hidden)" : "Already in the form" }); continue }
            if (seen.has(k)) { skipped.push({ label, reason: "Repeated in the file" }); continue }
            seen.add(k)
            toAdd.push({ label, ...settings })
        }

        // New columns go after everything already in the form, in file order.
        const start = existing.reduce((m, f) => Math.max(m, f.displayOrder ?? 0), -1) + 1
        if (toAdd.length) {
            await prisma.$transaction(toAdd.map((it, i) => prisma.formTemplate.create({
                data: {
                    projectId, fieldLabel: it.label, category: "DEFECT",
                    fieldType: it.fieldType, options: it.options, reportRole: it.reportRole,
                    defaultValue: it.defaultValue, isRequired: it.isRequired, isHidden: it.isHidden,
                    displayOrder: start + i,
                },
            })))
        }

        return NextResponse.json({ added: toAdd.map(i => i.label), skipped })
    } catch (error) {
        console.error("[FORM_TEMPLATES_BULK_DEFECTS]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
