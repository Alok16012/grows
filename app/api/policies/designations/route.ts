import { NextResponse } from "next/server"
import { policyErrorResponse } from "@/lib/policy-signoff"
import { adminCtx, designationOptions } from "@/lib/policy-admin"

// GET — designations in use (from employee records and existing mappings),
// with how many staff hold each. The onboarding form's Designation dropdown
// uses the same list (see designationOptions), so the two always agree.
export async function GET(req: Request) {
    try {
        await adminCtx(req)
        return NextResponse.json({ designations: await designationOptions() })
    } catch (e) {
        return policyErrorResponse(e, "[POLICY_DESIGNATIONS_GET]")
    }
}
