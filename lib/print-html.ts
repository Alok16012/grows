/**
 * Prints a complete HTML document (payslips, wage sheets, compliance masters)
 * from a hidden iframe, so only that document's own styles apply.
 *
 * It used to be pasted into the app page under @media print rules. The app's
 * styles and the document's (`*{margin:0}`, `body{…}`, class names like `.info`
 * or `.head`) then mixed both ways, and the page's own layout could clip or
 * hide it — printed slips came out broken. An iframe keeps them apart.
 */
export function printHTML(html: string) {
    // The documents carry an auto-print <script> for when they are opened on
    // their own; here we print ourselves, so drop it (no second dialog).
    const doc = html.replace(/<script[\s\S]*?<\/script>/gi, "")

    document.getElementById("__cims_print_frame__")?.remove()
    const frame = document.createElement("iframe")
    frame.id = "__cims_print_frame__"
    frame.setAttribute("aria-hidden", "true")
    // Off-screen but laid out at A4-ish width, so it renders like the page it prints.
    frame.style.cssText = "position:fixed;left:-10000px;top:0;width:800px;height:1100px;border:0;opacity:0;pointer-events:none"
    // srcdoc inherits this page's address, so "/logo.png" still resolves.
    frame.srcdoc = doc

    const cleanup = () => setTimeout(() => frame.remove(), 1000)

    frame.onload = () => {
        const win = frame.contentWindow
        const d = frame.contentDocument
        if (!win || !d) { cleanup(); return }

        // Wait for images (the letterhead logo), or the first print of the day
        // shows an empty box. A timeout means a broken image never blocks printing.
        const pending = Array.from(d.images)
            .filter(img => !img.complete)
            .map(img => new Promise<void>(resolve => {
                img.addEventListener("load", () => resolve(), { once: true })
                img.addEventListener("error", () => resolve(), { once: true })
            }))
        const ready = pending.length
            ? Promise.race([Promise.all(pending), new Promise(r => setTimeout(r, 2000))])
            : Promise.resolve()

        ready.then(() => {
            win.addEventListener("afterprint", cleanup, { once: true })
            win.focus()
            win.print()
            // Some browsers never fire afterprint for an iframe; remove it later anyway.
            setTimeout(() => frame.remove(), 60_000)
        })
    }
    document.body.appendChild(frame)
}
