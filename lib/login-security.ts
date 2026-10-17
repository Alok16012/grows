// Login hardening: failed-attempt lockout, SMS OTP, and the employee MPIN.
//
// All state lives in the UserCredential / LoginOtp tables
// (scripts/login-otp-mpin.sql). Production schema is applied by hand, so every
// helper here treats a missing table as "not installed yet" and degrades to the
// old behaviour — plain password login, no lockout — instead of failing logins.

import crypto from "crypto"
import bcrypt from "bcryptjs"
import prisma from "@/lib/prisma"
import { sendOtpSms, smsConfigured } from "@/lib/sms"

export const MAX_FAILED_ATTEMPTS = 5
export const LOCK_MINUTES = 15
export const OTP_TTL_MINUTES = 10
export const OTP_MAX_ATTEMPTS = 3
export const OTP_RESEND_SECONDS = 60
export const OTP_MAX_PER_HOUR = 5
export const MPIN_LENGTH = 4

export type OtpPurpose = "LOGIN" | "SET_MPIN"

/** Prisma "table/column does not exist" — the SQL hasn't been applied yet. */
export function isMissingTable(err: unknown): boolean {
    const e = err as { code?: string; message?: string }
    const missing = e?.code === "P2021" || e?.code === "P2022" || /does not exist/i.test(e?.message ?? "")
    // Remember for a few minutes so every login doesn't re-query (and re-log)
    // a table that isn't there yet.
    if (missing) tablesMissingUntil = Date.now() + 5 * 60_000
    return missing
}

let tablesMissingUntil = 0
const tablesKnownMissing = () => Date.now() < tablesMissingUntil

export const phoneDigits = (s: string | null | undefined): string => {
    if (!s) return ""
    const d = s.replace(/\D/g, "")
    return d.length >= 10 ? d.slice(-10) : d
}

const USER_INCLUDE = { customRole: { select: { name: true, color: true, permissions: true, isActive: true } } } as const

/**
 * Finds the account for whatever the person typed in the login box: the login
 * id / email, a 10-digit mobile number, or an employee code.
 */
export async function findLoginUser(input: string) {
    const inputRaw = input.trim()
    const inputClean = inputRaw.replace(/@cims\.local$/i, "").trim()
    const inputDigits = phoneDigits(inputClean)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let user: any = null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let matchedEmployee: any = null

    // 1. Login id / email (an employee's login id is usually their mobile number)
    user = await prisma.user.findUnique({ where: { email: inputClean }, include: USER_INCLUDE })
    if (!user && inputClean !== inputRaw) {
        user = await prisma.user.findUnique({ where: { email: inputRaw }, include: USER_INCLUDE })
    }
    if (user) {
        matchedEmployee = await prisma.employee.findFirst({
            where: { userId: user.id },
            select: { id: true, firstName: true, lastName: true, phone: true, employeeId: true },
        })
    }

    // 2. Mobile number on the employee record
    if (!user && inputDigits.length === 10) {
        matchedEmployee = await prisma.employee.findFirst({
            where: { phone: { endsWith: inputDigits } },
            include: { user: { include: USER_INCLUDE } },
        })
        if (matchedEmployee?.user) user = matchedEmployee.user
    }

    // 3. Employee code
    if (!user) {
        const emp = await prisma.employee.findFirst({
            where: { employeeId: { equals: inputClean, mode: "insensitive" } },
            include: { user: { include: USER_INCLUDE } },
        })
        if (emp) {
            matchedEmployee = emp
            if (emp.user) user = emp.user
        }
    }

    const mobile = phoneDigits(matchedEmployee?.phone) || phoneDigits(user?.phone)
    return { user, matchedEmployee, mobile: mobile.length === 10 ? mobile : "" }
}

// ─── Credential row (MPIN + lockout) ────────────────────────────────────────

export type CredentialState = {
    installed: boolean
    mpinHash: string | null
    failedCount: number
    lockedUntil: Date | null
}

export async function getCredential(userId: string): Promise<CredentialState> {
    if (tablesKnownMissing()) return { installed: false, mpinHash: null, failedCount: 0, lockedUntil: null }
    try {
        const row = await prisma.userCredential.findUnique({ where: { userId } })
        return { installed: true, mpinHash: row?.mpinHash ?? null, failedCount: row?.failedCount ?? 0, lockedUntil: row?.lockedUntil ?? null }
    } catch (err) {
        if (isMissingTable(err)) return { installed: false, mpinHash: null, failedCount: 0, lockedUntil: null }
        throw err
    }
}

/** Minutes left on a lockout, or 0 if the account is not locked. */
export function lockMinutesLeft(c: CredentialState): number {
    if (!c.lockedUntil) return 0
    const ms = c.lockedUntil.getTime() - Date.now()
    return ms > 0 ? Math.ceil(ms / 60000) : 0
}

export async function recordFailedLogin(userId: string): Promise<void> {
    if (tablesKnownMissing()) return
    try {
        const row = await prisma.userCredential.upsert({
            where: { userId },
            create: { userId, failedCount: 1 },
            update: { failedCount: { increment: 1 } },
        })
        if (row.failedCount >= MAX_FAILED_ATTEMPTS) {
            await prisma.userCredential.update({
                where: { userId },
                data: { failedCount: 0, lockedUntil: new Date(Date.now() + LOCK_MINUTES * 60_000) },
            })
            console.warn(`[AUTH] account locked for ${LOCK_MINUTES} min after ${MAX_FAILED_ATTEMPTS} failed attempts user=${userId}`)
        }
    } catch (err) {
        if (!isMissingTable(err)) console.error("[AUTH] could not record failed login", err)
    }
}

export async function clearFailedLogins(userId: string): Promise<void> {
    if (tablesKnownMissing()) return
    try {
        await prisma.userCredential.updateMany({
            where: { userId, OR: [{ failedCount: { gt: 0 } }, { lockedUntil: { not: null } }] },
            data: { failedCount: 0, lockedUntil: null },
        })
    } catch (err) {
        if (!isMissingTable(err)) console.error("[AUTH] could not clear failed logins", err)
    }
}

// ─── MPIN ───────────────────────────────────────────────────────────────────

/** Returns an error message for an unacceptable MPIN, or null if it is fine. */
export function mpinProblem(mpin: string, mobile?: string): string | null {
    if (!new RegExp(`^\\d{${MPIN_LENGTH}}$`).test(mpin)) return `MPIN must be exactly ${MPIN_LENGTH} digits`
    if (/^(\d)\1+$/.test(mpin)) return "MPIN can't be the same digit repeated"
    const asc = "0123456789012", desc = "9876543210987"
    if (asc.includes(mpin) || desc.includes(mpin)) return "MPIN can't be a simple sequence like 1234"
    if (mobile && (mobile.endsWith(mpin) || mobile.startsWith(mpin))) return "MPIN can't be part of your mobile number"
    return null
}

export async function setMpin(userId: string, mpin: string): Promise<void> {
    const mpinHash = await bcrypt.hash(mpin, 10)
    await prisma.userCredential.upsert({
        where: { userId },
        create: { userId, mpinHash, mpinSetAt: new Date() },
        update: { mpinHash, mpinSetAt: new Date(), failedCount: 0, lockedUntil: null },
    })
}

export async function checkMpin(c: CredentialState, mpin: string): Promise<boolean> {
    if (!c.mpinHash || !/^\d+$/.test(mpin)) return false
    try { return await bcrypt.compare(mpin, c.mpinHash) } catch { return false }
}

// ─── OTP ────────────────────────────────────────────────────────────────────

function hashOtp(userId: string, code: string): string {
    const secret = process.env.NEXTAUTH_SECRET || "growus-otp"
    return crypto.createHmac("sha256", secret).update(`${userId}:${code}`).digest("hex")
}

export function otpAvailable(): boolean {
    return smsConfigured()
}

export type SendOtpResult =
    | { ok: true }
    | { ok: false; reason: "not-configured" | "no-mobile" | "cooldown" | "rate-limited" | "send-failed" | "not-installed"; retryInSeconds?: number }

/** Creates a fresh OTP for `userId` and texts it to `mobile`. */
export async function issueOtp(userId: string, mobile: string, purpose: OtpPurpose): Promise<SendOtpResult> {
    if (!otpAvailable()) return { ok: false, reason: "not-configured" }
    if (!/^\d{10}$/.test(mobile)) return { ok: false, reason: "no-mobile" }
    if (tablesKnownMissing()) return { ok: false, reason: "not-installed" }

    try {
        const hourAgo = new Date(Date.now() - 60 * 60_000)
        const recent = await prisma.loginOtp.findMany({
            where: { userId, createdAt: { gte: hourAgo } },
            orderBy: { createdAt: "desc" },
            select: { createdAt: true },
        })
        if (recent[0]) {
            const sinceLast = (Date.now() - recent[0].createdAt.getTime()) / 1000
            if (sinceLast < OTP_RESEND_SECONDS) return { ok: false, reason: "cooldown", retryInSeconds: Math.ceil(OTP_RESEND_SECONDS - sinceLast) }
        }
        if (recent.length >= OTP_MAX_PER_HOUR) return { ok: false, reason: "rate-limited" }

        const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0")
        // Only the newest code is ever valid.
        await prisma.loginOtp.updateMany({ where: { userId, consumedAt: null }, data: { consumedAt: new Date() } })
        await prisma.loginOtp.create({
            data: { userId, purpose, codeHash: hashOtp(userId, code), expiresAt: new Date(Date.now() + OTP_TTL_MINUTES * 60_000) },
        })
        const sent = await sendOtpSms(mobile, code)
        return sent ? { ok: true } : { ok: false, reason: "send-failed" }
    } catch (err) {
        if (isMissingTable(err)) return { ok: false, reason: "not-installed" }
        throw err
    }
}

/** Checks and consumes the newest OTP. Wrong guesses count against it. */
export async function verifyOtp(userId: string, code: string, purpose: OtpPurpose): Promise<boolean> {
    if (!/^\d{6}$/.test(code) || tablesKnownMissing()) return false
    try {
        const otp = await prisma.loginOtp.findFirst({
            where: { userId, purpose, consumedAt: null, expiresAt: { gt: new Date() } },
            orderBy: { createdAt: "desc" },
        })
        if (!otp || otp.attempts >= OTP_MAX_ATTEMPTS) return false

        const expected = Buffer.from(otp.codeHash, "hex")
        const given = Buffer.from(hashOtp(userId, code), "hex")
        const ok = expected.length === given.length && crypto.timingSafeEqual(expected, given)
        await prisma.loginOtp.update({
            where: { id: otp.id },
            data: ok ? { consumedAt: new Date() } : { attempts: { increment: 1 } },
        })
        return ok
    } catch (err) {
        if (isMissingTable(err)) return false
        throw err
    }
}

/** Mask a mobile number for display: 98******10 */
export function maskMobile(mobile: string): string {
    return mobile.length === 10 ? `${mobile.slice(0, 2)}******${mobile.slice(-2)}` : ""
}

/**
 * Admin password reset: forget the MPIN and any lockout so the employee can
 * sign in again with the password just issued, then set a fresh MPIN.
 */
export async function resetLoginSecurity(userIds: string[]): Promise<void> {
    if (userIds.length === 0 || tablesKnownMissing()) return
    try {
        await prisma.userCredential.deleteMany({ where: { userId: { in: userIds } } })
        await prisma.loginOtp.deleteMany({ where: { userId: { in: userIds } } })
    } catch (err) {
        if (!isMissingTable(err)) console.error("[AUTH] could not reset login security", err)
    }
}
