// Exit → settings. Client-safe.

export const EXIT_AUTO = {
    ASSETS: "All issued items returned (Assets)",
    EXPENSES: "No unpaid expense claims",
    ADVANCES: "Expense advances settled",
    LOGIN: "Login closed",
} as const
export type ExitAuto = keyof typeof EXIT_AUTO

export type ClearanceTpl = { id: string; title: string; owner: string; auto: ExitAuto | null }

export type ExitSettings = {
    /** Leaving only through an exit (Terminate / Resign); a bare status change to Resigned / Terminated is refused. */
    mustUseExit: boolean
    /** Employees can hand in their resignation from My Profile. */
    selfResign: boolean
    /** Notice period when none is given. */
    defaultNoticeDays: number
    /** Clearance checklist for new exits; automatic ones tick themselves. */
    clearance: ClearanceTpl[]
    /** F&F must be approved before it can be paid. */
    fnfApproval: boolean
    /** The approver must be someone other than whoever prepared the F&F (Admins excepted). */
    makerChecker: boolean
    /** Letters issued once the F&F is paid (HR document types; empty = none). */
    relievingTypeId: string | null
    experienceTypeId: string | null
}

const t = (id: string, title: string, owner: string, auto: ExitAuto | null): ClearanceTpl => ({ id, title, owner, auto })
export const DEFAULT_EXIT_SETTINGS: ExitSettings = {
    mustUseExit: true,
    selfResign: true,
    defaultNoticeDays: 30,
    clearance: [
        t("idcard", "ID card returned", "HR", null),
        t("assets", "Uniform, PPE and tools returned", "Stores", "ASSETS"),
        t("keys", "Access card / keys returned", "Admin", null),
        t("handover", "Site handover to replacement", "Operations", null),
        t("expenses", "Expense claims settled", "Finance", "EXPENSES"),
        t("advances", "Expense advances settled", "Finance", "ADVANCES"),
        t("pf", "PF withdrawal / transfer form given", "HR", null),
        t("login", "Login closed", "HR", "LOGIN"),
    ],
    fnfApproval: true,
    makerChecker: true,
    relievingTypeId: null,
    experienceTypeId: null,
}

export function sanitizeExitSettings(v: any): ExitSettings {
    const d = DEFAULT_EXIT_SETTINGS
    const b = (x: unknown, def: boolean) => typeof x === "boolean" ? x : def
    const n = Math.round(Number(v?.defaultNoticeDays))
    const clearance: ClearanceTpl[] = Array.isArray(v?.clearance)
        ? v.clearance.slice(0, 40).flatMap((x: any): ClearanceTpl[] => {
            const title = String(x?.title ?? "").trim().slice(0, 120)
            if (!title) return []
            return [{ id: typeof x.id === "string" && /^[\w-]{2,40}$/.test(x.id) ? x.id : `c${Math.random().toString(36).slice(2, 9)}`, title, owner: String(x.owner ?? "HR").trim().slice(0, 40) || "HR", auto: x.auto && x.auto in EXIT_AUTO ? x.auto : null }]
        })
        : d.clearance
    const id = (x: unknown) => typeof x === "string" && x ? x : null
    return {
        mustUseExit: b(v?.mustUseExit, d.mustUseExit), selfResign: b(v?.selfResign, d.selfResign),
        defaultNoticeDays: Number.isFinite(n) && v?.defaultNoticeDays !== null && v?.defaultNoticeDays !== "" ? Math.min(365, Math.max(0, n)) : d.defaultNoticeDays,
        clearance, fnfApproval: b(v?.fnfApproval, d.fnfApproval), makerChecker: b(v?.makerChecker, d.makerChecker),
        relievingTypeId: v && "relievingTypeId" in v ? id(v.relievingTypeId) : d.relievingTypeId,
        experienceTypeId: v && "experienceTypeId" in v ? id(v.experienceTypeId) : d.experienceTypeId,
    }
}
