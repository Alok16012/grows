"use client"
import { useSession } from "next-auth/react"
import { can } from "@/lib/can"

// Client-side guard for payroll pages. The APIs enforce the real security;
// this stops users without payroll.view from landing on a shell of controls
// that all fail with 403. Rendered while the session is still loading so the
// page doesn't flash.
export default function RequirePayrollView({ children }: { children: React.ReactNode }) {
    const { data: session } = useSession()
    if (session?.user?.role && !can(session, "payroll.view")) {
        return (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 200, color: "var(--text3)", fontSize: 13 }}>
                Access denied
            </div>
        )
    }
    return <>{children}</>
}
