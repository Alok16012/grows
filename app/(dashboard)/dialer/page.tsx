"use client"

// Call Dialer: telecalling for sales leads, candidates and employees. Calls are placed by
// each person's paired Android phone (Growus Dialer app) and sync back here with talk time.
import { Suspense, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Loader2 } from "lucide-react"
import { Dashboard } from "@/components/dialer/Dashboard"
import { MyCalls } from "@/components/dialer/MyCalls"
import { CallLog } from "@/components/dialer/CallLog"
import { SalesLeads } from "@/components/dialer/SalesLeads"
import { PhoneSetup } from "@/components/dialer/PhoneSetup"
import { SettingsPanel } from "@/components/dialer/SettingsPanel"

type Meta = { me: string; name: string; canUse: boolean; canSeeTeam: boolean; canEditAny: boolean; canSales: boolean; canExport: boolean; appUrl: string }
declare global { interface Window { GrowusDialerPairing?: { hasToken: () => boolean; setToken: (token: string, name: string) => void; deviceName?: () => string; appVersion?: () => string } } }

export default function DialerPage() {
    return <Suspense fallback={null}><Dialer /></Suspense>
}

function Dialer() {
    const sp = useSearchParams()
    const router = useRouter()
    const [meta, setMeta] = useState<Meta | null>(null)
    const [paired, setPaired] = useState("")
    useEffect(() => { fetch("/api/dialer/meta").then(r => r.json()).then(setMeta).catch(() => {}) }, [])
    // Inside the Growus Dialer app: pair this phone to the signed-in login once.
    useEffect(() => {
        const bridge = typeof window !== "undefined" ? window.GrowusDialerPairing : undefined
        if (!bridge || !meta?.canUse) return
        let has = false
        try { has = bridge.hasToken() } catch {}
        if (has && sp.get("pair") !== "1") return
        fetch("/api/dialer/device/pair", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ deviceName: bridge.deviceName?.(), appVersion: bridge.appVersion?.() }) })
            .then(r => r.json()).then(j => { if (j.token) { bridge.setToken(j.token, j.name ?? ""); setPaired("This phone is paired. Calls now sync to the ERP.") } }).catch(() => {})
    }, [meta, sp])
    if (!meta) return <div className="p-10 flex justify-center"><Loader2 className="animate-spin text-[var(--text3)]" /></div>
    if (!meta.canUse) return <div className="max-w-[700px] mx-auto p-6 text-[13.5px] text-[var(--text2)]">The Call Dialer is not turned on for your login. Ask your admin for the <b>Call Dialer → Create</b> permission.</div>
    const tabs: [string, string][] = [
        ["my", "My calls"],
        ["dashboard", meta.canSeeTeam ? "Team performance" : "My performance"],
        ["calls", "Call log"],
        ...(meta.canSales ? [["leads", "Sales leads"] as [string, string]] : []),
        ["phone", "My phone"],
        ...(meta.canEditAny || meta.canSeeTeam ? [["settings", "Settings"] as [string, string]] : []),
    ]
    const tab = tabs.some(t => t[0] === sp.get("tab")) ? sp.get("tab")! : (meta.canSeeTeam ? "dashboard" : "my")
    return (
        <div className="max-w-[1300px] mx-auto p-4 md:p-6 space-y-4">
            <div>
                <h1 className="text-[22px] font-bold text-[var(--text)]">Call Dialer</h1>
                <p className="text-[12.5px] text-[var(--text3)]">Click Call and your phone dials. Every call syncs here with its talk time and outcome.</p>
            </div>
            {paired && <div className="rounded-[10px] border border-green-200 bg-green-50 px-3 py-2 text-[13px] text-green-800">{paired}</div>}
            <div className="flex gap-1 border-b border-[var(--border)] overflow-x-auto overflow-y-hidden">
                {tabs.map(([k, l]) => <button key={k} onClick={() => router.replace(`/dialer?tab=${k}`)} className={`px-3 py-2 text-[13px] font-semibold whitespace-nowrap border-b-2 -mb-px ${tab === k ? "border-[var(--accent)] text-[var(--accent)]" : "border-transparent text-[var(--text3)] hover:text-[var(--text)]"}`}>{l}</button>)}
            </div>
            {tab === "my" && <MyCalls />}
            {tab === "dashboard" && <Dashboard defaultView={meta.canSeeTeam ? "team" : "mine"} />}
            {tab === "calls" && <CallLog canSeeTeam={meta.canSeeTeam} canExport={meta.canExport} />}
            {tab === "leads" && <SalesLeads canExport={meta.canExport} />}
            {tab === "phone" && <PhoneSetup me={meta.me} canSeeTeam={meta.canSeeTeam} appUrl={meta.appUrl} />}
            {tab === "settings" && <SettingsPanel />}
        </div>
    )
}
