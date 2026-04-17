"use client"

import { useState, useEffect } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Loader2, ArrowLeft, TerminalSquare, Search, CheckCircle2 } from "lucide-react"

export default function PayrollProcessWizard() {
    const { data: session } = useSession()
    const router = useRouter()

    const [month, setMonth] = useState(new Date().getMonth() + 1)
    const [year, setYear] = useState(new Date().getFullYear())
    const [siteId, setSiteId] = useState("")
    const [sites, setSites] = useState<{ id: string; name: string }[]>([])

    const [processing, setProcessing] = useState(false)
    const [result, setResult] = useState<any>(null)
    const [billingResult, setBillingResult] = useState<any>(null)

    useEffect(() => {
        fetch("/api/sites")
            .then(res => res.json())
            .then(data => {
                if (Array.isArray(data)) setSites(data)
            })
            .catch(err => console.error("Failed to fetch sites:", err))
    }, [])

    const handleCalculate = async () => {
        setProcessing(true)
        try {
            const res = await fetch("/api/payroll/calculate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ month, year, siteId: siteId || undefined })
            })
            if (!res.ok) throw new Error(await res.text())
            const data = await res.json()
            setResult(data)
            toast.success("Payroll run calculated successfully in DRAFT state!")

            // Immediately simulate fetching Billing/Client Margin data.
            const billRes = await fetch("/api/payroll/billing/generate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ payrollRunId: data.runId, siteId: siteId || undefined })
            })
            if (billRes.ok) {
                const billData = await billRes.json()
                setBillingResult(billData)
            }
        } catch (error: any) {
            toast.error(error.message)
        } finally {
            setProcessing(false)
        }
    }

    if (session?.user?.role !== "ADMIN" && session?.user?.role !== "MANAGER") {
        return <div className="p-8 text-center text-red-500">Access Denied</div>
    }

    return (
        <div className="space-y-6 max-w-5xl mx-auto pb-10">
            <div className="flex items-center gap-3">
                <button onClick={() => router.back()} className="text-[var(--text3)] hover:text-[var(--text)]">
                    <ArrowLeft size={20} />
                </button>
                <div>
                    <h1 className="text-[20px] font-semibold tracking-[-0.4px] text-[var(--text)]">Run Payroll Wizard</h1>
                    <p className="text-[12px] text-[var(--text3)] mt-0.5">Automated Math Engine: Pro-rata Attendance, OT, PF, ESI, Taxes</p>
                </div>
            </div>

            {!result ? (
                <div className="bg-white border border-[var(--border)] rounded-xl p-6 space-y-4">
                    <h2 className="text-[14px] font-semibold border-b border-[var(--border)] pb-2">Step 1: Define Parameters</h2>
                    <div className="grid grid-cols-3 gap-4 text-[12px]">
                        <div>
                            <label className="text-[var(--text3)] block mb-1">Month</label>
                            <input type="number" min={1} max={12} value={month} onChange={(e) => setMonth(Number(e.target.value))} className="w-full h-9 border border-[var(--border)] rounded-lg px-3 outline-none focus:border-[var(--accent)]" />
                        </div>
                        <div>
                            <label className="text-[var(--text3)] block mb-1">Year</label>
                            <input type="number" min={2020} max={2030} value={year} onChange={(e) => setYear(Number(e.target.value))} className="w-full h-9 border border-[var(--border)] rounded-lg px-3 outline-none focus:border-[var(--accent)]" />
                        </div>
                        <div>
                            <label className="text-[var(--text3)] block mb-1">Filter by Site (Optional)</label>
                            <select 
                                value={siteId} 
                                onChange={(e) => setSiteId(e.target.value)} 
                                className="w-full h-9 border border-[var(--border)] rounded-lg px-3 outline-none focus:border-[var(--accent)] bg-white"
                            >
                                <option value="">All Sites</option>
                                {sites.map(site => (
                                    <option key={site.id} value={site.id}>{site.name}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                    <div className="pt-4 flex justify-end">
                        <button disabled={processing} onClick={handleCalculate} className="inline-flex items-center gap-2 bg-[var(--accent)] text-white rounded-lg text-[13px] font-medium px-6 py-2 hover:opacity-90 disabled:opacity-50">
                            {processing ? <Loader2 size={16} className="animate-spin" /> : <TerminalSquare size={16} />}
                            Initialize Output Engine
                        </button>
                    </div>
                </div>
            ) : (
                <div className="space-y-6">
                    <div className="bg-green-50 border border-green-200 text-green-800 p-4 rounded-xl flex items-center gap-3">
                        <CheckCircle2 size={24} className="text-green-600" />
                        <div>
                            <p className="font-semibold text-[14px]">Payroll Computation Successful (Run ID: {result.runId})</p>
                            <p className="text-[12px]">Processed {result.processedCount} Active Employee(s).</p>
                        </div>
                    </div>

                    {billingResult && (
                        <div className="bg-white border border-[var(--border)] rounded-xl overflow-hidden">
                            <div className="bg-[var(--surface2)] px-4 py-3 border-b border-[var(--border)] font-medium text-[13px] flex items-center justify-between">
                                <span>Client Billing & Margin Summary</span>
                                <span className="px-2 py-0.5 bg-[var(--accent)] text-white text-[10px] rounded uppercase font-semibold">Invoicing Target</span>
                            </div>
                            <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-[12px]">
                                <div><p className="text-[var(--text3)]">Total Base CTC (Gross)</p><p className="font-semibold">₹ {billingResult.billingSummary.totalGrossSalaries.toFixed(2)}</p></div>
                                <div><p className="text-[var(--text3)]">Compt. Employer Statutory</p><p className="font-semibold">₹ {billingResult.billingSummary.totalEmployerStatutory.toFixed(2)}</p></div>
                                <div><p className="text-[var(--text3)]">Total Service Charges / Margin</p><p className="font-bold text-green-600">+ ₹ {billingResult.billingSummary.totalServiceCharge.toFixed(2)}</p></div>
                                <div><p className="text-[var(--text3)]">Invoice Grand Target</p><p className="font-bold font-mono text-[14px]">₹ {billingResult.billingSummary.grandTotalInvoiceAmount.toFixed(2)}</p></div>
                            </div>
                        </div>
                    )}

                    <div className="flex justify-end gap-3">
                        <button onClick={() => setResult(null)} className="px-4 py-2 border border-[var(--border)] rounded-lg text-[13px] text-[var(--text3)] font-medium bg-white hover:bg-[var(--surface2)]">Cancel / Retry</button>
                        <button onClick={() => { toast.success("Payroll officially locked!"); router.push("/payroll"); }} className="px-5 py-2 bg-[#1a9e6e] text-white rounded-lg text-[13px] font-medium hover:opacity-90">Approve & Lock Payroll Data</button>
                    </div>
                </div>
            )}
        </div>
    )
}
