// Usage: node scripts/run-sql.cjs scripts/<file>.sql — runs each statement (split on ';').
const fs = require("fs")
const { PrismaClient } = require("@prisma/client")
const prisma = new PrismaClient()
;(async () => {
    const sql = fs.readFileSync(process.argv[2], "utf8").split("\n").filter(l => !l.trim().startsWith("--")).join("\n")
    for (const stmt of sql.split(";").map(s => s.trim()).filter(Boolean)) {
        await prisma.$executeRawUnsafe(stmt)
        console.log("ok:", stmt.slice(0, 90))
    }
    const cols = await prisma.$queryRawUnsafe(`SELECT column_name FROM information_schema.columns WHERE table_name = 'Inspection' AND column_name IN ('defectPhotos','customerSignature','customerSignedName','customerSignedAt')`)
    console.log("present:", cols.map(c => c.column_name).join(", "))
})().catch(e => { console.error(e); process.exitCode = 1 }).finally(() => prisma.$disconnect())
