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

    // Small delay so the DOM settles before print dialog opens
    setTimeout(() => window.print(), 80)
}
