"use client"

import { SessionProvider } from "next-auth/react"

export function Providers({ children }: { children: React.ReactNode }) {
    return (
        <SessionProvider
            // Don't re-fetch the session every time the tab regains focus. The
            // server is a long way from most users (~400ms per round trip), and
            // this fired on every alt-tab for a session that is a 30-day JWT.
            // Nothing is weakened by skipping it: every API route calls
            // getServerSession itself, and lib/auth.ts re-reads role and
            // permissions from the database inside the JWT callback every three
            // minutes, so access changes still take effect server-side.
            refetchOnWindowFocus={false}
        >
            {children}
        </SessionProvider>
    )
}
