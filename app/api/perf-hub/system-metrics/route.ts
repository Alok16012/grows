import { NextResponse } from "next/server"
import { SYSTEM_METRICS } from "@/lib/perf-hub"
import { perfCtx, perfErrorResponse } from "@/lib/perf-hub-db"

// GET — metrics a KPI can read straight from Growus data.
export async function GET(req: Request) {
    try {
        await perfCtx(req)
        return NextResponse.json({ metrics: SYSTEM_METRICS })
    } catch (e) {
        return perfErrorResponse(e, "[PERF_SYSTEM_METRICS]")
    }
}
