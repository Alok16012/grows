import crypto from "crypto"

// Signed links for employee photos served by /api/photo/[id].
//
// The route used to serve any employee's photo to anyone who knew (or guessed)
// the id, signed out (QA audit F4). It can't simply demand a session: the
// mobile app shows photos with a plain <Image> that sends no token, and the
// apps already on phones can't be changed. So the server signs the links it
// hands out (lib/prisma's photo field) and the route accepts a valid signature
// or a signed-in caller. A link stays valid until the end of the next UTC day,
// so it is stable for a day and the browser cache keeps working.

const SECRET = process.env.NEXTAUTH_SECRET

function sign(id: string, exp: number): string {
    return crypto.createHmac("sha256", SECRET!).update(`photo:${id}:${exp}`).digest("base64url").slice(0, 22)
}

/** `/api/photo/<id>?e=<expiry>&s=<signature>` (unsigned if no secret is configured). */
export function signedPhotoUrl(id: string, now = Date.now()): string {
    if (!SECRET) return `/api/photo/${id}`
    const day = 86_400_000
    const exp = Math.floor((Math.floor(now / day) + 2) * day / 1000)   // end of the next UTC day
    return `/api/photo/${id}?e=${exp}&s=${sign(id, exp)}`
}

/** True when `e` / `s` are a current, valid signature for this id. */
export function photoSignatureValid(id: string, e: string | null, s: string | null, now = Date.now()): boolean {
    if (!SECRET || !e || !s) return false
    const exp = Number(e)
    if (!Number.isInteger(exp) || exp * 1000 < now) return false
    const want = Buffer.from(sign(id, exp)), got = Buffer.from(s)
    return want.length === got.length && crypto.timingSafeEqual(want, got)
}
