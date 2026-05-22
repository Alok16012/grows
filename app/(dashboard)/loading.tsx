// Shown instantly during page navigation while server data is fetching.
// Eliminates "blank page" perception between route transitions.
export default function DashboardLoading() {
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: "20px 24px" }}>
            {/* Header skeleton */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ height: 28, width: 220, background: "var(--surface2)", borderRadius: 8 }} />
                <div style={{ height: 36, width: 140, background: "var(--surface2)", borderRadius: 8 }} />
            </div>

            {/* Stats row skeleton */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
                {[1, 2, 3, 4].map(i => (
                    <div key={i} style={{
                        height: 90,
                        background: "var(--surface)",
                        border: "1px solid var(--border)",
                        borderRadius: 12,
                        opacity: 0.6,
                    }} />
                ))}
            </div>

            {/* Content skeleton */}
            <div style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: 14,
                minHeight: 320,
                padding: 20,
                display: "flex",
                flexDirection: "column",
                gap: 10,
                opacity: 0.6,
            }}>
                {[1, 2, 3, 4, 5].map(i => (
                    <div key={i} style={{ height: 48, background: "var(--surface2)", borderRadius: 6 }} />
                ))}
            </div>

            <style dangerouslySetInnerHTML={{ __html: `
                @keyframes pulse {
                    0%, 100% { opacity: 0.6; }
                    50% { opacity: 0.9; }
                }
                div { animation: pulse 1.5s ease-in-out infinite; }
            ` }} />
        </div>
    )
}
