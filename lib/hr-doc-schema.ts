import prisma from "@/lib/prisma"

// The recall feature added an enum value + audit columns to HrDocument after
// prod was provisioned. Migrations don't run on deploy (DIRECT_URL unset), so
// once the Prisma client is regenerated it starts SELECTing these columns on
// every read — which would 500 until the columns actually exist. This helper
// creates them idempotently and MUST be awaited before any HrDocument read or
// write. Cached per warm instance so it's a no-op after the first call.
let ensured = false

export async function ensureHrDocRecallSchema() {
    if (ensured) return
    try {
        // ADD VALUE must be its own auto-committed statement (executeRawUnsafe
        // autocommits) and can't be used in the same tx it's created in.
        await (prisma as any).$executeRawUnsafe(
            `ALTER TYPE "HrDocStatus" ADD VALUE IF NOT EXISTS 'RECALLED'`
        )
    } catch { /* value may already exist — safe to ignore */ }
    try {
        await (prisma as any).$executeRawUnsafe(`
            ALTER TABLE "HrDocument"
                ADD COLUMN IF NOT EXISTS "recalledBy"   TEXT,
                ADD COLUMN IF NOT EXISTS "recalledAt"   TIMESTAMP(3),
                ADD COLUMN IF NOT EXISTS "recallReason" TEXT,
                ADD COLUMN IF NOT EXISTS "recallCount"  INTEGER NOT NULL DEFAULT 0,
                ADD COLUMN IF NOT EXISTS "history"      JSONB,
                ADD COLUMN IF NOT EXISTS "signature"    TEXT
        `)
        // Per-sender saved signature. Kept OUT of the Prisma User model on
        // purpose: User rows are read during login, before any ensure runs,
        // so a schema-modelled column would 500 auth until it exists. All
        // access goes through the raw helpers below instead.
        await (prisma as any).$executeRawUnsafe(`
            ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "signature" TEXT
        `)
        ensured = true
    } catch { /* best effort */ }
}

// Read a user's saved signature (data URL) — raw because the column is
// deliberately not in the Prisma User model (see ensureHrDocRecallSchema).
export async function getUserSignature(userId: string): Promise<string | null> {
    try {
        const rows = await (prisma as any).$queryRawUnsafe(
            `SELECT "signature" FROM "User" WHERE "id" = $1 LIMIT 1`, userId
        ) as { signature: string | null }[]
        return rows[0]?.signature ?? null
    } catch {
        return null
    }
}

export async function setUserSignature(userId: string, signature: string | null): Promise<void> {
    await (prisma as any).$executeRawUnsafe(
        `UPDATE "User" SET "signature" = $1 WHERE "id" = $2`, signature, userId
    )
}

export type HrDocHistoryEvent = {
    action: string
    by: string
    byName: string
    at: string
    reason?: string
}
