import type React from "react"
import { ShieldCheck, ClipboardCheck, Users, Wallet } from "lucide-react"

// Frame shared by /login and /setup-mpin.
// Desktop: brand panel on the left, form on the right.
// Phone: a deep-blue header with the logo, and the form on a white sheet that
// rises over it — the same feel as a native banking app.
export function AuthShell({ title, subtitle, children, footer }: {
    title: string
    subtitle?: string
    children: React.ReactNode
    footer?: React.ReactNode
}) {
    return (
        <div className="min-h-[100dvh] bg-[var(--bg)] lg:grid lg:grid-cols-[minmax(420px,1fr)_minmax(480px,1fr)]">
            {/* Brand panel (desktop) */}
            <aside className="hidden lg:flex relative overflow-hidden flex-col justify-between p-12 text-white" style={{ background: "var(--hero)" }}>
                <Decor />
                <Logo />
                <div className="relative max-w-[440px]">
                    <h2 className="text-[34px] font-bold leading-[1.15] tracking-[-0.02em]">
                        Inspections, people and payroll —<span className="text-[#7fb0ff]"> one place.</span>
                    </h2>
                    <p className="mt-4 text-[15px] text-white/70 leading-relaxed">
                        Sign in to manage your sites, teams, attendance and salaries from any device.
                    </p>
                    <ul className="mt-8 space-y-3.5">
                        {[
                            { icon: ClipboardCheck, text: "Quality inspections & approvals" },
                            { icon: Users, text: "Employees, onboarding & attendance" },
                            { icon: Wallet, text: "Payroll, payslips & compliance" },
                        ].map(f => (
                            <li key={f.text} className="flex items-center gap-3 text-[14.5px] text-white/85">
                                <span className="w-9 h-9 rounded-[11px] bg-white/10 flex items-center justify-center shrink-0"><f.icon size={18} /></span>
                                {f.text}
                            </li>
                        ))}
                    </ul>
                </div>
                <p className="relative flex items-center gap-2 text-[12.5px] text-white/55">
                    <ShieldCheck size={15} /> Protected with MPIN, OTP and account lockout
                </p>
            </aside>

            {/* Form side */}
            <main className="relative flex flex-col min-h-[100dvh] lg:min-h-0 lg:justify-center lg:items-center lg:p-10">
                {/* Phone header */}
                <div className="lg:hidden relative overflow-hidden px-6 pt-[max(28px,env(safe-area-inset-top))] pb-16 text-white" style={{ background: "var(--hero)" }}>
                    <Decor />
                    <Logo />
                </div>

                <div className="relative flex-1 lg:flex-none -mt-8 lg:mt-0 bg-white lg:bg-transparent rounded-t-[28px] lg:rounded-none px-6 pt-8 pb-6 sm:px-10 lg:p-0 w-full lg:max-w-[420px] flex flex-col">
                    <div className="lg:bg-white lg:rounded-[24px] lg:border lg:border-[var(--border)] lg:shadow-[0_20px_50px_-24px_rgba(15,23,41,0.25)] lg:p-10">
                        <h1 className="text-[24px] sm:text-[26px] font-bold text-[var(--text)] tracking-[-0.02em]">{title}</h1>
                        {subtitle && <p className="mt-1.5 text-[14px] text-[var(--text2)] leading-relaxed">{subtitle}</p>}
                        <div className="mt-7">{children}</div>
                    </div>
                    <div className="mt-auto lg:mt-6 pt-8 lg:pt-0 text-center text-[12.5px] text-[var(--text3)]">
                        {footer}
                        <p className="mt-2">
                            Developed by <a href="https://blinks-ai.com" target="_blank" rel="noopener noreferrer" className="text-[var(--accent)] font-medium hover:underline">Blinks AI</a>
                        </p>
                    </div>
                </div>
            </main>
        </div>
    )
}

function Logo() {
    return (
        <div className="relative flex items-center gap-3">
            <div className="w-11 h-11 rounded-[13px] bg-white/15 border border-white/20 flex items-center justify-center">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" />
                    <rect x="14" y="14" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" />
                </svg>
            </div>
            <span className="text-[22px] font-bold tracking-[-0.02em]">Growus <span className="text-[#7fb0ff]">ERP</span></span>
        </div>
    )
}

function Decor() {
    return (
        <>
            <span aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-[#0b5cff]/30 blur-2xl" />
            <span aria-hidden className="pointer-events-none absolute -left-16 bottom-[-120px] h-72 w-72 rounded-full bg-white/5" />
        </>
    )
}
