
import NextAuth, { DefaultSession } from "next-auth"
import { Role } from "@prisma/client"

declare module "next-auth" {
    interface Session {
        user: {
            id: string
            role: Role
            permissions: string[]
            // Data scope of the user's role and the sites they cover
            // (lib/access). Absent on sessions minted before the role manager.
            scope?: string | null
            siteIds?: string[]
        } & DefaultSession["user"]
    }

    interface User {
        id: string
        role: Role
        permissions?: string[]
    }
}

declare module "next-auth/jwt" {
    interface JWT {
        id: string
        role: Role
        permissions: string[]
    }
}
