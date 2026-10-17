import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"
import {
    getCredential, issueOtp, verifyOtp, setMpin, mpinProblem, checkMpin, otpAvailable,
    maskMobile, phoneDigits, isMissingTable, MPIN_LENGTH, OTP_RESEND_SECONDS,
} from "@/lib/login-security"

export const dynamic = "force-dynamic"

async function ownMobile(userId: string): Promise<string> {
    const [emp, user] = await Promise.all([
        prisma.employee.findFirst({ where: { userId }, select: { phone: true } }),
        prisma.user.findUnique({ where: { id: userId }, select: { phone: true } }),
    ])
    const m = phoneDigits(emp?.phone) || phoneDigits(user?.phone)
    return m.length === 10 ? m : ""
}

// Which proof the signed-in user must give to set or change their MPIN:
//  - signed in with an OTP just now and has no MPIN yet → nothing more
//  - SMS available → a fresh OTP to their own mobile
//  - SMS not available → their current MPIN (or nothing on first setup, since
//    they have just proven themselves with their password)
function proofNeeded(opts: { hasMpin: boolean; loginMethod: string; otp: boolean; mobile: string }): "none" | "otp" | "current-mpin" {
    if (!opts.hasMpin && opts.loginMethod === "otp") return "none"
    if (opts.otp && opts.mobile) return "otp"
    return opts.hasMpin ? "current-mpin" : "none"
}

// GET /api/me/mpin — what the MPIN screen needs to know.
export async function GET() {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json({ error: "Not logged in" }, { status: 401 })
    const userId = session.user.id as string
    try {
        const [cred, mobile] = await Promise.all([getCredential(userId), ownMobile(userId)])
        const loginMethod = (session.user as { loginMethod?: string }).loginMethod || "password"
        return NextResponse.json({
            installed: cred.installed,
            hasMpin: !!cred.mpinHash,
            mpinLength: MPIN_LENGTH,
            mobile: maskMobile(mobile),
            proof: proofNeeded({ hasMpin: !!cred.mpinHash, loginMethod, otp: otpAvailable(), mobile }),
        })
    } catch (err) {
        console.error("[ME_MPIN_GET]", err)
        return NextResponse.json({ error: "Internal Error" }, { status: 500 })
    }
}

// POST /api/me/mpin
//   { action: "send-otp" }                       → texts an OTP to the user's own mobile
//   { mpin, otp?, currentMpin? }                 → sets / changes the MPIN
export async function POST(req: Request) {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json({ error: "Not logged in" }, { status: 401 })
    const userId = session.user.id as string

    try {
        const body = await req.json().catch(() => ({})) as { action?: string; mpin?: string; otp?: string; currentMpin?: string }
        const [cred, mobile] = await Promise.all([getCredential(userId), ownMobile(userId)])
        if (!cred.installed) {
            return NextResponse.json({ error: "MPIN login isn't switched on yet. Please contact your admin." }, { status: 503 })
        }

        if (body.action === "send-otp") {
            if (!mobile) return NextResponse.json({ error: "No mobile number on your profile. Contact HR." }, { status: 400 })
            const r = await issueOtp(userId, mobile, "SET_MPIN")
            if (r.ok) return NextResponse.json({ sent: true, to: maskMobile(mobile), resendIn: OTP_RESEND_SECONDS })
            if (r.reason === "cooldown") return NextResponse.json({ error: `Please wait ${r.retryInSeconds}s before asking for another OTP`, resendIn: r.retryInSeconds }, { status: 429 })
            if (r.reason === "rate-limited") return NextResponse.json({ error: "Too many OTP requests. Try again in an hour." }, { status: 429 })
            return NextResponse.json({ error: "Couldn't send the OTP right now. Please try again shortly." }, { status: 502 })
        }

        const mpin = String(body.mpin ?? "").trim()
        const problem = mpinProblem(mpin, mobile)
        if (problem) return NextResponse.json({ error: problem }, { status: 400 })

        const loginMethod = (session.user as { loginMethod?: string }).loginMethod || "password"
        const proof = proofNeeded({ hasMpin: !!cred.mpinHash, loginMethod, otp: otpAvailable(), mobile })
        if (proof === "otp" && !(await verifyOtp(userId, String(body.otp ?? "").trim(), "SET_MPIN"))) {
            return NextResponse.json({ error: "That OTP is wrong or has expired" }, { status: 400 })
        }
        if (proof === "current-mpin" && !(await checkMpin(cred, String(body.currentMpin ?? "").trim()))) {
            return NextResponse.json({ error: "Your current MPIN is wrong" }, { status: 400 })
        }

        await setMpin(userId, mpin)
        return NextResponse.json({ success: true })
    } catch (err) {
        if (isMissingTable(err)) {
            return NextResponse.json({ error: "MPIN login isn't switched on yet. Please contact your admin." }, { status: 503 })
        }
        console.error("[ME_MPIN_POST]", err)
        return NextResponse.json({ error: "Internal Error" }, { status: 500 })
    }
}
