"use client"
// Assets — Employee Asset Management.
//
// Workflow: request → approve → issue → acknowledge (profile) → return.
// Tabs are role-driven (like Expenses): approvers / issuers / viewers get the
// Dashboard, Requests & Approvals, Issue, Issued Items, Inventory and Reports;
// a requester-only user gets "My requests" and the Raise request button.
//
// When the asset migration hasn't been run the workflow APIs answer 503: the
// page then shows a setup notice and falls back to the classic Inventory /
// Issued Items screens (components in _components/legacy.tsx).
import { useState, useEffect, useCallback, useMemo } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
    Plus, Package, Users, AlertTriangle, BarChart3, LayoutDashboard, ClipboardList, PackageCheck, Boxes, FileBarChart2, ClipboardPlus,
} from "lucide-react"
import { StatCard, statGridClass } from "@/components/StatCard"
import { OpenFromQuery } from "@/components/OpenFromQuery"
import { can } from "@/lib/can"
import { fetchAllEmployees } from "@/lib/fetch-all-employees"
import {
    AssetRequest, PickerEmployee, RequestItem, RequestPrefill, StockItem,
    ApiError, WorkflowContext, SetupNotice,
} from "./_components/shared"
import {
    Asset, AssetModal, IssueModal as LegacyIssueModal, AssetDrawer, LegacyInventory, LegacyIssued,
} from "./_components/legacy"
import { RaiseRequestDrawer } from "./_components/RaiseRequest"
import { RequestsTab, RequestDrawer, IssueFromRequestModal, PendingIssueTab } from "./_components/Requests"
import { IssuedTab, DirectIssueModal } from "./_components/Issued"
import { StockTab } from "./_components/Stock"
import { DashboardTab } from "./_components/Dashboard"
import { ReportsTab } from "./_components/Reports"

type Tab = "dashboard" | "approvals" | "issue" | "issued" | "stock" | "reports"

const TAB_ALIASES: Record<string, Tab> = {
    dashboard: "dashboard", approvals: "approvals", requests: "approvals", mine: "approvals", "my-requests": "approvals",
    issue: "issue", "pending-issue": "issue", issued: "issued", stock: "stock", inventory: "stock", assets: "stock",
    reports: "reports", history: "reports",
}
const WORKFLOW_ONLY: Tab[] = ["dashboard", "approvals", "issue", "reports"]

export default function AssetsPage({ searchParams }: { searchParams?: { tab?: string; id?: string } }) {
    const { data: session, status } = useSession()
    const router = useRouter()

    // ── Permissions ──
    const canManage = can(session, "assets.manage")
    const canView = can(session, "assets.view") || canManage
    const canRequest = can(session, "assets.request") || canManage
    const canApprove = can(session, "assets.approve") || canManage
    const canIssue = can(session, "assets.issue") || canManage
    const isStaff = canApprove || canIssue || canView
    const hasAccess = isStaff || canRequest
    const meId = (session?.user as { id?: string } | undefined)?.id

    useEffect(() => {
        if (status === "unauthenticated") router.push("/login")
        else if (status === "authenticated" && !hasAccess) router.push("/")
    }, [status, hasAccess, router])

    const tabs = useMemo(() => {
        if (!isStaff) return [{ id: "approvals" as Tab, label: "My requests", icon: ClipboardList }]
        const t: { id: Tab; label: string; icon: typeof Package }[] = [
            { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
            { id: "approvals", label: canApprove ? "Requests & Approvals" : "Requests", icon: ClipboardList },
        ]
        if (canIssue) t.push({ id: "issue", label: "Issue", icon: PackageCheck })
        t.push({ id: "issued", label: "Issued Items", icon: Users })
        t.push({ id: "stock", label: "Inventory", icon: Boxes })
        t.push({ id: "reports", label: "History & Reports", icon: FileBarChart2 })
        return t
    }, [isStaff, canApprove, canIssue])

    // ── Tab state (?tab= on load) ──
    const [tab, setTabState] = useState<Tab | null>(null)
    useEffect(() => {
        if (status !== "authenticated" || tab) return
        const wanted = TAB_ALIASES[(searchParams?.tab ?? "").toLowerCase()]
        const allowed = tabs.map(t => t.id)
        setTabState(wanted && allowed.includes(wanted) ? wanted : allowed[0])
    }, [status, tabs, tab, searchParams?.tab])
    const setTab = useCallback((t: Tab) => {
        setTabState(t)
        try {
            const u = new URL(window.location.href)
            u.searchParams.set("tab", t)
            window.history.replaceState(window.history.state, "", u.toString())
        } catch { /* ignore */ }
    }, [])

    // ── Workflow availability ──
    const [missing, setMissing] = useState(false)
    const reportMissing = useCallback(() => setMissing(true), [])
    useEffect(() => {
        if (status !== "authenticated" || !hasAccess) return
        fetch("/api/assets/requests?pageSize=1").then(r => { if (r.status === 503) setMissing(true) }).catch(() => { })
    }, [status, hasAccess])
    // Before the migration only the classic screens work — land on Inventory.
    useEffect(() => {
        if (missing && isStaff && tab && WORKFLOW_ONLY.includes(tab) && !searchParams?.tab) setTabState("stock")
    }, [missing, isStaff, tab, searchParams?.tab])

    // ── Shared refresh + overlays ──
    const [refreshKey, setRefreshKey] = useState(0)
    const refresh = useCallback(() => setRefreshKey(k => k + 1), [])

    const [raise, setRaise] = useState<{ prefill: RequestPrefill | null } | null>(null)
    const [drawerId, setDrawerId] = useState<string | null>(null)
    const [issueTarget, setIssueTarget] = useState<{ request: AssetRequest; item: RequestItem } | null>(null)
    const [directIssue, setDirectIssue] = useState<StockItem | null>(null)
    const [issuedView, setIssuedView] = useState<"workflow" | "classic">("workflow")

    // Classic (pre-workflow) overlays
    const [addModal, setAddModal] = useState(false)
    const [editAsset, setEditAsset] = useState<Asset | null>(null)
    const [legacyIssueAsset, setLegacyIssueAsset] = useState<Asset | null>(null)
    const [drawerAssetId, setDrawerAssetId] = useState<string | null>(null)
    const [legacyAssets, setLegacyAssets] = useState<Asset[]>([])

    // Employees for the direct-issue / classic issue modals.
    const [employees, setEmployees] = useState<PickerEmployee[]>([])
    useEffect(() => {
        if (status !== "authenticated" || !(canIssue || canManage)) return
        fetchAllEmployees<PickerEmployee>({ status: "ACTIVE", lite: 1 }).then(r => setEmployees(r.employees)).catch(() => { })
    }, [status, canIssue, canManage])

    async function openEdit(assetId: string) {
        try {
            const res = await fetch(`/api/assets/${assetId}`)
            if (!res.ok) throw new ApiError(res.status, await res.text())
            setEditAsset(await res.json())
        } catch { toast.error("Couldn't load the asset") }
    }

    const openRequest = useCallback((id: string) => {
        setDrawerId(id)
    }, [])

    if (status === "loading" || !tab) {
        return <div className="flex-1" />
    }

    const legacyTotals = {
        assets: legacyAssets.length,
        items: legacyAssets.reduce((s, a) => s + a.quantity, 0),
        issued: legacyAssets.reduce((s, a) => s + (a._count?.assignments ?? 0), 0),
        damaged: legacyAssets.filter(a => a.condition === "DAMAGED" || a.condition === "LOST").length,
    }

    return (
        <WorkflowContext.Provider value={{ missing, reportMissing }}>
            <div className="flex flex-col h-full">
                <OpenFromQuery ready={status === "authenticated" && !missing} onOpen={openRequest} />

                {/* Header */}
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between px-6 pt-6 pb-2 shrink-0">
                    <div className="min-w-0">
                        <h1 className="text-[26px] font-bold text-[var(--text)] tracking-[-0.5px]">Assets</h1>
                        <p className="text-[13.5px] text-[var(--text3)] mt-1">
                            {isStaff ? "Request, approve, issue and track assets issued to employees." : "Request assets for yourself or your team and track them."}
                        </p>
                    </div>
                    <div className="page-actions">
                        {canManage && (
                            <button onClick={() => setAddModal(true)}
                                className="inline-flex items-center justify-center gap-2 h-[42px] px-5 border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] rounded-[10px] text-[13px] font-semibold hover:bg-[var(--surface2)] transition-colors">
                                <Plus size={16} /> Add Asset
                            </button>
                        )}
                        {canRequest && !missing && (
                            <button onClick={() => setRaise({ prefill: null })}
                                className="inline-flex items-center justify-center gap-2 h-[42px] px-5 bg-[var(--accent)] text-white rounded-[10px] text-[13px] font-semibold hover:opacity-90 transition-opacity"
                                style={{ boxShadow: "0 1px 3px rgba(26,158,110,0.35)" }}>
                                <ClipboardPlus size={16} /> Raise request
                            </button>
                        )}
                    </div>
                </div>

                {missing && <div className="px-4 sm:px-6 pt-2 shrink-0"><SetupNotice /></div>}

                {/* Classic KPI row while the workflow isn't available */}
                {missing && isStaff && (
                    <div className="px-4 sm:px-6 py-4 shrink-0"><div className={statGridClass(4)}>
                        <StatCard label="Total Assets" value={legacyTotals.assets} sub={`${legacyTotals.items} items`} tone="blue" icon={<Package size={20} />} seed={0} />
                        <StatCard label="Total Items" value={legacyTotals.items} sub="across all assets" tone="violet" icon={<BarChart3 size={20} />} seed={1} />
                        <StatCard label="Currently Issued" value={legacyTotals.issued} sub="in use" tone="amber" icon={<Users size={20} />} seed={2} />
                        <StatCard label="Damaged / Lost" value={legacyTotals.damaged} sub="need attention" tone="rose" icon={<AlertTriangle size={20} />} seed={3} />
                    </div></div>
                )}

                {/* Tabs */}
                <div className="z-tabs-wrap px-6 pt-3 pb-3 shrink-0"><div className="z-tabs" role="tablist">
                    {tabs.map(({ id, label, icon: Icon }) => (
                        <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
                            className={`z-tab ${tab === id ? "is-active" : ""}`}>
                            <Icon size={14} />{label}
                        </button>
                    ))}
                </div></div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto px-4 sm:px-6 pb-6">
                    {missing && WORKFLOW_ONLY.includes(tab) ? (
                        <p className="text-[13px] text-[var(--text3)] py-10 text-center">
                            {isStaff ? "Use Inventory and Issued Items until the asset workflow is set up." : "Asset requests will be available once the asset workflow is set up."}
                        </p>
                    ) : (
                        <>
                            {tab === "dashboard" && (
                                <DashboardTab refreshKey={refreshKey} canRequest={canRequest} canApprove={canApprove} canIssue={canIssue}
                                    onRaise={() => setRaise({ prefill: null })} onGo={setTab} onOpen={openRequest} />
                            )}
                            {tab === "approvals" && (
                                <RequestsTab key={isStaff ? "staff" : "mine"} mineOnly={!isStaff} canApprove={canApprove} canIssue={canIssue} meId={meId}
                                    refreshKey={refreshKey} onOpen={openRequest} onIssue={(request, item) => setIssueTarget({ request, item })} />
                            )}
                            {tab === "issue" && canIssue && (
                                <PendingIssueTab refreshKey={refreshKey} onOpen={openRequest} onIssue={(request, item) => setIssueTarget({ request, item })} />
                            )}
                            {tab === "issued" && (
                                <>
                                    {!missing && (
                                        <div className="z-tabs-wrap mb-3"><div className="z-tabs z-tabs--inset" role="tablist">
                                            <button role="tab" aria-selected={issuedView === "workflow"} onClick={() => setIssuedView("workflow")} className={`z-tab ${issuedView === "workflow" ? "is-active" : ""}`}>Issues</button>
                                            <button role="tab" aria-selected={issuedView === "classic"} onClick={() => setIssuedView("classic")} className={`z-tab ${issuedView === "classic" ? "is-active" : ""}`}>Classic view</button>
                                        </div></div>
                                    )}
                                    {missing || issuedView === "classic" ? (
                                        <LegacyIssued refreshKey={refreshKey} canManage={canManage} onChanged={refresh} />
                                    ) : (
                                        <IssuedTab refreshKey={refreshKey} canIssue={canIssue} canRequest={canRequest} onChanged={refresh}
                                            onReplace={p => setRaise({ prefill: p })} />
                                    )}
                                </>
                            )}
                            {tab === "stock" && (missing ? (
                                <LegacyInventory refreshKey={refreshKey} canManage={canManage} onIssue={setLegacyIssueAsset}
                                    onEdit={setEditAsset} onDetails={setDrawerAssetId} onLoaded={setLegacyAssets} />
                            ) : (
                                <StockTab refreshKey={refreshKey} canManage={canManage} canIssue={canIssue}
                                    onIssue={setDirectIssue} onEdit={openEdit} onDetails={setDrawerAssetId} onChanged={refresh} />
                            ))}
                            {tab === "reports" && <ReportsTab />}
                        </>
                    )}
                </div>

                {/* Workflow overlays */}
                {raise && (
                    <RaiseRequestDrawer prefill={raise.prefill} onClose={() => setRaise(null)}
                        onCreated={() => { setRaise(null); setTab("approvals"); refresh() }} />
                )}
                {drawerId && !missing && (
                    <RequestDrawer id={drawerId} canApprove={canApprove} canIssue={canIssue} meId={meId} refreshKey={refreshKey}
                        onClose={() => setDrawerId(null)} onChanged={refresh} onIssue={(request, item) => setIssueTarget({ request, item })} />
                )}
                {issueTarget && (
                    <IssueFromRequestModal request={issueTarget.request} item={issueTarget.item}
                        onClose={() => setIssueTarget(null)} onDone={() => { setIssueTarget(null); refresh() }} />
                )}
                {directIssue && (
                    <DirectIssueModal asset={directIssue} employees={employees}
                        onClose={() => setDirectIssue(null)} onDone={() => { setDirectIssue(null); refresh() }} />
                )}

                {/* Classic overlays */}
                {addModal && <AssetModal onClose={() => setAddModal(false)} onSave={() => { setAddModal(false); refresh() }} />}
                {editAsset && <AssetModal asset={editAsset} onClose={() => setEditAsset(null)} onSave={() => { setEditAsset(null); refresh() }} />}
                {legacyIssueAsset && (
                    <LegacyIssueModal asset={legacyIssueAsset} employees={employees}
                        onClose={() => setLegacyIssueAsset(null)} onSave={() => { setLegacyIssueAsset(null); refresh() }} />
                )}
                {drawerAssetId && (
                    <AssetDrawer assetId={drawerAssetId} employees={employees}
                        onClose={() => setDrawerAssetId(null)} onRefresh={refresh} />
                )}
            </div>
        </WorkflowContext.Provider>
    )
}
