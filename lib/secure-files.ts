// Private storage for sensitive files: employee KYC documents, expense
// receipts, performance evidence, asset attachments.
//
// How it works
//   • Sensitive uploads go to the PRIVATE bucket SECURE_BUCKET. The database
//     stores a reference, `sb://<bucket>/<path>`, never a public link.
//   • Every Prisma read passes through `signRefs` (lib/prisma.ts query
//     extension): any `sb://…` string anywhere in the result — top level or
//     nested includes — becomes a signed https link valid for SIGNED_TTL. So
//     every API route, PDF and the mobile app get working links with no
//     route-by-route changes, and a leaked link stops working after a while.
//   • Every Prisma write passes through `normalizeRefs`: a signed link coming
//     back from a client (a form re-saving what it loaded, or the upload
//     route's response) is turned back into its `sb://` reference before it
//     is stored, so an expiring link is never saved.
//
// Raw SQL ($queryRaw) is not covered; it returns the stored `sb://` value.

import { supabaseAdmin } from "./supabase"

export const SECURE_BUCKET = "secure-files"
export const SIGNED_TTL_SECONDS = 2 * 60 * 60
const REF_PREFIX = "sb://"

const supabaseHost = (() => {
    try { return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").host } catch { return "" }
})()

export function isRef(v: unknown): v is string {
    return typeof v === "string" && v.startsWith(REF_PREFIX)
}

export function refFor(path: string, bucket = SECURE_BUCKET): string {
    return `${REF_PREFIX}${bucket}/${path}`
}

/** "sb://bucket/a/b.pdf" → { bucket, path } */
export function parseRef(ref: string): { bucket: string; path: string } | null {
    if (!isRef(ref)) return null
    const rest = ref.slice(REF_PREFIX.length)
    const i = rest.indexOf("/")
    if (i <= 0 || i === rest.length - 1) return null
    return { bucket: rest.slice(0, i), path: rest.slice(i + 1) }
}

/**
 * A signed link to one of OUR private buckets → its sb:// reference.
 * Anything else (public links, other hosts, plain text) is returned as-is.
 */
export function toRef(v: string): string {
    if (!v.includes("/storage/v1/object/sign/")) return v
    try {
        const u = new URL(v)
        if (supabaseHost && u.host !== supabaseHost) return v
        const m = u.pathname.match(/^\/storage\/v1\/object\/sign\/([^/]+)\/(.+)$/)
        if (!m || m[1] !== SECURE_BUCKET) return v
        return refFor(decodeURIComponent(m[2]), m[1])
    } catch {
        return v
    }
}

// Only walk arrays and plain objects; Dates, Decimals, Buffers etc. are left alone.
function isPlain(o: unknown): o is Record<string, unknown> {
    if (!o || typeof o !== "object") return false
    const p = Object.getPrototypeOf(o)
    return p === Object.prototype || p === null
}

function walk(value: unknown, visit: (s: string) => string): unknown {
    if (typeof value === "string") return visit(value)
    if (Array.isArray(value)) {
        let changed = false
        const out = value.map(v => { const n = walk(v, visit); if (n !== v) changed = true; return n })
        return changed ? out : value
    }
    if (isPlain(value)) {
        let changed = false
        const out: Record<string, unknown> = {}
        for (const [k, v] of Object.entries(value)) {
            const n = walk(v, visit)
            if (n !== v) changed = true
            out[k] = n
        }
        return changed ? out : value
    }
    return value
}

/** Replace signed private-bucket links with sb:// references (for writes). */
export function normalizeRefs<T>(value: T): T {
    return walk(value, s => (s.includes("/storage/v1/object/sign/") ? toRef(s) : s)) as T
}

/** Replace every sb:// reference with a fresh signed link (for reads). */
export async function signRefs<T>(value: T): Promise<T> {
    const refs = new Set<string>()
    walk(value, s => { if (isRef(s)) refs.add(s); return s })
    if (!refs.size) return value

    const byBucket = new Map<string, string[]>()
    for (const r of refs) {
        const p = parseRef(r)
        if (!p) continue
        byBucket.set(p.bucket, [...(byBucket.get(p.bucket) ?? []), p.path])
    }
    const signed = new Map<string, string>()
    await Promise.all(Array.from(byBucket.entries()).map(async ([bucket, paths]) => {
        try {
            const { data, error } = await supabaseAdmin.storage.from(bucket).createSignedUrls(paths, SIGNED_TTL_SECONDS)
            if (error || !data) { console.error("[SECURE_FILES_SIGN]", bucket, error?.message); return }
            for (const d of data) if (d.signedUrl && d.path) signed.set(refFor(d.path, bucket), d.signedUrl)
        } catch (e) {
            console.error("[SECURE_FILES_SIGN]", bucket, e)
        }
    }))
    // A reference that couldn't be signed (missing file) becomes "" rather
    // than a raw sb:// string the browser can't open.
    return walk(value, s => (isRef(s) ? signed.get(s) ?? "" : s)) as T
}

/**
 * Store a sensitive upload privately. Returns the reference to save and a
 * signed link for immediate preview, or null when the private bucket isn't
 * set up yet (the caller then falls back to the old public upload).
 */
export async function uploadSecure(path: string, body: Buffer, contentType: string): Promise<{ ref: string; url: string } | null> {
    const { data, error } = await supabaseAdmin.storage.from(SECURE_BUCKET).upload(path, body, { contentType, upsert: false })
    if (error || !data) {
        console.error("[SECURE_FILES_UPLOAD]", error?.message)
        return null
    }
    const ref = refFor(data.path)
    const { data: s } = await supabaseAdmin.storage.from(SECURE_BUCKET).createSignedUrl(data.path, SIGNED_TTL_SECONDS)
    return { ref, url: s?.signedUrl ?? "" }
}

/** Upload kinds that must never be public. */
export const SENSITIVE_KINDS = new Set(["document", "receipt", "evidence", "attachment"])
