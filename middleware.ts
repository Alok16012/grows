
import { withAuth } from "next-auth/middleware"
import { NextResponse } from "next/server"

const rolePaths: Record<string, string> = {
    "ADMIN": "/admin",
    "MANAGER": "/manager",
    "HR_MANAGER": "/employees",
    "INSPECTION_BOY": "/inspection",
    "CLIENT": "/client",
}

// Pick a sensible landing page for a user with a custom role based on
// what permissions they actually hold. Falls back to the system-role
// default when they don't match any permission-based home.
function landingForCustomRole(permissions: string[]): string | null {
    if (permissions.includes("recruitment.view")) return "/recruitment"
    if (permissions.includes("assignments.view")) return "/assignments"
    if (permissions.includes("projects.view")) return "/projects"
    if (permissions.includes("sites.view")) return "/sites"
    if (permissions.includes("employees.view")) return "/employees"
    if (permissions.includes("attendance.view")) return "/attendance"
    if (permissions.includes("payroll.view")) return "/payroll"
    if (permissions.includes("helpdesk.view")) return "/helpdesk"
    if (permissions.includes("lms.view")) return "/lms/learn"
    return null
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
        // /admin → ADMIN only
        if (path.startsWith("/admin") && role !== "ADMIN") {
            return NextResponse.redirect(new URL(ownDashboard, req.url))
        }
        // /manager → MANAGER or ADMIN
        if (path.startsWith("/manager") && role !== "MANAGER" && role !== "ADMIN") {
            return NextResponse.redirect(new URL(ownDashboard, req.url))
        }
        // /inspection → INSPECTION_BOY or ADMIN
        if (path.startsWith("/inspection") && role !== "INSPECTION_BOY" && role !== "ADMIN") {
            return NextResponse.redirect(new URL(ownDashboard, req.url))
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
