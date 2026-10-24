/**
 * Employment type is a free-text column, and the imports have written every
 * spelling under the sun: "CONTRACT", "Contractual", "FULL_TIME", "Full Time",
 * "Permanent", "Daily", "Daily Wages"… The filter dropdown sends "Contract",
 * which matched one of them. Everything that reads or writes the column goes
 * through here, so new rows are canonical and old rows still filter.
 */

export const EMPLOYMENT_TYPES = ["Full-time", "Part-time", "Contract", "Daily Wage"] as const
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number]

// Raw spellings seen in the data, keyed by their canonical form. Matching is
// done on a folded key (lower-case, no spaces / hyphens / underscores), so
// "FULL_TIME", "Full Time" and "full-time" all hit the same entry.
const VARIANTS: Record<EmploymentType, string[]> = {
    "Full-time":  ["Full-time", "Full Time", "FULL_TIME", "Fulltime", "Permanent", "Regular"],
    "Part-time":  ["Part-time", "Part Time", "PART_TIME", "Parttime"],
    "Contract":   ["Contract", "CONTRACT", "Contractual", "Contractor", "Contract Basis"],
    "Daily Wage": ["Daily Wage", "Daily Wages", "DAILY_WAGE", "Daily", "Daily Wager", "Daily Rated"],
}

const fold = (s: string) => s.toLowerCase().replace(/[\s_-]+/g, "")

const LOOKUP: Record<string, EmploymentType> = {}
for (const canonical of EMPLOYMENT_TYPES) {
    for (const v of VARIANTS[canonical]) LOOKUP[fold(v)] = canonical
}

/** "Contractual" → "Contract"; an unrecognised value comes back trimmed, unchanged. */
export function normalizeEmploymentType(raw: string | null | undefined): string {
    const trimmed = (raw ?? "").trim()
    if (!trimmed) return trimmed
    return LOOKUP[fold(trimmed)] ?? trimmed
}

/**
 * Every raw spelling that maps to a canonical type (the canonical itself
 * first), for an `equals … insensitive` OR in a where. A value that isn't
 * canonical returns just itself, so filtering by a legacy string still works.
 */
export function employmentTypeVariants(canonical: string): string[] {
    const key = normalizeEmploymentType(canonical) as EmploymentType
    const list = VARIANTS[key]
    if (!list) return [canonical.trim()]
    return Array.from(new Set([key, ...list]))
}
