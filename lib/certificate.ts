import crypto from "crypto"

// Certificate verification links. Certificate numbers are sequential
// (CERT-YYYYMM-NNNN), so the public check page also needs a key derived from
// the number with a server secret — guessing numbers reveals nothing.

const secret = () => process.env.NEXTAUTH_SECRET || process.env.CRON_SECRET || "growus-certificates"

export function certificateKey(certificate: string): string {
    return crypto.createHmac("sha256", secret()).update(`cert:${certificate}`).digest("base64url").slice(0, 12)
}

export function certificateKeyOk(certificate: string, key: string | null | undefined): boolean {
    if (!key) return false
    const a = Buffer.from(certificateKey(certificate)), b = Buffer.from(key)
    return a.length === b.length && crypto.timingSafeEqual(a, b)
}

export function verifyPath(certificate: string): string {
    return `/verify/${encodeURIComponent(certificate)}?k=${certificateKey(certificate)}`
}
