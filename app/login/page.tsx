"use client"

import { useState, useEffect, useCallback, Suspense } from "react"
import { signIn, useSession } from "next-auth/react"
import { useSearchParams } from "next/navigation"
import { Eye, EyeOff, AlertCircle, Loader2, Smartphone, KeyRound, MessageSquareText, ArrowRight, Info } from "lucide-react"
import { AuthShell } from "@/components/auth/AuthShell"
import { PinInput } from "@/components/auth/PinInput"

type Method = "mpin" | "otp" | "password"

const LAST_ID_KEY = "growus.lastLoginId"

// Only same-site paths may be used as the post-login destination.
function safeCallback(raw: string | null): string {
    if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/login")) return "/"
    return raw
}

function messageFor(code: string, method: Method): string {
    if (code.startsWith("ACCOUNT_LOCKED")) {
        const mins = Number(code.split(":")[1]) || 15
        return `Too many wrong attempts. Your account is paused — try again in ${mins} minute${mins === 1 ? "" : "s"}.`
    }
    switch (code) {
        case "ACCOUNT_INACTIVE": return "This account is inactive. Please contact HR."
        // Only reached when OTP sign-in is switched off; otherwise it is a notice + tab switch.
        case "USE_OTP": return "No password is set for this account and OTP sign-in isn't available yet. Ask your HR or admin."
        case "NO_MPIN": return "You haven't set an MPIN yet. Sign in with an OTP first, then set your MPIN."
        default:
            return method === "mpin" ? "Wrong MPIN. Please try again."
                : method === "otp" ? "Wrong or expired OTP. Please try again."
                : "Wrong login ID or password."
    }
}

function LoginForm() {
    const params = useSearchParams()
    const callbackUrl = safeCallback(params.get("callbackUrl"))
    const { status } = useSession()

    const [method, setMethod] = useState<Method>("mpin")
    const [loginId, setLoginId] = useState("")
    const [secret, setSecret] = useState("")
    const [showPassword, setShowPassword] = useState(false)
    const [error, setError] = useState("")
    const [notice, setNotice] = useState("")
    const [loading, setLoading] = useState(false)
    const [otpEnabled, setOtpEnabled] = useState(false)
    const [mpinLength, setMpinLength] = useState(4)
    const [otpSentTo, setOtpSentTo] = useState<string | null>(null)
    const [resendIn, setResendIn] = useState(0)

    // Already signed in (e.g. back button) → straight to the app.
    useEffect(() => {
        if (status === "authenticated") window.location.replace(callbackUrl)
    }, [status, callbackUrl])

    // Remember who signed in last on this device — the id only, never a secret.
    useEffect(() => {
        try {
            const last = localStorage.getItem(LAST_ID_KEY)
            if (last) setLoginId(last)
        } catch { /* private mode */ }
        fetch("/api/login/options").then(r => r.json()).then(o => {
            setOtpEnabled(!!o.otp)
            if (o.mpinLength) setMpinLength(o.mpinLength)
            // Once SMS is live, OTP is the way in for most staff — no MPIN to
            // remember, nothing for HR to reset — so it opens on that tab.
            if (o.otp) setMethod("otp")
        }).catch(() => {})
    }, [])

    // Auto-recover from stale JS chunks after a deploy
    useEffect(() => {
        const handleError = (e: ErrorEvent) => {
            if (e.message?.includes("ChunkLoadError") || e.message?.includes("Loading chunk")) {
                window.location.reload()
            }
        }
        window.addEventListener("error", handleError, true)
        return () => window.removeEventListener("error", handleError, true)
    }, [])

    useEffect(() => {
        if (resendIn <= 0) return
        const t = setTimeout(() => setResendIn(s => s - 1), 1000)
        return () => clearTimeout(t)
    }, [resendIn])

    const switchMethod = (m: Method) => {
        setMethod(m)
        setSecret("")
        setError("")
        setNotice("")
    }

    const submit = useCallback(async (value?: string) => {
        const id = loginId.trim()
        const code = (value ?? secret).trim()
        if (!id) { setError("Enter your mobile number, employee ID or email."); return }
        if (method === "mpin" && code.length !== mpinLength) { setError(`Enter all ${mpinLength} digits of your MPIN.`); return }
        if (method === "otp" && code.length !== 6) { setError("Enter the 6-digit OTP."); return }
        if (!code) { setError("Enter your password."); return }
        setLoading(true)
        setError("")
        setNotice("")
        try {
            // A bare 10-digit number is a mobile login.
            const loginEmail = /^\d+$/.test(id) ? `${id}@cims.local` : id
            const result = await signIn("credentials", { redirect: false, email: loginEmail, password: code, method })
            if (result?.ok && !result.error) {
                try { localStorage.setItem(LAST_ID_KEY, id) } catch { /* ignore */ }
                window.location.href = callbackUrl
                return
            }
            const errCode = result?.error || ""
            // No password / no MPIN yet → OTP is the way in. Shown as a notice,
            // not an error: nothing was typed wrong.
            if ((errCode === "USE_OTP" || errCode === "NO_MPIN") && otpEnabled) {
                switchMethod("otp")
                setNotice(errCode === "USE_OTP"
                    ? "No password set for this account yet — sign in with OTP, then set your MPIN (and a password if you like)."
                    : "No MPIN set yet — sign in with OTP first, then set your MPIN.")
                return
            }
            setError(messageFor(errCode, method))
            setSecret("")
        } catch {
            setError("Something went wrong. Please check your connection and try again.")
        } finally {
            setLoading(false)
        }
    }, [loginId, secret, method, callbackUrl, mpinLength, otpEnabled])

    const sendOtp = async () => {
        const id = loginId.trim()
        if (!id) { setError("Enter your mobile number or employee ID first."); return }
        setLoading(true)
        setError("")
        setNotice("")
        try {
            const res = await fetch("/api/login/otp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ identifier: id }) })
            const data = await res.json().catch(() => ({}))
            if (data.resendIn) setResendIn(data.resendIn)
            if (!res.ok) { setError(data.error || "Couldn't send the OTP."); return }
            setOtpSentTo(data.to || "your registered mobile")
            setSecret("")
        } catch {
            setError("Couldn't send the OTP. Check your connection.")
        } finally {
            setLoading(false)
        }
    }

    const tabs: { key: Method; label: string; icon: typeof KeyRound }[] = [
        ...(otpEnabled ? [{ key: "otp" as const, label: "OTP", icon: MessageSquareText }] : []),
        { key: "mpin", label: "MPIN", icon: KeyRound },
        { key: "password", label: "Password", icon: Smartphone },
    ]

    return (
        <AuthShell
            title="Welcome back"
            subtitle="Sign in to continue to your workspace"
            footer={<span>Trouble signing in? Contact your HR or admin.</span>}
        >
            <form onSubmit={e => { e.preventDefault(); if (method === "otp" && !otpSentTo) sendOtp(); else submit() }} noValidate>
                <label htmlFor="loginId" className="block text-[13px] font-semibold text-[var(--text)] mb-1.5">Mobile number / Employee ID</label>
                <input
                    id="loginId"
                    name="username"
                    type="text"
                    inputMode="text"
                    autoComplete="username"
                    autoCapitalize="none"
                    spellCheck={false}
                    placeholder="9876543210 or EMP001"
                    value={loginId}
                    onChange={e => { setLoginId(e.target.value); setOtpSentTo(null) }}
                    className="w-full h-12 px-4 rounded-[14px] border-2 border-[var(--border)] bg-[var(--surface2)] text-[15px] text-[var(--text)] placeholder:text-[var(--text3)] outline-none transition-all focus:bg-white focus:border-[var(--accent)] focus:shadow-[0_0_0_4px_rgba(11,92,255,0.12)]"
                />

                {/* Method switcher */}
                <div className="mt-5 grid gap-1 p-1 rounded-[14px] bg-[var(--surface2)] border border-[var(--border)]" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }} role="tablist" aria-label="Sign-in method">
                    {tabs.map(t => (
                        <button
                            key={t.key}
                            type="button"
                            role="tab"
                            aria-selected={method === t.key}
                            onClick={() => switchMethod(t.key)}
                            className={`h-10 rounded-[11px] text-[13.5px] font-semibold flex items-center justify-center gap-1.5 transition-all ${method === t.key ? "bg-white text-[var(--accent)] shadow-[0_2px_8px_rgba(15,23,41,0.08)]" : "text-[var(--text2)] hover:text-[var(--text)]"}`}
                        >
                            <t.icon size={15} /> {t.label}
                        </button>
                    ))}
                </div>

                <div className="mt-6 min-h-[132px]">
                    {method === "mpin" && (
                        <div>
                            <p className="text-[13px] font-semibold text-[var(--text)] mb-3 text-center">Enter your {mpinLength}-digit MPIN</p>
                            <PinInput length={mpinLength} value={secret} onChange={v => { setSecret(v); setError("") }} onComplete={v => submit(v)} masked disabled={loading} invalid={!!error} label="MPIN" />
                            <div className="mt-4 text-center text-[13px]">
                                <button type="button" className="font-semibold text-[var(--accent)] hover:underline" onClick={() => otpEnabled ? switchMethod("otp") : setNotice("Ask your HR or admin to reset your login. You'll then sign in with an OTP and set a new MPIN.")}>
                                    Forgot MPIN?
                                </button>
                            </div>
                        </div>
                    )}

                    {method === "otp" && (
                        otpSentTo ? (
                            <div>
                                <p className="text-[13px] text-[var(--text2)] mb-3 text-center">Enter the 6-digit code sent to <span className="font-semibold text-[var(--text)]">{otpSentTo}</span></p>
                                <PinInput length={6} value={secret} onChange={v => { setSecret(v); setError("") }} onComplete={v => submit(v)} autoFocus disabled={loading} invalid={!!error} label="OTP" autoComplete="one-time-code" />
                                <div className="mt-4 text-center text-[13px] text-[var(--text3)]">
                                    {resendIn > 0 ? <>Resend OTP in <span className="font-semibold tabular-nums">{resendIn}s</span></> : (
                                        <button type="button" className="font-semibold text-[var(--accent)] hover:underline" onClick={sendOtp} disabled={loading}>Resend OTP</button>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <p className="text-[13.5px] text-[var(--text2)] text-center leading-relaxed px-2">
                                We&apos;ll text a one-time code to the mobile number registered with your account.
                            </p>
                        )
                    )}

                    {method === "password" && (
                        <div>
                            <label htmlFor="password" className="block text-[13px] font-semibold text-[var(--text)] mb-1.5">Password</label>
                            <div className="relative">
                                <input
                                    id="password"
                                    name="password"
                                    type={showPassword ? "text" : "password"}
                                    autoComplete="current-password"
                                    placeholder="Enter your password"
                                    value={secret}
                                    onChange={e => { setSecret(e.target.value); setError("") }}
                                    className="w-full h-12 pl-4 pr-12 rounded-[14px] border-2 border-[var(--border)] bg-[var(--surface2)] text-[15px] text-[var(--text)] placeholder:text-[var(--text3)] outline-none transition-all focus:bg-white focus:border-[var(--accent)] focus:shadow-[0_0_0_4px_rgba(11,92,255,0.12)]"
                                />
                                <button type="button" onClick={() => setShowPassword(s => !s)} aria-label={showPassword ? "Hide password" : "Show password"} className="absolute right-1.5 top-1/2 -translate-y-1/2 w-10 h-10 rounded-[10px] flex items-center justify-center text-[var(--text3)] hover:text-[var(--text)]">
                                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                </button>
                            </div>
                            <p className="mt-2.5 flex items-start gap-1.5 text-[12.5px] text-[var(--text3)] leading-snug">
                                <Info size={14} className="mt-[1px] shrink-0" />
                                Only if you&apos;ve set a password in your profile. Otherwise sign in with OTP or MPIN.
                            </p>
                        </div>
                    )}
                </div>

                {error && (
                    <div className="mt-4 flex items-start gap-2 rounded-[12px] border border-[#fecaca] bg-[var(--red-light)] px-3.5 py-3 text-[13px] text-[var(--red)]" role="alert" aria-live="polite">
                        <AlertCircle size={16} className="mt-[1px] shrink-0" /> <span>{error}</span>
                    </div>
                )}
                {notice && !error && (
                    <div className="mt-4 flex items-start gap-2 rounded-[12px] border border-[#bfd3ff] bg-[var(--accent-light)] px-3.5 py-3 text-[13px] text-[var(--accent-text)]" role="status">
                        <Info size={16} className="mt-[1px] shrink-0" /> <span>{notice}</span>
                    </div>
                )}

                {/* MPIN and OTP submit themselves when the last digit is typed; the button is still there for clarity. */}
                <button
                    type="submit"
                    disabled={loading}
                    className="mt-6 w-full h-12 rounded-[14px] text-white text-[15px] font-semibold flex items-center justify-center gap-2 transition-all disabled:opacity-60 disabled:cursor-not-allowed shadow-[0_10px_24px_-10px_rgba(11,92,255,0.6)] hover:brightness-110 active:scale-[0.99]"
                    style={{ background: "var(--accent-gradient)" }}
                >
                    {loading ? <Loader2 size={18} className="animate-spin" /> : null}
                    {loading ? "Please wait…" : method === "otp" && !otpSentTo ? "Send OTP" : "Sign in"}
                    {!loading && <ArrowRight size={17} />}
                </button>
            </form>
        </AuthShell>
    )
}

export default function LoginPage() {
    return (
        <Suspense fallback={null}>
            <LoginForm />
        </Suspense>
    )
}
