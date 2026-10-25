import { NextResponse } from "next/server"
import { guard } from "@/lib/access"
import { MODULES, ACTIONS, SPECIAL_ACTIONS, SENSITIVE_FIELDS, SCOPES, SCOPE_INFO } from "@/lib/permission-catalogue"

// The permission catalogue the role editor renders (lib/permission-catalogue).
export async function GET(req: Request) {
    const g = await guard(req, "roles.view")
    if (g instanceof NextResponse) return g
    return NextResponse.json({ modules: MODULES, actions: ACTIONS, special: SPECIAL_ACTIONS, sensitive: SENSITIVE_FIELDS, scopes: SCOPES.map(s => ({ key: s, ...SCOPE_INFO[s] })) })
}
