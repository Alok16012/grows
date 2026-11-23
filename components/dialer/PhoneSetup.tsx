"use client"

// Pairing a phone with the Growus Dialer app, my phone's status, and (team) every paired phone.
import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { Download, Smartphone } from "lucide-react"

type Dev = { id: string; userId: string; name: string; deviceName: string | null; appVersion: string | null; lastSeenAt: string | null; lastSyncAt: string | null; createdAt: string }
const when = (s: string | null) => s ? new Date(s).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "never"
const online = (s: string | null) => !!s && Date.now() - new Date(s).getTime() < 3 * 60_000

/** QR for the app download: scanned with the phone camera it opens in the phone's browser. */
function AppQr({ url }: { url: string }) {
    const [img, setImg] = useState("")
    const full = url.startsWith("http") ? url : `${typeof window !== "undefined" ? window.location.origin : ""}${url}`
    useEffect(() => {
        (async () => { const QR: any = await import("qrcode"); const toUrl = QR.toDataURL ?? QR.default?.toDataURL; setImg(await toUrl(full, { margin: 1, width: 360 })) })().catch(() => {})
    }, [full])
    return (
        <div className="shrink-0 text-center">
            {img ? <img src={img} alt="QR code to download the Growus Dialer app" className="w-[170px] h-[170px] rounded-[8px] border border-[var(--border)]" /> : <div className="w-[170px] h-[170px] rounded-[8px] bg-gray-50" />}
            <div className="text-[11px] text-[var(--text3)] mt-1 max-w-[170px] break-all">Scan with your phone camera</div>
        </div>
    )
}

export function PhoneSetup({ me, canSeeTeam, appUrl }: { me: string; canSeeTeam: boolean; appUrl: string }) {
    const [devs, setDevs] = useState<Dev[] | null>(null)
    const [canEdit, setCanEdit] = useState(false)
    const load = useCallback(() => fetch("/api/dialer/devices").then(r => r.json()).then(j => { setDevs(j.devices ?? []); setCanEdit(!!j.canEdit) }).catch(() => setDevs([])), [])
    useEffect(() => { load() }, [load])
    const unpair = async (id: string) => {
        if (!confirm("Unpair this phone? It stops syncing calls until someone signs in on it again.")) return
        const r = await fetch(`/api/dialer/devices?id=${id}`, { method: "DELETE" })
        if (r.ok) { toast.success("Unpaired"); load() } else toast.error("Could not unpair")
    }
    const mine = devs?.find(d => d.userId === me)
    return (
        <div className="space-y-4 max-w-[900px]">
            <div className="rounded-[12px] border border-[var(--border)] bg-white p-4">
                <h3 className="text-[14px] font-bold flex items-center gap-1.5"><Smartphone size={15} /> My phone</h3>
                {mine ? (
                    <div className="mt-2 flex items-center justify-between gap-3 flex-wrap text-[13px]">
                        <div><span className={`inline-block w-2 h-2 rounded-full mr-1.5 ${online(mine.lastSeenAt) ? "bg-green-500" : "bg-gray-400"}`} /><b>{mine.deviceName || "Phone"}</b> · {online(mine.lastSeenAt) ? "online" : `last seen ${when(mine.lastSeenAt)}`} · last sync {when(mine.lastSyncAt)}{mine.appVersion ? ` · app ${mine.appVersion}` : ""}</div>
                        <button onClick={() => unpair(mine.id)} className="h-8 px-3 rounded-[8px] border border-[var(--border)] text-[12px] font-semibold">Unpair</button>
                    </div>
                ) : <p className="mt-2 text-[13px] text-amber-700">No phone paired yet. Follow the steps below.</p>}
            </div>
            <div className="rounded-[12px] border border-[var(--border)] bg-white p-4 text-[13px] text-[var(--text2)] flex flex-col md:flex-row gap-5">
                {appUrl && <AppQr url={appUrl} />}
                <div className="flex-1">
                <h3 className="text-[14px] font-bold text-[var(--text)] mb-2">Pair a phone (once)</h3>
                <ol className="list-decimal pl-5 space-y-1.5">
                    <li>Install the <b>Growus Dialer</b> app on your Android phone. {appUrl ? <>Scan the QR code with the phone camera, or on the phone open <a href={appUrl} download="growus-dialer.apk" className="text-[var(--accent)] font-semibold inline-flex items-center gap-1"><Download size={12} /> this download link</a>.</> : "(Ask your admin for the app file.)"}
                        <ul className="list-disc pl-5 mt-1 text-[12px] text-[var(--text3)] space-y-0.5">
                            <li>Open it in <b>Chrome</b>, not inside WhatsApp or the Growus employee app (those can&apos;t download apps).</li>
                            <li>If Chrome says the file may be harmful, tap <b>Download anyway</b>. Then open it from Chrome ⋮ → <b>Downloads</b>.</li>
                            <li>Allow <b>Install unknown apps</b> for Chrome when asked. If Play Protect warns you, tap <b>More details → Install anyway</b>.</li>
                        </ul>
                    </li>
                    <li>Open it and sign in with your ERP login.</li>
                    <li>Allow <b>Phone</b> and <b>Call logs</b> when asked, and allow notifications. The app pairs itself and shows &quot;Dialer on&quot; in the notification bar.</li>
                    <li>Done. Click <b>Call</b> anywhere in the ERP (sales leads, candidates, employees) and your phone dials. Every call you make or receive on that phone, even outside the app, syncs here with its talk time.</li>
                </ol>
                <p className="mt-3 text-[12px] text-[var(--text3)]">Only calls are synced: number, time, direction and duration. There are no recordings, SMS or contacts. Calls to numbers that are not in the ERP show as &quot;Unknown number&quot; (this can be switched off in Settings).</p>
                </div>
            </div>
            {canSeeTeam && (
                <div className="rounded-[12px] border border-[var(--border)] bg-white overflow-x-auto">
                    <h3 className="px-4 pt-3 text-[14px] font-bold">Paired phones ({devs?.length ?? 0})</h3>
                    <table className="w-full text-[12.5px] mt-2">
                        <thead><tr className="text-left text-[11px] uppercase text-[var(--text3)] border-b border-[var(--border)]">{["Person", "Phone", "Status", "Last sync", "Paired", ""].map(h => <th key={h} className="px-4 py-2 font-semibold">{h}</th>)}</tr></thead>
                        <tbody>
                            {(devs ?? []).map(d => (
                                <tr key={d.id} className="border-b border-[var(--border)]">
                                    <td className="px-4 py-2 font-semibold">{d.name}</td>
                                    <td className="px-4 py-2">{d.deviceName || "—"}{d.appVersion ? <span className="text-[var(--text3)]"> · {d.appVersion}</span> : null}</td>
                                    <td className="px-4 py-2"><span className={`inline-block w-2 h-2 rounded-full mr-1.5 ${online(d.lastSeenAt) ? "bg-green-500" : "bg-gray-400"}`} />{online(d.lastSeenAt) ? "Online" : `Seen ${when(d.lastSeenAt)}`}</td>
                                    <td className="px-4 py-2">{when(d.lastSyncAt)}</td>
                                    <td className="px-4 py-2">{when(d.createdAt)}</td>
                                    <td className="px-4 py-2">{(canEdit || d.userId === me) && <button onClick={() => unpair(d.id)} className="text-[12px] underline text-[var(--text3)]">Unpair</button>}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    )
}
