# Follow-ups that need action outside the codebase

The code fixes for the August 2026 audit are already applied. These three items
can only be done from the Vercel and Supabase dashboards.

## 1. Region — already correct, do not change it

`vercel.json` pins functions to `hnd1` (Tokyo). The Supabase database resolves to
`2406:da14:271:9900::/…`, which is in AWS `ap-northeast-1` — also Tokyo. Functions
and database are already co-located, so **leave `regions` alone**. Moving the
functions to `bom1` would put every query on a Tokyo↔Mumbai round trip and make
the app noticeably slower.

To re-verify after any infrastructure change:

```bash
dig +short AAAA db.<project-ref>.supabase.co
```

then look that address up in <https://ip-ranges.amazonaws.com/ip-ranges.json>.

What remains is the browser→Tokyo hop for users in India (roughly 120–180ms).
That is paid **once per request**, not once per query, which is why the real win
was cutting the number of queries per route rather than relocating anything.

If that last hop is still the bottleneck after the query fixes land, the only
way to remove it is to move the Supabase project to `ap-south-1` (Mumbai) and set
`regions: ["bom1"]` at the same time. That means a new Supabase project plus a
data migration — plan it as its own piece of work, and never move one side alone.

## 2. Use the pooled database connection string

No pooled `DATABASE_URL` was found configured. On serverless, every cold start
opens its own connection, and Supabase's direct port exhausts quickly under
that pattern.

In Supabase → Settings → Database → Connection string, take the **Transaction
pooler** URL (port `6543`) and set it as `DATABASE_URL` on Vercel, with:

```
?pgbouncer=true&connection_limit=1
```

Keep the direct connection (port `5432`) as `DIRECT_URL` for migrations.

## 3. Set CRON_SECRET (required for the leave-status job)

`vercel.json` now schedules `/api/cron/sync-leave-status` daily at 18:45 UTC
(00:15 IST). It moves employees into `ON_LEAVE` on the day an approved leave
starts and back to `ACTIVE` once it ends — previously `ON_LEAVE` was set on
approval and never cleared, so anyone who took a day off stayed badged on leave
until an admin edited them by hand.

Add a `CRON_SECRET` environment variable on Vercel (any long random string).
Vercel sends it as `Authorization: Bearer <CRON_SECRET>` on cron invocations.

**Until it is set the route returns 503 and the job does nothing.** That is
deliberate: an unauthenticated endpoint that rewrites employee statuses would be
worse than one that is switched off.

## 4. Confirm demo login is off in production

`lib/auth.ts` enables two auto-heal paths when `ENABLE_DEMO_LOGIN=true`. Either
one lets anyone who knows an employee's phone number set that account's
password. They are meant for development only.

Verify `ENABLE_DEMO_LOGIN` is **not** set in the Vercel production environment.

## Pending index migration

`prisma/migrations/20260801120000_add_perf_indexes/migration.sql` adds indexes
for the employee list, the recruitment ownership filter, and the latest
field check-in lookup. Because migrations are applied by hand on this project,
run that file's statements in the Supabase SQL editor.

On a large table, run each `CREATE INDEX` as `CREATE INDEX CONCURRENTLY`
instead — one statement at a time, outside any transaction — so writes are not
blocked while the index builds.
