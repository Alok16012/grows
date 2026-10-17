import { NextResponse } from "next/server"
import { findLoginUser, issueOtp, maskMobile, otpAvailable, OTP_RESEND_SECONDS } from "@/lib/login-security"

export const dynamic = "force-dynamic"

// POST /api/login/otp { identifier } — public. Texts a 6-digit login OTP to the
// mobile number on file for that account.
//
// The answer is the same whether or not the account exists (and never names
// the number), so this can't be used to find out who works here. Only rate
// limits — which are per account and so only ever hit real accounts — are
// reported back, because the person waiting needs to know when to retry.
export async function POST(req: Request) {
    if (!otpAvailable()) {
        return NextResponse.json({ error: "OTP login is not available yet. Use your MPIN or password." }, { status: 503 })
    }

    let identifier = ""
    try {
        identifier = String(((await req.json()) as { identifier?: unknown }).identifier ?? "").trim()
    } catch { /* fall through to validation */ }
    if (!identifier || identifier.length > 100) {
        return NextResponse.json({ error: "Enter your mobile number or employee ID" }, { status: 400 })
    }

    const generic = NextResponse.json({ sent: true, resendIn: OTP_RESEND_SECONDS })
    try {
        const { user, mobile } = await findLoginUser(identifier)
        if (!user || !user.isActive || !mobile) {
            console.warn(`[AUTH] OTP requested for an id with no active account/mobile (len ${identifier.length})`)
            return generic
        }

        const result = await issueOtp(user.id, mobile, "LOGIN")
        if (result.ok) {
            return NextResponse.json({ sent: true, resendIn: OTP_RESEND_SECONDS, to: maskMobile(mobile) })
        }
        if (result.reason === "cooldown") {
            return NextResponse.json({ error: `Please wait ${result.retryInSeconds}s before asking for another OTP`, resendIn: result.retryInSeconds }, { status: 429 })
        }
        if (result.reason === "rate-limited") {
            return NextResponse.json({ error: "Too many OTP requests. Try again in an hour or use your MPIN." }, { status: 429 })
        }
        if (result.reason === "send-failed") {
            return NextResponse.json({ error: "Couldn't send the SMS right now. Please try again shortly." }, { status: 502 })
        }
        // not-installed / not-configured
        return NextResponse.json({ error: "OTP login is not available yet. Use your MPIN or password." }, { status: 503 })
    } catch (err) {
        console.error("[LOGIN_OTP]", err)
        return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 })
    }
}
