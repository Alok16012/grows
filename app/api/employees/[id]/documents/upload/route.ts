import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { createClient, SupabaseClient } from "@supabase/supabase-js"
import { v4 as uuidv4 } from "uuid"

// Lazy Supabase client — constructing at module load fails Vercel's
// "collect page data" build step when env vars aren't yet injected.
let _supabase: SupabaseClient | null = null
function getSupabase(): SupabaseClient {
    if (_supabase) return _supabase
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) {
        throw new Error("Supabase credentials missing — set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in env")
    }
    _supabase = createClient(url, key)
    return _supabase
}

export async function POST(
    req: Request,
    { params }: { params: { id: string } }
) {
    const session = await getServerSession(authOptions)
    if (!session) return new NextResponse("Unauthorized", { status: 401 })
    // Any authenticated staff user can upload employee docs.
    // Block only CLIENT role (they shouldn't be touching employee data).
    if (session.user.role === "CLIENT") {
        return new NextResponse("Forbidden", { status: 403 })
    }

    try {
        const formData = await req.formData()
        const file = formData.get("file") as File

        if (!file) {
            return new NextResponse("No file provided", { status: 400 })
        }

        const ext = file.name.split(".").pop() || "bin"
        const path = `employee-docs/${params.id}/${uuidv4()}.${ext}`

        const bytes = await file.arrayBuffer()
        const buffer = Buffer.from(bytes)

        const { error } = await getSupabase().storage
            .from("documents")
            .upload(path, buffer, {
                contentType: file.type || "application/octet-stream",
                upsert: false,
            })

        if (error) {
            console.error("[DOC_UPLOAD_STORAGE]", error)
            return new NextResponse(error.message, { status: 500 })
        }

        const { data: publicData } = getSupabase().storage
            .from("documents")
            .getPublicUrl(path)

        return NextResponse.json({ url: publicData.publicUrl, fileName: file.name })
    } catch (error) {
        console.error("[DOC_UPLOAD]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
