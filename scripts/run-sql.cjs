// Usage: node scripts/run-sql.cjs scripts/<file>.sql
// Runs each statement in order. Splits on ";" at the end of a line, but keeps
// DO $$ … $$ blocks whole. The .sql files are written to be idempotent.
const fs = require("fs")
const { PrismaClient } = require("@prisma/client")
const prisma = new PrismaClient()

function statements(sql) {
    const lines = sql.split(/\r?\n/).filter(l => !l.trim().startsWith("--"))
    const out = []
    let cur = [], inDollar = false
    for (const line of lines) {
        cur.push(line)
        if ((line.match(/\$\$/g) || []).length % 2 === 1) inDollar = !inDollar
        if (!inDollar && /;\s*$/.test(line)) { out.push(cur.join("\n").trim().replace(/;$/, "")); cur = [] }
    }
    const rest = cur.join("\n").trim()
    if (rest) out.push(rest.replace(/;$/, ""))
    return out.filter(Boolean)
}

;(async () => {
    for (const stmt of statements(fs.readFileSync(process.argv[2], "utf8"))) {
        await prisma.$executeRawUnsafe(stmt)
        console.log("ok:", stmt.split("\n")[0].slice(0, 100))
    }
})().catch(e => { console.error(e); process.exitCode = 1 }).finally(() => prisma.$disconnect())
