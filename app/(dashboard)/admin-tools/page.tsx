"use client"

import { useState } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { Search, ShieldCheck, Zap, AlertTriangle, CheckCircle2, XCircle } from "lucide-react"

export default function AdminToolsPage() {
    const { data: session } = useSession()
    const router = useRouter()
    const [debugInput, setDebugInput] = useState("")
    const [debugResult, setDebugResult] = useState<any>(null)
    const [fixing, setFixing] = useState(false)
    const [fixResult, setFixResult] = useState<any>(null)
    const [bulkFixing, setBulkFixing] = useState(false)
    const [bulkResult, setBulkResult] = useState<any>(null)
    const [loading, setLoading] = useState(false)
    const [roleFixing, setRoleFixing] = useState(false)
    const [roleFixResult, setRoleFixResult] = useState<any>(null)

    if (session?.user?.role !== "ADMIN") {
        return <div className="p-8 text-red-500">Admin only page.</div>
    }

    const handleDebug = async () => {
        setLoading(true)
        setDebugResult(null)
        try {
            const res = await fetch(`/api/debug-login?input=${encodeURIComponent(debugInput)}`)
            const data = await res.json()
            setDebugResult(data)
        } catch (e: any) {
            setDebugResult({ error: e.message })
        } finally {
            setLoading(false)
        }
    }

    const handleFix = async () => {
        if (!confirm("Reset this employee's login? Their password and MPIN are removed; they sign in with an OTP and set a new MPIN.")) return
        setFixing(true)
        setFixResult(null)
        try {
            const res = await fetch("/api/debug-login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ input: debugInput }),
            })
            const data = await res.json()
            setFixResult(data)
            // Re-run debug after fix
            const res2 = await fetch(`/api/debug-login?input=${encodeURIComponent(debugInput)}`)
            const data2 = await res2.json()
            setDebugResult(data2)
        } catch (e: any) {
            setFixResult({ error: e.message })
        } finally {
            setFixing(false)
        }
    }

    const handleBulkFix = async () => {
        if (!confirm("This will make sure every employee has an active login. No passwords are set — employees sign in with an OTP. Continue?")) return
        setBulkFixing(true)
        setBulkResult(null)
        try {
            // Single server-side API call — fast, no loop
            const res = await fetch("/api/admin/bulk-fix-logins", { method: "POST" })
            const data = await res.json()
            setBulkResult(data)
        } catch (e: any) {
            setBulkResult({ error: e.message })
        } finally {
            setBulkFixing(false)
        }
    }

    return (
        <div className="w-full min-w-0 max-w-3xl mx-auto p-4 sm:p-8">
            <h1 className="text-2xl font-bold text-[var(--text)] mb-2">Admin Tools</h1>
            <p className="text-sm text-[var(--text3)] mb-8">Employee login diagnostic & fix tools</p>

            {/* Debug Single Employee */}
            <div className="bg-white border border-[var(--border)] rounded-[12px] p-4 sm:p-6 mb-6 min-w-0">
                <h2 className="text-[15px] font-semibold text-[var(--text)] mb-1 flex items-center gap-2"><Search size={16} className="shrink-0 text-[var(--accent)]" /> Check Employee Login</h2>
                <p className="text-[12px] text-[var(--text3)] mb-4">Enter a phone number, Employee ID or email</p>
                <div className="flex flex-wrap gap-2 mb-4">
                    <input
                        type="text"
                        value={debugInput}
                        onChange={e => setDebugInput(e.target.value)}
                        placeholder="9322059808 or EMP001"
                        className="w-full sm:w-auto sm:flex-1 min-w-0 border border-[var(--border)] rounded-[8px] px-3 py-2 text-[13px] focus:outline-none focus:border-[var(--accent)]"
                    />
                    <button
                        onClick={handleDebug}
                        disabled={loading || !debugInput}
                        className="flex-1 sm:flex-none px-4 py-2 bg-[var(--accent)] text-white rounded-[8px] text-[13px] font-medium disabled:opacity-50"
                    >
                        {loading ? "Checking..." : "Check"}
                    </button>
                    <button
                        onClick={handleFix}
                        disabled={fixing || !debugInput}
                        className="flex-1 sm:flex-none px-4 py-2 bg-amber-500 text-white rounded-[8px] text-[13px] font-medium disabled:opacity-50"
                    >
                        {fixing ? "Resetting..." : "Reset Login"}
                    </button>
                </div>

                {debugResult && (
                    <div className="bg-[var(--surface2)] border border-[var(--border)] rounded-[8px] p-4">
                        <p className="text-[12px] font-bold text-[var(--text)] mb-2">Results for: {debugResult.input}</p>
                        {debugResult.checks?.map((c: any, i: number) => (
                            <div key={i} className={`mb-2 p-2 rounded-[6px] text-[12px] ${c.found || c.hasUser ? "bg-green-50 border border-green-200" : "bg-red-50 border border-red-200"}`}>
                                <p className="font-semibold">{c.step}</p>
                                <pre className="text-[11px] mt-1 whitespace-pre-wrap break-all">{JSON.stringify(c, null, 2)}</pre>
                            </div>
                        ))}
                        {debugResult.error && <p className="text-red-500 text-[12px]">{debugResult.error}</p>}
                    </div>
                )}

                {fixResult && (
                    <div className={`mt-3 p-3 rounded-[8px] text-[12px] ${fixResult.success ? "bg-green-50 border border-green-200 text-green-800" : "bg-red-50 border border-red-200 text-red-800"}`}>
                        {fixResult.success ? (
                            <>
                                <p className="font-bold flex items-center gap-1.5"><CheckCircle2 size={14} className="shrink-0" /> Login Reset</p>
                                <p>Login ID: <strong>{fixResult.loginInput}</strong></p>
                                <p>{fixResult.next}</p>
                                <p>
                                    Custom Role: <strong>{fixResult.user?.customRoleName || "None (Field Worker)"}</strong>
                                </p>
                            </>
                        ) : (
                            <p className="flex items-center gap-1.5"><XCircle size={14} className="shrink-0" /> {fixResult.error}</p>
                        )}
                    </div>
                )}
            </div>

            {/* Fix Custom Role Users (MIS Executive, HR Recruiter, etc.) */}
            <div className="bg-white border border-purple-200 rounded-[12px] p-4 sm:p-6 mb-6 min-w-0">
                <h2 className="text-[15px] font-semibold text-[var(--text)] mb-1 flex items-center gap-2"><ShieldCheck size={16} className="shrink-0 text-purple-600" /> Fix Custom Role Dashboard Access</h2>
                <p className="text-[12px] text-[var(--text3)] mb-1">
                    Upgrades users who hold a custom role — MIS Executive, HR Recruiter and the like — but are still on
                    <strong> INSPECTION_BOY</strong>, moving them to <strong>MANAGER</strong> level.
                </p>
                <p className="text-[12px] text-amber-600 mb-4 flex items-start gap-1.5">
                    <AlertTriangle size={14} className="shrink-0 mt-[1px]" />
                    <span>Only users who already have a custom role assigned are affected — plain field workers are left untouched.</span>
                </p>
                <button
                    onClick={async () => {
                        if (!confirm("Upgrade INSPECTION_BOY users who have a custom role to MANAGER level?")) return
                        setRoleFixing(true)
                        setRoleFixResult(null)
                        try {
                            const res = await fetch("/api/admin/fix-custom-role-users", { method: "POST" })
                            const data = await res.json()
                            setRoleFixResult(data)
                        } catch (e: any) {
                            setRoleFixResult({ error: e.message })
                        } finally {
                            setRoleFixing(false)
                        }
                    }}
                    disabled={roleFixing}
                    className="px-5 py-2.5 bg-purple-600 text-white rounded-[8px] text-[13px] font-medium disabled:opacity-50"
                >
                    {roleFixing ? "Fixing..." : "Fix Custom Role Users"}
                </button>

                {roleFixResult && (
                    <div className={`mt-4 p-3 rounded-[8px] text-[12px] ${roleFixResult.error ? "bg-red-50 border border-red-200 text-red-800" : "bg-purple-50 border border-purple-200 text-purple-800"}`}>
                        {roleFixResult.error
                            ? <p className="flex items-center gap-1.5"><XCircle size={14} className="shrink-0" /> {roleFixResult.error}</p>
                            : <><p className="font-bold flex items-center gap-1.5"><CheckCircle2 size={14} className="shrink-0" /> Done!</p><p>{roleFixResult.message}</p><p className="mt-1 text-[11px] text-purple-600">Users must sign in again for the new session to take effect.</p></>
                        }
                    </div>
                )}
            </div>

            {/* Bulk Fix */}
            <div className="bg-white border border-[var(--border)] rounded-[12px] p-4 sm:p-6 min-w-0">
                <h2 className="text-[15px] font-semibold text-[var(--text)] mb-1 flex items-center gap-2"><Zap size={16} className="shrink-0 text-red-600" /> Bulk Fix All Employee Logins</h2>
                <p className="text-[12px] text-[var(--text3)] mb-4">
                    Sabhi employees ke liye active login ensure karega. Koi password set nahi hota — employees OTP se sign in karke MPIN set karenge.
                </p>
                <button
                    onClick={handleBulkFix}
                    disabled={bulkFixing}
                    className="px-5 py-2.5 bg-red-600 text-white rounded-[8px] text-[13px] font-medium disabled:opacity-50"
                >
                    {bulkFixing ? "Fixing all employees..." : "Bulk Fix All Logins"}
                </button>

                {bulkResult && (
                    <div className="mt-4 bg-[var(--surface2)] border border-[var(--border)] rounded-[8px] p-4 text-[12px]">
                        {bulkResult.error ? (
                            <p className="text-red-500 flex items-center gap-1.5"><XCircle size={14} className="shrink-0" /> {bulkResult.error}</p>
                        ) : (
                            <>
                                <p className="font-bold text-green-700 flex items-center gap-1.5"><CheckCircle2 size={14} className="shrink-0" /> Bulk Fix Complete</p>
                                <p>Total: {bulkResult.total} | Fixed: {bulkResult.fixed} | Failed: {bulkResult.failed}</p>
                                {bulkResult.errors?.length > 0 && (
                                    <div className="mt-2">
                                        <p className="font-semibold text-red-600">Errors:</p>
                                        {bulkResult.errors.map((e: string, i: number) => <p key={i} className="text-red-500">{e}</p>)}
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}
