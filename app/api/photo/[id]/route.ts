import { NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import prisma from "@/lib/prisma"

/**
 * GET /api/photo/:id
 *
 * Serves an employee profile photo.
 *   - If the photo is a Supabase / external HTTP URL  → 302 redirect
 *   - If the photo is a base64 data URI               → decode & stream as image
 *   - If no photo exists                              → 404 (triggers onError in Avatar)
 *
 * Uses $queryRaw so the Prisma result-extension that transforms `photo` to
 * this very endpoint URL is bypassed — we always get the raw DB value here.
 */
export async function GET(
    _req: Request,
    { params }: { params: { id: string } }
) {
    try {
        const rows = await (prisma as any).$queryRaw(
            Prisma.sql`SELECT photo FROM "Employee" WHERE id = ${params.id} LIMIT 1`
        ) as Array<{ photo: string | null }>

        const photo = rows[0]?.photo

        if (!photo) {
            return new NextResponse(null, { status: 404 })
        }

        // ── HTTP / Supabase URL ──────────────────────────────────────────────
        if (photo.startsWith("http")) {
            return NextResponse.redirect(photo, { status: 302 })
        }

        // ── Base64 data URI ──────────────────────────────────────────────────
        if (photo.startsWith("data:")) {
            const commaIdx = photo.indexOf(",")
            if (commaIdx === -1) return new NextResponse(null, { status: 404 })

            const meta     = photo.slice(0, commaIdx)          // e.g. "data:image/jpeg;base64"
            const b64      = photo.slice(commaIdx + 1)
            const mimeType = meta.split(":")[1]?.split(";")[0] ?? "image/jpeg"
            const buffer   = Buffer.from(b64, "base64")

            return new NextResponse(buffer, {
                headers: {
                    "Content-Type":  mimeType,
                    "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
                    "Content-Length": String(buffer.byteLength),
                },
            })
        }

        return new NextResponse(null, { status: 404 })
    } catch (error) {
        console.error("[PHOTO_GET]", error)
        return new NextResponse(null, { status: 500 })
    }
}
