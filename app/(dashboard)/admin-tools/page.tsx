"use client"

import { useState } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"

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
        if (!confirm("Yeh sabhi employees ke login fix karega (password = phone number). Continue?")) return
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
        <div className="p-8 max-w-3xl mx-auto">
            <h1 className="text-2xl font-bold text-[#1a1a18] mb-2">Admin Tools</h1>
            <p className="text-sm text-[#9e9b95] mb-8">Employee login diagnostic & fix tools</p>

            {/* Debug Single Employee */}
            <div className="bg-white border border-[#e8e6e1] rounded-[12px] p-6 mb-6">
                <h2 className="text-[15px] font-semibold text-[#1a1a18] mb-1">🔍 Check Employee Login</h2>
                <p className="text-[12px] text-[#9e9b95] mb-4">Phone number, Employee ID, ya email enter karo</p>
                <div className="flex gap-2 mb-4">
                    <input
                        type="text"
                        value={debugInput}
                        onChange={e => setDebugInput(e.target.value)}
                        placeholder="9322059808 ya EMP001"
                        className="flex-1 border border-[#e8e6e1] rounded-[8px] px-3 py-2 text-[13px] focus:outline-none focus:border-[#1a9e6e]"
                    />
                    <button
                        onClick={handleDebug}
                        disabled={loading || !debugInput}
                        className="px-4 py-2 bg-[#1a9e6e] text-white rounded-[8px] text-[13px] font-medium disabled:opacity-50"
                    >
                        {loading ? "Checking..." : "Check"}
                    </button>
                    <button
                        onClick={handleFix}
                        disabled={fixing || !debugInput}
                        className="px-4 py-2 bg-amber-500 text-white rounded-[8px] text-[13px] font-medium disabled:opacity-50"
                    >
                        {fixing ? "Fixing..." : "Fix Login"}
                    </button>
                </div>

                {debugResult && (
                    <div className="bg-[#f9f8f5] border border-[#e8e6e1] rounded-[8px] p-4">
                        <p className="text-[12px] font-bold text-[#1a1a18] mb-2">Results for: {debugResult.input}</p>
                        {debugResult.checks?.map((c: any, i: number) => (
                            <div key={i} className={`mb-2 p-2 rounded-[6px] text-[12px] ${c.found || c.hasUser ? "bg-green-50 border border-green-200" : "bg-red-50 border border-red-200"}`}>
                                <p className="font-semibold">{c.step}</p>
                                <pre className="text-[11px] mt-1 whitespace-pre-wrap">{JSON.stringify(c, null, 2)}</pre>
                            </div>
                        ))}
                        {debugResult.error && <p className="text-red-500 text-[12px]">{debugResult.error}</p>}
                    </div>
                )}

                {fixResult && (
                    <div className={`mt-3 p-3 rounded-[8px] text-[12px] ${fixResult.success ? "bg-green-50 border border-green-200 text-green-800" : "bg-red-50 border border-red-200 text-red-800"}`}>
                        {fixResult.success ? (
                            <>
                                <p className="font-bold">✅ Login Fixed!</p>
                                <p>Login: <strong>{fixResult.loginInput}</strong></p>
                                <p>Password: <strong>{fixResult.loginPassword}</strong></p>
                                <p>Email: {fixResult.user?.email}</p>
                                <p>Role: {fixResult.user?.role}</p>
                            </>
                        ) : (
                            <p>❌ {fixResult.error}</p>
                        )}
                    </div>
                )}
            </div>

            {/* Bulk Fix */}
            <div className="bg-white border border-[#e8e6e1] rounded-[12px] p-6">
                <h2 className="text-[15px] font-semibold text-[#1a1a18] mb-1">⚡ Bulk Fix All Employee Logins</h2>
                <p className="text-[12px] text-[#9e9b95] mb-4">
                    Sabhi active employees ke login fix karega. Password = unka phone number hoga.
                </p>
                <button
                    onClick={handleBulkFix}
                    disabled={bulkFixing}
                    className="px-5 py-2.5 bg-red-600 text-white rounded-[8px] text-[13px] font-medium disabled:opacity-50"
                >
                    {bulkFixing ? "Fixing all employees..." : "Bulk Fix All Logins"}
                </button>

                {bulkResult && (
                    <div className="mt-4 bg-[#f9f8f5] border border-[#e8e6e1] rounded-[8px] p-4 text-[12px]">
                        {bulkResult.error ? (
                            <p className="text-red-500">❌ {bulkResult.error}</p>
                        ) : (
                            <>
                                <p className="font-bold text-green-700">✅ Bulk Fix Complete</p>
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
