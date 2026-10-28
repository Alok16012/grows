// Policy text helpers shared by the browser, the API and the signed PDF.
//
// Policy content is plain text, not HTML: the same words are shown to every
// joiner and stamped into a signed PDF, so there is nothing to sanitise and no
// way to inject script. A little structure is read from the text itself:
//
//   # Heading            → heading
//   - item / * item      → bullet
//   1. item              → numbered item
//   blank line           → paragraph break
//
// Kept free of server imports so client components can use it.

export type PolicyBlock =
    | { kind: "heading"; text: string }
    | { kind: "bullet"; text: string }
    | { kind: "numbered"; n: string; text: string }
    | { kind: "para"; text: string }

// Categories follow the app's modules. The category also decides WHERE a policy
// is signed: "Onboarding" policies are read and signed while joining (the
// onboarding form, the joining link and self-onboarding); every other category
// is signed afterwards from the employee's profile → My Policies.
export const ONBOARDING_CATEGORY = "Onboarding"

export const POLICY_CATEGORIES = [
    ONBOARDING_CATEGORY, "HR", "Code of Conduct", "Safety", "IT & Data", "Compliance",
    "Leave & Attendance", "Payroll & Expenses", "Exit", "Other",
] as const

/** Which policies a screen asks for: everything, or only the joining ones. */
export type PolicyScope = "all" | "onboarding"

export function isOnboardingCategory(category: string | null | undefined): boolean {
    return (category ?? "").trim().toLowerCase() === ONBOARDING_CATEGORY.toLowerCase()
}

/** Where employees meet a policy of this category — shown to HR in the editor and list. */
export function categorySignedOn(category: string | null | undefined): string {
    return isOnboardingCategory(category)
        ? "Signed while joining: onboarding form, joining link and self-onboarding"
        : "Signed by employees from Profile → My Policies"
}

export const SIGNOFF_MISSING_MESSAGE =
    "Policy sign-off isn't set up yet — run scripts/policy-signoff.sql in the Supabase SQL editor."

/** Lower-cased, single-spaced: Employee.designation is free text. */
export function designationKey(s: string | null | undefined): string {
    return (s ?? "").trim().replace(/\s+/g, " ").toLowerCase()
}

/** For comparing a typed signature with the name on record. */
export function nameKey(s: string | null | undefined): string {
    return (s ?? "").normalize("NFKC").trim().replace(/[.\s]+/g, " ").trim().toLowerCase()
}

/** Line endings and trailing spaces normalised, so the hash doesn't depend on the browser. */
export function normalizePolicyText(s: string): string {
    return s.replace(/\r\n?/g, "\n").split("\n").map(l => l.replace(/\s+$/, "")).join("\n").trim()
}

export function policyBlocks(text: string): PolicyBlock[] {
    const out: PolicyBlock[] = []
    let para: string[] = []
    const flush = () => {
        if (para.length) out.push({ kind: "para", text: para.join(" ") })
        para = []
    }
    for (const raw of normalizePolicyText(text).split("\n")) {
        const line = raw.trim()
        if (!line) { flush(); continue }
        let m: RegExpMatchArray | null
        if ((m = line.match(/^#{1,3}\s+(.*)$/))) { flush(); out.push({ kind: "heading", text: m[1] }); continue }
        if ((m = line.match(/^[-*•]\s+(.*)$/))) { flush(); out.push({ kind: "bullet", text: m[1] }); continue }
        if ((m = line.match(/^(\d{1,3})[.)]\s+(.*)$/))) { flush(); out.push({ kind: "numbered", n: m[1], text: m[2] }); continue }
        para.push(line)
    }
    flush()
    return out
}

export type PolicyStatus = "TO_READ" | "READY" | "SIGNED"

/** One required policy as the signing screen sees it. */
export type RequiredPolicy = {
    policyId: string
    versionId: string
    versionNo: number
    title: string
    category: string | null
    content: string
    contentHash: string
    attachmentUrl: string | null
    effectiveFrom: string | null
    status: PolicyStatus
    scrolledAt: string | null
    signedAt: string | null
    signedVersionNo: number | null
    ackId: string | null
}
