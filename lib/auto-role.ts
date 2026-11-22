// People → Masters → Login role by designation. Client-safe.
import { foldDesignation } from "@/lib/people-masters"

export type AutoRoleSettings = {
    /** Give logins the role of their designation. */
    enabled: boolean
    /** Folded standard designation name → custom role id. */
    map: Record<string, string>
    /** Role for designations with no mapping (null = leave them without). */
    defaultRoleId: string | null
    /** When the designation changes, move the login to the new designation's role. */
    followDesignation: boolean
    /** Roles never changed automatically (e.g. Operation Head). Admin logins are never touched. */
    protectedRoleIds: string[]
}

export const DEFAULT_AUTO_ROLE: AutoRoleSettings = { enabled: false, map: {}, defaultRoleId: null, followDesignation: true, protectedRoleIds: [] }

export function sanitizeAutoRole(v: any): AutoRoleSettings {
    const d = DEFAULT_AUTO_ROLE
    const map: Record<string, string> = {}
    if (v?.map && typeof v.map === "object") for (const [k, r] of Object.entries(v.map)) {
        const fk = foldDesignation(k)
        if (fk && typeof r === "string" && r && r !== "admin") map[fk] = r
    }
    const ids = (x: unknown) => Array.isArray(x) ? Array.from(new Set(x.filter((y): y is string => typeof y === "string" && !!y && y !== "admin"))).slice(0, 50) : []
    return {
        enabled: v?.enabled === true,
        map,
        defaultRoleId: typeof v?.defaultRoleId === "string" && v.defaultRoleId && v.defaultRoleId !== "admin" ? v.defaultRoleId : null,
        followDesignation: typeof v?.followDesignation === "boolean" ? v.followDesignation : d.followDesignation,
        protectedRoleIds: ids(v?.protectedRoleIds),
    }
}
