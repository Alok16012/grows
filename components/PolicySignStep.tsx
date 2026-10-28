"use client"
// Policy sign-off step: read each required policy to the end, then sign it.
//
// Used by the joining form (onboarding link, dark theme), self-onboarding and
// the profile "My Policies" tab (light theme). The server enforces every rule —
// reached-the-end, agree box, name match, current version — this screen only
// mirrors them so the employee knows what's missing.
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { CheckCircle2, Circle, Eye, FileSignature, Loader2, Paperclip, PenLine, RotateCcw, Download, ArrowDown } from "lucide-react"
import { policyBlocks, type RequiredPolicy } from "@/lib/policy-text"

// The token (joining) screens always get the Onboarding category. A logged-in
// employee gets everything (My Policies) unless the screen asks for "onboarding".
type Source =
    | { kind: "token"; token: string; designation: string }
    | { kind: "self"; scope?: "onboarding" }

type ListResponse = { ready: boolean; designation?: string | null; signerName?: string; policies: RequiredPolicy[] }

export type PolicyProgress = { ready: boolean; total: number; signed: number; allSigned: boolean; loading: boolean }

const THEMES = {
    dark: {
        card: "#111120", panel: "rgba(255,255,255,0.03)", border: "rgba(255,255,255,0.08)", text: "#ffffff", text2: "#d1d5db",
        muted: "#6b7280", accent: "#6366f1", accentSoft: "rgba(99,102,241,0.12)", accentText: "#a5b4fc",
        ok: "#4ade80", okSoft: "rgba(34,197,94,0.1)", warn: "#fbbf24", warnSoft: "rgba(234,179,8,0.08)", err: "#f87171",
        input: "rgba(255,255,255,0.05)", reader: "#0d0d18",
    },
    light: {
        card: "var(--surface)", panel: "var(--surface2)", border: "var(--border)", text: "var(--text)", text2: "var(--text2)",
        muted: "var(--text3)", accent: "var(--accent)", accentSoft: "var(--accent-light, rgba(99,102,241,0.08))", accentText: "var(--accent)",
        ok: "#16a34a", okSoft: "#f0fdf4", warn: "#b45309", warnSoft: "#fffbeb", err: "#dc2626",
        input: "var(--surface)", reader: "var(--surface)",
    },
} as const

function api(source: Source, path: string) {
    return source.kind === "token"
        ? `/api/external/onboarding/${source.token}/policies${path}`
        : `/api/me/policies${path}`
}

async function readError(res: Response) {
    const raw = await res.text()
    try { const j = JSON.parse(raw); return { code: j.code as string | undefined, message: (j.message || j.error || raw) as string } }
    catch { return { code: undefined, message: raw || `Request failed (${res.status})` } }
}

const fmt = (iso: string | null) => iso ? new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : ""

export function PolicySignStep({ source, theme = "light", onProgress, emptyDesignationHint }: {
    source: Source
    theme?: "dark" | "light"
    onProgress?: (p: PolicyProgress) => void
    /** Shown when the joiner hasn't entered a designation yet. */
    emptyDesignationHint?: string
}) {
    const t = THEMES[theme]
    const [data, setData] = useState<ListResponse | null>(null)
    const [loading, setLoading] = useState(true)
    const [activeId, setActiveId] = useState<string | null>(null)
    const designation = source.kind === "token" ? source.designation : null
    const token = source.kind === "token" ? source.token : null
    const scope = source.kind === "self" ? source.scope ?? null : null

    const load = useCallback(async (keepActive?: boolean) => {
        setLoading(true)
        try {
            const qs = designation !== null ? `?designation=${encodeURIComponent(designation)}`
                : scope ? `?scope=${scope}` : ""
            const res = await fetch(api(source, qs), { cache: "no-store" })
            if (!res.ok) throw new Error((await readError(res)).message)
            const d: ListResponse = await res.json()
            setData(d)
            setActiveId(prev => {
                if (keepActive && prev && d.policies.some(p => p.policyId === prev)) return prev
                return (d.policies.find(p => p.status !== "SIGNED") ?? d.policies[0])?.policyId ?? null
            })
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Couldn't load policies")
            setData({ ready: true, policies: [] })
        } finally {
            setLoading(false)
        }
        // `source` is rebuilt by the parent each render; depend on its parts.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [designation, token, scope, source.kind])

    useEffect(() => { load() }, [load])

    const policies = useMemo(() => data?.policies ?? [], [data])
    const signed = policies.filter(p => p.status === "SIGNED").length
    useEffect(() => {
        onProgress?.({
            ready: !!data?.ready, total: policies.length, signed,
            allSigned: !data?.ready || signed === policies.length, loading,
        })
    }, [data, policies.length, signed, loading, onProgress])

    const active = policies.find(p => p.policyId === activeId) ?? null

    const markScrolled = useCallback(async (p: RequiredPolicy) => {
        const res = await fetch(api(source, `/${p.versionId}/scrolled`), {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify(designation !== null ? { designation } : {}),
        })
        if (!res.ok) {
            const err = await readError(res)
            if (err.code === "VERSION_OUTDATED") { toast.error(err.message); load(true); return }
            toast.error(err.message)
            return
        }
        const j = await res.json()
        setData(d => d && ({ ...d, policies: d.policies.map(x => x.versionId === p.versionId && x.status === "TO_READ" ? { ...x, status: "READY", scrolledAt: j.scrolledAt } : x) }))
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [designation, token, source.kind, load])

    // Reload: picks up the server's sign time / record id and moves to the next unsigned policy.
    const onSigned = useCallback(() => { load(false) }, [load])

    if (loading && !data) {
        return <div style={{ display: "flex", alignItems: "center", gap: 10, color: t.muted, fontSize: 13, padding: "24px 0" }}><Loader2 size={16} className="animate-spin" /> Loading policies…</div>
    }
    if (!data?.ready) {
        return <p style={{ fontSize: 13, color: t.muted }}>No policies need your signature right now.</p>
    }
    if (policies.length === 0 && source.kind === "token" && !source.designation.trim()) {
        return (
            <div style={{ padding: "12px 14px", borderRadius: 12, background: t.warnSoft, border: `1px solid ${t.border}`, color: t.warn, fontSize: 13 }}>
                {emptyDesignationHint ?? "Enter your designation first — the policies you sign depend on it."}
            </div>
        )
    }
    if (policies.length === 0) {
        return (
            <div style={{ display: "flex", gap: 10, padding: "14px 16px", borderRadius: 12, background: t.okSoft, border: `1px solid ${t.border}` }}>
                <CheckCircle2 size={18} style={{ color: t.ok, flexShrink: 0 }} />
                <p style={{ fontSize: 13, color: t.text2, margin: 0 }}>
                    No policies need your signature{data.designation ? <> for <b>{data.designation}</b></> : null}. You can continue.
                </p>
            </div>
        )
    }

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {/* Progress */}
            <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, marginBottom: 6 }}>
                    <p style={{ fontSize: 12.5, color: t.text2, margin: 0 }}>
                        Read each policy to the end, then sign it{data.designation ? <> · <span style={{ color: t.muted }}>{data.designation}</span></> : null}
                    </p>
                    <span style={{ fontSize: 12, fontWeight: 700, color: signed === policies.length ? t.ok : t.accentText, whiteSpace: "nowrap" }}>{signed} of {policies.length} signed</span>
                </div>
                <div style={{ height: 6, borderRadius: 99, background: t.panel, border: `1px solid ${t.border}`, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${(signed / policies.length) * 100}%`, background: t.ok, transition: "width .3s" }} />
                </div>
            </div>

            {/* Policy list */}
            <div role="tablist" aria-label="Policies to sign" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {policies.map((p, i) => {
                    const on = p.policyId === activeId
                    const icon = p.status === "SIGNED" ? <CheckCircle2 size={16} style={{ color: t.ok }} />
                        : p.status === "READY" ? <PenLine size={16} style={{ color: t.accentText }} />
                            : <Circle size={16} style={{ color: t.muted }} />
                    const label = p.status === "SIGNED" ? "Signed" : p.status === "READY" ? "Ready to sign" : "To read"
                    return (
                        <button key={p.policyId} role="tab" aria-selected={on} onClick={() => setActiveId(p.policyId)}
                            style={{
                                display: "flex", alignItems: "center", gap: 10, textAlign: "left", width: "100%",
                                padding: "10px 12px", borderRadius: 12, cursor: "pointer",
                                border: `1px solid ${on ? t.accent : t.border}`, background: on ? t.accentSoft : t.panel, color: t.text,
                            }}>
                            {icon}
                            <span style={{ flex: 1, minWidth: 0 }}>
                                <span style={{ display: "block", fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{i + 1}. {p.title}</span>
                                <span style={{ display: "block", fontSize: 11, color: t.muted }}>{p.category ? `${p.category} · ` : ""}v{p.versionNo}</span>
                            </span>
                            <span style={{ fontSize: 11, fontWeight: 600, color: p.status === "SIGNED" ? t.ok : p.status === "READY" ? t.accentText : t.muted, whiteSpace: "nowrap" }}>{label}</span>
                        </button>
                    )
                })}
            </div>

            {active && (
                <PolicyReader key={active.versionId} policy={active} theme={theme} source={source}
                    designation={designation} signerName={data.signerName ?? ""}
                    onReachedEnd={() => markScrolled(active)} onSigned={onSigned} onOutdated={() => load(true)} />
            )}
        </div>
    )
}

function PolicyReader({ policy, theme, source, designation, signerName, onReachedEnd, onSigned, onOutdated }: {
    policy: RequiredPolicy
    theme: "dark" | "light"
    source: Source
    designation: string | null
    signerName: string
    onReachedEnd: () => void
    onSigned: () => void
    onOutdated: () => void
}) {
    const t = THEMES[theme]
    const boxRef = useRef<HTMLDivElement>(null)
    const endRef = useRef<HTMLDivElement>(null)
    const reported = useRef(policy.status !== "TO_READ")
    const [atEnd, setAtEnd] = useState(policy.status !== "TO_READ")
    const blocks = useMemo(() => policyBlocks(policy.content), [policy.content])

    // The end marker becoming visible inside the reader = read to the end.
    // A policy short enough to fit shows the marker at once, which counts.
    useEffect(() => {
        if (!endRef.current || !boxRef.current) return
        const io = new IntersectionObserver(entries => {
            if (entries.some(e => e.isIntersecting)) {
                setAtEnd(true)
                if (!reported.current) { reported.current = true; onReachedEnd() }
            }
        }, { root: boxRef.current, threshold: 0.9 })
        io.observe(endRef.current)
        return () => io.disconnect()
    }, [onReachedEnd])

    return (
        <div style={{ border: `1px solid ${t.border}`, borderRadius: 14, background: t.card, overflow: "hidden" }}>
            <div style={{ padding: "12px 14px", borderBottom: `1px solid ${t.border}` }}>
                <p style={{ fontSize: 15, fontWeight: 700, color: t.text, margin: 0 }}>{policy.title}</p>
                <p style={{ fontSize: 11.5, color: t.muted, margin: "2px 0 0" }}>
                    Version {policy.versionNo}{policy.effectiveFrom ? ` · effective ${new Date(policy.effectiveFrom).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}` : ""}
                    {policy.attachmentUrl && <> · <a href={policy.attachmentUrl} target="_blank" rel="noreferrer" style={{ color: t.accentText, display: "inline-flex", alignItems: "center", gap: 3 }}><Paperclip size={11} /> Attachment</a></>}
                </p>
            </div>

            <div ref={boxRef} tabIndex={0} aria-label={`${policy.title} text`}
                style={{ maxHeight: 360, overflowY: "auto", padding: "14px 16px", background: t.reader, color: t.text2, fontSize: 13.5, lineHeight: 1.65, outline: "none" }}>
                {blocks.map((b, i) => {
                    if (b.kind === "heading") return <p key={i} style={{ fontWeight: 700, color: t.text, fontSize: 14, margin: "12px 0 4px" }}>{b.text}</p>
                    if (b.kind === "bullet") return <p key={i} style={{ margin: "0 0 4px", paddingLeft: 16, textIndent: -12 }}>•&nbsp;&nbsp;{b.text}</p>
                    if (b.kind === "numbered") return <p key={i} style={{ margin: "0 0 4px", paddingLeft: 20, textIndent: -18 }}>{b.n}.&nbsp;&nbsp;{b.text}</p>
                    return <p key={i} style={{ margin: "0 0 10px" }}>{b.text}</p>
                })}
                <div ref={endRef} style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 14, paddingTop: 10, borderTop: `1px dashed ${t.border}`, fontSize: 11.5, color: t.muted }}>
                    <CheckCircle2 size={13} /> End of policy
                </div>
            </div>

            <div style={{ padding: "12px 14px", borderTop: `1px solid ${t.border}` }}>
                {policy.status === "SIGNED" ? (
                    <SignedNote policy={policy} theme={theme} canDownload={source.kind === "self"} />
                ) : !atEnd ? (
                    <p style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: t.warn, margin: 0 }}>
                        <ArrowDown size={14} /> Scroll to the end of the policy to sign it
                    </p>
                ) : (
                    <SignForm policy={policy} theme={theme} source={source} designation={designation}
                        signerName={signerName} onSigned={onSigned} onOutdated={onOutdated} />
                )}
            </div>
        </div>
    )
}

function SignedNote({ policy, theme, canDownload }: { policy: RequiredPolicy; theme: "dark" | "light"; canDownload: boolean }) {
    const t = THEMES[theme]
    const older = policy.signedVersionNo !== null && policy.signedVersionNo !== policy.versionNo
    return (
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <CheckCircle2 size={18} style={{ color: t.ok }} />
            <p style={{ fontSize: 13, color: t.text2, margin: 0, flex: 1, minWidth: 180 }}>
                Signed{policy.signedAt ? ` on ${fmt(policy.signedAt)}` : ""}{older ? ` (version ${policy.signedVersionNo} — still valid)` : ""}
            </p>
            {canDownload && policy.ackId && (
                <a href={`/api/policies/acks/${policy.ackId}/pdf`} target="_blank" rel="noreferrer"
                    style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12.5, fontWeight: 600, color: t.accentText }}>
                    <Download size={13} /> Signed copy (PDF)
                </a>
            )}
        </div>
    )
}

function SignForm({ policy, theme, source, designation, signerName, onSigned, onOutdated }: {
    policy: RequiredPolicy
    theme: "dark" | "light"
    source: Source
    designation: string | null
    signerName: string
    onSigned: () => void
    onOutdated: () => void
}) {
    const t = THEMES[theme]
    const [agreed, setAgreed] = useState(false)
    const [name, setName] = useState("")
    const [nameError, setNameError] = useState<string | null>(null)
    const [busy, setBusy] = useState(false)
    const padRef = useRef<SignaturePadHandle>(null)
    const can = agreed && name.trim().length > 1 && !busy

    async function sign() {
        if (!can) return
        setBusy(true)
        setNameError(null)
        try {
            const res = await fetch(api(source, `/${policy.versionId}/sign`), {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    ...(designation !== null ? { designation } : {}),
                    agreed, typedName: name, signatureImage: padRef.current?.dataUrl() ?? null,
                }),
            })
            if (!res.ok) {
                const err = await readError(res)
                if (err.code === "NAME_MISMATCH") { setNameError(err.message); return }
                if (err.code === "VERSION_OUTDATED" || err.code === "POLICY_NOT_REQUIRED") { toast.error(err.message); onOutdated(); return }
                toast.error(err.message)
                return
            }
            toast.success(`Signed “${policy.title}”`)
            onSigned()
        } catch {
            toast.error("Network error — please try again")
        } finally {
            setBusy(false)
        }
    }

    const inputStyle: React.CSSProperties = {
        width: "100%", padding: "10px 12px", borderRadius: 10, fontSize: 14, outline: "none",
        border: `1px solid ${nameError ? t.err : t.border}`, background: t.input, color: t.text,
    }

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer", fontSize: 13, color: t.text2 }}>
                <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)}
                    style={{ width: 17, height: 17, marginTop: 1, accentColor: theme === "dark" ? "#6366f1" : undefined, flexShrink: 0 }} />
                <span>I have read <b style={{ color: t.text }}>{policy.title}</b> (version {policy.versionNo}) to the end, understood it and agree to follow it.</span>
            </label>

            <div>
                <label htmlFor={`sig-name-${policy.versionId}`} style={{ display: "block", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".5px", color: t.muted, marginBottom: 6 }}>
                    Type your full name to sign *
                </label>
                <input id={`sig-name-${policy.versionId}`} value={name} onChange={e => { setName(e.target.value); setNameError(null) }}
                    placeholder={signerName ? `As on your record: ${signerName}` : "Your full name"} autoComplete="name" style={inputStyle} />
                {nameError && <p style={{ fontSize: 11.5, color: t.err, margin: "4px 0 0" }}>{nameError}</p>}
            </div>

            <div>
                <p style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".5px", color: t.muted, margin: "0 0 6px" }}>
                    Draw your signature <span style={{ textTransform: "none", fontWeight: 400 }}>(optional)</span>
                </p>
                <SignaturePad ref={padRef} border={t.border} />
            </div>

            <button onClick={sign} disabled={!can}
                style={{
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "12px 0", borderRadius: 12, border: "none",
                    background: can ? (theme === "dark" ? "linear-gradient(135deg,#6366f1,#8b5cf6)" : "var(--accent)") : (theme === "dark" ? "#374151" : "var(--border)"),
                    color: can ? "#fff" : t.muted, fontSize: 14, fontWeight: 700, cursor: can ? "pointer" : "not-allowed",
                }}>
                {busy ? <Loader2 size={15} className="animate-spin" /> : <FileSignature size={15} />} Sign policy
            </button>
            {!agreed && <p style={{ fontSize: 11.5, color: t.muted, margin: "-4px 0 0", textAlign: "center" }}><Eye size={11} style={{ display: "inline", verticalAlign: "-1px" }} /> Tick the box and type your name to enable signing</p>}
        </div>
    )
}

// ─── Signature pad ───────────────────────────────────────────────────────────

type SignaturePadHandle = { dataUrl: () => string | null }


const SignaturePad = forwardRef<SignaturePadHandle, { border: string }>(function SignaturePad({ border }, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const drawing = useRef(false)
    const [hasInk, setHasInk] = useState(false)

    // Sized to its box at device pixel ratio so strokes stay sharp.
    useEffect(() => {
        const c = canvasRef.current
        if (!c) return
        const dpr = window.devicePixelRatio || 1
        const w = c.clientWidth, h = c.clientHeight
        c.width = Math.round(w * dpr); c.height = Math.round(h * dpr)
        const ctx = c.getContext("2d")!
        ctx.scale(dpr, dpr)
        ctx.lineWidth = 2.2; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = "#111827"
    }, [])

    useImperativeHandle(ref, () => ({
        dataUrl: () => (hasInk && canvasRef.current ? canvasRef.current.toDataURL("image/png") : null),
    }), [hasInk])

    const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
        const r = e.currentTarget.getBoundingClientRect()
        return { x: e.clientX - r.left, y: e.clientY - r.top }
    }
    const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        drawing.current = true
        const ctx = e.currentTarget.getContext("2d")!
        const p = pos(e)
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + 0.1, p.y + 0.1); ctx.stroke()
        setHasInk(true)
    }
    const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
        if (!drawing.current) return
        const ctx = e.currentTarget.getContext("2d")!
        const p = pos(e)
        ctx.lineTo(p.x, p.y); ctx.stroke()
    }
    const up = () => { drawing.current = false }
    const clear = () => {
        const c = canvasRef.current
        if (!c) return
        c.getContext("2d")!.clearRect(0, 0, c.width, c.height)
        setHasInk(false)
    }

    return (
        <div style={{ position: "relative" }}>
            <canvas ref={canvasRef} aria-label="Signature pad — draw with your finger or mouse"
                onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up} onPointerCancel={up}
                style={{ width: "100%", height: 120, borderRadius: 10, border: `1px dashed ${border}`, background: "#ffffff", touchAction: "none", cursor: "crosshair", display: "block" }} />
            {!hasInk && <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: "#9ca3af", pointerEvents: "none" }}>Sign here</span>}
            {hasInk && (
                <button type="button" onClick={clear}
                    style={{ position: "absolute", top: 6, right: 6, display: "flex", alignItems: "center", gap: 4, padding: "4px 8px", borderRadius: 8, border: "1px solid #e5e7eb", background: "#fff", fontSize: 11, color: "#374151", cursor: "pointer" }}>
                    <RotateCcw size={11} /> Clear
                </button>
            )}
        </div>
    )
})
