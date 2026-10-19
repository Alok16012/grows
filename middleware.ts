
import { withAuth } from "next-auth/middleware"
import { NextResponse } from "next/server"
import { hasInspectionPermission } from "@/lib/permissions"

const rolePaths: Record<string, string> = {
    "ADMIN": "/admin",
    "MANAGER": "/manager",
    "HR_MANAGER": "/employees",
    "INSPECTION_BOY": "/inspection",
    "CLIENT": "/client",
}

// Custom-role users all land on the universal permission-driven dashboard —
// it renders exactly the widgets their permissions allow, so no one ever
// lands on a page they can't load.
function landingForCustomRole(_permissions: string[]): string {
    return "/dashboard"
}

export default withAuth(
    function middleware(req) {
        const token = req.nextauth.token
        const path = req.nextUrl.pathname
        const role = (token?.role as string) || ""
        const customRoleName = (token as any)?.customRoleName as string | null
        const permissions = ((token as any)?.permissions || []) as string[]

        // Resolve dashboard: custom role wins (driven by permissions);
        // fall back to the system role default.
        const customLanding = customRoleName ? landingForCustomRole(permissions) : null

        const needsMpin = !!(token as any)?.needsMpin

        // /login: bounce signed-in users to their own dashboard
        if (path === "/login") {
            if (token) {
                const target = needsMpin ? "/setup-mpin" : (customLanding || rolePaths[role] || "/")
                return NextResponse.redirect(new URL(target, req.url))
            }
            return NextResponse.next()
        }

        // Anyone unauthenticated → /login (keeping where they were headed)
        if (!token) {
            const login = new URL("/login", req.url)
            if (path !== "/") login.searchParams.set("callbackUrl", path + req.nextUrl.search)
            return NextResponse.redirect(login)
        }

        // Employees who signed in without an MPIN (first OTP login, or after an
        // admin reset) must set one before anything else. /setup-mpin itself
        // stays reachable so it can also be used later to change the MPIN.
        if (path === "/setup-mpin") return NextResponse.next()
        if (needsMpin) {
            return NextResponse.redirect(new URL("/setup-mpin", req.url))
        }

        const ownDashboard = customLanding || rolePaths[role] || "/"

        // Role-gated route trees
        // /admin → ADMIN only, EXCEPT the Employee Logins screen which any custom
        // role holding the `users.manage` permission may access.
        if (path.startsWith("/admin") && role !== "ADMIN") {
            const canManageLogins =
                path.startsWith("/admin/employee-logins") && permissions.includes("users.manage")
            if (!canManageLogins) {
                return NextResponse.redirect(new URL(ownDashboard, req.url))
            }
        }
        // /manager → both the manager dashboard and /manager/analytics are pure
        // reporting screens whose APIs are gated on `reports.view`. That permission
        // (or ADMIN) decides access — not the MANAGER base role, which every
        // custom-role user carries regardless of what they actually do.
        // Bounce to /dashboard, never to `ownDashboard`: a base MANAGER's landing
        // page IS /manager, which would loop.
        if (path.startsWith("/manager")) {
            if (role !== "ADMIN" && !permissions.includes("reports.view")) {
                return NextResponse.redirect(new URL("/dashboard", req.url))
            }
        }
        // /inspection → the inspector workspace, decided purely by the inspection
        // permissions. Every route that assigns a custom role sets the system role
        // to MANAGER (see fix-login, employee-logins, employees/import), so a
        // "Quality Inspector" custom role does NOT carry INSPECTION_BOY, and gating
        // on the base role bounced real inspectors off their own workspace.
        if (path.startsWith("/inspection")) {
            const canInspect = role === "ADMIN" || hasInspectionPermission(permissions)
            if (!canInspect) {
                // A legacy INSPECTION_BOY's own landing page is /inspection itself,
                // which would loop now that the base role grants nothing.
                const target = ownDashboard.startsWith("/inspection") ? "/dashboard" : ownDashboard
                return NextResponse.redirect(new URL(target, req.url))
            }
        }
        // /client → CLIENT only
        if (path.startsWith("/client") && role !== "CLIENT") {
            return NextResponse.redirect(new URL(ownDashboard, req.url))
        }
        return NextResponse.next()
    },
    {
        callbacks: {
            authorized: ({ token }) => !!token,
        },
        pages: {
            signIn: "/login",
        },
    }
)

// Every app page needs a session. Left out: API routes (each checks its own
// session and must answer JSON, not a redirect), Next internals, files with an
// extension (logo, manifest, uploads), and the public pages — login, job
// applications (/apply), the candidate join form (/join), shared inspection
// reports (/share) and candidate onboarding links (/onboarding/<token>; the
// /onboarding list page itself is still protected).
export const config = {
    matcher: ["/((?!api|_next|login|apply|join|share|onboarding/|.*\\..*).*)"],
}
