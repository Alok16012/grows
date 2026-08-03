
import { withAuth } from "next-auth/middleware"
import { NextResponse } from "next/server"

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

        // /login: bounce signed-in users to their own dashboard
        if (path === "/login") {
            if (token) {
                const target = customLanding || rolePaths[role] || "/"
                return NextResponse.redirect(new URL(target, req.url))
            }
            return NextResponse.next()
        }

        // Anyone unauthenticated → /login
        if (!token) {
            return NextResponse.redirect(new URL("/login", req.url))
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
        // /manager → MANAGER or ADMIN. The manager dashboard also needs the
        // reports.view permission to load its data, so a custom-role MANAGER that
        // lacks it is sent to their own landing page instead of a broken dashboard.
        if (path.startsWith("/manager")) {
            // /manager/analytics is a pure reporting screen — its API is gated on
            // `reports.view`, and the sidebar shows it to anyone holding that
            // permission. Let those users through instead of bouncing them to
            // their dashboard, which is what made the link look broken.
            const canViewAnalytics =
                path.startsWith("/manager/analytics") && permissions.includes("reports.view")
            if (role !== "MANAGER" && role !== "ADMIN" && !canViewAnalytics) {
                return NextResponse.redirect(new URL(ownDashboard, req.url))
            }
            if (role === "MANAGER" && customRoleName && !permissions.includes("reports.view")) {
                return NextResponse.redirect(new URL("/dashboard", req.url))
            }
        }
        // /inspection → the inspector workspace.
        // Base role alone is not enough to decide this: every route that assigns a
        // custom role sets the system role to MANAGER (see fix-login,
        // employee-logins, employees/import), so a "Quality Inspector" custom role
        // does NOT carry INSPECTION_BOY. Gating on the base role therefore bounced
        // real inspectors off their own workspace — they could see an assignment
        // but had no way to open and fill it.
        if (path.startsWith("/inspection")) {
            const canInspect =
                role === "INSPECTION_BOY" || role === "ADMIN" ||
                permissions.includes("inspection.view") ||
                permissions.includes("inspection.submit") ||
                permissions.includes("inspection.history")
            if (!canInspect) {
                return NextResponse.redirect(new URL(ownDashboard, req.url))
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

export const config = {
    matcher: ["/admin/:path*", "/manager/:path*", "/inspection/:path*", "/client/:path*"],
}
