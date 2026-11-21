// Sizes & uniform / PPE kits (Assets → Kits & sizes).
//
// Item group: the sizes of one item share AssetDetail.groupName (e.g. "T shirt"
// → assets "T shirt S", "T shirt M" …, each with its size in AssetMeta.size).
// An asset without a group is a group of its own (its name).
// Kit: item groups and quantities, for a site / designation. Issuing a kit picks
// each employee's size for every group; a group with one size needs none.
import prisma from "@/lib/prisma"
import { postedSites } from "@/lib/attendance-guard"
import { WorkflowError, withNumberRetry, issueAssetTx, isUnassignableStatus } from "@/lib/asset-workflow"

export type Variant = { assetId: string; name: string; assetCode: string; size: string | null; available: number; reorderLevel: number }
export type ItemGroup = { groupName: string; variants: Variant[]; available: number }
export type KitItem = { groupName: string; qty: number }

const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase()

/** Every active asset, grouped by item group, with stock per size. */
export async function itemGroups(): Promise<ItemGroup[]> {
    const assets = await prisma.asset.findMany({ where: { isActive: true }, select: { id: true, name: true, assetCode: true, available: true, meta: { select: { size: true, reorderLevel: true } } }, orderBy: { name: "asc" } })
    const details = await prisma.assetDetail.findMany({ where: { assetId: { in: assets.map(a => a.id) } }, select: { assetId: true, groupName: true } })
    const groupOf = new Map(details.map(d => [d.assetId, d.groupName?.trim() || null]))
    const map = new Map<string, ItemGroup>()
    for (const a of assets) {
        const g = groupOf.get(a.id) || a.name
        const cur = map.get(norm(g)) ?? { groupName: g, variants: [], available: 0 }
        cur.variants.push({ assetId: a.id, name: a.name, assetCode: a.assetCode, size: a.meta?.size ?? null, available: a.available, reorderLevel: a.meta?.reorderLevel ?? 0 })
        cur.available += a.available
        map.set(norm(g), cur)
    }
    return Array.from(map.values()).sort((x, y) => x.groupName.localeCompare(y.groupName))
}

export async function sizesOf(employeeIds: string[]): Promise<Map<string, Map<string, string>>> {
    const out = new Map<string, Map<string, string>>()
    if (!employeeIds.length) return out
    const rows = await prisma.employeeSize.findMany({ where: { employeeId: { in: employeeIds } } })
    for (const r of rows) { const m = out.get(r.employeeId) ?? new Map<string, string>(); m.set(norm(r.groupName), r.size); out.set(r.employeeId, m) }
    return out
}

export type KitLine = { groupName: string; qty: number; assetId: string | null; assetName: string | null; size: string | null; problem: string | null }

/** What a kit means for one employee: the asset (size) per item group, or why not. */
export function resolveKit(items: KitItem[], groups: ItemGroup[], sizes: Map<string, string> | undefined): KitLine[] {
    return items.map(it => {
        const g = groups.find(x => norm(x.groupName) === norm(it.groupName))
        if (!g || !g.variants.length) return { groupName: it.groupName, qty: it.qty, assetId: null, assetName: null, size: null, problem: "Item not in stock list" }
        let v: Variant | undefined
        if (g.variants.length === 1) v = g.variants[0]
        else {
            const want = sizes?.get(norm(it.groupName))
            if (!want) return { groupName: it.groupName, qty: it.qty, assetId: null, assetName: null, size: null, problem: "Size not set" }
            v = g.variants.find(x => norm(x.size) === norm(want))
            if (!v) return { groupName: it.groupName, qty: it.qty, assetId: null, assetName: null, size: want, problem: `No ${it.groupName} in size ${want}` }
        }
        return { groupName: it.groupName, qty: it.qty, assetId: v.assetId, assetName: v.name, size: v.size, problem: v.available < it.qty ? `Only ${v.available} in stock` : null }
    })
}

export function sanitizeKitItems(v: unknown): KitItem[] {
    if (!Array.isArray(v)) return []
    const out: KitItem[] = []
    for (const r of v.slice(0, 30)) {
        const groupName = typeof r?.groupName === "string" ? r.groupName.trim().slice(0, 80) : ""
        const qty = Math.round(Number(r?.qty))
        if (groupName && Number.isFinite(qty) && qty >= 1 && qty <= 100 && !out.some(o => norm(o.groupName) === norm(groupName))) out.push({ groupName, qty })
    }
    return out
}

/** Issues a kit to employees. Each item is its own transaction; problems are reported, never half-issued per item. */
export async function issueKit(kitId: string, employeeIds: string[], opts: { actorId: string; acknowledged: boolean }) {
    const kit = await prisma.assetKit.findUnique({ where: { id: kitId } })
    if (!kit || !kit.isActive) throw new WorkflowError(404, "Kit not found")
    const items = sanitizeKitItems(kit.items)
    const [groups, sizes, emps] = await Promise.all([
        itemGroups(), sizesOf(employeeIds),
        prisma.employee.findMany({ where: { id: { in: employeeIds } }, select: { id: true, firstName: true, lastName: true, employeeId: true, status: true } }),
    ])
    const results: { employeeId: string; name: string; code: string; issued: string[]; problems: string[] }[] = []
    for (const e of emps) {
        const r = { employeeId: e.id, name: `${e.firstName} ${e.lastName}`.trim(), code: e.employeeId, issued: [] as string[], problems: [] as string[] }
        if (isUnassignableStatus(e.status)) { r.problems.push("Employee has left"); results.push(r); continue }
        for (const line of resolveKit(items, groups, sizes.get(e.id))) {
            if (!line.assetId || line.problem) { r.problems.push(`${line.groupName}: ${line.problem}`); continue }
            try {
                await withNumberRetry("issueNo", bump => prisma.$transaction(tx => issueAssetTx(tx, {
                    employeeId: e.id, assetId: line.assetId!, quantity: line.qty, size: line.size,
                    acknowledged: opts.acknowledged, remarks: `Kit: ${kit.name}`, actorId: opts.actorId, refType: "KIT",
                }, bump)))
                r.issued.push(`${line.assetName}${line.qty > 1 ? ` × ${line.qty}` : ""}`)
                // Stock moved: keep the in-memory count right for the next employee.
                const v = groups.flatMap(g => g.variants).find(x => x.assetId === line.assetId)
                if (v) v.available -= line.qty
            } catch (err: any) {
                r.problems.push(`${line.groupName}: ${err instanceof WorkflowError ? err.message : "could not issue"}`)
            }
        }
        results.push(r)
    }
    return { kit: kit.name, results }
}

/** Recent joiners who should get an on-joining kit and haven't had all of it yet. */
export async function joinersNeedingKits(windowDays: number) {
    const kits = (await prisma.assetKit.findMany({ where: { isActive: true, onJoining: true } })).map(k => ({ ...k, items: sanitizeKitItems(k.items) }))
    if (!kits.length || windowDays <= 0) return []
    const since = new Date(Date.now() - windowDays * 86_400_000)
    const emps = await prisma.employee.findMany({
        where: { dateOfJoining: { gte: since }, status: { in: ["ACTIVE", "ONBOARDING"] as any } },
        select: { id: true, firstName: true, lastName: true, employeeId: true, designation: true, dateOfJoining: true },
        orderBy: { dateOfJoining: "desc" }, take: 500,
    })
    if (!emps.length) return []
    const [posted, groups, issues] = await Promise.all([
        postedSites(emps.map(e => e.id)), itemGroups(),
        prisma.assetIssue.findMany({ where: { employeeId: { in: emps.map(e => e.id) } }, select: { employeeId: true, assetId: true } }),
    ])
    const groupOfAsset = new Map(groups.flatMap(g => g.variants.map(v => [v.assetId, norm(g.groupName)] as const)))
    const had = new Map<string, Set<string>>()
    for (const i of issues) { const s = had.get(i.employeeId) ?? new Set<string>(); const g = groupOfAsset.get(i.assetId); if (g) s.add(g); had.set(i.employeeId, s) }
    const out: { employeeId: string; name: string; code: string; joined: string | null; siteId: string | null; kitId: string; kitName: string; missing: string[] }[] = []
    for (const e of emps) {
        const site = posted.get(e.id) ?? null
        const kit = kits.find(k => (!k.siteId || k.siteId === site) && (!k.designation || norm(k.designation) === norm(e.designation)))
        if (!kit) continue
        const missing = kit.items.filter(it => !had.get(e.id)?.has(norm(it.groupName))).map(it => it.groupName)
        if (missing.length) out.push({ employeeId: e.id, name: `${e.firstName} ${e.lastName}`.trim(), code: e.employeeId, joined: e.dateOfJoining?.toISOString().slice(0, 10) ?? null, siteId: site, kitId: kit.id, kitName: kit.name, missing })
    }
    return out
}
