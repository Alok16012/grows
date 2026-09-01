import prisma from "@/lib/prisma"
import { schemaSelfHealEnabled } from "@/lib/schema-selfheal"

// The SiteAssignment table (the "Whole Site" grant behind the Assignments
// wizard) was never created in prod, where migrations are applied manually —
// so whole-site assignments silently failed to persist there. This creates
// the table idempotently at runtime, mirroring prisma/schema.prisma's
// SiteAssignment model exactly. Same pattern as lib/hr-doc-schema.ts.
// Cached per warm instance so it's a no-op after the first call.
let ensured = false

export async function ensureSiteAssignmentSchema() {
    // Off in production — see lib/schema-selfheal.ts.
    if (!schemaSelfHealEnabled()) return
    if (ensured) return
    try {
        await (prisma as any).$executeRawUnsafe(`
            CREATE TABLE IF NOT EXISTS "SiteAssignment" (
                "id" TEXT NOT NULL,
                "siteId" TEXT NOT NULL,
                "inspectionBoyId" TEXT NOT NULL,
                "assignedBy" TEXT NOT NULL,
                "recurrenceType" TEXT NOT NULL DEFAULT 'none',
                "status" TEXT NOT NULL DEFAULT 'active',
                "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT "SiteAssignment_pkey" PRIMARY KEY ("id")
            )
        `)
        await (prisma as any).$executeRawUnsafe(
            `CREATE UNIQUE INDEX IF NOT EXISTS "SiteAssignment_siteId_inspectionBoyId_key" ON "SiteAssignment"("siteId", "inspectionBoyId")`
        )
        await (prisma as any).$executeRawUnsafe(
            `CREATE INDEX IF NOT EXISTS "SiteAssignment_siteId_idx" ON "SiteAssignment"("siteId")`
        )
        await (prisma as any).$executeRawUnsafe(
            `CREATE INDEX IF NOT EXISTS "SiteAssignment_inspectionBoyId_idx" ON "SiteAssignment"("inspectionBoyId")`
        )

        // Postgres has no ADD CONSTRAINT IF NOT EXISTS — each FK runs on its
        // own and "already exists" errors are expected after the first run.
        // Actions mirror Prisma's defaults (Cascade from the schema for Site,
        // Restrict for required User relations).
        for (const sql of [
            `ALTER TABLE "SiteAssignment" ADD CONSTRAINT "SiteAssignment_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
            `ALTER TABLE "SiteAssignment" ADD CONSTRAINT "SiteAssignment_inspectionBoyId_fkey" FOREIGN KEY ("inspectionBoyId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE`,
            `ALTER TABLE "SiteAssignment" ADD CONSTRAINT "SiteAssignment_assignedBy_fkey" FOREIGN KEY ("assignedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE`,
        ]) {
            try {
                await (prisma as any).$executeRawUnsafe(sql)
            } catch { /* constraint already exists */ }
        }

        ensured = true
    } catch { /* best effort — callers still guard their own writes */ }
}
