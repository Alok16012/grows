// One switch for every runtime schema self-heal in this codebase.
//
// WHY THIS EXISTS: prod migrations are manual here (Vercel can't run
// `migrate deploy` without DIRECT_URL), so several modules grew a routine that
// reconciles their tables with schema.prisma on the fly — ensureProjectSchema,
// ensurePayrollSchema, ensureHrDocRecallSchema, ensureSiteAssignmentSchema.
// Each is cached per warm instance, which reads as "runs once".
//
// On Vercel it does not. Every cold start is a fresh instance, so each one
// replays the whole thing BEFORE the request it is holding up: for
// /api/payroll/runs that is ~33 statements, most of them ALTER TABLE taking an
// ACCESS EXCLUSIVE lock, plus a full-table backfill over Assignment — and the
// caches only latch on success, so while a repair is failing every single
// request pays for it again. That is what produced FUNCTION_INVOCATION_TIMEOUT
// on the payroll page.
//
// DDL does not belong in a request path. Prod schema is applied by hand from
// scripts/*.sql, so in production these heals are dead weight at best and a
// 30-second stall at worst.
//
// DEFAULT: off in production, on everywhere else. Nothing needs to be set in
// Vercel for the timeout to go away.
//
//   ENABLE_SCHEMA_SELFHEAL=true   force on  — e.g. right after adding a column
//                                             in schema.prisma, to let prod
//                                             heal itself once, then remove it
//   ENABLE_SCHEMA_SELFHEAL=false  force off — e.g. to reproduce prod locally
//
// TRADE-OFF, stated plainly: with this off, adding a column to schema.prisma
// no longer fixes prod by itself. Apply it in Supabase (see scripts/) or flip
// the flag on for one deploy. That was already the real workflow; this only
// stops pretending otherwise on every request.

export function schemaSelfHealEnabled(): boolean {
    const flag = process.env.ENABLE_SCHEMA_SELFHEAL
    if (flag === "true") return true
    if (flag === "false") return false
    return process.env.NODE_ENV !== "production"
}
