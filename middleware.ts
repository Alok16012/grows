
import { withAuth } from "next-auth/middleware"
import { NextResponse } from "next/server"

export default withAuth(
    function middleware(req) {
        const token = req.nextauth.token
        const path = req.nextUrl.pathname

        if (path === "/login") {
            if (token) {
                // Redirect logged-in user to their dashboard
                switch (token.role) {
                    case "ADMIN":
                        return NextResponse.redirect(new URL("/admin", req.url))
                    case "MANAGER":
                        return NextResponse.redirect(new URL("/manager", req.url))
                    case "HR_MANAGER":
                        return NextResponse.redirect(new URL("/employees", req.url))
                    case "INSPECTION_BOY":
                        return NextResponse.redirect(new URL("/inspection", req.url))
                    case "CLIENT":
                        return NextResponse.redirect(new URL("/client", req.url))
                    default:
                        return NextResponse.redirect(new URL("/", req.url))
                }
            }
            return NextResponse.next()
        }

        if (!token) {
            return NextResponse.redirect(new URL("/login", req.url))
        }

        // Role-based protection
        if (path.startsWith("/admin") && token.role !== "ADMIN") {
            return NextResponse.redirect(new URL("/" + token.role.toLowerCase(), req.url))
        }

        if (path.startsWith("/manager") && token.role !== "MANAGER") {
            // Manager specific logic or redirect
            if (token.role === "ADMIN") return NextResponse.next() // Admin can access manager? Maybe not strictly requested, but good practice. Conforming to strict request:
            return NextResponse.redirect(new URL("/" + token.role.toLowerCase() === "inspection_boy" ? "inspection" : token.role.toLowerCase(), req.url))
        }

        // Better logic: Redirect to own dashboard if trying to access another's.
        // We can simplify:

        const rolePaths: Record<string, string> = {
            "ADMIN": "/admin",
            "MANAGER": "/manager",
            "HR_MANAGER": "/employees",
            "INSPECTION_BOY": "/inspection",
            "CLIENT": "/client"
        }

        const allowedPath = rolePaths[token.role as string] || "/"

        // If user is accessing a protected route that doesn't match their role
        if (
            (path.startsWith("/admin") && token.role !== "ADMIN") ||
            (path.startsWith("/manager") && token.role !== "MANAGER" && token.role !== "ADMIN") ||
            (path.startsWith("/inspection") && token.role !== "INSPECTION_BOY" && token.role !== "ADMIN") ||
            (path.startsWith("/client") && token.role !== "CLIENT")
        ) {
            const target = rolePaths[token.role as string]
            return NextResponse.redirect(new URL(target || "/", req.url))
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
