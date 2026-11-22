// Company profile — storage (details in AppSetting, documents in CompanyDocument),
// who may see what, and expiry reminders.
import prisma from "@/lib/prisma"
import { has, type Access } from "@/lib/access"
import { notifyApprovers } from "@/lib/hr-notify"
import { sanitizeProfile, sanitizeCompanySettings, EMPTY_PROFILE, type CompanyProfile, type CompanySettings, type Visibility } from "@/lib/company-profile"
import { COMPANY } from "@/lib/company"

const P_KEY = "companyProfile", S_KEY = "companyProfileSettings"

export async function getProfile(): Promise<CompanyProfile> {
    try {
        const r = await prisma.appSetting.findUnique({ where: { key: P_KEY } })
        if (r?.value) return sanitizeProfile(JSON.parse(r.value))
    } catch { /* default */ }
    return { ...EMPTY_PROFILE, legalName: COMPANY.legalName, brandName: COMPANY.name }
}
export async function saveProfile(v: unknown, userId: string) {
    const s = sanitizeProfile(v)
    await prisma.appSetting.upsert({ where: { key: P_KEY }, update: { value: JSON.stringify(s), updatedBy: userId }, create: { key: P_KEY, value: JSON.stringify(s), updatedBy: userId } })
    return s
}
export async function getCompanySettings(): Promise<CompanySettings> {
    try { const r = await prisma.appSetting.findUnique({ where: { key: S_KEY } }); return sanitizeCompanySettings(r?.value ? JSON.parse(r.value) : {}) } catch { return sanitizeCompanySettings({}) }
}
export async function saveCompanySettings(v: unknown, userId: string) {
    const s = sanitizeCompanySettings(v)
    await prisma.appSetting.upsert({ where: { key: S_KEY }, update: { value: JSON.stringify(s), updatedBy: userId }, create: { key: S_KEY, value: JSON.stringify(s), updatedBy: userId } })
    return s
}

export const canView = (a: Access) => a.isAdmin || has(a, "company.view") || has(a, "company.edit")
export const canEdit = (a: Access) => a.isAdmin || has(a, "company.edit")
export const canUpload = (a: Access) => a.isAdmin || has(a, "company.create") || has(a, "company.edit")
export const canDelete = (a: Access) => a.isAdmin || has(a, "company.delete")

/** Visibility levels this person may see. */
export function visibleLevels(a: Access): Visibility[] {
    if (canEdit(a)) return ["EVERYONE", "STAFF", "RESTRICTED"]
    if (canView(a)) return ["EVERYONE", "STAFF"]
    return ["EVERYONE"]
}

/** The profile as this person may see it: bank details only for editors; everything but the public note for viewers. */
export function profileFor(p: CompanyProfile, a: Access): Partial<CompanyProfile> {
    if (canEdit(a)) return p
    if (canView(a)) return { ...p, bank: { ...p.bank, accountNumber: p.bank.accountNumber ? `XXXX${p.bank.accountNumber.slice(-4)}` : "" } }
    return { legalName: p.legalName, brandName: p.brandName, corporateAddress: p.corporateAddress, phone: p.phone, email: p.email, website: p.website, publicNote: p.publicNote }
}

/** Daily: documents expiring within the reminder window (or expired) → one note to editors. */
export async function remindExpiringDocs(now = new Date()) {
    const s = await getCompanySettings()
    if (!s.expiryRemindDays) return 0
    const until = new Date(now.getTime() + s.expiryRemindDays * 86_400_000)
    const docs = await prisma.companyDocument.findMany({ where: { isArchived: false, expiresOn: { not: null, lte: until } }, select: { title: true, expiresOn: true }, orderBy: { expiresOn: "asc" }, take: 20 }).catch(() => [])
    if (!docs.length) return 0
    const fmt = (d: Date) => d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
    const expired = docs.filter(d => d.expiresOn! < now), soon = docs.filter(d => d.expiresOn! >= now)
    await notifyApprovers(["company.edit"], {
        title: expired.length ? "Company documents expired" : "Company documents expiring soon",
        message: [expired.length ? `Expired: ${expired.slice(0, 4).map(d => `${d.title} (${fmt(d.expiresOn!)})`).join(", ")}` : "", soon.length ? `Expiring: ${soon.slice(0, 4).map(d => `${d.title} (${fmt(d.expiresOn!)})`).join(", ")}` : ""].filter(Boolean).join(". "),
        type: "company", link: "/company?tab=documents",
    })
    return docs.length
}
