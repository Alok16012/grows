# Feature Gap Analysis — CIMS vs Keka and Saral PayPack

**Date:** 11 August 2026 · **Codebase reviewed at:** commit `b191f15`
**Question this answers:** *What do Keka and Saral both have that CIMS does not?*

Every "What CIMS has today" claim below was verified against the code, with file references. Competitor
capabilities are cited from vendor documentation and review sites (sources at the end).

> This document contains no security details and is safe to commit publicly, unlike `REVIEW.md`.

---

## How to read this

The two products are not the same kind of software:

- **Saral PayPack** (Relyon Softech) is a *payroll and statutory compliance* product. Its depth is in Indian
  tax law — TDS, Form 16, Form 24Q, e-returns — plus loans, arrears and full & final settlement. It is what an
  accountant buys.
- **Keka** is a *full HR platform*. Payroll is one of four products; the rest is attendance/shifts, performance
  and OKRs, hiring, engagement and analytics. It is what an HR head buys.

CIMS overlaps the middle of both but is deeper than either in one place neither of them goes: **site-based
contract manpower operations** (inspections, site deployment, client billing).

Gaps below are marked:

| Mark | Meaning |
|---|---|
| 🔴 **Blocker** | A prospect will refuse to buy without it, or you cannot legally run payroll without it |
| 🟠 **Major** | Costs deals and creates manual work every month |
| 🟡 **Expected** | Buyers assume it exists; its absence looks unfinished |
| ⚪ **Nice to have** | Rarely decides a deal at this market segment |

---

## Summary — the 22 gaps

| # | Gap | Keka | Saral | Severity | Rough effort |
|---|---|:---:|:---:|---|---|
| 1 | Income tax (TDS) computation engine | ✅ | ✅ | 🔴 Blocker | 6–8 weeks |
| 2 | Employee income-tax declarations + proof workflow | ✅ | ✅ | 🔴 Blocker | 3–4 weeks |
| 3 | Form 16 / Form 12BA generation | ✅ | ✅ | 🔴 Blocker | 2–3 weeks |
| 4 | Form 24Q quarterly e-TDS return + FVU validation | ✅ | ✅ | 🔴 Blocker | 3–4 weeks |
| 5 | Leave entitlement engine (balances, accrual, carry-forward) | ✅ | ✅ | 🔴 Blocker | 4–5 weeks |
| 6 | Audit trail | ✅ | ✅ | 🔴 Blocker | 2–3 weeks |
| 7 | Full & final settlement (real computation) | ✅ | ✅ | 🟠 Major | 2–3 weeks |
| 8 | Gratuity computation from actual service | ✅ | ✅ | 🟠 Major | 3–5 days |
| 9 | Leave encashment from actual balance | ✅ | ✅ | 🟠 Major | 1 week (needs #5) |
| 10 | Loans & salary advances with repayment schedules | ✅ | ✅ | 🟠 Major | 2–3 weeks |
| 11 | Arrears / retro-pay on salary revision | ✅ | ✅ | 🟠 Major | 2–3 weeks |
| 12 | Shift & roster management | ✅ | ✅ | 🟠 Major | 4–6 weeks |
| 13 | Biometric / attendance-device integration | ✅ | ✅ | 🟠 Major | 3–4 weeks |
| 14 | Any outbound email at all | ✅ | ✅ | 🟠 Major | 1 week |
| 15 | Overtime policy engine | ✅ | ✅ | 🟡 Expected | 2 weeks |
| 16 | Multi-state professional tax | ✅ | ✅ | 🟡 Expected | 1–2 weeks |
| 17 | Statutory challan tracking & e-return files | ✅ | ✅ | 🟡 Expected | 2 weeks |
| 18 | Org chart / reporting hierarchy | ✅ | ➖ | 🟡 Expected | 1–2 weeks |
| 19 | Configurable approval workflows | ✅ | ➖ | 🟡 Expected | 4–5 weeks |
| 20 | OKRs, 360° feedback, engagement surveys | ✅ | ❌ | ⚪ Nice to have | 8+ weeks |
| 21 | Integrations (Tally, biometric SDK, Slack) + public API | ✅ | ✅ | ⚪ Nice to have | ongoing |
| 22 | Report builder / scheduled reports | ✅ | ✅ | ⚪ Nice to have | 3–4 weeks |

✅ has it · ➖ partial or not a focus · ❌ does not have it

---

# Part A — Payroll & statutory (this is where Saral wins)

## 1. 🔴 Income tax (TDS) computation engine

**What it is.** For every salaried employee above the exemption threshold, the employer must estimate annual
taxable income, apply the chosen tax regime's slabs, subtract eligible deductions, divide the resulting tax
across the remaining months of the financial year, deduct it from salary, and deposit it monthly.

**What they do.** Saral computes TDS monthly against declarations and proofs, revises the projection when
salary changes mid-year, and feeds Form 16 and Form 24Q from the same computation. Keka does the same and
states coverage of PF, ESI, TDS, PT and gratuity across all 28 states and 8 union territories, including
old-vs-new tax regime selection per employee.

**What CIMS has today.** A `tds` column on `Payroll` that a user can **type a number into** by hand
(`app/api/payroll/[id]/route.ts:68`) and that appears on the payslip. The calculation engine
(`lib/payroll-calc.ts`) never touches it. `PayrollRun.totalTds` is never populated. There is no concept of
financial year, tax regime, projected annual income, or exemption limit anywhere in the codebase.

**Why it matters.** Not deducting TDS where required is a statutory default with interest and penalty on the
employer, not the employee. Today CIMS can only be used safely for a workforce entirely below the taxable
threshold — which is fine for site labour on minimum wage, and completely unusable for supervisors, managers
and office staff. Every organisation has both.

**What building it requires.** A `TaxRegime` / slab configuration (which should live in the payroll rules system
already built), an annual projection per employee, a monthly TDS instalment written by the payroll engine, and a
recompute path when salary or declarations change mid-year.

---

## 2. 🔴 Income-tax declarations and proof submission

**What it is.** At the start of the financial year each employee declares intended investments (80C, 80D, HRA
rent, home-loan interest, NPS…). The employer uses those to reduce projected TDS. Around January, employees
upload proof; HR verifies each item; unverified declarations are reversed and the shortfall is recovered in the
last months of the year.

**What they do.** Saral's ESS portal is built around this — "submit their investment declaration and their proof
details for the process of Income Tax" is one of its headline self-service features. Keka runs the same flow
with per-item verification and automatic TDS revision on approval or rejection.

**What CIMS has today.** Nothing. There is no declaration model, no proof upload for tax purposes, and no
verification queue. Employees can upload KYC documents (`EmployeeDocument`) but nothing tax-related.

**Why it matters.** Without declarations, TDS (once built) can only be computed at the maximum, over-deducting
from every employee and generating a refund claim they must chase from the tax department themselves. In
practice HR ends up running declarations in a spreadsheet, which is exactly the manual work the software is
supposed to remove. This is the single most-used ESS feature in Indian payroll products.

---

## 3. 🔴 Form 16 and Form 12BA

**What it is.** Form 16 is the annual TDS certificate every employer must issue to every employee from whose
salary tax was deducted — Part A (quarterly TDS deposited, downloaded from TRACES) and Part B (the salary and
deduction breakdown, generated by the employer). Form 12BA reports perquisites.

**What they do.** Saral generates Form 16 and Form 12BA digitally. Keka prepares and distributes Form 16 to
employees without manual compilation.

**What CIMS has today.** Nothing. The HR-document module (`HrDocument`) can issue offer, experience and
relieving letters from templates, but has no Form 16 template and no data to fill one with.

**Why it matters.** It is a statutory deadline (15 June), not an option. Employees need it to file their own
returns, and HR will be chased for it every June. Note that Part A must come from TRACES — the realistic scope
is generating Part B and merging the downloaded Part A.

---

## 4. 🔴 Form 24Q and e-TDS returns

**What it is.** The quarterly return of salary TDS filed with the Income Tax Department, validated through the
NSDL File Validation Utility (FVU) before submission.

**What they do.** Saral generates Form 24Q with built-in FVU validation "to ensure that all the data is accurate
and meets the regulatory standards before submission". Keka covers TDS filing as part of its statutory suite.

**What CIMS has today.** Nothing. The compliance report exporter
(`app/api/payroll/reports/compliance/route.ts`) produces 12 report types for PF, ESIC and PT — genuinely good
work — but there is no TDS report of any kind.

**Why it matters.** Four filings a year, each with a late-fee of ₹200/day. Without it, payroll data has to be
re-keyed into separate return-filing software, which defeats the purpose of an integrated payroll product.

---

## 7. 🟠 Full & final settlement

**What it is.** When someone leaves, the last payout combines: salary for days worked, leave encashment on the
actual remaining balance, gratuity if eligible, notice-period recovery or pay-in-lieu, outstanding advance and
loan recovery, asset-loss recovery, and TDS on the taxable portion.

**What they do.** Keka processes F&F automatically once payroll is approved, produces an F&F settlement report,
and applies the correct tax treatment (gratuity and encashed earned leave being exempt within limits). Saral
lists F&F as a standard module.

**What CIMS has today.** A screen labelled **"Settlement Breakdown (Indicative)"**
(`app/(dashboard)/exit/page.tsx:1344-1400`) with four hardcoded rows:

```
Last Month Salary  = basicSalary            (basic only — ignores DA, HRA, allowances)
Leave Encashment   = basic / 26 × 3         (a fixed 3 days for everybody)
Gratuity           = (basic / 26) × 15 × 1  (always exactly one year of service)
Deductions         = 0                      (always zero)
```

None of these numbers come from the employee's actual record. The exit workflow itself — initiate, clearance
tasks across departments, approval, offboarding — is complete and works well; only the money is fictional.

**Why it matters.** Someone is computing the real figure in Excel today, which means the number the system shows
and the number the person is paid are different. That is an audit finding waiting to happen, and it silently
undermines trust in every other number the system displays.

---

## 8. 🟠 Gratuity from actual service

**What it is.** Payable to employees completing 5 years of continuous service, at 15 days' wages per completed
year, on last drawn Basic + DA, capped at ₹20 lakh, and tax-exempt within that limit.

**What CIMS has today.** The hardcoded `× 1` above — one year for everybody, ignoring both the 5-year
eligibility rule and actual tenure. Someone with 12 years of service is shown 1/12th of what they are owed.
`Employee.dateOfJoining` already exists on the record, so the data needed to fix this is sitting right there
unused.

**Effort.** This is the cheapest item on the entire list — a few days of work to compute tenure, apply the
eligibility gate and the cap, and pull Basic + DA from the salary structure instead of `basicSalary`.

---

## 9. 🟠 Leave encashment from actual balance

Blocked by gap #5 — there is no leave balance to encash. Currently a fixed 3 days for every employee regardless
of what they actually have left.

---

## 10. 🟠 Loans and salary advances

**What it is.** A tracked disbursement, an EMI schedule, automatic per-month recovery through payroll, a
running outstanding balance, and full recovery on exit.

**What they do.** Saral has dedicated modules for "bonuses, arrears, loans and advances, and gratuity", with
loan-repayment schedule reports. Keka accounts for loans and reimbursements within the payroll run.

**What CIMS has today.** The schema has an `AdvanceAndReimbursement` model with `amount`, `monthToImpact`,
`yearToImpact`, `status` and an approval field — and **no code anywhere reads or writes it**. In practice, an
advance is a number someone types into the attendance grid each month (`advance` on the payroll row). There is
no record of what was disbursed, no balance, and nothing stops the same advance being deducted twice or
forgotten entirely.

**Why it matters.** In contract-manpower operations, salary advances are constant. Tracking them in the payroll
grid means the outstanding balance lives in somebody's memory. The model is already designed — this is mostly
UI and payroll-integration work.

---

## 11. 🟠 Arrears / retro-pay

**What it is.** A salary revision effective from a past date requires paying the difference for the elapsed
months, usually in the next payroll run, shown as a separate arrears line and taxed accordingly.

**What they do.** Keka automatically calculates arrears and processes salary revisions including mid-month
changes. Saral lists bonus/arrears as a core capability.

**What CIMS has today.** Nothing. `EmployeeSalary` is a single current-state row per employee — there is no
effective-date history, so changing a salary silently rewrites the past. If a revision is backdated, the
difference has to be paid as a manual "other allowance" entry with no record of why.

**What building it requires.** The prerequisite is an **effective-dated salary structure** (`validFrom` /
`validTo`), which is also what makes salary history auditable. That is the real work; arrears computation on top
is comparatively small.

---

## 16. 🟡 Multi-state professional tax

**What it is.** PT is a state tax. Maharashtra, Karnataka, West Bengal, Tamil Nadu and others each have
different slabs, different frequencies and different return formats.

**What they do.** Saral does "state-wise PT calculations". Keka claims statutory coverage across all 28 states
and 8 UTs.

**What CIMS has today.** One Maharashtra slab set. Since this week it is at least **editable** through Payroll →
Calculation Settings — an improvement over hardcoding — but it is a single global set, not per-state. The
`Employee.state` field exists and is already used to *filter* compliance reports
(`app/api/payroll/reports/compliance/route.ts`), so the data is present.

**Why it matters.** Any client with sites in two states cannot be run correctly. Given the business model is
site-based deployment, this is closer than it looks — the extension is to key the existing slab configuration by
state rather than storing one global set.

---

## 17. 🟡 Statutory challan tracking and e-return files

**What it is.** After computing PF/ESI/PT, you generate the electronic return file in the format the portal
accepts, pay the challan, and record the TRRN/CRN, amount and payment date against that month.

**What they do.** Both generate the e-return files and track challan payment. Saral generates bank files for
salary *and* statutory payments automatically on payroll submission.

**What CIMS has today.** Excellent *report* coverage — 12 compliance report types including PF ECR and ESIC
challan layouts, plus a Form II wage register. But there is a `StatutoryChallan` model in the schema
(`type`, `trrnNumber`, `amount`, `paymentDate`, `status`, `documentUrl`) that **nothing in the codebase ever
touches**. So the system can produce what you need to file, but keeps no record of what was actually filed and
paid.

**Why it matters.** During a PF or ESI inspection, the question is "show me the challan for March". Today that
lives in email. The model already exists; this is a small CRUD module plus a link from the compliance screen.

---

# Part B — Time and attendance

## 12. 🟠 Shift and roster management

**What it is.** Named shifts with timings and break rules, rosters assigning people to shifts by day, rotation
patterns, week-offs, and shift-linked overtime and night-shift allowance.

**What they do.** Keka has one-time and recurring shifts across teams, departments and branches, drag-and-drop
roster design, shift rotations, planning around holidays, auto-fill of open shifts using availability and skill
tags, and shift-utilisation dashboards — with all shift data flowing into payroll. Saral handles shift-based
attendance with hourly and overtime calculation.

**What CIMS has today.** `Site.shift` and `Deployment.shift` are **free-text strings**
(`prisma/schema.prisma:548,779`). There is no shift master, no roster, no rotation, no week-off calendar. Nothing
validates that "Night" on one record means the same as "night shift" on another.

**Why it matters.** This is the biggest functional gap for the business CIMS is actually in. Site-based contract
manpower runs on rotating shifts — that is the *core* scheduling problem of the domain, and right now it is
handled by typing a word into a text box. Solving it well would be a differentiator, not just catch-up.

---

## 13. 🟠 Biometric and attendance-device integration

**What it is.** Attendance punches flowing automatically from devices at each site into the system.

**What they do.** Keka integrates in real time with biometric, smart-card, RFID, facial-recognition and NFC
devices, claiming 3,000+ supported devices, with several integration methods including direct database push.
Saral "integrates directly with external hardware like biometric devices to capture accurate time data".

**What CIMS has today.** Three manual paths: HR marks attendance on a grid, employees self-check-in with GPS
coordinates from the mobile app (`Attendance.checkInLat/checkInLng` — genuinely useful for field staff), or
someone imports a CSV/Excel file. No device integration of any kind.

**Why it matters.** For a client with 200 workers at a site with an existing biometric machine, "export from the
machine and import a CSV every month" is the answer that loses the deal. A realistic first step is an ingestion
API endpoint plus a small importer for the two or three device formats your clients actually use, rather than
attempting Keka's 3,000-device breadth.

---

## 15. 🟡 Overtime policy engine

**What it is.** Rules that decide when overtime applies (beyond N hours/day or N hours/week), at what multiplier,
whether it differs on week-offs and holidays, and any statutory cap — computed automatically from punches.

**What they do.** Keka calculates overtime automatically with company-wide or department-specific policies,
handling breaks and state rules. Saral does hourly and overtime calculation from attendance.

**What CIMS has today.** OT is a manually entered number of **OT days**, paid at a per-hour rate × a configurable
hours-per-OT-day (now editable in Payroll → Calculation Settings — a real improvement). But nothing derives OT
from actual hours worked, and `Attendance.overtimeHrs` is typed in by whoever marks attendance
(`app/api/attendance/route.ts:150`).

**Why it matters.** Under-paying statutory overtime is a labour-law exposure. It also means the attendance data
already being captured (check-in/check-out times) is not being used to compute anything.

---

# Part C — Leave

## 5. 🔴 Leave entitlement engine

**This is the largest HR gap in the product.**

**What it is.** Leave types with annual quotas; accrual (monthly or annual, prorated for joiners, different
during probation); a per-employee running balance; carry-forward rules at year end with caps; encashment;
negative-balance rules; and holiday-calendar awareness so a leave spanning a holiday is not double-counted.

**What they do.** Keka supports four leave families (Regular, Incident, Comp-off, Unpaid), accrual rates that
vary by probation and experience, first-month proration, and year-end carry-forward configured as *reset to
zero*, *encash all*, *carry forward all*, or carry forward a capped number of days or a percentage. Comp-off is
separately configurable across accrual, application, approval and year-end processing. Saral manages "leave
definition" with balances calculated according to customisable company policies.

**What CIMS has today.** The `Leave` model is:

```
employeeId, type (free-text String), startDate, endDate, days, reason,
status, approvedBy, approvedAt, rejectedAt, rejectionReason
```

That is a **request log**. There is no `LeaveType` master, no quota, no accrual, no balance, no carry-forward,
no encashment. A repository-wide search for `leaveBalance`, `accrual`, `carryForward` or `encash` returns
nothing outside the exit screen's hardcoded 3 days. An employee can apply for 300 days of "Casual Leave" and the
only thing standing between that and approval is the approver noticing.

**Why it matters.**
- Employees cannot see how much leave they have — the first question every self-service user asks.
- Approvers approve blind.
- Leave encashment and F&F cannot be computed (gaps #7, #9).
- Nothing connects leave to payroll LOP, so unpaid leave has to be manually reflected in worked days.

**What building it requires.** New models — `LeaveType` (quota, accrual rule, carry-forward rule, encashable,
paid/unpaid), `LeaveBalance` (per employee per type per year), and a `LeaveLedger` of credits and debits so a
balance can always be explained. Then: an accrual job, balance validation on apply, deduction on approval,
year-end processing, and a balance widget on web and mobile. Estimate 4–5 weeks; nothing else in the HR module
is credible until it exists.

---

# Part D — Compliance and governance

## 6. 🔴 Audit trail

**What it is.** An immutable record of who changed what, when, and from what value to what value.

**What they do.** Saral advertises "a detailed audit trail, showing the smallest changes made by any user". Keka
maintains change history across HR and payroll records.

**What CIMS has today.** Nothing global. The only activity log in the entire system is `LeadActivity`, for the
recruitment CRM. 42 of the 73 models do not even have an `updatedAt` column. Payroll rows carry `processedBy` and
`paidBy`, which tells you who ran the batch but not who edited a figure.

**Concretely, today the system cannot answer:**
- Who changed this employee's basic salary, and what was it before?
- Who altered the PF rate in Calculation Settings, and when?
- Who approved this leave? *(only the final approver id, not the sequence)*
- Who marked this payroll as paid, and did anyone edit amounts before that?
- Who granted this user the ADMIN role?

**Why it matters.** This is not a convenience feature for a payroll system. It is what you produce during a PF
or ESI inspection, what protects you in a wage dispute, and what lets you investigate an internal fraud. Given
that the security review found a live privilege-escalation path, the absence of an audit log also means an
abuse of it would leave **no trace at all**.

**What building it requires.** A generic `AuditLog` model (actor, action, entity, entityId, before, after,
timestamp, IP) plus a Prisma middleware/extension that records writes on a defined list of sensitive models —
`Employee`, `EmployeeSalary`, `Payroll`, `User`, `CustomRole`, `AppSetting`, `HrDocument`. Roughly 2–3 weeks
including a viewer UI, and it can be retrofitted without touching every route.

---

## 14. 🟠 Outbound email — the system sends none

**What it is.** Payslip delivery, offer letters, leave approval notifications, password resets, approval
reminders.

**What they do.** Both email payslips to employees as standard. Saral generates bank files and distributes
payslips; Keka distributes payslips and offer letters with e-signature workflows.

**What CIMS has today.** `lib/email.ts` contains a complete, well-written HTML approval-email implementation —
with **zero callers**. `nodemailer` is carried as a production dependency purely for this dead code. In-app
notifications exist (`Notification` model + a bell in the top nav) but producers are wired in only three routes
(`lms/notifications`, `expenses/[id]`, `approvals/[id]`), so leave approvals, helpdesk replies, onboarding steps
and exit clearances notify nobody.

**Why it matters.** Every payslip has to be downloaded and sent by hand. Anyone not logged into the app finds
out about an approval when they happen to check. The plumbing is already written — this is mostly wiring plus an
SMTP configuration, and it is one of the cheapest credibility wins available.

---

# Part E — Talent management (Keka's territory)

## 18. 🟡 Org chart and reporting hierarchy

**What CIMS has today.** `Employee.managerId` is a bare `String` with **no foreign key and no self-relation**
(`prisma/schema.prisma:616`), and it is type-confused: `app/api/join/route.ts:189` writes an **HR User id** into
it, while other paths treat it as an Employee id. There is no hierarchy view anywhere.

**Why it matters.** Without a trustworthy reporting line you cannot do manager-based approval routing, team
dashboards, or "my team" views — all of which Keka builds on top of the org chart. Fixing the column into a
proper self-relation is small; the visualisation on top is a week or two.

---

## 19. 🟡 Configurable approval workflows

**What they do.** Keka lets you define multi-level approval chains per policy, per department, with delegation
and escalation.

**What CIMS has today.** Approval logic is hardcoded per module — leaves, expenses, HR documents and inspections
each implement their own single-step approve/reject. Changing "expenses above ₹50,000 also need finance
approval" means editing code.

---

## 20. ⚪ OKRs, 360° feedback, engagement surveys

**What they do.** Keka offers goal cascading through an OKR tree with dashboards and heatmaps, automated
check-ins, 360° reviews collecting feedback from manager, peers, self and project teams, plus pulse surveys and
1-on-1s. Saral does not compete here at all.

**What CIMS has today.** A working review cycle with KRA, KPI and PIP models, plus KPI templates — manager →
employee only. No goal cascading, no peer or self review, no surveys.

**Recommendation.** **Do not build this.** It is Keka's differentiator against a different buyer, it takes
months, and it is the first module abandoned in every mid-market HRMS deployment. It is listed only for
completeness.

---

## Also missing, smaller

- **Offer letter acceptance / candidate e-signature.** CIMS generates offer letters (`HrDocument`) but there is
  no candidate-facing accept-and-sign step; Keka integrates DocuSign for exactly this. CIMS does have a real
  signature capability for HR letters and inspection sign-off, and `PolicyAcknowledgment` records acknowledgement
  with IP address — so the building blocks exist.
- **Background verification.** No BGV workflow or vendor integration.
- **Benefits and insurance administration.** No group-mediclaim or benefits enrolment tracking.
- **Helpdesk SLAs.** Tickets exist with categories, priorities and comments, but no SLA timers, escalation or
  auto-assignment rules.
- **Candidate application on job postings.** The Apply button is permanently a toast
  (`app/(dashboard)/jobs/[id]/page.tsx:116`); the working intake is the separate `lead-forms` → `/apply/[slug]`
  path, which job postings never link to.

---

# Part F — Platform

## 21. ⚪ Integrations and public API

**What CIMS has today.** No integrations of any kind. No Tally or accounting export, no biometric device SDK,
no Slack/Teams notifications, no public API, no webhooks. Keka states integration with 50+ tools; Saral exports
bank files and statutory return files, and integrates with attendance hardware.

**The one that matters commercially** is a **Tally / accounting export** — a salary journal voucher your client's
accountant can import. It is small work and removes a monthly re-keying task. Biometric ingestion (gap #13) is
the other. The rest can wait.

## 22. ⚪ Report builder and scheduled reports

**What CIMS has today.** Fixed dashboards plus a genuinely strong set of hardcoded exports (12 compliance report
types, Form II wage register, NEFT bank file, HDFC statement, PDF payslips). What is missing is a way for a user
to *build* a report without a developer, and any form of scheduled delivery.

---

# What CIMS already matches — do not rebuild these

Worth stating explicitly so effort is not wasted:

| Capability | State in CIMS |
|---|---|
| PF / ESI / PT computation | ✅ Verified against a real wage sheet; **now fully configurable**, which Saral exposes only as fixed statutory masters |
| PF ECR, ESIC and PT compliance reports | ✅ 12 report types with hierarchical Excel formatting |
| Form II wage register (MW Rules) | ✅ 44-column statutory layout |
| Bank / NEFT salary file | ✅ Plus an HDFC-specific statement format |
| Payslip generation | ✅ Web + mobile self-service (delivery by email is gap #14) |
| Attendance with GPS check-in | ✅ Lat/long captured on both check-in and check-out |
| Excel-driven payroll input | ✅ Prefilled template, validation preview, employee-code matching |
| Expense claims incl. travel | ✅ Per-journey kilometre entries with a configurable per-km rate — **at parity with Keka's mileage claims** |
| Employee self-service (web + native mobile) | ✅ Expo app: attendance, leave, expenses, payslips, documents, announcements |
| Onboarding with KYC validation | ✅ Aadhaar/PAN/IFSC/UAN/ESIC format validation, document collection, approval |
| HR letter generation with signature | ✅ Offer / experience / relieving, with issue and recall tracking |
| Asset issue and return | ✅ |
| LMS with quizzes and policy acknowledgement | ✅ Deeper than Saral; comparable to Keka's basics |
| Recruitment pipeline with public apply forms | ✅ |
| Role-based access control | ✅ Custom roles with granular permissions — architecturally sound |

---

# What CIMS has that neither competitor has

This is the reason not to position CIMS as an HRMS competitor:

1. **Site → Project → Assignment → Inspection chain** with configurable form templates, photo capture,
   offline-tolerant autosave, and a reviewer approval step with digital signature.
2. **Client-facing shareable inspection reports** via tokenised public links.
3. **Site-wise workforce deployment** as a first-class concept — payroll, attendance and wage sheets are all
   processed per site, which is exactly how contract manpower is billed and audited.
4. **Client billing view of payroll** — gross plus employer statutory plus a per-employee service-charge margin
   (`app/api/payroll/billing/generate`), the actual commercial model of a manpower contractor. *(Currently
   built but unreached by any UI — worth finishing rather than deleting.)*
5. **Field task management with GPS check-ins** tied to sites.

Neither Keka nor Saral does any of this. A manpower contractor using Keka still runs inspections and client
billing in spreadsheets.

---

# Recommended build order

The ordering optimises for *what unblocks a sale or a legal obligation per week of work*.

### Phase 1 — Make the numbers real (4–6 weeks)
1. **Gratuity from actual service** (#8) — days, not weeks; currently visibly wrong on screen.
2. **Audit trail** (#6) — 2–3 weeks, retrofittable, and the precondition for trusting everything else.
3. **Outbound email** (#14) — 1 week; the code already exists and has no callers.
4. **Statutory challan tracking** (#17) — the model already exists; small CRUD.

### Phase 2 — Leave, properly (4–5 weeks)
5. **Leave entitlement engine** (#5), then **leave encashment** (#9) and the F&F rewrite (#7) which depend on it.

### Phase 3 — Income tax (10–14 weeks)
6. **Effective-dated salary structure** — the prerequisite for arrears (#11) and for a defensible salary history.
7. **Declarations and proofs** (#2) → **TDS engine** (#1) → **Form 16** (#3) → **Form 24Q** (#4). Build in that
   order; each one is unusable without the previous.

### Phase 4 — Time (6–8 weeks)
8. **Shift and roster management** (#12) — the domain's real scheduling problem, and a differentiator if done
   well for site-based rotation.
9. **Biometric ingestion** (#13) — start with an ingestion API and the two or three device formats your clients
   actually own.
10. **Overtime policy engine** (#15) on top of #12.

### Phase 5 — Breadth (as demand dictates)
11. Multi-state PT (#16), loans and advances (#10), org chart (#18), Tally export (#21).

### Explicitly not recommended
OKRs, 360° feedback and engagement surveys (#20); a general-purpose report builder (#22); chasing Keka's
integration breadth. These cost months and win nothing in the segment CIMS actually serves.

---

## Sources

Keka: [Product overview and modules](https://www.keka.com/product) · [Payroll processing](https://www.keka.com/payroll-processing) ·
[Leave management](https://www.keka.com/leave-management-system) · [Configuring regular leave](https://help.keka.com/hc/en-us/articles/39946786434961-Configuring-Regular-Leave) ·
[Leave carry-forward settings](https://help.keka.com/admin/admin-help/where-to-check-and-configure-the-settings-for-leave-carry-forwards) ·
[Comp-off configuration](https://help.keka.com/hc/en-us/articles/39946758577169-Configuring-a-Comp-off) ·
[Shift management](https://www.keka.com/shift-management-software) · [Attendance management](https://www.keka.com/attendance-management-system) ·
[Biometric device integration](https://help.keka.com/admin/getting-started-with-biometric-device-integration) ·
[GPS / mobile attendance and geo-fencing](https://www.keka.com/gps-mobile-attendance) ·
[Form 16 management](https://help.keka.com/hc/en-us/articles/39946614310673-Managing-Form-16-for-your-employees) ·
[Full & final settlement](https://www.keka.com/full-and-final-settlement-policy) ·
[OKR software](https://www.keka.com/okr-software) · [Performance management](https://www.keka.com/performance-management-software) ·
[Expense management](https://www.keka.com/expense-management-software) · [Employee onboarding](https://www.keka.com/employee-onboarding-software) ·
[Offer management](https://www.keka.com/offer-management) · [Document management](https://www.keka.com/employee-document-management)

Saral PayPack (Relyon Softech): [Payroll software overview](https://saralpaypack.com/payroll-software/) ·
[Product site](https://saralpaypack.com/) · [Relyon product suite](https://relyonsoft.com/our-products/) ·
[Techjockey profile](https://www.techjockey.com/detail/relyonsoft-saral-paypack) ·
[TDS management deep-dive](https://www.techjockey.com/blog/transforming-payroll-management-with-saral-paypack) ·
[SoftwareSuggest profile](https://www.softwaresuggest.com/saral-paypack)
