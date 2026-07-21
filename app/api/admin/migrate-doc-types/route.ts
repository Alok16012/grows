import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { Role } from "@prisma/client"

export const dynamic = "force-dynamic"
export const maxDuration = 60

// One-time migration: normalise legacy EmployeeDocument.type values that were
// saved with human-readable labels (from the old external onboarding form) into
// the enum keys the rest of the system uses (Document Master, employee doc
// views). Without this, onboarding-uploaded docs showed as "missing".
//
// ADMIN only. Idempotent. Open in the browser while logged in as ADMIN.
const LABEL_TO_ENUM: Record<string, string> = {
    "aadhaar card": "AADHAAR",
    "aadhar card": "AADHAAR",
    "aadhaar": "AADHAAR",
    "aadhar": "AADHAAR",
    "pan card": "PAN",
    "pan": "PAN",
    "photo": "PHOTO",
    "passport photo": "PHOTO",
    "passport size photo": "PHOTO",
    "passport_photo": "PHOTO",
    "resume": "RESUME",
    "resume / cv": "RESUME",
    "cv": "RESUME",
    "educational certificates": "CERTIFICATE",
    "educational certificate": "CERTIFICATE",
    "certificate": "CERTIFICATE",
    "certificates": "CERTIFICATE",
    "bank proof": "BANK_DETAILS",
    "bank details": "BANK_DETAILS",
    "bank passbook": "BANK_DETAILS",
    "bank proof / passbook": "BANK_DETAILS",
    "bank_proof": "BANK_DETAILS",
    "bank_passbook": "BANK_DETAILS",
    "bank passbook / cancelled cheque": "BANK_DETAILS",
    "offer letter": "OFFER_LETTER",
}

const VALID_ENUMS = new Set([
    "RESUME", "AADHAAR", "PAN", "PHOTO", "BANK_DETAILS", "CERTIFICATE", "OFFER_LETTER", "OTHER",
])

export async function GET() {
    const session = await getServerSession(authOptions)
    if (!session || session.user.role !== Role.ADMIN) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    try {
        // Only rows whose type isn't already a valid enum key need fixing.
        const docs = await prisma.employeeDocument.findMany({
            select: { id: true, type: true },
        })

        const changes: Record<string, number> = {}
        const unmappedTypes: Record<string, number> = {}
        const ops: Promise<unknown>[] = []

        for (const d of docs) {
            if (VALID_ENUMS.has(d.type)) continue
            const mapped = LABEL_TO_ENUM[(d.type || "").trim().toLowerCase()]
            if (!mapped) {
                // Unknown label — leave it alone (never destroy data) and just
                // report it so we can extend the mapping if needed.
                unmappedTypes[d.type] = (unmappedTypes[d.type] || 0) + 1
                continue
            }
            ops.push(prisma.employeeDocument.update({ where: { id: d.id }, data: { type: mapped } }))
            const key = `${d.type} → ${mapped}`
            changes[key] = (changes[key] || 0) + 1
        }

        await Promise.all(ops)

        return NextResponse.json({
            scanned: docs.length,
            converted: ops.length,
            changes,
            unmappedTypes,
        })
    } catch (error) {
        console.error("[MIGRATE_DOC_TYPES_ERROR]", error)
        return NextResponse.json({ error: "Internal Error" }, { status: 500 })
    }
}
