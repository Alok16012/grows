
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
    const [isRecovering, setIsRecovering] = useState(false)
    const [debugResult, setDebugResult] = useState<any>(null)
    const [debugging, setDebugging] = useState(false)

    const handleDebug = async () => {
        if (!email || !password) {
            setError("Enter login + password first")
            return
        }
        setDebugging(true)
        setDebugResult(null)
        try {
            const res = await fetch("/api/test-login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ input: email, password }),
            })
            const data = await res.json()
            setDebugResult(data)
        } catch (e: any) {
            setDebugResult({ error: e.message })
        } finally {
            setDebugging(false)
        }
    }

    useEffect(() => {
        const handleError = (e: ErrorEvent) => {
            if (e.message?.includes("ChunkLoadError") || e.message?.includes("Loading chunk")) {
                console.warn("ChunkLoadError detected, performing emergency reload...")
                setIsRecovering(true)
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

            console.log("[LOGIN] result:", result)

            if (result?.error) {
                // Show the actual NextAuth error code so we can diagnose
                setError(`Login failed: ${result.error}${result.status ? ` (status ${result.status})` : ""}`)
            } else if (result?.ok) {
                router.refresh()
                window.location.href = "/"
            } else {
                setError("Login did not complete. Try again.")
            }
        } catch (err: any) {
            console.error("[LOGIN] error:", err)
            setError(`Error: ${err?.message || "Unexpected"}`)
        } finally {
            setLoading(false)
        }
    }

    const handleDemoLogin = async (roleEmail: string) => {
        setLoading(true)
        setError("")
        const demoPassword = "demo123"

        try {
            const result = await signIn("credentials", {
                redirect: false,
                email: roleEmail,
                password: demoPassword,
            })

            if (result?.error) {
                setError("Demo login failed")
            } else {
                window.location.href = "/"
            }
        } catch (err) {
            setError("An unexpected error occurred")
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
                        <span className="text-[20px] font-bold text-[#1a1a18] tracking-[-0.4px]">CIMS</span>
                    </div>
                    <p className="text-[13px] text-[#9e9b95] leading-relaxed">
                        Enter your credentials to access the system
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
                                placeholder="Email, Employee ID (EMP001) or Phone number"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="w-full py-[10px] px-[14px] bg-[#f9f8f5] border border-[#e8e6e1] rounded-[9px] text-[13px] text-[#1a1a18] placeholder:text-[#9e9b95] focus:border-[#1a9e6e] focus:bg-white focus:ring-[3px] focus:ring-[rgba(26,158,110,0.08)] focus:outline-none transition-all"
                                required
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="password" className="text-[13px] font-medium text-[#1a1a18]">Password</Label>
                            <Input
                                id="password"
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full py-[10px] px-[14px] bg-[#f9f8f5] border border-[#e8e6e1] rounded-[9px] text-[13px] text-[#1a1a18] placeholder:text-[#9e9b95] focus:border-[#1a9e6e] focus:bg-white focus:ring-[3px] focus:ring-[rgba(26,158,110,0.08)] focus:outline-none transition-all"
                                required
                            />
                        </div>
                    </div>

                    <Button
                        type="submit"
                        disabled={loading}
                        className="w-full mt-3 py-[11px] bg-[#1a9e6e] hover:bg-[#158a5e] text-white border-none rounded-[9px] text-[14px] font-semibold disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                    >
                        {loading ? "Signing in..." : "Sign In"}
                    </Button>

                    <button
                        type="button"
                        onClick={handleDebug}
                        disabled={debugging}
                        className="w-full mt-2 py-[8px] bg-transparent border border-[#e8e6e1] text-[#6b6860] rounded-[9px] text-[12px] font-medium hover:bg-[#f9f8f5] disabled:opacity-60"
                    >
                        {debugging ? "Checking..." : "Why login failed? (Diagnose)"}
                    </button>

                    {debugResult && (
                        <div className="mt-3 bg-[#f9f8f5] border border-[#e8e6e1] rounded-[8px] p-3 text-[11px] text-[#1a1a18] max-h-[300px] overflow-auto">
                            <p className="font-bold mb-1">
                                {debugResult.ok ? "✅ Login should work" : `❌ ${debugResult.reason || "Failed"}`}
                            </p>
                            {debugResult.hint && <p className="text-amber-700 mb-2">{debugResult.hint}</p>}
                            <pre className="whitespace-pre-wrap text-[10px]">{JSON.stringify(debugResult, null, 2)}</pre>
                        </div>
                    )}

                    <div className="flex items-center gap-3 my-5">
                        <div className="flex-1 h-px bg-[#e8e6e1]"></div>
                        <span className="text-[11px] font-medium text-[#9e9b95] tracking-[0.8px] uppercase whitespace-nowrap">OR DEMO ACCESS</span>
                        <div className="flex-1 h-px bg-[#e8e6e1]"></div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                        <button
                            type="button"
                            onClick={() => handleDemoLogin("admin@cims.com")}
                            disabled={loading}
                            className="flex items-center justify-center gap-1.5 bg-[#f9f8f5] border border-[#e8e6e1] rounded-[9px] py-[9px] px-3 text-[13px] font-medium text-[#6b6860] cursor-pointer transition-all hover:bg-[#e8f7f1] hover:text-[#0d6b4a] hover:border-[rgba(26,158,110,0.3)] disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                            </svg>
                            Admin
                        </button>
                        <button
                            type="button"
                            onClick={() => handleDemoLogin("manager@cims.com")}
                            disabled={loading}
                            className="flex items-center justify-center gap-1.5 bg-[#f9f8f5] border border-[#e8e6e1] rounded-[9px] py-[9px] px-3 text-[13px] font-medium text-[#6b6860] cursor-pointer transition-all hover:bg-[#eff6ff] hover:text-[#1d4ed8] hover:border-[rgba(29,78,216,0.2)] disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                                <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
                            </svg>
                            Manager
                        </button>
                        <button
                            type="button"
                            onClick={() => handleDemoLogin("inspector@cims.com")}
                            disabled={loading}
                            className="flex items-center justify-center gap-1.5 bg-[#f9f8f5] border border-[#e8e6e1] rounded-[9px] py-[9px] px-3 text-[13px] font-medium text-[#6b6860] cursor-pointer transition-all hover:bg-[#fef3c7] hover:text-[#92400e] hover:border-[rgba(217,119,6,0.2)] disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
                                <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
                            </svg>
                            Inspector
                        </button>
                        <button
                            type="button"
                            onClick={() => handleDemoLogin("client@cims.com")}
                            disabled={loading}
                            className="flex items-center justify-center gap-1.5 bg-[#f9f8f5] border border-[#e8e6e1] rounded-[9px] py-[9px] px-3 text-[13px] font-medium text-[#6b6860] cursor-pointer transition-all hover:bg-[#f5f3ff] hover:text-[#6d28d9] hover:border-[rgba(109,40,217,0.2)] disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                                <circle cx="12" cy="7" r="4" />
                            </svg>
                            Client
                        </button>
                    </div>
                </form>
            </div>

            <div className="absolute bottom-6 text-center text-[13px] text-[#9e9b95]">
                Developed by <a href="https://blinks-ai.com" target="_blank" rel="noopener noreferrer" className="text-[#1a9e6e] hover:underline font-medium">Blinks AI</a>
            </div>
        </div>
    )
}
