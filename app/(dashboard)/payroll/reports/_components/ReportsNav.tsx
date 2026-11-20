"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { ArrowLeft } from "lucide-react"

// Header shared by Payroll → Reports pages: back to Payroll, the title, and
// tabs between the reports.
const TABS = [
    { href: "/payroll/reports/writer", label: "Report Writer" },
    { href: "/payroll/reports/fnf", label: "FNF Settlement" },
]

export default function ReportsNav({ title, subtitle }: { title: string; subtitle: string }) {
    const path = usePathname()
    const router = useRouter()
    return (
        <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
                <button onClick={() => router.push("/payroll")} aria-label="Back to Payroll"
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text2)]">
                    <ArrowLeft size={16} />
                </button>
                <div className="min-w-0">
                    <h1 className="m-0 text-2xl font-bold tracking-tight text-[var(--text)]">{title}</h1>
                    <p className="m-0 mt-0.5 text-[13px] text-[var(--text3)]">{subtitle}</p>
                </div>
            </div>
            <div className="flex gap-1 overflow-x-auto border-b border-[var(--border)]">
                {TABS.map(t => {
                    const on = path?.startsWith(t.href)
                    return (
                        <Link key={t.href} href={t.href}
                            className={`whitespace-nowrap border-b-2 px-3 py-2 text-[13px] font-semibold ${on ? "border-[#0b5cff] text-[#0b5cff]" : "border-transparent text-[var(--text3)] hover:text-[var(--text)]"}`}>
                            {t.label}
                        </Link>
                    )
                })}
            </div>
        </div>
    )
}
