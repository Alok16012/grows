"use client"

import { useEffect, useState } from "react"
import type React from "react"
import { useSession, signOut } from "next-auth/react"
import { AlertCircle, Loader2, CheckCircle2, ShieldCheck, ArrowRight } from "lucide-react"
import { AuthShell } from "@/components/auth/AuthShell"
import { PinInput } from "@/components/auth/PinInput"

type Info = { installed: boolean; hasMpin: boolean; mpinLength: number; mobile: string; proof: "none" | "otp" | "current-mpin" }
type Step = "loading" | "unavailable" | "proof" | "create" | "confirm" | "done"

// First login with the mobile-number password lands here (middleware sends
// every page to /setup-mpin until an MPIN exists). Also used from Profile to
// change the MPIN later.
export default function SetupMpinPage() {
    const { update } = useSession()
    const [info, setInfo] = useState<Info | null>(null)
    const [step, setStep] = useState<Step>("loading")
    const [proofValue, setProofValue] = useState("")
    const [otpSentTo, setOtpSentTo] = useState<string | null>(null)
    const [resendIn, setResendIn] = useState(0)
    const [mpin, setMpin] = useState("")
    const [confirm, setConfirm] = useState("")
    const [error, setError] = useState("")
    const [busy, setBusy] = useState(false)

    useEffect(() => {
        fetch("/api/me/mpin").then(r => r.json()).then((d: Info & { error?: string }) => {
            if (d.error) { setError(d.error); setStep("unavailable"); return }
            setInfo(d)
            setStep(!d.installed ? "unavailable" : d.proof === "none" ? "create" : "proof")
        }).catch(() => { setError("Couldn't load. Check your connection and refresh."); setStep("unavailable") })
    }, [])

    useEffect(() => {
        if (resendIn <= 0) return
        const t = setTimeout(() => setResendIn(s => s - 1), 1000)
        return () => clearTimeout(t)
    }, [resendIn])

    const len = info?.mpinLength ?? 4
    const changing = !!info?.hasMpin

    const sendOtp = async () => {
        setBusy(true); setError("")
        try {
            const res = await fetch("/api/me/mpin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "send-otp" }) })
            const d = await res.json().catch(() => ({}))
            if (d.resendIn) setResendIn(d.resendIn)
            if (!res.ok) { setError(d.error || "Couldn't send the OTP."); return }
            setOtpSentTo(d.to || info?.mobile || "your mobile")
        } finally { setBusy(false) }
    }

    const save = async (confirmValue: string) => {
        if (confirmValue !== mpin) {
            setError("The two MPINs don't match. Enter your new MPIN again.")
            setMpin(""); setConfirm(""); setStep("create")
            return
        }
        setBusy(true); setError("")
        try {
            const body: Record<string, string> = { mpin }
            if (info?.proof === "otp") body.otp = proofValue
            if (info?.proof === "current-mpin") body.currentMpin = proofValue
            const res = await fetch("/api/me/mpin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
            const d = await res.json().catch(() => ({}))
            if (!res.ok) {
                setError(d.error || "Couldn't save your MPIN.")
                setMpin(""); setConfirm("")
                // A bad OTP / current MPIN sends them back to that step.
                const proofProblem = /OTP|current MPIN/i.test(d.error || "")
                if (proofProblem) setProofValue("")
                setStep(proofProblem ? "proof" : "create")
                return
            }
            await update() // refreshes the session so the app stops sending us here
            setStep("done")
            setTimeout(() => { window.location.href = changing ? "/profile" : "/" }, 1200)
        } finally { setBusy(false) }
    }

    const title = step === "done" ? "You're all set" : changing ? "Change your MPIN" : "Set your MPIN"
    const subtitle = step === "done"
        ? "Use your MPIN to sign in from now on."
        : changing ? "Choose a new 4-digit MPIN for signing in." : "Create a 4-digit MPIN. You'll use it instead of your password every time you sign in."

    return (
        <AuthShell
            title={title}
            subtitle={subtitle}
            footer={<button type="button" onClick={() => signOut({ callbackUrl: "/login" })} className="font-semibold text-[var(--text2)] hover:text-[var(--text)]">Sign out</button>}
        >
            {step === "loading" && <div className="flex justify-center py-10"><Loader2 className="animate-spin text-[var(--accent)]" /></div>}

            {step === "unavailable" && (
                <div className="text-center">
                    <p className="text-[14px] text-[var(--text2)]">{error || "MPIN sign-in isn't switched on yet."}</p>
                    <a href="/" className="mt-6 inline-flex items-center gap-2 h-11 px-5 rounded-[12px] text-white text-[14px] font-semibold" style={{ background: "var(--accent-gradient)" }}>Continue <ArrowRight size={16} /></a>
                </div>
            )}

            {step === "proof" && info?.proof === "otp" && (
                otpSentTo ? (
                    <div>
                        <StepLabel n={1} text={`Enter the OTP sent to ${otpSentTo}`} />
                        <PinInput length={6} value={proofValue} onChange={v => { setProofValue(v); setError("") }} onComplete={() => setStep("create")} autoFocus autoComplete="one-time-code" label="OTP" invalid={!!error} />
                        <div className="mt-4 text-center text-[13px] text-[var(--text3)]">
                            {resendIn > 0 ? <>Resend OTP in <span className="font-semibold tabular-nums">{resendIn}s</span></> : <button type="button" onClick={sendOtp} disabled={busy} className="font-semibold text-[var(--accent)] hover:underline">Resend OTP</button>}
                        </div>
                    </div>
                ) : (
                    <div className="text-center">
                        <ShieldCheck className="mx-auto text-[var(--accent)]" size={40} />
                        <p className="mt-3 text-[14px] text-[var(--text2)]">First, let&apos;s confirm it&apos;s you. We&apos;ll send a one-time code to <span className="font-semibold text-[var(--text)]">{info.mobile || "your mobile"}</span>.</p>
                        <PrimaryButton onClick={sendOtp} busy={busy}>Send OTP</PrimaryButton>
                    </div>
                )
            )}

            {step === "proof" && info?.proof === "current-mpin" && (
                <div>
                    <StepLabel n={1} text="Enter your current MPIN" />
                    <PinInput length={len} value={proofValue} onChange={v => { setProofValue(v); setError("") }} onComplete={() => setStep("create")} masked autoFocus label="Current MPIN" invalid={!!error} />
                </div>
            )}

            {step === "create" && (
                <div>
                    <StepLabel n={info?.proof === "none" ? 1 : 2} text={`Create a new ${len}-digit MPIN`} />
                    <PinInput length={len} value={mpin} onChange={v => { setMpin(v); setError("") }} onComplete={() => { setConfirm(""); setStep("confirm") }} masked autoFocus label="New MPIN" invalid={!!error} />
                    <p className="mt-4 text-center text-[12.5px] text-[var(--text3)]">Avoid 1234, 1111 or digits from your mobile number.</p>
                </div>
            )}

            {step === "confirm" && (
                <div>
                    <StepLabel n={info?.proof === "none" ? 2 : 3} text="Enter the same MPIN again" />
                    <PinInput length={len} value={confirm} onChange={v => { setConfirm(v); setError("") }} onComplete={save} masked autoFocus disabled={busy} label="Confirm MPIN" invalid={!!error} />
                    {busy && <div className="mt-4 flex justify-center"><Loader2 className="animate-spin text-[var(--accent)]" size={20} /></div>}
                </div>
            )}

            {step === "done" && (
                <div className="text-center py-4">
                    <CheckCircle2 className="mx-auto text-[var(--success-strong)]" size={52} />
                    <p className="mt-3 text-[14px] text-[var(--text2)]">Taking you to your dashboard…</p>
                </div>
            )}

            {error && step !== "unavailable" && (
                <div className="mt-5 flex items-start gap-2 rounded-[12px] border border-[#fecaca] bg-[var(--red-light)] px-3.5 py-3 text-[13px] text-[var(--red)]" role="alert">
                    <AlertCircle size={16} className="mt-[1px] shrink-0" /> <span>{error}</span>
                </div>
            )}
        </AuthShell>
    )
}

function StepLabel({ n, text }: { n: number; text: string }) {
    return (
        <p className="mb-4 flex items-center justify-center gap-2 text-[13.5px] font-semibold text-[var(--text)]">
            <span className="w-6 h-6 rounded-full bg-[var(--accent-light)] text-[var(--accent)] text-[12px] flex items-center justify-center">{n}</span>
            {text}
        </p>
    )
}

function PrimaryButton({ onClick, busy, children }: { onClick: () => void; busy: boolean; children: React.ReactNode }) {
    return (
        <button type="button" onClick={onClick} disabled={busy}
            className="mt-6 w-full h-12 rounded-[14px] text-white text-[15px] font-semibold flex items-center justify-center gap-2 disabled:opacity-60 shadow-[0_10px_24px_-10px_rgba(11,92,255,0.6)] hover:brightness-110"
            style={{ background: "var(--accent-gradient)" }}>
            {busy && <Loader2 size={18} className="animate-spin" />}{children}
        </button>
    )
}
