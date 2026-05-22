import { PrismaClient } from "@prisma/client"

// Prisma reads DATABASE_URL automatically from prisma/schema.prisma's env()
// declaration. Don't pass `datasources` explicitly here — doing so forces
// Prisma to validate the URL at module-load time, which crashes Vercel's
// "collect page data" build step when DATABASE_URL isn't yet injected.
const prismaClientSingleton = () =>
    new PrismaClient({
        log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    })

declare global {
    var prismaGlobal: undefined | ReturnType<typeof prismaClientSingleton>
}

const prisma = globalThis.prismaGlobal ?? prismaClientSingleton()

export default prisma

if (process.env.NODE_ENV !== "production") globalThis.prismaGlobal = prisma
