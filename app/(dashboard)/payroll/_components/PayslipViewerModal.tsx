"use client"
import { useCallback, useEffect, useRef } from "react"
import { Printer, X } from "lucide-react"

/**
 * On-screen preview of a payslip, rendered from the very HTML that goes to the
 * printer.
 *
 * The payslip list only ever offered Print, so reading a slip meant opening the
 * browser's print dialog and cancelling out of it — and the summary card beside
 * the list shows totals, not the slip that an employee actually receives. This
 * shows the real document, and keeps Print one click away.
 *
 * An iframe rather than an injected div: the slip ships its own stylesheet
 * written for a standalone document (bare element selectors, `body` rules,
 * `@page`), which would bleed into the dashboard if it were rendered inline.
 */
export default function PayslipViewerModal({
    title, html, onPrint, onClose,
}: {
    title: string
    /** A complete slip document, built WITHOUT the auto-print script. */
    html: string
    onPrint: () => void
    onClose: () => void
}) {
    const sheetRef = useRef<HTMLDivElement>(null)

    const onKey = useCallback((e: KeyboardEvent) => {
        if (e.key === "Escape") onClose()
    }, [onClose])

    useEffect(() => {
        window.addEventListener("keydown", onKey)
        // Escape only reaches this listener while focus is in THIS document, so
        // the sheet takes focus on open — otherwise the first key press after
        // opening goes nowhere. Once someone clicks into the slip the key goes
        // to the frame instead and Escape stops closing; the Close button and
        // the backdrop are the dismissals that always work, which is why both
        // are there. (Attaching the handler to the frame's own document was
        // tried and does not fire under sandbox.)
        sheetRef.current?.focus()
        // The list behind the overlay must not scroll with it.
        const prevOverflow = document.body.style.overflow
        document.body.style.overflow = "hidden"
        return () => {
            window.removeEventListener("keydown", onKey)
            document.body.style.overflow = prevOverflow
        }
    }, [onKey])

    return (
        <div
            onClick={onClose}
            style={{
                position: "fixed", inset: 0, zIndex: 1000,
                background: "rgba(15,23,42,0.55)",
                display: "flex", alignItems: "center", justifyContent: "center",
                padding: 16,
            }}
        >
            {/* Clicking the sheet itself must not dismiss it — only the backdrop does. */}
            <div
                ref={sheetRef}
                tabIndex={-1}
                role="dialog"
                aria-modal="true"
                aria-label={title}
                onClick={e => e.stopPropagation()}
                style={{
                    width: "100%", maxWidth: 840, height: "min(92vh, 1100px)",
                    background: "var(--surface)", border: "1px solid var(--border)",
                    borderRadius: 12, overflow: "hidden",
                    display: "flex", flexDirection: "column",
                    outline: "none",
                }}
            >
                <div style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    gap: 10, padding: "12px 16px", borderBottom: "1px solid var(--border)",
                    background: "var(--surface)", flexShrink: 0,
                }}>
                    <div style={{ minWidth: 0 }}>
                        <p style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</p>
                        <p style={{ fontSize: 11, color: "var(--text3)", margin: "2px 0 0 0" }}>Payslip preview</p>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                        <button onClick={onPrint}
                            style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 8, border: "none", background: "#7c3aed", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                            <Printer size={13} /> Print
                        </button>
                        <button onClick={onClose} aria-label="Close preview"
                            style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface2)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "var(--text3)" }}>
                            <X size={16} />
                        </button>
                    </div>
                </div>

                {/* White behind the frame: the slip is a printed page and reads
                    as one in either theme, rather than inheriting a dark panel. */}
                <div style={{ flex: 1, minHeight: 0, background: "#fff" }}>
                    <iframe
                        srcDoc={html}
                        title={title}
                        // No allow-scripts: nothing in the slip needs to run,
                        // and withholding it keeps the frame inert. allow-same-origin
                        // is needed, though — without it the document lands in an
                        // opaque origin, its base URL stops resolving against the
                        // parent, and the letterhead logo (src="/logo.png") fails
                        // to load, printing a slip with an empty top left corner.
                        sandbox="allow-same-origin"
                        style={{ width: "100%", height: "100%", border: "none", display: "block", outline: "none" }}
                    />
                </div>
            </div>
        </div>
    )
}
