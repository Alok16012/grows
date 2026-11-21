"use client"

// People → Org chart. Reporting lines from each employee's reporting manager.
// Expand / collapse, search to jump to a person, filter by department or site;
// people with no manager are listed so they can be fixed.
import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { ArrowLeft, ChevronDown, ChevronRight, Loader2 } from "lucide-react"

type N = { id: string; code: string; name: string; designation: string | null; department: string | null; site: string | null; photo: string | null; managerNodeId: string | null; isPerson: boolean }

const initials = (n: string) => n.split(/\s+/).map(x => x[0]).slice(0, 2).join("").toUpperCase()

export default function OrgChartPage() {
    const [nodes, setNodes] = useState<N[] | null>(null)
    const [open, setOpen] = useState<Set<string>>(new Set())
    const [q, setQ] = useState("")
    const [dept, setDept] = useState("")
    const [focus, setFocus] = useState<string | null>(null)
    useEffect(() => { fetch("/api/employees/org-chart").then(r => r.json()).then(d => setNodes(d.nodes ?? [])).catch(() => setNodes([])) }, [])

    const { kids, byId, roots, loose, total } = useMemo(() => {
        const list = nodes ?? []
        const byId = new Map(list.map(n => [n.id, n]))
        const kids = new Map<string, N[]>()
        for (const n of list) if (n.managerNodeId && byId.has(n.managerNodeId) && n.managerNodeId !== n.id) kids.set(n.managerNodeId, [...(kids.get(n.managerNodeId) ?? []), n])
        for (const v of Array.from(kids.values())) v.sort((a, b) => a.name.localeCompare(b.name))
        const total = (id: string, seen = new Set<string>()): number => { if (seen.has(id)) return 0; seen.add(id); return (kids.get(id) ?? []).reduce((s, k) => s + 1 + total(k.id, seen), 0) }
        // Roots: people who manage someone and report to nobody (in this list).
        const roots = list.filter(n => (!n.managerNodeId || !byId.has(n.managerNodeId)) && kids.has(n.id)).sort((a, b) => total(b.id) - total(a.id))
        const loose = list.filter(n => !n.isPerson && (!n.managerNodeId || !byId.has(n.managerNodeId)) && !kids.has(n.id))
        return { kids, byId, roots, loose, total }
    }, [nodes])
    const depts = useMemo(() => Array.from(new Set((nodes ?? []).map(n => n.department).filter(Boolean) as string[])).sort(), [nodes])
    const hits = useMemo(() => { const t = q.trim().toLowerCase(); return t.length < 2 ? [] : (nodes ?? []).filter(n => n.name.toLowerCase().includes(t) || n.code.toLowerCase().includes(t)).slice(0, 8) }, [q, nodes])

    // Jump to a person: open every manager above them.
    function jump(id: string) {
        const chain = new Set(open)
        let cur = byId.get(id)?.managerNodeId, guard = 0
        while (cur && guard++ < 50) { chain.add(cur); cur = byId.get(cur)?.managerNodeId ?? null }
        setOpen(chain); setFocus(id); setQ("")
        setTimeout(() => document.getElementById(`org-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 80)
    }
    const matchesDept = (n: N): boolean => !dept || n.department === dept || (kids.get(n.id) ?? []).some(matchesDept)

    function Node({ n, depth }: { n: N; depth: number }) {
        const ch = (kids.get(n.id) ?? []).filter(matchesDept)
        const isOpen = open.has(n.id)
        return (
            <div style={{ marginLeft: depth ? 22 : 0 }} className={depth ? "border-l border-[var(--border)] pl-3" : ""}>
                <div id={`org-${n.id}`} className={`flex items-center gap-2 py-1.5 px-2 rounded-[9px] ${focus === n.id ? "bg-[var(--accent)]/10 ring-1 ring-[var(--accent)]" : "hover:bg-[var(--surface2)]"}`}>
                    {ch.length ? <button onClick={() => setOpen(o => { const x = new Set(o); x.has(n.id) ? x.delete(n.id) : x.add(n.id); return x })} aria-label={isOpen ? "Collapse" : "Expand"} className="text-[var(--text3)]">{isOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</button> : <span className="w-[15px]" />}
                    {n.photo ? <img src={n.photo} alt="" className="h-8 w-8 rounded-full object-cover" /> : <span className={`h-8 w-8 rounded-full flex items-center justify-center text-[11px] font-bold ${n.isPerson ? "bg-gray-100 text-gray-500" : "bg-[var(--accent)]/10 text-[var(--accent)]"}`}>{initials(n.name)}</span>}
                    <div className="min-w-0">
                        {n.isPerson ? <p className="text-[13px] font-semibold text-[var(--text)]">{n.name}</p> : <Link href={`/employees/profile/${n.id}`} className="text-[13px] font-semibold text-[var(--text)] hover:text-[var(--accent)]">{n.name}</Link>}
                        <p className="text-[11px] text-[var(--text3)] truncate">{[n.designation, n.department, n.site].filter(Boolean).join(" · ")}{n.code ? ` · ${n.code}` : ""}</p>
                    </div>
                    {ch.length > 0 && <span className="ml-auto text-[11px] text-[var(--text3)] whitespace-nowrap">{ch.length} direct · {total(n.id)} total</span>}
                </div>
                {isOpen && ch.map(c => <Node key={c.id} n={c} depth={depth + 1} />)}
            </div>
        )
    }

    if (!nodes) return <div className="p-10 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-[var(--text3)]" /></div>
    return (
        <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-4">
            <div>
                <Link href="/employees" className="inline-flex items-center gap-1 text-[12.5px] text-[var(--text3)] hover:text-[var(--text)]"><ArrowLeft className="h-3.5 w-3.5" /> Employees</Link>
                <h1 className="text-[22px] font-bold text-[var(--text)] mt-1">Org chart</h1>
                <p className="text-[12.5px] text-[var(--text3)]">{nodes.filter(n => !n.isPerson).length} employees · {roots.length} top-level manager(s) · {loose.length} without a reporting manager</p>
            </div>
            <div className="flex flex-wrap gap-2 items-center relative">
                <div className="relative flex-1 min-w-[220px]">
                    <input value={q} onChange={e => setQ(e.target.value)} placeholder="Find a person…" className="h-9 w-full rounded-[9px] border border-[var(--border)] px-2.5 text-[13px] bg-white" />
                    {hits.length > 0 && (
                        <div className="absolute z-10 mt-1 w-full bg-white border border-[var(--border)] rounded-[9px] shadow-lg">
                            {hits.map(h => <button key={h.id} onClick={() => jump(h.id)} className="block w-full text-left px-3 py-2 text-[12.5px] hover:bg-[var(--surface2)]"><b>{h.name}</b> <span className="text-[var(--text3)]">{h.designation ?? ""} {h.code}</span></button>)}
                        </div>
                    )}
                </div>
                <select value={dept} onChange={e => setDept(e.target.value)} className="h-9 rounded-[9px] border border-[var(--border)] px-2.5 text-[13px] bg-white" aria-label="Department"><option value="">All departments</option>{depts.map(d => <option key={d}>{d}</option>)}</select>
                <button onClick={() => setOpen(new Set(Array.from(kids.keys())))} className="h-9 px-3 rounded-[9px] border border-[var(--border)] bg-white text-[13px]">Expand all</button>
                <button onClick={() => setOpen(new Set())} className="h-9 px-3 rounded-[9px] border border-[var(--border)] bg-white text-[13px]">Collapse</button>
            </div>
            <div className="bg-white border border-[var(--border)] rounded-[12px] p-3">
                {!roots.length && <p className="text-[13px] text-[var(--text3)] p-4 text-center">No reporting lines yet — set each employee’s reporting manager (Data Quality → Reporting manager).</p>}
                {roots.filter(matchesDept).map(r => <Node key={r.id} n={r} depth={0} />)}
            </div>
            {loose.length > 0 && (
                <div className="bg-white border border-[var(--border)] rounded-[12px] p-3">
                    <p className="text-[13px] font-semibold mb-1">No reporting manager ({loose.length})</p>
                    <p className="text-[11.5px] text-[var(--text3)] mb-2">Set them in <Link href="/employees/quality" className="text-[var(--accent)] underline">Data Quality</Link> (Reporting manager).</p>
                    <div className="flex flex-wrap gap-1.5">{loose.filter(n => !dept || n.department === dept).map(n => <Link key={n.id} href={`/employees/profile/${n.id}`} className="px-2 py-0.5 rounded-full border border-[var(--border)] text-[12px] hover:border-[var(--accent)]">{n.name}</Link>)}</div>
                </div>
            )}
        </div>
    )
}
