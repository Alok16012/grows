import { NextResponse } from "next/server"
import { findLoginUser, getCredential } from "@/lib/login-security"
import { hasOwnPassword } from "@/lib/credentials"

export const dynamic = "force-dynamic"

// POST /api/login/methods { identifier } — public. Lets the login screen put
// the right tab first: someone who has set an MPIN or a password sees
// MPIN · Password · OTP; someone who hasn't yet sees OTP first.
//
// Answers only { mpin, password } booleans. An unknown, inactive or
// login-less id gets the same answer as a brand-new employee (both false), so
// this can't be used to tell who has an account. Posted, not a query string,
// so mobile numbers don't land in access logs.
export async function POST(req: Request) {
    const none = NextResponse.json({ mpin: false, password: false })
    let identifier = ""
    try {
        identifier = String(((await req.json()) as { identifier?: unknown }).identifier ?? "").trim()
    } catch {
        return none
    }
    if (identifier.length < 3 || identifier.length > 100) return none
    try {
        const { user } = await findLoginUser(identifier)
        if (!user || user.isActive === false) return none
        const cred = await getCredential(user.id)
        return NextResponse.json({ mpin: !!cred.mpinHash, password: hasOwnPassword(user.password) })
    } catch (e) {
        console.error("[LOGIN_METHODS]", e)
        return none
    }
}
