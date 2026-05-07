
import { PrismaClient } from "@prisma/client"

const prismaClientSingleton = () => {
    return new PrismaClient({
        log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
        datasources: {
            db: {
                // connection_limit=1 is critical for Vercel serverless (prevents connection exhaustion)
                url: process.env.DATABASE_URL,
            },
        },
    })
}

declare global {
    var prismaGlobal: undefined | ReturnType<typeof prismaClientSingleton>
}

const prisma = globalThis.prismaGlobal ?? prismaClientSingleton()

export default prisma

if (process.env.NODE_ENV !== "production") globalThis.prismaGlobal = prisma
