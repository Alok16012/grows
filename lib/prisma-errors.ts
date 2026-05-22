import { Prisma } from "@prisma/client"
import { NextResponse } from "next/server"

/**
 * Convert Prisma errors into friendly HTTP responses.
 * Use in API route catch blocks instead of returning bare "Internal Error".
 *
 * Example:
 *   try { ... }
 *   catch (e) { return prismaErrorResponse(e, "Failed to create employee") }
 */
export function prismaErrorResponse(error: unknown, fallback = "Something went wrong") {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
        // P2002 — Unique constraint violation
        if (error.code === "P2002") {
            const fields = (error.meta?.target as string[] | undefined)?.join(", ") ?? "this field"
            return NextResponse.json(
                { error: `A record with the same ${fields} already exists.` },
                { status: 409 }
            )
        }
        // P2025 — Record not found
        if (error.code === "P2025") {
            return NextResponse.json(
                { error: "The record you are looking for does not exist or was deleted." },
                { status: 404 }
            )
        }
        // P2003 — Foreign key constraint failed
        if (error.code === "P2003") {
            return NextResponse.json(
                { error: "Cannot complete this operation because related records depend on it." },
                { status: 409 }
            )
        }
        // P2014 — Required relation violation
        if (error.code === "P2014") {
            return NextResponse.json(
                { error: "This change would break a required relationship between records." },
                { status: 409 }
            )
        }
    }

    if (error instanceof Prisma.PrismaClientValidationError) {
        return NextResponse.json(
            { error: "Invalid data submitted. Please check the form fields." },
            { status: 400 }
        )
    }

    // Log unknown errors server-side but never leak details to client
    console.error("[API] Unexpected error:", error)
    return NextResponse.json({ error: fallback }, { status: 500 })
}

/**
 * Map a Prisma error to a friendly message string (for use in non-Response contexts).
 */
export function prismaErrorMessage(error: unknown, fallback = "Something went wrong"): string {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === "P2002") {
            const fields = (error.meta?.target as string[] | undefined)?.join(", ") ?? "this field"
            return `A record with the same ${fields} already exists.`
        }
        if (error.code === "P2025") return "Record not found."
        if (error.code === "P2003") return "Related records depend on this — cannot proceed."
        if (error.code === "P2014") return "Required relationship would be broken."
    }
    if (error instanceof Prisma.PrismaClientValidationError) return "Invalid data submitted."
    return fallback
}
