"use client"

import { useEffect } from "react"
import { COMPANY } from "@/lib/company"

// Root-level error boundary. It replaces the whole document, so it cannot
// rely on globals.css or any provider: everything is inline. The raw
// error.message is logged, never shown — it can leak internals and is rarely
// useful to the person reading it. The digest is kept so support can find
// the server log entry.
export default function GlobalError({
    error,
    reset,
}: {
    error: Error & { digest?: string }
    reset: () => void
}) {
    useEffect(() => {
        console.error(error)
    }, [error])

    return (
        <html lang="en">
            <body style={{ margin: 0, background: "#eef1fb", color: "#0f1729", fontFamily: "Poppins, system-ui, -apple-system, 'Segoe UI', sans-serif" }}>
                <main style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px 16px" }}>
                    <section style={{ width: "100%", maxWidth: 440, background: "#ffffff", border: "1px solid #e6eaf5", borderRadius: 18, boxShadow: "0 8px 24px rgba(15, 23, 41, 0.10)", padding: "36px 28px", textAlign: "center" }}>
                        <p style={{ margin: 0, fontSize: 13, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#0b5cff" }}>{COMPANY.name}</p>
                        <h1 style={{ margin: "14px 0 8px", fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em" }}>Something went wrong</h1>
                        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: "#5b6478" }}>
                            We hit an unexpected problem while loading this page. Reloading usually fixes it. If it keeps happening: {COMPANY.supportLine}
                        </p>
                        <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 24, flexWrap: "wrap" }}>
                            <button
                                type="button"
                                onClick={() => window.location.reload()}
                                style={{ padding: "10px 20px", background: "#0b5cff", color: "#fff", border: "none", borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
                            >
                                Reload
                            </button>
                            <button
                                type="button"
                                onClick={() => reset()}
                                style={{ padding: "10px 20px", background: "#f5f7fd", color: "#0f1729", border: "1px solid #d6ddee", borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
                            >
                                Try again
                            </button>
                        </div>
                        {error.digest && (
                            <p style={{ margin: "22px 0 0", fontSize: 11.5, color: "#98a1b5" }}>
                                Reference for support: <code style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", color: "#5b6478" }}>{error.digest}</code>
                            </p>
                        )}
                    </section>
                </main>
            </body>
        </html>
    )
}
