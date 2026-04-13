import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { createClient } from "@supabase/supabase-js"
import { v4 as uuidv4 } from "uuid"

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(
    req: Request,
    { params }: { params: { id: string } }
) {
    const session = await getServerSession(authOptions)
    if (!session) return new NextResponse("Unauthorized", { status: 401 })
    if (session.user.role !== "ADMIN" && session.user.role !== "MANAGER") {
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

        const { error } = await supabase.storage
            .from("documents")
            .upload(path, buffer, {
                contentType: file.type || "application/octet-stream",
                upsert: false,
            })

        if (error) {
            console.error("[DOC_UPLOAD_STORAGE]", error)
            return new NextResponse(error.message, { status: 500 })
        }

        const { data: publicData } = supabase.storage
            .from("documents")
            .getPublicUrl(path)

        return NextResponse.json({ url: publicData.publicUrl, fileName: file.name })
    } catch (error) {
        console.error("[DOC_UPLOAD]", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
