// Deciding whether an uploaded document is the employee's profile photo.
//
// Photos arrive with inconsistent `type` values depending on the flow:
//   • HR upload / join flow → "PHOTO"
//   • onboarding link        → "Photo"
// and the file is often named "passport size photo …". Matching only the exact
// string "PHOTO" (as the old code did) silently missed every onboarding photo,
// so the avatar never picked it up. Match case-insensitively on the type, with
// a filename fallback for passport-style photos.

const PHOTO_TYPE_RE = /photo/i
const PHOTO_NAME_RE = /(photo|passport)/i
const IMAGE_EXT_RE = /\.(jpe?g|png|webp|gif|heic|bmp)$/i

export function isPhotoDoc(type?: string | null, fileName?: string | null): boolean {
    if (type && PHOTO_TYPE_RE.test(type)) return true
    if (fileName && PHOTO_NAME_RE.test(fileName)) return true
    return false
}

type PhotoDoc = {
    type?: string | null
    fileName?: string | null
    fileUrl?: string | null
    uploadedAt?: Date | string | null
}

// Pick the best profile-photo URL from a list of documents: prefer real image
// files over PDFs, newest first. Returns null when nothing qualifies.
export function pickPhotoUrl(docs: PhotoDoc[]): string | null {
    const photos = docs.filter((d) => d.fileUrl && isPhotoDoc(d.type, d.fileName))
    if (photos.length === 0) return null

    const time = (d: PhotoDoc) => (d.uploadedAt ? new Date(d.uploadedAt).getTime() : 0)
    const isImage = (d: PhotoDoc) =>
        IMAGE_EXT_RE.test(d.fileName || "") || (d.fileUrl || "").startsWith("data:image")

    const images = photos.filter(isImage)
    const pool = images.length > 0 ? images : photos
    pool.sort((a, b) => time(b) - time(a))
    return pool[0]?.fileUrl || null
}
