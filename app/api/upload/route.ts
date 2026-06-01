import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { v4 as uuidv4 } from "uuid"
import { supabaseAdmin, PHOTO_BUCKET } from "@/lib/supabase"
import prisma from "@/lib/prisma"

export async function POST(req: Request) {
    const session = await getServerSession(authOptions)

    // Allow requests that carry a valid onboarding token (unauthenticated employees)
    const onboardingToken = req.headers.get("x-onboarding-token")
    let isAuthorized = !!session

    if (!isAuthorized && onboardingToken) {
        const employee = await prisma.employee.findUnique({ where: { onboardingToken } })
        if (employee) isAuthorized = true
    }

    if (!isAuthorized) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    try {
        const formData = await req.formData()
        const file = formData.get("file") as File | null

        if (!file) {
            return NextResponse.json({ error: "No file uploaded" }, { status: 400 })
        }

        if (file.size > 5 * 1024 * 1024) {
            return NextResponse.json({ error: "File too large (max 5 MB)" }, { status: 400 })
        }

        const bytes      = await file.arrayBuffer()
        const buffer     = Buffer.from(bytes)
        const ext        = file.name.split(".").pop()?.toLowerCase() ?? "bin"
        const filename   = `${uuidv4()}.${ext}`
        const mimeType   = file.type || "application/octet-stream"

        // ── Try Supabase Storage ────────────────────────────────────────────
        const supabaseConfigured =
            process.env.NEXT_PUBLIC_SUPABASE_URL &&
            process.env.NEXT_PUBLIC_SUPABASE_URL !== "https://xxxxx.supabase.co" &&
            process.env.SUPABASE_SERVICE_ROLE_KEY

        if (supabaseConfigured) {
            const { data, error } = await supabaseAdmin.storage
                .from(PHOTO_BUCKET)
                .upload(filename, buffer, {
                    contentType: mimeType,
                    upsert: false,
                })

            if (error) {
                console.error("[UPLOAD] Supabase storage error:", error.message)
                // Fall through to base64 fallback below
            } else {
                const { data: urlData } = supabaseAdmin.storage
                    .from(PHOTO_BUCKET)
                    .getPublicUrl(data.path)

                return NextResponse.json({ url: urlData.publicUrl })
            }
        }

        // ── Fallback: base64 data URI (no Supabase credentials configured) ──
        // This keeps old photos working but should only be used in dev.
        const base64Data = buffer.toString("base64")
        const dataUrl    = `data:${mimeType};base64,${base64Data}`
        return NextResponse.json({ url: dataUrl })

    } catch (error) {
        console.error("[UPLOAD_ERROR]", error)
        return NextResponse.json({ error: "Internal Error" }, { status: 500 })
    }
}
