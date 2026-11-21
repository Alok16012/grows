import { NextResponse } from "next/server"
import { guard } from "@/lib/access"
import { getInspectionSettings } from "@/lib/inspection-settings"

export const dynamic = "force-dynamic"

// The inspection form's own rules (Approvals → Settings → Inspection form),
// readable by anyone signed in: inspectors need them to fill the form.
export async function GET(req: Request) {
    const g = await guard(req, [])
    if (g instanceof NextResponse) return g
    const s = await getInspectionSettings()
    return NextResponse.json({ form: s.form })
}
