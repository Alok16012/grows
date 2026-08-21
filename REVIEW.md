# CIMS — Architecture & Security Review

**Repository:** `Alok16012/grows` (public on GitHub) · **Reviewed:** 11 August 2026
**Commit at review:** `b191f15` · **History:** 615 commits, 19 Feb 2026 → 10 Aug 2026 (~6 months)
**Size:** ~87,500 lines of TypeScript/TSX across `app/`, `lib/`, `components/` (excluding the mobile app)

> ⚠️ **Do not commit this file to the public repository.** §6 documents unfixed, exploitable
> vulnerabilities in a live system — including exact routes, a signing-key password and a
> privilege-escalation path. Publishing it hands an attacker a finished playbook. Keep it local,
> or move it to a private repo/issue tracker until the Immediate items in §8 are done.

---

## 0. Executive summary

CIMS is a workforce-management ERP for a manpower-contracting / field-inspection business: it combines an Indian HRMS (employees, attendance, leave, payroll with PF/ESI/PT, onboarding, exit), a site/project inspection system with client-facing reports, a recruitment CRM, an LMS, and expense management — 73 database models and 190 API routes in one Next.js application.

**The product surface is genuinely broad and the payroll engine is now well-built.** The problems are not features; they are foundations: authorization, credential handling, schema/migration integrity, and the total absence of tests or CI.

### Verdict by dimension

| Dimension | Grade | One-line assessment |
|---|---|---|
| Feature breadth | **B+** | Covers more ground than most in-house HRMS builds; inspection + HR combination is a real differentiator |
| Payroll correctness | **A−** | Recently hardened: single engine, configurable statutory rules, 389k-case parity test |
| Architecture | **C** | App Router used as a client-side SPA; 16 files over 1,000 lines; forked duplicate implementations |
| Database design | **C−** | 73 models but only 12 have migrations; ~55 id columns with no foreign key; money as `Float` in billing |
| Security | **D** | Plaintext passwords, a role-escalation hole, a signing key published in a public repo |
| Testing / CI | **F** | Zero tests, zero CI, no error monitoring, 87k LOC |

### Top 8 risks, in the order they should be fixed

| # | Risk | Where | Impact |
|---|---|---|---|
| 1 | Android **release signing key + its password** are committed to a public repo | `mobile/android/app/growus-release.keystore`, `build.gradle:104-109` | Anyone can sign a malicious APK that Android accepts as an authentic update |
| 2 | **Plaintext passwords** stored in the DB and readable by *any* logged-in user | `prisma/schema.prisma:17`, `app/api/admin/users/route.ts:15,38` | Full credential dump, including ADMIN |
| 3 | **Privilege escalation to ADMIN** via a read-permission-gated PUT | `app/api/employees/[id]/route.ts:72,235` | Any holder of `employees.view` makes themselves superuser |
| 4 | Login ID **and** default password are both the employee's mobile number, with no rate limiting | `lib/credentials.ts:17-31` | Trivial mass account takeover |
| 5 | Aadhaar / PAN / bank scans stored in **public** Supabase buckets | `app/api/upload/route.ts:81`, `employees/[id]/documents/upload/route.ts:76` | Permanent unauthenticated PII exposure |
| 6 | Migration history covers **12 of 73 tables** | `prisma/migrations/` | A fresh environment cannot be provisioned; drift is permanent |
| 7 | `lib/employee-delete.ts` hard-deletes payroll, attendance and issued letters | `lib/employee-delete.ts:26-38` | Statutory records destroyed on employee deletion |
| 8 | No tests, no CI, no error monitoring | repo-wide | Every regression is found in production by a user |

---

## 1. Tech stack

### Web application
| Layer | Choice | Version | Note |
|---|---|---|---|
| Framework | Next.js (App Router) | 14.2.3 | 5 CVEs open; fix is 14.2.35 (non-breaking) |
| Language | TypeScript | 5.4.5 | `strict` on; build type-checks cleanly |
| UI runtime | React | 18.3.1 | |
| ORM | Prisma | 5.22.0 | v7 is current |
| Database | PostgreSQL (Supabase) | — | Also used for file storage |
| Auth | NextAuth | 4.24 | JWT strategy, credentials provider, `bcryptjs` |
| Styling | Tailwind 3.4 + Radix UI primitives | — | Mixed with large amounts of inline `style={{}}` |
| Icons / toasts / charts | lucide-react, sonner, recharts | — | |
| Excel | SheetJS (`xlsx`) | 0.18.5 | Lazy-loaded; **unpatched prototype-pollution + ReDoS advisories** |
| PDF | `@react-pdf/renderer` + hand-built print HTML (`lib/print-html.ts`) | — | Two different PDF strategies coexist |
| Email | nodemailer | 7.0.13 | High-severity SMTP injection advisories |
| Hosting | Vercel, region `hnd1` (Tokyo) | — | 30 s function limit; one cron (`sync-leave-status`, 18:45 UTC) |

### Mobile application (`mobile/`)
Expo 52 / React Native 0.76 with `expo-router`, `expo-secure-store` (token storage), `expo-location` (attendance GPS) and `react-native-webview`. Screens: login, dashboard tabs (home / attendance / requests / profile), leave apply + list, expenses, payroll, documents, announcements, holidays, notifications, admin. It is an employee-self-service companion, not a full port of the web app.

### Notably absent
No test framework (`jest` / `vitest` / `playwright` — none installed), no `.github/` CI, no error monitoring (Sentry/equivalent), no data-fetching library (React Query / SWR), no state manager, no API schema validation layer (`zod` is not a dependency — `lib/validation.ts` is hand-rolled and imported by only 11 of 190 routes).

### Dependency health
`npm audit --omit=dev` reports **9 vulnerabilities (2 critical, 6 high, 1 moderate)**:

| Package | Severity | Issue | Fix |
|---|---|---|---|
| `next` 14.2.3 | **critical** | Cache poisoning, image-optimization DoS, Server Actions DoS | → 14.2.35 (non-breaking) |
| `next-auth` | **critical** | `getToken()` uncaught exception on malformed Bearer header; homoglyph email bypass; OAuth check-cookies not provider-bound | patch available |
| `nodemailer` | high | SMTP command injection (CRLF) | → 9.x (major) |
| `xlsx` (SheetJS) | high | Prototype pollution, ReDoS | **no fix available** — and 21 files parse user-uploaded workbooks |
| `postcss`, `ws`, `nanoid`, `picomatch`, `uuid` | high/moderate | various | patches available |

The `xlsx` one deserves attention: attendance and salary-structure imports parse attacker-supplied `.xlsx` files, and the parsing happens **in the browser**. A malicious workbook can pollute `Object.prototype` in the user's session.

---

## 2. Repository structure

```
grows/
├── app/
│   ├── (dashboard)/          59 pages — one folder per module
│   │   ├── payroll/          hub + panels + 10 sub-pages (largest module)
│   │   ├── employees/ recruitment/ lms/ expenses/ performance/ …
│   │   └── error.tsx, loading.tsx
│   ├── api/                  190 route.ts handlers, mirroring the module list
│   ├── apply/ join/ share/   public, unauthenticated surfaces
│   ├── login/ onboarding/
│   └── layout.tsx, page.tsx, globals.css
├── components/               26 shared components (ui/ has 12 primitives)
├── lib/                      28 modules — auth, permissions, payroll-calc,
│                             payroll-rules, prisma, supabase, validation, …
├── prisma/                   schema.prisma (2,006 lines), 28 migrations, seed.ts
├── mobile/                   Expo app (own package.json / node_modules)
├── docs/                     5 markdown documents
├── scripts/                  5 raw .sql maintenance scripts
├── middleware.ts             role-based page routing
└── (root)                    diag_*.js, sim_api.js, test_*.js, tmp_site.html,
                              cleanup_pm.js, scratch/, deploy_chunks.txt
```

**Observations**

- The module-per-folder convention is consistent and easy to navigate; `app/api` mirrors `app/(dashboard)` closely.
- `lib/` is the healthy part of the codebase: focused, well-commented modules with real domain logic (`payroll-calc.ts`, `permissions.ts`, `audience.ts`, `employee-dedupe.ts`).
- **Root is polluted** with ~10 one-off debug scripts (`diag_db.js`, `diag_pm.js`, `diag_inspection.js`, `sim_api.js`, `test_api_fetch.js`, `test_import.js`, `tmp_test_manager.js`, `tmp_site.html`, `cleanup_pm.js`, `deploy_chunks.txt`, `scratch/pms_seed.js`). None are referenced by the app. They should be deleted or moved to `scripts/`.
- **Two PostCSS configs** coexist: `postcss.config.js` (Tailwind v3 syntax, correct for the installed 3.4.3) and `postcss.config.mjs` (`@tailwindcss/postcss`, v4 syntax, for a package that isn't installed). One is dead and actively confusing.
- `.gitignore` correctly covers `.env*`; no environment file has ever been tracked (verified against full git history).

---

## 3. Architecture assessment

### 3.1 Rendering: App Router used as a client-side SPA

**57 of 59 dashboard pages start with `"use client"`.** Only one page fetches data on the server. In practice the App Router is being used as a routing shell around a client-rendered SPA that talks to `app/api/*` over REST.

Consequences:
- No React Server Component benefit — data arrives after hydration, so every page shows a spinner first, then waterfalls (`fetch sites` → `fetch employees` → `fetch payroll`).
- Permission checks run **twice and differently**: server-side in each API route (`checkAccess`), client-side in the page (`can()`). Where the client check is missing, the user sees a fully rendered screen whose every action 403s — the pattern that was just fixed across the payroll module.
- **469 raw `fetch()` call sites** with no shared data layer. `lib/useCachedFetch.ts` exists but is used by exactly **2** files. There is no request deduplication, no cache invalidation strategy, no consistent error handling.

This is a defensible choice for an internal tool, but it should be a *decision*, not a default — and if it stays, the fetch layer needs consolidating.

### 3.2 Code health: god components

16 files exceed 1,000 lines. The largest:

| File | Lines |
|---|---|
| `app/(dashboard)/recruitment/page.tsx` | 3,484 |
| `app/(dashboard)/lms/page.tsx` | 3,247 |
| `app/(dashboard)/expenses/page.tsx` | 2,835 |
| `app/(dashboard)/performance/page.tsx` | 2,369 |
| `app/(dashboard)/employees/page.tsx` | 2,070 |
| `components/EmployeeModal.tsx` | 1,493 |

A 3,400-line page component holds list rendering, filters, modals, Excel import/export, form state and business calculations in one file. With only **26 shared components for 59 pages**, near-identical tables, filter bars and drawers are re-implemented per module rather than extracted.

### 3.3 Forked implementations that drift

The payroll module carried two complete implementations of the same workflow — a hub with inline panels (`_components/*Panel.tsx`) and standalone pages (`process/`, `wagesheet/`, `salary-slips/`, `compliance/`). They were copy-pasted, then drifted: HRA rendered on one and hardcoded to zero on the other; LWF forced to 0 in one and preserved in the other. Both have now been reconciled, but **the duplication itself still exists** and will drift again.

Similar duplications elsewhere: two self-check-in endpoints (`api/attendance/self` and `api/me/attendance`), five copies of the `EMP-NNNN` code generator, 23 `ADD COLUMN IF NOT EXISTS` blocks duplicated across `jobs/route.ts` and `jobs/[id]/route.ts`, a dead `/api/assets/assign*` fork of the live asset-assignment endpoints, and the whole `leads` module left behind by `recruitment` (§4.2).

The pattern is consistent: when a feature is rebuilt, the old implementation is left in place rather than deleted. Nothing marks which one is authoritative, so the next person to touch the area has a 50% chance of editing the dead copy.

### 3.4 Styling: two idioms

67 files use inline `style={{}}` objects with CSS variables (`var(--accent)`, `var(--surface)`); 97 use Tailwind `className`. Many files use both. There is a real design system in `globals.css` (CSS custom properties, dark mode) but no component library enforcing it, so spacing/colour decisions are re-made per page.

### 3.5 Operational maturity

| Practice | State |
|---|---|
| Automated tests | **None.** No framework installed. |
| CI/CD | **None.** No `.github/`. Vercel builds on push to `main`, unguarded. |
| Error monitoring | **None.** Errors go to `console.error` and disappear. |
| Migrations in production | **Manual.** `vercel.json:3` overrides the build command and drops `prisma migrate deploy`. |
| Runtime schema patching | **8 places** execute `CREATE TABLE` / `ALTER TABLE` on user requests, swallowing all errors. |
| Branch hygiene | 7 stale `claude/*` branches plus `feat/employee-mobile-app` on the remote. |
| Security headers | Only caching headers set. No CSP, HSTS, X-Frame-Options, X-Content-Type-Options, or Referrer-Policy. |

### 3.5.1 Outstanding environment work

`docs/performance-and-security-followups.md` records four infrastructure items that can only be done from the Vercel/Supabase dashboards. As of this review they appear **still outstanding**, and two of them silently disable features:

| Item | State | Consequence if unset |
|---|---|---|
| Pooled `DATABASE_URL` (transaction pooler, port 6543, `?pgbouncer=true&connection_limit=1`) | not configured | Every serverless cold start opens its own direct connection; Supabase's direct port exhausts under that pattern |
| `CRON_SECRET` | required by `app/api/cron/sync-leave-status` | Route returns 503 and the nightly job does nothing — employees stay badged `ON_LEAVE` forever |
| `ENABLE_DEMO_LOGIN` must be **absent** in production | needs verifying | If set, two auto-heal paths let anyone who knows an employee's phone number set that account's password |
| `prisma/migrations/20260801120000_add_perf_indexes` | pending manual application | The employee-list, recruitment-ownership and field-check-in indexes do not exist in production. Run each `CREATE INDEX` as `CREATE INDEX CONCURRENTLY`, one statement at a time |

Region is already correct — functions (`hnd1`) and the Supabase database (AWS `ap-northeast-1`) are both in Tokyo; the remaining ~120–180 ms is the browser→Tokyo hop for Indian users, and removing it means relocating the Supabase project to Mumbai and moving both sides together.

`docs/inspection-flow-change-proposal.md` is marked *"Awaiting client approval"* — a designed-but-unbuilt change to how assignments grant site-wide vs project-level access.

### 3.6 What is done well

- `lib/permissions.ts` implements a clean, documented model — ADMIN is the only implicit superuser, everything else is custom-role permissions — and `checkAccess` deliberately voids legacy role lists so they cannot silently grant access.
- Session handling is solid: 30-day JWT, permissions re-read from the database every 3 minutes, and immediate lockout for deleted / deactivated / terminated users (`lib/auth.ts:257-299`).
- **SQL injection: clean.** All 40 raw-SQL sites use tagged templates, `Prisma.sql`, or `$1` placeholders; the one interpolated column name is typed to a literal union, not user input.
- **Secrets in git: clean.** No `.env` file has ever been tracked; no API keys, tokens or connection strings in history. The Supabase service-role key is correctly server-only. (The Android keystore is the exception — see §6.)
- Token generation uses CSPRNGs (`crypto.randomUUID`, `crypto.randomBytes`) everywhere that matters.
- Comment quality in `lib/` and in recently-touched routes is unusually good: many explain *why* a fix exists and what broke before it.
- 133 of 190 API routes were found correctly authorized.

---

## 4. Module status

30 dashboard modules were audited page-by-page and route-by-route; every "orphan" below was confirmed by searching the literal path across `app/`, `components/`, `lib/` and `mobile/`.

### 4.1 Status matrix

| Module | Pages / API routes | Status | Note |
|---|---|---|---|
| admin | 5 / 15 | ✅ Complete | 2 migration endpoints are intentionally browser-only |
| admin-tools | 1 / 0 | ⚠️ Complete but **unreachable** | Nothing links to `/admin-tools`; also not covered by middleware |
| announcements | 1 / 2 | 🟡 Partial | Create + delete only — no edit, so both `PATCH` handlers are dead |
| approvals | 2 / 2 | ✅ Complete | Share-link revoke API unused |
| assets | 1 / 7 | ✅ Complete | A whole duplicate `/api/assets/assign*` tree is dead |
| assignments | 1 / 2 | ✅ Complete | Uses native `alert()` instead of the app's toasts |
| attendance | 2 / 4 | ✅ Complete | Manual + bulk + self check-in + CSV import |
| departments | 1 / 2 | ✅ Complete | |
| documents | 2 / 0 | 🟡 Partial | Send/types complete; `employees/documents` has 3 dead header buttons |
| employees | 3 / 12 | ✅ Complete | Largest CRUD surface; 3 orphan sub-endpoints |
| exit | 1 / 3 | 🟡 Partial | Workflow complete, but **F&F settlement is a hardcoded placeholder** (§7.2) |
| expenses | 1 / 4 | ✅ Complete | Submit → approve → pay, plus team analytics |
| field | 1 / 4 | 🟡 Partial | **`POST /api/field/checkins` has no client** — check-ins are read-only in practice |
| helpdesk | 1 / 3 | ✅ Complete | No SLAs or escalation |
| inspection | 2 / 0 | ✅ Complete | Assignment → form → camera → autosave → submit |
| jobs | 3 / 2 | 🟡 Partial | Management side works; **the candidate Apply button is a toast** |
| leads | 1 / 3 | ❌ **Abandoned** | Page is a 5-line redirect to `/recruitment`; 3 API routes with zero callers |
| leaves | 1 / 2 | 🟡 Partial | Apply/approve work, but there is **no entitlement or balance concept** (§7.3) |
| lms | 2 / 22 | ✅ Complete | Deepest module; modules/questions can be added and deleted but not edited in place |
| manager | 2 / 2 | ✅ Complete | |
| onboarding | 1 / 6 | 🟡 Partial | Approval flow complete; the **entire task/checklist subsystem is API-only** |
| payroll | 12 / 17 | ✅ Complete (recently hardened) | Single engine, configurable rules, permission-gated; 4 orphan routes remain |
| performance | 1 / 9 | 🟡 Partial | Reviews/KRA/KPI/PIP work; **HR approval comments are collected then silently dropped** |
| profile | 1 / 1 | ✅ Complete | |
| projects | 5 / 3 | 🟡 Partial | **`AlertConfig` is write-only** — saved by the UI, never read by anything |
| recruitment | 1 / 9 | ✅ Complete | Leads → follow-ups → docs → convert-to-employee → public apply forms |
| reports | 1 / 1 | ✅ Complete | |
| self-onboarding | 1 / 0 | ✅ Complete | |
| sites | 1 / 3 | ✅ Complete | CRUD + team + deployments |
| mobile (Expo) | 14 screens | 🟡 Partial | 2 "coming soon" alerts; the admin screen is a WebView of the web app |

**Tally: 18 complete, 10 partial, 1 abandoned, 1 complete-but-unreachable.**

### 4.2 Abandoned or superseded code

1. **`leads` module** — the page is `redirect("/recruitment")`; `/api/leads`, `/api/leads/[id]` and `/api/leads/[id]/activity` (272 lines) query the same `prisma.lead` model that `/api/recruitment` uses, and have zero callers.
2. **`/api/assets/assign` + `assign/[id]`** (210 lines) — a drifted fork of the live `assets/assignments` endpoints.
3. **Onboarding tasks/checklist** — `/api/onboarding/[id]/tasks`, `tasks/[taskId]` and `[id]/documents` (250 lines) plus the `OnboardingChecklist` model: a complete subsystem with no UI.
4. **Billing / invoicing** — `Invoice`, `InvoiceItem`, `Payment`, `ClientContract`, `ContractRenewal` models plus `payroll/billing/generate` and `payroll/payments`. Nothing renders any of it, so the manager dashboard's invoiced/outstanding tiles always read zero.
5. **`lib/email.ts`** — a full HTML approval-email implementation with **no callers**. `nodemailer` (a production dependency carrying high-severity advisories) exists solely for this dead code.
6. **`groups.view` / `groups.manage` permissions**, the `Company` model, and the `/client` branch in `middleware.ts` — leftovers from a removed grouping/client-portal feature. There is no groups page, no `/api/groups`, and no `app/client` route.
7. **Candidate application on job postings** — permanently a toast; the parallel `lead-forms` → `/apply/[slug]` intake won, but job postings never link to it.

### 4.3 Orphan API surface

~17 route files have no caller anywhere: the `leads` trio, the `assets/assign` fork, the onboarding-task trio, `lms/reports/[type]` (195 lines), `lms/auto-assign` (106), `employees/import/clms` (227), `employees/[id]/regenerate-token`, `hr-documents/stats`, `payroll/{payments,billing/generate,reports/combined}`, and `api/me` (a self-described debug endpoint).

Separately, many verbs exist server-side with no UI to reach them: `DELETE` on leaves, attendance, helpdesk, performance reviews and KPIs, HR documents, deployments and share-links; `PATCH`/`PUT` on announcements, holidays, `me/onboarding`, and LMS modules/questions.

Two endpoints are **deliberately** disabled and should stay that way: `POST /api/payroll` and `POST /api/payroll/bulk` return `410` with comments pointing at the correct engine — good practice, since both previously wrote wrong salaries.

### 4.4 Dead UI controls

| Control | File |
|---|---|
| "Manage Templates" → `toast.info("coming soon")` | `jobs/page.tsx:159` |
| "Filters" button with **no handler at all** | `jobs/page.tsx:227` |
| Apply CTA → "Candidate application flow isn't enabled yet." | `jobs/[id]/page.tsx:116` |
| "Filters" button, no handler | `onboarding/page.tsx:903` |
| "Export" button, no handler | `employees/documents/page.tsx:348` |
| Row "More" kebab, no handler | `employees/documents/page.tsx:498` |
| "Upload Documents" → a toast telling you to use a different button | `employees/documents/page.tsx:352` |
| Footer link to `/terms`, which does not exist → 404 | `components/Sidebar.tsx:372` |

There is also dead React state that hides real bugs — most notably `performance/page.tsx:1872`, where `notes` is seeded from `review.managerComments` but never sent: **HR approval comments are typed and then discarded**.

### 4.5 Notifications are half-wired

`/api/notifications` read + mark-read are wired into `TopNav.tsx`, but **producers exist in only three routes** (`lms/notifications`, `expenses/[id]`, `approvals/[id]`). Leave approvals, helpdesk replies, onboarding steps and exit clearances never notify anyone — the bell is real but mostly silent.

### 4.6 Repository hygiene

Nine root-level scripts are dead weight, all referencing a retired data model or a nonexistent endpoint: `diag_pm.js`, `cleanup_pm.js`, `tmp_test_manager.js` (use the unused `ProjectManager` model), `sim_api.js` and `test_api_fetch.js` (call `/api/groups`, which does not exist), `test_import.js` (targets a Vite port, not this Next app), `diag_db.js`, `diag_inspection.js` (hardcoded UUIDs), plus `tmp_site.html`, `deploy_chunks.txt` and `scratch/pms_seed.js` (keyed on the retired `INSPECTION_BOY` role). Safe to delete wholesale. The five files in `scripts/*.sql` are different — those are real operational migrations and should stay.

`mobile/android/app/build/` and `mobile/android/app/.cxx/` — hundreds of generated Gradle/CMake artefacts — are **committed to git**; `.gitignore` has no `mobile/android` entries.

One more source-of-truth risk introduced this week: `admin/rule-book/page.tsx` is a 100% hardcoded copy of the statutory tables, sitting next to the new DB-backed `/api/payroll/rules`. It will drift the moment anyone edits the rules in Settings.

---

## 5. Database schema review

**Shape:** 73 models, 31 enums, 86 relations, 127 indexes, 114 `Float` columns, 12 `Json` columns. 13 models have no index at all; 42 have no `updatedAt`.

### 5.1 Domain map

| Domain | Core models | Health |
|---|---|---|
| Identity | `User`, `CustomRole`, `Company`, `Branch`, `Department` | `Company`/`Branch` are vestigial |
| Inspections | `Site → Project → Assignment → Inspection → InspectionData`, `FormTemplate`, `ShareableLink` | Active, the original domain |
| Core HR | `Employee` (~110 columns, 22 child relations), `EmployeeDocument`, `Deployment`, `Attendance`, `Leave` | Active, `Employee` is the hub (177 code references) |
| Payroll | `EmployeeSalary`, `Payroll`, `PayrollRun`, `SalaryStructure`, `StatutoryChallan`, `AdvanceAndReimbursement` | Active; 3 of 6 models dead |
| Recruitment CRM | `Lead` (60+ columns), `LeadForm`, `LeadDocument`, `LeadFollowUp`, `LeadActivity`, `JobPosting` | Active |
| LMS | 13 models (`Course`, `Quiz`, `CourseEnrollment`, `Policy`, `ILTSession`, …) | Active |
| Finance | `Invoice`, `InvoiceItem`, `Payment`, `Expense`, `ClientContract`, `ContractRenewal` | Only `Expense` is alive |
| Performance / Exit / Assets / Onboarding / Field / Helpdesk | `PerformanceReview`+`KRA`/`KPI`/`PIP`, `ExitRequest`, `Asset`, `OnboardingRecord`, `FieldTask`, `Ticket` | Active |

**Tenancy:** the schema *looks* multi-tenant (`companyId`, `branchId` on several models) but **nothing scopes queries by them** — outside auth, `companyId` appears exactly once in the whole codebase. Treat the system as single-tenant; the tenant columns are dead weight that still carry live foreign-key constraints.

### 5.2 Prioritized schema issues

| Sev | Issue | Location |
|---|---|---|
| **P0** | Migrations create **12 of 73 tables**. `Employee`, `Payroll`, `Attendance`, `Site`, `Lead`, `Expense` and ~55 more exist only in `schema.prisma`. A fresh database cannot be provisioned; `prisma migrate dev` locally will see 61 tables as drift and offer to reset. | `prisma/migrations/` |
| **P0** | `vercel.json:3` overrides `buildCommand`, silently dropping the `prisma migrate deploy` that `package.json` declares. Every schema change is manual, forever. | `vercel.json:3` |
| **P0** | `plainPassword String?` — passwords stored in cleartext by design. | `schema.prisma:17` |
| **P0** | `Project.company` uses `onDelete: Cascade` on a column documented as legacy. Deleting one unused `Company` row cascades `Project → Assignment → Inspection → InspectionData` — the entire inspection history. | `schema.prisma:123` |
| **P1** | `lib/employee-delete.ts:26-38` hard-deletes payroll, attendance, leave, HR documents and advances — defeating the `Restrict` constraints the schema set precisely to prevent it. | `lib/employee-delete.ts` |
| **P1** | `Ticket` has **no foreign keys at all** (`raisedBy`, `assignedTo`, `employeeId` are bare strings), forcing manual `userMap` join loops in the helpdesk routes. | `schema.prisma:465` |
| **P1** | Attendance day-uniqueness is timezone-fragile: two writers use local midnight, two use UTC midnight, and all four do non-atomic `findFirst`-then-`create`. Off UTC this yields duplicate rows the `@@unique` never catches. | `attendance/self`, `me/attendance`, `attendance`, `attendance/bulk` |
| **P1** | Defaults that hide missing data: `Payroll.workingDays/presentDays @default(26)` (a row with no attendance reads as a full month), `Attendance.status @default("PRESENT")`, `EmployeeSalary.status @default("APPROVED")` (so the approval gate in payroll never rejects anything). | `schema.prisma:904,806,763` |
| **P1** | Business rates baked into column defaults: `bonus @default(583)`, `otRatePerHour @default(170)`, `canteenRatePerDay @default(55)`. Changing policy needs a migration. *(Partly mitigated: the new payroll rules system now supplies these at write time.)* | `schema.prisma:749-751` |
| **P1** | Employee search runs 5 unindexable `ILIKE '%…%'` clauses per keystroke on an unindexed table. | `app/api/employees/route.ts:70-75` |
| **P2** | **~55 id-shaped columns with no foreign key** — every `createdBy`, `approvedBy`, `processedBy`, `assignedTo`, plus `Payroll.siteId`, `Expense.siteId`/`employeeId`, `Employee.managerId`. Inconsistent even within one model: `PerformanceReview.hrApprovedBy` is a real relation, `reviewerId` next to it is not. | schema-wide |
| **P2** | Money as `Float` in billing/expenses. `Math.max(0, totalAmount - paidAmount)` can never reach exactly zero. *(Payroll is accidentally safe — it rounds to whole rupees at every step.)* | `Invoice`, `Expense`, `InvoiceItem` |
| **P2** | 7 fully dead models: `ClientContract`, `ContractRenewal`, `InvoiceItem`, `Payment`, `SalaryStructure`, `StatutoryChallan`, `OnboardingChecklist`. `Invoice` is read but never written — so the manager dashboard's "invoiced / outstanding" tiles always render zero. | schema-wide |
| **P2** | Three sources of truth for salary (`Employee.basicSalary`, `EmployeeSalary`, `SalaryStructure`) — the documented cause of a previous wrong-salary bug. Five representations of "priority". Two overlapping task-status enums. | schema-wide |
| **P2** | ~60 de-facto enums stored as free-text `String` with the allowed values only in comments (`Inspection.status`, `Attendance.status`, `Leave.type`, `Employee.gender`, …). | schema-wide |
| **P2** | `EMP-NNNN` generation uses `orderBy employeeId desc` — lexicographic, so it breaks permanently at `EMP-10000` — and is duplicated in 5 places with a race window in each. | `onboarding/[id]`, `recruitment/[id]`, `employees/import`, `import/clms`, `admin/migrate-emp-codes` |
| **P3** | `Employee.email`, `.phone`, `.aadharNumber`, `.panNumber`, `.uan` are not unique — dedupe is enforced only by application code using an unindexed `regexp_replace` scan. | `schema.prisma:592-593` |
| **P3** | `User.signature` exists in production but not in the schema (created by raw DDL). Any `prisma db push` will drop it. | `lib/hr-doc-schema.ts:33` |

### 5.3 Runtime schema patching

Eight places execute DDL during normal request handling, each swallowing errors silently:

`lib/prisma.ts:66-104` (fires on module load), `lib/hr-doc-schema.ts:14-37`, `lib/site-assignment-schema.ts`, `app/api/settings/route.ts:11-34`, `app/api/jobs/route.ts:29-52`, `app/api/jobs/[id]/route.ts:26-49`, `app/api/expenses/route.ts:41-45`, `app/api/expenses/[id]/route.ts:44-48`.

This is a pragmatic answer to "migrations don't run in production", but it costs cold-start latency, hides genuine failures, and means the production schema's true shape is defined by scattered `ALTER` statements rather than by any single artefact.

### 5.4 Seed data

`prisma/seed.ts` creates four accounts — `admin@cims.com`, `manager@cims.com`, `inspector@cims.com`, `client@cims.com` — all with the hardcoded password **`password123`** (bcrypt, cost 10). It is idempotent, but if it has ever run against the production Supabase database, four known-password accounts exist, one with full ADMIN. They set no `plainPassword`, so they would be **invisible** on the admin "Employee Logins" screen, which filters on that column.

The seed also writes `KPITemplate.role` values (`INSPECTOR`, `HR_RECRUITER`, `PAYROLL_MANAGER`) that do not exist in `enum Role`, and creates projects without a `siteId`, which the current UI cannot reach.

**Action:** verify no `*@cims.com` users exist in production; gate the seed behind `NODE_ENV !== "production"`.

---

## 6. Security review

Coverage: all 190 API route files, plus `lib/auth.ts`, `lib/permissions.ts`, `lib/credentials.ts`, `lib/apiSession.ts`, `middleware.ts`, `next.config.mjs`, the Prisma schema, and the full git history.

### 6.1 Critical

**C1 — Android release signing key published.**
`mobile/android/app/growus-release.keystore` is tracked in git (added 2026-07-20, commit `54dd1c3`), and `mobile/android/app/build.gradle:104-109` contains its credentials in cleartext:
```
storePassword 'growus2026'   keyAlias 'growus'   keyPassword 'growus2026'
```
The repository is public, so anyone can sign an APK that Android will accept as an authentic update to the app. **Assume the key is compromised.** Fix: generate a new key, enrol in Play App Signing, purge the file from history (`git filter-repo`), move credentials to `~/.gradle/gradle.properties` or CI secrets, add `*.keystore` / `*.jks` to `.gitignore`. Rotation is required *regardless* of whether history is rewritten.

**C2 — Plaintext passwords, readable by every authenticated user.**
`schema.prisma:17` defines `plainPassword String?` alongside the bcrypt hash, populated by `admin/employee-logins/*`, `onboarding/[id]:57` and `employees/import:367`. The guard on the endpoint that returns users is:
```ts
if (!session || (session.user.role !== Role.ADMIN && (session.user.permissions ?? []).length === 0))
```
`resolvePermissions()` (`lib/auth.ts:24`) returns `["self.view"]` as a baseline for **every** user, so `.length === 0` is never true — the guard is dead. The query uses `include:` and line 38 strips only `password`, so `plainPassword` is returned. **Any employee can read every account's password, including ADMIN's.**
Fix: drop the column and the "view password" feature (replace with reveal-once-on-reset), gate the route on `users.manage`, and switch `include:` to an explicit `select:`.

**C3 — Privilege escalation to ADMIN.**
`app/api/employees/[id]/route.ts:72` gates a full employee PUT on the *read* permission `employees.view` (or `recruitment.manage`), and line 235 accepts `systemRole` from the request body with `"ADMIN"` in `VALID_ROLES`. A user with `employees.view` PUTs `{systemRole:"ADMIN"}` against their own employee record and becomes superuser.
Fix: gate on `employees.edit`, remove `"ADMIN"` from `VALID_ROLES`, and require `users.manage` for any role change.

**C4 — Username and password are both the mobile number.**
`lib/credentials.ts:19` derives the login ID from the employee's 10-digit phone; line 30 derives the default password from the same digits. Combined with no rate limiting or lockout anywhere in the codebase (C5), and the enumerability of Indian mobile numbers, this permits mass account takeover of every user who has not voluntarily changed their password.
Fix: random per-user initial password, forced change on first login, login rate limiting and lockout.

**C5 — No rate limiting anywhere.** Web login, `mobile/login`, `/join` self-registration and public lead-form submission are all unthrottled — brute force, spam registration and email flooding are unimpeded.

### 6.2 High

| # | Finding | Location |
|---|---|---|
| H1 | `x-join-form: true` request header bypasses authentication on the upload endpoint entirely; there is **no MIME or extension allowlist** — an anonymous attacker can upload HTML/SVG and receive a public URL on your Supabase origin | `app/api/upload/route.ts:16,35-37,57` |
| H2 | Aadhaar / PAN / bank-proof scans are written to **public** buckets via `getPublicUrl` — readable by anyone with the URL, forever, with no auth | `upload/route.ts:81`, `employees/[id]/documents/upload/route.ts:76` |
| H3 | Anonymous full-PII read via `onboardingToken`, which **never expires and cannot be revoked** | `app/api/external/onboarding/[token]/route.ts:16-56` |
| H4 | Recruiter isolation is silently disabled by any `?search=` — `where.OR` is set for ownership on line 31 then unconditionally reassigned on line 40 | `app/api/leads/route.ts:31,40` |
| H5 | `canSendDocuments()` / `canViewDocuments()` accept the read permission `documents.view` as a **write** grant, gating approve / issue / recall / delete / bulk-issue across **9 routes** | `lib/permissions.ts:347-355` |
| H6 | Authenticated-but-unauthorized: any employee can rewrite anyone's KPI actuals | `app/api/performance/[id]/sync/route.ts:13` |
| H7 | Authenticated-but-unauthorized: any employee can dump `AppSetting`, including the payroll rules | `app/api/settings/route.ts:42` |
| H8 | Zero auth — anonymous enumeration of every employee photo by id | `app/api/photo/[id]/route.ts:16` |
| H9 | IDOR across the recruitment sub-routes: id / docId taken from URL or body, never ownership-checked | `app/api/recruitment/[id]/{route,documents,followups,activities,convert}` |

The same "read permission gates a write" anti-pattern as H5 appears independently in `performance/route.ts:81`, `performance/[id]/route.ts:260`, `deployments/route.ts:58`, `lms/courses/route.ts:78`, `lms/enrollments/route.ts:72`, and `payroll/salary-structure/[employeeId]/route.ts:30`.

### 6.3 Medium / low

- **Middleware covers almost nothing.** `middleware.ts:101` matches only `/admin`, `/manager`, `/inspection`, `/client`. `/api/*` is uncovered (defensible — routes self-protect) but so are `/payroll`, `/employees`, `/dashboard` and the rest of `app/(dashboard)/**`, so page protection depends entirely on per-page guards, which were missing across payroll until this week.
- **No security headers** in `next.config.mjs` — no CSP, HSTS, X-Frame-Options, X-Content-Type-Options or Referrer-Policy.
- **bcrypt cost 8** in `admin/employee-logins` (cost 10 elsewhere); `Math.random()` used to generate passwords in `admin/inspectors/bulk:15`.
- **XSS surface:** `lib/print-html.ts:15` assigns `container.innerHTML` from a parsed document, and no HTML-escaping helper exists anywhere in the repo. Payslip/report builders interpolate employee names and remarks directly into HTML strings.
- **Raw `error.message` returned from public endpoints** (`join/route.ts:280`, `join/documents/route.ts:70`) — leaks internal details to anonymous callers.
- **Employees can self-edit their own bank account number** with no approval step (`app/api/me/employee/route.ts:26`) — a salary-redirection path.
- **Share links never expire** — `expiresAt` is never set and there is no revocation flag (`app/api/inspections/[id]/share/route.ts:23`).
- `lib/apiSession.ts:32-33` **fails open** if the DB errors during the bearer-token active-user check.

### 6.4 Verified clean

- **SQL injection:** all 40 raw-SQL sites are parameterized or static DDL. No injection found.
- **Secrets in git:** no `.env*` ever tracked; a full-history sweep for JWTs, `service_role`, `sk_live_`, `AKIA…`, `ghp_…` and connection strings returned zero real values. No `process.env.X || "fallback"` anywhere. The Supabase service-role key is server-only.
- **Token randomness:** onboarding, share and invite tokens all use CSPRNGs.
- **Backdoor routes:** `debug-login` and `diag` are both hard-gated to ADMIN; demo logins sit behind `DEMO_ENABLED`, off by default.
- **Session handling:** JWT with periodic DB re-validation and lockout on deactivation.
- **All 9 `app/api/me/**` routes** correctly resolve the employee from the session and never accept an id from the caller.
- **133 of 190 route files** were fully correct.

---

## 7. Feature gap vs Keka and Saral PayPack

> A detailed, per-feature breakdown of every gap — with competitor behaviour, current CIMS state, code
> evidence, effort estimates and a recommended build order — is in
> **[`docs/feature-gap-keka-saral.md`](docs/feature-gap-keka-saral.md)**. This section is the summary.

CIMS is not a like-for-like competitor to either product: it is a **field-operations ERP with an HRMS attached**. Its inspection/assignment/client-report chain, site-wise deployment model and manpower-billing view have no equivalent in Keka or Saral. The gaps below are therefore "what an Indian HR/payroll buyer will expect and not find", not a scorecard.

### 7.1 Where CIMS already competes

Core HR records, attendance with GPS check-in, leave requests, payroll with PF/ESI/PT and Form II wage sheets, PF/ESIC/PT compliance report exports, salary slips, onboarding with document collection and KYC validation, exit workflow with clearance tasks, recruitment pipeline with public apply forms, asset issue/return, helpdesk tickets, LMS with quizzes and policy acknowledgement, expense claims with approvals, employee self-service on web and mobile, and — since this week — **fully configurable statutory calculation rules**, which Saral exposes only as fixed statutory masters.

### 7.2 Statutory / payroll gaps (vs Saral PayPack)

| Missing | Evidence | Impact |
|---|---|---|
| **Income tax / TDS engine** | `Payroll.tds` is only ever *typed in* by hand (`payroll/[id]/route.ts:68`) and displayed on the slip — the calculation engine never touches it, and `PayrollRun.totalTds` is never populated | Cannot run payroll for salaried staff above the tax threshold |
| **Form 16 / Form 12BA** | absent | Statutory year-end obligation unmet |
| **Form 24Q quarterly e-TDS + FVU validation** | absent | Filing must be done outside the system |
| **Investment declarations & proof submission (80C etc.)** | absent | The main ESS feature Saral leads with |
| **Gratuity** | hardcoded `(basic/26) × 15 × 1` — **always assumes one year of service** | `app/(dashboard)/exit/page.tsx:1347` |
| **Leave encashment** | hardcoded "~3 days" | same file, line 1346 |
| **Full & final settlement** | the whole F&F breakdown is labelled "Indicative" and computes nothing from real data; deductions are always ₹0 | `exit/page.tsx:1344-1400` |
| **Loans & advances** | `AdvanceAndReimbursement` model exists but **no code reads or writes it** | Advances are a manual number typed into the payroll grid |
| **Statutory challan tracking** | `StatutoryChallan` model exists, entirely unused | No record of what was actually filed and paid |
| **Multi-state PT slabs** | one Maharashtra slab set (now editable, but single-set) | Blocks expansion beyond one state |
| **Bonus Act / minimum-wage masters** | bonus is a manual per-employee number | No statutory bonus computation or revision tracking |
| **Arrears / retro-pay** | absent | Mid-month salary revisions cannot be back-paid |

### 7.3 HR platform gaps (vs Keka)

| Missing | Note |
|---|---|
| **Leave entitlement engine** | `Leave` has no balance, quota, accrual, carry-forward or encashment concept at all — `type` is free text. Employees can request unlimited leave; nothing tracks a balance. This is the single largest HR gap. |
| **Shift & roster management** | `Site.shift` and `Deployment.shift` are free-text strings; no shift master, no roster, no week-off or holiday-calendar logic per shift |
| **Biometric / access-control integration** | none — attendance is manual entry, GPS self-check-in, or Excel import |
| **Timesheets / billable hours** | none — no project-time capture, which is odd given the site/project model already exists |
| **OKR / goal cascading** | `KRA`/`KPI` exist per review; no company→team→individual cascade, no check-in cadence |
| **360° / peer feedback** | reviews are manager→employee only |
| **Engagement surveys / pulse** | none |
| **Org chart** | `Employee.managerId` is an unmodelled bare string that sometimes holds a `User` id and sometimes an `Employee` id; no hierarchy view |
| **Configurable approval workflows** | approval chains are hardcoded per module rather than configured |
| **Offer letter + e-signature flow** | letters are generated (`HrDocument`) but there is no candidate-facing accept/e-sign step |
| **Background verification** | none |
| **Benefits / insurance administration** | none |
| **Integrations** | no Tally/Zoho export, no biometric device SDK, no Slack/Teams notifications, no public API, no webhooks |
| **Analytics / BI** | fixed dashboards only; no report builder, no scheduled report delivery |
| **Audit trail** | only `LeadActivity` exists. There is **no global audit log** — nobody can answer "who changed this salary and when". For a payroll system this is a compliance gap, not a nice-to-have. |
| **Data export / retention / DPDP compliance** | no bulk personal-data export or deletion workflow |

### 7.4 Honest positioning

Against Saral, CIMS wins on being a modern web app with an integrated HRMS and now-configurable rules, and loses decisively on income tax (TDS, Form 16, 24Q, declarations) — which is roughly half of what Saral is bought for.

Against Keka, CIMS covers a surprising amount of the module list, but the depth is shallower in every module, and three absences are disqualifying for a mid-market buyer: **leave balances, an audit trail, and shift management**.

The realistic strategy is not to chase either product. It is to be the best system for **site-based contract manpower** — where the inspection chain, site-wise deployment and client billing already give CIMS something neither competitor has — and to close only the statutory and audit gaps that make it unsellable.

*Competitor feature sets referenced from [Keka on Gartner Peer Insights](https://www.gartner.com/reviews/product/keka-hr), [Keka on GetApp](https://www.getapp.com/hr-employee-management-software/a/keka/), [Saral PayPack (Relyon)](https://saralpaypack.com/payroll-software/) and [Saral PayPack on Techjockey](https://www.techjockey.com/detail/relyonsoft-saral-paypack).*

---

## 8. Recommended action plan

### Immediate (this week — security)
1. **Rotate the Android signing key** and purge the keystore from git history. It is public right now.
2. **Drop `plainPassword`**, remove the "view password" feature, and fix the dead guard in `admin/users/route.ts`.
3. **Fix the ADMIN escalation** in `employees/[id]/route.ts` — one line, and remove `"ADMIN"` from `VALID_ROLES`.
4. **Remove the `x-join-form` bypass** and add a MIME/extension allowlist to uploads.
5. **Make Supabase document buckets private** and serve KYC documents through signed URLs behind a permission check.
6. **Fix `canSendDocuments()`** — clears nine routes at once — and audit the other "read permission gates a write" sites.
7. **Upgrade `next` to 14.2.35 and patch `next-auth`** (both non-breaking, both critical).
8. Verify no `*@cims.com` seed accounts exist in production.

### Short term (this month)
9. Add **rate limiting and account lockout** to every login path; stop deriving passwords from phone numbers.
10. Add a **global audit log** (`who / what / when / before / after`) for salary, payroll, role and document changes.
11. Add **security headers** and an HTML-escaping helper for the print/PDF builders.
12. Reconcile the schema: generate a **baseline migration** from the live database so a fresh environment can be provisioned, then delete the runtime DDL self-heal blocks.
13. Set `DIRECT_URL` on Vercel and restore `prisma migrate deploy` in `vercel.json`.
14. Fix `lib/employee-delete.ts` to soft-delete rather than destroy payroll and attendance records.
15. **Delete the dead code** in one sweep: 7 unused Prisma models, the `leads` module, the `/api/assets/assign*` fork, the orphan onboarding-task API, `lib/email.ts` (and then `nodemailer` itself), the `groups.*` permissions, the `/client` middleware branch, the 9 root debug scripts, and the duplicate PostCSS config. Add `mobile/android/app/build/` and `.cxx/` to `.gitignore` and untrack them. Prune the 7 stale `claude/*` branches.
16. Wire the remaining **notification producers** (leaves, helpdesk, onboarding, exit) — the bell UI already exists and is mostly silent.
17. Fix the small correctness bugs the audit surfaced: HR approval comments discarded (`performance/page.tsx:1872`), `AlertConfig` written but never read, and the `EMP-NNNN` generator that breaks at 10,000.

### Medium term (this quarter)
18. **Build the leave entitlement engine** — types, quotas, accrual, carry-forward, balance ledger. Nothing else in HR is credible without it.
19. **Add TDS**: declarations, monthly computation, Form 16 and Form 24Q export. This is the biggest revenue-blocking gap.
20. Introduce **tests** — start with `lib/payroll-calc.ts` (the parity harness written during the payroll work is a ready-made suite), then the permission helpers, then API route smoke tests. Add GitHub Actions running typecheck + tests on every PR.
21. Add **error monitoring** (Sentry or equivalent).
22. Retire one of the two payroll UI flows and extract shared table/filter/drawer components to stop the god-component growth.
23. Add foreign keys to the ~55 orphan id columns, convert the de-facto string enums, and move billing money off `Float`.

### Strategic
24. Decide whether the App Router SPA pattern stays. If it does, consolidate 469 `fetch` calls behind a data layer with caching and consistent error handling.
25. Decide the product position: **site-based contract manpower ERP**, not a general HRMS. Close statutory gaps to be sellable; do not chase Keka's engagement/OKR surface.

---

*Reviewed by automated analysis of the codebase at commit `b191f15`. Security findings were verified first-hand against the source; the Android keystore, plaintext-password guard, ADMIN escalation and lead-isolation bypass were each reproduced by direct file inspection.*
