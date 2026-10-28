// One A–Z order for site names everywhere sites are listed or picked (Sites,
// Projects, Assignments, Field Tasks…). Case and accents are ignored, so
// "ABC SITE" and "abc site" sit together, and numbers sort naturally
// ("Plant 2" before "Plant 10"). Ties fall back to the site code.
// Safe for both server and client code.

const collator = new Intl.Collator("en", { sensitivity: "base", numeric: true })

type SiteLike = { name?: string | null; code?: string | null }

export function compareSiteNames(a: SiteLike, b: SiteLike): number {
    return collator.compare((a.name ?? "").trim(), (b.name ?? "").trim())
        || collator.compare(a.code ?? "", b.code ?? "")
}

/** A sorted copy (A–Z by name); the input is left untouched. Non-arrays give []. */
export function sortSitesByName<T extends SiteLike>(list: T[] | null | undefined): T[] {
    return Array.isArray(list) ? [...list].sort(compareSiteNames) : []
}
