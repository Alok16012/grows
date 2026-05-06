
import { withAuth } from "next-auth/middleware"
import { NextResponse } from "next/server"

const rolePaths: Record<string, string> = {
    "ADMIN": "/admin",
    "MANAGER": "/manager",
    "HR_MANAGER": "/employees",
    "INSPECTION_BOY": "/inspection",
    "CLIENT": "/client",
}

export default withAuth(
    function middleware(req) {
        const token = req.nextauth.token
        const path = req.nextUrl.pathname
        const role = (token?.role as string) || ""

        // /login: bounce signed-in users to their own dashboard
        if (path === "/login") {
            if (token) {
                const target = rolePaths[role] || "/"
                return NextResponse.redirect(new URL(target, req.url))
            }
            return NextResponse.next()
        }

        // Anyone unauthenticated → /login
        if (!token) {
            return NextResponse.redirect(new URL("/login", req.url))
        }

        const ownDashboard = rolePaths[role] || "/"

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
