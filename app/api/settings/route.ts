import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"

// Prod migrations don't always run on this project (DIRECT_URL isn't configured
// on Vercel, so `prisma migrate deploy` is skipped at build time). To stay
// consistent with the rest of the codebase's self-healing approach, make sure
// the AppSetting table exists before we touch it. CREATE TABLE IF NOT EXISTS is
// idempotent and matches migration 20260601100000.
async function ensureAppSettingTable() {
  await (prisma as any).$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "AppSetting" (
      "key"       TEXT NOT NULL,
      "value"     TEXT NOT NULL DEFAULT '',
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedBy" TEXT,
      CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("key")
    );
  `)
}

// Run a Prisma op; if it fails because the table is missing (P2021), create the
// table once and retry.
async function withTable<T>(op: () => Promise<T>): Promise<T> {
  try {
    return await op()
  } catch (e: any) {
    if (e?.code === "P2021") {
      await ensureAppSettingTable()
      return await op()
    }
    throw e
  }
}

export async function GET(req: Request) {
  // API routes are NOT covered by middleware, so without this check the whole
  // AppSetting table is readable by anyone on the internet. Any signed-in user
  // may read settings; writes stay gated in POST below.
  const session = await getServerSession(authOptions)
  if (!session) return new NextResponse("Unauthorized", { status: 401 })

  const { searchParams } = new URL(req.url)
  const key = searchParams.get("key")
  try {
    if (key) {
      const s = await withTable<any>(() => (prisma as any).appSetting.findUnique({ where: { key } }))
      return NextResponse.json({ key, value: s?.value ?? null })
    }
    const all = await withTable<any>(() => (prisma as any).appSetting.findMany())
    return NextResponse.json(all)
  } catch { return NextResponse.json({ key, value: null }) }
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return new NextResponse("Forbidden", { status: 403 })

  const { key, value } = await req.json()
  if (!key) return new NextResponse("key required", { status: 400 })

  // Permission-driven (no hardcoded MANAGER/HR_MANAGER). ADMIN can write any
  // setting; travel per-km rates may also be set by anyone who can manage
  // expenses (the expense rate-setting UI is gated on expenses.manage).
  const perms = session.user.permissions ?? []
  const canWrite =
    session.user.role === "ADMIN" ||
    (key.startsWith("TRAVEL_PER_KM_RATE") && perms.includes("expenses.manage"))
  if (!canWrite) return new NextResponse("Forbidden", { status: 403 })
  try {
    const s = await withTable<any>(() => (prisma as any).appSetting.upsert({
      where: { key },
      update: { value: String(value), updatedBy: session.user.id },
      create: { key, value: String(value), updatedBy: session.user.id },
    }))
    return NextResponse.json(s)
  } catch (e: any) {
    console.error("[SETTINGS_POST]", e)
    // Return the real reason (Prisma code/message) so the client can show it
    // — this is an internal admin app, not public-facing.
    const detail = e?.code ? `${e.code} ${e?.message ?? ""}`.trim() : (e?.message ?? "Internal Error")
    return new NextResponse(detail, { status: 500 })
  }
}
