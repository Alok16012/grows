// Physical verification (Assets → Verification): count what is on the shelf
// against what the system says, then close — optionally adjusting stock to the
// count (each difference posted to the stock ledger as an ADJUSTMENT).
import prisma from "@/lib/prisma"
import { audit, postStockTxn, withNumberRetry, WorkflowError } from "@/lib/asset-workflow"

export async function startVerification(input: { name: string; siteId?: string | null; siteName?: string | null; note?: string | null; actorId: string }) {
    let assetIds: string[] | null = null
    if (input.siteId) assetIds = (await prisma.assetDetail.findMany({ where: { siteId: input.siteId }, select: { assetId: true } })).map(d => d.assetId)
    const assets = await prisma.asset.findMany({ where: { isActive: true, ...(assetIds ? { id: { in: assetIds } } : {}) }, select: { id: true, available: true }, orderBy: { assetCode: "asc" } })
    if (!assets.length) throw new WorkflowError(400, input.siteId ? "No active assets are set to this site (Register → Edit → Site)" : "No active assets to count")
    return withNumberRetry("verificationNo", bump => prisma.$transaction(async tx => {
        const last = await tx.assetVerification.findFirst({ orderBy: { startedAt: "desc" }, select: { verificationNo: true } })
        const no = `VER-${String(Number(/(\d+)$/.exec(last?.verificationNo ?? "")?.[1] ?? 0) + 1 + bump).padStart(4, "0")}`
        const v = await tx.assetVerification.create({ data: { verificationNo: no, name: input.name, siteId: input.siteId ?? null, siteName: input.siteName ?? null, note: input.note ?? null, startedBy: input.actorId } })
        await tx.assetVerificationLine.createMany({ data: assets.map(a => ({ verificationId: v.id, assetId: a.id, expectedQty: a.available })) })
        await audit(tx, { entity: "AssetVerification", entityId: v.id, action: "START", userId: input.actorId, after: { no, lines: assets.length } })
        return v
    }))
}

export async function loadVerification(id: string) {
    const v = await prisma.assetVerification.findUnique({ where: { id } })
    if (!v) throw new WorkflowError(404, "Verification not found")
    const lines = await prisma.assetVerificationLine.findMany({ where: { verificationId: id } })
    const assets = await prisma.asset.findMany({ where: { id: { in: lines.map(l => l.assetId) } }, select: { id: true, assetCode: true, name: true, category: true, available: true, meta: { select: { size: true } } } })
    const a = new Map(assets.map(x => [x.id, x]))
    return {
        ...v,
        lines: lines.map(l => ({ ...l, assetCode: a.get(l.assetId)?.assetCode ?? "", name: a.get(l.assetId)?.name ?? "", category: a.get(l.assetId)?.category ?? "", size: a.get(l.assetId)?.meta?.size ?? null, availableNow: a.get(l.assetId)?.available ?? 0 }))
            .sort((x, y) => x.assetCode.localeCompare(y.assetCode)),
    }
}

export async function saveCounts(id: string, counts: { lineId: string; countedQty: number | null; condition?: string | null; note?: string | null }[], actorId: string) {
    const v = await prisma.assetVerification.findUnique({ where: { id }, select: { status: true } })
    if (!v) throw new WorkflowError(404, "Verification not found")
    if (v.status !== "OPEN") throw new WorkflowError(400, "This verification is closed")
    let n = 0
    for (const c of counts.slice(0, 2000)) {
        const q = c.countedQty == null || (c.countedQty as any) === "" ? null : Math.round(Number(c.countedQty))
        if (q !== null && (!Number.isFinite(q) || q < 0)) continue
        await prisma.assetVerificationLine.updateMany({
            where: { id: c.lineId, verificationId: id },
            data: { countedQty: q, condition: c.condition ? String(c.condition).slice(0, 20) : null, note: c.note ? String(c.note).slice(0, 200) : null, countedBy: actorId, countedAt: new Date() },
        })
        n++
    }
    return n
}

/** Closes it. With `adjust`, stock for every counted line is set to the count (ledger: ADJUSTMENT). */
export async function closeVerification(id: string, opts: { adjust: boolean; actorId: string }) {
    const v = await loadVerification(id)
    if (v.status !== "OPEN") throw new WorkflowError(400, "Already closed")
    const counted = v.lines.filter(l => l.countedQty != null)
    if (!counted.length) throw new WorkflowError(400, "Nothing has been counted yet")
    let adjusted = 0
    if (opts.adjust) {
        for (const l of counted) {
            await prisma.$transaction(async tx => {
                const now = await tx.asset.findUnique({ where: { id: l.assetId }, select: { available: true } })
                const delta = (l.countedQty ?? 0) - (now?.available ?? 0)
                if (!delta) return
                await postStockTxn(tx, { assetId: l.assetId, type: "ADJUSTMENT", qty: delta, quantityDelta: delta, refType: "VERIFICATION", refId: id, userId: opts.actorId, note: `${v.verificationNo}: counted ${l.countedQty}, system ${now?.available ?? 0}` })
                adjusted++
            })
        }
    }
    await prisma.assetVerification.update({ where: { id }, data: { status: "CLOSED", closedBy: opts.actorId, closedAt: new Date() } })
    await audit(prisma, { entity: "AssetVerification", entityId: id, action: "CLOSE", userId: opts.actorId, after: { counted: counted.length, adjusted, adjust: opts.adjust } })
    return { counted: counted.length, adjusted }
}
