import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"

const DEFAULT_FIELDS = [
    // Section 1: Basic Entry Fields
    { fieldLabel: "INSP. DATE", fieldType: "date", isRequired: true },
    { fieldLabel: "SHIFT", fieldType: "dropdown", options: "G, A", isRequired: true },
    { fieldLabel: "LOCATION", fieldType: "dropdown", options: "JIJAU, DUROSEAT", isRequired: true },
    { fieldLabel: "PART NAME", fieldType: "dropdown", options: "DRIVER SEAT, CARGO SEAT, NIGERIA SEAT, PF SEAT", isRequired: true },
    { fieldLabel: "PART NUMBER", fieldType: "text", isRequired: false },
    { fieldLabel: "INSPECTED QTY", fieldType: "number", isRequired: true },
    { fieldLabel: "ACCEPTED QTY", fieldType: "number", isRequired: true },
    { fieldLabel: "REWORK QTY", fieldType: "number", isRequired: true },
    { fieldLabel: "REWORK %", fieldType: "number", isRequired: false },
    { fieldLabel: "REJECTED QTY", fieldType: "number", isRequired: true },
    { fieldLabel: "REJECTED %", fieldType: "number", isRequired: false },

    // Section 2: Defect Type Columns (Stitching/Fabric Defects)
    { fieldLabel: "WRINKLES", fieldType: "number", isRequired: false },
    { fieldLabel: "STICHING ISSUE", fieldType: "number", isRequired: false },
    { fieldLabel: "STICHES OPEN", fieldType: "number", isRequired: false },
    { fieldLabel: "STITCHING OPEN & WRINKLE", fieldType: "number", isRequired: false },
    { fieldLabel: "STITCHING LINE ISSUE", fieldType: "number", isRequired: false },
    { fieldLabel: "ZIGZAG STICHING", fieldType: "number", isRequired: false },
    { fieldLabel: "ZIGZAG PVC LINING", fieldType: "number", isRequired: false },
    { fieldLabel: "BEADING OPEN", fieldType: "number", isRequired: false },
    { fieldLabel: "BEADING NOT IN LINE", fieldType: "number", isRequired: false },
    { fieldLabel: "PINING ISSUE", fieldType: "number", isRequired: false },
    { fieldLabel: "PINING OPEN", fieldType: "number", isRequired: false },
    { fieldLabel: "EMBOSSING SHIFT", fieldType: "number", isRequired: false },
    { fieldLabel: "EMBASSY SHIFTING", fieldType: "number", isRequired: false },
    { fieldLabel: "UNWANTED STICH", fieldType: "number", isRequired: false },
    { fieldLabel: "BIDING MARK", fieldType: "number", isRequired: false },

    // Structural/Foam Defects
    { fieldLabel: "CRACKED ISSUE", fieldType: "number", isRequired: false },
    { fieldLabel: "TORN STICH", fieldType: "number", isRequired: false },
    { fieldLabel: "FOAM SLACK", fieldType: "number", isRequired: false },
    { fieldLabel: "FOAM VOIDE", fieldType: "number", isRequired: false },
    { fieldLabel: "FOAM DAMAGE", fieldType: "number", isRequired: false },
    { fieldLabel: "COVER ISSUE", fieldType: "number", isRequired: false },
    { fieldLabel: "CHOPPED", fieldType: "number", isRequired: false },
    { fieldLabel: "WELPRO OPEN", fieldType: "number", isRequired: false },
    { fieldLabel: "SCREEN PRINTING TILT", fieldType: "number", isRequired: false },
    { fieldLabel: "STUD MISSING", fieldType: "number", isRequired: false },

    // Plastic/Metal Parts
    { fieldLabel: "SCREW PROBLEM", fieldType: "number", isRequired: false },
    { fieldLabel: "WIRE PROBLEM", fieldType: "number", isRequired: false },
    { fieldLabel: "PLASTIC PART BEND", fieldType: "number", isRequired: false },
    { fieldLabel: "PLASTIC PART GAP", fieldType: "number", isRequired: false },
    { fieldLabel: "FITMENT NOT OK", fieldType: "number", isRequired: false },
    { fieldLabel: "SCRATCH MARK", fieldType: "number", isRequired: false },
    { fieldLabel: "SEAT BEST CRACK", fieldType: "number", isRequired: false },
    { fieldLabel: "SEAT COVER STITCHES OPEN", fieldType: "number", isRequired: false },
    { fieldLabel: "SEAT COVER BURNED", fieldType: "number", isRequired: false },
    { fieldLabel: "BASE ISSUE", fieldType: "number", isRequired: false },
    { fieldLabel: "METAL PART RUSTY", fieldType: "number", isRequired: false },
    { fieldLabel: "TRIM DAMAGE", fieldType: "number", isRequired: false },
    { fieldLabel: "TRIM PATTERN NOT OK", fieldType: "number", isRequired: false },

    // Mechanical/Functional
    { fieldLabel: "RECLINER GAP", fieldType: "number", isRequired: false },
    { fieldLabel: "RECLINER GUIDE PLUG MISSING", fieldType: "number", isRequired: false },
    { fieldLabel: "RECLINER LEVER SPRING MISSING", fieldType: "number", isRequired: false },
    { fieldLabel: "C-RING MISSING", fieldType: "number", isRequired: false },
    { fieldLabel: "VELCRO OPEN", fieldType: "number", isRequired: false },
    { fieldLabel: "SLIDER JAM", fieldType: "number", isRequired: false },
    { fieldLabel: "ROLLING NOT OK", fieldType: "number", isRequired: false },
    { fieldLabel: "AIRBAG NOT OK", fieldType: "number", isRequired: false },
    { fieldLabel: "BELT BUCKLE LOOSE", fieldType: "number", isRequired: false },
    { fieldLabel: "MEMORY SWITCH DAMAGE", fieldType: "number", isRequired: false },
    { fieldLabel: "RUBBER DAMPING MISS", fieldType: "number", isRequired: false },
    { fieldLabel: "CABLE NOT OK", fieldType: "number", isRequired: false },
    { fieldLabel: "AMREST NOISE", fieldType: "number", isRequired: false },
    { fieldLabel: "ARMEST GAP", fieldType: "number", isRequired: false },
    { fieldLabel: "ARMEST LINE MARK", fieldType: "number", isRequired: false },

    // Barcode/Label/Packing
    { fieldLabel: "WRONG BARCODE", fieldType: "number", isRequired: false },
    { fieldLabel: "END CAP MISSING", fieldType: "number", isRequired: false },
    { fieldLabel: "END CAP DAMAGE", fieldType: "number", isRequired: false },
    { fieldLabel: "ZIP DAMAGE", fieldType: "number", isRequired: false },
    { fieldLabel: "PACKING ISSUE", fieldType: "number", isRequired: false },
    { fieldLabel: "FOLD MARK", fieldType: "number", isRequired: false },
    { fieldLabel: "STAIN MARK", fieldType: "number", isRequired: false },

    // Misc/Special
    { fieldLabel: "WAVINESS", fieldType: "number", isRequired: false },
    { fieldLabel: "SHADE VARIATION", fieldType: "number", isRequired: false },
    { fieldLabel: "HARD FOAM", fieldType: "number", isRequired: false },
    { fieldLabel: "BAZZEL GAP", fieldType: "number", isRequired: false },
    { fieldLabel: "HARD PART LINE", fieldType: "number", isRequired: false },
    { fieldLabel: "TREAD LOOSE", fieldType: "number", isRequired: false },
    { fieldLabel: "BLOW HOLE", fieldType: "number", isRequired: false },
    { fieldLabel: "NUT ISSUE", fieldType: "number", isRequired: false },
    { fieldLabel: "NIDDLE HOLE", fieldType: "number", isRequired: false },
    { fieldLabel: "LINE MARK", fieldType: "number", isRequired: false },
    { fieldLabel: "ISOFIX SHOULD NOT TILT", fieldType: "number", isRequired: false },
    { fieldLabel: "ISOFIX AREA CUTOUT", fieldType: "number", isRequired: false },
    { fieldLabel: "ISOFIX PRINT NOT OK", fieldType: "number", isRequired: false },
    { fieldLabel: "TRACK POSITION CROSS", fieldType: "number", isRequired: false },
    { fieldLabel: "GUIDE PLUG MISSING", fieldType: "number", isRequired: false },
    { fieldLabel: "DUMPER MACHINE SPACER GARMENT MISSING", fieldType: "number", isRequired: false },
    { fieldLabel: "FOOT LAMP MISS", fieldType: "number", isRequired: false },
    { fieldLabel: "FOOT LAMP SCREW LOOSE", fieldType: "number", isRequired: false },
    { fieldLabel: "PUNCH MARK", fieldType: "number", isRequired: false },
    { fieldLabel: "SBR ODS", fieldType: "number", isRequired: false },
    { fieldLabel: "OTHER", fieldType: "number", isRequired: false },

    // Section 3: Summary Fields
    { fieldLabel: "INSPECTOR NAME", fieldType: "text", isRequired: true },
    { fieldLabel: "TOTAL", fieldType: "number", isRequired: false },
    { fieldLabel: "DIFFERENCE", fieldType: "number", isRequired: false },
]

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions)
        if (!session) return new NextResponse("Unauthorized", { status: 401 })

        if (session.user.role !== "ADMIN" && session.user.role !== "MANAGER") {
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

        // Insert default fields
        const formattedFields = DEFAULT_FIELDS.map((f, i) => {
            let defValue: string | null = null;
            // set default 0 to fields that are defects/numbers but not totally,difference
            if (f.fieldType === "number" && f.fieldLabel !== "TOTAL" && f.fieldLabel !== "DIFFERENCE" && !f.fieldLabel.includes("QTY") && !f.fieldLabel.includes("%")) {
                defValue = "0";
            }
            if (f.fieldLabel.includes("QTY") || f.fieldLabel.includes("%")) {
                defValue = "0";
            }

            return {
                projectId,
                fieldLabel: f.fieldLabel,
                fieldType: f.fieldType,
                options: f.options || null,
                defaultValue: defValue,
                isRequired: f.isRequired,
                displayOrder: i
            };
        })

        await prisma.formTemplate.createMany({
            data: formattedFields,
        })

        return NextResponse.json({ success: true, count: formattedFields.length })
    } catch (error) {
        console.error("[FORM_TEMPLATES_BULK_DEFAULT_POST]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
