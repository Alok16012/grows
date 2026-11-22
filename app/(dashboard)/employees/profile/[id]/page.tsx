"use client"

// People → Employee 360. One page per employee: who they are, where they sit
// (site, department, manager, team), and what is going on — attendance, leave,
// payroll, assets, expenses, documents, learning, performance, exit, history.
// Blocks the viewer may not see are simply absent (the API leaves them out).
import { useEffect, useState } from "react"
import Link from "next/link"
import { ArrowLeft, Loader2 } from "lucide-react"
import { CallButton } from "@/components/dialer/CallButton"

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
const inr = (n: number | null | undefined) => n == null ? "—" : "₹" + Math.round(n).toLocaleString("en-IN")
const day = (s: string | null | undefined) => s ? new Date(s).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—"
function tenure(s: string | null | undefined) {
    if (!s) return "—"
    const m = Math.max(0, Math.floor((Date.now() - new Date(s).getTime()) / (30.44 * 86_400_000)))
    return m < 12 ? `${m} month(s)` : `${Math.floor(m / 12)} yr ${m % 12} mo`
}

function Card({ title, children, href }: { title: string; children: React.ReactNode; href?: string }) {
    return (
        <div className="bg-white border border-[var(--border)] rounded-[12px] p-4">
            <div className="flex items-center justify-between mb-2"><p className="text-[13px] font-semibold text-[var(--text)]">{title}</p>{href && <Link href={href} className="text-[11.5px] font-semibold text-[var(--accent)]">Open →</Link>}</div>
            <div className="text-[12.5px] text-[var(--text2)] space-y-1">{children}</div>
        </div>
    )
}
const Row = ({ k, v }: { k: string; v: React.ReactNode }) => <div className="flex justify-between gap-3"><span className="text-[var(--text3)]">{k}</span><span className="text-right font-medium text-[var(--text)]">{v}</span></div>

export default function Employee360({ params }: { params: { id: string } }) {
    const [d, setD] = useState<any | null>(null)
    const [err, setErr] = useState<string | null>(null)
    useEffect(() => { fetch(`/api/employees/${params.id}/profile360`).then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j?.error || "Could not load"); setD(j) }).catch(e => setErr(e.message)) }, [params.id])

    if (err) return <div className="p-10 text-center text-[13px] text-red-600">{err}</div>
    if (!d) return <div className="p-10 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-[var(--text3)]" /></div>
    const e = d.employee
    const name = [e.firstName, e.middleName, e.lastName].filter(Boolean).join(" ")
    return (
        <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-4">
            <Link href="/employees" className="inline-flex items-center gap-1 text-[12.5px] text-[var(--text3)] hover:text-[var(--text)]"><ArrowLeft className="h-3.5 w-3.5" /> Employees</Link>
            <div className="bg-white border border-[var(--border)] rounded-[14px] p-5 flex flex-wrap items-center gap-4">
                {e.photo ? <img src={e.photo} alt="" className="h-20 w-20 rounded-full object-cover" /> : <div className="h-20 w-20 rounded-full bg-[var(--accent)]/10 text-[var(--accent)] flex items-center justify-center text-[24px] font-bold">{(e.firstName?.[0] ?? "") + (e.lastName?.[0] ?? "")}</div>}
                <div className="flex-1 min-w-[220px]">
                    <h1 className="text-[22px] font-bold text-[var(--text)]">{name}</h1>
                    <p className="text-[13px] text-[var(--text2)]">{e.designation ?? "—"}{d.department ? ` · ${d.department.name}` : ""}{d.site ? ` · ${d.site.name}` : ""}</p>
                    <p className="text-[12px] text-[var(--text3)] font-mono">{e.employeeId} · {e.employmentType} · <span className={e.status === "ACTIVE" ? "text-green-700" : "text-amber-700"}>{String(e.status).toLowerCase()}</span></p>
                </div>
                <div className="text-[12.5px] space-y-1 min-w-[200px]">
                    <Row k="Joined" v={`${day(e.dateOfJoining)} (${tenure(e.dateOfJoining)})`} />
                    <Row k="Reports to" v={d.manager ? (d.manager.employeeId ? <Link className="text-[var(--accent)]" href={`/employees/profile/${d.manager.employeeId}`}>{d.manager.name}</Link> : d.manager.name) : <span className="text-amber-700">not set</span>} />
                    <Row k="Mobile" v={e.phone ? <span className="inline-flex items-center gap-1.5">{e.phone}<CallButton phone={e.phone} targetType="EMPLOYEE" targetId={e.id} name={name} className="h-6 px-1.5 rounded-[6px] border border-[var(--border)] text-[var(--text2)] hover:text-green-700 inline-flex items-center" /></span> : "—"} />
                </div>
            </div>
            {d.exit && d.exit.status !== "CANCELLED" && <p className="rounded-[10px] bg-amber-50 border border-amber-200 px-4 py-2 text-[12.5px] text-amber-800">Exit: {String(d.exit.status).replace(/_/g, " ").toLowerCase()}{d.exit.lastWorkingDate ? ` · last working day ${day(d.exit.lastWorkingDate)}` : ""}</p>}

            <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
                <Card title="Attendance" href="/attendance">
                    <Row k="Present this month" v={d.attendance.presentThisMonth} />
                    {Object.entries(d.attendance.last30 as Record<string, number>).map(([k, v]) => <Row key={k} k={`${k.toLowerCase()} · last 30 days`} v={v} />)}
                </Card>
                <Card title="Leave this year" href="/leaves">
                    {Object.keys(d.leave.approvedThisYear).length ? Object.entries(d.leave.approvedThisYear as Record<string, number>).map(([k, v]) => <Row key={k} k={k} v={`${v} day(s)`} />) : <p className="text-[var(--text3)]">No approved leave this year</p>}
                    {d.leave.pending > 0 && <Row k="Pending requests" v={<span className="text-amber-700">{d.leave.pending}</span>} />}
                </Card>
                {(d.salary || d.payrolls?.length > 0) && (
                    <Card title="Pay" href="/payroll">
                        {d.salary && <Row k="CTC / month" v={inr(d.salary.ctcMonthly)} />}
                        {d.salary && <Row k="Basic" v={`${inr(d.salary.basic)} · ${d.salary.complianceType}`} />}
                        {d.payrolls.map((p: any) => <Row key={`${p.year}-${p.month}`} k={`${MONTHS[p.month - 1]} ${p.year} (${String(p.status).toLowerCase()})`} v={`${inr(p.netSalary)} net`} />)}
                    </Card>
                )}
                <Card title={`Assets with them (${d.assets.length})`} href="/assets?tab=issued">
                    {d.assets.length ? d.assets.map((x: any) => <Row key={x.issueNo} k={`${x.name}${x.qty > 1 ? ` × ${x.qty}` : ""}`} v={x.confirmed ? day(x.issuedAt) : <span className="text-amber-700">not confirmed</span>} />) : <p className="text-[var(--text3)]">None</p>}
                </Card>
                <Card title="Expense claims" href="/expenses">
                    {d.expenses.SUBMITTED ? <Row k="Awaiting approval" v={`${d.expenses.SUBMITTED.count} · ${inr(d.expenses.SUBMITTED.amount)}`} /> : null}
                    {d.expenses.APPROVED ? <Row k="Approved, not paid" v={`${d.expenses.APPROVED.count} · ${inr(d.expenses.APPROVED.amount)}`} /> : null}
                    {!d.expenses.SUBMITTED && !d.expenses.APPROVED && <p className="text-[var(--text3)]">Nothing open</p>}
                </Card>
                <Card title={`Documents (${d.documents.total})`} href="/employees/documents">
                    <Row k="Verified" v={d.documents.verified} />
                    <Row k="Pending" v={d.documents.pending} />
                    <p className="text-[11.5px] text-[var(--text3)]">{d.documents.types.join(", ") || "None uploaded"}</p>
                </Card>
                <Card title="Learning" href="/lms">
                    <Row k="Completed" v={d.learning.completed} />
                    <Row k="In progress" v={d.learning.inProgress} />
                    {d.learning.overdue.length > 0 && <Row k="Overdue" v={<span className="text-red-600">{d.learning.overdue.join(", ")}</span>} />}
                </Card>
                <Card title="Performance" href="/performance">
                    {d.performance ? (<>
                        <Row k="Last review" v={`${String(d.performance.cycle).toLowerCase()} · ${day(d.performance.periodEnd)}`} />
                        <Row k="Rating" v={d.performance.overallRating ?? "—"} />
                        {d.performance.incrementPercent != null && <Row k="Increment" v={`${d.performance.incrementPercent}%`} />}
                    </>) : <p className="text-[var(--text3)]">No review yet</p>}
                </Card>
                <Card title={`Team (${d.reports.length})`}>
                    {d.reports.length ? d.reports.map((r: any) => <Link key={r.id} href={`/employees/profile/${r.id}`} className="block hover:text-[var(--accent)]">{r.name} <span className="text-[var(--text3)]">{r.designation ?? ""}</span></Link>) : <p className="text-[var(--text3)]">Nobody reports to them</p>}
                </Card>
            </div>

            <Card title="Recent history">
                {d.history.length ? d.history.map((h: any, i: number) => (
                    <div key={i} className="flex gap-3 border-b border-[var(--border)] last:border-0 py-1">
                        <span className="text-[11.5px] text-[var(--text3)] whitespace-nowrap w-[100px]">{day(h.at)}</span>
                        <span className="flex-1">{h.summary ?? h.action}</span>
                        <span className="text-[11.5px] text-[var(--text3)]">{h.actorName ?? ""}</span>
                    </div>
                )) : <p className="text-[var(--text3)]">No recorded changes</p>}
            </Card>
        </div>
    )
}
