// Client side: after a big action (announcement, Mark all paid, policy
// publish) keep sending the WhatsApp / email messages it queued, in the
// background while the page stays open. Silent when nothing is queued.
export async function drainMyMessages(onProgress?: (p: { sent: number; remaining: number }) => void) {
    let sent = 0
    for (let i = 0; i < 40; i++) {
        try {
            const r = await fetch("/api/comm/drain", { method: "POST" })
            if (!r.ok) return sent
            const d = await r.json()
            sent += d.sent || 0
            onProgress?.({ sent, remaining: d.remaining || 0 })
            if (!d.processed || !d.remaining) return sent
        } catch { return sent }
    }
    return sent
}
