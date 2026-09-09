/**
 * Prints an HTML string by injecting it into the current page with @media print CSS.
 * This avoids popups, iframes, and any browser security restrictions — window.print()
 * is called directly on the current page in response to user gesture.
 */
export function printHTML(html: string) {
    const parsed = new DOMParser().parseFromString(html, "text/html")

    const styleContent = Array.from(parsed.querySelectorAll("style"))
        .map(s => s.textContent ?? "")
        .join("\n")

    const container = document.createElement("div")
    container.id = "__cims_print_root__"
    container.innerHTML = parsed.body.innerHTML

    const style = document.createElement("style")
    style.id = "__cims_print_styles__"
    style.textContent = `
        @media screen { #__cims_print_root__ { display: none !important; } }
        @media print {
            body > *:not(#__cims_print_root__) { display: none !important; visibility: hidden !important; }
            #__cims_print_root__ { display: block !important; visibility: visible !important; }
        }
        ${styleContent}
    `

    document.head.appendChild(style)
    document.body.appendChild(container)

    const cleanup = () => {
        document.getElementById("__cims_print_styles__")?.remove()
        document.getElementById("__cims_print_root__")?.remove()
        window.removeEventListener("afterprint", cleanup)
    }
    window.addEventListener("afterprint", cleanup)

    // Wait for images (the payslip letterhead logo) to finish loading, or the
    // print dialog opens on an empty box the first time — 80ms isn't enough to
    // fetch and decode one on a cold cache. Races a timeout so a slow or broken
    // image can never stop someone printing.
    const pending = Array.from(container.querySelectorAll("img"))
        .filter(img => !img.complete)
        .map(img => new Promise<void>(resolve => {
            img.addEventListener("load", () => resolve(), { once: true })
            img.addEventListener("error", () => resolve(), { once: true })
        }))

    const loaded = pending.length
        ? Promise.race([
            Promise.all(pending),
            new Promise(resolve => setTimeout(resolve, 2000)),
        ])
        : Promise.resolve()

    // Small delay so the DOM settles before print dialog opens
    loaded.then(() => setTimeout(() => window.print(), 80))
}
