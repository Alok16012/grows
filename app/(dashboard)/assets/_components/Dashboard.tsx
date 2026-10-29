"use client"
import { useEffect, useState } from "react"
import { ClipboardList, Hourglass, PackageCheck, Boxes, Plus, Check, AlertTriangle } from "lucide-react"
import { StatCard, statGridClass } from "@/components/StatCard"
import {
    AssetRequest, REQUEST_STATUS, LOW_TONE, Pill, api, useApiError, Card, Loading, Empty,
    btnPrimary, btnGhost, thCls, tdCls, fmtDate, employeesSummary, sitesSummary, assetsSummary,
} from "./shared"

type DashboardData = {
    totals: { requests30d: number; pendingApproval: number; pendingIssueQty: number; stockAvailable: number; lowStockCount: number }
    recentRequests: AssetRequest[]
    lowStock: { id: string; name: string; size?: string | null; available: number; reorderLevel?: number | null }[]
}

export function DashboardTab({ refreshKey, canRequest, canApprove, canIssue, onRaise, onGo, onOpen }: {
    refreshKey: number
    canRequest: boolean
    canApprove: boolean
    canIssue: boolean
    onRaise: () => void
    onGo: (tab: "approvals" | "issue" | "stock") => void
    onOpen: (id: string) => void
}) {
    const onError = useApiError()
    const [d, setD] = useState<DashboardData | null>(null)
    useEffect(() => {
        api<DashboardData>("/api/assets/dashboard").then(setD).catch(e => onError(e, "Couldn't load the dashboard"))
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [refreshKey])

    if (!d) return <Loading />
    const t = d.totals ?? ({} as DashboardData["totals"])
    return (
        <div className="space-y-4">
            <div className={statGridClass(4)}>
                <StatCard label="Total Requests" value={t.requests30d ?? 0} sub="last 30 days" tone="blue" icon={<ClipboardList size={20} />} seed={0} />
                <StatCard label="Pending Approval" value={t.pendingApproval ?? 0} sub="awaiting a decision" tone="amber" icon={<Hourglass size={20} />} seed={1}
                    onClick={canApprove ? () => onGo("approvals") : undefined} />
                <StatCard label="Pending Issue" value={t.pendingIssueQty ?? 0} sub="units approved, not issued" tone="violet" icon={<PackageCheck size={20} />} seed={2}
                    onClick={canIssue ? () => onGo("issue") : undefined} />
                <StatCard label="Stock Available" value={t.stockAvailable ?? 0} sub={`${t.lowStockCount ?? 0} item${t.lowStockCount === 1 ? "" : "s"} low on stock`} tone={t.lowStockCount ? "rose" : "teal"}
                    icon={<Boxes size={20} />} seed={3} onClick={() => onGo("stock")} />
            </div>

            <div className="flex flex-wrap gap-2">
                {canRequest && <button className={btnPrimary} onClick={onRaise}><Plus size={14} />Raise request</button>}
                {canApprove && <button className={btnGhost} onClick={() => onGo("approvals")}><Check size={14} />Approvals{t.pendingApproval ? ` (${t.pendingApproval})` : ""}</button>}
                {canIssue && <button className={btnGhost} onClick={() => onGo("issue")}><PackageCheck size={14} />Issue{t.pendingIssueQty ? ` (${t.pendingIssueQty})` : ""}</button>}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <Card className="lg:col-span-2">
                    <div className="px-5 py-4 border-b border-[var(--border)] flex items-center justify-between">
                        <h3 className="text-[14px] font-semibold text-[var(--text)]">Recent requests</h3>
                        <button className="text-[12px] text-[var(--accent)] hover:underline" onClick={() => onGo("approvals")}>View all</button>
                    </div>
                    {(d.recentRequests ?? []).length === 0 ? <Empty icon={<ClipboardList size={32} />} title="No requests yet" /> : (
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[680px] text-[13px]">
                                <thead>
                                    <tr className="bg-[var(--surface2)]">
                                        <th className={thCls}>Request ID</th><th className={thCls}>Employee(s)</th><th className={thCls}>Site</th><th className={thCls}>Asset</th><th className={thCls}>Status</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-[var(--border)]">
                                    {d.recentRequests.map(r => (
                                        <tr key={r.id} className="hover:bg-[var(--surface2)]/50 cursor-pointer" onClick={() => onOpen(r.id)}>
                                            <td className={tdCls}>
                                                <span className="font-mono text-[12px] font-semibold text-[var(--accent)]">{r.requestNo}</span>
                                                <p className="text-[11px] text-[var(--text3)]">{fmtDate(r.createdAt)}</p>
                                            </td>
                                            <td className={`${tdCls} text-[var(--text)]`}>{employeesSummary(r.items ?? [])}</td>
                                            <td className={`${tdCls} text-[var(--text2)]`}>{sitesSummary(r.items ?? [])}</td>
                                            <td className={`${tdCls} text-[var(--text2)]`}>{assetsSummary(r.items ?? [])}</td>
                                            <td className={tdCls}>{REQUEST_STATUS[r.status] ? <Pill tone={REQUEST_STATUS[r.status]} /> : r.status}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </Card>

                <Card>
                    <div className="px-5 py-4 border-b border-[var(--border)] flex items-center gap-2">
                        <AlertTriangle size={15} className="text-amber-500" />
                        <h3 className="text-[14px] font-semibold text-[var(--text)]">Stock low alert</h3>
                    </div>
                    {(d.lowStock ?? []).length === 0 ? (
                        <p className="px-5 py-6 text-[13px] text-[var(--text3)]">All items are above their reorder level.</p>
                    ) : (
                        <ul className="divide-y divide-[var(--border)]">
                            {d.lowStock.map(s => (
                                <li key={s.id} className="flex items-center gap-3 px-5 py-3">
                                    <div className="min-w-0 flex-1">
                                        <p className="text-[13px] font-medium text-[var(--text)] truncate">{s.name}{s.size ? <span className="text-[var(--text3)]"> · {s.size}</span> : null}</p>
                                        <p className="text-[11.5px] text-[var(--text3)]">Reorder at {s.reorderLevel ?? "—"}</p>
                                    </div>
                                    <Pill tone={s.available === 0 ? { ...LOW_TONE, bg: "#fef2f2", color: "#dc2626" } : LOW_TONE}>{s.available} left</Pill>
                                </li>
                            ))}
                        </ul>
                    )}
                </Card>
            </div>
        </div>
    )
}
