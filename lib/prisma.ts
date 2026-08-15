import { PrismaClient } from "@prisma/client"

// Prisma reads DATABASE_URL automatically from prisma/schema.prisma's env()
// declaration. Don't pass `datasources` explicitly here — doing so forces
// Prisma to validate the URL at module-load time, which crashes Vercel's
// "collect page data" build step when DATABASE_URL isn't yet injected.
const makePrismaClient = () =>
    new PrismaClient({
        log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    }).$extends({
        /**
         * Result extension – transform the `photo` field for every Employee
         * record before it leaves the server.
         *
         * • base64 data URI  → /api/photo/<id>   (keeps API response payload tiny)
         * • HTTP/S URL       → pass through unchanged (Supabase public URL)
         * • null / undefined → null
         *
         * The /api/photo/[id] route bypasses this extension via $queryRaw so it
         * can always read the raw DB value and stream the actual image bytes.
         */
        result: {
            employee: {
                photo: {
                    needs: { id: true, photo: true },
                    compute(data) {
                        if (!data.photo) return null
                        // Already a proper URL (Supabase, CDN, etc.) – use as-is
                        if (data.photo.startsWith("http")) return data.photo
                        // Base64 data URI – replace with a slim API route URL
                        if (data.photo.startsWith("data:")) return `/api/photo/${data.id}`
                        return data.photo
                    },
                },
            },
        },
    })

type PrismaClientExtended = ReturnType<typeof makePrismaClient>

declare global {
    // eslint-disable-next-line no-var
    var prismaGlobal: undefined | PrismaClientExtended
}

const prisma: PrismaClientExtended =
    globalThis.prismaGlobal ?? makePrismaClient()

export default prisma

if (process.env.NODE_ENV !== "production") globalThis.prismaGlobal = prisma

// ── Project workflow columns (code/status/type/priority/dates) ──────────────
// Added to the Prisma model after prod was provisioned; migrations don't run
// on deploy there, so the client would SELECT missing columns and 500 every
// Project read. Create them idempotently: project routes await this, and the
// fire-and-forget below heals cold starts before any other route touches
// Project.
let projectSchemaEnsured = false
// The in-flight run, so concurrent callers await the SAME work. The boolean
// alone only flips after every statement finishes, so on a cold start the
// fire-and-forget below and the first request each kicked off their own copy of
// the DDL — five ALTER TABLE round trips, twice, before the page could load.
let projectSchemaInFlight: Promise<void> | null = null

export async function ensureProjectSchema(): Promise<void> {
    if (projectSchemaEnsured) return
    if (projectSchemaInFlight) return projectSchemaInFlight
    projectSchemaInFlight = runProjectSchemaHeal().finally(() => {
        projectSchemaInFlight = null
    })
    return projectSchemaInFlight
}

async function runProjectSchemaHeal(): Promise<void> {
    try {
        await (prisma as any).$executeRawUnsafe(`
            ALTER TABLE "Project"
                ADD COLUMN IF NOT EXISTS "code"        TEXT,
                ADD COLUMN IF NOT EXISTS "status"      TEXT NOT NULL DEFAULT 'ACTIVE',
                ADD COLUMN IF NOT EXISTS "projectType" TEXT,
                ADD COLUMN IF NOT EXISTS "priority"    TEXT,
                ADD COLUMN IF NOT EXISTS "startDate"   TIMESTAMP(3),
                ADD COLUMN IF NOT EXISTS "endDate"     TIMESTAMP(3)
        `)
        await (prisma as any).$executeRawUnsafe(`
            ALTER TABLE "Assignment"
                ADD COLUMN IF NOT EXISTS "code"        TEXT,
                ADD COLUMN IF NOT EXISTS "startDate"   TIMESTAMP(3),
                ADD COLUMN IF NOT EXISTS "notes"       TEXT,
                ADD COLUMN IF NOT EXISTS "isMultiPart" BOOLEAN NOT NULL DEFAULT false
        `)
        await (prisma as any).$executeRawUnsafe(`
            ALTER TABLE "FormTemplate"
                ADD COLUMN IF NOT EXISTS "reportRole" TEXT
        `)
        // Company/Branch concepts are retired — projects hang off Sites and
        // sites/departments stand alone. Legacy columns stay but become
        // nullable so new rows never need them. DROP NOT NULL is idempotent.
        for (const sql of [
            `ALTER TABLE "Project" ALTER COLUMN "companyId" DROP NOT NULL`,
            `ALTER TABLE "Site" ALTER COLUMN "branchId" DROP NOT NULL`,
            `ALTER TABLE "Department" ALTER COLUMN "branchId" DROP NOT NULL`,
        ]) {
            try {
                await (prisma as any).$executeRawUnsafe(sql)
            } catch { /* table may not exist yet in some envs */ }
        }
        projectSchemaEnsured = true
    } catch { /* best effort — retried on next call */ }
}

// Heal on cold start without blocking module load.
void ensureProjectSchema()
