import { NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import prisma from "@/lib/prisma"
import { photoSignatureValid } from "@/lib/photo-url"
import { getApiSession } from "@/lib/apiSession"

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
    req: Request,
    { params }: { params: { id: string } }
) {
    try {
        // A signed link (lib/photo-url, from any employee record the server
        // returned) or a signed-in caller. It used to answer anyone with an id,
        // signed out (QA audit F4).
        const q = new URL(req.url).searchParams
        const signed = photoSignatureValid(params.id, q.get("e"), q.get("s"))
        if (!signed && !(await getApiSession(req))?.user?.id) {
            return new NextResponse(null, { status: 401 })
        }
        // A shared cache may keep a signed link's image (the link itself is the
        // permission); one served on a session must stay in that browser, or the
        // CDN would hand it to the next caller of the same unsigned URL.
        const cacheControl = signed ? "public, max-age=86400, stale-while-revalidate=604800" : "private, max-age=86400"

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
                    "Cache-Control": cacheControl,
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
