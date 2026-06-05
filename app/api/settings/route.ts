import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const key = searchParams.get("key")
  try {
    if (key) {
      const s = await (prisma as any).appSetting.findUnique({ where: { key } })
      return NextResponse.json({ key, value: s?.value ?? null })
    }
    const all = await (prisma as any).appSetting.findMany()
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
    const s = await (prisma as any).appSetting.upsert({
      where: { key },
      update: { value: String(value), updatedBy: session.user.id },
      create: { key, value: String(value), updatedBy: session.user.id },
    })
    return NextResponse.json(s)
  } catch (e) {
    console.error("[SETTINGS_POST]", e)
    return new NextResponse("Internal Error", { status: 500 })
  }
}
