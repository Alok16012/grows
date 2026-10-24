import { NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import prisma from "@/lib/prisma"
import { UNASSIGNABLE_EMPLOYEE_STATUSES } from "@/lib/employee-filter"

// Shared engine for the asset workflow (request → approve → issue →
// acknowledge → return). Its tables are applied by hand in prod, so the code
// can be live before they exist: every new route answers 503 with the SQL to
// run, and the legacy assign/return routes skip their ledger writes.

export const ASSET_WORKFLOW_MIGRATION = "prisma/migrations/20261024120000_asset_workflow/migration.sql"
export const WORKFLOW_MISSING_MESSAGE =
    `Asset workflow is not set up yet — run ${ASSET_WORKFLOW_MIGRATION} in Supabase`

export const REQUEST_TYPES = ["INDIVIDUAL", "MULTIPLE"] as const
export const REQUEST_REASONS = ["NEW_JOINING", "REPLACEMENT", "DAMAGED", "ADDITIONAL", "OTHER"] as const
export const REQUEST_STATUSES = ["SUBMITTED", "APPROVED", "PARTIALLY_APPROVED", "REJECTED", "CANCELLED"] as const
export const FULFILMENT_STATUSES = ["NOT_ISSUED", "PARTIALLY_ISSUED", "FULFILLED"] as const
export const ISSUE_STATUSES = ["ACTIVE", "RETURNED", "REPLACED", "LOST", "DAMAGED", "WRITTEN_OFF"] as const
export const MAX_REQUEST_QTY = 100

// The interactive-transaction client of our extended Prisma client.
export type Tx = Omit<typeof prisma, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">
type Db = Tx | typeof prisma

/** An expected, user-facing failure: the route turns it into { error } + status. */
export class WorkflowError extends Error {
    constructor(public status: number, message: string) {
        super(message)
    }
}

/** True when the error means the workflow tables/columns aren't installed yet. */
export function isMissingTableErr(e: unknown): boolean {
    const err = e as { code?: string; message?: string; meta?: { message?: string } }
    const text = `${err?.message ?? ""} ${err?.meta?.message ?? ""}`
    // P2010 is how a raw query inside a transaction reports `relation "X" does not exist`.
    return err?.code === "P2021" || err?.code === "P2022"
        || /(relation|table|column)\s.{0,120}does not exist/i.test(text)
}

/** Unique-constraint hit, optionally on a specific column. */
export function isUniqueErr(e: unknown, field?: string): boolean {
    const err = e as { code?: string; message?: string; meta?: { target?: unknown } }
    const hit = err?.code === "P2002" || /23505|duplicate key|unique constraint/i.test(String(err?.message ?? ""))
    if (!hit || !field) return hit
    const target = err?.meta?.target
    const where = Array.isArray(target) ? target.join(",") : String(target ?? err?.message ?? "")
    return where.includes(field)
}

/** Uniform error → response mapping for every workflow route. */
export function workflowErrorResponse(e: unknown, tag: string) {
    if (e instanceof WorkflowError) return NextResponse.json({ error: e.message }, { status: e.status })
    if (isMissingTableErr(e)) return NextResponse.json({ error: WORKFLOW_MISSING_MESSAGE }, { status: 503 })
    console.error(tag, e)
    return NextResponse.json({ error: "Internal Error" }, { status: 500 })
}

export const jsonError = (status: number, error: string) => NextResponse.json({ error }, { status })

/**
 * For the legacy routes: run a workflow-table write, but no-op (and never
 * throw) when the tables aren't there yet — the old behaviour must survive.
 * No "known missing" cache on purpose: once the SQL runs, the very next
 * legacy return must see the workflow issue, or it would desync the ledger.
 */
export async function ifWorkflowInstalled<T>(fn: () => Promise<T>, tag = "[ASSET_WORKFLOW]"): Promise<T | null> {
    try {
        return await fn()
    } catch (e) {
        if (!isMissingTableErr(e)) console.error(tag, e)
        return null
    }
}

// ─── Numbering ────────────────────────────────────────────────────────────────

const NUMBERED = {
    AssetRequest: "requestNo",
    AssetIssue: "issueNo",
} as const

/**
 * Next "AR-0007" / "ISS-0042" from the MAX numeric suffix (not a row count,
 * which collides once anything is deleted). Two concurrent creates can still
 * pick the same number; callers retry once on P2002 via `withNumberRetry`.
 */
export async function nextNumber(db: Db, model: keyof typeof NUMBERED, prefix: string, bump = 0): Promise<string> {
    const col = NUMBERED[model]
    // Identifiers come from the whitelist above, never from input.
    const rows = await db.$queryRawUnsafe<{ max: number | bigint | null }[]>(
        `SELECT COALESCE(MAX(CAST(SUBSTRING("${col}" FROM ${prefix.length + 2}) AS INTEGER)), 0) AS max
         FROM "${model}" WHERE "${col}" ~ '^${prefix}-[0-9]+$'`,
    )
    const max = Number(rows?.[0]?.max ?? 0)
    return `${prefix}-${String(max + 1 + bump).padStart(4, "0")}`
}

/**
 * A failed INSERT aborts the whole Postgres transaction, so the retry has to
 * re-run the transaction, not just the insert.
 */
export async function withNumberRetry<T>(field: string, run: (bump: number) => Promise<T>): Promise<T> {
    try {
        return await run(0)
    } catch (e) {
        if (!isUniqueErr(e, field)) throw e
        return run(1)
    }
}

// ─── Stock ledger ─────────────────────────────────────────────────────────────

export type StockTxnType = "OPENING" | "RECEIPT" | "ISSUE" | "RETURN" | "ADJUSTMENT" | "DAMAGED" | "LOST"

type StockTxnInput = {
    assetId: string
    type: StockTxnType
    qty: number                 // signed change to Asset.available
    quantityDelta?: number      // change to Asset.quantity (owned units), e.g. receipts, write-offs
    refType?: string | null
    refId?: string | null
    userId?: string | null
    note?: string | null
}

/**
 * Move Asset.available by `qty` and write the ledger row with the balance after
 * it. The guard lives in the UPDATE itself so two concurrent issues can't both
 * pass a read-then-write check and drive stock negative.
 */
export async function postStockTxn(tx: Tx, input: StockTxnInput) {
    const qty = Math.trunc(input.qty)
    const qd = Math.trunc(input.quantityDelta ?? 0)
    const rows = await tx.$queryRaw<{ available: number; quantity: number }[]>(Prisma.sql`
        UPDATE "Asset"
        SET "available" = "available" + ${qty},
            "quantity"  = GREATEST("quantity" + ${qd}, "available" + ${qty}),
            "updatedAt" = NOW()
        WHERE "id" = ${input.assetId} AND "available" + ${qty} >= 0
        RETURNING "available", "quantity"`)
    if (rows.length === 0) {
        const exists = await tx.asset.findUnique({ where: { id: input.assetId }, select: { available: true } })
        if (!exists) throw new WorkflowError(404, "Asset not found")
        throw new WorkflowError(400, "Not enough stock")
    }
    return tx.assetStockTxn.create({
        data: {
            assetId: input.assetId,
            type: input.type,
            qty,
            balanceAfter: rows[0].available,
            refType: input.refType ?? null,
            refId: input.refId ?? null,
            userId: input.userId ?? null,
            note: input.note ?? null,
        },
    })
}

/** Ledger row only, for legacy routes that already moved Asset.available themselves. */
export async function recordLedgerOnly(db: Db, input: Omit<StockTxnInput, "quantityDelta"> & { balanceAfter?: number }) {
    let balanceAfter = input.balanceAfter
    if (balanceAfter === undefined) {
        const a = await db.asset.findUnique({ where: { id: input.assetId }, select: { available: true } })
        balanceAfter = a?.available ?? 0
    }
    return db.assetStockTxn.create({
        data: {
            assetId: input.assetId, type: input.type, qty: input.qty, balanceAfter,
            refType: input.refType ?? null, refId: input.refId ?? null,
            userId: input.userId ?? null, note: input.note ?? null,
        },
    })
}

// ─── Audit ────────────────────────────────────────────────────────────────────

type AuditInput = {
    entity: "AssetRequest" | "AssetIssue" | "AssetStock" | "AssetMeta"
    entityId: string
    action: string
    userId?: string | null
    reason?: string | null
    before?: unknown
    after?: unknown
}

const toJson = (v: unknown) =>
    v === undefined || v === null ? Prisma.JsonNull : (JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue)

export async function audit(db: Db, a: AuditInput) {
    return db.assetAuditLog.create({
        data: {
            entity: a.entity, entityId: a.entityId, action: a.action,
            userId: a.userId ?? null, reason: a.reason ?? null,
            before: toJson(a.before), after: toJson(a.after),
        },
    })
}

// ─── Request fulfilment ───────────────────────────────────────────────────────

/** fulfilmentStatus from the items: units issued vs units approved. */
export async function recomputeRequestStatus(tx: Tx, requestId: string) {
    const items = await tx.assetRequestItem.findMany({
        where: { requestId }, select: { approvedQty: true, issuedQty: true },
    })
    const approved = items.reduce((s, i) => s + (i.approvedQty ?? 0), 0)
    const issued = items.reduce((s, i) => s + i.issuedQty, 0)
    const fulfilmentStatus = issued <= 0 ? "NOT_ISSUED" : issued >= approved ? "FULFILLED" : "PARTIALLY_ISSUED"
    await tx.assetRequest.update({ where: { id: requestId }, data: { fulfilmentStatus } })
    return fulfilmentStatus
}

// ─── Shared validation / shapes ───────────────────────────────────────────────

export const isUnassignableStatus = (status: string) =>
    (UNASSIGNABLE_EMPLOYEE_STATUSES as readonly string[]).includes(status)

export const employeeName = (e: { firstName: string; lastName: string }) =>
    `${e.firstName} ${e.lastName}`.trim()

export function unassignableEmployeeMessage(e: { firstName: string; lastName: string; status: string }) {
    return `${employeeName(e)} is ${e.status.toLowerCase()} and can't receive assets`
}

export const parseIntStrict = (v: unknown): number | null => {
    const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v
    return typeof n === "number" && Number.isInteger(n) ? n : null
}

// Users pick IST calendar days; the server runs in UTC.
export function istDayStart(d: string | null): Date | null {
    if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return null
    return new Date(`${d}T00:00:00.000+05:30`)
}
export function istDayEnd(d: string | null): Date | null {
    if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return null
    return new Date(`${d}T23:59:59.999+05:30`)
}
export function dateRange(from: string | null, to: string | null): { gte?: Date; lte?: Date } | undefined {
    const gte = istDayStart(from) ?? undefined
    const lte = istDayEnd(to) ?? undefined
    return gte || lte ? { ...(gte ? { gte } : {}), ...(lte ? { lte } : {}) } : undefined
}

export function pageParams(sp: URLSearchParams, defaultSize = 20) {
    const page = Math.max(1, parseInt(sp.get("page") || "1") || 1)
    const pageSize = Math.min(200, Math.max(1, parseInt(sp.get("pageSize") || String(defaultSize)) || defaultSize))
    return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize }
}

/** id → { id, name } for the User ids we store as plain strings. */
export async function userNames(db: Db, ids: (string | null | undefined)[]) {
    const uniq = Array.from(new Set(ids.filter((x): x is string => !!x)))
    if (!uniq.length) return new Map<string, { id: string; name: string }>()
    const users = await db.user.findMany({ where: { id: { in: uniq } }, select: { id: true, name: true } })
    return new Map(users.map(u => [u.id, u]))
}

// Request include + serializer, shared by list / detail / dashboard so the UI
// sees one shape everywhere.
export const requestInclude = {
    items: {
        orderBy: { id: "asc" as const },
        include: {
            employee: {
                select: {
                    id: true, employeeId: true, firstName: true, lastName: true, designation: true,
                    department: { select: { name: true } },
                    // Current site comes from the active deployment.
                    deployments: {
                        where: { isActive: true },
                        orderBy: { startDate: "desc" as const },
                        take: 1,
                        select: { site: { select: { name: true } } },
                    },
                },
            },
            asset: { select: { id: true, assetCode: true, name: true, category: true, available: true } },
        },
    },
} satisfies Prisma.AssetRequestInclude

type RequestRow = Prisma.AssetRequestGetPayload<{ include: typeof requestInclude }>

export function serializeRequest(r: RequestRow, users: Map<string, { id: string; name: string }>) {
    return {
        id: r.id,
        requestNo: r.requestNo,
        requestType: r.requestType,
        reason: r.reason,
        remarks: r.remarks,
        attachmentUrl: r.attachmentUrl,
        status: r.status,
        fulfilmentStatus: r.fulfilmentStatus,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        requestedBy: users.get(r.requestedBy) ?? { id: r.requestedBy, name: "Unknown" },
        decidedBy: r.decidedBy ? (users.get(r.decidedBy) ?? { id: r.decidedBy, name: "Unknown" }) : null,
        decidedAt: r.decidedAt,
        decisionNote: r.decisionNote,
        items: r.items.map(i => ({
            id: i.id,
            employee: {
                id: i.employee.id,
                employeeId: i.employee.employeeId,
                firstName: i.employee.firstName,
                lastName: i.employee.lastName,
                department: i.employee.department ? { name: i.employee.department.name } : null,
                designation: i.employee.designation,
                siteName: i.employee.deployments[0]?.site?.name ?? null,
            },
            asset: i.asset,
            size: i.size,
            requestedQty: i.requestedQty,
            approvedQty: i.approvedQty,
            issuedQty: i.issuedQty,
            remarks: i.remarks,
        })),
    }
}

export async function loadRequests(db: Db, args: Omit<Prisma.AssetRequestFindManyArgs, "include" | "select">) {
    const rows = await db.assetRequest.findMany({ ...args, include: requestInclude })
    const users = await userNames(db, rows.flatMap(r => [r.requestedBy, r.decidedBy]))
    return rows.map(r => serializeRequest(r, users))
}

export async function loadRequest(db: Db, id: string) {
    const [r] = await loadRequests(db, { where: { id } })
    return r ?? null
}

export const issueInclude = {
    employee: { select: { id: true, employeeId: true, firstName: true, lastName: true } },
    asset: { select: { id: true, assetCode: true, name: true, category: true } },
    requestItem: { select: { request: { select: { id: true, requestNo: true } } } },
} satisfies Prisma.AssetIssueInclude

type IssueRow = Prisma.AssetIssueGetPayload<{ include: typeof issueInclude }>

export function serializeIssue(i: IssueRow, users: Map<string, { id: string; name: string }>) {
    return {
        id: i.id,
        issueNo: i.issueNo,
        quantity: i.quantity,
        size: i.size,
        serialNo: i.serialNo,
        status: i.status,
        returnedQty: i.returnedQty,
        issuedAt: i.issuedAt,
        acknowledgedAt: i.acknowledgedAt,
        remarks: i.remarks,
        attachmentUrl: i.attachmentUrl,
        employeeAssetId: i.employeeAssetId,
        replacesIssueId: i.replacesIssueId,
        employee: i.employee,
        asset: i.asset,
        request: i.requestItem?.request ?? null,
        issuedBy: users.get(i.issuedBy) ?? { id: i.issuedBy, name: "Unknown" },
    }
}

export async function loadIssues(db: Db, args: Omit<Prisma.AssetIssueFindManyArgs, "include" | "select">) {
    const rows = await db.assetIssue.findMany({ ...args, include: issueInclude })
    const users = await userNames(db, rows.map(r => r.issuedBy))
    return rows.map(r => serializeIssue(r, users))
}

export async function loadIssue(db: Db, id: string) {
    const [i] = await loadIssues(db, { where: { id } })
    return i ?? null
}

// ─── Issue ────────────────────────────────────────────────────────────────────

type IssueInput = {
    employeeId: string
    assetId: string
    quantity: number
    size?: string | null
    serialNo?: string | null
    remarks?: string | null
    attachmentUrl?: string | null
    idempotencyKey?: string | null
    acknowledged?: boolean
    replacesIssueId?: string | null
    requestItemId?: string | null
    actorId: string
    refType: "REQUEST" | "DIRECT"
}

/**
 * Hand units to an employee. Writes the legacy EmployeeAsset too, so exit
 * clearance, "my assets" and the old assignment list keep seeing it. Must run
 * inside a transaction; stock is moved by postStockTxn's guarded UPDATE.
 */
export async function issueAssetTx(tx: Tx, input: IssueInput, bump = 0) {
    const meta = await tx.assetMeta.findUnique({ where: { assetId: input.assetId } })
    const serialNo = input.serialNo?.trim() || null
    if (meta?.trackSerial) {
        if (!serialNo) throw new WorkflowError(400, "Serial number is required for this asset")
        if (input.quantity !== 1) throw new WorkflowError(400, "Serial-tracked assets are issued one at a time")
        const clash = await tx.assetIssue.findFirst({
            where: { assetId: input.assetId, status: "ACTIVE", serialNo: { equals: serialNo, mode: "insensitive" } },
            select: { issueNo: true },
        })
        if (clash) throw new WorkflowError(409, `Serial ${serialNo} is already out on ${clash.issueNo}`)
    }

    const issueNo = await nextNumber(tx, "AssetIssue", "ISS", bump)
    const now = new Date()
    const ea = await tx.employeeAsset.create({
        data: {
            employeeId: input.employeeId,
            assetId: input.assetId,
            issuedBy: input.actorId,
            condition: "GOOD",
            notes: issueNo,
            isActive: true,
            issuedAt: now,
        },
    })
    const issue = await tx.assetIssue.create({
        data: {
            issueNo,
            requestItemId: input.requestItemId ?? null,
            employeeAssetId: ea.id,
            employeeId: input.employeeId,
            assetId: input.assetId,
            quantity: input.quantity,
            size: input.size ?? meta?.size ?? null,
            serialNo,
            issuedBy: input.actorId,
            issuedAt: now,
            // On-behalf acknowledgement: the issuer confirms the hand-over.
            acknowledgedAt: input.acknowledged ? now : null,
            acknowledgedBy: input.acknowledged ? input.actorId : null,
            idempotencyKey: input.idempotencyKey || null,
            remarks: input.remarks || null,
            attachmentUrl: input.attachmentUrl || null,
            replacesIssueId: input.replacesIssueId || null,
        },
    })
    await postStockTxn(tx, {
        assetId: input.assetId, type: "ISSUE", qty: -input.quantity,
        refType: input.refType, refId: issue.id, userId: input.actorId, note: issueNo,
    })
    await audit(tx, {
        entity: "AssetIssue", entityId: issue.id, action: "ISSUE", userId: input.actorId,
        after: { issueNo, quantity: input.quantity, serialNo, requestItemId: input.requestItemId ?? null, acknowledged: !!input.acknowledged },
    })
    return issue
}

/**
 * Return / close an issue. `units` outstanding come back; GOOD/FAIR go back on
 * the shelf, DAMAGED doesn't (ledger note only, and they stop counting as
 * owned stock). Shared by PATCH /api/assets/issues/[id] and the legacy return
 * routes so both keep the ledger and EmployeeAsset in step.
 */
export async function returnIssueTx(
    tx: Tx,
    opts: { issueId: string; quantity: number; condition: "GOOD" | "FAIR" | "DAMAGED"; note?: string | null; actorId: string; returnedAt?: Date },
) {
    const issue = await tx.assetIssue.findUnique({ where: { id: opts.issueId } })
    if (!issue) throw new WorkflowError(404, "Issue not found")
    if (issue.status !== "ACTIVE") throw new WorkflowError(409, `This issue is already ${issue.status.toLowerCase().replace("_", " ")}`)
    const outstanding = issue.quantity - issue.returnedQty
    if (!Number.isInteger(opts.quantity) || opts.quantity < 1 || opts.quantity > outstanding) {
        throw new WorkflowError(400, `Only ${outstanding} outstanding on this issue`)
    }

    // Guarded increment: a double-submitted return can't over-return.
    const updated = await tx.$queryRaw<{ returnedQty: number }[]>(Prisma.sql`
        UPDATE "AssetIssue" SET "returnedQty" = "returnedQty" + ${opts.quantity}
        WHERE "id" = ${issue.id} AND "status" = 'ACTIVE' AND "returnedQty" + ${opts.quantity} <= "quantity"
        RETURNING "returnedQty"`)
    if (updated.length === 0) throw new WorkflowError(409, "This issue changed — refresh and try again")
    const returnedQty = updated[0].returnedQty
    const full = returnedQty >= issue.quantity

    if (opts.condition === "DAMAGED") {
        await postStockTxn(tx, {
            assetId: issue.assetId, type: "DAMAGED", qty: 0, quantityDelta: -opts.quantity,
            refType: "ISSUE", refId: issue.id, userId: opts.actorId,
            note: `${opts.quantity} returned damaged on ${issue.issueNo}${opts.note ? ` — ${opts.note}` : ""}`,
        })
    } else {
        await postStockTxn(tx, {
            assetId: issue.assetId, type: "RETURN", qty: opts.quantity,
            refType: "ISSUE", refId: issue.id, userId: opts.actorId,
            note: `${issue.issueNo}${opts.note ? ` — ${opts.note}` : ""}`,
        })
    }

    if (full) {
        await tx.assetIssue.update({ where: { id: issue.id }, data: { status: "RETURNED" } })
        if (issue.employeeAssetId) {
            await tx.employeeAsset.updateMany({
                where: { id: issue.employeeAssetId, isActive: true },
                data: {
                    isActive: false, returnedAt: opts.returnedAt ?? new Date(), returnedTo: opts.actorId,
                    returnCondition: opts.condition,
                },
            })
        }
    }
    await audit(tx, {
        entity: "AssetIssue", entityId: issue.id, action: "RETURN", userId: opts.actorId, reason: opts.note ?? null,
        before: { status: issue.status, returnedQty: issue.returnedQty },
        after: { status: full ? "RETURNED" : "ACTIVE", returnedQty, quantity: opts.quantity, condition: opts.condition },
    })
    return { full, returnedQty }
}

/**
 * Close an issue without the units coming back (LOST / DAMAGED / WRITTEN_OFF /
 * REPLACED). Outstanding units leave owned stock, and the EmployeeAsset closes
 * so exit clearance stops listing it.
 */
export async function closeIssueTx(
    tx: Tx,
    opts: { issueId: string; status: "LOST" | "DAMAGED" | "WRITTEN_OFF" | "REPLACED"; note: string; actorId: string },
) {
    const issue = await tx.assetIssue.findUnique({ where: { id: opts.issueId } })
    if (!issue) throw new WorkflowError(404, "Issue not found")
    // Lost/damaged can still be written off later; nothing else re-opens.
    const allowedFrom = opts.status === "WRITTEN_OFF" ? ["ACTIVE", "LOST", "DAMAGED"] : ["ACTIVE"]
    if (!allowedFrom.includes(issue.status)) {
        throw new WorkflowError(409, `This issue is already ${issue.status.toLowerCase().replace("_", " ")}`)
    }
    const changed = await tx.assetIssue.updateMany({
        where: { id: issue.id, status: issue.status },
        data: { status: opts.status },
    })
    if (changed.count === 0) throw new WorkflowError(409, "This issue changed — refresh and try again")

    const outstanding = issue.quantity - issue.returnedQty
    // Units already written out (LOST/DAMAGED → WRITTEN_OFF) aren't counted twice.
    if (issue.status === "ACTIVE" && outstanding > 0) {
        await postStockTxn(tx, {
            assetId: issue.assetId, type: opts.status === "LOST" || opts.status === "WRITTEN_OFF" ? "LOST" : "DAMAGED",
            qty: 0, quantityDelta: -outstanding, refType: "ISSUE", refId: issue.id, userId: opts.actorId,
            note: `${outstanding} ${opts.status.toLowerCase().replace("_", " ")} on ${issue.issueNo} — ${opts.note}`,
        })
    }
    if (issue.employeeAssetId) {
        await tx.employeeAsset.updateMany({
            where: { id: issue.employeeAssetId, isActive: true },
            data: {
                isActive: false, returnedAt: new Date(), returnedTo: opts.actorId,
                returnCondition: opts.status === "LOST" || opts.status === "WRITTEN_OFF" ? "LOST" : "DAMAGED",
            },
        })
    }
    await audit(tx, {
        entity: "AssetIssue", entityId: issue.id, action: opts.status === "REPLACED" ? "REPLACE" : opts.status,
        userId: opts.actorId, reason: opts.note,
        before: { status: issue.status, returnedQty: issue.returnedQty },
        after: { status: opts.status, quantity: outstanding },
    })
    return { issue, outstanding }
}

// ─── Legacy route bridge ──────────────────────────────────────────────────────

/**
 * The old return routes call this first. If the EmployeeAsset came from the
 * workflow, the return goes through the issue (remaining quantity, ledger,
 * audit) and this returns true; otherwise — or before the migration — it
 * returns false and the caller keeps its legacy behaviour.
 */
export async function returnLinkedIssue(
    employeeAssetId: string,
    opts: { returnCondition?: string | null; note?: string | null; actorId: string; returnedAt?: Date },
): Promise<boolean> {
    const linked = await ifWorkflowInstalled(
        () => prisma.assetIssue.findUnique({ where: { employeeAssetId }, select: { id: true, status: true, quantity: true, returnedQty: true } }),
        "[ASSET_LEGACY_RETURN_LOOKUP]",
    )
    if (!linked) return false
    if (linked.status !== "ACTIVE") throw new WorkflowError(400, "Asset already returned")
    const remaining = linked.quantity - linked.returnedQty
    const cond = opts.returnCondition
    await prisma.$transaction(async tx => {
        if (cond === "LOST") {
            await closeIssueTx(tx, { issueId: linked.id, status: "LOST", note: opts.note || "Marked lost on return", actorId: opts.actorId })
        } else {
            await returnIssueTx(tx, {
                issueId: linked.id, quantity: remaining,
                condition: cond === "DAMAGED" ? "DAMAGED" : cond === "FAIR" ? "FAIR" : "GOOD",
                note: opts.note ?? null, actorId: opts.actorId, returnedAt: opts.returnedAt,
            })
        }
    })
    return true
}
