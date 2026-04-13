import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"

const FIXED_FIELDS = [
    { fieldLabel: "INSP. DATE", fieldType: "date", isRequired: true, category: "FIXED" },
    { fieldLabel: "SHIFT", fieldType: "dropdown", options: "G, A, B, C", isRequired: true, category: "FIXED" },
    { fieldLabel: "LOCATION", fieldType: "dropdown", options: "JIJAU, DUROSEAT", isRequired: true, category: "FIXED" },
    { fieldLabel: "PART NAME", fieldType: "dropdown", options: "DRIVER SEAT, CARGO SEAT, NIGERIA SEAT, PF SEAT", isRequired: true, category: "FIXED" },
    { fieldLabel: "PART NUMBER", fieldType: "text", isRequired: false, category: "FIXED" },
    { fieldLabel: "INSPECTED QTY", fieldType: "number", isRequired: true, category: "FIXED", defaultValue: "0" },
    { fieldLabel: "REWORK QTY", fieldType: "number", isRequired: true, category: "FIXED", defaultValue: "0" },
]

const DEFAULT_DEFECTS = [
    "WRINKLES", "BIDING MARK", "CRACKED ISSUE", "TORN STICH", "STICHING ISSUE",
    "EMBOSSING SHIFT", "STICHES OPEN", "BEADING OPEN", "PINING ISSUE", "PINING OPEN",
    "PIN GAP", "CRACK", "FOAM SLACK", "COVER ISSUE", "CHOPPED", "WELPRO OPEN",
    "BEADING NOT IN LINE", "SCREEN PRINTING TILT", "ZIGZAG STICHING", "ZIGZAG PVC LINING",
    "SCREW PROBLEM", "WIRE PROBLEM", "PACKING ISSUE", "SCRATCH MARK", "FITMENT NOT OK",
    "SEAT COVER STITCHES OPEN", "SEAT COVER BURNED", "BASE ISSUE", "WAVINESS",
    "TREAD LOOSE", "SHADE VARIATION", "FOLD MARK", "ROLLING NOT OK", "HARD PART LINE",
    "TRIM DAMAGE", "FOAM DAMAGE", "STAIN MARK", "PUNCH MARK", "OTHER"
]

const AUTO_FIELDS = [
    { fieldLabel: "TOTAL DEFECTS", fieldType: "number", isRequired: false, category: "AUTO", defaultValue: "0" },
    { fieldLabel: "REJECTED QTY", fieldType: "number", isRequired: false, category: "AUTO", defaultValue: "0" },
    { fieldLabel: "ACCEPTED QTY", fieldType: "number", isRequired: false, category: "AUTO", defaultValue: "0" },
    { fieldLabel: "REWORK %", fieldType: "number", isRequired: false, category: "AUTO", defaultValue: "0" },
    { fieldLabel: "REJECTED %", fieldType: "number", isRequired: false, category: "AUTO", defaultValue: "0" },
    { fieldLabel: "REWORK PPM", fieldType: "number", isRequired: false, category: "AUTO", defaultValue: "0" },
    { fieldLabel: "REJECTION PPM", fieldType: "number", isRequired: false, category: "AUTO", defaultValue: "0" },
    { fieldLabel: "DIFFERENCE", fieldType: "number", isRequired: false, category: "AUTO", defaultValue: "0" },
    { fieldLabel: "INSPECTOR NAME", fieldType: "text", isRequired: false, category: "AUTO" },
]


export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })

        if (session.user.role !== "ADMIN" && session.user.role !== "MANAGER" && session.user.role !== "HR_MANAGER") {
            return new NextResponse("Forbidden", { status: 403 })
        }

        const body = await req.json()
        const { projectId } = body

        if (!projectId) {
            return new NextResponse("projectId is required", { status: 400 })
        }

        // Wipe existing form fields for this project
        await prisma.formTemplate.deleteMany({
            where: { projectId }
        })

        // Combine all fields
        const allFields: any[] = [
            ...FIXED_FIELDS,
            ...DEFAULT_DEFECTS.map(d => ({ fieldLabel: d, fieldType: "number", isRequired: false, category: "DEFECT", defaultValue: "0" })),
            ...AUTO_FIELDS
        ]

        // Insert default fields
        const formattedFields = allFields.map((f, i) => ({
            projectId,
            fieldLabel: f.fieldLabel,
            fieldType: f.fieldType,
            options: f.options || null,
            defaultValue: f.defaultValue || null,
            isRequired: f.isRequired,
            category: f.category,
            displayOrder: i
        }))

        // Use transaction to update project and create fields
        await prisma.$transaction([
            prisma.formTemplate.createMany({
                data: formattedFields,
            }),
            prisma.project.update({
                where: { id: projectId },
                data: { defectColumns: DEFAULT_DEFECTS }
            })
        ])

        return NextResponse.json({ success: true, count: formattedFields.length })
    } catch (error) {
        console.error("[FORM_TEMPLATES_BULK_DEFAULT_POST]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
