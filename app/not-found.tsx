import Link from "next/link"
import { FileQuestion, ArrowLeft } from "lucide-react"
import { COMPANY } from "@/lib/company"

// Root 404. Rendered inside the root layout (so globals.css tokens apply),
// styled to match the app: lavender canvas, white card, blue action button.
export default function NotFound() {
    return (
        <main className="min-h-[100dvh] bg-[var(--bg)] flex items-center justify-center px-4 py-10">
            <section className="w-full max-w-[440px] bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-card)] shadow-[var(--shadow-lg)] px-7 py-9 text-center">
                <p className="text-[12px] font-bold uppercase tracking-[0.08em] text-[var(--accent)]">{COMPANY.name}</p>
                <div className="mx-auto mt-5 h-14 w-14 rounded-[16px] bg-[var(--accent-light)] text-[var(--accent-text)] flex items-center justify-center">
                    <FileQuestion className="h-7 w-7" aria-hidden="true" />
                </div>
                <h1 className="mt-5 text-[24px] font-bold tracking-[-0.02em] text-[var(--text)]">Page not found</h1>
                <p className="mt-2 text-[14px] leading-relaxed text-[var(--text2)]">
                    The page you are looking for has moved or does not exist. Check the address, or head back to your dashboard.
                </p>
                <Link
                    href="/"
                    className="mt-6 inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-[var(--accent)] text-white text-[13.5px] font-semibold rounded-[10px] hover:opacity-90 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2"
                >
                    <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Go home
                </Link>
                <p className="mt-6 text-[12px] text-[var(--text3)]">{COMPANY.supportLine}</p>
            </section>
        </main>
    )
}
