// Document types an employee can only sensibly hold ONE of.
//
// Re-uploading one of these replaces the previous file rather than adding a
// second copy. Without that rule any form that re-sent its files — a retry after
// a failed upload, a double submit, a page reload mid-flow — appended another
// row every time, and HR ended up reviewing the same Aadhaar and PAN dozens of
// times over.
//
// Everything not listed here (CERTIFICATE, RESUME, OTHER) can legitimately have
// several files, so those keep appending.
export const SINGLE_INSTANCE_DOC_TYPES = new Set([
    "AADHAAR",
    "PAN",
    "PHOTO",
    "BANK_DETAILS",
])

/** Case-insensitive: stored types are inconsistently cased ("PHOTO" vs "Photo"). */
export function isSingleInstanceDoc(type: string | null | undefined): boolean {
    return SINGLE_INSTANCE_DOC_TYPES.has(String(type ?? "").toUpperCase())
}
