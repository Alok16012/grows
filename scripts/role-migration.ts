// Role & User Manager migration (spec 25 Oct 2026, steps 2–3).
//
//   npx tsx scripts/role-migration.ts                      dry run: report + mapping sheet, writes NOTHING to the DB
//   npx tsx scripts/role-migration.ts --apply-roles        create Inspector / Employee, tighten the seven roles, set scopes
//   npx tsx scripts/role-migration.ts --apply-mapping=FILE move users without a role per HR's corrected sheet
//
// Needs scripts/role-manager.sql to have run (RoleMeta, UserAccess, AuditLog).
// Every write is audited (actor "Role migration") and bumps the access version
// of each affected user, so their sessions refresh on the next request.
//
// The mapping sheet lists every user without a custom role with a proposed
// role and the rule that proposed it. HR corrects the "Role" column in Excel
// (role names as on the Roles screen) and saves it as CSV for --apply-mapping.

import fs from "fs"
import path from "path"
import { randomUUID } from "crypto"
import { PrismaClient } from "@prisma/client"
import { DEFAULT_ROLES, toCataloguePermissions } from "../lib/permission-catalogue"

const prisma = new PrismaClient({ datasources: { db: { url: process.env.DIRECT_URL || process.env.DATABASE_URL } } })
const args = process.argv.slice(2)
const APPLY_ROLES = args.includes("--apply-roles")
const MAPPING = args.find(a => a.startsWith("--apply-mapping="))?.split("=")[1]
const OUT = args.find(a => a.startsWith("--out="))?.split("=")[1] ?? path.join(process.cwd(), `role-mapping-${new Date().toISOString().slice(0, 10)}.csv`)
const ACTOR = "Role migration"

// Today's role names → the spec's default role they become.
const RENAMES: Record<string, string> = {
    "hr executive": "HR Executive", "hr recruiter": "HR Recruiter", "payroll executive": "Payroll Executive",
    "mis executive": "MIS Executive", "operation manager": "Operation Manager", "quality supervisor": "Quality Supervisor",
    "quality engineer": "Quality Engineer", "inspector": "Inspector", "employee": "Employee",
}

// Designation → proposed role for MANAGER users with no custom role.
function propose(designation: string | null, baseRole: string): { role: string; rule: string } {
    if (baseRole === "INSPECTION_BOY") return { role: "Inspector", rule: "Inspection Boy base role" }
    const d = (designation ?? "").toLowerCase().replace(/\s+/g, " ").trim()
    if (!d) return { role: "Employee", rule: "No designation — fallback" }
    if (/recruit/.test(d)) return { role: "HR Recruiter", rule: `"${designation}" mentions recruiting` }
    if (/(quality|qa|qc).*supervisor|supervisor.*(quality|qa|qc)/.test(d)) return { role: "Quality Supervisor", rule: `"${designation}" is a quality supervisor — set assigned sites` }
    if (/inspect|inspectior/.test(d)) return { role: "Inspector", rule: `"${designation}" is an inspector` }
    if (/qual|qulity|\bqa\b|\bqe\b|\bqre\b|\bsqa\b|\brqa\b|cmm|npd qa|quality engg/.test(d)) return { role: "Quality Engineer", rule: `"${designation}" is quality work` }
    return { role: "Employee", rule: `"${designation}" — fallback` }
}

function csvCell(v: unknown) {
    const s = String(v ?? "")
    const safe = /^[=+\-@\t\r\n]/.test(s) ? `'${s}` : s
    return `"${safe.replace(/"/g, '""').replace(/[\r\n]+/g, " ")}"`
}

function parseCsv(text: string): string[][] {
    const rows: string[][] = []
    let row: string[] = [], cell = "", q = false
    for (let i = 0; i < text.length; i++) {
        const c = text[i]
        if (q) {
            if (c === '"' && text[i + 1] === '"') { cell += '"'; i++ }
            else if (c === '"') q = false
            else cell += c
        } else if (c === '"') q = true
        else if (c === ",") { row.push(cell); cell = "" }
        else if (c === "\n" || c === "\r") {
            if (c === "\r" && text[i + 1] === "\n") i++
            row.push(cell); rows.push(row); row = []; cell = ""
        } else cell += c
    }
    if (cell || row.length) { row.push(cell); rows.push(row) }
    return rows.filter(r => r.some(x => x.trim()))
}

async function tablesReady() {
    try {
        await prisma.roleMeta.findFirst(); await prisma.userAccess.findFirst(); await prisma.auditLog.findFirst()
        return true
    } catch { return false }
}

async function bump(tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0], userIds: string[]) {
    for (const userId of userIds) {
        await tx.userAccess.upsert({ where: { userId }, create: { userId, permissionsVersion: 2 }, update: { permissionsVersion: { increment: 1 } } })
    }
}

async function report() {
    const roles = await prisma.customRole.findMany({ include: { _count: { select: { users: true } } } })
    const metas = await prisma.roleMeta.findMany().catch(() => [])
    console.log("\n── Roles today ──")
    for (const r of roles) {
        const target = RENAMES[r.name.trim().toLowerCase()]
        const spec = DEFAULT_ROLES.find(d => d.name === target)
        const now = new Set(toCataloguePermissions(r.permissions))
        const next = new Set(spec?.permissions ?? [])
        const lose = Array.from(now).filter(p => spec && !next.has(p))
        const gain = Array.from(next).filter(p => !now.has(p))
        const meta = metas.find(m => m.roleId === r.id)
        console.log(`• ${r.name} (${r._count.users} users) → ${spec ? `${spec.name}, scope ${spec.scope}` : "no default — left as is"}${meta ? ` [scope now ${meta.scope}]` : " [not converted]"}`)
        if (spec) console.log(`    loses ${lose.length}: ${lose.join(", ") || "—"}\n    gains ${gain.length}: ${gain.join(", ") || "—"}`)
    }
    // Assigned-sites roles see nothing until each user has sites.
    for (const spec of DEFAULT_ROLES.filter(d => d.scope === "ASSIGNED_SITES")) {
        const r = roles.find(x => RENAMES[x.name.trim().toLowerCase()] === spec.name)
        if (!r) continue
        const noSites = await prisma.user.findMany({
            where: { customRoleId: r.id, isActive: true, siteMemberships: { none: { status: "active" } } },
            select: { name: true },
        })
        if (noSites.length) console.log(`  ⚠ ${spec.name}: ${noSites.length} active user(s) with no assigned sites — ${noSites.map(u => u.name).join(", ")}. Set their sites on the Users screen before --apply-roles, or they will see nothing.`)
    }
    const missing = DEFAULT_ROLES.filter(d => !roles.some(r => RENAMES[r.name.trim().toLowerCase()] === d.name))
    console.log(`\nRoles to create: ${missing.map(m => m.name).join(", ") || "none"}`)

    const admins = await prisma.user.findMany({ where: { role: "ADMIN" }, select: { name: true, email: true, isActive: true } })
    console.log(`\nAdmin accounts: ${admins.map(a => `${a.name} <${a.email}> ${a.isActive ? "active" : "inactive"}`).join("; ")}`)
    if (admins.filter(a => a.isActive).length === 1) console.log("  ⚠ One shared Admin login. Give each admin their own account, then retire the shared one.")

    const users = await prisma.user.findMany({
        where: { customRoleId: null, role: { notIn: ["ADMIN", "CLIENT"] } },
        select: {
            id: true, name: true, email: true, role: true, isActive: true,
            employeeProfile: { select: { employeeId: true, designation: true, deployments: { where: { isActive: true }, select: { site: { select: { name: true } } }, take: 1 } } },
        },
        orderBy: [{ role: "asc" }, { name: "asc" }],
    })
    const tally: Record<string, number> = {}
    const lines = [["User ID", "Name", "Employee ID", "Designation", "Site", "Base role today", "Active", "Role", "Why this role"].map(csvCell).join(",")]
    for (const u of users) {
        const p = propose(u.employeeProfile?.designation ?? null, u.role)
        tally[p.role] = (tally[p.role] ?? 0) + 1
        lines.push([u.id, u.name, u.employeeProfile?.employeeId ?? "", u.employeeProfile?.designation ?? "",
            u.employeeProfile?.deployments[0]?.site.name ?? "", u.role, u.isActive ? "yes" : "no", p.role, p.rule].map(csvCell).join(","))
    }
    fs.writeFileSync(OUT, lines.join("\r\n"))
    console.log(`\nUsers without a role: ${users.length}`)
    for (const [r, n] of Object.entries(tally).sort((a, b) => b[1] - a[1])) console.log(`  ${r}: ${n}`)
    console.log(`\nMapping sheet written to ${OUT}`)
    console.log("HR: correct the Role column, save as CSV, then run --apply-mapping=<file>.")
}

async function applyRoles() {
    if (!(await tablesReady())) throw new Error("Run scripts/role-manager.sql first")
    const roles = await prisma.customRole.findMany({ include: { users: { select: { id: true } } } })
    const batchId = randomUUID()
    for (const spec of DEFAULT_ROLES) {
        const existing = roles.find(r => RENAMES[r.name.trim().toLowerCase()] === spec.name)
        await prisma.$transaction(async tx => {
            const meta = existing ? await tx.roleMeta.findUnique({ where: { roleId: existing.id } }) : null
            const role = existing
                ? await tx.customRole.update({ where: { id: existing.id }, data: { name: spec.name, description: spec.description, permissions: spec.permissions } })
                : await tx.customRole.create({ data: { name: spec.name, description: spec.description, color: spec.color, permissions: spec.permissions } })
            await tx.roleMeta.upsert({ where: { roleId: role.id }, create: { roleId: role.id, scope: spec.scope }, update: { scope: spec.scope } })
            if (existing) await bump(tx, existing.users.map(u => u.id))
            await tx.auditLog.create({
                data: {
                    actorName: ACTOR, action: existing ? "role.update" : "role.create", targetType: "Role", targetId: role.id, targetName: role.name,
                    summary: `${role.name}: ${existing ? "set to the default permissions" : "created"} · scope ${spec.scope}${existing ? ` · affects ${existing.users.length} users` : ""}`,
                    before: existing ? { name: existing.name, scope: meta?.scope ?? "ALL (not set)", permissions: existing.permissions } : undefined,
                    after: { name: spec.name, scope: spec.scope, permissions: spec.permissions }, batchId,
                },
            })
        })
        console.log(`${existing ? "Updated" : "Created"} ${spec.name}`)
    }
}

async function applyMapping(file: string) {
    if (!(await tablesReady())) throw new Error("Run scripts/role-manager.sql first")
    const rows = parseCsv(fs.readFileSync(file, "utf8"))
    const head = rows[0].map(h => h.trim().toLowerCase())
    const idCol = head.indexOf("user id"), roleCol = head.indexOf("role")
    if (idCol < 0 || roleCol < 0) throw new Error('The sheet needs "User ID" and "Role" columns')
    const roles = await prisma.customRole.findMany({ select: { id: true, name: true } })
    const byName = new Map(roles.map(r => [r.name.trim().toLowerCase(), r]))
    const batchId = randomUUID()
    let moved = 0, skipped = 0
    for (const r of rows.slice(1)) {
        const userId = r[idCol]?.trim(), roleName = r[roleCol]?.trim()
        const role = roleName ? byName.get(roleName.toLowerCase()) : undefined
        if (!userId || !role) { console.warn(`skip: ${userId || "(no id)"} — role "${roleName}" not found`); skipped++; continue }
        const u = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, role: true, customRoleId: true } })
        if (!u || u.role === "ADMIN" || u.customRoleId) { skipped++; continue }
        await prisma.$transaction(async tx => {
            await tx.user.update({ where: { id: u.id }, data: { customRoleId: role.id, role: "MANAGER" } })
            await bump(tx, [u.id])
            await tx.auditLog.create({
                data: {
                    actorName: ACTOR, action: "user.bulk", targetType: "User", targetId: u.id, targetName: u.name,
                    summary: `${u.name}: given ${role.name} (migration)`, before: { role: null, baseRole: u.role }, after: { role: role.id }, batchId,
                },
            })
        })
        moved++
    }
    console.log(`Moved ${moved}, skipped ${skipped}. Batch ${batchId}`)
}

async function main() {
    if (APPLY_ROLES) await applyRoles()
    else if (MAPPING) await applyMapping(MAPPING)
    else await report()
}

main().catch(e => { console.error(e); process.exitCode = 1 }).finally(() => prisma.$disconnect())
