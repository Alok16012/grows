// Company profile — the company's own details and document library. Client-safe.

export type CompanyProfile = {
    legalName: string; brandName: string; incorporatedOn: string; cin: string; pan: string; tan: string
    gstins: { state: string; gstin: string }[]
    pfCode: string; esicCode: string; ptReg: string; lwfReg: string; msme: string; clraLicence: string
    registeredAddress: string; corporateAddress: string; phone: string; email: string; website: string
    directors: { name: string; din: string; role: string }[]
    bank: { accountName: string; bankName: string; branch: string; accountNumber: string; ifsc: string }
    /** Shown to every login (employees too). */
    publicNote: string
}

export const EMPTY_PROFILE: CompanyProfile = {
    legalName: "", brandName: "", incorporatedOn: "", cin: "", pan: "", tan: "", gstins: [],
    pfCode: "", esicCode: "", ptReg: "", lwfReg: "", msme: "", clraLicence: "",
    registeredAddress: "", corporateAddress: "", phone: "", email: "", website: "",
    directors: [], bank: { accountName: "", bankName: "", branch: "", accountNumber: "", ifsc: "" }, publicNote: "",
}

export type CompanySettings = { categories: string[]; expiryRemindDays: number }
export const DEFAULT_COMPANY_SETTINGS: CompanySettings = {
    categories: ["Registration & incorporation", "Tax (GST / PAN / TAN)", "Labour & statutory (PF / ESIC / PT / LWF / CLRA)", "Licences & certificates", "Contracts & agreements", "Insurance", "Bank", "Policies", "Other"],
    expiryRemindDays: 30,
}

export const VISIBILITY = {
    EVERYONE: "Everyone who can sign in",
    STAFF: "Staff with Company profile access",
    RESTRICTED: "Only those who can edit Company profile",
} as const
export type Visibility = keyof typeof VISIBILITY

const str = (v: unknown, max = 300) => typeof v === "string" ? v.trim().slice(0, max) : ""

export function sanitizeProfile(v: any): CompanyProfile {
    const e = EMPTY_PROFILE
    const out: any = {}
    for (const k of Object.keys(e) as (keyof CompanyProfile)[]) if (typeof e[k] === "string") out[k] = str(v?.[k], k.toLowerCase().includes("address") || k === "publicNote" ? 1000 : 200)
    out.gstins = Array.isArray(v?.gstins) ? v.gstins.slice(0, 40).map((g: any) => ({ state: str(g?.state, 60), gstin: str(g?.gstin, 20).toUpperCase() })).filter((g: any) => g.gstin) : []
    out.directors = Array.isArray(v?.directors) ? v.directors.slice(0, 30).map((d: any) => ({ name: str(d?.name, 100), din: str(d?.din, 20), role: str(d?.role, 60) })).filter((d: any) => d.name) : []
    out.bank = { accountName: str(v?.bank?.accountName, 120), bankName: str(v?.bank?.bankName, 120), branch: str(v?.bank?.branch, 120), accountNumber: str(v?.bank?.accountNumber, 30), ifsc: str(v?.bank?.ifsc, 15).toUpperCase() }
    out.pan = out.pan.toUpperCase(); out.tan = out.tan.toUpperCase(); out.cin = out.cin.toUpperCase()
    return out as CompanyProfile
}

export function sanitizeCompanySettings(v: any): CompanySettings {
    const d = DEFAULT_COMPANY_SETTINGS
    const cats = Array.isArray(v?.categories) ? Array.from(new Set(v.categories.map((c: unknown) => str(c, 80)).filter(Boolean))).slice(0, 40) as string[] : d.categories
    const n = Math.round(Number(v?.expiryRemindDays))
    return { categories: cats.length ? cats : d.categories, expiryRemindDays: Number.isFinite(n) && v?.expiryRemindDays !== "" && v?.expiryRemindDays !== null ? Math.max(0, Math.min(365, n)) : d.expiryRemindDays }
}
