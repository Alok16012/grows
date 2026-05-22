"use client"

import { useState, useEffect } from "react"
import { signIn } from "next-auth/react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export default function LoginPage() {
    const router = useRouter()
    const [email, setEmail] = useState("")
    const [password, setPassword] = useState("")
    const [error, setError] = useState("")
    const [loading, setLoading] = useState(false)

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

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        setError("")

        try {
            // If user typed only digits (phone number), auto-append @cims.local
            // For Employee IDs (e.g. EMP001) or emails, send as-is
            const trimmed = email.trim()
            const loginEmail = /^\d+$/.test(trimmed)
                ? `${trimmed}@cims.local`
                : trimmed

            const result = await signIn("credentials", {
                redirect: false,
                email: loginEmail,
                password,
            })

            if (result?.error) {
                setError("Invalid credentials. Please check your email and password.")
            } else if (result?.ok) {
                router.refresh()
                window.location.href = "/"
            } else {
                setError("Login did not complete. Try again.")
            }
        } catch {
            setError("Something went wrong. Please try again.")
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="min-h-screen bg-[#f5f4f0] flex items-center justify-center p-6">
            <div className="bg-white border border-[#e8e6e1] rounded-[16px] w-[420px] max-w-full p-9" style={{ boxShadow: "0 4px 24px rgba(0,0,0,0.06)" }}>
                <div className="text-center mb-7">
                    <div className="flex items-center justify-center gap-2.5 mb-4">
                        <div className="w-9 h-9 bg-[#1a9e6e] rounded-[10px] flex items-center justify-center">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="3" y="3" width="7" height="7" />
                                <rect x="14" y="3" width="7" height="7" />
                                <rect x="14" y="14" width="7" height="7" />
                                <rect x="3" y="14" width="7" height="7" />
                            </svg>
                        </div>
                        <span className="text-[20px] font-bold text-[#1a1a18] tracking-[-0.4px]">Growus Auto</span>
                    </div>
                    <p className="text-[13px] text-[#9e9b95] leading-relaxed">
                        Sign in to access your dashboard
                    </p>
                </div>

                <div className="border-t border-[#e8e6e1] mb-6"></div>

                <form onSubmit={handleSubmit}>
                    {error && (
                        <div className="bg-[#fef2f2] border border-[#fca5a5] rounded-[8px] p-[10px_14px] mb-3 flex items-center gap-2 text-[13px] text-[#dc2626]">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="10" />
                                <line x1="12" y1="8" x2="12" y2="12" />
                                <line x1="12" y1="16" x2="12.01" y2="16" />
                            </svg>
                            {error}
                        </div>
                    )}

                    <div className="space-y-4">
                        <div className="space-y-1.5">
                            <Label htmlFor="email" className="text-[13px] font-medium text-[#1a1a18]">Email / Employee ID / Phone</Label>
                            <Input
                                id="email"
                                type="text"
                                placeholder="you@example.com or EMP001 or 9876543210"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="w-full py-[10px] px-[14px] bg-[#f9f8f5] border border-[#e8e6e1] rounded-[9px] text-[13px] text-[#1a1a18] placeholder:text-[#9e9b95] focus:border-[#1a9e6e] focus:bg-white focus:ring-[3px] focus:ring-[rgba(26,158,110,0.08)] focus:outline-none transition-all"
                                required
                                autoComplete="username"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="password" className="text-[13px] font-medium text-[#1a1a18]">Password</Label>
                            <Input
                                id="password"
                                type="password"
                                placeholder="Enter your password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full py-[10px] px-[14px] bg-[#f9f8f5] border border-[#e8e6e1] rounded-[9px] text-[13px] text-[#1a1a18] placeholder:text-[#9e9b95] focus:border-[#1a9e6e] focus:bg-white focus:ring-[3px] focus:ring-[rgba(26,158,110,0.08)] focus:outline-none transition-all"
                                required
                                autoComplete="current-password"
                            />
                        </div>
                    </div>

                    <Button
                        type="submit"
                        disabled={loading}
                        className="w-full mt-5 py-[11px] bg-[#1a9e6e] hover:bg-[#158a5e] text-white border-none rounded-[9px] text-[14px] font-semibold disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                    >
                        {loading ? "Signing in..." : "Sign In"}
                    </Button>
                </form>
            </div>

            <div className="absolute bottom-6 text-center text-[13px] text-[#9e9b95]">
                Developed by <a href="https://blinks-ai.com" target="_blank" rel="noopener noreferrer" className="text-[#1a9e6e] hover:underline font-medium">Blinks AI</a>
            </div>
        </div>
    )
}
