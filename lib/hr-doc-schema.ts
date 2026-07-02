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
                ADD COLUMN IF NOT EXISTS "history"      JSONB
        `)
        ensured = true
    } catch { /* best effort */ }
}

export type HrDocHistoryEvent = {
    action: string
    by: string
    byName: string
    at: string
    reason?: string
}
