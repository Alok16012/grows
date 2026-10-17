import { NextResponse } from "next/server"
import { otpAvailable, MPIN_LENGTH } from "@/lib/login-security"

export const dynamic = "force-dynamic"

// GET /api/login/options — public. Tells the login page which sign-in methods
// to offer. Says nothing about any particular account.
export async function GET() {
    return NextResponse.json({ otp: otpAvailable(), mpinLength: MPIN_LENGTH })
}
