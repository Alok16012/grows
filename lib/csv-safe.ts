/**
 * Sanitize a value for safe inclusion in XLSX/CSV cells.
 *
 * Excel / LibreOffice treat strings that begin with = + - @ tab or CR/LF as
 * formulas. Prefixing with a single quote forces text interpretation.
 * Newlines are collapsed to spaces to keep row structure intact.
 */
export function csvSafe(v: unknown): string {
    const s = String(v ?? "")
    if (/^[=+\-@\t\r\n]/.test(s)) return "'" + s
    return s.replace(/[\r\n]+/g, " ")
}
