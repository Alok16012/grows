// Join links: /join?l=<code> — a recruiter's link, optionally fixed to a site,
// designation and employment type, with on/off, expiry and a use limit.
// Which joiners came through a link is kept on their recruitment lead (Lead.formSlug).
import prisma from "@/lib/prisma"
import crypto from "crypto"

const ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz" // no 0/o/1/l/i

export async function newLinkCode(): Promise<string> {
    for (let i = 0; i < 10; i++) {
        const bytes = crypto.randomBytes(7)
        const code = Array.from(bytes, b => ALPHABET[b % ALPHABET.length]).join("")
        if (!(await prisma.joinLink.findUnique({ where: { code }, select: { id: true } }))) return code
    }
    throw new Error("Could not make a link code")
}

export type LinkState = { ok: true } | { ok: false; reason: string }

export function linkState(l: { isActive: boolean; expiresAt: Date | null; maxUses: number | null; submits: number }, now = new Date()): LinkState {
    if (!l.isActive) return { ok: false, reason: "This joining link has been switched off. Please ask HR for a new link." }
    if (l.expiresAt && l.expiresAt < now) return { ok: false, reason: "This joining link has expired. Please ask HR for a new link." }
    if (l.maxUses != null && l.submits >= l.maxUses) return { ok: false, reason: "This joining link has already been used the maximum number of times. Please ask HR for a new link." }
    return { ok: true }
}

export async function findLink(code: string | null | undefined) {
    const c = String(code ?? "").trim().toLowerCase()
    if (!/^[a-z0-9]{4,20}$/.test(c)) return null
    return prisma.joinLink.findUnique({ where: { code: c } })
}

/** Count an event on a link (best effort — never fails the form). */
export async function bumpLink(id: string, field: "opens" | "starts" | "submits" | "blocked") {
    try { await prisma.joinLink.update({ where: { id }, data: { [field]: { increment: 1 } } }) } catch (e) { console.error("[JOIN_LINK_BUMP]", e) }
}

export const LINK_SOURCE = "External Onboarding"
