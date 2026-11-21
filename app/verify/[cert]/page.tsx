"use client"

// Public certificate check — where the QR code on a Growus training
// certificate leads. Shows whether it is genuine and still valid.
import { useEffect, useState } from "react"
import { useParams, useSearchParams } from "next/navigation"
import { BadgeCheck, Loader2, ShieldAlert } from "lucide-react"
import { COMPANY } from "@/lib/company"

export default function VerifyCertificatePage() {
    const { cert } = useParams<{ cert: string }>()
    const k = useSearchParams().get("k")
    const [d, setD] = useState<any>(null)
    const [err, setErr] = useState<string | null>(null)
    useEffect(() => {
        fetch(`/api/verify/certificate?c=${encodeURIComponent(decodeURIComponent(String(cert)))}&k=${encodeURIComponent(k ?? "")}`)
            .then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j?.error || "Certificate not found"); setD(j) })
            .catch(e => setErr(e.message))
    }, [cert, k])
    const fmt = (v?: string | null) => (v ? new Date(v).toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" }) : "—")
    const tone = d?.state === "valid" ? "text-[#15803d] bg-[#f0fdf4] border-[#bbf7d0]" : "text-[#b45309] bg-[#fffbeb] border-[#fde68a]"
    return (
        <div className="min-h-screen bg-[#f6f7fb] flex items-center justify-center p-4">
            <div className="w-full max-w-md bg-white border border-[#e5e7eb] rounded-[16px] p-6 text-center">
                <p className="text-[12px] font-semibold uppercase tracking-wider text-[#6b7280]">{COMPANY.name} · Training certificate</p>
                {!d && !err && <Loader2 className="mx-auto mt-6 h-6 w-6 animate-spin text-[#9ca3af]" />}
                {err && (<>
                    <ShieldAlert className="mx-auto mt-5 h-12 w-12 text-[#dc2626]" />
                    <p className="mt-2 text-[16px] font-semibold text-[#111827]">Not a valid certificate</p>
                    <p className="text-[13px] text-[#6b7280]">This code doesn&apos;t match a certificate we issued. Please contact {COMPANY.name}.</p>
                </>)}
                {d && (<>
                    <BadgeCheck className={`mx-auto mt-5 h-12 w-12 ${d.state === "valid" ? "text-[#15803d]" : "text-[#b45309]"}`} />
                    <p className="mt-2 text-[18px] font-bold text-[#111827]">{d.name}</p>
                    <p className="text-[14px] text-[#374151]">completed <b>{d.course}</b></p>
                    <div className={`mt-4 inline-block rounded-full border px-3 py-1 text-[12.5px] font-semibold ${tone}`}>
                        {d.state === "valid" ? "Genuine and valid" : d.state === "expired" ? "Genuine — expired, refresher due" : "Genuine — refresher in progress"}
                    </div>
                    <div className="mt-4 text-[12.5px] text-[#6b7280] space-y-0.5">
                        <p>Certificate {d.certificate}</p>
                        <p>Issued {fmt(d.issuedAt)}{d.validUntil ? ` · valid until ${fmt(d.validUntil)}` : ""}</p>
                    </div>
                </>)}
            </div>
        </div>
    )
}
