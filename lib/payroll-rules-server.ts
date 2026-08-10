// Server-side loading/saving of the configurable payroll rules.
// Kept separate from lib/payroll-rules.ts so client bundles never pull Prisma.
import prisma from "./prisma"
import {
    DEFAULT_PAYROLL_RULES,
    PAYROLL_RULES_SETTING_KEY,
    PayrollRules,
    sanitizePayrollRules,
} from "./payroll-rules"

// Prod migrations don't always run on this project (DIRECT_URL isn't configured
// on Vercel), so like app/api/settings we self-heal the AppSetting table before
// touching it. Idempotent, matches migration 20260601100000.
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

// Returns the company's payroll rules, falling back to the verified Growus
// defaults when nothing is stored or the stored JSON is unreadable. Payroll
// must never fail because of a bad settings row.
export async function getPayrollRules(): Promise<{ rules: PayrollRules; customized: boolean }> {
    try {
        const row = await withTable<any>(() =>
            (prisma as any).appSetting.findUnique({ where: { key: PAYROLL_RULES_SETTING_KEY } })
        )
        if (!row?.value) return { rules: DEFAULT_PAYROLL_RULES, customized: false }
        return { rules: sanitizePayrollRules(JSON.parse(row.value)), customized: true }
    } catch (e) {
        console.error("[PAYROLL_RULES_LOAD]", e)
        return { rules: DEFAULT_PAYROLL_RULES, customized: false }
    }
}

export async function savePayrollRules(input: unknown, userId: string): Promise<PayrollRules> {
    const rules = sanitizePayrollRules(input)
    const value = JSON.stringify(rules)
    await withTable(() =>
        (prisma as any).appSetting.upsert({
            where: { key: PAYROLL_RULES_SETTING_KEY },
            update: { value, updatedBy: userId },
            create: { key: PAYROLL_RULES_SETTING_KEY, value, updatedBy: userId },
        })
    )
    return rules
}

export async function resetPayrollRules(): Promise<PayrollRules> {
    await withTable(() =>
        (prisma as any).appSetting.deleteMany({ where: { key: PAYROLL_RULES_SETTING_KEY } })
    )
    return DEFAULT_PAYROLL_RULES
}
