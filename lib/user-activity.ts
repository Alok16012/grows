// Last seen per login (web and app) and "sign out everywhere".
// Written at most once every few minutes per login per server instance, never
// on the request's critical path, and never fails a request.
import prisma from "@/lib/prisma"

const THROTTLE_MS = 5 * 60_000
const lastWrite = new Map<string, number>()
let missing = false

/** Note that this login was just used. Fire and forget. */
export function touchSeen(userId: string | null | undefined, via: "web" | "app") {
    if (!userId || missing || String(userId).startsWith("demo-")) return
    const now = Date.now()
    if (now - (lastWrite.get(userId) ?? 0) < THROTTLE_MS) return
    lastWrite.set(userId, now)
    if (lastWrite.size > 20_000) lastWrite.clear()
    prisma.userActivity.upsert({
        where: { userId },
        create: { userId, lastSeenAt: new Date(now), lastSeenVia: via },
        update: { lastSeenAt: new Date(now), lastSeenVia: via },
    }).catch((e: any) => {
        if (String(e?.message ?? "").includes("does not exist")) missing = true
    })
}

/** Sessions started before this moment are refused from their next request on. */
export async function signOutEverywhere(userId: string) {
    const at = new Date()
    await prisma.userActivity.upsert({ where: { userId }, create: { userId, signedOutAt: at }, update: { signedOutAt: at } })
    return at
}

/** True when the login was signed out everywhere after the session was issued (seconds since epoch). */
export async function signedOutSince(userId: string, issuedAtSec: number | null | undefined): Promise<boolean> {
    if (!issuedAtSec || missing) return false
    try {
        const r = await prisma.userActivity.findUnique({ where: { userId }, select: { signedOutAt: true } })
        return !!r?.signedOutAt && r.signedOutAt.getTime() > issuedAtSec * 1000
    } catch { return false }
}
